import React from 'react';
import { X, Activity } from 'lucide-react';
import { ModbusSlaveSessionInfo } from '../../types';
import { ModbusSlaveStabilityMonitor } from './ModbusSlaveStabilityMonitor';

interface ModbusSlaveStabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ModbusSlaveSessionInfo[];
  onResetStats: () => void;
}

export const ModbusSlaveStabilityModal: React.FC<ModbusSlaveStabilityModalProps> = ({ isOpen, onClose, sessions, onResetStats }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm text-white"><Activity className="w-6 h-6" /></div>
            <div>
                <h2 className="text-xl font-bold text-slate-800 leading-tight">网络稳定性监控</h2>
                <p className="text-xs text-slate-500 font-medium">Network Stability Monitor</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-6 h-6" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
            <ModbusSlaveStabilityMonitor sessions={sessions} onResetStats={onResetStats} />
        </div>
      </div>
    </div>
  );
};
