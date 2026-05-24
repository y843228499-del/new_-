import React, { useState, useEffect, useMemo } from 'react';
import { EipClass1Slave } from '../../type-definitions/eip-class1';
import { Activity, ArrowDownUp, ShieldAlert, Wifi, TrendingUp, Layers, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
    slave: EipClass1Slave;
    stats?: Record<string, any>;
}

export const SlaveStatusTab: React.FC<Props> = ({ slave, stats }) => {
    // Identify all connections for this slave
    const connections = useMemo(() => {
        return slave.connections || [];
    }, [slave.connections]);

    const [selectedConnId, setSelectedConnId] = useState<string | null>(connections[0]?.id || null);
    
    // History state for charts - specific to each connection
    const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
    
    // Fallback if current selected ID is no longer valid
    useEffect(() => {
        if (!selectedConnId && connections.length > 0) {
            setSelectedConnId(connections[0].id);
        } else if (selectedConnId && !connections.some(c => c.id === selectedConnId)) {
            setSelectedConnId(connections[0]?.id || null);
        }
    }, [connections, selectedConnId]);

    const activeConn = useMemo(() => {
        return connections.find(c => c.id === selectedConnId) || connections[0];
    }, [connections, selectedConnId]);

    const activeStats = (stats && selectedConnId) ? stats[selectedConnId] : null;

    const isConnected = slave.status === 'Connected';
    const isDropped = activeStats?.isDropped;
    const isEffectivelyConnected = isConnected && !isDropped;

    // Display Stats with fallbacks
    const displayStats = {
        txPackets: activeStats?.txPackets || 0,
        rxPackets: activeStats?.rxPackets || 0,
        droppedPackets: activeStats?.droppedPackets || 0,
        seqErrors: activeStats?.seqErrors || 0,
        rxJitterAvg: activeStats?.rxJitterAvg || '0.0',
        rxJitterMax: activeStats?.rxJitterMax || '0.0',
        rxActualRpi: activeStats?.rxActualRpi || '0.0',
        txJitterAvg: activeStats?.txJitterAvg || '0.0',
        txJitterMax: activeStats?.txJitterMax || '0.0',
        txActualRpi: activeStats?.txActualRpi || '0.0',
        timeouts: activeStats?.timeouts || 0,
        uptime: activeStats?.uptime || '00:00:00'
    };

    // Keep history for chart tracking
    useEffect(() => {
        if (!isEffectivelyConnected || !selectedConnId || !activeStats) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' });
        
        setHistoryMap(prev => {
            const currentHistory = prev[selectedConnId] || [];
            const newPoint = {
                time: timeStr,
                rxJitter: parseFloat(displayStats.rxJitterAvg) || 0,
                txJitter: parseFloat(displayStats.txJitterAvg) || 0,
                rxRpi: parseFloat(displayStats.rxActualRpi) || 0,
                txRpi: parseFloat(displayStats.txActualRpi) || 0,
            };
            
            // Avoid adding duplicate time points if uptime hasn't ticked
            if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].time === timeStr) {
                return prev;
            }

            const updatedHistory = [...currentHistory, newPoint].slice(-60); // Keep last 60 points
            return { ...prev, [selectedConnId]: updatedHistory };
        });
    }, [activeStats?.uptime, isEffectivelyConnected, selectedConnId]);

    const statsHistory = useMemo(() => {
        return selectedConnId ? (historyMap[selectedConnId] || []) : [];
    }, [historyMap, selectedConnId]);

    // Throughput calculation
    const throughputStr = useMemo(() => {
        if (!activeConn || !activeStats) return '0 B/s';
        const o2tSize = activeConn.o2tSize || 0;
        const t2oSize = activeConn.t2oSize || 0;
        const rxActualRpi = parseFloat(activeStats.rxActualRpi) || 0;
        const txActualRpi = parseFloat(activeStats.txActualRpi) || 0;
        
        const rxPktsPerSec = rxActualRpi > 0 ? (1000 / rxActualRpi) : 0;
        const txPktsPerSec = txActualRpi > 0 ? (1000 / txActualRpi) : (activeConn.rpi > 0 ? 1000 / activeConn.rpi : 0);
        
        const OVERHEAD = 48; 
        const bytesPerSec = (rxPktsPerSec * (t2oSize + OVERHEAD)) + (txPktsPerSec * (o2tSize + OVERHEAD));
        
        if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
        if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
        return `${Math.round(bytesPerSec)} B/s`;
    }, [activeConn, activeStats]);

    if (!activeConn && connections.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                <ShieldAlert className="w-12 h-12 mb-2 opacity-20" />
                <p>未发现有效连接配置</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Connection Selector Strip */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 overflow-x-auto shrink-0 no-scrollbar">
                <div className="flex items-center gap-2 mr-1 text-slate-400">
                    <Layers className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">连接选择:</span>
                </div>
                {connections.map((conn, idx) => {
                    const connStats = stats?.[conn.id];
                    const isConnActive = selectedConnId === conn.id;
                    const isConnDropped = connStats?.isDropped;
                    return (
                        <button
                            key={conn.id}
                            onClick={() => setSelectedConnId(conn.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all whitespace-nowrap ${
                                isConnActive 
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-sm' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${isConnected ? (isConnDropped ? 'bg-red-500 animate-pulse' : 'bg-emerald-500') : 'bg-slate-300'}`}></div>
                            <span>Conn {idx + 1}</span>
                            <span className="text-[9px] opacity-60 font-mono">({conn.rpi}ms)</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="max-w-5xl mx-auto space-y-4">
                    
                    {/* Header Status - Classic Style */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative flex h-3 w-3">
                                {isEffectivelyConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isEffectivelyConnected ? 'bg-emerald-500' : (isDropped || slave.status === 'Error') ? 'bg-red-500' : 'bg-slate-400'}`}></span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    连接状态: 
                                    {isEffectivelyConnected ? (
                                        <span className="text-emerald-600">已连接 (Online)</span>
                                    ) : isDropped ? (
                                        <span className="text-amber-600">掉线 (Dropped)</span>
                                    ) : slave.status === 'Error' ? (
                                        <span className="text-red-500">连接失败/离线 (Error)</span>
                                    ) : (
                                        <span className="text-slate-500">未连接 (Offline)</span>
                                    )}
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    目标 IP: {slave.ipAddress}
                                    {slave.status === 'Error' && slave.lastError && (
                                        <span className="ml-2 text-red-500 font-medium">| 异常: {slave.lastError.replace('TCP Timeout', '目标设备未响应/离线').replace('ECONNREFUSED', '目标设备拒绝连接')}</span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="text-right bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                            <div className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wider font-semibold">运行时间 (Uptime)</div>
                            <div className="text-lg font-mono font-medium text-slate-700">{displayStats.uptime}</div>
                        </div>
                    </div>

                    {/* Dashboard Grid - Classic Style */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Performance & Jitter */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                <Activity className="w-4 h-4 text-indigo-500" />
                                <h3 className="text-sm font-semibold text-slate-800">性能与抖动 (Performance & Jitter)</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2.5">
                                    <div className="text-xs font-bold text-slate-500 border-b pb-1">接收数据帧 (Rx/T{"->"}O)</div>
                                    <MetricRow label="平均 RPI" value={displayStats.rxActualRpi + " ms"} />
                                    <MetricRow label="平均抖动" value={"±" + displayStats.rxJitterAvg + " ms"} color="text-emerald-600" />
                                    <MetricRow label="最大抖动" value={"±" + displayStats.rxJitterMax + " ms"} color="text-amber-600" />
                                </div>
                                
                                <div className="space-y-2.5">
                                    <div className="text-xs font-bold text-slate-500 border-b pb-1">发出请求帧 (Tx/O{"->"}T)</div>
                                    <MetricRow label="平均 RPI" value={displayStats.txActualRpi + " ms"} />
                                    <MetricRow label="平均抖动" value={"±" + displayStats.txJitterAvg + " ms"} color="text-emerald-600" />
                                    <MetricRow label="最大抖动" value={"±" + displayStats.txJitterMax + " ms"} color="text-amber-600" />
                                </div>
                            </div>
                        </div>

                        {/* Traffic Statistics */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                <ArrowDownUp className="w-4 h-4 text-blue-500" />
                                <h3 className="text-sm font-semibold text-slate-800">流量统计 (Traffic Statistics)</h3>
                            </div>
                            <div className="space-y-2.5">
                                <MetricRow label="发送帧数 (Tx Packets)" value={displayStats.txPackets.toLocaleString()} />
                                <MetricRow label="接收帧数 (Rx Packets)" value={displayStats.rxPackets.toLocaleString()} />
                                <MetricRow label="I/O 数据吞吐量" value={isConnected ? throughputStr : '0 B/s'} />
                            </div>
                        </div>

                        {/* Diagnostics */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                                <h3 className="text-sm font-semibold text-slate-800">诊断与错误 (Diagnostics)</h3>
                            </div>
                            <div className="space-y-2.5">
                                <MetricRow label="丢包数 (Dropped Packets)" value={displayStats.droppedPackets.toString()} color={displayStats.droppedPackets > 0 ? "text-red-600 font-bold" : ""} />
                                <MetricRow label="乱序/序列号错误 (Seq Errors)" value={displayStats.seqErrors.toString()} />
                                <MetricRow label="连接超时次数 (Timeouts)" value={displayStats.timeouts.toString()} />
                            </div>
                        </div>

                        {/* Network Info */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                                <Wifi className="w-4 h-4 text-teal-500" />
                                <h3 className="text-sm font-semibold text-slate-800">网络信息 (Network)</h3>
                            </div>
                            <div className="space-y-2.5">
                                <MetricRow label="目标 IP (Target IP)" value={slave.ipAddress} />
                                <MetricRow label="UDP 端口 (Implicit)" value="2222" />
                                <MetricRow label="多播地址 (Multicast)" value="239.192.1.1" />
                            </div>
                        </div>
                    </div>

                    {/* Chart Area - Classic Style */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                <h3 className="text-sm font-semibold text-slate-800">性能与抖动趋势 (Performance & Jitter Trend)</h3>
                            </div>
                        </div>
                        <div className="h-64 w-full">
                            {statsHistory.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={statsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis 
                                            dataKey="time" 
                                            tick={{ fontSize: 10, fill: '#64748B' }} 
                                            tickMargin={10}
                                            minTickGap={20}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            yAxisId="left"
                                            tick={{ fontSize: 10, fill: '#64748B' }} 
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `${val}ms`}
                                            width={45}
                                        />
                                        <Tooltip 
                                            contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}
                                            labelStyle={{ color: '#64748B', marginBottom: '4px' }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        
                                        <Line yAxisId="left" type="monotone" dataKey="rxJitter" name="接收抖动 (Rx Jitter)" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line yAxisId="left" type="monotone" dataKey="txJitter" name="发送抖动 (Tx Jitter)" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line yAxisId="left" type="monotone" dataKey="rxRpi" name="接收 RPI (Rx RPI)" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                                        <Line yAxisId="left" type="monotone" dataKey="txRpi" name="发送 RPI (Tx RPI)" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">
                                    {isConnected ? '正在收集数据...' : '等待建立连接...'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MetricRow = ({ label, value, color = "text-slate-800" }: { label: string, value: string, color?: string }) => (
    <div className="flex justify-between items-center text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
);
