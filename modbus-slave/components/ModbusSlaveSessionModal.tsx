import React, { useState, useEffect } from 'react';
import { Server, X } from 'lucide-react';
import { ModbusSlaveSessionInfo } from '../../types';
import { modbusSlaveService } from '../services/modbusSlaveService';
import { modbusService } from '../../modbus/services/modbusService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (session: Partial<ModbusSlaveSessionInfo>) => void;
    initialData?: ModbusSlaveSessionInfo | null;
}

export const ModbusSlaveSessionModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState({
        name: 'New Slave',
        transport: 'TCP' as 'TCP' | 'RTU' | 'ASCII',
        // TCP Settings
        port: 502,
        localBindIp: '0.0.0.0',
        ignoreUnitId: false,
        // RTU Settings
        comPort: '',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none' as 'none' | 'even' | 'mark' | 'odd' | 'space',
        
        unitId: 1,
        memorySize: 20000,
    });
    const [localIps, setLocalIps] = useState<string[]>([]);
    const [comPorts, setComPorts] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [ips, ports] = await Promise.all([
                    modbusSlaveService.getLocalIps(),
                    modbusService.getComPorts()
                ]);
                setLocalIps(ips);
                setComPorts(ports);
                if (ports.length > 0 && !formData.comPort) {
                    setFormData(prev => ({ ...prev, comPort: ports[0] }));
                }
            } catch (err) {
                console.error("Failed to fetch local data:", err);
            }
        };
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    name: initialData.name,
                    transport: initialData.transport || 'TCP',
                    port: initialData.port || 502,
                    localBindIp: initialData.localBindIp || '0.0.0.0',
                    ignoreUnitId: initialData.ignoreUnitId || false,
                    comPort: initialData.comPort || (comPorts[0] || ''),
                    baudRate: initialData.baudRate || 9600,
                    dataBits: initialData.dataBits || 8,
                    stopBits: initialData.stopBits || 1,
                    parity: initialData.parity || 'none',
                    unitId: initialData.unitId,
                    memorySize: (initialData as any).memorySize || 20000,
                });
            } else {
                setFormData({
                    name: 'New Slave',
                    transport: 'TCP',
                    port: 502,
                    localBindIp: '0.0.0.0',
                    ignoreUnitId: false,
                    comPort: comPorts[0] || '',
                    baudRate: 9600,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none',
                    unitId: 1,
                    memorySize: 20000,
                });
            }
        }
    }, [isOpen, initialData, comPorts]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Server className="w-5 h-5 text-amber-600" />
                        {initialData ? '编辑从站配置' : '新建 Modbus 从站'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">实例名称</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                            placeholder="例如: 模拟设备 A"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">传输协议 (Transport)</label>
                        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                            <button
                                onClick={() => setFormData({ ...formData, transport: 'TCP' })}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${formData.transport === 'TCP' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Modbus TCP
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, transport: 'RTU' })}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${formData.transport === 'RTU' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Modbus RTU
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, transport: 'ASCII' })}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${formData.transport === 'ASCII' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Modbus ASCII
                            </button>
                        </div>
                    </div>

                    {formData.transport === 'TCP' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">网卡监听 IP 地址</label>
                                <select
                                    value={formData.localBindIp}
                                    onChange={e => setFormData({ ...formData, localBindIp: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow font-mono bg-white"
                                >
                                    <option value="0.0.0.0">0.0.0.0 (所有网卡)</option>
                                    {localIps.map(ip => (
                                        <option key={ip} value={ip}>{ip}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">监听端口 (Port)</label>
                                <input
                                    type="number"
                                    value={formData.port}
                                    onChange={e => setFormData({ ...formData, port: parseInt(e.target.value, 10) })}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                                    placeholder="默认: 502"
                                />
                            </div>
                            <div className="flex items-center mt-2">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.ignoreUnitId}
                                        onChange={e => setFormData({ ...formData, ignoreUnitId: e.target.checked })}
                                        className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500 mr-2"
                                    />
                                    <span className="text-sm font-medium text-slate-700">忽略站号 (Ignore Unit ID)</span>
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">串口 (COM Port)</label>
                                <select
                                    value={formData.comPort}
                                    onChange={e => setFormData({ ...formData, comPort: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow font-mono bg-white"
                                >
                                    {comPorts.length === 0 && <option value="">未检测到串口</option>}
                                    {comPorts.map(port => (
                                        <option key={port} value={port}>{port}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">波特率 (Baud Rate)</label>
                                    <select
                                        value={formData.baudRate}
                                        onChange={e => setFormData({ ...formData, baudRate: parseInt(e.target.value, 10) })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow bg-white"
                                    >
                                        {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">数据位 (Data Bits)</label>
                                    <select
                                        value={formData.dataBits}
                                        onChange={e => setFormData({ ...formData, dataBits: parseInt(e.target.value, 10) })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow bg-white"
                                    >
                                        {[5, 6, 7, 8].map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">停止位 (Stop Bits)</label>
                                    <select
                                        value={formData.stopBits}
                                        onChange={e => setFormData({ ...formData, stopBits: parseInt(e.target.value, 10) })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow bg-white"
                                    >
                                        {[1, 1.5, 2].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">校验 (Parity)</label>
                                    <select
                                        value={formData.parity}
                                        onChange={e => setFormData({ ...formData, parity: e.target.value as any })}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow bg-white"
                                    >
                                        <option value="none">None</option>
                                        <option value="even">Even</option>
                                        <option value="odd">Odd</option>
                                        <option value="mark">Mark</option>
                                        <option value="space">Space</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">站号 (Unit ID)</label>
                        <input
                            type="number"
                            value={formData.unitId}
                            onChange={e => setFormData({ ...formData, unitId: parseInt(e.target.value, 10) })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                            placeholder="默认: 1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">内存大小 (Registers/Coils)</label>
                        <input
                            type="number"
                            value={formData.memorySize}
                            onChange={e => setFormData({ ...formData, memorySize: parseInt(e.target.value, 10) })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                            placeholder="默认: 20000"
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">
                        取消
                    </button>
                    <button
                        onClick={() => onSave(formData)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-sm shadow-amber-600/20 transition-all"
                    >
                        {initialData ? '保存修改' : '创建从站'}
                    </button>
                </div>
            </div>
        </div>
    );
};
