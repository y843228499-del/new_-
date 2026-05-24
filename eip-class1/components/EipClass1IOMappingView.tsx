import React, { useState } from 'react';
import { EipClass1SessionInfo, EipClass1AdapterConnection, EipClass1DatasetItem } from '../../type-definitions/eip-class1';
import { Plus, Trash2, Edit3, ArrowRightCircle, ArrowLeftCircle, Check, X, Search, SlidersHorizontal, Folder, FolderOpen, ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
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

const ARRAY_BASE_TYPES = ['BYTE', 'SINT', 'USINT', 'INT', 'UINT', 'WORD', 'DINT', 'UDINT', 'DWORD', 'REAL', 'LREAL'];

export const EipClass1IOMappingView: React.FC<Props> = ({ session, onUpdate, isConnected }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'input' | 'output'>('all');
    const [collapsedConns, setCollapsedConns] = useState<Record<string, boolean>>({});
    const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
    const [editingConnId, setEditingConnId] = useState<string | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editingDirection, setEditingDirection] = useState<'INPUT' | 'OUTPUT' | null>(null);
    const [editForm, setEditForm] = useState<Partial<EipClass1DatasetItem & { byteOffset: number; bitOffset: number }>>({});
    const [preparedValues, setPreparedValues] = useState<Record<string, string>>({});


    const [colWidths, setColWidths] = useState({
        variable: 280,
        channel: 140,
        type: 140,
        value: 120,
        prepared: 140,
        unit: 80
    });

    const handleMouseDown = (e: React.MouseEvent, col: keyof typeof colWidths) => {
        e.preventDefault();
        const startX = e.pageX;
        const startWidth = colWidths[col];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
            setColWidths(prev => ({ ...prev, [col]: newWidth }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleArrayTypeChange = (connId: string, direction: 'INPUT' | 'OUTPUT', newType: string) => {
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        
        const currentSize = (direction === 'INPUT' ? conn.o2tSize : conn.t2oSize) || 4;
        const bitSize = DATA_TYPES[newType] || 16;
        const byteSize = Math.ceil(bitSize / 8);
        
        // Auto-align the connection size to a multiple of the selected base type size
        const count = Math.max(1, Math.round(currentSize / byteSize));
        const newSize = count * byteSize;
        
        const prefix = direction === 'INPUT' ? 'InVal' : 'OutVal';
        const rebuiltItems: EipClass1DatasetItem[] = [];
        
        for (let i = 0; i < count; i++) {
            rebuiltItems.push({
                id: Math.random().toString(36).substr(2, 9),
                name: `${prefix}_${i + 1}`,
                dataType: newType,
                bitLength: bitSize,
                helpString: `Offset: ${i * byteSize}B, 0b`
            });
        }
        
        // Save the dataset with the new aligned size
        const key = direction === 'INPUT' ? 'o2tDataset' : 't2oDataset';
        const sizeKey = direction === 'INPUT' ? 'o2tSize' : 't2oSize';
        const dataKey = direction === 'INPUT' ? 'o2tData' : 't2oData';
        
        const oldData = conn[dataKey] || [];
        const newData = new Array(newSize).fill(0);
        for (let i = 0; i < Math.min(oldData.length, newSize); i++) {
            newData[i] = oldData[i];
        }
        
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: session.adapterConfig.connections.map(c => 
                    c.id === connId ? { ...c, [key]: rebuiltItems, [sizeKey]: newSize, [dataKey]: newData } : c
                )
            }
        });
        
        toast.success(`已重构数组类型为 ARRAY [0..${count - 1}] OF ${newType}，连接字节大小已自动同步更新为 ${newSize} 字节！`);
    };

    const calculateRequiredSize = (items: EipClass1DatasetItem[]): number => {
        if (!items || items.length === 0) return 2;
        let maxSize = 0;
        items.forEach(item => {
            const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B/);
            if (offsetMatch) {
                const byteOffset = parseInt(offsetMatch[1]);
                const byteLen = Math.ceil(item.bitLength / 8);
                if (byteOffset + byteLen > maxSize) maxSize = byteOffset + byteLen;
            }
        });
        const adjustedSize = Math.max(2, maxSize);
        return adjustedSize % 2 === 0 ? adjustedSize : adjustedSize + 1;
    };

    const handleUpdateDataset = (connId: string, direction: 'INPUT' | 'OUTPUT', items: EipClass1DatasetItem[]) => {
        const key = direction === 'INPUT' ? 'o2tDataset' : 't2oDataset';
        const sizeKey = direction === 'INPUT' ? 'o2tSize' : 't2oSize';
        const dataKey = direction === 'INPUT' ? 'o2tData' : 't2oData';
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        const newSize = calculateRequiredSize(items);
        const oldData = conn[dataKey] || [];
        const newData = new Array(newSize).fill(0);
        for (let i = 0; i < Math.min(oldData.length, newSize); i++) newData[i] = oldData[i];
        onUpdate({
            adapterConfig: {
                ...session.adapterConfig,
                connections: session.adapterConfig.connections.map(c => 
                    c.id === connId ? { ...c, [key]: items, [sizeKey]: newSize, [dataKey]: newData } : c
                )
            }
        });
    };

    const handleAddVariable = (connId: string, direction: 'INPUT' | 'OUTPUT') => {
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        const dataset = (direction === 'INPUT' ? conn.o2tDataset : conn.t2oDataset) || [];
        let nextByteOffset = 0;
        dataset.forEach(item => {
            const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B/);
            if (offsetMatch) {
                const off = parseInt(offsetMatch[1]);
                const len = Math.ceil(item.bitLength / 8);
                if (off + len > nextByteOffset) nextByteOffset = off + len;
            }
        });

        const baseType = dataset[0]?.dataType || 'INT';
        const baseBitLength = DATA_TYPES[baseType] || 16;
        const byteSize = Math.ceil(baseBitLength / 8);
        
        // Align new variable offset to baseType boundary to keep strict alignment
        if (nextByteOffset % byteSize !== 0) {
            nextByteOffset = Math.ceil(nextByteOffset / byteSize) * byteSize;
        }

        const newVar: EipClass1DatasetItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: `${direction === 'INPUT' ? 'InVal' : 'OutVal'}_${dataset.length + 1}`,
            dataType: baseType,
            bitLength: baseBitLength,
            helpString: `Offset: ${nextByteOffset}B, 0b`
        };
        handleUpdateDataset(connId, direction, [...dataset, newVar]);
        toast.success(`已添加变量: ${newVar.name}`);
    };

    const handleDeleteVariable = (connId: string, direction: 'INPUT' | 'OUTPUT', itemId: string) => {
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        const dataset = (direction === 'INPUT' ? conn.o2tDataset : conn.t2oDataset) || [];
        handleUpdateDataset(connId, direction, dataset.filter(item => item.id !== itemId));
        toast.info("变量已删除");
    };

    const handleStartEdit = (connId: string, direction: 'INPUT' | 'OUTPUT', item: EipClass1DatasetItem) => {
        if (isConnected) { toast.warning("在线会话期间禁止修改变量物理映射！"); return; }
        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
        setEditingConnId(connId);
        setEditingItemId(item.id);
        setEditingDirection(direction);
        setEditForm({ ...item, byteOffset: offsetMatch ? parseInt(offsetMatch[1]) : 0, bitOffset: offsetMatch ? parseInt(offsetMatch[2]) : 0 });
    };

    const handleSaveEdit = () => {
        if (!editingConnId || !editingItemId || !editingDirection) return;
        const conn = session.adapterConfig.connections.find(c => c.id === editingConnId);
        if (!conn) return;
        const dataset = (editingDirection === 'INPUT' ? conn.o2tDataset : conn.t2oDataset) || [];
        const baseTypeBits = DATA_TYPES[editForm.dataType || 'INT'] || 16;
        const updatedHelp = `Offset: ${editForm.byteOffset || 0}B, ${editForm.bitOffset || 0}b`;
        const updated = dataset.map(item => item.id === editingItemId ? { ...item, name: editForm.name || item.name, dataType: editForm.dataType || item.dataType, bitLength: baseTypeBits, helpString: updatedHelp } : item);
        handleUpdateDataset(editingConnId, editingDirection, updated);
        setEditingConnId(null); setEditingItemId(null); setEditingDirection(null);
        toast.success("变量映射更新成功");
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

    const handleBatchWriteOutputs = () => {
        if (isConnected === false) { toast.warning("请开启从站在线会话后再进行实时写入"); return; }
        let totalChanges = 0;
        const updatedConnections = session.adapterConfig.connections.map(conn => {
            let t2oChanged = false;
            let o2tChanged = false;
            
            let finalT2OData = conn.t2oData ? [...conn.t2oData] : [];
            let finalO2TData = conn.o2tData ? [...conn.o2tData] : [];
            
            // 1. Process Outputs (T->O)
            if (conn.t2oSize > 0 && conn.t2oDataset && conn.t2oDataset.length > 0) {
                const buffer = new Uint8Array(conn.t2oSize);
                buffer.set(conn.t2oData || []);
                const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                
                conn.t2oDataset.forEach(item => {
                    const key = `${conn.id}_${item.id}`;
                    const valStr = preparedValues[key];
                    if (valStr !== undefined && valStr !== '') {
                        t2oChanged = true;
                        totalChanges++;
                        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
                        if (!offsetMatch) return;
                        const byteOffset = parseInt(offsetMatch[1]);
                        const bitOffset = parseInt(offsetMatch[2]);
                        try {
                            switch (item.dataType) {
                                case 'BOOL': const bVal = (valStr === '1' || valStr.toLowerCase() === 'true') ? 1 : 0; if (bVal) buffer[byteOffset] |= (1 << bitOffset); else buffer[byteOffset] &= ~(1 << bitOffset); break;
                                case 'SINT': view.setInt8(byteOffset, parseInt(valStr)); break;
                                case 'USINT': case 'BYTE': view.setUint8(byteOffset, parseInt(valStr)); break;
                                case 'INT': view.setInt16(byteOffset, parseInt(valStr), true); break;
                                case 'UINT': case 'WORD': view.setUint16(byteOffset, parseInt(valStr), true); break;
                                case 'DINT': view.setInt32(byteOffset, parseInt(valStr), true); break;
                                case 'UDINT': case 'DWORD': view.setUint32(byteOffset, parseInt(valStr), true); break;
                                case 'LINT': view.setBigInt64(byteOffset, BigInt(valStr), true); break;
                                case 'ULINT': case 'LWORD': view.setBigUint64(byteOffset, BigInt(valStr), true); break;
                                case 'REAL': view.setFloat32(byteOffset, parseFloat(valStr), true); break;
                                case 'LREAL': view.setFloat64(byteOffset, parseFloat(valStr), true); break;
                            }
                        } catch {}
                    }
                });
                if (t2oChanged) {
                    finalT2OData = Array.from(buffer);
                    if ((window as any).electronAPI) {
                        (window as any).electronAPI.eipClass1UpdateData(session.id, conn.targetIp, conn.id, finalT2OData);
                    }
                }
            }
            
            // 2. Process Inputs (O->T) - only for TAG connection local UI simulation
            if (conn.connectionType === 'TAG' && conn.o2tSize > 0 && conn.o2tDataset && conn.o2tDataset.length > 0) {
                const buffer = new Uint8Array(conn.o2tSize);
                buffer.set(conn.o2tData || []);
                const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                
                conn.o2tDataset.forEach(item => {
                    const key = `${conn.id}_${item.id}`;
                    const valStr = preparedValues[key];
                    if (valStr !== undefined && valStr !== '') {
                        o2tChanged = true;
                        totalChanges++;
                        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
                        if (!offsetMatch) return;
                        const byteOffset = parseInt(offsetMatch[1]);
                        const bitOffset = parseInt(offsetMatch[2]);
                        try {
                            switch (item.dataType) {
                                case 'BOOL': const bVal = (valStr === '1' || valStr.toLowerCase() === 'true') ? 1 : 0; if (bVal) buffer[byteOffset] |= (1 << bitOffset); else buffer[byteOffset] &= ~(1 << bitOffset); break;
                                case 'SINT': view.setInt8(byteOffset, parseInt(valStr)); break;
                                case 'USINT': case 'BYTE': view.setUint8(byteOffset, parseInt(valStr)); break;
                                case 'INT': view.setInt16(byteOffset, parseInt(valStr), true); break;
                                case 'UINT': case 'WORD': view.setUint16(byteOffset, parseInt(valStr), true); break;
                                case 'DINT': view.setInt32(byteOffset, parseInt(valStr), true); break;
                                case 'UDINT': case 'DWORD': view.setUint32(byteOffset, parseInt(valStr), true); break;
                                case 'LINT': view.setBigInt64(byteOffset, BigInt(valStr), true); break;
                                case 'ULINT': case 'LWORD': view.setBigUint64(byteOffset, BigInt(valStr), true); break;
                                case 'REAL': view.setFloat32(byteOffset, parseFloat(valStr), true); break;
                                case 'LREAL': view.setFloat64(byteOffset, parseFloat(valStr), true); break;
                            }
                        } catch {}
                    }
                });
                if (o2tChanged) {
                    finalO2TData = Array.from(buffer);
                    // Do NOT send to electronAPI.eipClass1UpdateData to avoid overwriting worker's T->O buffer conn.data!
                }
            }
            
            if (t2oChanged || o2tChanged) {
                return {
                    ...conn,
                    t2oData: finalT2OData,
                    o2tData: finalO2TData
                };
            }
            return conn;
        });
        if (totalChanges > 0) {
            onUpdate({ adapterConfig: { ...session.adapterConfig, connections: updatedConnections } });
            setPreparedValues({});
            toast.success(`成功写入准备值：共下发 ${totalChanges} 个输出量！`);
        } else {
            toast.warning("未检测到任何输入准备值，请输入后再试");
        }
    };

    const handleSingleWriteInput = (connId: string, item: EipClass1DatasetItem) => {
        if (isConnected === false) { toast.warning("请开启从站在线会话后再进行实时写入"); return; }
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        
        const preparedKey = `${connId}_${item.id}`;
        const valStr = preparedValues[preparedKey];
        if (valStr === undefined || valStr === '') {
            toast.warning("请输入准备值后再写入");
            return;
        }

        const buffer = new Uint8Array(conn.o2tSize);
        buffer.set(conn.o2tData);
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
        if (!offsetMatch) return;
        const byteOffset = parseInt(offsetMatch[1]);
        const bitOffset = parseInt(offsetMatch[2]);
        
        try {
            switch (item.dataType) {
                case 'BOOL': 
                    const bVal = (valStr === '1' || valStr.toLowerCase() === 'true') ? 1 : 0; 
                    if (bVal) buffer[byteOffset] |= (1 << bitOffset); 
                    else buffer[byteOffset] &= ~(1 << bitOffset); 
                    break;
                case 'SINT': view.setInt8(byteOffset, parseInt(valStr)); break;
                case 'USINT': case 'BYTE': view.setUint8(byteOffset, parseInt(valStr)); break;
                case 'INT': view.setInt16(byteOffset, parseInt(valStr), true); break;
                case 'UINT': case 'WORD': view.setUint16(byteOffset, parseInt(valStr), true); break;
                case 'DINT': view.setInt32(byteOffset, parseInt(valStr), true); break;
                case 'UDINT': case 'DWORD': view.setUint32(byteOffset, parseInt(valStr), true); break;
                case 'LINT': view.setBigInt64(byteOffset, BigInt(valStr), true); break;
                case 'ULINT': case 'LWORD': view.setBigUint64(byteOffset, BigInt(valStr), true); break;
                case 'REAL': view.setFloat32(byteOffset, parseFloat(valStr), true); break;
                case 'LREAL': view.setFloat64(byteOffset, parseFloat(valStr), true); break;
            }
            
            const finalData = Array.from(buffer);
            // Do NOT call electronAPI.eipClass1UpdateData to avoid overwriting worker's T->O buffer conn.data!

            
            const updatedConnections = session.adapterConfig.connections.map(c => 
                c.id === connId ? { ...c, o2tData: finalData } : c
            );
            
            onUpdate({ adapterConfig: { ...session.adapterConfig, connections: updatedConnections } });
            
            setPreparedValues(prev => {
                const next = { ...prev };
                delete next[preparedKey];
                return next;
            });
            
            toast.success(`成功写入变量 ${item.name} 的值: ${valStr}`);
        } catch (e: any) {
            toast.error(`写入失败: ${e.message}`);
        }
    };

    const handleSingleWriteOutput = (connId: string, item: EipClass1DatasetItem) => {
        if (isConnected === false) { toast.warning("请开启从站在线会话后再进行实时写入"); return; }
        const conn = session.adapterConfig.connections.find(c => c.id === connId);
        if (!conn) return;
        
        const preparedKey = `${connId}_${item.id}`;
        const valStr = preparedValues[preparedKey];
        if (valStr === undefined || valStr === '') {
            toast.warning("请输入准备值后再写入");
            return;
        }

        const buffer = new Uint8Array(conn.t2oSize);
        buffer.set(conn.t2oData);
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        const offsetMatch = item.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
        if (!offsetMatch) return;
        const byteOffset = parseInt(offsetMatch[1]);
        const bitOffset = parseInt(offsetMatch[2]);
        
        try {
            switch (item.dataType) {
                case 'BOOL': 
                    const bVal = (valStr === '1' || valStr.toLowerCase() === 'true') ? 1 : 0; 
                    if (bVal) buffer[byteOffset] |= (1 << bitOffset); 
                    else buffer[byteOffset] &= ~(1 << bitOffset); 
                    break;
                case 'SINT': view.setInt8(byteOffset, parseInt(valStr)); break;
                case 'USINT': case 'BYTE': view.setUint8(byteOffset, parseInt(valStr)); break;
                case 'INT': view.setInt16(byteOffset, parseInt(valStr), true); break;
                case 'UINT': case 'WORD': view.setUint16(byteOffset, parseInt(valStr), true); break;
                case 'DINT': view.setInt32(byteOffset, parseInt(valStr), true); break;
                case 'UDINT': case 'DWORD': view.setUint32(byteOffset, parseInt(valStr), true); break;
                case 'LINT': view.setBigInt64(byteOffset, BigInt(valStr), true); break;
                case 'ULINT': case 'LWORD': view.setBigUint64(byteOffset, BigInt(valStr), true); break;
                case 'REAL': view.setFloat32(byteOffset, parseFloat(valStr), true); break;
                case 'LREAL': view.setFloat64(byteOffset, parseFloat(valStr), true); break;
            }
            
            const finalData = Array.from(buffer);
            if ((window as any).electronAPI) {
                (window as any).electronAPI.eipClass1UpdateData(session.id, conn.targetIp, conn.id, finalData);
            }
            
            const updatedConnections = session.adapterConfig.connections.map(c => 
                c.id === connId ? { ...c, t2oData: finalData } : c
            );
            
            onUpdate({ adapterConfig: { ...session.adapterConfig, connections: updatedConnections } });
            
            setPreparedValues(prev => {
                const next = { ...prev };
                delete next[preparedKey];
                return next;
            });
            
            toast.success(`成功写入变量 ${item.name} 的值: ${valStr}`);
        } catch (e: any) {
            toast.error(`写入失败: ${e.message}`);
        }
    };

    const matchesQuery = (item: EipClass1DatasetItem): boolean => {
        if (!searchQuery) return true;
        return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
               item.dataType.toLowerCase().includes(searchQuery.toLowerCase()) ||
               item.helpString.toLowerCase().includes(searchQuery.toLowerCase());
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 font-bold">查找</span>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="搜索变量..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-2 pr-6 py-1 border border-slate-200 hover:border-slate-300 rounded-md text-xs w-48 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">×</button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 font-bold">过滤</span>
                        <select
                            value={filterType}
                            onChange={e => setFilterType(e.target.value as any)}
                            className="px-2 py-1 border border-slate-200 hover:border-slate-300 rounded-md text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 font-bold bg-white"
                        >
                            <option value="all">显示所有</option>
                            <option value="input">仅显示输入 (O-&gt;T)</option>
                            <option value="output">仅显示输出 (T-&gt;O)</option>
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            const isAllCollapsed = session.adapterConfig.connections.every(c => collapsedConns[c.id] !== false);
                            const newCollapsed: Record<string, boolean> = {};
                            session.adapterConfig.connections.forEach(c => newCollapsed[c.id] = !isAllCollapsed);
                            setCollapsedConns(newCollapsed);
                        }}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-md text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    >
                        {session.adapterConfig.connections.every(c => collapsedConns[c.id] !== false) ? (
                            <><FolderOpen className="w-3.5 h-3.5 text-indigo-500" /> 一键展开连接</>
                        ) : (
                            <><Folder className="w-3.5 h-3.5 text-slate-400" /> 一键折叠连接</>
                        )}
                    </button>
                    <button
                        onClick={handleBatchWriteOutputs}
                        disabled={!isConnected}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed ml-1"
                    >
                        <Play className="w-3.5 h-3.5" /> 一键写入所有准备值
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left border-collapse table-fixed select-none">
                    <thead className="bg-slate-100/80 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th style={{ width: colWidths.variable }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                变量
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'variable')} />
                            </th>
                            <th style={{ width: colWidths.channel }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                通道
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'channel')} />
                            </th>
                            <th style={{ width: colWidths.type }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                类型
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'type')} />
                            </th>
                            <th style={{ width: colWidths.value }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                当前值
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'value')} />
                            </th>
                            <th style={{ width: colWidths.prepared }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                准备值
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'prepared')} />
                            </th>
                            <th style={{ width: colWidths.unit }} className="relative px-3 py-1.5 text-xs font-bold text-slate-600 border-r border-slate-200/50">
                                单位
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 transition-colors z-30" onMouseDown={(e) => handleMouseDown(e, 'unit')} />
                            </th>
                            <th className="px-3 py-1.5 text-xs font-bold text-slate-600 w-[60px] text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 text-xs">
                        {session.adapterConfig.connections.map(conn => {
                            const isConnCollapsed = collapsedConns[conn.id] !== false;
                            const inputItems = (conn.o2tDataset || []).filter(matchesQuery);
                            const outputItems = (conn.t2oDataset || []).filter(matchesQuery);
                            const hasInputs = filterType !== 'output' && inputItems.length > 0;
                            const hasOutputs = filterType !== 'input' && outputItems.length > 0;
                            if (searchQuery && !hasInputs && !hasOutputs) return null;
                            return (
                                <React.Fragment key={conn.id}>
                                    <tr className="bg-slate-50 border-y border-slate-200/50 hover:bg-slate-100/30 transition-colors font-medium h-7">
                                        <td colSpan={7} className="px-2 py-0.5 align-middle border-b border-slate-200/50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1 cursor-pointer" onClick={() => setCollapsedConns({ ...collapsedConns, [conn.id]: !isConnCollapsed })}>
                                                    <span className="p-0.5 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                                                        {isConnCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                    </span>
                                                    {isConnCollapsed ? <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" /> : <FolderOpen className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                                                    <span className="font-bold text-slate-800">{conn.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono font-normal">(OT/TO: {conn.o2tSize}B/{conn.t2oSize}B, 实例: {conn.o2tInstance}/{conn.t2oInstance})</span>
                                                </div>

                                            </div>
                                        </td>
                                    </tr>
                                    {!isConnCollapsed && (
                                        <>
                                            {filterType !== 'output' && (
                                                <>
                                                    <tr className="hover:bg-slate-50/40 bg-slate-50/5 h-6 group">
                                                        <td className="pl-6 pr-3 py-0.5 align-middle border-r border-slate-200/50">
                                                            <div className="flex items-center gap-1 cursor-pointer" onClick={() => setExpandedDirs({ ...expandedDirs, [`${conn.id}_INPUT`]: !expandedDirs[`${conn.id}_INPUT`] })}>
                                                                {expandedDirs[`${conn.id}_INPUT`] ? <ChevronDown className="w-2.5 h-2.5 text-slate-400" /> : <ChevronRight className="w-2.5 h-2.5 text-slate-400" />}
                                                                <ArrowRightCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                <span className="font-bold text-slate-600">Inputs</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400 text-center">-</td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono">
                                                            {(() => {
                                                                const count = conn.o2tDataset?.length || 0;
                                                                const type = conn.o2tDataset?.[0]?.dataType || 'INT';
                                                                const arrayLabel = count > 0 ? `ARRAY [0..${count - 1}] OF ` : 'ARRAY [0..0] OF ';
                                                                return isConnected ? (
                                                                    <span className="text-slate-500 font-semibold">
                                                                        {count > 0 ? `ARRAY [0..${count - 1}] OF ${type}` : 'ARRAY [0..0] OF INT'}
                                                                    </span>
                                                                ) : (
                                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                                        <span className="text-slate-500 font-semibold">{arrayLabel}</span>
                                                                        <select
                                                                            value={type}
                                                                            onChange={(e) => handleArrayTypeChange(conn.id, 'INPUT', e.target.value)}
                                                                            className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-300 rounded font-mono text-[11px] font-bold text-indigo-600 bg-white outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                                                        >
                                                                            {ARRAY_BASE_TYPES.map(t => (
                                                                                <option key={t} value={t}>{t}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400"></td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                        <td className="px-3 py-0.5 text-center flex items-center justify-center">
                                                            <button disabled={isConnected} onClick={() => handleAddVariable(conn.id, 'INPUT')} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 text-indigo-500 rounded transition-all disabled:opacity-0 cursor-pointer" title="添加输入变量"><Plus className="w-3 h-3" /></button>
                                                        </td>
                                                    </tr>
                                                    {expandedDirs[`${conn.id}_INPUT`] && inputItems.map(item => {
                                                        const isEditing = editingConnId === conn.id && editingItemId === item.id && editingDirection === 'INPUT';
                                                        const displayVal = parseValue(conn.o2tData, item.helpString, item.dataType);
                                                        return (
                                                            <tr key={item.id} className="hover:bg-slate-50/20 transition-colors h-6.5 group">
                                                                {isEditing ? (
                                                                    <>
                                                                        <td className="pl-12 pr-3 py-0.5 border-r border-slate-200/50"><input className="w-full px-1.5 py-0.25 border border-indigo-400 rounded outline-none text-[11px]" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 flex items-center gap-1"><input type="number" className="w-10 px-0.5 py-0.25 border border-indigo-400 rounded text-center text-[10px] font-mono" value={editForm.byteOffset || 0} onChange={e => setEditForm({ ...editForm, byteOffset: Math.max(0, parseInt(e.target.value) || 0) })} /> <span className="text-[10px] text-slate-400">B</span> <input type="number" min="0" max="7" className="w-7 px-0.5 py-0.25 border border-indigo-400 rounded text-center text-[10px] font-mono" value={editForm.bitOffset || 0} disabled={editForm.dataType !== 'BOOL'} onChange={e => setEditForm({ ...editForm, bitOffset: Math.min(7, Math.max(0, parseInt(e.target.value) || 0)) })} /> <span className="text-[10px] text-slate-400">b</span></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px] select-none">{editForm.dataType || 'INT'}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-[10px] text-slate-400">...</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50"></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                                        <td className="px-3 py-0.5 text-center flex items-center justify-center gap-1"><button onClick={handleSaveEdit} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3 h-3" /></button><button onClick={() => { setEditingConnId(null); setEditingItemId(null); setEditingDirection(null); }} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><X className="w-3 h-3" /></button></td>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <td className="pl-12 pr-3 py-0.5 border-r border-slate-200/50 truncate text-slate-600 font-medium" onDoubleClick={() => handleStartEdit(conn.id, 'INPUT', item)}>{item.name}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px]" onDoubleClick={() => handleStartEdit(conn.id, 'INPUT', item)}>{item.helpString.replace('Offset:', '').trim()}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px]" onDoubleClick={() => handleStartEdit(conn.id, 'INPUT', item)}>{item.dataType}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono font-bold text-slate-800">{displayVal}</td>
                                                                        <td className="px-2 py-0.5 border-r border-slate-200/50">
                                                                            {conn.connectionType === 'TAG' ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    <input type="text" placeholder="准备值..." value={preparedValues[`${conn.id}_${item.id}`] || ''} onChange={e => setPreparedValues({ ...preparedValues, [`${conn.id}_${item.id}`]: e.target.value })} disabled={!isConnected} className="h-5 px-1.5 border border-slate-200 hover:border-indigo-300 rounded text-[10px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 w-24 disabled:bg-slate-100 disabled:cursor-not-allowed" />
                                                                                    <button onClick={() => handleSingleWriteInput(conn.id, item)} disabled={!isConnected || !preparedValues[`${conn.id}_${item.id}`]} className="p-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded border border-emerald-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center" title="单键写入该值"><Play className="w-2.5 h-2.5" /></button>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-[10px] text-slate-400 italic">只读</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-500 text-center">-</td>
                                                                        <td className="px-3 py-0.5 text-center"><div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleStartEdit(conn.id, 'INPUT', item)} disabled={isConnected} className="p-0.5 text-slate-400 hover:text-indigo-600 rounded disabled:opacity-30"><Edit3 className="w-3 h-3" /></button><button onClick={() => handleDeleteVariable(conn.id, 'INPUT', item.id)} disabled={isConnected} className="p-0.5 text-slate-400 hover:text-red-500 rounded disabled:opacity-30"><Trash2 className="w-3 h-3" /></button></div></td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                    {expandedDirs[`${conn.id}_INPUT`] && inputItems.length === 0 && <tr className="h-6"><td colSpan={7} className="pl-12 py-0.5 text-slate-400 italic text-[11px]">暂无输入变量</td></tr>}
                                                </>
                                            )}
                                            {filterType !== 'input' && (
                                                <>
                                                    <tr className="hover:bg-slate-50/40 bg-slate-50/5 h-6 group border-t border-slate-100">
                                                        <td className="pl-6 pr-3 py-0.5 align-middle border-r border-slate-200/50">
                                                            <div className="flex items-center gap-1 cursor-pointer" onClick={() => setExpandedDirs({ ...expandedDirs, [`${conn.id}_OUTPUT`]: !expandedDirs[`${conn.id}_OUTPUT`] })}>
                                                                {expandedDirs[`${conn.id}_OUTPUT`] ? <ChevronDown className="w-2.5 h-2.5 text-slate-400" /> : <ChevronRight className="w-2.5 h-2.5 text-slate-400" />}
                                                                <ArrowLeftCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                                <span className="font-bold text-slate-600">Outputs</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400 text-center">-</td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono">
                                                             {(() => {
                                                                 const count = conn.t2oDataset?.length || 0;
                                                                 const type = conn.t2oDataset?.[0]?.dataType || 'INT';
                                                                 const arrayLabel = count > 0 ? `ARRAY [0..${count - 1}] OF ` : 'ARRAY [0..0] OF ';
                                                                 return isConnected ? (
                                                                     <span className="text-slate-500 font-semibold">
                                                                         {count > 0 ? `ARRAY [0..${count - 1}] OF ${type}` : 'ARRAY [0..0] OF INT'}
                                                                     </span>
                                                                 ) : (
                                                                     <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                                         <span className="text-slate-500 font-semibold">{arrayLabel}</span>
                                                                         <select
                                                                             value={type}
                                                                             onChange={(e) => handleArrayTypeChange(conn.id, 'OUTPUT', e.target.value)}
                                                                             className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-300 rounded font-mono text-[11px] font-bold text-indigo-600 bg-white outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                                                         >
                                                                             {ARRAY_BASE_TYPES.map(t => (
                                                                                 <option key={t} value={t}>{t}</option>
                                                                             ))}
                                                                         </select>
                                                                     </div>
                                                                 );
                                                             })()}
                                                        </td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400"></td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                        <td className="px-3 py-0.5 text-center flex items-center justify-center"><button disabled={isConnected} onClick={() => handleAddVariable(conn.id, 'OUTPUT')} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 text-emerald-500 rounded transition-all disabled:opacity-0 cursor-pointer" title="添加输出变量"><Plus className="w-3 h-3" /></button></td>
                                                    </tr>
                                                    {expandedDirs[`${conn.id}_OUTPUT`] && outputItems.map(item => {
                                                        const isEditing = editingConnId === conn.id && editingItemId === item.id && editingDirection === 'OUTPUT';
                                                        const displayVal = parseValue(conn.t2oData, item.helpString, item.dataType);
                                                        const preparedKey = `${conn.id}_${item.id}`;
                                                        return (
                                                            <tr key={item.id} className="hover:bg-slate-50/20 transition-colors h-6.5 group">
                                                                {isEditing ? (
                                                                    <>
                                                                        <td className="pl-12 pr-3 py-0.5 border-r border-slate-200/50"><input className="w-full px-1.5 py-0.25 border border-indigo-400 rounded-lg outline-none text-[11px]" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 flex items-center gap-1"><input type="number" className="w-10 px-0.5 py-0.25 border border-indigo-400 rounded text-center text-[10px] font-mono" value={editForm.byteOffset || 0} onChange={e => setEditForm({ ...editForm, byteOffset: Math.max(0, parseInt(e.target.value) || 0) })} /> <span className="text-[10px] text-slate-400">B</span> <input type="number" min="0" max="7" className="w-7 px-0.5 py-0.25 border border-indigo-400 rounded text-center text-[10px] font-mono" value={editForm.bitOffset || 0} disabled={editForm.dataType !== 'BOOL'} onChange={e => setEditForm({ ...editForm, bitOffset: Math.min(7, Math.max(0, parseInt(e.target.value) || 0)) })} /> <span className="text-[10px] text-slate-400">b</span></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px] select-none">{editForm.dataType || 'INT'}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-[10px] text-slate-400">...</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50"></td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-400">-</td>
                                                                        <td className="px-3 py-0.5 text-center flex items-center justify-center gap-1.5"><button onClick={handleSaveEdit} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3 h-3" /></button><button onClick={() => { setEditingConnId(null); setEditingItemId(null); setEditingDirection(null); }} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><X className="w-3 h-3" /></button></td>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <td className="pl-12 pr-3 py-0.5 border-r border-slate-200/50 truncate text-slate-600 font-medium" onDoubleClick={() => handleStartEdit(conn.id, 'OUTPUT', item)}>{item.name}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px]" onDoubleClick={() => handleStartEdit(conn.id, 'OUTPUT', item)}>{item.helpString.replace('Offset:', '').trim()}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono text-slate-500 text-[10.5px]" onDoubleClick={() => handleStartEdit(conn.id, 'OUTPUT', item)}>{item.dataType}</td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 font-mono font-bold text-slate-800">{displayVal}</td>
                                                                        <td className="px-2 py-0.5 border-r border-slate-200/50">
                                                                            <div className="flex items-center gap-1">
                                                                                <input type="text" placeholder="准备值..." value={preparedValues[preparedKey] || ''} onChange={e => setPreparedValues({ ...preparedValues, [preparedKey]: e.target.value })} disabled={!isConnected} className="h-5 px-1.5 border border-slate-200 hover:border-indigo-300 rounded text-[10px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 w-24 disabled:bg-slate-100 disabled:cursor-not-allowed" />
                                                                                <button onClick={() => handleSingleWriteOutput(conn.id, item)} disabled={!isConnected || !preparedValues[preparedKey]} className="p-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded border border-emerald-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center" title="单键写入该值"><Play className="w-2.5 h-2.5" /></button>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-3 py-0.5 border-r border-slate-200/50 text-slate-500 text-center">-</td>
                                                                        <td className="px-3 py-0.5 text-center">
                                                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <button onClick={() => handleStartEdit(conn.id, 'OUTPUT', item)} disabled={isConnected} className="p-0.5 text-slate-400 hover:text-indigo-600 rounded disabled:opacity-30"><Edit3 className="w-3 h-3" /></button>
                                                                                <button onClick={() => handleDeleteVariable(conn.id, 'OUTPUT', item.id)} disabled={isConnected} className="p-0.5 text-slate-400 hover:text-red-500 rounded disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                    {expandedDirs[`${conn.id}_OUTPUT`] && outputItems.length === 0 && <tr className="h-6"><td colSpan={7} className="pl-12 py-0.5 text-slate-400 italic text-[11px]">暂无输出变量</td></tr>}
                                                </>
                                            )}
                                        </>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {session.adapterConfig.connections.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-xs">暂无生产连接，请在“连接配置”中创建</td></tr>}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

