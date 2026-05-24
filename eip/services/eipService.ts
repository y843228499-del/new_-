
import { EipTag, CipDataType, CipServiceRequest, CipServiceResponse, EipModule, InoAlignType } from '../../types';

class EipService {
    private _sessions = new Map<string, { isConnected: boolean, instanceId?: number }>();
    private _errorListeners: ((payload: { sessionId: string, error: string }) => void)[] = [];

    private getElectron() {
        return (window as any).electronAPI;
    }

    // --- Event System for Error Console ---
    public onDllError(callback: (payload: { sessionId: string, error: string }) => void) {
        this._errorListeners.push(callback);
        return () => {
            this._errorListeners = this._errorListeners.filter(cb => cb !== callback);
        };
    }

    private _emitDllError(sessionId: string, error: string) {
        this._errorListeners.forEach(cb => cb({ sessionId, error }));
    }

    async connect(sessionId: string, address: string, slot: number, connectionSize: number = 0, localBindIp?: string): Promise<{instanceId: number}> {
        const electron = this.getElectron();
        
        if (electron) {
            const res = await electron.inovanceConnect(localBindIp, address, sessionId); 
            
            if (res.success) {
                this._sessions.set(sessionId, { isConnected: true, instanceId: res.instanceId });
                return { instanceId: res.instanceId };
            } else {
                this._emitDllError(sessionId, res.error || "Connection Failed");
                throw new Error(res.error || "Connection Failed (DLL)");
            }
        }
        throw new Error("No Electron Backend");
    }

    async disconnect(sessionId: string): Promise<void> {
        const electron = this.getElectron();
        const s = this._sessions.get(sessionId);
        if (electron && s && s.instanceId !== undefined) {
            await electron.inovanceDisconnect(s.instanceId);
        }
        this._sessions.delete(sessionId);
    }

    async startStack(localIp?: string): Promise<boolean> {
        const electron = this.getElectron();
        if (electron) {
            const res = await electron.inovanceStartStack(localIp);
            return res.success;
        }
        return false;
    }

    async stopStack(): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            await electron.inovanceStopStack();
        }
    }

    async resetCache(): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            await electron.inovanceResetCache();
        }
    }

    isConnected(sessionId: string): boolean {
        return this._sessions.get(sessionId)?.isConnected || false;
    }
    
    getInstanceId(sessionId: string): number | undefined {
        return this._sessions.get(sessionId)?.instanceId;
    }

    // --- READ ---
    async readTag(sessionId: string, tagName: string, dataType: CipDataType, alignType: InoAlignType = InoAlignType.DEFAULT, elementCount: number = 1): Promise<{ value: any, dataType: number }> {
        const s = this._sessions.get(sessionId);
        if (!s || s.instanceId === undefined) throw new Error("Not connected");
        
        const electron = this.getElectron();
        if (electron) {
            const res = await electron.inovanceRead(s.instanceId, tagName, alignType, elementCount);
            if (!res.success) {
                this._emitDllError(sessionId, res.error);
                throw new Error(res.error || "Read Failed");
            }
            return { value: res.value, dataType: res.dataType };
        }
        throw new Error("No Backend");
    }

    async readTagMulti(sessionId: string, tags: {tagName: string, dataType: CipDataType, elementCount?: number}[], alignType: InoAlignType = InoAlignType.DEFAULT, useListApi: boolean = false): Promise<{value: any, status: string, error?: string, detectedType?: number}[]> {
        const s = this._sessions.get(sessionId);
        if (!s || s.instanceId === undefined) throw new Error("Not connected");
        const electron = this.getElectron();
        
        if (tags.length === 0) {
            return [];
        }

        // FIXED: Strictly respect useListApi flag. Do not force list API based on alignType.
        const effectiveUseList = useListApi;

        // --- 2. Single Tag Optimization (Optional) ---
        // If it's a single tag and NOT explicitly using List API, use the single read path
        if (!effectiveUseList && tags.length === 1) {
            try {
                const t = tags[0];
                const count = t.elementCount || 1;
                // Calls doRead -> EipReadTagWithAlignment (if alignType=1)
                const res = await this.readTag(sessionId, t.tagName, t.dataType, alignType, count);
                return [{ value: res.value, status: 'Good', detectedType: res.dataType }];
            } catch (e: any) {
                return [{ value: null, status: 'Bad', error: e.message }];
            }
        }
        
        if (effectiveUseList) {
            // --- Strategy B: Use List API (Native) ---
            // Calls inovance:readList -> EipReadTagListWithAlignment (if alignType=1)
            const res = await electron.inovanceReadList(s.instanceId, tags, alignType);
            if (res.success && Array.isArray(res.results)) {
                return res.results.map((r: any) => ({
                    value: r.value,
                    status: r.success ? 'Good' : 'Bad',
                    error: r.success ? undefined : "List Read Error",
                    detectedType: r.dataType
                }));
            } else {
                this._emitDllError(sessionId, res.error || "List Read Failed");
                return tags.map(() => ({ value: null, status: 'Bad', error: res.error || "List API Error" }));
            }
        } else {
            // --- Strategy A: Loop Individual Calls (JS Side) ---
            // Calls doRead -> EipReadTagWithAlignment (if alignType=1) inside loop
            const loopResults = [];
            for (const tag of tags) {
                try {
                    const count = tag.elementCount || 1;
                    const res = await this.readTag(sessionId, tag.tagName, tag.dataType, alignType, count);
                    loopResults.push({ value: res.value, status: 'Good', detectedType: res.dataType });
                } catch (e: any) {
                    loopResults.push({ value: null, status: 'Bad', error: e.message });
                }
            }
            return loopResults;
        }
    }

    // --- WRITE ---
    async writeTag(sessionId: string, tagName: string, value: any, dataType: CipDataType, alignType: InoAlignType = InoAlignType.DEFAULT, elementCount: number = 1): Promise<void> {
        const s = this._sessions.get(sessionId);
        if (!s || s.instanceId === undefined) throw new Error("Not connected");
        
        const electron = this.getElectron();
        if (electron) {
            const res = await electron.inovanceWrite(s.instanceId, tagName, value, dataType, alignType, elementCount);
            if (!res.success) {
                this._emitDllError(sessionId, res.error);
                throw new Error(res.error || "Write Failed");
            }
            return;
        }
        throw new Error("No Backend");
    }

    async writeTagMulti(sessionId: string, tags: {tagName: string, value: any, dataType: CipDataType, elementCount?: number}[], alignType: InoAlignType = InoAlignType.DEFAULT, useListApi: boolean = false): Promise<string[]> {
        const s = this._sessions.get(sessionId);
        if (!s || s.instanceId === undefined) throw new Error("Not connected");
        const electron = this.getElectron();

        if (tags.length === 0) return [];

        // FIXED: Strictly respect useListApi flag.
        const effectiveUseList = useListApi;

        // --- 2. Execution Helper ---
        // Single Tag Opt
        if (!effectiveUseList && tags.length === 1) {
            try {
                const t = tags[0];
                const count = t.elementCount || 1;
                // Calls doWrite -> EipWriteTagWithAlignment (if alignType=1)
                await this.writeTag(sessionId, t.tagName, t.value, t.dataType, alignType, count);
                return ['Good'];
            } catch (e) {
                return ['Bad'];
            }
        }

        // List API
        if (effectiveUseList) {
            // Calls inovance:writeList -> EipWriteTagListWithAlignment (if alignType=1)
            const res = await electron.inovanceWriteList(s.instanceId, tags, alignType);
            if (res.success) {
                return tags.map(() => 'Good'); 
            } else {
                this._emitDllError(sessionId, res.error || "List Write Failed");
                return tags.map(() => 'WriteErr');
            }
        } else {
            // Loop Strategy
            // Calls doWrite -> EipWriteTagWithAlignment (if alignType=1) inside loop
            const results = [];
            for (const tag of tags) {
                try {
                    const count = tag.elementCount || 1;
                    await this.writeTag(sessionId, tag.tagName, tag.value, tag.dataType, alignType, count);
                    results.push('Good');
                } catch (e) {
                    results.push('Bad');
                }
            }
            return results;
        }
    }
}

export const eipService = new EipService();
