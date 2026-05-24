
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { EipSessionInfo, ConnectionStatus, CipDataType, CipDataTypeNames, EipTag, EipTagGroup } from '../../types';
import { eipService } from '../services/eipService';
import { Play, Pause, List, Calculator, X, ChevronDown, ChevronRight, Plus, Copy, ClipboardPaste, ListPlus, Trash2, Download, Save, FileSpreadsheet, Edit3, Check, AlertCircle, ToggleLeft, ToggleRight, MoreVertical, ArrowLeft, ArrowRight, Upload, GripVertical, Zap, Hash, Workflow, ArrowDownCircle, Timer, Wand2, Maximize, Minimize, Shuffle, RefreshCw, RefreshCwOff, Type, RotateCcw, ShieldCheck, ShieldAlert, Dice5, History, Clock, ArrowUpCircle, Filter, Info } from 'lucide-react';
import ValueDisplay from '../../components/ValueDisplay';

interface EipTagManagerProps {
    session: EipSessionInfo;
    onUpdate: (updates: Partial<EipSessionInfo>) => void;
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
    onDrop: () => void;
}

const ROW_HEIGHT = 36;
const BUFFER_ROWS = 5;
const UI_REFRESH_RATE = 100; // ms, limits UI updates to ~10 FPS

// --- UTILS ---
const ensureInternalIds = (nodes: EipTag[]) => {
    return nodes.map(n => ({
        ...n,
        id: n.id || Math.random().toString(36).substr(2, 9),
        errorCount: n.errorCount || 0,
        errorHistory: n.errorHistory || []
    }));
};

// Helper: Normalize Value for Display & State
const normalizeEipValue = (val: any, type: CipDataType) => {
    if (type === CipDataType.STRUCT && typeof val === 'string') {
        const parts = val.trim().split(/\s+/);
        // Robust hex parsing
        const bytes = parts.map(x => parseInt(x, 16));
        if (bytes.length > 0 && !bytes.some(isNaN)) return bytes;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try { return JSON.parse(trimmed); } catch(e) {}
        }
    }
    return val;
};

const generateDefaultValue = (dataType: CipDataType, count: number) => {
    const isBool = dataType === CipDataType.BOOL;
    const baseVal = isBool ? false : 0;
    if (count > 1) return new Array(count).fill(baseVal);
    return baseVal;
};

// Helper: Get limits for types
const getTypeLimits = (dataType: CipDataType) => {
    switch (dataType) {
        case CipDataType.SINT: return { min: -128, max: 127, rnd: () => Math.floor(Math.random() * 256) - 128 };
        case CipDataType.INT: return { min: -32768, max: 32767, rnd: () => Math.floor(Math.random() * 65536) - 32768 };
        case CipDataType.DINT: return { min: -2147483648, max: 2147483647, rnd: () => Math.floor(Math.random() * 20000) - 10000 };
        case CipDataType.REAL: return { min: -10000.0, max: 10000.0, rnd: () => parseFloat((Math.random() * 100).toFixed(2)) };
        case CipDataType.BOOL: return { min: false, max: true, rnd: () => Math.random() > 0.5 };
        // FIX: Add explicit USINT/BYTE/STRUCT support (0-255)
        case CipDataType.USINT:
        case CipDataType.BYTE:
        case CipDataType.STRUCT: 
            return { min: 0, max: 255, rnd: () => Math.floor(Math.random() * 256) };
        default: return { min: 0, max: 100, rnd: () => Math.floor(Math.random() * 100) };
    }
};

const applyGenerator = (currentVal: any, dataType: CipDataType, mode: 'min' | 'max' | 'rnd' | 'inc'): any => {
    // 1. Recursive Array Handling
    if (Array.isArray(currentVal)) {
         // FIX: If it's a STRUCT array, treat children as USINT (Byte)
         // This ensures the generator produces 0-255 values for each byte in the struct
         const childType = dataType === CipDataType.STRUCT ? CipDataType.USINT : dataType;
         return currentVal.map(v => applyGenerator(v, childType, mode));
    }

    // 2. Recursive Object (Struct) Handling
    if (dataType === CipDataType.STRUCT && currentVal && typeof currentVal === 'object') {
         const nextObj: any = {};
         for (const k in currentVal) {
             if (Object.prototype.hasOwnProperty.call(currentVal, k)) {
                 const v = currentVal[k];
                 let childType = CipDataType.DINT;
                 if (typeof v === 'boolean') childType = CipDataType.BOOL;
                 else if (typeof v === 'string') childType = CipDataType.STRING;
                 else if (typeof v === 'number' && !Number.isInteger(v)) childType = CipDataType.REAL;
                 
                 nextObj[k] = applyGenerator(v, childType, mode);
             }
         }
         return nextObj;
    }

    const limits = getTypeLimits(dataType);
    if (mode === 'min') return limits.min;
    if (mode === 'max') return limits.max;
    if (mode === 'rnd') return limits.rnd();
    if (mode === 'inc') {
        if (dataType === CipDataType.BOOL) return !currentVal;
        let num = Number(currentVal);
        if (isNaN(num)) num = 0;
        
        // Simple wrap around for integers
        if (num >= (limits.max as number)) return limits.min;
        return num + 1;
    }
    return currentVal;
};

// Helper: Deep Compare
const isValuesEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.0001;
    if ((typeof a === 'boolean' || typeof a === 'number') && (typeof b === 'boolean' || typeof b === 'number')) return Number(a) === Number(b);
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((v, i) => isValuesEqual(v, b[i]));
    }
    return JSON.stringify(a) === JSON.stringify(b);
};

// Helper: Check if tag is complex (Array/Struct)
const isTagComplex = (tag: EipTag) => {
    return tag.dataType === CipDataType.STRUCT || tag.dataType === CipDataType.ARRAY || (tag.elementCount !== undefined && tag.elementCount > 1);
};

const BatchWriteModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (val: string) => void }> = ({ isOpen, onClose, onConfirm }) => {
    const [val, setVal] = useState('');
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-80 p-4 animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-slate-700 mb-2">批量写入 (Batch Write)</h3>
                <p className="text-xs text-slate-500 mb-2">输入要写入所有选中标签的数值:</p>
                <input 
                    autoFocus
                    className="w-full border border-blue-500 rounded px-3 py-2 text-sm mb-4 outline-none"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder="Value..."
                    onKeyDown={e => e.key === 'Enter' && onConfirm(val)}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-bold">取消</button>
                    <button onClick={() => onConfirm(val)} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded text-xs font-bold">确认写入</button>
                </div>
            </div>
        </div>
    );
};

const ErrorHistoryModal: React.FC<{ isOpen: boolean; onClose: () => void; history: string[]; title?: string }> = ({ isOpen, onClose, history, title }) => {
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-2xl border border-red-200 w-96 max-h-[80%] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="px-4 py-3 border-b border-red-100 bg-red-50/50 flex justify-between items-center rounded-t-lg">
                    <h3 className="font-bold text-red-800 flex items-center gap-2 text-sm">
                        <History className="w-4 h-4" /> {title || "错误历史记录 (Last 10)"}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto bg-white flex-1 min-h-[150px]">
                    {history.length === 0 ? (
                        <div className="text-center text-slate-400 italic text-xs py-4">暂无错误记录</div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((err, i) => (
                                <div key={i} className="text-xs border-l-2 border-red-300 pl-2 py-0.5">
                                    <div className="text-slate-500 font-mono text-[10px] mb-0.5 flex items-center gap-1">
                                        <Clock className="w-3 h-3"/> {err.split(' - ')[0]}
                                    </div>
                                    <div className="text-red-700 font-medium">
                                        {err.split(' - ').slice(1).join(' - ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-lg flex justify-end">
                    <button onClick={onClose} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-xs font-bold shadow-sm">关闭</button>
                </div>
            </div>
        </div>
    );
};

const ScalarWriteEditor = ({ value, dataType, onChange }: { value: any, dataType: number, onChange: (v: any) => void }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(String(value));
    const isBool = dataType === CipDataType.BOOL;

    useEffect(() => { setEditVal(String(value)); }, [value]);

    const handleCommit = () => {
        setIsEditing(false);
        let finalVal: any = editVal;
        
        if (isBool) {
             const lower = editVal.toLowerCase();
             finalVal = (lower === 'true' || lower === '1' || lower === 'on');
        } else if ([CipDataType.SINT, CipDataType.INT, CipDataType.DINT, CipDataType.LINT, CipDataType.USINT, CipDataType.UINT, CipDataType.UDINT, CipDataType.ULINT, CipDataType.BYTE, CipDataType.WORD, CipDataType.DWORD, CipDataType.LWORD, CipDataType.TIME, CipDataType.LTIME, CipDataType.DATE, CipDataType.TIME_OF_DAY, CipDataType.DATE_AND_TIME].includes(dataType)) {
             if (editVal.startsWith('0x') || editVal.startsWith('0X')) finalVal = parseInt(editVal, 16);
             else finalVal = Number(editVal);
             if (isNaN(finalVal)) finalVal = 0;
        } else if ([CipDataType.REAL, CipDataType.LREAL].includes(dataType)) {
             finalVal = parseFloat(editVal);
             if (isNaN(finalVal)) finalVal = 0.0;
        }
        onChange(finalVal);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleCommit();
        if (e.key === 'Escape') {
            setEditVal(String(value));
            setIsEditing(false);
        }
    };

    const toggleBool = () => {
        onChange(!value);
    };

    if (isBool) {
        return (
            <div 
                className={`flex items-center justify-center h-full w-full cursor-pointer transition-all select-none rounded border-2 relative overflow-hidden group ${value ? 'bg-emerald-100 border-emerald-400' : 'bg-slate-100 border-slate-300 hover:border-slate-400'}`}
                onDoubleClick={toggleBool}
                title="双击切换 (Double Click to Toggle)"
            >
                <div className={`absolute inset-0 opacity-10 ${value ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                <div className="z-10 flex flex-col items-center">
                    <span className={`text-3xl font-black ${value ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {value ? 'TRUE' : 'FALSE'}
                    </span>
                    <div className="text-[10px] text-slate-400/70 font-bold uppercase tracking-wider mt-1 opacity-0 group-hover:opacity-100 transition-opacity">双击切换状态</div>
                </div>
            </div>
        );
    }

    if (isEditing) {
        return (
            <textarea
                autoFocus
                className="w-full h-full p-3 text-lg font-mono outline-none resize-none bg-blue-50 text-blue-900 border-2 border-blue-400 rounded"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={handleKeyDown}
            />
        );
    }

    return (
        <div 
            className="w-full h-full flex flex-col items-center justify-center cursor-text hover:bg-slate-50/50 transition-colors group relative border-2 border-transparent hover:border-blue-100 rounded"
            onDoubleClick={() => setIsEditing(true)}
            title="双击编辑 (Double Click to Edit)"
        >
            <span className="text-3xl font-mono text-slate-700 font-bold break-all text-center px-4">
                {String(value)}
            </span>
        </div>
    );
};

// --- STYLING CONSTANTS & COMPONENTS ---
const HEADER_CELL_BASE = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-500 uppercase relative overflow-hidden group/header h-full";
const CELL_BASE = "flex-shrink-0 border-r border-slate-100 px-2 flex items-center truncate h-full";

const Resizer = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div 
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-400 z-20 group-hover/header:bg-slate-200 hover:!bg-cyan-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

export const EipTagManager: React.FC<EipTagManagerProps> = ({ session, onUpdate, addLog, onDrop }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    
    // --- STATE ---
    const [activeGroupId, setActiveGroupId] = useState<string>('');
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [isInspectorOpen, setIsInspectorOpen] = useState(true);
    
    // --- LIST CONTROL STATE ---
    const [isListAutoRead, setIsListAutoRead] = useState(false);
    const [listReadCycle, setListReadCycle] = useState(500);
    const [localListReadCycle, setLocalListReadCycle] = useState(500);
    const [readCount, setReadCount] = useState(0); 

    const [isListAutoWrite, setIsListAutoWrite] = useState(false);
    const [listWriteCycle, setListWriteCycle] = useState(1000);
    const [localListWriteCycle, setLocalListWriteCycle] = useState(1000);
    const [writeCount, setWriteCount] = useState(0); 
    
    const [useListApi, setUseListApi] = useState(false);
    const [genMode, setGenMode] = useState<'None' | 'Inc' | 'Rnd'>('None');
    const [applyGenToAll, setApplyGenToAll] = useState(true);

    const [insTagName, setInsTagName] = useState("Motor_Speed");
    const [insDataType, setInsDataType] = useState<CipDataType>(CipDataType.DINT);
    const [insCount, setInsCount] = useState(1); 
    
    const [insWriteData, setInsWriteData] = useState<any>(0); 
    const [genSize, setGenSize] = useState(10);
    const [verifyWrite, setVerifyWrite] = useState(false); 
    const [enableRandomize, setEnableRandomize] = useState(false); 

    const writeStatsRef = useRef({ total: 0, success: 0, fail: 0, failHistory: [] as string[] });
    const lastWriteStatusRef = useRef<string | null>(null);
    const verifyStatusRef = useRef<'Match' | 'Mismatch' | null>(null);
    const writeRttRef = useRef<number | null>(null);
    const insWriteDataRef = useRef(insWriteData); 
    
    const [displayWriteStats, setDisplayWriteStats] = useState({ total: 0, success: 0, fail: 0, failHistory: [] as string[] });
    const [displayLastWriteStatus, setDisplayLastWriteStatus] = useState<string | null>(null);
    const [displayVerifyStatus, setDisplayVerifyStatus] = useState<'Match' | 'Mismatch' | null>(null);
    const [displayWriteRtt, setDisplayWriteRtt] = useState<number | null>(null);
    const [insResult, setInsResult] = useState<any>(null); 

    const [isErrorHistoryOpen, setIsErrorHistoryOpen] = useState(false);
    
    // List Item Error History Modal State
    const [listErrorModalOpen, setListErrorModalOpen] = useState(false);
    const [currentListHistory, setCurrentListHistory] = useState<string[]>([]);
    const [currentListTagName, setCurrentListTagName] = useState<string>('');

    useEffect(() => { insWriteDataRef.current = insWriteData; }, [insWriteData]);

    const [isAutoRead, setIsAutoRead] = useState(false);
    const [isAutoWrite, setIsAutoWrite] = useState(false);
    const [readCycleMs, setReadCycleMs] = useState(1000);
    const [writeCycleMs, setWriteCycleMs] = useState(1000);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [bulkText, setBulkText] = useState('');
    const [bulkCount, setBulkCount] = useState(1);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [batchWriteModalOpen, setBatchWriteModalOpen] = useState(false);
    const lastErrorLogTime = useRef(0);
    
    // --- VIRTUAL SCROLL STATE ---
    const [scrollTop, setScrollTop] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    
    // --- FILTER STATE ---
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'BAD' | 'GOOD'>('ALL');

    const [colWidths, setColWidths] = useState({
        index: 50,
        tagName: 320, 
        elementCount: 120, 
        dataType: 100,
        value: 180,
        status: 100,
        error: 80, // NEW COLUMN
        actions: 60
    });
    const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

    const [editingCell, setEditingCell] = useState<{id: string, field: 'tagName'|'elementCount'|'dataType'|'value'} | null>(null);
    const [tempEditValue, setTempEditValue] = useState<string>("");

    const activeTagGroupId = activeGroupId || (session.config.tagGroups[0] ? session.config.tagGroups[0].id : '');

    useEffect(() => {
        if (session.config.tagGroups.length > 0 && !activeTagGroupId) {
            setActiveGroupId(session.config.tagGroups[0].id);
            setSelectedGroupIds(new Set([session.config.tagGroups[0].id]));
        }
    }, [session.config.tagGroups, activeTagGroupId]);

    const activeGroup = session.config.tagGroups.find(g => g.id === activeTagGroupId);
    
    // --- FILTER LOGIC ---
    const filteredTagList = useMemo(() => {
        if (!activeGroup) return [];
        const nodes = activeGroup.nodes;
        if (statusFilter === 'ALL') return nodes;
        return nodes.filter(t => {
            if (statusFilter === 'BAD') return t.status === 'Bad' || t.status === 'WriteErr' || t.status.startsWith('Error');
            if (statusFilter === 'GOOD') return t.status === 'Good' || t.status === 'Written';
            return true;
        });
    }, [activeGroup, statusFilter]);

    const cycleStatusFilter = () => {
        setStatusFilter(prev => {
            if (prev === 'ALL') return 'BAD';
            if (prev === 'BAD') return 'GOOD';
            return 'ALL';
        });
    };

    // Reset scroll and selection on group change
    useEffect(() => {
        setScrollTop(0);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        setSelectedIds(new Set());
    }, [activeTagGroupId]);

    // --- VIRTUALIZATION CALCULATION ---
    const totalHeight = filteredTagList.length * ROW_HEIGHT;
    const viewportHeight = scrollContainerRef.current?.clientHeight || 600;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const endIndex = Math.min(filteredTagList.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    const visibleTags = useMemo(() => {
        return filteredTagList.slice(startIndex, endIndex).map((tag, i) => ({ tag, index: startIndex + i }));
    }, [filteredTagList, startIndex, endIndex]);

    // Sync Horizontal Scroll (Header <-> Body)
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setDisplayWriteStats(prev => {
                const curr = writeStatsRef.current;
                if (prev.total !== curr.total || prev.success !== curr.success || prev.fail !== curr.fail) return {...curr};
                return prev;
            });
            setDisplayLastWriteStatus(lastWriteStatusRef.current);
            setDisplayVerifyStatus(verifyStatusRef.current);
            setDisplayWriteRtt(writeRttRef.current);
        }, UI_REFRESH_RATE);
        return () => clearInterval(timer);
    }, []);

    // ... [Resizing Handlers remain same] ...
    const startResizing = useCallback((col: string, e: React.MouseEvent) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        resizingRef.current = { col, startX: e.clientX, startWidth: (colWidths as any)[col] }; 
        document.addEventListener('mousemove', handleMouseMove); 
        document.addEventListener('mouseup', handleMouseUp); 
        document.body.style.cursor = 'col-resize'; 
        document.body.style.userSelect = 'none'; 
    }, [colWidths]);

    const handleMouseMove = useCallback((e: MouseEvent) => { 
        if (!resizingRef.current) return; 
        const { col, startX, startWidth } = resizingRef.current; 
        const diff = e.clientX - startX; 
        setColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) })); 
    }, []);

    const handleMouseUp = useCallback(() => { 
        resizingRef.current = null; 
        document.removeEventListener('mousemove', handleMouseMove); 
        document.removeEventListener('mouseup', handleMouseUp); 
        document.body.style.cursor = ''; 
        document.body.style.userSelect = ''; 
    }, [handleMouseMove]);

    // ... [Editing Handlers remain same] ...
    const handleStartEdit = (id: string, field: 'tagName'|'elementCount'|'dataType'|'value', currentValue: any) => {
        setEditingCell({ id, field });
        setTempEditValue(String(currentValue));
    };

    const handleCancelEdit = () => {
        setEditingCell(null);
    };

    const handleTagWrite = async (tagId: string, writes: { indexRange: string, value: any }[]) => {
        if (!activeGroup) return;
        const tag = activeGroup.nodes.find(n => n.id === tagId);
        if (!tag) return;
        
        for (const w of writes) {
            try {
                await eipService.writeTag(session.id, tag.tagName, w.value, tag.dataType, session.alignment, tag.elementCount || 1);
                
                const newGroups = session.config.tagGroups.map(g => {
                    if (g.id === activeTagGroupId) {
                        return {
                            ...g,
                            nodes: g.nodes.map(n => n.id === tagId ? { ...n, value: w.value, status: 'Written', lastUpdate: new Date().toLocaleTimeString() } : n)
                        };
                    }
                    return g;
                });
                onUpdate({ config: { ...session.config, tagGroups: newGroups } });
                setWriteCount(c => c + 1);
            } catch (e: any) {
                addLog('error', `Write failed for ${tag.tagName}: ${e.message}`);
                const now = new Date().toLocaleTimeString();
                const newGroups = session.config.tagGroups.map(g => {
                    if (g.id === activeTagGroupId) {
                        return {
                            ...g,
                            nodes: g.nodes.map(n => {
                                if (n.id === tagId) {
                                    const entry = `${now} - ${e.message}`;
                                    const history = [entry, ...(n.errorHistory || [])].slice(0, 10);
                                    return { 
                                        ...n, 
                                        status: 'WriteErr', 
                                        errorCount: (n.errorCount || 0) + 1,
                                        errorHistory: history
                                    };
                                }
                                return n;
                            })
                        };
                    }
                    return g;
                });
                onUpdate({ config: { ...session.config, tagGroups: newGroups } });
            }
        }
    };

    const handleCommitEdit = () => {
        if (!editingCell || !activeGroup) return;
        
        const { id, field } = editingCell;
        let finalValue: any = tempEditValue;

        if (field === 'elementCount') {
            finalValue = parseInt(tempEditValue, 10);
            if (isNaN(finalValue) || finalValue < 1) finalValue = 1;
        } else if (field === 'dataType') {
            finalValue = Number(tempEditValue);
        } else if (field === 'value') {
             const tag = activeGroup.nodes.find(n => n.id === id);
             if (tag) {
                 if (tag.dataType === CipDataType.BOOL) {
                     finalValue = (tempEditValue.toLowerCase() === 'true' || tempEditValue === '1');
                 } else if ([CipDataType.REAL, CipDataType.LREAL].includes(tag.dataType)) {
                     finalValue = parseFloat(tempEditValue);
                 } else if ([CipDataType.STRING, CipDataType.WSTRING].includes(tag.dataType)) {
                     finalValue = tempEditValue;
                 } else {
                     finalValue = parseInt(tempEditValue, 10);
                 }
                 
                 if (!isNaN(finalValue) || typeof finalValue === 'string' || typeof finalValue === 'boolean') {
                    handleTagWrite(id, [{ indexRange: '', value: finalValue }]);
                 }
             }
             setEditingCell(null);
             return;
        } else {
            finalValue = tempEditValue.trim();
            if (!finalValue) return handleCancelEdit();
        }

        const newGroups = session.config.tagGroups.map(g => {
            if (g.id === activeTagGroupId) {
                return {
                    ...g,
                    nodes: g.nodes.map(n => {
                        if (n.id === id) {
                            return { ...n, [field]: finalValue };
                        }
                        return n;
                    })
                };
            }
            return g;
        });

        onUpdate({ config: { ...session.config, tagGroups: newGroups } });
        setEditingCell(null);
    };

    // --- INSPECTOR READ LOGIC (UPDATED: Normalize STRUCT) ---
    const handleInsRead = async () => {
        if (!isConnected) return null;
        try {
            const start = performance.now();
            const res = await eipService.readTag(session.id, insTagName, insDataType, session.alignment, insCount);
            const rtt = Math.round(performance.now() - start);
            
            if (res.dataType !== insDataType) {
                setInsDataType(res.dataType);
            }

            // FIX: Normalize STRUCT immediately on read
            let val = res.value;
            if (res.dataType === CipDataType.STRUCT && typeof val === 'string') {
                val = normalizeEipValue(val, CipDataType.STRUCT);
            }

            setInsResult({ value: val, status: 'Good', rtt, time: new Date().toLocaleTimeString() });
            return val; 
        } catch (e: any) {
            setInsResult({ value: null, status: 'Bad', error: e.message, rtt: 0, time: new Date().toLocaleTimeString() });
            addLog('error', `Inspector Read Failed: ${e.message}`);
            return undefined;
        }
    };

    // ... [performWriteCycle, updateRefStatus, etc. remain same] ...
    const performWriteCycle = async (valueOverride?: any, isAuto: boolean = false) => {
        if (!isConnected) return;
        const valToWrite = valueOverride !== undefined ? valueOverride : insWriteDataRef.current;
        const countToSend = insCount;
        if (!isAuto) { setLastWriteStatusState('Writing...'); }
        
        try {
            const start = performance.now();
            await eipService.writeTag(session.id, insTagName, valToWrite, insDataType, session.alignment, countToSend);
            const rtt = Math.round(performance.now() - start);
            updateRefStatus('Good', rtt, null);
            
            if (verifyWrite) {
                let readVal = await handleInsRead();
                if (insDataType === CipDataType.STRUCT && typeof readVal === 'string') {
                    readVal = normalizeEipValue(readVal, insDataType);
                }

                if (readVal !== undefined) {
                    const match = isValuesEqual(valToWrite, readVal);
                    updateRefVerify(match ? 'Match' : 'Mismatch');
                    updateRefStats(match, match ? undefined : 'Mismatch'); 
                    if (!match && !isAuto) { addLog('warn', `Verify Failed: Wrote ${JSON.stringify(valToWrite)}, Read ${JSON.stringify(readVal)}`); }
                } else {
                    updateRefVerify(null); updateRefStats(false, 'Read Back Failed');
                }
            } else {
                updateRefVerify(null); updateRefStats(true); 
            }
            if (!isAuto) syncRefsToState();
        } catch (e: any) {
            updateRefStatus('Failed', 0, null); updateRefStats(false, 'Write Exception');
            addLog('error', `Inspector Write Failed: ${e.message}`);
            if (!isAuto) syncRefsToState();
        }
    };
    
    // ... [syncRefsToState, setLastWriteStatusState, handleManualWrite, etc. remain same] ...
    const updateRefStatus = (status: string, rtt: number, verify: 'Match'|'Mismatch'|null) => {
        lastWriteStatusRef.current = status;
        writeRttRef.current = rtt;
        if (verify !== undefined) verifyStatusRef.current = verify;
    };
    const updateRefVerify = (v: 'Match'|'Mismatch'|null) => { verifyStatusRef.current = v; };
    const updateRefStats = (success: boolean, errorReason?: string) => {
        const s = writeStatsRef.current;
        let newHistory = s.failHistory;
        if (!success) {
            const d = new Date();
            const timeStr = d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
            const entry = `${timeStr} - ${errorReason || 'Fail'}`;
            newHistory = [entry, ...s.failHistory].slice(0, 10);
        }
        writeStatsRef.current = { total: s.total + 1, success: s.success + (success ? 1 : 0), fail: s.fail + (success ? 0 : 1), failHistory: newHistory };
    };
    const syncRefsToState = () => {
        setDisplayLastWriteStatus(lastWriteStatusRef.current);
        setDisplayWriteRtt(writeRttRef.current);
        setDisplayVerifyStatus(verifyStatusRef.current);
        setDisplayWriteStats({...writeStatsRef.current});
    };
    const setLastWriteStatusState = (s: string) => {
        lastWriteStatusRef.current = s;
        setDisplayLastWriteStatus(s);
    };
    const handleManualWrite = () => { performWriteCycle(undefined, false); };
    const handleLocalBufferUpdate = async (writes: { indexRange: string, value: any }[]) => { if (writes.length > 0) setInsWriteData(writes[0].value); };
    const handleReadResultLocalUpdate = async (writes: { indexRange: string, value: any }[]) => { if (writes.length > 0 && insResult) setInsResult((prev: any) => ({ ...prev, value: writes[0].value })); };

    const handleCopyReadToWrite = () => {
        if (insResult && insResult.value !== undefined) {
            let val = insResult.value;
            if (insDataType === CipDataType.STRUCT && typeof val === 'string') val = normalizeEipValue(val, insDataType);
            try { const clone = JSON.parse(JSON.stringify(val)); setInsWriteData(clone); } catch(e) { setInsWriteData(val); }
        }
    };
    const handleGenerateStructure = () => { const size = Math.max(1, genSize); const defaults = generateDefaultValue(insDataType, size); setInsWriteData(defaults); setInsCount(size); addLog('info', `Generated ${size} element buffer for writing.`); };
    const handleResetBuffer = () => { const baseVal = generateDefaultValue(insDataType, 1); setInsWriteData(baseVal); setInsCount(1); addLog('info', 'Write buffer reset to scalar.'); };
    const generateNextValue = () => { const limits = getTypeLimits(insDataType); const valGetter = () => limits.rnd(); if (Array.isArray(insWriteDataRef.current)) return insWriteDataRef.current.map(() => valGetter()); else return valGetter(); };
    const handleQuickSet = (type: 'min' | 'max' | 'rnd') => { const limits = getTypeLimits(insDataType); const valGetter = () => type === 'min' ? limits.min : type === 'max' ? limits.max : limits.rnd(); if (Array.isArray(insWriteData)) { const newArr = insWriteData.map(() => valGetter()); setInsWriteData(newArr); return newArr; } else { const val = valGetter(); setInsWriteData(val); return val; } };
    const handleResetStats = () => { writeStatsRef.current = { total: 0, success: 0, fail: 0, failHistory: [] }; verifyStatusRef.current = null; syncRefsToState(); };


    // Auto Read/Write Loops ... (Unchanged)
    useEffect(() => {
        let timer: any;
        if (isAutoRead && isConnected) timer = setInterval(handleInsRead, Math.max(50, readCycleMs));
        return () => clearInterval(timer);
    }, [isAutoRead, isConnected, insTagName, insDataType, insCount, readCycleMs]);

    useEffect(() => {
        let timer: any;
        if (isAutoWrite && isConnected) {
            const cycleLogic = async () => {
                let valToSend = undefined;
                if (enableRandomize) { valToSend = generateNextValue(); setInsWriteData(valToSend); }
                await performWriteCycle(valToSend, true); 
            };
            timer = setInterval(cycleLogic, Math.max(50, writeCycleMs));
        }
        return () => clearInterval(timer);
    }, [isAutoWrite, isConnected, insTagName, insDataType, insCount, writeCycleMs, verifyWrite, enableRandomize]); 


    // --- LIST READ LOGIC (UPDATED: Normalize STRUCT + ERROR TRACKING) ---
    const handleListReadOnce = async () => {
        if (!isConnected || !activeGroup) return;
        try {
            const tagsToRead = activeGroup.nodes.map(t => ({ 
                tagName: t.tagName, 
                dataType: t.dataType,
                elementCount: t.elementCount || 1 
            }));
            
            const results = await eipService.readTagMulti(session.id, tagsToRead, session.alignment, useListApi);
            
            setReadCount(c => c + 1);

            let hasErrors = false;
            let firstErrorMsg = "";
            const now = new Date().toLocaleTimeString();
            const newNodes = activeGroup.nodes.map((t, i) => {
                const res = results[i];
                if (res.status === 'Bad') {
                    hasErrors = true;
                    if (!firstErrorMsg && res.error) firstErrorMsg = res.error;
                }
                let newType = t.dataType;
                if (res.status === 'Good' && res.detectedType !== undefined && res.detectedType !== t.dataType) {
                    newType = res.detectedType;
                }
                
                // Normalize STRUCT
                let val = res.value;
                if (newType === CipDataType.STRUCT && typeof val === 'string') {
                    val = normalizeEipValue(val, CipDataType.STRUCT);
                }

                // Error Tracking
                let newErrCount = t.errorCount || 0;
                let newHistory = t.errorHistory || [];
                if (res.status === 'Bad' || (res.status.startsWith('Error'))) {
                    newErrCount++;
                    const entry = `${now} - ${res.error || 'Read Failed'}`;
                    newHistory = [entry, ...newHistory].slice(0, 10);
                }

                return { 
                    ...t, 
                    value: val, 
                    status: res.status, 
                    lastUpdate: now, 
                    dataType: newType,
                    errorCount: newErrCount,
                    errorHistory: newHistory
                };
            });

            if (hasErrors && firstErrorMsg) {
                if (Date.now() - lastErrorLogTime.current > 5000) {
                    addLog('error', `List Read Error: ${firstErrorMsg}`);
                    lastErrorLogTime.current = Date.now();
                }
            }
            
            // REMOVED onDrop() trigger on failure
            // if (failureCount === results.length && results.length > 0) onDrop(); 

            const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: newNodes } : g);
            onUpdate({ config: { ...session.config, tagGroups: newGroups } });

        } catch (e: any) {
             console.error("List read failed", e);
        }
    };

    // --- LIST WRITE LOGIC (UPDATED + ERROR TRACKING) ---
    const handleListWriteOnce = async () => {
        if (!isConnected || !activeGroup) return;
        
        let writeSourceNodes = activeGroup.nodes;

        // Apply Generator Logic if enabled
        if (genMode !== 'None') {
            if (applyGenToAll || selectedIds.size > 0) {
                writeSourceNodes = activeGroup.nodes.map(t => {
                    if (applyGenToAll || selectedIds.has(t.id)) {
                        const newVal = applyGenerator(t.value, t.dataType, genMode === 'Inc' ? 'inc' : 'rnd');
                        return { ...t, value: newVal }; 
                    }
                    return t;
                });
            }
        }

        const tagsToWrite = writeSourceNodes.map(t => ({
             tagName: t.tagName,
             dataType: t.dataType,
             elementCount: t.elementCount || 1,
             value: normalizeEipValue(t.value, t.dataType)
        }));
        
        try {
            const results = await eipService.writeTagMulti(session.id, tagsToWrite, session.alignment, useListApi);
            setWriteCount(c => c + 1);

            const now = new Date().toLocaleTimeString();
            const newNodes = writeSourceNodes.map((t, i) => {
                const status = results[i]; 
                
                // Error Tracking
                let newErrCount = t.errorCount || 0;
                let newHistory = t.errorHistory || [];
                if (status !== 'Good') {
                    newErrCount++;
                    const entry = `${now} - ${status === 'WriteErr' ? 'Write Failed' : status}`;
                    newHistory = [entry, ...newHistory].slice(0, 10);
                }

                return { 
                    ...t, 
                    status: status === 'Good' ? 'Written' : 'WriteErr', 
                    lastUpdate: now,
                    errorCount: newErrCount,
                    errorHistory: newHistory
                };
            });
            
            const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: newNodes } : g);
            onUpdate({ config: { ...session.config, tagGroups: newGroups } });
            
        } catch (e: any) {
            addLog('error', `List Write Failed: ${e.message}`);
        }
    };

    // Auto Read Loop (List)
    useEffect(() => {
        let timer: any;
        if (isListAutoRead && isConnected) {
            timer = setInterval(handleListReadOnce, Math.max(50, listReadCycle));
        }
        return () => clearInterval(timer);
    }, [isListAutoRead, isConnected, listReadCycle, activeGroup, session.id]); 

    // Auto Write Loop (List)
    useEffect(() => {
        let timer: any;
        if (isListAutoWrite && isConnected) {
            timer = setInterval(handleListWriteOnce, Math.max(50, listWriteCycle));
        }
        return () => clearInterval(timer);
    }, [isListAutoWrite, isConnected, listWriteCycle, activeGroup, session.id, genMode, selectedIds, applyGenToAll]); 

    // ... [Quick Generator, Add Group, Delete Group, Bulk Add, Delete Selected, Batch Write, Import/Export Handlers remain same] ...
    const handleQuickGenerator = (mode: 'min' | 'max' | 'rnd' | 'inc') => {
        if (!activeGroup || selectedIds.size === 0) return;
        const newNodes = activeGroup.nodes.map(t => {
            if (selectedIds.has(t.id)) {
                return { ...t, value: applyGenerator(t.value, t.dataType, mode) };
            }
            return t;
        });
        const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: newNodes } : g);
        onUpdate({ config: { ...session.config, tagGroups: newGroups } });
    };
    const handleAddGroup = () => { const id = Math.random().toString(36).substr(2, 9); const newGroup: EipTagGroup = { id, name: `Group ${session.config.tagGroups.length + 1}`, nodes: [] }; onUpdate({ config: { ...session.config, tagGroups: [...session.config.tagGroups, newGroup] } }); setActiveGroupId(id); };
    const handleDeleteGroup = (e: React.MouseEvent, id: string) => { e.stopPropagation(); const newGroups = session.config.tagGroups.filter(g => g.id !== id); onUpdate({ config: { ...session.config, tagGroups: newGroups } }); if (activeTagGroupId === id && newGroups.length > 0) setActiveGroupId(newGroups[0].id); };
    const handleBulkAdd = () => { if (!bulkText.trim() || !activeTagGroupId) return; const names = bulkText.split(',').map(s => s.trim()).filter(Boolean); const newTags: EipTag[] = names.map(n => ({ id: Math.random().toString(36).substr(2, 9), tagName: n, dataType: CipDataType.DINT, elementCount: bulkCount, arraySize: 0, value: '-', status: 'Idle', lastUpdate: '-', requestCount: 0 })); const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: [...g.nodes, ...newTags] } : g); onUpdate({ config: { ...session.config, tagGroups: newGroups } }); setBulkText(''); addLog('success', `已添加 ${newTags.length} 个标签。`); };
    const handleDeleteSelected = () => { if (selectedIds.size === 0) return; const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: g.nodes.filter(n => !selectedIds.has(n.id)) } : g); onUpdate({ config: { ...session.config, tagGroups: newGroups } }); setSelectedIds(new Set()); };
    const handleBatchWrite = async (valStr: string) => { 
        setBatchWriteModalOpen(false); 
        if (selectedIds.size === 0 || !activeGroup) return; 
        const targets = activeGroup.nodes.filter(n => selectedIds.has(n.id)); 
        const tagsToWrite = targets.map(t => { 
            let valToWrite = normalizeEipValue(valStr, t.dataType);
            return { tagName: t.tagName, value: valToWrite, dataType: t.dataType, elementCount: t.elementCount }; 
        }); 
        try { 
            await eipService.writeTagMulti(session.id, tagsToWrite, session.alignment, useListApi); 
            setWriteCount(c => c + 1);
            const now = new Date().toLocaleTimeString();
            const newNodes = activeGroup.nodes.map(n => { 
                if (selectedIds.has(n.id)) { 
                    return { ...n, value: valStr, status: 'Written', lastUpdate: now }; 
                } 
                return n; 
            }); 
            const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: newNodes } : g); 
            onUpdate({ config: { ...session.config, tagGroups: newGroups } }); 
            addLog('success', `批量写入完成 (${targets.length} 个标签)。`); 
        } catch (e: any) { 
            addLog('error', `批量写入失败: ${e.message}`); 
        } 
    };
    
    const handleDownloadTemplate = () => { const csvContent = "TagName,DataType,Count,Value\nMotor_Speed,DINT,1,0\nData_Array,DINT,10,[0,0...]"; const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'eip_tags_template.csv'; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleExportConfig = () => { if (!activeGroup) return; const csvRows = ["TagName,DataType,Count,Value,Status"]; activeGroup.nodes.forEach(n => { const safeVal = (n.value !== null && n.value !== undefined) ? (typeof n.value === 'object' ? JSON.stringify(n.value).replace(/"/g, '""') : String(n.value)) : 'null'; const valField = safeVal.includes(',') ? `"${safeVal}"` : safeVal; csvRows.push(`${n.tagName},${CipDataTypeNames[n.dataType]},${n.elementCount||1},${valField},${n.status}`); }); const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `eip_group_${activeGroup.name}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    
    const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        const reader = new FileReader(); 
        reader.onload = (evt) => { 
            const text = evt.target?.result as string; 
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0); 
            const header = lines[0].toLowerCase().split(',');
            const findIdx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
            const idxTag = findIdx(['tagname', 'name']);
            const idxType = findIdx(['datatype', 'type']);
            const idxCount = findIdx(['count', 'size']);
            const idxValue = findIdx(['value']);
            const hasHeader = idxTag !== -1;
            const startRow = hasHeader ? 1 : 0;
            const defaultTagCol = hasHeader ? idxTag : 0;
            const newTags: EipTag[] = []; 
            for (let i = startRow; i < lines.length; i++) { 
                const line = lines[i];
                const parts = [];
                let current = '';
                let inQuotes = false;
                for(let j=0; j<line.length; j++) {
                    const char = line[j];
                    if(char === '"') inQuotes = !inQuotes;
                    else if(char === ',' && !inQuotes) { parts.push(current); current = ''; } 
                    else current += char;
                }
                parts.push(current);
                if (parts.length > defaultTagCol) {
                    const tagName = parts[defaultTagCol]?.trim().replace(/^"|"$/g, '');
                    if (!tagName) continue;
                    let dataType = CipDataType.DINT;
                    if (idxType !== -1 && parts[idxType]) {
                        const typeStr = parts[idxType].trim().toUpperCase();
                        for (const [k, v] of Object.entries(CipDataTypeNames)) {
                            if (v === typeStr) { dataType = Number(k); break; }
                        }
                    }
                    const count = idxCount !== -1 ? parseInt(parts[idxCount]) || 1 : 1;
                    let val: any = '-'; 
                    if (idxValue !== -1 && parts[idxValue]) {
                        const rawVal = parts[idxValue].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
                        if (rawVal) {
                             if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                                 try { val = JSON.parse(rawVal); } catch(e) { val = rawVal; }
                             } else {
                                 val = rawVal;
                             }
                        }
                    }
                    newTags.push({ 
                        id: Math.random().toString(36).substr(2, 9), 
                        tagName, 
                        dataType, 
                        elementCount: count, 
                        arraySize: 0, 
                        value: val, 
                        status: 'Idle', 
                        lastUpdate: '-', 
                        requestCount: 0,
                        errorCount: 0,
                        errorHistory: []
                    }); 
                }
            } 
            if (newTags.length > 0 && activeTagGroupId) { 
                const newGroups = session.config.tagGroups.map(g => g.id === activeTagGroupId ? { ...g, nodes: [...g.nodes, ...newTags] } : g); 
                onUpdate({ config: { ...session.config, tagGroups: newGroups } }); 
                addLog('success', `成功导入 ${newTags.length} 个标签。`); 
            } 
        }; 
        reader.readAsText(file); 
        e.target.value = ''; 
    };

    const handleRowClick = (e: React.MouseEvent, id: string, index: number) => { e.stopPropagation(); const newS = new Set(selectedIds); if (e.ctrlKey) { if (newS.has(id)) newS.delete(id); else newS.add(id); setLastSelectedId(id); } else if (e.shiftKey && lastSelectedId) { const allIds = filteredTagList.map(n => n.id); const start = allIds.indexOf(lastSelectedId); const end = index; const low = Math.min(start, end); const high = Math.max(start, end); newS.clear(); for(let i=low; i<=high; i++) newS.add(allIds[i]); } else { newS.clear(); newS.add(id); setLastSelectedId(id); } setSelectedIds(newS); };
    
    // NEW: Handle Error History Open
    const handleOpenErrorHistory = (e: React.MouseEvent, tag: EipTag) => {
        e.stopPropagation();
        setCurrentListHistory(tag.errorHistory || []);
        setCurrentListTagName(tag.tagName);
        setListErrorModalOpen(true);
    };

    const handleResetListErrors = () => {
        const newGroups = session.config.tagGroups.map(g => {
             if (g.id === activeTagGroupId) {
                 return {
                     ...g,
                     nodes: g.nodes.map(n => {
                         const target = selectedIds.size > 0 ? selectedIds.has(n.id) : true;
                         if (target) {
                             return { ...n, errorCount: 0, errorHistory: [] };
                         }
                         return n;
                     })
                 };
             }
             return g;
        });
        onUpdate({ config: { ...session.config, tagGroups: newGroups } });
        addLog('info', selectedIds.size > 0 ? 'Selected errors reset.' : 'All errors reset.');
    };

    // --- KEYBOARD HANDLERS ---
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            if (filteredTagList.length > 0) {
                const allIds = new Set(filteredTagList.map(t => t.id));
                setSelectedIds(allIds);
            }
        }
        
        if (e.key === 'Delete') {
            e.preventDefault();
            handleDeleteSelected();
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-cyan-100 overflow-hidden">
            <BatchWriteModal isOpen={batchWriteModalOpen} onClose={()=>setBatchWriteModalOpen(false)} onConfirm={handleBatchWrite} />
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleImportCsv} />

            {/* ERROR HISTORY MODAL (Inspector) */}
            <ErrorHistoryModal 
                isOpen={isErrorHistoryOpen} 
                onClose={() => setIsErrorHistoryOpen(false)} 
                history={displayWriteStats.failHistory} 
                title="Inspector Error History"
            />
            
            {/* ERROR HISTORY MODAL (List Item) */}
            <ErrorHistoryModal 
                isOpen={listErrorModalOpen} 
                onClose={() => setListErrorModalOpen(false)} 
                history={currentListHistory} 
                title={`Error History: ${currentListTagName}`}
            />

            {/* A. Top Inspector */}
            <div className="bg-white border-b border-cyan-100 flex-shrink-0 transition-all">
                 <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-50 cursor-pointer hover:bg-slate-50" onClick={() => setIsInspectorOpen(!isInspectorOpen)}>
                    <h3 className="text-sm font-bold text-cyan-900 flex items-center gap-2"><Calculator className="w-4 h-4 text-cyan-600"/> 单点标签读写 (Inspector)</h3>
                    {isInspectorOpen ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
                 </div>
                 {isInspectorOpen && (
                     <div className="p-3 border-t border-slate-50 bg-slate-50/30">
                         {/* ... Inspector Content ... */}
                         <div className="flex flex-col gap-3">
                             <div className="flex flex-wrap gap-3 items-end">
                                 <div className="flex-1 min-w-[200px]"><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">标签路径 (Tag Path)</label><input className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs font-mono h-8 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-200 outline-none" value={insTagName} onChange={e=>setInsTagName(e.target.value)} placeholder="e.g. My_Array" /></div>
                                 <div className="w-24"><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">数量 (Size)</label><input type="number" min="1" className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs font-mono h-8 text-center focus:border-cyan-500 outline-none" value={insCount} onChange={e=>setInsCount(Math.max(1, Number(e.target.value)))} title="iElementCount (Read & Write Length)" /></div>
                                 <div className="w-32"><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">CIP 类型</label><select className="w-full border border-slate-300 rounded px-1 py-1.5 text-xs h-8 focus:border-cyan-500 outline-none" value={insDataType} onChange={e=>setInsDataType(Number(e.target.value))}>{Object.entries(CipDataTypeNames).map(([v, n])=><option key={v} value={v}>{n}</option>)}</select></div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-[30%_70%] gap-4 mt-1">
                                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-[160px]">
                                    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500">
                                        <span>读取结果 (READ-ONLY)</span>
                                        <div className="flex items-center gap-2">
                                            <input className="w-12 h-5 text-center border rounded text-[9px]" value={readCycleMs} onChange={e=>setReadCycleMs(Number(e.target.value))} title="读取周期 (ms)"/>
                                            <button onClick={()=>setIsAutoRead(!isAutoRead)} disabled={!isConnected} className={`px-2 h-5 rounded flex items-center gap-1 ${isAutoRead ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-500'}`} title="自动读取 (Auto Read)">{isAutoRead ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}</button>
                                            <button onClick={handleInsRead} disabled={!isConnected} className="px-3 h-5 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50">读取</button>
                                        </div>
                                    </div>
                                    <div className="flex-1 p-2 overflow-auto relative">
                                        {insResult ? (
                                            <>
                                                <div className="absolute top-0 right-0 p-1 text-[9px] text-slate-400 font-mono z-10 bg-white/80">{insResult.rtt}ms</div>
                                                {insResult.status === 'Bad' ? (
                                                    <div className="text-red-500 text-xs font-mono p-2">{insResult.error || "Unknown Error"}</div>
                                                ) : (
                                                    <ValueDisplay 
                                                        value={normalizeEipValue(insResult.value, insDataType)} 
                                                        dataType={CipDataTypeNames[insDataType]} 
                                                        nodeId="read-result"
                                                        onWrite={handleReadResultLocalUpdate} 
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-300 text-xs italic">暂无数据</div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-[160px]">
                                    <div className="flex-shrink-0">
                                        <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center text-[10px] font-bold text-indigo-700 flex-nowrap overflow-x-auto scrollbar-none whitespace-nowrap">
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span>写入缓冲区 (WRITE BUFFER)</span>
                                                <button onClick={handleCopyReadToWrite} className="hover:bg-indigo-100 p-0.5 rounded text-indigo-600" title="复制读取值到写入区"><ArrowDownCircle className="w-3.5 h-3.5"/></button>
                                                <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-indigo-200 h-3.5" title="校验：写入后立即回读对比">
                                                    <span className={`text-[9px] uppercase font-bold tracking-tight ${verifyWrite ? 'text-indigo-600' : 'text-slate-400'}`}>校验 (Verify)</span>
                                                    <button onClick={() => setVerifyWrite(!verifyWrite)} className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors focus:outline-none ${verifyWrite ? 'bg-indigo-500' : 'bg-slate-300 hover:bg-slate-400'}`}>
                                                        <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${verifyWrite ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                                                <input className="w-12 h-5 text-center border border-indigo-200 rounded text-[9px] tabular-nums" value={writeCycleMs} onChange={e=>setWriteCycleMs(Number(e.target.value))} title="写入周期 (ms)"/>
                                                <div className="flex items-center bg-slate-200 rounded p-0.5 flex-shrink-0">
                                                    <button onClick={()=>setIsAutoWrite(!isAutoWrite)} disabled={!isConnected} className={`w-14 h-4 rounded flex items-center justify-center gap-1 text-[9px] font-bold transition-all ${isAutoWrite ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500'}`} title="自动写入循环">
                                                        {isAutoWrite ? <Pause className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5"/>} 自动
                                                    </button>
                                                    <button onClick={()=>setEnableRandomize(!enableRandomize)} className={`w-12 h-4 rounded flex items-center justify-center gap-1 text-[9px] font-bold transition-all ${enableRandomize ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="每次写入使用随机值">
                                                        <Dice5 className="w-2.5 h-2.5"/> 随机
                                                    </button>
                                                </div>
                                                <button onClick={handleManualWrite} disabled={!isConnected} className="px-3 h-5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 shadow-sm text-[10px] font-bold flex-shrink-0">写入</button>
                                            </div>
                                        </div>
                                        
                                        <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1">
                                                <span className="text-[9px] text-slate-400 font-bold">生成数组:</span>
                                                <input className="w-10 h-4 text-center text-[10px] outline-none font-mono" value={genSize} onChange={e => setGenSize(Math.max(1, Number(e.target.value)))} title="数组大小" />
                                                <button onClick={handleGenerateStructure} className="text-indigo-500 hover:bg-indigo-50 rounded p-0.5" title="生成空数组结构"><Wand2 className="w-3 h-3"/></button>
                                            </div>
                                            <div className="h-3 w-px bg-slate-300"></div>
                                            <button onClick={() => handleQuickSet('min')} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] text-slate-600 hover:bg-slate-50 font-bold shadow-sm">最小</button>
                                            <button onClick={() => handleQuickSet('max')} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] text-slate-600 hover:bg-slate-50 font-bold shadow-sm">最大</button>
                                            <button onClick={() => handleQuickSet('rnd')} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] text-slate-600 hover:bg-slate-50 font-bold shadow-sm flex items-center gap-1"><Shuffle className="w-2.5 h-2.5"/> 随机</button>
                                            <div className="flex-1"></div>
                                            <button onClick={handleResetBuffer} className="px-1.5 py-0.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded text-[9px] font-bold shadow-sm flex items-center gap-1" title="重置缓冲区为标量"><Trash2 className="w-3 h-3"/> 清空</button>
                                        </div>
                                    </div>

                                    <div className="flex-1 p-2 overflow-auto relative">
                                        {Array.isArray(insWriteData) ? (
                                            <div className="h-full flex flex-col">
                                                <div className="mb-2 text-[9px] text-slate-400 italic text-center">数组模式：点击下方按钮打开表格编辑器</div>
                                                <ValueDisplay value={insWriteData} dataType={CipDataTypeNames[insDataType]} nodeId="write-buffer" onWrite={handleLocalBufferUpdate} />
                                            </div>
                                        ) : (
                                            <ScalarWriteEditor value={insWriteData} dataType={insDataType} onChange={setInsWriteData} />
                                        )}
                                    </div>

                                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-[10px] flex-shrink-0 min-h-[32px]">
                                        <div className="flex items-center gap-3">
                                             <div className="min-w-[50px] flex justify-start">
                                                 {displayLastWriteStatus ? (
                                                     <div className={`flex items-center justify-center gap-1 px-2 py-0.5 rounded border ${displayLastWriteStatus === 'Good' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                         <span className="font-bold truncate">{displayLastWriteStatus}</span>
                                                     </div>
                                                 ) : <span className="text-slate-300 italic">就绪</span>}
                                             </div>
                                             {displayVerifyStatus && (
                                                 <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${displayVerifyStatus === 'Match' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                                     <span className="font-bold">{displayVerifyStatus === 'Match' ? '匹配' : '不匹配'}</span>
                                                 </div>
                                             )}
                                             {displayWriteRtt !== null && <span className="text-slate-400 font-mono">{displayWriteRtt}ms</span>}
                                        </div>
                                        {displayWriteStats.total > 0 && (
                                            <div className="flex items-center gap-2 tabular-nums animate-in fade-in">
                                                <div className="flex items-center gap-1 text-slate-500 font-mono" title="写入总数"><RefreshCw className="w-3 h-3 text-slate-400"/> {displayWriteStats.total}</div>
                                                <div className="flex items-center gap-1 text-emerald-600 font-mono font-bold" title="成功"><ShieldCheck className="w-3 h-3"/> {displayWriteStats.success}</div>
                                                {displayWriteStats.fail > 0 && (
                                                    <button onClick={() => setIsErrorHistoryOpen(true)} className="flex items-center gap-1 text-red-500 font-mono font-bold hover:bg-red-50 rounded px-1 transition-colors" title="查看错误历史"><ShieldAlert className="w-3 h-3"/> {displayWriteStats.fail}</button>
                                                )}
                                                <button onClick={handleResetStats} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 ml-1" title="重置统计"><RotateCcw className="w-3 h-3"/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                             </div>
                         </div>
                     </div>
                 )}
            </div>

            {/* B. Tag List Groups */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><List className="w-4 h-4 text-cyan-600" /> 标签列表 (Tag List)</h2>
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-cyan-200 shadow-sm h-7 overflow-hidden">
                        <button className="px-2 h-full hover:bg-cyan-50 text-slate-600 border-r" title="复制"><Copy className="w-3.5 h-3.5"/></button>
                        <button className="px-2 h-full hover:bg-cyan-50 text-slate-600 border-r" title="粘贴"><ClipboardPaste className="w-3.5 h-3.5"/></button>
                        <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="px-2 h-full hover:bg-red-50 text-red-500" title="删除"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleAddGroup} className="px-3 h-7 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-sm"><Plus className="w-3.5 h-3.5"/> 新建分组</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-end px-2 pt-2 bg-slate-100/80 border-b border-slate-200 gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
                {session.config.tagGroups.map((g) => (
                    <div key={g.id} onClick={() => setActiveGroupId(g.id)} className={`group relative flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-bold cursor-pointer transition-all border-t border-x select-none min-w-[120px] ${activeTagGroupId === g.id ? 'bg-white border-slate-200 text-cyan-700 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'} ${selectedGroupIds.has(g.id) ? 'ring-1 ring-cyan-200' : ''}`}>
                        <span className="truncate">{g.name}</span>
                        <span className="bg-slate-200 text-[9px] px-1 rounded-full text-slate-500">{g.nodes.length}</span>
                        <button onClick={(e) => handleDeleteGroup(e, g.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 hover:text-red-500 rounded-full transition-all"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>

            {/* List Toolbar */}
            <div className="p-2 border-b border-slate-100 flex flex-wrap gap-4 bg-slate-50/50 items-center flex-shrink-0">
                 {/* LIST READ SECTION */}
                 <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">读取 (READ)</span>
                    <input type="number" className="w-14 border border-slate-300 rounded h-7 px-1 text-xs text-center outline-none" value={localListReadCycle} onChange={e=>setLocalListReadCycle(Number(e.target.value))} onBlur={()=>setListReadCycle(localListReadCycle)} />
                    {readCount > 0 && <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100" title="成功读取次数">{readCount}</span>}
                    <button onClick={handleListReadOnce} disabled={!isConnected} className="px-2 h-7 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-bold text-slate-600 shadow-sm">读一次</button>
                    <button onClick={()=>setIsListAutoRead(!isListAutoRead)} disabled={!isConnected} className={`w-7 h-7 rounded flex items-center justify-center transition-all ${isListAutoRead ? 'bg-emerald-500 text-white shadow-md animate-pulse' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>{isListAutoRead ? <Pause className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}</button>
                </div>

                {/* LIST WRITE SECTION */}
                <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">写入 (WRITE)</span>
                    <input type="number" className="w-14 border border-slate-300 rounded h-7 px-1 text-xs text-center outline-none" value={localListWriteCycle} onChange={e=>setLocalListWriteCycle(Number(e.target.value))} onBlur={()=>setListWriteCycle(localListWriteCycle)} />
                    {writeCount > 0 && <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100" title="成功写入次数">{writeCount}</span>}
                    
                    {/* Auto Gen Mode Toggle */}
                    <div className="relative group flex items-center">
                        <select 
                            className={`h-7 border rounded-l text-[10px] font-bold outline-none px-1 appearance-none pr-4 cursor-pointer transition-colors ${genMode !== 'None' ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-slate-500 border-slate-300'}`}
                            value={genMode}
                            onChange={(e) => setGenMode(e.target.value as any)}
                            title="自动生成模式"
                        >
                            <option value="None">静态 (Static)</option>
                            <option value="Inc">自动+1 (Auto +1)</option>
                            <option value="Rnd">随机 (Auto Rnd)</option>
                        </select>
                        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-[45px] top-2 pointer-events-none"/>
                        
                        <label className={`h-7 flex items-center px-1.5 border border-l-0 rounded-r cursor-pointer transition-colors ${applyGenToAll ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-300'}`} title="应用生成器到列表所有项 (默认仅选中项)">
                            <input 
                                type="checkbox" 
                                className="w-3 h-3 accent-indigo-600 cursor-pointer"
                                checked={applyGenToAll} 
                                onChange={e => setApplyGenToAll(e.target.checked)} 
                            />
                            <span className={`text-[9px] font-bold ml-1 ${applyGenToAll ? 'text-indigo-700' : 'text-slate-400'}`}>All</span>
                        </label>
                    </div>

                    <button onClick={handleListWriteOnce} disabled={!isConnected} className="px-2 h-7 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-bold text-slate-600 shadow-sm">写一次</button>
                    <button onClick={()=>setIsListAutoWrite(!isListAutoWrite)} disabled={!isConnected} className={`w-7 h-7 rounded flex items-center justify-center transition-all ${isListAutoWrite ? 'bg-indigo-500 text-white shadow-md animate-pulse' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>{isListAutoWrite ? <Pause className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}</button>
                </div>
                
                {/* --- API Strategy Toggle --- */}
                <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200" title="切换后端 API 策略">
                    <button onClick={() => setUseListApi(false)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-1 ${!useListApi ? 'bg-white shadow-sm text-cyan-700' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Workflow className="w-3 h-3" /> 循环调用 (Loop)
                    </button>
                    <button onClick={() => setUseListApi(true)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-1 ${useListApi ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}>
                        <List className="w-3 h-3" /> 列表调用 (List)
                    </button>
                </div>
                
                {/* NEW: Reset List Errors */}
                <button onClick={handleResetListErrors} className="px-2 h-7 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-bold text-slate-600 shadow-sm flex items-center gap-1" title="重置列表中的错误计数"><RotateCcw className="w-3 h-3" /> Reset Err</button>

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-cyan-50 border border-cyan-100 rounded animate-in fade-in">
                        <span className="text-xs font-bold text-cyan-700">{selectedIds.size} 已选</span>
                        
                        {/* Quick Generators */}
                        <div className="flex bg-white rounded border border-cyan-200 p-0.5 gap-0.5">
                            <button onClick={() => handleQuickGenerator('min')} className="px-1.5 py-0.5 text-[9px] hover:bg-cyan-100 rounded">最小</button>
                            <button onClick={() => handleQuickGenerator('max')} className="px-1.5 py-0.5 text-[9px] hover:bg-cyan-100 rounded">最大</button>
                            <button onClick={() => handleQuickGenerator('rnd')} className="px-1.5 py-0.5 text-[9px] hover:bg-cyan-100 rounded">随机</button>
                            <button onClick={() => handleQuickGenerator('inc')} className="px-1.5 py-0.5 text-[9px] hover:bg-cyan-100 rounded">+1</button>
                        </div>

                        <button onClick={()=>setBatchWriteModalOpen(true)} className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] rounded font-bold">批量写入</button>
                    </div>
                )}
                <div className="flex-1 flex gap-2 items-center justify-end ml-4 pl-4 border-l border-slate-200">
                    <div className="flex items-center bg-white border border-slate-200 rounded overflow-hidden shadow-sm h-7 mr-2">
                        <button onClick={handleDownloadTemplate} className="px-2 h-full hover:bg-slate-50 text-slate-600 border-r" title="下载模板"><Download className="w-3.5 h-3.5"/></button>
                        <button onClick={handleExportConfig} className="px-2 h-full hover:bg-slate-50 text-slate-600 border-r" title="导出"><Save className="w-3.5 h-3.5"/></button>
                        <button onClick={() => fileInputRef.current?.click()} className="px-2 h-full hover:bg-slate-50 text-slate-600" title="导入"><Upload className="w-3.5 h-3.5"/></button>
                    </div>
                    
                    {/* Add Settings */}
                    <div className="flex items-center bg-white border border-slate-300 rounded h-7">
                        <input className="w-10 text-xs text-center border-r border-slate-300 h-full outline-none font-bold text-slate-600" title="元素数量 (Size)" type="number" min="1" max="1000" value={bulkCount} onChange={e => setBulkCount(Math.max(1, Number(e.target.value)))} />
                        <input className="w-32 text-xs px-2 h-full outline-none" placeholder="Tag1, Tag2..." value={bulkText} onChange={e => setBulkText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleBulkAdd()} />
                    </div>
                    
                    <button onClick={handleBulkAdd} className="px-3 h-7 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-sm"><ListPlus className="w-3.5 h-3.5" /> 添加</button>
                </div>
            </div>

            {/* Data Grid with VIRTUAL SCROLLING */}
            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-auto bg-white relative outline-none pb-12"
                tabIndex={0} 
                onKeyDown={handleKeyDown}
                onClick={() => setSelectedIds(new Set())}
                onScroll={handleScroll}
            >
                {/* 1. Header (Sticky) */}
                <div 
                    ref={headerRef} 
                    className="flex items-center bg-white border-b border-slate-200 h-9 flex-shrink-0 shadow-sm z-20 sticky top-0 overflow-hidden" 
                    onClick={e => e.stopPropagation()}
                    style={{ minWidth: 'max-content' }}
                >
                    {/* Resizable Headers */}
                    <div style={{ width: colWidths.index }} className={HEADER_CELL_BASE}>
                        <div className="w-full flex justify-center items-center"><GripVertical className="w-3 h-3 text-slate-300"/></div>
                        <Resizer onMouseDown={(e) => startResizing('index', e)} />
                    </div>
                    <div style={{ width: colWidths.tagName }} className={HEADER_CELL_BASE}>标签名称 (Tag Name)<Resizer onMouseDown={(e) => startResizing('tagName', e)} /></div>
                    <div style={{ width: colWidths.elementCount }} className={HEADER_CELL_BASE}>元素数量<Resizer onMouseDown={(e) => startResizing('elementCount', e)} /></div>
                    <div style={{ width: colWidths.dataType }} className={HEADER_CELL_BASE}>类型 (Type)<Resizer onMouseDown={(e) => startResizing('dataType', e)} /></div>
                    <div style={{ width: colWidths.value }} className={HEADER_CELL_BASE}>数值 (Value)<Resizer onMouseDown={(e) => startResizing('value', e)} /></div>
                    
                    {/* Filterable Status Header */}
                    <div 
                        style={{ width: colWidths.status }} 
                        className={`${HEADER_CELL_BASE} cursor-pointer hover:bg-slate-100 transition-colors`} 
                        onClick={cycleStatusFilter} 
                        title="点击筛选状态 (Click to filter: All -> Bad -> Good)"
                    >
                        <div className="flex items-center justify-between w-full">
                            <span>状态 (Status)</span>
                            {statusFilter !== 'ALL' && (
                                <Filter className={`w-3 h-3 ${statusFilter === 'BAD' ? 'text-red-500' : 'text-emerald-500'} fill-current`} />
                            )}
                        </div>
                        <Resizer onMouseDown={(e) => startResizing('status', e)} />
                    </div>
                    
                    {/* NEW ERROR COLUMN */}
                    <div style={{ width: colWidths.error }} className={HEADER_CELL_BASE}>Err (Count)<Resizer onMouseDown={(e) => startResizing('error', e)} /></div>

                    <div style={{ width: colWidths.actions }} className={HEADER_CELL_BASE}>操作<Resizer onMouseDown={(e) => startResizing('actions', e)} /></div>
                </div>
                
                {/* 2. Virtual Scroll Container */}
                <div className="relative min-w-max" style={{ height: totalHeight }}>
                    {filteredTagList.length === 0 ? (
                        <div className="absolute top-0 left-0 right-0 p-10 text-center text-slate-400 italic text-sm">
                            {statusFilter === 'ALL' ? '分组为空。请添加标签。' : statusFilter === 'BAD' ? '未发现异常标签。' : '没有符合筛选条件的标签。'}
                        </div>
                    ) : (
                        visibleTags.map(({tag, index}) => {
                            const isSelected = selectedIds.has(tag.id);
                            
                            // Check if this cell is being edited
                            const isEditingName = editingCell?.id === tag.id && editingCell?.field === 'tagName';
                            const isEditingCount = editingCell?.id === tag.id && editingCell?.field === 'elementCount';
                            const isEditingType = editingCell?.id === tag.id && editingCell?.field === 'dataType';
                            const isEditingValue = editingCell?.id === tag.id && editingCell?.field === 'value';

                            return (
                                <div 
                                    key={tag.id} 
                                    style={{ 
                                        position: 'absolute', 
                                        top: index * ROW_HEIGHT, 
                                        height: ROW_HEIGHT, 
                                        left: 0, 
                                        right: 0, 
                                        width: '100%' 
                                    }}
                                    onClick={(e) => handleRowClick(e, tag.id, index)}
                                    className={`flex items-center border-b border-slate-100 text-xs hover:bg-slate-50 cursor-pointer ${isSelected ? 'bg-cyan-50' : ''}`}
                                >
                                    <div style={{ width: colWidths.index }} className={CELL_BASE}>
                                        <div className="w-full text-center text-slate-400">{index+1}</div>
                                    </div>
                                    
                                    {/* Editable Tag Name */}
                                    <div style={{ width: colWidths.tagName }} className={`${CELL_BASE} font-mono font-bold text-slate-700`} title={tag.tagName} onDoubleClick={() => handleStartEdit(tag.id, 'tagName', tag.tagName)}>
                                        {isEditingName ? (
                                            <input 
                                                autoFocus 
                                                className="w-full h-full bg-white border border-cyan-500 px-1 outline-none font-mono text-xs" 
                                                value={tempEditValue} 
                                                onChange={e => setTempEditValue(e.target.value)} 
                                                onBlur={handleCommitEdit} 
                                                onKeyDown={e => { if(e.key==='Enter') handleCommitEdit(); if(e.key==='Escape') handleCancelEdit(); }} 
                                            />
                                        ) : (
                                            tag.tagName
                                        )}
                                    </div>

                                    {/* Editable Element Count */}
                                    <div style={{ width: colWidths.elementCount }} className={`${CELL_BASE} justify-center`} onDoubleClick={() => handleStartEdit(tag.id, 'elementCount', tag.elementCount || 1)}>
                                        {isEditingCount ? (
                                            <input 
                                                autoFocus
                                                type="number" 
                                                min="1"
                                                className="w-full h-full text-center border border-cyan-500 px-1 outline-none"
                                                value={tempEditValue}
                                                onChange={e => setTempEditValue(e.target.value)}
                                                onBlur={handleCommitEdit}
                                                onKeyDown={e => { if(e.key==='Enter') handleCommitEdit(); if(e.key==='Escape') handleCancelEdit(); }}
                                            />
                                        ) : (
                                            <span>{tag.elementCount || 1}</span>
                                        )}
                                    </div>

                                    {/* Editable Data Type */}
                                    <div style={{ width: colWidths.dataType }} className={`${CELL_BASE} text-slate-500`} onDoubleClick={() => handleStartEdit(tag.id, 'dataType', tag.dataType)}>
                                        {isEditingType ? (
                                            <select 
                                                autoFocus
                                                className="w-full h-full border border-cyan-500 outline-none text-[10px] bg-white"
                                                value={tempEditValue}
                                                onChange={e => setTempEditValue(e.target.value)}
                                                onBlur={handleCommitEdit}
                                                onKeyDown={e => { if(e.key==='Enter') handleCommitEdit(); if(e.key==='Escape') handleCancelEdit(); }}
                                            >
                                                {Object.entries(CipDataTypeNames).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                                            </select>
                                        ) : (
                                            CipDataTypeNames[tag.dataType]
                                        )}
                                    </div>

                                    <div 
                                        style={{ width: colWidths.value }} 
                                        className={`${CELL_BASE} bg-slate-50/50 cursor-text`} 
                                        title={String(tag.value)}
                                        onDoubleClick={(e) => {
                                            // Enable inline edit for scalars only via cell double click
                                            // Complex types (Arrays/Structs) handled by ValueDisplay button
                                            if (!isTagComplex(tag)) {
                                                handleStartEdit(tag.id, 'value', tag.value);
                                            }
                                        }}
                                    >
                                        {isEditingValue ? (
                                            <input 
                                                autoFocus 
                                                className="w-full h-full bg-white border border-cyan-500 px-1 outline-none font-mono text-xs" 
                                                value={tempEditValue} 
                                                onChange={e => setTempEditValue(e.target.value)} 
                                                onBlur={handleCommitEdit} 
                                                onKeyDown={e => { if(e.key==='Enter') handleCommitEdit(); if(e.key==='Escape') handleCancelEdit(); }} 
                                            />
                                        ) : (
                                            <ValueDisplay 
                                                value={normalizeEipValue(tag.value, tag.dataType)} 
                                                dataType={CipDataTypeNames[tag.dataType]} 
                                                nodeId={tag.id}
                                                onWrite={(writes) => handleTagWrite(tag.id, writes)}
                                            />
                                        )}
                                    </div>
                                    <div style={{ width: colWidths.status }} className={CELL_BASE}>
                                        {tag.status === 'Good' || tag.status === 'Written' ? <span className="text-emerald-600 font-bold">{tag.status}</span> : <span className="text-red-500 font-bold" title="See System Logs for details">{tag.status}</span>}
                                    </div>
                                    
                                    {/* NEW ERROR COLUMN CELL */}
                                    <div style={{ width: colWidths.error }} className={`${CELL_BASE} justify-center`}>
                                        {tag.errorCount && tag.errorCount > 0 ? (
                                            <div 
                                                className="flex items-center gap-1 group/err relative cursor-help bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-full transition-colors"
                                                onClick={(e) => handleOpenErrorHistory(e, tag)}
                                            >
                                                <span className="text-red-600 font-bold">{tag.errorCount}</span>
                                                <Info className="w-3 h-3 text-red-400" />
                                            </div>
                                        ) : (
                                            <span className="text-slate-200">-</span>
                                        )}
                                    </div>

                                    <div style={{ width: colWidths.actions }} className={`${CELL_BASE} justify-center`}>
                                        <button onClick={(e)=>{e.stopPropagation(); const ng = session.config.tagGroups.map(g=>g.id===activeTagGroupId ? {...g, nodes: g.nodes.filter(n=>n.id!==tag.id)} : g); onUpdate({config: {...session.config, tagGroups: ng}});}} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
