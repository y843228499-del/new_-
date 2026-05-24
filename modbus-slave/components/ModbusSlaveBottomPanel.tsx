import React, { useState } from 'react';
import { Terminal, Bug, Trash2 } from 'lucide-react';

export const ModbusSlaveBottomPanel: React.FC<{ logs: any[], consoleLogs: any[], onClearConsole: () => void }> = ({ logs, consoleLogs, onClearConsole }) => {
    const [activeTab, setActiveTab] = useState<'system' | 'debug'>('system');

    return (
        <div className="h-64 bg-slate-900 rounded-xl border border-slate-700 shadow-lg flex flex-col overflow-hidden mt-4">
            <div className="flex items-center border-b border-slate-700 bg-slate-800">
                <button 
                    onClick={() => setActiveTab('system')}
                    className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${activeTab === 'system' ? 'text-white bg-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Terminal className="w-3.5 h-3.5" /> 系统日志
                </button>
                <button 
                    onClick={() => setActiveTab('debug')}
                    className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${activeTab === 'debug' ? 'text-white bg-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Bug className="w-3.5 h-3.5" /> 调试控制台
                </button>
                <button 
                    onClick={onClearConsole}
                    className="ml-auto px-4 py-2 text-slate-400 hover:text-red-400"
                    title="清空控制台"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-slate-300">
                {activeTab === 'system' ? (
                    logs.map((log) => <div key={log.id}>[{log.timestamp}] {log.message}</div>)
                ) : (
                    consoleLogs.map((log) => <div key={log.id} className={log.type === 'error' ? 'text-red-400' : 'text-slate-300'}>[{log.timestamp}] {log.message}</div>)
                )}
            </div>
        </div>
    );
};
