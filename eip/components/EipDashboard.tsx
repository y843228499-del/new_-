
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Activity, Gauge, Cpu, RefreshCw, Zap, Layers, Hash, TrendingUp, RefreshCcw, ArrowDown, ArrowUp } from 'lucide-react';
import { EipSessionInfo, ConnectionStatus } from '../../types';
import { eipService } from '../services/eipService';

interface EipDashboardProps {
    session: EipSessionInfo;
}

// 0x3 = ConnectionEstablished (正常)
// 0x4 = ConnectionTimedOut (掉线)
// 0x0 = ConnectionNonExistent (不存在/已断开)
// 0x1 = ConnectionConfiguring (配置中/掉线)
// 0x6 = ConnectionClosing (正在关闭)
const getStateLabel = (state: number | undefined) => {
    if (state === 3) return 'Established (3)';
    if (state === 4) return 'Timed Out (4)';
    if (state === 0) return 'NonExistent (0)';
    if (state === 1) return 'Configuring (1)';
    if (state === 2) return 'Connecting (2)';
    if (state === 6) return 'Closing (6)';
    return `Unknown (${state})`;
};

const getStateColor = (state: number | undefined) => {
    if (state === 3) return 'text-emerald-600';
    if (state === 1) return 'text-red-500'; // 1 = Configuring (Disconnected) -> Red
    if (state === 4) return 'text-red-500'; // 4 = Timeout -> Red
    if (state === 0) return 'text-slate-400';
    if (state === 6) return 'text-slate-400';
    return 'text-amber-500';
};

// --- Sparkline Component ---
const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    if (!data || data.length < 2) return null;
    const width = 120;
    const height = 40;
    const max = Math.max(...data, 10); // Min height of 10ms
    const min = Math.min(...data);
    const range = max - min || 1;
    
    // Generate points
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        // Normalize Y to height (inverted)
        const y = height - ((val - 0) / max) * height; 
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <defs>
                <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
                    <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
            </defs>
            <path d={`M0 ${height} L${points} L${width} ${height} Z`} fill="url(#grad)" stroke="none" />
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export const EipDashboard: React.FC<EipDashboardProps> = ({ session }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    
    // Use session.inoState if available, otherwise fallback to 0 or 3 based on connected status
    const dllState = session.inoState !== undefined ? session.inoState : (isConnected ? 3 : 0);

    // --- 1. Dynamic Health Calculation ---
    // Start at 100%, deduct 5% per drop. Floor at 0%.
    const healthScore = useMemo(() => {
        if (!isConnected) return 0;
        const score = 100 - (session.dropCount * 5);
        return Math.max(0, score).toFixed(1);
    }, [isConnected, session.dropCount]);

    // --- 2. Enhanced RTT Stats ---
    const [rttStats, setRttStats] = useState<{
        current: number | null;
        min: number | null;
        max: number | null;
        avg: number | null;
        history: number[];
    }>({ current: null, min: null, max: null, avg: null, history: [] });
    
    const [isProbing, setIsProbing] = useState(false);

    // Reset stats when disconnected
    useEffect(() => {
        if (!isConnected) {
            setRttStats({ current: null, min: null, max: null, avg: null, history: [] });
        }
    }, [isConnected]);

    useEffect(() => {
        if (!isConnected) return;

        // Find a candidate tag to probe (First tag of first group)
        let candidateTag = null;
        for (const g of session.config.tagGroups) {
            if (g.nodes.length > 0) {
                candidateTag = g.nodes[0];
                break;
            }
        }

        if (!candidateTag) return;

        const probe = async () => {
            setIsProbing(true);
            const start = performance.now();
            try {
                // Perform a real read to measure network latency
                await eipService.readTag(
                    session.id, 
                    candidateTag.tagName, 
                    candidateTag.dataType, 
                    session.alignment || 0, 
                    candidateTag.elementCount || 1
                );
                const duration = Math.round(performance.now() - start);
                
                setRttStats(prev => {
                    const newHistory = [...prev.history, duration].slice(-40); // Keep last 40 points
                    const newMin = prev.min === null ? duration : Math.min(prev.min, duration);
                    const newMax = prev.max === null ? duration : Math.max(prev.max, duration);
                    const newAvg = Math.round(newHistory.reduce((a,b)=>a+b,0) / newHistory.length);
                    
                    return {
                        current: duration,
                        min: newMin,
                        max: newMax,
                        avg: newAvg,
                        history: newHistory
                    };
                });
            } catch (e) {
                // Keep history but mark current as null/error? Or just ignore
            } finally {
                setIsProbing(false);
            }
        };

        // Run probe immediately, then every 2s
        probe();
        const interval = setInterval(probe, 2000);
        return () => clearInterval(interval);

    }, [isConnected, session.id, session.config.tagGroups]);

    // Handle Reset Stats
    const handleResetStats = () => {
        setRttStats(prev => ({ ...prev, min: null, max: null, avg: null, history: [] }));
    };

    // Determine RTT Color
    const rttColor = rttStats.current !== null 
        ? (rttStats.current < 50 ? '#10b981' : rttStats.current < 150 ? '#f59e0b' : '#ef4444') 
        : '#cbd5e1';

    // --- 4. Tag Statistics ---
    const totalTags = useMemo(() => session.config.tagGroups.reduce((acc, g) => acc + g.nodes.length, 0), [session.config.tagGroups]);
    const totalGroups = session.config.tagGroups.length;

    return (
        <div className="p-8 h-full overflow-y-auto bg-slate-50/30">
            {/* 统计指标 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                 {/* Health Card */}
                 <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${Number(healthScore) > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            <Activity className="w-5 h-5"/>
                        </div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">链路健康度 (Health)</span>
                    </div>
                    <div className="text-4xl font-black text-slate-800">{isConnected ? `${healthScore}%` : '--'}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">累计掉线: {session.dropCount} 次</div>
                 </div>
                 
                 {/* Connection State Card */}
                 <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Zap className="w-5 h-5"/></div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">DLL 连接状态</span>
                    </div>
                    <div className={`text-2xl font-black ${getStateColor(dllState)}`}>
                        {getStateLabel(dllState)}
                    </div>
                    <p className="text-[10px] text-slate-400">EipGetConnectionState</p>
                 </div>

                 {/* Session Handle Card (DECIMAL) */}
                 <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg"><Gauge className="w-5 h-5"/></div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">会话句柄 (Instance ID)</span>
                    </div>
                    <div className="text-2xl font-mono font-bold text-cyan-700">
                        {isConnected ? session.instanceId?.toString() : '--'}
                    </div>
                    <p className="text-[10px] text-slate-400">Decimal Handle (Memory Pointer)</p>
                 </div>
                 
                 {/* Enhanced RTT Monitor Card */}
                 <div className="bg-white border rounded-2xl shadow-sm flex flex-col relative overflow-hidden h-40">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pt-4 z-10">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg"><TrendingUp className="w-4 h-4"/></div>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">网络延迟 (RTT)</span>
                        </div>
                        <button onClick={handleResetStats} className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="重置统计">
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Main Value */}
                    <div className="px-4 mt-1 z-10 flex items-baseline gap-2">
                        <span className={`text-3xl font-mono font-black ${isProbing ? 'animate-pulse' : ''}`} style={{ color: rttColor }}>
                            {rttStats.current !== null ? rttStats.current : '--'}
                        </span>
                        <span className="text-xs font-bold text-slate-400">ms</span>
                    </div>

                    {/* Min/Max Stats Row */}
                    <div className="px-4 mt-1 z-10 flex gap-4 text-[10px] font-mono text-slate-500">
                        <div className="flex items-center gap-1" title="Minimum RTT">
                            <ArrowDown className="w-3 h-3 text-emerald-500" />
                            <span>{rttStats.min !== null ? rttStats.min : '-'}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Maximum RTT">
                            <ArrowUp className="w-3 h-3 text-red-500" />
                            <span>{rttStats.max !== null ? rttStats.max : '-'}</span>
                        </div>
                        <div className="flex items-center gap-1 pl-2 border-l" title="Average RTT">
                            <span className="font-bold">Avg:</span>
                            <span>{rttStats.avg !== null ? rttStats.avg : '-'}</span>
                        </div>
                    </div>

                    {/* Sparkline Background */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 z-0">
                        <Sparkline data={rttStats.history} color={rttColor} />
                    </div>
                 </div>
            </div>

            {/* Project Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-full"><Hash className="w-6 h-6" /></div>
                        <div>
                            <div className="text-2xl font-bold text-slate-700">{totalTags}</div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">总标签数 (Total Tags)</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full"><Layers className="w-6 h-6" /></div>
                        <div>
                            <div className="text-2xl font-bold text-slate-700">{totalGroups}</div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">分组数量 (Groups)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
