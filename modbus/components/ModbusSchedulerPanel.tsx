
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ModbusSessionInfo, ModbusSchedulerTask, ModbusRegisterConfig } from '../../types';
import { modbusService } from '../services/modbusService';
import { ArrowRightLeft, Plus, Trash2, Play, Pause, Activity, X, ArrowRight, Zap, CheckSquare, Square, Search, Filter, AlertTriangle, Link2, Edit3, ChevronDown, ChevronUp, ArrowUp, ArrowDown, ListPlus, MinusSquare, ArrowDownAZ, GripVertical, Clock, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import ValueDisplay from '../../components/ValueDisplay';

interface ModbusSchedulerPanelProps {
    session: ModbusSessionInfo;
    onUpdate: (updates: Partial<ModbusSessionInfo>) => void;
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
}

// --- HELPER: Visual Item Renderer (Improved) ---
const RegisterItemDisplay: React.FC<{ reg: ModbusRegisterConfig, isSelected: boolean }> = ({ reg, isSelected }) => (
    <div className="flex-1 min-w-0">
        <div className={`truncate font-bold text-xs ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{reg.name}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
            {/* Function Code Badge */}
            <span className={`px-1 rounded border font-mono text-[9px] ${isSelected ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                FC:{reg.functionCode}
            </span>
            {/* Address */}
            <span className="font-mono text-indigo-600 font-bold">
                Addr:{reg.address}
            </span>
            {/* Data Type */}
            <span className="text-slate-500 font-mono">
                {reg.dataType}[{reg.length}]
            </span>
        </div>
    </div>
);

// --- SUB-COMPONENT: Candidate Dropdown Selector ---
const CandidateSelector: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    candidates: ModbusRegisterConfig[];
    onConfirm: (ids: string[]) => void;
    title: string;
}> = ({ isOpen, onClose, candidates, onConfirm, title }) => {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    
    // Auto-reset when opened
    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setSelected(new Set());
        }
    }, [isOpen]);

    const filtered = useMemo(() => {
        if (!search) return candidates;
        const lower = search.toLowerCase();
        return candidates.filter(c => c.name.toLowerCase().includes(lower) || String(c.address).includes(lower));
    }, [candidates, search]);

    const handleToggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const handleAddSelected = () => {
        if (selected.size > 0) {
            onConfirm(Array.from(selected));
            onClose();
        }
    };

    const handleAddAll = () => {
        if (filtered.length > 0) {
            onConfirm(filtered.map(c => c.id));
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute top-10 left-0 w-72 bg-white border border-slate-300 rounded-lg shadow-xl z-50 flex flex-col max-h-[400px] animate-in fade-in zoom-in-95 duration-100">
            <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">{title}</span>
                <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
            </div>
            
            <div className="p-2 border-b border-slate-100 bg-white">
                <div className="relative">
                    <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
                    <input 
                        className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-400"
                        placeholder="搜索名称或地址..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1">
                {filtered.length === 0 ? <div className="text-center p-6 text-xs text-slate-400 italic">没有匹配的通道</div> : (
                    filtered.map(c => (
                        <div 
                            key={c.id} 
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 text-xs transition-colors ${selected.has(c.id) ? 'bg-blue-50' : ''}`}
                            onClick={() => handleToggle(c.id)}
                        >
                            <div className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${selected.has(c.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'}`}>
                                {selected.has(c.id) && <CheckSquare className="w-3 h-3 text-white" />}
                            </div>
                            <RegisterItemDisplay reg={c} isSelected={selected.has(c.id)} />
                        </div>
                    ))
                )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex gap-2">
                <button onClick={handleAddAll} className="flex-1 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded">
                    添加全部 ({filtered.length})
                </button>
                <button onClick={handleAddSelected} disabled={selected.size===0} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow-sm disabled:opacity-50">
                    添加选中 ({selected.size})
                </button>
            </div>
        </div>
    );
};

// Helper to determine if values are effectively equal
const isValuesEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return false;
};

export const ModbusSchedulerPanel: React.FC<ModbusSchedulerPanelProps> = ({ session, onUpdate, addLog }) => {
    const { t } = useLanguage();
    const tasks = session.config.schedulerTasks || [];
    const registers = session.config.registers;
    
    // --- PERSISTED LISTS (References via ID) ---
    const sourceIds = session.config.schedulerSourceIds || [];
    const targetIds = session.config.schedulerTargetIds || [];

    // --- SELECTION STATE ---
    const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
    const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    
    // Last clicked for Shift-Select logic
    const [lastSourceId, setLastSourceId] = useState<string | null>(null);
    const [lastTargetId, setLastTargetId] = useState<string | null>(null);
    const [lastTaskId, setLastTaskId] = useState<string | null>(null);

    // --- UI STATE ---
    const [showSourceSelector, setShowSourceSelector] = useState(false);
    const [showTargetSelector, setShowTargetSelector] = useState(false);
    const [isRunning, setIsRunning] = useState(true);
    const [dragOverInputId, setDragOverInputId] = useState<string | null>(null);
    
    // --- SCHEDULER CONFIG ---
    // Default to 10ms (high speed), min 10ms.
    const [loopIntervalMs, setLoopIntervalMs] = useState<number>(10);

    // --- RESOLVE LISTS (IDs -> Objects) ---
    const sourceList = useMemo(() => {
        return sourceIds.map(id => registers.find(r => r.id === id)).filter(r => r !== undefined) as ModbusRegisterConfig[];
    }, [sourceIds, registers]);

    const targetList = useMemo(() => {
        return targetIds.map(id => registers.find(r => r.id === id)).filter(r => r !== undefined) as ModbusRegisterConfig[];
    }, [targetIds, registers]);

    // --- CANDIDATES FOR DROPDOWN ---
    const availableSources = useMemo(() => {
        const currentSet = new Set(sourceIds);
        return registers.filter(r => ['01', '02', '03', '04'].includes(r.functionCode) && !currentSet.has(r.id));
    }, [registers, sourceIds]);

    const availableTargets = useMemo(() => {
        const currentSet = new Set(targetIds);
        return registers.filter(r => ['05', '06', '15', '16'].includes(r.functionCode) && !currentSet.has(r.id));
    }, [registers, targetIds]);

    // --- ENGINE LOOP (CORRECTED: STATE SYNC ONLY) ---
    // Use Ref to hold latest session data to avoid interval resets
    const sessionRef = useRef(session);
    useEffect(() => { sessionRef.current = session; }, [session]);

    // Ref to track last active transfer time per task to debounce "Synced" state
    const lastActiveRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        if (session.status !== 'CONNECTED' || !isRunning) return;

        // Use configurable interval
        const effectiveInterval = Math.max(10, loopIntervalMs);

        const interval = setInterval(() => {
            const currentSession = sessionRef.current;
            const currentTasks = currentSession.config.schedulerTasks || [];
            const currentRegisters = currentSession.config.registers;
            
            const taskUpdates = new Map<string, Partial<ModbusSchedulerTask>>();
            const registerUpdates = new Map<string, Partial<ModbusRegisterConfig>>();
            const now = Date.now();
            
            currentTasks.forEach(task => {
                if (!task.enabled) return;

                const source = currentRegisters.find(r => r.id === task.sourceRegId);
                const target = currentRegisters.find(r => r.id === task.targetRegId);

                if (source && target) {
                    // Type Safety Check (Loose check for numbers)
                    const isTypeCompatible = (source.dataType === target.dataType) || 
                                             (['Int16','UInt16','Int32','UInt32'].includes(source.dataType) && ['Int16','UInt16','Int32','UInt32'].includes(target.dataType));

                    if (!isTypeCompatible) {
                        if (task.status !== 'Error (Type Mismatch)') {
                            taskUpdates.set(task.id, { 
                                status: 'Error (Type Mismatch)',
                                errorCount: task.errorCount + 1
                            });
                        }
                        return;
                    }

                    // *** FORCED SYNC: Target = Source ***
                    // If Source is valid (not Bad), we force Target to match Source.
                    // This is purely a React State Update. No network call here.
                    // The "Write" happens when the backend scans the Target register later.
                    if (!source.status || source.status.startsWith('Good') || source.status === 'Idle') {
                        
                        let valToWrite = source.value;
                        
                        // Array Slicing Safety
                        if (Array.isArray(valToWrite) && target.length > 0) {
                            const safeLength = Math.min(valToWrite.length, target.length);
                            if (valToWrite.length !== safeLength) {
                                valToWrite = valToWrite.slice(0, safeLength);
                            }
                        }

                        // --- CORE LOGIC: ONLY UPDATE IF DIFFERENT ---
                        if (!isValuesEqual(target.value, valToWrite)) {
                            // Update Target Register State
                            registerUpdates.set(target.id, {
                                value: valToWrite,
                            });

                            // Track last active transfer time
                            lastActiveRef.current.set(task.id, now);

                            // Update Task Stats
                            taskUpdates.set(task.id, {
                                lastValue: source.value,
                                lastRunTime: new Date().toLocaleTimeString(),
                                transferCount: task.transferCount + 1,
                                status: 'Running'
                            });
                        } else {
                            // Already synced logic with Debounce
                            const lastActive = lastActiveRef.current.get(task.id) || 0;
                            // Keep 'Running' status visible for 1 second after last real transfer to prevent flickering
                            const isRecentlyActive = (now - lastActive) < 1000;

                            if (isRecentlyActive) {
                                if (task.status !== 'Running') {
                                    taskUpdates.set(task.id, { status: 'Running' });
                                }
                            } else {
                                if (task.status !== 'Synced') {
                                    taskUpdates.set(task.id, { status: 'Synced' });
                                }
                            }
                        }
                    }
                } else {
                    if (task.status !== 'Error (Missing)') {
                        taskUpdates.set(task.id, { status: 'Error (Missing)' });
                    }
                }
            });

            // Commit updates to global state
            if (taskUpdates.size > 0 || registerUpdates.size > 0) {
                const newTasks = sessionRef.current.config.schedulerTasks.map(t => {
                    const up = taskUpdates.get(t.id);
                    return up ? { ...t, ...up } : t;
                });

                const newRegisters = sessionRef.current.config.registers.map(r => {
                    const regUp = registerUpdates.get(r.id);
                    return regUp ? { ...r, ...regUp } : r;
                });

                onUpdate({ 
                    config: { 
                        ...sessionRef.current.config, 
                        schedulerTasks: newTasks,
                        registers: newRegisters // This propagates the Source Value to the Target Register
                    } 
                });
            }
        }, effectiveInterval);

        return () => clearInterval(interval);
    }, [session.status, isRunning, loopIntervalMs]); 

    // --- LIST HANDLERS ---

    const updateSourceList = (newIds: string[]) => onUpdate({ config: { ...session.config, schedulerSourceIds: newIds } });
    const updateTargetList = (newIds: string[]) => onUpdate({ config: { ...session.config, schedulerTargetIds: newIds } });

    const handleAddSources = (ids: string[]) => updateSourceList([...sourceIds, ...ids]);
    const handleAddTargets = (ids: string[]) => updateTargetList([...targetIds, ...ids]);

    const handleRemoveSelectedSources = () => {
        updateSourceList(sourceIds.filter(id => !selectedSourceIds.has(id)));
        setSelectedSourceIds(new Set());
    };

    const handleRemoveSelectedTargets = () => {
        updateTargetList(targetIds.filter(id => !selectedTargetIds.has(id)));
        setSelectedTargetIds(new Set());
    };

    const handleListClick = (e: React.MouseEvent, id: string, index: number, type: 'source'|'target') => {
        const isSource = type === 'source';
        const selected = isSource ? selectedSourceIds : selectedTargetIds;
        const setSelected = isSource ? setSelectedSourceIds : setSelectedTargetIds;
        const lastId = isSource ? lastSourceId : lastTargetId;
        const setLastId = isSource ? setLastSourceId : setLastTargetId;
        const list = isSource ? sourceIds : targetIds;

        const newSet = new Set(e.ctrlKey ? selected : []);
        
        if (e.shiftKey && lastId) {
            const start = list.indexOf(lastId);
            const end = index;
            if (start !== -1) {
                const low = Math.min(start, end);
                const high = Math.max(start, end);
                for(let i=low; i<=high; i++) newSet.add(list[i]);
            }
        } else {
            if (e.ctrlKey && newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            setLastId(id);
        }
        setSelected(newSet);
    };

    // Move Items Logic (Updated)
    const moveItems = (type: 'source'|'target', direction: 'up'|'down') => {
        const list = type === 'source' ? sourceIds : targetIds;
        const selected = type === 'source' ? selectedSourceIds : selectedTargetIds;
        const update = type === 'source' ? updateSourceList : updateTargetList;
        
        if (selected.size === 0) return;

        const newList = [...list];
        
        if (direction === 'up') {
            const firstIdx = newList.findIndex(id => selected.has(id));
            if (firstIdx <= 0) return; 

            for (let i = 1; i < newList.length; i++) {
                if (selected.has(newList[i]) && !selected.has(newList[i-1])) {
                    [newList[i], newList[i-1]] = [newList[i-1], newList[i]];
                }
            }
        } else {
            let lastIdx = -1;
            for(let i=newList.length-1; i>=0; i--) { if(selected.has(newList[i])) { lastIdx=i; break; } }
            if (lastIdx === -1 || lastIdx >= newList.length - 1) return;

            for (let i = newList.length - 2; i >= 0; i--) {
                if (selected.has(newList[i]) && !selected.has(newList[i+1])) {
                    [newList[i], newList[i+1]] = [newList[i+1], newList[i]];
                }
            }
        }
        update(newList);
    };

    // Sort Handler
    const handleSortList = (type: 'source' | 'target') => {
        const list = type === 'source' ? sourceList : targetList;
        const sorted = [...list].sort((a, b) => a.address - b.address);
        const sortedIds = sorted.map(r => r.id);
        if (type === 'source') updateSourceList(sortedIds);
        else updateTargetList(sortedIds);
        addLog('info', `已按地址对${type === 'source' ? '源' : '目标'}列表进行排序。`);
    };

    // Drag Source/Target Item
    const handleItemDragStart = (e: React.DragEvent, reg: ModbusRegisterConfig) => {
        e.dataTransfer.setData('application/modbus-reg-id', reg.id);
        e.dataTransfer.effectAllowed = 'copy';
    };

    // Task Input Drop
    const handleInputDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        setDragOverInputId(id);
    };

    const handleInputDragLeave = () => setDragOverInputId(null);

    const handleInputDrop = (e: React.DragEvent, taskId: string, field: 'source' | 'target') => {
        e.preventDefault();
        setDragOverInputId(null);
        const regId = e.dataTransfer.getData('application/modbus-reg-id');
        if (!regId) return;

        const reg = registers.find(r => r.id === regId);
        if (!reg) return;

        // Check compatibility warning (optional)
        if (field === 'source' && !['01','02','03','04'].includes(reg.functionCode)) {
            addLog('warn', `Warning: Using write-only register ${reg.name} as source.`);
        }
        if (field === 'target' && !['05','06','15','16'].includes(reg.functionCode)) {
            addLog('warn', `Warning: Using read-only register ${reg.name} as target.`);
        }

        const newTasks = tasks.map(t => {
            if (t.id === taskId) {
                // Smart Rename if unassigned
                let newName = t.name;
                if (t.name.startsWith('New Task') || t.name.includes('->')) {
                    const srcName = field === 'source' ? reg.name : (registers.find(r=>r.id===t.sourceRegId)?.name || '?');
                    const tgtName = field === 'target' ? reg.name : (registers.find(r=>r.id===t.targetRegId)?.name || '?');
                    newName = `Map ${srcName} -> ${tgtName}`;
                }
                
                return { 
                    ...t, 
                    [field === 'source' ? 'sourceRegId' : 'targetRegId']: regId,
                    name: newName,
                    status: 'Idle' // Reset status
                };
            }
            return t;
        });
        onUpdate({ config: { ...session.config, schedulerTasks: newTasks } });
    };

    // --- TASK HANDLERS ---

    const handleAddEmptyTask = () => {
        const newTask: ModbusSchedulerTask = {
            id: Math.random().toString(36).substr(2, 9),
            name: `New Task ${tasks.length + 1}`,
            enabled: true,
            sourceRegId: '',
            targetRegId: '',
            transferCount: 0,
            errorCount: 0,
            status: 'Idle'
        };
        onUpdate({ config: { ...session.config, schedulerTasks: [...tasks, newTask] } });
    };

    const handleManualLink = () => {
        if (selectedSourceIds.size !== 1 || selectedTargetIds.size !== 1) {
            addLog('warn', '请在源列表和目标列表中各选择一项。');
            return;
        }
        
        const srcId = Array.from(selectedSourceIds)[0];
        const tgtId = Array.from(selectedTargetIds)[0];
        
        const src = registers.find(r => r.id === srcId);
        const tgt = registers.find(r => r.id === tgtId);
        
        if (!src || !tgt) return;

        // Note: Length check removed here, will be handled at runtime
        
        const newTask: ModbusSchedulerTask = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Map ${src.name} -> ${tgt.name}`,
            enabled: true,
            sourceRegId: src.id,
            targetRegId: tgt.id,
            transferCount: 0,
            errorCount: 0,
            status: 'Idle'
        };
        onUpdate({ config: { ...session.config, schedulerTasks: [...tasks, newTask] } });
    };

    const handleSmartAutoMap = () => {
        // 1. Sort both lists first? Maybe optional. User asked for smart mapping.
        // Let's map based on current visual order in list (which is sourceIds order)
        
        const count = Math.min(sourceList.length, targetList.length);
        if (count === 0) return;

        const newTasks: ModbusSchedulerTask[] = [];
        let created = 0;
        let warnings = 0;

        for (let i = 0; i < count; i++) {
            const src = sourceList[i];
            const tgt = targetList[i];
            
            const exists = tasks.some(t => t.sourceRegId === src.id && t.targetRegId === tgt.id);
            if (!exists) {
                // Relaxed Type Check: Allow mismatches but warn logic or simple compatibility
                const typeMismatch = src.dataType !== tgt.dataType;
                
                // Allow creation even if lengths differ (handled by runtime slicing)
                const lenMismatch = src.length !== tgt.length;
                
                if (typeMismatch) warnings++;

                newTasks.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: `Auto ${src.name} -> ${tgt.name}`,
                    enabled: true,
                    sourceRegId: src.id,
                    targetRegId: tgt.id,
                    transferCount: 0,
                    errorCount: 0,
                    status: 'Idle'
                });
                created++;
            }
        }

        if (created > 0) {
            onUpdate({ config: { ...session.config, schedulerTasks: [...tasks, ...newTasks] } });
            addLog('success', `自动创建了 ${created} 个映射任务。`);
            if (warnings > 0) addLog('warn', `注意: ${warnings} 个任务存在数据类型差异。`);
        } else {
            addLog('info', '未找到新的可配对项。');
        }
    };

    const handleDeleteTasks = () => {
        const newTasks = tasks.filter(t => !selectedTaskIds.has(t.id));
        onUpdate({ config: { ...session.config, schedulerTasks: newTasks } });
        setSelectedTaskIds(new Set());
    };

    const handleDeleteSingleTask = (id: string) => {
        const newTasks = tasks.filter(t => t.id !== id);
        onUpdate({ config: { ...session.config, schedulerTasks: newTasks } });
        if (selectedTaskIds.has(id)) {
            const next = new Set(selectedTaskIds);
            next.delete(id);
            setSelectedTaskIds(next);
        }
    };

    const toggleTaskSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(e.ctrlKey ? selectedTaskIds : []);
        
        if (e.shiftKey && lastTaskId) {
            const ids = tasks.map(t => t.id);
            const start = ids.indexOf(lastTaskId);
            const end = ids.indexOf(id);
            if (start !== -1 && end !== -1) {
                const low = Math.min(start, end);
                const high = Math.max(start, end);
                for (let i = low; i <= high; i++) newSet.add(ids[i]);
            }
        } else if(e.ctrlKey) { 
            if(newSet.has(id)) newSet.delete(id); else newSet.add(id); 
            setLastTaskId(id);
        } else { 
            if(selectedTaskIds.has(id) && selectedTaskIds.size === 1) newSet.clear(); else newSet.add(id);
            setLastTaskId(id);
        }
        setSelectedTaskIds(newSet);
    };

    const handleToggleEnable = (id: string, current: boolean) => {
        const newTasks = tasks.map(t => t.id === id ? { ...t, enabled: !current, status: !current ? 'Idle' : 'Disabled' } : t);
        onUpdate({ config: { ...session.config, schedulerTasks: newTasks } });
    };

    // Helper for rendering input
    const renderRegisterInput = (taskId: string, regId: string, field: 'source' | 'target') => {
        const reg = registers.find(r => r.id === regId);
        const isActive = dragOverInputId === `${taskId}:${field}`;
        
        return (
            <div 
                className={`flex-1 border rounded px-2 py-1 text-xs truncate transition-all ${isActive ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200 bg-slate-50'}`}
                onDragOver={(e) => handleInputDragOver(e, `${taskId}:${field}`)}
                onDragLeave={handleInputDragLeave}
                onDrop={(e) => handleInputDrop(e, taskId, field)}
                title={reg ? `${reg.name} (Addr: ${reg.address})` : 'Drop register here'}
            >
                {reg ? (
                    <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-700">{reg.name}</span>
                        <span className="text-slate-400 font-mono text-[9px]">{reg.dataType}[{reg.length}]</span>
                    </div>
                ) : (
                    <span className="text-slate-400 italic">Drop {field} here...</span>
                )}
            </div>
        );
    };

    return (
        <div className="flex h-full bg-slate-50">
            {/* LEFT: Source List */}
            <div className="w-1/4 bg-white border-r border-slate-200 flex flex-col min-w-[220px] relative">
                {/* Header */}
                <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Search className="w-4 h-4 text-blue-600" /> 源列表 (Read)
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px] font-mono mr-1">{sourceList.length}</span>
                        
                        <button onClick={() => moveItems('source', 'up')} disabled={selectedSourceIds.size===0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30" title="Move Up"><ArrowUp className="w-3.5 h-3.5"/></button>
                        <button onClick={() => moveItems('source', 'down')} disabled={selectedSourceIds.size===0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30" title="Move Down"><ArrowDown className="w-3.5 h-3.5"/></button>
                        <button onClick={() => handleSortList('source')} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="按地址排序"><ArrowDownAZ className="w-3.5 h-3.5"/></button>
                        <button onClick={handleRemoveSelectedSources} disabled={selectedSourceIds.size===0} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded disabled:opacity-30"><Trash2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => setShowSourceSelector(!showSourceSelector)} className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded ml-1"><Plus className="w-3.5 h-3.5"/></button>
                    </div>
                </div>
                
                {/* Selector Dropdown */}
                <CandidateSelector 
                    isOpen={showSourceSelector} 
                    onClose={() => setShowSourceSelector(false)} 
                    candidates={availableSources}
                    onConfirm={handleAddSources}
                    title="添加源通道 (FC 01-04)"
                />

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-1 space-y-0.5 select-none" onClick={() => setSelectedSourceIds(new Set())}>
                    {sourceList.length === 0 && <div className="p-8 text-center text-slate-300 text-xs italic">列表为空<br/>点击右上角 + 添加</div>}
                    {sourceList.map((reg, idx) => (
                        <div 
                            key={reg.id} 
                            onClick={(e) => { e.stopPropagation(); handleListClick(e, reg.id, idx, 'source'); }}
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, reg)}
                            className={`p-2 rounded border cursor-pointer text-xs transition-colors flex items-center justify-between group ${selectedSourceIds.has(reg.id) ? 'bg-blue-50 border-blue-300 shadow-sm z-10 relative' : 'bg-white border-transparent hover:bg-slate-50 border-b-slate-100'}`}
                        >
                            <div className="flex flex-col truncate min-w-0 flex-1 pointer-events-none">
                                <div className="flex items-center gap-2">
                                    <span className={`font-mono text-[10px] px-1 rounded border ${selectedSourceIds.has(reg.id) ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{idx+1}</span>
                                    {/* Use Enhanced Renderer */}
                                    <RegisterItemDisplay reg={reg} isSelected={selectedSourceIds.has(reg.id)} />
                                </div>
                            </div>
                            <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab" />
                        </div>
                    ))}
                </div>
            </div>

            {/* MIDDLE: Target List */}
            <div className="w-1/4 bg-white border-r border-slate-200 flex flex-col min-w-[220px] relative">
                <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Edit3 className="w-4 h-4 text-amber-600" /> 目标列表 (Write)
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px] font-mono mr-1">{targetList.length}</span>
                        
                        <button onClick={() => moveItems('target', 'up')} disabled={selectedTargetIds.size===0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30" title="Move Up"><ArrowUp className="w-3.5 h-3.5"/></button>
                        <button onClick={() => moveItems('target', 'down')} disabled={selectedTargetIds.size===0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30" title="Move Down"><ArrowDown className="w-3.5 h-3.5"/></button>
                        <button onClick={() => handleSortList('target')} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="按地址排序"><ArrowDownAZ className="w-3.5 h-3.5"/></button>
                        <button onClick={handleRemoveSelectedTargets} disabled={selectedTargetIds.size===0} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded disabled:opacity-30"><Trash2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => setShowTargetSelector(!showTargetSelector)} className="p-1 bg-amber-100 hover:bg-amber-200 text-amber-600 rounded ml-1"><Plus className="w-3.5 h-3.5"/></button>
                    </div>
                </div>

                <CandidateSelector 
                    isOpen={showTargetSelector} 
                    onClose={() => setShowTargetSelector(false)} 
                    candidates={availableTargets}
                    onConfirm={handleAddTargets}
                    title="添加目标通道 (FC 05-16)"
                />

                <div className="flex-1 overflow-y-auto p-1 space-y-0.5 select-none" onClick={() => setSelectedTargetIds(new Set())}>
                    {targetList.length === 0 && <div className="p-8 text-center text-slate-300 text-xs italic">列表为空<br/>点击右上角 + 添加</div>}
                    {targetList.map((reg, idx) => (
                        <div 
                            key={reg.id} 
                            onClick={(e) => { e.stopPropagation(); handleListClick(e, reg.id, idx, 'target'); }}
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, reg)}
                            className={`p-2 rounded border cursor-pointer text-xs transition-colors flex items-center justify-between group ${selectedTargetIds.has(reg.id) ? 'bg-amber-50 border-amber-300 shadow-sm z-10 relative' : 'bg-white border-transparent hover:bg-slate-50 border-b-slate-100'}`}
                        >
                            <div className="flex flex-col truncate min-w-0 flex-1 pointer-events-none">
                                <div className="flex items-center gap-2">
                                    <span className={`font-mono text-[10px] px-1 rounded border ${selectedTargetIds.has(reg.id) ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{idx+1}</span>
                                    {/* Use Enhanced Renderer */}
                                    <RegisterItemDisplay reg={reg} isSelected={selectedTargetIds.has(reg.id)} />
                                </div>
                            </div>
                            <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab" />
                        </div>
                    ))}
                </div>
            </div>

            {/* ACTION BAR */}
            <div className="flex flex-col justify-center gap-4 p-2 border-r border-slate-200 bg-slate-50/80 items-center">
                <button 
                    onClick={handleManualLink} 
                    disabled={selectedSourceIds.size !== 1 || selectedTargetIds.size !== 1}
                    className="p-2 bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    title="添加手动映射 (需各选一项)"
                >
                    <Link2 className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleSmartAutoMap}
                    disabled={sourceList.length === 0 || targetList.length === 0}
                    className="p-2 bg-white border border-slate-300 hover:border-emerald-400 hover:text-emerald-600 rounded-lg shadow-sm transition-all disabled:opacity-50"
                    title="按列表顺序自动映射 (Auto Map)"
                >
                    <ArrowRightLeft className="w-5 h-5" />
                </button>
            </div>

            {/* RIGHT: Tasks */}
            <div className="flex-1 flex flex-col bg-slate-50/30 overflow-hidden">
                <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-rose-100 rounded text-rose-600"><Activity className="w-4 h-4"/></div>
                        <div>
                            <h3 className="font-bold text-sm text-slate-700">{t.modbusScheduler.title}</h3>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <span className="bg-slate-100 px-1.5 rounded font-bold">{tasks.length} 任务</span>
                                <span className={`flex items-center gap-1 ${session.isScanning ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    • {session.isScanning ? 'Running' : 'Stopped'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Loop Control Input */}
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase px-1 flex items-center gap-1">
                            <Clock className="w-3 h-3"/> Cycle(ms)
                        </span>
                        <div className="relative">
                            <input 
                                type="number" 
                                min="10" 
                                max="60000" 
                                step="10"
                                className={`w-16 h-6 text-xs text-center border rounded outline-none font-bold font-mono transition-colors border-slate-300 text-slate-700 bg-white`}
                                value={loopIntervalMs}
                                onChange={e => setLoopIntervalMs(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={handleAddEmptyTask} className="p-1.5 bg-slate-100 hover:bg-blue-50 text-blue-600 rounded border border-slate-200" title="添加空任务">
                            <Plus className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <button onClick={() => setIsRunning(!isRunning)} className={`p-1.5 rounded transition-colors ${isRunning ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`} title={isRunning ? "Engine Running" : "Engine Paused"}>
                            {isRunning ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current"/>}
                        </button>
                        {selectedTaskIds.size > 0 && (
                            <button onClick={handleDeleteTasks} className="flex items-center gap-1 px-2 py-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded transition-colors text-xs font-bold border border-red-200">
                                <Trash2 className="w-3.5 h-3.5" /> 删除 ({selectedTaskIds.size})
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2" onClick={() => setSelectedTaskIds(new Set())}>
                    {tasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-60">
                            <ListPlus className="w-12 h-12 stroke-1"/>
                            <p className="text-sm italic">暂无映射任务</p>
                            <p className="text-xs">请从左侧列表拖拽或点击 + 添加</p>
                        </div>
                    )}
                    {tasks.map((task, index) => {
                        const src = registers.find(r => r.id === task.sourceRegId);
                        const tgt = registers.find(r => r.id === task.targetRegId);
                        const isSelected = selectedTaskIds.has(task.id);
                        const isMismatch = task.status.includes('Mismatch');

                        return (
                            <div 
                                key={task.id} 
                                className={`bg-white border rounded-lg p-2 shadow-sm flex items-center gap-3 transition-all cursor-pointer ${isSelected ? 'border-blue-400 ring-1 ring-blue-200' : isMismatch ? 'border-red-300 bg-red-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                                onClick={(e) => toggleTaskSelection(task.id, e)}
                            >
                                {/* Checkbox & Index */}
                                <div className="flex flex-col items-center gap-1 min-w-[24px]">
                                    <div className={`text-[10px] font-bold ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>{index + 1}</div>
                                    <div className="text-slate-300">{isSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-500"/> : <Square className="w-3.5 h-3.5"/>}</div>
                                </div>

                                <div className="flex flex-col items-center gap-1 border-r border-slate-100 pr-2">
                                    <button onClick={(e) => { e.stopPropagation(); handleToggleEnable(task.id, task.enabled); }} className={`w-8 h-4 rounded-full relative transition-colors ${task.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${task.enabled ? 'left-4.5' : 'left-0.5'}`}></div>
                                    </button>
                                </div>

                                <div className="flex-1 grid grid-cols-7 gap-2 items-center text-xs">
                                    {/* Source Input */}
                                    <div className="col-span-3">
                                        {renderRegisterInput(task.id, task.sourceRegId, 'source')}
                                        {src && (
                                            <div className="mt-1 w-full overflow-hidden flex justify-end" title="Source Value" onClick={e => e.stopPropagation()}>
                                                <ValueDisplay value={src.value} dataType={src.dataType} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Arrow */}
                                    <div className="col-span-1 flex justify-center text-slate-300">
                                        {isMismatch ? <AlertTriangle className="w-4 h-4 text-red-500"/> : <ArrowRight className="w-4 h-4"/>}
                                    </div>

                                    {/* Target Input */}
                                    <div className="col-span-3">
                                        {renderRegisterInput(task.id, task.targetRegId, 'target')}
                                        {tgt && (
                                            <div className="mt-1 w-full overflow-hidden flex justify-end" title="Target Value (Verify Write)" onClick={e => e.stopPropagation()}>
                                                <ValueDisplay value={tgt.value} dataType={tgt.dataType} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end min-w-[60px] border-l border-slate-100 pl-2">
                                    <div className={`text-[10px] font-bold ${task.status === 'Running' ? 'text-emerald-600' : task.status.includes('Error') ? 'text-red-500' : task.status === 'Synced' ? 'text-blue-500' : 'text-slate-400'}`}>
                                        {task.status}
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono">{task.transferCount} ops</div>
                                </div>

                                {/* Delete Button */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSingleTask(task.id); }} 
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
