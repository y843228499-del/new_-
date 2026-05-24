
import React, { useMemo } from 'react';
import { SessionInfo, ConnectionStatus } from '../types';
import { X, WifiOff, RefreshCcw, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DropStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  onResetCounts: () => void;
}

const DropStatsModal: React.FC<DropStatsModalProps> = ({ isOpen, onClose, sessions, onResetCounts }) => {
  const { t } = useLanguage();

  const totalDrops = useMemo(() => sessions.reduce((acc, s) => acc + s.dropCount, 0), [sessions]);
  const unstableSessions = useMemo(() => sessions.filter(s => s.dropCount > 0).length, [sessions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm text-white">
                 <BarChart3 className="w-6 h-6" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-800 leading-tight">{t.statsMonitor.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                    {totalDrops > 0 ? (
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                            <AlertTriangle className="w-3 h-3" /> {t.statsMonitor.hasDrops} ({totalDrops})
                        </span>
                    ) : (
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <CheckCircle2 className="w-3 h-3" /> {t.statsMonitor.noDrops}
                        </span>
                    )}
                </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
                onClick={onResetCounts}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 hover:text-indigo-600 text-slate-600 text-sm font-bold transition-all shadow-sm"
             >
                <RefreshCcw className="w-4 h-4" />
                <span>{t.statsMonitor.reset}</span>
             </button>
             <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X className="w-6 h-6" />
             </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto bg-white p-6">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                            <th className="p-4">{t.statsMonitor.sessionName}</th>
                            <th className="p-4">{t.connection.endpointUrl}</th>
                            <th className="p-4 text-center">{t.statsMonitor.status}</th>
                            <th className="p-4 text-center">{t.statsMonitor.dropCount}</th>
                            <th className="p-4 text-center">{t.statsMonitor.lastDropTime}</th>
                            <th className="p-4 text-center">{t.statsMonitor.lastRecoveryTime}</th>
                            <th className="p-4">{t.statsMonitor.lastError}</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                        {sessions.length === 0 && (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No sessions created.</td></tr>
                        )}
                        {sessions.sort((a,b) => b.dropCount - a.dropCount).map((session) => {
                            const hasDrops = session.dropCount > 0;
                            return (
                                <tr key={session.id} className={`hover:bg-slate-50 transition-colors ${hasDrops ? 'bg-amber-50/30' : ''}`}>
                                    <td className="p-4 font-medium text-slate-800 flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${session.status === ConnectionStatus.CONNECTED ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                        {session.name}
                                    </td>
                                    <td className="p-4 font-mono text-slate-500 text-xs truncate max-w-[200px]" title={session.endpointUrl}>
                                        {session.endpointUrl || '-'}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                            session.status === ConnectionStatus.CONNECTED ? 'bg-emerald-100 text-emerald-700' :
                                            session.status === ConnectionStatus.ERROR ? 'bg-red-100 text-red-700' :
                                            session.status === ConnectionStatus.CONNECTING ? 'bg-amber-100 text-amber-700' :
                                            'bg-slate-100 text-slate-500'
                                        }`}>
                                            {session.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {hasDrops ? (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-600 rounded-full font-bold">
                                                <WifiOff className="w-3.5 h-3.5" />
                                                {session.dropCount}
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 font-bold text-lg">0</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center text-xs font-mono text-slate-500">
                                        {session.lastDropTime || <span className="text-slate-200">-</span>}
                                    </td>
                                    <td className="p-4 text-center text-xs font-mono text-slate-500">
                                        {session.lastRecoveryTime || <span className="text-slate-200">-</span>}
                                    </td>
                                    <td className="p-4 text-xs text-red-500 font-mono truncate max-w-[250px]" title={session.lastError}>
                                        {session.lastError || <span className="text-slate-300">-</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DropStatsModal;
