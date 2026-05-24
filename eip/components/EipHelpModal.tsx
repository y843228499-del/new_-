
import React, { useState } from 'react';
import { X, Globe, BookOpen, List, Terminal, Network, Box, Server, Zap } from 'lucide-react';

interface EipHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Lang = 'en' | 'zh';

const CONTENT = {
  zh: {
    title: "EtherNet/IP 用户手册",
    subtitle: "EIP Studio v2.5.0",
    creator: "作者：颜伟平 (Xiao Liu Zi)",
    tabs: { manual: "操作手册", specs: "技术规格", backend: "后端接口", history: "更新日志" },
    manual: [
      {
        title: "1. 标签通讯 (Tag Access)",
        icon: List,
        desc: "针对 Logix5000 系列 PLC 的符号标签读写。",
        steps: [
          "**添加标签**: 输入标签名称（如 Motor_Speed），支持数组切片（如 Data[0], Data[0-9]）。",
          "**数据类型**: 系统自动解析 CIP 类型（BOOL, SINT, INT, DINT, REAL, STRING）。",
          "**循环扫描**: 开启 '自动读取 (Auto Read)' 后，系统将以设定的频率同步 PLC 状态。",
          "**批量写入**: 支持 '批量写入 (Batch Write)' 和 '自动生成 (Auto Gen)' 功能，用于压力测试。"
        ]
      },
      {
        title: "2. 连接配置 (Connection)",
        icon: Network,
        desc: "建立 CIP 会话连接。",
        steps: [
          "**Local Interface**: 侧边栏支持选择本机网卡绑定 (Global Bind IP)，解决多网卡环境下的路由问题。",
          "**Large Forward Open**: 支持 Service 0x5B。在连接工具栏设置 Connection Size > 511 字节时自动启用，最大支持 32768 字节，极大提升大数据吞吐量。",
          "**Slot**: CPU 所在的槽号，CompactLogix 通常为 0。",
          "**Session**: 每个连接对应一个独立的 CIP 会话，支持多会话并发。"
        ]
      },
      {
        title: "3. 显式消息 (CIP Console)",
        icon: Terminal,
        desc: "通用 CIP 对象访问，用于非标签类通讯。",
        steps: [
          "**Service**: 自定义服务代码，如 0x0E (Get Attribute Single)。",
          "**Path**: 这里的 Class/Instance/Attribute 定义了 EPATH。",
          "**Raw Data**: 支持十六进制负载发送，适合高级调试。"
        ]
      }
    ],
    specs: {
      title: "协议栈详细信息",
      sections: [
        {
          title: "核心驱动 (Core Driver)",
          items: [
            { k: "Driver Name", v: "EipTagSimple.dll (Native)" },
            { k: "Driver Version", v: "v2.5.0" },
            { k: "Protocol", v: "EtherNet/IP (CIP over TCP/IP)" },
            { k: "Port", v: "44818 (TCP), 2222 (UDP)" }
          ]
        },
        {
          title: "功能特性 (Capabilities)",
          items: [
            { k: "Messaging", v: "Explicit Messaging (Class 3 Connected)" },
            { k: "Fragmentation", v: "Automatic (Read/Write Large Arrays)" },
            { k: "Batching", v: "List API (Service 0x0A / 0x55)" },
            { k: "Large Open", v: "Supported (Service 0x5B, up to 64KB)" },
            { k: "Access Mode", v: "Symbolic Tag Access (Native)" }
          ]
        },
        {
          title: "兼容性 (Compatibility)",
          items: [
            { k: "ControlLogix", v: "1756 Series (Full Support)" },
            { k: "CompactLogix", v: "1769/5069 Series (Full Support)" },
            { k: "Omron NJ/NX", v: "Supported (Tag Access)" },
            { k: "Inovance", v: "Supported (AC800/AM600)" }
          ]
        }
      ]
    },
    backend: {
      title: "核心驱动接口说明",
      desc: "本软件后端基于高性能 CIP 协议栈封装，支持以下核心 CIP 服务：",
      items: [
        { k: "0x4C (Read Tag)", v: "单标签读取 (支持数组切片)" },
        { k: "0x4D (Write Tag)", v: "单标签写入 (自动类型转换)" },
        { k: "0x0A (Multi-Service)", v: "多服务封装 (批量读写优化)" },
        { k: "0x5B (Large Open)", v: "大容量连接建立 (Large Connection)" },
        { k: "0x55 (Read List)", v: "汇川优化列表读取" }
      ]
    },
    history: [
       { v: "v2.5.0", date: "2024-12-22", desc: "新增 DLL 异常监控控制台；支持汇川 InoProShop 对齐模式 (Alignment)；优化字节序 (Endianness) 切换体验；优化网络中断时的错误处理逻辑。" },
       { v: "v2.4.0", date: "2024-12-20", desc: "界面全面中文化；新增 Large Forward Open (0x5B) 支持；新增自定义连接尺寸配置；优化批量读取的分段逻辑。" },
       { v: "v2.3.0", date: "2024-12-10", desc: "集成 EtherNet/IP 基础读写功能；支持 Multi-Service 批量请求。" }
    ]
  },
  en: {
    title: "EtherNet/IP Manual",
    subtitle: "EIP Studio v2.5.0",
    creator: "Created by: Yan Weiping",
    tabs: { manual: "Manual", specs: "Specs", backend: "Backend", history: "History" },
    manual: [
      {
        title: "1. Tag Access",
        icon: List,
        desc: "Symbolic tag access for Logix5000 family.",
        steps: [
          "**Add Tag**: Enter tag name (e.g., Motor_Speed). Supports arrays (Data[0]).",
          "**Data Type**: Auto-detected or manual match (DINT, REAL, STRING).",
          "**Scanning**: Enable 'Auto Read' for cyclic updates.",
          "**Batch Write**: Use 'Batch Write' or 'Auto Gen' for stress testing."
        ]
      },
      {
        title: "2. Connection",
        icon: Network,
        desc: "CIP Session Management.",
        steps: [
          "**Local Interface**: Bind to specific NIC via sidebar 'Global Bind IP'.",
          "**Large Forward Open**: Supports Service 0x5B. Automatically enabled when Connection Size > 511 bytes.",
          "**Slot**: CPU Slot number (Default 0).",
          "**Session**: Independent CIP session per connection."
        ]
      }
    ],
    specs: {
      title: "Protocol Stack Specs",
      sections: [
        {
          title: "Core Driver",
          items: [
            { k: "Driver Name", v: "EipTagSimple.dll (Native)" },
            { k: "Driver Version", v: "v2.5.0" },
            { k: "Protocol", v: "EtherNet/IP (CIP over TCP/IP)" }
          ]
        },
        {
          title: "Capabilities",
          items: [
            { k: "Messaging", v: "Explicit Messaging (Class 3)" },
            { k: "Fragmentation", v: "Automatic" },
            { k: "Batching", v: "Multi-Service (0x0A)" },
            { k: "Large Open", v: "Service 0x5B (Max 64KB)" }
          ]
        },
        {
          title: "Compatibility",
          items: [
            { k: "ControlLogix", v: "Supported" },
            { k: "CompactLogix", v: "Supported" },
            { k: "Omron/Inovance", v: "Supported" }
          ]
        }
      ]
    },
    backend: {
      title: "Backend Interface",
      desc: "High-performance CIP stack wrappers.",
      items: [
        { k: "0x4C", v: "Read Tag Service" },
        { k: "0x4D", v: "Write Tag Service" },
        { k: "0x0A", v: "Multi-Service Packet" },
        { k: "0x5B", v: "Large Forward Open" }
      ]
    },
    history: [
       { v: "v2.5.0", date: "2024-12-22", desc: "Added DLL Error Console; Added InoProShop Alignment support; Enhanced error logging." },
       { v: "v2.4.0", date: "2024-12-20", desc: "Full Chinese Localization; Added Large Forward Open (0x5B) support." }
    ]
  }
};

export const EipHelpModal: React.FC<EipHelpModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<Lang>('zh');
  const [activeTab, setActiveTab] = useState<'manual' | 'specs' | 'backend' | 'history'>('manual');

  if (!isOpen) return null;
  const c = CONTENT[lang];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[700px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-600 rounded-lg shadow-sm text-white"><BookOpen className="w-6 h-6" /></div>
            <div>
                <h2 className="text-xl font-bold text-slate-800 leading-tight">{c.title}</h2>
                <p className="text-xs text-slate-500 font-medium">{c.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 hover:border-cyan-500 hover:text-cyan-600 text-sm font-bold transition-all"><Globe className="w-4 h-4" /><span>{lang === 'en' ? 'English' : '中文'}</span></button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-6 h-6" /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 bg-slate-50 border-r border-slate-200 p-2 space-y-1">
             {Object.entries(c.tabs).map(([key, label]) => (
               <button key={key} onClick={() => setActiveTab(key as any)} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === key ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>{label}</button>
             ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300">
              
              {/* Manual Tab */}
              {activeTab === 'manual' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                  {c.manual.map((m, i) => {
                    const Icon = m.icon || List;
                    return (
                      <div key={i} className="bg-slate-50 rounded-xl p-6 border border-slate-200 hover:shadow-md transition-shadow">
                        <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4"><Icon className="w-5 h-5 text-cyan-600"/> {m.title}</h4>
                        <p className="text-sm text-slate-500 mb-4 italic pl-7">{m.desc}</p>
                        <ul className="space-y-3 pl-2">
                          {m.steps.map((s, j) => (
                            <li key={j} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                              <div className="w-5 h-5 rounded-full bg-white border border-cyan-200 text-cyan-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 shadow-sm">{j+1}</div>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Specs Tab */}
              {activeTab === 'specs' && c.specs && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="border-b border-slate-100 pb-4 mb-4">
                        <h3 className="text-2xl font-bold text-slate-800">{c.specs.title}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {c.specs.sections.map((sec, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:border-cyan-300 transition-colors">
                                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                                    <Box className="w-4 h-4 text-cyan-500" />
                                    {sec.title}
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {sec.items.map((item, j) => (
                                        <div key={j} className="px-5 py-3 flex justify-between items-center text-sm group hover:bg-slate-50 transition-colors">
                                            <span className="text-slate-500 font-medium group-hover:text-slate-700">{item.k}</span>
                                            <span className="text-slate-800 font-bold text-right">{item.v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
              )}

              {/* Backend Tab */}
              {activeTab === 'backend' && (
                <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-slate-900 rounded-2xl p-8 shadow-xl text-slate-300 relative overflow-hidden">
                        <Terminal className="absolute top-4 right-4 w-24 h-24 text-slate-800/50" />
                        <h3 className="text-2xl font-bold text-white mb-2">{c.backend.title}</h3>
                        <p className="text-cyan-400 mb-8 font-mono text-sm">{c.backend.desc}</p>
                        <div className="space-y-3 font-mono text-sm relative z-10">
                            {c.backend.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded border border-slate-700 hover:bg-slate-800 transition-colors">
                                    <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-xs text-slate-400 uppercase font-bold">{item.k}</div>
                                        <div className="text-white font-bold">{item.v}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && c.history && (
                  <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
                        {(c.history as any[]).map((v, i) => (
                            <div key={i} className="pl-8 relative group">
                                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-cyan-500 border-4 border-white shadow-sm group-hover:scale-125 transition-transform"></div>
                                <div className="flex flex-col gap-1 mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl font-black text-cyan-700">{v.v}</span>
                                        <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{v.date}</span>
                                    </div>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-sm leading-relaxed shadow-sm hover:shadow-md transition-shadow group-hover:bg-white group-hover:border-cyan-200">
                                    {v.desc}
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
