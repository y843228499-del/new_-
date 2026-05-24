
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Skull, Zap, Activity, Play, Terminal, Bug, Wind, Network, Download, AlertOctagon, Lock, Search, Siren, Layers, Workflow, Cpu, ShieldCheck, FileQuestion, Ban, BookOpen, X, Trash2, Archive, RotateCcw, ShieldAlert, ChevronRight, AlertTriangle, Book, CheckCircle2, Square, ThermometerSun, Settings, Info, Sliders, RefreshCcw, Eye, Shield, Target, Microscope, Stethoscope, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, GripVertical, Languages } from 'lucide-react';
import { opcuaService } from '../services/opcuaService';
import { useLanguage } from '../contexts/LanguageContext';
import { ChaosResult, SessionInfo, SessionStatistics } from '../types';
import { toast } from 'sonner';

interface ChaosPanelProps {
    session: SessionInfo;
    addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
    isVisible?: boolean;
}

interface TestReport {
    id: string; 
    timestamp: string;
    testType: string;
    config: any;
    result: ChaosResult;
    durationMs: number;
}

interface LogItem {
    msg: string;
    msgZh?: string;
    type: 'info' | 'warn' | 'error' | 'success';
    time: string;
    id: string; 
}

// --- CONSTANTS & CONFIG ---
const LOG_FLUSH_INTERVAL = 300; 
const MAX_LOGS = 200; 
const COOLDOWN_TIME = 2000; 
const DEFAULT_PANEL_WIDTH = 380; 
const EXPANDED_PANEL_WIDTH = 700;

// --- RICH PARAMETER DEFINITIONS ---
const PARAM_DEFS: Record<string, { key: string; label: string; type: 'number'|'text'|'select'; min?: number; max?: number; options?: string[]; desc: string; def: any }[]> = {
    flood: [
        { key: 'count', label: '并发数量 (Concurrency)', type: 'number', min: 1, max: 200, def: 10, desc: '同时发起的会话连接总数。' },
        { key: 'delayMs', label: '连接间隔 (Interval)', type: 'number', min: 0, max: 1000, def: 50, desc: '每次发起连接请求之间的延迟(ms)。' },
        { key: 'timeoutMs', label: '会话超时 (Timeout)', type: 'number', min: 1000, max: 60000, def: 5000, desc: '仅针对此测试的请求超时时间(ms)。' },
        { key: 'keepAlive', label: '保持连接 (Hold Time)', type: 'number', min: 0, max: 10000, def: 0, desc: '建立连接后保持多久再断开(ms)。0表示立即断开。' }
    ],
    malformed: [
        { key: 'count', label: '发送次数 (Count)', type: 'number', min: 1, max: 100, def: 10, desc: '发送畸形报文的总次数。' },
        { key: 'delayMs', label: '发送间隔 (Interval)', type: 'number', min: 10, max: 1000, def: 50, desc: '每次攻击之间的间隔(ms)。' },
        { key: 'packetSize', label: '伪造长度 (Length)', type: 'number', min: 100, max: 2147483647, def: 4294967040, desc: '写入 TCP 头部的 MessageLength 字段值 (字节)。' },
        { key: 'partialWrite', label: '部分写入 (Partial)', type: 'select', options: ['Yes', 'No'], def: 'Yes', desc: '是否只发送头部不发送内容，制造半开连接。' }
    ],
    subStorm: [
        { key: 'count', label: '监控项数 (Items)', type: 'number', min: 10, max: 5000, def: 500, desc: '单次订阅中包含的 MonitoredItem 数量。' },
        { key: 'samplingInterval', label: '采样间隔 (Sampling)', type: 'number', min: 0, max: 1000, def: 0, desc: '监控项的采样频率(ms)。0 表示尽力而为(最快)。' },
        { key: 'queueSize', label: '队列大小 (Queue)', type: 'number', min: 1, max: 100, def: 100, desc: '每个监控项在服务器端的缓存队列大小。' },
        { key: 'discardOldest', label: '丢弃策略 (Discard)', type: 'select', options: ['True', 'False'], def: 'True', desc: '队列满时是否丢弃旧值。False 会增加服务器内存压力。' }
    ],
    flapping: [
        { key: 'count', label: '闪烁次数 (Cycles)', type: 'number', min: 5, max: 500, def: 20, desc: '执行连接-断开循环的总次数。' },
        { key: 'intervalMs', label: '闪烁频率 (Interval)', type: 'number', min: 10, max: 5000, def: 50, desc: '连接与断开之间的循环间隔(ms)。' },
        { key: 'graceful', label: '断开方式 (Close)', type: 'select', options: ['Graceful', 'Abort'], def: 'Graceful', desc: 'Graceful发送CloseSession，Abort直接销毁Socket。' }
    ],
    write: [
        { key: 'count', label: '写入次数 (Attempts)', type: 'number', min: 1, max: 500, def: 20, desc: '尝试写入的总次数。' },
        { key: 'delayMs', label: '写入间隔 (Interval)', type: 'number', min: 0, max: 1000, def: 10, desc: '每次写入请求之间的间隔(ms)。' },
        { key: 'target', label: '目标节点 (NodeId)', type: 'text', def: 'ns=2;s=Demo.Example.Int32', desc: '尝试攻击的目标节点 ID。' },
        { key: 'fakeType', label: '伪造类型 (Fake Type)', type: 'select', options: ['String', 'Guid', 'ByteString', 'XmlElement'], def: 'String', desc: '尝试写入的数据类型 (故意错配)。' },
        { key: 'payloadSize', label: '载荷大小 (Size)', type: 'number', min: 1, max: 10240, def: 100, desc: '伪造数据的长度(字符数)。' }
    ],
    fuzz: [
        { key: 'count', label: '请求次数 (Requests)', type: 'number', min: 10, max: 2000, def: 50, desc: '发送 Fuzz 读取请求的总次数。' },
        { key: 'delayMs', label: '请求间隔 (Interval)', type: 'number', min: 0, max: 1000, def: 0, desc: '批次之间的间隔(ms)。' },
        { key: 'strategy', label: '模糊策略 (Strategy)', type: 'select', options: ['Mixed', 'Empty', 'Oversized', 'SpecialChars', 'Null'], def: 'Mixed', desc: 'NodeId 的生成算法。' },
        { key: 'length', label: '最大长度 (Max Len)', type: 'number', min: 10, max: 10000, def: 1000, desc: 'Oversized 策略下的字符串长度。' }
    ],
    secureStress: [
        { key: 'count', label: '握手次数 (Handshakes)', type: 'number', min: 1, max: 200, def: 10, desc: '建立安全通道的总次数。' },
        { key: 'delayMs', label: '握手间隔 (Interval)', type: 'number', min: 10, max: 2000, def: 50, desc: '每次握手请求之间的间隔(ms)。' },
        { key: 'keySize', label: '密钥长度 (Key Size)', type: 'select', options: ['1024', '2048', '4096'], def: '2048', desc: '握手使用的非对称加密密钥长度(位)。' },
        { key: 'policy', label: '强制策略 (Policy)', type: 'select', options: ['Basic256Sha256', 'Aes128_Sha256_RsaOaep'], def: 'Basic256Sha256', desc: '用于握手的安全策略算法。' }
    ],
    recursive: [
        { key: 'count', label: '浏览限制 (Max Nodes)', type: 'number', min: 10, max: 5000, def: 100, desc: '限制递归浏览的最大节点数量。' },
        { key: 'delayMs', label: '节流控制 (Throttle)', type: 'number', min: 0, max: 100, def: 0, desc: '每浏览一批节点后的休眠时间(ms)。' },
        { key: 'depth', label: '最大深度 (Depth)', type: 'number', min: 1, max: 20, def: 5, desc: '递归浏览的最大层级深度。' },
        { key: 'references', label: '引用类型 (RefType)', type: 'select', options: ['Hierarchical', 'Aggregates', 'Organizes'], def: 'Hierarchical', desc: '浏览时追踪的引用类型。' }
    ],
    downgrade: [
        { key: 'count', label: '尝试次数 (Attempts)', type: 'number', min: 1, max: 50, def: 5, desc: '尝试降级连接的次数。' },
        { key: 'delayMs', label: '重试间隔 (Interval)', type: 'number', min: 50, max: 2000, def: 100, desc: '每次尝试之间的间隔(ms)。' },
        { key: 'mode', label: '模式 (Mode)', type: 'select', options: ['None', 'Sign'], def: 'None', desc: '尝试降级的目标安全模式。' }
    ]
};

// --- GUIDE CONTENT (FULL) ---
const GUIDE_CONTENT: Record<string, any> = {
    flood: { 
        title: "Session Flood (会话风暴)", 
        color: "red", 
        icon: Zap, 
        desc: "短时间内建立大量会话，耗尽服务器资源。", 
        techMechanics: "客户端绕过正常的连接管理逻辑，快速并发地向服务器发起 CreateSession 请求。这些请求可能不等待旧会话关闭就立即发起新连接，或在建立连接后故意不释放资源。", 
        impactAnalysis: "1. 内存耗尽 (OOM)：服务器为每个会话分配内存上下文，过多的会话会导致 RAM 耗尽。\n2. 拒绝服务 (DoS)：达到服务器 MaxSessionCount 上限后，合法用户将无法连接。\n3. CPU 飙升：频繁的会话握手和清理过程消耗大量 CPU 周期。", 
        mitigation: "1. 配置 MaxSessionCount 限制（如 100）。\n2. 实施基于 IP 的连接速率限制。\n3. 减小未激活会话的 SessionTimeout 时间。" 
    },
    malformed: { 
        title: "Malformed Packet (畸形报文)", 
        color: "purple", 
        icon: Bug, 
        desc: "发送头部长度被篡改的 TCP 报文，测试解析器健壮性。", 
        techMechanics: "构建原始 TCP 报文，其中 OPC UA 头部字段（如 MessageLength）被故意修改为极大值、负值或不匹配实际载荷的值。也可发送不完整的半包数据。", 
        impactAnalysis: "1. 缓冲区溢出：如果服务器盲目信任 MessageLength 分配内存，可能导致崩溃。\n2. 挂起 (Hang)：解析器可能进入无限循环等待剩余数据。\n3. 异常退出：未捕获的解析错误可能导致服务进程直接退出。", 
        mitigation: "1. 严格校验 MessageLength 与实际接收字节数。\n2. 对解析器输入进行模糊测试 (Fuzzing)。\n3. 实施接收缓冲区最大限制。" 
    },
    subStorm: { 
        title: "Subscription Storm (订阅风暴)", 
        color: "rose", 
        icon: Wind, 
        desc: "创建极短周期的大量监控项，压测发布队列。", 
        techMechanics: "创建一个或多个 Subscription，将 PublishingInterval 设为 0ms（或服务器允许的最小值），并向其中添加成千上万个 MonitoredItem。", 
        impactAnalysis: "1. 队列溢出：数据变化速度超过通知队列的处理速度，导致数据丢失。\n2. 线程阻塞：服务器采样线程占用过高，影响其他服务。\n3. 网络拥塞：大量的 PublishResponse 数据包占满带宽。", 
        mitigation: "1. 强制执行最小 SamplingInterval 限制（如 50ms）。\n2. 限制每个 Session 允许创建的 MonitoredItem 总数。\n3. 启用队列溢出丢弃策略 (DiscardOldest)。" 
    },
    flapping: { 
        title: "Flapping (连接闪烁)", 
        color: "emerald", 
        icon: Network, 
        desc: "高频连接/断开，耗尽 TCP 端口资源。", 
        techMechanics: "在一个循环中快速执行 Connect -> Disconnect 操作。这可以是正常的 Graceful 关闭，也可以是直接 RST 连接。", 
        impactAnalysis: "1. TIME_WAIT 累积：服务器操作系统上会出现大量处于 TIME_WAIT 状态的 TCP 端口，最终导致无法建立新连接。\n2. 资源泄漏：如果服务器未能正确清理断开的会话，会导致句柄泄漏。", 
        mitigation: "1. 优化操作系统 TCP 参数 (tcp_tw_reuse)。\n2. 应用程序层面实施连接冷却时间。\n3. 确保 Session 和 SecureChannel 的析构函数无泄漏。" 
    },
    write: { 
        title: "Type Mismatch (类型错配)", 
        color: "amber", 
        icon: Ban, 
        desc: "写入错误的数据类型，验证类型检查机制。", 
        techMechanics: "向一个定义为 Int32 的节点写入 String、Guid 或复杂结构体数据。测试服务器是否在执行写入前进行了严格的类型检查。", 
        impactAnalysis: "1. 内存损坏：如果服务器直接进行内存拷贝 (memcpy) 而不检查类型长度，可能导致堆栈破坏。\n2. 逻辑错误：写入成功但数据无法解析，导致下游系统异常。\n3. 崩溃：类型转换异常未被捕获。", 
        mitigation: "1. 在 Write 服务处理前严格比对 DataType。\n2. 使用强类型语言或安全的转换库。\n3. 返回准确的 BadTypeMismatch 状态码。" 
    },
    fuzz: { 
        title: "NodeId Fuzzing (模糊测试)", 
        color: "lime", 
        icon: FileQuestion, 
        desc: "请求大量随机、超长或特殊字符的 NodeId。", 
        techMechanics: "生成大量随机的 NodeId（如超长字符串、包含 SQL 注入字符、空值、极大数字 ID），并批量发送 Read 请求。", 
        impactAnalysis: "1. 查找效率下降：大量的无效 ID 查询可能会拖慢服务器的哈希表或数据库查询速度。\n2. 拒绝服务：特殊字符可能触发日志记录甚至注入漏洞。\n3. 内存压力：超长 NodeId 字符串占用解析缓存。", 
        mitigation: "1. 限制 NodeId 字符串的最大长度。\n2. 使用高效的数据结构（如 Bloom Filter）快速过滤不存在的 ID。\n3. 限制单次 Read 请求的节点数量。" 
    },
    downgrade: { 
        title: "Downgrade (协议降级)", 
        color: "orange", 
        icon: Lock, 
        desc: "强制尝试不安全的连接方式。", 
        techMechanics: "客户端忽略服务器推荐的安全策略，强制使用 SecurityPolicy=None 和 MessageSecurityMode=None 发起连接请求。", 
        impactAnalysis: "1. 安全绕过：如果服务器配置不当，攻击者可能绕过加密直接窃听或篡改数据。\n2. 审计失败：未加密的连接通常也意味着身份验证较弱。", 
        mitigation: "1. 在生产环境中显式禁用 'None' 端点。\n2. 强制要求 Sign 或 SignAndEncrypt 模式。\n3. 拒绝不符合最小安全要求的连接请求。" 
    },
    secureStress: { 
        title: "Secure Stress (加密风暴)", 
        color: "cyan", 
        icon: ShieldCheck, 
        desc: "反复握手消耗 CPU 资源。", 
        techMechanics: "只执行 OpenSecureChannel 步骤，涉及非对称加密（RSA）运算，但不继续创建 Session。完成后立即关闭或放弃，并重复此过程。", 
        impactAnalysis: "1. CPU 耗尽：非对称解密是计算密集型操作，大量并发握手会瞬间占满 CPU。\n2. 握手队列阻塞：合法用户的正常连接请求因 CPU 繁忙而超时。", 
        mitigation: "1. 限制同一 IP 的并发握手数量。\n2. 引入握手计算的 Proof-of-Work (虽不常见于 OPC UA，但可参考)。\n3. 使用硬件加速卡卸载 SSL/TLS 运算。" 
    },
    recursive: { 
        title: "Recursive Browse (递归浏览)", 
        color: "pink", 
        icon: Search, 
        desc: "深度遍历地址空间，测试引用追踪能力。", 
        techMechanics: "从 Root 节点开始，调用 Browse 服务获取子节点，并对每个子节点递归调用 Browse，直到达到指定深度或节点数。", 
        impactAnalysis: "1. 内存膨胀：服务器需要维护大量的 BrowseContinuationPoints。\n2. 数据库压力：如果节点树存储在关系型数据库中，递归查询会产生大量 SQL 负载。", 
        mitigation: "1. 限制 Browse 请求的 MaxReferencesPerNode。\n2. 限制每个 Session 允许的最大 ContinuationPoint 数量。\n3. 限制 Browse 深度。" 
    }
};

const ChaosGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [selectedKey, setSelectedKey] = useState<string>('flood');
    
    // -- DRAG STATE --
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{ startX: number, startY: number, initialOffX: number, initialOffY: number } | null>(null);

    // Reset position when opened
    useEffect(() => {
        if (isOpen) setOffset({ x: 0, y: 0 });
    }, [isOpen]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialOffX: offset.x,
            initialOffY: offset.y
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setOffset({
            x: dragRef.current.initialOffX + dx,
            y: dragRef.current.initialOffY + dy
        });
    };

    const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Clean up event listeners
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    if (!isOpen) return null;
    const activeInfo = GUIDE_CONTENT[selectedKey];
    const ActiveIcon = activeInfo.icon;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            <div 
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden border border-slate-200 transition-transform duration-75 ease-linear"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
                {/* Header - Draggable Area */}
                <div 
                    className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 cursor-move select-none active:bg-slate-100 transition-colors"
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex items-center gap-3 pointer-events-none">
                        <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">异常测试专家指南</h3>
                            <p className="text-xs text-slate-500 font-medium">Chaos Testing Expert Guide</p>
                        </div>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-slate-50 border-r border-slate-200 overflow-y-auto p-4 space-y-3 shrink-0">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">测试项目列表</div>
                        {Object.entries(GUIDE_CONTENT).map(([key, info]) => { 
                            const Icon = info.icon; 
                            const isSelected = selectedKey === key; 
                            return ( 
                                <div 
                                    key={key} 
                                    onClick={() => setSelectedKey(key)} 
                                    className={`group cursor-pointer rounded-xl border p-3 transition-all duration-200 flex items-center gap-3 relative overflow-hidden ${isSelected ? `bg-white border-${info.color}-500 shadow-md ring-1 ring-${info.color}-400` : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                                >
                                    {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${info.color}-500`}></div>}
                                    <div className={`p-2 rounded-lg ${isSelected ? `bg-${info.color}-50 text-${info.color}-600` : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>{info.title}</h4>
                                        <p className="text-[10px] text-slate-400 truncate">{info.desc}</p>
                                    </div>
                                    {isSelected && <ChevronRight className={`w-4 h-4 text-${info.color}-500`} />}
                                </div> 
                            ); 
                        })}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 overflow-y-auto bg-white p-8">
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-start gap-6 mb-8 border-b border-slate-100 pb-6">
                                <div className={`p-4 rounded-2xl bg-${activeInfo.color}-50 text-${activeInfo.color}-600 shadow-sm border border-${activeInfo.color}-100`}>
                                    <ActiveIcon className="w-10 h-10" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h2 className="text-2xl font-black text-slate-800">{activeInfo.title}</h2>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-${activeInfo.color}-100 text-${activeInfo.color}-700`}>{selectedKey.toUpperCase()}</span>
                                    </div>
                                    <p className="text-slate-500 text-sm leading-relaxed">{activeInfo.desc}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-8">
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
                                        <Microscope className="w-5 h-5 text-blue-500" />
                                        <h3>测试原理 (Technical Mechanics)</h3>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-sm text-slate-600 leading-7">
                                        {activeInfo.techMechanics}
                                    </div>
                                </section>
                                
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
                                        <Stethoscope className="w-5 h-5 text-rose-500" />
                                        <h3>预期后果 (Impact Analysis)</h3>
                                    </div>
                                    <div className="bg-rose-50 rounded-xl p-5 border border-rose-100 text-sm text-slate-700 leading-7 whitespace-pre-wrap">
                                        {activeInfo.impactAnalysis}
                                    </div>
                                </section>
                                
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
                                        <Shield className="w-5 h-5 text-emerald-500" />
                                        <h3>防御建议 (Mitigation Strategies)</h3>
                                    </div>
                                    <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100 text-sm text-emerald-900 leading-7 flex items-start gap-3">
                                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-1 text-emerald-600" />
                                        <div>{activeInfo.mitigation}</div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-sm shadow-md transition-all active:scale-95">关闭指南</button>
                </div>
            </div>
        </div>
    ); 
};

const ChaosConfigModal: React.FC<{ isOpen: boolean; testId: string; currentConfig: any; onClose: () => void; onSave: (id: string, newConfig: any) => void; }> = ({ isOpen, testId, currentConfig, onClose, onSave }) => {
    const [localConfig, setLocalConfig] = useState<any>({});
    useEffect(() => { if (isOpen && testId) { const defaults = {}; (PARAM_DEFS[testId] || []).forEach(p => (defaults as any)[p.key] = p.def); setLocalConfig({ ...defaults, ...currentConfig }); } }, [isOpen, testId, currentConfig]);
    if (!isOpen || !testId) return null;
    const params = PARAM_DEFS[testId] || [];
    const handleChange = (key: string, val: any) => { setLocalConfig((prev: any) => ({ ...prev, [key]: val })); };
    const handleResetDefaults = () => { 
        toast("确定要恢复此测试的默认参数吗？", {
            action: {
                label: '确定',
                onClick: () => {
                    const defaults: any = {}; 
                    params.forEach(p => defaults[p.key] = p.def); 
                    setLocalConfig(defaults);
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><div className="flex items-center gap-3"><div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Settings className="w-5 h-5" /></div><div><h3 className="font-bold text-slate-800 text-lg">{testId.toUpperCase()} 参数配置</h3><p className="text-xs text-slate-500">此配置仅影响异常测试，不影响正常会话</p></div></div><button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button></div>
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30"><div className="grid grid-cols-1 gap-5">{params.map(p => (<div key={p.key} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors"><div className="flex justify-between items-start mb-2"><label className="block text-sm font-bold text-slate-700 flex items-center gap-2"><Sliders className="w-3.5 h-3.5 text-indigo-500" />{p.label}</label><span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">{p.key}</span></div>{p.type === 'text' ? (<input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all" value={localConfig[p.key] || ''} onChange={e => handleChange(p.key, e.target.value)} />) : p.type === 'select' ? (<div className="relative"><select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none appearance-none transition-all cursor-pointer" value={localConfig[p.key] ?? p.def} onChange={e => handleChange(p.key, e.target.value)}>{p.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select><ChevronRight className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" /></div>) : (<div className="flex items-center gap-3"><input type="number" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-mono font-bold text-indigo-600" value={localConfig[p.key] ?? p.def} min={p.min} max={p.max} onChange={e => handleChange(p.key, Number(e.target.value))} />{p.max && p.max < 10000 && (<input type="range" min={p.min} max={p.max} value={localConfig[p.key] ?? p.def} onChange={e => handleChange(p.key, Number(e.target.value))} className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />)}</div>)}<div className="mt-2 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded"><Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-indigo-400" /><p className="leading-relaxed">{p.desc}</p></div></div>))}</div></div>
                <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"><button onClick={handleResetDefaults} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-red-50 transition-colors" title="Reset to default values"><RefreshCcw className="w-3.5 h-3.5" /> 恢复默认</button><div className="flex gap-3"><button onClick={onClose} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-sm transition-colors">取消</button><button onClick={() => { onSave(testId, localConfig); onClose(); }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> 保存并应用</button></div></div>
            </div>
        </div>
    );
};

const Sparkline = React.memo(({ data, color = "#10b981", height = 40, width = 100 }: { data: number[], color?: string, height?: number, width?: number }) => {
    if (!data || data.length < 2) return <div style={{height, width}} className="bg-slate-800/20 rounded border border-slate-700/50"></div>;
    const max = Math.max(...data, 1);
    const min = 0;
    const range = max - min;
    const points = data.map((val, i) => { const x = (i / (data.length - 1)) * width; const y = height - ((val - min) / range) * height; return `${x},${y}`; }).join(' ');
    return (<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible"><path d={`M0 ${height} L${points} L${width} ${height} Z`} fill={color} fillOpacity="0.1" stroke="none" /><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>);
});

const StatusDonut = React.memo(({ success, error }: { success: number, error: number }) => {
    const total = success + error;
    if (total === 0) return <div className="w-8 h-8 rounded-full border-2 border-slate-700 bg-slate-800"></div>;
    const successDeg = (success / total) * 360;
    return (<div className="w-8 h-8 rounded-full shadow-inner relative" style={{ background: `conic-gradient(#10b981 0deg ${successDeg}deg, #ef4444 ${successDeg}deg 360deg)` }}><div className="absolute inset-1 bg-slate-800 rounded-full"></div></div>);
});

const ChaosPanel: React.FC<ChaosPanelProps> = ({ session, addLog, isVisible = true }) => {
    const { t, language } = useLanguage();
    
    // -- UNIFIED CONFIG STATE --
    const [testConfigs, setTestConfigs] = useState<Record<string, any>>(() => {
        const defaults: Record<string, any> = {};
        Object.keys(PARAM_DEFS).forEach(k => {
            defaults[k] = {};
            PARAM_DEFS[k].forEach(p => {
                defaults[k][p.key] = p.def;
            });
        });
        return defaults;
    });

    // -- LOGGING STATE (Buffered) --
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [logLang, setLogLang] = useState<'en'|'zh'>('zh'); // NEW: Language Toggle
    const logBufferRef = useRef<LogItem[]>([]); 
    const logsEndRef = useRef<HTMLDivElement>(null);
    
    // -- EXECUTION STATE --
    const [activeTest, setActiveTest] = useState<string | null>(null);
    const [isCoolingDown, setIsCoolingDown] = useState(false); 
    const [reports, setReports] = useState<TestReport[]>([]);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    
    // -- CONFIG MODAL STATE --
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configTargetId, setConfigTargetId] = useState<string | null>(null);

    // -- LIVE STATS --
    const [liveStats, setLiveStats] = useState<SessionStatistics>({
        uptime: 0, bytesRead: 0, bytesWritten: 0, opsPerSec: 0, itemsPerSec: 0, 
        avgRtt: 0, lastRtt: 0, rttHistory: [], throughputHistory: [], healthScore: 100, slowOps: []
    });

    // -- RESIZABLE PANEL STATE --
    const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
    const isResizingRef = useRef(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizingRef.current) return;
        const newWidth = document.body.clientWidth - e.clientX;
        const constrained = Math.max(300, Math.min(newWidth, document.body.clientWidth * 0.65));
        setRightPanelWidth(constrained);
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const togglePanelExpand = () => {
        setRightPanelWidth(prev => prev > 500 ? DEFAULT_PANEL_WIDTH : EXPANDED_PANEL_WIDTH);
    };

    // 1. Log Flushing Loop
    useEffect(() => {
        let interval: any;
        if (isVisible) {
            interval = setInterval(() => {
                if (logBufferRef.current.length > 0) {
                    const batch = logBufferRef.current.splice(0, logBufferRef.current.length); 
                    setLogs(prev => [...prev, ...batch].slice(-MAX_LOGS)); 
                }
            }, LOG_FLUSH_INTERVAL);
        }
        return () => clearInterval(interval);
    }, [isVisible]);

    // 2. Stats Polling
    useEffect(() => {
        let timer: any;
        if (isVisible) {
            timer = setInterval(() => {
                setLiveStats(opcuaService.getStats());
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isVisible]);

    // 3. Auto Scroll
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    // 4. Persistence
    useEffect(() => {
        const savedReports = localStorage.getItem(`chaos_reports_${session.id}`);
        if (savedReports) try { setReports(JSON.parse(savedReports)); } catch(e) {}
    }, [session.id]);

    useEffect(() => {
        if (reports.length > 0) {
            try {
                localStorage.setItem(`chaos_reports_${session.id}`, JSON.stringify(reports.slice(0, 50), (key, value) => typeof value === 'bigint' ? value.toString() : value)); 
            } catch (e) {
                console.error("Failed to save chaos reports", e);
            }
        }
    }, [reports, session.id]);

    // -- HANDLERS --

    // Enhanced queueLog to support bilingual messages
    const queueLog = useCallback((msg: string, type: 'info'|'warn'|'error'|'success' = 'info', msgZh?: string) => {
        const time = new Date().toLocaleTimeString();
        let finalType = type;
        if (msg.includes("FATAL") || msg.includes("Fail") || msg.includes("Error")) finalType = 'error';
        if (msg.includes("WARN")) finalType = 'warn';
        if (msg.includes("DONE") || msg.includes("Success")) finalType = 'success';
        
        logBufferRef.current.push({ 
            msg, 
            msgZh: msgZh || msg, 
            type: finalType, 
            time, 
            id: Math.random().toString(36).substr(2,9) 
        });
        
        // Propagate critical logs to main app log
        if (finalType === 'error' || finalType === 'success') {
            addLog(finalType, language === 'zh' && msgZh ? msgZh : msg);
        }
    }, [addLog, language]);

    const handleEmergencyStop = async () => {
        queueLog("🚨 EMERGENCY STOP TRIGGERED!", 'error', "🚨 紧急停止已触发！");
        await opcuaService.chaosStop();
        setActiveTest(null);
        setIsCoolingDown(true); 
        queueLog("System halt. Cooling down for safety...", 'warn', "系统挂起。正在冷却保护...");
        setTimeout(() => { setIsCoolingDown(false); queueLog("System ready.", 'info', "系统就绪。"); }, COOLDOWN_TIME);
    };

    const handleStopTest = useCallback(async () => {
        queueLog("🛑 Manual Stop Requested...", 'warn', "🛑 已请求手动停止...");
        await opcuaService.chaosStop();
    }, [queueLog]);

    const runTest = async (type: string, typeZh: string, id: string, action: (cfg: any) => Promise<ChaosResult>) => {
        if (activeTest && activeTest !== id) return; 
        if (isCoolingDown) return;

        setActiveTest(id);
        const config = testConfigs[id];
        const startTime = Date.now();
        queueLog(
            `🚀 START: Initiating ${type}...`, 
            'info', 
            `🚀 启动: 正在初始化 ${typeZh}...`
        );
        
        try {
            const res = await action(config);
            const duration = Date.now() - startTime;
            
            queueLog(
                `✅ DONE: ${type} complete in ${duration}ms.`, 
                'success',
                `✅ 完成: ${typeZh} 测试耗时 ${duration}ms。`
            );
            
            const detailMsgEn = `Result: ${res.successCount} OK, ${res.errorCount} Errors.`;
            const detailMsgZh = `结果: ${res.successCount} 成功, ${res.errorCount} 失败。`;
            queueLog(detailMsgEn, res.errorCount > 0 ? 'warn' : 'info', detailMsgZh);

            if (res.details.length > 0) {
                // Details are typically technical, keep as is or minimal translation prefix
                queueLog(`Details: ${res.details[0]}...`, 'info', `详情: ${res.details[0]}...`);
            }

            setReports(prev => [{
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                testType: type,
                config,
                result: res,
                durationMs: duration
            }, ...prev]);

        } catch (e: any) {
            queueLog(`🔥 FATAL: ${type} failed - ${e.message}`, 'error', `🔥 致命错误: ${typeZh} 失败 - ${e.message}`);
        } finally {
            setActiveTest(null);
        }
    };

    const handleClearLogs = () => { setLogs([]); logBufferRef.current = []; };
    const handleClearReports = () => { 
        toast("Clear reports?", {
            action: {
                label: 'Clear',
                onClick: () => {
                    setReports([]); 
                    localStorage.removeItem(`chaos_reports_${session.id}`);
                }
            },
            cancel: {
                label: 'Cancel',
                onClick: () => {}
            }
        });
    };
    const handleExportReport = () => {
        if (reports.length === 0) return;
        let json = '';
        try {
            json = JSON.stringify(reports, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
        } catch (e) {
            json = JSON.stringify({ error: "Failed to serialize report" });
        }
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `chaos_report.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        queueLog("Report exported.", 'success', "报告已导出。");
    };

    const handleConfigSave = (id: string, newConfig: any) => {
        setTestConfigs(prev => ({ ...prev, [id]: newConfig }));
        queueLog(`Config updated for ${id}`, 'info', `${id} 配置已更新`);
    };

    const openConfig = (id: string) => {
        setConfigTargetId(id);
        setConfigModalOpen(true);
    };

    // --- WRAPPED HANDLERS ---
    const checkConn = () => { if (!session.backendId) { queueLog("Error: Session not connected", 'error', "错误: 会话未连接"); return false; } return true; };

    // Added Chinese Names for logging
    const handlers = {
        flood: () => runTest('Flood', '会话风暴', 'flood', (cfg) => opcuaService.chaosFlood(session.endpointUrl, cfg)),
        malformed: () => runTest('MalformedPacket', '畸形报文', 'malformed', (cfg) => opcuaService.chaosMalformedPacket(session.endpointUrl, cfg)),
        flapping: () => runTest('Flapping', '连接闪烁', 'flapping', (cfg) => opcuaService.chaosFlapping(session.endpointUrl, cfg)),
        downgrade: () => runTest('Downgrade', '协议降级', 'downgrade', (cfg) => opcuaService.chaosProtocolDowngrade(session.endpointUrl, cfg)),
        secureStress: () => runTest('SecureStress', '加密风暴', 'secureStress', (cfg) => opcuaService.chaosSecureChannelStress(session.endpointUrl, cfg)),
        
        // Session Dependent
        subStorm: () => { if(checkConn()) runTest('SubStorm', '订阅风暴', 'subStorm', (cfg) => opcuaService.chaosSubscriptionStorm(session.endpointUrl, cfg)); },
        fuzz: () => { if(checkConn()) runTest('Fuzz', '模糊测试', 'fuzz', (cfg) => opcuaService.chaosFuzzRead(session.backendId!, cfg)); },
        write: () => { if(checkConn()) runTest('TypeMismatch', '类型错配', 'write', (cfg) => opcuaService.chaosMismatchWrite(session.backendId!, cfg.target, cfg)); },
        recursive: () => { if(checkConn()) runTest('Recursive', '递归浏览', 'recursive', (cfg) => opcuaService.chaosRecursiveBrowse(session.backendId!, cfg)); }
    };

    const getCardStyle = (id: string, colorClass: string) => {
        const isActive = activeTest === id;
        return `bg-slate-800/50 rounded-xl border p-4 transition-all duration-300 relative overflow-hidden group ${
            isActive 
            ? `${colorClass} border-opacity-100 shadow-[0_0_15px_rgba(0,0,0,0.5)] scale-[1.02] bg-slate-800` 
            : 'border-slate-700 hover:border-slate-600'
        }`;
    };

    const isOtherTestRunning = (currentTestId: string) => isCoolingDown || (activeTest !== null && activeTest !== currentTestId);

    // --- RENDER CARD HELPER (with Sync Input) ---
    const renderCard = (id: string, titleKey: string, descKey: string, color: string, Icon: any, action: () => void, requiresSession = false) => {
        const mainParamDef = PARAM_DEFS[id]?.[0];
        const mainParam = mainParamDef?.key || 'count';
        const displayVal = testConfigs[id]?.[mainParam] ?? '';
        const isDisabled = isOtherTestRunning(id) || (requiresSession && !session.backendId);

        const handleCountChange = (val: string) => {
            if (val === '') {
                setTestConfigs(prev => ({
                    ...prev,
                    [id]: { ...prev[id], [mainParam]: '' }
                }));
                return;
            }
            const num = parseInt(val);
            if (isNaN(num)) return; 
            setTestConfigs(prev => ({
                ...prev,
                [id]: { ...prev[id], [mainParam]: num }
            }));
        };

        const handleInputBlur = () => {
            const currentVal = testConfigs[id]?.[mainParam];
            const safeVal = (currentVal === '' || currentVal === undefined) ? (mainParamDef?.def || 0) : currentVal;
            const min = mainParamDef?.min || 0;
            const max = mainParamDef?.max || 99999;
            const clamped = Math.max(min, Math.min(max, Number(safeVal)));

            setTestConfigs(prev => ({
                ...prev,
                [id]: { ...prev[id], [mainParam]: clamped }
            }));
        };

        return (
            <div className={getCardStyle(id, `border-${color}-500`)}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className={`font-bold text-${color}-400 flex items-center gap-2 text-sm`}>
                        <Icon className="w-4 h-4"/> {(t.chaos.types as any)[id] || titleKey}
                    </h3>
                    <div className="flex items-center gap-2">
                        {activeTest === id && <Activity className={`w-4 h-4 text-${color}-500 animate-spin`} />}
                        <button 
                            onClick={(e) => { e.stopPropagation(); openConfig(id); }}
                            disabled={activeTest === id}
                            className={`p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-${color}-400 transition-colors`}
                            title="参数设置 (Configuration)"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <p className="text-[10px] text-slate-500 mb-3 h-8 leading-tight">{(t.chaos.descriptions as any)[id] || descKey}</p>
                <div className="flex items-center gap-2">
                    {/* WIDER INPUT BOX */}
                    <div className="flex items-center bg-slate-900 border border-slate-600 rounded px-2 py-1.5 min-w-[90px]">
                        <input 
                            type="number"
                            min={mainParamDef?.min}
                            max={mainParamDef?.max}
                            value={displayVal}
                            onChange={(e) => handleCountChange(e.target.value)}
                            onBlur={handleInputBlur}
                            className="w-16 bg-transparent text-sm text-center text-white font-bold outline-none"
                        />
                        <span className="text-[9px] text-slate-500 border-l border-slate-700 pl-1.5 ml-1">{mainParam}</span>
                    </div>
                    
                    <button 
                        onClick={activeTest === id ? handleStopTest : action} 
                        disabled={isDisabled} 
                        className={`ml-auto px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50 ${activeTest === id ? 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-500 animate-pulse' : `bg-${color}-900/30 hover:bg-${color}-800 text-${color}-200 border border-${color}-800`}`}
                    >
                        {activeTest === id ? <Square className="w-3 h-3 fill-current"/> : <Play className="w-3 h-3"/>} 
                        {activeTest === id ? "Stop" : "Start"}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-slate-900 text-slate-300 relative overflow-hidden font-sans">
            <ChaosGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
            <ChaosConfigModal 
                isOpen={configModalOpen} 
                testId={configTargetId!} 
                currentConfig={configTargetId ? testConfigs[configTargetId] : {}} 
                onClose={() => setConfigModalOpen(false)} 
                onSave={handleConfigSave} 
            />

            {/* LEFT: Controls */}
            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto border-r border-slate-700 scrollbar-thin scrollbar-thumb-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-700 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-red-900 to-slate-900 rounded-lg text-red-500 border border-red-900 shadow-lg"><Skull className="w-8 h-8" /></div>
                        <div>
                            <h2 className="text-xl font-black text-slate-100 tracking-tight">{t.chaos.title}</h2>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-slate-500 font-mono">Robustness & Security Suite</p>
                                <button onClick={() => setIsGuideOpen(true)} className="flex items-center gap-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all shadow-md shadow-indigo-900/50 border border-indigo-500"><BookOpen className="w-3.5 h-3.5" /> 📖 用户指南 (User Guide)</button>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-emerald-900/30">
                            <ThermometerSun className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-400">Safe Mode</span>
                        </div>
                        <button onClick={handleEmergencyStop} className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-95 transition-all animate-pulse hover:animate-none">
                            <Siren className="w-5 h-5" /> {t.chaos.emergencyStop}
                        </button>
                    </div>
                </div>

                {/* Grid Layout for Tests */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-10">
                    <div className="xl:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-2"><Activity className="w-3 h-3" /> Traffic Stress (流量压力)</div>
                    {renderCard('flood', 'Session Flood', 'Flood desc', 'red', Zap, handlers.flood)}
                    {renderCard('malformed', 'Malformed Packet', 'Malformed desc', 'purple', Bug, handlers.malformed)}

                    <div className="xl:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 flex items-center gap-2"><Cpu className="w-3 h-3" /> Logic & Load (逻辑负载)</div>
                    {renderCard('subStorm', 'Sub Storm', 'Storm desc', 'rose', Wind, handlers.subStorm, true)}
                    {renderCard('flapping', 'Flapping', 'Flapping desc', 'emerald', Network, handlers.flapping)}

                    <div className="xl:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 flex items-center gap-2"><AlertOctagon className="w-3 h-3" /> Data Integrity (数据完整性)</div>
                    {renderCard('write', 'Type Mismatch', 'Write desc', 'amber', Ban, handlers.write, true)}
                    {renderCard('fuzz', 'NodeId Fuzzing', 'Fuzz desc', 'lime', FileQuestion, handlers.fuzz, true)}

                    <div className="xl:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 flex items-center gap-2"><ShieldAlert className="w-3 h-3" /> Security (安全)</div>
                    {renderCard('downgrade', 'Downgrade', 'Downgrade desc', 'orange', Lock, handlers.downgrade)}
                    {renderCard('secureStress', 'Secure Stress', 'Stress desc', 'cyan', ShieldCheck, handlers.secureStress)}
                    {renderCard('recursive', 'Recursive', 'Recursive desc', 'pink', Search, handlers.recursive, true)}
                </div>
            </div>

            {/* Resize Handle */}
            <div 
                className="w-1 cursor-col-resize hover:bg-indigo-500 bg-slate-800 transition-colors z-20 flex items-center justify-center group"
                onMouseDown={startResizing}
            >
                <GripVertical className="w-3 h-3 text-slate-500 group-hover:text-indigo-300" />
            </div>

            {/* RIGHT: Monitoring & Logs */}
            <div style={{ width: rightPanelWidth }} className="flex flex-col bg-[#0B1120] border-l border-slate-800 shrink-0 transition-[width] ease-out duration-100 relative">
                {/* 1. Enhanced Monitoring Cards */}
                <div className="p-4 grid grid-cols-2 gap-3 border-b border-slate-800 bg-slate-900/50">
                    <div className="col-span-2 bg-slate-800 rounded-lg p-3 relative overflow-hidden group">
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5" title="Latency / Round Trip Time">响应延迟 (RTT)</span>
                                <div className={`text-xl font-mono font-bold ${liveStats.avgRtt > 100 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                    {liveStats.avgRtt}<span className="text-xs ml-0.5">ms</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5" title="Health Score">健康度 (Health)</span>
                                <div className={`text-xl font-mono font-bold ${liveStats.healthScore < 80 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {liveStats.healthScore}%
                                </div>
                            </div>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-10 opacity-30">
                            <Sparkline data={liveStats.rttHistory} color={liveStats.avgRtt > 100 ? '#f59e0b' : '#10b981'} />
                        </div>
                        {/* Tooltip on hover */}
                        <div className="absolute inset-0 bg-slate-900/90 text-slate-300 p-2 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            平均延迟 & 连接稳定性评分
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-lg p-3 flex flex-col justify-center group relative">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="Throughput / Operations Per Second">吞吐量 (TPS)</span>
                        <div className="text-lg font-mono font-bold text-blue-500">
                            {liveStats.opsPerSec}<span className="text-xs ml-0.5">/s</span>
                        </div>
                        <div className="absolute inset-0 bg-slate-900/90 text-slate-300 p-2 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            每秒处理的操作数
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-between">
                        <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">结果分布</span>
                            <div className="text-[10px] text-slate-400">OK / Fail</div>
                        </div>
                        <StatusDonut success={90} error={10} />
                    </div>
                </div>

                {/* 2. Logs Header with Actions */}
                <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">测试日志 (LOGS)</span>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* Language Toggle */}
                        <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                            <button onClick={() => setLogLang('en')} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${logLang === 'en' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>EN</button>
                            <button onClick={() => setLogLang('zh')} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${logLang === 'zh' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>CN</button>
                        </div>

                        <div className="h-3 w-px bg-slate-800"></div>
                        <button onClick={togglePanelExpand} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors" title={rightPanelWidth > 500 ? "Collapse" : "Expand"}>
                            {rightPanelWidth > 500 ? <Minimize2 className="w-3.5 h-3.5"/> : <Maximize2 className="w-3.5 h-3.5"/>}
                        </button>
                        <button onClick={handleClearLogs} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-colors" title="Clear Logs"><Trash2 className="w-3.5 h-3.5"/></button>
                        <button onClick={handleClearReports} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-colors" title="Clear Reports"><Archive className="w-3.5 h-3.5"/></button>
                        <button onClick={handleExportReport} disabled={reports.length === 0} className="flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors disabled:opacity-30" title="Export Report (JSON)">
                            <Download className="w-3 h-3" /> Report
                        </button>
                    </div>
                </div>

                {/* 3. Log Body - Refined Visuals (Darker Slate, less contrast than black) */}
                <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 bg-[#0B1120]">
                    {logs.length === 0 && <div className="text-slate-600 italic text-center p-4">等待测试执行... (Waiting for execution)</div>}
                    {logs.map((log) => {
                        let colorClass = 'text-slate-300';
                        let borderClass = 'border-slate-800';
                        if (log.type === 'error') { colorClass = 'text-red-400 font-bold'; borderClass = 'border-red-900/30'; }
                        else if (log.type === 'warn') { colorClass = 'text-amber-400'; borderClass = 'border-amber-900/30'; }
                        else if (log.type === 'success') { colorClass = 'text-emerald-400 font-bold'; borderClass = 'border-emerald-900/30'; }
                        else if (log.msg.includes("START")) { colorClass = 'text-blue-400'; borderClass = 'border-blue-900/30'; }

                        const displayMsg = (logLang === 'zh' && log.msgZh) ? log.msgZh : log.msg;

                        return (
                            <div key={log.id} className={`flex gap-2 ${colorClass} border-l-2 pl-2 ${borderClass} hover:bg-white/5 transition-colors py-0.5`}>
                                <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                                <span className="break-words select-text">{displayMsg}</span>
                            </div>
                        );
                    })}
                    <div ref={logsEndRef} />
                </div>
                
                {/* 4. Cooldown / Active Status Bar */}
                {isCoolingDown ? (
                    <div className="px-4 py-2 bg-amber-900/30 border-t border-amber-900/50 text-amber-400 text-[10px] font-bold flex items-center justify-center animate-pulse shrink-0">
                        <RotateCcw className="w-3 h-3 mr-2 animate-spin" />
                        SYSTEM COOLING DOWN...
                    </div>
                ) : activeTest && (
                    <div className="px-4 py-2 bg-red-900/30 border-t border-red-900/50 text-red-400 text-[10px] font-bold flex items-center justify-center animate-pulse shrink-0">
                        <Activity className="w-3 h-3 mr-2" />
                        TEST RUNNING: {activeTest.toUpperCase()}
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(ChaosPanel);
