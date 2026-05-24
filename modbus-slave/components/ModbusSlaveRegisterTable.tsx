import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { ModbusSlaveSessionInfo, ModbusSlaveRegisterConfig, ModbusSlaveMemoryType, ModbusDataType } from '../../types';
import { modbusSlaveService } from '../services/modbusSlaveService';
import { Plus, Trash2, Edit2, Save, X, RefreshCw, Database, CopyPlus, LayoutGrid, List, CheckSquare, Square as SquareIcon, Trash, Search, Filter, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { ModbusSlaveWriteModal } from './ModbusSlaveWriteModal';
import { toast } from 'sonner';

const MEMORY_TYPE_LABELS: Record<ModbusSlaveMemoryType, string> = {
    'holding': '保持寄存器 (4x)',
    'inputs': '输入寄存器 (3x)',
    'coils': '线圈状态 (0x)',
    'discrete': '离散输入 (1x)'
};

// Memoized row renderer for Table View
const TableRow = React.memo(({ index, style, data }: { index: number, style: React.CSSProperties, data: any }) => {
    const { 
        paginatedRegisters, currentPage, pageSize, values, selectedIds, colWidths, 
        inlineValueEditingId, inlineValue, handleInlineSave, handleInlineKeyDown, 
        toggleSelect, formatAddress, getValueColor, handleDelete,
        setInlineValue, setInlineValueEditingId, setWriteModalState,
        setEditingId, setEditForm, setIsSingleAdding, inlineInputRef
    } = data;

    const reg = paginatedRegisters[index];
    if (!reg) return null;
    const globalIndex = (currentPage - 1) * pageSize + index;
    const valueKey = `${reg.type}-${reg.address}`;
    const regData = values[valueKey];
    
    return (
        <div style={style} key={reg.id} className={`flex items-center border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedIds.has(reg.id) ? 'bg-amber-50/30' : ''}`}>
            <div className="p-3 shrink-0 flex items-center justify-center" style={{ width: colWidths.select }}>
                <button onClick={(e) => toggleSelect(reg.id, globalIndex, e)} className="text-slate-400 hover:text-amber-600">
                    {selectedIds.has(reg.id) ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <SquareIcon className="w-4 h-4" />}
                </button>
            </div>
            <div className="p-3 shrink-0 text-[10px] text-slate-400 font-mono truncate" style={{ width: colWidths.index }}>{globalIndex + 1}</div>
            <div className="p-3 shrink-0 text-[15px] text-slate-600 font-mono font-bold truncate" style={{ width: colWidths.address }}>{formatAddress(reg.address, reg.type)}</div>
            <div className="p-3 shrink-0 text-sm font-medium text-slate-800 truncate" title={reg.name} style={{ width: colWidths.name }}>{reg.name}</div>
            <div className="p-3 shrink-0 text-xs text-slate-600 truncate" style={{ width: colWidths.type }}>{reg.dataType}</div>
            <div 
                className={`p-3 shrink-0 text-sm font-mono font-bold truncate cursor-edit ${getValueColor(reg, regData?.value)}`} 
                style={{ width: colWidths.value }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    const currentVal = regData?.value;
                    setInlineValue(currentVal !== undefined ? String(currentVal) : '');
                    setInlineValueEditingId(reg.id);
                }}
                title="双击修改数值"
            >
                {inlineValueEditingId === reg.id ? (
                    <input
                        ref={inlineInputRef}
                        type="text"
                        value={inlineValue}
                        onChange={e => setInlineValue(e.target.value)}
                        onBlur={() => handleInlineSave(reg)}
                        onKeyDown={e => handleInlineKeyDown(e, reg)}
                        onMouseDown={e => e.stopPropagation()}
                        className="w-full px-1 py-0.5 bg-white border border-amber-500 rounded outline-none text-slate-800"
                    />
                ) : (
                    regData?.value !== undefined ? String(regData.value) : '--'
                )}
            </div>
            <div className="p-3 shrink-0 text-[10px] text-slate-400 font-mono truncate" style={{ width: colWidths.updateTime }}>
                {regData?.lastUpdate ? new Date(regData.lastUpdate).toLocaleTimeString() : '--'}
            </div>
            <div className="p-3 shrink-0 flex justify-end gap-1" style={{ width: colWidths.actions }}>
                <button onClick={() => {
                    const currentVal = regData?.value;
                    setWriteModalState({
                        isOpen: true,
                        reg,
                        title: `写入 ${reg.name}`,
                        initialValue: currentVal !== undefined ? String(currentVal) : ''
                    });
                }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setEditingId(reg.id); setEditForm(reg); setIsSingleAdding(true); }} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"><Settings className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(reg.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
        </div>
    );
});

// Memoized row renderer for Grid View
const GridRow = React.memo(({ index, style, data }: { index: number, style: React.CSSProperties, data: any }) => {
    const {
        paginatedRegisters, currentPage, pageSize, values, selectedIds, 
        inlineValueEditingId, inlineValue, handleInlineSave, handleInlineKeyDown, 
        toggleSelect, formatAddress, getValueColor,
        setInlineValue, setInlineValueEditingId, inlineInputRef
    } = data;

    const COL_COUNT = 20;
    const items = [];
    for (let i = 0; i < COL_COUNT; i++) {
        const regIndex = index * COL_COUNT + i;
        const reg = paginatedRegisters[regIndex];
        const globalIndex = (currentPage - 1) * pageSize + regIndex;

        if (!reg) {
            items.push(<div key={`empty-${i}`} className="flex-1" />);
            continue;
        }

        const regData = values[`${reg.type}-${reg.address}`];
        const value = regData?.value;
        const lastUpdate = regData?.lastUpdate;

        items.push(
            <div 
                key={reg.id}
                onClick={(e) => {
                    if (inlineValueEditingId === reg.id) return;
                    toggleSelect(reg.id, globalIndex, e);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setInlineValue(value !== undefined ? String(value) : '');
                    setInlineValueEditingId(reg.id);
                }}
                className={`flex flex-col h-[48px] border rounded bg-white transition-all cursor-pointer overflow-hidden flex-1 ${
                    selectedIds.has(reg.id) ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-50' : 'border-slate-200 hover:border-amber-400'
                }`}
                title={`${reg.name}\nAddress: ${formatAddress(reg.address, reg.type)}\nValue: ${value !== undefined ? String(value) : '--'}\nLast Update: ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--'}\n提示: 双击修改数值`}
            >
                <div className="px-1 py-1 bg-slate-50 border-b flex justify-center items-center">
                    <span className="text-[13px] font-bold text-slate-900 font-mono leading-none">{formatAddress(reg.address, reg.type)}</span>
                </div>
                <div className="flex-1 flex flex-col justify-center items-center px-1">
                    <div 
                        className={`text-[12px] font-mono font-bold truncate w-full text-center leading-tight ${getValueColor(reg, value)}`}
                    >
                        {inlineValueEditingId === reg.id ? (
                            <input
                                ref={inlineInputRef}
                                type="text"
                                value={inlineValue}
                                onChange={e => setInlineValue(e.target.value)}
                                onBlur={() => handleInlineSave(reg)}
                                onKeyDown={e => handleInlineKeyDown(e, reg)}
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                className="w-full px-1 py-0.5 bg-white border border-amber-500 rounded outline-none text-slate-800 text-center"
                            />
                        ) : (
                            value !== undefined ? String(value) : '--'
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...style, display: 'flex', gap: '4px', paddingBottom: '4px', paddingRight: '8px' }}>
            {items}
        </div>
    );
});

export const ModbusSlaveRegisterTable = React.memo(({ session, onUpdateConfig }: {
    session: ModbusSlaveSessionInfo;
    onUpdateConfig: (registers: ModbusSlaveRegisterConfig[]) => void;
}) => {
    const registers = useMemo(() => session.config?.registers || [], [session.config?.registers]);
    const registersRef = useRef(registers);
    useEffect(() => {
        registersRef.current = registers;
    }, [registers]);
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<ModbusSlaveRegisterConfig>>({});
    const valuesRef = useRef<Record<string, { value: any, lastUpdate: number }>>({});
    const [valuesVersion, setValuesVersion] = useState(0);
    const [isBatchAdding, setIsBatchAdding] = useState(false);
    const [isSingleAdding, setIsSingleAdding] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<ModbusSlaveMemoryType>('holding');
    const [inlineValueEditingId, setInlineValueEditingId] = useState<string | null>(null);
    const [inlineValue, setInlineValue] = useState('');
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [addressFormat, setAddressFormat] = useState<'dec' | 'hex' | 'both'>('dec');
    const [writeModalState, setWriteModalState] = useState<{
        isOpen: boolean;
        reg: ModbusSlaveRegisterConfig | null;
        title: string;
        initialValue: string;
    }>({ isOpen: false, reg: null, title: '', initialValue: '' });
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(500);
    const inlineInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inlineValueEditingId && inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
        }
    }, [inlineValueEditingId]);
    
    const [colWidths, setColWidths] = useState({
        select: 40,
        index: 60,
        address: 80,
        name: 200,
        type: 100,
        value: 120,
        updateTime: 120,
        actions: 100
    });

    const handleResizeStart = (e: React.MouseEvent, col: keyof typeof colWidths) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = colWidths[col];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            setColWidths(prev => ({ ...prev, [col]: Math.max(40, startWidth + delta) }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const [batchForm, setBatchForm] = useState({
        startAddress: 0,
        count: 100,
        type: 'holding' as ModbusSlaveMemoryType,
        dataType: 'UInt16' as ModbusDataType,
        prefix: '寄存器',
        endianness: 'ABCD' as any
    });

    const filteredRegisters = useMemo(() => {
        const search = searchTerm.toLowerCase();
        const filtered = registers.filter(r => {
            const matchesTab = r.type === activeTab;
            if (!matchesTab) return false;
            
            if (!search) return true;
            const hexAddr = `0x${r.address.toString(16)}`.toLowerCase();
            return r.name.toLowerCase().includes(search) || 
                   r.address.toString().includes(search) ||
                   hexAddr.includes(search);
        }).sort((a, b) => a.address - b.address);
        
        return filtered;
    }, [registers, activeTab, searchTerm]);

    const isUnmounted = useRef(false);
    useEffect(() => {
        setValuesVersion(0);
        valuesRef.current = {};
        refreshQueue.current.clear();
        if (refreshTimeout.current) {
            clearTimeout(refreshTimeout.current);
            refreshTimeout.current = null;
        }
    }, [session.id]);
    useEffect(() => {
        isUnmounted.current = false;
        return () => {
            isUnmounted.current = true;
        };
    }, []);

    const refreshQueue = useRef<Set<string>>(new Set());
    const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

    const registerMap = useMemo(() => {
        const map: Record<string, any> = {};
        registers.forEach(r => {
            map[`${r.type}-${r.address}`] = r;
        });
        return map;
    }, [registers]);

    const registerMapRef = useRef(registerMap);
    useEffect(() => {
        registerMapRef.current = registerMap;
    }, [registerMap]);

    const decodeValue = (type: string, addr: number, reg: any, resultData: number[], startAddr: number) => {
        const offset = addr - startAddr;
        if (offset < 0 || offset >= resultData.length) return undefined;

        let val: any;
        if (type === 'coils' || type === 'discrete') {
            val = resultData[offset] !== 0;
        } else {
            if (reg.dataType === 'Boolean') val = resultData[offset] !== 0;
            else if (reg.dataType === 'Int16') {
                const buffer = new ArrayBuffer(2);
                const view = new DataView(buffer);
                view.setUint16(0, resultData[offset], false);
                val = view.getInt16(0, false);
            } else if (reg.dataType === 'UInt16') val = resultData[offset];
            else if (reg.dataType === 'Int32' || reg.dataType === 'UInt32' || reg.dataType === 'Float32') {
                if (offset + 1 < resultData.length) {
                    const buffer = new ArrayBuffer(4);
                    const view = new DataView(buffer);
                    const endianness = reg.endianness || 'ABCD';
                    
                    let word0 = resultData[offset];
                    let word1 = resultData[offset + 1];
                    let littleEndianWord = false;

                    if (endianness === 'CDAB') {
                        word0 = resultData[offset + 1];
                        word1 = resultData[offset];
                    } else if (endianness === 'BADC') {
                        littleEndianWord = true;
                    } else if (endianness === 'DCBA') {
                        word0 = resultData[offset + 1];
                        word1 = resultData[offset];
                        littleEndianWord = true;
                    }

                    view.setUint16(0, word0, littleEndianWord);
                    view.setUint16(2, word1, littleEndianWord);
                    
                    if (reg.dataType === 'Float32') val = view.getFloat32(0, false);
                    else if (reg.dataType === 'Int32') val = view.getInt32(0, false);
                    else val = view.getUint32(0, false);
                }
            } else if (reg.dataType === 'Float64') {
                if (offset + 3 < resultData.length) {
                    const buffer = new ArrayBuffer(8);
                    const view = new DataView(buffer);
                    const endianness = reg.endianness || 'ABCD';
                    
                    let word0 = resultData[offset];
                    let word1 = resultData[offset + 1];
                    let word2 = resultData[offset + 2];
                    let word3 = resultData[offset + 3];
                    let littleEndianWord = false;

                    if (endianness === 'CDAB') {
                        word0 = resultData[offset + 1];
                        word1 = resultData[offset];
                        word2 = resultData[offset + 3];
                        word3 = resultData[offset + 2];
                    } else if (endianness === 'BADC') {
                        littleEndianWord = true;
                    } else if (endianness === 'DCBA') {
                        word0 = resultData[offset + 3];
                        word1 = resultData[offset + 2];
                        word2 = resultData[offset + 1];
                        word3 = resultData[offset];
                        littleEndianWord = true;
                    }

                    view.setUint16(0, word0, littleEndianWord);
                    view.setUint16(2, word1, littleEndianWord);
                    view.setUint16(4, word2, littleEndianWord);
                    view.setUint16(6, word3, littleEndianWord);
                    val = view.getFloat64(0, false);
                }
            } else if (reg.dataType === 'String') {
                const strData = resultData.slice(offset, offset + 10);
                val = strData.map(n => String.fromCharCode(n & 0xFF, (n >> 8) & 0xFF)).join('').replace(/\0/g, '');
            }
        }
        return val;
    };

    const processRefreshQueue = useCallback(async () => {
        if (!session.id || isUnmounted.current) return;
        const toRefresh = Array.from(refreshQueue.current);
        refreshQueue.current.clear();
        if (toRefresh.length === 0) return;

        // Group by type to batch requests
        const groups: Record<string, number[]> = {};
        toRefresh.forEach(key => {
            const [type, addr] = key.split('-');
            if (!groups[type]) groups[type] = [];
            groups[type].push(parseInt(addr, 10));
        });

        for (const type in groups) {
            if (isUnmounted.current) break;
            const addresses = groups[type].sort((a, b) => a - b);
            if (addresses.length === 0) continue;

            // Smart batching: split if gap is too large
            const batches: { min: number, max: number }[] = [];
            let currentBatch = { min: addresses[0], max: addresses[0] };
            
            for (let i = 1; i < addresses.length; i++) {
                const addr = addresses[i];
                // If gap is more than 50 registers, start a new batch
                if (addr - currentBatch.max > 50) {
                    batches.push(currentBatch);
                    currentBatch = { min: addr, max: addr };
                } else {
                    currentBatch.max = addr;
                }
            }
            batches.push(currentBatch);

            for (const batch of batches) {
                if (isUnmounted.current) break;
                const minAddr = batch.min;
                const maxAddr = batch.max;
                
                const lastReg = registerMapRef.current[`${type}-${maxAddr}`];
                let lastLen = 1;
                if (lastReg) {
                    if (lastReg.dataType === 'Int32' || lastReg.dataType === 'UInt32' || lastReg.dataType === 'Float32') lastLen = 2;
                    else if (lastReg.dataType === 'Float64') lastLen = 4;
                    else if (lastReg.dataType === 'String') lastLen = 10;
                }
                
                const rangeLen = (maxAddr - minAddr) + lastLen;
                const MAX_MODBUS_LEN = (type === 'coils' || type === 'discrete') ? 2000 : 125;
                
                // Process in chunks of MAX_MODBUS_LEN
                for (let start = minAddr; start <= maxAddr; start += MAX_MODBUS_LEN) {
                    if (isUnmounted.current) break;
                    const currentLen = Math.min(MAX_MODBUS_LEN, (maxAddr - start) + lastLen);
                    try {
                        const result = await modbusSlaveService.readMemory(session.id, type as any, start, currentLen, session.transport);
                        if (isUnmounted.current) break;
                        if (result.success && result.data) {
                            const now = Date.now();
                            let hasChanges = false;
                            addresses.forEach(addr => {
                                if (addr >= start && addr < start + currentLen) {
                                    const reg = registerMapRef.current[`${type}-${addr}`];
                                    if (!reg) return;
                                    const val = decodeValue(type, addr, reg, result.data, start);
                                    if (val !== undefined) {
                                        valuesRef.current[`${type}-${addr}`] = { value: val, lastUpdate: now };
                                        hasChanges = true;
                                    }
                                }
                            });
                            if (hasChanges) {
                                setValuesVersion(v => v + 1);
                            }
                        }
                    } catch (err) { console.error("Batch refresh error:", err); }
                }
            }
        }
    }, [session.id, session.transport]);

    const processRefreshQueueRef = useRef(processRefreshQueue);
    useEffect(() => {
        processRefreshQueueRef.current = processRefreshQueue;
    }, [processRefreshQueue]);

    const queueRefresh = useCallback((type: string, address: number, length: number) => {
        // Find registers in range
        // Optimization: avoid full scan for small lengths
        if (length < 100) {
            for (let i = 0; i < length; i++) {
                const currentAddr = address + i;
                for (let j = 0; j < 10; j++) {
                    const checkAddr = currentAddr - j;
                    if (checkAddr < 0) break;
                    const reg = registerMap[`${type}-${checkAddr}`];
                    if (reg) {
                        let rLength = 1;
                        if (reg.dataType === 'Int32' || reg.dataType === 'UInt32' || reg.dataType === 'Float32') rLength = 2;
                        else if (reg.dataType === 'Float64') rLength = 4;
                        else if (reg.dataType === 'String') rLength = 10;
                        if (reg.address + rLength > currentAddr) {
                            refreshQueue.current.add(`${type}-${reg.address}`);
                        }
                    }
                }
            }
        } else {
            registersRef.current.forEach(r => {
                if (r.type !== type) return;
                let rLength = 1;
                if (r.dataType === 'Int32' || r.dataType === 'UInt32' || r.dataType === 'Float32') rLength = 2;
                else if (r.dataType === 'Float64') rLength = 4;
                else if (r.dataType === 'String') rLength = 10;

                if (r.address + rLength > address && r.address < address + length) {
                    refreshQueue.current.add(`${type}-${r.address}`);
                }
            });
        }

        if (!refreshTimeout.current) {
            refreshTimeout.current = setTimeout(() => {
                refreshTimeout.current = null;
                processRefreshQueueRef.current();
            }, 50);
        }
    }, [registerMap]);

    // Reset page when tab or search changes
    useEffect(() => {
        setCurrentPage(1);
        // Trigger a refresh of the first page of values when tab changes
        const firstPage = filteredRegisters.slice(0, pageSize);
        firstPage.forEach(reg => {
            refreshQueue.current.add(`${reg.type}-${reg.address}`);
        });
        if (!refreshTimeout.current) {
            refreshTimeout.current = setTimeout(() => {
                refreshTimeout.current = null;
                processRefreshQueue();
            }, 50);
        }
    }, [activeTab, searchTerm, pageSize, processRefreshQueue]);

    const totalPages = Math.ceil(filteredRegisters.length / pageSize);
    const paginatedRegisters = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        const page = filteredRegisters.slice(startIndex, startIndex + pageSize);
        return page;
    }, [filteredRegisters, currentPage, pageSize]);

    const paginatedRegistersRef = useRef(paginatedRegisters);
    useEffect(() => {
        paginatedRegistersRef.current = paginatedRegisters;
    }, [paginatedRegisters]);

    // Also refresh when page changes or status changes
    useEffect(() => {
        paginatedRegisters.forEach(reg => {
            refreshQueue.current.add(`${reg.type}-${reg.address}`);
        });
        if (!refreshTimeout.current) {
            refreshTimeout.current = setTimeout(() => {
                refreshTimeout.current = null;
                processRefreshQueue();
            }, 50);
        }
    }, [paginatedRegisters, processRefreshQueue, session.status]);

    useEffect(() => {
        const handleDataChange = (event: any) => {
            if (event.sessionId === session.id || event.sessionId === 'mock-session') {
                queueRefresh(event.type, event.address, event.length);
            }
        };

        const unsubscribe = modbusSlaveService.onDataChanged(handleDataChange, session.transport || 'TCP');
        
        const handleMemoryUpdate = (event: any) => {
            if (event.sessionId === session.id) {
                // Trigger a full refresh of current page
                paginatedRegistersRef.current.forEach(reg => {
                    refreshQueue.current.add(`${reg.type}-${reg.address}`);
                });
                if (!refreshTimeout.current) {
                    refreshTimeout.current = setTimeout(() => {
                        refreshTimeout.current = null;
                        processRefreshQueueRef.current();
                    }, 50);
                }
            }
        };
        const removeMemoryUpdateListener = modbusSlaveService.onMemoryUpdate(handleMemoryUpdate);

        return () => {
            unsubscribe();
            removeMemoryUpdateListener();
            if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
        };
    }, [session.id, queueRefresh, session.transport]);

    const handleRefreshById = async (type: string, address: number) => {
        const reg = registers.find(r => r.type === type && r.address === address);
        if (reg) {
            await handleRefresh(reg);
        }
    };

    const getNextAvailableIndex = (prefix: string) => {
        let maxIndex = 0;
        const regex = new RegExp(`^${prefix}(\\d+)$`);
        registers.forEach(r => {
            const match = r.name.match(regex);
            if (match) {
                const idx = parseInt(match[1], 10);
                if (idx > maxIndex) maxIndex = idx;
            }
        });
        return maxIndex + 1;
    };

    const getNextAvailableAddress = (type: ModbusSlaveMemoryType) => {
        const typeRegs = registers.filter(r => r.type === type);
        if (typeRegs.length === 0) return 0;
        return Math.max(...typeRegs.map(r => r.address)) + 1;
    };

    const openBatchAdd = () => {
        const nextAddr = getNextAvailableAddress(activeTab);
        setBatchForm(prev => ({
            ...prev,
            type: activeTab,
            startAddress: nextAddr,
            prefix: MEMORY_TYPE_LABELS[activeTab].split(' ')[0]
        }));
        setIsBatchAdding(true);
    };

    const openSingleAdd = () => {
        const nextAddr = getNextAvailableAddress(activeTab);
        const prefix = MEMORY_TYPE_LABELS[activeTab].split(' ')[0];
        const nextIdx = getNextAvailableIndex(prefix);
        setEditForm({
            name: `${prefix}${nextIdx}`,
            type: activeTab,
            address: nextAddr,
            dataType: activeTab === 'coils' || activeTab === 'discrete' ? 'Boolean' : 'UInt16'
        });
        setEditingId(null);
        setIsSingleAdding(true);
    };

    const handleClearTab = () => {
        toast(`确定要清空当前分类 [${MEMORY_TYPE_LABELS[activeTab]}] 下的所有寄存器吗？`, {
            action: {
                label: '确定',
                onClick: () => {
                    const updated = registers.filter(r => r.type !== activeTab);
                    onUpdateConfig(updated);
                    setSelectedIds(new Set());
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };

    const handleBatchAdd = () => {
        const newRegs: ModbusSlaveRegisterConfig[] = [];
        let currentAddress = batchForm.startAddress;
        const prefix = batchForm.prefix || '寄存器';
        let nextIndex = getNextAvailableIndex(prefix);

        for (let i = 0; i < batchForm.count; i++) {
            newRegs.push({
                id: (Date.now() + i).toString(),
                name: `${prefix}${nextIndex + i}`,
                address: currentAddress,
                type: batchForm.type,
                dataType: batchForm.dataType,
                endianness: batchForm.endianness,
                description: ''
            });
            
            // Increment address based on data type size
            if (batchForm.dataType === 'Int32' || batchForm.dataType === 'UInt32' || batchForm.dataType === 'Float32') {
                currentAddress += 2;
            } else if (batchForm.dataType === 'Float64') {
                currentAddress += 4;
            } else if (batchForm.dataType === 'String') {
                currentAddress += 10; // Default 10 registers for string
            } else {
                currentAddress += 1;
            }
        }
        
        const updated = [...registers, ...newRegs];
        onUpdateConfig(updated);
        setIsBatchAdding(false);
    };

    const handleDelete = (id: string) => {
        const updated = registers.filter(r => r.id !== id);
        onUpdateConfig(updated);
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleBatchDelete = () => {
        if (selectedIds.size === 0) return;
        toast(`确定要删除选中的 ${selectedIds.size} 个寄存器吗？`, {
            action: {
                label: '确定',
                onClick: () => {
                    const updated = registers.filter(r => !selectedIds.has(r.id));
                    onUpdateConfig(updated);
                    setSelectedIds(new Set());
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredRegisters.length && filteredRegisters.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredRegisters.map(r => r.id)));
        }
    };

    const toggleSelect = (id: string, index: number, event?: React.MouseEvent) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            
            if (event?.shiftKey && lastSelectedIndex !== null) {
                const start = Math.min(lastSelectedIndex, index);
                const end = Math.max(lastSelectedIndex, index);
                const rangeIds = filteredRegisters.slice(start, end + 1).map(r => r.id);
                
                if (next.has(id)) {
                    rangeIds.forEach(rid => next.delete(rid));
                } else {
                    rangeIds.forEach(rid => next.add(rid));
                }
            } else {
                if (next.has(id)) next.delete(id);
                else next.add(id);
            }
            
            setLastSelectedIndex(index);
            return next;
        });
    };

    const handleSave = () => {
        if (editingId) {
            const updated = registers.map(r => r.id === editingId ? { ...r, ...editForm } as ModbusSlaveRegisterConfig : r);
            onUpdateConfig(updated);
            setEditingId(null);
        }
    };

    const formatAddress = useCallback((addr: number, type?: ModbusSlaveMemoryType) => {
        const hex = `0x${addr.toString(16).toUpperCase()}`;
        const prefix = (type === 'coils' || type === 'discrete') ? '' : 'D';
        if (addressFormat === 'dec') return `${prefix}${addr}`;
        if (addressFormat === 'hex') return hex;
        return `${prefix}${addr} (${hex})`;
    }, [addressFormat]);

    const getValueColor = useCallback((reg: ModbusSlaveRegisterConfig, val: any) => {
        if (val === undefined || val === null) return 'text-slate-400';
        
        // Check if it's a boolean type (Coils or Discrete Inputs, or explicitly Boolean dataType)
        const isBoolean = reg.type === 'coils' || reg.type === 'discrete' || reg.dataType === 'Boolean';
        
        if (isBoolean) {
            // In Modbus, 1/true is usually green, 0/false is red or slate
            // The user specifically asked for true to be green
            const boolVal = val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true';
            return boolVal ? 'text-emerald-600' : 'text-rose-600';
        }
        
        return 'text-amber-600';
    }, []);

    const handleWriteValue = useCallback(async (reg: ModbusSlaveRegisterConfig, valueStr: string) => {
        try {
            let val: any = valueStr;
            let valuesToWrite: number[] = [];

            if (reg.dataType === 'Boolean') {
                val = valueStr.toLowerCase() === 'true' || valueStr === '1';
                valuesToWrite = [val ? 1 : 0];
            } else if (reg.dataType === 'Int16' || reg.dataType === 'UInt16') {
                val = parseInt(valueStr, 10);
                if (isNaN(val)) throw new Error("Invalid number");
                valuesToWrite = [val & 0xFFFF];
            } else if (reg.dataType === 'Int32' || reg.dataType === 'UInt32' || reg.dataType === 'Float32') {
                val = reg.dataType === 'Float32' ? parseFloat(valueStr) : parseInt(valueStr, 10);
                if (isNaN(val)) throw new Error("Invalid number");
                const buffer = new ArrayBuffer(4);
                const view = new DataView(buffer);
                if (reg.dataType === 'Float32') view.setFloat32(0, val, false);
                else if (reg.dataType === 'Int32') view.setInt32(0, val, false);
                else view.setUint32(0, val, false);
                
                const endianness = reg.endianness || 'ABCD';
                let littleEndianWord = false;
                if (endianness === 'BADC' || endianness === 'DCBA') {
                    littleEndianWord = true;
                }
                
                let word0 = view.getUint16(0, littleEndianWord);
                let word1 = view.getUint16(2, littleEndianWord);
                
                if (endianness === 'CDAB' || endianness === 'DCBA') {
                    valuesToWrite = [word1, word0];
                } else {
                    valuesToWrite = [word0, word1];
                }
            } else if (reg.dataType === 'Float64') {
                val = parseFloat(valueStr);
                if (isNaN(val)) throw new Error("Invalid number");
                const buffer = new ArrayBuffer(8);
                const view = new DataView(buffer);
                view.setFloat64(0, val, false);
                
                const endianness = reg.endianness || 'ABCD';
                let littleEndianWord = false;
                if (endianness === 'BADC' || endianness === 'DCBA') {
                    littleEndianWord = true;
                }
                
                let word0 = view.getUint16(0, littleEndianWord);
                let word1 = view.getUint16(2, littleEndianWord);
                let word2 = view.getUint16(4, littleEndianWord);
                let word3 = view.getUint16(6, littleEndianWord);
                
                if (endianness === 'CDAB') {
                    valuesToWrite = [word1, word0, word3, word2];
                } else if (endianness === 'DCBA') {
                    valuesToWrite = [word3, word2, word1, word0];
                } else {
                    valuesToWrite = [word0, word1, word2, word3];
                }
            } else if (reg.dataType === 'String') {
                // Write string as ASCII bytes
                for (let i = 0; i < valueStr.length; i += 2) {
                    const char1 = valueStr.charCodeAt(i) || 0;
                    const char2 = valueStr.charCodeAt(i + 1) || 0;
                    valuesToWrite.push((char1 << 8) | char2);
                }
            }

            if (session.id) {
                await modbusSlaveService.writeMemory(session.id, reg.type, reg.address, valuesToWrite, session.transport);
            }
            
            // Update local state immediately for better UX
            valuesRef.current[`${reg.type}-${reg.address}`] = {
                ...valuesRef.current[`${reg.type}-${reg.address}`],
                value: val,
                lastUpdate: Date.now()
            };
            setValuesVersion(v => v + 1);
        } catch (error) {
            console.error("Failed to write value:", error);
            // You might want to show a toast here
        }
    }, [session.id]);

    const handleInlineSave = useCallback((reg: ModbusSlaveRegisterConfig) => {
        if (inlineValueEditingId === reg.id) {
            handleWriteValue(reg, inlineValue);
            setInlineValueEditingId(null);
        }
    }, [inlineValueEditingId, inlineValue, handleWriteValue]);

    const handleInlineKeyDown = useCallback((e: React.KeyboardEvent, reg: ModbusSlaveRegisterConfig) => {
        if (e.key === 'Enter') {
            handleInlineSave(reg);
        } else if (e.key === 'Escape') {
            setInlineValueEditingId(null);
        }
    }, [handleInlineSave]);

    const handleRefresh = async (reg: ModbusSlaveRegisterConfig) => {
        if (!session.id) return;
        try {
            let rLength = 1;
            if (reg.dataType === 'Int32' || reg.dataType === 'UInt32' || reg.dataType === 'Float32') rLength = 2;
            else if (reg.dataType === 'Float64') rLength = 4;
            else if (reg.dataType === 'String') rLength = 10;
            
            const result = await modbusSlaveService.readMemory(session.id, reg.type, reg.address, rLength, session.transport);
            if (result.success && result.data) {
                let val: any = result.data[0];
                if (reg.dataType === 'Boolean') {
                    val = result.data[0] !== 0;
                } else if (reg.dataType === 'Int16') {
                    const buffer = new ArrayBuffer(2);
                    const view = new DataView(buffer);
                    view.setUint16(0, result.data[0], false);
                    val = view.getInt16(0, false);
                } else if (reg.dataType === 'UInt16') {
                    val = result.data[0];
                } else if (rLength === 2 && result.data.length >= 2) {
                    const buffer = new ArrayBuffer(4);
                    const view = new DataView(buffer);
                    view.setUint16(0, result.data[0], false);
                    view.setUint16(2, result.data[1], false);
                    if (reg.dataType === 'Float32') val = view.getFloat32(0, false);
                    else if (reg.dataType === 'Int32') val = view.getInt32(0, false);
                    else if (reg.dataType === 'UInt32') val = view.getUint32(0, false);
                } else if (rLength === 4 && result.data.length >= 4) {
                    const buffer = new ArrayBuffer(8);
                    const view = new DataView(buffer);
                    view.setUint16(0, result.data[0], false);
                    view.setUint16(2, result.data[1], false);
                    view.setUint16(4, result.data[2], false);
                    view.setUint16(6, result.data[3], false);
                    if (reg.dataType === 'Float64') val = view.getFloat64(0, false);
                } else if (reg.dataType === 'String' && result.data.length > 0) {
                    // Convert array of 16-bit integers to string
                    val = result.data.map(n => String.fromCharCode(n & 0xFF, (n >> 8) & 0xFF)).join('').replace(/\0/g, '');
                }
                
                const key = `${reg.type}-${reg.address}`;
                if (valuesRef.current[key]?.value !== val) {
                    valuesRef.current[key] = { value: val, lastUpdate: Date.now() };
                    setValuesVersion(v => v + 1);
                }
            }
        } catch (error) {
            console.error('Refresh error:', error);
        }
    };

    // Data object passed to virtualized rows
    const tableItemData = useMemo(() => ({
        paginatedRegisters,
        currentPage,
        pageSize,
        values: valuesRef.current,
        valuesVersion,
        selectedIds,
        colWidths,
        inlineValueEditingId,
        inlineValue,
        handleInlineSave,
        handleInlineKeyDown,
        toggleSelect,
        formatAddress,
        getValueColor,
        handleDelete,
        setInlineValue,
        setInlineValueEditingId,
        setWriteModalState,
        setEditingId,
        setEditForm,
        setIsSingleAdding,
        inlineInputRef
    }), [paginatedRegisters, currentPage, pageSize, valuesVersion, selectedIds, colWidths, inlineValueEditingId, inlineValue, handleInlineSave, handleInlineKeyDown, toggleSelect, formatAddress, getValueColor, handleDelete, setInlineValue, setInlineValueEditingId, setWriteModalState, setEditingId, setEditForm, setIsSingleAdding]);

    const gridItemData = useMemo(() => ({
        paginatedRegisters,
        currentPage,
        pageSize,
        values: valuesRef.current,
        valuesVersion,
        selectedIds,
        inlineValueEditingId,
        inlineValue,
        handleInlineSave,
        handleInlineKeyDown,
        toggleSelect,
        formatAddress,
        getValueColor,
        setInlineValue,
        setInlineValueEditingId,
        inlineInputRef
    }), [paginatedRegisters, currentPage, pageSize, valuesVersion, selectedIds, inlineValueEditingId, inlineValue, handleInlineSave, handleInlineKeyDown, toggleSelect, formatAddress, getValueColor, setInlineValue, setInlineValueEditingId]);

    const renderTable = () => {
        const totalWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);

        return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 flex font-bold text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-10 min-w-max">
                <div className="p-3 shrink-0 flex items-center justify-center relative group" style={{ width: colWidths.select }}>
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-amber-600">
                        {selectedIds.size === filteredRegisters.length && filteredRegisters.length > 0 ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <SquareIcon className="w-4 h-4" />}
                    </button>
                    <div onMouseDown={(e) => handleResizeStart(e, 'select')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.index }}>
                    <span className="truncate">序号</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'index')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.address }}>
                    <span className="truncate">地址</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'address')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.name }}>
                    <span className="truncate">名称</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'name')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.type }}>
                    <span className="truncate">类型</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'type')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.value }}>
                    <span className="truncate">数值</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'value')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center" style={{ width: colWidths.updateTime }}>
                    <span className="truncate">更新时间</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'updateTime')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
                <div className="p-3 shrink-0 relative group flex items-center justify-end" style={{ width: colWidths.actions }}>
                    <span className="truncate">操作</span>
                    <div onMouseDown={(e) => handleResizeStart(e, 'actions')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400 group-hover:bg-slate-300 transition-colors z-20" />
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
                <AutoSizer>
                    {({ height, width }) => (
                        <FixedSizeList
                            height={height}
                            width={width}
                            itemCount={paginatedRegisters.length}
                            itemSize={45}
                            itemData={tableItemData}
                        >
                            {TableRow}
                        </FixedSizeList>
                    )}
                </AutoSizer>
            </div>
        </div>
    );
    };

    const renderGrid = () => {
        const COL_COUNT = 20;
        const rowCount = Math.ceil(paginatedRegisters.length / COL_COUNT);

        return (
            <div className="flex-1 min-h-0 bg-slate-100/50 p-2 overflow-hidden">
                <AutoSizer>
                    {({ height, width }) => (
                        <FixedSizeList
                            height={height}
                            width={width}
                            itemCount={rowCount}
                            itemSize={52}
                            itemData={gridItemData}
                        >
                            {GridRow}
                        </FixedSizeList>
                    )}
                </AutoSizer>
            </div>
        );
    };

    const handleRefreshAll = () => {
        paginatedRegisters.forEach(reg => {
            refreshQueue.current.add(`${reg.type}-${reg.address}`);
        });
        if (!refreshTimeout.current) {
            refreshTimeout.current = setTimeout(() => {
                refreshTimeout.current = null;
                processRefreshQueue();
            }, 50);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-6">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Database className="w-5 h-5 text-amber-600" />
                        寄存器管理
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefreshAll}
                            className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="刷新当前页"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            {Object.entries(MEMORY_TYPE_LABELS).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key as ModbusSlaveMemoryType)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === key ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label.split(' ')[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="搜索名称/地址/0x..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 w-48 transition-all"
                        />
                    </div>
                    <div className="h-6 w-px bg-slate-200 mx-1" />
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setAddressFormat('dec')} className={`px-2 py-1 text-[10px] font-bold rounded ${addressFormat === 'dec' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>DEC</button>
                        <button onClick={() => setAddressFormat('hex')} className={`px-2 py-1 text-[10px] font-bold rounded ${addressFormat === 'hex' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>HEX</button>
                        <button onClick={() => setAddressFormat('both')} className={`px-2 py-1 text-[10px] font-bold rounded ${addressFormat === 'both' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>BOTH</button>
                    </div>
                    <div className="h-6 w-px bg-slate-200 mx-1" />
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}><List className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}><LayoutGrid className="w-4 h-4" /></button>
                    </div>
                    <button onClick={handleRefreshAll} className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors" title="刷新全部"><RefreshCw className="w-4 h-4" /></button>
                    {selectedIds.size > 0 && (
                        <button onClick={handleBatchDelete} className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"><Trash className="w-3.5 h-3.5" /> 删除 ({selectedIds.size})</button>
                    )}
                    <button onClick={handleClearTab} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="清空当前分类"><Trash2 className="w-4 h-4" /></button>
                    <button onClick={openBatchAdd} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"><CopyPlus className="w-3.5 h-3.5" /> 批量创建</button>
                    <button onClick={openSingleAdd} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 shadow-sm shadow-amber-200 transition-all"><Plus className="w-4 h-4" /> 添加寄存器</button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0 bg-white">
                {filteredRegisters.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <div className="p-6 bg-slate-50 rounded-full border border-slate-100"><Database className="w-12 h-12 opacity-20" /></div>
                        <p className="text-sm font-medium">当前分类下暂无寄存器</p>
                        <button onClick={openBatchAdd} className="text-amber-600 text-xs font-bold hover:underline">立即创建默认寄存器</button>
                    </div>
                ) : (
                    <>
                        {viewMode === 'table' ? renderTable() : renderGrid()}
                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200 shrink-0">
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                                <span>共 {filteredRegisters.length} 条记录</span>
                                <div className="flex items-center gap-2">
                                    <span>每页</span>
                                    <select 
                                        value={pageSize} 
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:ring-2 focus:ring-amber-500 outline-none"
                                    >
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                        <option value={500}>500</option>
                                        <option value={1000}>1000</option>
                                        <option value={2000}>2000</option>
                                        <option value={5000}>5000</option>
                                    </select>
                                    <span>条</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-sm font-medium text-slate-700 min-w-[3rem] text-center">
                                    {currentPage} / {totalPages || 1}
                                </span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            {(isBatchAdding || isSingleAdding) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                {isBatchAdding ? <CopyPlus className="w-5 h-5 text-emerald-600" /> : <Plus className="w-5 h-5 text-amber-600" />}
                                {isBatchAdding ? '批量创建寄存器' : editingId ? '编辑寄存器' : '添加寄存器'}
                            </h3>
                            <button onClick={() => { setIsBatchAdding(false); setIsSingleAdding(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {isBatchAdding ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">名称前缀</label>
                                            <input type="text" value={batchForm.prefix} onChange={e => setBatchForm({ ...batchForm, prefix: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">寄存器类型</label>
                                            <select value={batchForm.type} onChange={e => setBatchForm({ ...batchForm, type: e.target.value as ModbusSlaveMemoryType })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                {Object.entries(MEMORY_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">数据类型</label>
                                            <select value={batchForm.dataType} onChange={e => setBatchForm({ ...batchForm, dataType: e.target.value as ModbusDataType })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                <option value="Boolean">Boolean</option>
                                                <option value="Int16">Int16</option>
                                                <option value="UInt16">UInt16</option>
                                                <option value="Int32">Int32</option>
                                                <option value="UInt32">UInt32</option>
                                                <option value="Float32">Float32</option>
                                                <option value="Float64">Float64</option>
                                                <option value="String">String</option>
                                            </select>
                                        </div>
                                        {['Int32', 'UInt32', 'Float32', 'Float64'].includes(batchForm.dataType) && (
                                            <div className="col-span-3">
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">字节序 (Endianness)</label>
                                                <select value={batchForm.endianness || 'ABCD'} onChange={e => setBatchForm({ ...batchForm, endianness: e.target.value as any })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                    <option value="ABCD">ABCD (Big Endian)</option>
                                                    <option value="CDAB">CDAB (Little Endian Word Swap)</option>
                                                    <option value="BADC">BADC (Big Endian Byte Swap)</option>
                                                    <option value="DCBA">DCBA (Little Endian)</option>
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between">
                                                <span>起始地址</span>
                                                <span className="text-amber-600 font-mono">0x{(batchForm.startAddress || 0).toString(16).toUpperCase()}</span>
                                            </label>
                                            <input type="number" value={batchForm.startAddress} onChange={e => setBatchForm({ ...batchForm, startAddress: parseInt(e.target.value, 10) || 0 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">创建数量</label>
                                        <input type="number" value={batchForm.count} onChange={e => setBatchForm({ ...batchForm, count: parseInt(e.target.value, 10) || 1 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">寄存器名称</label>
                                        <input type="text" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">寄存器类型</label>
                                            <select value={editForm.type || 'holding'} onChange={e => setEditForm({ ...editForm, type: e.target.value as ModbusSlaveMemoryType })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                {Object.entries(MEMORY_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 flex justify-between">
                                                <span>寄存器地址</span>
                                                <span className="text-amber-600 font-mono">0x{(editForm.address ?? 0).toString(16).toUpperCase()}</span>
                                            </label>
                                            <input type="number" value={editForm.address ?? 0} onChange={e => setEditForm({ ...editForm, address: parseInt(e.target.value, 10) || 0 })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">数据类型</label>
                                        <select value={editForm.dataType || 'UInt16'} onChange={e => setEditForm({ ...editForm, dataType: e.target.value as ModbusDataType })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                            <option value="Boolean">Boolean</option>
                                            <option value="Int16">Int16</option>
                                            <option value="UInt16">UInt16</option>
                                            <option value="Int32">Int32</option>
                                            <option value="UInt32">UInt32</option>
                                            <option value="Float32">Float32</option>
                                            <option value="Float64">Float64</option>
                                            <option value="String">String</option>
                                        </select>
                                    </div>
                                    {['Int32', 'UInt32', 'Float32', 'Float64'].includes(editForm.dataType || 'UInt16') && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">字节序 (Endianness)</label>
                                            <select value={editForm.endianness || 'ABCD'} onChange={e => setEditForm({ ...editForm, endianness: e.target.value as any })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                <option value="ABCD">ABCD (Big Endian)</option>
                                                <option value="CDAB">CDAB (Little Endian Word Swap)</option>
                                                <option value="BADC">BADC (Big Endian Byte Swap)</option>
                                                <option value="DCBA">DCBA (Little Endian)</option>
                                            </select>
                                        </div>
                                    )}
                                    <div className="border-t border-slate-200 pt-4 mt-2">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-xs font-bold text-slate-500 uppercase">数据模拟 (Data Simulation)</label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={editForm.simulation?.enabled || false} onChange={e => setEditForm({ ...editForm, simulation: { ...(editForm.simulation || { type: 'random', interval: 1000 }), enabled: e.target.checked } })} className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                                                <span className="text-sm text-slate-600">启用模拟</span>
                                            </label>
                                        </div>
                                        {editForm.simulation?.enabled && (
                                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">模拟类型</label>
                                                    <select value={editForm.simulation.type} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, type: e.target.value as any } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none">
                                                        <option value="random">随机值 (Random)</option>
                                                        <option value="increment">递增 (Increment)</option>
                                                        <option value="decrement">递减 (Decrement)</option>
                                                        <option value="sinusoidal">正弦波 (Sinusoidal)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">更新间隔 (ms)</label>
                                                    <input type="number" value={editForm.simulation.interval} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, interval: parseInt(e.target.value, 10) || 1000 } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none" min="100" />
                                                </div>
                                                {editForm.simulation.type === 'random' && (
                                                    <>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">最小值</label>
                                                            <input type="number" value={editForm.simulation.min ?? 0} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, min: parseFloat(e.target.value) || 0 } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">最大值</label>
                                                            <input type="number" value={editForm.simulation.max ?? 100} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, max: parseFloat(e.target.value) || 100 } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                                        </div>
                                                    </>
                                                )}
                                                {(editForm.simulation.type === 'increment' || editForm.simulation.type === 'decrement') && (
                                                    <>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">步长 (Step)</label>
                                                            <input type="number" value={editForm.simulation.step ?? 1} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, step: parseFloat(e.target.value) || 1 } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">重置阈值 (Max/Min)</label>
                                                            <input type="number" value={editForm.simulation.max ?? 10000} onChange={e => setEditForm({ ...editForm, simulation: { ...editForm.simulation!, max: parseFloat(e.target.value) || 10000 } })} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button onClick={() => { setIsBatchAdding(false); setIsSingleAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors">取消</button>
                            <button onClick={() => {
                                if (isBatchAdding) handleBatchAdd();
                                else if (editingId) handleSave();
                                else {
                                    const prefix = editForm.name || '寄存器';
                                    const newReg: ModbusSlaveRegisterConfig = {
                                        id: Date.now().toString(),
                                        name: prefix,
                                        address: editForm.address || 0,
                                        type: editForm.type || activeTab,
                                        dataType: editForm.dataType || 'UInt16',
                                        endianness: editForm.endianness || 'ABCD',
                                        simulation: editForm.simulation
                                    };
                                    const updated = [...registers, newReg];
                                    onUpdateConfig(updated);
                                    setIsSingleAdding(false);
                                }
                            }} className={`px-6 py-2 rounded-lg text-sm font-bold text-white shadow-md transition-all ${isBatchAdding ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                                {isBatchAdding ? '确认创建' : editingId ? '保存修改' : '确认添加'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Write Modal */}
            <ModbusSlaveWriteModal
                isOpen={writeModalState.isOpen}
                onClose={() => setWriteModalState(prev => ({ ...prev, isOpen: false }))}
                title={writeModalState.title}
                initialValue={writeModalState.initialValue}
                onSave={(val) => {
                    if (writeModalState.reg) {
                        handleWriteValue(writeModalState.reg, val);
                    }
                    setWriteModalState(prev => ({ ...prev, isOpen: false }));
                }}
            />
        </div>
    );
}, (prev, next) => {
    // Optimization: Only re-render if the relevant parts of the session change
    return prev.session.id === next.session.id &&
           prev.session.status === next.session.status &&
           prev.session.config?.registers === next.session.config?.registers;
});
