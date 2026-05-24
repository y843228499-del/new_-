
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Zap, 
  Plus, 
  Power, 
  Trash2, 
  Server, 
  Save, 
  FilePlus, 
  FolderOpen, 
  LayoutDashboard, 
  Database, 
  Terminal,
  Settings,
  HelpCircle,
  BarChart3,
  Play,
  Square,
  Copy, 
  ClipboardPaste, 
  Edit2, 
  Check, 
  X, 
  Loader2, 
  AlertTriangle, 
  Activity, 
  WifiOff, 
  Pause, 
  RotateCcw,
  Hash,
  ArrowRightLeft
} from 'lucide-react';
import { ModbusSessionInfo, ConnectionStatus, LogEntry } from '../types';
import { ModbusDashboard } from './components/ModbusDashboard';
import { ModbusRegisterTable } from './components/ModbusRegisterTable';
import { ModbusSchedulerPanel } from './components/ModbusSchedulerPanel';
import { Toaster, toast } from 'sonner';
import { modbusService } from './services/modbusService';
import { ModbusHelpModal } from './components/ModbusHelpModal';
import { ModbusSettingsModal } from './components/ModbusSettingsModal';
import DropStatsModal from '../components/DropStatsModal';
import SystemLogPanel from '../components/SystemLogPanel';
import { useProject } from '../contexts/ProjectContext';

// --- Sub-Component: Modbus Workspace (Isolated State) ---
import { ModbusLogs } from './components/ModbusLogs';

interface ModbusWorkspaceProps {
    session: ModbusSessionInfo;
    isActive: boolean;
    localIps: string[];
    comPorts: string[];
    onUpdate: (id: string, updates: Partial<ModbusSessionInfo>) => void;
    onConnect: (id: string, useActiveProbe: boolean) => void;
    onDisconnect: (id: string) => void;
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
}

const ModbusWorkspace: React.FC<ModbusWorkspaceProps> = React.memo(({ session, isActive, localIps, comPorts, onUpdate, onConnect, onDisconnect, addLog }) => {
    const [viewMode, setViewMode] = useState<'DASH' | 'TABLE' | 'SCHEDULER' | 'RAW'>('DASH');
    const [useActiveProbe, setUseActiveProbe] = useState(true);

    const isConnected = session.status === ConnectionStatus.CONNECTED;
    const isConnecting = session.status === ConnectionStatus.CONNECTING;
    const isSerial = session.transport === 'RTU' || session.transport === 'ASCII';

    return (
        <div className={`absolute inset-0 flex flex-col bg-slate-100 pt-0 transition-opacity duration-200 ${isActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none'}`} style={{ display: isActive ? 'flex' : 'none' }}> 
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm z-10">
                <div className="flex flex-wrap items-end gap-4">
                    {/* Transport Toggle */}
                    <div className="flex flex-col">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">通讯方式</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 h-[38px]">
                            <button 
                                onClick={() => onUpdate(session.id, { transport: 'TCP' })}
                                disabled={isConnected || isConnecting}
                                className={`px-3 text-xs font-bold rounded-md transition-colors ${!isSerial ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                TCP
                            </button>
                            <button 
                                onClick={() => onUpdate(session.id, { transport: 'RTU' })}
                                disabled={isConnected || isConnecting}
                                className={`px-3 text-xs font-bold rounded-md transition-colors ${session.transport === 'RTU' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                RTU
                            </button>
                            <button 
                                onClick={() => onUpdate(session.id, { transport: 'ASCII' })}
                                disabled={isConnected || isConnecting}
                                className={`px-3 text-xs font-bold rounded-md transition-colors ${session.transport === 'ASCII' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                ASCII
                            </button>
                        </div>
                    </div>

                    {!isSerial ? (
                        <>
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">服务器 IP (Server IP)</label>
                                <input value={session.ip} onChange={e => onUpdate(session.id, {ip: e.target.value})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none" />
                            </div>
                            <div className="w-20">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">端口 (Port)</label>
                                <input type="number" value={session.port} onChange={e => onUpdate(session.id, {port: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none" />
                            </div>
                            <div className="w-32">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">本地绑定 IP</label>
                                <select 
                                    value={session.localBindIp || ''} 
                                    onChange={e => onUpdate(session.id, {localBindIp: e.target.value})} 
                                    disabled={isConnected} 
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                                >
                                    <option value="">Auto</option>
                                    {localIps.map(ip => (
                                        <option key={ip} value={ip}>{ip}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex-1 min-w-[120px]">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">串口 (COM)</label>
                                <select 
                                    value={session.comPort || ''} 
                                    onChange={e => onUpdate(session.id, {comPort: e.target.value})} 
                                    disabled={isConnected} 
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                                >
                                    <option value="">选择串口...</option>
                                    {comPorts.map(port => (
                                        <option key={port} value={port}>{port}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">波特率</label>
                                <select value={session.baudRate || 9600} onChange={e => onUpdate(session.id, {baudRate: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                                    <option value={4800}>4800</option>
                                    <option value={9600}>9600</option>
                                    <option value={19200}>19200</option>
                                    <option value={38400}>38400</option>
                                    <option value={57600}>57600</option>
                                    <option value={115200}>115200</option>
                                </select>
                            </div>
                            <div className="w-16">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">数据位</label>
                                <select value={session.dataBits || 8} onChange={e => onUpdate(session.id, {dataBits: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                                    <option value={7}>7</option>
                                    <option value={8}>8</option>
                                </select>
                            </div>
                            <div className="w-16">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">停止位</label>
                                <select value={session.stopBits || 1} onChange={e => onUpdate(session.id, {stopBits: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                </select>
                            </div>
                            <div className="w-20">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">校验位</label>
                                <select value={session.parity || 'none'} onChange={e => onUpdate(session.id, {parity: e.target.value as any})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                                    <option value="none">None</option>
                                    <option value="even">Even</option>
                                    <option value="odd">Odd</option>
                                </select>
                            </div>
                        </>
                    )}

                    <div className="w-16">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">站号 (ID)</label>
                        <input type="number" value={session.unitId} onChange={e => onUpdate(session.id, {unitId: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div className="w-20">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">超时 (ms)</label>
                        <input type="number" min="100" step="100" value={session.timeout || 2000} onChange={e => onUpdate(session.id, {timeout: Number(e.target.value)})} disabled={isConnected} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    
                    <div className="flex flex-col">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Probe</label>
                        <div className="h-[38px] flex items-center px-3 border border-slate-300 rounded-lg bg-slate-50 gap-2" title="握手后立即尝试读取地址0以验证真实连接">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500" 
                                    checked={useActiveProbe} 
                                    onChange={(e) => setUseActiveProbe(e.target.checked)} 
                                    disabled={isConnected}
                                />
                                <Activity className={`w-4 h-4 ${useActiveProbe ? 'text-amber-600' : 'text-slate-300'}`} />
                            </label>
                        </div>
                    </div>

                    <button onClick={() => isConnected ? onDisconnect(session.id) : onConnect(session.id, useActiveProbe)} className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 h-[38px] ${isConnected ? 'bg-white border border-red-200 text-red-600' : 'bg-amber-600 text-white shadow-md hover:bg-amber-700'} ${isConnecting ? 'opacity-70 cursor-wait' : ''}`}>
                        {isConnecting ? <Loader2 className="w-4 h-4 animate-spin"/> : isConnected ? <Power className="w-4 h-4" /> : <Zap className="w-4 h-4" />} {isConnecting ? "连接中..." : isConnected ? "断开连接" : "建立连接"}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 bg-slate-50 border-b border-slate-200 flex gap-1 shrink-0 overflow-x-auto scrollbar-none">
                {[
                    {id: 'DASH', name: '状态概览 (Dashboard)', icon: LayoutDashboard},
                    {id: 'TABLE', name: '寄存器表 (Register Table)', icon: Database},
                    {id: 'SCHEDULER', name: '数据调度 (Scheduler)', icon: ArrowRightLeft},
                    {id: 'RAW', name: '原始报文 (Raw Traffic)', icon: Terminal}
                ].map(tab => (
                    <button key={tab.id} onClick={() => setViewMode(tab.id as any)} className={`px-4 py-2 text-xs font-bold rounded-t-lg border-x border-t transition-all flex items-center gap-2 relative top-[1px] ${viewMode === tab.id ? 'bg-white border-slate-200 text-amber-700 z-10 shadow-sm' : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'}`}>
                        <tab.icon className="w-4 h-4" /> {tab.name}
                    </button>
                ))}
            </div>

            {/* View Content */}
            <div className="flex-1 bg-white relative overflow-hidden shadow-inner">
                {/* 
                   CRITICAL FIX: Use display:none instead of conditional rendering.
                   This keeps ModbusRegisterTable mounted, so the polling loop continues running 
                   even when user switches to Dashboard tab.
                */}
                <div style={{ display: viewMode === 'DASH' ? 'block' : 'none', height: '100%' }}>
                    <ModbusDashboard session={session} />
                </div>
                <div style={{ display: viewMode === 'TABLE' ? 'block' : 'none', height: '100%' }}>
                    <ModbusRegisterTable 
                        session={session} 
                        onUpdate={(u) => onUpdate(session.id, u)} 
                        addLog={addLog}
                        isVisible={isActive && viewMode === 'TABLE'} // Pass visibility state for rendering optimization
                    />
                </div>
                <div style={{ display: viewMode === 'SCHEDULER' ? 'block' : 'none', height: '100%' }}>
                    <ModbusSchedulerPanel 
                        session={session} 
                        onUpdate={(u) => onUpdate(session.id, u)} 
                        addLog={addLog}
                    />
                </div>
                <div style={{ display: viewMode === 'RAW' ? 'flex' : 'none', height: '100%' }} className="w-full h-full">
                    <ModbusLogs session={session} onClearLogs={() => onUpdate(session.id, { config: { ...session.config, logs: [] } })} />
                </div>
            </div>
        </div>
    );
});

// --- Main App ---
const ModbusAppContent: React.FC = () => {
    const { setDirty } = useProject(); 
    
    // Check for Electron availability
    const isElectron = !!(window as any).electronAPI;

    // --- STATE ---
    const [sessions, setSessions] = useState<ModbusSessionInfo[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
    const [lastClickedSessionId, setLastClickedSessionId] = useState<string | null>(null);
    const [clipboardSessions, setClipboardSessions] = useState<ModbusSessionInfo[] | null>(null);
    
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [createCount, setCreateCount] = useState(1);

    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isStatsOpen, setIsStatsOpen] = useState(false);

    // --- LOGGING STATE ---
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [localIps, setLocalIps] = useState<string[]>([]);
    const [comPorts, setComPorts] = useState<string[]>([]);

    useEffect(() => {
        const fetchIpsAndPorts = async () => {
            try {
                const ips = await modbusService.getLocalIps();
                setLocalIps(ips);
                const ports = await modbusService.getComPorts();
                setComPorts(ports);
            } catch (err) {
                console.error("Failed to fetch local IPs or COM ports:", err);
            }
        };
        fetchIpsAndPorts();

        const unsubLog = modbusService.onLogReceived((data) => {
            // Filter out raw packets for the SystemLogPanel
            const isRaw = data.message && (
                data.message.includes('[原始报文]') || 
                /\b(RX|TX)\b/i.test(data.message) ||
                /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(data.message) ||
                /^[0-9a-fA-F\s\[\]]{8,}$/.test(data.message.trim())
            );

            if (!isRaw) {
                setLogs(prev => {
                    const session = sessionsRef.current.find(s => s.id === data.sessionId);
                    const newLog: LogEntry = {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
                        level: data.level as any,
                        message: data.message,
                        sessionName: session ? session.name : data.sessionId
                    };
                    return [...prev, newLog].slice(-500);
                });
            }
        });

        return () => {
            unsubLog();
        };
    }, []);

    const addLog = useCallback((type: 'info' | 'error' | 'success' | 'warn', msg: string) => {
        const newLog: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            level: type,
            message: msg,
            sessionName: activeSessionId ? sessions.find(s => s.id === activeSessionId)?.name : 'System'
        };
        setLogs(prev => [...prev, newLog].slice(-500));
    }, [activeSessionId, sessions]);

    // Ref to access current sessions inside event listeners
    const sessionsRef = useRef(sessions);
    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
    const reconnectTimers = useRef<Map<string, any>>(new Map());

    // --- INITIALIZATION ---
    useEffect(() => {
        if (sessions.length === 0) createNewSessions(1);
    }, []);

    const initialLoadRef = useRef(true);
    useEffect(() => {
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            return;
        }
        setDirty(true);
    }, [sessions, setDirty]);

    const createNewSessions = useCallback((count: number) => {
        const newSessions: ModbusSessionInfo[] = [];
        const startIdx = sessions.length + 1;
        for (let i = 0; i < count; i++) {
            const id = Math.random().toString(36).substr(2, 9);
            newSessions.push({
                id,
                name: `Device ${startIdx + i}`, 
                ip: '192.168.1.88', 
                port: 502,
                unitId: 1,
                timeout: 2000, 
                status: ConnectionStatus.DISCONNECTED,
                dropCount: 0,
                dropHistory: [],
                isScanning: false,
                config: { 
                    registers: [], 
                    schedulerTasks: [], // NEW: Init Scheduler Tasks
                    scanRate: 1000,
                    logs: [] 
                }
            });
        }
        setSessions(prev => [...prev, ...newSessions]);
        if (newSessions.length > 0) {
            setActiveSessionId(newSessions[0].id);
            setSelectedSessionIds(new Set([newSessions[0].id]));
        }
    }, [sessions.length]);

    const clearReconnectTimer = (id: string) => {
        if (reconnectTimers.current.has(id)) {
            clearTimeout(reconnectTimers.current.get(id));
            reconnectTimers.current.delete(id);
        }
    };

    const handleConnect = useCallback(async (id: string, useActiveProbe: boolean = true) => {
        const target = sessionsRef.current.find(s => s.id === id);
        if (!target) return;
        
        const isFreshStart = target.status === ConnectionStatus.DISCONNECTED;

        clearReconnectTimer(id);

        setSessions(prev => prev.map(s => s.id === id ? { ...s, status: ConnectionStatus.CONNECTING } : s));
        
        if (target.transport === 'RTU' || target.transport === 'ASCII') {
            addLog('info', `Connecting to ${target.comPort} (${target.baudRate},${target.dataBits},${target.parity},${target.stopBits}) via ${target.transport}...`);
        } else {
            addLog('info', `Connecting to ${target.ip}:${target.port} (Local: ${target.localBindIp || 'Auto'})...`);
        }
        
        try {
            let res;
            if (target.transport === 'RTU' || target.transport === 'ASCII') {
                if (!target.comPort) throw new Error("Please select a COM port");
                res = await modbusService.connectRtu(
                    id, 
                    target.comPort, 
                    target.baudRate || 9600, 
                    target.dataBits || 8, 
                    target.stopBits || 1, 
                    target.parity || 'none', 
                    target.unitId, 
                    target.timeout || 2000, 
                    useActiveProbe,
                    target.transport
                );
            } else {
                res = await modbusService.connect(id, target.ip, target.port, target.unitId, target.timeout || 2000, useActiveProbe, target.localBindIp);
            }
            
            if (res.success) {
                setSessions(prev => prev.map(s => {
                    if (s.id === id) {
                        const newRegs = s.config.registers.map(r => {
                            if (isFreshStart) {
                                // Preserve values, reset counters only
                                return { 
                                    ...r, 
                                    status: 'Idle', 
                                    requestCount: 0, 
                                    errorCount: 0, 
                                    errorStats: {} 
                                };
                            }
                            return { ...r, status: 'Idle' };
                        });

                        return { 
                            ...s, 
                            status: ConnectionStatus.CONNECTED,
                            clientPort: res.clientPort,
                            lastError: undefined,
                            connectTime: Date.now(), 
                            config: { ...s.config, registers: newRegs }
                        };
                    }
                    return s;
                }));
                if (target.transport === 'RTU' || target.transport === 'ASCII') {
                    addLog('success', `Connected to ${target.comPort} via ${target.transport}`);
                } else {
                    addLog('success', `Connected to ${target.ip} (Local Port: ${res.clientPort})`);
                }
            } else {
                throw new Error(res.error || "Unknown Connection Error");
            }
        } catch (e: any) {
            const nowStr = new Date().toLocaleTimeString();
            setSessions(prev => prev.map(s => {
                if (s.id === id) {
                    const newRegs = s.config.registers.map(r => ({...r, status: 'Bad'}));
                    const newHistory = [...(s.dropHistory || []), nowStr].slice(-10); 
                    return { 
                        ...s, 
                        status: ConnectionStatus.ERROR, 
                        lastError: e.message,
                        lastDropTime: nowStr,
                        dropHistory: newHistory,
                        config: { ...s.config, registers: newRegs } 
                    };
                }
                return s;
            }));
            
            addLog('error', `Connection Failed: ${e.message}. Retry in 5s...`);
            
            const timer = setTimeout(() => {
                const current = sessionsRef.current.find(s => s.id === id);
                if (current && (current.status === ConnectionStatus.ERROR || current.status === ConnectionStatus.CONNECTING)) {
                    handleConnect(id, true);
                }
            }, 5000);
            reconnectTimers.current.set(id, timer);
        }
    }, [addLog]); 

    const handleDisconnect = async (id: string) => {
        clearReconnectTimer(id);
        
        await modbusService.disconnect(id);
        setSessions(prev => prev.map(s => {
            if (s.id === id) {
                const newRegs = s.config.registers.map(r => ({...r, status: 'Idle'}));
                return { 
                    ...s, 
                    status: ConnectionStatus.DISCONNECTED, 
                    clientPort: undefined, 
                    isScanning: false, 
                    connectTime: undefined, 
                    lastDropTime: undefined, 
                    config: { ...s.config, registers: newRegs } 
                };
            }
            return s;
        }));
        addLog('info', `Disconnected session ${id}`);
    };

    const handleUpdate = (id: string, updates: Partial<ModbusSessionInfo>) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    useEffect(() => {
        const removeListener = (window as any).electronAPI?.onModbusConnectionDrop((sessionId: string) => {
            const currentSessions = sessionsRef.current;
            const session = currentSessions.find(s => s.id === sessionId);
            
            if (session && session.status === ConnectionStatus.CONNECTED) {
                clearReconnectTimer(sessionId);
                const nowStr = new Date().toLocaleTimeString();

                setSessions(prev => prev.map(s => {
                    if (s.id === sessionId) {
                        const newRegs = s.config.registers.map(r => ({...r, status: 'Bad'}));
                        const newHistory = [...(s.dropHistory || []), nowStr].slice(-10);
                        return {
                            ...s,
                            status: ConnectionStatus.ERROR,
                            dropCount: s.dropCount + 1,
                            lastError: "Unexpected Connection Drop (Socket Closed)",
                            lastDropTime: nowStr,
                            dropHistory: newHistory,
                            config: { ...s.config, registers: newRegs }
                        };
                    }
                    return s;
                }));
                
                addLog('error', `Connection dropped for ${session.name}. Auto-reconnecting in 5s...`);
                
                const timer = setTimeout(() => {
                    const freshSession = sessionsRef.current.find(s => s.id === sessionId);
                    if (freshSession && (freshSession.status === ConnectionStatus.ERROR || freshSession.status === ConnectionStatus.CONNECTING)) {
                        handleConnect(sessionId, true);
                    }
                }, 5000);
                reconnectTimers.current.set(sessionId, timer);
            }
        });
        return () => { if (removeListener) removeListener(); };
    }, [addLog, handleConnect]);

    // ... (All other handlers from previous file remain identical here: handleNewProject, handleSaveProjectLocal, etc.) ...
    const handleNewProject = () => { 
        toast('确定要启动新工程吗？当前未保存的配置将丢失。', {
            action: {
                label: '确定',
                onClick: () => {
                    sessions.forEach(s => { 
                        if(s.status === ConnectionStatus.CONNECTED) modbusService.disconnect(s.id); 
                    }); 
                    setSessions([]); 
                    setActiveSessionId(null); 
                    createNewSessions(1); 
                    setDirty(false); 
                    setLogs([]); 
                    addLog('success', 'New Project Created');
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };
    const handleSaveProjectLocal = () => { const data = JSON.stringify({ version: '2.5.0', modbusSessions: sessions }, null, 2); const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `modbus_project_${Date.now()}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setDirty(false); addLog('success', 'Project Saved locally'); };
    const handleOpenProject = () => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.onchange = (e: any) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const project = JSON.parse(evt.target?.result as string); if (Array.isArray(project.modbusSessions)) { setSessions(project.modbusSessions); if (project.modbusSessions.length > 0) setActiveSessionId(project.modbusSessions[0].id); setDirty(false); setLogs([]); addLog('success', `Project loaded from ${file.name}`); } } catch (err) { toast.error("无效的 Modbus 工程文件格式"); addLog('error', 'Failed to load project file'); } }; reader.readAsText(file); }; input.click(); };
    const handleCopySessions = () => { if (selectedSessionIds.size === 0) return; const toCopy = sessions.filter(s => selectedSessionIds.has(s.id)); setClipboardSessions(toCopy); addLog('info', `Copied ${toCopy.length} sessions`); };
    const handlePasteSessions = () => {
        if (!clipboardSessions) return;
        const newSessions = clipboardSessions.map(tpl => {
            const registerIdMap: Record<string, string> = {};
            const newRegisters = tpl.config.registers.map(r => {
                const newRegId = Math.random().toString(36).substr(2, 9);
                registerIdMap[r.id] = newRegId;

                const isBoolean = ['01', '02', '05', '15'].includes(r.functionCode) || r.dataType === 'Boolean';
                const defaultVal = isBoolean ? false : 0;
                const initialVal = r.length > 1 ? Array(r.length).fill(defaultVal) : defaultVal;

                return {
                    ...r,
                    id: newRegId,
                    value: initialVal,
                    status: 'Idle',
                    lastUpdate: '-',
                    requestCount: 0,
                    errorCount: 0,
                    errorStats: {},
                    lastLatency: undefined,
                    lastErrorTime: undefined
                };
            });

            const newSchedulerTasks = (tpl.config.schedulerTasks || []).map(task => {
                const newTaskId = Math.random().toString(36).substr(2, 9);
                return {
                    ...task,
                    id: newTaskId,
                    sourceRegId: registerIdMap[task.sourceRegId] || task.sourceRegId,
                    targetRegId: registerIdMap[task.targetRegId] || task.targetRegId,
                    transferCount: 0,
                    errorCount: 0,
                    status: 'Idle',
                    lastValue: undefined,
                    lastRunTime: undefined
                };
            });

            const newSchedulerSourceIds = (tpl.config.schedulerSourceIds || []).map(id => registerIdMap[id] || id);
            const newSchedulerTargetIds = (tpl.config.schedulerTargetIds || []).map(id => registerIdMap[id] || id);

            const newSessionId = Math.random().toString(36).substr(2, 9);
            return {
                ...tpl,
                id: newSessionId,
                name: `${tpl.name} (Copy)`,
                status: ConnectionStatus.DISCONNECTED,
                clientPort: undefined,
                dropCount: 0,
                dropHistory: [],
                isScanning: false,
                connectTime: undefined,
                lastDropTime: undefined,
                lastError: undefined,
                _resetTxTick: undefined,
                _resetErrTick: undefined,
                config: {
                    ...tpl.config,
                    registers: newRegisters,
                    schedulerTasks: newSchedulerTasks,
                    schedulerSourceIds: newSchedulerSourceIds,
                    schedulerTargetIds: newSchedulerTargetIds,
                    logs: []
                }
            };
        });

        setSessions(prev => [...prev, ...newSessions]);
        addLog('success', `Pasted ${newSessions.length} sessions (Reset).`);
    };
    const deleteSelectedSessions = () => { sessions.forEach(s => { if (selectedSessionIds.has(s.id) && s.status === ConnectionStatus.CONNECTED) { modbusService.disconnect(s.id); } }); const remaining = sessions.filter(s => !selectedSessionIds.has(s.id)); setSessions(remaining); setSelectedSessionIds(new Set()); if (remaining.length > 0 && !remaining.find(s => s.id === activeSessionId)) setActiveSessionId(remaining[0].id); else if (remaining.length === 0) setActiveSessionId(null); };
    const handleSingleDelete = (e: React.MouseEvent | undefined, id: string) => { if (e) e.stopPropagation(); const session = sessions.find(s => s.id === id); if (session && session.status === ConnectionStatus.CONNECTED) { modbusService.disconnect(id); } const remaining = sessions.filter(s => s.id !== id); setSessions(remaining); if (selectedSessionIds.has(id)) { const newSel = new Set(selectedSessionIds); newSel.delete(id); setSelectedSessionIds(newSel); } if (activeSessionId === id) { setActiveSessionId(remaining.length > 0 ? remaining[0].id : null); } };
    const handleConnectAll = () => { const targets = sessions.filter(s => s.status !== ConnectionStatus.CONNECTED); if (targets.length === 0) return; addLog('info', `Initiating parallel connection for ${targets.length} sessions...`); targets.forEach(s => { handleConnect(s.id, true); }); };
    const handleDisconnectAll = async () => { const targets = sessions.filter(s => s.status === ConnectionStatus.CONNECTED); for (const s of targets) { handleDisconnect(s.id); } };
    const handleStartAllScans = () => { let count = 0; setSessions(prev => prev.map(s => { if (s.status === ConnectionStatus.CONNECTED && !s.isScanning) { count++; return { ...s, isScanning: true }; } return s; })); if (count > 0) addLog('success', `Started scanning for ${count} connected sessions.`); else addLog('warn', 'No connected idle sessions to start.'); };
    const handleStopAllScans = () => { setSessions(prev => prev.map(s => { const newRegs = s.config.registers.map(r => ({ ...r, status: 'Idle' })); return { ...s, isScanning: false, config: { ...s.config, registers: newRegs } }; })); addLog('info', 'Stopped scanning for all sessions.'); };
    const handleResetAllStats = () => { setSessions(prev => prev.map(s => { const newRegs = s.config.registers.map(r => ({ ...r, errorCount: 0, errorStats: {} })); return { ...s, _resetErrTick: (s._resetErrTick || 0) + 1, config: { ...s.config, registers: newRegs } }; })); addLog('info', 'Reset all error counters (globally).'); };
    const handleResetAllTx = () => { setSessions(prev => prev.map(s => { const newRegs = s.config.registers.map(r => ({ ...r, requestCount: 0 })); return { ...s, _resetTxTick: (s._resetTxTick || 0) + 1, config: { ...s.config, registers: newRegs } }; })); addLog('info', 'Reset all TX counters (globally).'); };
    const saveName = () => { if (editingSessionId && editName.trim()) { setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, name: editName.trim() } : s)); } setEditingSessionId(null); };
    const handleSessionClick = (e: React.MouseEvent, id: string, index: number) => { setActiveSessionId(id); const newSelected = new Set(selectedSessionIds); if (e.ctrlKey || e.metaKey) { if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setLastClickedSessionId(id); } else if (e.shiftKey && lastClickedSessionId) { const allIds = sessions.map(s => s.id); const startIdx = allIds.indexOf(lastClickedSessionId); if (startIdx !== -1) { const low = Math.min(startIdx, index); const high = Math.max(startIdx, index); newSelected.clear(); for (let i = low; i <= high; i++) newSelected.add(allIds[i]); } } else { newSelected.clear(); newSelected.add(id); setLastClickedSessionId(id); } setSelectedSessionIds(newSelected); };

    const mappedSessionsForStats = sessions.map(s => ({ ...s, endpointUrl: `${s.ip}:${s.port}` }));

    return (
        <div className="flex h-full bg-slate-100 font-sans text-slate-900 overflow-hidden select-none">
            {/* ... Modals ... */}
            <ModbusHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <ModbusSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <DropStatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} sessions={mappedSessionsForStats as any} onResetCounts={() => setSessions(prev => prev.map(s => ({...s, dropCount: 0, dropHistory: []})))} />

            {/* Sidebar (Same as before) */}
            <div className="w-80 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 z-30 shadow-xl h-full">
                <div className="h-14 flex items-center px-4 font-bold text-white border-b border-slate-800 gap-2 bg-slate-950 shadow-sm shrink-0">
                    <div className="p-1.5 bg-amber-600 rounded"><Zap className="w-4 h-4 text-white" /></div>
                    <span className="truncate">Modbus Master</span>
                    <button onClick={() => createNewSessions(1)} className="ml-auto p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-2 shrink-0">
                     <button onClick={handleNewProject} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FilePlus className="w-3.5 h-3.5 text-amber-400" /><span className="text-[10px] font-bold">新建</span></button>
                    <button onClick={handleOpenProject} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FolderOpen className="w-3.5 h-3.5 text-blue-400" /><span className="text-[10px] font-bold">打开</span></button>
                    <button onClick={handleSaveProjectLocal} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><Save className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] font-bold">保存</span></button>
                </div>
                <div className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-thumb-slate-700 px-2 space-y-1 min-h-0">
                     <div className="px-2 pb-2 text-[9px] font-black text-slate-500 uppercase tracking-widest flex justify-between items-center"><span>会话 (SESSIONS)</span><div className="flex gap-2">{selectedSessionIds.size > 0 && <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded-full">{selectedSessionIds.size} 已选</span>}<span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{sessions.length}</span></div></div>
                    {sessions.map((s, idx) => {
                        const hasErrors = s.config.registers.some(r => (r.errorCount || 0) > 0);
                        return (
                        <div key={s.id} onClick={(e) => handleSessionClick(e, s.id, idx)} className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${s.id === activeSessionId ? 'bg-slate-800 border-slate-700 shadow-md ring-1 ring-white/10' : 'border-transparent hover:bg-slate-800/50'} ${selectedSessionIds.has(s.id) && s.id !== activeSessionId ? 'ring-1 ring-amber-500/50 bg-amber-900/10' : ''}`}>
                            {s.id === activeSessionId && <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full"></div>}
                            <div className="flex items-center gap-3 truncate flex-1 min-w-0 pl-1"><div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.status === ConnectionStatus.CONNECTED ? (s.isScanning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-emerald-600') : s.status === ConnectionStatus.CONNECTING ? 'bg-amber-400 animate-pulse' : s.status === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-600'}`}></div><div className="flex flex-col truncate w-full">{editingSessionId === s.id ? (<input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} onClick={e => e.stopPropagation()} className="w-full bg-slate-950 text-white text-xs px-1.5 py-0.5 rounded border border-amber-500 outline-none" />) : (<><span className={`text-sm font-medium transition-colors truncate ${s.id === activeSessionId ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{s.name}</span><div className="flex items-center justify-between mt-0.5"><span className={`text-[9px] uppercase font-black tracking-tighter ${s.id === activeSessionId ? 'text-slate-300' : 'text-slate-600'}`}>{s.transport === 'RTU' || s.transport === 'ASCII' ? (s.comPort || 'No Port') : `${s.ip}:${s.port}`}</span><div className="flex items-center gap-1">{s.isScanning && (<span className="text-[9px] text-emerald-400 font-bold bg-emerald-900/30 px-1 rounded flex items-center gap-0.5"><Activity className="w-2.5 h-2.5" /></span>)}{s.dropCount > 0 && (<span className="text-[9px] text-amber-500 font-bold bg-amber-900/20 px-1 rounded animate-pulse flex items-center gap-0.5"><WifiOff className="w-2.5 h-2.5" /> {s.dropCount}</span>)}{hasErrors && (<span className="text-[9px] text-red-400 font-bold bg-red-900/30 px-1 rounded flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Err</span>)}</div></div><div className="flex items-center justify-between text-[8px] font-mono opacity-80 mt-0.5"><span className={`${s.id === activeSessionId ? 'text-slate-400' : 'text-slate-500'}`}>ID: {s.unitId}</span>{s.status === ConnectionStatus.CONNECTED && s.clientPort && (<span className="text-emerald-500">Src: {s.clientPort}</span>)}</div></>)}</div></div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2"><button onClick={(e) => { e.stopPropagation(); s.status === ConnectionStatus.CONNECTED ? handleDisconnect(s.id) : handleConnect(s.id, true); }} className={`p-1.5 rounded ${s.status === ConnectionStatus.CONNECTED ? 'text-emerald-500 hover:bg-emerald-900/20' : 'text-slate-500 hover:text-white'}`}><Power className="w-3.5 h-3.5" /></button><button onClick={(e) => { e.stopPropagation(); setEditingSessionId(s.id); setEditName(s.name); }} className="p-1.5 text-slate-500 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={(e) => handleSingleDelete(e, s.id)} className="p-1.5 text-slate-500 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></div>
                        </div>
                    )})}
                </div>
                <div className="p-3 border-t border-slate-800 bg-slate-950 gap-2 flex flex-col shrink-0"><div className="grid grid-cols-2 gap-2 mb-1"><button onClick={handleConnectAll} className="flex items-center justify-center gap-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-500 border border-emerald-900/50 py-1.5 rounded text-xs font-bold transition-all"><Play className="w-3 h-3 fill-current" /> 全部连接</button><button onClick={handleDisconnectAll} className="flex items-center justify-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 py-1.5 rounded text-xs font-bold transition-all"><Square className="w-3 h-3 fill-current" /> 全部停止</button></div><div className="grid grid-cols-2 gap-2 mb-1"><button onClick={handleStartAllScans} className="flex items-center justify-center gap-1.5 bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-400 border border-indigo-900/50 py-1.5 rounded text-xs font-bold transition-all"><Activity className="w-3 h-3" /> 全部运行</button><button onClick={handleStopAllScans} className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 py-1.5 rounded text-xs font-bold transition-all"><Pause className="w-3 h-3 fill-current" /> 全部暂停</button></div><div className="grid grid-cols-2 gap-2 mb-1"><button onClick={handleResetAllStats} className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 py-1.5 rounded text-xs font-bold transition-all"><RotateCcw className="w-3 h-3" /> 复位错误 (Err)</button><button onClick={handleResetAllTx} className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 py-1.5 rounded text-xs font-bold transition-all"><Hash className="w-3 h-3" /> 复位计数 (Tx)</button></div><div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800"><div className="flex-1 flex items-center gap-1 px-1"><span className="text-[10px] text-slate-500 font-bold uppercase">数量</span><input type="number" min="1" max="20" value={createCount} onChange={e => setCreateCount(Number(e.target.value))} className="w-10 bg-slate-800 text-slate-300 text-xs text-center border border-slate-700 rounded h-6 font-mono" /></div><button onClick={() => createNewSessions(createCount)} className="p-1.5 text-amber-500 hover:bg-slate-800 rounded" title="批量新建"><Plus className="w-4 h-4" /></button><button onClick={handleCopySessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="复制会话"><Copy className="w-4 h-4" /></button><button onClick={handlePasteSessions} disabled={!clipboardSessions} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="粘贴会话"><ClipboardPaste className="w-4 h-4" /></button><button onClick={deleteSelectedSessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-red-500 hover:bg-slate-800 rounded disabled:opacity-20" title="删除选中"><Trash2 className="w-4 h-4" /></button></div><div className="flex gap-2 mt-1"><button onClick={() => setIsHelpOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="帮助文档"><HelpCircle className="w-4 h-4" /></button><button onClick={() => setIsSettingsOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-amber-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="全局设置"><Settings className="w-4 h-4" /></button><button onClick={() => setIsStatsOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="统计分析"><BarChart3 className="w-4 h-4" /></button></div></div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {!isElectron && (
                    <div className="bg-amber-100 border-b border-amber-200 text-amber-800 text-xs px-4 py-1 flex items-center justify-center font-bold">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        WEB SIMULATION MODE - No physical TCP connection. (Web 模拟模式 - 无真实 TCP 连接)
                    </div>
                )}

                {sessions.map(session => (
                    <ModbusWorkspace 
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSessionId}
                        localIps={localIps}
                        comPorts={comPorts}
                        onUpdate={handleUpdate}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        addLog={addLog}
                    />
                ))}

                {sessions.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-6">
                        <div className="p-8 bg-white rounded-full border border-slate-200 shadow-xl"><Server className="w-20 h-20 opacity-5" /></div>
                        <p className="font-black text-lg text-slate-700 uppercase tracking-widest">无活跃会话</p>
                        <button onClick={() => createNewSessions(1)} className="px-8 py-3 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all flex items-center gap-2"><Plus className="w-4 h-4" /> 初始化新设备</button>
                    </div>
                )}
                
                {/* System Log Panel (Shared across all workspaces) */}
                <SystemLogPanel logs={logs} onClear={() => setLogs([])} />
            </div>
        </div>
    );
};

export default ModbusAppContent;
