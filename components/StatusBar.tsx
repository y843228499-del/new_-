import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Clock } from 'lucide-react';

export const StatusBar: React.FC = () => {
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const [metrics, setMetrics] = useState({ cpu: 0, mem: 0, tx: 0, rx: 0 });

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString());
            
            // Simulate metrics for browser environment
            const memInfo = (performance as any).memory;
            const memUsage = memInfo ? Math.round(memInfo.usedJSHeapSize / (1024 * 1024)) : Math.floor(Math.random() * 20) + 40;
            
            setMetrics(prev => ({
                cpu: Math.max(1, Math.min(100, prev.cpu + (Math.random() * 10 - 5))),
                mem: memUsage,
                tx: Math.floor(Math.random() * 1024),
                rx: Math.floor(Math.random() * 2048)
            }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 text-[10px] font-mono text-slate-400 shrink-0 z-[100] select-none">
            {/* Left side: Status indicators */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="font-bold uppercase tracking-wider">System Ready</span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-default">
                    <Wifi className="w-3 h-3" />
                    <span>Network: OK</span>
                </div>
            </div>

            {/* Right side: Metrics & Time */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-default" title="Tx/Rx Activity">
                    <Activity className="w-3 h-3 text-indigo-400" />
                    <span>Tx: {metrics.tx} B/s | Rx: {metrics.rx} B/s</span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-default">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>CPU: {metrics.cpu.toFixed(1)}%</span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-default">
                    <HardDrive className="w-3 h-3 text-cyan-400" />
                    <span>MEM: {metrics.mem} MB</span>
                </div>
                <div className="h-3 w-px bg-slate-700"></div>
                <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                    <Clock className="w-3 h-3" />
                    <span>{time}</span>
                </div>
            </div>
        </div>
    );
};
