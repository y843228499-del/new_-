import { ConnectionStatus } from './common';

export type EipClass1Mode = 'Scanner' | 'Adapter';

export interface EipClass1DatasetItem {
    id: string;
    name: string;
    dataType: string;
    bitLength: number;
    helpString: string;
    value?: number | string;
}

export interface EipClass1Connection {
    id: string;
    name: string;
    rpi: number; // ms
    o2tSize: number; // bytes
    t2oSize: number; // bytes
    configSize: number; // bytes
    targetConfigSize?: number; // bytes
    connectionPath: string; // e.g., "20 04 24 78 2C 64 2C 6E"
    // Data mapping
    o2tData: number[]; // byte array
    t2oData: number[]; // byte array
    configData?: number[]; // byte array
    o2tDataset?: EipClass1DatasetItem[];
    t2oDataset?: EipClass1DatasetItem[];
    configDataset?: EipClass1DatasetItem[];

    // Extended parameters for Edit Modal
    triggerType?: 'Cyclic' | 'Change of State' | 'Application Object';
    transportType?: 'Exclusive Owner' | 'Listen Only' | 'Input Only';
    timeoutMultiplier?: number;
    o2tConnectionType?: 'P2P' | 'Multicast';
    o2tPriority?: 'Scheduled' | 'High' | 'Low' | 'Urgent';
    o2tFixedVariable?: 'Fixed' | 'Variable';
    t2oConnectionType?: 'P2P' | 'Multicast';
    t2oPriority?: 'Scheduled' | 'High' | 'Low' | 'Urgent';
    t2oFixedVariable?: 'Fixed' | 'Variable';
    
    // Runtime connection IDs
    o2tConnId?: number;
    t2oConnId?: number;
}

export interface EipClass1Slave {
    id: string;
    name: string;
    ipAddress: string;
    status: 'Disconnected' | 'Connected' | 'Error';
    hasErrorHistory?: boolean;
    dropCount?: number;
    lastDropTime?: string;
    lastRecoveryTime?: string;
    dropHistory?: any[];
    lastError?: string;
    edsFile?: string; 
    
    // Electronic Keying
    keyingMode: 'Compatible' | 'Exact' | 'Disabled';
    checkDeviceType: boolean;
    deviceType: number;
    checkVendorId: boolean;
    vendorId: number;
    checkProductCode: boolean;
    productCode: number;
    checkMajorRevision: boolean;
    majorRevision: number;
    checkMinorRevision: boolean;
    minorRevision: number;

    // Connections
    connections: EipClass1Connection[];
    
    params?: {
        id: number;
        name: string;
        dataType: string;
        dataSize: number;
        units: string;
        helpString: string;
        min: number;
        max: number;
        defaultValue: number;
    }[];

    // Legacy fields for backward compatibility
    rpi?: number;
    o2tSize?: number;
    t2oSize?: number;
    o2tData?: number[];
    t2oData?: number[];
}

export interface EipClass1AdapterConnection {
    id: string;
    name: string;
    rpi: number; // ms
    o2tSize: number; // bytes
    t2oSize: number; // bytes
    o2tInstance: number; // Assembly O->T Instance ID, e.g., 100
    t2oInstance: number; // Assembly T->O Instance ID, e.g., 101
    connectionPath: string; // Hex connection path, e.g., "20 04 24 64 2C 65"
    targetIp?: string; // Optional, if exclusive owner
    status: 'Disconnected' | 'Connected' | 'Error';
    hasErrorHistory?: boolean;
    dropCount?: number;
    lastDropTime?: string;
    lastRecoveryTime?: string;
    dropHistory?: any[];
    lastError?: string;
    connectionType?: 'IO' | 'TAG';
    // Data mapping
    o2tData: number[]; // byte array
    t2oData: number[]; // byte array
    o2tDataset?: EipClass1DatasetItem[];
    t2oDataset?: EipClass1DatasetItem[];
    loopbackMappings?: { sourceConnId?: string; sourceId: string; targetId: string; }[];
    bulkLoopback?: boolean;
}

export interface EipClass1SessionInfo {
    id: string;
    name: string;
    mode: EipClass1Mode;
    status: ConnectionStatus;
    localBindIp?: string;
    
    // Scanner Config
    scannerConfig: {
        slaves: EipClass1Slave[];
    };
    
    // Adapter Config
    adapterConfig: {
        vendorId: number;
        deviceType: number;
        productCode: number;
        majorRevision: number;
        minorRevision: number;
        productName: string;
        connections: EipClass1AdapterConnection[];
    };
    
    dropCount: number;
    diagnostics?: { time: string, message: string }[];
}
