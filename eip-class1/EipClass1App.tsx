import React, { useState, useEffect, useRef } from 'react';
import { ConnectionStatus } from '../types';
import { EipClass1SessionInfo } from '../type-definitions/eip-class1';
import { useProject } from '../contexts/ProjectContext';
import { Toaster, toast } from 'sonner';
import { Plus, Trash2, Play, Square, Settings, RefreshCw, FolderOpen, FilePlus, Save, Cpu, Network, FileCode, AlertTriangle, Copy, BarChart3, TerminalSquare } from 'lucide-react';
import { EipClass1Workspace } from './components/EipClass1Workspace';
import { EipClass1GlobalLogs } from './components/EipClass1GlobalLogs';
import DropStatsModal from '../components/DropStatsModal';
import ProjectConfirmModal from '../components/ProjectConfirmModal';

const createDefaultConnection = () => {
    const defaultO2TDataset = Array.from({ length: 50 }, (_, i) => ({
        id: Math.random().toString(36).substr(2, 9) + i,
        name: `InVal_${i + 1}`,
        dataType: 'INT',
        bitLength: 16,
        helpString: `Offset: ${i * 2}B, 0b`
    }));
    const defaultT2ODataset = Array.from({ length: 50 }, (_, i) => ({
        id: Math.random().toString(36).substr(2, 9) + i,
        name: `OutVal_${i + 1}`,
        dataType: 'INT',
        bitLength: 16,
        helpString: `Offset: ${i * 2}B, 0b`
    }));
    return {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Connection 1',
        targetIp: '0.0.0.0',
        rpi: 50,
        o2tInstance: 100,
        t2oInstance: 101,
        o2tSize: 100,
        t2oSize: 100,
        connectionPath: '20 04 2C 64 2C 65',
        o2tData: new Array(100).fill(0),
        t2oData: new Array(100).fill(0),
        o2tDataset: defaultO2TDataset,
        t2oDataset: defaultT2ODataset,
        status: 'Disconnected' as const,
        connectionType: 'IO' as const
    };
};

export const EipClass1App: React.FC = () => {
    const { registerEipClass1Getter, setDirty, isDirty } = useProject();
    const [sessions, setSessions] = useState<EipClass1SessionInfo[]>(() => {
        const id = Math.random().toString(36).substr(2, 9);
        return [{
            id,
            name: `EIP Class1 1`,
            mode: 'Scanner',
            status: ConnectionStatus.DISCONNECTED,
            dropCount: 0,
            scannerConfig: { slaves: [] },
            adapterConfig: {
                vendorId: 1660,
                deviceType: 12,
                productCode: 1101,
                majorRevision: 1,
                minorRevision: 1,
                productName: 'INOEIP_SystemTest_PC',
                connections: [createDefaultConnection()]
            }
        }];
    });
    const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
    const [sidebarWidth, setSidebarWidth] = useState(320);
    const [isStatsOpen, setIsStatsOpen] = useState(false);
    const [sessionStats, setSessionStats] = useState<Record<string, any>>({});
    const sidebarRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

// ... (Keep existing imports)
    const [clipboardSessions, setClipboardSessions] = useState<EipClass1SessionInfo[] | null>(null);
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

    const [isProjectConfirmOpen, setIsProjectConfirmOpen] = useState(false);
    const [pendingProjectAction, setPendingProjectAction] = useState<'NEW' | 'OPEN' | null>(null);
    const [isGlobalLogsOpen, setIsGlobalLogsOpen] = useState(false);

    const handleClearGlobalLogs = () => {
        setSessions(prev => prev.map(s => ({ ...s, diagnostics: [] })));
    };

    const performNewProject = () => {
        setSessions([]);
        setActiveSessionId(null);
        // We use a timeout to ensure state has cleared or we pass the empty list
        const resetSession: EipClass1SessionInfo = {
            id: Math.random().toString(36).substr(2, 9),
            name: `EIP Class1 1`,
            mode: 'Scanner',
            status: ConnectionStatus.DISCONNECTED,
            dropCount: 0,
            scannerConfig: { slaves: [] },
            adapterConfig: {
                vendorId: 1660,
                deviceType: 12,
                productCode: 1101,
                majorRevision: 1,
                minorRevision: 1,
                productName: 'INOEIP_SystemTest_PC',
                connections: [createDefaultConnection()]
            }
        };
        setSessions([resetSession]);
        setActiveSessionId(resetSession.id);
        setDirty(false);
    };

    const handleNewProjectRequest = () => {
        if (isDirty()) {
            setPendingProjectAction('NEW');
            setIsProjectConfirmOpen(true);
        } else {
            performNewProject();
        }
    };

    const handleSaveProjectLocal = () => {
        const data = JSON.stringify({ version: '2.6.0', eipClass1Sessions: sessions }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eipclass1_project_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDirty(false);
        toast.success('Project Saved locally');
        return true;
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
                    const project = JSON.parse(evt.target?.result as string);
                    if (Array.isArray(project.eipClass1Sessions)) {
                        setSessions(project.eipClass1Sessions);
                        if (project.eipClass1Sessions.length > 0) setActiveSessionId(project.eipClass1Sessions[0].id);
                        setDirty(false);
                        toast.success(`Project loaded from ${file.name}`);
                    }
                } catch (err) {
                    toast.error("Invalid EIP Class1 Project File");
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

    const mappedSessionsForStats = sessions.flatMap(session => {
        if (session.mode === 'Scanner') {
            return session.scannerConfig.slaves.map(slave => ({
                id: slave.id,
                name: `${session.name} -> ${slave.name}`,
                status: slave.status === 'Connected' ? ConnectionStatus.CONNECTED : slave.status === 'Error' ? ConnectionStatus.ERROR : ConnectionStatus.DISCONNECTED,
                endpointUrl: slave.ipAddress,
                dropCount: slave.dropCount || 0,
                lastError: slave.lastError || '',
                lastDropTime: slave.lastDropTime,
                lastRecoveryTime: slave.lastRecoveryTime
            }));
        } else {
            return session.adapterConfig.connections.filter(c => c.targetIp).map(conn => ({
                id: conn.id,
                name: `${session.name} -> Conn (${conn.targetIp})`,
                status: conn.status === 'Connected' ? ConnectionStatus.CONNECTED : conn.status === 'Error' ? ConnectionStatus.ERROR : ConnectionStatus.DISCONNECTED,
                endpointUrl: conn.targetIp || 'Adapter',
                dropCount: conn.dropCount || 0,
                lastError: conn.lastError || '',
                lastDropTime: conn.lastDropTime,
                lastRecoveryTime: conn.lastRecoveryTime
            }));
        }
    });

    const handleResetStats = () => {
        setSessions(prev => prev.map(s => {
            if (s.mode === 'Scanner') {
                return {
                    ...s,
                    scannerConfig: {
                        ...s.scannerConfig,
                        slaves: s.scannerConfig.slaves.map(slave => ({ ...slave, dropCount: 0, dropHistory: [], hasErrorHistory: false, lastError: undefined, lastDropTime: undefined, lastRecoveryTime: undefined }))
                    }
                };
            } else {
                return {
                    ...s,
                    adapterConfig: {
                        ...s.adapterConfig,
                        connections: s.adapterConfig.connections.map(c => ({ ...c, dropCount: 0, dropHistory: [], hasErrorHistory: false, lastError: undefined, lastDropTime: undefined, lastRecoveryTime: undefined }))
                    }
                };
            }
        }));
        toast.success('已重置所有设备的掉线统计计数');
    };

    useEffect(() => {
        registerEipClass1Getter(() => sessions);
    }, [sessions, registerEipClass1Getter]);

    useEffect(() => {
        if (!(window as any).electronAPI) return;

        const unsubData = (window as any).electronAPI.onEipClass1Data((msg: any) => {
            setSessions(prev => prev.map(s => {
                if (s.id !== msg.sessionId) return s;

                if (s.mode === 'Scanner') {
                    const slaves = [...s.scannerConfig.slaves];
                    const slaveIdx = slaves.findIndex(sl => sl.ipAddress === msg.ip);
                    if (slaveIdx >= 0) {
                        const slave = { ...slaves[slaveIdx] };
                        if (slave.connections) {
                            slave.connections = slave.connections.map(conn => {
                                if (conn.id === msg.connId) {
                                    return { 
                                        ...conn, 
                                        t2oData: msg.t2oData || msg.data,
                                        o2tData: msg.o2tData || conn.o2tData
                                    };
                                }
                                return conn;
                            });
                        } else {
                            slave.t2oData = msg.t2oData || msg.data;
                            slave.o2tData = msg.o2tData || slave.o2tData;
                        }
                        slaves[slaveIdx] = slave;
                        return { ...s, scannerConfig: { ...s.scannerConfig, slaves } };
                    }
                } else {
                    const conns = [...s.adapterConfig.connections];
                    // Match by connId first, then fallback to IP if connId is missing (for older compatibility)
                    const connIdx = conns.findIndex(c => c.id === msg.connId || (!msg.connId && (c.targetIp === msg.ip || !c.targetIp)));
                    if (connIdx >= 0) {
                        conns[connIdx] = { 
                            ...conns[connIdx], 
                            o2tData: msg.o2tData || msg.data,
                            t2oData: msg.t2oData || conns[connIdx].t2oData
                        };
                        return { ...s, adapterConfig: { ...s.adapterConfig, connections: conns } };
                    }
                }
                return s;
            }));
        });

        const unsubStats = (window as any).electronAPI.onEipClass1Stats((msg: any) => {
            setSessionStats(prev => ({
                ...prev,
                [msg.sessionId]: msg.stats
            }));
        });

        const unsubError = (window as any).electronAPI.onEipClass1Error((msg: any) => {
           setSessions(prev => prev.map(s => {
                if (s.id !== msg.sessionId) return s;
                toast.error(`EIP Class 1 Error: ${msg.error}`);
                if ((window as any).electronAPI) {
                    (window as any).electronAPI.eipClass1Stop(s.id);
                }

                if (s.mode === 'Scanner') {
                    return {
                        ...s,
                        status: ConnectionStatus.DISCONNECTED,
                        scannerConfig: {
                            ...s.scannerConfig,
                            slaves: s.scannerConfig.slaves.map(sl => ({ ...sl, status: 'Error', hasErrorHistory: true }))
                        }
                    };
                } else {
                    return {
                        ...s,
                        status: ConnectionStatus.DISCONNECTED,
                        adapterConfig: {
                            ...s.adapterConfig,
                            connections: s.adapterConfig.connections.map(c => ({ ...c, status: 'Error' }))
                        }
                    };
                }
            }));
        });

        const unsubDropped = (window as any).electronAPI.onEipClass1ConnDropped((msg: any) => {
            setSessions(prev => prev.map(s => {
                if (s.id !== msg.sessionId) return s;
                const timeStr = new Date().toLocaleTimeString();
                
                // 区分主动关闭与意外掉线
                const isManualClose = msg.reason && (
                    msg.reason.includes('Forward Close') || 
                    msg.reason.includes('Master Connection Closed')
                );
                
                let reasonSuffix = '';
                if (msg.reason) {
                    reasonSuffix = ` - 原因: ${msg.reason}`;
                    // Translate common socket errors
                    if (msg.reason.includes('ETIMEDOUT') || msg.reason.includes('Timeout')) {
                        reasonSuffix += ' (目标设备未响应/离线)';
                    } else if (msg.reason.includes('ECONNREFUSED')) {
                        reasonSuffix += ' (目标设备拒绝连接/端口未开启)';
                    } else if (msg.reason.includes('EHOSTUNREACH')) {
                        reasonSuffix += ' (无法路由到目标设备/网络不可达)';
                    }
                }
                
                const diagnostics = [...(s.diagnostics || []), { time: timeStr, message: `通讯掉线: ${msg.ip} (Conn ID: ${msg.connId || 'N/A'})${reasonSuffix}` }].slice(-100);

                if (s.mode === 'Scanner') {
                    const slaves = [...s.scannerConfig.slaves];
                    const slaveIdx = slaves.findIndex(sl => sl.ipAddress === msg.ip);
                    if (slaveIdx >= 0) {
                        slaves[slaveIdx] = { 
                            ...slaves[slaveIdx], 
                            status: 'Error', 
                            hasErrorHistory: true,
                            dropCount: (slaves[slaveIdx].dropCount || 0) + 1,
                            lastDropTime: timeStr
                        };
                        return { ...s, scannerConfig: { ...s.scannerConfig, slaves }, diagnostics };
                    }
                } else {
                    const connections = [...s.adapterConfig.connections];
                    const connIdx = connections.findIndex(c => c.targetIp === msg.ip);
                    if (connIdx >= 0) {
                        connections[connIdx] = { 
                            ...connections[connIdx], 
                            status: isManualClose ? 'Disconnected' : 'Error', 
                            // 仅意外掉线才标记 hasErrorHistory，主动关闭不标记
                            hasErrorHistory: isManualClose ? connections[connIdx].hasErrorHistory : true,
                            dropCount: (connections[connIdx].dropCount || 0) + 1,
                            lastDropTime: timeStr
                        };
                        return { ...s, adapterConfig: { ...s.adapterConfig, connections }, diagnostics };
                    }
                }
                return { ...s, diagnostics };
            }));
        });

        const unsubRecovered = (window as any).electronAPI.onEipClass1ConnRecovered((msg: any) => {
            setSessions(prev => prev.map(s => {
                if (s.id !== msg.sessionId) return s;
                const timeStr = new Date().toLocaleTimeString();
                const diagnostics = [...(s.diagnostics || []), { time: timeStr, message: `通讯恢复: ${msg.ip} (Conn ID: ${msg.connId || 'N/A'})` }].slice(-100);

                if (s.mode === 'Scanner') {
                    const slaves = [...s.scannerConfig.slaves];
                    const slaveIdx = slaves.findIndex(sl => sl.ipAddress === msg.ip);
                    if (slaveIdx >= 0) {
                        slaves[slaveIdx] = { 
                            ...slaves[slaveIdx], 
                            status: 'Connected',
                            lastRecoveryTime: timeStr
                        };
                        return { ...s, scannerConfig: { ...s.scannerConfig, slaves }, diagnostics };
                    }
                } else {
                    const connections = [...s.adapterConfig.connections];
                    const connIdx = connections.findIndex(c => c.targetIp === msg.ip);
                    if (connIdx >= 0) {
                        connections[connIdx] = { 
                            ...connections[connIdx], 
                            status: 'Connected',
                            lastRecoveryTime: timeStr
                        };
                        return { ...s, adapterConfig: { ...s.adapterConfig, connections }, diagnostics };
                    }
                }
                return { ...s, diagnostics };
            }));
        });

        return () => {
            unsubData();
            unsubStats();
            unsubError();
            if (unsubDropped) unsubDropped();
            if (unsubRecovered) unsubRecovered();
        };
    }, []);

    const handleUpdateSession = (id: string, updates: Partial<EipClass1SessionInfo> | ((prev: EipClass1SessionInfo) => Partial<EipClass1SessionInfo>)) => {
        const isFunctional = typeof updates === 'function';
        
        if (!isFunctional) {
            const keys = Object.keys(updates);
            const isConfigChange = keys.some(k => 
                ['name', 'mode', 'localBindIp', 'scannerConfig', 'adapterConfig'].includes(k)
            );
            if (isConfigChange) setDirty(true);
        } else {
            // For functional updates, we set dirty just in case, or we could inspect the result.
            // In this app, functional updates are mostly used for diagnostics/stats which we might want to exclude.
            // But for simplicity, if it's functional, let's assume it's a diag update and NOT set dirty,
            // UNLESS we know which calls use functions.
            // Actually, handleResetStats uses functional updates.
        }

        setSessions(prev => prev.map(s => {
            if (s.id === id) {
                const evaluated = typeof updates === 'function' ? updates(s) : updates;
                return { ...s, ...evaluated };
            }
            return s;
        }));
    };

    const handleAddSession = (isReset: boolean = false) => {
        const newSession: EipClass1SessionInfo = {
            id: Math.random().toString(36).substr(2, 9),
            name: `EIP Class1 ${isReset ? 1 : sessions.length + 1}`,
            mode: 'Scanner',
            status: ConnectionStatus.DISCONNECTED,
            dropCount: 0,
            scannerConfig: { slaves: [] },
            adapterConfig: {
                vendorId: 1660,
                deviceType: 12,
                productCode: 1101,
                majorRevision: 1,
                minorRevision: 1,
                productName: 'INOEIP_SystemTest_PC',
                connections: [createDefaultConnection()]
            }
        };
        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(newSession.id);
        if (!isReset) setDirty(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            let newWidth = e.clientX;
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 600) newWidth = 600;
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div className="flex h-full w-full bg-slate-50 overflow-hidden">
            {/* Sidebar */}
            <div 
                ref={sidebarRef}
                style={{ width: `${sidebarWidth}px` }}
                className="bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 z-20 relative"
            >
                <div 
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 z-50 group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        isDraggingRef.current = true;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                    }}
                >
                    <div className="absolute inset-y-0 right-0 w-4 -translate-x-1.5" />
                </div>
                <div className="h-14 flex items-center px-4 font-bold tracking-wide text-white border-b border-slate-800 gap-2 bg-slate-950 shadow-sm shrink-0">
                    <div className="p-1.5 bg-sky-600 rounded">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <span className="truncate">EIP Class 1</span>
                    <button onClick={() => handleAddSession()} className="ml-auto p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="New Session">
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-2 shrink-0">
                    <button onClick={handleNewProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                        <FilePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-xs font-bold truncate">New</span>
                    </button>
                    <button onClick={handleOpenProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-bold truncate">Open</span>
                    </button>
                    <button onClick={handleSaveProjectLocal} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                        <Save className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs font-bold truncate">Save</span>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(session => (
                        <div 
                            key={session.id}
                            onClick={() => setActiveSessionId(session.id)}
                            className={`group p-3 rounded-lg cursor-pointer transition-all border flex flex-col gap-2 ${activeSessionId === session.id ? 'bg-indigo-900/40 border-indigo-500/50 shadow-lg' : 'bg-slate-800/50 border-transparent hover:bg-slate-800'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${session.status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : session.status === ConnectionStatus.CONNECTING ? 'bg-amber-500 animate-pulse' : session.status === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-500'}`}></div>
                                    <span className="text-sm font-bold text-slate-200 truncate">{session.name}</span>
                                </div>
                                <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newSession = JSON.parse(JSON.stringify(session));
                                            newSession.id = crypto.randomUUID();
                                            newSession.name = `${session.name} (Copy)`;
                                            newSession.status = ConnectionStatus.DISCONNECTED;
                                            
                                            setSessions(prev => [...prev, newSession]);
                                            setActiveSessionId(newSession.id);
                                            setDirty(true);
                                        }}
                                        className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                                        title="复制会话"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSessions(prev => prev.filter(s => s.id !== session.id));
                                            if (activeSessionId === session.id) setActiveSessionId(sessions[0]?.id || null);
                                            setDirty(true);
                                        }}
                                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                                        title="删除会话"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span className={`px-1.5 py-0.5 rounded bg-slate-950 border ${session.mode === 'Scanner' ? 'border-cyan-500/30 text-cyan-400' : 'border-amber-500/30 text-amber-400'}`}>
                                    {session.mode}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-3 border-t border-slate-800 bg-slate-950 flex gap-2 shrink-0">
                    <button 
                        onClick={() => setIsGlobalLogsOpen(true)} 
                        className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" 
                        title="通讯日志汇总"
                    >
                        <TerminalSquare className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setIsStatsOpen(true)} 
                        className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" 
                        title="统计分析"
                    >
                        <BarChart3 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 relative flex flex-col">
                <ProjectConfirmModal isOpen={isProjectConfirmOpen} onChoice={handleProjectConfirmChoice} />
                <DropStatsModal 
                    isOpen={isStatsOpen} 
                    onClose={() => setIsStatsOpen(false)} 
                    sessions={mappedSessionsForStats as any} 
                    onResetCounts={handleResetStats} 
                />
                
                <div className="flex-1 relative">
                    {sessions.map(session => (
                        <EipClass1Workspace 
                            key={session.id}
                            session={session}
                            isActive={activeSessionId === session.id}
                            onUpdate={(updates) => handleUpdateSession(session.id, updates)}
                            stats={sessionStats[session.id] || {}}
                        />
                    ))}
                    {sessions.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                            <Cpu className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-lg font-bold">没有活动的会话</p>
                            <p className="text-sm mt-2">点击左侧 "+" 创建新的 EIP Class 1 会话</p>
                        </div>
                    )}
                </div>

                <EipClass1GlobalLogs 
                    sessions={sessions} 
                    isOpen={isGlobalLogsOpen} 
                    onClose={() => setIsGlobalLogsOpen(false)} 
                    onClearLogs={handleClearGlobalLogs} 
                />
            </div>
        </div>
    );
};
