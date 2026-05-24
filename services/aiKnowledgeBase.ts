
import { CopilotInsight, AIAction, AICapability, AIResponse, KnowledgeItem, LogEntry, SessionInfo, SecurityPolicy, MessageSecurityMode, PendingAIAction } from '../types';

export type AIMode = 'auto' | 'app' | 'protocol';

// 扩展接口
export interface EnhancedCapability extends AICapability {
    descriptionZh: string; 
    // New: Use Regex patterns for flexible matching instead of fixed keywords
    patterns: RegExp[]; 
}

export interface EnhancedKnowledge extends KnowledgeItem {
    category: string;
    kbType: 'app' | 'protocol' | 'general';
    answerZh: string;
}

// 上下文接口
export interface AIContext {
    logs: LogEntry[];
    session?: SessionInfo;
    currentView?: string; 
    history?: { role: string, content: string }[]; 
    mode?: AIMode; 
}

export const TERMINOLOGY: Record<string, string> = {
    "NodeId": "节点ID (标识符)",
    "Endpoint": "服务端点地址",
    "Subscription": "订阅对象",
    "MonitoredItem": "监控项",
    "Session": "会话连接",
    "SecureChannel": "安全通道",
    "SecurityMode": "安全模式 (签名/加密)",
    "SecurityPolicy": "安全策略算法",
    "Certificate": "数字证书",
    "Browse": "浏览服务",
    "Method": "远程方法调用",
    "Event": "事件/报警",
    "View": "视图",
    "Variable": "变量节点",
    "Object": "对象节点",
    "Scheduler": "数据调度/桥接器",
    "Deadband": "死区 (过滤微小变化)",
    "IndexRange": "数组切片索引",
    "Timestamps": "时间戳 (Source/Server)"
};

// ============================================================================
// 1. 软件内置专家知识库 (Instant Knowledge Base)
// ============================================================================

export const MANUAL_DB: EnhancedKnowledge[] = [
    // --- 0. Meta (Identity & Scope) ---
    {
        id: 'meta_identity',
        category: '关于助手',
        kbType: 'general',
        question: "你是谁开发的？",
        answerZh: "我是由 **颜伟平 (Xiao Liu Zi)** 开发的 React OPC UA 智能助手 (v2.3.5)。\n\n我是您的专为工业数据监控场景设计，旨在帮助您更高效地管理 OPC UA 会话、诊断网络问题以及生成测试数据。",
        tags: ['who', 'developer', 'author', 'creator', '谁', '作者', '开发', '身份', '名字', '颜伟平'],
        answer: "I was developed by Yan Weiping."
    },
    {
        id: 'meta_scope', 
        category: '关于助手',
        kbType: 'general',
        question: "你的知识库包含哪些内容？", 
        answerZh: "我是您的 OPC UA 智能专家，熟悉本软件的所有 UI 控件、OPC UA 协议术语以及故障排查方法。\n\n### 🧠 能力范围\n1. **UI 控件全解**：解释按钮、输入框的作用 (如 'Auto Read')。\n2. **协议百科**：解释 NodeId、SecurityPolicy 等术语。\n3. **故障诊断**：分析连接失败、BadTimeout 等问题。\n4. **执行操作**：我可以帮您创建会话、添加节点或诊断问题。", 
        tags: ['help', '功能', '能力', 'what', 'scope', '知识库', '能做什么'],
        answer: "I cover all UI controls, OPC UA protocol details, and troubleshooting."
    },

    // ========================================================================
    // 1. Connection Panel (App)
    // ========================================================================
    {
        id: 'overview_conn',
        category: '连接管理',
        kbType: 'app',
        question: "连接界面概览",
        answerZh: "连接界面是建立 OPC UA 通信的入口，支持端点发现、安全配置及自动化任务设置。\n\n### 🔌 核心区域详解\n1. **Endpoint URL**: 服务器地址输入栏。\n2. **Security**: 安全模式与策略选择。\n3. **Auth**: 身份验证（匿名/用户/证书）。\n4. **Advanced**: 超时与心跳微调。\n5. **Automation**: 自动重连、自动读取等开关。",
        tags: ['连接', '界面', 'connection', 'panel', 'overview', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Connection Panel."
    },
    {
        id: 'ui_conn_get_endpoints',
        category: '连接管理', 
        kbType: 'app',
        question: "Get Endpoints (获取端点)", 
        answerZh: "点击地球图标，向服务器发送探测请求，自动列出其支持的所有安全配置。\n\n### 🌍 功能详解\n**痛点解决**：OPC UA 连接必须严格匹配服务器允许的 `Security Policy` (如 Basic256Sha256) 和 `Message Security Mode` (如 SignAndEncrypt)。手动输入极易出错。\n\n**使用方法**：\n1. 输入 `opc.tcp://ip:port`。\n2. 点击按钮。\n3. 在弹窗中双击选择一个配置，系统会自动填入 Mode 和 Policy。", 
        tags: ['get', 'endpoints', '地球', '发现', '获取端点', '端点'],
        answer: "Discovers available security modes and policies."
    },
    {
        id: 'ui_conn_autoreconnect', 
        category: '连接管理', 
        kbType: 'app',
        question: "Auto Reconnect (自动重连)", 
        answerZh: "开启后，若连接意外断开（如网线松动），客户端将无限次尝试重新建立连接。\n\n### ⚙️ 技术细节\n- **重试间隔**：可在设置中配置，默认为 5000ms。\n- **状态恢复**：重连成功后，系统会尝试恢复之前的订阅状态。\n- **场景**：适用于长期运行的监控看板或无人值守测试。", 
        tags: ['auto', 'reconnect', '重连', '自动', '断线'],
        answer: "Automatically attempts to reconnect on drop."
    },
    {
        id: 'ui_conn_autoread', 
        category: '连接管理', 
        kbType: 'app',
        question: "Auto Read (自动读取)", 
        answerZh: "开启此开关，一旦连接状态变为 Connected，软件会自动触发 Read/Write 面板的批量读取循环。\n\n### 🚀 自动化场景\n配合 `Auto Reconnect` 使用，可以实现“断线重连后自动恢复数据采集”，无需人工干预点击播放按钮。非常适合挂机测试。", 
        tags: ['auto', 'read', '自动', '读取', '自动读取'],
        answer: "Starts cyclic reading immediately after connection."
    },
    {
        id: 'ui_conn_autosub', 
        category: '连接管理', 
        kbType: 'app',
        question: "Auto Sub (自动订阅)", 
        answerZh: "开启此开关，连接建立后，会自动激活所有处于 Paused 状态的订阅视图。\n\n### 🔔 自动化场景\n类似于 Auto Read，这确保了在网络波动恢复后，实时监控数据流（Subscription）能自动恢复推送，防止数据丢失。", 
        tags: ['auto', 'sub', 'subscribe', '自动', '订阅'],
        answer: "Activates subscriptions immediately after connection."
    },
    {
        id: 'ui_conn_advanced',
        category: '连接管理',
        kbType: 'app',
        question: "Advanced (高级连接设置)",
        answerZh: "折叠面板中的 Session Timeout 和 KeepAlive Interval 用于优化不稳定网络下的连接体验。\n\n### 🛠️ 参数说明\n1. **Session Timeout (ms)**: 客户端断线后，服务器保留会话上下文（如订阅队列）的最长时间。建议设置为 60000 (1分钟)。\n2. **KeepAlive Interval (ms)**: 客户端向服务器发送空包以维持 TCP 活性的频率。建议设置为 5000。",
        tags: ['session', 'timeout', 'keepalive', 'advanced', '高级', '超时'],
        answer: "Configures session lifetime and heartbeat."
    },

    // ========================================================================
    // 2. Read/Write Panel (App)
    // ========================================================================
    {
        id: 'overview_rw',
        category: '数据读写',
        kbType: 'app',
        question: "读写界面概览",
        answerZh: "这是进行 OPC UA 变量读写测试的核心区域，包含单点调试和批量压测功能。\n\n### 📝 核心模块\n1. **Inspector**: 顶部的单行区域，用于快速测试单个 NodeId，不干扰下方列表。\n2. **Batch List**: 下方的表格，支持多分组管理成百上千个点位。\n3. **Toolbar**: 包含 `Read Cycle` (读取周期)、`Write Cycle` (写入周期) 和 `Auto +1` (自动递增) 等控制项。",
        tags: ['读写', 'rw', 'read', 'write', '界面', 'overview', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Data Access Panel."
    },
    {
        id: 'ui_rw_valueinspector',
        category: '数据读写',
        kbType: 'app',
        question: "Value Inspector (数值查看器)",
        answerZh: "双击数组或矩阵类型的数值时弹出的专用编辑器。\n\n### 🔢 功能特性\n- **可视化矩阵**: 以网格形式显示 2D 数组，清晰直观。\n- **Excel 互通**: 支持直接复制粘贴 Excel 表格数据到此处，实现快速批量写入。\n- **3D 视图**: 对于 3D 数组，提供分层切片视图 (Layer View)。",
        tags: ['inspector', 'value', 'matrix', 'array', 'excel', '数组', '矩阵'],
        answer: "Advanced editor for arrays and matrices."
    },
    {
        id: 'ui_rw_autoinc',
        category: '数据读写',
        kbType: 'app',
        question: "Auto +1 (自动递增)",
        answerZh: "这是一个仿真功能。开启后，每次执行 Batch Write 时，写入的值会自动变化。\n\n### 📈 逻辑说明\n- **数值型**: `Value = OldValue + 1` (如 Int32, Float)。\n- **布尔型**: `Value = !OldValue` (True/False 翻转)。\n\n**用途**：用于模拟传感器数据变化，或者向 PLC 发送心跳信号证明上位机存活。",
        tags: ['auto', 'inc', 'increment', '递增', '自动', '加一'],
        answer: "Increments value on every write cycle."
    },
    {
        id: 'ui_rw_cycles',
        category: '数据读写',
        kbType: 'app',
        question: "Read/Write Cycle (读写周期)",
        answerZh: "控制批量操作的时间间隔 (毫秒)。\n\n### ⏱️ 性能建议\n- **Read Cycle**: 建议不低于 200ms。如果点位超过 1000 个，建议设为 1000ms 以避免阻塞 UI。\n- **Write Cycle**: 同样建议不低于 500ms。写入操作通常比读取更消耗服务器资源。",
        tags: ['cycle', 'period', 'interval', '周期', '频率'],
        answer: "Sets the interval for cyclic operations."
    },
    {
        id: 'ui_rw_export',
        category: '数据读写',
        kbType: 'app',
        question: "Export Snapshot (导出快照)",
        answerZh: "将当前列表中的所有点位配置及其**当前数值**导出为 CSV 文件。\n\n### 💾 应用场景\n- **保存现场状态**：记录某一时刻的所有机器参数。\n- **配置迁移**：将导出的 CSV 发给同事，他们可以通过 Import 功能一键恢复测试环境。",
        tags: ['export', 'snapshot', 'csv', '导出', '保存'],
        answer: "Exports current configuration and values."
    },

    // ========================================================================
    // 3. Subscription Panel (App)
    // ========================================================================
    {
        id: 'overview_sub',
        category: '订阅监控',
        kbType: 'app',
        question: "订阅界面概览",
        answerZh: "订阅是 OPC UA 最核心的机制 (Pub/Sub)，比轮询读取更高效。\n\n### 🔔 功能亮点\n1. **多视图**: 左侧列表管理多个 Subscription 对象，可分别设置不同的推送频率。\n2. **实时数据**: 右侧表格显示服务器主动推送的数据变更。\n3. **RX 指示灯**: 顶部绿色的 RX 灯闪烁表示正在接收数据包。",
        tags: ['订阅', 'sub', 'subscription', '界面', 'overview', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Subscription Panel."
    },
    {
        id: 'ui_sub_params',
        category: '订阅监控',
        kbType: 'app',
        question: "Subscription Parameters (参数配置)",
        answerZh: "点击视图卡片上的齿轮图标，可配置详细的 OPC UA 订阅参数。\n\n### ⚙️ 参数全解\n- **Publishing Interval**: 服务器推送通知的周期 (ms)。\n- **Lifetime Count**: 没收到 KeepAlive 多少次后服务器删除订阅。\n- **Priority**: 优先级，服务器资源紧张时优先处理高优先级的订阅。\n- **Queue Size**: 服务器端为每个监控项缓存的历史数据点数。",
        tags: ['setting', 'interval', 'config', '参数', '配置'],
        answer: "Configure subscription timing and queue."
    },
    {
        id: 'ui_sub_recording',
        category: '订阅监控',
        kbType: 'app',
        question: "Data Recording (数据录制)",
        answerZh: "点击 REC 按钮，软件会在内存中缓存接收到的所有实时数据。\n\n### 📼 功能演示\n1. 点击 **REC** 开始录制 (图标变红)。\n2. 此时所有变更的数据都会被保存。\n3. 点击 **Export CSV** 将缓存数据下载到本地分析。\n**注意**：长时间录制大量数据可能占用较多内存。",
        tags: ['record', 'recording', '录制', 'csv', '保存'],
        answer: "Buffer and export live data."
    },

    // ========================================================================
    // 4. Trend Panel (App)
    // ========================================================================
    {
        id: 'overview_trend',
        category: '实时趋势',
        kbType: 'app',
        question: "趋势图界面概览",
        answerZh: "用于将数值变化可视化，支持高性能的实时波形绘制。\n\n### 📈 核心特性\n- **独立采样**: Trend 面板拥有独立的 Polling 线程，不依赖 Subscription 推送，适合高速抓取。\n- **视图切换**: 支持 Overlay (叠加) 和 Split (分屏) 两种模式。\n- **自适应量程**: Y 轴会自动根据当前数据的最大/最小值调整缩放。",
        tags: ['趋势', 'trend', 'chart', '界面', 'overview', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Trend Panel."
    },
    {
        id: 'ui_trend_history',
        category: '实时趋势',
        kbType: 'app',
        question: "History Limit (历史长度)",
        answerZh: "设置图表保留的历史数据点数 (Points)。\n\n### 📊 性能影响\n- **100 - 500 点**: 最佳性能，适合观察瞬态变化。\n- **1000 - 2000 点**: 适合观察较长时间的趋势，但会增加浏览器渲染负担。\n**注意**：此设置仅影响前端显示缓存，不影响后台数据采集。",
        tags: ['history', 'limit', 'points', '历史', '长度'],
        answer: "Controls the number of data points visible on the chart."
    },
    {
        id: 'ui_trend_interpolation',
        category: '实时趋势',
        kbType: 'app',
        question: "Interpolation (插值模式)",
        answerZh: "决定图表线条的连接方式。\n\n### 📐 模式对比\n- **Linear (线性)**：点与点之间用直线连接。适合温度、压力等连续变化的模拟量。\n- **Step (阶梯)**：值保持不变直到下一次变化。适合开关状态、运行模式等离散量。",
        tags: ['interpolation', 'linear', 'step', '插值', '线性', '阶梯'],
        answer: "Visual rendering style of the line."
    },

    // ========================================================================
    // 5. Browser & Scheduler (App)
    // ========================================================================
    {
        id: 'overview_browser',
        category: '地址空间',
        kbType: 'app',
        question: "地址空间界面概览",
        answerZh: "浏览器面板用于浏览和管理 OPC UA 服务器的节点树结构。\n\n### 🌳 主要功能\n1. **虚拟树 (Virtual Tree)**: 支持浏览包含数万节点的复杂层级结构。\n2. **变量篮子 (Variable Basket)**: 右侧的暂存区，用于收集感兴趣的节点，随后一键添加到读写、订阅或趋势面板。\n3. **右键菜单**: 提供刷新、复制 NodeID、查看属性等快捷操作。",
        tags: ['browser', 'address', 'space', 'tree', 'nodes', '地址空间', '浏览器', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Address Space Browser."
    },
    {
        id: 'ui_browser_basket',
        category: '地址空间',
        kbType: 'app',
        question: "Variable Basket (变量篮子)",
        answerZh: "位于地址空间右侧的临时列表，类似于“购物车”。\n\n### 🛒 使用技巧\n先在左侧树中勾选多个感兴趣的节点，点击 **Add Checked** 加入篮子。确认无误后，再通过顶部的 Add to RW / Sub / Trend 按钮批量分发到各个功能区。这避免了频繁切换界面的麻烦。",
        tags: ['basket', '篮子', '购物车', '变量表'],
        answer: "Staging area for selected nodes."
    },
    {
        id: 'overview_scheduler',
        category: '调度器',
        kbType: 'app',
        question: "调度器界面概览",
        answerZh: "调度器 (Data Scheduler) 用于实现节点间的数据桥接和转发。\n\n### 🤖 核心机制\n- **任务 (Task)**: 定义一个从 Source Node 读取数据并写入 Target Node 的操作。\n- **自动映射 (Auto Map)**: 自动将源列表和目标列表按顺序配对生成任务。\n- **独立周期**: 每个调度分组可以设定独立的运行周期 (ms)。",
        tags: ['scheduler', 'task', 'map', 'forward', '调度', '映射', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Data Scheduler."
    },
    {
        id: 'ui_sched_automap',
        category: '调度器',
        kbType: 'app',
        question: "Auto Map (自动映射)",
        answerZh: "调度器的核心功能，用于快速生成数据传输任务。\n\n### 🤖 智能逻辑\n根据 Source List (源) 和 Target List (目标) 的排列顺序，自动一对一配对生成 Read -> Write 任务。\n系统会自动检测数据类型是否兼容，如果不兼容 (如 String -> Int)，会弹出警告提示。",
        tags: ['auto', 'map', 'scheduler', '映射', '配对'],
        answer: "Automatically pairs source and target nodes."
    },

    // ========================================================================
    // 6. Events & Diagnostics (App)
    // ========================================================================
    {
        id: 'overview_events',
        category: '报警与事件',
        kbType: 'app',
        question: "事件界面概览",
        answerZh: "用于监控 OPC UA A&C (Alarms & Conditions) 实时报警数据。\n\n### 🔔 界面说明\n- **Start/Stop Events**: 控制是否接收服务器的 EventNotifier 推送。\n- **严重性 (Severity)**: 通过颜色区分报警级别（红=严重，黄=警告，蓝=信息）。\n- **本地事件**: 系统也会将断线等本地状态注入到此列表中，作为高优先级的系统报警。",
        tags: ['event', 'alarm', 'condition', 'severity', '报警', '事件', '概览', '功能', '介绍', '作用'],
        answer: "Overview of Events and Alarms."
    },
    {
        id: 'ui_global_logs',
        category: '系统日志',
        kbType: 'app',
        question: "System Logs (系统日志与调试)",
        answerZh: "底部面板记录了应用运行期间的所有关键事件，是排查问题的首选工具。\n\n### 🛠️ 高级功能\n- **分级过滤**: 支持按 ALL (全部)、INFO (普通)、WARN (警告)、ERROR (错误) 进行分级查看。\n- **缓存机制**: 滚动保留最近 **500 条** 事件，既能回溯历史又不会撑爆内存。\n- **F12 调试模式**: 在桌面客户端模式下，点击“昆虫”图标可打开底层的开发者工具控制台。\n- **导出**: 支持导出全量日志为文本文件，方便离线分析。",
        tags: ['log', 'system', 'debug', 'f12', 'console', '日志', '调试', '记录', '开发'],
        answer: "Application event logs and debugging tools."
    },

    // ========================================================================
    // 7. Protocol Encyclopedia (Protocol)
    // ========================================================================
    {
        id: 'proto_nodeid',
        category: '协议基础',
        kbType: 'protocol',
        question: "NodeId (节点标识符)",
        answerZh: "NodeId 是 OPC UA 地址空间中节点的唯一身份证。\n\n### 🏷️ 格式详解\n通常格式为 `ns=<namespaceIndex>;<type>=<value>`。\n- **ns**: 命名空间索引，0 通常保留给 OPC UA 标准类型。\n- **type**: 标识符类型，`i`=Numeric (数字), `s`=String (字符串), `g`=Guid。\n- **示例**: `ns=2;s=Demo.Tag1` 表示在命名空间 2 中，标识符为字符串 'Demo.Tag1' 的节点。",
        tags: ['nodeid', 'ns', 'namespace', '标识符', 'id'],
        answer: "Unique identifier for a node."
    },
    {
        id: 'proto_security_mode',
        category: '协议安全',
        kbType: 'protocol',
        question: "Message Security Mode",
        answerZh: "定义了客户端与服务器之间消息的安全级别。\n\n### 🔒 三种模式\n1. **None**: 不加密，不签名。仅用于调试，生产环境极不推荐。\n2. **Sign**: 对消息进行数字签名，防止篡改，但不加密内容。\n3. **SignAndEncrypt**: 既签名又加密，提供最高级别的安全性，防止窃听和篡改。",
        tags: ['security', 'mode', 'sign', 'encrypt', '安全', '模式'],
        answer: "Message security level: None, Sign, or SignAndEncrypt."
    }
];

// --- 2. 软件操作能力 (Agent Capabilities) ---
export const CAPABILITIES: EnhancedCapability[] = [
    {
        id: 'CREATE_SESSIONS', 
        name: '新建会话',
        description: 'Create new OPC UA sessions',
        descriptionZh: '创建新的连接会话',
        keywords: [], // Deprecated, using patterns
        patterns: [
            /(create|add|new|generate|make|生成|创建|新建|增加).*(session|会话)/i,
            /(会话|session).*(生成|创建|增加)/i
        ],
        requiresConfirmation: true,
        params: [{ name: 'count', type: 'number', description: 'Number of sessions' }]
    },
    {
        id: 'DIAGNOSE_ISSUE',
        name: '智能诊断',
        description: 'Analyze logs and errors',
        descriptionZh: '分析系统日志并给出建议',
        keywords: [],
        patterns: [
            /(diagnose|debug|analyze|fix|check|why|诊断|分析|检查|为什么).*(error|fail|issue|broken|problem|bug|错误|失败|问题|连不上|红)/i,
            /^(诊断|diagnose)$/i,
            /(帮我|help).*(看|look).*(错|error)/i
        ],
        requiresConfirmation: false,
        params: []
    }
];

// --- FUNCTIONS ---

export const analyzeLog = (msg: string): CopilotInsight | null => {
    // Simple heuristic analysis for log messages
    if (msg.includes("BadTimeout") || msg.includes("Timeout")) {
        return {
            id: Date.now().toString(),
            type: 'error',
            title: 'Request Timeout',
            description: 'The server failed to respond within the configured timeout period.',
            technicalDetails: 'StatusCode: BadTimeout', // technicalDetails exists in types.ts now
            timestamp: Date.now(),
            isRead: false,
            suggestedAction: { label: 'Adjust Timeout', actionType: 'CONFIGURE' }
        };
    }
    if (msg.includes("BadNotConnected") || msg.includes("Connection lost")) {
        return {
            id: Date.now().toString(),
            type: 'error',
            title: 'Connection Lost',
            description: 'The client is not connected to the server.',
            timestamp: Date.now(),
            isRead: false,
            suggestedAction: { label: 'Reconnect', actionType: 'CONNECT' }
        };
    }
    if (msg.includes("BadSecurityChecksFailed") || msg.includes("BadCertificate")) {
        return {
            id: Date.now().toString(),
            type: 'error',
            title: 'Security Error',
            description: 'Certificate validation failed. The server certificate might not be trusted.',
            timestamp: Date.now(),
            isRead: false,
            suggestedAction: { label: 'Trust Certificate', actionType: 'NAVIGATE', payload: 'open_settings' } 
        };
    }
    return null;
};

let aiStatus: 'idle' | 'loading' | 'ready' = 'idle';

export const getAIStatus = () => aiStatus;

export const initializeAI = (progressCallback?: (msg: string) => void) => {
    if (aiStatus !== 'idle') return;
    aiStatus = 'loading';
    if (progressCallback) progressCallback("Initializing Knowledge Base...");
    
    // Simulate loading delay for "AI" feel
    setTimeout(() => {
        aiStatus = 'ready';
        if (progressCallback) progressCallback("AI Engine Ready");
    }, 1500);
};

// --- DEEP DIAGNOSIS LOGIC ---
const performDeepDiagnosis = (context: AIContext): AIResponse | null => {
    const { logs, session } = context;
    if (!session) return null;

    // 1. Config Mismatch Check (Static)
    if (session.securityMode === MessageSecurityMode.None && session.securityPolicy !== SecurityPolicy.None) {
        return {
            text: `⚠️ **配置冲突检测**\n\n我发现当前会话配置存在逻辑矛盾：\n- 安全模式 (Mode) 为 **None**\n- 但安全策略 (Policy) 却设置为了 **${session.securityPolicy}**\n\n**专家建议**：\nOPC UA 协议规定，当 Mode 为 None 时，Policy 必须也是 None。请在连接面板修正此配置。`,
            debugInfo: { confidence: 100, matchedTool: 'Config-Auditor', source: 'tool' },
            action: { type: 'PLAN', label: '修正配置', payload: { type: 'open_settings', description: 'Open Settings', data: {} } }
        };
    }

    // 2. Active Session Error State Check
    if (session.status === 'ERROR') {
        let advice = "建议检查网络连通性或服务器地址。";
        if (session.lastError?.includes("Timeout")) advice = "服务器响应超时，建议增加 Timeout 设置。";
        if (session.lastError?.includes("Certificate")) advice = "证书验证失败，请在设置中信任证书。";

        return {
            text: `🚨 **连接异常诊断**\n\n当前会话处于 **ERROR** 状态。\n\n**最后报错**: ${session.lastError || "Unknown Error"}\n\n**分析建议**: ${advice}`,
            debugInfo: { confidence: 100, matchedTool: 'State-Analyzer', source: 'tool' },
            action: { type: 'PLAN', label: '尝试重连', payload: { type: 'CONNECT_SESSION', description: 'Reconnect', data: {} } }
        };
    }

    // 3. Log Analysis (Recent Errors)
    const recentErrors = logs.filter(l => l.level === 'error').slice(-3);
    if (recentErrors.length > 0) {
        const hasCertError = recentErrors.some(l => l.message.includes("Certificate"));
        
        return {
            text: `🔍 **日志智能分析**\n\n我在最近的日志中发现了以下异常：\n${recentErrors.map(e => `- ${e.message}`).join('\n')}\n\n${hasCertError ? "**专家提示**：检测到证书相关错误，通常需要手动信任服务器证书。" : "**建议**：请根据上述错误信息检查服务器配置。"}`,
            debugInfo: { confidence: 95, matchedTool: 'Log-Scanner', source: 'tool' },
            action: hasCertError ? 
                { type: 'PLAN', label: '打开证书管理', payload: { type: 'open_settings', description: 'Manage Certificates', data: {} } } : 
                undefined
        };
    }

    // 4. Default if user asks for diagnosis but no errors found
    return {
        text: "✅ **系统健康检查**\n\n当前连接状态正常，且未在最近日志中发现明显错误。如果您遇到问题，请尝试复现后再询问。",
        debugInfo: { confidence: 80, matchedTool: 'Health-Check', source: 'tool' }
    };
};

// --- IMPROVED INTENT RECOGNITION ---
function matchCapability(query: string, mode: AIMode): { capability: EnhancedCapability, data: any } | null {
    if (mode === 'protocol') return null; // Protocol mode is KB only

    const q = query.trim();
    
    for (const cap of CAPABILITIES) {
        // Match Regex Patterns
        const match = cap.patterns.some(regex => regex.test(q));
        
        if (match) {
            // Extract basic params using Regex
            const data: any = {};
            
            // Extract 'count' for session creation
            if (cap.id === 'CREATE_SESSIONS' || cap.id === 'DUPLICATE_SESSION') {
                const numberMatch = q.match(/(\d+)\s*(?:sessions|copies|个|items|nodes)?/i);
                let count = numberMatch ? parseInt(numberMatch[1]) : 1;
                if (count > 50) count = 50; 
                data.count = count;
            }

            if (cap.id === 'DELETE_SESSION') {
                if (q.includes('all') || q.includes('全部') || q.includes('所有')) {
                    data.target = 'all';
                } else {
                    data.target = 'current'; 
                }
            }

            if (cap.id === 'ADD_RW_NODE') {
                const nodeMatch = q.match(/(ns=\d+;[sgi]=[\w\.]+)/i);
                if (nodeMatch) {
                    data.nodeId = nodeMatch[0];
                } else {
                    data.nodeId = 'ns=1;s=MyTag'; 
                }
            }

            if (cap.id === 'NAVIGATE_VIEW') {
                if (q.includes('dashboard') || q.includes('连接')) data.target = 'NAV_DASHBOARD';
                else if (q.includes('read') || q.includes('write') || q.includes('rw') || q.includes('读写')) data.target = 'NAV_RW';
                else if (q.includes('sub') || q.includes('订阅')) data.target = 'NAV_SUB';
                else if (q.includes('trend') || q.includes('chart') || q.includes('趋势')) data.target = 'NAV_TREND';
                else if (q.includes('browser') || q.includes('tree') || q.includes('地址') || q.includes('浏览')) data.target = 'NAV_BROWSER';
                else if (q.includes('scheduler') || q.includes('map') || q.includes('调度')) data.target = 'NAV_SCHEDULER';
                else if (q.includes('event') || q.includes('alarm') || q.includes('事件') || q.includes('报警')) data.target = 'NAV_EVENTS';
            }

            return { capability: cap, data };
        }
    }
    return null;
}

function matchManual(query: string, context?: AIContext): EnhancedKnowledge | null {
    let bestMatch: EnhancedKnowledge | null = null;
    let maxScore = 0;
    const mode = context?.mode || 'auto';
    const q = query.toLowerCase();
    
    const overviewKeywords = ['有哪些', '什么功能', '什么控件', '界面介绍', '介绍一下', 'overview', 'features', 'controls', 'what controls', '界面', '作用', '干嘛', '功能', '有什么'];
    const isOverviewIntent = overviewKeywords.some(k => q.includes(k));

    for (const item of MANUAL_DB) {
        if (mode === 'app' && item.kbType !== 'app') continue;
        if (mode === 'protocol' && item.kbType !== 'protocol') continue;

        let score = 0;
        
        item.tags.forEach(tag => { 
            if (q.includes(tag.toLowerCase())) score += 4; 
        }); 
        
        if (q.includes(item.question.toLowerCase())) score += 6;

        if (mode === 'auto') {
            if (context?.currentView) {
                const viewMap: Record<string, string> = {
                    'READ_WRITE': '读写',
                    'SUBSCRIPTION': '订阅',
                    'BROWSER': '地址空间',
                    'TREND': '趋势',
                    'SCHEDULER': '调度',
                    'DASHBOARD': '连接',
                    'EVENTS': '报警',
                    'DIAGNOSTICS': '诊断'
                };
                const viewKey = viewMap[context.currentView];
                
                if (viewKey && item.category.includes(viewKey)) score += 3;
            }
        }

        if (score > maxScore) {
            maxScore = score;
            bestMatch = item;
        }
    }
    
    return maxScore >= 4 ? bestMatch : null;
}

export const askAI = async (query: string, context: AIContext = { logs: [] }): Promise<AIResponse> => {
    const q = query.trim().toLowerCase();
    
    // 1. Action/Capability Check (Pattern Matching)
    const capMatch = matchCapability(q, context.mode || 'auto');
    if (capMatch) {
        const { capability, data } = capMatch;
        let confirmText = `我明白了，您想执行 **${capability.name}** 操作。\n\n${capability.descriptionZh}`;
        
        return {
            text: confirmText,
            action: {
                type: 'PLAN',
                label: capability.name,
                payload: {
                    type: capability.id, 
                    description: capability.description,
                    data: data
                }
            },
            debugInfo: { confidence: 100, matchedTool: capability.id, source: 'tool' }
        };
    }

    // 2. Diagnosis Check (Improved triggers)
    if (context.mode !== 'protocol') {
        const diagKeywords = ['诊断', '错误', '失败', 'diagnose', 'error', 'fail', 'bug', 'broken', 'why', 'connection lost', 'bad', '怎么回事', '连不上'];
        if (diagKeywords.some(k => q.includes(k))) {
            const diag = performDeepDiagnosis(context);
            if (diag) return diag;
        }
    }

    // 3. Knowledge Base Check
    const manualMatch = matchManual(q, context);
    if (manualMatch) {
        const related = MANUAL_DB
            .filter(m => m.category === manualMatch.category && m.id !== manualMatch.id)
            .slice(0, 3)
            .map(m => m.question);
        return {
            text: manualMatch.answerZh, 
            relatedTopics: related,
            debugInfo: { confidence: 100, matchedTool: manualMatch.id, source: 'knowledge_base' }
        };
    }

    return {
        text: "🤔 未找到完全匹配的答案。请尝试提问具体的控件名称（如 '自动读取'）或协议术语。",
        relatedTopics: ["如何连接服务器?", "什么是 Subscription?", "查看错误日志"],
        debugInfo: { confidence: 0, source: 'fallback' }
    };
};
