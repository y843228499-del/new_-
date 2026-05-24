
import React, { useState, useEffect } from 'react';
import { X, Check, Activity, Clock, RotateCcw, Hash, Type, Zap, Calculator, Ruler, Layers, ArrowDown } from 'lucide-react';
import { ModbusFunctionCode, ModbusDataType, ModbusTriggerType, ModbusRegisterConfig } from '../../types';

interface ModbusAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (configs: Omit<ModbusRegisterConfig, 'id' | 'value' | 'status' | 'lastUpdate'>[]) => void;
    initialValues?: ModbusRegisterConfig; // Add support for editing
    defaultName?: string; // Auto-increment name support
    isEditing?: boolean;
}

// Updated with Chinese Labels
const FC_OPTIONS: { value: ModbusFunctionCode, label: string }[] = [
    { value: '01', label: '01 读取线圈 (Read Coils)' },
    { value: '02', label: '02 读取离散输入 (Read Discrete Inputs)' },
    { value: '03', label: '03 读取保持寄存器 (Read Holding Registers)' },
    { value: '04', label: '04 读取输入寄存器 (Read Input Registers)' },
    { value: '05', label: '05 写单线圈 (Write Single Coil)' },
    { value: '06', label: '06 写单寄存器 (Write Single Register)' },
    { value: '15', label: '15 写多线圈 (Write Multiple Coils)' },
    { value: '16', label: '16 写多寄存器 (Write Multiple Registers)' }
];

const DATA_TYPES: ModbusDataType[] = ['Int16', 'UInt16', 'Int32', 'UInt32', 'Float32', 'Float64', 'Boolean', 'String', 'Hex'];

export const ModbusAddModal: React.FC<ModbusAddModalProps> = ({ isOpen, onClose, onConfirm, initialValues, defaultName, isEditing = false }) => {
    const [name, setName] = useState('New Channel');
    const [fc, setFc] = useState<ModbusFunctionCode>('03');
    const [address, setAddress] = useState(0);
    const [length, setLength] = useState(1);
    const [dataType, setDataType] = useState<ModbusDataType>('UInt16');
    const [trigger, setTrigger] = useState<ModbusTriggerType>('Cyclic');
    const [triggerTag, setTriggerTag] = useState('');
    
    // Scan Rate & Unit
    const [scanRate, setScanRate] = useState(5); // Default 5
    const [scanRateUnit, setScanRateUnit] = useState<'ms' | 's'>('ms');
    
    const [retry, setRetry] = useState(3);
    
    // Engineering Units
    const [gain, setGain] = useState(1);
    const [offset, setOffset] = useState(0);
    const [unit, setUnit] = useState('');
    const [showScaling, setShowScaling] = useState(false);

    // Address Input Mode
    const [addrMode, setAddrMode] = useState<'DEC' | 'HEX'>('DEC');

    // Batch Mode State
    const [isBatch, setIsBatch] = useState(false);
    const [batchCount, setBatchCount] = useState(10);
    const [addressStep, setAddressStep] = useState(1);

    // Auto Data Type Selection & Step Calculation
    useEffect(() => {
        // Logic: Coils (01/02/05/15) MUST be Boolean
        if (['01', '02', '05', '15'].includes(fc)) {
            if (dataType !== 'Boolean') setDataType('Boolean');
            if (isBatch && !isEditing) setAddressStep(1);
        } else {
            // Registers default to UInt16 if previously set to Boolean
            if (dataType === 'Boolean') setDataType('UInt16');
        }
    }, [fc, isBatch, isEditing, dataType]);

    // Auto Step based on Data Type (Registers only)
    useEffect(() => {
        if (!isEditing && !['01', '02', '05', '15'].includes(fc)) {
            let recommendedStep = 1;
            if (['Int32', 'UInt32', 'Float32'].includes(dataType)) recommendedStep = 2;
            if (['Int64', 'UInt64', 'Float64'].includes(dataType)) recommendedStep = 4;
            setAddressStep(recommendedStep);
        }
    }, [dataType, fc, isEditing]);

    // Init values when opening
    useEffect(() => {
        if (isOpen) {
            if (initialValues && isEditing) {
                setName(initialValues.name);
                setFc(initialValues.functionCode);
                setAddress(initialValues.address);
                setLength(initialValues.length);
                setDataType(initialValues.dataType);
                setTrigger(initialValues.triggerType);
                setTriggerTag(initialValues.triggerTag || '');
                setScanRate(initialValues.scanRate);
                setScanRateUnit(initialValues.scanRateUnit || 'ms');
                setRetry(initialValues.retryCount);
                
                // Scaling
                setGain(initialValues.gain !== undefined ? initialValues.gain : 1);
                setOffset(initialValues.offset !== undefined ? initialValues.offset : 0);
                setUnit(initialValues.unit || '');
                
                // Auto-show scaling if non-default
                if ((initialValues.gain !== undefined && initialValues.gain !== 1) || 
                    (initialValues.offset !== undefined && initialValues.offset !== 0) || 
                    initialValues.unit) {
                    setShowScaling(true);
                }
                
                // Reset Batch
                setIsBatch(false);
            } else {
                // Reset defaults for new
                setName(defaultName || 'New Channel');
                setFc('03');
                setAddress(0);
                setLength(1);
                setTrigger('Cyclic');
                setTriggerTag('');
                setScanRate(5); // Default 5
                setScanRateUnit('ms');
                setRetry(3);
                setGain(1);
                setOffset(0);
                setUnit('');
                setShowScaling(false);
                setAddrMode('DEC'); 
                setIsBatch(false);
                setBatchCount(10);
            }
        }
    }, [isOpen, initialValues, isEditing, defaultName]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        const baseConfig = {
            functionCode: fc,
            length,
            dataType,
            triggerType: trigger,
            triggerTag: trigger === 'Event' ? triggerTag : undefined,
            scanRate,
            scanRateUnit,
            retryCount: retry,
            endianness: initialValues?.endianness || 'ABCD', // Use default or existing
            gain: showScaling ? gain : 1,
            offset: showScaling ? offset : 0,
            unit: showScaling ? unit : ''
        };

        const resultConfigs: any[] = [];

        if (isBatch && !isEditing) {
            // Smart Naming Logic
            const trimmedName = name.trim();
            const match = trimmedName.match(/^(.*?)(\d+)$/);
            
            let prefix = trimmedName;
            let startIdx = 1;

            if (match) {
                prefix = match[1];
                startIdx = parseInt(match[2], 10);
            } else {
                prefix = trimmedName ? trimmedName + " " : "Channel ";
            }

            for (let i = 0; i < batchCount; i++) {
                const currentAddr = address + (i * addressStep);
                const currentName = `${prefix}${startIdx + i}`;
                
                resultConfigs.push({
                    ...baseConfig,
                    name: currentName,
                    address: currentAddr
                });
            }
        } else {
            // Single
            resultConfigs.push({
                ...baseConfig,
                name,
                address
            });
        }

        onConfirm(resultConfigs);
        onClose();
    };

    const isCoil = ['01', '02', '05', '15'].includes(fc);

    const getBatchPreview = () => {
        const trimmedName = name.trim();
        const match = trimmedName.match(/^(.*?)(\d+)$/);
        let prefix = trimmedName;
        let startIdx = 1;
        if (match) {
            prefix = match[1];
            startIdx = parseInt(match[2], 10);
        } else {
            prefix = trimmedName ? trimmedName + " " : "Channel ";
        }
        return `${prefix}${startIdx}, ${prefix}${startIdx + 1} ...`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-amber-600" /> {isEditing ? '编辑通道 (Edit Channel)' : '添加通道 (Add Channel)'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Batch Toggle */}
                    {!isEditing && (
                        <div className="flex items-center justify-between bg-indigo-50 p-2 rounded-lg border border-indigo-100 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" checked={isBatch} onChange={e => setIsBatch(e.target.checked)} />
                                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                </div>
                                <span className="text-xs font-bold text-indigo-700 flex items-center gap-1"><Layers className="w-3.5 h-3.5"/> 批量生成模式 (Batch Mode)</span>
                            </label>
                            {isBatch && <span className="text-[10px] text-indigo-500 font-medium">将生成 {batchCount} 个通道</span>}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{isBatch ? '名称前缀 (Name Prefix)' : '通道名称 (Name)'}</label>
                        <input 
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-amber-500 outline-none" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder={isBatch ? "e.g. Channel" : "e.g. Channel 1"}
                        />
                        {isBatch && <p className="text-[10px] text-slate-400 mt-1">预览: {getBatchPreview()}</p>}
                    </div>

                    {/* Function Code & Trigger */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">功能码 (Function)</label>
                            <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white focus:border-amber-500 outline-none" value={fc} onChange={e => setFc(e.target.value as any)}>
                                {FC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">触发器 (Trigger)</label>
                            <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white focus:border-amber-500 outline-none" value={trigger} onChange={e => setTrigger(e.target.value as any)}>
                                <option value="Cyclic">循环执行 (Cyclic)</option>
                                <option value="Event">变量触发 (Variable)</option>
                            </select>
                        </div>
                    </div>

                    {/* Trigger Tag (Conditional) */}
                    {trigger === 'Event' && (
                        <div className="bg-amber-50 p-2 rounded border border-amber-200 animate-in fade-in slide-in-from-top-1">
                            <label className="block text-xs font-bold text-amber-700 uppercase mb-1 flex items-center gap-1"><Zap className="w-3 h-3"/> 触发变量 (Trigger Tag)</label>
                            <input 
                                className="w-full border border-amber-300 rounded px-3 py-1.5 text-sm outline-none focus:border-amber-500 placeholder:text-slate-400" 
                                value={triggerTag} 
                                onChange={e => setTriggerTag(e.target.value)} 
                                placeholder="输入变量名称..."
                            />
                        </div>
                    )}

                    {/* Address & Length & Type */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase">{isBatch ? '起始地址' : '起始地址'}</label>
                            </div>
                            <div className="relative">
                                <Hash className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded pl-8 pr-2 py-2 text-sm font-mono focus:border-amber-500 outline-none uppercase" 
                                    value={addrMode === 'HEX' ? address.toString(16).toUpperCase() : address.toString()} 
                                    onChange={e => {
                                        let val = e.target.value;
                                        if (addrMode === 'HEX') {
                                            val = val.replace(/[^0-9A-Fa-f]/g, ''); 
                                            if (val === '') setAddress(0);
                                            else setAddress(parseInt(val, 16));
                                        } else {
                                            val = val.replace(/[^0-9]/g, '');
                                            if (val === '') setAddress(0);
                                            else setAddress(parseInt(val, 10));
                                        }
                                    }} 
                                />
                                {addrMode === 'HEX' && <span className="absolute right-2 top-2.5 text-[10px] text-slate-400 font-bold bg-white px-1">0x</span>}
                            </div>
                            
                            {/* Hex/Dec Toggle */}
                            <div className="flex justify-end mt-1">
                                <div className="flex bg-slate-100 rounded p-0.5 border border-slate-200">
                                    <button onClick={() => setAddrMode('DEC')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${addrMode === 'DEC' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>DEC</button>
                                    <button onClick={() => setAddrMode('HEX')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${addrMode === 'HEX' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>HEX</button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">长度 (Length)</label>
                            <input type="number" min="1" className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono focus:border-amber-500 outline-none" value={length} onChange={e => setLength(Number(e.target.value))} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">数据类型</label>
                            <div className="relative">
                                <Type className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                                <select 
                                    className="w-full border border-slate-300 rounded pl-8 pr-2 py-2 text-sm bg-white focus:border-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-500" 
                                    value={dataType} 
                                    onChange={e => setDataType(e.target.value as any)}
                                    disabled={isCoil} // Lock type for Coils
                                >
                                    {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Batch Settings Row */}
                    {isBatch && (
                        <div className="grid grid-cols-2 gap-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                            <div>
                                <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">生成数量 (Count)</label>
                                <input type="number" min="1" max="1000" className="w-full border border-indigo-200 rounded px-3 py-1.5 text-sm font-bold text-indigo-700 focus:border-indigo-500 outline-none" value={batchCount} onChange={e => setBatchCount(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-indigo-700 uppercase mb-1 flex items-center gap-1"><ArrowDown className="w-3 h-3"/> 地址步长 (Step)</label>
                                <input type="number" min="0" className="w-full border border-indigo-200 rounded px-3 py-1.5 text-sm font-bold text-indigo-700 focus:border-indigo-500 outline-none" value={addressStep} onChange={e => setAddressStep(Number(e.target.value))} />
                                <p className="text-[9px] text-indigo-400 mt-1">例如: Addr, Addr+{addressStep}, Addr+{addressStep*2}...</p>
                            </div>
                        </div>
                    )}

                    {/* Scaling Section (Collapsible) */}
                    {!isCoil && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <button 
                                onClick={() => setShowScaling(!showScaling)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center gap-2"><Calculator className="w-3.5 h-3.5 text-indigo-500" /> 工程量变换 (Scaling)</div>
                                <span className="text-[10px] text-slate-400">{showScaling ? '收起' : '展开'}</span>
                            </button>
                            {showScaling && (
                                <div className="p-4 bg-white grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-1">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">增益 (Gain)</label>
                                        <input type="number" step="0.1" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-indigo-500" value={gain} onChange={e => setGain(Number(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">偏移 (Offset)</label>
                                        <input type="number" step="0.1" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-indigo-500" value={offset} onChange={e => setOffset(Number(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Ruler className="w-3 h-3"/> 单位 (Unit)</label>
                                        <input type="text" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:border-indigo-500" placeholder="e.g. °C" value={unit} onChange={e => setUnit(e.target.value)} />
                                    </div>
                                    <div className="col-span-3 text-[10px] text-slate-400 italic">
                                        公式: Result = (Raw * Gain) + Offset
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cycle & Retry */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> 循环周期 (Scan Rate)</label>
                            <div className="flex w-full">
                                <input 
                                    type="number" 
                                    min="1" 
                                    className="w-full border border-slate-300 border-r-0 rounded-l px-3 py-1.5 text-sm font-mono focus:border-amber-500 outline-none" 
                                    value={scanRate} 
                                    onChange={e => setScanRate(Number(e.target.value))} 
                                    disabled={trigger !== 'Cyclic'} 
                                />
                                <select
                                    className="border border-slate-300 border-l-0 rounded-r bg-slate-100 text-xs font-bold text-slate-600 px-2 py-1.5 outline-none focus:border-amber-500"
                                    value={scanRateUnit}
                                    onChange={e => setScanRateUnit(e.target.value as 'ms' | 's')}
                                    disabled={trigger !== 'Cyclic'}
                                >
                                    <option value="ms">ms</option>
                                    <option value="s">s</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><RotateCcw className="w-3 h-3"/> 重发次数</label>
                            <input type="number" min="0" max="10" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono focus:border-amber-500 outline-none" value={retry} onChange={e => setRetry(Number(e.target.value))} />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm transition-colors">取消</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-sm shadow-md transition-colors flex items-center gap-2">
                        <Check className="w-4 h-4" /> {isEditing ? '保存修改' : isBatch ? '批量生成' : '确认添加'}
                    </button>
                </div>
            </div>
        </div>
    );
};
