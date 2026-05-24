
import { SessionInfo } from './type-definitions/opcua';
import { EipSessionInfo } from './type-definitions/eip';
import { ModbusSessionInfo, ModbusSlaveSessionInfo } from './type-definitions/modbus';
import { EipClass1SessionInfo } from './type-definitions/eip-class1';

// Re-export specific domains
export * from './type-definitions/common';
export * from './type-definitions/opcua';
export * from './type-definitions/modbus';
export * from './type-definitions/eip';
export * from './type-definitions/eip-class1';
export * from './type-definitions/ai';

// === Global Project Type (Aggregator) ===
// This remains here as it depends on all sessions
export interface ProjectFile {
  version: string;
  timestamp: string;
  // OPC UA Sessions
  sessions: SessionInfo[]; 
  // EtherNet/IP Sessions (Added in v2.4)
  eipSessions?: EipSessionInfo[];
  // Modbus Sessions (Added in v2.5)
  modbusSessions?: ModbusSessionInfo[];
  // Modbus Slave Sessions (Added in v2.6)
  modbusSlaveSessions?: ModbusSlaveSessionInfo[];
  // EIP Class 1 Sessions (Added in v2.6.5)
  eipClass1Sessions?: EipClass1SessionInfo[];
}
