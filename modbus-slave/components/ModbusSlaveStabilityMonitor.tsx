import React from 'react';
import { ModbusSlaveSessionInfo, ConnectionStatus } from '../../types';
import { Activity, AlertTriangle, RefreshCcw, Clock, Hash } from 'lucide-react';

interface ModbusSlaveStabilityMonitorProps {
    sessions: ModbusSlaveSessionInfo[];
    onResetStats: () => void;
}

export const ModbusSlaveStabilityMonitor: React.FC<ModbusSlaveStabilityMonitorProps> = ({ sessions, onResetStats }) => {
    const totalDrops = sessions.reduce((sum, s) => sum + (s.dropCount || 0), 0);
    const activeSessions = sessions.filter(s => s.status === ConnectionStatus.CONNECTED);

    return (
        <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    <h3 className="text-sm font-semibold text-gray-800">网络稳定性监控 (Network Stability)</h3>
                </div>
                <button
                    onClick={onResetStats}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                    <RefreshCcw className="w-3 h-3" />
                    重置统计
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Hash className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wider">总掉线次数</span>
                    </div>
                    <div className={`text-2xl font-bold ${totalDrops > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {totalDrops}
                    </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Activity className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase tracking-wider">活跃会话</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">
                        {activeSessions.length} / {sessions.length}
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-gray-500 border-b border-gray-100">
                            <th className="pb-2 font-medium">会话名称</th>
                            <th className="pb-2 font-medium">掉线次数</th>
                            <th className="pb-2 font-medium">最后掉线端口</th>
                            <th className="pb-2 font-medium">最后掉线时间</th>
                            <th className="pb-2 font-medium">最后错误信息</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {sessions.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                <td className="py-2 font-medium text-gray-700">{s.name}</td>
                                <td className="py-2">
                                    <span className={`px-1.5 py-0.5 rounded-full font-bold ${s.dropCount && s.dropCount > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {s.dropCount || 0}
                                    </span>
                                </td>
                                <td className="py-2 text-gray-600 font-mono">{s.lastDropPort || '-'}</td>
                                <td className="py-2 text-gray-500">
                                    {s.lastDropTime ? new Date(s.lastDropTime).toLocaleString() : '-'}
                                </td>
                                <td className="py-2">
                                    {s.lastDropError ? (
                                        <div className="flex items-center gap-1 text-red-500 max-w-xs truncate" title={s.lastDropError}>
                                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                            {s.lastDropError}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
