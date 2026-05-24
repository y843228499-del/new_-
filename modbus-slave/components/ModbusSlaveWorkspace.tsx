import React, { useState, useCallback } from 'react';
import { ModbusSlaveSessionInfo, ModbusSlaveRegisterConfig } from '../../types';
import { modbusSlaveService } from '../services/modbusSlaveService';
import { ModbusSlaveDashboard } from './ModbusSlaveDashboard';
import { ModbusSlaveRegisterTable } from './ModbusSlaveRegisterTable';
import { ModbusSlaveLogs } from './ModbusSlaveLogs';
import { Activity, Database, Settings, Terminal } from 'lucide-react';

export const ModbusSlaveWorkspace = React.memo(({ session, onUpdateSession, consoleLogs, onClearConsole }: {
    session: ModbusSlaveSessionInfo;
    onUpdateSession: (updated: ModbusSlaveSessionInfo) => void;
    consoleLogs: any[];
    onClearConsole: () => void;
}) => {
    // Modbus Slave Workspace Component
    const [activeTab, setActiveTab] = useState<'dashboard' | 'registers' | 'logs'>('dashboard');

    const handleUpdateConfig = useCallback(async (registers: ModbusSlaveRegisterConfig[]) => {
        const updatedSession = {
            ...session,
            config: {
                ...session.config,
                registers
            }
        };
        onUpdateSession(updatedSession);
    }, [session, onUpdateSession]);

    const handleClearLogs = useCallback(() => {
        onUpdateSession({
            ...session,
            config: {
                ...session.config,
                logs: []
            }
        });
    }, [session, onUpdateSession]);

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                        activeTab === 'dashboard'
                            ? 'bg-white text-amber-600 border-t border-l border-r border-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                >
                    <Activity className="w-4 h-4" />
                    仪表盘
                </button>
                <button
                    onClick={() => setActiveTab('registers')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                        activeTab === 'registers'
                            ? 'bg-white text-amber-600 border-t border-l border-r border-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                >
                    <Database className="w-4 h-4" />
                    寄存器配置
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                        activeTab === 'logs'
                            ? 'bg-white text-amber-600 border-t border-l border-r border-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                >
                    <Terminal className="w-4 h-4" />
                    通讯日志
                </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'dashboard' && (
                    <div className="h-full">
                        <ModbusSlaveDashboard 
                            session={session} 
                            onUpdateSession={onUpdateSession} 
                            onViewRegisters={() => setActiveTab('registers')}
                        />
                    </div>
                )}
                {activeTab === 'registers' && (
                    <div className="h-full">
                        <ModbusSlaveRegisterTable session={session} onUpdateConfig={handleUpdateConfig} />
                    </div>
                )}
                {activeTab === 'logs' && (
                    <div className="h-full">
                        <ModbusSlaveLogs session={session} onClearLogs={handleClearLogs} />
                    </div>
                )}
            </div>
        </div>
    );
});
