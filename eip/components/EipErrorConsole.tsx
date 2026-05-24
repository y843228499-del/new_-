
import React, { useState, useEffect, useRef } from 'react';
import { X, AlertOctagon, Terminal, Minimize2, Maximize2, Trash2, Pin, PinOff, GripVertical, GripHorizontal } from 'lucide-react';
import { eipService } from '../services/eipService';

// --- DLL Error Code Definition ---
const DLL_ERRORS: Record<number, { code: string, desc: string }> = {
    [-2]: { code: 'ERR_EIP_STOPED', desc: '协议栈未开启 (Stack Stopped)' },
    [-1]: { code: 'OTHER_ERROR', desc: '未知内部错误 (Internal Error)' },
    0:  { code: 'SUCCESS', desc: '成功' },
    1:  { code: 'ERRI_INVALID_CONNECTION_INSTANCE_SPECIFIED', desc: '实例ID重复或超限' },
    2:  { code: 'ERRI_CONN_CONFIG_FAILED_INVALID_NETWORK_PATH', desc: '网络路径格式错误' },
    3:  { code: 'ERRI_CONNECTION_COUNT_LIMIT_REACHED', desc: '达到最大连接数限制' },
    4:  { code: 'ERRI_OUT_OF_MEMORY', desc: '内存溢出/缓冲区已满' },
    5:  { code: 'ERRR_CONN_CONFIG_FAILED_INVALID_NETWORK_PATH', desc: '无效的网络地址' },
    6:  { code: 'ERRR_CONN_CONFIG_FAILED_NO_RESPONSE', desc: '连接无响应 (No Response)' },
    7:  { code: 'ERRR_CONN_CONFIG_FAILED_ERROR_RESPONSE', desc: '连接响应错误' },
    8:  { code: 'ERRR_INVALID_DESTINATION', desc: '目标标签不存在 (Tag Not Found)' },
    9:  { code: 'ERRR_TAGNAME_TOO_LONG', desc: '标签名过长 (>255 chars)' },
    10: { code: 'ERRR_REQUEST_DATA_TOO_LARGE', desc: '请求数据包超限' },
    11: { code: 'ERRR_CONN_CONNECTION_TIMED_OUT', desc: '响应超时 (设备离线?)' },
    12: { code: 'ERRR_TAGNAME_CONVERT_FAILED', desc: '标签名解析失败' },
    13: { code: 'ERRR_WRITE_DATASIZE_UNCONSISTENT', desc: '写入数据大小不匹配' },
    14: { code: 'ERRR_SCAN_ERROR', desc: '扫描标签信息失败' }
};

interface ErrorLog {
    id: number;
    time: string;
    sessionId: string;
    errCode: number;
    rawMsg: string;
}

export const EipErrorConsole: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false); 
    const [isPinned, setIsPinned] = useState(true); // True = Floating (Resizable), False = Docked Bottom
    const [logs, setLogs] = useState<ErrorLog[]>([]);
    
    // Window Dimensions State
    const [dimensions, setDimensions] = useState({ width: 450, height: 320 });
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const logCountRef = useRef(0);
    
    // Resizing Refs
    const resizingRef = useRef<{ startX: number, startY: number, startW: number, startH: number } | null>(null);

    useEffect(() => {
        // Subscribe to low-level errors from service
        const unsubscribe = eipService.onDllError((payload) => {
            const { sessionId, error } = payload;
            
            // Extract Error Code from string like "ERRR_... (8)"
            let code = -999;
            const match = error.match(/\((-?\d+)\)$/);
            if (match) {
                code = parseInt(match[1], 10);
            }

            const newLog: ErrorLog = {
                id: ++logCountRef.current,
                time: new Date().toLocaleTimeString(),
                sessionId,
                errCode: code,
                rawMsg: error
            };

            setLogs(prev => [...prev.slice(-99), newLog]); // Keep last 100
        });

        return () => unsubscribe();
    }, []);

    // Auto-scroll
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, isOpen]);

    // --- RESIZING LOGIC ---
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = { 
            startX: e.clientX, 
            startY: e.clientY, 
            startW: dimensions.width, 
            startH: dimensions.height 
        };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeUp);
        document.body.style.cursor = isPinned ? 'nw-resize' : 'ns-resize';
        document.body.style.userSelect = 'none';
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (!resizingRef.current) return;
        const { startX, startY, startW, startH } = resizingRef.current;
        
        if (isPinned) {
            // Floating Mode: Dragging top-left corner
            // Moving mouse LEFT (negative delta) increases width
            // Moving mouse UP (negative delta) increases height
            const deltaX = startX - e.clientX;
            const deltaY = startY - e.clientY;
            
            setDimensions({
                width: Math.max(300, Math.min(1000, startW + deltaX)),
                height: Math.max(200, Math.min(800, startH + deltaY))
            });
        } else {
            // Docked Mode: Dragging top border
            // Moving mouse UP (negative delta) increases height
            const deltaY = startY - e.clientY;
            setDimensions(prev => ({
                ...prev,
                height: Math.max(150, Math.min(600, startH + deltaY))
            }));
        }
    };

    const handleResizeUp = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    const getErrorDetail = (code: number) => {
        return DLL_ERRORS[code] || { code: 'UNKNOWN', desc: '未知错误代码' };
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-red-700 transition-all border border-red-500 animate-in slide-in-from-bottom-5 font-bold"
                title="Open DLL Error Console"
            >
                <AlertOctagon className="w-4 h-4" />
                <span className="text-xs">DLL 异常监控</span>
                {logs.length > 0 && <span className="bg-white text-red-600 text-[10px] font-black px-1.5 rounded-full shadow-sm">{logs.length}</span>}
            </button>
        );
    }

    return (
        <div 
            className={`fixed z-[60] bg-white border border-slate-300 shadow-2xl flex flex-col transition-all duration-75 ease-out font-sans ${isPinned ? 'rounded-lg right-4 bottom-4' : 'right-0 bottom-0 w-full border-x-0 border-b-0'}`}
            style={{ 
                width: isPinned ? dimensions.width : '100%', 
                height: dimensions.height 
            }}
        >
            {/* Resize Handle */}
            <div 
                className={`absolute z-50 group flex items-center justify-center transition-colors ${isPinned ? 'top-0 left-0 w-6 h-6 cursor-nw-resize rounded-tl-lg hover:bg-slate-100' : 'top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-400/50 bg-transparent'}`}
                onMouseDown={startResize}
            >
                {isPinned && (
                    <div className="w-2 h-2 border-t-2 border-l-2 border-slate-300 group-hover:border-blue-500 rounded-tl-[2px]"></div>
                )}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 select-none shrink-0" onDoubleClick={() => setIsPinned(!isPinned)}>
                <div className="flex items-center gap-2 pl-2">
                    <Terminal className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Inovance Driver Console</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setLogs([])} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200 rounded transition-colors" title="Clear Logs"><Trash2 className="w-3.5 h-3.5"/></button>
                    <button onClick={() => setIsPinned(!isPinned)} className={`text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200 rounded transition-colors ${isPinned ? 'text-blue-500 hover:text-blue-600 bg-blue-50' : ''}`} title={isPinned ? "Dock to Bottom" : "Float Window"}>
                        {isPinned ? <PinOff className="w-3.5 h-3.5"/> : <Pin className="w-3.5 h-3.5"/>}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors"><Minimize2 className="w-3.5 h-3.5"/></button>
                </div>
            </div>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-1 bg-white">
                {logs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                        <AlertOctagon className="w-8 h-8 opacity-20" />
                        <span className="italic">暂无异常日志 (No Exceptions)</span>
                    </div>
                )}
                {logs.map(log => {
                    const detail = getErrorDetail(log.errCode);
                    return (
                        <div key={log.id} className="flex gap-2 text-slate-600 hover:bg-blue-50 p-1.5 rounded transition-colors border-l-2 border-transparent hover:border-blue-400">
                            <span className="text-slate-400 shrink-0 font-medium">[{log.time}]</span>
                            <span className="text-blue-600 font-bold shrink-0 bg-blue-50 px-1 rounded h-fit">{log.sessionId.substring(0,4)}..</span>
                            <div className="flex flex-col min-w-0">
                                <span className="text-red-600 font-bold break-all flex items-center gap-1">
                                    {detail.code} 
                                    <span className="bg-red-50 text-red-600 px-1 rounded border border-red-100">{log.errCode}</span>
                                </span>
                                <span className="text-slate-500 font-medium mt-0.5">{detail.desc}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Status Bar */}
            <div className="px-3 py-1 bg-slate-50 border-t border-slate-200 text-[9px] text-slate-400 flex justify-between shrink-0">
                <span className="flex items-center gap-1">Monitoring <span className="font-bold text-slate-500">EipTagSimple.dll</span></span>
                <span>Total Events: {logs.length}</span>
            </div>
        </div>
    );
};
