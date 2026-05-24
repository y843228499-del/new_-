import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ModbusSlaveSessionInfo, ConnectionStatus } from '../../types';
import { Activity, Server, Database, AlertTriangle, Hash, Clock, Terminal, Trash2, Users, Info, Globe, RefreshCw, Settings, Zap, Play, Pause, Download, ArrowDown } from 'lucide-react';
import { modbusSlaveService } from '../services/modbusSlaveService';

export const ModbusSlaveDashboard = React.memo(({ session, onUpdateSession, onViewRegisters }: { 
    session: ModbusSlaveSessionInfo, 
    onUpdateSession: (updated: ModbusSlaveSessionInfo) => void,
    onViewRegisters: () => void
}) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    const [localIps, setLocalIps] = useState<string[]>([]);
    useEffect(() => {
        let isMounted = true;
        const fetchIps = async () => {
            try {
                const ips = await modbusSlaveService.getLocalIps();
                if (isMounted) setLocalIps(ips);
            } catch (err) {
                console.error("Failed to fetch local IPs:", err);
            }
        };
        fetchIps();
        return () => { isMounted = false; };
    }, []);

    return (
        <div className="p-6 h-full overflow-y-auto bg-slate-50 flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <Server className="w-6 h-6 text-amber-600" />
                        <div className="flex flex-col">
                            <input 
                                type="text" 
                                value={session.name} 
                                onChange={e => onUpdateSession({ ...session, name: e.target.value })}
                                className="text-xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none transition-colors"
                                placeholder="从站名称"
                            />
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {session.id}</div>
                        </div>
                    </div>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm relative">
                        {/* Sliding highlight */}
                        <div 
                            className="absolute bg-amber-600 rounded-lg shadow-md shadow-amber-600/20 transition-all duration-300 ease-in-out"
                            style={{
                                width: 'calc((100% - 8px) / 3)',
                                height: 'calc(100% - 8px)',
                                left: session.transport === 'TCP' ? '4px' : session.transport === 'RTU' ? 'calc(4px + (100% - 8px) / 3)' : 'calc(4px + 2 * (100% - 8px) / 3)',
                                top: '4px'
                            }}
                        />
                        <button
                            disabled={isConnected}
                            onClick={() => onUpdateSession({ ...session, transport: 'TCP' })}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative z-10 flex-1 ${
                                session.transport === 'TCP'
                                    ? 'text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                            } disabled:opacity-50`}
                        >
                            TCP
                        </button>
                        <button
                            disabled={isConnected}
                            onClick={() => onUpdateSession({ ...session, transport: 'RTU' })}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative z-10 flex-1 ${
                                session.transport === 'RTU'
                                    ? 'text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                            } disabled:opacity-50`}
                        >
                            RTU
                        </button>
                        <button
                            disabled={isConnected}
                            onClick={() => onUpdateSession({ ...session, transport: 'ASCII' })}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative z-10 flex-1 ${
                                session.transport === 'ASCII'
                                    ? 'text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                            } disabled:opacity-50`}
                        >
                            ASCII
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={async () => {
                            if (!isConnected) return;
                            try {
                                // Fill first 10 holding registers with random values
                                const randomValues = Array.from({ length: 10 }, () => Math.floor(Math.random() * 1000));
                                await modbusSlaveService.writeMemory(session.id, 'holding', 0, randomValues, session.transport);
                                alert("已向寄存器 0-9 写入随机测试数据。");
                            } catch (err) {
                                console.error("Failed to write test data:", err);
                            }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-colors ${
                            isConnected 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' 
                                : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                        }`}
                        disabled={!isConnected}
                    >
                        <RefreshCw className={`w-4 h-4 ${isConnected ? 'animate-spin-slow' : ''}`} />
                        写入测试数据
                    </button>
                    <button 
                        onClick={onViewRegisters}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg border border-amber-200 text-sm font-bold hover:bg-amber-200 transition-colors"
                    >
                        <Database className="w-4 h-4" />
                        查看寄存器数据
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 text-xs">
                        <Info className="w-4 h-4" />
                        <span>提示：多个从站可运行在不同端口，模拟多台独立设备。</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${isConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">服务状态</div>
                        <div className={`text-lg font-black ${isConnected ? 'text-emerald-600' : 'text-slate-600'}`}>
                            {isConnected ? '运行中' : '已停止'}
                        </div>
                    </div>
                </div>

                {session.transport === 'TCP' ? (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">网卡监听 IP 地址</div>
                                <button 
                                    onClick={async () => {
                                        try {
                                            const ips = await modbusSlaveService.getLocalIps();
                                            setLocalIps(ips);
                                        } catch (err) {
                                            console.error("Failed to refresh IPs:", err);
                                        }
                                    }}
                                    className="p-1 text-slate-400 hover:text-amber-500 transition-colors"
                                    title="刷新网卡列表"
                                    disabled={isConnected}
                                >
                                    <RefreshCw className={`w-3 h-3 ${isConnected ? 'opacity-20' : ''}`} />
                                </button>
                            </div>
                            <select 
                                disabled={isConnected}
                                value={session.localBindIp || '0.0.0.0'} 
                                onChange={e => onUpdateSession({ ...session, localBindIp: e.target.value })}
                                className={`w-full text-sm font-black bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none transition-colors truncate ${isConnected ? 'text-slate-500 cursor-not-allowed' : 'text-slate-700'}`}
                            >
                                <option value="0.0.0.0">0.0.0.0 (所有网卡)</option>
                                {localIps.map(ip => (
                                    <option key={ip} value={ip}>{ip}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
                            <Info className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">传输模式</div>
                            <div className="text-lg font-black text-emerald-600">Modbus {session.transport}</div>
                        </div>
                    </div>
                )}

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">站号 (Unit ID)</div>
                        <input 
                            type="number" 
                            disabled={isConnected}
                            value={session.unitId} 
                            onChange={e => onUpdateSession({ ...session, unitId: parseInt(e.target.value, 10) || 1 })}
                            className={`w-24 text-lg font-black bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none transition-colors ${isConnected ? 'text-slate-500 cursor-not-allowed' : 'text-slate-700'}`}
                        />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-amber-100 text-amber-600">
                        {session.transport === 'TCP' ? <Users className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                            {session.transport === 'TCP' ? '已连接主站' : '串口状态'}
                        </div>
                        <div className="text-lg font-black text-amber-600">
                            {session.transport === 'TCP' ? session.clientCount || 0 : '运行正常'}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-indigo-100 text-indigo-600">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">存储空间</div>
                        <input 
                            type="number" 
                            disabled={isConnected}
                            value={session.memorySize || 20000} 
                            onChange={e => onUpdateSession({ ...session, memorySize: parseInt(e.target.value, 10) || 20000 })}
                            className={`w-24 text-lg font-black bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none transition-colors ${isConnected ? 'text-slate-500 cursor-not-allowed' : 'text-slate-700'}`}
                        />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-slate-100 text-slate-600">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">监控变量</div>
                        <div className="text-lg font-black text-slate-700">{session.config?.registers?.length || 0}</div>
                    </div>
                </div>

                {session.transport === 'TCP' ? (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
                            <Hash className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">监听端口</div>
                            <input 
                                type="number" 
                                disabled={isConnected}
                                value={session.port} 
                                onChange={e => onUpdateSession({ ...session, port: parseInt(e.target.value, 10) || 502 })}
                                className={`w-24 text-lg font-black bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none transition-colors ${isConnected ? 'text-slate-500 cursor-not-allowed' : 'text-slate-700'}`}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">串口配置</div>
                            <div className="text-sm font-black text-slate-700 truncate">
                                {session.comPort || '未选择'} ({session.baudRate})
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                                {session.dataBits}, {session.parity}, {session.stopBits}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isConnected && session.clients && session.clients.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-500" />
                        当前连接的主站列表
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {session.clients.map((client, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-sm font-mono text-slate-700">{client.ip}</span>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Port: {client.port}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {session.lastError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-8">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-red-800 mb-1">最后一次错误</h3>
                        <p className="text-xs text-red-600 font-mono">{session.lastError}</p>
                    </div>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.session.id === next.session.id &&
           prev.session.name === next.session.name &&
           prev.session.status === next.session.status &&
           prev.session.transport === next.session.transport &&
           prev.session.localBindIp === next.session.localBindIp &&
           prev.session.unitId === next.session.unitId &&
           prev.session.clientCount === next.session.clientCount &&
           prev.session.memorySize === next.session.memorySize &&
           prev.session.port === next.session.port &&
           prev.session.comPort === next.session.comPort &&
           prev.session.baudRate === next.session.baudRate &&
           prev.session.dataBits === next.session.dataBits &&
           prev.session.parity === next.session.parity &&
           prev.session.stopBits === next.session.stopBits &&
           prev.session.config?.registers?.length === next.session.config?.registers?.length &&
           prev.session.lastError === next.session.lastError &&
           JSON.stringify(prev.session.clients) === JSON.stringify(next.session.clients);
});
