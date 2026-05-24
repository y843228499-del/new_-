
import React, { useEffect, useState } from 'react';
import { SessionStatistics } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Activity, Clock, ArrowDownCircle, ArrowUpCircle, Zap, Gauge, Heart, AlertTriangle, WifiOff, ShieldCheck, Server, Key, Copy } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardPanelProps {
  isConnected: boolean;
  dropCount: number;
  isVisible?: boolean;
}

// Helper: Generate Smooth Path for Sparklines
const generateSparkline = (data: number[], height: number, width: number, color: string) => {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data, 1);
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (val / max) * height; // Invert Y
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`M 0 ${height} L ${points} L ${width} ${height} Z`} fill={`url(#grad-${color})`} stroke="none" />
            <polyline fill="none" stroke={color} strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
            <circle cx={width} cy={height - (data[data.length-1]/max)*height} r="3" fill={color} />
        </svg>
    );
};

const DashboardPanel: React.FC<DashboardPanelProps> = ({ isConnected, dropCount, isVisible = true }) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<SessionStatistics>(opcuaService.getStats());

  useEffect(() => {
    let interval: any;
    if (isVisible) {
        interval = setInterval(() => {
            setStats(opcuaService.getStats());
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [isVisible]);

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}h ${m}m ${s}s`;
  };

  const getHealthColor = (score: number) => {
      if (score >= 90) return 'text-emerald-500';
      if (score >= 70) return 'text-amber-500';
      return 'text-rose-500';
  };

  const getHealthRing = (score: number) => {
      if (score >= 90) return 'stroke-emerald-500';
      if (score >= 70) return 'stroke-amber-500';
      return 'stroke-rose-500';
  };

  // Mock Info for Visualization (would come from session props in a real detailed integration)
  const sessionInfo = {
      endpoint: "opc.tcp://127.0.0.1:4840",
      security: "None",
      identity: "Anonymous"
  };

  // Copy helper
  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto bg-slate-50/80 flex flex-col gap-6">
      
      {/* 1. HERO ROW: SESSION CONTEXT & HEALTH */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* A. Session Metadata Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <Server className="w-32 h-32" />
              </div>
              <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t.dashboard.context}</h3>
                  <div className="space-y-3">
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                              <Zap className="w-5 h-5" />
                          </div>
                          <div>
                              <div className="text-xs text-slate-500">{t.dashboard.statusLabel}</div>
                              <div className={`font-bold ${isConnected ? 'text-emerald-600' : 'text-slate-500'}`}>{isConnected ? t.dashboard.active : t.dashboard.disconnected}</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                              <ShieldCheck className="w-5 h-5" />
                          </div>
                          <div>
                              <div className="text-xs text-slate-500">{t.dashboard.securityMode}</div>
                              <div className="font-bold text-slate-700">{sessionInfo.security}</div>
                          </div>
                      </div>
                  </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1 text-slate-500">
                      <Key className="w-3 h-3" /> {t.dashboard.identity}: <span className="font-medium text-slate-700">{sessionInfo.identity}</span>
                  </div>
                  <div className="font-mono text-slate-400">{isConnected ? formatUptime(stats.uptime) : '--:--:--'}</div>
              </div>
          </div>

          {/* B. Health & Stability */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Health Score Gauge */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center relative">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider absolute top-4 left-4">{t.dashboard.healthScore}</h3>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="transparent" stroke="#f1f5f9" strokeWidth="8" />
                          <circle 
                            cx="64" cy="64" r="56" fill="transparent" 
                            stroke="currentColor" strokeWidth="8" 
                            strokeDasharray={351.86} 
                            strokeDashoffset={351.86 - (351.86 * stats.healthScore) / 100} 
                            className={`transition-all duration-1000 ease-out ${getHealthRing(stats.healthScore)}`}
                            strokeLinecap="round"
                          />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-3xl font-black ${getHealthColor(stats.healthScore)}`}>{stats.healthScore}</span>
                          <span className="text-[10px] text-slate-400 font-bold">/ 100</span>
                      </div>
                  </div>
              </div>

              {/* Uptime & Drops */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center gap-6">
                  <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                          <Clock className="w-6 h-6" />
                      </div>
                      <div>
                          <div className="text-xs text-slate-500 font-bold uppercase">{t.dashboard.uptime}</div>
                          <div className="text-xl font-mono font-bold text-slate-800 tracking-tight">{formatUptime(stats.uptime)}</div>
                      </div>
                  </div>
                  <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${dropCount > 0 ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                          <WifiOff className="w-6 h-6" />
                      </div>
                      <div>
                          <div className="text-xs text-slate-500 font-bold uppercase">{t.dashboard.dropCount}</div>
                          <div className={`text-xl font-bold ${dropCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{dropCount}</div>
                      </div>
                  </div>
              </div>

              {/* Total Traffic Summary */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center gap-4">
                  <div>
                      <div className="flex items-center gap-2 mb-1">
                          <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-slate-500 uppercase">{t.dashboard.received}</span>
                      </div>
                      <div className="text-lg font-mono font-bold text-slate-700">{formatBytes(stats.bytesRead)}</div>
                  </div>
                  <div className="w-full h-px bg-slate-100"></div>
                  <div>
                      <div className="flex items-center gap-2 mb-1">
                          <ArrowUpCircle className="w-4 h-4 text-blue-500" />
                          <span className="text-xs font-bold text-slate-500 uppercase">{t.dashboard.sent}</span>
                      </div>
                      <div className="text-lg font-mono font-bold text-slate-700">{formatBytes(stats.bytesWritten)}</div>
                  </div>
              </div>
          </div>
      </div>

      {/* 2. MIDDLE ROW: REAL-TIME CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-64">
          {/* Latency Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-amber-500" />
                      <h3 className="font-bold text-slate-700">{t.dashboard.rtt}</h3>
                  </div>
                  <div className="text-right">
                      <span className="text-2xl font-bold text-slate-800 font-mono">{stats.lastRtt}</span>
                      <span className="text-xs text-slate-400 ml-1">ms</span>
                  </div>
              </div>
              <div className="flex-1 w-full bg-slate-50 rounded-lg border border-slate-100 relative overflow-hidden">
                  {generateSparkline(stats.rttHistory, 150, 500, '#f59e0b')}
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-400 font-mono">
                  <span>{t.dashboard.avg}: {stats.avgRtt} ms</span>
                  <span>{t.dashboard.peak}: {Math.max(...stats.rttHistory, 0)} ms</span>
              </div>
          </div>

          {/* Throughput Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                      <Gauge className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-slate-700">{t.dashboard.throughput}</h3>
                  </div>
                  <div className="flex gap-4 text-right">
                      <div>
                          <span className="text-2xl font-bold text-indigo-600 font-mono">{stats.itemsPerSec}</span>
                          <span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">{t.dashboard.itemsSec}</span>
                      </div>
                      <div className="border-l border-slate-200 pl-4">
                          <span className="text-xl font-bold text-slate-600 font-mono">{stats.opsPerSec}</span>
                          <span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">{t.dashboard.opsSec}</span>
                      </div>
                  </div>
              </div>
              <div className="flex-1 w-full bg-slate-50 rounded-lg border border-slate-100 relative overflow-hidden">
                  {generateSparkline(stats.throughputHistory, 150, 500, '#6366f1')}
              </div>
              <div className="mt-2 text-xs text-slate-400 text-center italic">
                  {t.dashboard.throughputDesc}
              </div>
          </div>
      </div>

      {/* 3. BOTTOM ROW: SLOW OPS RADAR */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[300px] overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-rose-100 rounded text-rose-600">
                      <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-700">{t.dashboard.slowOps.title}</h3>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded">{t.dashboard.slowOps.threshold}</span>
          </div>
          
          <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase sticky top-0 shadow-sm z-10">
                      <tr>
                          <th className="p-3 border-b">{t.dashboard.slowOps.time}</th>
                          <th className="p-3 border-b">{t.dashboard.slowOps.op}</th>
                          <th className="p-3 border-b w-1/2">{t.dashboard.slowOps.target} / Details</th>
                          <th className="p-3 border-b text-right">{t.dashboard.slowOps.duration}</th>
                      </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-50">
                      {!stats.slowOps || stats.slowOps.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">{t.dashboard.slowOps.empty}</td></tr>
                      ) : (
                          stats.slowOps.map((op, i) => (
                              <tr key={i} className="hover:bg-rose-50/30 transition-colors group">
                                  <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{op.timestamp}</td>
                                  <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                                          op.operation === 'Write' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                          op.operation === 'Read' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                          'bg-slate-100 text-slate-600 border-slate-200'
                                      }`}>
                                          {op.operation}
                                      </span>
                                  </td>
                                  <td className="p-3">
                                      <div className="flex items-center justify-between gap-2">
                                          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 truncate max-w-[400px]" title={op.details}>
                                              {op.details || 'N/A'}
                                          </code>
                                          <button 
                                              onClick={() => copyToClipboard(op.details || '')}
                                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-all"
                                              title="Copy Details"
                                          >
                                              <Copy className="w-3 h-3" />
                                          </button>
                                      </div>
                                  </td>
                                  <td className="p-3 text-right">
                                      <span className={`font-mono font-bold ${op.duration > 500 ? 'text-rose-600' : 'text-amber-600'}`}>
                                          {op.duration} ms
                                      </span>
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default React.memo(DashboardPanel);
