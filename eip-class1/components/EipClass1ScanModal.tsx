import React, { useState, useEffect } from 'react';
import { X, Search, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight, Plus, WifiOff, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EdsEntry } from '../services/edsLibraryService';
import { EipClass1Slave } from '../../type-definitions/eip-class1';

interface DiscoveredDevice {
    ipAddress: string;
    productName: string;
    vendorId: number;
    deviceType: number;
    productCode: number;
    majorRevision: number;
    minorRevision: number;
    serialNumber: number;
}

interface Props {
    library: EdsEntry[];
    existingSlaves: EipClass1Slave[];
    onClose: () => void;
    onAddDevices: (
        additions: {device: DiscoveredDevice, match?: EdsEntry}[],
        overwrites: {device: DiscoveredDevice, match?: EdsEntry, existingId: string}[]
    ) => void;
}

export const EipClass1ScanModal: React.FC<Props> = ({ library, existingSlaves, onClose, onAddDevices }) => {
    const [scanning, setScanning] = useState(false);
    const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
    const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
    const [actionMap, setActionMap] = useState<Record<string, string>>({}); // string can be 'add' or existingId

    const scanNetwork = async () => {
        if (!(window as any).electronAPI || scanning) return;
        setScanning(true);
        setDevices([]);
        setSelectedIps(new Set());
        setActionMap({});
        toast.info('正在扫描网络中的设备...', { id: 'scan-toast' });
        try {
            const res = await (window as any).electronAPI.eipClass1Scan(3000); // 3 seconds timeout
            if (res.success) {
                setDevices(res.devices);
                
                // Pre-select devices that are NOT in existing config
                const autoSelect = new Set<string>();
                const newActionMap: Record<string, string> = {};
                
                res.devices.forEach((d: DiscoveredDevice) => {
                    const slavesForIp = existingSlaves.filter(s => s.ipAddress === d.ipAddress);
                    if (slavesForIp.length === 0) {
                        autoSelect.add(d.ipAddress);
                        newActionMap[d.ipAddress] = 'add';
                    }
                });
                
                setSelectedIps(autoSelect);
                setActionMap(newActionMap);
                
                if (res.devices.length > 0) {
                    toast.success(`扫描完成，找到 ${res.devices.length} 个设备`, { id: 'scan-toast' });
                } else {
                    toast.error('未扫描到任何设备，请检查网络连接', { id: 'scan-toast' });
                }
            } else {
                toast.error(`扫描失败`, { id: 'scan-toast' });
            }
        } catch (error: any) {
            toast.error(`扫描异常: ${error.message}`, { id: 'scan-toast' });
        } finally {
            setScanning(false);
        }
    };

    useEffect(() => {
        scanNetwork();
    }, []);

    const findMatch = (device: DiscoveredDevice) => {
        return library.find(entry => 
            Number(entry.vendorId) === Number(device.vendorId) && 
            Number(entry.deviceType) === Number(device.deviceType) &&
            Number(entry.productCode) === Number(device.productCode)
        );
    };

    const toggleSelection = (ip: string) => {
        const next = new Set(selectedIps);
        if (next.has(ip)) {
            next.delete(ip);
        } else {
            next.add(ip);
            if (!actionMap[ip]) {
                const slavesForIp = existingSlaves.filter(s => s.ipAddress === ip);
                setActionMap(prev => ({ ...prev, [ip]: slavesForIp.length === 1 ? slavesForIp[0].id : 'add' }));
            }
        }
        setSelectedIps(next);
    };

    const toggleAll = () => {
        const scannableIps = allIps.filter(ip => devices.find(d => d.ipAddress === ip));
        
        if (selectedIps.size === scannableIps.length && scannableIps.length > 0) {
            setSelectedIps(new Set());
        } else {
            const next = new Set<string>();
            const newActionMap = { ...actionMap };
            scannableIps.forEach(ip => {
                next.add(ip);
                if (!newActionMap[ip]) {
                    const slavesForIp = existingSlaves.filter(s => s.ipAddress === ip);
                    newActionMap[ip] = slavesForIp.length === 1 ? slavesForIp[0].id : 'add';
                }
            });
            setSelectedIps(next);
            setActionMap(newActionMap);
        }
    };

    const handleBatchAdd = () => {
        const additions: {device: DiscoveredDevice, match?: EdsEntry}[] = [];
        const overwrites: {device: DiscoveredDevice, match?: EdsEntry, existingId: string}[] = [];
        
        devices.forEach(d => {
            if (selectedIps.has(d.ipAddress)) {
                const match = findMatch(d);
                const action = actionMap[d.ipAddress] || 'add';
                
                if (action !== 'add') {
                    overwrites.push({ device: d, match, existingId: action });
                } else {
                    additions.push({ device: d, match });
                }
            }
        });
        
        if (additions.length > 0 || overwrites.length > 0) {
            onAddDevices(additions, overwrites);
            toast.success(`已添加 ${additions.length} 个实例，更新 ${overwrites.length} 个实例`);
        }
    };

    // Calculate unified IPs
    const allIps = Array.from(new Set([
        ...devices.map(d => d.ipAddress),
        ...existingSlaves.map(s => s.ipAddress)
    ])).sort((a, b) => {
        const ipA = a.split('.').map(Number);
        const ipB = b.split('.').map(Number);
        for (let i = 0; i < 4; i++) {
            if (ipA[i] !== ipB[i]) return ipA[i] - ipB[i];
        }
        return 0;
    });

    const isAllSelected = allIps.filter(ip => devices.find(d => d.ipAddress === ip)).length > 0 && 
                          selectedIps.size === allIps.filter(ip => devices.find(d => d.ipAddress === ip)).length;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1200px] max-h-[85vh] flex flex-col overflow-hidden ring-1 ring-slate-200">
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                            <Search className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">扫描目标设备</h2>
                            <p className="text-xs text-slate-500 font-medium">通过 EtherNet/IP ListIdentity 发现网络设备，与当前组态设备对比并进行添加或覆盖</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={scanNetwork} 
                            disabled={scanning}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                            {scanning ? '扫描中...' : '重新扫描'}
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 p-6 flex flex-col">
                    {scanning && devices.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <RefreshCw className="w-10 h-10 animate-spin mb-4 text-indigo-200" />
                            <p className="text-sm font-medium">正在发送广播寻找设备...</p>
                        </div>
                    ) : allIps.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                <Search className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-sm font-medium">网络中没有发现设备，且组态中为空</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                                            <th className="p-3 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isAllSelected} 
                                                    onChange={toggleAll}
                                                    disabled={devices.length === 0}
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                                />
                                            </th>
                                            <th className="p-3 w-36">IP地址</th>
                                            <th className="p-3 border-l text-indigo-700 bg-indigo-50/50">🔍 扫描到的设备 (在网)</th>
                                            <th className="p-3 border-l text-amber-700 bg-amber-50/50 w-64">📁 设备组态中的设备 (本地)</th>
                                            <th className="p-3 border-l w-48">⚙️ 动作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm divide-y divide-slate-100">
                                        {allIps.map((ip) => {
                                            const scannedDevice = devices.find(d => d.ipAddress === ip);
                                            const matchingSlaves = existingSlaves.filter(s => s.ipAddress === ip);
                                            const isSelected = selectedIps.has(ip);
                                            const action = actionMap[ip] || 'add';
                                            
                                            let match: EdsEntry | undefined;
                                            let isVersionMismatch = false;
                                            
                                            if (scannedDevice) {
                                                match = findMatch(scannedDevice);
                                                isVersionMismatch = match ? (match.majorRevision !== scannedDevice.majorRevision || match.minorRevision !== scannedDevice.minorRevision) : false;
                                            }
                                            
                                            return (
                                                <tr key={ip} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/20' : ''}`} onClick={() => { if (scannedDevice) toggleSelection(ip); }}>
                                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                        {scannedDevice ? (
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isSelected}
                                                                onChange={() => toggleSelection(ip)}
                                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-1"
                                                            />
                                                        ) : (
                                                            <div className="w-4 h-4 m-auto"></div>
                                                        )}
                                                    </td>
                                                    
                                                    <td className="p-3 font-mono text-sm text-indigo-600 font-bold whitespace-nowrap">
                                                        {ip}
                                                    </td>
                                                    
                                                    {/* Scanned Device */}
                                                    <td className="p-3 border-l">
                                                        {scannedDevice ? (
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="font-semibold text-slate-800">{scannedDevice.productName}</span>
                                                                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                                                    <span>v{scannedDevice.majorRevision}.{scannedDevice.minorRevision}</span>
                                                                    <span>{scannedDevice.vendorId}/{scannedDevice.deviceType}/{scannedDevice.productCode}</span>
                                                                </div>
                                                                <div>
                                                                    {match ? (
                                                                        isVersionMismatch ? (
                                                                            <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] border border-amber-200" title={`匹配到: ${match.productName} (v${match.majorRevision}.${match.minorRevision})`}>
                                                                                <AlertTriangle className="w-3 h-3" /> 版本不符: {match.productName}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200">
                                                                                <CheckCircle2 className="w-3 h-3" /> EDS完全匹配
                                                                            </span>
                                                                        )
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">
                                                                            <X className="w-3 h-3" /> 无匹配EDS
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-red-400 text-xs font-semibold py-2">
                                                                <WifiOff className="w-4 h-4" /> 未扫描到在网设备 (设备离线)
                                                            </div>
                                                        )}
                                                    </td>
                                                    
                                                    {/* Configured Device */}
                                                    <td className="p-3 border-l align-top">
                                                        {matchingSlaves.length > 0 ? (
                                                            <div className="flex flex-col gap-1.5">
                                                                {matchingSlaves.map(s => (
                                                                    <div key={s.id} className="text-xs font-semibold text-slate-700 bg-amber-50 px-2 py-1.5 rounded flex items-center justify-between border border-amber-100">
                                                                        <span className="truncate pr-2" title={s.name}>{s.name}</span>
                                                                        <span className="text-[10px] bg-white px-1.5 rounded text-slate-500 shrink-0 border border-slate-200">ID: {s.id.substring(0,4)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 text-xs italic py-2 inline-block">未组态此设备</span>
                                                        )}
                                                    </td>
                                                    
                                                    {/* Action */}
                                                    <td className="p-3 border-l" onClick={(e) => e.stopPropagation()}>
                                                        {scannedDevice && isSelected ? (
                                                            <select 
                                                                className="w-full text-xs font-semibold border border-slate-200 rounded p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-indigo-50/50 text-indigo-700 shadow-sm cursor-pointer"
                                                                value={action}
                                                                onChange={(e) => setActionMap(prev => ({ ...prev, [ip]: e.target.value }))}
                                                            >
                                                                <option value="add">➕ 新增为新实例</option>
                                                                {matchingSlaves.length > 0 && (
                                                                    <optgroup label="覆盖现有实例">
                                                                        {matchingSlaves.map(s => (
                                                                            <option key={s.id} value={s.id}>🔄 覆盖 "{s.name}"</option>
                                                                        ))}
                                                                    </optgroup>
                                                                )}
                                                            </select>
                                                        ) : (
                                                            <div className="px-2 py-1.5 text-xs text-slate-300 text-center">
                                                                {scannedDevice ? '- 未勾选 -' : '- 无法操作 -'}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
                
                {(allIps.length > 0) && (
                    <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                        <div className="text-sm text-slate-600 font-medium">
                            待处理 <span className="font-bold text-indigo-600">{selectedIps.size}</span> 个设备
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={onClose}
                                className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded shadow-sm transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleBatchAdd}
                                disabled={selectedIps.size === 0}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded shadow-sm transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                确定添加 ({selectedIps.size})
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

