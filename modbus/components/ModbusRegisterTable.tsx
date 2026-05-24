
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ModbusSessionInfo, ModbusRegisterConfig, ModbusFunctionCode, ModbusDataType, ModbusEndianness, ModbusTriggerType } from '../../types';
import { modbusService } from '../services/modbusService';
import { Play, Pause, Plus, Trash2, Edit3, X, Save, Upload, Download, RefreshCw, Zap, Check, FileSpreadsheet, FileUp, FileDown, MoreVertical, Copy, ClipboardPaste, GripVertical, AlertTriangle, Info, Calculator, RotateCcw, Clock, Filter, ArrowUpRight, Activity } from 'lucide-react';
import { ModbusAddModal } from './ModbusAddModal';
import ValueDisplay from '../../components/ValueDisplay';

interface ModbusRegisterTableProps {
    session: ModbusSessionInfo;
    onUpdate: (updates: Partial<ModbusSessionInfo>) => void;
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
    isVisible: boolean; 
}

const ROW_HEIGHT = 40; 
const BUFFER_ROWS = 5;
const FC_DESC: Record<string, string> = {
    '01': '01 读线圈 (Coils)',
    '02': '02 读离散 (Discrete)',
    '03': '03 读保持 (Holding)',
    '04': '04 读输入 (Input)',
    '05': '05 写单线圈',
    '06': '06 写单寄存器',
    '15': '15 写多线圈',
    '16': '16 写多寄存器'
};

const Resizer = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div 
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-400 z-20 group-hover/header:bg-slate-200 hover:!bg-amber-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

export const ModbusRegisterTable: React.FC<ModbusRegisterTableProps> = ({ session, onUpdate, addLog, isVisible }) => {
    const isScanning = !!session.isScanning;
    const useGlobalScanRate = !!session.config.useGlobalScanRate; // Derived from config

    // --- RACE CONDITION BLOCKER ---
    // Ref to immediately block data processing when user clicks "Stop", 
    // protecting against trailing backend events overwriting the 'Idle' status.
    const ignoreIncomingDataRef = useRef(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filterMode, setFilterMode] = useState<'ALL' | 'ERRORS_ONLY'>('ALL');
    const [lastActiveTime, setLastActiveTime] = useState<string>('--:--:--');
    
    // --- RUNTIME VALUES ---
    // Use a ref for runtime values to avoid expensive global state updates
    const valuesRef = useRef<Record<string, any>>({});
    const [valuesVersion, setValuesVersion] = useState(0);

    // Initialize valuesRef from session config on mount or session change
    useEffect(() => {
        const newValues: Record<string, any> = {};
        session.config.registers.forEach(r => {
            if (r.value !== undefined || r.status) {
                newValues[r.id] = {
                    value: r.value,
                    status: r.status,
                    requestCount: r.requestCount,
                    errorCount: r.errorCount,
                    lastUpdate: r.lastUpdate,
                    lastLatency: r.lastLatency
                };
            }
        });
        valuesRef.current = newValues;
        setValuesVersion(v => v + 1);
    }, [session.id]);
    
    // --- COLUMNS STATE ---
    const [colWidths, setColWidths] = useState<any>({
        index: 50,
        name: 140, 
        functionCode: 160, 
        address: 80,
        length: 60,
        trigger: 120, 
        scanRate: 100,
        value: 150, 
        dataType: 100, 
        endianness: 80, 
        status: 80,
        requestCount: 80,
        error: 80, 
        actions: 60
    });
    const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

    // --- SCROLL / VIRTUALIZATION STATE ---
    const [scrollTop, setScrollTop] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    // --- SELECTION & EDIT STATE ---
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<ModbusRegisterConfig[]>([]);
    
    const [editingNode, setEditingNode] = useState<ModbusRegisterConfig | null>(null); 
    const [inlineEditId, setInlineEditId] = useState<string | null>(null); 
    const [inlineEditValue, setInlineEditValue] = useState("");

    // --- DATA HANDLING ---
    const sessionRef = useRef<ModbusSessionInfo>(session);
    useEffect(() => { sessionRef.current = session; }, [session]);

    // Ensure ignore ref is reset if scanning is active (e.g. on mount/refresh)
    useEffect(() => {
        if (session.isScanning) {
            ignoreIncomingDataRef.current = false;
        }
    }, [session.isScanning]);

    // *** BACKEND-DRIVEN POLLING INTEGRATION ***
    
    // 1. Listen for backend data
    useEffect(() => {
        const removeListener = modbusService.onDataReceived((data) => {
            // CRITICAL: Block updates if we initiated a stop
            if (ignoreIncomingDataRef.current) return;

            if (data.sessionId === session.id) {
                // Update timestamp
                setLastActiveTime(new Date().toLocaleTimeString());
                
                let hasChanges = false;
                const now = new Date().toLocaleTimeString();
                
                Object.keys(data.updates).forEach(regId => {
                    const update = data.updates[regId];
                    const existing = valuesRef.current[regId] || {};
                    valuesRef.current[regId] = {
                        value: update.value !== undefined ? update.value : existing.value,
                        status: update.status || existing.status,
                        requestCount: (existing.requestCount || 0) + 1,
                        errorCount: update.status === 'Bad' ? (existing.errorCount || 0) + 1 : existing.errorCount,
                        lastUpdate: now,
                        lastLatency: update.lastLatency
                    };
                    hasChanges = true;
                });
                
                if (hasChanges) {
                    setValuesVersion(v => v + 1);
                }
            }
        });
        return () => removeListener();
    }, [session.id]); // Only re-bind if session ID changes

    // 2. Control Backend Poller State
    useEffect(() => {
        if (session.status === 'CONNECTED') {
            if (isScanning) {
                // Determine Interval: Use global setting if checked, otherwise pass 0 to backend (0 = Individual Mode)
                const interval = session.config.useGlobalScanRate ? (session.config.scanRate || 1000) : 0;
                modbusService.startScan(session.id, session.config.registers, interval);
            } else {
                modbusService.stopScan(session.id);
            }
        }
    }, [isScanning, session.status, session.id, session.config.useGlobalScanRate, session.config.scanRate, session.config.registers]);

    // 3. Update Backend Config on Change (Hot Reload)
    useEffect(() => {
        if (session.status === 'CONNECTED' && isScanning) {
            const interval = session.config.useGlobalScanRate ? (session.config.scanRate || 1000) : 0;
            modbusService.updateScanConfig(session.id, session.config.registers, interval);
        }
    }, [session.config.registers, session.config.scanRate, session.config.useGlobalScanRate]); // Re-sync when regs or cycle mode changes

    // 4. Listen for Explicit Resets
    useEffect(() => {
        if (session._resetErrTick) {
            Object.values(valuesRef.current).forEach(current => {
                if (current) {
                    current.errorCount = 0;
                    current.errorStats = {};
                }
            });
            setValuesVersion(v => v + 1);
        }
    }, [session._resetErrTick]);

    useEffect(() => {
        if (session._resetTxTick) {
            Object.values(valuesRef.current).forEach(current => {
                if (current) current.requestCount = 0;
            });
            setValuesVersion(v => v + 1);
        }
    }, [session._resetTxTick]);

    // NEW: Filter Logic
    const visibleRegisters = useMemo(() => {
        if (filterMode === 'ERRORS_ONLY') {
            return session.config.registers.filter(r => (r.errorCount && r.errorCount > 0));
        }
        return session.config.registers;
    }, [session.config.registers, filterMode]);

    const toggleFilter = () => setFilterMode(prev => prev === 'ALL' ? 'ERRORS_ONLY' : 'ALL');

    // --- VIRTUALIZATION CALCULATION ---
    const totalHeight = visibleRegisters.length * ROW_HEIGHT;
    const viewportHeight = scrollContainerRef.current?.clientHeight || 600;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const endIndex = Math.min(visibleRegisters.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);
    
    const virtualItems = useMemo(() => {
        const items = [];
        for (let i = startIndex; i < endIndex; i++) {
            if (visibleRegisters[i]) {
                items.push({ index: i, reg: visibleRegisters[i] });
            }
        }
        return items;
    }, [visibleRegisters, startIndex, endIndex]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const getNextChannelName = () => `Channel ${session.config.registers.length + 1}`;

    // --- ACTION HANDLERS ---

    const handleAddConfig = (configs: Omit<ModbusRegisterConfig, 'id' | 'value' | 'status' | 'lastUpdate'>[]) => {
        if (editingNode) {
            // Edit Mode
            if (configs.length > 0) {
                const updatedConfig = configs[0];
                const newRegs = session.config.registers.map(r => {
                    if (r.id === editingNode.id) {
                        let val = r.value;
                        
                        // Determine default fill value based on type (Boolean/Coil -> false, Number -> 0)
                        const isBoolean = ['01', '02', '05', '15'].includes(updatedConfig.functionCode) || updatedConfig.dataType === 'Boolean';
                        const fillVal = isBoolean ? false : 0;

                        // Ensure Array structure if length > 1
                        if (updatedConfig.length > 1) {
                            if (!Array.isArray(val)) {
                                val = Array(updatedConfig.length).fill(fillVal);
                            } else if (val.length !== updatedConfig.length) {
                                // Resize and preserve existing data where possible
                                const newArr = Array(updatedConfig.length).fill(fillVal);
                                if (Array.isArray(val)) {
                                    val.forEach((v: any, i: number) => { if(i < newArr.length) newArr[i] = v; });
                                }
                                val = newArr;
                            }
                        } else {
                            // Scalar fallback
                            if (Array.isArray(val)) val = val[0] !== undefined ? val[0] : fillVal;
                        }
                        return { ...r, ...updatedConfig, value: val };
                    }
                    return r;
                });
                onUpdate({ config: { ...session.config, registers: newRegs } });
            }
        } else {
            // Add Mode
            const newRegs = configs.map(c => {
                const isBoolean = ['01', '02', '05', '15'].includes(c.functionCode) || c.dataType === 'Boolean';
                const defaultVal = isBoolean ? false : 0;

                return {
                    ...c,
                    id: Math.random().toString(36).substr(2, 9),
                    value: c.length > 1 ? Array(c.length).fill(defaultVal) : defaultVal,
                    status: 'Idle',
                    lastUpdate: '-',
                    requestCount: 0,
                    errorCount: 0,
                    errorStats: {}
                };
            });
            const updatedRegs = [...session.config.registers, ...newRegs];
            onUpdate({ config: { ...session.config, registers: updatedRegs } });
        }
    };

    const handleDelete = (id: string) => {
        const newRegs = session.config.registers.filter(r => r.id !== id);
        onUpdate({ config: { ...session.config, registers: newRegs } });
        if (selectedIds.has(id)) {
            const next = new Set(selectedIds);
            next.delete(id);
            setSelectedIds(next);
        }
    };

    const handleDeleteSelected = () => {
        if (selectedIds.size === 0) return;
        const newRegs = session.config.registers.filter(r => !selectedIds.has(r.id));
        onUpdate({ config: { ...session.config, registers: newRegs } });
        setSelectedIds(new Set());
    };

    const startValueEdit = (reg: ModbusRegisterConfig) => {
        setInlineEditId(reg.id);
        const runtimeState = valuesRef.current[reg.id] || {};
        const val = runtimeState.value !== undefined ? runtimeState.value : reg.value;
        setInlineEditValue(String(val));
    };

    const handleCommitWrite = async (reg: ModbusRegisterConfig) => {
        if (!inlineEditId) return;
        let val: any = inlineEditValue;
        
        if (reg.dataType === 'Boolean') val = (inlineEditValue.toLowerCase() === 'true' || inlineEditValue === '1');
        else if (reg.dataType.includes('Float')) val = parseFloat(inlineEditValue);
        else val = parseInt(inlineEditValue, 10);

        try {
            await modbusService.writeRegister(session.id, reg.functionCode, reg.address, val, reg.dataType, reg.endianness);
            
            // Persist the written value back to the config so Poller uses it for cyclic writes
            const newRegs = sessionRef.current.config.registers.map(r => r.id === reg.id ? { ...r, value: val } : r);
            onUpdate({ config: { ...sessionRef.current.config, registers: newRegs } });

            // Optimistic Update
            valuesRef.current[reg.id] = {
                ...valuesRef.current[reg.id],
                value: val,
                status: 'Good (Write)',
                lastUpdate: new Date().toLocaleTimeString()
            };
            setValuesVersion(v => v + 1);
            
            addLog('success', `Write Success: ${reg.name} = ${val}`);
        } catch (e: any) {
            addLog('error', `Write Failed: ${e.message}`);
        }
        setInlineEditId(null);
    };

    const handleArrayWrite = async (reg: ModbusRegisterConfig, writes: {indexRange: any, value: any}[]) => {
        if (writes.length > 0) {
            const newValue = writes[0].value; // ValueDisplay returns full array in value
            try {
                await modbusService.writeRegister(session.id, reg.functionCode, reg.address, newValue, reg.dataType, reg.endianness);
                
                // Persist the written value back to the config
                const newRegs = sessionRef.current.config.registers.map(r => r.id === reg.id ? { ...r, value: newValue } : r);
                onUpdate({ config: { ...sessionRef.current.config, registers: newRegs } });

                valuesRef.current[reg.id] = {
                    ...valuesRef.current[reg.id],
                    value: newValue,
                    status: 'Good (Write)',
                    lastUpdate: new Date().toLocaleTimeString()
                };
                setValuesVersion(v => v + 1);
                
                addLog('success', `Array updated for ${reg.name}`);
            } catch (e: any) {
                addLog('error', `Array Write Failed: ${e.message}`);
            }
        }
    };

    const handleFireEvent = async (reg: ModbusRegisterConfig) => {
        console.log("handleFireEvent called for:", reg.name, "ID:", reg.id, "SessionID:", session.id);
        try {
            await modbusService.triggerRegister(session.id, reg);
            addLog('success', `Triggered ${reg.name} successfully.`);
        } catch (e: any) {
            console.error("Trigger failed:", e);
            addLog('error', `Trigger failed: ${e.message}`);
        }
    };

    const handleResetErrors = () => {
        const newRegs = session.config.registers.map(r => ({ ...r, errorCount: 0, errorStats: {} }));
        onUpdate({ 
            config: { ...session.config, registers: newRegs },
            _resetErrTick: (session._resetErrTick || 0) + 1
        });
        addLog('info', 'Reset error counters.');
    };

    // ... (Row Click, Resizing, Copy/Paste, Export/Import handlers remain largely same)
    const handleRowClick = (e: React.MouseEvent, id: string, index: number) => { e.stopPropagation(); const newS = new Set(selectedIds); if (e.ctrlKey) { if (newS.has(id)) newS.delete(id); else newS.add(id); setLastSelectedId(id); } else if (e.shiftKey && lastSelectedId) { const allIds = visibleRegisters.map(r => r.id); const start = allIds.indexOf(lastSelectedId); const end = index; const low = Math.min(start, end); const high = Math.max(start, end); newS.clear(); for(let i=low; i<=high; i++) newS.add(allIds[i]); } else { newS.clear(); newS.add(id); setLastSelectedId(id); } setSelectedIds(newS); };
    const handleRowDoubleClick = (e: React.MouseEvent, reg: ModbusRegisterConfig) => { e.stopPropagation(); setEditingNode(reg); setIsAddModalOpen(true); };
    const startResizing = useCallback((col: string, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); resizingRef.current = { col, startX: e.clientX, startWidth: (colWidths as any)[col] }; document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, [colWidths]);
    const handleMouseMove = useCallback((e: MouseEvent) => { if (!resizingRef.current) return; const { col, startX, startWidth } = resizingRef.current; const diff = e.clientX - startX; setColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) })); }, []);
    const handleMouseUp = useCallback(() => { resizingRef.current = null; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; }, [handleMouseMove]);
    const toggleEndian = (regId: string) => { const reg = session.config.registers.find(r => r.id === regId); if (!reg) return; const nextMap: Record<ModbusEndianness, ModbusEndianness> = { 'ABCD': 'CDAB', 'CDAB': 'BADC', 'BADC': 'DCBA', 'DCBA': 'ABCD' }; const next = nextMap[reg.endianness || 'ABCD']; const newRegs = session.config.registers.map(r => r.id === regId ? { ...r, endianness: next } : r); onUpdate({ config: { ...session.config, registers: newRegs } }); };
    const handleCopy = () => { const items = session.config.registers.filter(r => selectedIds.has(r.id)); if (items.length > 0) { setClipboard(items); addLog('info', `Copied ${items.length} channels.`); } };
    const handlePaste = () => {
        if (clipboard.length === 0) return;
        const newItems = clipboard.map(c => {
            const isBoolean = ['01', '02', '05', '15'].includes(c.functionCode) || c.dataType === 'Boolean';
            const defaultVal = isBoolean ? false : 0;
            const initialVal = c.length > 1 ? Array(c.length).fill(defaultVal) : defaultVal;

            return {
                ...c,
                id: Math.random().toString(36).substr(2, 9),
                name: `${c.name} (Copy)`,
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
        const updatedRegs = [...session.config.registers, ...newItems];
        onUpdate({ config: { ...session.config, registers: updatedRegs } });
        addLog('success', `Pasted ${newItems.length} channels.`);
    };
    
    const handleToggleScan = () => { 
        const nextState = !isScanning; 
        if (!nextState) {
            // STOPPING: 
            // 1. Immediately set ignore ref to block any trailing data events from backend
            ignoreIncomingDataRef.current = true;
            
            // 2. Reset local status to 'Idle'
            const newRegs = session.config.registers.map(r => ({ ...r, status: 'Idle' }));
            onUpdate({ isScanning: nextState, config: { ...session.config, registers: newRegs } });
        } else {
            // STARTING
            ignoreIncomingDataRef.current = false;
            onUpdate({ isScanning: nextState }); 
        }
    };

    const handleDownloadTemplate = () => { const csvContent = "Name,FunctionCode,Address,Length,DataType,ScanRate\nVoltage,03,0,1,Float32,1000\nSwitch,01,10,1,Boolean,500"; const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'modbus_template.csv'; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleExport = () => { 
        if (session.config.registers.length === 0) return; 
        const header = "Name,FunctionCode,Address,Length,DataType,ScanRate,Value,Status\n"; 
        const rows = session.config.registers.map(r => {
            const runtimeState = valuesRef.current[r.id] || {};
            const val = runtimeState.value !== undefined ? runtimeState.value : r.value;
            const status = runtimeState.status || r.status;
            return `${r.name},${r.functionCode},${r.address},${r.length},${r.dataType},${r.scanRate},${val},${status}`;
        }).join('\n'); 
        const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' }); 
        const link = document.createElement('a'); 
        link.href = URL.createObjectURL(blob); 
        link.download = `modbus_config_${session.name}.csv`; 
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
    };
    const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { const text = evt.target?.result as string; const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0); const newRegs: ModbusRegisterConfig[] = []; const startIdx = lines[0].toLowerCase().includes('name') ? 1 : 0; for (let i = startIdx; i < lines.length; i++) { const parts = lines[i].split(','); if (parts.length >= 3) { newRegs.push({ id: Math.random().toString(36).substr(2, 9), name: parts[0] || `Import ${i}`, functionCode: (parts[1] as ModbusFunctionCode) || '03', address: parseInt(parts[2]) || 0, length: parseInt(parts[3]) || 1, dataType: (parts[4] as ModbusDataType) || 'Int16', scanRate: parseInt(parts[5]) || 1000, triggerType: 'Cyclic', retryCount: 3, value: 0, status: 'Idle', lastUpdate: '-', requestCount: 0, errorCount: 0, errorStats: {} }); } } if (newRegs.length > 0) { handleAddConfig(newRegs); addLog('success', `Imported ${newRegs.length} registers from CSV.`); } }; reader.readAsText(file); e.target.value = ''; };
    const handleKeyDown = (e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); const allIds = new Set(visibleRegisters.map(r => r.id)); setSelectedIds(allIds); } if (e.key === 'Delete' && selectedIds.size > 0) { handleDeleteSelected(); } };

    // --- RENDER HELPERS ---
    const formatValue = (reg: ModbusRegisterConfig) => {
        if (reg.length > 1) return null;
        const runtimeState = valuesRef.current[reg.id] || {};
        let val = runtimeState.value !== undefined ? runtimeState.value : reg.value;

        // Handle Boolean Coils (FC 01, 02, 05, 15 or Boolean DataType)
        if (['01', '02', '05', '15'].includes(reg.functionCode) || reg.dataType === 'Boolean') {
            const boolVal = val === true || val === 1 || String(val) === '1' || String(val).toLowerCase() === 'true';
            return (
                <span className={`truncate font-mono font-bold text-sm ${boolVal ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {boolVal ? 'TRUE' : 'FALSE'}
                </span>
            );
        }

        const isScaled = !!((reg.gain !== undefined && reg.gain !== 1) || (reg.offset !== undefined && reg.offset !== 0));
        if (isScaled && typeof val === 'number') {
            val = val * (reg.gain || 1) + (reg.offset || 0);
            val = Number(val.toFixed(2));
        }
        return (
            <span className={`truncate font-mono font-bold text-sm ${runtimeState.status === 'Bad' ? 'text-red-600' : 'text-blue-700'}`}>
                {String(val)} {reg.unit && <span className="text-[10px] text-slate-400 ml-1">{reg.unit}</span>}
            </span>
        );
    };

    const HEADER_CELL = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-600 uppercase relative overflow-hidden group/header bg-slate-100 h-10";
    const ROW_CELL = "flex-shrink-0 border-r border-slate-100 px-2 flex items-center truncate text-xs";

    return (
        <div className="flex flex-col h-full bg-slate-50" tabIndex={0} onKeyDown={handleKeyDown}>
            <ModbusAddModal 
                isOpen={isAddModalOpen} 
                onClose={() => { setIsAddModalOpen(false); setEditingNode(null); }} 
                onConfirm={handleAddConfig}
                initialValues={editingNode || undefined}
                defaultName={getNextChannelName()}
                isEditing={!!editingNode}
            />
            
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleImportCsv} />

            {/* Top Toolbar */}
            <div className="p-2 bg-white border-b border-slate-200 flex flex-wrap gap-2 items-center shadow-sm z-10 flex-shrink-0">
                <div className="flex items-center bg-slate-100 rounded p-1 border border-slate-200 h-8">
                    <button onClick={handleDownloadTemplate} className="px-2 h-full hover:bg-slate-200 text-slate-500 border-r border-slate-300" title="下载模板"><FileSpreadsheet className="w-3.5 h-3.5"/></button>
                    <button onClick={() => fileInputRef.current?.click()} className="px-2 h-full hover:bg-slate-200 text-slate-500 border-r border-slate-300" title="导入 CSV"><FileUp className="w-3.5 h-3.5"/></button>
                    <button onClick={handleExport} className="px-2 h-full hover:bg-slate-200 text-slate-500" title="导出 CSV"><FileDown className="w-3.5 h-3.5"/></button>
                </div>
                
                <div className="flex items-center bg-slate-100 rounded p-1 border border-slate-200 h-8 ml-2">
                    <button onClick={handleCopy} disabled={selectedIds.size===0} className="px-2 h-full hover:bg-slate-200 text-slate-500 border-r border-slate-300 disabled:opacity-30" title="复制"><Copy className="w-3.5 h-3.5"/></button>
                    <button onClick={handlePaste} disabled={clipboard.length===0} className="px-2 h-full hover:bg-slate-200 text-slate-500 border-r border-slate-300 disabled:opacity-30" title="粘贴"><ClipboardPaste className="w-3.5 h-3.5"/></button>
                    <button onClick={handleDeleteSelected} disabled={selectedIds.size===0} className="px-2 h-full hover:bg-red-50 text-red-500 disabled:opacity-30" title="删除"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>

                <button onClick={() => { setEditingNode(null); setIsAddModalOpen(true); }} className="px-3 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold flex items-center gap-1 shadow-sm ml-2"><Plus className="w-3.5 h-3.5"/> 添加通道</button>
                
                <div className="flex-1"></div>
                
                {isScanning && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-500 mr-2 shadow-sm animate-in fade-in" title="Last update from Backend">
                        <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
                        <span className="font-mono">{lastActiveTime}</span>
                    </div>
                )}

                <button onClick={handleResetErrors} className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-[10px] font-bold text-slate-600 flex items-center gap-1 mr-2 shadow-sm">
                    <RotateCcw className="w-3 h-3" /> 重置计数
                </button>

                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded border border-amber-100 animate-in fade-in zoom-in duration-200">
                            <span className="text-xs font-bold text-amber-600">{selectedIds.size} 已选</span>
                            <button onClick={handleDeleteSelected} className="ml-1 p-0.5 text-amber-500 hover:text-red-500 hover:bg-amber-100 rounded transition-colors" title="删除选中通道"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                    <div className="w-px h-4 bg-slate-300 mx-2"></div>
                    
                    <div className="flex items-center gap-2 bg-slate-100 rounded p-1 border border-slate-200 mr-2">
                        <label className="flex items-center gap-1.5 cursor-pointer px-1">
                            {/* Toggle session.config.useGlobalScanRate */}
                            <input 
                                type="checkbox" 
                                className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500 accent-amber-600" 
                                checked={useGlobalScanRate} 
                                onChange={e => onUpdate({config: {...session.config, useGlobalScanRate: e.target.checked}})} 
                            />
                            <span className="text-[10px] font-bold text-slate-600 uppercase">全局周期 (Global)</span>
                        </label>
                        <div className={`flex items-center bg-white border rounded h-6 px-1 transition-opacity ${useGlobalScanRate ? 'opacity-100 border-amber-400' : 'opacity-50 border-slate-300'}`}>
                            <input type="number" className="w-12 text-xs text-center outline-none font-mono font-bold text-slate-700" value={session.config.scanRate} onChange={e => onUpdate({config: {...session.config, scanRate: Number(e.target.value)}})} disabled={!useGlobalScanRate}/>
                            <span className="text-[9px] text-slate-400 mr-1">ms</span>
                        </div>
                    </div>

                    <button onClick={handleToggleScan} disabled={session.status !== 'CONNECTED'} className={`px-4 py-1.5 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm ${isScanning ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : session.status !== 'CONNECTED' ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                        {isScanning ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current"/>}
                        <span className="text-xs font-bold">{isScanning ? "停止运行" : "启动运行"}</span>
                    </button>
                </div>
            </div>

            {/* Table with Virtual Scrolling */}
            <div className="flex-1 overflow-auto bg-white relative">
                <div ref={headerRef} className="flex items-center sticky top-0 z-20 shadow-sm min-w-max border-b border-slate-200 bg-slate-100 h-10 overflow-hidden">
                    <div style={{ width: colWidths.index }} className={HEADER_CELL}>#<Resizer onMouseDown={(e) => startResizing('index', e)} /></div>
                    <div style={{ width: colWidths.name }} className={HEADER_CELL}>名称 (Name)<Resizer onMouseDown={(e) => startResizing('name', e)} /></div>
                    <div style={{ width: colWidths.functionCode }} className={HEADER_CELL}>功能码 (Function Code)<Resizer onMouseDown={(e) => startResizing('functionCode', e)} /></div>
                    <div style={{ width: colWidths.address }} className={HEADER_CELL}>地址 (Addr)<Resizer onMouseDown={(e) => startResizing('address', e)} /></div>
                    <div style={{ width: colWidths.length }} className={HEADER_CELL}>长度 (Len)<Resizer onMouseDown={(e) => startResizing('length', e)} /></div>
                    <div style={{ width: colWidths.trigger }} className={HEADER_CELL}>触发 (Trigger)<Resizer onMouseDown={(e) => startResizing('trigger', e)} /></div>
                    <div style={{ width: colWidths.scanRate }} className={HEADER_CELL}>周期 (Rate)<Resizer onMouseDown={(e) => startResizing('scanRate', e)} /></div>
                    <div style={{ width: colWidths.value }} className={HEADER_CELL}>数值 (Value/Write)<Resizer onMouseDown={(e) => startResizing('value', e)} /></div>
                    <div style={{ width: colWidths.dataType }} className={HEADER_CELL}>类型 (Type)<Resizer onMouseDown={(e) => startResizing('dataType', e)} /></div>
                    <div style={{ width: colWidths.endianness }} className={HEADER_CELL}>字节序 (Endian)<Resizer onMouseDown={(e) => startResizing('endianness', e)} /></div>
                    <div style={{ width: colWidths.status }} className={HEADER_CELL}>状态 (Status)<Resizer onMouseDown={(e) => startResizing('status', e)} /></div>
                    <div style={{ width: colWidths.requestCount }} className={HEADER_CELL}>Tx (Req)<Resizer onMouseDown={(e) => startResizing('requestCount', e)} /></div>
                    <div style={{ width: colWidths.error }} className={`${HEADER_CELL} cursor-pointer hover:bg-slate-200 transition-colors`} onClick={toggleFilter} title="Click to toggle error filter">
                        <div className="flex items-center justify-between w-full"><span>错误 (Err)</span>{filterMode === 'ERRORS_ONLY' && <Filter className="w-3 h-3 text-red-600 fill-current" />}</div><Resizer onMouseDown={(e) => startResizing('error', e)} />
                    </div>
                    <div style={{ width: colWidths.actions }} className={HEADER_CELL}>操作</div>
                </div>
                
                <div ref={scrollContainerRef} className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300" style={{ height: 'calc(100% - 40px)' }} onScroll={handleScroll}>
                    {visibleRegisters.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 italic text-sm">{filterMode === 'ERRORS_ONLY' ? '没有发现错误项。' : '列表为空。请添加寄存器通道。'}</div>
                    ) : (
                        <div style={{ height: totalHeight, position: 'relative', minWidth: 'max-content' }}>
                            {virtualItems.map(({ index, reg }) => {
                                const runtimeState = valuesRef.current[reg.id] || {};
                                const currentStatus = runtimeState.status || reg.status;
                                const currentRequestCount = runtimeState.requestCount || reg.requestCount;
                                const currentErrorCount = runtimeState.errorCount || reg.errorCount;
                                const currentValue = runtimeState.value !== undefined ? runtimeState.value : reg.value;

                                const isSelected = selectedIds.has(reg.id);
                                const isScaled = !!((reg.gain !== undefined && reg.gain !== 1) || (reg.offset !== undefined && reg.offset !== 0));
                                const errorTooltip = reg.errorStats ? Object.entries(reg.errorStats).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No Errors';

                                return (
                                <div key={reg.id} style={{ position: 'absolute', top: index * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0, width: '100%' }} onClick={(e) => handleRowClick(e, reg.id, index)} onDoubleClick={(e) => handleRowDoubleClick(e, reg)} className={`flex items-center border-b border-slate-100 hover:bg-blue-50 transition-colors group cursor-pointer ${isSelected ? 'bg-amber-100/50' : 'bg-white'}`}>
                                    <div style={{ width: colWidths.index }} className="flex justify-center items-center border-r border-slate-100 flex-shrink-0 text-slate-400 font-mono group/grip">
                                        {isSelected ? <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div> : <span className="group-hover/grip:hidden">{index + 1}</span>}
                                        <GripVertical className="w-3 h-3 hidden group-hover/grip:block opacity-50"/>
                                    </div>
                                    <div style={{ width: colWidths.name }} className={`${ROW_CELL} font-bold text-slate-800 truncate`} title={reg.name}>{reg.name}</div>
                                    <div style={{ width: colWidths.functionCode }} className={`${ROW_CELL} font-medium text-slate-700 truncate`} title={FC_DESC[reg.functionCode]}>
                                        <span className="bg-slate-100 px-1.5 rounded text-[10px] border border-slate-200">{reg.functionCode}</span>
                                        <span className="ml-2 opacity-80">{FC_DESC[reg.functionCode]?.split(' ')[1]}</span>
                                    </div>
                                    <div style={{ width: colWidths.address }} className={`${ROW_CELL} font-mono font-bold text-slate-700`}>{reg.address}</div>
                                    <div style={{ width: colWidths.length }} className={`${ROW_CELL} font-bold text-slate-700 text-center`}>{reg.length}</div>
                                    <div style={{ width: colWidths.trigger }} className={`${ROW_CELL} font-medium text-slate-700`}>
                                        {reg.triggerType === 'Event' ? (
                                            <div className="flex items-center gap-1 w-full justify-between">
                                                <div 
                                                    onClick={(e) => { e.stopPropagation(); handleFireEvent(reg); }}
                                                    className="flex items-center gap-1 truncate text-amber-600 bg-amber-50 hover:bg-amber-100 px-1 rounded border border-amber-100 cursor-pointer transition-colors" 
                                                    title={`Click to trigger (${reg.triggerTag || 'Unbound'})`}
                                                >
                                                    <Zap className="w-3 h-3 flex-shrink-0"/> 
                                                    <span className="truncate">{reg.triggerTag || '?'}</span>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); handleFireEvent(reg); }} className="p-0.5 hover:bg-amber-100 rounded text-amber-500" title="Manual Trigger (Fire)"><Play className="w-3 h-3 fill-current"/></button>
                                            </div>
                                        ) : (<span className="text-slate-400">循环</span>)}
                                    </div>
                                    <div style={{ width: colWidths.scanRate }} className={`${ROW_CELL} font-bold text-slate-600`}>
                                        <span className={useGlobalScanRate ? 'line-through text-slate-300' : ''}>{reg.scanRate} <span className="text-[10px] font-normal">{reg.scanRateUnit || 'ms'}</span></span>
                                        {useGlobalScanRate && <span className="ml-1 text-[9px] text-amber-500 bg-amber-50 px-1 rounded">Global</span>}
                                    </div>
                                    <div style={{ width: colWidths.value }} className={`${ROW_CELL} font-mono font-bold text-slate-800 bg-slate-50 transition-colors cursor-text relative hover:bg-white`} onDoubleClick={(e) => { e.stopPropagation(); if(reg.length <= 1) startValueEdit(reg); }}>
                                        {inlineEditId === reg.id ? (
                                            <div className="flex items-center gap-1 w-full"><input autoFocus className="w-full h-7 border border-amber-500 rounded px-1 outline-none text-xs" value={inlineEditValue} onChange={e=>setInlineEditValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') handleCommitWrite(reg); if(e.key==='Escape') setInlineEditId(null);}} onClick={e=>e.stopPropagation()} /><button onClick={()=>handleCommitWrite(reg)} className="p-1 bg-amber-500 text-white rounded hover:bg-amber-600"><Check className="w-3 h-3"/></button></div>
                                        ) : (
                                            <div className="flex items-center gap-2 w-full group/val overflow-hidden h-full">
                                                <div className="flex-1 truncate">
                                                    {reg.length > 1 ? ( <ValueDisplay value={currentValue} dataType={reg.dataType} nodeId={reg.id} onWrite={(writes) => handleArrayWrite(reg, writes)} /> ) : ( formatValue(reg) )}
                                                </div>
                                                {isScaled && <span className="text-[9px] bg-slate-200 px-1 rounded text-slate-500 mr-1" title={`Scaled: x${reg.gain} + ${reg.offset}`}>f(x)</span>}
                                                {reg.length <= 1 && <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/val:opacity-100 flex-shrink-0" />}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ width: colWidths.dataType }} className={`${ROW_CELL}`}><span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-indigo-100">{reg.dataType}</span></div>
                                    <div style={{ width: colWidths.endianness }} className={`${ROW_CELL} text-center`}>
                                        {['Int32','UInt32','Float32', 'Float64'].includes(reg.dataType) && (<button onClick={(e) => { e.stopPropagation(); toggleEndian(reg.id); }} className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-[9px] font-mono border border-slate-300 w-full text-slate-600">{reg.endianness}</button>)}
                                    </div>
                                    <div style={{ width: colWidths.status }} className={`${ROW_CELL} text-center font-bold ${currentStatus === 'Good' || currentStatus.includes('Write') ? 'text-emerald-500' : 'text-slate-400'}`}>{currentStatus}</div>
                                    <div style={{ width: colWidths.requestCount }} className={`${ROW_CELL} justify-center`}>{currentRequestCount && currentRequestCount > 0 ? (<span className="text-slate-600 font-mono text-[10px] flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3 text-emerald-500" />{currentRequestCount}</span>) : <span className="text-slate-200">-</span>}</div>
                                    <div style={{ width: colWidths.error }} className={`${ROW_CELL} justify-center`}>{currentErrorCount && currentErrorCount > 0 ? (<div className="flex items-center gap-1 group/err relative cursor-help" title={errorTooltip}><span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">{currentErrorCount}</span><Info className="w-3 h-3 text-red-300" /></div>) : <span className="text-slate-200">-</span>}</div>
                                    <div style={{ width: colWidths.actions }} className="flex justify-center items-center flex-shrink-0 gap-1 opacity-60 hover:opacity-100 transition-opacity border-r border-slate-100 h-full px-2"><button onClick={(e) => { e.stopPropagation(); handleDelete(reg.id); }} className="text-slate-300 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5"/></button></div>
                                </div>
                            )})}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
