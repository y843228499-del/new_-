
import React, { useState } from 'react';
import { X, Globe, BookOpen, Layers, History, Play, MousePointer2, List, Gauge, Server, Box, ShieldCheck, Terminal, Gavel, Cpu, Zap, Activity, TrendingUp, FolderTree, ArrowRightLeft, Bell, Bot, Keyboard, AlertTriangle, Stethoscope, Save, Skull } from 'lucide-react';
import { opcuaService } from '../services/opcuaService';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Lang = 'en' | 'zh';

const NavBtn = ({ active, onClick, icon: Icon, label, isDanger }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active 
        ? (isDanger ? 'bg-red-50 text-red-600 shadow-sm border border-red-100' : 'bg-white text-indigo-600 shadow-sm border border-slate-200')
        : (isDanger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900')
    }`}
  >
    <Icon className={`w-4 h-4 ${active ? (isDanger ? 'text-red-600' : 'text-indigo-600') : (isDanger ? 'text-red-500' : 'text-slate-400')}`} />
    {label}
  </button>
);

const CONTENT = {
  en: {
    title: "Documentation & User Guide",
    subtitle: "React OPC UA Client v2.4.0",
    creator: "Created by: Yan Weiping (Xiao Liu Zi)",
    tabs: {
      manual: "User Manual",
      features: "Specs",
      protocol: "Stack Info",
      changelog: "History", 
      legal: "Legal & Copyright"
    },
    manual: {
      intro: "Welcome to the Professional OPC UA Client (v2.4.0). This dashboard is designed for high-performance industrial data testing, monitoring, and simulation.",
      categories: [
        {
          id: 'connection',
          title: "1. Connection & Session",
          icon: Play,
          items: [
            { 
              title: "Session Management",
              desc: "Establishing connectivity.",
              content: [
                "**Endpoint Discovery**: Click the Globe icon to discover server endpoints and security policies.",
                "**Advanced Settings**: Customize 'Session Timeout' and 'KeepAlive Interval' for unstable networks.",
                "**Auto Automation**: Toggle 'Auto Read' or 'Auto Sub' to immediately start data operations upon successful connection.",
                "**Batch Operations**: Use the sidebar toolbar to Batch Create, Copy/Paste, or Delete sessions efficiently."
              ]
            }
          ]
        },
        {
          id: 'browser',
          title: "2. Address Space",
          icon: FolderTree,
          items: [
            {
              title: "Browser & Basket",
              desc: "Navigating the node tree.",
              content: [
                "**Virtual Tree**: Efficiently browse servers with thousands of nodes.",
                "**Browse Limit**: Set the maximum number of references to return per node (default 100) to optimize performance on heavy servers.",
                "**Context Menu**: Right-click nodes to view attributes, refresh children, or copy NodeIDs.",
                "**Variable Basket**: Stage nodes in the right-hand list before adding them to other views."
              ]
            }
          ]
        },
        {
          id: 'rw',
          title: "3. Data Access (Read/Write)",
          icon: List,
          items: [
             {
              title: "Tag Management",
              desc: "Reading and writing values.",
              content: [
                "**Batch Groups**: Organize tags into tabbed groups (e.g., 'Motor', 'Sensor').",
                "**Value Inspector**: Double-click arrays or matrices to open a visual editor with 2D/3D grid support and Excel-compatible copy-paste.",
                "**Array Expansion**: Use the 'Split' icon on array nodes to explode them into individual elements for granular control.",
                "**Snapshot I/O**: Export current values to CSV snapshots or import tags from templates.",
                "**Auto-Increment**: Use the 'Auto +1' feature to simulate changing data for stress testing."
              ]
             }
          ]
        },
        {
          id: 'sub',
          title: "4. Subscription",
          icon: Activity,
          items: [
             {
              title: "Monitoring",
              desc: "Real-time data changes.",
              content: [
                "**Views**: Create multiple subscription views with different publishing intervals.",
                "**Quick Add**: Paste a comma-separated list of NodeIDs into the toolbar input to quickly monitor specific tags.",
                "**Global Controls**: Use 'Start All' or 'Pause All' to manage all subscriptions at once.",
                "**Live Recording**: Use the 'REC' button to buffer incoming data and export it to CSV for offline analysis."
              ]
             }
          ]
        },
        {
          id: 'trend',
          title: "5. Real-time Trends",
          icon: TrendingUp,
          items: [
            {
              title: "Charting",
              desc: "Visualizing data over time.",
              content: [
                "**Measurement Cursors**: Toggle X/Y cursors to measure time deltas (Δt) and value differences (Δv).",
                "**Grid Control**: Manually adjust X-axis (ms) and Y-axis grid intervals for cleaner visualization.",
                "**Axis Control**: Select 'X Axis' or 'Y Axis' to specifically zoom or pan that dimension using mouse wheel/drag.",
                "**View Modes**: Switch between 'Overlay' (all lines on one chart) or 'Split' (grid of individual charts)."
              ]
            }
          ]
        },
        {
          id: 'scheduler',
          title: "6. Data Scheduler",
          icon: ArrowRightLeft,
          items: [
            {
              title: "Data Bridging",
              desc: "Automated data transfer between nodes.",
              content: [
                "**Group Management**: Organize tasks into groups. Each group runs on its own cycle.",
                "**Auto Map**: Automatically generate tasks by pairing Source[i] with Target[i] candidates.",
                "**Task I/O**: Export your mapping configuration to CSV for backup, or import existing tasks.",
                "**Batch Tuning**: Configure the 'Write Batch Size' (default 100) to prevent server overload during bulk data transfers."
              ]
             }
          ]
        },
        {
          id: 'events',
          title: "7. Events & Alarms",
          icon: Bell,
          items: [
            {
              title: "A&C Monitoring",
              desc: "Real-time alerts and conditions.",
              content: [
                "**Subscription**: Toggle 'Start Events' to receive real-time notifications from the server's EventNotifier.",
                "**Severity Levels**: Events are color-coded (Red=Critical, Yellow=Warning, Blue=Info).",
                "**System Events**: Unexpected connection drops are also injected here as high-priority local events."
              ]
            }
          ]
        },
        {
          id: 'diag',
          title: "8. Diagnostics & Logging",
          icon: Gauge,
          items: [
            {
              title: "System Health & Logs",
              desc: "Monitoring the client health.",
              content: [
                "**Event Filtering**: Use levels (INFO/WARN/ERROR) in the bottom panel to filter critical events.",
                "**Log Buffer**: The application maintains a sliding window of the last 500 events to balance memory and history.",
                "**Debug Console**: In Desktop mode, use the 'Bug' icon or F12 to access the raw Node.js/Chrome console for deep protocol inspection.",
                "**Persistence**: Export your current session logs to a `.log` file for external support or auditing.",
                "**Performance Monitor**: Tracking slow operations (>150ms) to identify network congestion."
              ]
            }
          ]
        },
        {
          id: 'copilot',
          title: "9. AI Copilot",
          icon: Bot,
          items: [
            {
              title: "Intelligent Assistant",
              desc: "Natural language control and expert knowledge.",
              content: [
                "**Modes**: Switch between 'Auto' (Smart), 'App Control' (Commands), or 'Protocol Expert' (Knowledge).",
                "**App Control**: Try saying 'Create 5 sessions' or 'Duplicate this session' to control the software.",
                "**Protocol Expert**: Ask questions like 'What is SecurityPolicy?' to get instant technical answers.",
                "**Deep Diagnosis**: The AI actively scans session configuration and logs to identify root causes of connection failures."
              ]
            }
          ]
        },
        {
          id: 'shortcuts',
          title: "10. Shortcuts & Tips",
          icon: Keyboard,
          items: [
            {
              title: "Power User Tricks",
              desc: "Work faster with keyboard shortcuts.",
              content: [
                "**Multi-Select**: Hold `Ctrl` (Cmd) to select multiple items in any list.",
                "**Range Select**: Hold `Shift` to select a range of items between two clicks.",
                "**Quick Check**: Press `Space` to toggle checkboxes in the Browser.",
                "**Select All**: Press `Ctrl + A` to select all items in a filtered list.",
                "**Drag & Drop**: Drag nodes from Browser to ANY tab header to add them instantly."
              ]
            }
          ]
        },
        {
          id: 'pki',
          title: "11. Certificate Management (PKI)",
          icon: ShieldCheck,
          items: [
            {
              title: "Security Certificates",
              desc: "Managing trust between client and server.",
              content: [
                "**Trust Mechanism**: Secure connections require mutual certificate trust.",
                "**Rejected**: Server certificates from failed connection attempts usually appear here first. Move them to Trusted to allow connection.",
                "**Trusted**: Contains all server certificates you have explicitly trusted.",
                "**Own**: Your client certificate. You may need to export this to the server's trust list."
              ]
            }
          ]
        },
        {
          id: 'troubleshoot',
          title: "12. Troubleshooting",
          icon: Stethoscope,
          items: [
            {
              title: "Common Issues",
              desc: "Self-help for connectivity problems.",
              content: [
                "**Connection Refused**: Ensure server is running and port (e.g., 4840) is open in firewall.",
                "**BadSecurityChecksFailed**: The server rejected the client certificate. Move client cert to server's trusted store.",
                "**BadTimeout**: Network latency is high. Increase 'Session Timeout' in connection settings.",
                "**BadNotConnected**: The connection was lost. Check 'Drop Stats' to see frequency or enable Auto Reconnect."
              ]
            }
          ]
        },
        {
          id: 'project',
          title: "13. Project Management",
          icon: Save,
          items: [
            {
              title: "Workspace Persistence",
              desc: "Saving and loading configurations.",
              content: [
                "**Save Project**: Exports all sessions, groups, and nodes to a `.json` file.",
                "**Open Project**: Restores a workspace. Passwords are NOT saved for security.",
                "**Auto-Recovery**: The app caches your current state locally to prevent data loss on exit."
              ]
            }
          ]
        },
        {
          id: 'chaos',
          title: "14. Chaos Testing",
          icon: Skull,
          items: [
            {
              title: "Reliability & Stress",
              desc: "Advanced testing for server robustness.",
              content: [
                "**Traffic Stress**: Flood server with sessions or malformed TCP packets to test stability.",
                "**Logic Load**: Create massive subscriptions (Sub Storm) or rapid connect/disconnect cycles (Flapping).",
                "**Security Check**: Attempt protocol downgrades or encryption handshake stress (Secure Stress).",
                "**Safety Mechanism**: Use the 'Emergency Stop' button to halt all active attack threads immediately."
              ]
            }
          ]
        }
      ]
    },
    features: {
      title: "Technical Specifications",
      sections: [
        {
          title: "Connectivity Stack",
          items: [
            { k: "Protocol", v: "OPC UA TCP (Binary)" },
            { k: "Security", v: "None, Basic256Sha256, Aes128_Sha256_RsaOaep" },
            { k: "Transport", v: "node-opcua (Client Side)" },
            { k: "Auth", v: "Anonymous, Username, Certificate" }
          ]
        },
        {
          title: "UI Performance",
          items: [
            { k: "Framework", v: "React 19 + Electron + Vite" },
            { k: "List Capacity", v: "Virtualization supports 50k+ items" },
            { k: "Update Rate", v: "Up to 50ms refresh cycle" },
            { k: "Theme", v: "Tailwind CSS (Slate/Enterprise)" }
          ]
        }
      ]
    },
    changelog: {
      title: "Version History",
      versions: [
        { v: "v2.4.0", date: "2024-12-20", desc: "Added Chaos Testing module for reliability engineering. Introduced low-level read/write overrides and Subscription Storm simulation." },
        { v: "v2.3.5", date: "2024-12-18", desc: "Diag Update: Enhanced documentation for System Logs and added integrated F12 Debug Console access." },
        { v: "v2.3.2", date: "2024-12-17", desc: "Docs Update: Added documentation for Scheduler CSV Import/Export and Browser Limit settings." },
        { v: "v2.3.1", date: "2024-12-16", desc: "Trend Update: Added Oscilloscope-style cursors (X/Y) and individual axis control for precise measurements." },
        { v: "v2.3.0", date: "2024-12-16", desc: "Feature: Integrated AI Copilot for intelligent diagnostics and voice/text control. Added Drop Stats monitoring." },
        { v: "v2.0.0", date: "2024-12-10", desc: "Major Release: Data Scheduler (Forwarder) with Auto Map. Rebuilt Data Access panel with Virtual DOM." }
      ]
    },
    protocol: {
      title: "Stack Info",
      desc: "Built on the node-opcua stack, compliant with IEC 62541 standards."
    },
    legal: {
        title: "LEGAL DISCLAIMER & COPYRIGHT",
        content: "This software is developed by Yan Weiping. All rights reserved. Unauthorized commercial use, redistribution, or modification for profit is STRICTLY PROHIBITED."
    }
  },
  zh: {
    title: "用户手册与帮助文档",
    subtitle: "React OPC UA 客户端 v2.4.0",
    creator: "作者：颜伟平 (Xiao Liu Zi)",
    tabs: {
      manual: "操作手册",
      features: "功能规格",
      protocol: "协议信息",
      changelog: "更新日志", 
      legal: "版权声明"
    },
    manual: {
      intro: "欢迎使用专业版 OPC UA 客户端 (v2.4.0)。本软件专为高性能工业数据监控场景设计，旨在帮助您更高效地管理 OPC UA 会话、诊断网络问题以及生成测试数据。",
      categories: [
        {
          id: 'connection',
          title: "1. 连接与会话 (Connection)",
          icon: Play,
          items: [
            { 
              title: "连接管理",
              desc: "建立服务器通信。",
              content: [
                "**端点发现**: 点击“地球”图标自动获取服务器支持的安全策略与加密模式。",
                "**高级配置**: 可自定义会话超时 (Timeout) 和保活间隔 (KeepAlive) 以适应不稳定网络。",
                "**自动任务**: 勾选 'Auto Read' 或 'Auto Sub'，连接成功后将立即启动读取或订阅任务。",
                "**批量操作**: 使用侧边栏工具栏进行会话的批量创建、复制/粘贴及删除。"
              ]
            }
          ]
        },
        {
          id: 'browser',
          title: "2. 地址空间 (Browser)",
          icon: FolderTree,
          items: [
            {
              title: "浏览与篮子",
              desc: "节点导航与筛选。",
              content: [
                "**虚拟树**: 采用高性能虚拟列表，流畅浏览包含数万节点的复杂地址空间。",
                "**浏览限制 (Limit)**: 设置单次浏览返回的子节点最大数量 (默认100)，优化在巨量节点服务器上的性能。",
                "**右键菜单**: 支持查看节点属性、刷新子节点、一键复制 NodeID。",
                "**变量篮子**: 在右侧暂存感兴趣的节点，支持批量添加到读写、订阅或趋势面板。"
              ]
            }
          ]
        },
        {
          id: 'rw',
          title: "3. 数据读写 (Read/Write)",
          icon: List,
          items: [
             {
              title: "变量管理",
              desc: "读写测试工具。",
              content: [
                "**分组管理**: 支持多 Tab 分组管理。右键可重命名、移动或清空分组。",
                "**数值查看器**: 双击复杂数值（数组/矩阵）打开专用查看器，支持 2D/3D 网格视图及与 Excel 互通的复制粘贴。",
                "**数组展开**: 支持将数组类型的节点展开 (Explode) 为独立的元素进行单独监控和写入。",
                "**快照导入导出**: 支持将当前点位配置及数值导出为 CSV 快照，或从模板导入。",
                "**批量写入**: 选中多个节点后点击 'Batch Write' 可一次性写入相同数值。",
                "**自动递增**: 开启 'Auto +1' 功能，循环写入递增数值以测试服务器写入性能。"
              ]
             }
          ]
        },
        {
          id: 'sub',
          title: "4. 订阅监控 (Subscription)",
          icon: Activity,
          items: [
             {
              title: "实时监控",
              desc: "订阅数据变化。",
              content: [
                "**多视图**: 支持创建多个订阅视图，独立配置发布间隔 (Publishing Interval)。",
                "**快速添加**: 在工具栏输入框粘贴以逗号分隔的 NodeID 列表，可快速批量添加监控项。",
                "**全局控制**: 使用顶部的 'Start All' 或 'Pause All' 按钮统一管理所有订阅。",
                "**数据录制**: 点击 REC 按钮缓存实时数据流，并支持导出为 CSV 文件进行离线分析。",
                "**状态指示**: 顶部的 RX 指示灯会在接收到数据包时闪烁。"
              ]
             }
          ]
        },
        {
          id: 'trend',
          title: "5. 实时趋势 (Trend)",
          icon: TrendingUp,
          items: [
            {
              title: "图表分析",
              desc: "数据可视化。",
              content: [
                "**示波器光标**: 开启 X/Y 轴光标，拖动测量线以计算时间差 (Δt) 或数值差 (Δv)，模拟示波器体验。",
                "**网格自定义**: 支持手动调整 X 轴 (时间) 和 Y 轴 (数值) 的网格密度，优化视觉体验。",
                "**轴控操作**: 在工具栏选择“X轴”或“Y轴”，即可针对特定维度进行鼠标滚轮缩放或拖拽平移。",
                "**视图模式**: 支持叠加模式 (Overlay) 和分屏模式 (Split Grid)。",
                "**插值设置**: 针对模拟量使用线性插值，针对开关量使用阶梯插值。"
              ]
             }
          ]
        },
        {
          id: 'scheduler',
          title: "6. 数据调度 (Scheduler)",
          icon: ArrowRightLeft,
          items: [
            {
              title: "数据桥接",
              desc: "节点间数据流转。",
              content: [
                "**分组管理**: 支持将传输任务划分为多个逻辑分组，独立配置周期。",
                "**自动映射**: 点击 Auto Map 按钮，按顺序自动配对源列表和目标列表中的节点。",
                "**任务 I/O**: 支持将调度任务导出为 CSV 备份，或从文件导入配置。",
                "**批量调优**: 配置“写入批次大小 (Batch Size)”，在大量点位传输时平衡服务器负载。"
              ]
             }
          ]
        },
        {
          id: 'events',
          title: "7. 报警与事件 (Events)",
          icon: Bell,
          items: [
            {
              title: "报警监控",
              desc: "订阅 A&C 实时信息。",
              content: [
                "**订阅控制**: 点击 'Start Events' 即可接收来自服务器 EventNotifier 的实时报警推送。",
                "**严重性分级**: 报警根据严重程度（Severity）显示不同颜色（红色严重、黄色警告等）。",
                "**本地注入**: 系统也会将断线等本地状态注入到此列表中，作为高优先级的系统报警。"
              ]
            }
          ]
        },
        {
          id: 'diag',
          title: "8. 诊断与日志 (Diagnostics)",
          icon: Gauge,
          items: [
            {
              title: "系统健康与日志",
              desc: "客户端运行状态监控。",
              content: [
                "**分级过滤**: 底座面板支持按 INFO (常规)、WARN (警告)、ERROR (错误) 过滤历史事件。",
                "**滚动缓存**: 系统默认保留最近 500 条操作日志，在保证历史可查的同时避免占用过大内存。",
                "**调试控制台**: 桌面模式下，点击“昆虫”图标或按 F12 可直接调用 Chromium 开发者工具，查看底层协议原始交互。",
                "**日志持久化**: 支持将当前会话生成的日志一键导出为 `.log` 文件，方便提交给专家进行深度排错。",
                "**掉线统计**: 实时记录意外断线次数及具体的报错代码。"
              ]
            }
          ]
        },
        {
          id: 'copilot',
          title: "9. AI 智能助手 (Copilot)",
          icon: Bot,
          items: [
            {
              title: "智能助手",
              desc: "自然语言控制与专家知识库。",
              content: [
                "**三大模式**: 切换“智能 (Auto)”、“软件操作 (App)”或“协议百科 (Protocol)”以获得精准辅助。",
                "**软件操作**: 尝试输入“创建5个会话”或“复制当前会话”，助手将为您自动执行操作。",
                "**协议百科**: 询问诸如“什么是 SecurityPolicy？”等专业问题，获取即时解答。",
                "**深度诊断**: AI 会主动扫描会话配置与后台日志，识别连接失败的根本原因（如安全策略冲突、证书未信任）。"
              ]
            }
          ]
        },
        {
          id: 'shortcuts',
          title: "10. 快捷键与技巧 (Tips)",
          icon: Keyboard,
          items: [
            {
              title: "高效操作指南",
              desc: "掌握这些技巧以提升效率。",
              content: [
                "**多选**: 按住 `Ctrl` (或 Cmd) 可在任意列表中进行多选。",
                "**范围选择**: 按住 `Shift` 可选择两次点击之间的所有项。",
                "**快速勾选**: 在地址空间中选中节点后，按 `Space` 键可快速勾选/取消勾选。",
                "**全选**: 在列表获得焦点时，按 `Ctrl + A` 可选中当前视图内的所有项。",
                "**跨屏拖拽**: 将节点从地址空间直接拖拽到任意 Tab标签页上，即可快速添加。"
              ]
            }
          ]
        },
        {
          id: 'pki',
          title: "11. 证书管理 (PKI)",
          icon: ShieldCheck,
          items: [
            {
              title: "安全证书",
              desc: "管理客户端与服务器的信任关系。",
              content: [
                "**信任机制**: OPC UA 安全连接依赖证书互信。连接失败常因证书未被信任。",
                "**Rejected (已拒绝)**: 连接尝试失败后，服务器的证书通常会出现在此列表中。右键点击或使用操作按钮将其移入 Trusted。",
                "**Trusted (受信任)**: 存放所有已信任的服务器证书。",
                "**Own (自有)**: 客户端自身的公钥和私钥。部分服务器需要您手动将此证书导入到服务器的信任列表。"
              ]
            }
          ]
        },
        {
          id: 'troubleshoot',
          title: "12. 常见问题排查 (Troubleshooting)",
          icon: Stethoscope,
          items: [
            {
              title: "自查指南",
              desc: "快速解决连接故障。",
              content: [
                "**连接被拒绝**: 请检查服务器是否启动，以及防火墙是否放行了端口 (如 4840)。",
                "**证书错误**: `BadSecurityChecksFailed` 表示服务器不信任此客户端。请导出客户端证书 (设置 -> 证书管理 -> 自有) 并导入到服务器的信任列表中。",
                "**请求超时**: `BadTimeout` 通常由网络延迟导致。建议在连接设置中增大 'Session Timeout'。",
                "**频繁断线**: 请检查物理链路稳定性，或开启 'Auto Reconnect' 进行自动恢复。"
              ]
            }
          ]
        },
        {
          id: 'project',
          title: "13. 工程管理 (Project)",
          icon: Save,
          items: [
            {
              title: "工程文件",
              desc: "保存与恢复工作区配置。",
              content: [
                "**保存工程**: 将所有会话、读写组、订阅及趋势配置导出为 `.json` 文件。",
                "**打开工程**: 加载之前的工程文件。注意：为安全起见，连接密码不会被保存。",
                "**自动恢复**: 软件会自动缓存当前状态，意外退出后重新打开可自动恢复现场。"
              ]
            }
          ]
        },
        {
          id: 'chaos',
          title: "14. 异常测试 (Chaos Testing)",
          icon: Skull,
          items: [
            {
              title: "健壮性与压力测试",
              desc: "模拟异常工况以验证服务器稳定性。",
              content: [
                "**流量压力**: 通过会话风暴 (Flood) 或畸形报文 (Malformed) 压测并发处理能力。",
                "**逻辑负载**: 利用订阅风暴 (Sub Storm) 或连接闪烁 (Flapping) 检测资源回收逻辑。",
                "**安全验证**: 尝试协议降级 (Downgrade) 或加密风暴 (Secure Stress) 验证安全策略的强制性。",
                "**熔断机制**: 所有测试均可通过“紧急停止 (Emergency Stop)”按钮立即中止，防止设备过载损坏。"
              ]
            }
          ]
        }
      ]
    },
    features: {
      title: "功能规格表",
      sections: [
        {
          title: "核心能力",
          items: [
            { k: "协议版本", v: "OPC UA 1.04 (TCP Binary)" },
            { k: "加密支持", v: "Basic256Sha256 / Aes128_Sha256_RsaOaep" },
            { k: "传输层", v: "node-opcua (Client Side)" },
            { k: "身份验证", v: "匿名, 用户名, 证书" }
          ]
        },
        {
          title: "性能指标",
          items: [
            { k: "渲染 engines", v: "React 19 + Electron + Vite" },
            { k: "列表容量", v: "单页支持 50,000+ 节点" },
            { k: "刷新率", v: "前端渲染延迟 < 16ms" },
            { k: "主题", v: "Tailwind CSS (Slate/Enterprise)" }
          ]
        }
      ]
    },
    changelog: {
      title: "版本历史",
      versions: [
        { v: "v2.4.0", date: "2024-12-20", desc: "新增功能：异常测试 (Chaos Testing) 模块，支持会话风暴、畸形报文、协议降级等多种健壮性测试手段。优化了底层读写接口以支持更灵活的压力注入。" },
        { v: "v2.3.5", date: "2024-12-18", desc: "诊断优化：增强系统日志功能说明，增加 F12 调试控制台快捷入口文档。" },
        { v: "v2.3.2", date: "2024-12-17", desc: "文档更新：新增“调度器任务导入/导出”及“地址空间浏览限制”说明。" },
        { v: "v2.3.1", date: "2024-12-16", desc: "趋势更新：新增示波器风格的 X/Y 轴测量光标，支持高精度差值计算。" },
        { v: "v2.3.0", date: "2024-12-16", desc: "新功能：集成 AI 智能助手 (Copilot)，支持智能诊断与自然语言控制。" },
        { v: "v2.0.0", date: "2024-12-10", desc: "重大更新：新增数据调度器 (Scheduler)。重构读写面板，大幅提升渲染性能。" }
      ]
    },
    protocol: {
      title: "协议栈信息",
      desc: "基于 IEC 62541 标准开发。兼容 OPC Foundation CTT 测试规范。"
    },
    legal: {
        title: "严正声明 (Legal Disclaimer)",
        content: "本软件由颜伟平（Xiao Liu Zi）独立开发，版权所有。严禁任何单位或个人擅自将本软件用于非法商业活动、破解、倒卖或进行二次打包盈利。对于侵犯版权的行为，作者保留追究法律责任的权利。"
    }
  }
};

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<Lang>('zh');
  const [activeTab, setActiveTab] = useState<'manual' | 'features' | 'protocol' | 'changelog' | 'legal'>('manual');
  
  const stackInfo = opcuaService.getStackInfo();

  if (!isOpen) return null;

  const content = CONTENT[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[800px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg shadow-sm ${activeTab === 'legal' ? 'bg-red-600' : 'bg-indigo-600'}`}>
                 {activeTab === 'legal' ? <Gavel className="w-6 h-6 text-white" /> : <BookOpen className="w-6 h-6 text-white" />}
            </div>
            <div>
                <h2 className="text-xl font-bold text-slate-800 leading-tight">{content.title}</h2>
                <p className="text-xs text-slate-500 font-medium">{content.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-indigo-500 hover:text-indigo-600 text-sm font-bold transition-all shadow-sm"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'en' ? 'English' : '中文'}</span>
            </button>
            <div className="h-8 w-px bg-slate-200"></div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
             <div className="p-3 space-y-1">
                 <NavBtn active={activeTab === 'manual'} onClick={() => setActiveTab('manual')} icon={MousePointer2} label={content.tabs.manual} />
                 <NavBtn active={activeTab === 'features'} onClick={() => setActiveTab('features')} icon={Cpu} label={content.tabs.features} />
                 <NavBtn active={activeTab === 'protocol'} onClick={() => setActiveTab('protocol')} icon={Layers} label={content.tabs.protocol} />
                 <NavBtn active={activeTab === 'changelog'} onClick={() => setActiveTab('changelog')} icon={History} label={content.tabs.changelog} />
                 <div className="my-2 border-t border-slate-200"></div>
                 <NavBtn active={activeTab === 'legal'} onClick={() => setActiveTab('legal')} icon={Gavel} label={content.tabs.legal} isDanger={true} />
             </div>
             
             <div className="mt-auto p-4 border-t border-slate-200 bg-slate-100/50">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                    <span>{content.creator}</span>
                </div>
                <div className="text-[10px] text-slate-400">© 2024 Yan Weiping</div>
             </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300 flex flex-col">
            
            <div className="flex-1">
                {activeTab === 'manual' && (
                <div className="p-8 max-w-4xl mx-auto">
                    <div className="mb-8 text-center">
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">{content.tabs.manual}</h3>
                        <p className="text-slate-500">{content.manual.intro}</p>
                    </div>
                    
                    <div className="space-y-10">
                        {content.manual.categories.map((cat) => {
                        const CatIcon = cat.icon;
                        return (
                            <div key={cat.id} className="relative">
                                <div className="flex items-center gap-3 mb-6 sticky top-0 bg-white/95 backdrop-blur py-2 z-10 border-b border-slate-100">
                                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                        <CatIcon className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-800">{cat.title}</h4>
                                </div>
                                
                                <div className="grid md:grid-cols-1 gap-6 pl-4 md:pl-0">
                                    {cat.items.map((item, idx) => (
                                        <div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                            <h5 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                                                {item.title}
                                            </h5>
                                            <p className="text-sm text-slate-500 mb-4 italic">{item.desc}</p>
                                            <ul className="space-y-3">
                                                {item.content.map((step, sIdx) => (
                                                    <li key={sIdx} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                                                        <div className="w-5 h-5 rounded-full bg-white border border-indigo-200 text-indigo-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 shadow-sm">
                                                            {sIdx + 1}
                                                        </div>
                                                        <span>{step}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                        })}
                    </div>
                </div>
                )}

                {activeTab === 'features' && (
                <div className="p-8 max-w-4xl mx-auto">
                    <h3 className="text-2xl font-bold text-slate-800 mb-6 pb-4 border-b">{content.features.title}</h3>
                    <div className="grid md:grid-cols-2 gap-8">
                        {content.features.sections.map((sec, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    {sec.title}
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {sec.items.map((item, j) => (
                                        <div key={j} className="px-5 py-3 flex justify-between items-center text-sm group hover:bg-slate-50 transition-colors">
                                            <span className="text-slate-500 font-medium group-hover:text-slate-700">{item.k}</span>
                                            <span className="text-slate-800 font-bold">{item.v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {activeTab === 'protocol' && (
                <div className="p-8 max-w-3xl mx-auto">
                    <div className="bg-slate-900 rounded-2xl p-8 shadow-xl text-slate-300 relative overflow-hidden">
                        <Terminal className="absolute top-4 right-4 w-24 h-24 text-slate-800/50" />
                        <h3 className="text-2xl font-bold text-white mb-2">{content.protocol.title}</h3>
                        <p className="text-indigo-400 mb-8 font-mono text-sm">{content.protocol.desc}</p>
                        
                        <div className="space-y-4 font-mono text-sm relative z-10">
                            <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                                <Server className="w-5 h-5 text-emerald-400" />
                                <div className="flex-1">
                                    <div className="text-xs text-slate-500 uppercase">Vendor</div>
                                    <div className="text-white font-bold">{stackInfo.vendor}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                                <Box className="w-5 h-5 text-blue-400" />
                                <div className="flex-1">
                                    <div className="text-xs text-slate-500 uppercase">Product</div>
                                    <div className="text-white font-bold">{stackInfo.name} v{stackInfo.version}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                                <ShieldCheck className="w-5 h-5 text-amber-400" />
                                <div className="flex-1">
                                    <div className="text-xs text-slate-500 uppercase">Spec</div>
                                    <div className="text-white font-bold">{stackInfo.protocolVersion}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {activeTab === 'changelog' && (
                <div className="p-8 max-w-3xl mx-auto">
                    <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200">
                        <History className="w-6 h-6 text-indigo-600" />
                        <h3 className="text-2xl font-bold text-slate-800">{content.changelog.title}</h3>
                    </div>
                    
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-10">
                        {content.changelog.versions.map((v, i) => (
                            <div key={i} className="pl-8 relative group">
                                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm group-hover:scale-125 transition-transform"></div>
                                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-2">
                                    <span className="text-xl font-black text-indigo-600">{v.v}</span>
                                    <span className="text-sm font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{v.date}</span>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-sm leading-relaxed shadow-sm hover:shadow-md transition-shadow group-hover:bg-white group-hover:border-indigo-100">
                                    {v.desc}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {activeTab === 'legal' && (
                <div className="flex flex-col items-center justify-center min-h-full p-8 text-center animate-in fade-in zoom-in duration-300">
                    <div className="p-6 bg-red-50 rounded-full mb-6 ring-8 ring-red-50/50">
                        <AlertTriangle className="w-16 h-16 text-red-600" />
                    </div>
                    <h3 className="text-3xl font-black text-slate-800 mb-2">{content.legal.title}</h3>
                    <p className="text-slate-500 max-w-lg mb-8">
                        {lang === 'en' ? "Please read the following disclaimer carefully." : "请仔细阅读以下法律声明。"}
                    </p>
                    
                    <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-8 shadow-xl text-left relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <Gavel className="w-5 h-5 text-red-600" />
                                    {lang === 'en' ? "Copyright & Ownership" : "版权所有"}
                                </h4>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    {content.legal.content}
                                </p>
                            </div>
                            
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-xs text-slate-500 font-mono text-center">
                                    Copyright © 2024 Yan Weiping. All rights reserved.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
