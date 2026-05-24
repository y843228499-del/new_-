import React, { useState, useEffect } from 'react';
import { EipClass1SessionInfo } from '../../type-definitions/eip-class1';
import { ConnectionStatus } from '../../types';
import { Play, Square, Network, BarChart3 } from 'lucide-react';
import { EipClass1ScannerView } from './EipClass1ScannerView';
import { EipClass1AdapterView } from './EipClass1AdapterView';
import { EipClass1EdsLibraryView } from './EipClass1EdsLibraryView';
import { EipClass1Dashboard } from './EipClass1Dashboard';
import { toast } from 'sonner';

interface Props {
    session: EipClass1SessionInfo;
    isActive: boolean;
    onUpdate: (updates: Partial<EipClass1SessionInfo> | ((prev: EipClass1SessionInfo) => Partial<EipClass1SessionInfo>)) => void;
    stats: Record<string, any>;
}

export const EipClass1Workspace: React.FC<Props> = ({ session, isActive, onUpdate, stats }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    const isConnecting = session.status === ConnectionStatus.CONNECTING;
    const [activeTab, setActiveTab] = useState<'config' | 'library' | 'dashboard'>('config');
    const [networkInterfaces, setNetworkInterfaces] = useState<{name: string, address: string}[]>([]);

    useEffect(() => {
        if ((window as any).electronAPI?.getNetworkInterfaces) {
            (window as any).electronAPI.getNetworkInterfaces().then((ifaces: any) => {
                setNetworkInterfaces(ifaces);
            }).catch(console.error);
        }
    }, []);

    const handleConnect = async () => {
        if (!(window as any).electronAPI) {
            toast.error("Electron API not available");
            return;
        }

        onUpdate({ status: ConnectionStatus.CONNECTING, diagnostics: [] });

        try {
            const res = await (window as any).electronAPI.eipClass1Start(session.id, {
                mode: session.mode,
                localBindIp: session.localBindIp,
                scannerConfig: session.scannerConfig,
                adapterConfig: session.adapterConfig
            });

            if (res.success) {
                console.log("Start returned success with config:", res.config);
                onUpdate({ status: ConnectionStatus.CONNECTED });
                toast.success(`${session.mode} 模式已启动`);
                
                if (session.mode === 'Scanner') {
                    const updatedScannerConfig = res.config?.scannerConfig || session.scannerConfig;
                    onUpdate({
                        scannerConfig: {
                            ...updatedScannerConfig,
                            slaves: updatedScannerConfig.slaves.map((s: any) => ({ 
                                ...s, 
                                status: s.status || 'Connected', 
                                hasErrorHistory: s.status === 'Error', 
                                dropCount: s.status === 'Error' ? (s.dropCount || 1) : 0 
                            }))
                        }
                    });
                } else {
                    // Adapter 模式: 连接保持 Disconnected，等后端 Forward Open 成功后逐个通过 conn-recovered 事件标记为 Connected
                    // 不在此处强制标记所有连接为 Connected
                }
            } else {
                onUpdate({ status: ConnectionStatus.DISCONNECTED });
                toast.error(`启动失败: ${res.error}`);
                if (session.mode === 'Scanner') {
                    onUpdate({
                        scannerConfig: {
                            ...session.scannerConfig,
                            slaves: session.scannerConfig.slaves.map(s => ({ ...s, status: 'Error', hasErrorHistory: true }))
                        }
                    });
                }
            }
        } catch (e: any) {
            onUpdate({ status: ConnectionStatus.DISCONNECTED });
            toast.error(`启动异常: ${e.message}`);
            if (session.mode === 'Scanner') {
                onUpdate({
                    scannerConfig: {
                        ...session.scannerConfig,
                        slaves: session.scannerConfig.slaves.map(s => ({ ...s, status: 'Error', hasErrorHistory: true }))
                    }
                });
            }
        }
    };

    const handleDisconnect = async () => {
        if ((window as any).electronAPI) {
            await (window as any).electronAPI.eipClass1Stop(session.id);
        }
        
        onUpdate({ status: ConnectionStatus.DISCONNECTED });
        toast.info(`${session.mode} 模式已停止`);
        
        if (session.mode === 'Scanner') {
            onUpdate({
                scannerConfig: {
                    ...session.scannerConfig,
                    slaves: session.scannerConfig.slaves.map(s => ({ ...s, status: 'Disconnected' }))
                }
            });
        } else {
            onUpdate({
                adapterConfig: {
                    ...session.adapterConfig,
                    connections: session.adapterConfig.connections.map(c => ({ ...c, status: 'Disconnected' }))
                }
            });
        }
    };

    return (
        <div className={`absolute inset-0 flex flex-col bg-slate-100 transition-opacity duration-200 ${isActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none'}`}>
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm z-10">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="w-48">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">工作模式 (Mode)</label>
                        <select
                            value={session.mode}
                            onChange={e => onUpdate({ mode: e.target.value as any })}
                            disabled={isConnected || isConnecting}
                            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60"
                        >
                            <option value="Scanner">Scanner (主站)</option>
                            <option value="Adapter">Adapter (从站)</option>
                        </select>
                    </div>

                    <div className="w-48">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">本地网卡 (Local Interface)</label>
                        <select 
                            value={session.localBindIp || '0.0.0.0'} 
                            onChange={e => onUpdate({localBindIp: e.target.value})} 
                            disabled={isConnected || isConnecting} 
                            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60" 
                        >
                            <option value="0.0.0.0">0.0.0.0 (所有网卡)</option>
                            {networkInterfaces.map((iface, idx) => (
                                <option key={idx} value={iface.address}>
                                    {iface.address} ({iface.name})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <div className="flex bg-slate-100 p-1 rounded-lg mr-4">
                            <button
                                onClick={() => setActiveTab('dashboard')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <BarChart3 className="w-4 h-4" />
                                    <span>全局监控</span>
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('config')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'config' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Network Config
                            </button>
                            <button
                                onClick={() => setActiveTab('library')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'library' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                EDS Library
                            </button>
                        </div>
                        <button 
                            onClick={isConnected ? handleDisconnect : handleConnect} 
                            disabled={isConnecting} 
                            className={`px-6 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 min-w-[140px] justify-center h-[38px] ${isConnected ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed'}`}
                        >
                            {isConnected ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            {isConnecting ? "连接中..." : isConnected ? "停止运行" : "启动运行"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full">
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'dashboard' ? (
                         <EipClass1Dashboard session={session} stats={stats} />
                    ) : activeTab === 'library' ? (
                        <EipClass1EdsLibraryView />
                    ) : session.mode === 'Scanner' ? (
                        <EipClass1ScannerView session={session} onUpdate={onUpdate} isConnected={isConnected} stats={stats} />
                    ) : (
                        <EipClass1AdapterView session={session} onUpdate={onUpdate} isConnected={isConnected} stats={stats} />
                    )}
                </div>
            </div>
        </div>
    );
};
