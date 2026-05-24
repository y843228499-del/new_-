

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OpcNode, OpcDataType, StatusCodes, BatchGroup, ConnectionStatus } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Play, Pause, List, Calculator, X, ChevronDown, ChevronUp, Plus, Copy, ClipboardPaste, ListPlus, Trash2, Download, Save, FileSpreadsheet, Edit3, Check, AlertCircle, ToggleLeft, ToggleRight, MoreVertical, ArrowLeft, ArrowRight, Upload, Clock, Activity, Zap, StepForward, ChevronLeft, ChevronRight as ChevronIcon, GripVertical, Split, HelpCircle, Filter, RotateCcw, Info, Timer } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ValueDisplay from './ValueDisplay';
import { toast } from 'sonner';

interface ReadWritePanelProps {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  sessionId?: string; 
  addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
  pendingNodes?: OpcNode[];
  onNodesConsumed?: () => void;
  onSyncIds?: (ids: Set<string>) => void;
  initialGroups?: BatchGroup[];
  onGroupsChange?: (groups: BatchGroup[]) => void;
  autoReadEnabled?: boolean; 
  isVisible?: boolean;
}

const DATA_TYPES: OpcDataType[] = ['Boolean', 'SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'LINT', 'ULINT', 'LWORD', 'LTIME', 'Float', 'Double', 'String', 'DateTime'];
const ROW_HEIGHT = 36; 
const BUFFER_ROWS = 5; 

const TYPE_LIMITS: Record<string, { min: any; max: any }> = {
    'SByte': { min: -128, max: 127 },
    'Byte': { min: 0, max: 255 },
    'Int16': { min: -32768, max: 32767 },
    'UInt16': { min: 0, max: 65535 },
    'Int32': { min: -2147483648, max: 2147483647 },
    'UInt32': { min: 0, max: 4294967295 },
    'Int64': { min: BigInt("-9223372036854775808"), max: BigInt("9223372036854775807") },
    'LINT': { min: BigInt("-9223372036854775808"), max: BigInt("9223372036854775807") },
    'UInt64': { min: BigInt(0), max: BigInt("18446744073709551615") },
    'ULINT': { min: BigInt(0), max: BigInt("18446744073709551615") },
    'LWORD': { min: BigInt(0), max: BigInt("18446744073709551615") },
    'LTIME': { min: BigInt(0), max: BigInt("18446744073709551615") },
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} Timed out (${ms}ms)`)), ms))
    ]);
};

// Helper: Simplify display logic.
// If the dataType string already contains dimensions (e.g. Int32[2,2]), trust it.
const formatDataTypeDisplay = (dataType: string, value: any): string => {
    // Priority 1: String already has dimensions (Added by SessionWorkspace.tsx logic)
    if (dataType && dataType.includes('[')) return dataType;
    
    // Priority 2: Value-based fallback for older items or manual entries without explicit dims
    if (Array.isArray(value)) {
        const dims: number[] = [value.length];
        let curr = value;
        // Simple depth check
        while (curr.length > 0 && Array.isArray(curr[0])) {
            dims.push(curr[0].length);
            curr = curr[0];
        }
        return `${dataType}[${dims.join(',')}]`;
    }
    
    return dataType;
};

const calculateNextValue = (val: any, dataType: string): any => {
    // 1. Recursive Array Handling
    if (Array.isArray(val)) {
        return val.map(item => calculateNextValue(item, dataType));
    }

    // 2. Extract Base Type (Remove dimensions e.g. "Int32[2]" -> "Int32")
    const baseType = dataType.includes('[') ? dataType.split('[')[0] : dataType;

    // 3. Handle Null/Undefined (Initialization logic)
    if (val === null || val === undefined) {
        // If it's supposed to be an array, try to reconstruct default from dimensions in string
        if (dataType.includes('[')) {
            const match = dataType.match(/\[([\d,]+)\]/);
            if (match) {
                try {
                    const dims = match[1].split(',').map(d => parseInt(d.trim()));
                    const createArr = (d: number[], depth: number): any => {
                         if (depth >= d.length) return 0;
                         const size = d[depth];
                         // Leaf node (last dimension) creates array of scalars
                         if (depth === d.length - 1) return new Array(size).fill(0);
                         // Inner node creates array of arrays
                         return Array.from({length: size}, () => createArr(d, depth + 1));
                    };
                    const defaultArr = createArr(dims, 0);
                    // Now increment the newly created default array
                    return calculateNextValue(defaultArr, dataType);
                } catch(e) {}
            }
        }
        // Scalar default
        return baseType === 'Boolean' ? true : 1;
    }

    // 4. Scalar Increment Logic
    if (baseType === 'Boolean') {
        const boolVal = val === true || String(val).toLowerCase() === 'true' || String(val) === '1';
        return !boolVal;
    }
    if (baseType === 'DateTime') {
        return new Date().toISOString();
    }
    if (baseType === 'String') {
        const strVal = String(val || "");
        const match = strVal.match(/(\d+)$/);
        if (match) {
            const numStr = match[1];
            const nextNum = parseInt(numStr, 10) + 1;
            const paddedNextNum = String(nextNum).padStart(numStr.length, '0');
            return strVal.substring(0, strVal.length - numStr.length) + paddedNextNum;
        }
        return strVal + " 1";
    }

    // 5. Limits & Wrapping
    const limits = TYPE_LIMITS[baseType];
    if (limits || baseType === 'Int64' || baseType === 'UInt64' || baseType === 'LINT' || baseType === 'ULINT' || baseType === 'LWORD' || baseType === 'LTIME') {
        if ((limits && typeof limits.max === 'bigint') || baseType === 'Int64' || baseType === 'UInt64' || baseType === 'LINT' || baseType === 'ULINT' || baseType === 'LWORD' || baseType === 'LTIME') {
            let bVal;
            try { bVal = BigInt(val); } catch(e) { bVal = 0n; }
            // Wrapping logic for BigInt
            if (limits && bVal >= limits.max) return limits.min.toString();
            return (bVal + 1n).toString();
        } else if (limits) {
            let nVal = Number(val);
            if (isNaN(nVal)) nVal = 0;
            if (nVal >= limits.max) return limits.min;
            return nVal + 1;
        }
    }

    // 6. Generic Number Fallback
    const num = Number(val);
    if (!isNaN(num)) return num + 1;
    return val;
};

const ensureInternalIds = (nodes: OpcNode[]) => {
    return nodes.map(n => ({
        ...n,
        internalId: n.internalId || Math.random().toString(36).substr(2, 9),
        errorCount: n.errorCount || 0,
        errorStats: n.errorStats || {}
    }));
};

const isStructureEqual = (a: BatchGroup[] | undefined, b: BatchGroup[] | undefined): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((groupA, i) => {
        const groupB = b[i];
        if (groupA.id !== groupB.id) return false;
        if (groupA.name !== groupB.name) return false;
        if (groupA.nodes.length !== groupB.nodes.length) return false;
        return groupA.nodes.every((nodeA, j) => {
            const nodeB = groupB.nodes[j];
            return nodeA.nodeId === nodeB.nodeId && 
                   nodeA.dataType === nodeB.dataType &&
                   nodeA.internalId === nodeB.internalId;
        });
    });
};

const BatchWriteModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (val: string) => void }> = ({ isOpen, onClose, onConfirm }) => {
    const [val, setVal] = useState('');
    const { t } = useLanguage();
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-80 p-4 animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-slate-700 mb-2">{t.rw.batchWriteModal.title}</h3>
                <p className="text-xs text-slate-500 mb-2">{t.rw.batchWriteModal.message}</p>
                <input 
                    autoFocus
                    className="w-full border border-blue-500 rounded px-3 py-2 text-sm mb-4 outline-none"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder="Value..."
                    onKeyDown={e => e.key === 'Enter' && onConfirm(val)}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-bold">{t.rw.batchWriteModal.cancel}</button>
                    <button onClick={() => onConfirm(val)} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded text-xs font-bold">{t.rw.batchWriteModal.confirm}</button>
                </div>
            </div>
        </div>
    );
};

const ImportConfirmModal: React.FC<{ 
    isOpen: boolean; 
    nodeCount: number; 
    onClose: () => void; 
    onOverwrite: () => void; 
    onAppend: () => void; 
}> = ({ isOpen, nodeCount, onClose, onOverwrite, onAppend }) => {
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px]">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-96 p-6 animate-in fade-in zoom-in duration-200 flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                        <Upload className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">导入配置</h3>
                        <p className="text-xs text-slate-500">Import Configuration</p>
                    </div>
                </div>
                <div className="text-sm text-slate-600 Chaudhary py-2">
                    解析到 <span className="font-bold text-blue-600">{nodeCount}</span> 个节点。请选择导入方式：
                    <ul className="mt-2 space-y-2 text-xs text-slate-500 list-disc pl-4">
                        <li><b>覆盖 (Overwrite)</b>: 清空当前分组并替换为新列表。</li>
                        <li><b>追加 (Append)</b>: 保留现有节点，将新节点添加到底部。</li>
                    </ul>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded text-xs font-bold">取消</button>
                    <button onClick={onAppend} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-bold shadow-sm">追加</button>
                    <button onClick={onOverwrite} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-sm">覆盖</button>
                </div>
            </div>
        </div>
    );
};

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
    onClear: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
}

const GroupContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onRename, onDelete, onClear, onMoveLeft, onMoveRight }) => {
    const { t } = useLanguage();
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (
        <div 
            ref={menuRef}
            className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg py-1 w-40 flex flex-col text-slate-700 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
        >
            <button onClick={onRename} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><Edit3 className="w-3.5 h-3.5"/> {t.rw.contextMenu.rename}</button>
            <button onClick={onMoveLeft} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><ArrowLeft className="w-3.5 h-3.5"/> {t.rw.contextMenu.moveLeft}</button>
            <button onClick={onMoveRight} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><ArrowRight className="w-3.5 h-3.5"/> {t.trend.contextMenu.moveRight}</button>
            <div className="h-px bg-slate-100 my-1"></div>
            <button onClick={onClear} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2 text-amber-600"><Trash2 className="w-3.5 h-3.5"/> {t.rw.contextMenu.clear}</button>
            <button onClick={onDelete} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2 text-red-600"><X className="w-3.5 h-3.5"/> {t.rw.contextMenu.delete}</button>
        </div>
    );
};

const isBad = (s: string) => s ? s.startsWith('Bad') : false;

type ColWidths = {
    index: number;
    nodeId: number;
    displayName: number;
    value: number;
    dataType: number;
    quality: number;
    errorCount: number; 
    actions: number;
};

const CELL_BASE = "flex-shrink-0 border-r border-slate-100 flex items-center px-2 truncate";
const HEADER_CELL_BASE = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-500 uppercase relative overflow-hidden group/header";

const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div 
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20 group-hover/header:bg-slate-200 hover:!bg-blue-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

interface NodeRowProps {
    top: number; 
    node: OpcNode;
    index: number;
    colWidths: ColWidths;
    isSelected: boolean;
    isEditing: boolean; 
    isEditingDataType: boolean;
    isEditingNodeId: boolean; 
    isEditingDisplayName: boolean; 
    editValue: string;
    editPropValue: string; 
    isDragging: boolean;
    isDragOver: boolean;
    onRowClick: (e: React.MouseEvent, node: OpcNode, index: number) => void;
    onStartEditing: (node: OpcNode) => void; 
    onStartEditingDataType: (nodeId: string) => void;
    onStartEditProp: (node: OpcNode, field: 'nodeId' | 'displayName') => void; 
    onCommitEdit: () => void; 
    onCommitProp: () => void; 
    onCancelEdit: () => void;
    onCancelProp: () => void; 
    onCommitDataType: (nodeId: string, newType: OpcDataType) => void;
    onCancelDataType: () => void;
    onDeleteSingle: (id: string) => void;
    onExplodeArray: (node: OpcNode) => void;
    setEditValue: (val: string) => void;
    setEditPropValue: (val: string) => void; 
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragEnter: (index: number) => void;
    onDragEnd: () => void; 
    onDrop: (index: number) => void;
    onArrayWrite: (writes: {indexRange: string, value: any}[]) => Promise<void>;
}

const NodeRow = React.memo(({ 
    top, node, index, colWidths, isSelected, isEditing, isEditingDataType, isEditingNodeId, isEditingDisplayName, editValue, editPropValue, isDragging, isDragOver,
    onRowClick, onStartEditing, onStartEditingDataType, onStartEditProp, onCommitEdit, onCommitProp, onCancelEdit, onCancelProp,
    onCommitDataType, onCancelDataType, onDeleteSingle, onExplodeArray, setEditValue, setEditPropValue, onDragStart, onDragEnter, onDragEnd, onDrop, onArrayWrite
}: NodeRowProps) => {
    const isBoolean = node.dataType === 'Boolean';
    const id = node.internalId || node.nodeId;
    const isArray = Array.isArray(node.value);
    const errorDetailText = useMemo(() => {
        if (!node.errorStats || Object.keys(node.errorStats).length === 0) return "No error logs.";
        return Object.entries(node.errorStats)
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => `${code}: ${count}`)
            .join('\n');
    }, [node.errorStats]);
    
    // Dynamic Display of Type based on Value
    const displayType = useMemo(() => formatDataTypeDisplay(node.dataType, node.value), [node.dataType, node.value]);

    const isAnyEditing = isEditing || isEditingDataType || isEditingNodeId || isEditingDisplayName;

    return (
        <div 
            style={{ top, height: ROW_HEIGHT, left: 0, right: 0, position: 'absolute' }}
            onClick={(e) => onRowClick(e, node, index)} 
            draggable={!isAnyEditing}
            onDragStart={(e) => onDragStart(e, index)}
            onDragEnd={onDragEnd} 
            onDragOver={(e) => e.preventDefault()} 
            onDragEnter={() => onDragEnter(index)}
            onDrop={() => onDrop(index)}
            className={`flex items-stretch border-b transition-all text-xs select-none 
                ${isDragging ? 'opacity-40 bg-slate-100' : ''}
                ${isDragOver ? 'border-t-2 border-t-blue-500' : 'border-slate-100'}
                ${isSelected ? 'bg-blue-100 hover:bg-blue-200' : isBad(node.statusCode) ? 'bg-red-50' : 'bg-white hover:bg-slate-50'}`}
        >
            <div style={{ width: colWidths.index }} className="flex justify-center items-center border-r border-slate-100 flex-shrink-0 text-slate-400 font-mono group/grip cursor-grab active:cursor-grabbing">
                <GripVertical className="w-3.5 h-3.5 opacity-0 group-hover/grip:opacity-100 text-slate-400" />
                <span className="group-hover/grip:hidden">{index + 1}</span>
            </div>
            <div style={{ width: colWidths.nodeId }} className={`${CELL_BASE} cursor-text hover:bg-slate-100 transition-colors group/nid`} title={node.nodeId} onDoubleClick={(e) => { e.stopPropagation(); onStartEditProp(node, 'nodeId'); }}>
                {isEditingNodeId ? (
                    <input 
                        autoFocus 
                        className="w-full h-full bg-white border border-blue-500 rounded px-1 outline-none text-xs font-mono"
                        value={editPropValue}
                        onChange={e => setEditPropValue(e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') onCommitProp(); if(e.key==='Escape') onCancelProp(); }}
                        onBlur={onCommitProp}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex items-center w-full">
                        <span className="truncate flex-1">{node.nodeId}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/nid:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>
            <div style={{ width: colWidths.displayName }} className={`${CELL_BASE} cursor-text hover:bg-slate-100 transition-colors group/dn`} title={node.displayName} onDoubleClick={(e) => { e.stopPropagation(); onStartEditProp(node, 'displayName'); }}>
                {isEditingDisplayName ? (
                    <input 
                        autoFocus 
                        className="w-full h-full bg-white border border-blue-500 rounded px-1 outline-none text-xs"
                        value={editPropValue}
                        onChange={e => setEditPropValue(e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') onCommitProp(); if(e.key==='Escape') onCancelProp(); }}
                        onBlur={onCommitProp}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex items-center w-full">
                        <span className="truncate flex-1 text-slate-600">{node.displayName || '-'}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/dn:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>
            <div style={{ width: colWidths.value }} className={`${CELL_BASE} cursor-text hover:bg-slate-100 transition-colors`} onDoubleClick={(e) => { e.stopPropagation(); onStartEditing(node); }}>
                {isEditing ? (
                    <div className="flex items-center gap-1 w-full animate-in zoom-in-95 duration-75 h-full py-0.5" onClick={e => e.stopPropagation()}>
                        <input 
                            autoFocus 
                            className="flex-1 min-w-0 bg-white border border-blue-500 rounded px-2 h-full shadow-sm outline-none font-mono text-xs" 
                            value={editValue} 
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') onCommitEdit();
                                if (e.key === 'Escape') onCancelEdit();
                            }}
                        />
                        <button onClick={onCommitEdit} className="h-full px-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={onCancelEdit} className="h-full px-1.5 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 w-full group/val overflow-hidden h-full">
                        <div className="flex-1 truncate">
                        {isBoolean && typeof node.value === 'boolean' ? (
                            node.value ? 
                            <span className="flex items-center gap-1 text-emerald-600 font-bold"><ToggleRight className="w-4 h-4" /> True</span> : 
                            <span className="flex items-center gap-1 text-slate-400"><ToggleLeft className="w-4 h-4" /> False</span>
                        ) : (
                            <ValueDisplay value={node.value} dataType={node.dataType} nodeId={node.nodeId} onWrite={onArrayWrite} />
                        )}
                        </div>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/val:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>
            <div style={{ width: colWidths.dataType }} className={`${CELL_BASE} cursor-pointer hover:bg-slate-100 transition-colors`} onDoubleClick={(e) => { e.stopPropagation(); onStartEditingDataType(id); }}>
                {isEditingDataType ? (
                    <select
                        autoFocus
                        className="w-full text-xs border border-blue-500 rounded px-1 h-6 bg-white shadow-sm outline-none"
                        value={node.dataType}
                        onChange={(e) => onCommitDataType(id, e.target.value as OpcDataType)}
                        onBlur={onCancelDataType}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onCancelDataType(); }}
                    >
                        {DATA_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                    </select>
                ) : (
                    <div className="flex items-center justify-between w-full group/type">
                        <span className="text-slate-500 truncate" title={displayType}>{displayType}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/type:opacity-100" />
                    </div>
                )}
            </div>
            <div style={{ width: colWidths.quality }} className={CELL_BASE}>
                {isBad(node.statusCode) ? (
                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-1 truncate text-[10px] font-bold border border-red-200"><AlertCircle className="w-3 h-3 flex-shrink-0"/> {node.statusCode}</span>
                ) : (
                    <span className="text-emerald-600 truncate">{node.statusCode}</span>
                )}
            </div>
            <div 
                style={{ width: colWidths.errorCount }} 
                className={`${CELL_BASE} justify-center group/err relative`}
                title={errorDetailText}
            >
                {node.errorCount && node.errorCount > 0 ? (
                    <div className="flex items-center gap-1.5 cursor-help">
                        <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm animate-in zoom-in">{node.errorCount}</span>
                        <Info className="w-3 h-3 text-slate-300 group-hover/err:text-red-400 transition-colors" />
                    </div>
                ) : (
                    <span className="text-slate-200">0</span>
                )}
            </div>
            <div style={{ width: colWidths.actions }} className="flex justify-center items-center flex-shrink-0 gap-1 opacity-60 hover:opacity-100 transition-opacity">
                {isArray && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onExplodeArray(node); }}
                        className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50"
                        title="Expand Array Elements"
                    >
                        <Split className="w-3.5 h-3.5" />
                    </button>
                )}
                <button 
                    onClick={(e) => { e.stopPropagation(); if (node.internalId) onDeleteSingle(node.internalId); }} 
                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Remove"
                >
                    <X className="w-3.5 h-3.5"/>
                </button>
            </div>
        </div>
    );
}, (prev, next) => {
    // Basic optimization
    const widthChanged = 
        prev.colWidths.index !== next.colWidths.index ||
        prev.colWidths.nodeId !== next.colWidths.nodeId ||
        prev.colWidths.displayName !== next.colWidths.displayName ||
        prev.colWidths.value !== next.colWidths.value ||
        prev.colWidths.dataType !== next.colWidths.dataType ||
        prev.colWidths.quality !== next.colWidths.quality ||
        prev.colWidths.errorCount !== next.colWidths.errorCount ||
        prev.colWidths.actions !== next.colWidths.actions;
    return !widthChanged &&
           prev.node === next.node && 
           prev.index === next.index && 
           prev.top === next.top &&
           prev.isSelected === next.isSelected && 
           prev.isEditing === next.isEditing &&
           prev.isEditingDataType === next.isEditingDataType &&
           prev.isEditingNodeId === next.isEditingNodeId &&
           prev.isEditingDisplayName === next.isEditingDisplayName &&
           prev.editValue === next.editValue &&
           prev.editPropValue === next.editPropValue &&
           prev.isDragging === next.isDragging &&
           prev.isDragOver === next.isDragOver;
});

// --- NEW: EXTERNALIZED WATCHDOG COMPONENT TO FIX FLICKER ---
interface WatchdogProps {
    lastActive: number;
    interval: number;
    label: string;
    count: number;
    stallCount: number;
    onResetStall: () => void;
    onStallDetected: () => void;
    stalledText: string;
    activeText: string;
}

const WatchdogIndicator = React.memo(({ lastActive, interval, label, count, stallCount, onResetStall, onStallDetected, stalledText, activeText }: WatchdogProps) => {
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        // Less aggressive timer to save CPU
        const timer = setInterval(() => setCurrentTime(Date.now()), 500);
        return () => clearInterval(timer);
    }, []);

    const diff = currentTime - lastActive;
    const isStalled = lastActive > 0 && diff > Math.max(interval * 3, 2000);
    const isInitial = lastActive === 0;
    const prevStalledRef = useRef(false);

    // Format helper localized to component
    const formatTimeDiff = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
        return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
    };

    useEffect(() => {
        if (isStalled && !prevStalledRef.current) {
            onStallDetected();
        }
        prevStalledRef.current = isStalled;
    }, [isStalled, onStallDetected]);

    return (
        <div className="flex flex-col gap-0.5 min-w-[120px] border-r border-slate-200 pr-3 last:border-r-0 group/wd">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{label}</span>
                <div className={`w-1.5 h-1.5 rounded-full ${isInitial ? 'bg-slate-300' : isStalled ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.8)]'}`}></div>
            </div>
            <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-mono font-bold ${isStalled ? 'text-red-600' : 'text-slate-600'}`}>
                    {isStalled ? stalledText : isInitial ? '--' : activeText}
                </span>
                <div className="flex items-center gap-1">
                  {stallCount > 0 && (
                      <div className="bg-red-50 text-red-600 px-1 rounded text-[8px] font-black border border-red-100 flex items-center gap-0.5" title="Total stall events">
                          <AlertCircle className="w-2 h-2" /> {stallCount}
                      </div>
                  )}
                  <span className="text-[9px] text-slate-400">#{count}</span>
                </div>
            </div>
            <div className={`text-[8px] font-mono truncate flex justify-between items-center ${isStalled ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                <span>{isInitial ? 'Waiting...' : `${formatTimeDiff(diff)}`}</span>
                <button onClick={onResetStall} className="opacity-0 group-hover/wd:opacity-100 hover:text-red-500 transition-opacity"><RotateCcw className="w-2 h-2" /></button>
            </div>
        </div>
    );
});

const ReadWritePanel: React.FC<ReadWritePanelProps> = ({ isConnected, connectionStatus, sessionId, addLog, pendingNodes, onNodesConsumed, onSyncIds, initialGroups, onGroupsChange, autoReadEnabled, isVisible = true }) => {
  const { t } = useLanguage();
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addLogRef = useRef(addLog);
  useEffect(() => { addLogRef.current = addLog; }, [addLog]);

  const [colWidths, setColWidths] = useState<ColWidths>({
    index: 50,
    nodeId: 250,
    displayName: 150,
    value: 200,
    dataType: 120,
    quality: 160,
    errorCount: 100, 
    actions: 60 
  });

  const [errorFilter, setErrorFilter] = useState<'ALL' | 'ERRORS_ONLY'>('ALL');
  const totalTableWidth = (Object.values(colWidths) as number[]).reduce((a, b) => a + b, 0);
  const resizingRef = useRef<{ col: keyof ColWidths, startX: number, startWidth: number } | null>(null);

  const startResizing = useCallback((col: keyof ColWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { col, startX: e.clientX, startWidth: colWidths[col] };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { col, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); 
    setColWidths(prev => ({ ...prev, [col]: newWidth }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);
  
  const [groups, setGroups] = useState<BatchGroup[]>(() => {
      if (initialGroups && initialGroups.length > 0) {
          return initialGroups.map(grp => ({ ...grp, nodes: ensureInternalIds(grp.nodes) }));
      }
      return [{ id: 'default', name: 'Group 1', nodes: [] }];
  });

  const groupsRef = useRef<BatchGroup[]>(groups);
  const prevInitialGroupsRef = useRef<BatchGroup[] | undefined>(undefined);

  useEffect(() => {
      if (initialGroups && !isStructureEqual(initialGroups, prevInitialGroupsRef.current)) {
          const currentNodesMap = new Map<string, OpcNode>();
          groupsRef.current.forEach(g => g.nodes.forEach(n => {
              if (n.internalId) currentNodesMap.set(n.internalId, n);
          }));
          const hydrated = initialGroups.map(grp => ({ 
              ...grp, 
              nodes: ensureInternalIds(grp.nodes).map(n => {
                  const existing = n.internalId ? currentNodesMap.get(n.internalId) : undefined;
                  if (existing && existing.nodeId === n.nodeId) {
                      return {
                          ...n,
                          internalId: existing.internalId || n.internalId,
                          value: existing.value,
                          statusCode: existing.statusCode,
                          sourceTimestamp: existing.sourceTimestamp,
                          lastRtt: existing.lastRtt,
                          errorCount: existing.errorCount || 0,
                          errorStats: existing.errorStats || {},
                          displayName: n.displayName || existing.displayName
                      };
                  }
                  return n;
              }) 
          }));
          setGroups(hydrated);
          prevInitialGroupsRef.current = initialGroups;
      }
  }, [initialGroups]);

  useEffect(() => { groupsRef.current = groups; }, [groups]);

  const updateGroupsStructurally = (newGroups: BatchGroup[]) => {
      setGroups(newGroups);
      groupsRef.current = newGroups; 
      if (onGroupsChange) {
          onGroupsChange(newGroups);
      }
  };

  const [activeGroupId, setActiveGroupId] = useState<string>('default');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set(['default']));
  const [lastClickedGroupId, setLastClickedGroupId] = useState<string | null>('default');
  const [clipboardGroups, setClipboardGroups] = useState<BatchGroup[] | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [createCount, setCreateCount] = useState(1);
  const [batchSize, setBatchSize] = useState(1000); 
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  const [isBatchReading, setIsBatchReading] = useState(false);
  const [batchReadInterval, setBatchReadInterval] = useState(1000); 
  const [localBatchReadInterval, setLocalBatchReadInterval] = useState(1000);

  const [isBatchWriting, setIsBatchWriting] = useState(false);
  const [batchWriteInterval, setBatchWriteInterval] = useState(1000);
  const [localBatchWriteInterval, setLocalBatchWriteInterval] = useState(1000);

  const [isAutoIncrement, setIsAutoIncrement] = useState(false);
  const [autoIncrementInterval, setAutoIncrementInterval] = useState(100);
  const [localAutoIncInterval, setLocalAutoIncInterval] = useState(100);

  // --- WATCHDOG & PULSE STATE ---
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [lastWriteTimestamp, setLastWriteTimestamp] = useState<number>(0);
  const [readReqCount, setReadReqCount] = useState(0);
  const [writeReqCount, setWriteReqCount] = useState(0);
  // NEW: Stall tracking
  const [readStallCount, setReadStallCount] = useState(0);
  const [writeStallCount, setWriteStallCount] = useState(0);

  const [singleNodeId, setSingleNodeId] = useState('ns=1;s=Test.Tag1');
  const [singleDataType, setSingleDataType] = useState<OpcDataType>('Int32');
  const [singleWriteVal, setSingleWriteVal] = useState('0');
  const [singleResult, setSingleResult] = useState<OpcNode | null>(null);
  const [isAutoRead, setIsAutoRead] = useState(false);
  const [readCycle, setReadCycle] = useState(1000);
  const [localReadCycle, setLocalReadCycle] = useState(1000);
  const [isAutoWrite, setIsAutoWrite] = useState(false);
  const [writeCycle, setWriteCycle] = useState(1000);
  const [localWriteCycle, setLocalWriteCycle] = useState(1000);
  const [bulkText, setBulkText] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null); 
  const [editValue, setEditValue] = useState('');
  const [editingDataTypeId, setEditingDataTypeId] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<{ id: string, field: 'nodeId' | 'displayName' } | null>(null);
  const [editPropValue, setEditPropValue] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null); 
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const [batchWriteModalOpen, setBatchWriteModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, groupId: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<OpcNode[] | null>(null);

  useEffect(() => {
      if (!groups.find(g => g.id === activeGroupId) && groups.length > 0) {
          setActiveGroupId(groups[0].id);
      } else if (groups.length > 0 && activeGroupId === 'default' && groups[0].id !== 'default') {
          setActiveGroupId(groups[0].id);
      }
  }, [groups, activeGroupId]);

  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0];
  const nodeList = useMemo(() => {
      const baseNodes = activeGroup?.nodes || [];
      if (errorFilter === 'ERRORS_ONLY') {
          return baseNodes.filter(n => (n.errorCount || 0) > 0);
      }
      return baseNodes;
  }, [activeGroup, errorFilter]);

  useEffect(() => {
      if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
      }
      setScrollTop(0);
      setSelectedIds(new Set());
  }, [activeGroupId]);

  const totalHeight = nodeList.length * ROW_HEIGHT;
  const viewportHeight = scrollContainerRef.current?.clientHeight || 800;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(nodeList.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleItems = [];
  for (let i = startIndex; i < endIndex; i++) {
      visibleItems.push({ index: i, node: nodeList[i] });
  }
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
      if (headerRef.current) {
          headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
  };
  useEffect(() => {
    if (onSyncIds) {
        const allIds = new Set(groups.flatMap(g => g.nodes.map(n => n.nodeId)));
        onSyncIds(allIds);
    }
  }, [groups, onSyncIds]);

  useEffect(() => {
      if (pendingNodes && pendingNodes.length > 0) {
          const hydratedNewNodes = ensureInternalIds(pendingNodes);
          let newGroups = [...groups];
          if (newGroups.length === 0) {
              const defaultGroup = { id: Math.random().toString(36).substr(2, 9), name: 'Group 1', nodes: [] };
              newGroups = [defaultGroup];
              setActiveGroupId(defaultGroup.id);
          }
          newGroups = newGroups.map(g => {
              if (g.id === activeGroupId || (newGroups.length === 1 && g.id === newGroups[0].id)) {
                  const existingIds = new Set(g.nodes.map(n => n.nodeId));
                  const uniqueNew = hydratedNewNodes.filter(n => !existingIds.has(n.nodeId));
                  return { ...g, nodes: [...g.nodes, ...uniqueNew] };
              }
              return g;
          });
          updateGroupsStructurally(newGroups);
          addLogRef.current('success', `Imported ${pendingNodes.length} items from Browser.`);
          if (onNodesConsumed) onNodesConsumed();
      }
  }, [pendingNodes, activeGroupId, onNodesConsumed, groups]);

  const prevConnectedRef = useRef(false);
  useEffect(() => {
      if (isConnected && !prevConnectedRef.current) {
          if (autoReadEnabled) {
              setIsBatchReading(true);
              addLogRef.current('success', 'Auto-Start: Cyclic reading enabled.');
          }
      }
      prevConnectedRef.current = isConnected;
  }, [isConnected, autoReadEnabled]);

  useEffect(() => {
      if (!isConnected) {
          if (connectionStatus === ConnectionStatus.DISCONNECTED) {
              setIsBatchReading(false);
              setIsBatchWriting(false);
              setIsAutoRead(false);
              setIsAutoWrite(false);
          }
          setGroups(prev => prev.map(g => ({
              ...g,
              nodes: g.nodes.map(n => ({ ...n, statusCode: 'BadNotConnected', lastRtt: undefined }))
          })));
      }
  }, [isConnected, connectionStatus]);

  const parseInputValue = (valStr: string, dataType: string) => {
      const trimmed = valStr.trim();
      
      // JSON Array/Object parsing
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try { return JSON.parse(trimmed); } catch (e) { }
      }
      
      // Keywords
      if (trimmed === 'RANDOM') return Math.floor(Math.random() * 100);
      
      // FIX: Improved BigInt support for Int64/UInt64/LINT/ULINT/LWORD/LTIME
      if (dataType.includes('Int64') || dataType.includes('UInt64') || dataType.includes('LINT') || dataType.includes('ULINT') || dataType.includes('LWORD') || dataType.includes('LTIME')) {
          try {
              // Remove 'n' suffix if present (e.g. 100n)
              const cleanStr = trimmed.replace(/n$/, '');
              return BigInt(cleanStr).toString();
          } catch (e) {
              return "0";
          }
      }
      
      if (dataType.includes('Int')) {
          return parseInt(trimmed) || 0;
      }
      if (dataType === 'Boolean') return trimmed.toLowerCase() === 'true' || trimmed === '1';
      if (dataType === 'Float' || dataType === 'Double') return parseFloat(trimmed) || 0.0;
      
      // Fallback: Return raw string if it's DateTime, String, etc.
      // Important for DateTime: Keep string format so backend coerces it.
      return trimmed;
  };

  const handleArrayWrite = useCallback(async (nodeId: string, dataType: string, writes: {indexRange: string, value: any}[]) => {
      if (!isConnected || !sessionId) {
          addLogRef.current('error', 'Cannot write array: Session not connected.');
          return;
      }
      const nodesPayload = writes.map(w => ({
          nodeId: nodeId,
          dataType: (dataType.includes('[') ? dataType.split('[')[0] : dataType) as OpcDataType,
          indexRange: w.indexRange,
          value: w.value
      }));
      try {
          await opcuaService.writeNodes(sessionId, nodesPayload);
          addLogRef.current('success', `Wrote ${writes.length} array elements to ${nodeId}.`);
      } catch (e: any) {
          addLogRef.current('error', `Array Write Failed: ${e.message}`);
          setGroups(prev => prev.map(g => {
              if (g.id === activeGroupId) {
                  return { 
                    ...g, 
                    nodes: g.nodes.map(n => {
                        if (n.nodeId === nodeId) {
                            const stats = { ...(n.errorStats || {}) };
                            const code = "BadWriteError";
                            stats[code] = (stats[code] || 0) + 1;
                            return { ...n, errorCount: (n.errorCount || 0) + 1, errorStats: stats };
                        }
                        return n;
                    }) 
                  };
              }
              return g;
          }));
      }
  }, [isConnected, sessionId, activeGroupId]);

  const toggleBatchRead = () => {
      if (!isConnected) return;
      if (!isBatchReading) {
          setIsBatchWriting(false); 
          setIsBatchReading(true); 
          setLastReadTimestamp(Date.now());
      } else {
          setIsBatchReading(false);
      }
  };

  const toggleBatchWrite = () => {
    if (!isConnected) return;
    if (!isBatchWriting) {
        setIsBatchReading(false); 
        setIsBatchWriting(true); 
        setLastWriteTimestamp(Date.now());
    } else {
        setIsBatchWriting(false);
    }
  };

  const toggleAutoRead = () => {
    if (!isAutoRead) {
        setIsAutoWrite(false); 
        setIsAutoRead(true);
    } else {
        setIsAutoRead(false);
    }
  };

  const toggleAutoWrite = () => {
      if (!isAutoWrite) {
          setIsAutoRead(false); 
          setIsAutoWrite(true);
      } else {
          setIsAutoWrite(false);
      }
  };

  const handleExplodeArray = (node: OpcNode) => {
    if (!Array.isArray(node.value) || node.value.length === 0) {
        addLogRef.current('warn', 'Please read the node first to expand its current array value.');
        return;
    }
    const getDims = (v: any): number[] => {
        if (!Array.isArray(v)) return [];
        const d = [v.length];
        let curr = v;
        while(curr.length > 0 && Array.isArray(curr[0])) {
            curr = curr[0];
            d.push(curr.length);
        }
        return d;
    };
    const dims = getDims(node.value);
    const totalElements = dims.reduce((a, b) => a * b, 1);
    
    const doExpand = () => {
        const newNodes: OpcNode[] = [];
        const traverse = (arr: any, currentIndices: number[]) => {
            if (currentIndices.length === dims.length || !Array.isArray(arr)) {
                const indexStr = currentIndices.join(',');
                newNodes.push({
                    internalId: Math.random().toString(36).substr(2, 9),
                    nodeId: `${node.nodeId}[${indexStr}]`,
                    displayName: `${node.displayName || node.nodeId}[${indexStr}]`,
                    dataType: node.dataType, 
                    value: arr, 
                    statusCode: 'Good',
                    sourceTimestamp: node.sourceTimestamp,
                    errorCount: 0,
                    errorStats: {}
                });
                return;
            }
            for (let i = 0; i < arr.length; i++) {
                traverse(arr[i], [...currentIndices, i]);
            }
        };
        traverse(node.value, []);
        setGroups(prev => {
            const idx = prev.findIndex(g => g.id === activeGroupId);
            if (idx === -1) return prev;
            const currentNodes = [...prev[idx].nodes];
            const nodeIdx = currentNodes.findIndex(n => (n.internalId || n.nodeId) === (node.internalId || node.nodeId));
            if (nodeIdx !== -1) {
                currentNodes.splice(nodeIdx, 1, ...newNodes);
            }
            const newGroups = [...prev];
            newGroups[idx] = { ...prev[idx], nodes: currentNodes };
            return newGroups;
        });
        addLogRef.current('success', `Expanded array into ${newNodes.length} items (${dims.length}D).`);
    };

    if (totalElements > 2000) {
        toast(`This array contains ${totalElements} elements. Expanding it might slow down the UI. Continue?`, {
            action: {
                label: 'Continue',
                onClick: doExpand
            },
            cancel: {
                label: 'Cancel',
                onClick: () => {}
            }
        });
        return;
    }
    
    doExpand();
  };

  const handleResetErrors = () => {
      const targetIds = selectedIds.size > 0 ? selectedIds : null;
      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              return {
                  ...g,
                  nodes: g.nodes.map(n => {
                      const id = n.internalId || n.nodeId;
                      if (!targetIds || targetIds.has(id)) {
                          return { ...n, errorCount: 0, errorStats: {} };
                      }
                      return n;
                  })
              };
          }
          return g;
      }));
      setReadReqCount(0);
      setWriteReqCount(0);
      setReadStallCount(0);
      setWriteStallCount(0);
      if (targetIds) addLogRef.current('info', `Reset error statistics for ${targetIds.size} nodes.`);
      else addLogRef.current('info', 'Reset all error statistics in group.');
  };

  const isBatchReadingBusy = useRef(false);
  const readExecutionId = useRef(0);

  useEffect(() => {
    let timerId: any;
    const currentId = ++readExecutionId.current;
    const executeBatchRead = async () => {
      if (!sessionId || isBatchReadingBusy.current || !isConnected || currentId !== readExecutionId.current || !isVisible) return;
      isBatchReadingBusy.current = true;
      const cycleStart = Date.now(); // Capture Start Time for Drift Comp
      
      const currentGroups = groupsRef.current;
      const currentGroup = currentGroups.find(g => g.id === activeGroupId);
      if (!currentGroup || currentGroup.nodes.length === 0) {
          isBatchReadingBusy.current = false;
          return;
      }
      const snapshotNodes = currentGroup.nodes;
      const totalNodes = snapshotNodes.length;
      try {
        let processedCount = 0;
        while (processedCount < totalNodes && currentId === readExecutionId.current && isVisible) {
           const batchNodes = snapshotNodes.slice(processedCount, processedCount + batchSize);
           const batchIds = batchNodes.map(n => n.nodeId);
           const typeMap = new Map<string, OpcDataType>();
           batchNodes.forEach(n => typeMap.set(n.nodeId, n.dataType));
           const start = performance.now();
           const results = await withTimeout(opcuaService.readNodes(sessionId, batchIds, typeMap), 10000, 'BatchRead');
           const duration = Math.round(performance.now() - start);
           if (currentId !== readExecutionId.current || !isVisible) break;
           
           // ACTUAL ACTIVITY DETECTED
           setLastReadTimestamp(Date.now());
           setReadReqCount(c => c + 1);

           const updates = new Map<string, OpcNode>();
           batchNodes.forEach((node, i) => {
               if (results[i] && node.internalId) {
                   const statusCode = results[i].statusCode;
                   const isError = isBad(statusCode);
                   const errorCode = statusCode.split(' ')[0]; 
                   const stats = { ...(node.errorStats || {}) };
                   if (isError) {
                       stats[errorCode] = (stats[errorCode] || 0) + 1;
                   }
                   updates.set(node.internalId, {
                       ...node,
                       value: results[i].value,
                       statusCode: statusCode,
                       sourceTimestamp: String(results[i].sourceTimestamp),
                       lastRtt: duration,
                       errorCount: isError ? (node.errorCount || 0) + 1 : (node.errorCount || 0),
                       errorStats: stats
                   });
               }
           });
           setGroups(prev => {
               const targetGroup = prev.find(g => g.id === activeGroupId);
               if (!targetGroup) return prev;
               const newNodes = targetGroup.nodes.map(node => {
                   if (node.internalId && updates.has(node.internalId)) return updates.get(node.internalId)!;
                   return node;
               });
               return prev.map(g => g.id === activeGroupId ? { ...g, nodes: newNodes } : g);
           });
           processedCount += batchSize;
        }
      } catch (err: any) {
        if (currentId === readExecutionId.current && isVisible) {
            addLogRef.current('error', `Batch Read Failure: ${err.message}`);
            if (err.message.includes('Timed out')) setIsBatchReading(false);
        }
      } finally {
          isBatchReadingBusy.current = false;
          if (isBatchReading && isConnected && currentId === readExecutionId.current && isVisible) {
              // Drift Compensation Logic
              const elapsed = Date.now() - cycleStart;
              const nextDelay = Math.max(10, batchReadInterval - elapsed);
              timerId = setTimeout(executeBatchRead, nextDelay);
          }
      }
    };
    if (isBatchReading && isConnected && sessionId && isVisible) {
        executeBatchRead();
    }
    return () => {
        readExecutionId.current++; 
        clearTimeout(timerId);
    };
  }, [isBatchReading, isConnected, sessionId, batchReadInterval, batchSize, activeGroupId, isVisible]); 

  const isBatchWritingBusy = useRef(false);
  const writeExecutionId = useRef(0);

  useEffect(() => {
    let timerId: any;
    const currentId = ++writeExecutionId.current;
    const executeBatchWrite = async () => {
        if (!sessionId || !isConnected || isBatchWritingBusy.current || currentId !== writeExecutionId.current || !isVisible) return;
        isBatchWritingBusy.current = true;
        const cycleStart = Date.now(); // Capture Start Time for Drift Comp

        const currentGroups = groupsRef.current;
        const currentGroup = currentGroups.find(g => g.id === activeGroupId);
        if (!currentGroup || currentGroup.nodes.length === 0) {
            isBatchWritingBusy.current = false;
            return;
        }
        const nodesToWrite = currentGroup.nodes;
        const writeRequests: {nodeId: string, value: any, dataType: OpcDataType, internalId?: string}[] = [];
        const updates = new Map<string, any>();
        for (const node of nodesToWrite) {
             let valToWrite = node.value;
             let shouldWrite = false;
             if (isAutoIncrement) {
                 try {
                    // Fix: calculateNextValue now correctly handles types with dimensions
                    valToWrite = calculateNextValue(node.value, node.dataType);
                    updates.set(node.internalId || node.nodeId, valToWrite);
                    shouldWrite = true;
                 } catch (e) {
                    console.warn(`[Auto+1] Calculation failed for ${node.nodeId}:`, e);
                    shouldWrite = false;
                 }
             } else {
                 if (valToWrite !== null && valToWrite !== undefined) {
                     shouldWrite = true;
                 }
             }
             if (shouldWrite) {
                 writeRequests.push({
                     nodeId: node.nodeId,
                     value: valToWrite,
                     dataType: node.dataType,
                     internalId: node.internalId
                 });
             }
        }
        const total = writeRequests.length;
        let processed = 0;
        try {
            while (processed < total && currentId === writeExecutionId.current && isVisible) {
                const batch = writeRequests.slice(processed, processed + batchSize);
                if (batch.length > 0) {
                    const { results } = await withTimeout(
                        opcuaService.writeNodes(sessionId, batch.map(b => ({
                            nodeId: b.nodeId, 
                            value: b.value, 
                            dataType: (b.dataType.includes('[') ? b.dataType.split('[')[0] : b.dataType) as OpcDataType
                        }))), 
                        10000, 
                        'BatchWrite'
                    );

                    if (currentId !== writeExecutionId.current || !isVisible) break;

                    // ACTUAL ACTIVITY DETECTED
                    setLastWriteTimestamp(Date.now());
                    setWriteReqCount(c => c + 1);

                    setGroups(prev => prev.map(g => {
                        if (g.id === activeGroupId) {
                            return {
                                ...g,
                                nodes: g.nodes.map(n => {
                                    const id = n.internalId || n.nodeId;
                                    const batchIdx = batch.findIndex(b => (b.internalId || b.nodeId) === id);
                                    if (batchIdx !== -1) {
                                        const statusCode = results[batchIdx];
                                        const isError = isBad(statusCode);
                                        const errorCode = statusCode.split(' ')[0];
                                        const stats = { ...(n.errorStats || {}) };
                                        if (isError) {
                                            stats[errorCode] = (stats[errorCode] || 0) + 1;
                                        }
                                        const newValue = updates.has(id) ? updates.get(id) : n.value;
                                        let displayStatus = statusCode;
                                        if (statusCode === 'Good') {
                                            displayStatus = isAutoIncrement ? 'Good (Inc)' : 'Good (Write)';
                                        }
                                        return { 
                                            ...n, 
                                            value: newValue, 
                                            statusCode: displayStatus,
                                            errorCount: isError ? (n.errorCount || 0) + 1 : (n.errorCount || 0),
                                            errorStats: stats
                                        };
                                    }
                                    return n;
                                })
                            };
                        }
                        return g;
                    }));
                }
                processed += batchSize;
            }
        } catch (e: any) {
             if (currentId === writeExecutionId.current && isVisible) {
                addLogRef.current('error', `Batch Write Error: ${e.message}`);
                if (e.message.includes('Timed out')) setIsBatchWriting(false);
             }
        } finally {
            isBatchWritingBusy.current = false;
            if (isBatchWriting && isConnected && currentId === writeExecutionId.current && isVisible) {
                const targetInterval = isAutoIncrement ? autoIncrementInterval : batchWriteInterval;
                // Drift Compensation Logic
                const elapsed = Date.now() - cycleStart;
                const nextDelay = Math.max(10, targetInterval - elapsed);
                timerId = setTimeout(executeBatchWrite, nextDelay);
            }
        }
    };
    if (isBatchWriting && isConnected && sessionId && isVisible) {
        executeBatchWrite();
    }
    return () => {
        writeExecutionId.current++; 
        clearTimeout(timerId);
    };
  }, [isBatchWriting, isConnected, sessionId, batchWriteInterval, activeGroupId, isAutoIncrement, autoIncrementInterval, batchSize, isVisible]);

  // ... (Rest of the file remains unchanged)
  // ... (render logic)
  
  const handleSingleReadOnce = async () => { 
      if(!isConnected || !sessionId) return; 
      const start=performance.now(); 
      try{
          const res=await opcuaService.readNodes(sessionId, [singleNodeId],new Map([[singleNodeId,singleDataType]]));
          const dur=Math.round(performance.now()-start);
          if(res[0]){
              setSingleResult({...res[0], dataType: singleDataType, nodeId: singleNodeId, lastRtt:dur, displayName: singleNodeId});
              if(res[0].statusCode.startsWith('Bad')) addLogRef.current('error',`Read Failed: ${res[0].statusCode}`);
          }
      }catch(e:any){
          setSingleResult({
             internalId: 'single-inspector-err',
             nodeId: singleNodeId,
             displayName: singleNodeId,
             dataType: singleDataType,
             value: "Read Failed",
             statusCode: e.message || 'BadCommunicationError',
             sourceTimestamp: new Date().toISOString(),
             lastRtt: 0
          });
          addLogRef.current('error',`Read Exception: ${e.message}`);
      } 
  };
  
  const handleSingleWriteOnce = async () => { 
      if(!isConnected || !sessionId) return; 
      const start=performance.now(); 
      try{
          const val = parseInputValue(singleWriteVal, singleDataType);
          await opcuaService.writeNode(sessionId, singleNodeId,val,singleDataType);
          const dur=Math.round(performance.now()-start);
          addLogRef.current('success',`Write OK (${dur}ms)`);
          handleSingleReadOnce();
      }catch(e:any){
          addLogRef.current('error',`Write Failed: ${e.message}`);
          setSingleResult({
             internalId: 'single-inspector-err',
             nodeId: singleNodeId,
             displayName: singleNodeId,
             dataType: singleDataType,
             value: "Write Failed",
             statusCode: e.message || 'BadWriteError',
             sourceTimestamp: new Date().toISOString(),
             lastRtt: 0
          });
      } 
  };

  useEffect(() => {
      let interval: any;
      if (isAutoRead && isConnected && isVisible) interval = setInterval(handleSingleReadOnce, Math.max(200, readCycle));
      return () => clearInterval(interval);
  }, [isAutoRead, isConnected, readCycle, singleNodeId, singleDataType, sessionId, isVisible]);

  useEffect(() => {
      let interval: any;
      if (isAutoWrite && isConnected && isVisible) interval = setInterval(handleSingleWriteOnce, Math.max(200, writeCycle));
      return () => clearInterval(interval);
  }, [isAutoWrite, isConnected, writeCycle, singleNodeId, singleDataType, singleWriteVal, sessionId, isVisible]);

  const handleTabClick = (e: React.MouseEvent, groupId: string, index: number) => {
      setActiveGroupId(groupId);
      const newSelected = new Set(selectedGroupIds);
      if (e.ctrlKey || e.metaKey) { if (newSelected.has(groupId)) newSelected.delete(groupId); else newSelected.add(groupId); setLastClickedGroupId(groupId); }
      else if (e.shiftKey && lastClickedGroupId) { const ids = groups.map(g => g.id); const s=Math.min(ids.indexOf(lastClickedGroupId),index); const end=Math.max(ids.indexOf(lastClickedGroupId),index); newSelected.clear(); for(let i=s;i<=end;i++) newSelected.add(ids[i]); }
      else { newSelected.clear(); newSelected.add(groupId); setLastClickedGroupId(groupId); }
      setSelectedGroupIds(newSelected);
  };

  const handleTabContextMenu = (e: React.MouseEvent, groupId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, groupId });
  };

  const moveGroup = (direction: 'left' | 'right') => {
      if (!contextMenu) return;
      const index = groups.findIndex(g => g.id === contextMenu.groupId);
      if (index === -1) return;
      const newGroups = [...groups];
      if (direction === 'left' && index > 0) {
          [newGroups[index], newGroups[index - 1]] = [newGroups[index - 1], newGroups[index]];
      } else if (direction === 'right' && index < newGroups.length - 1) {
          [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]];
      }
      updateGroupsStructurally(newGroups);
      setContextMenu(null);
  };

  const clearGroup = () => {
      if (!contextMenu) return;
      const newGroups = groups.map(g => g.id === contextMenu.groupId ? { ...g, nodes: [] } : g);
      updateGroupsStructurally(newGroups);
      setContextMenu(null);
  };

  const handleBatchAddGroups = () => { 
      const qty=Math.max(1,createCount); 
      const newG=Array.from({length:qty},(_,i)=>({id:Math.random().toString(36).substr(2,9),name:`Group ${groups.length+1+i}`,nodes:[]})); 
      updateGroupsStructurally([...groups, ...newG]);
      setActiveGroupId(newG[0].id); 
      setSelectedGroupIds(new Set(newG.map(g=>g.id))); 
  };
  
  const handleDeleteSelectedGroups = () => { 
      if(selectedGroupIds.size===0) return; 
      const rem = groups.filter(g => !selectedGroupIds.has(g.id)); 
      updateGroupsStructurally(rem);
      if(rem.length > 0) {
        if (!rem.find(g => g.id === activeGroupId)) setActiveGroupId(rem[0].id);
        setSelectedGroupIds(new Set([rem[0].id]));
      } else {
        setActiveGroupId('');
        setSelectedGroupIds(new Set());
      }
  };
  
  const deleteSingleGroup = (e: React.MouseEvent | undefined, id: string) => { 
      if (e) e.stopPropagation(); 
      const rem = groups.filter(g => g.id !== id); 
      updateGroupsStructurally(rem);
      if(rem.length > 0) {
        if(activeGroupId === id || !rem.find(g => g.id === activeGroupId)) setActiveGroupId(rem[0].id);
      } else {
          setActiveGroupId('');
      }
      setContextMenu(null);
  };
  
  const handleCopyGroups = () => { if(selectedGroupIds.size>0) setClipboardGroups(groups.filter(g=>selectedGroupIds.has(g.id))); };
  
  const handlePasteGroups = () => { 
      if(clipboardGroups){
          const newG=clipboardGroups.map(t=>({...t,id:Math.random().toString(36).substr(2,9),name:t.name+' (Copy)'}));
          updateGroupsStructurally([...groups, ...newG]);
          setActiveGroupId(newG[0].id);
          setSelectedGroupIds(new Set(newG.map(g=>g.id)));
      }
  };

  const handleRowClick = useCallback((e: React.MouseEvent, node: OpcNode, index: number) => { 
      e.stopPropagation(); 
      const id = node.internalId || node.nodeId; 
      const newS=new Set(selectedIds); 
      if (e.ctrlKey){
          if(newS.has(id)) newS.delete(id);
          else newS.add(id);
          setLastSelectedId(id);
      }
      else if(e.shiftKey && lastSelectedId){
           const allIds = nodeList.map(n => n.internalId || n.nodeId);
           const start = allIds.indexOf(lastSelectedId);
           const end = index;
           if (start !== -1) {
               const low = Math.min(start, end);
               const high = Math.max(start, end);
               newS.clear(); 
               for(let i=low; i<=high; i++) newS.add(allIds[i]);
           }
      }
      else{
          newS.clear();
          newS.add(id);
          setLastSelectedId(id);
      }
      setSelectedIds(newS);
  }, [selectedIds, lastSelectedId, nodeList]); 
  
  const deleteSingle = useCallback((internalId: string) => { 
      const newGroups = groups.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.filter(n => n.internalId !== internalId) } : g);
      updateGroupsStructurally(newGroups);
      if (selectedIds.has(internalId)) { const s=new Set(selectedIds); s.delete(internalId); setSelectedIds(s); }
  }, [groups, activeGroupId, selectedIds]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedItemIndex(index);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (index: number) => {
      if (draggedItemIndex !== null && draggedItemIndex !== index) {
          setDragOverItemIndex(index);
      }
  };

  const handleDrop = (dropIndex: number) => {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
      if (draggedItemIndex === null || draggedItemIndex === dropIndex) {
          return;
      }
      setGroups(prev => {
          const groupIdx = prev.findIndex(g => g.id === activeGroupId);
          if (groupIdx === -1) return prev;
          const newGroup = { ...prev[groupIdx] };
          const nodes = [...newGroup.nodes];
          const [movedNode] = nodes.splice(draggedItemIndex, 1);
          nodes.splice(dropIndex, 0, movedNode);
          newGroup.nodes = nodes;
          const newGroups = [...prev];
          newGroups[groupIdx] = newGroup;
          return newGroups;
      });
  };

  const handleDragEnd = useCallback(() => {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
  }, []);

  const deleteSelectedNodes = () => {
      if (selectedIds.size === 0) return;
      const newGroups = groups.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.filter(n => !selectedIds.has(n.internalId || n.nodeId)) } : g);
      updateGroupsStructurally(newGroups);
      setSelectedIds(new Set());
  };
  
  const startRenamingGroup = (e: React.MouseEvent | undefined, g: BatchGroup) => { 
      if (e) e.stopPropagation(); 
      setEditingGroupId(g.id);
      setEditGroupName(g.name); 
      setContextMenu(null);
  };
  
  const saveGroupName = () => { 
      if(editingGroupId&&editGroupName.trim()){
          const newGroups = groups.map(g=>g.id===editingGroupId?{...g,name:editGroupName.trim()}:g);
          updateGroupsStructurally(newGroups);
      }
      setEditingGroupId(null); 
  };
  
  const startEditing = useCallback((node: OpcNode) => {
      if (node.internalId) {
          setEditingNodeId(node.internalId);
          setEditValue(String(node.value !== null ? node.value : ''));
      }
  }, []);

  const handleCommitInlineWrite = useCallback(async () => {
      if (!editingNodeId) return;
      const node = nodeList.find(n => n.internalId === editingNodeId);
      if (!node) { setEditingNodeId(null); return; }
      
      // Fix: calculateNextValue is now fixed inside this file
      const val = parseInputValue(editValue, node.dataType);
      
      if (isConnected && sessionId) {
          try {
              const cleanType = node.dataType.includes('[') ? node.dataType.split('[')[0] : node.dataType;
              await opcuaService.writeNode(sessionId, node.nodeId, val, cleanType as OpcDataType);
              addLogRef.current('success', `Wrote value to ${node.nodeId}`);
              setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.map(n => n.internalId === editingNodeId ? { ...n, value: val, statusCode: 'Good (Write)' } : n) } : g));
          } catch (e: any) { 
              addLogRef.current('error', `Write failed: ${e.message}`); 
              setGroups(prev => prev.map(g => {
                  if (g.id === activeGroupId) {
                      return { 
                        ...g, 
                        nodes: g.nodes.map(n => {
                            if (n.internalId === editingNodeId) {
                                const stats = { ...(n.errorStats || {}) };
                                const code = "BadWriteError";
                                stats[code] = (stats[code] || 0) + 1;
                                return { ...n, errorCount: (n.errorCount || 0) + 1, errorStats: stats };
                            }
                            return n;
                        }) 
                      };
                  }
                  return g;
              }));
          }
      } else {
          setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.map(n => n.internalId === editingNodeId ? { ...n, value: val, statusCode: 'Good (Offline)' } : n) } : g));
      }
      setEditingNodeId(null);
  }, [editingNodeId, isConnected, sessionId, nodeList, editValue, activeGroupId]);

  const handleDataTypeChange = useCallback((nodeId: string, newType: OpcDataType) => {
      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              return {
                  ...g,
                  nodes: g.nodes.map(n => {
                      const id = n.internalId || n.nodeId;
                      if (id === nodeId) {
                          return { ...n, dataType: newType };
                      }
                      return n;
                  })
              };
          }
          return g;
      }));
      setEditingDataTypeId(null);
  }, [activeGroupId]);

  const handleStartEditProp = useCallback((node: OpcNode, field: 'nodeId' | 'displayName') => {
      if (node.internalId) {
          setEditingProp({ id: node.internalId, field });
          setEditPropValue(field === 'nodeId' ? node.nodeId : (node.displayName || ''));
      }
  }, []);

  const handleCommitProp = useCallback(() => {
      if (!editingProp) return;
      const { id, field } = editingProp;
      const val = editPropValue.trim();
      if (val) {
          setGroups(prev => prev.map(g => {
              if (g.id === activeGroupId) {
                  return {
                      ...g,
                      nodes: g.nodes.map(n => {
                          if (n.internalId === id) {
                              return { ...n, [field]: val };
                          }
                          return n;
                      })
                  };
              }
              return g;
          }));
      }
      setEditingProp(null);
  }, [editingProp, editPropValue, activeGroupId]);

  const handleCancelProp = useCallback(() => setEditingProp(null), []);

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          if (nodeList.length > 0) {
              const allIds = new Set(nodeList.map(n => n.internalId || n.nodeId));
              setSelectedIds(allIds);
              addLogRef.current('info', `Selected all ${allIds.size} nodes.`);
          }
      }
      if (e.key === 'Delete') {
          if (selectedIds.size > 0) {
              deleteSelectedNodes();
          }
      }
  }, [nodeList, selectedIds]);

  const handleDownloadTemplate = () => {
      const csvContent = "NodeId,DisplayName,DataType,Value,StatusCode\nns=2;s=Demo.Tag1,Demo Tag 1,Int32,123,Good\nns=2;s=Demo.Tag2,Demo Tag 2,Float,45.67,Good";
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'opcua_rw_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportConfig = () => {
      if (!activeGroup) return;
      const csvRows = ["NodeId,DisplayName,DataType,Value,StatusCode,ErrorCount"];
      
      const safeStringify = (val: any) => {
          try {
              return JSON.stringify(val, (key, value) => typeof value === 'bigint' ? value.toString() : value);
          } catch (e) {
              return String(val);
          }
      };

      activeGroup.nodes.forEach(n => {
          const safeVal = (n.value !== null && n.value !== undefined) 
              ? (typeof n.value === 'object' ? safeStringify(n.value).replace(/"/g, '""') : String(n.value))
              : 'null';
          const valField = safeVal.includes(',') ? `"${safeVal}"` : safeVal;
          const display = n.displayName || '';
          const status = n.statusCode || 'Good';
          csvRows.push(`${n.nodeId},${display},${n.dataType},${valField},${status},${n.errorCount || 0}`);
      });
      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rw_group_${activeGroup.name.replace(/\s+/g,'_')}_export.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          const header = lines[0].toLowerCase().split(',');
          const findIdx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
          const idxNodeId = findIdx(['nodeid', 'id']);
          const idxDisplay = findIdx(['displayname', 'name']);
          const idxType = findIdx(['datatype', 'type']);
          const idxValue = findIdx(['value']);
          const idxStatus = findIdx(['statuscode', 'quality']);
          const idxErrors = findIdx(['errorcount', 'errors']);
          const hasHeader = idxNodeId !== -1;
          const startIndex = hasHeader ? 1 : 0;
          const defaultNodeIdCol = hasHeader ? idxNodeId : 0;
          const newNodes: OpcNode[] = [];
          for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i];
              const parts = [];
              let current = '';
              let inQuotes = false;
              for(let j=0; j<line.length; j++) {
                  const char = line[j];
                  if(char === '"') inQuotes = !inQuotes;
                  else if(char === ',' && !inQuotes) {
                      parts.push(current);
                      current = '';
                  } else {
                      current += char;
                  }
              }
              parts.push(current);
              if (parts.length > defaultNodeIdCol) {
                  const nodeId = parts[defaultNodeIdCol]?.trim();
                  if (!nodeId) continue;
                  const displayName = idxDisplay !== -1 ? parts[idxDisplay]?.trim() : nodeId;
                  const dataType = (idxType !== -1 ? parts[idxType]?.trim() : 'Int32') as OpcDataType;
                  const statusCode = idxStatus !== -1 ? parts[idxStatus]?.trim() : 'Good';
                  const errorCount = idxErrors !== -1 ? parseInt(parts[idxErrors]?.trim() || '0') : 0;
                  let importedValue = null;
                  if (idxValue !== -1 && parts[idxValue]) {
                      const rawVal = parts[idxValue].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
                      if (rawVal === 'null') {
                          importedValue = null;
                      } else if (rawVal) {
                          try { importedValue = JSON.parse(rawVal); } 
                          catch { importedValue = parseInputValue(rawVal, dataType); }
                      }
                  }
                  newNodes.push({
                      internalId: Math.random().toString(36).substr(2, 9),
                      nodeId,
                      displayName: displayName || nodeId,
                      dataType: dataType || 'Int32',
                      value: importedValue, 
                      statusCode: statusCode || 'Good',
                      sourceTimestamp: '-',
                      lastRtt: undefined,
                      errorCount: errorCount || 0,
                      errorStats: {}
                  });
              }
          }
          if (newNodes.length > 0) setPendingImport(newNodes);
          else addLogRef.current('warn', 'No valid nodes found in CSV.');
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleOverwrite = () => {
      if (!pendingImport) return;
      setGroups(prev => {
           if (prev.length === 0) {
               return [{ id: Math.random().toString(36).substr(2,9), name: 'Imported Group', nodes: pendingImport }];
           }
           return prev.map(g => g.id === activeGroupId ? { ...g, nodes: pendingImport } : g);
      });
      addLogRef.current('success', `Imported ${pendingImport.length} nodes (Overwrite).`);
      setPendingImport(null);
  };

  const handleAppend = () => {
      if (!pendingImport) return;
      setGroups(prev => {
           if (prev.length === 0) {
               return [{ id: Math.random().toString(36).substr(2,9), name: 'Imported Group', nodes: [...pendingImport] }];
           }
           return prev.map(g => g.id === activeGroupId ? { ...g, nodes: [...g.nodes, ...pendingImport] } : g);
      });
      addLogRef.current('success', `Imported ${pendingImport.length} nodes (Append).`);
      setPendingImport(null);
  };

  const handleBatchWrite = async (valueStr: string) => {
      setBatchWriteModalOpen(false);
      if (selectedIds.size === 0) return;
      const targets = nodeList.filter(n => selectedIds.has(n.internalId || n.nodeId));
      let successCount = 0;
      for (const node of targets) {
          try {
              const val = parseInputValue(valueStr, node.dataType);
              if (isConnected && sessionId) {
                  await opcuaService.writeNode(sessionId, node.nodeId, val, node.dataType);
              }
              successCount++;
          } catch(e) {
              setGroups(prev => prev.map(g => {
                  if (g.id === activeGroupId) {
                      return { 
                        ...g, 
                        nodes: g.nodes.map(n => {
                            if ((n.internalId || n.nodeId) === (node.internalId || node.nodeId)) {
                                const stats = { ...(n.errorStats || {}) };
                                const code = "BadWriteError";
                                stats[code] = (stats[code] || 0) + 1;
                                return { ...n, errorCount: (n.errorCount || 0) + 1, errorStats: stats };
                            }
                            return n;
                        }) 
                      };
                  }
                  return g;
              }));
          }
      }
      addLogRef.current('success', `Batch write completed. Success: ${successCount}/${targets.length}`);
      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              return {
                  ...g,
                  nodes: g.nodes.map(n => selectedIds.has(n.internalId || n.nodeId) ? { ...n, value: parseInputValue(valueStr, n.dataType), statusCode: isConnected ? 'Good (Write)' : 'Good (Offline)' } : n)
              };
          }
          return g;
      }));
  };

  const handleBulkAdd = () => { 
      if (!bulkText.trim()) return;
      if (groups.length === 0) {
          const newGroup = { id: Math.random().toString(36).substr(2,9), name: 'Group 1', nodes: [] };
          setGroups([newGroup]);
          setActiveGroupId(newGroup.id);
      }
      const ids = bulkText.split(',').map(s => s.trim()).filter(Boolean);
      const newNodes = ids.map(id => ({
          internalId: Math.random().toString(36).substr(2, 9),
          nodeId: id,
          displayName: id,
          dataType: 'Int32' as OpcDataType,
          value: 0,
          statusCode: 'Good',
          sourceTimestamp: '-',
          lastRtt: undefined,
          errorCount: 0,
          errorStats: {}
      }));
      setGroups(prev => {
          if (prev.length === 0) return [{ id: Math.random().toString(36).substr(2,9), name: 'Group 1', nodes: newNodes }];
          return prev.map(g => g.id === activeGroupId ? { ...g, nodes: [...g.nodes, ...newNodes] } : g);
      });
      setBulkText('');
      addLogRef.current('success', `Added ${ids.length} nodes to list.`);
  };

  const cycleErrorFilter = () => { setErrorFilter(prev => prev === 'ALL' ? 'ERRORS_ONLY' : 'ALL'); };

  // --- NEW: WATCHDOG STALL MONITORING LOGIC ---
  const prevStalledReadRef = useRef(false);
  const prevStalledWriteRef = useRef(false);

  // --- WATCHDOG COMPONENT ---
  const formatTimeDiff = (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
      return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleCsvImport} accept=".csv,.txt" />
      <BatchWriteModal isOpen={batchWriteModalOpen} onClose={() => setBatchWriteModalOpen(false)} onConfirm={handleBatchWrite} />
      <ImportConfirmModal isOpen={!!pendingImport} nodeCount={pendingImport ? pendingImport.length : 0} onClose={() => setPendingImport(null)} onOverwrite={handleOverwrite} onAppend={handleAppend} />
      
      {contextMenu && (
          <GroupContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onRename={() => startRenamingGroup(undefined, groups.find(g => g.id === contextMenu.groupId)!)} onDelete={() => deleteSingleGroup(undefined, contextMenu.groupId)} onClear={clearGroup} onMoveLeft={() => moveGroup('left')} onMoveRight={() => moveGroup('right')} />
      )}
      
      <div className="bg-white rounded-lg shadow-sm border border-blue-100 flex-shrink-0 transition-all duration-300">
          <div className="flex items-center justify-between px-4 py-2 border-b border-blue-50 cursor-pointer hover:bg-slate-50" onClick={() => setIsInspectorOpen(!isInspectorOpen)}>
              <h3 className="text-base font-bold text-blue-900 flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-500"/> {t.rw.inspector}</h3>
              {isInspectorOpen ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
          </div>
          {isInspectorOpen && <div className="p-3 border-t border-slate-50">
              <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[300px]"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t.rw.nodeId}</label><input className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono h-8" value={singleNodeId} onChange={e=>setSingleNodeId(e.target.value)} /></div>
                  <div className="w-20"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t.rw.readCycle}</label><input type="number" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono h-8" value={localReadCycle} onChange={e=>setLocalReadCycle(Number(e.target.value))} onBlur={()=>setReadCycle(localReadCycle)} onKeyDown={e=>{if(e.key==='Enter') setReadCycle(localReadCycle)}} /></div>
                  <div className="w-20"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t.rw.writeCycle}</label><input type="number" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono h-8" value={localWriteCycle} onChange={e=>setLocalWriteCycle(Number(e.target.value))} onBlur={()=>setWriteCycle(localWriteCycle)} onKeyDown={e=>{if(e.key==='Enter') setWriteCycle(localWriteCycle)}} /></div>
                  <div className="w-28"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t.rw.dataType}</label><select className="w-full border border-slate-300 rounded px-1 py-1.5 text-sm h-8" value={singleDataType} onChange={e=>setSingleDataType(e.target.value as any)}>{DATA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div className="w-28"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t.rw.actions.write} {t.rw.value}</label><input className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono h-8" value={singleWriteVal} onChange={e=>setSingleWriteVal(e.target.value)} placeholder='e.g. 123' /></div>
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200 h-8">
                      <button onClick={handleSingleReadOnce} className="px-3 py-1 bg-white border shadow-sm rounded text-xs font-medium hover:bg-blue-50 h-full" disabled={!isConnected}>{t.rw.actions.read}</button>
                      <button onClick={handleSingleWriteOnce} className="px-3 py-1 bg-white border shadow-sm rounded text-xs font-medium hover:bg-blue-50 h-full" disabled={!isConnected}>{t.rw.actions.write}</button>
                  </div>
                  <div className="flex items-center gap-3 pl-3 border-l border-slate-200 h-8">
                       <button onClick={toggleAutoRead} disabled={!isConnected} className={`h-7 px-2 rounded flex items-center gap-1 text-xs font-bold transition-all border ${isAutoRead ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}>{isAutoRead ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}Read</button>
                       <button onClick={toggleAutoWrite} disabled={!isConnected} className={`h-7 px-2 rounded flex items-center gap-1 text-xs font-bold transition-all border ${isAutoWrite ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}>{isAutoWrite ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}Write</button>
                  </div>
              </div>
              {singleResult && (
                  <div className={`mt-3 p-2 rounded border flex items-center justify-between animate-in fade-in slide-in-from-top-1 ${isBad(singleResult.statusCode) ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                      <div className="flex items-center gap-3"><div className={`p-1 rounded ${isBad(singleResult.statusCode) ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{isBad(singleResult.statusCode) ? <AlertCircle className="w-4 h-4"/> : <Activity className="w-4 h-4"/>}</div><div className="flex flex-col"><div className="flex items-center gap-2"><span className="text-xs font-bold uppercase opacity-70">Value:</span><span className="font-mono font-bold">{String(singleResult.value)}</span><span className="text-[10px] bg-white/50 px-1 rounded border border-black/5 font-mono opacity-80">{singleResult.dataType}</span></div></div></div>
                      <div className="flex items-center gap-4 text-xs font-mono opacity-80"><div className="flex items-center gap-1"><Zap className="w-3 h-3" /><span>{singleResult.statusCode}</span></div></div>
                  </div>
              )}
          </div>}
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-0">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2 flex-shrink-0">
             <div className="flex items-center gap-4">
                <h2 className="font-bold text-slate-800 flex items-center gap-2"><List className="w-5 h-5 text-blue-600" /><span className="text-blue-900">{t.rw.batchGroups}</span></h2>
                
                {/* BATCH ACTIVITY WATCHDOGS */}
                {(isBatchReading || isBatchWriting) && isVisible && (
                    <div className="flex items-center gap-4 px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-inner ml-2 animate-in fade-in zoom-in duration-300">
                        {isBatchReading && <WatchdogIndicator 
                            lastActive={lastReadTimestamp} 
                            interval={batchReadInterval} 
                            label={t.rw.watchdog.read} 
                            count={readReqCount} 
                            stallCount={readStallCount} 
                            onResetStall={() => setReadStallCount(0)} 
                            onStallDetected={() => setReadStallCount(c => c + 1)}
                            stalledText={t.rw.watchdog.stalled}
                            activeText={t.rw.watchdog.active}
                        />}
                        {isBatchWriting && <WatchdogIndicator 
                            lastActive={lastWriteTimestamp} 
                            interval={batchWriteInterval} 
                            label={t.rw.watchdog.write} 
                            count={writeReqCount} 
                            stallCount={writeStallCount} 
                            onResetStall={() => setWriteStallCount(0)} 
                            onStallDetected={() => setWriteStallCount(c => c + 1)}
                            stalledText={t.rw.watchdog.stalled}
                            activeText={t.rw.watchdog.active}
                        />}
                    </div>
                )}

                <div className="flex items-center gap-1 bg-white rounded-lg border border-blue-300 shadow-sm h-7 overflow-hidden ml-4">
                    <button onClick={handleCopyGroups} disabled={selectedGroupIds.size===0} className="px-2 h-full hover:bg-blue-50 text-slate-600 border-r" title="Copy Group"><Copy className="w-3.5 h-3.5"/></button>
                    <button onClick={handlePasteGroups} disabled={!clipboardGroups} className="px-2 h-full hover:bg-blue-50 text-slate-600 border-r" title="Paste Group"><ClipboardPaste className="w-3.5 h-3.5"/></button>
                    <button onClick={handleDeleteSelectedGroups} disabled={selectedGroupIds.size===0} className="px-2 h-full hover:bg-red-50 text-red-500" title="Delete Group"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
             </div>
             <div className="flex items-center gap-1">
                 <input type="number" min="1" max="10" value={createCount} onChange={e => setCreateCount(Number(e.target.value))} className="w-10 text-xs border border-slate-300 rounded px-1 py-1.5 h-8 text-center" />
                 <button onClick={handleBatchAddGroups} className="px-3 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-sm"><Plus className="w-3.5 h-3.5"/> {t.rw.addGroups}</button>
             </div>
          </div>

          <div className="flex items-end px-2 pt-2 bg-slate-100/80 border-b border-slate-200 gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 flex-shrink-0 min-h-[40px]">
              {groups.length === 0 && <div className="text-xs text-slate-400 italic px-4 py-2">No groups. Click "Add Groups" to start.</div>}
              {groups.map((group, idx) => (
                  <div key={group.id} onClick={(e) => handleTabClick(e, group.id, idx)} onDoubleClick={(e) => startRenamingGroup(e, group)} onContextMenu={(e) => handleTabContextMenu(e, group.id)} className={`group relative flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-bold cursor-pointer transition-all border-t border-x select-none flex-shrink-0 min-w-[120px] max-w-[200px] h-8 ${activeGroupId === group.id ? 'bg-white border-slate-200 text-blue-700 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'} ${selectedGroupIds.has(group.id) && activeGroupId !== group.id ? 'bg-blue-50 border-blue-200 text-blue-800 ring-1 ring-inset ring-blue-200' : ''}`}>
                      {editingGroupId === group.id ? (<input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 outline-none h-6" value={editGroupName} onChange={e => setEditGroupName(e.target.value)} onBlur={saveGroupName} onKeyDown={e => e.key === 'Enter' && saveGroupName()} onClick={e => e.stopPropagation()} />) : (<span className="truncate">{group.name}</span>)}
                      <span className="px-1.5 rounded-full text-[9px] ml-auto flex-shrink-0 bg-slate-100 text-slate-500">{group.nodes.length}</span>
                      <button onClick={(e) => deleteSingleGroup(e, group.id)} className="p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 transition-all"><X className="w-3 h-3" /></button>
                  </div>
              ))}
          </div>

          <div className="p-2 border-b border-slate-100 flex flex-wrap gap-4 bg-slate-50/50 items-center flex-shrink-0">
             <div className="flex items-center gap-3 pr-4 border-r border-slate-200">
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] font-bold uppercase text-slate-500">{t.rw.readCycle}</span>
                     <div className="flex items-center bg-white border border-slate-300 rounded h-6 px-1 w-20">
                        <input type="number" className="w-full text-xs text-center font-mono outline-none" value={localBatchReadInterval} onChange={e => setLocalBatchReadInterval(Number(e.target.value))} onBlur={() => setBatchReadInterval(localBatchReadInterval)} onKeyDown={e => { if(e.key==='Enter') setBatchReadInterval(localBatchReadInterval) }} />
                        <span className="text-[9px] text-slate-400 mr-1">ms</span>
                     </div>
                     <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
                         <span className="text-[10px] font-bold uppercase text-slate-500">{t.rw.batchSize}</span>
                         <div className="flex items-center bg-white border border-slate-300 rounded h-6 px-1 w-20"><input type="number" min="1" className="w-full text-xs text-center font-mono outline-none" value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} /></div>
                     </div>
                     <button onClick={toggleBatchRead} disabled={!isConnected} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isBatchReading ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>{isBatchReading ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}</button>
                 </div>
                 <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                     <span className="text-[10px] font-bold uppercase text-slate-500">{t.rw.writeCycle}</span>
                     <div className="flex items-center bg-white border border-slate-300 rounded h-6 px-1 w-20">
                        <input type="number" className="w-full text-xs text-center font-mono outline-none" value={localBatchWriteInterval} onChange={e => setLocalBatchWriteInterval(Number(e.target.value))} onBlur={() => setBatchWriteInterval(localBatchWriteInterval)} onKeyDown={e => { if(e.key==='Enter') setBatchWriteInterval(localBatchWriteInterval) }} />
                        <span className="text-[9px] text-slate-400 mr-1">ms</span>
                     </div>
                     <button onClick={() => setIsAutoIncrement(!isAutoIncrement)} className={`px-2 h-6 flex items-center gap-1 rounded text-[10px] font-bold transition-all border ${isAutoIncrement ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`} title="Auto Increment Value (+1) on Write"><StepForward className="w-3 h-3" /><span>Auto +1</span></button>
                     {isAutoIncrement && (
                        <div className="flex items-center bg-white border border-indigo-200 rounded h-6 px-1 animate-in fade-in slide-in-from-left-1 w-20">
                            <input type="number" min="10" className="w-full text-xs text-center font-mono outline-none text-indigo-600 font-bold" value={localAutoIncInterval} onChange={e => setLocalAutoIncInterval(Number(e.target.value))} onBlur={() => setAutoIncrementInterval(localAutoIncInterval)} onKeyDown={e => { if(e.key==='Enter') setAutoIncrementInterval(localAutoIncInterval) }} />
                            <span className="text-[9px] text-indigo-400 mr-1">ms</span>
                        </div>
                     )}
                     <button onClick={toggleBatchWrite} disabled={!isConnected} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isBatchWriting ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>{isBatchWriting ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}</button>
                 </div>
             </div>
             <div className="flex items-center gap-2"><button onClick={handleResetErrors} className="px-2 py-1 bg-white border border-slate-300 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1" title="Reset Error Counters"><RotateCcw className="w-3 h-3" />Reset Errors</button></div>
             {selectedIds.size > 0 && (<div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded animate-in fade-in"><span className="text-xs font-bold text-blue-700">{selectedIds.size} Selected</span><button onClick={() => setBatchWriteModalOpen(true)} className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] rounded font-bold">{t.rw.actions.batchWrite}</button><button onClick={deleteSelectedNodes} className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] rounded font-bold">{t.rw.actions.deleteSelected}</button></div>)}
             <div className="flex-1 flex gap-2 items-center justify-end ml-4 pl-4 border-l border-slate-200">
                  <div className="flex items-center bg-white border border-slate-200 rounded overflow-hidden shadow-sm h-7 mr-2"><button onClick={handleDownloadTemplate} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-slate-50 text-slate-600 border-r pointer-events-auto transition-colors" title={t.rw.actions.template}><Download className="w-3.5 h-3.5" /><span className="text-[10px] hidden sm:inline">{t.rw.actions.template}</span></button><button onClick={handleExportConfig} disabled={activeGroup?.nodes.length === 0} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-emerald-50 text-emerald-700 border-r disabled:opacity-50 transition-colors" title={t.rw.actions.export}><Save className="w-3.5 h-3.5" /><span className="text-[10px] hidden sm:inline">{t.rw.actions.export}</span></button><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-blue-50 text-blue-600 font-medium transition-colors" title={t.rw.actions.import}><Upload className="w-3.5 h-3.5" /><span className="text-[10px] hidden sm:inline">{t.rw.actions.import}</span></button></div>
                  <input className="flex-1 max-w-xs text-xs font-mono border border-slate-300 rounded px-2 py-1 h-7 focus:border-blue-400 outline-none" placeholder={t.rw.placeholders.addNode} value={bulkText} onChange={e => setBulkText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleBulkAdd()} />
                  <button onClick={handleBulkAdd} className="px-3 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-sm"><ListPlus className="w-3.5 h-3.5" /> {t.rw.actions.add}</button>
             </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-slate-50 relative">
            <div ref={headerRef} className="flex items-center bg-white border-b border-slate-200 h-9 flex-shrink-0 shadow-sm z-20 overflow-hidden" style={{ width: '100%' }}>
                <div style={{ width: colWidths.index }} className={HEADER_CELL_BASE}>#<ResizeHandle onMouseDown={(e) => startResizing('index', e)} /></div>
                <div style={{ width: colWidths.nodeId }} className={HEADER_CELL_BASE}>{t.rw.nodeId}<ResizeHandle onMouseDown={(e) => startResizing('nodeId', e)} /></div>
                <div style={{ width: colWidths.displayName }} className={HEADER_CELL_BASE}>{t.rw.displayName}<ResizeHandle onMouseDown={(e) => startResizing('displayName', e)} /></div>
                <div style={{ width: colWidths.value }} className={HEADER_CELL_BASE}>{t.rw.value}<ResizeHandle onMouseDown={(e) => startResizing('value', e)} /></div>
                <div style={{ width: colWidths.dataType }} className={HEADER_CELL_BASE}>{t.rw.dataType}<ResizeHandle onMouseDown={(e) => startResizing('dataType', e)} /></div>
                <div style={{ width: colWidths.quality }} className={HEADER_CELL_BASE}>{t.rw.quality}<ResizeHandle onMouseDown={(e) => startResizing('quality', e)} /></div>
                <div style={{ width: colWidths.errorCount }} className={`${HEADER_CELL_BASE} cursor-pointer hover:bg-slate-100 transition-colors`} onClick={cycleErrorFilter} title="Click to filter nodes with errors"><div className="flex items-center justify-between w-full"><span>Errors</span>{errorFilter === 'ERRORS_ONLY' && <Filter className="w-3 h-3 text-blue-600 fill-current" />}</div><ResizeHandle onMouseDown={(e) => startResizing('errorCount', e)} /></div>
                <div style={{ width: colWidths.actions }} className={HEADER_CELL_BASE}><ResizeHandle onMouseDown={(e) => startResizing('actions', e)} /></div>
            </div>
            <div ref={scrollContainerRef} className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 outline-none" onScroll={handleScroll} tabIndex={0} onKeyDown={handleListKeyDown}>
                {nodeList.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 italic text-sm">{errorFilter === 'ERRORS_ONLY' ? 'No nodes with errors found.' : `No nodes in ${activeGroup?.name || 'this group'}. Add manually above.`}</div>
                ) : (
                    <div style={{ height: totalHeight, minWidth: totalTableWidth, position: 'relative' }}>
                        {visibleItems.map(({ index, node }) => (
                            <NodeRow key={node.internalId || index} top={index * ROW_HEIGHT} node={node} index={index} colWidths={colWidths} isSelected={selectedIds.has(node.internalId || node.nodeId)} isEditing={editingNodeId === node.internalId} isEditingDataType={editingDataTypeId === (node.internalId || node.nodeId)} isEditingNodeId={editingProp?.id === node.internalId && editingProp?.field === 'nodeId'} isEditingDisplayName={editingProp?.id === node.internalId && editingProp?.field === 'displayName'} editValue={editValue} editPropValue={editPropValue} isDragging={draggedItemIndex === index} isDragOver={dragOverItemIndex === index} onRowClick={handleRowClick} onStartEditing={startEditing} onStartEditingDataType={setEditingDataTypeId} onStartEditProp={handleStartEditProp} onCommitEdit={handleCommitInlineWrite} onCommitProp={handleCommitProp} onCancelEdit={() => setEditingNodeId(null)} onCancelProp={handleCancelProp} onCommitDataType={handleDataTypeChange} onCancelDataType={() => setEditingDataTypeId(null)} onDeleteSingle={deleteSingle} onExplodeArray={handleExplodeArray} setEditValue={setEditValue} setEditPropValue={setEditPropValue} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragEnd={handleDragEnd} onDrop={handleDrop} onArrayWrite={(writes) => handleArrayWrite(node.nodeId, node.dataType, writes)} />
                        ))}
                    </div>
                )}
            </div>
            <div className="bg-white border-t border-slate-200 p-2 text-xs text-slate-500 flex justify-between items-center font-mono flex-shrink-0 z-20"><span>Total Items: {nodeList.length} {errorFilter !== 'ALL' ? `(Filtered)` : ''}</span><span>Column Resize Active</span></div>
          </div>
      </div>
    </div>
  );
};

export default React.memo(ReadWritePanel);
