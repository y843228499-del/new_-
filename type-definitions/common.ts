
// === Common / Shared Types ===

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  sessionName?: string; 
}

export interface AppSettings {
    general: {
        language: 'en' | 'zh';
        autoConnect: boolean;
        theme: 'light' | 'dark'; 
    };
    opcua: {
        defaultRequestTimeout: number; 
        defaultKeepAliveInterval: number; 
        reconnectDelay: number; 
        applicationName: string;
    };
    paths: {
        pkiRoot: string; 
        logsDir: string; 
    }
}

export interface CertificateFile {
  name: string;
  path: string;
  type: 'trusted' | 'rejected' | 'own';
}

export interface ChaosResult {
    category: string;
    totalSent: number;
    successCount: number; // For chaos, "success" might mean the server REJECTED the bad request gracefully
    errorCount: number;   // Server crashed or timed out
    details: string[];
}
