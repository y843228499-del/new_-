
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, X, Send, AlertTriangle, Lightbulb, ChevronRight, CheckCircle2, MessageSquare, Zap, ArrowRightCircle, Sparkles, BookOpen, Check, Play, Loader2, BrainCircuit, Trash2, History, Plus, MessageCircle, Edit2, MoreVertical, Stethoscope, Terminal, Grid, HelpCircle, ChevronDown, ChevronUp, Search, Smartphone, Book, Sparkle, BookOpenCheck } from 'lucide-react';
import { CopilotInsight, ChatMessage, AIAction, PendingAIAction, ChatSession, LogEntry, SessionInfo } from '../types';
import { askAI, initializeAI, getAIStatus, TERMINOLOGY, MANUAL_DB, CAPABILITIES, EnhancedKnowledge, AIMode } from '../services/aiKnowledgeBase';
import { toast } from 'sonner';

interface CopilotWidgetProps {
    insights: CopilotInsight[]; 
    onClear: () => void;
    onAction: (action: string, payload?: any) => void; 
    systemLogs: LogEntry[];
    activeSession?: SessionInfo;
    currentView?: string; 
}

// --- NEW COMPONENT: EXPANDABLE MESSAGE CARD ---
const ExpandableMessage = ({ msg, renderContent }: { msg: ChatMessage, renderContent: (text: string) => React.ReactNode }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Heuristic: If it's a KB answer (has debugInfo.source='knowledge_base') or very long, collapse it.
    const isKB = msg.debugInfo?.source === 'knowledge_base';
    // Check if content actually has a detail section marker
    const hasDetailSection = msg.content.includes("###");
    const isLong = msg.content.length > 200;
    
    // Only collapse if it's a KB answer WITH details, or just very long
    const shouldCollapse = (isKB && hasDetailSection) || isLong;

    // Extract Summary logic: Find text before the first header
    const summary = useMemo(() => {
        if (!shouldCollapse) return msg.content;
        
        // Split by markdown header if present
        const parts = msg.content.split(/\n###/);
        if (parts.length > 1) {
            return parts[0].trim();
        }
        
        // Fallback: First 200 chars
        return msg.content.substring(0, 200) + (msg.content.length > 200 ? "..." : "");
    }, [msg.content, shouldCollapse]);

    if (!shouldCollapse) {
        return (
            <div className="bg-white border border-slate-200 text-slate-700 px-4 py-3 rounded-2xl rounded-tl-none text-sm shadow-sm leading-relaxed select-text relative group">
                {renderContent(msg.content)}
                {msg.debugInfo && (
                    <div className="absolute -bottom-5 left-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-400 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap z-10 pointer-events-none">
                        <Zap className="w-2.5 h-2.5 text-amber-500" />
                        <span>Source: {msg.debugInfo.source}</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`bg-white border text-slate-700 rounded-2xl rounded-tl-none text-sm shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'}`}>
            {/* Header / Summary Area */}
            <div className="px-4 py-3 bg-white">
                {!isExpanded ? (
                    <div className="leading-relaxed opacity-90 text-slate-800">
                        {renderContent(summary)}
                    </div>
                ) : (
                    <div className="leading-relaxed space-y-2 animate-in fade-in duration-300">
                        {renderContent(msg.content)}
                    </div>
                )}
            </div>

            {/* Footer Action */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`px-4 py-2 border-t cursor-pointer flex items-center justify-between text-xs font-bold transition-colors ${isExpanded ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
            >
                <span className="flex items-center gap-2">
                    {isExpanded ? <BookOpenCheck className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                    {isExpanded ? "收起说明" : "📖 查看详细说明"}
                </span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
            </div>
        </div>
    );
};

const CopilotWidget: React.FC<CopilotWidgetProps> = ({ insights, onClear, onAction, systemLogs, activeSession, currentView }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCapabilitiesOpen, setIsCapabilitiesOpen] = useState(false);
    const [capabilityFilter, setCapabilityFilter] = useState(''); 
    const [unreadCount, setUnreadCount] = useState(0);
    const [aiMode, setAiMode] = useState<AIMode>('auto');
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false); 
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [engineStatus, setEngineStatus] = useState<"idle" | "loading" | "ready">("idle");
    const [loadingMsg, setLoadingMsg] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const prevInsightsLen = useRef(0);

    const quickPrompts = useMemo(() => {
        if (aiMode === 'app') return ["怎么连接服务器？", "Auto Map 怎么用？", "如何导出数据？", "视图功能是什么？"];
        if (aiMode === 'protocol') return ["Int16 和 UInt16 的区别？", "BadTimeout 含义？", "SecurityPolicy 详解", "什么是 MonitoredItem？"];
        return ["怎么连接服务器？", "BadTimeout 怎么解决？", "Int16 和 UInt16 的区别？", "Auto Map 怎么用？", "帮我诊断当前错误"];
    }, [aiMode]);

    const createNewSession = (initialMsg?: ChatMessage) => {
        const newId = Date.now().toString();
        const newSession: ChatSession = {
            id: newId,
            title: `新对话`,
            timestamp: Date.now(),
            messages: initialMsg ? [initialMsg] : [{
                id: 'welcome',
                role: 'ai',
                content: '我是您的 OPC UA 智能专家。请选择上方模式进行针对性提问，或直接输入问题。',
                timestamp: Date.now()
            }]
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newId);
        setIsHistoryOpen(false); 
        return newId;
    };

    useEffect(() => {
        const savedSessions = localStorage.getItem('copilot_sessions');
        if (savedSessions) {
            try {
                const parsed = JSON.parse(savedSessions);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setSessions(parsed);
                    setActiveSessionId(parsed[0].id);
                } else {
                    createNewSession();
                }
            } catch (e) { createNewSession(); }
        } else { createNewSession(); }
        
        const status = getAIStatus();
        setEngineStatus(status);
        if (status === 'idle') {
            setEngineStatus("loading"); 
            initializeAI((msg) => {
                setLoadingMsg(msg);
                // Fix: Include "Ready" to catch the completion message
                if (msg.includes("就绪") || msg.includes("Initialized") || msg.includes("Ready")) {
                    setEngineStatus("ready");
                }
            });
        }

        // Safety fallback: If AI takes too long (e.g. callback missed), force ready state to hide the loading banner
        const safetyTimer = setTimeout(() => {
            setEngineStatus(prev => {
                if (prev === 'loading') return 'ready';
                return prev;
            });
        }, 5000);

        return () => clearTimeout(safetyTimer);
    }, []);

    useEffect(() => { if (sessions.length > 0) localStorage.setItem('copilot_sessions', JSON.stringify(sessions.slice(0, 20))); }, [sessions]);
    const activeMessages = sessions.find(s => s.id === activeSessionId)?.messages || [];
    const handleClearAllHistory = () => { 
        toast("确定要删除所有对话记录吗？", {
            action: {
                label: '确定',
                onClick: () => {
                    localStorage.removeItem('copilot_sessions'); 
                    setSessions([]); 
                    createNewSession();
                }
            },
            cancel: {
                label: '取消',
                onClick: () => {}
            }
        });
    };
    const handleDeleteSession = (e: React.MouseEvent, id: string) => { e.stopPropagation(); const newSessions = sessions.filter(s => s.id !== id); setSessions(newSessions); if (activeSessionId === id) { if (newSessions.length > 0) setActiveSessionId(newSessions[0].id); else createNewSession(); } };
    const handleStartRename = (e: React.MouseEvent, session: ChatSession) => { e.stopPropagation(); setEditingSessionId(session.id); setEditTitle(session.title); };
    const handleSaveRename = () => { if (editingSessionId && editTitle.trim()) { setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, title: editTitle.trim() } : s)); } setEditingSessionId(null); };
    useEffect(() => { if (insights.length > prevInsightsLen.current) { const newInsights = insights.slice(0, insights.length - prevInsightsLen.current); const newMsgs: ChatMessage[] = newInsights.map(ins => ({ id: ins.id, role: 'system', content: '', insight: ins, timestamp: ins.timestamp })); if (activeSessionId) { setSessions(prev => prev.map(s => { if (s.id === activeSessionId) return { ...s, messages: [...s.messages, ...newMsgs] }; return s; })); } if (!isOpen) setUnreadCount(c => c + newInsights.length); } prevInsightsLen.current = insights.length; }, [insights, isOpen, activeSessionId]);
    useEffect(() => { if (isOpen && scrollRef.current && !isHistoryOpen && !isCapabilitiesOpen) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [activeMessages, isOpen, isTyping, isHistoryOpen, isCapabilitiesOpen]);
    const handleOpen = () => { setIsOpen(true); setUnreadCount(0); };

    const handleSend = async (text?: string) => {
        const query = text || inputValue;
        if (!query.trim()) return;
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: query, timestamp: Date.now() };
        setSessions(prev => prev.map(s => { if (s.id === activeSessionId) { const isNew = s.title === '新对话'; return { ...s, title: isNew ? (query.length > 18 ? query.substring(0, 18) + '...' : query) : s.title, messages: [...s.messages, userMsg] }; } return s; }));
        setInputValue(""); setIsTyping(true); setIsCapabilitiesOpen(false);
        try {
            const recentLogs = systemLogs.slice(-50);
            const currentSession = sessions.find(s => s.id === activeSessionId);
            const currentHistory = currentSession ? [...currentSession.messages, userMsg].map(m => ({ role: m.role, content: m.content })) : [];
            // PASS CURRENT VIEW TO ASK AI FOR CONTEXT AWARENESS
            const { text, action, relatedTopics, debugInfo } = await askAI(userMsg.content, { logs: recentLogs, session: activeSession, history: currentHistory, mode: aiMode, currentView: currentView });
            const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'ai', content: text, action: action, relatedTopics: relatedTopics, timestamp: Date.now(), debugInfo: debugInfo };
            setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, aiMsg] } : s));
        } catch (e) { const errorMsg: ChatMessage = { id: Date.now().toString(), role: 'ai', content: "处理出错，请重试。", timestamp: Date.now() }; setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, errorMsg] } : s)); } finally { setIsTyping(false); }
    };

    const handleExecuteAction = (action: AIAction) => { if (action.type === 'PLAN') { const pending = action.payload as PendingAIAction; if (pending.type === 'DIAGNOSE_ISSUE') { handleSend("帮我诊断当前错误"); return; } onAction('EXECUTE_PLAN', pending); } else { if (action.type === 'DIAGNOSE_ISSUE') { handleSend("帮我诊断当前错误"); return; } if (action.type === 'NAVIGATE' || action.type === 'CONFIGURE') { onAction(action.type, action.payload); } } const sysMsg: ChatMessage = { id: Date.now().toString(), role: 'system', content: `已确认执行: ${action.label}`, timestamp: Date.now() }; setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, sysMsg] } : s)); };
    const handleCancelAction = () => { const sysMsg: ChatMessage = { id: Date.now().toString(), role: 'system', content: `操作已取消`, timestamp: Date.now() }; setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, sysMsg] } : s)); };
    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSend(); };

    // --- REFACTORED GROUPING LOGIC FOR SIDEBAR ---
    const groupedManual: Record<string, Record<string, EnhancedKnowledge[]>> = useMemo(() => {
        const filtered = MANUAL_DB.filter(item => {
            // 1. Text Filter
            if (capabilityFilter) {
                const search = capabilityFilter.toLowerCase();
                const matchText = item.question.toLowerCase().includes(search) || item.category.toLowerCase().includes(search) || item.tags.some(t => t.toLowerCase().includes(search));
                if (!matchText) return false;
            }
            // 2. Mode Filter
            if (aiMode === 'app' && item.kbType !== 'app') return false;
            if (aiMode === 'protocol' && item.kbType !== 'protocol') return false;
            // 'auto' shows all
            return true;
        });

        // Group by 'kbType' first, then 'category'
        const grouped: Record<string, Record<string, EnhancedKnowledge[]>> = {
            app: {},
            protocol: {},
            general: {}
        };

        filtered.forEach(item => {
            const type = item.kbType || 'general';
            if (!grouped[type][item.category]) grouped[type][item.category] = [];
            grouped[type][item.category].push(item);
        });

        return grouped;
    }, [capabilityFilter, aiMode]);

    const renderContent = (text: string) => {
        const parts: string[] = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="text-slate-900">{part.slice(2, -2)}</strong>;
            }
            return renderTerminology(part, i);
        });
    };

    const renderTerminology = (text: string, keyPrefix: number) => {
        const terms = Object.keys(TERMINOLOGY);
        const regex = new RegExp(`(${terms.join('|')})`, 'gi');
        const parts: string[] = text.split(regex);
        return (
            <span key={keyPrefix}>
                {parts.map((part, i) => {
                    const termKey = terms.find(t => t.toLowerCase() === part.toLowerCase());
                    if (termKey) {
                        return (
                            <span key={i} className="text-indigo-600 font-bold cursor-help border-b border-dotted border-indigo-400 relative group/term">
                                {part}
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover/term:opacity-100 pointer-events-none z-50 transition-opacity font-normal leading-tight">
                                    {TERMINOLOGY[termKey]}
                                </span>
                            </span>
                        );
                    }
                    return part.split('\n').map((line, li) => (
                        <React.Fragment key={`${i}-${li}`}>
                            {li > 0 && <br/>}
                            {line}
                        </React.Fragment>
                    ));
                })}
            </span>
        );
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'error': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'tip': return <Lightbulb className="w-5 h-5 text-emerald-500" />;
            default: return <MessageSquare className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <>
            <div className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-2">
                {!isOpen && unreadCount > 0 && (
                    <div className="bg-white px-4 py-2 rounded-lg shadow-xl border border-blue-100 mb-2 animate-in slide-in-from-right-10 fade-in duration-300 flex items-center gap-3 cursor-pointer" onClick={handleOpen}>
                        <div className="p-1.5 bg-red-100 rounded-full text-red-600 animate-pulse"><AlertTriangle className="w-4 h-4" /></div>
                        <div><div className="text-xs font-bold text-slate-800">发现异常</div><div className="text-[10px] text-slate-500">点击查看 AI 深度分析</div></div>
                    </div>
                )}
                <button onClick={() => isOpen ? setIsOpen(false) : handleOpen()} className={`p-3 rounded-full shadow-lg transition-all duration-300 relative group ${isOpen ? 'bg-slate-800 text-white rotate-90' : 'bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-100'}`}>
                    {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                    {!isOpen && unreadCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full shadow-sm animate-bounce">{unreadCount}</span>}
                </button>
            </div>

            {isOpen && (
                <div className="absolute bottom-20 right-6 w-96 h-[700px] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-200 font-sans">
                    {/* Header & Tabs preserved */}
                    <div className="bg-slate-900 p-3 text-white flex flex-col gap-3 shadow-md z-10 shrink-0">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm relative border border-white/20 cursor-pointer hover:bg-white/20 transition-colors" onClick={() => setIsHistoryOpen(!isHistoryOpen)} title="历史记录">
                                    {isHistoryOpen ? <X className="w-4 h-4" /> : <History className="w-4 h-4" />}
                                </div>
                                <div><h3 className="font-bold text-sm tracking-wide">AI Copilot</h3><div className="flex items-center gap-1 text-[10px] text-slate-400"><BrainCircuit className="w-3 h-3" />{engineStatus === 'loading' ? 'Engine Loading...' : 'Online'}</div></div>
                            </div>
                            <div className="flex gap-1 items-center">
                                <button onClick={() => setIsCapabilitiesOpen(!isCapabilitiesOpen)} className={`p-2 rounded-full transition-colors flex items-center gap-1 ${isCapabilitiesOpen ? 'bg-white text-indigo-600 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`} title="能力矩阵"><Grid className="w-4 h-4" /></button>
                                <button onClick={() => createNewSession()} className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-1" title="新对话"><Plus className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="flex p-1 bg-slate-800 rounded-lg border border-slate-700">
                            <button onClick={() => setAiMode('auto')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold rounded transition-all ${aiMode === 'auto' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}><Sparkles className="w-3 h-3" /> 智能 (Auto)</button>
                            <button onClick={() => setAiMode('app')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold rounded transition-all ${aiMode === 'app' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}><Smartphone className="w-3 h-3" /> 软件操作</button>
                            <button onClick={() => setAiMode('protocol')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold rounded transition-all ${aiMode === 'protocol' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}><Book className="w-3 h-3" /> 协议百科</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative flex">
                        {/* Capabilities & History Sidebars */}
                        <div className={`absolute inset-0 bg-slate-50 z-30 transition-transform duration-300 transform ${isCapabilitiesOpen ? 'translate-y-0' : 'translate-y-full'} flex flex-col overflow-hidden`}>
                            <div className="p-3 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0 shadow-sm">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><HelpCircle className="w-4 h-4 text-emerald-500"/> 全能知识库</h3>
                                <button onClick={() => setIsCapabilitiesOpen(false)} className="text-slate-400 hover:text-slate-600"><ChevronDown className="w-5 h-5"/></button>
                            </div>
                            <div className="p-3 bg-slate-50 border-b border-slate-200"><div className="relative"><Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" /><input className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:border-indigo-500" placeholder="搜索知识点..." value={capabilityFilter} onChange={e => setCapabilityFilter(e.target.value)}/></div></div>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {['app', 'protocol'].map((sectionType) => {
                                    const sectionData = groupedManual[sectionType];
                                    if (!sectionData || Object.keys(sectionData).length === 0) return null;
                                    
                                    const sectionTitle = sectionType === 'app' ? "🎮 软件操作指南" : "📚 协议知识百科";
                                    const sectionColor = sectionType === 'app' ? "text-indigo-600" : "text-emerald-600";
                                    const sectionBg = sectionType === 'app' ? "bg-indigo-50" : "bg-emerald-50";

                                    return (
                                        <div key={sectionType} className="space-y-4">
                                            {/* Only show section header if in Auto mode or filtering */}
                                            {(aiMode === 'auto' || capabilityFilter) && (
                                                <div className={`px-3 py-1.5 rounded text-xs font-bold ${sectionBg} ${sectionColor} border border-transparent`}>
                                                    {sectionTitle}
                                                </div>
                                            )}
                                            
                                            {Object.entries(sectionData).map(([category, items]) => (
                                                <div key={category} className="pl-2 border-l-2 border-slate-200">
                                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider flex items-center gap-2">{category}</h4>
                                                    <div className="space-y-1">
                                                        {(items as EnhancedKnowledge[]).map((item) => (
                                                            <button key={item.id} onClick={() => handleSend(item.question)} className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all text-xs font-medium text-slate-600 flex items-center justify-between group">
                                                                <span>{item.question}</span><ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-400" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        <div className={`absolute inset-0 bg-slate-50 z-20 transition-transform duration-300 transform ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col border-r border-slate-200 shadow-lg`}>
                             {/* ... History Content ... */}
                             <div className="p-3 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0"><span className="text-xs font-bold text-slate-600 uppercase tracking-wider">对话历史</span><button onClick={handleClearAllHistory} className="text-red-500 text-[10px] hover:underline px-2">清空全部</button></div>
                             <div className="flex-1 overflow-y-auto p-2 space-y-1">{sessions.map(s => (<div key={s.id} onClick={() => { setActiveSessionId(s.id); setIsHistoryOpen(false); }} className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer text-xs transition-colors border ${activeSessionId === s.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-100 hover:bg-slate-100 text-slate-700'}`}><div className="flex items-center gap-3 truncate flex-1"><MessageCircle className={`w-4 h-4 flex-shrink-0 ${activeSessionId === s.id ? 'text-indigo-500' : 'text-slate-400'}`} />{editingSessionId === s.id ? (<input autoFocus className="flex-1 bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none text-xs" value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={handleSaveRename} onKeyDown={e => e.key === 'Enter' && handleSaveRename()} onClick={e => e.stopPropagation()}/>) : (<span className="truncate font-medium">{s.title}</span>)}</div><div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">{editingSessionId !== s.id && (<><button onClick={(e) => handleStartRename(e, s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 className="w-3 h-3" /></button><button onClick={(e) => handleDeleteSession(e, s.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button></>)}</div></div>))}</div>
                        </div>

                        {/* MAIN CHAT */}
                        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 w-full">
                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-300">
                                {activeMessages.map((msg) => {
                                    if (msg.role === 'system') {
                                        if (msg.insight) {
                                            const insight = msg.insight;
                                            return (
                                                <div key={msg.id} className="bg-white rounded-lg border border-red-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                                                    <div className="p-3 border-b border-slate-50 flex justify-between items-start bg-red-50/30">
                                                        <div className="flex gap-2"><div className="mt-0.5">{getIcon(insight.type)}</div><div><h4 className="text-sm font-bold text-slate-800">{insight.title}</h4><div className="text-[10px] text-slate-400 mt-0.5">自动诊断 • {new Date(insight.timestamp).toLocaleTimeString()}</div></div></div>
                                                    </div>
                                                    <div className="p-3"><p className="text-xs text-slate-600 leading-relaxed mb-2">{insight.description}</p>{insight.suggestedAction && (<button onClick={() => handleExecuteAction({ type: 'PLAN', label: '诊断', payload: { type: 'DIAGNOSE_ISSUE', description: 'Diagnose', data: {} } })} className="w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded transition-colors border border-indigo-200"><Stethoscope className="w-3 h-3" />查看深度分析</button>)}</div>
                                                </div>
                                            );
                                        }
                                        return <div key={msg.id} className="flex justify-center my-2 opacity-60"><span className="text-[10px] bg-slate-200 rounded-full px-2 py-0.5 text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {msg.content}</span></div>;
                                    }
                                    if (msg.role === 'user') {
                                        return <div key={msg.id} className="flex justify-end animate-in fade-in slide-in-from-right-2 duration-200"><div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-none max-w-[85%] text-sm shadow-sm select-text leading-relaxed">{msg.content}</div></div>;
                                    }
                                    if (msg.role === 'ai') {
                                        return (
                                            <div key={msg.id} className="flex flex-col items-start gap-1 animate-in fade-in slide-in-from-left-2 duration-200 max-w-[90%]">
                                                {/* MODIFIED: Use ExpandableMessage for AI responses */}
                                                <ExpandableMessage msg={msg} renderContent={renderContent} />
                                                
                                                {msg.action && (
                                                    <div className="mt-1 ml-1 bg-white border border-emerald-100 rounded-xl shadow-sm p-3 w-full animate-in slide-in-from-top-2 overflow-hidden relative">
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                                        <div className="flex items-center gap-2 mb-3 pl-2"><div className="p-1.5 bg-emerald-50 rounded-full text-emerald-600"><Play className="w-3.5 h-3.5 fill-current" /></div><div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">建议操作</div><div className="text-xs font-bold text-slate-700">{msg.action.label}</div></div></div>
                                                        <div className="flex gap-2 pl-2"><button onClick={() => handleCancelAction()} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors">取消</button><button onClick={() => handleExecuteAction(msg.action!)} className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-sm"><Check className="w-3.5 h-3.5" /> 确认执行</button></div>
                                                    </div>
                                                )}
                                                {msg.relatedTopics && msg.relatedTopics.length > 0 && (<div className="ml-2 flex flex-wrap gap-1 mt-2">{(msg.relatedTopics as string[]).map(topic => (<button key={topic} onClick={() => handleSend(topic)} className="px-2 py-1 bg-slate-100 hover:bg-white hover:border-indigo-200 text-slate-500 hover:text-indigo-600 text-[10px] rounded-full border border-slate-200 transition-all flex items-center gap-1"><BookOpen className="w-2.5 h-2.5" />{topic}</button>))}</div>)}
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                                {isTyping && <div className="flex justify-start animate-pulse"><div className="bg-slate-200/50 text-slate-500 px-3 py-2 rounded-2xl rounded-tl-none text-xs flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-400" /> 正在分析...</div></div>}
                                {activeMessages.length <= 1 && (
                                    <div className="mt-8"><div className="text-xs font-bold text-slate-400 mb-3 px-2 uppercase tracking-wider">专家建议 ({aiMode === 'auto' ? '综合' : aiMode === 'app' ? '操作' : '协议'})：</div><div className="flex flex-wrap gap-2 px-1">{quickPrompts.map((prompt, i) => (<button key={i} onClick={() => handleSend(prompt)} className="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm active:scale-95 text-left">{prompt}</button>))}</div></div>
                                )}
                            </div>
                            <div className="p-3 bg-white border-t border-slate-200 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shrink-0">
                                {engineStatus === 'loading' && (<div className="absolute -top-8 left-0 right-0 flex justify-center pointer-events-none"><div className="bg-indigo-600 text-white text-[10px] px-3 py-1 rounded-full shadow-lg flex items-center gap-2 opacity-90 animate-in slide-in-from-bottom-2"><Loader2 className="w-3 h-3 animate-spin" />AI 核心加载中... (专家手册已启用)</div></div>)}
                                <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-2 py-1.5 border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all"><input className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-1 text-slate-700 placeholder:text-slate-400" placeholder={`输入问题 (${aiMode === 'app' ? '仅限软件操作' : aiMode === 'protocol' ? '仅限 OPC UA 协议' : '综合模式'})...`} value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}/><button onClick={() => handleSend()} disabled={!inputValue.trim() || isTyping} className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg transition-colors shadow-sm"><Send className="w-4 h-4" /></button></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CopilotWidget;
