import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, Info, TerminalSquare } from 'lucide-react';
import { EipClass1SessionInfo } from '../../type-definitions/eip-class1';

export const EipClass1GlobalLogs = ({ 
    sessions, 
    isOpen, 
    onClose, 
    onClearLogs 
}: { 
    sessions: EipClass1SessionInfo[], 
    isOpen: boolean, 
    onClose: () => void,
    onClearLogs: () => void 
}) => {
    // Collect all diagnostics across sessions
    const logEntries = [];
    for (const session of sessions) {
        if (session.diagnostics) {
            for (const log of session.diagnostics) {
                logEntries.push({ ...log, sessionName: session.name, sessionId: session.id, mode: session.mode });
            }
        }
    }
    
    // Sort by chronological order
    logEntries.reverse();

    const translateMessage = (msg: string) => {
        if (!msg) return msg;
        let trans = msg;
        if (trans.includes('TCP Timeout') || trans.includes('ETIMEDOUT') || trans.includes('Timeout')) trans = 'TCP 连接超时 (目标设备未响应)';
        else if (trans.includes('ECONNREFUSED')) trans = '连接被拒绝 (目标设备网络可达但端口未监听)';
        else if (trans.includes('EHOSTUNREACH')) trans = '没有到主机的路由 (网络不可达)';
        else if (trans.includes('ENETUNREACH')) trans = '网络不可达 (本地网络配置错误)';
        else if (trans.includes('ECONNRESET')) trans = '连接被对方重置 (连接异常断开)';
        return trans === msg ? msg : `${msg} - ${trans}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-700">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 rounded-lg shadow-sm text-white">
                            <TerminalSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 leading-tight">通讯日志汇总</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                                    共 {logEntries.length} 条记录
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClearLogs}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:text-red-600 text-slate-600 text-sm font-bold transition-all shadow-sm"
                            title="清空所有日志"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>清空日志</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    {logEntries.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                            <TerminalSquare className="w-12 h-12 opacity-20" />
                            <span>暂无日志记录</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {logEntries.map((log, idx) => (
                                <div key={idx} className="flex items-start gap-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm text-sm">
                                    <div className="w-24 shrink-0 font-mono text-xs text-slate-500 pt-0.5 whitespace-nowrap">{log.time}</div>
                                    <div className="w-48 shrink-0 flex flex-col">
                                        <span className="font-bold text-slate-700 truncate">{log.sessionName}</span>
                                        <span className="text-[10px] font-bold text-slate-400 font-mono uppercase truncate">{log.mode}</span>
                                    </div>
                                    <div className={`flex-1 break-words font-medium overflow-hidden ${log.message.includes('失败') || log.message.includes('Timeout') || log.message.includes('Error') || log.message.includes('拒绝') || log.message.includes('ECONN') ? 'text-red-600' : 'text-slate-700'}`}>
                                        {translateMessage(log.message)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
