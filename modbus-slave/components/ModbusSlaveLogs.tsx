import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ModbusSlaveSessionInfo, ConnectionStatus } from '../../types';
import { Terminal, Trash2, Download, Play, Pause, ArrowDown, AlertTriangle, X, Loader2, Search } from 'lucide-react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { modbusSlaveService } from '../services/modbusSlaveService';

interface ModbusFrameInfo {
    unitId: number;
    functionCode: number;
    functionName: string;
    isException: boolean;
    explanation: string;
    tid?: number;
}

function parseModbusFrame(message: string, transport: 'TCP' | 'RTU' | 'ASCII'): ModbusFrameInfo | null {
    let direction = 'RX';
    let hexStr = '';

    const rxTxMatch = message.match(/\b(RX|TX)\b[:\s\[]*([0-9A-Fa-f\s]+)/i);
    const dataFromToMatch = message.match(/Data (from|to) [^:]+:\s*([0-9A-Fa-f\s]+)/i);

    if (rxTxMatch) {
        direction = rxTxMatch[1].toUpperCase();
        hexStr = rxTxMatch[2].trim().replace(/[\[\]]/g, '');
    } else if (dataFromToMatch) {
        direction = dataFromToMatch[1].toLowerCase() === 'from' ? 'RX' : 'TX';
        hexStr = dataFromToMatch[2].trim();
    } else {
        const hexMatch = message.match(/([0-9A-Fa-f\s]{8,})/);
        if (hexMatch) {
            hexStr = hexMatch[1].trim();
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes('tx') || lowerMsg.includes('send') || lowerMsg.includes('response') || lowerMsg.includes('write') || lowerMsg.includes('data to') || lowerMsg.includes('reply')) {
                direction = 'TX';
            }
        } else {
            return null;
        }
    }
    
    let bytes: number[] = [];

    if (transport === 'ASCII') {
        const cleanHex = hexStr.replace(/\s+/g, '');
        const asciiBytes = [];
        for (let i = 0; i < cleanHex.length; i += 2) {
            asciiBytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
        }
        
        if (asciiBytes[0] !== 0x3A) return null;
        
        let payloadAscii = '';
        for (let i = 1; i < asciiBytes.length; i++) {
            if (asciiBytes[i] === 0x0D || asciiBytes[i] === 0x0A) break;
            payloadAscii += String.fromCharCode(asciiBytes[i]);
        }
        
        for (let i = 0; i < payloadAscii.length; i += 2) {
            bytes.push(parseInt(payloadAscii.substring(i, i + 2), 16));
        }
    } else {
        const cleanHex = hexStr.replace(/\s+/g, '');
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
        }
    }
    
    if (bytes.length < 2) return null;

    let unitId = 0;
    let functionCode = 0;
    let payloadStartIndex = 0;
    let tid: number | undefined = undefined;

    if (transport === 'TCP') {
        if (bytes.length < 8) return null;
        tid = (bytes[0] << 8) | bytes[1];
        unitId = bytes[6];
        functionCode = bytes[7];
        payloadStartIndex = 8;
    } else {
        if (bytes.length < 4 && transport !== 'ASCII') return null;
        unitId = bytes[0];
        functionCode = bytes[1];
        payloadStartIndex = 2;
    }

    const isException = functionCode >= 0x80;
    const baseFc = isException ? functionCode - 0x80 : functionCode;
    
    const fcMap: Record<number, string> = {
        1: '读线圈',
        2: '读离散输入',
        3: '读保持寄存器',
        4: '读输入寄存器',
        5: '写单个线圈',
        6: '写单个寄存器',
        15: '写多个线圈',
        16: '写多个寄存器'
    };

    const functionName = fcMap[baseFc] || `未知(0x${baseFc.toString(16).padStart(2, '0').toUpperCase()})`;
    let explanation = '';
    
    if (isException) {
        const exceptionCode = bytes[payloadStartIndex];
        const exceptionMap: Record<number, string> = {
            1: '非法功能码',
            2: '非法数据地址',
            3: '非法数据值',
            4: '从站设备故障',
            5: '确认',
            6: '从站设备忙',
            8: '存储奇偶性差错',
            10: '不可用网关路径',
            11: '网关目标设备响应失败'
        };
        explanation = `异常响应 - ${exceptionMap[exceptionCode] || '未知异常'}`;
        return { unitId, functionCode, functionName, isException, explanation, tid };
    }

    if (direction === 'RX') {
        if ([1, 2, 3, 4].includes(functionCode)) {
            if (bytes.length >= payloadStartIndex + 4) {
                const addr = (bytes[payloadStartIndex] << 8) | bytes[payloadStartIndex + 1];
                const count = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                explanation = `起始地址: ${addr}, 数量: ${count}`;
            }
        } else if (functionCode === 5) {
            if (bytes.length >= payloadStartIndex + 4) {
                const addr = (bytes[payloadStartIndex] << 8) | bytes[payloadStartIndex + 1];
                const val = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                explanation = `地址: ${addr}, 值: ${val === 0xFF00 ? 'ON' : 'OFF'}`;
            }
        } else if (functionCode === 6) {
            if (bytes.length >= payloadStartIndex + 4) {
                const addr = (bytes[payloadStartIndex] << 8) | bytes[payloadStartIndex + 1];
                const val = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                explanation = `地址: ${addr}, 值: ${val}`;
            }
        } else if ([15, 16].includes(functionCode)) {
            if (bytes.length >= payloadStartIndex + 5) {
                const addr = (bytes[payloadStartIndex] << 8) | bytes[payloadStartIndex + 1];
                const count = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                const byteCount = bytes[payloadStartIndex + 4];
                explanation = `起始地址: ${addr}, 数量: ${count}, 字节数: ${byteCount}`;
            }
        }
    } else {
        if ([1, 2, 3, 4].includes(functionCode)) {
            if (bytes.length >= payloadStartIndex + 1) {
                const byteCount = bytes[payloadStartIndex];
                explanation = `返回字节数: ${byteCount}`;
            }
        } else if ([5, 6, 15, 16].includes(functionCode)) {
            if (bytes.length >= payloadStartIndex + 4) {
                const addr = (bytes[payloadStartIndex] << 8) | bytes[payloadStartIndex + 1];
                if ([5, 6].includes(functionCode)) {
                    const val = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                    explanation = `地址: ${addr}, 写入值: ${functionCode === 5 ? (val === 0xFF00 ? 'ON' : 'OFF') : val}`;
                } else {
                    const count = (bytes[payloadStartIndex + 2] << 8) | bytes[payloadStartIndex + 3];
                    explanation = `起始地址: ${addr}, 写入数量: ${count}`;
                }
            }
        }
    }

    return { unitId, functionCode, functionName, isException, explanation, tid };
}

interface ParsedLog {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    isRaw: boolean;
    direction?: 'RX' | 'TX';
    hexData?: string;
    explanation?: string;
    frameInfo?: ModbusFrameInfo | null;
}

const parseLog = (log: any, transport: 'TCP' | 'RTU' | 'ASCII', sessionUnitId?: number): ParsedLog => {
    const isRaw = log.message && (
        log.message.includes('[原始报文]') || 
        /\b(RX|TX)\b/i.test(log.message) ||
        /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(log.message) ||
        /^[0-9a-fA-F\s\[\]]{8,}$/.test(log.message.trim())
    );
    
    if (!isRaw) {
        let translatedMessage = log.message;
        if (translatedMessage?.startsWith('Master read')) {
            translatedMessage = translatedMessage.replace('Master read', '主站读取')
                .replace('holding', '保持寄存器')
                .replace('coils', '线圈')
                .replace('inputs', '输入寄存器')
                .replace('discrete', '离散输入')
                .replace('at address', '起始地址');
        } else if (translatedMessage?.startsWith('Master write')) {
            translatedMessage = translatedMessage.replace('Master write', '主站写入')
                .replace('holding', '保持寄存器')
                .replace('coils', '线圈')
                .replace('inputs', '输入寄存器')
                .replace('discrete', '离散输入')
                .replace('at address', '起始地址');
        }

        let synthesizedFrameInfo: ModbusFrameInfo | null = null;
        const msg = log.message || '';
        const dataMatch = msg.match(/Master (read|write) (\d+) (holding|coils|inputs|discrete) at address (\d+)/);
        if (dataMatch) {
            const action = dataMatch[1];
            const length = parseInt(dataMatch[2]);
            const type = dataMatch[3];
            const address = parseInt(dataMatch[4]);
            
            let fc = 0;
            if (action === 'read') {
                if (type === 'holding') fc = 3;
                else if (type === 'coils') fc = 1;
                else if (type === 'inputs') fc = 4;
                else if (type === 'discrete') fc = 2;
            } else {
                if (type === 'holding') fc = length > 1 ? 16 : 6;
                else if (type === 'coils') fc = length > 1 ? 15 : 5;
            }
            
            if (fc > 0) {
                const fcMap: Record<number, string> = {
                    1: '读线圈', 2: '读离散输入', 3: '读保持寄存器', 4: '读输入寄存器',
                    5: '写单个线圈', 6: '写单个寄存器', 15: '写多个线圈', 16: '写多个寄存器'
                };
                synthesizedFrameInfo = {
                    unitId: sessionUnitId || 1,
                    functionCode: fc,
                    functionName: fcMap[fc] || '未知',
                    isException: false,
                    explanation: translatedMessage
                };
            }
        }

        return { ...log, isRaw: false, explanation: translatedMessage, frameInfo: synthesizedFrameInfo };
    }

    let direction: 'RX' | 'TX' = 'RX';
    let hexData = log.message;
    
    const rxTxMatch = log.message.match(/\b(RX|TX)\b[:\s\[]*([0-9A-Fa-f\s]+)/i);
    const dataFromToMatch = log.message.match(/Data (from|to) [^:]+:\s*([0-9A-Fa-f\s]+)/i);

    if (rxTxMatch) {
        direction = rxTxMatch[1].toUpperCase() as 'RX' | 'TX';
        hexData = rxTxMatch[2].trim().replace(/[\[\]]/g, '');
    } else if (dataFromToMatch) {
        direction = dataFromToMatch[1].toLowerCase() === 'from' ? 'RX' : 'TX';
        hexData = dataFromToMatch[2].trim();
    } else {
        const hexMatch = log.message.match(/([0-9A-Fa-f\s]{8,})/);
        if (hexMatch) {
            hexData = hexMatch[1].trim();
            const lowerMsg = log.message.toLowerCase();
            if (lowerMsg.includes('tx') || lowerMsg.includes('send') || lowerMsg.includes('response') || lowerMsg.includes('write') || lowerMsg.includes('data to') || lowerMsg.includes('reply')) {
                direction = 'TX';
            }
        }
    }

    if (hexData && !hexData.includes(' ')) {
        hexData = hexData.replace(/(.{2})/g, '$1 ').trim();
    } else {
        hexData = hexData.replace(/\s+/g, ' ').trim();
    }

    const frameInfo = parseModbusFrame(log.message, transport);

    return {
        ...log,
        isRaw: true,
        direction,
        hexData: hexData.toUpperCase(),
        explanation: frameInfo ? frameInfo.explanation : '无法解析的报文',
        frameInfo
    };
};

export const ModbusSlaveLogs = React.memo(({ session, onClearLogs }: { 
    session: ModbusSlaveSessionInfo, 
    onClearLogs: () => void 
}) => {
    const [isPaused, setIsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [displayedLogs, setDisplayedLogs] = useState<any[]>([]);
    const logsBufferRef = useRef<any[]>([]);
    const listRef = useRef<any>(null);

    // --- NEW: Auto Save Logs ---
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
    const [autoSaveLimit, setAutoSaveLimit] = useState(1000);
    const [autoSavedCount, setAutoSavedCount] = useState(0);
    const dumpBufferRef = useRef<any[]>([]);

    // --- NEW: Master Timeout Detection ---
    const [timeoutRecords, setTimeoutRecords] = useState<any[]>([]);
    const [showTimeoutModal, setShowTimeoutModal] = useState(false);
    const timeoutRecordsRef = useRef<any[]>([]);
    const currentTimeoutRecordRef = useRef<any>(null);

    const [timeoutDetectionEnabled, setTimeoutDetectionEnabled] = useState(false);
    const [timeoutLimit, setTimeoutLimit] = useState(10); // ms
    const [timeoutCount, setTimeoutCount] = useState(0);
    const lastRxTimeRef = useRef<number>(0);
    const isTimeoutLoggedRef = useRef<boolean>(false);
    const incidentCollectorRef = useRef<{ active: boolean, logs: any[], timer?: any, id: string, targetLength: number } | null>(null);
    const [contextLogsModal, setContextLogsModal] = useState<{ id: string, logs: any[] } | null>(null);

    const performIncidentSave = useCallback(async (logsToSave: any[], incidentId: string) => {
        const headers = ['时间', '方向', 'TID/站号', '功能码', '原始报文(HEX)', '解析说明'];
        const csvContent = [
            headers.join(','),
            ...logsToSave.map(log => {
                const isRaw = log.message && (
                    log.message.includes('[原始报文]') || 
                    /\b(RX|TX)\b/i.test(log.message) ||
                    /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(log.message) ||
                    /^[0-9a-fA-F\s\[\]]{8,}$/.test(log.message.trim())
                );
                const time = log.timestamp.split('Z')[0].replace('T', ' ') || ''; // e.g. 2026-05-14 15:30:00.123
                let dir = isRaw ? (log.message.match(/\bRX\b/i) || log.message.match(/\bfrom\b/i) ? 'RX' : 'TX') : 'SYS';
                let msgClean = log.message.replace(/"/g, '""');
                return `="""${time}""","${dir}","","","","${msgClean}"`;
            })
        ].join('\n');
        
        try {
            if ((window as any).electronAPI?.modbusAutoSaveLog) {
                await (window as any).electronAPI.modbusAutoSaveLog(`timeout_incident_${incidentId}`, '\uFEFF' + csvContent);
            }
        } catch(e) {}
    }, []);

    const performAutoSave = useCallback(async (logsToSave: any[], count: number) => {
        const headers = ['时间', '方向', 'TID/站号', '功能码', '原始报文(HEX)', '解析说明'];
        const csvContent = [
            headers.join(','),
            ...logsToSave.map(log => {
                const isRaw = log.message && (
                    log.message.includes('[原始报文]') || 
                    /\b(RX|TX)\b/i.test(log.message) ||
                    /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(log.message) ||
                    /^[0-9a-fA-F\s\[\]]{8,}$/.test(log.message.trim())
                );
                if (!isRaw) return null; // 只保存请求和响应
                const time = log.timestamp.split('Z')[0].replace('T', ' ') || '';
                let dir = log.message.match(/\bRX\b/i) || log.message.match(/\bfrom\b/i) ? 'RX' : 'TX';
                let msgClean = log.message.replace(/"/g, '""');
                return `="""${time}""","${dir}","","","","${msgClean}"`;
            }).filter(Boolean)
        ].join('\n');
        
        try {
            if ((window as any).electronAPI?.modbusAutoSaveLog) {
                await (window as any).electronAPI.modbusAutoSaveLog(`slave_log_${session.id}_part_${count}`, '\uFEFF' + csvContent);
            }
        } catch(e) {
            console.error("Auto save failed", e);
        }
    }, [session.id]);

    useEffect(() => {
        if (!timeoutDetectionEnabled || timeoutLimit <= 0) return;
        const intervalMs = Math.max(2, timeoutLimit / 2); // Check frequently
        const timer = setInterval(() => {
            const now = Date.now();
            if (now - lastRxTimeRef.current >= timeoutLimit && lastRxTimeRef.current > 0) {
                if (!isTimeoutLoggedRef.current) {
                    isTimeoutLoggedRef.current = true;
                    setTimeoutCount(c => c + 1);
                    
                    const detectedTime = new Date().toISOString();
                    const recordId = Math.random().toString(36).substr(2, 9);
                    const record = {
                        id: recordId,
                        lastRxTime: new Date(lastRxTimeRef.current).toISOString(),
                        detectedTime,
                        recoveredTime: null as string | null,
                        durationMs: null as number | null,
                    };
                    currentTimeoutRecordRef.current = record;
                    timeoutRecordsRef.current.push(record);
                    if (timeoutRecordsRef.current.length > 500) {
                        timeoutRecordsRef.current.shift();
                    }
                    setTimeoutRecords([...timeoutRecordsRef.current]);
                    
                    // 开始记录上下文帧 
                    const beforeLogs = logsBufferRef.current.filter(l => {
                        const isRaw = l.message && (
                            l.message.includes('[原始报文]') || 
                            /\b(RX|TX)\b/i.test(l.message) ||
                            /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(l.message) ||
                            /^[0-9a-fA-F\s\[\]]{8,}$/.test(l.message.trim())
                        );
                        return isRaw;
                    }).slice(-10);
                    incidentCollectorRef.current = {
                        active: true,
                        id: recordId,
                        logs: [...beforeLogs],
                        targetLength: beforeLogs.length + 10,
                        timer: setTimeout(() => {
                            if (incidentCollectorRef.current?.active) {
                                const collector = incidentCollectorRef.current;
                                performIncidentSave(collector.logs, collector.id);
                                const match = timeoutRecordsRef.current.find(r => r.id === collector.id);
                                if (match) {
                                    match.contextLogs = [...collector.logs];
                                    setTimeoutRecords([...timeoutRecordsRef.current]);
                                }
                                collector.active = false;
                            }
                        }, 5000) // 冗余等待5秒
                    };
                    
                    const logTimeout = {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: detectedTime,
                        type: 'error',
                        message: `SYS: [超时告警] 主站请求超时! (设定的阈值: ${timeoutLimit}ms)`
                    };
                    logsBufferRef.current.push(logTimeout);
                    if (autoSaveEnabled) dumpBufferRef.current.push(logTimeout);
                }
            }
        }, intervalMs);
        return () => clearInterval(timer);
    }, [timeoutDetectionEnabled, timeoutLimit, autoSaveEnabled]);

    // Listen to logs directly
    useEffect(() => {
        const handleLog = (data: any) => {
            if (data.sessionId !== session.id) return;
            if (isPaused) return;

            const newLog = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
                type: data.level || 'info', 
                message: data.message
            };

            // First time initialization for lastRxTimeRef if not started
            if (lastRxTimeRef.current === 0) {
                lastRxTimeRef.current = Date.now();
            }

            // Master timeout logic: Reset timer if message is incoming request
            const msgObjStr = typeof newLog.message === 'string' ? newLog.message : JSON.stringify(newLog.message || '');
            const isRx = msgObjStr.includes('RX') || msgObjStr.includes('Data from') || msgObjStr.includes('Master read') || msgObjStr.includes('Master write');
            
            if (incidentCollectorRef.current?.active) {
                const isRaw = newLog.message && (
                    msgObjStr.includes('[原始报文]') || 
                    /\b(RX|TX)\b/i.test(msgObjStr) ||
                    /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(msgObjStr) ||
                    /^[0-9a-fA-F\s\[\]]{8,}$/.test(msgObjStr.trim())
                );
                
                if (isRaw) {
                    incidentCollectorRef.current.logs.push(newLog);
                    if (incidentCollectorRef.current.logs.length >= incidentCollectorRef.current.targetLength) {
                        const collector = incidentCollectorRef.current;
                        clearTimeout(collector.timer);
                        performIncidentSave(collector.logs, collector.id);
                        const match = timeoutRecordsRef.current.find(r => r.id === collector.id);
                        if (match) {
                            match.contextLogs = [...collector.logs];
                            setTimeoutRecords([...timeoutRecordsRef.current]);
                        }
                        collector.active = false;
                    }
                }
            }

            if (isRx) {
                const now = Date.now();
                if (isTimeoutLoggedRef.current && currentTimeoutRecordRef.current) {
                    currentTimeoutRecordRef.current.recoveredTime = new Date(now).toISOString();
                    currentTimeoutRecordRef.current.durationMs = now - lastRxTimeRef.current;
                    currentTimeoutRecordRef.current = null;
                    setTimeoutRecords([...timeoutRecordsRef.current]);
                    
                    const logRec = {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date(now).toISOString(),
                        type: 'success',
                        message: `SYS: [超时恢复] 主站请求已恢复，通信间隔: ${now - lastRxTimeRef.current}ms`
                    };
                    logsBufferRef.current.push(logRec);
                    if (autoSaveEnabled) dumpBufferRef.current.push(logRec);
                }
                lastRxTimeRef.current = now;
                isTimeoutLoggedRef.current = false;
            }

            logsBufferRef.current.push(newLog);
            if (logsBufferRef.current.length > 2000) {
                logsBufferRef.current = logsBufferRef.current.slice(-1000); // UI max
            }
            
            if (autoSaveEnabled) {
                dumpBufferRef.current.push(newLog);
                if (dumpBufferRef.current.length >= autoSaveLimit) {
                    performAutoSave([...dumpBufferRef.current], autoSavedCount + 1);
                    setAutoSavedCount(c => c + 1);
                    dumpBufferRef.current = [];
                }
            }
        };

        const removeTcpLogListener = modbusSlaveService.onLog(handleLog, 'TCP');
        const removeRtuLogListener = modbusSlaveService.onLog(handleLog, 'RTU');

        return () => {
            removeTcpLogListener();
            removeRtuLogListener();
        };
    }, [session.id, isPaused, autoSaveEnabled, autoSaveLimit, autoSavedCount, performAutoSave]);

    // Throttle state updates
    useEffect(() => {
        const interval = setInterval(() => {
            if (isPaused) return;
            if (logsBufferRef.current.length !== displayedLogs.length || 
                (logsBufferRef.current.length > 0 && logsBufferRef.current[logsBufferRef.current.length - 1] !== displayedLogs[displayedLogs.length - 1])) {
                setDisplayedLogs([...logsBufferRef.current]);
            }
        }, 200);
        return () => clearInterval(interval);
    }, [displayedLogs, isPaused]);

    const handleClearLogs = () => {
        logsBufferRef.current = [];
        setDisplayedLogs([]);
        onClearLogs();
    };

    const [filterDirection, setFilterDirection] = useState<'ALL' | 'RX' | 'TX' | 'MSG_ONLY'>('ALL');
    const [filterType, setFilterType] = useState<'ALL' | 'EXCEPTION' | 'READ' | 'WRITE'>('ALL');
    const [filterText, setFilterText] = useState('');

    const parsedLogsCache = useRef<Map<string, ParsedLog>>(new Map());
    const lastParsedLogsRef = useRef<ParsedLog[]>([]);
    const lastLogsRef = useRef<any[]>([]);
    
    const parsedLogs = useMemo(() => {
        const currentTransport = session.transport || 'TCP';
        
        if (displayedLogs === lastLogsRef.current) {
            return lastParsedLogsRef.current;
        }

        const result = displayedLogs.map(log => {
            const cacheKey = `${log.id}-${currentTransport}`;
            if (parsedLogsCache.current.has(cacheKey)) {
                return parsedLogsCache.current.get(cacheKey)!;
            }
            const parsed = parseLog(log, currentTransport, session.unitId);
            parsedLogsCache.current.set(cacheKey, parsed);
            return parsed;
        });

        if (parsedLogsCache.current.size > 2000) {
            const validKeys = new Set(result.map(log => `${log.id}-${currentTransport}`));
            for (const key of parsedLogsCache.current.keys()) {
                if (!validKeys.has(key)) {
                    parsedLogsCache.current.delete(key);
                }
            }
        }

        lastLogsRef.current = displayedLogs;
        lastParsedLogsRef.current = result;
        return result;
    }, [displayedLogs, session.transport]);

    const filteredLogs = useMemo(() => {
        return parsedLogs.filter(parsed => {
            if (filterDirection === 'MSG_ONLY' && !parsed.isRaw) {
                return false;
            }
            if (filterDirection !== 'ALL' && filterDirection !== 'MSG_ONLY' && parsed.direction !== filterDirection) {
                return false;
            }
            
            if (filterType !== 'ALL') {
                if (filterType === 'EXCEPTION' && !parsed.frameInfo?.isException) return false;
                if (filterType === 'READ' && !parsed.frameInfo?.functionName.includes('读')) return false;
                if (filterType === 'WRITE' && !parsed.frameInfo?.functionName.includes('写')) return false;
            }
            
            if (filterText) {
                const search = filterText.toLowerCase();
                if (!parsed.hexData?.toLowerCase().includes(search) &&
                    !parsed.explanation?.toLowerCase().includes(search) &&
                    !parsed.frameInfo?.unitId?.toString().includes(search)) {
                    return false;
                }
            }
            
            return true;
        });
    }, [parsedLogs, filterDirection, filterType, filterText]);

    useEffect(() => {
        if (autoScroll && filteredLogs.length > 0) {
            if (listRef.current) {
                listRef.current.scrollToItem(filteredLogs.length - 1, 'end');
            }
            // Add delays to handle AutoSizer mounting delay when switching tabs
            const timer1 = setTimeout(() => {
                if (listRef.current) {
                    listRef.current.scrollToItem(filteredLogs.length - 1, 'end');
                }
            }, 50);
            const timer2 = setTimeout(() => {
                if (listRef.current) {
                    listRef.current.scrollToItem(filteredLogs.length - 1, 'end');
                }
            }, 150);
            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        }
    }, [filteredLogs[filteredLogs.length - 1]?.id, autoScroll]);

    const handleExportCsv = () => {
        if (filteredLogs.length === 0) return;
        
        const logsToExport = filteredLogs.filter(log => log.isRaw);
        if (logsToExport.length === 0) return;

        const headers = ['时间', '方向', 'TID/站号', '功能码', '原始报文(HEX)', '解析说明'];
        const csvContent = [
            headers.join(','),
            ...logsToExport.map(log => {
                const time = log.timestamp.split('Z')[0].replace('T', ' ') || ''; // formatted to preserve ms in Excel
                let dir = log.isRaw ? log.direction : 'SYS';
                let tidStation = '';
                if (log.frameInfo) {
                    tidStation = log.frameInfo.tid !== undefined ? `TID: ${log.frameInfo.tid} | 站号: ${log.frameInfo.unitId}` : `站号: ${log.frameInfo.unitId}`;
                }
                const func = log.frameInfo ? `0x${log.frameInfo.functionCode.toString(16).padStart(2, '0').toUpperCase()} (${log.frameInfo.functionName})` : '';
                const hex = log.isRaw ? log.hexData : '-';
                const expl = log.explanation || '';
                
                return [
                    `="""${time}"""`,
                    `"${dir}"`,
                    `"${tidStation}"`,
                    `"${func}"`,
                    `"${hex}"`,
                    `"${expl.replace(/"/g, '""')}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `modbus_slave_logs_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const [colWidths, setColWidths] = useState({
        time: 120,
        dir: 80,
        tid: 140,
        func: 180,
        hex: 300,
        expl: 300
    });

    const handleMouseDown = (e: React.MouseEvent, colKey: keyof typeof colWidths) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = colWidths[colKey];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
            setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
            if (listRef.current) {
                listRef.current.resetAfterIndex(0);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const getItemSize = useCallback((index: number) => {
        const log = filteredLogs[index];
        const hexLength = log.isRaw && log.hexData ? log.hexData.length : 0;
        const explLength = log.explanation ? log.explanation.length : 0;
        
        const hexCharsPerLine = Math.max(10, Math.floor(colWidths.hex / 8));
        const explCharsPerLine = Math.max(10, Math.floor(colWidths.expl / 12));
        
        const hexLines = Math.ceil(hexLength / hexCharsPerLine) || 1;
        const explLines = Math.ceil(explLength / explCharsPerLine) || 1;
        
        const maxLines = Math.max(1, hexLines, explLines);
        
        return Math.max(40, maxLines * 20 + 16);
    }, [filteredLogs, colWidths]);

    const Row = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => {
        const log = filteredLogs[index];
        const timeStr = log.timestamp.split('T')[1]?.split('Z')[0] || '';
        
        return (
            <div style={style} className="flex border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors group">
                <div className="py-2 px-4 text-slate-400 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.time }}>
                    {timeStr}
                </div>
                <div className="py-2 px-4 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.dir }}>
                    {log.isRaw ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.direction === 'RX' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                            {log.direction === 'RX' ? 'RX (请求)' : 'TX (响应)'}
                        </span>
                    ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">SYS</span>
                    )}
                </div>
                <div className="py-2 px-4 text-slate-300 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.tid }}>
                    {log.frameInfo ? (
                        <span className="truncate">
                            {log.frameInfo.tid !== undefined && <span className="text-slate-500 mr-1">TID: {log.frameInfo.tid} |</span>}
                            站号: {log.frameInfo.unitId}
                        </span>
                    ) : '-'}
                </div>
                <div className="py-2 px-4 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.func }}>
                    {log.frameInfo ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                            log.frameInfo.isException ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
                        } truncate`}>
                            0x{log.frameInfo.functionCode.toString(16).padStart(2, '0').toUpperCase()} ({log.frameInfo.functionName})
                        </span>
                    ) : '-'}
                </div>
                <div className="py-2 px-4 text-sky-300 shrink-0 border-r border-slate-800/50 flex items-center break-all whitespace-pre-wrap" style={{ width: colWidths.hex }}>
                    {log.isRaw ? log.hexData : '-'}
                </div>
                <div className="py-2 px-4 text-slate-300 flex-1 min-w-[150px] flex items-center break-words whitespace-pre-wrap" style={{ width: colWidths.expl }}>
                    {log.explanation}
                </div>
            </div>
        );
    }, [filteredLogs, colWidths]);

    return (
        <div className="flex-1 bg-white flex flex-col h-full">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-slate-500" />
                    <h3 className="font-bold text-slate-700">主站请求日志</h3>
                    <div className="h-4 w-px bg-slate-300 mx-1"></div>
                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                            isPaused 
                                ? 'bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        {isPaused ? '继续显示' : '暂停显示'}
                    </button>
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                            autoScroll 
                                ? 'bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                        title={autoScroll ? '点击关闭自动滚动' : '点击开启自动滚动'}
                    >
                        <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'animate-bounce' : ''}`} />
                        {autoScroll ? '自动滚动' : '手动滚动'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 mr-2">
                        {isPaused ? '已暂停更新' : '实时更新中...'}
                    </span>
                    <button
                        onClick={handleExportCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-md border border-transparent hover:border-sky-100 transition-colors text-xs font-medium"
                        title="导出 CSV"
                    >
                        <Download className="w-3.5 h-3.5" />
                        导出
                    </button>
                    <button
                        onClick={handleClearLogs}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md border border-transparent hover:border-red-100 transition-colors text-xs font-medium"
                        title="清空日志"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        清空
                    </button>
                </div>
            </div>
            <div className="p-2 border-b border-slate-200 bg-slate-100 flex items-center gap-4 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-medium">方向:</span>
                    <select 
                        value={filterDirection} 
                        onChange={(e) => setFilterDirection(e.target.value as any)}
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:border-sky-500"
                    >
                        <option value="ALL">全部</option>
                        <option value="MSG_ONLY">仅报文 (RX/TX)</option>
                        <option value="RX">RX (请求)</option>
                        <option value="TX">TX (响应)</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-medium">类型:</span>
                    <select 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:border-sky-500"
                    >
                        <option value="ALL">全部</option>
                        <option value="READ">读操作</option>
                        <option value="WRITE">写操作</option>
                        <option value="EXCEPTION">异常报错</option>
                    </select>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
                    <span className="text-slate-500 font-medium">搜索:</span>
                    <input 
                        type="text" 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="搜索报文、说明或站号..."
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:border-sky-500 w-full"
                    />
                </div>
                <div className="flex items-center gap-4 border-l border-slate-300 pl-4">
                    <label className="flex items-center gap-1.5 cursor-pointer" title="开启后，每到达指定日志数将自动导出为CSV到 此电脑/文档/ModbusLogs 目录">
                        <input type="checkbox" checked={autoSaveEnabled} onChange={e => setAutoSaveEnabled(e.target.checked)} className="rounded text-sky-500 cursor-pointer w-3 h-3" />
                        <span className="text-slate-600 font-medium">自动保存满:</span>
                        <input type="number" min="100" max="10000" step="100" value={autoSaveLimit} onChange={e => setAutoSaveLimit(Number(e.target.value) || 1000)} className="w-16 px-1 py-0.5 border border-slate-300 rounded" disabled={!autoSaveEnabled} />
                        <span className="text-slate-500">条</span>
                    </label>
                    <button onClick={() => { if((window as any).electronAPI?.modbusOpenLogsDir) (window as any).electronAPI.modbusOpenLogsDir(); }} className="text-sky-600 hover:text-sky-700 underline text-[10px] ml-1">打开文件夹</button>

                    <label className="flex items-center gap-1.5 cursor-pointer" title="设置主站读写请求静默多长时间后产生告警">
                        <input type="checkbox" checked={timeoutDetectionEnabled} onChange={e => setTimeoutDetectionEnabled(e.target.checked)} className="rounded text-sky-500 cursor-pointer w-3 h-3" />
                        <span className="text-slate-600 font-medium">主站请求超时:</span>
                        <input type="number" min="5" max="60000" step="5" value={timeoutLimit} onChange={e => setTimeoutLimit(Number(e.target.value) || 10)} className="w-16 px-1 py-0.5 border border-slate-300 rounded" />
                        <span className="text-slate-500">ms</span>
                    </label>
                    {timeoutDetectionEnabled && timeoutCount > 0 && (
                        <button 
                            onClick={() => setShowTimeoutModal(true)}
                            className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-semibold px-2 py-1 flex items-center gap-1 rounded text-xs ml-2 cursor-pointer transition-colors"
                        >
                            超时事件: {timeoutCount}
                        </button>
                    )}
                </div>
                <div className="flex-1 text-right text-slate-400">
                    共 {filteredLogs.length} 条记录
                </div>
            </div>
            
            {showTimeoutModal && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] border border-slate-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                主站请求超时记录监控 ({timeoutRecords.length})
                            </h3>
                            <button onClick={() => setShowTimeoutModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="flex-1 overflow-auto p-0 bg-white">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 font-semibold shadow-sm z-10">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-slate-200 w-16">序号</th>
                                        <th className="px-4 py-3 border-b border-slate-200">最后一次正常RX请求时间</th>
                                        <th className="px-4 py-3 border-b border-slate-200">触发告警时间</th>
                                        <th className="px-4 py-3 border-b border-slate-200">恢复通讯时间</th>
                                        <th className="px-4 py-3 border-b border-slate-200 text-right">实际中断时长 (ms)</th>
                                        <th className="px-4 py-3 border-b border-slate-200 text-center w-24">上下文</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 divide-y divide-slate-100">
                                    {timeoutRecords.map((rec, i) => (
                                        <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 py-3 font-mono text-slate-400">{i + 1}</td>
                                            <td className="px-4 py-3 font-mono text-emerald-600">{rec.lastRxTime.split('T')[1]?.split('Z')[0]}</td>
                                            <td className="px-4 py-3 font-mono text-red-500 bg-red-50/30 font-semibold">{rec.detectedTime.split('T')[1]?.split('Z')[0]}</td>
                                            <td className="px-4 py-3 font-mono">
                                                {rec.recoveredTime ? (
                                                    <span className="text-sky-600">{rec.recoveredTime.split('T')[1]?.split('Z')[0]}</span>
                                                ) : (
                                                    <span className="text-amber-500 font-medium flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />未恢复</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-right font-bold text-slate-800">
                                                {rec.durationMs !== null ? `${rec.durationMs} ms` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button 
                                                    onClick={() => setContextLogsModal({ id: rec.id, logs: rec.contextLogs })}
                                                    disabled={!rec.contextLogs}
                                                    className={`px-2 py-1 rounded text-xs transition-colors whitespace-nowrap ${rec.contextLogs ? 'bg-sky-100 text-sky-600 hover:bg-sky-200 font-medium' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    {rec.contextLogs ? '查看帧' : '采集中...'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {timeoutRecords.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-slate-400 bg-slate-50 border-b border-slate-100">暂无超时事件记录</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50 rounded-b-xl shrink-0">
                            <div className="text-xs text-slate-500">
                                *独立追踪超时事件，不会被日常日志刷新清除。
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => { 
                                        timeoutRecordsRef.current = []; 
                                        setTimeoutRecords([]);
                                        setTimeoutCount(0); 
                                    }} 
                                    className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <Trash2 className="w-4 h-4"/> 
                                    清空记录
                                </button>
                                <button onClick={() => setShowTimeoutModal(false)} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold transition-colors shadow-sm">关闭面板</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {contextLogsModal && (
                <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] border border-slate-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl shrink-0">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Search className="w-5 h-5 text-sky-500" />
                                上下文帧记录 (记录ID: <span className="font-mono text-sm text-slate-500">{contextLogsModal.id}</span>)
                            </h3>
                            <button onClick={() => setContextLogsModal(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-slate-50 relative">
                            {contextLogsModal.logs.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">未抓取到报文，可能期间没有有效的数据收发或已被清空</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {contextLogsModal.logs.filter(log => typeof log.message === 'string' && !log.message.includes('SYS:')).map((log, index) => {
                                        const t = log.timestamp.split('Z')[0].replace('T', ' ');
                                        return (
                                            <div key={index} className={`p-3 rounded border text-sm font-mono break-all leading-relaxed bg-white border-slate-200 text-slate-600`}>
                                                <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
                                                    <span className="flex-1 whitespace-pre-wrap">{typeof log.message === 'object' ? JSON.stringify(log.message) : log.message}</span>
                                                    <span className="shrink-0 text-xs text-slate-400 font-sans whitespace-nowrap">{t}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50 rounded-b-xl shrink-0">
                            <button onClick={() => setContextLogsModal(null)} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold transition-colors shadow-sm">关闭</button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="flex-1 overflow-hidden p-0 bg-slate-900 font-mono text-sm relative">
                <div className="h-full flex flex-col">
                    <div className="bg-slate-800 text-slate-400 text-xs shadow-md flex sticky top-0 z-10">
                        <div className="py-2 px-4 font-medium relative border-r border-slate-700/50 shrink-0" style={{ width: colWidths.time }}>
                            时间
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-500/50 z-20" onMouseDown={(e) => handleMouseDown(e, 'time')} />
                        </div>
                        <div className="py-2 px-4 font-medium relative border-r border-slate-700/50 shrink-0" style={{ width: colWidths.dir }}>
                            方向
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-500/50 z-20" onMouseDown={(e) => handleMouseDown(e, 'dir')} />
                        </div>
                        <div className="py-2 px-4 font-medium relative border-r border-slate-700/50 shrink-0" style={{ width: colWidths.tid }}>
                            TID/站号
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-500/50 z-20" onMouseDown={(e) => handleMouseDown(e, 'tid')} />
                        </div>
                        <div className="py-2 px-4 font-medium relative border-r border-slate-700/50 shrink-0" style={{ width: colWidths.func }}>
                            功能码
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-500/50 z-20" onMouseDown={(e) => handleMouseDown(e, 'func')} />
                        </div>
                        <div className="py-2 px-4 font-medium relative border-r border-slate-700/50 shrink-0" style={{ width: colWidths.hex }}>
                            原始报文 (HEX)
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-500/50 z-20" onMouseDown={(e) => handleMouseDown(e, 'hex')} />
                        </div>
                        <div className="py-2 px-4 font-medium relative flex-1 min-w-[150px]" style={{ width: colWidths.expl }}>
                            解析说明
                        </div>
                    </div>
                    
                    <div className="flex-1 relative">
                        {filteredLogs.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                                暂无日志记录
                            </div>
                        ) : (
                            <AutoSizer>
                                {({ height, width }) => (
                                    <List
                                        ref={listRef}
                                        height={height}
                                        itemCount={filteredLogs.length}
                                        itemSize={getItemSize}
                                        width={width}
                                        className="scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
                                        overscanCount={10}
                                    >
                                        {Row}
                                    </List>
                                )}
                            </AutoSizer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
