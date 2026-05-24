import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ModbusSlaveSessionInfo, ConnectionStatus, ProjectFile, ModbusSlaveMemoryType, ModbusSlaveRegisterConfig } from '../types';
import { Toaster, toast } from 'sonner';
import { modbusSlaveService } from './services/modbusSlaveService';
import { ModbusSlaveWorkspace } from './components/ModbusSlaveWorkspace';
import { Server, Plus, Trash2, Play, Square, Settings, RefreshCw, FolderOpen, FilePlus, MousePointer2, Save, Zap, Activity, WifiOff, AlertTriangle, Power, Edit2, X, Pause, RotateCcw, Hash, Copy, ClipboardPaste, HelpCircle, BarChart3, Users, Globe } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import { ModbusHelpModal } from '../modbus/components/ModbusHelpModal';
import { ModbusSettingsModal } from '../modbus/components/ModbusSettingsModal';
import { ModbusSlaveSessionModal } from './components/ModbusSlaveSessionModal';
import { ModbusSlaveStabilityModal } from './components/ModbusSlaveStabilityModal';
import { useModbusSimulation } from './hooks/useModbusSimulation';

const createDefaultRegisters = () => {
    const types: { type: ModbusSlaveMemoryType, prefix: string }[] = [
        { type: 'holding', prefix: '保持寄存器' },
        { type: 'inputs', prefix: '输入寄存器' },
        { type: 'coils', prefix: '线圈' },
        { type: 'discrete', prefix: '离散输入' }
    ];
    
    const regs: ModbusSlaveRegisterConfig[] = [];
    let idCounter = Date.now();
    
    types.forEach(t => {
        for (let i = 0; i < 5000; i++) {
            regs.push({
                id: (idCounter++).toString(),
                name: `${t.prefix}${i}`,
                type: t.type,
                address: i,
                dataType: t.type === 'coils' || t.type === 'discrete' ? 'Boolean' : 'UInt16'
            });
        }
    });
    return regs;
};

const SidebarItem = React.memo(({
    s, idx, isActive, isSelected, onClick, onToggle, onEdit, onDelete
}: {
    s: ModbusSlaveSessionInfo,
    idx: number,
    isActive: boolean,
    isSelected: boolean,
    onClick: (e: React.MouseEvent, id: string, index: number) => void,
    onToggle: (s: ModbusSlaveSessionInfo) => void,
    onEdit: (s: ModbusSlaveSessionInfo) => void,
    onDelete: (e: React.MouseEvent, id: string) => void
}) => {
    return (
        <div onClick={(e) => onClick(e, s.id, idx)} className={`group relative flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${isActive ? 'bg-slate-800 border-slate-700 shadow-md ring-1 ring-white/10' : 'border-transparent hover:bg-slate-800/50'} ${isSelected && !isActive ? 'ring-1 ring-amber-500/50 bg-amber-900/10' : ''}`}>
            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full"></div>}
            <div className="flex items-center gap-3 truncate flex-1 min-w-0 pl-1 group-hover:pr-16 transition-all">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.status === ConnectionStatus.CONNECTED ? 'bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : s.status === ConnectionStatus.CONNECTING ? 'bg-amber-400 animate-pulse' : s.status === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-600'}`}></div>
                <div className="flex flex-col truncate w-full">
                    <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium transition-colors truncate ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{s.name}</span>
                        <div className="flex items-center gap-2">
                            {(s.dropCount || 0) > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-500 bg-red-500/10 px-1.5 rounded">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {s.dropCount}
                                </span>
                            )}
                            {s.status === ConnectionStatus.CONNECTED && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1 rounded">
                                    {s.transport === 'RTU' || s.transport === 'ASCII' ? (
                                        <>
                                            <Zap className="w-2.5 h-2.5 animate-pulse" />
                                            <span>串口开启</span>
                                        </>
                                    ) : (
                                        <>
                                            <Users className="w-2.5 h-2.5" />
                                            <span>{s.clientCount || 0}</span>
                                        </>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col mt-0.5">
                        <div className={`text-[10px] font-mono truncate ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                            {s.transport === 'RTU' || s.transport === 'ASCII' ? (
                                <span>{s.transport}: {s.comPort || '未配置'} ({s.baudRate})</span>
                            ) : (
                                <span>{s.localBindIp || '0.0.0.0'}:{s.port}</span>
                            )}
                        </div>
                        <div className={`text-[9px] font-mono opacity-60 mt-0.5 ${isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                            ID: {s.unitId}
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800/80 backdrop-blur-sm p-1 rounded-md shadow-lg">
                <button onClick={(e) => { e.stopPropagation(); onToggle(s); }} className={`p-1.5 rounded ${s.status === ConnectionStatus.CONNECTED ? 'text-emerald-500 hover:bg-emerald-900/20' : 'text-slate-500 hover:text-white'}`}><Power className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(s); }} className="p-1.5 text-slate-500 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { onDelete(e, s.id); }} className="p-1.5 text-slate-500 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
        </div>
    );
});

const EMPTY_ARRAY: any[] = [];
export const ModbusSlaveApp: React.FC = () => {
    const { registerModbusSlaveGetter, setDirty } = useProject();
    const [sessions, setSessions] = useState<ModbusSlaveSessionInfo[]>(() => {
        const id = Math.random().toString(36).substr(2, 9);
        return [{
            id,
            name: `Slave 1`,
            transport: 'TCP',
            port: 502,
            unitId: 1,
            localBindIp: '0.0.0.0',
            memorySize: 20000,
            status: ConnectionStatus.DISCONNECTED,
            dropCount: 0,
            config: { registers: createDefaultRegisters(), logs: [], systemLogs: [] }
        }];
    });
    const [activeSessionId, setActiveSessionId] = useState<string | null>(sessions[0]?.id || null);
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [editingSessionData, setEditingSessionData] = useState<ModbusSlaveSessionInfo | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New state for sidebar
    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set(sessions[0]?.id ? [sessions[0].id] : []));
    const [clipboardSessions, setClipboardSessions] = useState<ModbusSlaveSessionInfo[] | null>(null);
    const [createCount, setCreateCount] = useState(1);
    const [lastClickedSessionId, setLastClickedSessionId] = useState<string | null>(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isStabilityMonitorOpen, setIsStabilityMonitorOpen] = useState(false);

    useModbusSimulation(sessions);

    useEffect(() => {
        registerModbusSlaveGetter(() => sessions);
    }, [sessions, registerModbusSlaveGetter]);

    const handleNewProject = () => {
        toast('确定要启动新工程吗？当前未保存的配置将丢失。', {
            action: {
                label: '确定',
                onClick: () => {
                    sessions.forEach(s => {
                        if(s.status === ConnectionStatus.CONNECTED) modbusSlaveService.stopServer(s.id);
                    });
                    
                    const newSession: ModbusSlaveSessionInfo = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: `Slave 1`,
                        transport: 'TCP',
                        port: 502,
                        unitId: 1,
                        localBindIp: '0.0.0.0',
                        memorySize: 20000,
                        status: ConnectionStatus.DISCONNECTED,
                        dropCount: 0,
                        config: { registers: createDefaultRegisters(), logs: [], systemLogs: [] }
                    };
                    
                    setSessions([newSession]);
                    setActiveSessionId(newSession.id);
                    setSelectedSessionIds(new Set([newSession.id]));
                    setDirty(false);
                    toast.success("新工程已创建！");
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };

    const handleOpenProject = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleWebFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const project = JSON.parse(evt.target?.result as string) as ProjectFile;
                if (Array.isArray(project.modbusSlaveSessions)) {
                    setSessions(project.modbusSlaveSessions);
                    if (project.modbusSlaveSessions.length > 0) {
                        setActiveSessionId(project.modbusSlaveSessions[0].id);
                        setSelectedSessionIds(new Set([project.modbusSlaveSessions[0].id]));
                    } else {
                        setActiveSessionId(null);
                        setSelectedSessionIds(new Set());
                    }
                    setDirty(false);
                }
            } catch (err) {
                toast.error("无效的工程文件格式");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleSaveProjectLocal = () => {
        const data = JSON.stringify({ version: '2.6.0', modbusSlaveSessions: sessions }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `modbus_slave_project_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDirty(false);
        toast.success("工程保存成功！");
    };

    // Log buffering for performance
    const lastLogUpdateTimeRef = useRef<number>(0);

    useEffect(() => {
        let updateQueue: Record<string, Partial<ModbusSlaveSessionInfo> & { 
            pushSystemLogs?: any[],
            dropAction?: { error: string, port: number },
            memory?: any
        }> = {};
        let updateTimeout: any = null;

        const flushUpdates = () => {
            if (Object.keys(updateQueue).length === 0) return;
            
            setSessions(prev => {
                let changed = false;
                const next = prev.map(s => {
                    const updates = updateQueue[s.id];
                    if (updates) {
                        changed = true;
                        
                        let newSystemLogs = s.config?.systemLogs || [];
                        if (updates.pushSystemLogs && updates.pushSystemLogs.length > 0) {
                            newSystemLogs = [...newSystemLogs, ...updates.pushSystemLogs].slice(-100);
                        }

                        let newDropCount = s.dropCount || 0;
                        let newStatus = updates.status !== undefined ? updates.status : s.status;
                        
                        if (updates.dropAction) {
                            if (s.status === ConnectionStatus.CONNECTED) {
                                newDropCount += 1;
                            }
                            newStatus = ConnectionStatus.ERROR;
                        }

                        const { pushSystemLogs, dropAction, ...rest } = updates;
                        
                        return {
                            ...s,
                            ...rest,
                            status: newStatus,
                            dropCount: newDropCount,
                            config: {
                                ...s.config,
                                systemLogs: newSystemLogs
                            }
                        };
                    }
                    return s;
                });
                
                return changed ? next : prev;
            });
            
            updateQueue = {};
            updateTimeout = null;
        };

        const queueUpdate = (sessionId: string, updates: any) => {
            if (!updateQueue[sessionId]) {
                updateQueue[sessionId] = { pushSystemLogs: [] };
            }
            const q = updateQueue[sessionId];
            
            if (updates.status !== undefined) q.status = updates.status;
            if (updates.lastError !== undefined) q.lastError = updates.lastError;
            if (updates.memory !== undefined) q.memory = updates.memory;
            if (updates.clientCount !== undefined) q.clientCount = updates.clientCount;
            if (updates.clients !== undefined) q.clients = updates.clients;
            
            if (updates.lastDropTime !== undefined) q.lastDropTime = updates.lastDropTime;
            if (updates.lastDropError !== undefined) q.lastDropError = updates.lastDropError;
            if (updates.lastDropPort !== undefined) q.lastDropPort = updates.lastDropPort;
            
            if (updates.dropAction !== undefined) q.dropAction = updates.dropAction;
            
            if (updates.newLog) {
                q.pushSystemLogs!.push(updates.newLog);
            }

            if (!updateTimeout) {
                updateTimeout = window.setTimeout(flushUpdates, 200);
            }
        };

        const handleDataChanged = (data: any) => {
            const newLog = {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toISOString(),
                type: data.action === 'write' ? 'info' : 'success',
                message: `Master ${data.action} ${data.length} ${data.type} at address ${data.address}`
            };
            queueUpdate(data.sessionId, { newLog });
        };

        const removeTcpDataListener = modbusSlaveService.onDataChanged(handleDataChanged, 'TCP');
        const removeRtuDataListener = modbusSlaveService.onDataChanged(handleDataChanged, 'RTU');

        const handleError = (data: any) => {
            const newLog = {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'error',
                message: `Server Error: ${data.error}`
            };
            queueUpdate(data.sessionId, {
                status: ConnectionStatus.ERROR,
                lastError: data.error,
                newLog
            });
        };

        const removeTcpErrorListener = modbusSlaveService.onError(handleError, 'TCP');
        const removeRtuErrorListener = modbusSlaveService.onError(handleError, 'RTU');

        const handleLog = (data: any) => {
            const newLog = {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'info',
                message: data.message
            };

            const isRaw = data.message && (
                data.message.includes('[原始报文]') || 
                /\b(RX|TX)\b/i.test(data.message) ||
                /(?:request|response|recv|send|Data from|Data to).*?([0-9a-fA-F\s]{8,})/i.test(data.message) ||
                /^[0-9a-fA-F\s\[\]]{8,}$/.test(data.message.trim())
            );

            if (!isRaw) {
                queueUpdate(data.sessionId, { newLog });
            }
        };

        const removeTcpLogListener = modbusSlaveService.onLog(handleLog, 'TCP');
        // RTU and ASCII share the same backend listener in modbusSlaveService, 
        // so we only need to register once for serial transports to avoid duplication.
        const removeSerialLogListener = modbusSlaveService.onLog(handleLog, 'RTU');

        const removeMemoryUpdateListener = modbusSlaveService.onMemoryUpdate((data) => {
            queueUpdate(data.sessionId, { memory: data.memory });
        });

        const removeClientListener = modbusSlaveService.onClientChanged((data) => {
            queueUpdate(data.sessionId, {
                clientCount: data.clientCount,
                clients: data.clients,
                status: data.clientCount > 0 ? ConnectionStatus.CONNECTED : undefined
            });
        });

        const handleDrop = (data: any) => {
            const newLog = {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toISOString(),
                type: 'error',
                message: `Drop Detected: ${data.error} ${data.port ? `(Port: ${data.port})` : ''}`
            };
            queueUpdate(data.sessionId, {
                dropAction: { error: data.error, port: data.port },
                lastDropTime: new Date().toISOString(),
                lastDropError: data.error,
                lastDropPort: data.port,
                newLog
            });
        };

        const removeTcpDropListener = modbusSlaveService.onDrop(handleDrop, 'TCP');
        const removeRtuDropListener = modbusSlaveService.onDrop(handleDrop, 'RTU');

        return () => {
            if (updateTimeout) window.clearTimeout(updateTimeout);
            removeTcpDataListener();
            removeRtuDataListener();
            removeTcpErrorListener();
            removeRtuErrorListener();
            removeClientListener();
            removeTcpLogListener();
            removeSerialLogListener();
            removeTcpDropListener();
            removeRtuDropListener();
            removeMemoryUpdateListener();
        };
    }, []);

    const handleDeleteSession = async (id: string) => {
        const session = sessions.find(s => s.id === id);
        if (session && session.status === ConnectionStatus.CONNECTED) {
            await modbusSlaveService.stopServer(id);
        }
        const newSessions = sessions.filter(s => s.id !== id);
        setSessions(newSessions);
        if (activeSessionId === id) {
            setActiveSessionId(newSessions.length > 0 ? newSessions[0].id : null);
        }
        setDirty(true);
    };

    const handleToggleServer = async (session: ModbusSlaveSessionInfo) => {
        try {
            if (session.status === ConnectionStatus.CONNECTED) {
                await modbusSlaveService.stopServer(session.id, session.transport || 'TCP');
                updateSessionStatus(session.id, ConnectionStatus.DISCONNECTED);
            } else {
                updateSessionStatus(session.id, ConnectionStatus.CONNECTING);
                const result = await modbusSlaveService.startServer(
                    session.id, 
                    session.port, 
                    session.unitId, 
                    (session as any).memorySize || 20000, 
                    session.localBindIp,
                    session.transport || 'TCP',
                    {
                        comPort: session.comPort,
                        baudRate: session.baudRate,
                        dataBits: session.dataBits,
                        stopBits: session.stopBits,
                        parity: session.parity
                    },
                    session.ignoreUnitId
                );
                if (result.success) {
                    updateSessionStatus(session.id, ConnectionStatus.CONNECTED);
                } else {
                    updateSessionStatus(session.id, ConnectionStatus.ERROR, result.error || 'Unknown error');
                }
            }
        } catch (error) {
            console.error('Failed to toggle server:', error);
            updateSessionStatus(session.id, ConnectionStatus.ERROR, String(error));
        }
    };

    const updateSessionStatus = (id: string, status: ConnectionStatus, error?: string) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status, lastError: error } : s));
    };

    const handleSaveSessionConfig = (formData: Partial<ModbusSlaveSessionInfo>) => {
        if (editingSessionData) {
            setSessions(prev => prev.map(s => s.id === editingSessionData.id ? { ...s, ...formData } : s));
        } else {
            const newSession: ModbusSlaveSessionInfo = {
                id: Date.now().toString(),
                name: formData.name || 'New Slave',
                port: formData.port || 502,
                unitId: formData.unitId || 1,
                localBindIp: formData.localBindIp || '0.0.0.0',
                ignoreUnitId: formData.ignoreUnitId || false,
                memorySize: formData.memorySize || 20000,
                transport: formData.transport || 'TCP',
                comPort: formData.comPort,
                baudRate: formData.baudRate,
                dataBits: formData.dataBits,
                stopBits: formData.stopBits,
                parity: formData.parity,
                status: ConnectionStatus.DISCONNECTED,
                dropCount: 0,
                config: {
                    registers: createDefaultRegisters(),
                    logs: [],
                    systemLogs: []
                }
            };
            setSessions([...sessions, newSession]);
            setActiveSessionId(newSession.id);
            setSelectedSessionIds(new Set([newSession.id]));
        }
        setIsSessionModalOpen(false);
        setEditingSessionData(null);
        setDirty(true);
    };

    const handleClearConsole = () => {
        // no-op
    };

    const handleUpdateSession = useCallback((updatedSession: ModbusSlaveSessionInfo) => {
        setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
        setDirty(true);
    }, []);

    const createNewSessions = useCallback((count: number) => {
        const newSessions: ModbusSlaveSessionInfo[] = [];
        const startIdx = sessions.length + 1;
        for (let i = 0; i < count; i++) {
            const id = Math.random().toString(36).substr(2, 9);
            newSessions.push({
                id,
                name: `Slave ${startIdx + i}`, 
                port: 502 + startIdx + i - 1,
                unitId: 1,
                localBindIp: '0.0.0.0',
                memorySize: 20000,
                status: ConnectionStatus.DISCONNECTED,
                dropCount: 0,
                config: { 
                    registers: createDefaultRegisters(), 
                    logs: [],
                    systemLogs: []
                }
            });
        }
        setSessions(prev => [...prev, ...newSessions]);
        if (newSessions.length > 0) {
            setActiveSessionId(newSessions[0].id);
            setSelectedSessionIds(new Set([newSessions[0].id]));
        }
        setDirty(true);
    }, [sessions.length, setDirty]);

    const handleCopySessions = () => { if (selectedSessionIds.size === 0) return; const toCopy = sessions.filter(s => selectedSessionIds.has(s.id)); setClipboardSessions(toCopy); };
    const handlePasteSessions = () => { if (!clipboardSessions) return; const newSessions = clipboardSessions.map(tpl => ({ ...tpl, id: Math.random().toString(36).substr(2, 9), name: `${tpl.name} (Copy)`, status: ConnectionStatus.DISCONNECTED, dropCount: 0, config: { ...tpl.config, registers: tpl.config.registers.map(r => ({ ...r, id: Math.random().toString(36).substr(2, 9) })) } })); setSessions(prev => [...prev, ...newSessions]); setDirty(true); };
    const deleteSelectedSessions = async () => {
        const idsToStop = Array.from(selectedSessionIds);
        for (const id of idsToStop) {
            try {
                await modbusSlaveService.stopServer(id);
            } catch (err) {
                console.error(`Failed to stop server ${id}:`, err);
            }
        }
        const remaining = sessions.filter(s => !selectedSessionIds.has(s.id));
        setSessions(remaining);
        setSelectedSessionIds(new Set());
        if (remaining.length > 0 && !remaining.find(s => s.id === activeSessionId))
            setActiveSessionId(remaining[0].id);
        else if (remaining.length === 0)
            setActiveSessionId(null);
        setDirty(true);
    };
    const handleSingleDelete = async (e: React.MouseEvent | undefined, id: string) => {
        if (e) e.stopPropagation();
        try {
            await modbusSlaveService.stopServer(id);
        } catch (err) {
            console.error(`Failed to stop server ${id}:`, err);
        }
        const remaining = sessions.filter(s => s.id !== id);
        setSessions(remaining);
        if (selectedSessionIds.has(id)) {
            const newSel = new Set(selectedSessionIds);
            newSel.delete(id);
            setSelectedSessionIds(newSel);
        }
        if (activeSessionId === id) {
            setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
        }
        setDirty(true);
    };
    const handleConnectAll = () => { const targets = sessions.filter(s => s.status !== ConnectionStatus.CONNECTED); if (targets.length === 0) return; targets.forEach(s => { handleToggleServer(s); }); };
    const handleDisconnectAll = async () => { const targets = sessions.filter(s => s.status === ConnectionStatus.CONNECTED); for (const s of targets) { handleToggleServer(s); } };
    const handleSessionClick = useCallback((e: React.MouseEvent, id: string, index: number) => { setActiveSessionId(id); const newSelected = new Set(selectedSessionIds); if (e.ctrlKey || e.metaKey) { if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setLastClickedSessionId(id); } else if (e.shiftKey && lastClickedSessionId) { const allIds = sessions.map(s => s.id); const startIdx = allIds.indexOf(lastClickedSessionId); if (startIdx !== -1) { const low = Math.min(startIdx, index); const high = Math.max(startIdx, index); newSelected.clear(); for (let i = low; i <= high; i++) newSelected.add(allIds[i]); } } else { newSelected.clear(); newSelected.add(id); setLastClickedSessionId(id); } setSelectedSessionIds(newSelected); }, [selectedSessionIds, lastClickedSessionId, sessions]);

    const handleResetDropStats = () => {
        setSessions(prev => prev.map(s => ({
            ...s,
            dropCount: 0,
            lastDropTime: undefined,
            lastDropError: undefined,
            lastDropPort: undefined
        })));
        setDirty(true);
    };

    const activeSession = sessions.find(s => s.id === activeSessionId);

    return (
        <div className="flex h-full bg-slate-100 font-sans text-slate-900 overflow-hidden select-none">
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleWebFileUpload} />
            
            <ModbusHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <ModbusSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <ModbusSlaveStabilityModal 
                isOpen={isStabilityMonitorOpen} 
                onClose={() => setIsStabilityMonitorOpen(false)} 
                sessions={sessions} 
                onResetStats={handleResetDropStats} 
            />
            <ModbusSlaveSessionModal 
                isOpen={isSessionModalOpen} 
                onClose={() => { setIsSessionModalOpen(false); setEditingSessionData(null); }} 
                onSave={handleSaveSessionConfig} 
                initialData={editingSessionData} 
            />
            <ModbusSlaveStabilityModal 
                isOpen={isStabilityMonitorOpen} 
                onClose={() => setIsStabilityMonitorOpen(false)} 
                sessions={sessions} 
                onResetStats={handleResetDropStats} 
            />
            {/* Sidebar */}
            <div className="w-80 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 z-30 shadow-xl h-full">
                <div className="h-14 flex items-center px-4 font-bold text-white border-b border-slate-800 gap-2 bg-slate-950 shadow-sm shrink-0">
                    <div className="p-1.5 bg-amber-600 rounded"><Server className="w-4 h-4 text-white" /></div>
                    <span className="truncate">Modbus Slave</span>
                    <button onClick={() => { setEditingSessionData(null); setIsSessionModalOpen(true); }} className="ml-auto p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-2 shrink-0">
                     <button onClick={handleNewProject} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FilePlus className="w-3.5 h-3.5 text-amber-400" /><span className="text-[10px] font-bold">新建</span></button>
                    <button onClick={handleOpenProject} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><FolderOpen className="w-3.5 h-3.5 text-blue-400" /><span className="text-[10px] font-bold">打开</span></button>
                    <button onClick={handleSaveProjectLocal} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm"><Save className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] font-bold">保存</span></button>
                </div>
                <div className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-thumb-slate-700 px-2 space-y-1 min-h-0">
                     <div className="px-2 pb-2 text-[9px] font-black text-slate-500 uppercase tracking-widest flex justify-between items-center"><span>会话 (SESSIONS)</span><div className="flex gap-2">{selectedSessionIds.size > 0 && <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded-full">{selectedSessionIds.size} 已选</span>}<span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{sessions.length}</span></div></div>
                    {sessions.map((s, idx) => {
                        return (
                            <SidebarItem
                                key={s.id}
                                s={s}
                                idx={idx}
                                isActive={s.id === activeSessionId}
                                isSelected={selectedSessionIds.has(s.id)}
                                onClick={handleSessionClick}
                                onToggle={handleToggleServer}
                                onEdit={(session) => { setEditingSessionData(session); setIsSessionModalOpen(true); }}
                                onDelete={handleSingleDelete}
                            />
                        )
                    })}
                </div>
                <div className="p-3 border-t border-slate-800 bg-slate-950 gap-2 flex flex-col shrink-0"><div className="grid grid-cols-2 gap-2 mb-1"><button onClick={handleConnectAll} className="flex items-center justify-center gap-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-500 border border-emerald-900/50 py-1.5 rounded text-xs font-bold transition-all"><Play className="w-3 h-3 fill-current" /> 全部启动</button><button onClick={handleDisconnectAll} className="flex items-center justify-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 py-1.5 rounded text-xs font-bold transition-all"><Square className="w-3 h-3 fill-current" /> 全部停止</button></div><div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800"><div className="flex-1 flex items-center gap-1 px-1"><span className="text-[10px] text-slate-500 font-bold uppercase">数量</span><input type="number" min="1" max="20" value={createCount} onChange={e => setCreateCount(Number(e.target.value))} className="w-10 bg-slate-800 text-slate-300 text-xs text-center border border-slate-700 rounded h-6 font-mono" /></div><button onClick={() => createNewSessions(createCount)} className="p-1.5 text-amber-500 hover:bg-slate-800 rounded" title="批量新建"><Plus className="w-4 h-4" /></button><button onClick={handleCopySessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="复制会话"><Copy className="w-4 h-4" /></button><button onClick={handlePasteSessions} disabled={!clipboardSessions} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20" title="粘贴会话"><ClipboardPaste className="w-4 h-4" /></button><button onClick={deleteSelectedSessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-red-500 hover:bg-slate-800 rounded disabled:opacity-20" title="删除选中"><Trash2 className="w-4 h-4" /></button></div><div className="flex gap-2 mt-1"><button onClick={() => setIsHelpOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="帮助文档"><HelpCircle className="w-4 h-4" /></button><button onClick={() => setIsSettingsOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-amber-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="全局设置"><Settings className="w-4 h-4" /></button><button onClick={() => setIsStabilityMonitorOpen(true)} className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800" title="网络稳定性监控"><Activity className="w-4 h-4" /></button></div></div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeSession ? (
                        <ModbusSlaveWorkspace session={activeSession} onUpdateSession={handleUpdateSession} consoleLogs={EMPTY_ARRAY} onClearConsole={handleClearConsole} />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-6">
                            <div className="p-8 bg-white rounded-full border border-slate-200 shadow-xl"><Server className="w-20 h-20 opacity-5" /></div>
                            <p className="font-black text-lg text-slate-700 uppercase tracking-widest">无活跃会话</p>
                            <button onClick={() => { setEditingSessionData(null); setIsSessionModalOpen(true); }} className="px-8 py-3 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all flex items-center gap-2"><Plus className="w-4 h-4" /> 初始化新从站</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
