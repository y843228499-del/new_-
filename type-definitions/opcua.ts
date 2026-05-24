
import { ConnectionStatus, CertificateFile } from './common';

// === OPC UA Specific Types ===

export enum SecurityPolicy {
  None = 'None',
  Basic128Rsa15 = 'Basic128Rsa15',
  Basic256 = 'Basic256',
  Basic256Sha256 = 'Basic256Sha256',
  Aes128_Sha256_RsaOaep = 'Aes128_Sha256_RsaOaep'
}

export enum MessageSecurityMode {
  None = 'None',
  Sign = 'Sign',
  SignAndEncrypt = 'SignAndEncrypt'
}

export type AuthMode = 'Anonymous' | 'Username' | 'Certificate';

export interface AuthSettings {
  mode: AuthMode;
  username?: string;
  password?: string;
  certificateFile?: string;
  privateKeyFile?: string;
  autoAcceptUnknownCert: boolean;
}

export interface ConnectionOptions {
    sessionTimeout: number;
    keepAliveInterval: number;
    sessionName?: string;
}

export interface ReferenceDescription {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  referenceTypeId: string;
  isForward: boolean;
  typeDefinition: string;
  dataType?: string;
  valueRank?: number;
  arrayDimensions?: string | number[];
}

export type OpcDataType = 'Boolean' | 'SByte' | 'Byte' | 'Int16' | 'UInt16' | 'Int32' | 'UInt32' | 'Int64' | 'UInt64' | 'LINT' | 'ULINT' | 'LWORD' | 'LTIME' | 'Float' | 'Double' | 'String' | 'DateTime' | 'Guid';

export interface OpcNode {
  internalId?: string;
  nodeId: string;
  displayName: string;
  dataType: OpcDataType;
  value: any;
  statusCode: string;
  sourceTimestamp: string;
  lastRtt?: number;
  errorCount?: number;
  errorStats?: Record<string, number>;
}

export interface BatchGroup {
  id: string;
  name: string;
  nodes: OpcNode[];
}

export interface Subscription {
  viewIndex: number;
  subscriptionId: number;
  serverSubscriptionId?: number;
  items: MonitoredItem[];
  status: 'Active' | 'Paused';
  publishingInterval: number;
  lifetimeCount: number;
  maxKeepAliveCount: number;
  maxNotificationsPerPublish: number;
  priority: number;
  publishTimeout: number;
  samplingInterval: number;
  queueSize: number;
  discardOldest: boolean;
}

export interface MonitoredItem {
  clientHandle: number;
  monitoredItemId?: number;
  nodeId: string;
  displayName?: string;
  value: any;
  timestamp: string;
  statusCode: string;
  dataType?: string;
  internalId?: string;
}

export interface SchedulerGroup {
  id: string;
  name: string;
  defaultInterval: number;
  sourceList: OpcNode[];
  targetList: OpcNode[];
  tasks: SchedulerTask[];
}

export interface SchedulerTask {
  id: string;
  name: string;
  enabled: boolean;
  sourceNodeId: string;
  sourceDataType: OpcDataType;
  targetNodeId: string;
  interval: number;
  lastStatus: string;
  runCount: number;
  errorCount: number;
  lastValue?: any;
  lastTransferTime?: string;
  errorMessage?: string;
}

export interface SessionStatistics {
  uptime: number;
  bytesRead: number;
  bytesWritten: number;
  opsPerSec: number;
  itemsPerSec: number;
  avgRtt: number;
  lastRtt: number;
  rttHistory: number[];
  throughputHistory: number[];
  healthScore: number;
  slowOps: any[];
}

export interface OpcEvent {
  eventId: string;
  eventType: string;
  sourceNode?: string;
  sourceName: string;
  time: string;
  severity: number;
  message: string;
}

export interface EndpointDescription {
  endpointUrl: string;
  securityMode: MessageSecurityMode;
  securityPolicyUri: string;
  securityLevel: number;
}

export interface MethodMetadata {
  objectId: string;
  methodId: string;
  name: string;
  inputArguments: any[];
  outputArguments: any[];
}

export interface HistoryReadResult {
  nodeId: string;
  statusCode: string;
  data: { value: any; timestamp: string }[];
}

export enum StatusCodes {
  Good = 'Good',
  Bad = 'Bad'
}

export interface HmiWidget {
  id: string;
  type: 'gauge' | 'text' | 'switch' | 'chart';
  nodeId: string;
  displayName: string;
  dataType: OpcDataType;
  x: number;
  y: number;
  w: number;
  h: number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface SessionConfig {
    rwGroups: BatchGroup[];
    subscriptions: Subscription[];
    trendGroups: BatchGroup[]; 
    schedulerGroups: SchedulerGroup[]; 
    hmiWidgets?: HmiWidget[];
}

export interface SessionInfo {
  id: string;
  name: string;
  endpointUrl: string;
  securityMode: MessageSecurityMode;
  securityPolicy: SecurityPolicy;
  authSettings: AuthSettings;
  connectionOptions?: ConnectionOptions;
  autoReconnect: boolean; 
  autoRead: boolean; 
  autoSubscribe: boolean; 
  autoSchedule?: boolean;
  status: ConnectionStatus;
  lastError?: string; 
  lastDropTime?: string;
  lastRecoveryTime?: string;
  dropCount: number;
  backendId?: string;       
  config?: SessionConfig;
  secureChannelId?: number;
  sessionNodeId?: string;
  pendingAttemptId?: string;
}
