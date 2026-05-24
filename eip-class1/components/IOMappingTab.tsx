import React, { useState, useRef, useEffect } from 'react';
import { EipClass1Slave, EipClass1Connection } from '../../type-definitions/eip-class1';
import { PlusSquare, MinusSquare, Folder, ArrowRightCircle, ArrowLeftCircle } from 'lucide-react';

const DATA_TYPES: Record<string, number> = {
    'BYTE': 8, 'LREAL': 64, 'REAL': 32, 'LWORD': 64, 'DWORD': 32, 'WORD': 16,
    'ULINT': 64, 'LINT': 64, 'UDINT': 32, 'DINT': 32, 'USINT': 8, 'SINT': 8,
    'UINT': 16, 'INT': 16, 'BOOL': 1
};

interface Props {
    slave: EipClass1Slave;
    onWriteData?: (slaveId: string, connId: number, data: number[]) => void;
}

export const IOMappingTab: React.FC<Props> = ({ slave, onWriteData }) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [preparedValues, setPreparedValues] = useState<Record<string, string>>({});
    const [colWidths, setColWidths] = useState({
        variable: 256,
        channel: 256,
        type: 128,
        value: 128,
        prepared: 128,
        unit: 96
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

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedNodes(newExpanded);
    };

    const parseValue = (data: number[] | undefined, bitOffset: number, dataType: string, bitLength: number): string => {
        if (!data || data.length === 0) return '';
        const byteOffset = Math.floor(bitOffset / 8);
        const bitRemainder = bitOffset % 8;
        
        if (byteOffset >= data.length) return '';

        const baseTypeBits = DATA_TYPES[dataType] || 8;
        const typeSizeBytes = Math.ceil(baseTypeBits / 8);
        const requiredLength = byteOffset + typeSizeBytes;

        let buffer: Uint8Array;
        if (data.length < requiredLength) {
            buffer = new Uint8Array(requiredLength);
            buffer.set(data);
        } else {
            buffer = new Uint8Array(data);
        }

        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

        try {
            switch (dataType) {
                case 'BOOL':
                    return ((buffer[byteOffset] >> bitRemainder) & 1) ? '1' : '0';
                case 'SINT':
                    return view.getInt8(byteOffset).toString();
                case 'USINT':
                case 'BYTE':
                    return view.getUint8(byteOffset).toString();
                case 'INT':
                    if (byteOffset + 2 > buffer.length) return '';
                    return view.getInt16(byteOffset, true).toString();
                case 'UINT':
                case 'WORD':
                    if (byteOffset + 2 > buffer.length) return '';
                    return view.getUint16(byteOffset, true).toString();
                case 'DINT':
                    if (byteOffset + 4 > buffer.length) return '';
                    return view.getInt32(byteOffset, true).toString();
                case 'UDINT':
                case 'DWORD':
                    if (byteOffset + 4 > buffer.length) return '';
                    return view.getUint32(byteOffset, true).toString();
                case 'LINT':
                    if (byteOffset + 8 > buffer.length) return '';
                    return view.getBigInt64(byteOffset, true).toString();
                case 'ULINT':
                case 'LWORD':
                    if (byteOffset + 8 > buffer.length) return '';
                    return view.getBigUint64(byteOffset, true).toString();
                case 'REAL':
                    if (byteOffset + 4 > buffer.length) return '';
                    return view.getFloat32(byteOffset, true).toFixed(4);
                case 'LREAL':
                    if (byteOffset + 8 > buffer.length) return '';
                    return view.getFloat64(byteOffset, true).toFixed(4);
                default:
                    return '';
            }
        } catch (e) {
            return '';
        }
    };

    const renderTree = () => {
        const rows: React.ReactNode[] = [];

        slave.connections?.forEach(conn => {
            const connId = `conn_${conn.id}`;
            const isConnExpanded = expandedNodes.has(connId);

            // Connection Row
            rows.push(
                <tr key={connId} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-2 py-1.5 flex items-center gap-1">
                        <button onClick={() => toggleExpand(connId)} className="p-0.5 text-slate-500 hover:text-slate-800">
                            {isConnExpanded ? <MinusSquare className="w-3.5 h-3.5" /> : <PlusSquare className="w-3.5 h-3.5" />}
                        </button>
                        <Folder className="w-4 h-4 text-yellow-500 fill-yellow-200" />
                        <span className="text-xs font-semibold">{conn.name}</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                    <td className="px-2 py-1.5 text-xs"></td>
                </tr>
            );

            if (isConnExpanded) {
                let t2oBitOffset = 0;
                // T->O Dataset (Inputs)
                conn.t2oDataset?.forEach(item => {
                    const itemId = `${connId}_t2o_${item.id}`;
                    const baseTypeBits = DATA_TYPES[item.dataType] || 8;
                    const elementCount = Math.floor(item.bitLength / baseTypeBits);
                    const isArray = elementCount > 1;
                    const typeString = isArray ? `ARRAY [0..${elementCount - 1}] OF ${item.dataType}` : item.dataType;
                    const isItemExpanded = expandedNodes.has(itemId);
                    const currentOffset = t2oBitOffset;
                    t2oBitOffset += item.bitLength;

                    const itemValue = isArray ? '' : parseValue(conn.t2oData, currentOffset, item.dataType, item.bitLength);

                    rows.push(
                        <tr key={itemId} className="border-b border-slate-200 hover:bg-slate-50">
                            <td className="px-2 py-1.5 flex items-center gap-1 pl-6">
                                {isArray ? (
                                    <button onClick={() => toggleExpand(itemId)} className="p-0.5 text-slate-500 hover:text-slate-800">
                                        {isItemExpanded ? <MinusSquare className="w-3.5 h-3.5" /> : <PlusSquare className="w-3.5 h-3.5" />}
                                    </button>
                                ) : (
                                    <span className="w-4.5 inline-block"></span> // Spacer
                                )}
                                <ArrowRightCircle className="w-4 h-4 text-blue-500 bg-white rounded-full" />
                            </td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200">{item.name}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200">{typeString}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200 font-mono text-blue-600">{itemValue}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                            <td className="px-2 py-1.5 text-xs text-slate-500">{item.helpString}</td>
                        </tr>
                    );

                    if (isArray && isItemExpanded) {
                        for (let i = 0; i < elementCount; i++) {
                            const elemOffset = currentOffset + (i * baseTypeBits);
                            const elemValue = parseValue(conn.t2oData, elemOffset, item.dataType, baseTypeBits);
                            rows.push(
                                <tr key={`${itemId}_${i}`} className="border-b border-slate-200 hover:bg-slate-50">
                                    <td className="px-2 py-1.5 flex items-center gap-1 pl-12">
                                        <span className="w-4.5 inline-block"></span>
                                        <ArrowRightCircle className="w-4 h-4 text-blue-400 bg-white rounded-full" />
                                    </td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 text-slate-600">{`${item.name}[${i}]`}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 text-slate-600">{item.dataType}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 font-mono text-blue-600">{elemValue}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                                    <td className="px-2 py-1.5 text-xs"></td>
                                </tr>
                            );
                        }
                    }
                });

                let o2tBitOffset = 0;
                // O->T Dataset (Outputs)
                conn.o2tDataset?.forEach(item => {
                    const itemId = `${connId}_o2t_${item.id}`;
                    const baseTypeBits = DATA_TYPES[item.dataType] || 8;
                    const elementCount = Math.floor(item.bitLength / baseTypeBits);
                    const isArray = elementCount > 1;
                    const typeString = isArray ? `ARRAY [0..${elementCount - 1}] OF ${item.dataType}` : item.dataType;
                    const isItemExpanded = expandedNodes.has(itemId);
                    const currentOffset = o2tBitOffset;
                    o2tBitOffset += item.bitLength;

                    const itemValue = isArray ? '' : parseValue(conn.o2tData, currentOffset, item.dataType, item.bitLength);

                    rows.push(
                        <tr key={itemId} className="border-b border-slate-200 hover:bg-slate-50">
                            <td className="px-2 py-1.5 flex items-center gap-1 pl-6">
                                {isArray ? (
                                    <button onClick={() => toggleExpand(itemId)} className="p-0.5 text-slate-500 hover:text-slate-800">
                                        {isItemExpanded ? <MinusSquare className="w-3.5 h-3.5" /> : <PlusSquare className="w-3.5 h-3.5" />}
                                    </button>
                                ) : (
                                    <span className="w-4.5 inline-block"></span> // Spacer
                                )}
                                <ArrowLeftCircle className="w-4 h-4 text-emerald-500 bg-white rounded-full" />
                            </td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200">{item.name}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200">{typeString}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200 font-mono text-emerald-600">{itemValue}</td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200">
                                {!isArray && (
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-300 rounded px-1 py-0.5 outline-none focus:border-indigo-500"
                                        value={preparedValues[itemId] || ''}
                                        onChange={(e) => setPreparedValues(prev => ({ ...prev, [itemId]: e.target.value }))}
                                    />
                                )}
                            </td>
                            <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                            <td className="px-2 py-1.5 text-xs text-slate-500">{item.helpString}</td>
                        </tr>
                    );

                    if (isArray && isItemExpanded) {
                        for (let i = 0; i < elementCount; i++) {
                            const elemId = `${itemId}_${i}`;
                            const elemOffset = currentOffset + (i * baseTypeBits);
                            const elemValue = parseValue(conn.o2tData, elemOffset, item.dataType, baseTypeBits);
                            rows.push(
                                <tr key={elemId} className="border-b border-slate-200 hover:bg-slate-50">
                                    <td className="px-2 py-1.5 flex items-center gap-1 pl-12">
                                        <span className="w-4.5 inline-block"></span>
                                        <ArrowLeftCircle className="w-4 h-4 text-emerald-400 bg-white rounded-full" />
                                    </td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 text-slate-600">{`${item.name}[${i}]`}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 text-slate-600">{item.dataType}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200 font-mono text-emerald-600">{elemValue}</td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200">
                                        <input 
                                            type="text" 
                                            className="w-full border border-slate-300 rounded px-1 py-0.5 outline-none focus:border-indigo-500"
                                            value={preparedValues[elemId] || ''}
                                            onChange={(e) => setPreparedValues(prev => ({ ...prev, [elemId]: e.target.value }))}
                                        />
                                    </td>
                                    <td className="px-2 py-1.5 text-xs border-r border-slate-200"></td>
                                    <td className="px-2 py-1.5 text-xs"></td>
                                </tr>
                            );
                        }
                    }
                });
            }
        });

        return rows;
    };

    const handleWriteAll = () => {
        if (!onWriteData) return;
        
        slave.connections?.forEach(conn => {
            if (!conn.o2tData) return;
            
            const originalLength = conn.o2tData.length;
            let maxRequiredLength = originalLength;
            let o2tBitOffsetCheck = 0;
            conn.o2tDataset?.forEach(item => {
                const baseTypeBits = DATA_TYPES[item.dataType] || 8;
                const elementCount = Math.floor(item.bitLength / baseTypeBits);
                const isArray = elementCount > 1;
                const typeSizeBytes = Math.ceil(baseTypeBits / 8);
                
                if (isArray) {
                    const totalBytes = Math.ceil((elementCount * baseTypeBits) / 8);
                    const requiredLen = Math.floor(o2tBitOffsetCheck / 8) + totalBytes;
                    if (requiredLen > maxRequiredLength) {
                        maxRequiredLength = requiredLen;
                    }
                    o2tBitOffsetCheck += elementCount * baseTypeBits;
                } else {
                    const requiredLen = Math.floor(o2tBitOffsetCheck / 8) + typeSizeBytes;
                    if (requiredLen > maxRequiredLength) {
                        maxRequiredLength = requiredLen;
                    }
                    o2tBitOffsetCheck += item.bitLength;
                }
            });

            let hasChanges = false;
            const buffer = new Uint8Array(maxRequiredLength);
            buffer.set(conn.o2tData);
            const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            
            const processItem = (item: any, bitOffset: number, isArrayElem: boolean = false, arrayIdx: number = 0) => {
                const baseTypeBits = DATA_TYPES[item.dataType] || 8;
                const itemId = isArrayElem ? `conn_${conn.id}_o2t_${item.id}_${arrayIdx}` : `conn_${conn.id}_o2t_${item.id}`;
                const valStr = preparedValues[itemId];
                
                if (valStr !== undefined && valStr !== '') {
                    hasChanges = true;
                    const byteOffset = Math.floor(bitOffset / 8);
                    const bitRemainder = bitOffset % 8;
                    
                    try {
                        switch (item.dataType) {
                            case 'BOOL':
                                const bVal = (valStr === '1' || valStr.toLowerCase() === 'true') ? 1 : 0;
                                if (bVal) {
                                    buffer[byteOffset] |= (1 << bitRemainder);
                                } else {
                                    buffer[byteOffset] &= ~(1 << bitRemainder);
                                }
                                break;
                            case 'SINT':
                                view.setInt8(byteOffset, parseInt(valStr));
                                break;
                            case 'USINT':
                            case 'BYTE':
                                view.setUint8(byteOffset, parseInt(valStr));
                                break;
                            case 'INT':
                                view.setInt16(byteOffset, parseInt(valStr), true);
                                break;
                            case 'UINT':
                            case 'WORD':
                                view.setUint16(byteOffset, parseInt(valStr), true);
                                break;
                            case 'DINT':
                                view.setInt32(byteOffset, parseInt(valStr), true);
                                break;
                            case 'UDINT':
                            case 'DWORD':
                                view.setUint32(byteOffset, parseInt(valStr), true);
                                break;
                            case 'LINT':
                                view.setBigInt64(byteOffset, BigInt(valStr), true);
                                break;
                            case 'ULINT':
                            case 'LWORD':
                                view.setBigUint64(byteOffset, BigInt(valStr), true);
                                break;
                            case 'REAL':
                                view.setFloat32(byteOffset, parseFloat(valStr), true);
                                break;
                            case 'LREAL':
                                view.setFloat64(byteOffset, parseFloat(valStr), true);
                                break;
                        }
                    } catch (e) {
                        console.error("Error parsing value", e);
                    }
                }
            };

            let o2tBitOffset = 0;
            conn.o2tDataset?.forEach(item => {
                const baseTypeBits = DATA_TYPES[item.dataType] || 8;
                const elementCount = Math.floor(item.bitLength / baseTypeBits);
                const isArray = elementCount > 1;
                const currentOffset = o2tBitOffset;
                o2tBitOffset += item.bitLength;

                if (isArray) {
                    for (let i = 0; i < elementCount; i++) {
                        processItem(item, currentOffset + (i * baseTypeBits), true, i);
                    }
                } else {
                    processItem(item, currentOffset);
                }
            });

            if (hasChanges) {
                const finalData = Array.from(buffer.slice(0, originalLength));
                onWriteData(slave.id, conn.id as any, finalData);
            }
        });
        
        setPreparedValues({});
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs">
                <span className="font-medium text-slate-600">查找</span>
                <input type="text" className="border border-slate-300 rounded px-2 py-1 w-48 outline-none focus:border-indigo-500" placeholder="搜索变量..." />
                <span className="font-medium text-slate-600 ml-4">过滤</span>
                <select className="border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500">
                    <option>显示所有</option>
                </select>
                <div className="flex-1"></div>
                <button 
                    onClick={handleWriteAll}
                    className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-1"
                >
                    写入准备值
                </button>
            </div>
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left whitespace-nowrap border-collapse table-fixed">
                    <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th style={{ width: colWidths.variable }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                变量
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'variable')} />
                            </th>
                            <th style={{ width: colWidths.channel }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                通道
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'channel')} />
                            </th>
                            <th style={{ width: colWidths.type }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                类型
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'type')} />
                            </th>
                            <th style={{ width: colWidths.value }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                当前值
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'value')} />
                            </th>
                            <th style={{ width: colWidths.prepared }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                准备值
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'prepared')} />
                            </th>
                            <th style={{ width: colWidths.unit }} className="relative px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-r border-slate-200">
                                单位
                                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300" onMouseDown={(e) => handleMouseDown(e, 'unit')} />
                            </th>
                            <th className="px-2 py-1.5 text-xs font-medium text-slate-600 border-b border-slate-200">
                                描述
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderTree()}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
