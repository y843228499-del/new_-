
import { ModbusDataType, ModbusEndianness, ModbusFunctionCode, ModbusRegisterConfig } from '../../types';

class ModbusService {
    private _dataListeners: ((data: { sessionId: string, updates: Record<string, any> }) => void)[] = [];
    private _logListeners: ((data: { sessionId: string, level: string, message: string, timestamp?: string }) => void)[] = [];

    constructor() {
        const electron = this.getElectron();
        if (electron) {
            // Global listener for backend data
            electron.onModbusData((payload: { sessionId: string, updates: Record<string, any> }) => {
                this._notifyListeners(payload);
            });
            electron.onModbusLog((payload: { sessionId: string, level: string, message: string, timestamp?: string }) => {
                this._notifyLogListeners(payload);
            });
        }
    }
    
    private getElectron() {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
            return (window as any).electronAPI;
        }
        return null;
    }

    public onDataReceived(callback: (data: { sessionId: string, updates: Record<string, any> }) => void) {
        this._dataListeners.push(callback);
        return () => {
            this._dataListeners = this._dataListeners.filter(cb => cb !== callback);
        };
    }

    public onLogReceived(callback: (data: { sessionId: string, level: string, message: string, timestamp?: string }) => void) {
        this._logListeners.push(callback);
        return () => {
            this._logListeners = this._logListeners.filter(cb => cb !== callback);
        };
    }

    private _notifyListeners(data: { sessionId: string, updates: Record<string, any> }) {
        this._dataListeners.forEach(cb => cb(data));
    }

    private _notifyLogListeners(data: { sessionId: string, level: string, message: string, timestamp?: string }) {
        this._logListeners.forEach(cb => cb(data));
    }

    async getLocalIps(): Promise<string[]> {
        const electron = this.getElectron();
        if (electron && electron.inovanceGetLocalIps) {
            return await electron.inovanceGetLocalIps();
        }
        return [];
    }

    async getComPorts(): Promise<string[]> {
        const electron = this.getElectron();
        if (electron && electron.modbusListPorts) {
            const res = await electron.modbusListPorts();
            if (res.success) return res.ports || [];
        }
        return [];
    }

    async connect(sessionId: string, ip: string, port: number, unitId: number, timeout: number = 1000, useActiveProbe: boolean = true, localBindIp?: string): Promise<{success: boolean, error?: string, clientPort?: number}> {
        const electron = this.getElectron();
        if (electron) {
            console.log(`[Modbus] Dialing TCP ${ip}:${port} (Local: ${localBindIp || 'Auto'})...`);
            return await electron.modbusConnect(sessionId, ip, port, unitId, timeout, useActiveProbe, localBindIp);
        }
        return { success: false, error: "No Backend" };
    }

    async connectRtu(sessionId: string, comPort: string, baudRate: number, dataBits: number, stopBits: number, parity: string, unitId: number, timeout: number = 1000, useActiveProbe: boolean = true, transport: 'RTU' | 'ASCII' = 'RTU'): Promise<{success: boolean, error?: string, clientPort?: string}> {
        const electron = this.getElectron();
        if (electron) {
            console.log(`[Modbus ${transport}] Opening ${comPort} at ${baudRate} baud...`);
            return await electron.modbusRtuConnect(sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, timeout, useActiveProbe, transport);
        }
        return { success: false, error: "No Backend" };
    }

    async disconnect(sessionId: string): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            await electron.modbusDisconnect(sessionId);
        }
    }

    // --- POLLING CONTROL ---
    async startScan(sessionId: string, registers: ModbusRegisterConfig[], interval: number): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            // Send simplified config to backend (remove UI state like 'value' to save bandwidth if needed, but passing full obj is fine for now)
            await electron.modbusStartPoll(sessionId, registers, interval);
        }
    }

    async stopScan(sessionId: string): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            await electron.modbusStopPoll(sessionId);
        }
    }

    async updateScanConfig(sessionId: string, registers: ModbusRegisterConfig[], interval: number): Promise<void> {
        const electron = this.getElectron();
        if (electron) {
            await electron.modbusUpdateConfig(sessionId, registers, interval);
        }
    }

    // --- MANUAL WRITE (Bypass Poller) ---
    async writeRegister(
        sessionId: string, 
        fc: ModbusFunctionCode, 
        address: number, 
        value: any,
        dataType: ModbusDataType = 'UInt16',
        endianness: ModbusEndianness = 'ABCD'
    ): Promise<void> {
        const electron = this.getElectron();
        if (!electron) throw new Error("No Backend");

        let finalValue: any = value;
        
        // --- PRE-PROCESSING FOR BACKEND ---
        if (fc === '16' || fc === '06') {
             // For Registers, we need to handle encoding if it's complex, OR let backend handle it.
             // Our new backend `_encodeValue` logic expects raw values and type info if we were using a helper.
             // But the backend `modbus:write` handler is a direct pass-through to `client.write...`.
             // JSMODBUS write methods expect:
             // writeSingleRegister: value (number)
             // writeMultipleRegisters: value (Buffer or Array of UInt16)
             
             if (fc === '06') {
                 finalValue = Number(value);
             } else {
                 // FC16: Need to encode to UInt16 Array
                 finalValue = this._encodeValue(value, dataType, endianness);
             }
        } else if (fc === '15') {
             // Write Multiple Coils: Expects Array of Boolean
             if (Array.isArray(value)) finalValue = value.map(v => !!v);
             else finalValue = [!!value];
        } else if (fc === '05') {
             finalValue = !!value;
        }

        const res = await electron.modbusWrite(sessionId, fc, address, finalValue);
        if (res.error) throw new Error(res.error);
    }

    async triggerRegister(sessionId: string, register: ModbusRegisterConfig): Promise<void> {
        const electron = this.getElectron();
        if (!electron) throw new Error("No Backend");
        const res = await electron.modbusTrigger(sessionId, register);
        if (res.error) throw new Error(res.error);
    }

    // --- Helper for Manual Writes (Frontend Side) ---
    private _encodeValue(value: any, type: ModbusDataType, endianness: ModbusEndianness = 'ABCD'): number[] {
        // Handle Arrays
        if (Array.isArray(value)) {
            let payload: number[] = [];
            for (const v of value) {
                payload = payload.concat(this._encodeSingleValue(v, type, endianness));
            }
            return payload;
        }
        return this._encodeSingleValue(value, type, endianness);
    }

    private _encodeSingleValue(value: any, type: ModbusDataType, endianness: ModbusEndianness = 'ABCD'): number[] {
        // If it's a simple number for Int16/UInt16
        if (type === 'Int16') {
             const buf = new ArrayBuffer(2);
             new DataView(buf).setInt16(0, Number(value), false); 
             return [new DataView(buf).getUint16(0, false)];
        }
        if (type === 'UInt16') return [Number(value) & 0xFFFF];

        // 32-bit types
        if (['Int32', 'UInt32', 'Float32'].includes(type)) {
            const buf = new ArrayBuffer(4);
            const view = new DataView(buf);
            if (type === 'Int32') view.setInt32(0, Number(value), false);
            else if (type === 'UInt32') view.setUint32(0, Number(value), false);
            else if (type === 'Float32') view.setFloat32(0, Number(value), false);
            
            const bytes = new Uint8Array(buf);
            const b0 = bytes[0], b1 = bytes[1], b2 = bytes[2], b3 = bytes[3];
            let r1_high, r1_low, r2_high, r2_low;

            switch (endianness) {
                case 'ABCD': r1_high=b0; r1_low=b1; r2_high=b2; r2_low=b3; break;
                case 'CDAB': r1_high=b2; r1_low=b3; r2_high=b0; r2_low=b1; break;
                case 'BADC': r1_high=b1; r1_low=b0; r2_high=b3; r2_low=b2; break;
                case 'DCBA': r1_high=b3; r1_low=b2; r2_high=b1; r2_low=b0; break;
                default: r1_high=b0; r1_low=b1; r2_high=b2; r2_low=b3;
            }
            return [(r1_high << 8) | r1_low, (r2_high << 8) | r2_low];
        }

        // 64-bit types
        if (['Int64', 'UInt64', 'Float64'].includes(type)) {
            const buf = new ArrayBuffer(8);
            const view = new DataView(buf);
            if (type === 'Float64') view.setFloat64(0, Number(value), false);
            else view.setBigInt64(0, BigInt(Math.floor(Number(value))), false); // simplified UInt64/Int64 for now
            
            const bytes = new Uint8Array(buf);
            let words = [
                (bytes[0] << 8) | bytes[1],
                (bytes[2] << 8) | bytes[3],
                (bytes[4] << 8) | bytes[5],
                (bytes[6] << 8) | bytes[7]
            ];
            if (endianness === 'DCBA') words.reverse();
            return words;
        }
        
        // Default fallback
        return [Number(value) & 0xFFFF];
    }
    
    // Stub for readComplex (not used in backend-driven mode, but kept for type safety if ref'd)
    async readComplex() { return 0; }
}

export const modbusService = new ModbusService();
