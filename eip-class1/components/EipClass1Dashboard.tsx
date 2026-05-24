import React from 'react';
import { EipClass1SessionInfo } from '../../type-definitions/eip-class1';
import { Network, Server, ArrowDownToLine, ArrowUpToLine, AlertTriangle, Wifi, BarChart3, Clock, Cpu } from 'lucide-react';
import { ConnectionStatus } from '../../types';

export const EipClass1Dashboard = ({ session, stats }: { session: EipClass1SessionInfo, stats: Record<string, any> }) => {
    
    // Aggregate stats
    let totalTxPackets = 0;
    let totalRxPackets = 0;
    let totalDrops = 0;
    let totalSeqErrors = 0;
    let totalTimeouts = 0;
    
    let connectionsOnline = 0;
    let connectionsOffline = 0;
    let totalConnections = 0;

    let rxAggRpiSum = 0;
    let txAggRpiSum = 0;
    let rxAggRpiCount = 0;
    let txAggRpiCount = 0;

    session.scannerConfig.slaves.forEach(slave => {
        const conns = slave.connections && slave.connections.length > 0 ? slave.connections : [slave as any];
        for (const conn of conns) {
            totalConnections++;
            
            const connStats = stats[conn.id];
            
            if (slave.status === 'Connected') {
                if (connStats && connStats.isDropped) {
                    connectionsOffline++;
                } else {
                    connectionsOnline++;
                }
            } else {
                connectionsOffline++;
            }
            
            if (connStats) {
                totalTxPackets += connStats.txPackets || 0;
                totalRxPackets += connStats.rxPackets || 0;
                totalDrops += connStats.droppedPackets || 0;
                totalSeqErrors += connStats.seqErrors || 0;
                totalTimeouts += connStats.timeouts || 0;
                
                if (connStats.rxActualRpi) {
                    rxAggRpiSum += parseFloat(connStats.rxActualRpi);
                    rxAggRpiCount++;
                }
                if (connStats.txActualRpi) {
                    txAggRpiSum += parseFloat(connStats.txActualRpi);
                    txAggRpiCount++;
                }
            }
        }
    });

    const avgRxRpi = rxAggRpiCount > 0 ? (rxAggRpiSum / rxAggRpiCount).toFixed(1) : '0.0';
    const avgTxRpi = txAggRpiCount > 0 ? (txAggRpiSum / txAggRpiCount).toFixed(1) : '0.0';

    const isRunning = session.status === ConnectionStatus.CONNECTED;

    return (
        <div className="flex flex-col w-full h-full bg-slate-50 overflow-y-auto">
            <div className="p-6 pb-4 border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 rounded-lg text-indigo-700 shadow-sm border border-indigo-200">
                        <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">Scanner 全局监控视图</h2>
                        <p className="text-sm text-slate-500 font-medium mt-0.5">Global Overview & Aggregation</p>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                
                {/* Core Status Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                        <div className="flex items-start justify-between text-slate-500 mb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">运行状态 (Status)</span>
                            <Server className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-slate-800 tracking-tight">
                                {isRunning ? "Running" : "Stopped"}
                            </span>
                        </div>
                        <div className="mt-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                {isRunning ? "活动 (Active)" : "离线 (Offline)"}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                        <div className="flex items-start justify-between text-slate-500 mb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">连接状态 (Connections)</span>
                            <Network className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-800 tracking-tight">{connectionsOnline}</span>
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">/ {totalConnections}</span>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-500 flex gap-4">
                            <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Connected: {connectionsOnline}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Offline: {connectionsOffline}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                        <div className="flex items-start justify-between text-slate-500 mb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">数据流量 (Traffic)</span>
                            <ArrowUpToLine className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-500">TX (发送)</span>
                                <span className="font-mono font-bold text-slate-800">{totalTxPackets.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-500">RX (接收)</span>
                                <span className="font-mono font-bold text-slate-800">{totalRxPackets.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-2">
                            Packets sent & received
                        </div>
                    </div>

                    <div className={`bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between ${totalDrops > 0 || totalSeqErrors > 0 ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between text-slate-500 mb-2">
                            <span className="text-sm font-bold uppercase tracking-wider">网络质量 (Quality)</span>
                            <AlertTriangle className={`w-5 h-5 ${totalDrops > 0 || totalSeqErrors > 0 ? 'text-amber-500' : 'text-emerald-400'}`} />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-500">Drops</span>
                                <span className={`font-mono font-bold ${totalDrops > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{totalDrops.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-500">Seq Errors</span>
                                <span className={`font-mono font-bold ${totalSeqErrors > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{totalSeqErrors.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-500">Timeouts</span>
                                <span className={`font-mono font-bold ${totalTimeouts > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{totalTimeouts.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Aggregated Performance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <h3 className="font-bold text-slate-700 text-sm">周期时间平均值 (Real-time RPI Avg)</h3>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">平均接收入度 (RX RPI)</div>
                                <div className="text-2xl font-black text-slate-700 font-mono flex items-baseline gap-1">
                                    {avgRxRpi} <span className="text-xs font-bold text-slate-400 tracking-normal">ms</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">平均发出度 (TX RPI)</div>
                                <div className="text-2xl font-black text-slate-700 font-mono flex items-baseline gap-1">
                                    {avgTxRpi} <span className="text-xs font-bold text-slate-400 tracking-normal">ms</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-slate-400" />
                            <h3 className="font-bold text-slate-700 text-sm">协议栈资源 (Stack Resources)</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-slate-500 uppercase tracking-widest">已分配设备能力</span>
                                    <span className="text-indigo-600">{totalConnections} Nodes</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min((totalConnections / 100) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                            <div className="text-xs text-slate-400 font-medium">
                                * EIP Class 1 Scanner 当前支持最多管理 100 个有效从站节点连接。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
