
import React, { useState } from 'react';
import { X, Globe, BookOpen, Layers, Terminal, Activity, Zap, Server, Database, ArrowRightLeft, Cpu, Settings, Search } from 'lucide-react';

interface ModbusHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Lang = 'en' | 'zh';

const CONTENT = {
  zh: {
    title: "Modbus TCP/RTU/ASCII 用户手册",
    subtitle: "Modbus Master/Slave Studio v2.6.5",
    creator: "作者：颜伟平 (Xiao Liu Zi)",
    tabs: { manual: "操作手册", protocol: "协议速查", slave: "从站仿真", backend: "后端架构", history: "更新日志" },
    manual: [
      {
        title: "1. 连接与会话 (Connection)",
        icon: Server,
        desc: "建立与 Modbus TCP/RTU/ASCII 从站 (Server) 的通讯链路。",
        steps: [
          "**TCP 模式**: 目标设备的 IP 地址及端口（默认 502）。",
          "**RTU 模式**: 选择串口 (COM Port)、波特率 (Baud Rate)、数据位、停止位及校验位。确保与物理设备参数一致。",
          "**Unit ID**: 从站地址。对于直接 TCP 连接通常为 1；若通过网关连接 RTU 设备，需准确填写。",
          "**Active Probe**: 开启后，连接建立时会立即尝试读取 0 号保持寄存器以验证链路真实性，防止虚假连接。",
          "**Timeout**: 请求超时时间。建议内网设为 1000ms，外网或 4G 网络设为 3000ms 以上。"
        ]
      },
      {
        title: "2. 寄存器管理 (Register Table)",
        icon: Database,
        desc: "核心数据交互视图，支持批量读写与数据处理。",
        steps: [
          "**功能码 (FC)**: 支持 01/02 (位读取), 03/04 (字读取), 05/06 (单写), 15/16 (多写)。",
          "**数据类型**: 自动解析 Int16/32/64, UInt16/32/64, Float32/64, Boolean, Hex String 等。",
          "**字节序 (Endian)**: 对于 32位/64位 数据，点击表格中的 'ABCD' 按钮可实时切换字节序 (Big/Little Endian/Swap)。",
          "**工程量变换 (Scaling)**: 在添加/编辑时，可设置 `Gain` (增益) 和 `Offset` (偏移)，自动将原始值转换为物理量 (如: raw * 0.1 + 0)。",
          "**全局周期**: 勾选 'Global' 可强制所有通道使用统一的扫描周期，降低配置复杂度。"
        ]
      },
      {
        title: "3. 数据调度器 (Scheduler)",
        icon: ArrowRightLeft,
        desc: "实现跨地址的数据自动映射与转发 (Loopback)。",
        steps: [
          "**任务机制**: 自动将 [Source 源地址] 的数值读取并写入到 [Target 目标地址]。",
          "**强制同步**: 只要源数据有效，系统会持续将数值覆盖写入目标地址，确保数据一致性。",
          "**自动映射 (Auto Map)**: 左侧列表选择源，中间列表选择目标，点击 'Auto Map' 可按顺序自动生成一对一的映射任务。",
          "**性能提示**: 建议调度周期 (Cycle) 设置大于 100ms，避免过度占用总线带宽。"
        ]
      },
      {
        title: "4. 仪表盘与监控 (Dashboard)",
        icon: Activity,
        desc: "实时监控通讯质量与健康度。",
        steps: [
          "**OPS (Operations Per Second)**: 每秒完成的 Modbus 请求数量，反映总线负载。",
          "**Latency (响应延迟)**: 发出请求到收到响应的耗时 (RTT)。超过 200ms 通常意味着网络拥塞。",
          "**Error Rate**: 错误请求占比。若持续升高，请检查物理接线或从站负载。",
          "**报文分析**: 仪表盘下方提供实时报文日志，支持 16 进制原始数据 (RX/TX) 展示，辅助排查协议层问题。"
        ]
      }
    ],
    slave: {
        title: "Modbus 从站仿真 (Slave Simulation)",
        desc: "模拟真实的 Modbus 设备，用于上位机测试或数据中转。",
        items: [
            { k: "多协议支持", v: "支持 Modbus TCP (网口) 与 Modbus RTU (串口) 同时仿真。" },
            { k: "地址空间", v: "支持 0x, 1x, 3x, 4x 四个区，每个区支持 0-65535 地址范围。" },
            { k: "报文记录", v: "实时记录主站发来的读取与写入请求，精确到毫秒级。" },
            { k: "数据初始化", v: "支持从 JSON 文件导入初始寄存器值，或通过 '写入测试数据' 快速填充。" }
        ]
    },
    protocol: {
        title: "功能码与地址映射速查",
        desc: "本客户端采用 0 基准地址 (Address 0 = 协议地址 0)。若文档为 PLC 地址 (如 40001)，请减 1 (即 0)。",
        items: [
            { k: "01 (0x01)", v: "Read Coils (读线圈)", area: "0x 区 (Output Coils)", type: "RW, Bit" },
            { k: "02 (0x02)", v: "Read Discrete Inputs (读离散输入)", area: "1x 区 (Input Contacts)", type: "RO, Bit" },
            { k: "03 (0x03)", v: "Read Holding Registers (读保持寄存器)", area: "4x 区 (Output Registers)", type: "RW, Word" },
            { k: "04 (0x04)", v: "Read Input Registers (读输入寄存器)", area: "3x 区 (Input Registers)", type: "RO, Word" },
            { k: "05 (0x05)", v: "Write Single Coil (写单线圈)", area: "0x 区", type: "Write Bit" },
            { k: "06 (0x06)", v: "Write Single Register (写单寄存器)", area: "4x 区", type: "Write Word" },
            { k: "15 (0x0F)", v: "Write Multiple Coils (写多线圈)", area: "0x 区", type: "Batch Write" },
            { k: "16 (0x10)", v: "Write Multiple Registers (写多寄存器)", area: "4x 区", type: "Batch Write" }
        ]
    },
    backend: {
        title: "高性能驱动架构",
        items: [
            { k: "驱动核心", v: "jsmodbus / modbus-serial (Node.js)" },
            { k: "并发模型", v: "Electron Main Process (主进程轮询)" },
            { k: "串口驱动", v: "node-serialport (支持 Windows/Linux/macOS)" },
            { k: "优化策略", v: "TCP KeepAlive, RTU Frame Hooking (原始报文捕获)" }
        ]
    },
    history: [
       { v: "v2.6.5", date: "2026-05-14", desc: "修复从站节点被过多主站高频访问时因连接异常 (ECONNRESET) 造成的底层崩溃问题。" },
       { v: "v2.6.4", date: "2026-04-28", desc: "Modbus从站新增自动保存日志和主站请求超时检测及记录展示功能；优化RTU从站原始报文截获逻辑。" },
       { v: "v2.6.3", date: "2026-04-16", desc: "新增 Modbus TCP 从站「忽略站号/Ignore Unit ID」功能，提升设备兼容性与虚拟从站灵活性；版本依赖升级。" },
       { v: "v2.6.2", date: "2024-12-26", desc: "修复 RTU 从站模式下不同站号数据串扰问题；修复从站应答站号不匹配问题；支持新建会话时配置串口参数。" },
       { v: "v2.6.1", date: "2024-12-25", desc: "完善 Modbus RTU 从站支持；增加原始报文 (RX/TX) 实时监控；修复 RTU 模式下寄存器同步问题。" },
       { v: "v2.5.0", date: "2024-12-21", desc: "新增 Modbus 调度器 (Scheduler)；优化字节序 (Endianness) 切换体验；增加 Active Probe 连接探测。" },
       { v: "v2.4.5", date: "2024-12-19", desc: "重构底层轮询引擎 (PollingManager)，将定时任务移至 Electron 后端以解决浏览器后台节流导致的数据卡顿问题。" }
    ]
  },
  en: {
    title: "Modbus TCP/RTU/ASCII User Manual",
    subtitle: "Modbus Master/Slave Studio v2.6.5",
    creator: "Created by: Yan Weiping",
    tabs: { manual: "User Manual", protocol: "Protocol", slave: "Slave Mode", backend: "Backend", history: "History" },
    manual: [
      {
        title: "1. Connection",
        icon: Server,
        desc: "Establishing communication with Modbus Server.",
        steps: [
          "**TCP Mode**: Target device IP and port (Default 502).",
          "**RTU Mode**: Select COM Port, Baud Rate, Data Bits, Stop Bits, and Parity.",
          "**Unit ID**: Slave ID. Usually 1 for direct TCP, specific ID for Gateways.",
          "**Active Probe**: If enabled, attempts to read Holding Register 0 immediately after connect to verify link.",
          "**Timeout**: Request timeout in ms."
        ]
      },
      {
        title: "2. Register Table",
        icon: Database,
        desc: "Core data view for reading and writing.",
        steps: [
          "**Function Codes**: Supports 01/02/03/04 (Read) and 05/06/15/16 (Write).",
          "**Data Types**: Int16/32/64, Float32/64, Boolean, Hex, etc.",
          "**Endianness**: Toggle 'ABCD' button to switch byte order for 32/64-bit values.",
          "**Scaling**: Configure Gain and Offset to convert raw values to engineering units.",
          "**Global Cycle**: Force all tags to use the same scan rate."
        ]
      },
      {
        title: "3. Scheduler",
        icon: ArrowRightLeft,
        desc: "Data bridging and mapping.",
        steps: [
          "**Mapping**: Reads from Source Node and writes to Target Node.",
          "**Sync**: Continuously overwrites Target with Source value.",
          "**Auto Map**: Select source list and target list to automatically generate pairs.",
          "**Cycle**: Set a reasonable cycle (e.g., >100ms) to prevent bus saturation."
        ]
      },
      {
        title: "4. Dashboard",
        icon: Activity,
        desc: "Real-time health monitoring.",
        steps: [
          "**OPS**: Operations Per Second.",
          "**Latency**: Round Trip Time (RTT).",
          "**Error Rate**: Percentage of failed requests.",
          "**Packet Analysis**: Real-time hex logs for RX/TX frames are available in the dashboard."
        ]
      }
    ],
    slave: {
        title: "Modbus Slave Simulation",
        desc: "Simulate real Modbus devices for testing.",
        items: [
            { k: "Multi-Protocol", v: "Supports both Modbus TCP and RTU simulation." },
            { k: "Address Space", v: "Supports 0x, 1x, 3x, 4x areas with full 0-65535 range." },
            { k: "Request Logging", v: "Logs all incoming read/write requests with millisecond precision." },
            { k: "Data Init", v: "Import register values from JSON or use 'Write Test Data' for quick setup." }
        ]
    },
    protocol: {
        title: "Function Codes Reference",
        desc: "Base 0 addressing used. (e.g., PLC Address 40001 = Protocol Address 0)",
        items: [
            { k: "01 (0x01)", v: "Read Coils", area: "0x Output Coils", type: "RW" },
            { k: "02 (0x02)", v: "Read Discrete Inputs", area: "1x Input Contacts", type: "RO" },
            { k: "03 (0x03)", v: "Read Holding Registers", area: "4x Output Registers", type: "RW" },
            { k: "04 (0x04)", v: "Read Input Registers", area: "3x Input Registers", type: "RO" },
            { k: "05/06", v: "Write Single", area: "0x / 4x", type: "Write" },
            { k: "15/16", v: "Write Multiple", area: "0x / 4x", type: "Batch" }
        ]
    },
    backend: {
        title: "Driver Architecture",
        items: [
            { k: "Core Driver", v: "jsmodbus / modbus-serial (Node.js)" },
            { k: "Concurrency", v: "Electron Main Process Polling" },
            { k: "Serial Driver", v: "node-serialport" },
            { k: "Optimization", v: "TCP KeepAlive & RTU Frame Hooking" }
        ]
    },
    history: [
       { v: "v2.6.5", date: "2026-05-14", desc: "Fixed severe crash (ECONNRESET) on TCP slave when bombarded by multiple masters with faulty connections." },
       { v: "v2.6.4", date: "2026-04-28", desc: "Added Modbus Slave auto log export and master request timeout detection; Optimized RTU slave raw frame hooking." },
       { v: "v2.6.3", date: "2026-04-16", desc: "Added Modbus TCP Slave 'Ignore Unit ID' feature to increase compatibility and flexibility." },
       { v: "v2.6.2", date: "2024-12-26", desc: "Fixed RTU slave crosstalk between unit IDs; Fixed slave response unit ID mismatch; Added serial port config on session creation." },
       { v: "v2.6.1", date: "2024-12-25", desc: "Improved Modbus RTU Slave support; Added RX/TX frame monitoring; Fixed RTU register sync." },
       { v: "v2.5.0", date: "2024-12-21", desc: "Added Modbus Scheduler; Enhanced Endianness toggle; Added Active Probe." }
    ]
  }
};

export const ModbusHelpModal: React.FC<ModbusHelpModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<Lang>('zh');
  const [activeTab, setActiveTab] = useState<'manual' | 'protocol' | 'slave' | 'backend' | 'history'>('manual');

  if (!isOpen) return null;
  const c = CONTENT[lang];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[700px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600 rounded-lg shadow-sm text-white"><BookOpen className="w-6 h-6" /></div>
            <div>
                <h2 className="text-xl font-bold text-slate-800 leading-tight">{c.title}</h2>
                <p className="text-xs text-slate-500 font-medium">{c.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 hover:border-amber-500 hover:text-amber-600 text-sm font-bold transition-all"><Globe className="w-4 h-4" /><span>{lang === 'en' ? 'English' : '中文'}</span></button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-6 h-6" /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 bg-slate-50 border-r border-slate-200 p-2 space-y-1">
             {Object.entries(c.tabs).map(([key, label]) => (
               <button key={key} onClick={() => setActiveTab(key as any)} className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === key ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>{label}</button>
             ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300">
              
              {/* Manual Tab */}
              {activeTab === 'manual' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  {c.manual.map((m, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-6 border border-slate-200 hover:shadow-md transition-shadow">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-2"><m.icon className="w-5 h-5 text-amber-600"/> {m.title}</h4>
                      <p className="text-sm text-slate-500 mb-4 italic pl-7 border-l-2 border-amber-200 ml-2">{m.desc}</p>
                      <ul className="space-y-3 pl-2">
                        {m.steps.map((s, j) => (
                            <li key={j} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                                <div className="w-5 h-5 rounded-full bg-white border border-amber-200 text-amber-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 shadow-sm">{j+1}</div>
                                <span>{s}</span>
                            </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Slave Tab */}
              {activeTab === 'slave' && (
                <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 relative overflow-hidden">
                        <Server className="absolute top-4 right-4 w-24 h-24 text-slate-100" />
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">{c.slave.title}</h3>
                        <p className="text-sm text-slate-500 mb-8">{c.slave.desc}</p>
                        <div className="space-y-3 relative z-10">
                            {c.slave.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-white hover:shadow-md transition-all">
                                    <Zap className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">{item.k}</div>
                                        <div className="text-slate-800 font-bold">{item.v}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
              )}

              {/* Protocol Tab */}
              {activeTab === 'protocol' && (
                <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-50 p-4 border-b border-slate-200">
                            <h3 className="font-bold text-slate-700">{c.protocol.title}</h3>
                            <p className="text-xs text-slate-500 mt-1">{c.protocol.desc}</p>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                                <tr><th className="p-4 w-32">Function</th><th className="p-4">Description</th><th className="p-4">Address Area</th><th className="p-4 text-right">Type</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {c.protocol.items.map((item, i) => (
                                    <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                                        <td className="p-4 font-mono font-bold text-amber-700">{item.k}</td>
                                        <td className="p-4 text-slate-700 font-medium">{item.v}</td>
                                        <td className="p-4 text-slate-500 text-xs">{item.area}</td>
                                        <td className="p-4 text-right"><span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-bold border border-slate-200">{item.type}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
              )}

              {/* Backend Tab */}
              {activeTab === 'backend' && (
                <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-slate-900 rounded-2xl p-8 shadow-xl text-slate-300 relative overflow-hidden">
                        <Terminal className="absolute top-4 right-4 w-24 h-24 text-slate-800/50" />
                        <h3 className="text-2xl font-bold text-white mb-6">Backend Architecture</h3>
                        <div className="space-y-3 font-mono text-sm relative z-10">
                            {c.backend.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
                                    <Cpu className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">{item.k}</div>
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
                                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-amber-500 border-4 border-white shadow-sm group-hover:scale-125 transition-transform"></div>
                                <div className="flex flex-col gap-1 mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl font-black text-amber-700">{v.v}</span>
                                        <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{v.date}</span>
                                    </div>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-sm leading-relaxed shadow-sm hover:shadow-md transition-shadow group-hover:bg-white group-hover:border-amber-200">
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
