import React, { useState, useMemo, useEffect } from 'react';
import { EipClass1SessionInfo, EipClass1AdapterConnection, EipClass1DatasetItem } from '../../type-definitions/eip-class1';
import { ArrowRightLeft, Link2, Trash2, X, AlertTriangle, Search, Info, HelpCircle, Network, ArrowRight, Zap, RefreshCw, CheckCircle2, ChevronRight, Activity, ArrowDownAZ } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    session: EipClass1SessionInfo;
    onUpdate: (updates: Partial<EipClass1SessionInfo> | ((prev: EipClass1SessionInfo) => Partial<EipClass1SessionInfo>)) => void;
    isConnected: boolean;
}

const DATA_TYPES: Record<string, number> = {
    'BOOL': 1, 'BYTE': 8, 'SINT': 8, 'USINT': 8, 'INT': 16, 'UINT': 16, 'WORD': 16,
    'DINT': 32, 'UDINT': 32, 'DWORD': 32, 'LINT': 64, 'ULINT': 64, 'LWORD': 64,
    'REAL': 32, 'LREAL': 64
};

const parseValue = (data: number[] | undefined, helpString: string, dataType: string): string => {
    if (!data || data.length === 0) return '0';
    const offsetMatch = helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
    if (!offsetMatch) return '0';
    const byteOffset = parseInt(offsetMatch[1]);
    const bitOffset = parseInt(offsetMatch[2]);
    if (byteOffset >= data.length) return '0';
    const baseTypeBits = DATA_TYPES[dataType] || 8;
    const typeSizeBytes = Math.ceil(baseTypeBits / 8);
    const requiredLength = byteOffset + typeSizeBytes;
    const buffer = data.length < requiredLength ? new Uint8Array(requiredLength) : new Uint8Array(data);
    if (data.length < requiredLength) buffer.set(data);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    try {
        switch (dataType) {
            case 'BOOL': return ((buffer[byteOffset] >> bitOffset) & 1) ? '1' : '0';
            case 'SINT': return view.getInt8(byteOffset).toString();
            case 'USINT': case 'BYTE': return view.getUint8(byteOffset).toString();
            case 'INT': return view.getInt16(byteOffset, true).toString();
            case 'UINT': case 'WORD': return view.getUint16(byteOffset, true).toString();
            case 'DINT': return view.getInt32(byteOffset, true).toString();
            case 'UDINT': case 'DWORD': return view.getUint32(byteOffset, true).toString();
            case 'LINT': return view.getBigInt64(byteOffset, true).toString();
            case 'ULINT': case 'LWORD': return view.getBigUint64(byteOffset, true).toString();
            case 'REAL': return view.getFloat32(byteOffset, true).toFixed(4);
            case 'LREAL': return view.getFloat64(byteOffset, true).toFixed(4);
            default: return '0';
        }
    } catch { return 'Error'; }
};

export const EipClass1LoopbackView: React.FC<Props> = ({ session, onUpdate, isConnected }) => {
    const connections = session.adapterConfig.connections || [];
    
    // --- 1. Connection Selection State ---
    const [selectedConnId, setSelectedConnId] = useState<string | null>(
        connections[0]?.id || null
    );

    // Auto select first connection if state is empty or invalid
    useEffect(() => {
        if (connections.length > 0 && (!selectedConnId || !connections.some(c => c.id === selectedConnId))) {
            setSelectedConnId(connections[0].id);
        }
    }, [connections, selectedConnId]);

    const activeConn = useMemo(() => {
        return connections.find(c => c.id === selectedConnId) || null;
    }, [connections, selectedConnId]);

    // List of candidate connections that have input variables
    const connectionsWithInputs = useMemo(() => {
        return connections.filter(c => c.o2tDataset && c.o2tDataset.length > 0);
    }, [connections]);

    // --- 1.1 Source Connection Selector State ---
    const [sourceConnId, setSourceConnId] = useState<string | null>(null);

    // Sync/Auto set sourceConnId when activeConn changes
    useEffect(() => {
        if (activeConn) {
            if (activeConn.o2tDataset && activeConn.o2tDataset.length > 0) {
                setSourceConnId(activeConn.id);
            } else if (connectionsWithInputs.length > 0) {
                setSourceConnId(connectionsWithInputs[0].id);
            } else {
                setSourceConnId(null);
            }
        }
    }, [activeConn, connectionsWithInputs]);

    const sourceConn = useMemo(() => {
        return connections.find(c => c.id === sourceConnId) || null;
    }, [connections, sourceConnId]);

    // --- 2. Variable Lists Search Queries ---
    const [inputSearch, setInputSearch] = useState('');
    const [outputSearch, setOutputSearch] = useState('');

    // --- 3. Selection States ---
    const [checkedInputIds, setCheckedInputIds] = useState<Set<string>>(new Set());
    const [checkedOutputIds, setCheckedOutputIds] = useState<Set<string>>(new Set());

    // Reset selection sets if connection changes
    useEffect(() => {
        setCheckedInputIds(new Set());
        setCheckedOutputIds(new Set());
    }, [selectedConnId]);

    // Reset input selection set if source connection changes
    useEffect(() => {
        setCheckedInputIds(new Set());
    }, [sourceConnId]);

    // --- 4. Dataset Resolving ---
    const inputs = useMemo(() => {
        if (!sourceConn) return [];
        return sourceConn.o2tDataset || [];
    }, [sourceConn]);

    const outputs = useMemo(() => {
        if (!activeConn) return [];
        return activeConn.t2oDataset || [];
    }, [activeConn]);

    // --- 5. Filtering ---
    const filteredInputs = useMemo(() => {
        if (!inputSearch) return inputs;
        const lower = inputSearch.toLowerCase();
        return inputs.filter(i => 
            i.name.toLowerCase().includes(lower) || 
            i.dataType.toLowerCase().includes(lower) || 
            i.helpString.toLowerCase().includes(lower)
        );
    }, [inputs, inputSearch]);

    const filteredOutputs = useMemo(() => {
        if (!outputSearch) return outputs;
        const lower = outputSearch.toLowerCase();
        return outputs.filter(o => 
            o.name.toLowerCase().includes(lower) || 
            o.dataType.toLowerCase().includes(lower) || 
            o.helpString.toLowerCase().includes(lower)
        );
    }, [outputs, outputSearch]);

    const activeMappings = useMemo(() => {
        if (!activeConn) return [];
        return activeConn.loopbackMappings || [];
    }, [activeConn]);

    // --- 6. Helpers / Checks ---
    const selectedInput = useMemo(() => {
        if (checkedInputIds.size !== 1) return null;
        const targetId = Array.from(checkedInputIds)[0];
        return inputs.find(i => i.id === targetId) || null;
    }, [inputs, checkedInputIds]);

    const selectedOutput = useMemo(() => {
        if (checkedOutputIds.size !== 1) return null;
        const targetId = Array.from(checkedOutputIds)[0];
        return outputs.find(o => o.id === targetId) || null;
    }, [outputs, checkedOutputIds]);

    const handleToggleInput = (id: string) => {
        if (activeConn?.bulkLoopback) {
            toast.warning("整包数据回环已开启，单变量绑定功能已被挂起！");
            return;
        }
        setCheckedInputIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleToggleOutput = (id: string) => {
        if (activeConn?.bulkLoopback) {
            toast.warning("整包数据回环已开启，单变量绑定功能已被挂起！");
            return;
        }
        setCheckedOutputIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleToggleSelectAllInputs = () => {
        if (activeConn?.bulkLoopback) return;
        const allChecked = filteredInputs.length > 0 && filteredInputs.every(i => checkedInputIds.has(i.id));
        setCheckedInputIds(prev => {
            const next = new Set(prev);
            if (allChecked) {
                filteredInputs.forEach(i => next.delete(i.id));
            } else {
                filteredInputs.forEach(i => next.add(i.id));
            }
            return next;
        });
    };

    const handleToggleSelectAllOutputs = () => {
        if (activeConn?.bulkLoopback) return;
        const allChecked = filteredOutputs.length > 0 && filteredOutputs.every(o => checkedOutputIds.has(o.id));
        setCheckedOutputIds(prev => {
            const next = new Set(prev);
            if (allChecked) {
                filteredOutputs.forEach(o => next.delete(o.id));
            } else {
                filteredOutputs.forEach(o => next.add(o.id));
            }
            return next;
        });
    };

    // Check manual link compatibility: same datatype and bitLength
    const isLinkCompatible = useMemo(() => {
        if (!selectedInput || !selectedOutput) return false;
        return selectedInput.dataType === selectedOutput.dataType && 
               selectedInput.bitLength === selectedOutput.bitLength;
    }, [selectedInput, selectedOutput]);

    // Bulk Loopback compatibility check
    const isBulkCompatible = useMemo(() => {
        if (!activeConn) return false;
        if (activeConn.connectionType === 'TAG') return false;
        const o2t = activeConn.o2tDataset || [];
        const t2o = activeConn.t2oDataset || [];
        return o2t.length > 0 && 
               o2t.length === t2o.length && 
               o2t[0]?.dataType === t2o[0]?.dataType;
    }, [activeConn]);

    // --- 7. Business Handlers ---
    
    // Toggle bulk loopback
    const handleToggleBulk = () => {
        if (!activeConn) return;
        if (isConnected) {
            toast.warning("在线会话期间禁止更改整包回环状态！");
            return;
        }
        const updatedVal = !activeConn.bulkLoopback;
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: connections.map(c => 
                    c.id === activeConn.id ? { ...c, bulkLoopback: updatedVal } : c
                )
            }
        });
        toast.success(updatedVal ? "成功开启整包数据自动回环！" : "已停用整包回环。");
    };

    // Add manual mapping link
    const handleLinkVariables = () => {
        if (!activeConn || !selectedInput || !selectedOutput || !sourceConn) return;
        if (isConnected) {
            toast.warning("在线会话期间禁止修改变量回环关系！");
            return;
        }

        if (!isLinkCompatible) {
            toast.error("数据类型或长度不一致，无法建立绑定关系！");
            return;
        }

        const currentMappings = activeConn.loopbackMappings || [];
        // Prevent duplicate mapping targets
        const updatedMappings = currentMappings.filter(m => m.targetId !== selectedOutput.id);
        updatedMappings.push({
            sourceConnId: sourceConn.id,
            sourceId: selectedInput.id,
            targetId: selectedOutput.id
        });

        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: connections.map(c => 
                    c.id === activeConn.id ? { ...c, loopbackMappings: updatedMappings } : c
                )
            }
        });

        setCheckedInputIds(new Set());
        setCheckedOutputIds(new Set());
        toast.success(`成功建立映射：[${sourceConn.name}] ${selectedInput.name} ➔ ${selectedOutput.name}`);
    };

    // Auto Map sequentially for compatible types
    const handleAutoMap = () => {
        if (!activeConn || !sourceConn) return;
        if (isConnected) {
            toast.warning("在线会话期间禁止配置自动回环！");
            return;
        }

        // Get subset of selected inputs or all inputs if none checked
        const selectedInputs = checkedInputIds.size > 0 
            ? inputs.filter(i => checkedInputIds.has(i.id))
            : inputs;
            
        // Get subset of selected outputs or all outputs if none checked
        const selectedOutputs = checkedOutputIds.size > 0 
            ? outputs.filter(o => checkedOutputIds.has(o.id))
            : outputs;

        const count = Math.min(selectedInputs.length, selectedOutputs.length);
        if (count === 0) {
            toast.warning("没有可用于配对的变量！");
            return;
        }

        const currentMappings = activeConn.loopbackMappings || [];
        const newMappings = [...currentMappings];
        let mappedCount = 0;

        for (let i = 0; i < count; i++) {
            const input = selectedInputs[i];
            const output = selectedOutputs[i];
            
            // Check compatibility
            if (input.dataType === output.dataType && input.bitLength === output.bitLength) {
                // Overwrite any existing mapping for this target output
                const existingIdx = newMappings.findIndex(m => m.targetId === output.id);
                const mappingObj = {
                    sourceConnId: sourceConn.id,
                    sourceId: input.id,
                    targetId: output.id
                };
                if (existingIdx > -1) {
                    newMappings[existingIdx] = mappingObj;
                } else {
                    newMappings.push(mappingObj);
                }
                mappedCount++;
            }
        }

        if (mappedCount === 0) {
            toast.info("未能根据顺序找到任何兼容同数据类型和长度的变量对！");
            return;
        }

        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: connections.map(c => 
                    c.id === activeConn.id ? { ...c, loopbackMappings: newMappings } : c
                )
            }
        });

        // Automatically clear checkboxes upon successful mapping
        setCheckedInputIds(new Set());
        setCheckedOutputIds(new Set());
        
        toast.success(`顺序自动绑定成功：已建立 ${mappedCount} 个匹配关系！`);
    };

    // Remove single mapping
    const handleRemoveMapping = (targetId: string) => {
        if (!activeConn) return;
        if (isConnected) {
            toast.warning("在线会话期间禁止修改变量回环关系！");
            return;
        }

        const currentMappings = activeConn.loopbackMappings || [];
        const updatedMappings = currentMappings.filter(m => m.targetId !== targetId);

        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: connections.map(c => 
                    c.id === activeConn.id ? { ...c, loopbackMappings: updatedMappings } : c
                )
            }
        });
        toast.info("已解除该变量的数据回环映射。");
    };

    // Clear all mappings
    const handleClearAllMappings = () => {
        if (!activeConn) return;
        if (isConnected) {
            toast.warning("在线会话期间禁止修改变量回环关系！");
            return;
        }

        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: connections.map(c => 
                    c.id === activeConn.id ? { ...c, loopbackMappings: [] } : c
                )
            }
        });
        toast.info("已清空当前连接的所有单变量回环绑定关系。");
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-100/50 gap-4">
            
            {/* --- TOP: Control Bar & Bulk Loopback Settings --- */}
            <div className="flex flex-col md:flex-row gap-4 shrink-0">
                
                {/* 1. Connection Selector Dropdown Card */}
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Network className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">连接选择 / Connection</span>
                            {connections.length === 0 ? (
                                <span className="text-sm font-bold text-slate-400 italic">当前无可用的适配器连接</span>
                            ) : (
                                <div className="flex items-center gap-2 mt-0.5">
                                    <select
                                        value={selectedConnId || ''}
                                        onChange={e => setSelectedConnId(e.target.value)}
                                        className="text-sm font-black text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 font-sans cursor-pointer"
                                    >
                                        {connections.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.connectionType === 'TAG' ? '标签' : `OT/TO: ${c.o2tSize}B/${c.t2oSize}B`})</option>
                                        ))}
                                    </select>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${activeConn?.status === 'Connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                        <span className={`w-1 h-1 rounded-full ${activeConn?.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                        {activeConn?.status === 'Connected' ? '在线' : '离线'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Bulk Loopback Control Card (Premium Gradient UI) */}
                <div className="flex-[2] bg-white rounded-2xl border border-slate-200 p-4 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    {/* Background subtle mesh pattern */}
                    <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-50/40 to-transparent pointer-events-none" />
                    
                    <div className="flex items-start gap-3 relative z-10">
                        <div className={`p-2.5 rounded-xl ${activeConn?.bulkLoopback ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>
                            <RefreshCw className={`w-5 h-5 ${activeConn?.bulkLoopback && isConnected ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">连接整包回环 / Whole Connection Loopback</span>
                                {activeConn?.bulkLoopback && (
                                    <span className="bg-indigo-100 text-indigo-700 font-extrabold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">Running</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-1 max-w-xl">
                                开启后，输入字节序列 (O-&gt;T) 会在底层以极速 **1微秒内** 整包克隆复制到输出缓冲区发回 PLC。在此模式下，下方的单变量映射被自动挂起。
                            </p>
                            
                            {/* Compatibility advice */}
                            {activeConn && (
                                <div className="text-[10.5px] font-bold mt-2">
                                    {activeConn.connectionType === 'TAG' ? (
                                        <span className="text-amber-500 flex items-center gap-1">• 标签型连接 (Tag Connection) 不支持物理级整包字节回环，请在下方映射。</span>
                                    ) : !isBulkCompatible ? (
                                        <span className="text-amber-500 flex items-center gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5 inline shrink-0" />
                                            整包回环要求输入与输出变量数量及对应基础数据类型一致 (当前输入: {inputs.length}项, 输出: {outputs.length}项)。
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 inline shrink-0" /> 
                                            输入与输出大小对称 ({activeConn.o2tSize} 字节) 且结构完全匹配，整包回环已完全就绪！
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 relative z-10 flex items-center">
                        <button
                            onClick={handleToggleBulk}
                            disabled={!activeConn || activeConn.connectionType === 'TAG' || !isBulkCompatible}
                            className={`w-14 h-7 rounded-full relative transition-colors shadow-inner flex items-center cursor-pointer ${
                                activeConn?.bulkLoopback ? 'bg-indigo-600' : 'bg-slate-200'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            title="切换整包回环状态"
                        >
                            <span className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all shadow ${
                                activeConn?.bulkLoopback ? 'left-8' : 'left-1'
                            }`} />
                        </button>
                    </div>
                </div>

            </div>

            {/* --- BOTTOM: 3-Column Split Visual Manager --- */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 gap-4">
                
                {/* 1. LEFT COLUMN: Inputs Panel (O->T, Read Sources) */}
                <div className="flex-[1.2] bg-white rounded-2xl border border-slate-200 flex flex-col min-h-0 shadow-sm relative">
                    <div className="px-4 py-2 border-b border-slate-200/80 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0 flex-wrap gap-2">
                        <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            输入变量列表 / Inputs (O➔T)
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">数据源连接:</span>
                            <select
                                value={sourceConnId || ''}
                                onChange={e => setSourceConnId(e.target.value)}
                                className="text-[11px] font-bold text-indigo-600 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none font-sans cursor-pointer focus:ring-1 focus:ring-indigo-500"
                            >
                                {connectionsWithInputs.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                                {connectionsWithInputs.length === 0 && (
                                    <option value="">(无可用的输入源)</option>
                                )}
                            </select>
                            <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px] font-bold font-mono">
                                {filteredInputs.length}
                            </span>
                        </div>
                    </div>

                    <div className="p-2 border-b border-slate-100 bg-white shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                                className="w-full pl-8 pr-2 py-1 text-xs border border-slate-200 hover:border-slate-300 focus:border-indigo-400 rounded-lg outline-none font-medium transition-all"
                                placeholder="搜索输入变量名称、类型或偏移..."
                                value={inputSearch}
                                onChange={e => setInputSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table Body */}
                    <div className="flex-1 overflow-y-auto p-1 space-y-0.5 select-none">
                        {inputs.length === 0 ? (
                            <div className="text-center p-8 text-xs text-slate-400 italic">当前连接无输入变量配置</div>
                        ) : filteredInputs.length === 0 ? (
                            <div className="text-center p-8 text-xs text-slate-400 italic">没有匹配的输入变量</div>
                        ) : (
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-1.5 w-8 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredInputs.length > 0 && filteredInputs.every(i => checkedInputIds.has(i.id))}
                                                onChange={handleToggleSelectAllInputs}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                disabled={activeConn?.bulkLoopback || filteredInputs.length === 0}
                                            />
                                        </th>
                                        <th className="px-2.5 py-1.5">名称</th>
                                        <th className="px-2 py-1.5">偏移</th>
                                        <th className="px-2 py-1.5">类型</th>
                                        <th className="px-2.5 py-1.5 text-right">当前值</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredInputs.map(item => {
                                        const isChecked = checkedInputIds.has(item.id);
                                        const val = parseValue(sourceConn?.o2tData, item.helpString, item.dataType);
                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => handleToggleInput(item.id)}
                                                className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                                                    isChecked ? 'bg-blue-50/60 font-bold border-l-2 border-blue-500 shadow-sm' : ''
                                                } ${activeConn?.bulkLoopback ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <td className="px-2 py-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleInput(item.id)}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        disabled={activeConn?.bulkLoopback}
                                                    />
                                                </td>
                                                <td className="px-2.5 py-2 font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>{item.name}</td>
                                                <td className="px-2 py-2 font-mono text-slate-400 text-[10px]">{item.helpString.replace('Offset:', '').trim()}</td>
                                                <td className="px-2 py-2 font-mono text-slate-500 text-[10.5px]">{item.dataType}</td>
                                                <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800">{val}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* 2. CENTER ACTION ISLAND: Bridge Controller */}
                <div className="shrink-0 flex flex-row md:flex-col justify-center items-center gap-4 p-3 bg-slate-50/50 rounded-2xl border border-slate-200/80 shadow-inner">
                    
                    {/* Compatibility Tip Box */}
                    {selectedInput && selectedOutput && (
                        <div className={`p-2 rounded-xl text-[10px] font-bold text-center flex flex-col items-center gap-1 w-24 shadow-sm border ${
                            isLinkCompatible 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 animate-fadeIn' 
                                : 'bg-red-50 text-red-700 border-red-100 animate-fadeIn'
                        }`}>
                            <Info className="w-3.5 h-3.5" />
                            <span>
                                {isLinkCompatible ? '类型完美匹配' : '类型/长度不符'}
                            </span>
                        </div>
                    )}

                    {/* Manual Link */}
                    <button
                        onClick={handleLinkVariables}
                        disabled={!selectedInput || !selectedOutput || !isLinkCompatible || activeConn?.bulkLoopback}
                        className={`p-3 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1 group`}
                        title={
                            !isLinkCompatible && selectedInput && selectedOutput
                                ? "数据类型不一致或长度不匹配，无法建立绑定关系"
                                : "建立回环映射绑定"
                        }
                    >
                        <Link2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] font-bold font-sans uppercase shrink-0">建立绑定</span>
                    </button>

                    {/* Auto Map */}
                    <button
                        onClick={handleAutoMap}
                        disabled={inputs.length === 0 || outputs.length === 0 || activeConn?.bulkLoopback}
                        className="p-3 bg-white border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1 group"
                        title="按列表的变量物理顺序进行同类型自动映射对齐绑定"
                    >
                        <ArrowRightLeft className="w-5 h-5 group-hover:scale-110 transition-transform text-emerald-500" />
                        <span className="text-[9px] font-bold font-sans uppercase shrink-0">顺序对齐</span>
                    </button>
                </div>

                {/* 3. MIDDLE COLUMN: Outputs Panel (T->O, Write Targets) */}
                <div className="flex-[1.2] bg-white rounded-2xl border border-slate-200 flex flex-col min-h-0 shadow-sm relative">
                    <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0">
                        <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            输出变量列表 / Outputs (T➔O)
                        </h3>
                        <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px] font-bold font-mono">
                            {filteredOutputs.length} / {outputs.length}
                        </span>
                    </div>

                    <div className="p-2 border-b border-slate-100 bg-white shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                                className="w-full pl-8 pr-2 py-1 text-xs border border-slate-200 hover:border-slate-300 focus:border-indigo-400 rounded-lg outline-none font-medium transition-all"
                                placeholder="搜索输出变量名称、类型或偏移..."
                                value={outputSearch}
                                onChange={e => setOutputSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-1 space-y-0.5 select-none">
                        {outputs.length === 0 ? (
                            <div className="text-center p-8 text-xs text-slate-400 italic">当前连接无输出变量配置</div>
                        ) : filteredOutputs.length === 0 ? (
                            <div className="text-center p-8 text-xs text-slate-400 italic">没有匹配的输出变量</div>
                        ) : (
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-1.5 w-8 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredOutputs.length > 0 && filteredOutputs.every(o => checkedOutputIds.has(o.id))}
                                                onChange={handleToggleSelectAllOutputs}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                disabled={activeConn?.bulkLoopback || filteredOutputs.length === 0}
                                            />
                                        </th>
                                        <th className="px-2.5 py-1.5">名称</th>
                                        <th className="px-2 py-1.5">偏移</th>
                                        <th className="px-2 py-1.5">类型</th>
                                        <th className="px-2.5 py-1.5 text-right">当前值</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredOutputs.map(item => {
                                        const isChecked = checkedOutputIds.has(item.id);
                                        const val = parseValue(activeConn?.t2oData, item.helpString, item.dataType);
                                        const isAlreadyMapped = activeMappings.some(m => m.targetId === item.id);
                                        const mappedSourceId = activeMappings.find(m => m.targetId === item.id)?.sourceId;
                                        const mappedSourceConnId = activeMappings.find(m => m.targetId === item.id)?.sourceConnId;
                                        const mappedSourceConn = connections.find(c => c.id === mappedSourceConnId) || activeConn;
                                        const mappedSourceName = (mappedSourceConn.o2tDataset || []).find(i => i.id === mappedSourceId)?.name || '未知';

                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => handleToggleOutput(item.id)}
                                                className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                                                    isChecked ? 'bg-emerald-50/60 font-bold border-l-2 border-emerald-500 shadow-sm' : ''
                                                } ${activeConn?.bulkLoopback ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <td className="px-2 py-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleOutput(item.id)}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        disabled={activeConn?.bulkLoopback}
                                                    />
                                                </td>
                                                <td className="px-2.5 py-2 font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="truncate">{item.name}</span>
                                                        {isAlreadyMapped && !activeConn?.bulkLoopback && (
                                                            <span className="px-1 text-[8.5px] rounded bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold flex items-center gap-0.5 shrink-0" title={`已绑定数据回环自: ${mappedSourceConn.name} - ${mappedSourceName}`}>
                                                                🔄 自:{mappedSourceConn.name}:{mappedSourceName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2 font-mono text-slate-400 text-[10px]">{item.helpString.replace('Offset:', '').trim()}</td>
                                                <td className="px-2 py-2 font-mono text-slate-500 text-[10.5px]">{item.dataType}</td>
                                                <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800">{val}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* 4. RIGHT COLUMN: Mappings rule List (Mapped Tasks) */}
                <div className="flex-[1.5] bg-white rounded-2xl border border-slate-200 flex flex-col min-h-0 shadow-sm relative">
                    <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0">
                        <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Activity className="w-4 h-4 text-indigo-500" />
                            活跃回环任务清单 / Active Loopbacks
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-[10px] font-bold font-mono">
                                {activeMappings.length} 规则
                            </span>
                            {activeMappings.length > 0 && (
                                <button
                                    onClick={handleClearAllMappings}
                                    disabled={isConnected || activeConn?.bulkLoopback}
                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded transition-colors disabled:opacity-30"
                                    title="清空当前所有回环关系"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 select-none">
                        
                        {/* If bulkLoopback is ON */}
                        {activeConn?.bulkLoopback && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 opacity-80 border-2 border-dashed border-indigo-100 rounded-xl p-4 bg-indigo-50/10">
                                <RefreshCw className="w-12 h-12 stroke-1 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
                                <h4 className="font-bold text-slate-700 text-xs mt-1">整包数据回环正在运行中</h4>
                                <p className="text-[10px] text-center max-w-[200px]">
                                    物理级高性能内存直接同步复制，所有输入变量已与输出变量整包打通。
                                </p>
                            </div>
                        )}

                        {/* Mappings empty */}
                        {!activeConn?.bulkLoopback && activeMappings.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 opacity-60 py-8">
                                <ArrowRightLeft className="w-12 h-12 stroke-1 text-slate-300" />
                                <p className="text-xs italic">当前暂无回环映射规则</p>
                                <p className="text-[10px]">请在左边选择输入与输出，并点击【建立绑定】</p>
                            </div>
                        )}

                        {/* Mappings rules list */}
                        {!activeConn?.bulkLoopback && activeMappings.map((task, index) => {
                            const mappingSrcConn = connections.find(c => c.id === (task.sourceConnId || activeConn.id)) || activeConn;
                            const srcItem = (mappingSrcConn.o2tDataset || []).find(i => i.id === task.sourceId);
                            const tgtItem = outputs.find(o => o.id === task.targetId);

                            if (!srcItem || !tgtItem) return null;

                            const liveSrcVal = parseValue(mappingSrcConn.o2tData, srcItem.helpString, srcItem.dataType);
                            const liveTgtVal = parseValue(activeConn?.t2oData, tgtItem.helpString, tgtItem.dataType);

                            return (
                                <div
                                    key={task.targetId}
                                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group relative shadow-sm"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                                            <span className="bg-slate-200 text-slate-600 px-1 rounded text-[9px] font-mono shrink-0">
                                                {index + 1}
                                            </span>
                                            <span className="truncate max-w-[90px] text-slate-500 font-medium">{mappingSrcConn.name}:</span>
                                            <span className="truncate max-w-[80px]" title={srcItem.name}>{srcItem.name}</span>
                                            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                                            <span className="truncate max-w-[80px]" title={tgtItem.name}>{tgtItem.name}</span>
                                        </div>
                                        
                                        {/* Value display */}
                                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500 font-mono">
                                            <span className="px-1 rounded bg-slate-100 border text-[9px]">
                                                {srcItem.dataType}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                当前值:
                                                <span className="font-bold text-slate-700">{liveSrcVal}</span>
                                                <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                                                <span className="font-bold text-slate-800 bg-emerald-50 text-emerald-700 px-1 rounded border border-emerald-100">
                                                    {liveTgtVal}
                                                </span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action button */}
                                    <div className="flex items-center shrink-0">
                                        {isConnected ? (
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" title="数据回环活跃中 (Live Syncing)" />
                                        ) : (
                                            <button
                                                onClick={() => handleRemoveMapping(task.targetId)}
                                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                                                title="解除该规则"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>

        </div>
    );
};
