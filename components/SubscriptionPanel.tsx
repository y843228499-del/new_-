
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Subscription, MonitoredItem, OpcNode, OpcDataType } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Plus, Trash2, Activity, ListPlus, Play, Pause, X, Download, FileSpreadsheet, Check, Save, Eye, Copy, ClipboardPaste, Disc, StopCircle, GripVertical, AlertTriangle, Loader2, Settings2, Settings, Search, Edit3, Filter, Clock, Upload } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ValueDisplay from './ValueDisplay';

// --- SUBSCRIPTION PANEL (Robust Version v14.9 - Strict Handle Sync) ---

interface SubscriptionPanelProps {
  isVisible: boolean; // Controls rendering loop
  isConnected: boolean;
  sessionId?: string;
  addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
  pendingNodes?: OpcNode[];
  onNodesConsumed?: () => void;
  onSyncIds?: (ids: Set<string>) => void;
  initialSubscriptions?: Subscription[];
  onSubscriptionsChange?: (subs: Subscription[]) => void;
  autoSubscribeEnabled?: boolean;
}

// --- PERFORMANCE CONSTANTS ---
const ROW_HEIGHT = 36;
const BUFFER_ROWS = 5;
const RENDER_FPS = 15;
const RENDER_INTERVAL = 1000 / RENDER_FPS;

const DATA_TYPES: OpcDataType[] = ['Boolean', 'SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'LINT', 'ULINT', 'LWORD', 'LTIME', 'Float', 'Double', 'String', 'DateTime'];

// --- STYLES ---
const CELL_BASE = "flex-shrink-0 border-r border-slate-100 flex items-center px-2 truncate";
const HEADER_CELL_BASE = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-500 uppercase relative overflow-hidden group/header";

// --- HELPERS ---
const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div 
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-400 z-20 group-hover/header:bg-slate-200 hover:!bg-emerald-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

const ensureInternalIds = (items: MonitoredItem[]) => {
    return items.map(i => ({
        ...i,
        internalId: i.internalId || Math.random().toString(36).substr(2, 9)
    }));
};

const isStructureEqual = (a: Subscription[] | undefined, b: Subscription[] | undefined): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;

    return a.every((subA, i) => {
        const subB = b[i];
        if (subA.subscriptionId !== subB.subscriptionId) return false;
        if (subA.status !== subB.status) return false;
        if (subA.publishingInterval !== subB.publishingInterval) return false;
        if (subA.items.length !== subB.items.length) return false;

        return subA.items.every((itemA, j) => {
            const itemB = subB.items[j];
            return itemA.nodeId === itemB.nodeId && itemA.clientHandle === itemB.clientHandle;
        });
    });
};

const isBad = (s: string) => s ? s.startsWith('Bad') : false;

// --- IMPORT CONFIRMATION MODAL ---
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
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <Upload className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">导入配置</h3>
                        <p className="text-xs text-slate-500">Import Configuration</p>
                    </div>
                </div>
                
                <div className="text-sm text-slate-600 py-2">
                    解析到 <span className="font-bold text-emerald-600">{nodeCount}</span> 个节点。请选择导入方式：
                    <ul className="mt-2 space-y-2 text-xs text-slate-500 list-disc pl-4">
                        <li><b>覆盖 (Overwrite)</b>: 清空当前视图并替换为新列表。</li>
                        <li><b>追加 (Append)</b>: 保留现有节点，将新节点添加到底部。</li>
                    </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded text-xs font-bold">取消</button>
                    <button onClick={onAppend} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-bold shadow-sm">追加</button>
                    <button onClick={onOverwrite} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm">覆盖</button>
                </div>
            </div>
        </div>
    );
};

// --- SUBSCRIPTION CONFIG MODAL ---
interface SubscriptionConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: Omit<Subscription, 'viewIndex' | 'subscriptionId' | 'status' | 'items'>, qty: number) => void;
    initialValues?: Partial<Subscription>;
    isEditing?: boolean;
}

const SubscriptionConfigModal: React.FC<SubscriptionConfigModalProps> = ({ isOpen, onClose, onConfirm, initialValues, isEditing }) => {
    const { t } = useLanguage();
    const defaults = {
        publishingInterval: 500, 
        lifetimeCount: 100,
        maxKeepAliveCount: 10,
        maxNotificationsPerPublish: 0,
        priority: 0,
        publishTimeout: 60000,
        samplingInterval: 500,
        queueSize: 10,
        discardOldest: true
    };

    const [config, setConfig] = useState(defaults);
    const [qty, setQty] = useState(1);

    useEffect(() => {
        if (isOpen) {
            if (initialValues) {
                setConfig({ ...defaults, ...initialValues });
            } else {
                setConfig(defaults);
            }
            setQty(1);
        }
    }, [isOpen, initialValues]);

    if (!isOpen) return null;

    const handleReset = () => {
        setConfig(defaults);
        setQty(1);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-emerald-600"/> 
                        {isEditing ? "Edit Subscription Parameters" : t.sub.configModal.title}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="p-6 flex flex-col gap-6 overflow-y-auto">
                    {/* Subscription Params */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 pb-2 border-b border-slate-200">{t.sub.configModal.subSettings}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.publishingInterval} (ms)</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.publishingInterval} onChange={e => setConfig({...config, publishingInterval: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.publishTimeout} (ms)</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.publishTimeout} onChange={e => setConfig({...config, publishTimeout: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.priority}</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.priority} onChange={e => setConfig({...config, priority: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.maxKeepAlive}</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.maxKeepAliveCount} onChange={e => setConfig({...config, maxKeepAliveCount: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.lifetimeCount}</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.lifetimeCount} onChange={e => setConfig({...config, lifetimeCount: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.maxNotifications}</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.maxNotificationsPerPublish} onChange={e => setConfig({...config, maxNotificationsPerPublish: Number(e.target.value)})} />
                                <p className="text-[10px] text-slate-400 mt-1">0 = Unlimited</p>
                            </div>
                        </div>
                    </div>

                    {/* Monitored Item Params */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 pb-2 border-b border-slate-200">{t.sub.configModal.itemSettings}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.samplingInterval} (ms)</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.samplingInterval} onChange={e => setConfig({...config, samplingInterval: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t.sub.configModal.queueSize}</label>
                                <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none" value={config.queueSize} onChange={e => setConfig({...config, queueSize: Number(e.target.value)})} />
                            </div>
                            <div className="flex items-center mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" checked={config.discardOldest} onChange={e => setConfig({...config, discardOldest: e.target.checked})} />
                                    <span className="text-sm font-bold text-slate-700">{t.sub.configModal.discardOldest}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    {!isEditing && (
                        <div className="flex items-center gap-4 border-t border-slate-200 pt-4">
                            <label className="block text-xs font-bold text-slate-600 uppercase">Create Quantity:</label>
                            <input type="number" min="1" max="20" className="w-20 border border-slate-300 rounded px-3 py-2 text-sm text-center focus:border-emerald-500 outline-none" value={qty} onChange={e => setQty(Number(e.target.value))} />
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between">
                    <button onClick={handleReset} className="text-slate-500 hover:text-slate-700 text-sm font-medium underline">{t.sub.configModal.reset}</button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm">{t.sub.configModal.cancel}</button>
                        <button onClick={() => onConfirm(config, qty)} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-sm shadow-md transition-transform active:scale-95">
                            {isEditing ? "Update & Restart" : t.sub.configModal.confirm}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MEMOIZED ROW COMPONENT ---
interface MonitoredItemRowProps {
    top: number;
    item: MonitoredItem;
    liveDataRef: React.MutableRefObject<Map<string, MonitoredItem>>; // Pass Ref instead of value
    tick: number; // Force update trigger
    index: number;
    colWidths: any;
    isSelected: boolean;
    
    // Edit States
    isEditingValue: boolean;
    isEditingDataType: boolean;
    isEditingNodeId: boolean; // NEW
    isEditingDisplayName: boolean; // NEW
    writeVal: string;
    editPropValue: string; // NEW

    isDragging: boolean;
    isDragOver: boolean;
    isConnected: boolean;
    isSubRunning: boolean; // NEW: Passed from parent to control spinner logic
    
    onRowClick: (e: React.MouseEvent, item: MonitoredItem, index: number) => void;
    
    // Value Write Handlers
    onWriteStart: (item: MonitoredItem) => void;
    onWriteConfirm: (id: string) => void;
    onWriteCancel: () => void;
    setWriteVal: (val: string) => void;
    
    // Prop Edit Handlers
    onStartEditProp: (item: MonitoredItem, field: 'nodeId' | 'displayName') => void; // NEW
    onCommitProp: () => void; // NEW
    onCancelProp: () => void; // NEW
    setEditPropValue: (val: string) => void; // NEW

    onDeleteSingle: (handle: number, internalId: string) => void;
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragEnter: (index: number) => void;
    onDrop: (index: number) => void;
    onArrayWrite: (writes: {indexRange: string, value: any}[]) => Promise<void>;
    
    onDataTypeChange: (id: string, type: OpcDataType) => void;
    onStartEditingDataType: (id: string) => void;
    onCancelDataType: () => void;
}

const MonitoredItemRow = React.memo(({ 
    top, item, liveDataRef, tick, index, colWidths, isSelected, 
    isEditingValue, isEditingDataType, isEditingNodeId, isEditingDisplayName, writeVal, editPropValue,
    isDragging, isDragOver, isConnected, isSubRunning,
    onRowClick, onWriteStart, onWriteConfirm, onWriteCancel, setWriteVal, 
    onStartEditProp, onCommitProp, onCancelProp, setEditPropValue,
    onDeleteSingle, onDragStart, onDragEnter, onDrop, onArrayWrite, onDataTypeChange, onStartEditingDataType, onCancelDataType
}: MonitoredItemRowProps) => {
    
    // FAST LOOKUP: Read directly from Ref to bypass React state overhead for high frequency data
    const liveItem = item.internalId ? liveDataRef.current.get(item.internalId) : null;
    const displayValue = liveItem ? liveItem.value : item.value;
    const displayStatus = liveItem ? liveItem.statusCode : item.statusCode;
    const displayTime = liveItem ? liveItem.timestamp : item.timestamp;
    const isWaiting = displayStatus === 'Waiting';
    
    // UI LOGIC: Only show clientHandle if the item is confirmed by server (has monitoredItemId)
    const displayHandle = item.monitoredItemId ? item.clientHandle : '-';

    const isAnyEditing = isEditingValue || isEditingDataType || isEditingNodeId || isEditingDisplayName;

    return (
        <div 
            style={{ top, height: ROW_HEIGHT, left: 0, right: 0, position: 'absolute' }}
            onClick={(e) => onRowClick(e, item, index)}
            draggable={!isAnyEditing}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => onDragEnter(index)}
            onDrop={() => onDrop(index)}
            className={`flex items-stretch border-b transition-all text-xs select-none 
                ${isDragging ? 'opacity-40 bg-slate-100' : ''}
                ${isDragOver ? 'border-t-2 border-t-emerald-500' : 'border-slate-100'}
                ${isSelected ? 'bg-emerald-100 hover:bg-emerald-200' : isBad(displayStatus) ? 'bg-red-50 hover:bg-red-100' : 'bg-white hover:bg-emerald-50/30'}`}
        >
            <div style={{ width: colWidths.index }} className="flex justify-center items-center border-r border-slate-100 flex-shrink-0 text-slate-400 font-mono group/grip cursor-grab active:cursor-grabbing">
                <GripVertical className="w-3.5 h-3.5 opacity-0 group-hover/grip:opacity-100 text-slate-400" />
                <span className="group-hover/grip:hidden">{index + 1}</span>
            </div>

            <div style={{ width: colWidths.handle }} className={`${CELL_BASE} font-mono text-slate-400 text-[10px]`}>
                {displayHandle}
            </div>

            <div style={{ width: colWidths.nodeId }} className={`${CELL_BASE} font-mono group/nid cursor-text hover:bg-slate-100 transition-colors`} title={item.nodeId} onDoubleClick={(e) => { e.stopPropagation(); onStartEditProp(item, 'nodeId'); }}>
                {isEditingNodeId ? (
                    <input 
                        autoFocus 
                        className="w-full h-6 bg-white border border-emerald-500 rounded px-1 outline-none text-xs font-mono"
                        value={editPropValue}
                        onChange={e => setEditPropValue(e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') onCommitProp(); if(e.key==='Escape') onCancelProp(); }}
                        onBlur={onCommitProp}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex items-center w-full">
                        <span className={`truncate flex-1 ${isBad(displayStatus) ? 'text-red-600 font-bold' : 'text-slate-700'}`}>{item.nodeId}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/nid:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>

            <div style={{ width: colWidths.displayName }} className={`${CELL_BASE} text-slate-600 truncate group/dn cursor-text hover:bg-slate-100 transition-colors`} title={item.displayName} onDoubleClick={(e) => { e.stopPropagation(); onStartEditProp(item, 'displayName'); }}>
                {isEditingDisplayName ? (
                    <input 
                        autoFocus 
                        className="w-full h-6 bg-white border border-emerald-500 rounded px-1 outline-none text-xs"
                        value={editPropValue}
                        onChange={e => setEditPropValue(e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') onCommitProp(); if(e.key==='Escape') onCancelProp(); }}
                        onBlur={onCommitProp}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex items-center w-full">
                        <span className="truncate flex-1">{item.displayName || '-'}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/dn:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>

            {/* Editable Value Column */}
            <div 
                style={{ width: colWidths.value }} 
                className={`${CELL_BASE} cursor-text hover:bg-emerald-50 transition-colors font-mono font-bold text-slate-800`}
                onDoubleClick={(e) => { e.stopPropagation(); onWriteStart(item); }}
            >
                {isEditingValue ? (
                    <div className="flex items-center gap-1 w-full px-1 animate-in zoom-in-95 duration-75 h-full">
                        <input 
                            autoFocus 
                            className="flex-1 min-w-0 bg-white border border-emerald-500 rounded px-1 h-6 shadow-sm outline-none font-mono text-xs" 
                            value={writeVal} 
                            onChange={e => setWriteVal(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') onWriteConfirm(item.nodeId);
                                if (e.key === 'Escape') onWriteCancel();
                            }}
                            onClick={e => e.stopPropagation()}
                        />
                        <button onClick={() => onWriteConfirm(item.nodeId)} className="h-6 px-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"><Check className="w-3 h-3" /></button>
                        <button onClick={onWriteCancel} className="h-6 px-1 text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 w-full group/val overflow-hidden h-full">
                        <div className="flex-1 truncate">
                            <ValueDisplay value={displayValue} dataType={item.dataType} nodeId={item.nodeId} onWrite={onArrayWrite} />
                        </div>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/val:opacity-100 flex-shrink-0" />
                    </div>
                )}
            </div>

            {/* Editable Data Type Column */}
            <div 
                style={{ width: colWidths.dataType }} 
                className={`${CELL_BASE} cursor-pointer hover:bg-emerald-50 transition-colors`} 
                title={item.dataType}
                onDoubleClick={(e) => { e.stopPropagation(); onStartEditingDataType(item.internalId || item.nodeId); }}
            >
                {isEditingDataType ? (
                    <select
                        autoFocus
                        className="w-full text-xs border border-emerald-500 rounded px-1 h-6 bg-white shadow-sm outline-none"
                        value={item.dataType}
                        onChange={(e) => onDataTypeChange(item.internalId || item.nodeId, e.target.value as OpcDataType)}
                        onBlur={onCancelDataType}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onCancelDataType(); }}
                    >
                        {DATA_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
                    </select>
                ) : (
                    <div className="flex items-center justify-between w-full group/type">
                        <span className="text-slate-500 truncate text-[10px]">{item.dataType || '?'}</span>
                        <Edit3 className="w-3 h-3 text-slate-300 opacity-0 group-hover/type:opacity-100" />
                    </div>
                )}
            </div>

            <div style={{ width: colWidths.time }} className={`${CELL_BASE} font-mono text-slate-500 text-[10px]`}>
                {displayTime?.split('T')[1]?.split('Z')[0] || '-'}
            </div>

            <div style={{ width: colWidths.statusCode }} className={CELL_BASE}>
                {isBad(displayStatus) ? (
                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-1 truncate text-[10px] font-bold"><AlertTriangle className="w-3 h-3 flex-shrink-0"/> {displayStatus}</span>
                ) : isWaiting ? (
                    <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 truncate text-[10px] font-bold border ${isSubRunning ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {isSubRunning ? <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin"/> : <Clock className="w-3 h-3 flex-shrink-0"/>}
                        {displayStatus}
                    </span>
                ) : (
                    <span className="text-emerald-600 truncate text-[10px]">{displayStatus}</span>
                )}
            </div>

            <div style={{ width: colWidths.action }} className="flex justify-start pl-2 items-center flex-shrink-0 gap-1 border-r border-slate-100" onClick={e => e.stopPropagation()}>
                 <button onClick={(e) => { e.stopPropagation(); onDeleteSingle(item.clientHandle, item.internalId || item.nodeId); }} className="p-1 rounded text-slate-300 hover:text-red-500 transition-opacity">
                    <X className="w-3.5 h-3.5" />
                 </button>
            </div>
        </div>
    );
}, (prev, next) => {
    // Only re-render if structure or interaction state changes, OR if tick changes (force update for values)
    return prev.item === next.item && 
           prev.index === next.index && 
           prev.tick === next.tick && // Crucial for value updates
           prev.isSubRunning === next.isSubRunning && // Crucial for status updates
           prev.top === next.top &&
           prev.colWidths === next.colWidths &&
           prev.isSelected === next.isSelected && 
           prev.isEditingValue === next.isEditingValue &&
           prev.isEditingDataType === next.isEditingDataType &&
           prev.isEditingNodeId === next.isEditingNodeId &&
           prev.isEditingDisplayName === next.isEditingDisplayName &&
           prev.writeVal === next.writeVal &&
           prev.editPropValue === next.editPropValue &&
           prev.isDragging === next.isDragging &&
           prev.isDragOver === next.isDragOver &&
           prev.isConnected === next.isConnected;
});


const SubscriptionPanel: React.FC<SubscriptionPanelProps> = ({ isVisible, isConnected, sessionId, addLog, pendingNodes, onNodesConsumed, onSyncIds, initialSubscriptions, onSubscriptionsChange, autoSubscribeEnabled }) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  
  // RX INDICATOR REFS (No state to prevent heavy re-renders)
  const lastRxTimeRef = useRef<number>(0);
  const rxContainerRef = useRef<HTMLDivElement>(null);
  const rxDotRef = useRef<HTMLDivElement>(null);
  const rxTextRef = useRef<HTMLSpanElement>(null);
  
  // STATUS FILTER STATE
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BAD' | 'WAITING' | 'GOOD'>('ALL');

  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => {
      if (initialSubscriptions) {
          return initialSubscriptions.map(sub => ({ ...sub, items: ensureInternalIds(sub.items) }));
      }
      return [];
  });

  // --- IMPORT STATE ---
  const [pendingImport, setPendingImport] = useState<MonitoredItem[] | null>(null);

  // --- OPTIMIZATION: LIVE DATA STORE ---
  const liveDataRef = useRef<Map<string, MonitoredItem>>(new Map());
  const handleMapRef = useRef<Map<string, string>>(new Map()); // Map `${subId}_${clientHandle}` -> InternalId
  const [tick, setTick] = useState(0);
  const hasPendingUpdatesRef = useRef(false);
  const lastRenderTimeRef = useRef(0); // Throttle control
  const pausedByInactivityRef = useRef<number[]>([]);

  // TAB VISIBILITY SLEEP MODE: Physically pause subscription publishing in the backend when tab is hidden
  useEffect(() => {
      if (!sessionId || !isConnected) return;
      const currentSessionId = sessionId;

      if (!isVisible) {
          // Tab hidden: Pause all active subscriptions
          const activeIds = subscriptions.filter(s => s.status === 'Active').map(s => s.subscriptionId);
          if (activeIds.length > 0) {
              console.log(`[SubscriptionPanel] Visibility hidden. Pausing active subscriptions:`, activeIds);
              pausedByInactivityRef.current = activeIds;
              activeIds.forEach(id => {
                  opcuaService.pauseSubscription(currentSessionId, id).catch(err => {
                      console.warn(`[SubscriptionPanel] Failed to pause sub ${id}:`, err);
                  });
              });
          }
      } else {
          // Tab visible: Resume previously paused subscriptions
          const idsToResume = pausedByInactivityRef.current;
          if (idsToResume.length > 0) {
              console.log(`[SubscriptionPanel] Visibility restored. Resuming subscriptions:`, idsToResume);
              idsToResume.forEach(id => {
                  const currentSub = subscriptions.find(s => s.subscriptionId === id);
                  if (currentSub && currentSub.status === 'Active') {
                      opcuaService.resumeSubscription(currentSessionId, id).catch(err => {
                          console.warn(`[SubscriptionPanel] Failed to resume sub ${id}:`, err);
                      });
                  }
              });
              pausedByInactivityRef.current = [];
          }
      }
  }, [isVisible, isConnected, sessionId]);

  useEffect(() => {
      if (!isConnected || !sessionId) {
          pausedByInactivityRef.current = [];
      }
  }, [isConnected, sessionId]);
  
  // Sync Handle Map whenever subscriptions change structure
  useEffect(() => {
      const map = new Map<string, string>();
      const activeInternalIds = new Set<string>();

      subscriptions.forEach(sub => {
          sub.items.forEach(i => {
              if (i.internalId) {
                  map.set(`${sub.subscriptionId}_${i.clientHandle}`, i.internalId);
                  activeInternalIds.add(i.internalId);
              }
          });
      });
      handleMapRef.current = map;

      // OPTIMIZATION: Garbage Collect Stale Data
      const currentKeys = Array.from(liveDataRef.current.keys());
      let deletedCount = 0;
      for (const key of currentKeys) {
          if (!activeInternalIds.has(key as string)) {
              liveDataRef.current.delete(key as string);
              deletedCount++;
          }
      }

  }, [subscriptions]);

  // OPTIMIZATION: Session Cleanup
  useEffect(() => {
      liveDataRef.current.clear();
      handleMapRef.current.clear();
      setTick(0);
  }, [sessionId]);

  // --- COL WIDTHS ---
  const [colWidths, setColWidths] = useState({
    index: 40,
    handle: 60,
    nodeId: 180, 
    displayName: 140, 
    value: 240, 
    dataType: 80, 
    time: 110,
    statusCode: 90, 
    action: 100
  });
  
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // --- SIDEBAR RESIZING ---
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isResizingSidebar = useRef(false);

  // --- DRAG & DROP STATE ---
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

  // --- PROCESSING STATE ---
  const [processingSubIds, setProcessingSubIds] = useState<Set<number>>(new Set());

  // RX Indicator Logic is moved into the RENDER LOOP entirely
  const rxTimeoutRef = useRef<any>(null);

  // Sync Logic
  const subsRef = useRef<Subscription[]>(subscriptions);
  const prevInitialSubscriptionsRef = useRef<Subscription[] | undefined>(undefined);
  
  useEffect(() => {
    if (initialSubscriptions && !isStructureEqual(initialSubscriptions, prevInitialSubscriptionsRef.current)) {
        // Hydration logic...
        const currentItemsMap = new Map<string, MonitoredItem>();
        subsRef.current.forEach(s => s.items.forEach(i => {
            if (i.internalId) currentItemsMap.set(i.internalId, i);
        }));

        const hydrated = initialSubscriptions.map(s => {
            const localSub = subsRef.current.find(ls => ls.subscriptionId === s.subscriptionId);
            return {
                ...s,
                status: localSub ? localSub.status : 'Paused',
                serverSubscriptionId: localSub ? localSub.serverSubscriptionId : s.serverSubscriptionId,
                items: ensureInternalIds(s.items).map(i => {
                    const existing = i.internalId ? currentItemsMap.get(i.internalId) : undefined;
                    if (existing && existing.nodeId === i.nodeId) {
                        return { 
                            ...i, 
                            clientHandle: existing.clientHandle, 
                            internalId: existing.internalId || i.internalId, 
                            displayName: i.displayName || existing.displayName,
                            dataType: i.dataType || existing.dataType, 
                            statusCode: existing.statusCode 
                        };
                    }
                    return i;
                })
            };
        });
        
        setSubscriptions(hydrated);
        subsRef.current = hydrated; 
        prevInitialSubscriptionsRef.current = initialSubscriptions;
    }
  }, [initialSubscriptions, isConnected, sessionId]);

  useEffect(() => { subsRef.current = subscriptions; }, [subscriptions]);

  const updateSubsStructurally = (newSubs: Subscription[]) => {
      setSubscriptions(newSubs);
      subsRef.current = newSubs;
      if (onSubscriptionsChange) onSubscriptionsChange(newSubs);
  };

  const [activeSubId, setActiveSubId] = useState<number | null>(subscriptions.length > 0 ? subscriptions[0].subscriptionId : null);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<number>>(new Set(subscriptions.length > 0 ? [subscriptions[0].subscriptionId] : []));
  const [lastClickedSubId, setLastClickedSubId] = useState<number | null>(subscriptions.length > 0 ? subscriptions[0].subscriptionId : null);
  const [clipboardSubs, setClipboardSubs] = useState<Subscription[] | null>(null);
  
  const [bulkItemList, setBulkItemList] = useState('');
  
  // EDIT STATE
  const [editingItemId, setEditingItemId] = useState<string | null>(null); // For Value Write
  const [editingDataTypeId, setEditingDataTypeId] = useState<string | null>(null);
  
  // NEW: PROP EDIT STATE (NodeId / DisplayName)
  const [editingProp, setEditingProp] = useState<{ id: string, field: 'nodeId' | 'displayName' } | null>(null);
  const [editPropValue, setEditPropValue] = useState('');

  const [writeVal, setWriteVal] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set()); 
  const [lastSelectedItemId, setLastSelectedItemId] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const recordedDataRef = useRef<any[]>([]); 
  const [recordedCount, setRecordedCount] = useState(0);

  // Ensure activeSubId is valid
  useEffect(() => {
      if (subscriptions.length > 0 && activeSubId === null) {
          setActiveSubId(subscriptions[0].subscriptionId);
          setSelectedSubIds(new Set([subscriptions[0].subscriptionId]));
      } else if (subscriptions.length === 0) {
          setActiveSubId(null);
          setSelectedSubIds(new Set());
      } else if (activeSubId && !subscriptions.find(s => s.subscriptionId === activeSubId)) {
          setActiveSubId(subscriptions[0].subscriptionId);
          setSelectedSubIds(new Set([subscriptions[0].subscriptionId]));
      }
  }, [subscriptions, activeSubId]);

  // --- FILTERED VIRTUAL SCROLL LOGIC ---
  const activeSubscription = subscriptions.find(s => s.subscriptionId === activeSubId);
  const items = activeSubscription ? activeSubscription.items : [];
  
  const filteredItems = useMemo(() => {
      if (!activeSubscription) return [];
      const currentItems = activeSubscription.items;
      
      if (statusFilter === 'ALL') return currentItems;

      return currentItems.filter(item => {
          const live = item.internalId ? liveDataRef.current.get(item.internalId) : null;
          const status = live ? live.statusCode : item.statusCode;
          
          if (statusFilter === 'BAD') return status && status.startsWith('Bad');
          if (statusFilter === 'WAITING') return status === 'Waiting';
          if (statusFilter === 'GOOD') return status && status.startsWith('Good');
          return true;
      });
  }, [activeSubscription, statusFilter, tick]); 

  const totalHeight = filteredItems.length * ROW_HEIGHT;
  const viewportHeight = scrollContainerRef.current?.clientHeight || 600;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(filteredItems.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  
  const visibleItems = [];
  for (let i = startIndex; i < endIndex; i++) {
      if (filteredItems[i]) {
          visibleItems.push({ index: i, item: filteredItems[i] });
      }
  }

  // --- HANDLERS ---

  const cycleStatusFilter = () => {
      setStatusFilter(prev => {
          if (prev === 'ALL') return 'BAD';
          if (prev === 'BAD') return 'WAITING';
          if (prev === 'WAITING') return 'GOOD';
          return 'ALL';
      });
  };

  useEffect(() => {
    if (onSyncIds) {
        const allIds = new Set(subscriptions.flatMap(s => s.items.map(i => i.nodeId)));
        onSyncIds(allIds);
    }
  }, [subscriptions, onSyncIds]);

  // FIX: ROBUST SEQUENTIAL HANDLE GENERATOR (UaExpert Style)
  // Generates handles sequentially for a specific subscription.
  const getUniqueHandles = (subId: number, count: number): number[] => {
      const sub = subsRef.current.find(s => s.subscriptionId === subId);
      let maxHandle = 0;
      if (sub) {
          sub.items.forEach(i => {
              const h = Number(i.clientHandle);
              if (!isNaN(h) && h > maxHandle) maxHandle = h;
          });
      }
      const result: number[] = [];
      for (let i = 0; i < count; i++) {
          result.push(++maxHandle);
      }
      return result;
  };

  // Handle Pending Nodes from Drag/Drop
  useEffect(() => {
      if (pendingNodes && pendingNodes.length > 0) {
          let targetSubId = activeSubId;
          if (!targetSubId) {
              if (subscriptions.length > 0) targetSubId = subscriptions[0].subscriptionId;
              else {
                  handleDirectCreate();
                  return; // Cannot add items until sub is created
              }
          }

          // FIX: Generate unique handles for the batch
          const handles = getUniqueHandles(targetSubId, pendingNodes.length);
          
          const hydrated = ensureInternalIds(pendingNodes.map((n, idx) => ({
              ...n,
              clientHandle: handles[idx], // Use unique handle
              timestamp: '-',
              statusCode: 'Waiting', 
              dataType: n.dataType 
          })) as MonitoredItem[]);

          setSubscriptions(prev => {
              if (prev.length === 0) return prev; 
              if (!prev.find(s => s.subscriptionId === targetSubId)) targetSubId = prev[0].subscriptionId;

              const newSubs = prev.map(s => {
                  if (s.subscriptionId === targetSubId) {
                      const existingIds = new Set(s.items.map(i => i.nodeId));
                      const uniqueNew = hydrated.filter(i => !existingIds.has(i.nodeId));
                      return { ...s, items: [...s.items, ...uniqueNew] };
                  }
                  return s;
              });
              if (onSubscriptionsChange) onSubscriptionsChange(newSubs);
              return newSubs;
          });
          
          if (onNodesConsumed) onNodesConsumed();
      }
  }, [pendingNodes, activeSubId]); 

  // -- OPTIMIZED RENDER LOOP WITH DOM UPDATES --
  useEffect(() => {
      if (!isVisible) return;
      
      let rafId: number;
      let isRxActive = false;
      
      const loop = (timestamp: number) => {
          const now = Date.now();
          if (hasPendingUpdatesRef.current) {
              if (timestamp - lastRenderTimeRef.current >= RENDER_INTERVAL) {
                  setTick(t => t + 1);
                  hasPendingUpdatesRef.current = false;
                  lastRenderTimeRef.current = timestamp;
              }
          }
          
          // Direct DOM manipulation to save CPU
          if (now - lastRxTimeRef.current < 1000) {
              if (!isRxActive) {
                  isRxActive = true;
                  if (rxContainerRef.current) rxContainerRef.current.className = "flex items-center gap-2 px-3 py-1 bg-white/50 rounded-full border transition-colors duration-200 border-emerald-400 bg-emerald-100";
                  if (rxDotRef.current) rxDotRef.current.className = "w-3 h-3 rounded-full transition-all duration-200 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]";
                  if (rxTextRef.current) rxTextRef.current.className = "text-[10px] font-bold text-emerald-700";
              }
          } else {
              if (isRxActive) {
                  isRxActive = false;
                  if (rxContainerRef.current) rxContainerRef.current.className = "flex items-center gap-2 px-3 py-1 bg-white/50 rounded-full border transition-colors duration-200 border-emerald-100";
                  if (rxDotRef.current) rxDotRef.current.className = "w-3 h-3 rounded-full transition-all duration-200 bg-slate-300";
                  if (rxTextRef.current) rxTextRef.current.className = "text-[10px] font-bold text-slate-500";
              }
          }
          
          rafId = requestAnimationFrame(loop);
      };
      
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
  }, [isVisible]);

  // -- EXPORT & RECORDING --
  const lastRecordedCountUpdateRef = useRef<number>(0);

  const handleDataChange = useCallback((subId: number, dataItems: MonitoredItem[]) => {
    if (!Array.isArray(dataItems)) return; 
    
    lastRxTimeRef.current = Date.now();

    dataItems.forEach(d => {
        const h = Number(d.clientHandle);
        const internalId = handleMapRef.current.get(`${subId}_${h}`);
        if (internalId) {
            liveDataRef.current.set(internalId, {
                ...d,
                internalId
            });
        }
    });

    hasPendingUpdatesRef.current = true;

    if (isRecording) {
        dataItems.forEach(item => {
            if (item.value !== null && recordedDataRef.current.length < 500000) {
                recordedDataRef.current.push({
                    timestamp: item.timestamp,
                    nodeId: item.nodeId || `handle:${item.clientHandle}`, 
                    value: item.value,
                    quality: item.statusCode
                });
            }
        });
        
        // Auto-stop recording if it hits the massive limit to prevent browser memory crash
        if (recordedDataRef.current.length >= 500000) {
            setIsRecording(false);
            if (addLog) addLog('warn', 'Recording auto-stopped. Built-in 500,000 items limit reached to prevent memory crash.');
        }

        const now = Date.now();
        if (now - lastRecordedCountUpdateRef.current > 500) {
            setRecordedCount(recordedDataRef.current.length);
            lastRecordedCountUpdateRef.current = now;
        }
    }
  }, [isRecording]);

  const onDataChangeRef = useRef<(sid: number, items: MonitoredItem[]) => void>(null);
  
  useEffect(() => {
      onDataChangeRef.current = handleDataChange;
  }, [handleDataChange]);

  const subIdsSignature = subscriptions.map(s => s.subscriptionId).join(',');
  useEffect(() => {
      if (!sessionId) return;
      const currentSessionId = sessionId as string;
      subscriptions.forEach(sub => {
          opcuaService.registerSubscriptionCallback(currentSessionId, sub.subscriptionId, (sid, items) => {
              if (onDataChangeRef.current) {
                  onDataChangeRef.current(sid, items);
              }
          });
      });
  }, [subIdsSignature, sessionId]); 

  useEffect(() => {
     if (!isConnected) {
         if (isRecording) setIsRecording(false);
         const currentSubs = subsRef.current;
         if (currentSubs.some(s => s.status === 'Active')) {
             const resetSubs = currentSubs.map(s => ({
                 ...s,
                 status: 'Paused' as const,
                 serverSubscriptionId: undefined 
             }));
             updateSubsStructurally(resetSubs);
         }
         return; 
     }
     
     if (isConnected && sessionId) {
         const currentSubs = subsRef.current;
         const hasActive = currentSubs.some(s => s.status === 'Active');
         
         if (hasActive) {
             const resetSubs = currentSubs.map(s => ({
                 ...s,
                 status: 'Paused' as const,
                 serverSubscriptionId: undefined 
             }));
             updateSubsStructurally(resetSubs);
         }
     }
  }, [isConnected, sessionId]);

  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
      if (!isConnected) {
          hasAutoStartedRef.current = false;
      }
  }, [isConnected]);

  useEffect(() => {
      if (isConnected && sessionId && autoSubscribeEnabled && !hasAutoStartedRef.current && subscriptions.length > 0) {
          const needsStart = subscriptions.some(s => s.status === 'Paused');
          
          if (needsStart) {
              addLog('info', `Auto-Start: Activating ${subscriptions.length} subscriptions...`);
              toggleAll('START'); 
              hasAutoStartedRef.current = true; 
          }
      }
  }, [isConnected, sessionId, autoSubscribeEnabled, subscriptions]); 

  const handleSidebarClick = (e: React.MouseEvent, subId: number, index: number) => { 
      setActiveSubId(subId); 
      const newS = new Set(selectedSubIds); 
      if (e.ctrlKey || e.metaKey) {
          if (newS.has(subId)) newS.delete(subId); 
          else newS.add(subId);
          setLastClickedSubId(subId);
      } else if (e.shiftKey && lastClickedSubId !== null) {
          const all = subscriptions.map(s => s.subscriptionId);
          const s = Math.min(all.indexOf(lastClickedSubId), index);
          const end = Math.max(all.indexOf(lastClickedSubId), index);
          newS.clear();
          for(let i=s; i<=end; i++) newS.add(all[i]);
      } else {
          newS.clear();
          newS.add(subId);
          setLastClickedSubId(subId);
      }
      setSelectedSubIds(newS); 
  };
  
  const handleConfigConfirm = async (config: any, qty: number) => {
      if (editingSub) {
          const subId = editingSub.subscriptionId;
          const wasActive = editingSub.status === 'Active';
          
          addLog('info', `Updating Subscription View ${editingSub.viewIndex}...`);

          if (wasActive && sessionId) {
              await opcuaService.deleteSubscription(sessionId, subId);
          }

          const updatedSub = { ...editingSub, ...config, status: 'Paused' as const, serverSubscriptionId: undefined };
          const newSubs = subscriptions.map(s => s.subscriptionId === subId ? updatedSub : s);
          updateSubsStructurally(newSubs);

          if (wasActive && sessionId && isConnected) {
              // Trigger toggle logic to handle regeneration
              toggleSubscription(subId, 'Paused'); 
          } else {
              addLog('success', `Subscription View ${updatedSub.viewIndex} parameters updated.`);
          }

          setEditingSub(null);
      } else {
          const maxV=subscriptions.reduce((m,s)=>Math.max(m,s.viewIndex),0); 
          let nV=maxV+1; 
          let nextId = subscriptions.length > 0 ? Math.max(...subscriptions.map(s => s.subscriptionId)) + 1 : 1;

          const newS: Subscription[]=[]; 
          for(let i=0;i<qty;i++){ 
              const sid = nextId++;
              newS.push({
                  viewIndex: nV++, 
                  subscriptionId: sid, 
                  items: [], 
                  status: 'Paused',
                  ...config 
              }); 
          } 
          updateSubsStructurally([...subscriptions,...newS]);
          setActiveSubId(newS[0].subscriptionId); 
          setSelectedSubIds(new Set(newS.map(s=>s.subscriptionId))); 
      }
      setConfigModalOpen(false);
  };

  const handleDirectCreate = () => {
      const maxV = subscriptions.reduce((m,s)=>Math.max(m,s.viewIndex),0); 
      const nV = maxV+1; 
      const nextId = subscriptions.length > 0 ? Math.max(...subscriptions.map(s => s.subscriptionId)) + 1 : 1;
      
      const newSub: Subscription = {
          viewIndex: nV,
          subscriptionId: nextId,
          items: [],
          status: 'Paused',
          publishingInterval: 500, 
          lifetimeCount: 100,
          maxKeepAliveCount: 10,
          maxNotificationsPerPublish: 0,
          priority: 0,
          publishTimeout: 60000,
          samplingInterval: 500,
          queueSize: 10,
          discardOldest: true
      };
      
      updateSubsStructurally([...subscriptions, newSub]);
      setActiveSubId(nextId);
      setSelectedSubIds(new Set([nextId]));
      addLog('success', `Created Subscription View ${nV}.`);
  };

  const openEditModal = (e: React.MouseEvent, sub: Subscription) => {
      e.stopPropagation();
      setEditingSub(sub);
      setConfigModalOpen(true);
  };

  const deleteSubscription = (e: React.MouseEvent | undefined, id: number) => { 
      if(e) e.stopPropagation();
      if(sessionId) {
          addLog('info', `Deleting subscription ${id}...`);
          opcuaService.deleteSubscription(sessionId, id).catch(e => {
              console.warn("Failed to delete sub on server", e);
          }); 
      }
      const newSubs = subscriptions.filter(s=>s.subscriptionId!==id);
      updateSubsStructurally(newSubs);
      if(activeSubId===id) setActiveSubId(newSubs.length > 0 ? newSubs[0].subscriptionId : null); 
      if(selectedSubIds.has(id)){
          const s=new Set(selectedSubIds);
          s.delete(id);
          setSelectedSubIds(s);
      } 
  };

  const toggleSubscription = async (id: number, currentStatus: string) => { 
      if (!sessionId) {
          addLog('warn', 'Not connected to server.');
          return;
      }
      
      const currentSubs = subsRef.current;
      const sub = currentSubs.find(s => s.subscriptionId === id);
      if (!sub) return;

      if (processingSubIds.has(id)) return;
      setProcessingSubIds(prev => new Set(prev).add(id));

      try {
          if(currentStatus === 'Active'){
              if (sessionId) await opcuaService.deleteSubscription(sessionId, id);
              
              setSubscriptions(prev => {
                  const newSubs = prev.map(s => s.subscriptionId === id ? { ...s, status: 'Paused' as const, serverSubscriptionId: undefined } : s);
                  if (onSubscriptionsChange) onSubscriptionsChange(newSubs);
                  return newSubs;
              });
              addLog('info', `Subscription View ${sub.viewIndex} stopped.`);
          } else {
              // --- CORE FIX: REGENERATE HANDLES ON ACTIVATION ---
              // This ensures that handles are strictly sequential (1..N) relative to the current session's counter
              // regardless of how many items were added/deleted while paused.
              let handleCounter = 1;
              const itemsToMonitor = sub.items.map(i => ({
                  ...i,
                  clientHandle: handleCounter++
              }));

              // --- TIMING RISK FIX: Immediate Map Sync ---
              // Manually sync handleMapRef before async calls to prevent race condition 
              // where data arrives before React state update triggers useEffect.
              itemsToMonitor.forEach(i => {
                  if (i.internalId) {
                      handleMapRef.current.set(`${id}_${i.clientHandle}`, i.internalId);
                  }
              });

              // 1. Update State FIRST so handleMapRef gets updated via useEffect
              //    (Although useEffect is async, we trust the next steps take enough time)
              setSubscriptions(prev => prev.map(s => s.subscriptionId === id ? { ...s, items: itemsToMonitor } : s));

              // 2. Register Subscription
              const serverId = await opcuaService.registerSubscription(
                  sessionId, 
                  sub,
                  (sid: number, items: any) => { if (onDataChangeRef.current) onDataChangeRef.current(sid, items); }
              ); 

              // 3. Update State with Server ID
              setSubscriptions(prev => prev.map(s => s.subscriptionId === id ? { ...s, status: 'Active' as const, serverSubscriptionId: serverId } : s));
              
              if (itemsToMonitor.length > 0) {
                  addLog('info', `Subscription View ${sub.viewIndex} created (ID: ${serverId}). Sending Batch Monitor...`);
                  
                  // 4. Send Monitor Request with NEW HANDLES
                  opcuaService.monitorItemsWithSettings(sessionId, id, itemsToMonitor, {
                      samplingInterval: sub.samplingInterval,
                      queueSize: sub.queueSize,
                      discardOldest: sub.discardOldest
                  }).then(results => {
                      setSubscriptions(prev => {
                          const finalSubs = prev.map(s => {
                              if (s.subscriptionId === id) {
                                  const updatedItems = s.items.map(i => {
                                      const res = results.find((r: any) => r.clientHandle === i.clientHandle);
                                      if (res) {
                                          return { 
                                              ...i, 
                                              monitoredItemId: res.monitoredItemId,
                                              statusCode: res.statusCode && res.statusCode !== 'Good' ? res.statusCode : i.statusCode 
                                          };
                                      }
                                      return i;
                                  });
                                  return { ...s, items: updatedItems };
                              }
                              return s;
                          });
                          if (onSubscriptionsChange) onSubscriptionsChange(finalSubs);
                          return finalSubs;
                      });
                      addLog('success', `View ${sub.viewIndex}: Monitored ${results.length} items.`);
                  }).catch(err => {
                      console.error("Monitor failed", err);
                      addLog('error', `Monitor failed: ${err.message}`);
                  });
              } else {
                  addLog('success', `Subscription View ${sub.viewIndex} active (Empty).`);
              }
          } 
      } catch (e: any) {
          addLog('error', `Failed to toggle subscription: ${e.message}`);
          setSubscriptions(prev => prev.map(s => s.subscriptionId === id ? { ...s, status: 'Paused' as const } : s));
      } finally {
          setProcessingSubIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
  };

  const toggleAll = (act: string) => { 
      if (!sessionId) return;
      if(act==='START'&&!isConnected)return; 
      subscriptions.forEach(s=>{ 
          if(act==='STOP' && s.status==='Active') toggleSubscription(s.subscriptionId, 'Active');
          else if(act==='START' && s.status==='Paused') toggleSubscription(s.subscriptionId, 'Paused');
      }); 
  };

  const addItems = useCallback(async (subId: number) => {
      if (!bulkItemList.trim()) return;
      const ids = bulkItemList.split(',').map(s => s.trim()).filter(Boolean);
      
      // FIX: Generate unique handles for manual add using sub-specific counter
      const handles = getUniqueHandles(subId, ids.length);

      const newItems: MonitoredItem[] = ids.map((id, idx) => ({
          clientHandle: handles[idx], // Use Unique Handle
          nodeId: id,
          displayName: id,
          value: null,
          timestamp: '-',
          statusCode: 'Waiting',
          dataType: 'Int32'
      }));
      
      const newHydrated = ensureInternalIds(newItems);

      setSubscriptions(prev => {
          const finalSubs = prev.map(s => {
              if (s.subscriptionId === subId) {
                  return { ...s, items: [...s.items, ...newHydrated] };
              }
              return s;
          });
          return finalSubs;
      });
      
      const sub = subsRef.current.find(s => s.subscriptionId === subId);
      if (sub && sub.status === 'Active' && sessionId) {
          const results = await opcuaService.monitorItemsWithSettings(sessionId, subId, newItems, {
              samplingInterval: sub.samplingInterval,
              queueSize: sub.queueSize,
              discardOldest: sub.discardOldest
          });
          
          setSubscriptions(prev => {
              return prev.map(s => {
                  if (s.subscriptionId === subId) {
                      const updatedItems = s.items.map(i => {
                          const res = results.find((r: any) => r.clientHandle === i.clientHandle);
                          if (res) {
                              return { 
                                  ...i, 
                                  monitoredItemId: res.monitoredItemId,
                                  statusCode: res.statusCode && res.statusCode !== 'Good' ? res.statusCode : i.statusCode
                              };
                          }
                          return i;
                      });
                      return { ...s, items: updatedItems };
                  }
                  return s;
              });
          });
      }
      setBulkItemList('');
  }, [bulkItemList, sessionId]);

  const handleDeleteItem = async (handle: number, internalId: string) => {
      const currentSubs = subsRef.current; 
      const sub = currentSubs.find(s=>s.subscriptionId===activeSubId); 
      if (!sub) return;
      
      const newSubs = currentSubs.map(s => {
          if (s.subscriptionId !== activeSubId) return s;
          return {
              ...s,
              items: s.items.filter(i => (i.internalId || i.nodeId) !== internalId)
          };
      });
      
      updateSubsStructurally(newSubs); 
      
      if(sessionId && sub.status === 'Active') { 
          opcuaService.removeMonitoredItems(sessionId, activeSubId, [handle]).catch(err => {
              console.warn("Failed to remove item from server:", err);
          });
      }
  };

  const handleWriteStart = (item: MonitoredItem) => {
      setEditingItemId(item.internalId || item.nodeId);
      // Fetch fresh value from live cache or fallback to item value
      const liveItem = item.internalId ? liveDataRef.current.get(item.internalId) : null;
      const displayValue = liveItem ? liveItem.value : item.value;
      setWriteVal(String(displayValue !== null ? displayValue : ''));
  };

  const parseInputValue = (valStr: string, dataType: string | undefined) => {
      const trimmed = valStr.trim();
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try { return JSON.parse(trimmed); } catch (e) { }
      }
      // Simple typing
      if (!dataType) return trimmed;
      if (dataType === 'Boolean') return trimmed.toLowerCase() === 'true' || trimmed === '1';
      
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

      if (dataType.includes('Int')) return parseInt(trimmed) || 0;
      if (dataType.includes('Float') || dataType.includes('Double')) return parseFloat(trimmed) || 0.0;
      return trimmed;
  };

  const handleWriteConfirm = async (nodeId: string) => {
      if (!editingItemId) return;
      const sub = subscriptions.find(s => s.subscriptionId === activeSubId);
      const item = sub?.items.find(i => (i.internalId || i.nodeId) === editingItemId);
      
      if (!item) { setEditingItemId(null); return; }
      
      const val = parseInputValue(writeVal, item.dataType);

      if (isConnected && sessionId) {
          try {
              // Fix: Strip dimensions from dataType (e.g. "Int32[5]" -> "Int32")
              const cleanType = item.dataType?.includes('[') ? item.dataType.split('[')[0] : item.dataType;
              await opcuaService.writeNode(sessionId, item.nodeId, val, cleanType as OpcDataType);
              addLog('success', `Wrote value to ${item.nodeId}`);
          } catch (e: any) { 
              addLog('error', `Write failed: ${e.message}`); 
          }
      } else {
          // Offline update logic
          setSubscriptions(prev => prev.map(s => {
              if (s.subscriptionId === activeSubId) {
                  return {
                      ...s,
                      items: s.items.map(i => {
                          if ((i.internalId || i.nodeId) === editingItemId) {
                              return { ...i, value: val, statusCode: 'Good (Offline)' };
                          }
                          return i;
                      })
                  };
              }
              return s;
          }));
      }
      setEditingItemId(null);
  };

  const handleWriteCancel = () => setEditingItemId(null);

  // --- NEW: EDIT PROPERTIES (NodeId / DisplayName) ---
  const handleStartEditProp = useCallback((item: MonitoredItem, field: 'nodeId' | 'displayName') => {
      if (item.internalId) {
          setEditingProp({ id: item.internalId, field });
          setEditPropValue(field === 'nodeId' ? item.nodeId : (item.displayName || ''));
      }
  }, []);

  const handleCommitProp = useCallback(() => {
      if (!editingProp || !activeSubId) return;
      const { id, field } = editingProp;
      const val = editPropValue.trim();
      
      if (val) {
          setSubscriptions(prev => prev.map(s => {
              if (s.subscriptionId === activeSubId) {
                  return {
                      ...s,
                      items: s.items.map(i => {
                          if (i.internalId === id) {
                              return { ...i, [field]: val };
                          }
                          return i;
                      })
                  };
              }
              return s;
          }));
      }
      setEditingProp(null);
  }, [editingProp, editPropValue, activeSubId]);

  const handleCancelProp = useCallback(() => setEditingProp(null), []);

  const executeArrayWrite = useCallback(async (nodeId: string, dataType: string, writes: {indexRange: string, value: any}[]) => {
      if (!isConnected || !sessionId) {
          addLog('error', 'Cannot write array: Session not connected.');
          return;
      }
      
      const nodesPayload = writes.map(w => ({
          nodeId: nodeId,
          // Fix: Strip dimensions from dataType
          dataType: (dataType.includes('[') ? dataType.split('[')[0] : dataType) as OpcDataType,
          indexRange: w.indexRange,
          value: w.value
      }));

      try {
          await opcuaService.writeNodes(sessionId, nodesPayload);
          addLog('success', `Wrote ${writes.length} array elements to ${nodeId}.`);
      } catch (e: any) {
          addLog('error', `Array Write Failed: ${e.message}`);
      }
  }, [isConnected, sessionId]);

  const handleDataTypeChange = useCallback((id: string, newType: OpcDataType) => {
      setSubscriptions(prev => prev.map(s => {
          if (s.subscriptionId === activeSubId) {
              return {
                  ...s,
                  items: s.items.map(i => {
                      if ((i.internalId || i.nodeId) === id) {
                          return { ...i, dataType: newType };
                      }
                      return i;
                  })
              };
          }
          return s;
      }));
      setEditingDataTypeId(null);
  }, [activeSubId]);

  const onStartEditingDataType = (id: string) => setEditingDataTypeId(id);
  const onCancelDataType = () => setEditingDataTypeId(null);
  const setWriteValState = (val: string) => setWriteVal(val);

  const toggleRecording = useCallback(() => { 
      if(isRecording) { 
          setIsRecording(false); 
          addLog('info', `Recording stopped. Captured ${recordedDataRef.current.length} items.`); 
      } else { 
          recordedDataRef.current = []; 
          setRecordedCount(0); 
          setIsRecording(true); 
          addLog('info', 'Recording started...'); 
      } 
  }, [isRecording, addLog]);

  const exportRecording = useCallback(() => {
      if (recordedDataRef.current.length === 0) return;
      const csv = "Timestamp,NodeId,Value,Quality\n" + recordedDataRef.current.map(r => `${r.timestamp},${r.nodeId},${r.value},${r.quality}`).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); 
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `recording_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }, []);

  const handleCopySubs = () => { 
      if(selectedSubIds.size>0) {
          setClipboardSubs(subscriptions.filter(s=>selectedSubIds.has(s.subscriptionId))); 
          addLog('info', 'Copied selected subscriptions.');
      }
  };
  
  const handlePasteSubs = async () => { 
      if(clipboardSubs){
          const maxV=subscriptions.reduce((m,s)=>Math.max(m,s.viewIndex),0); 
          let nV=maxV+1; 
          let nextId = subscriptions.length > 0 ? Math.max(...subscriptions.map(s => s.subscriptionId)) + 1 : 1;

          const newS = clipboardSubs.map(s => ({
              ...s,
              subscriptionId: nextId++,
              viewIndex: nV++,
              status: 'Paused' as const,
              serverSubscriptionId: undefined,
              items: ensureInternalIds(s.items)
          }));
          
          updateSubsStructurally([...subscriptions, ...newS]);
          setActiveSubId(newS[0].subscriptionId);
          setSelectedSubIds(new Set(newS.map(s=>s.subscriptionId)));
          addLog('success', `Pasted ${newS.length} subscriptions.`);
      }
  };

  const handleDeleteSelectedSubs = () => { 
      if(selectedSubIds.size===0) return; 
      
      if (sessionId) {
          selectedSubIds.forEach(id => {
              const sub = subscriptions.find(s => s.subscriptionId === id);
              if (sub && sub.status === 'Active') {
                  opcuaService.deleteSubscription(sessionId, id);
              }
          });
      }

      const newSubs = subscriptions.filter(s => !selectedSubIds.has(s.subscriptionId));
      updateSubsStructurally(newSubs);
      if (newSubs.length > 0) {
          if (!newSubs.find(s => s.subscriptionId === activeSubId)) setActiveSubId(newSubs[0].subscriptionId);
          setSelectedSubIds(new Set([newSubs[0].subscriptionId]));
      } else {
          setActiveSubId(null);
          setSelectedSubIds(new Set());
      }
  };

  const handleDownloadTemplate = () => {
      const csvContent = "NodeId,DisplayName,DataType,Value,StatusCode\nns=2;s=Demo.Tag1,Tag1,Int32,100,Good\nns=2;s=Demo.Tag2,Tag2,Float,23.5,Good";
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'subscription_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportConfig = () => {
      if (!activeSubscription) return;
      const csvRows = ["NodeId,DisplayName,DataType,Value,StatusCode"];
      
      const safeStringify = (val: any) => {
          try {
              return JSON.stringify(val, (key, value) => typeof value === 'bigint' ? value.toString() : value);
          } catch (e) {
              return String(val);
          }
      };

      activeSubscription.items.forEach(i => {
          const liveItem = i.internalId ? liveDataRef.current.get(i.internalId) : null;
          const displayValue = liveItem ? liveItem.value : i.value;
          const displayStatus = liveItem ? liveItem.statusCode : i.statusCode;
          const safeVal = (displayValue !== null && displayValue !== undefined) 
              ? (typeof displayValue === 'object' ? safeStringify(displayValue).replace(/"/g, '""') : String(displayValue))
              : 'null';
          const valField = safeVal.includes(',') ? `"${safeVal}"` : safeVal;
          csvRows.push(`${i.nodeId},${i.displayName || ''},${i.dataType || ''},${valField},${displayStatus || 'Good'}`);
      });
      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `subscription_view_${activeSubscription.viewIndex}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- UPDATED CSV IMPORT LOGIC (Robust) ---
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeSubId) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          
          // Header Detection Logic
          const header = lines[0].toLowerCase().split(',');
          const findIdx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
          
          const idxNodeId = findIdx(['nodeid', 'id']);
          const idxDisplay = findIdx(['displayname', 'name']);
          const idxType = findIdx(['datatype', 'type']);
          const idxValue = findIdx(['value']);
          
          const hasHeader = idxNodeId !== -1;
          const startIndex = hasHeader ? 1 : 0;
          const defaultNodeIdCol = hasHeader ? idxNodeId : 0;

          const newItems: MonitoredItem[] = [];
          
          // PHASE 1: Collect Definitions
          for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i];
              const parts: string[] = [];
              // Simple quote parsing
              let current = '';
              let inQuotes = false;
              for(let j=0; j<line.length; j++) {
                  const char = line[j];
                  if(char === '"') inQuotes = !inQuotes;
                  else if(char === ',' && !inQuotes) { parts.push(current); current = ''; } 
                  else current += char;
              }
              parts.push(current);

              if (parts.length > defaultNodeIdCol) {
                  const nodeId = parts[defaultNodeIdCol]?.trim().replace(/^"|"$/g, '');
                  if (!nodeId) continue;

                  const displayName = idxDisplay !== -1 ? parts[idxDisplay]?.trim().replace(/^"|"$/g, '') : nodeId;
                  const dataType = (idxType !== -1 ? parts[idxType]?.trim().replace(/^"|"$/g, '') : 'Int32') as OpcDataType;
                  
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

                  newItems.push({
                      clientHandle: 0, // Temp placeholder, will be set next
                      nodeId,
                      displayName: displayName || nodeId,
                      dataType: dataType || 'Int32',
                      value: importedValue,
                      timestamp: '-',
                      statusCode: 'Waiting'
                  });
              }
          }
          
          if (newItems.length > 0) {
              // PHASE 2: Generate Unique Handles for the whole batch
              const handles = getUniqueHandles(activeSubId, newItems.length);
              newItems.forEach((item, idx) => {
                  item.clientHandle = handles[idx];
              });
              
              setPendingImport(newItems);
          } else {
              addLog('warn', 'No valid items found in CSV.');
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleImportOverwrite = () => {
      if (!pendingImport) return;
      const hydrated = ensureInternalIds(pendingImport);
      setSubscriptions(prev => prev.map(s => {
          if (s.subscriptionId === activeSubId) {
              return { ...s, items: hydrated };
          }
          return s;
      }));
      addLog('success', `Imported ${hydrated.length} items (Overwrite).`);
      setPendingImport(null);
  };

  const handleImportAppend = () => {
      if (!pendingImport) return;
      const hydrated = ensureInternalIds(pendingImport);
      setSubscriptions(prev => prev.map(s => {
          if (s.subscriptionId === activeSubId) {
              return { ...s, items: [...s.items, ...hydrated] };
          }
          return s;
      }));
      addLog('success', `Imported ${hydrated.length} items (Append).`);
      setPendingImport(null);
  };

  const deleteSelectedItems = async () => { 
      if(!activeSubId||selectedItemIds.size===0)return; 
      
      const currentSubs = subsRef.current; 
      const sub = currentSubs.find(s=>s.subscriptionId===activeSubId); 
      if (!sub) return; 
      
      const count = selectedItemIds.size;
      const itemsToDelete = sub.items.filter(i => selectedItemIds.has(i.internalId || i.nodeId)); 
      const handles = itemsToDelete.map(i => i.clientHandle); 
      
      const newSubs = currentSubs.map(s => {
          if (s.subscriptionId !== activeSubId) return s;
          return {
              ...s,
              items: s.items.filter(i => !selectedItemIds.has(i.internalId || i.nodeId))
          };
      });
      
      setSelectedItemIds(new Set());
      updateSubsStructurally(newSubs); 
      
      addLog('success', `Deleted ${count} items.`);

      if(sessionId && sub.status === 'Active' && handles.length > 0) { 
          opcuaService.removeMonitoredItems(sessionId, activeSubId, handles).catch(err => {
              console.warn("Failed to remove items from server:", err);
          });
      } 
  };

  const handleRowClick = useCallback((e: React.MouseEvent, item: MonitoredItem, index: number) => { 
      e.stopPropagation(); 
      const id=item.internalId || item.nodeId; 
      const newS=new Set(selectedItemIds); 
      
      if(e.shiftKey && lastSelectedItemId){
          const lastIndex = filteredItems.findIndex(i => (i.internalId || i.nodeId) === lastSelectedItemId);
          
          if (lastIndex !== -1) {
               const start = Math.min(lastIndex, index);
               const end = Math.max(lastIndex, index);
               
               if (!e.ctrlKey) newS.clear();
               
               for(let i=start; i<=end; i++) {
                   const it = filteredItems[i];
                   if(it) newS.add(it.internalId || it.nodeId);
               }
          } else {
              if (!e.ctrlKey) newS.clear();
              newS.add(id);
              setLastSelectedItemId(id);
          }
      }else if(e.ctrlKey){
          if(newS.has(id))newS.delete(id);else newS.add(id);
          setLastSelectedItemId(id);
      }else{
          newS.clear();
          newS.add(id);
          setLastSelectedItemId(id);
      }
      setSelectedItemIds(newS); 
  }, [selectedItemIds, lastSelectedItemId, filteredItems]);

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
      // Fix: Ignore events from input fields to prevent conflicts (e.g. Del key inside input)
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      // CTRL+A Support
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          if (filteredItems.length > 0) {
              const allIds = filteredItems.map(i => i.internalId || i.nodeId);
              setSelectedItemIds(new Set(allIds));
              addLog('info', `Selected all ${allIds.length} visible items.`);
          }
      }
      // Fix: Removed Backspace deletion support
      if (e.key === 'Delete') {
          if (selectedItemIds.size > 0) {
              deleteSelectedItems();
          }
      }
  }, [filteredItems, selectedItemIds]);

  const startResizingSidebar = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingSidebar.current = true;
      document.addEventListener('mousemove', resizeSidebar);
      document.addEventListener('mouseup', stopResizingSidebar);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }, []);

  const stopResizingSidebar = useCallback(() => {
      isResizingSidebar.current = false;
      document.removeEventListener('mousemove', resizeSidebar);
      document.removeEventListener('mouseup', stopResizingSidebar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
  }, []);

  const resizeSidebar = useCallback((e: MouseEvent) => {
      if (isResizingSidebar.current) {
          const newWidth = Math.max(150, Math.min(e.clientX - 280, 600)); 
          setSidebarWidth(newWidth);
      }
  }, []);

  const startResizing = useCallback((col: string, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); resizingRef.current = { col, startX: e.clientX, startWidth: (colWidths as any)[col] }; document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, [colWidths]);
  const handleMouseMove = useCallback((e: MouseEvent) => { if (!resizingRef.current) return; const { col, startX, startWidth } = resizingRef.current; const diff = e.clientX - startX; setColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) })); }, []);
  const handleMouseUp = useCallback(() => { resizingRef.current = null; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; }, [handleMouseMove]);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { setScrollTop(e.currentTarget.scrollTop); if (headerRef.current) { headerRef.current.scrollLeft = e.currentTarget.scrollLeft; } };
  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedItemIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnter = (index: number) => { if (draggedItemIndex !== null && draggedItemIndex !== index) { setDragOverItemIndex(index); } };
  const handleDrop = (dropIndex: number) => { if (draggedItemIndex === null || draggedItemIndex === dropIndex || !activeSubId) { setDraggedItemIndex(null); setDragOverItemIndex(null); return; } const newSubs = subscriptions.map(s => { if (s.subscriptionId === activeSubId) { const newItems = [...s.items]; const [moved] = newItems.splice(draggedItemIndex, 1); newItems.splice(dropIndex, 0, moved); return { ...s, items: newItems }; } return s; }); updateSubsStructurally(newSubs); setDraggedItemIndex(null); setDragOverItemIndex(null); };
  
  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-emerald-100 overflow-hidden relative">
      <SubscriptionConfigModal 
          isOpen={configModalOpen} 
          onClose={() => setConfigModalOpen(false)} 
          onConfirm={handleConfigConfirm}
          initialValues={editingSub || undefined}
          isEditing={!!editingSub}
      />
      
      <ImportConfirmModal 
          isOpen={!!pendingImport} 
          nodeCount={pendingImport ? pendingImport.length : 0} 
          onClose={() => setPendingImport(null)} 
          onOverwrite={handleImportOverwrite}
          onAppend={handleImportAppend}
      />

      {/* Top Bar */}
      <div className="px-4 py-3 bg-emerald-50/80 border-b border-emerald-200 flex justify-between items-center flex-shrink-0">
         <div className="flex items-center gap-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600" /><span className="text-emerald-900">{t.sub.title}</span></h2>
            
            <div ref={rxContainerRef} className={`flex items-center gap-2 px-3 py-1 bg-white/50 rounded-full border transition-colors duration-200 border-emerald-100`} title="Data Receive Indicator">
                <div ref={rxDotRef} className={`w-3 h-3 rounded-full transition-all duration-200 bg-slate-300`}></div>
                <span ref={rxTextRef} className={`text-[10px] font-bold text-slate-500`}>RX</span>
            </div>

            <div className="flex items-center gap-1 bg-white rounded-lg border border-emerald-200 shadow-sm h-7 overflow-hidden ml-4">
                <button onClick={handleCopySubs} disabled={selectedSubIds.size===0} className="px-2 h-full hover:bg-emerald-50 text-slate-600 border-r" title="Copy Subscription"><Copy className="w-3.5 h-3.5"/></button>
                <button onClick={handlePasteSubs} disabled={!clipboardSubs} className="px-2 h-full hover:bg-emerald-50 text-slate-600 border-r" title="Paste Subscription"><ClipboardPaste className="w-3.5 h-3.5"/></button>
                <button onClick={handleDeleteSelectedSubs} disabled={selectedSubIds.size===0} className="px-2 h-full hover:bg-red-50 text-red-500" title="Delete Subscription"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
            {selectedSubIds.size > 0 && <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">{selectedSubIds.size} Selected</span>}
         </div>
         <div className="flex items-center gap-2">
             <div className="flex bg-white rounded-lg border border-emerald-200 overflow-hidden shadow-sm">
                 <button onClick={() => toggleAll('START')} disabled={subscriptions.length===0} className="px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 flex items-center gap-1 border-r border-emerald-100 disabled:opacity-50"><Play className="w-4 h-4" /> <span className="text-xs font-bold">{t.sub.actions.startAll}</span></button>
                 <button onClick={() => toggleAll('STOP')} disabled={subscriptions.length===0} className="px-3 py-1.5 hover:bg-amber-50 text-amber-700 flex items-center gap-1 disabled:opacity-50"><Pause className="w-4 h-4" /> <span className="text-xs font-bold">{t.sub.actions.pauseAll}</span></button>
             </div>
         </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
          
          {/* LEFT SIDEBAR */}
          <div style={{ width: sidebarWidth }} className="flex flex-col bg-slate-50 border-r border-slate-200 flex-shrink-0">
              <div className="p-2 border-b border-slate-200 bg-white/50 flex justify-between items-center flex-shrink-0">
                  <span className="text-xs font-bold text-slate-500 uppercase ml-2">Subscriptions</span>
                  <button onClick={handleDirectCreate} className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors shadow-sm" title={t.sub.actions.addViews}>
                      <Plus className="w-4 h-4"/>
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {subscriptions.length === 0 && (
                      <div className="text-center p-4 text-slate-400 text-xs italic">
                          No subscriptions.<br/>Click + to create one.
                      </div>
                  )}
                  {subscriptions.map((sub, idx) => {
                      const isSelected = selectedSubIds.has(sub.subscriptionId);
                      const isActive = activeSubId === sub.subscriptionId;
                      const isProcessing = processingSubIds.has(sub.subscriptionId);
                      const isRunning = sub.status === 'Active';
                      const displayId = sub.serverSubscriptionId ?? sub.subscriptionId;

                      return (
                          <div 
                              key={sub.subscriptionId}
                              onClick={(e) => handleSidebarClick(e, sub.subscriptionId, idx)}
                              className={`group relative rounded-lg border p-3 cursor-pointer transition-all flex flex-col gap-1 ${
                                  isActive 
                                  ? 'bg-emerald-50 border-emerald-500 shadow-md ring-1 ring-emerald-400 z-10' 
                                  : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm'
                              } ${isSelected && !isActive ? 'ring-2 ring-emerald-400 bg-emerald-50/50' : ''}`}
                          >
                              <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                      {isProcessing ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                      ) : (
                                          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-slate-300'}`}></div>
                                      )}
                                      <span className={`font-bold text-sm ${isActive ? 'text-emerald-900' : 'text-slate-700'}`}>{t.sub.view} {sub.viewIndex}</span>
                                  </div>
                                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isActive ? 'bg-white/60 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                      ID:{displayId}
                                  </span>
                              </div>
                              
                              <div className={`grid grid-cols-2 gap-1 text-[10px] mt-1 mb-1 pb-2 border-b ${isActive ? 'border-emerald-200/60 text-emerald-800' : 'border-slate-100 text-slate-500'}`}>
                                  <div>
                                      <span className="opacity-70">{t.sub.settings.publish}:</span> <span className="font-mono font-bold">{sub.publishingInterval}</span>
                                  </div>
                                  <div>
                                      <span className="opacity-70">{t.sub.settings.sample}:</span> <span className="font-mono font-bold">{sub.samplingInterval}</span>
                                  </div>
                              </div>
                              
                              <div className="flex justify-between items-center">
                                  <div className={`flex flex-col gap-0.5 text-[10px] ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                                      <span className="font-bold">{sub.items.length} items</span>
                                  </div>
                                  <div className={`flex items-center gap-1 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                      <button 
                                          onClick={(e) => openEditModal(e, sub)}
                                          className={`p-1 rounded ${isActive ? 'hover:bg-emerald-200 text-emerald-700' : 'hover:bg-slate-100 text-slate-400 hover:text-emerald-600'}`}
                                          title="Settings"
                                      >
                                          <Settings className="w-3 h-3"/>
                                      </button>
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); toggleSubscription(sub.subscriptionId, sub.status); }} 
                                          className={`p-1 rounded transition-colors ${isRunning ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm' : (isActive ? 'hover:bg-emerald-200 text-emerald-700' : 'hover:bg-slate-100 text-slate-400 hover:text-emerald-600')}`}
                                          title={isRunning ? 'Pause' : 'Start'}
                                      >
                                          {isRunning ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}
                                      </button>
                                      <button 
                                          onClick={(e) => deleteSubscription(e, sub.subscriptionId)} 
                                          className={`p-1 rounded ${isActive ? 'hover:bg-red-200 text-red-600' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}
                                          title="Delete"
                                      >
                                          <Trash2 className="w-3 h-3"/>
                                      </button>
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>

          <div onMouseDown={startResizingSidebar} className="w-1 bg-slate-200 hover:bg-emerald-400 cursor-col-resize z-20 transition-colors flex items-center justify-center flex-shrink-0 shadow-sm"><div className="h-4 w-0.5 bg-slate-400 rounded"></div></div>

          {/* RIGHT MAIN CONTENT */}
          <div className="flex-1 flex flex-col min-w-0 bg-white relative">
              
              <div className={`bg-white border-b border-slate-100 flex flex-col z-10 shadow-sm transition-opacity duration-200 flex-shrink-0 ${!activeSubscription ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  <div className="p-3 flex gap-2 items-start bg-slate-50/50">
                        <input className="flex-1 text-xs font-mono border border-slate-300 rounded px-3 py-1.5 h-8 focus:shadow-md focus:border-emerald-400 outline-none" placeholder="Paste Node IDs..." value={bulkItemList} onChange={e => setBulkItemList(e.target.value)} onKeyDown={e => e.key === 'Enter' && activeSubId && addItems(activeSubId)} />
                      <div className="flex gap-2 h-8"><button onClick={() => activeSubId && addItems(activeSubId)} className="px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"><ListPlus className="w-4 h-4" /> {t.sub.actions.addItems}</button></div>
                  </div>
                  
                  <div className="px-3 pb-2 flex justify-between items-center">
                        <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2 duration-200">
                            <h3 className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Eye className="w-3.5 h-3.5"/> {t.sub.liveData} ({items.length})</h3>
                            {selectedItemIds.size > 0 && (<div className="flex items-center gap-2"><span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">{selectedItemIds.size} Selected</span><button onClick={deleteSelectedItems} className="flex items-center gap-1 px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs transition-colors"><Trash2 className="w-3 h-3"/> Delete</button></div>)}
                        </div>
                        
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <div className="flex items-center bg-white border border-rose-100 rounded overflow-hidden shadow-sm h-7 mr-2">
                                 <button onClick={toggleRecording} disabled={!isConnected} className={`flex items-center gap-1 px-3 h-full border-r border-rose-100 transition-colors ${isRecording ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-white hover:bg-rose-50 text-slate-600'}`}>
                                     {isRecording ? <StopCircle className="w-3.5 h-3.5" /> : <Disc className="w-3.5 h-3.5" />}
                                     <span className="text-[10px] font-bold">{isRecording ? t.sub.recording.stop : t.sub.recording.start}</span>
                                 </button>
                                 <button onClick={exportRecording} disabled={recordedCount === 0} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-rose-50 text-slate-600 disabled:opacity-50">
                                     <Download className="w-3.5 h-3.5" />
                                     <span className="text-[10px]">{t.sub.recording.export}</span>
                                 </button>
                                 {recordedCount > 0 && <span className="text-[9px] font-mono px-2 text-rose-500">{recordedCount} {t.sub.recording.count}</span>}
                            </div>

                            <div className="flex items-center bg-white border rounded overflow-hidden shadow-sm h-7"><button onClick={handleDownloadTemplate} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-slate-50 text-slate-600 border-r pointer-events-auto" title="Download Template"><Download className="w-3.5 h-3.5" /> <span className="text-[10px]">{t.sub.actions.template}</span></button><button onClick={handleExportConfig} className="flex items-center gap-1 px-3 h-full bg-white hover:bg-emerald-50 text-emerald-700" title="Export"><Save className="w-3.5 h-3.5" /> <span className="text-[10px]">{t.sub.actions.export}</span></button></div><input type="file" ref={fileInputRef} className="hidden" onChange={handleCsvImport} accept=".csv,.txt" /><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 h-7 bg-white border rounded hover:bg-blue-50 text-blue-600 shadow-sm font-medium" title="Import CSV"><FileSpreadsheet className="w-3.5 h-3.5" /> <span className="text-[10px]">{t.sub.actions.import}</span></button>
                        </div>
                  </div>
              </div>
              
              <div className="flex-1 flex flex-col min-h-0 relative">
                    <div 
                        ref={headerRef}
                        className="flex items-center bg-slate-50 border-b border-slate-200 h-9 flex-shrink-0 shadow-sm z-20 overflow-hidden"
                        style={{ width: '100%' }}
                    >
                        <div style={{ width: colWidths.index }} className={HEADER_CELL_BASE}>#<ResizeHandle onMouseDown={(e) => startResizing('index', e)} /></div>
                        <div style={{ width: colWidths.handle }} className={HEADER_CELL_BASE}>{t.sub.table.handle}<ResizeHandle onMouseDown={(e) => startResizing('handle', e)} /></div>
                        <div style={{ width: colWidths.nodeId }} className={HEADER_CELL_BASE}>{t.sub.table.nodeId}<ResizeHandle onMouseDown={(e) => startResizing('nodeId', e)} /></div>
                        <div style={{ width: colWidths.displayName }} className={HEADER_CELL_BASE}>{t.sub.table.displayName}<ResizeHandle onMouseDown={(e) => startResizing('displayName', e)} /></div>
                        <div style={{ width: colWidths.value }} className={HEADER_CELL_BASE}>{t.sub.table.value}<ResizeHandle onMouseDown={(e) => startResizing('value', e)} /></div>
                        <div style={{ width: colWidths.dataType }} className={HEADER_CELL_BASE}>{t.sub.table.dataType}<ResizeHandle onMouseDown={(e) => startResizing('dataType', e)} /></div>
                        <div style={{ width: colWidths.time }} className={HEADER_CELL_BASE}>{t.sub.table.time}<ResizeHandle onMouseDown={(e) => startResizing('time', e)} /></div>
                        
                        <div style={{ width: colWidths.statusCode }} className={`${HEADER_CELL_BASE} cursor-pointer hover:bg-slate-200 transition-colors`} onClick={cycleStatusFilter} title="Click to filter status">
                            <div className="flex items-center gap-1 w-full justify-between">
                                <span className="truncate">{t.sub.table.statusCode}</span>
                                {statusFilter !== 'ALL' && <Filter className="w-3 h-3 text-blue-600 fill-current" />}
                            </div>
                            <ResizeHandle onMouseDown={(e) => startResizing('statusCode', e)} />
                        </div>

                        <div style={{ width: colWidths.action }} className={HEADER_CELL_BASE}>{t.sub.table.action}<ResizeHandle onMouseDown={(e) => startResizing('action', e)} /></div>
                        <div className="flex-1"></div>
                    </div>

                    <div 
                        ref={scrollContainerRef}
                        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 outline-none"
                        onScroll={handleScroll}
                        tabIndex={0}
                        onKeyDown={handleListKeyDown}
                    >
                        {!activeSubscription ? (
                            <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none flex-col gap-2">
                                <Search className="w-10 h-10 text-slate-200"/>
                                <div className="text-slate-400 italic font-medium">Select a subscription from the list</div>
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
                                <div className="text-slate-400 italic">No Items (Filter: {statusFilter})</div>
                            </div>
                        ) : (
                            <div style={{ height: totalHeight, minWidth: '100%', position: 'relative' }}>
                                {visibleItems.map(({ index, item }) => (
                                    <MonitoredItemRow 
                                        key={item.internalId || index}
                                        top={index * ROW_HEIGHT}
                                        index={index}
                                        item={item}
                                        liveDataRef={liveDataRef}
                                        tick={tick}
                                        colWidths={colWidths}
                                        isSelected={selectedItemIds.has(item.internalId || item.nodeId)}
                                        isEditingValue={editingItemId === (item.internalId || item.nodeId)}
                                        isEditingDataType={editingDataTypeId === (item.internalId || item.nodeId)}
                                        isEditingNodeId={editingProp?.id === (item.internalId || item.nodeId) && editingProp?.field === 'nodeId'}
                                        isEditingDisplayName={editingProp?.id === (item.internalId || item.nodeId) && editingProp?.field === 'displayName'}
                                        writeVal={writeVal}
                                        editPropValue={editPropValue}
                                        isDragging={draggedItemIndex === index}
                                        isDragOver={dragOverItemIndex === index}
                                        isConnected={isConnected}
                                        isSubRunning={activeSubscription?.status === 'Active'} 
                                        onRowClick={handleRowClick}
                                        onWriteStart={handleWriteStart}
                                        onWriteConfirm={handleWriteConfirm}
                                        onWriteCancel={handleWriteCancel}
                                        setWriteVal={setWriteValState}
                                        onStartEditProp={handleStartEditProp}
                                        onCommitProp={handleCommitProp}
                                        onCancelProp={handleCancelProp}
                                        setEditPropValue={setEditPropValue}
                                        onDeleteSingle={handleDeleteItem}
                                        onDragStart={handleDragStart}
                                        onDragEnter={handleDragEnter}
                                        onDrop={handleDrop}
                                        onArrayWrite={(writes) => executeArrayWrite(item.nodeId, item.dataType as string, writes)}
                                        onDataTypeChange={handleDataTypeChange}
                                        onStartEditingDataType={onStartEditingDataType}
                                        onCancelDataType={onCancelDataType}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white border-t border-slate-200 p-2 text-xs text-slate-500 flex justify-between items-center font-mono flex-shrink-0 z-20">
                        <span>Items: {filteredItems.length} {statusFilter !== 'ALL' ? `(Filtered from ${items.length})` : ''}</span>
                        <span>{activeSubscription ? `Monitoring: ${activeSubscription.status}` : 'No Selection'}</span>
                    </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default React.memo(SubscriptionPanel);
