
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { 
  Settings, 
  Activity, 
  Boxes, 
  Network, 
  ChevronRight, 
  ArrowLeft,
  Cable,
  Zap,
  X,
  Book,
  ShieldCheck,
  Cpu,
  Globe,
  Loader2,
  AlertTriangle,
  Server,
  Download
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import ProjectConfirmModal from './components/ProjectConfirmModal';
import { StatusBar } from './components/StatusBar';
import { ProjectFile, ConnectionStatus } from './types';
import { generateDetailedManual } from './services/DocxExportService';

// --- Lazy Load Sub-Applications (Optimization) ---
// This prevents loading the massive protocol logic until the user actually clicks the button.
const App = React.lazy(() => import('./App'));
const EipApp = React.lazy(() => import('./eip/EipApp'));
const ModbusApp = React.lazy(() => import('./modbus/ModbusApp'));
const ModbusSlaveApp = React.lazy(() => import('./modbus-slave/ModbusSlaveApp').then(m => ({ default: m.ModbusSlaveApp })));
const EipClass1App = React.lazy(() => import('./eip-class1/EipClass1App').then(m => ({ default: m.EipClass1App })));

type ProtocolType = 'OPCUA' | 'EIP' | 'MODBUS' | 'MODBUS_SLAVE' | 'EIP_CLASS1' | 'S7' | null;

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

// --- SILENT AUDIO KEEPALIVE ---
const SILENT_AUDIO_URI = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAAAAMAguAAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAAMGuAAAAAAAAAAAAAAAAAAAAAAAAw';

// --- GLOBAL APP VERSION ---
const APP_VERSION = "V2.6.6";

// --- NEW: Portal Settings Modal ---
interface PortalSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PortalSettingsModal: React.FC<PortalSettingsModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const specs = [
        {
            title: "OPC UA 客户端 (Client)",
            color: "text-blue-400",
            bg: "bg-blue-900/20",
            border: "border-blue-500/30",
            features: [
                "符合 IEC 62541 标准 (UA TCP Binary)",
                "支持签名与加密 (Basic256Sha256/Aes128)",
                "订阅发布机制 (Pub/Sub) 与数据录制",
                "支持复杂结构体与多维数组读写",
                "内置数据调度器与健壮性测试 (Chaos)"
            ]
        },
        {
            title: "EtherNet/IP 工作站",
            color: "text-cyan-400",
            bg: "bg-cyan-900/20",
            border: "border-cyan-500/30",
            features: [
                "基于 CIP over TCP/IP 协议 (Logix5000)",
                "支持大容量连接 (Large Fwd Open 0x5B)",
                "符号标签寻址与数组切片访问",
                "支持显式消息 (Explicit Messaging)",
                "汇川 (Inovance) 专用对齐模式支持"
            ]
        },
        {
            title: "Modbus TCP/RTU/ASCII 主站",
            color: "text-emerald-400",
            bg: "bg-emerald-900/20",
            border: "border-emerald-500/30",
            features: [
                "支持 TCP、RTU 与 ASCII 三模式通讯",
                "支持 FC 01-06, 15-16 全功能码",
                "多数据类型解析 (Int/Float/String/Hex)",
                "支持 4 种字节序实时切换 (Endianness)",
                "寄存器数据自动映射与转发"
            ]
        },
        {
            title: "Modbus TCP/RTU/ASCII 从站",
            color: "text-amber-400",
            bg: "bg-amber-900/20",
            border: "border-amber-500/30",
            features: [
                "支持 TCP、RTU 与 ASCII 模拟响应",
                "支持 20000+ 寄存器地址空间配置",
                "实时监控主站读写请求并记录报文",
                "支持多 Unit ID 逻辑设备仿真",
                "内置数据变化自动推送与同步"
            ]
        }
    ];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/50">
                            <Settings className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">平台全局设置与信息</h2>
                            <p className="text-xs text-slate-400 font-mono">Platform Settings & Information</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto space-y-8">
                    
                    {/* 1. Protocol Specs */}
                    <section>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> 协议栈核心规格 (Core Specs)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {specs.map((s, i) => (
                                <div key={i} className={`p-5 rounded-xl border ${s.bg} ${s.border} transition-transform hover:scale-[1.02]`}>
                                    <h4 className={`font-bold text-lg mb-3 ${s.color}`}>{s.title}</h4>
                                    <ul className="space-y-2">
                                        {s.features.map((f, j) => (
                                            <li key={j} className="flex items-center gap-2 text-xs text-slate-300">
                                                <div className={`w-1.5 h-1.5 rounded-full ${s.color.replace('text', 'bg')}`}></div>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 2. Copyright */}
                    <section>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" /> 版权申明 (Legal & Copyright)
                        </h3>
                        <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                            <div className="space-y-4 relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <Globe className="w-5 h-5 text-indigo-500" />
                                    <span className="text-slate-200 font-bold text-sm">Industrial Protocol Integration Platform</span>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed text-justify">
                                    本软件由 <span className="text-indigo-400 font-bold">颜伟平 (Xiao Liu Zi)</span> 独立开发，版权所有。
                                    严禁任何单位或个人擅自将本软件用于非法商业活动、破解、倒卖或进行二次打包盈利。
                                    本平台集成了 OPC UA、EtherNet/IP 及 Modbus TCP 等多种工业通讯协议，旨在为工业现场调试、压力测试及数据采集提供高效解决方案。
                                    对于侵犯版权的行为，作者保留追究法律责任的权利。
                                </p>
                                <div className="text-[10px] text-slate-600 font-mono pt-2 border-t border-slate-800">
                                    Copyright © 2024 Yan Weiping. All rights reserved.
                                </div>
                            </div>
                            {/* Watermark */}
                            <Book className="absolute -bottom-6 -right-6 w-32 h-32 text-slate-800 opacity-20 transform -rotate-12" />
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
                    <button 
                        onClick={async () => {
                            try {
                                await generateDetailedManual();
                                toast.success("操作手册生成成功！");
                            } catch (e) {
                                console.error("Failed to generate manual:", e);
                                toast.error("生成手册失败，请重试。");
                            }
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors border border-slate-700"
                    >
                        <Download className="w-4 h-4" />
                        导出详细操作手册 (.docx)
                    </button>
                    <button onClick={onClose} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-lg shadow-indigo-900/20 transition-all active:scale-95">
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

const MainShellContent: React.FC = () => {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType>(null);
  const [loadedProtocols, setLoadedProtocols] = useState<Set<ProtocolType>>(new Set());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Global Save/Close Logic
  const { getAllData, isDirty, setDirty } = useProject();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  
  // Audio Ref
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (selectedProtocol && !loadedProtocols.has(selectedProtocol)) {
      setLoadedProtocols(prev => new Set(prev).add(selectedProtocol));
    }
    
    // START AUDIO KEEPALIVE WHEN PROTOCOL IS ACTIVE
    if (selectedProtocol && audioRef.current) {
        audioRef.current.volume = 0.01; 
        audioRef.current.play().catch(e => console.warn("Audio KeepAlive blocked (Interaction needed?):", e));
    } else if (!selectedProtocol && audioRef.current) {
        audioRef.current.pause();
    }
  }, [selectedProtocol]);

  // Global Close Listener (Replaces App.tsx listener)
  useEffect(() => {
    let cleanupClose: (() => void) | undefined;

    if (isElectron) {
      cleanupClose = (window as any).electronAPI.onCloseRequest(() => {
        if (isDirty()) {
            setIsCloseModalOpen(true);
        } else {
            (window as any).electronAPI.confirmClose();
        }
      });
    } else {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty()) {
                e.preventDefault();
                e.returnValue = ''; 
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
        if (cleanupClose) cleanupClose();
    };
  }, [isDirty]);

  const handleGlobalSave = async () => {
      const { opcua, eip, modbus, modbusSlave, eipClass1 } = getAllData();
      
      const projectData: ProjectFile = {
          version: "2.6.5",
          timestamp: new Date().toISOString(),
          sessions: opcua.map(s => ({
              ...s,
              status: ConnectionStatus.DISCONNECTED,
              dropCount: 0,
              backendId: undefined,
              secureChannelId: undefined,
              sessionNodeId: undefined,
              pendingAttemptId: undefined
          })),
          eipSessions: eip.map(s => ({
              ...s,
              status: ConnectionStatus.DISCONNECTED,
              dropCount: 0,
              instanceId: undefined
          })),
          modbusSessions: modbus.map(s => ({
              ...s,
              status: ConnectionStatus.DISCONNECTED,
              dropCount: 0
          })),
          modbusSlaveSessions: modbusSlave.map(s => ({
              ...s,
              status: ConnectionStatus.DISCONNECTED
          })),
          eipClass1Sessions: eipClass1.map(s => ({
              ...s,
              status: ConnectionStatus.DISCONNECTED
          }))
      };

      const jsonStr = JSON.stringify(projectData, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
      
      if (isElectron) {
          const res = await (window as any).electronAPI.saveProject(jsonStr);
          if (res.success) {
              setDirty(false);
              toast.success("工程保存成功！");
              return true;
          } else {
              toast.error(`保存失败: ${res.error}`);
              return false;
          }
      } else {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `industrial_suite_project_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setDirty(false);
          toast.success("工程保存成功！");
          return true;
      }
  };

  const handleCloseChoice = async (choice: 'YES' | 'NO' | 'CANCEL') => {
      setIsCloseModalOpen(false);
      
      if (choice === 'CANCEL') return;

      if (choice === 'YES') {
          const saved = await handleGlobalSave();
          if (!saved) return;
      }

      if (isElectron) {
          (window as any).electronAPI.confirmClose();
      } else {
          window.close();
      }
  };

  const protocols = [
    {
      id: 'OPCUA' as ProtocolType,
      name: 'OPC UA Client',
      desc: '支持读写请求、订阅监控及数据桥接，符合 IEC 62541 标准。',
      icon: Activity,
      color: 'bg-blue-500',
      status: 'Ready',
      enabled: true
    },
    {
      id: 'EIP' as ProtocolType,
      name: 'EtherNet/IP Studio',
      desc: '支持标签通讯 (0x4C/0x4D)、通用 CIP 服务请求及高速标签扫描。',
      icon: Network,
      color: 'bg-cyan-600',
      status: 'Ready',
      enabled: true
    },
    {
      id: 'EIP_CLASS1' as ProtocolType,
      name: 'EtherNet/IP Class 1 (I/O)',
      desc: '支持隐式消息通讯 (Implicit Messaging)，支持 Scanner 与 Adapter 模式，RPI 最小 1ms。',
      icon: Cpu,
      color: 'bg-indigo-500',
      status: 'New',
      enabled: true
    },
    {
      id: 'MODBUS' as ProtocolType,
      name: 'Modbus Master',
      desc: '支持 Modbus TCP/RTU/ASCII 通讯，可读写线圈与寄存器。',
      icon: Zap,
      color: 'bg-emerald-500',
      status: 'Ready',
      enabled: true
    },
    {
      id: 'MODBUS_SLAVE' as ProtocolType,
      name: 'Modbus Slave',
      desc: '支持 Modbus TCP/RTU/ASCII 从站通讯，可配置线圈与寄存器响应主站请求。',
      icon: Server,
      color: 'bg-amber-500',
      status: 'Ready',
      enabled: true
    },
    {
      id: 'S7' as ProtocolType,
      name: 'Siemens S7',
      desc: '西门子 S7-200/300/1200/1500 专用通讯驱动。',
      icon: Cable,
      color: 'bg-orange-500',
      status: 'In Development',
      enabled: false
    }
  ];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900">
      <Toaster position="bottom-right" richColors />
      <ProjectConfirmModal isOpen={isCloseModalOpen} onChoice={handleCloseChoice} />
      <PortalSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <audio ref={audioRef} src={SILENT_AUDIO_URI} loop hidden />

      <div className="flex-1 relative overflow-hidden">
        {/* 视图 1: 工业协议集成平台门户 (Portal) */}
        <div className={`absolute inset-0 flex flex-col bg-[#0a0f18] text-slate-200 transition-all duration-500 ease-in-out z-[50] ${selectedProtocol !== null ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#1e293b,transparent)] pointer-events-none"></div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>

        {/* 头部 */}
        <header className="h-20 flex items-center px-10 relative z-10 shrink-0 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-indigo-600 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)]">
              <Boxes className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                    工业协议集成平台
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-indigo-400">
                      {APP_VERSION}
                  </span>
              </div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                Industrial Suite <span className="text-indigo-500 ml-2">Integrated Platform</span>
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-6">
              
              {/* Power/Sleep Warning Banner */}
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-900/30 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)] hover:bg-amber-900/40 transition-colors select-none cursor-default">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-amber-500 tracking-wide">
                      为保障长稳运行，请关闭电脑休眠
                  </span>
              </div>

              <div className="flex flex-col items-end">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">System Health</span>
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      Engine Online
                  </span>
              </div>
              <div className="h-6 w-px bg-slate-800"></div>
              
              {/* Platform Intro Trigger */}
              <div 
                  className="flex items-center gap-2 cursor-pointer group" 
                  onClick={() => setIsSettingsOpen(true)}
              >
                  <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      平台简介
                  </span>
                  <button 
                      className="p-2 text-slate-400 group-hover:text-white transition-colors bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 active:scale-95"
                  >
                      <Settings className="w-5 h-5" />
                  </button>
              </div>
          </div>
        </header>

        {/* 主体内容 */}
        <main className="flex-1 overflow-y-auto relative z-10 p-10 flex flex-col items-center">
          <div className="max-w-7xl w-full">
              <div className="mb-12">
                  <h2 className="text-3xl font-bold text-white mb-2">选择通讯协议</h2>
                  <p className="text-slate-500 max-w-2xl">
                      请选择需要启动的工业通讯驱动程序。平台支持多个会话并发运行，并支持不同协议间的数据桥接与转换（即将上线）。
                  </p>
              </div>

              {/* Layout adjustment: Force 4 columns on MD screens and up to fix 2x2 issue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                  {protocols.map((p) => {
                      const Icon = p.icon;
                      return (
                          <div 
                              key={p.id}
                              onClick={() => p.enabled && setSelectedProtocol(p.id)}
                              className={`group relative flex flex-col bg-white/[0.03] border transition-all duration-500 rounded-2xl overflow-hidden
                                  ${p.enabled 
                                      ? 'border-white/10 cursor-pointer hover:bg-white/[0.07] hover:border-indigo-500/50 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]' 
                                      : 'border-white/5 opacity-60 cursor-not-allowed'
                                  }
                              `}
                          >
                              <div className={`absolute top-4 right-4 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider
                                  ${p.status === 'Ready' || p.status === 'New' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}
                              `}>
                                  {p.status}
                              </div>

                              <div className="p-8">
                                  <div className={`w-14 h-14 rounded-2xl ${p.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                                      <Icon className="w-8 h-8 text-white" />
                                  </div>
                                  
                                  <h3 className="text-xl font-bold text-white mb-6">{p.name}</h3>
                                  
                                  <p className="text-sm text-slate-400 leading-relaxed mb-6 h-12 overflow-hidden">
                                      {p.desc}
                                  </p>

                                  <div className={`flex items-center gap-2 text-xs font-bold transition-all duration-300
                                      ${p.enabled ? 'text-indigo-400 group-hover:text-indigo-300' : 'text-slate-600'}
                                  `}>
                                      {p.enabled ? '立即进入 (Enter)' : '暂不可用 (Disabled)'} 
                                      <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${p.enabled ? 'group-hover:translate-x-1' : ''}`} />
                                  </div>
                              </div>
                              <div className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent transition-all duration-700 opacity-0 group-hover:opacity-100 w-full`}></div>
                          </div>
                      );
                  })}
              </div>
          </div>
          
          {/* Footer Copyright Text */}
          <div className="absolute bottom-2 right-4 text-[10px] text-slate-600 opacity-40 hover:opacity-100 transition-opacity select-none cursor-default font-mono tracking-wide">
              此软件最终解释权归颜伟平所有
          </div>
        </main>
      </div>

      {/* 视图 2: 客户端应用区域 (Keep-Alive Apps) */}
      <div className={`absolute inset-0 flex flex-col bg-slate-100 transition-all duration-500 z-[40] ${selectedProtocol !== null ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
          <div className="h-10 bg-slate-900 flex items-center px-4 justify-between shrink-0 shadow-lg z-[100]">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedProtocol(null)}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
              >
                <ArrowLeft className="w-3 h-3" /> 返回门户 (Portal)
              </button>
              <div className="h-4 w-px bg-slate-700 mx-2"></div>
              <span className={`text-[10px] font-black uppercase ${selectedProtocol === 'OPCUA' ? 'text-blue-400' : selectedProtocol === 'EIP' ? 'text-cyan-400' : selectedProtocol === 'MODBUS' ? 'text-emerald-400' : selectedProtocol === 'MODBUS_SLAVE' ? 'text-amber-400' : 'text-slate-400'}`}>
                Active Protocol: {selectedProtocol || 'None'}
              </span>
            </div>
            <div className="text-slate-500 text-[10px] font-medium">工业软件集成平台 {APP_VERSION}</div>
          </div>
          
          {/* 
              Suspense Wrapper:
              This is the key optimization. It waits for the Lazy component to load 
              and shows a fallback loader in the meantime. 
              Only when 'loadedProtocols.has()' is true (triggered by click) does it start loading.
          */}
          <div className="flex-1 relative overflow-hidden">
            <React.Suspense fallback={
                <div className="flex items-center justify-center h-full flex-col gap-3 text-slate-400 animate-in fade-in duration-500">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <span className="text-xs font-bold uppercase tracking-widest">Loading Module...</span>
                </div>
            }>
                {/* OPC UA Client */}
                {loadedProtocols.has('OPCUA') && (
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${selectedProtocol === 'OPCUA' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <App />
                    </div>
                )}

                {/* EtherNet/IP Client */}
                {loadedProtocols.has('EIP') && (
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${selectedProtocol === 'EIP' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <EipApp />
                    </div>
                )}

                {/* EtherNet/IP Class 1 */}
                {loadedProtocols.has('EIP_CLASS1') && (
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${selectedProtocol === 'EIP_CLASS1' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <EipClass1App />
                    </div>
                )}

                {/* Modbus Client */}
                {loadedProtocols.has('MODBUS') && (
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${selectedProtocol === 'MODBUS' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <ModbusApp />
                    </div>
                )}

                {/* Modbus Slave */}
                {loadedProtocols.has('MODBUS_SLAVE') && (
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${selectedProtocol === 'MODBUS_SLAVE' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <ModbusSlaveApp />
                    </div>
                )}
            </React.Suspense>
          </div>
        </div>
      </div>
      
      <StatusBar />
    </div>
  );
};

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white p-8 h-screen w-screen">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">应用发生错误</h1>
          <p className="text-slate-400 mb-4 text-center max-w-2xl">
            {this.state.error?.message || "未知错误"}
          </p>
          <pre className="bg-slate-800 p-4 rounded text-xs text-red-400 overflow-auto max-w-4xl max-h-96 whitespace-pre-wrap text-left">
            {this.state.error?.stack}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function MainShell() {
    return (
        <ProjectProvider>
            <ErrorBoundary>
                <MainShellContent />
            </ErrorBoundary>
        </ProjectProvider>
    );
}
