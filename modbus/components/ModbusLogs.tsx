import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ModbusSessionInfo, ConnectionStatus } from '../../types';
import { Terminal, Trash2, Download, Play, Pause, ArrowDown } from 'lucide-react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { modbusService } from '../services/modbusService';

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
            if (lowerMsg.includes('tx') || lowerMsg.includes('send') || lowerMsg.includes('request') || lowerMsg.includes('write')) {
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

    // For Master: TX is Request, RX is Response
    if (direction === 'TX') {
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
        return { ...log, isRaw: false, explanation: log.message, frameInfo: null };
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
            if (lowerMsg.includes('tx') || lowerMsg.includes('send') || lowerMsg.includes('request') || lowerMsg.includes('write')) {
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

export const ModbusLogs = React.memo(({ session, onClearLogs }: { 
    session: ModbusSessionInfo, 
    onClearLogs: () => void 
}) => {
    const [isPaused, setIsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [displayedLogs, setDisplayedLogs] = useState<any[]>([]);
    const logsBufferRef = useRef<any[]>([]);
    const listRef = useRef<any>(null);

    // Listen to logs directly
    useEffect(() => {
        const unsub = modbusService.onLogReceived((data) => {
            if (data.sessionId !== session.id) return;
            if (isPaused) return;

            const newLog = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
                type: data.level,
                message: data.message
            };

            logsBufferRef.current.push(newLog);
            if (logsBufferRef.current.length > 1000) {
                logsBufferRef.current = logsBufferRef.current.slice(-1000);
            }
        });
        return () => unsub();
    }, [session.id, isPaused]);

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

    const [filterDirection, setFilterDirection] = useState<'ALL' | 'RX' | 'TX'>('ALL');
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
            if (filterDirection !== 'ALL' && parsed.direction !== filterDirection) {
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
        
        const headers = ['时间', '方向', 'TID/站号', '功能码', '原始报文(HEX)', '解析说明'];
        const csvContent = [
            headers.join(','),
            ...filteredLogs.map(log => {
                const time = log.timestamp.split('T')[1]?.split('Z')[0] || '';
                let dir = log.isRaw ? log.direction : 'SYS';
                let tidStation = '';
                if (log.frameInfo) {
                    tidStation = log.frameInfo.tid !== undefined ? `TID: ${log.frameInfo.tid} | 站号: ${log.frameInfo.unitId}` : `站号: ${log.frameInfo.unitId}`;
                }
                const func = log.frameInfo ? `0x${log.frameInfo.functionCode.toString(16).padStart(2, '0').toUpperCase()} (${log.frameInfo.functionName})` : '';
                const hex = log.isRaw ? log.hexData : '-';
                const expl = log.explanation || '';
                
                return [
                    `"${time}"`,
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
        link.setAttribute('download', `modbus_master_logs_${new Date().getTime()}.csv`);
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
        const timeStr = log.timestamp.split('T')[1]?.split('Z')[0] || log.timestamp;
        
        return (
            <div style={style} className="flex border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors group">
                <div className="py-2 px-4 text-slate-400 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.time }}>
                    {timeStr}
                </div>
                <div className="py-2 px-4 shrink-0 border-r border-slate-800/50 flex items-center" style={{ width: colWidths.dir }}>
                    {log.isRaw ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.direction === 'TX' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                            {log.direction === 'TX' ? 'TX (请求)' : 'RX (响应)'}
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
                    <h3 className="font-bold text-slate-700">报文监控</h3>
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
                        <option value="TX">TX (请求)</option>
                        <option value="RX">RX (响应)</option>
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
                <div className="flex-1 text-right text-slate-400">
                    共 {filteredLogs.length} 条记录
                </div>
            </div>
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
