
import { ConnectionStatus } from './common';

// === EtherNet/IP Specific Types ===

// CIP Data Type Codes (Ref: EIPTAGSIMPLE.H)
export enum CipDataType {
  BOOL = 0xC1,
  SINT = 0xC2,
  INT = 0xC3,
  DINT = 0xC4,
  LINT = 0xC5,
  USINT = 0xC6,
  UINT = 0xC7,
  UDINT = 0xC8,
  ULINT = 0xC9,  // Corrected from 0xA9 in previous version
  REAL = 0xCA,
  LREAL = 0xCB,
  STRING = 0xD0,
  WSTRING = 0xD5,
  BYTE = 0xD1,
  WORD = 0xD2,
  DWORD = 0xD3,
  LWORD = 0xD4,
  STRUCT = 0xA2,
  TIME = 0xDB,
  LTIME = 0xD7,
  DATE = 0xCD,
  TIME_OF_DAY = 0xCE,
  DATE_AND_TIME = 0xCF,
  ARRAY = 0xA3
}

export const CipDataTypeNames: Record<number, string> = {
  [CipDataType.BOOL]: 'BOOL',
  [CipDataType.SINT]: 'SINT',
  [CipDataType.INT]: 'INT',
  [CipDataType.DINT]: 'DINT',
  [CipDataType.LINT]: 'LINT',
  [CipDataType.USINT]: 'USINT',
  [CipDataType.UINT]: 'UINT',
  [CipDataType.UDINT]: 'UDINT',
  [CipDataType.ULINT]: 'ULINT',
  [CipDataType.REAL]: 'REAL',
  [CipDataType.LREAL]: 'LREAL',
  [CipDataType.STRING]: 'STRING',
  [CipDataType.WSTRING]: 'WSTRING',
  [CipDataType.BYTE]: 'BYTE',
  [CipDataType.WORD]: 'WORD',
  [CipDataType.DWORD]: 'DWORD',
  [CipDataType.LWORD]: 'LWORD',
  [CipDataType.STRUCT]: 'STRUCT',
  [CipDataType.TIME]: 'TIME',
  [CipDataType.LTIME]: 'LTIME',
  [CipDataType.DATE]: 'DATE',
  [CipDataType.TIME_OF_DAY]: 'TIME_OF_DAY',
  [CipDataType.DATE_AND_TIME]: 'DATE_AND_TIME',
  [CipDataType.ARRAY]: 'ARRAY'
};

export interface EipTag {
  id: string;
  tagName: string;
  dataType: CipDataType;
  elementCount?: number; // CHANGED: Added explicit element count for array access
  arraySize: number; // Keeping for backward compat logic if needed, usually same as elementCount
  value: any;
  status: string; // Good, Bad, Error Code
  lastUpdate: string;
  // --- New Error Tracking Fields ---
  errorCount?: number;
  errorHistory?: string[]; // Timestamp - Error Message
  // --------------------------------
  rpiActual?: number;
  requestCount?: number;
}

export interface EipTagGroup {
    id: string;
    name: string;
    nodes: EipTag[];
}

export interface EipModule {
    slot: number;
    type: 'Input' | 'Output' | 'Motion' | 'Empty';
    catalog: string;
    status: 'Running' | 'Fault' | 'Idle';
    data: any[];
}

export interface EipSessionConfig {
    tagGroups: EipTagGroup[]; 
    chassis: EipModule[];
    logs: string[];
}

// 汇川特有对齐方式
export enum InoAlignType {
    DEFAULT = 0,      // Standard EIP Alignment
    INOPROSHOP = 1    // Inovance Proprietary Alignment (1-byte aligned)
}

export interface EipSessionInfo {
    id: string;
    name: string;
    address: string;
    slot: number;
    
    // --- Inovance Specific Fields ---
    localBindIp?: string;     // 本机网卡IP (用于 EipStartExt)
    alignment?: InoAlignType; // 对齐方式 (0 or 1)
    
    // NEW: Real-time DLL State Code (3=Good, 4=Timeout, 1=Configuring)
    inoState?: number;        
    // --------------------------------

    connectionSize?: number; 
    status: ConnectionStatus;
    lastError?: string;
    dropCount: number;
    
    instanceId?: number; // DLL 返回的句柄
    
    config: EipSessionConfig;
}

export interface CipServiceRequest {
  service: number; 
  class: number;
  instance: number;
  attribute?: number;
  data?: string; 
}

export interface CipServiceResponse {
  status: number;
  additionalStatus?: number[];
  data?: string; 
  timestamp: string;
}
