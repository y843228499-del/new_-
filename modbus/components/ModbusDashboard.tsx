
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Gauge, Server, Hash, Clock, ArrowDownCircle, ArrowUpCircle, Zap, AlertTriangle, Timer, BarChart3, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { ModbusSessionInfo, ConnectionStatus, ModbusRegisterConfig } from '../../types';
import { modbusService } from '../services/modbusService';

interface ModbusDashboardProps {
    session: ModbusSessionInfo;
}

// Helper: Format Uptime
const formatUptime = (start?: number) => {
    if (!start) return '--:--:--';
    const now = Date.now();
    const diff = Math.floor((now - start) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m}m ${s}s`;
};

// Helper: Generate Sparkline SVG
const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    if (!data || data.length < 2) return <div className="w-full h-8 bg-slate-50 rounded"></div>;
    const width = 100;
    const height = 30;
    const max = Math.max(...data, 1);
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (d / max) * height;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
            <polyline fill="none" stroke={color} strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export const ModbusDashboard: React.FC<ModbusDashboardProps> = ({ session }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    const registers = session.config.registers;

    const [uptimeStr, setUptimeStr] = useState('--:--:--');
    const [ops, setOps] = useState(0);
    const [opsHistory, setOpsHistory] = useState<number[]>(new Array(20).fill(0));
    
    const [totalRequestsState, setTotalRequestsState] = useState(0);
    const [totalErrorsState, setTotalErrorsState] = useState(0);
    const [currentAvgLatencyState, setCurrentAvgLatencyState] = useState(0);
    const [displayRegisters, setDisplayRegisters] = useState<any[]>(registers);

    // Adaptive Latency Display
    const [displayLatency, setDisplayLatency] = useState(0);
    const lastLatencyUpdateRef = useRef(0);
    
    // Use refs to calculate delta OPS without dependency cycle
    const prevTotalReqRef = useRef(0);
    const sessionRef = useRef(session);
    const valuesRef = useRef<Record<string, any>>({});

    useEffect(() => { sessionRef.current = session; }, [session]);

    useEffect(() => {
        valuesRef.current = {};
        prevTotalReqRef.current = 0;

        const removeListener = modbusService.onDataReceived((data) => {
            if (data.sessionId === session.id) {
                // Update local stats from incoming data
                Object.keys(data.updates).forEach(regId => {
                    const update = data.updates[regId];
                    const existing = valuesRef.current[regId] || { requestCount: 0 };
                    
                    valuesRef.current[regId] = {
                        ...existing,
                        requestCount: existing.requestCount + 1,
                        lastLatency: update.lastLatency !== undefined ? update.lastLatency : existing.lastLatency,
                        errorCount: update.status === 'Bad' ? (existing.errorCount || 0) + 1 : (existing.errorCount || 0)
                    };
                });
            }
        });

        const timer = setInterval(() => {
            const currentSession = sessionRef.current;
            // Uptime
            setUptimeStr(formatUptime(currentSession.connectTime));

            // Aggregated Stats from local valuesRef
            const allValues = Object.values(valuesRef.current);
            const currentTotal = allValues.reduce((acc, v) => acc + (v.requestCount || 0), 0);
            const totalErrors = allValues.reduce((acc, v) => acc + (v.errorCount || 0), 0);
            
            const delta = Math.max(0, currentTotal - prevTotalReqRef.current);
            setOps(delta);
            prevTotalReqRef.current = currentTotal;
            setOpsHistory(prev => {
                const newHistory = [...prev.slice(1), delta];
                return newHistory;
            });

            // Latency
            const activeLatencies = allValues
                .map(v => v.lastLatency)
                .filter(l => l !== undefined) as number[];
            
            const avgLat = activeLatencies.length > 0 
                ? Math.round(activeLatencies.reduce((acc, l) => acc + l, 0) / activeLatencies.length)
                : 0;
            
            setCurrentAvgLatencyState(avgLat);
            setTotalRequestsState(currentTotal);
            setTotalErrorsState(totalErrors);

            // Update display registers for Channel Monitor
            const updatedRegs = currentSession.config.registers.map(r => {
                const v = valuesRef.current[r.id];
                if (v) {
                    return { ...r, ...v };
                }
                return r;
            });
            setDisplayRegisters(updatedRegs);

        }, 1000);
        
        return () => {
            removeListener();
            clearInterval(timer);
        };
    }, [session.id]);

    // Derived Stats
    const totalRequests = totalRequestsState;
    const totalErrors = totalErrorsState;
    const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00';

    const currentAvgLatency = currentAvgLatencyState;

    // Throttled update for visual latency (Adaptive Refresh)
    useEffect(() => {
        const now = Date.now();
        // If > 250ms since last update, or if latency drops to 0 (reset), update immediately
        if (now - lastLatencyUpdateRef.current > 250 || currentAvgLatency === 0) {
            setDisplayLatency(currentAvgLatency);
            lastLatencyUpdateRef.current = now;
        }
    }, [currentAvgLatency]);

    // --- NEW: Throttled Register List for Table Display ---
    // Solves flickering when polling at high speed (e.g. 5ms)
    const lastRegUpdateRef = useRef(0);

    const errorChannels = displayRegisters.filter(r => (r.errorCount || 0) > 0).sort((a,b) => (b.errorCount||0) - (a.errorCount||0));
    const slowestChannels = [...displayRegisters]
        .filter(r => r.lastLatency !== undefined)
        .sort((a, b) => (b.lastLatency || 0) - (a.lastLatency || 0))
        .slice(0, 5);

    // Drop History (Last 10)
    const dropHistory = session.dropHistory || (session.lastDropTime ? [session.lastDropTime] : []);
    const lastDropDisplay = dropHistory.length > 0 ? dropHistory[dropHistory.length - 1] : null;

    return (
        <div className="p-6 h-full overflow-y-auto bg-slate-50/50">
            {/* Top Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                 {/* Connection Status */}
                 <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between relative overflow-hidden">
                    <div className="flex justify-between items-start z-10">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">会话状态</div>
                            <div className={`text-2xl font-black ${isConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {isConnected ? 'Active' : 'Offline'}
                            </div>
                        </div>
                        <div className={`p-2 rounded-lg ${isConnected ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                            <Activity className="w-5 h-5"/>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between z-10">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-mono">{uptimeStr}</span>
                        </div>
                        {session.dropCount > 0 && lastDropDisplay && (
                            <div className="group relative">
                                <div className="text-[9px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100 cursor-help" title="Last Connection Drop Time">
                                    掉线: {lastDropDisplay}
                                </div>
                                {dropHistory.length > 0 && (
                                    <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-white border border-red-200 rounded-lg shadow-xl p-2 z-50 w-32 animate-in fade-in zoom-in duration-200">
                                        <div className="text-[9px] font-bold text-slate-500 border-b border-slate-100 pb-1 mb-1 uppercase tracking-wider">Recent Drops ({dropHistory.length})</div>
                                        <div className="flex flex-col gap-0.5">
                                            {dropHistory.slice().reverse().map((t, i) => (
                                                <div key={i} className="text-[9px] font-mono text-red-600 flex justify-between">
                                                    <span className="text-slate-300 mr-2">#{dropHistory.length - i}</span>
                                                    <span>{t}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Background Decor */}
                    <Activity className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-50 transform rotate-12 pointer-events-none"/>
                 </div>

                 {/* OPS / Throughput */}
                 <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">吞吐量 (OPS)</div>
                            <div className="text-2xl font-black text-indigo-600 font-mono">
                                {ops} <span className="text-xs text-slate-400 font-bold">req/s</span>
                            </div>
                        </div>
                        <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg"><Zap className="w-5 h-5"/></div>
                    </div>
                    <div className="mt-2 h-8 w-full opacity-50">
                        <Sparkline data={opsHistory} color="#6366f1" />
                    </div>
                 </div>

                 {/* Latency - USING THROTLED STATE displayLatency */}
                 <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">平均响应延迟</div>
                            <div className={`text-2xl font-black font-mono ${displayLatency > 100 ? 'text-amber-500' : 'text-blue-600'}`}>
                                {displayLatency} <span className="text-xs text-slate-400 font-bold">ms</span>
                            </div>
                        </div>
                        <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Timer className="w-5 h-5"/></div>
                    </div>
                    <div className="mt-4 text-xs text-slate-500 flex justify-between items-center">
                        <span>Total Req:</span>
                        <span className="font-mono font-bold">{totalRequests.toLocaleString()}</span>
                    </div>
                 </div>

                 {/* Error Rate */}
                 <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">错误率 (Error Rate)</div>
                            <div className={`text-2xl font-black font-mono ${totalErrors > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                                {errorRate}%
                            </div>
                        </div>
                        <div className={`p-2 rounded-lg ${totalErrors > 0 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
                            <AlertTriangle className="w-5 h-5"/>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-slate-500 flex justify-between items-center">
                        <span>Drop Count: {session.dropCount}</span>
                        <span className={`font-bold ${totalErrors > 0 ? 'text-red-500' : 'text-slate-400'}`}>{totalErrors} Errs</span>
                    </div>
                 </div>
            </div>

            {/* Middle Section: Slowest Channels & Config Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Channel Stats List (Throttled) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <BarChart3 className="w-4 h-4 text-amber-500"/> 
                            通道监控 (Channel Monitor)
                        </h3>
                    </div>
                    <div className="flex-1 overflow-auto p-0 min-h-[200px]">
                        {/* If there are errors, show Error List, else show Slowest List */}
                        {errorChannels.length > 0 ? (
                            <table className="w-full text-left text-xs">
                                <thead className="bg-red-50 text-red-500 font-bold uppercase border-b border-red-100">
                                    <tr>
                                        <th className="px-4 py-2">Name</th>
                                        <th className="px-4 py-2">Address</th>
                                        <th className="px-4 py-2 text-center">Error Count</th>
                                        <th className="px-4 py-2 text-right">Last Error Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {errorChannels.slice(0, 10).map(r => (
                                        <tr key={r.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 font-medium text-slate-700">{r.name}</td>
                                            <td className="px-4 py-2 font-mono text-slate-500">{r.address}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">{r.errorCount}</span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-500">{r.lastErrorTime || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white text-slate-400 font-bold uppercase border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-2">Name</th>
                                        <th className="px-4 py-2">Address</th>
                                        <th className="px-4 py-2">Function</th>
                                        <th className="px-4 py-2 text-right">Latency</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {slowestChannels.length === 0 ? (
                                        <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic flex flex-col items-center gap-2">
                                            <CheckCircle2 className="w-8 h-8 text-emerald-100" />
                                            <span>System Healthy. No active data or errors.</span>
                                        </td></tr>
                                    ) : (
                                        slowestChannels.map(r => (
                                            <tr key={r.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-2 font-medium text-slate-700">{r.name}</td>
                                                <td className="px-4 py-2 font-mono text-slate-500">{r.address}</td>
                                                <td className="px-4 py-2 text-slate-500"><span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{r.functionCode}</span></td>
                                                <td className="px-4 py-2 text-right font-mono font-bold text-amber-600">{r.lastLatency} ms</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {errorChannels.length > 0 && (
                        <div className="bg-red-50 p-2 text-center text-[10px] text-red-500 font-bold border-t border-red-100">
                            Warning: {errorChannels.length} channels reporting errors.
                        </div>
                    )}
                </div>

                {/* Session Config Info */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            <Server className="w-4 h-4 text-blue-500"/> 
                            连接参数配置
                        </h3>
                    </div>
                    <div className="p-4 space-y-4 text-sm">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span className="text-slate-500">服务器 IP (Host)</span>
                            <span className="font-mono font-bold text-slate-700">{session.ip}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span className="text-slate-500">端口 (Port)</span>
                            <span className="font-mono font-bold text-slate-700">{session.port}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span className="text-slate-500">站号 (Unit ID)</span>
                            <span className="font-mono font-bold text-slate-700">{session.unitId}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                            <span className="text-slate-500">超时时间 (Timeout)</span>
                            <span className="font-mono font-bold text-slate-700">{session.timeout} ms</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-slate-500">通道数量 (Count)</span>
                            <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                                <Hash className="w-3 h-3"/> {registers.length}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
