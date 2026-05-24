import { ModbusSlaveSessionInfo } from '../../types';

class ModbusSlaveService {
    private isElectron = !!(window as any).electronAPI;

    private mockMemory: Record<string, number[]> = {
        holding: new Array(20000).fill(0),
        coils: new Array(20000).fill(0),
        inputs: new Array(20000).fill(0),
        discrete: new Array(20000).fill(0)
    };

    private dataChangedListeners: ((data: any) => void)[] = [];

    constructor() {
        if (!this.isElectron) {
            // Simulate some data changes in the browser
            setInterval(() => {
                // Randomly change some holding registers
                for (let i = 0; i < 5; i++) {
                    const addr = Math.floor(Math.random() * 500); // Increased range to include 200
                    const val = Math.floor(Math.random() * 1000);
                    this.mockMemory.holding[addr] = val;
                    this.notifyDataChanged('holding', addr, 1);
                }
                // Randomly change some coils
                for (let i = 0; i < 5; i++) {
                    const addr = Math.floor(Math.random() * 500); // Increased range
                    const val = Math.random() > 0.5 ? 1 : 0;
                    this.mockMemory.coils[addr] = val;
                    this.notifyDataChanged('coils', addr, 1);
                }
            }, 5000);
        }
    }

    private notifyDataChanged(type: string, address: number, length: number) {
        this.dataChangedListeners.forEach(cb => cb({
            sessionId: 'mock-session', // In mock mode, we just use a generic ID or handle it
            type,
            address,
            length,
            action: 'write'
        }));
    }

    async startServer(sessionId: string, port: number, unitId: number, memorySize: number = 20000, localBindIp?: string, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP', rtuOptions?: any, ignoreUnitId?: boolean): Promise<{ success: boolean; error?: string }> {
        if (this.isElectron) {
            if ((transport === 'RTU' || transport === 'ASCII') && rtuOptions) {
                return await (window as any).electronAPI.modbusRtuSlaveStart(
                    sessionId, 
                    rtuOptions.comPort, 
                    rtuOptions.baudRate, 
                    rtuOptions.dataBits, 
                    rtuOptions.stopBits, 
                    rtuOptions.parity, 
                    unitId, 
                    memorySize,
                    transport
                );
            }
            return await (window as any).electronAPI.modbusSlaveStart(sessionId, port, unitId, memorySize, localBindIp, ignoreUnitId);
        }
        // Mock start for browser
        console.log(`[Mock] Starting Modbus ${transport} Slave, UnitID ${unitId}`);
        return { success: true };
    }

    async stopServer(sessionId: string, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP'): Promise<{ success: boolean; error?: string }> {
        if (this.isElectron) {
            if (transport === 'RTU' || transport === 'ASCII') {
                return await (window as any).electronAPI.modbusRtuSlaveStop(sessionId);
            }
            return await (window as any).electronAPI.modbusSlaveStop(sessionId);
        }
        return { success: true };
    }

    async getLocalIps(): Promise<string[]> {
        if (this.isElectron && (window as any).electronAPI.inovanceGetLocalIps) {
            return await (window as any).electronAPI.inovanceGetLocalIps();
        }
        // Mock IPs for browser preview
        return ['192.168.1.100', '10.0.0.5', '172.16.0.10'];
    }

    async readMemory(sessionId: string, type: 'holding' | 'coils' | 'inputs' | 'discrete', address: number, length: number, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP'): Promise<{ success: boolean; data?: number[]; error?: string }> {
        if (this.isElectron) {
            if (transport === 'RTU' || transport === 'ASCII') {
                return await (window as any).electronAPI.modbusRtuSlaveReadMemory(sessionId, type, address, length);
            }
            return await (window as any).electronAPI.modbusSlaveReadMemory(sessionId, type, address, length);
        }
        
        // Mock read for browser
        const buffer = this.mockMemory[type];
        if (!buffer) return { success: false, error: "Invalid memory type" };
        
        const data = buffer.slice(address, address + length);
        return { success: true, data };
    }

    async writeMemory(sessionId: string, type: 'holding' | 'coils' | 'inputs' | 'discrete', address: number, values: number[], transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP'): Promise<{ success: boolean; error?: string }> {
        if (this.isElectron) {
            if (transport === 'RTU' || transport === 'ASCII') {
                return await (window as any).electronAPI.modbusRtuSlaveWriteMemory(sessionId, type, address, values);
            }
            return await (window as any).electronAPI.modbusSlaveWriteMemory(sessionId, type, address, values);
        }
        
        // Mock write for browser
        const buffer = this.mockMemory[type];
        if (!buffer) return { success: false, error: "Invalid memory type" };
        
        for (let i = 0; i < values.length; i++) {
            if (address + i < buffer.length) {
                buffer[address + i] = values[i];
            }
        }
        
        // Trigger listeners
        this.dataChangedListeners.forEach(cb => cb({
            sessionId,
            type,
            address,
            length: values.length,
            action: 'write'
        }));
        
        return { success: true };
    }

    onDataChanged(callback: (data: { sessionId: string, type: string, address: number, length: number, action: 'read' | 'write' }) => void, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP') {
        if (this.isElectron) {
            if ((transport === 'RTU' || transport === 'ASCII') && (window as any).electronAPI.onModbusRtuSlaveDataChanged) {
                return (window as any).electronAPI.onModbusRtuSlaveDataChanged(callback);
            }
            if (transport === 'TCP' && (window as any).electronAPI.onModbusSlaveDataChanged) {
                return (window as any).electronAPI.onModbusSlaveDataChanged(callback);
            }
        }
        
        // Mock for browser
        this.dataChangedListeners.push(callback);
        return () => {
            this.dataChangedListeners = this.dataChangedListeners.filter(cb => cb !== callback);
        };
    }

    onClientChanged(callback: (data: { sessionId: string, clientCount: number, clients: { ip: string, port: number }[] }) => void) {
        if (this.isElectron && (window as any).electronAPI.onModbusSlaveClientChanged) {
            return (window as any).electronAPI.onModbusSlaveClientChanged(callback);
        }
        return () => {};
    }

    onError(callback: (data: { sessionId: string, error: string }) => void, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP') {
        if (this.isElectron) {
            if ((transport === 'RTU' || transport === 'ASCII') && (window as any).electronAPI.onModbusRtuSlaveError) {
                return (window as any).electronAPI.onModbusRtuSlaveError(callback);
            }
            if (transport === 'TCP' && (window as any).electronAPI.onModbusSlaveError) {
                return (window as any).electronAPI.onModbusSlaveError(callback);
            }
        }
        return () => {};
    }

    onLog(callback: (data: { sessionId: string, message: string }) => void, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP') {
        if (this.isElectron) {
            if ((transport === 'RTU' || transport === 'ASCII') && (window as any).electronAPI.onModbusRtuSlaveLog) {
                return (window as any).electronAPI.onModbusRtuSlaveLog(callback);
            }
            if (transport === 'TCP' && (window as any).electronAPI.onModbusSlaveLog) {
                return (window as any).electronAPI.onModbusSlaveLog(callback);
            }
        }
        return () => {};
    }

    onDrop(callback: (data: { sessionId: string, error: string, port?: number, ip?: string }) => void, transport: 'TCP' | 'RTU' | 'ASCII' = 'TCP') {
        if (this.isElectron) {
            if ((transport === 'RTU' || transport === 'ASCII') && (window as any).electronAPI.onModbusRtuSlaveDrop) {
                return (window as any).electronAPI.onModbusRtuSlaveDrop(callback);
            }
            if (transport === 'TCP' && (window as any).electronAPI.onModbusSlaveDrop) {
                return (window as any).electronAPI.onModbusSlaveDrop(callback);
            }
        }
        return () => {};
    }

    onMemoryUpdate(callback: (data: { sessionId: string, memory: Record<string, number[]> }) => void) {
        if (this.isElectron && (window as any).electronAPI.onModbusSlaveMemoryUpdate) {
            return (window as any).electronAPI.onModbusSlaveMemoryUpdate(callback);
        }
        return () => {};
    }
}

export const modbusSlaveService = new ModbusSlaveService();
