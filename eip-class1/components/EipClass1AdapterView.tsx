import React, { useState, useEffect } from 'react';
import { EipClass1SessionInfo, EipClass1AdapterConnection, EipClass1DatasetItem } from '../../type-definitions/eip-class1';
import { Plus, Trash2, Download, Settings, Activity, Server, Radio, Info, Network, ArrowRightLeft } from 'lucide-react';
import { generateEDS } from '../services/edsService';
import { toast } from 'sonner';
import { EipClass1IOMappingView } from './EipClass1IOMappingView';
import { EipClass1LoopbackView } from './EipClass1LoopbackView';

interface Props {
    session: EipClass1SessionInfo;
    onUpdate: (updates: Partial<EipClass1SessionInfo> | ((prev: EipClass1SessionInfo) => Partial<EipClass1SessionInfo>)) => void;
    isConnected: boolean;
    stats?: Record<string, any>;
}

const formatConnectionPath = (o2t: number, t2o: number): string => {
    const o2tHex = o2t.toString(16).toUpperCase().padStart(2, '0');
    const t2oHex = t2o.toString(16).toUpperCase().padStart(2, '0');
    return `20 04 2C ${o2tHex} 2C ${t2oHex}`;
};

const DATA_TYPES: Record<string, number> = {
    'BOOL': 1, 'BYTE': 8, 'SINT': 8, 'USINT': 8, 'INT': 16, 'UINT': 16, 'WORD': 16,
    'DINT': 32, 'UDINT': 32, 'DWORD': 32, 'LINT': 64, 'ULINT': 64, 'LWORD': 64,
    'REAL': 32, 'LREAL': 64
};

const adjustDatasetToSize = (
    currentDataset: EipClass1DatasetItem[] | undefined,
    newSize: number,
    direction: 'INPUT' | 'OUTPUT',
    connName: string
): EipClass1DatasetItem[] => {
    if (newSize === 0) return [];
    const dataset = [...(currentDataset || [])];
    const prefix = direction === 'INPUT' ? 'InVal' : 'OutVal';
    
    // Get base data type from the first item if available, default to 'INT'
    const baseType = dataset[0]?.dataType || 'INT';
    const bitLength = DATA_TYPES[baseType] || 16;
    const byteSize = Math.ceil(bitLength / 8);

    // 1. Filter out variables that go beyond the new size
    const filteredDataset = dataset.filter(item => {
        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B/);
        if (offsetMatch) {
            const off = parseInt(offsetMatch[1]);
            const len = Math.ceil(item.bitLength / 8);
            return off + len <= newSize;
        }
        return false;
    });

    // 2. Determine the next byte offset
    let currentEnd = 0;
    filteredDataset.forEach(item => {
        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B/);
        if (offsetMatch) {
            const off = parseInt(offsetMatch[1]);
            const len = Math.ceil(item.bitLength / 8);
            if (off + len > currentEnd) {
                currentEnd = off + len;
            }
        }
    });

    // 3. Fill the remaining gap to newSize using the homogeneous baseType
    let offset = currentEnd;
    
    // Align offset to baseType boundary to keep strict alignment
    if (offset % byteSize !== 0) {
        offset = Math.ceil(offset / byteSize) * byteSize;
    }
    
    let varCounter = filteredDataset.length + 1;
    const addedItems: EipClass1DatasetItem[] = [];

    while (offset < newSize) {
        const remaining = newSize - offset;
        let itemType = baseType;
        let itemBits = bitLength;

        // Fallback only if the remaining space is smaller than our base data type size
        if (remaining < byteSize) {
            if (remaining === 1) {
                itemType = 'SINT';
                itemBits = 8;
            } else if (remaining === 2) {
                itemType = 'INT';
                itemBits = 16;
            } else if (remaining === 4) {
                itemType = 'DINT';
                itemBits = 32;
            } else {
                itemType = 'SINT';
                itemBits = 8;
            }
        }

        addedItems.push({
            id: Math.random().toString(36).substr(2, 9),
            name: `${prefix}_${varCounter++}`,
            dataType: itemType,
            bitLength: itemBits,
            helpString: `Offset: ${offset}B, 0b`
        });

        offset += Math.ceil(itemBits / 8);
    }

    return [...filteredDataset, ...addedItems];
};

export const EipClass1AdapterView: React.FC<Props> = ({ session, onUpdate, isConnected, stats = {} }) => {
    const [selectedConnId, setSelectedConnId] = useState<string | null>(
        session.adapterConfig.connections[0]?.id || null
    );
    const [selectedBatchConnIds, setSelectedBatchConnIds] = useState<Set<string>>(new Set());
    const [batchAddCount, setBatchAddCount] = useState<number>(1);
    const [activeSubTab, setActiveSubTab] = useState<'config' | 'io_mapping' | 'loopback'>('config');



    const handleAddConnection = (type: 'IO' | 'TAG' = 'IO') => {
        const currentConns = [...session.adapterConfig.connections];
        const newConns: EipClass1AdapterConnection[] = [];
        for (let i = 0; i < batchAddCount; i++) {
            const connCount = currentConns.length + i;
            const defaultO2T = 100 + connCount * 2;
            const defaultT2O = 101 + connCount * 2;
            
            const defaultO2TSize = type === 'TAG' ? 0 : 100;
            const defaultT2OSize = type === 'TAG' ? 4 : 100;
            
            const initialO2TDataset = adjustDatasetToSize([], defaultO2TSize, 'INPUT', `Connection ${connCount + 1}`);
            const initialT2ODataset = adjustDatasetToSize([], defaultT2OSize, 'OUTPUT', `Connection ${connCount + 1}`);

            newConns.push({
                id: Math.random().toString(36).substr(2, 9),
                name: `${type === 'TAG' ? '标签连接' : 'Connection'} ${connCount + 1}`,
                rpi: 50,
                o2tSize: defaultO2TSize,
                t2oSize: defaultT2OSize,
                o2tInstance: type === 'TAG' ? 0 : defaultO2T,
                t2oInstance: type === 'TAG' ? 0 : defaultT2O,
                connectionPath: type === 'TAG' ? `tag${connCount + 1}` : formatConnectionPath(defaultO2T, defaultT2O),
                status: 'Disconnected',
                o2tData: new Array(defaultO2TSize).fill(0),
                t2oData: new Array(defaultT2OSize).fill(0),
                o2tDataset: initialO2TDataset,
                t2oDataset: initialT2ODataset,
                connectionType: type
            });
        }
        
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: [...currentConns, ...newConns]
            }
        });
        if (newConns.length > 0) setSelectedConnId(newConns[0].id);
        toast.success(`成功批量创建生产${type === 'TAG' ? '标签' : 'I/O'}连接: ${batchAddCount} 个`);
    };

    const handleUpdateConnection = (id: string, updates: Partial<EipClass1AdapterConnection>) => {
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: session.adapterConfig.connections.map(c => c.id === id ? { ...c, ...updates } : c)
            }
        });
    };

    const handleUpdateSize = (id: string, direction: 'INPUT' | 'OUTPUT', newSize: number) => {
        if (newSize < 0) newSize = 0;
        const conn = session.adapterConfig.connections.find(c => c.id === id);
        if (!conn) return;

        const sizeKey = direction === 'INPUT' ? 'o2tSize' : 't2oSize';
        const dataKey = direction === 'INPUT' ? 'o2tData' : 't2oData';
        const datasetKey = direction === 'INPUT' ? 'o2tDataset' : 't2oDataset';

        const oldData = conn[dataKey] || [];
        const newData = new Array(newSize).fill(0);
        for (let i = 0; i < Math.min(oldData.length, newSize); i++) {
            newData[i] = oldData[i];
        }

        const newDataset = adjustDatasetToSize(conn[datasetKey], newSize, direction, conn.name);

        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: session.adapterConfig.connections.map(c => 
                    c.id === id ? {
                        ...c,
                        [sizeKey]: newSize,
                        [dataKey]: newData,
                        [datasetKey]: newDataset
                    } : c
                )
            }
        });
        toast.info(`已更新连接的字节大小并自动调整变量绑定占位符！`);
    };

    const handleRowClick = (e: React.MouseEvent, connId: string) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        
        if (e.shiftKey && selectedConnId) {
            const allIds = session.adapterConfig.connections.map(c => c.id);
            const startIdx = allIds.indexOf(selectedConnId);
            const endIdx = allIds.indexOf(connId);
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const newSelected = new Set(selectedBatchConnIds);
                for (let i = min; i <= max; i++) {
                    newSelected.add(allIds[i]);
                }
                setSelectedBatchConnIds(newSelected);
            }
        } else if (e.ctrlKey || e.metaKey) {
            const newSelected = new Set(selectedBatchConnIds);
            if (newSelected.has(connId)) newSelected.delete(connId);
            else newSelected.add(connId);
            setSelectedBatchConnIds(newSelected);
            setSelectedConnId(connId);
        } else {
            setSelectedBatchConnIds(new Set([connId]));
            setSelectedConnId(connId);
        }
    };


    const handleBatchDelete = () => {
        if (selectedBatchConnIds.size === 0) return;
        const newConns = session.adapterConfig.connections.filter(c => !selectedBatchConnIds.has(c.id));
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: newConns
            }
        });
        setSelectedBatchConnIds(new Set());
        if (selectedConnId && selectedBatchConnIds.has(selectedConnId)) {
            setSelectedConnId(newConns[0]?.id || null);
        }
        toast.info(`批量删除连接: 共 ${selectedBatchConnIds.size} 个`);
    };

    const handleExportEDS = () => {
        try {
            const edsContent = generateEDS(session.adapterConfig);
            const blob = new Blob([edsContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${session.adapterConfig.productName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'adapter'}.eds`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("EDS 电子数据描述文件导出成功，可无缝导入 RSLogix 5000 / Studio 5000");
        } catch (e) {
            console.error(e);
            toast.error("导出 EDS 失败");
        }
    };

    const selectedConn = session.adapterConfig.connections.find(c => c.id === selectedConnId);

    return (
        <div className={`flex-1 min-h-0 ${['io_mapping', 'loopback'].includes(activeSubTab) ? 'overflow-hidden h-full' : 'overflow-y-auto'} p-6 bg-slate-100 flex flex-col`}>
            <div className={`max-w-7xl w-full mx-auto ${['io_mapping', 'loopback'].includes(activeSubTab) ? 'flex-1 h-full flex flex-col overflow-hidden gap-4' : 'space-y-6'}`}>
                
                {/* Internal sub-tabs switcher (从站界面内部选项卡) */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex bg-slate-200/60 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveSubTab('config')}
                            className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                activeSubTab === 'config' 
                                    ? 'bg-white text-indigo-600 shadow-md font-extrabold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/30'
                            }`}
                        >
                            <Settings className="w-3.5 h-3.5" />
                            连接配置 (Connection Configuration)
                        </button>
                        <button
                            onClick={() => setActiveSubTab('io_mapping')}
                            className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                activeSubTab === 'io_mapping' 
                                    ? 'bg-white text-indigo-600 shadow-md font-extrabold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/30'
                            }`}
                        >
                            <Network className="w-3.5 h-3.5" />
                            I/O 变量映射 (I/O Variable Mapping)
                        </button>
                        <button
                            onClick={() => setActiveSubTab('loopback')}
                            className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                activeSubTab === 'loopback' 
                                    ? 'bg-white text-indigo-600 shadow-md font-extrabold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/30'
                            }`}
                        >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            数据回环 (Data Loopback)
                        </button>
                    </div>
                </div>

                {activeSubTab === 'io_mapping' ? (
                    <EipClass1IOMappingView 
                        session={session} 
                        onUpdate={onUpdate} 
                        isConnected={isConnected} 
                    />
                ) : activeSubTab === 'loopback' ? (
                    <EipClass1LoopbackView
                        session={session}
                        onUpdate={onUpdate}
                        isConnected={isConnected}
                    />
                ) : (
                    <>
                        {/* 1. Device Identity Configuration */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all">
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-indigo-500" />
                                    适配器设备属性 (Device Attributes)
                                </h3>
                                <button 
                                    onClick={handleExportEDS}
                                    className="px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                                >
                                    <Download className="w-3.5 h-3.5" /> 导出 EDS 描述文件
                                </button>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Vendor ID (厂商代码)</label>
                                    <input 
                                        type="number"
                                        value={session.adapterConfig.vendorId} 
                                        onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, vendorId: Number(e.target.value) } })}
                                        disabled={isConnected}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Device Type (设备类型)</label>
                                    <input 
                                        type="number"
                                        value={session.adapterConfig.deviceType} 
                                        onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, deviceType: Number(e.target.value) } })}
                                        disabled={isConnected}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Code (产品代码)</label>
                                    <input 
                                        type="number"
                                        value={session.adapterConfig.productCode} 
                                        onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, productCode: Number(e.target.value) } })}
                                        disabled={isConnected}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Name (设备名称)</label>
                                    <input 
                                        value={session.adapterConfig.productName} 
                                        onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, productName: e.target.value } })}
                                        disabled={isConnected}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                    />
                                </div>
                                <div className="md:col-span-1 flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Major</label>
                                        <input 
                                            type="number"
                                            value={session.adapterConfig.majorRevision} 
                                            onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, majorRevision: Number(e.target.value) } })}
                                            disabled={isConnected}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Minor</label>
                                        <input 
                                            type="number"
                                            value={session.adapterConfig.minorRevision} 
                                            onChange={e => onUpdate({ adapterConfig: { ...session.adapterConfig, minorRevision: Number(e.target.value) } })}
                                            disabled={isConnected}
                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-100 disabled:opacity-75"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Connection Config Table (With Inline spreadsheet-style editing, RPI column on the left of instances) */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <Network className="w-5 h-5 text-indigo-500" />
                                    生产连接配置 (Connection Configuration)
                                </span>
                                <div className="flex gap-2 items-center">
                                    <div className="flex items-center gap-1.5 mr-2">
                                        <span className="text-xs text-slate-500 font-bold">批量数量:</span>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="100" 
                                            value={batchAddCount} 
                                            onChange={e => setBatchAddCount(Math.max(1, parseInt(e.target.value) || 1))}
                                            disabled={isConnected}
                                            className="w-14 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-center text-slate-700 font-bold"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleAddConnection('IO')} 
                                        disabled={isConnected} 
                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> 添加 I/O
                                    </button>
                                    <button 
                                        onClick={() => handleAddConnection('TAG')} 
                                        disabled={isConnected} 
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> 添加标签
                                    </button>
                                    <button 
                                        onClick={handleBatchDelete} 
                                        disabled={isConnected || selectedBatchConnIds.size === 0} 
                                        className="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> 删除所选
                                    </button>
                                </div>
                            </div>
                            <div className="p-0 overflow-x-auto max-h-[450px] overflow-y-auto">
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[20%]">连接名称</th>
                                            <th className="px-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[11%] text-center">O-&gt;T 实例ID</th>
                                            <th className="px-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[11%] text-center">T-&gt;O 实例ID</th>
                                            <th className="px-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[11%] text-center">O-&gt;T大小 (byte)</th>
                                            <th className="px-2 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[11%] text-center">T-&gt;O大小 (byte)</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[25%]">连接路径 (Connection Path)</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-[11%] text-center">当前状态</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {session.adapterConfig.connections.map(conn => (
                                            <tr 
                                                key={conn.id}
                                                onClick={(e) => handleRowClick(e, conn.id)}
                                                className={`transition-all cursor-pointer ${selectedBatchConnIds.has(conn.id) ? 'bg-indigo-100 border-l-[6px] border-indigo-600 shadow-sm relative z-10' : 'hover:bg-slate-50 border-b border-slate-100'}`}
                                            >
                                                <td className="px-4 py-1.5 text-sm font-bold text-slate-700">
                                                    <div className="flex items-center gap-1.5 w-full">
                                                        <Server className={`w-3.5 h-3.5 shrink-0 ${conn.status === 'Connected' ? 'text-emerald-500' : 'text-slate-400'}`} />
                                                        <input 
                                                            value={conn.name} 
                                                            onChange={e => handleUpdateConnection(conn.id, { name: e.target.value })}
                                                            disabled={isConnected}
                                                            className="w-full bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-bold text-slate-700 transition-all text-xs"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 text-sm text-slate-600 text-center font-mono">
                                                    {conn.connectionType === 'TAG' ? (
                                                        <span className="text-slate-400 font-bold">-</span>
                                                    ) : (
                                                        <input 
                                                            type="number"
                                                            value={conn.o2tInstance || 100} 
                                                            onChange={e => {
                                                                const val = Math.max(1, Number(e.target.value) || 100);
                                                                handleUpdateConnection(conn.id, { 
                                                                    o2tInstance: val,
                                                                    connectionPath: formatConnectionPath(val, conn.t2oInstance || 101)
                                                                });
                                                            }}
                                                            disabled={isConnected}
                                                            className="w-full bg-transparent px-1 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-mono text-center text-slate-600 transition-all text-xs"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-sm text-slate-600 text-center font-mono">
                                                    {conn.connectionType === 'TAG' ? (
                                                        <span className="text-slate-400 font-bold">-</span>
                                                    ) : (
                                                        <input 
                                                            type="number"
                                                            value={conn.t2oInstance || 101} 
                                                            onChange={e => {
                                                                const val = Math.max(1, Number(e.target.value) || 101);
                                                                handleUpdateConnection(conn.id, { 
                                                                    t2oInstance: val,
                                                                    connectionPath: formatConnectionPath(conn.o2tInstance || 100, val)
                                                                });
                                                            }}
                                                            disabled={isConnected}
                                                            className="w-full bg-transparent px-1 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-mono text-center text-slate-600 transition-all text-xs"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-sm text-slate-600 text-center font-mono">
                                                    {conn.connectionType === 'TAG' ? (
                                                        <span className="text-slate-400 font-bold text-xs">0</span>
                                                    ) : (
                                                        <input 
                                                            type="number"
                                                            value={conn.o2tSize} 
                                                            onChange={e => handleUpdateSize(conn.id, 'INPUT', Math.max(0, parseInt(e.target.value) || 0))}
                                                            disabled={isConnected}
                                                            className="w-full bg-transparent px-1 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-mono text-center text-slate-600 font-bold transition-all text-xs"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-sm text-slate-600 text-center font-mono">
                                                    <input 
                                                        type="number"
                                                        value={conn.t2oSize} 
                                                        onChange={e => handleUpdateSize(conn.id, 'OUTPUT', Math.max(0, parseInt(e.target.value) || 0))}
                                                        disabled={isConnected}
                                                        className="w-full bg-transparent px-1 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-mono text-center text-slate-600 font-bold transition-all text-xs"
                                                    />
                                                </td>
                                                <td className="px-4 py-1.5 text-xs text-indigo-600 font-mono font-semibold">
                                                    {conn.connectionType === 'TAG' ? (
                                                        <input 
                                                            value={conn.connectionPath || ''} 
                                                            onChange={e => handleUpdateConnection(conn.id, { connectionPath: e.target.value })}
                                                            disabled={isConnected}
                                                            placeholder="标签名 (如 tag0)"
                                                            className="w-full bg-transparent px-1.5 py-0.5 rounded border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none font-mono text-indigo-600 transition-all text-xs"
                                                        />
                                                    ) : (
                                                        <span className="select-all">{conn.connectionPath}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-1.5 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                            conn.status === 'Connected' ? 'bg-emerald-100 text-emerald-800' 
                                                            : conn.status === 'Error' ? 'bg-red-100 text-red-700' 
                                                            : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                                conn.status === 'Connected' ? 'bg-emerald-500 animate-pulse' 
                                                                : conn.status === 'Error' ? 'bg-red-500' 
                                                                : 'bg-slate-400'
                                                            }`}></span>
                                                            {conn.status === 'Connected' ? '在线' : conn.status === 'Error' ? '掉线' : '离线'}
                                                        </span>
                                                        {(conn.dropCount || 0) > 0 && (
                                                            <span className="text-[9px] font-mono text-red-500 font-bold" title={`累计掉线 ${conn.dropCount} 次${conn.lastDropTime ? '，最近: ' + conn.lastDropTime : ''}`}>
                                                                ×{conn.dropCount}
                                                            </span>
                                                        )}
                                                        {conn.status === 'Connected' && conn.hasErrorHistory && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUpdateConnection(conn.id, { hasErrorHistory: false });
                                                                    toast.info('已确认清除异常掉线标记');
                                                                }}
                                                                className="relative group/warn cursor-pointer"
                                                                title="此连接曾意外掉线后恢复，点击确认清除"
                                                            >
                                                                <span className="text-red-500 text-sm font-bold animate-pulse">⚠</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {session.adapterConfig.connections.length === 0 && (
                                            <tr>
                                                <td colSpan={10} className="text-center py-8 text-slate-400 text-sm">
                                                    当前暂无生产连接，请在上方填写批量数量并点击“添加 I/O 连接”按钮进行创建
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            

                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
