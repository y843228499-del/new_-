
import { ConnectionStatus } from './common';

// === Modbus Types ===

export type ModbusFunctionCode = '01' | '02' | '03' | '04' | '05' | '06' | '15' | '16';
export type ModbusTriggerType = 'Cyclic' | 'Event'; // 循环执行 | 变量触发
export type ModbusDataType = 'Int16' | 'UInt16' | 'Int32' | 'UInt32' | 'Float32' | 'Float64' | 'Boolean' | 'String' | 'Hex';
export type ModbusEndianness = 'ABCD' | 'CDAB' | 'BADC' | 'DCBA';

export interface ModbusRegisterConfig {
    id: string;
    name: string;       // 通道名称
    functionCode: ModbusFunctionCode;
    address: number;    // 起始地址
    length: number;     // 长度 (数量)
    dataType: ModbusDataType;
    triggerType: ModbusTriggerType;
    triggerTag?: string; // 触发变量名称 (当 triggerType == Event)
    
    scanRate: number;   // 循环周期数值
    scanRateUnit?: 'ms' | 's'; // 循环周期单位 (默认 ms)
    
    retryCount: number; // 重发次数
    endianness?: ModbusEndianness;
    
    // Engineering Units / Scaling
    gain?: number;      // 增益 (Multiplier) default 1
    offset?: number;    // 偏移 (Adder) default 0
    unit?: string;      // 单位 (e.g. °C, bar)

    // Runtime State
    value: any;
    status: string; 
    lastUpdate: string;
    requestCount?: number;      // Total request count
    errorCount?: number;        // Total error count
    errorStats?: Record<string, number>; // Breakdown of errors
    lastLatency?: number;       // Last request latency in ms
    lastErrorTime?: string;     // Timestamp of the last error occurrence
}

export interface ModbusLogEntry {
    id: string;
    timestamp: string;
    direction: 'TX' | 'RX';
    dataHex: string;
    info: string;
}

export interface ModbusSchedulerTask {
    id: string;
    enabled: boolean;
    name: string;
    sourceRegId: string; // Reference to a Read Register ID
    targetRegId: string; // Reference to a Write Register ID (FC 05/06/15/16)
    lastRunTime?: string;
    transferCount: number;
    errorCount: number;
    lastValue?: any;
    status: string; // 'Idle', 'Running', 'Error'
}

export interface ModbusSessionInfo {
    id: string;
    name: string;
    transport?: 'TCP' | 'RTU' | 'ASCII'; // NEW: Transport type, defaults to TCP if undefined
    
    // TCP Settings
    ip: string;
    port: number;
    
    // RTU Settings
    comPort?: string;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
    
    // Common Settings
    unitId: number;
    timeout: number; // Timeout in ms (New)
    localBindIp?: string; // NEW: Local virtual IP to bind for outgoing requests
    clientPort?: number; // Local source port after connection
    status: ConnectionStatus;
    lastError?: string;
    lastDropTime?: string; // Keeping for backward compat, but UI will prefer history
    dropHistory?: string[]; // Array of last 10 drop timestamps
    dropCount: number;
    isScanning?: boolean; // Global scan state for this session
    connectTime?: number; // Timestamp when connection was established
    _resetTxTick?: number; // Internal tick for UI sync when resetting TX counts
    _resetErrTick?: number; // Internal tick for UI sync when resetting ERR counts
    config: {
        registers: ModbusRegisterConfig[];
        schedulerTasks: ModbusSchedulerTask[]; // Data Mapping Tasks
        
        // --- NEW: Manual List Management ---
        schedulerSourceIds?: string[]; // IDs of registers manually added to Source List
        schedulerTargetIds?: string[]; // IDs of registers manually added to Target List
        
        scanRate: number; // Global default scan rate
        useGlobalScanRate?: boolean; // Toggle between global vs individual scan rates
        logs: ModbusLogEntry[];
    };
}

export type ModbusSlaveMemoryType = 'coils' | 'discrete' | 'inputs' | 'holding';

export interface ModbusSlaveRegisterConfig {
    id: string;
    name: string;
    type: ModbusSlaveMemoryType;
    address: number;
    dataType: ModbusDataType;
    endianness?: ModbusEndianness;
    description?: string;
    unit?: string;
    lastUpdate?: number;
    simulation?: {
        enabled: boolean;
        type: 'random' | 'increment' | 'decrement' | 'sinusoidal';
        min?: number;
        max?: number;
        step?: number;
        interval: number;
    };
}

export interface ModbusSlaveLogEntry {
    id: string;
    timestamp: string;
    type: 'info' | 'success' | 'error';
    message: string;
    direction?: 'RX' | 'TX';
    info?: string;
}

export interface ModbusSlaveSessionInfo {
    id: string;
    name: string;
    transport?: 'TCP' | 'RTU' | 'ASCII'; // NEW: Transport type, defaults to TCP if undefined
    
    // TCP Settings
    port: number;
    localBindIp?: string; // NEW: Local virtual IP to bind for listening
    ignoreUnitId?: boolean; // NEW: Ignore Unit ID matching for TCP
    
    // RTU Settings
    comPort?: string;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';

    unitId: number;
    memorySize?: number;
    status: ConnectionStatus;
    lastError?: string;
    clientCount?: number;
    clients?: { ip: string, port: number }[];
    // Drop statistics
    dropCount: number;
    lastDropTime?: string;
    lastDropError?: string;
    lastDropPort?: number;
    config: {
        registers: ModbusSlaveRegisterConfig[];
        logs: ModbusSlaveLogEntry[];
        systemLogs?: ModbusSlaveLogEntry[];
    };
}
