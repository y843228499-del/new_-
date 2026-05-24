
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Network, 
  Plus, 
  X, 
  Edit2, 
  Power, 
  Play, 
  Square, 
  Copy, 
  ClipboardPaste, 
  Trash2, 
  LayoutDashboard,
  Database,
  Terminal,
  RefreshCw,
  Zap,
  Boxes,
  FolderOpen,
  Save,
  FilePlus,
  HelpCircle,
  Settings,
  BarChart3,
  Loader2,
  Laptop,
  Check,
  WifiOff,
  ChevronDown,
  FileCode,
  AlertOctagon
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { eipService } from './services/eipService';
import { ConnectionStatus, EipSessionInfo, LogEntry, InoAlignType, ProjectFile, EipTag, CipDataType } from '../types';
import { EipHelpModal } from './components/EipHelpModal';
import { EipSettingsModal } from './components/EipSettingsModal';
import { EipErrorConsole } from './components/EipErrorConsole';
import DropStatsModal from '../components/DropStatsModal';
import SystemLogPanel from '../components/SystemLogPanel';
import ProjectConfirmModal from '../components/ProjectConfirmModal';
import { useLanguage } from '../contexts/LanguageContext';
import { useProject } from '../contexts/ProjectContext';

// --- 引入拆分后的组件 ---
import { EipDashboard } from './components/EipDashboard';
import { EipTagManager } from './components/EipTagManager';
import { EipCipConsole } from './components/EipCipConsole';
import { EipXmlBrowser } from './components/EipXmlBrowser';
import { EipChaosPanel } from './components/EipChaosPanel';

// --- EIP 子工作区组件 (Workspace) ---
const EipWorkspace: React.FC<{ 
    session: EipSessionInfo, 
    isActive: boolean, // NEW: Control visibility
    onUpdate: (updates: Partial<EipSessionInfo>) => void,
    onConnect: (id: string) => void,
    onDisconnect: (id: string) => void,
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
    globalBindIp: string; // From Sidebar
    onDrop: () => void;
}> = ({ session, isActive, onUpdate, onConnect, onDisconnect, addLog, globalBindIp, onDrop }) => {
    const [viewMode, setViewMode] = useState<'DASH' | 'TAGS' | 'CIP' | 'XML' | 'CHAOS'>('DASH');
    
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    const isConnecting = session.status === ConnectionStatus.CONNECTING;

    // Sync global bind IP to session if not set locally
    useEffect(() => {
        if (globalBindIp && !session.localBindIp) {
            onUpdate({ localBindIp: globalBindIp });
        }
    }, [globalBindIp]);

    const handleResetCache = async () => {
        if ((window as any).electronAPI?.inovanceResetCache) {
            await (window as any).electronAPI.inovanceResetCache();
            addLog('success', 'Tag Cache Cleared (InoCache Reset)');
        }
    };

    // --- XML Import Handler ---
    const handleXmlImport = (tags: Partial<EipTag>[]) => {
        // Hydrate Partial Tags
        const newTags: EipTag[] = tags.map(t => ({
            id: Math.random().toString(36).substr(2, 9),
            tagName: t.tagName || 'Unknown',
            dataType: t.dataType !== undefined ? t.dataType : CipDataType.DINT,
            elementCount: t.elementCount || 1,
            arraySize: 0,
            value: t.value || 0,
            status: 'Idle',
            lastUpdate: '-',
            requestCount: 0
        }));

        // Add to active group or default group
        const targetGroupId = session.config.tagGroups[0]?.id;
        
        if (targetGroupId) {
            const newGroups = session.config.tagGroups.map(g => 
                g.id === targetGroupId ? { ...g, nodes: [...g.nodes, ...newTags] } : g
            );
            onUpdate({ config: { ...session.config, tagGroups: newGroups } });
            addLog('success', `已从 XML 导入 ${newTags.length} 个标签到 "${session.config.tagGroups[0].name}"。`);
            // Switch to TAGS view to see result
            setViewMode('TAGS');
        } else {
            addLog('error', '无法导入：未找到标签分组。');
        }
    };

    // UI Logic for Bind IP display
    const bindIpDisplay = session.localBindIp || globalBindIp || '0.0.0.0';
    const isAutoBind = bindIpDisplay === '0.0.0.0';

    return (
        <div className={`absolute inset-0 flex flex-col bg-slate-100 overflow-hidden transition-opacity duration-200 ${isActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none'}`}>
            {/* 连接工具栏 */}
            <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm z-10">
                <div className="flex flex-wrap items-end gap-4">
                    
                    {/* 本地绑定 IP (Inovance Specific) - Session Override */}
                    <div className="w-48">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Laptop className="w-3 h-3" /> 本机网卡 (Override)
                        </label>
                        <div className={`w-full px-3 py-2 border rounded-lg text-sm font-mono flex items-center h-[38px] cursor-not-allowed ${isAutoBind ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white text-slate-600 border-slate-300'}`} title="由侧边栏全局设置控制 (Controlled by Sidebar)">
                            {isAutoBind ? 'Auto (Default)' : bindIpDisplay}
                        </div>
                    </div>

                    <div className="w-64">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PLC 地址 (Target IP)</label>
                        <div className="relative">
                            <Network className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input 
                                value={session.address} 
                                onChange={e => onUpdate({address: e.target.value})} 
                                disabled={isConnected || isConnecting} 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-cyan-500 outline-none transition-all disabled:opacity-60" 
                                placeholder="192.168.1.88" 
                            />
                        </div>
                    </div>

                    {/* Alignment (Inovance Specific) */}
                    <div className="w-32">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">对齐方式 (Align)</label>
                        <select
                            value={session.alignment ?? InoAlignType.DEFAULT}
                            onChange={e => onUpdate({ alignment: Number(e.target.value) })}
                            disabled={isConnected || isConnecting}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none disabled:opacity-60"
                        >
                            <option value={InoAlignType.DEFAULT}>Standard (0)</option>
                            <option value={InoAlignType.INOPROSHOP}>InoProShop (1)</option>
                        </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => isConnected ? onDisconnect(session.id) : onConnect(session.id)} 
                            disabled={isConnecting} 
                            className={`px-6 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 min-w-[140px] justify-center h-[38px] ${isConnected ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50' : 'bg-cyan-600 text-white hover:bg-cyan-700 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed'}`}
                        >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : isConnected ? <Power className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                            {isConnecting ? "连接中..." : isConnected ? "断开连接" : "建立连接"}
                        </button>

                        <button 
                            onClick={handleResetCache}
                            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:text-cyan-600 hover:border-cyan-400 transition-colors h-[38px] flex items-center gap-2 font-bold text-xs shadow-sm"
                            title="Reset Tag Info Cache (Required after PLC Download)"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>清理缓存</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 导航选项卡 */}
            <div className="px-6 pt-4 bg-slate-50 border-b border-slate-200 flex gap-1 shrink-0 overflow-x-auto scrollbar-none">
                {[
                    {id: 'DASH', name: '状态概览', icon: LayoutDashboard, color: 'text-indigo-600'},
                    {id: 'TAGS', name: '标签读写 (ReadTag/WriteTag)', icon: Database, color: 'text-cyan-600'},
                    {id: 'XML', name: 'XML 导入 (Import)', icon: FileCode, color: 'text-amber-600'},
                    {id: 'CHAOS', name: '异常测试 (Chaos)', icon: AlertOctagon, color: 'text-red-600'},
                    {id: 'CIP', name: 'CIP 控制台', icon: Terminal, color: 'text-purple-600'},
                ].map(tab => (
                    <button key={tab.id} onClick={() => setViewMode(tab.id as any)} className={`px-4 py-2 text-xs font-bold rounded-t-lg border-x border-t transition-all flex items-center gap-2 relative top-[1px] ${viewMode === tab.id ? `bg-white border-slate-200 ${tab.color} z-10 shadow-sm` : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'}`}>
                        <tab.icon className="w-4 h-4" /> {tab.name}
                    </button>
                ))}
            </div>

            {/* 视图内容 - 使用 display: none 保持组件存活 */}
            <div className="flex-1 bg-white relative overflow-hidden shadow-inner">
                <div style={{ display: viewMode === 'DASH' ? 'block' : 'none', height: '100%' }}>
                    <EipDashboard session={session} />
                </div>
                <div style={{ display: viewMode === 'TAGS' ? 'block' : 'none', height: '100%' }}>
                    <EipTagManager session={session} onUpdate={onUpdate} addLog={addLog} onDrop={onDrop} />
                </div>
                <div style={{ display: viewMode === 'XML' ? 'block' : 'none', height: '100%' }}>
                    <EipXmlBrowser onImport={handleXmlImport} />
                </div>
                <div style={{ display: viewMode === 'CHAOS' ? 'block' : 'none', height: '100%' }}>
                    <EipChaosPanel session={session} addLog={addLog} />
                </div>
                <div style={{ display: viewMode === 'CIP' ? 'block' : 'none', height: '100%' }}>
                    <EipCipConsole session={session} />
                </div>
            </div>
        </div>
    );
};

const EipAppContent: React.FC = () => {
    // ... existing hook logic ...
    const { t } = useLanguage();
    const { registerEipGetter, setDirty } = useProject();
    const [sessions, setSessions] = useState<EipSessionInfo[]>([]);
    
    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

    // --- Global Settings ---
    const [localIps, setLocalIps] = useState<string[]>([]);
    const [selectedBindIp, setSelectedBindIp] = useState<string>('0.0.0.0');
    const [isStackRunning, setIsStackRunning] = useState(false);
    const [isRefreshingIps, setIsRefreshingIps] = useState(false);
    
    // Custom Dropdown State
    const [isIpDropdownOpen, setIsIpDropdownOpen] = useState(false);
    const ipDropdownRef = useRef<HTMLDivElement>(null);

    // --- Logging State ---
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((type: 'info' | 'error' | 'success' | 'warn', msg: string) => {
        const newLog: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            level: type,
            message: msg,
            sessionName: 'EIP-Client'
        };
        setLogs(prev => [...prev, newLog].slice(-500));
        if (type === 'error') console.error(`[EIP] ${msg}`); 
        else if (type === 'warn') console.warn(`[EIP] ${msg}`);
        else console.log(`[EIP] ${msg}`);
    }, []);

    // --- DEBUG LISTENER FOR F12 ---
    useEffect(() => {
        if ((window as any).electronAPI?.onEipDebug) {
            const remove = (window as any).electronAPI.onEipDebug((msg: any) => {
                console.log(`%c[EIP DLL INPUT] ${msg.api}`, 'color: #0ea5e9; font-weight: bold;', msg);
            });
            return () => remove();
        }
    }, []);

    // Helper: Refresh IPs
    const refreshLocalIps = useCallback(async () => {
        if ((window as any).electronAPI?.inovanceGetLocalIps) {
            setIsRefreshingIps(true);
            try {
                const ips = await (window as any).electronAPI.inovanceGetLocalIps();
                setLocalIps(ips);
                if (selectedBindIp !== '0.0.0.0' && !ips.includes(selectedBindIp)) {
                }
                addLog('info', `Network adapters refreshed. Found: ${ips.length}`);
            } catch (e: any) {
                addLog('error', `Failed to refresh IPs: ${e.message}`);
            } finally {
                setTimeout(() => setIsRefreshingIps(false), 500); 
            }
        }
    }, [selectedBindIp, addLog]);

    // Get Local IPs on Mount
    useEffect(() => {
        refreshLocalIps();
    }, []);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ipDropdownRef.current && !ipDropdownRef.current.contains(event.target as Node)) {
                setIsIpDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- Listen for Connection Drops from Backend ---
    useEffect(() => {
        if ((window as any).electronAPI?.onEipConnectionDrop) {
            const removeListener = (window as any).electronAPI.onEipConnectionDrop((sessionId: string) => {
                setSessions(prev => prev.map(s => {
                    if (s.id === sessionId) {
                        return {
                            ...s,
                            status: ConnectionStatus.ERROR,
                            dropCount: s.dropCount + 1,
                            lastError: "Connection Lost (Watchdog Detected)",
                            inoState: 4 
                        };
                    }
                    return s;
                }));
                addLog('error', `Connection dropped for session ${sessionId} (Watchdog Detected)`);
            });
            return () => removeListener();
        }
    }, [addLog]);

    // --- NEW: Listen for State Updates ---
    useEffect(() => {
        if ((window as any).electronAPI?.onEipSessionState) {
            const removeListener = (window as any).electronAPI.onEipSessionState((payload: { sessionId: string, state: number }) => {
                const { sessionId, state } = payload;
                
                setSessions(prev => prev.map(s => {
                    if (s.id === sessionId) {
                        // 1. Recovery: If state is 3 (Connected) but UI shows otherwise -> Restore to CONNECTED
                        if (state === 3) {
                            if (s.status !== ConnectionStatus.CONNECTED) {
                                return { 
                                    ...s, 
                                    status: ConnectionStatus.CONNECTED, 
                                    inoState: state,
                                    lastError: undefined 
                                };
                            }
                            // Just update inoState if already connected
                            return { ...s, inoState: state };
                        }
                        
                        // 2. Drop Detection: If state is 1 (Configuring), 4 (Timeout), or 0 (NonExistent)
                        // AND UI thinks it is CONNECTED -> Drop it.
                        if (s.status === ConnectionStatus.CONNECTED && (state === 1 || state === 4 || state === 0)) {
                             // Determine error message based on state
                             let errorMsg = "Unknown Error";
                             if (state === 1) errorMsg = "Network Error (Cable Unplugged/Configuring)";
                             else if (state === 4) errorMsg = "Connection Timed Out";
                             else if (state === 0) errorMsg = "Connection Lost (NonExistent)";

                             return { 
                                 ...s, 
                                 status: ConnectionStatus.ERROR, 
                                 inoState: state,
                                 dropCount: s.dropCount + 1, // CORRECT LOGIC: Only increment on transition from Connected
                                 lastError: errorMsg
                             };
                        }
                        
                        // Just update state if already in Error/Disconnected
                        return { ...s, inoState: state }; 
                    }
                    return s;
                }));
            });
            return () => removeListener();
        }
    }, []);

    useEffect(() => {
        registerEipGetter(() => sessions);
    }, [sessions, registerEipGetter]);

    // Dirty Tracking
    const initialLoadRef = useRef(true);
    // Removed automatic dirty tracking for 'sessions' to avoid marking dirty on connection state changes.
    // Instead, we manually call setDirty(true) in configuration update handlers.

    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
    
    const [lastClickedSessionId, setLastClickedSessionId] = useState<string | null>(null);
    const [clipboardSessions, setClipboardSessions] = useState<EipSessionInfo[] | null>(null);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const [createCount, setCreateCount] = useState(1);
    
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isStatsOpen, setIsStatsOpen] = useState(false);

    const [isProjectConfirmOpen, setIsProjectConfirmOpen] = useState(false);
    const [pendingProjectAction, setPendingProjectAction] = useState<'NEW' | 'OPEN' | null>(null);
    const { isDirty } = useProject();

    // ... (Existing handlers: handleNewProject, handleOpenProject, handleSaveProjectLocal, createNewSessions, handleToggleStack, handleConnect, handleDisconnect, etc.) ...
    
    const performNewProject = () => {
        setSessions([]);
        setActiveSessionId(null);
        createNewSessions(1, true); // Passed isReset flag
        setDirty(false);
        setLogs([]);
        addLog('success', 'Project Reset.');
    };

    const handleNewProjectRequest = () => {
        if (isDirty()) {
            setPendingProjectAction('NEW');
            setIsProjectConfirmOpen(true);
        } else {
            performNewProject();
        }
    };

    const performOpenProject = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const project: ProjectFile = JSON.parse(evt.target?.result as string);
                    if (Array.isArray(project.eipSessions)) {
                        setSessions(project.eipSessions);
                        if (project.eipSessions.length > 0) setActiveSessionId(project.eipSessions[0].id);
                        setDirty(false);
                        setLogs([]);
                        addLog('success', `Project loaded from ${file.name}`);
                    }
                } catch (err) {
                    toast.error("无效的工程文件格式");
                    addLog('error', 'Failed to load project file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleOpenProjectRequest = () => {
        if (isDirty()) {
            setPendingProjectAction('OPEN');
            setIsProjectConfirmOpen(true);
        } else {
            performOpenProject();
        }
    };

    const handleProjectConfirmChoice = (choice: 'YES' | 'NO' | 'CANCEL') => {
        setIsProjectConfirmOpen(false);
        if (choice === 'CANCEL') return;
        
        const proceed = () => {
            if (pendingProjectAction === 'NEW') performNewProject();
            else if (pendingProjectAction === 'OPEN') performOpenProject();
            setPendingProjectAction(null);
        };

        if (choice === 'YES') {
            const success = handleSaveProjectLocal();
            if (success !== false) proceed();
        } else {
            proceed();
        }
    };

    const handleSaveProjectLocal = () => {
        const data = JSON.stringify({ 
            version: '2.5.0', 
            timestamp: new Date().toISOString(),
            eipSessions: sessions.map(s => ({
                ...s,
                status: ConnectionStatus.DISCONNECTED,
                dropCount: 0,
                instanceId: undefined,
                inoState: 0
            })) 
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eip_project_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDirty(false);
        addLog('success', 'Project Saved locally');
        return true;
    };

    const createNewSessions = useCallback((count: number, isReset: boolean = false) => {
        const newSessions: EipSessionInfo[] = [];
        for (let i = 0; i < count; i++) {
            const idStr = Math.random().toString(36).substr(2, 9);
            const nameIdx = isReset ? (i + 1) : (sessions.length + 1 + i);
            newSessions.push({
                id: idStr,
                name: `Inovance PLC ${nameIdx}`, 
                address: '192.168.1.88', 
                slot: 0,
                connectionSize: 502,
                status: ConnectionStatus.DISCONNECTED, dropCount: 0,
                alignment: InoAlignType.DEFAULT,
                localBindIp: selectedBindIp, 
                config: { 
                    tagGroups: [{ id: Math.random().toString(36).substr(2, 9), name: 'Tag Group 1', nodes: [] }], 
                    chassis: [], logs: [] 
                }
            });
        }
        setSessions(prev => [...prev, ...newSessions]);
        if (newSessions.length > 0) {
            setActiveSessionId(newSessions[0].id);
            setSelectedSessionIds(new Set([newSessions[0].id]));
        }
        if (!isReset) setDirty(true);
    }, [sessions, selectedBindIp, setDirty]);

    const handleToggleStack = async () => {
        if (!isStackRunning) {
            const success = await eipService.startStack(selectedBindIp);
            if (success) {
                setIsStackRunning(true);
                addLog('success', `EIP Stack Started on ${selectedBindIp || 'Auto'}`);
            } else {
                addLog('error', 'Failed to start EIP Stack');
            }
        } else {
            await eipService.stopStack();
            setIsStackRunning(false);
            addLog('info', 'EIP Stack Stopped');
        }
    };

    const handleConnect = async (id: string) => {
        const target = sessions.find(s => s.id === id);
        if (!target) return;
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status: ConnectionStatus.CONNECTING, lastError: undefined } : s));
        addLog('info', `Connecting to ${target.address}...`);
        try {
            const bindIp = target.localBindIp || selectedBindIp;
            if (!isStackRunning) setIsStackRunning(true);
            const res = await eipService.connect(id, target.address, target.slot, target.connectionSize, bindIp); 
            setSessions(prev => prev.map(s => s.id === id ? { ...s, status: ConnectionStatus.CONNECTED, instanceId: res.instanceId, inoState: 3 } : s));
            addLog('success', `Session Connected (Real ID: ${res.instanceId})`);
        } catch (e: any) {
            setSessions(prev => prev.map(s => s.id === id ? { ...s, status: ConnectionStatus.ERROR, lastError: e.message } : s));
            addLog('error', `Connection Failed: ${e.message}`);
        }
    };

    const handleDisconnect = async (id: string) => {
        await eipService.disconnect(id);
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status: ConnectionStatus.DISCONNECTED, instanceId: undefined, inoState: 0 } : s));
        addLog('info', `Session Disconnected`);
    };

    const handleSessionDrop = (sessionId: string) => {
        // NOTE: This handler is likely redundant now that onEipSessionState handles drop logic robustly.
        // We keep it as a fallback for explicit drop events from backend.
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId && s.status === ConnectionStatus.CONNECTED) {
                return { 
                    ...s, 
                    status: ConnectionStatus.ERROR, 
                    dropCount: s.dropCount + 1,
                    lastError: "Explicit Drop Event"
                };
            }
            return s;
        }));
        addLog('error', `Connection Drop Detected for Session ${sessionId}`);
    };

    const handleConnectAll = () => {
        const targets = sessions.filter(s => s.status !== ConnectionStatus.CONNECTED);
        addLog('info', `Initiating batch connection for ${targets.length} sessions...`);
        targets.forEach(s => handleConnect(s.id));
    };

    const handleDisconnectAll = () => {
        const targets = sessions.filter(s => s.status === ConnectionStatus.CONNECTED);
        targets.forEach(s => handleDisconnect(s.id));
    };

    const handleUpdateSession = (sessionId: string, updates: Partial<EipSessionInfo>) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s));
        
        // Manual dirty tracking: Only configuration changes make the project dirty.
        // If updates contains address, slot, connectionSize, alignment, or config, set dirty.
        const isConfigChange = updates.address !== undefined || 
                               updates.slot !== undefined || 
                               updates.connectionSize !== undefined || 
                               updates.alignment !== undefined || 
                               updates.config !== undefined ||
                               updates.name !== undefined;
        
        if (isConfigChange) {
            setDirty(true);
        }
    };

    const handleDeleteSelectedSessions = () => {
        sessions.forEach(s => {
            if (selectedSessionIds.has(s.id) && s.status === ConnectionStatus.CONNECTED) {
                eipService.disconnect(s.id);
            }
        });
        const remaining = sessions.filter(s => !selectedSessionIds.has(s.id));
        setSessions(remaining);
        setSelectedSessionIds(new Set());
        if (remaining.length > 0) setActiveSessionId(remaining[0].id);
        else setActiveSessionId(null);
        setDirty(true);
    };

    const handleSingleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const s = sessions.find(sess => sess.id === id);
        if (s && s.status === ConnectionStatus.CONNECTED) {
            await eipService.disconnect(id);
        }
        setSessions(prev => prev.filter(sess => sess.id !== id));
        if (activeSessionId === id) setActiveSessionId(null);
        setSelectedSessionIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setDirty(true);
    };

    const handleSessionClick = (e: React.MouseEvent, id: string, index: number) => {
        setActiveSessionId(id);
        const newSelected = new Set(selectedSessionIds);
        if (e.ctrlKey || e.metaKey) {
            if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
            setLastClickedSessionId(id);
        } else if (e.shiftKey && lastClickedSessionId) {
            const allIds = sessions.map(s => s.id);
            const startIdx = allIds.indexOf(lastClickedSessionId);
            if (startIdx !== -1) {
                const low = Math.min(startIdx, index);
                const high = Math.max(startIdx, index);
                newSelected.clear();
                for (let i = low; i <= high; i++) newSelected.add(allIds[i]);
            }
        } else {
            newSelected.clear();
            newSelected.add(id);
            setLastClickedSessionId(id);
        }
        setSelectedSessionIds(newSelected);
    };

    const handleCopySessions = () => {
        if (selectedSessionIds.size === 0) return;
        const toCopy = sessions.filter(s => selectedSessionIds.has(s.id));
        setClipboardSessions(toCopy);
        addLog('info', `Copied ${toCopy.length} sessions`);
    };

    const handlePasteSessions = () => {
        if (!clipboardSessions) return;
        const newSessions = clipboardSessions.map((tpl, i) => {
             const idStr = Math.random().toString(36).substr(2, 9);
             return {
                ...tpl,
                id: idStr,
                name: `${tpl.name} (Copy)`,
                status: ConnectionStatus.DISCONNECTED,
                dropCount: 0,
                instanceId: undefined
             };
        });
        setSessions(prev => [...prev, ...newSessions]);
        addLog('success', `Pasted ${newSessions.length} sessions`);
        setDirty(true);
    };

    const saveName = () => {
        if (editingSessionId && editName.trim()) {
            setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, name: editName.trim() } : s));
        }
        setEditingSessionId(null);
    };

    useEffect(() => { if (sessions.length === 0) createNewSessions(1); }, []);

    return (
        <div className="flex h-full bg-slate-100 font-sans text-slate-900 overflow-hidden select-none">
            <EipHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <EipSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <DropStatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} sessions={sessions as any} onResetCounts={() => setSessions(prev => prev.map(s => ({...s, dropCount: 0})))} />
            
            {/* The New Error Console Component */}
            <EipErrorConsole />
            <ProjectConfirmModal isOpen={isProjectConfirmOpen} onChoice={handleProjectConfirmChoice} />

            {/* 侧边栏 */}
            <div className="w-80 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 z-30 shadow-xl">
                {/* Header */}
                <div className="h-14 flex items-center px-4 font-bold text-white border-b border-slate-800 gap-2 bg-slate-950 shadow-sm shrink-0">
                    <div className="p-1.5 bg-cyan-600 rounded"><Network className="w-4 h-4 text-white" /></div>
                    <span className="truncate">InoDriver Studio</span>
                    <button onClick={() => createNewSessions(1)} className="ml-auto p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><Plus className="w-4 h-4" /></button>
                </div>

                {/* Project Toolbar */}
                <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-2 shrink-0">
                     <button onClick={handleNewProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FilePlus className="w-3.5 h-3.5 text-amber-400" /><span className="text-[10px] font-bold">新建</span></button>
                    <button onClick={handleOpenProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FolderOpen className="w-3.5 h-3.5 text-blue-400" /><span className="text-[10px] font-bold">打开</span></button>
                    <button onClick={handleSaveProjectLocal} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><Save className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] font-bold">保存</span></button>
                </div>

                {/* Global Network Settings in Sidebar */}
                <div className="px-3 py-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Laptop className="w-3 h-3" /> 本机协议栈绑定 (Global Bind)
                    </label>
                    <div className="flex gap-1 mb-2 items-center" ref={ipDropdownRef}>
                        <div className="flex-1 relative">
                            {/* Custom Dropdown Input */}
                            <div className="relative flex items-center">
                                <input 
                                    value={selectedBindIp} 
                                    onChange={(e) => setSelectedBindIp(e.target.value)}
                                    onClick={() => setIsIpDropdownOpen(true)}
                                    className="w-full bg-slate-800 border border-slate-700 text-cyan-400 text-xs rounded-l px-2 py-1.5 pr-6 outline-none focus:border-cyan-500 font-mono placeholder-slate-600"
                                    placeholder="0.0.0.0"
                                />
                                <div 
                                    className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-slate-500 hover:text-cyan-400"
                                    onClick={() => setIsIpDropdownOpen(!isIpDropdownOpen)}
                                >
                                    <ChevronDown className="w-3 h-3" />
                                </div>
                            </div>
                            
                            {/* Dropdown List */}
                            {isIpDropdownOpen && (
                                <div className="absolute top-full left-0 w-full bg-slate-800 border border-slate-600 rounded-b-lg shadow-xl z-50 max-h-48 overflow-y-auto mt-1">
                                    <div 
                                        className={`px-2 py-1.5 text-xs cursor-pointer border-b border-slate-700 ${selectedBindIp === '0.0.0.0' ? 'bg-cyan-900/30 text-cyan-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                        onClick={() => { setSelectedBindIp('0.0.0.0'); setIsIpDropdownOpen(false); }}
                                    >
                                        0.0.0.0 (Auto)
                                    </div>
                                    {localIps.map(ip => (
                                        <div 
                                            key={ip}
                                            className={`px-2 py-1.5 text-xs font-mono cursor-pointer ${selectedBindIp === ip ? 'bg-cyan-900/30 text-cyan-400' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                                            onClick={() => { setSelectedBindIp(ip); setIsIpDropdownOpen(false); }}
                                        >
                                            {ip}
                                        </div>
                                    ))}
                                    {localIps.length === 0 && (
                                        <div className="px-2 py-2 text-[10px] text-slate-500 italic text-center">
                                            No adapters found
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {/* Refresh Button */}
                        <button 
                            onClick={refreshLocalIps}
                            className="px-2 py-1.5 bg-slate-800 border-y border-r border-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                            title="Refresh Network Adapters"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingIps ? 'animate-spin' : ''}`} />
                        </button>

                        <button 
                            onClick={handleToggleStack}
                            className={`px-2 py-1 rounded-r text-[10px] font-bold border transition-colors ${isStackRunning ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                            title={isStackRunning ? "Stop Protocol Stack" : "Start Protocol Stack"}
                        >
                            {isStackRunning ? "ON" : "OFF"}
                        </button>
                    </div>
                    <div className="mt-1.5 text-[9px] text-slate-600 flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isStackRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
                        Stack Status: {isStackRunning ? 'Running' : 'Stopped'}
                    </div>
                </div>

                {/* Sidebar List */}
                <div className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-thumb-slate-700 px-2 space-y-1 min-h-0">
                     <div className="px-2 pb-2 text-[9px] font-black text-slate-500 uppercase tracking-widest flex justify-between items-center"><span>会话列表 (SESSIONS)</span><div className="flex gap-2">{selectedSessionIds.size > 0 && <span className="bg-cyan-900/30 text-cyan-400 px-1.5 py-0.5 rounded-full">{selectedSessionIds.size} 已选</span>}<span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{sessions.length}</span></div></div>
                     {sessions.map((s, idx) => (
                        <div key={s.id} onClick={(e) => handleSessionClick(e, s.id, idx)} className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${s.id === activeSessionId ? 'bg-slate-800 border-slate-700 shadow-md ring-1 ring-white/10' : 'border-transparent hover:bg-slate-800/50'} ${selectedSessionIds.has(s.id) && s.id !== activeSessionId ? 'ring-1 ring-cyan-500/50 bg-cyan-900/10' : ''}`}>
                            {s.id === activeSessionId && <div className="absolute left-0 top-2 bottom-2 w-1 bg-cyan-500 rounded-r-full"></div>}
                            <div className="flex items-center gap-3 truncate flex-1 min-w-0 pl-1">
                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : s.status === ConnectionStatus.CONNECTING ? 'bg-amber-400 animate-pulse' : s.status === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-600'}`}></div>
                                <div className="flex flex-col truncate w-full">
                                    {editingSessionId === s.id ? (
                                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} onClick={e => e.stopPropagation()} className="w-full bg-slate-950 text-white text-xs px-1.5 py-0.5 rounded border border-cyan-500 outline-none" />
                                    ) : (
                                        <>
                                            <span className={`text-sm font-medium transition-colors truncate ${s.id === activeSessionId ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{s.name}</span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className={`text-[9px] uppercase font-black tracking-tighter ${s.id === activeSessionId ? 'text-slate-300' : 'text-slate-600'}`}>{s.address}</span>
                                                <div className="flex items-center gap-1">
                                                    {s.dropCount > 0 && <span className="text-[9px] text-red-500 font-bold flex items-center gap-0.5"><WifiOff className="w-2.5 h-2.5" />{s.dropCount}</span>}
                                                    
                                                    {/* ID Display Logic: Only show when CONNECTED */}
                                                    {s.status === ConnectionStatus.CONNECTED && s.instanceId && (
                                                        <span className="text-[9px] font-mono text-emerald-500">ID:{s.instanceId}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                                <button onClick={(e) => { e.stopPropagation(); s.status === ConnectionStatus.CONNECTED ? handleDisconnect(s.id) : handleConnect(s.id); }} className={`p-1.5 rounded ${s.status === ConnectionStatus.CONNECTED ? 'text-emerald-500 hover:bg-emerald-900/20' : 'text-slate-500 hover:text-white'}`}><Power className="w-3.5 h-3.5" /></button>
                                <button onClick={(e) => { e.stopPropagation(); setEditingSessionId(s.id); setEditName(s.name); }} className="p-1.5 text-slate-500 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={(e) => handleSingleDelete(e, s.id)} className="p-1.5 text-slate-500 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Controls */}
                <div className="p-3 border-t border-slate-800 bg-slate-950 gap-2 flex flex-col shrink-0">
                    <div className="grid grid-cols-2 gap-2 mb-1">
                        <button onClick={handleConnectAll} className="flex items-center justify-center gap-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-500 border border-emerald-900/50 py-1.5 rounded text-xs font-bold transition-all"><Play className="w-3 h-3 fill-current" /> 全部连接</button>
                        <button onClick={handleDisconnectAll} className="flex items-center justify-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 py-1.5 rounded text-xs font-bold transition-all"><Square className="w-3 h-3 fill-current" /> 全部断开</button>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                        <div className="flex-1 flex items-center gap-1 px-1"><span className="text-[10px] text-slate-500 font-bold uppercase">数量</span><input type="number" min="1" max="20" value={createCount} onChange={e => setCreateCount(Number(e.target.value))} className="w-10 bg-slate-800 text-slate-300 text-xs text-center border border-slate-700 rounded h-6 font-mono" /></div>
                        <button onClick={() => createNewSessions(createCount)} className="p-1.5 text-cyan-500 hover:bg-slate-800 rounded" title="批量新建"><Plus className="w-4 h-4" /></button>
                        <button onClick={handleCopySessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="复制会话"><Copy className="w-4 h-4" /></button>
                        <button onClick={handlePasteSessions} disabled={!clipboardSessions} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="粘贴会话"><ClipboardPaste className="w-4 h-4" /></button>
                        <button onClick={handleDeleteSelectedSessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-red-500 hover:bg-slate-800 rounded disabled:opacity-20" title="删除选中"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button onClick={() => setIsHelpOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="帮助文档"><HelpCircle className="w-4 h-4" /></button>
                        <button onClick={() => setIsSettingsOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-cyan-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="全局设置"><Settings className="w-4 h-4" /></button>
                        <button onClick={() => setIsStatsOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="统计分析"><BarChart3 className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 relative">
                {sessions.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-6">
                        <div className="p-8 bg-white rounded-full border border-slate-200 shadow-xl"><Boxes className="w-20 h-20 opacity-5" /></div>
                        <p className="font-black text-lg text-slate-700 uppercase tracking-widest">InoDriver Studio</p>
                    </div>
                )}
                
                {/* RENDER ALL SESSIONS (Hidden if inactive) */}
                {sessions.map(s => (
                    <EipWorkspace 
                        key={s.id}
                        session={s} 
                        isActive={s.id === activeSessionId}
                        onUpdate={(updates) => handleUpdateSession(s.id, updates)} 
                        onConnect={handleConnect} 
                        onDisconnect={handleDisconnect}
                        addLog={addLog}
                        globalBindIp={selectedBindIp} 
                        onDrop={() => handleSessionDrop(s.id)}
                    />
                ))}
                
                {/* System Log Panel (Shared overlay) */}
                <SystemLogPanel logs={logs} onClear={() => setLogs([])} />
            </div>
        </div>
    );
};

export default function EipApp() {
    return (
        <EipAppContent />
    );
}
