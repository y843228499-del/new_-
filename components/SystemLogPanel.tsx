

import React, { useState, useRef, useEffect } from 'react';
import { LogEntry } from '../types';
import { Terminal, Trash2, ChevronDown, ChevronUp, Filter, Download, Bug } from 'lucide-react';

interface SystemLogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

type LogFilter = 'ALL' | 'ERROR' | 'WARN' | 'INFO';

const SystemLogPanel: React.FC<SystemLogPanelProps> = ({ logs, onClear }) => {
  const [isOpen, setIsOpen] = useState(false); // Default to collapsed per user request
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen, filter]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'ALL') return true;
    if (filter === 'ERROR') return log.level === 'error';
    if (filter === 'WARN') return log.level === 'warn';
    if (filter === 'INFO') return log.level === 'info' || log.level === 'success';
    return true;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500 font-bold';
      case 'warn': return 'text-amber-500 font-bold';
      case 'success': return 'text-emerald-500 font-bold';
      default: return 'text-blue-400 font-bold';
    }
  };

  const handleExport = () => {
      // Create CSV header
      let csvContent = "Timestamp,Level,Session,Message\n";
      
      // Add rows
      logs.forEach(l => {
          // Escape quotes in message
          const safeMessage = l.message.replace(/"/g, '""');
          const sessionName = l.sessionName || 'SYSTEM';
          csvContent += `"${l.timestamp}","${l.level.toUpperCase()}","${sessionName}","${safeMessage}"\n`;
      });

      // Add BOM for Excel UTF-8 compatibility
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system_logs_${new Date().toISOString().replace(/:/g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // If toast is available in scope, we could show a success message, but we'll just let it download
  };

  const handleOpenDebugConsole = () => {
      if ((window as any).electronAPI?.openDevTools) {
          (window as any).electronAPI.openDevTools();
      } else {
          alert("Debug Console only available in Desktop App mode.");
      }
  };

  // Change from fixed to absolute to contain it within the main content div
  return (
    <div className={`absolute bottom-0 left-0 right-0 z-50 bg-slate-900 text-slate-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] transition-all duration-300 flex flex-col ${isOpen ? 'h-48' : 'h-9'}`}>
      
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-1.5 bg-slate-950 border-t border-slate-800 cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">System Logs</span>
            </div>
            <div className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                {logs.length} events
            </div>
        </div>

        <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-800 p-0.5">
                <Filter className="w-3 h-3 text-slate-500 ml-1 mr-1" />
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as LogFilter[]).map(f => (
                    <button 
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${filter === f ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className="h-4 w-px bg-slate-800"></div>

            <button onClick={handleOpenDebugConsole} className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors bg-purple-900/20 px-2 py-0.5 rounded border border-purple-900/50" title="Open F12 DevTools">
                <Bug className="w-3 h-3" />
                <span className="text-[10px] font-bold hidden sm:inline">Debug Console (F12)</span>
            </button>

            <div className="h-4 w-px bg-slate-800"></div>

            <button onClick={handleExport} className="text-slate-500 hover:text-white transition-colors" title="Export Logs">
                <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClear} className="text-slate-500 hover:text-red-500 transition-colors" title="Clear Logs">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
            
            <div className="h-4 w-px bg-slate-800"></div>
            
            <button onClick={() => setIsOpen(!isOpen)} className="text-slate-500 hover:text-white">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
        </div>
      </div>

      {/* Log Body */}
      {isOpen && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs bg-slate-900 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 select-text">
              {filteredLogs.length === 0 ? (
                  <div className="text-slate-600 italic px-2">No logs to display...</div>
              ) : (
                  filteredLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 hover:bg-slate-800/50 px-2 py-0.5 rounded transition-colors group">
                          <span className="text-slate-500 flex-shrink-0 w-20">{log.timestamp}</span>
                          <span className={`w-14 uppercase text-[10px] flex-shrink-0 ${getLevelColor(log.level)}`}>
                              {log.level}
                          </span>
                          <span className="text-indigo-400 font-bold flex-shrink-0 w-32 truncate" title={log.sessionName || 'System'}>
                              [{log.sessionName || 'System'}]
                          </span>
                          <span className="text-slate-300 break-all">{log.message}</span>
                      </div>
                  ))
              )}
          </div>
      )}
    </div>
  );
};

export default SystemLogPanel;