
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EipSessionInfo, ConnectionStatus, CipDataType } from '../../types';
import { eipService } from '../services/eipService';
import { Zap, Bug, Activity, Play, Square, Siren, Terminal, Trash2, ShieldAlert, AlertOctagon, Ban, Network, RotateCcw, RefreshCcw } from 'lucide-react';

interface EipChaosPanelProps {
    session: EipSessionInfo;
    addLog: (type: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
}

// 日志结构
interface ChaosLog {
    id: number;
    time: string;
    msg: string;
    type: 'info' | 'warn' | 'error' | 'success';
}

const MAX_LOGS = 200;

export const EipChaosPanel: React.FC<EipChaosPanelProps> = ({ session, addLog }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    
    // --- STATE ---
    const [activeTest, setActiveTest] = useState<string | null>(null);
    const [logs, setLogs] = useState<ChaosLog[]>([]);
    const [stats, setStats] = useState({ sent: 0, success: 0, error: 0 });
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    
    // --- REFS (For Loop Control) ---
    const isRunningRef = useRef(false);
    const logsRef = useRef<ChaosLog[]>([]); // Buffer for high speed logging
    const statsRef = useRef({ sent: 0, success: 0, error: 0 });
    const logEndRef = useRef<HTMLDivElement>(null);

    // --- CONFIG STATE ---
    const [connStormCount, setConnStormCount] = useState(50);
    const [connStormDelay, setConnStormDelay] = useState(50);
    
    const [fuzzCount, setFuzzCount] = useState(100);
    const [fuzzDelay, setFuzzDelay] = useState(10);
    
    const [stressCount, setStressCount] = useState(500);
    const [stressTag, setStressTag] = useState("Test_DINT"); // 需要用户指定一个存在的标签
    
    const [scanStormCount, setScanStormCount] = useState(100); // New for Scan Storm
    const [scanStormTag, setScanStormTag] = useState("Scan_Trigger_Tag"); // New for Scan Storm
    const [scanStormDelay, setScanStormDelay] = useState(1000); // New: Delay after clear

    // --- UTILS ---
    const pushLog = (msg: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
        const entry: ChaosLog = {
            id: Date.now() + Math.random(),
            time: new Date().toLocaleTimeString(),
            msg,
            type
        };
        logsRef.current.push(entry);
        if (logsRef.current.length > MAX_LOGS) logsRef.current.shift();
    };

    // Log Flush Loop (10fps)
    useEffect(() => {
        const timer = setInterval(() => {
            if (logsRef.current.length > 0 || statsRef.current.sent > 0) {
                setLogs([...logsRef.current]); // Copy ref to state
                setStats({...statsRef.current});
            }
        }, 100);
        return () => clearInterval(timer);
    }, []);

    // Auto Scroll
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const stopTest = () => {
        isRunningRef.current = false;
        setActiveTest(null);
        pushLog("🛑 测试已手动停止", 'warn');
    };

    const resetStats = () => {
        statsRef.current = { sent: 0, success: 0, error: 0 };
        setStats({ sent: 0, success: 0, error: 0 });
        setLogs([]);
        logsRef.current = [];
    };

    // --- TEST STRATEGIES ---

    // 1. Connection Storm
    const runConnectionStorm = async () => {
        if (activeTest) return;
        resetStats();
        setActiveTest('STORM');
        isRunningRef.current = true;
        pushLog(`🚀 启动连接风暴: 目标 ${session.address}, 次数 ${connStormCount}`);

        // 我们使用临时的 sessionID 来创建连接，不影响主界面
        for (let i = 0; i < connStormCount; i++) {
            if (!isRunningRef.current) break;
            
            const tempId = `chaos-storm-${Math.random().toString(36).substr(2,5)}`;
            statsRef.current.sent++;
            
            try {
                // Connect
                const res = await eipService.connect(tempId, session.address, session.slot || 0, 502, session.localBindIp);
                if (res.instanceId) {
                    statsRef.current.success++;
                    // Immediate Disconnect
                    await eipService.disconnect(tempId);
                } else {
                    throw new Error("No Instance ID");
                }
            } catch (e: any) {
                statsRef.current.error++;
                pushLog(`[${i}] 连接失败: ${e.message}`, 'error');
            }

            // Delay
            if (connStormDelay > 0) await new Promise(r => setTimeout(r, connStormDelay));
        }

        isRunningRef.current = false;
        setActiveTest(null);
        pushLog(`✅ 连接风暴结束。成功: ${statsRef.current.success}, 失败: ${statsRef.current.error}`, 'success');
    };

    // 2. Tag Fuzzer
    const runTagFuzzer = async () => {
        if (activeTest) return;
        if (!session.instanceId) { pushLog("错误: 需要先在概览界面连接设备", 'error'); return; }
        
        resetStats();
        setActiveTest('FUZZ');
        isRunningRef.current = true;
        pushLog(`🚀 启动标签模糊测试: 随机生成 ${fuzzCount} 个标签名`);

        const strategies = [
            () => `Invalid_Tag_${Math.random()}`, // Non-existent
            () => `Tag${Math.random().toString(36).repeat(5)}`, // Long name
            () => `Tag%${Math.floor(Math.random()*100)}#Invalid`, // Special chars
            () => ``, // Empty
            () => `Local:1:I.Data[${Math.floor(Math.random() * 99999)}]` // Out of bounds array
        ];

        for (let i = 0; i < fuzzCount; i++) {
            if (!isRunningRef.current) break;
            statsRef.current.sent++;

            const strategy = strategies[i % strategies.length];
            const fakeTag = strategy();

            try {
                // Expecting Error
                await eipService.readTag(session.id, fakeTag, CipDataType.DINT);
                // If success (weird), log it
                statsRef.current.success++; 
                pushLog(`[${i}] 意外成功: ${fakeTag.substring(0,20)}...`, 'warn');
            } catch (e: any) {
                // Error is GOOD here usually (handled correctly by PLC)
                statsRef.current.error++;
                // Check if error is "Invalid Tag" (Expected) or "Timeout" (Bad)
                if (e.message.includes('Timeout')) {
                    pushLog(`[${i}] 严重: PLC 响应超时! (System Stress)`, 'error');
                }
            }

            if (fuzzDelay > 0) await new Promise(r => setTimeout(r, fuzzDelay));
        }

        isRunningRef.current = false;
        setActiveTest(null);
        pushLog(`✅ 模糊测试结束。PLC 响应情况详见日志。`, 'success');
    };

    // 3. High Frequency Stress
    const runStressTest = async () => {
        if (activeTest) return;
        if (!session.instanceId) { pushLog("错误: 需要先在概览界面连接设备", 'error'); return; }
        if (!stressTag) { pushLog("错误: 请输入有效的测试标签名", 'error'); return; }

        resetStats();
        setActiveTest('STRESS');
        isRunningRef.current = true;
        pushLog(`🚀 启动高频压测: 目标 ${stressTag}, 请求 ${stressCount}`);

        const startTime = performance.now();

        // High speed loop
        for (let i = 0; i < stressCount; i++) {
            if (!isRunningRef.current) break;
            statsRef.current.sent++;
            
            try {
                await eipService.readTag(session.id, stressTag, CipDataType.DINT);
                statsRef.current.success++;
            } catch (e: any) {
                statsRef.current.error++;
                pushLog(`[${i}] 读取失败: ${e.message}`, 'error');
            }
            
            // 0ms delay - run as fast as JS/DLL allows
            await new Promise(r => setTimeout(r, 0));
        }

        const duration = (performance.now() - startTime) / 1000;
        const tps = Math.round(statsRef.current.sent / duration);

        isRunningRef.current = false;
        setActiveTest(null);
        pushLog(`✅ 压测结束。耗时: ${duration.toFixed(2)}s, TPS: ${tps}`, 'success');
    };
    
    // 4. Cache Thrashing (Scan Storm)
    const runScanStorm = async () => {
        if (activeTest) return;
        if (!session.instanceId) { pushLog("错误: 需要先在概览界面连接设备", 'error'); return; }
        if (!scanStormTag) { pushLog("错误: 请输入用于触发扫描的标签名", 'error'); return; }

        resetStats();
        setActiveTest('SCAN_STORM');
        isRunningRef.current = true;
        
        const isInfinite = scanStormCount <= 0;
        const totalStr = isInfinite ? "∞" : scanStormCount;
        const alignMode = session.alignment || 0;
        
        pushLog(`🚀 启动缓存震荡: 目标 ${scanStormTag}, 循环 ${totalStr}, 延迟 ${scanStormDelay}ms`);

        let i = 0;
        while (isRunningRef.current) {
            if (!isInfinite && i >= scanStormCount) break;
            
            statsRef.current.sent++;
            
            try {
                // 1. Clear Cache (Forces DLL to forget tag paths/handles)
                await eipService.resetCache();
                
                // 2. Wait (Simulate cooldown / ensure cache is cleared)
                if (scanStormDelay > 0) {
                    await new Promise(r => setTimeout(r, scanStormDelay));
                }

                // 3. Read Tag (Forces DLL to scan/resolve tag again)
                const start = performance.now();
                // Pass current alignment to ensure correct DLL API
                await eipService.readTag(session.id, scanStormTag, CipDataType.DINT, alignMode);
                const duration = Math.round(performance.now() - start);
                
                statsRef.current.success++;
                if (i < 5 || i % 5 === 0) {
                    pushLog(`[${i+1}] 扫描耗时: ${duration}ms (清空+等待${scanStormDelay}ms)`, 'info');
                }
            } catch (e: any) {
                statsRef.current.error++;
                pushLog(`[${i+1}] 触发失败: ${e.message}`, 'error');
            }
            
            // Minimal loop yield
            await new Promise(r => setTimeout(r, 10)); 
            i++;
        }

        isRunningRef.current = false;
        setActiveTest(null);
        pushLog(`✅ 缓存震荡结束。执行次数: ${i}`, 'success');
    };

    // --- RENDER HELPERS ---
    const renderCard = (id: string, title: string, desc: string, color: string, Icon: any, configUI: React.ReactNode, action: () => void) => {
        const isActive = activeTest === id;
        const isDisabled = !!activeTest && !isActive;

        return (
            <div className={`bg-white rounded-xl border p-4 shadow-sm transition-all duration-300 relative overflow-hidden group ${isActive ? `border-${color}-500 ring-1 ring-${color}-200` : 'border-slate-200 hover:border-slate-300'}`}>
                {isActive && <div className={`absolute top-0 left-0 w-1 h-full bg-${color}-500 animate-pulse`}></div>}
                
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-${color}-50 text-${color}-600`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700">{title}</h3>
                            <p className="text-[10px] text-slate-400">{desc}</p>
                        </div>
                    </div>
                    {isActive && <Activity className={`w-4 h-4 text-${color}-500 animate-spin`} />}
                </div>

                <div className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-100 text-xs">
                    {configUI}
                </div>

                <button 
                    onClick={isActive ? stopTest : action}
                    disabled={isDisabled}
                    className={`w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${isActive ? 'bg-slate-800 text-white hover:bg-slate-700' : `bg-${color}-600 text-white hover:bg-${color}-700 disabled:opacity-50 disabled:cursor-not-allowed`}`}
                >
                    {isActive ? <Square className="w-3 h-3 fill-current"/> : <Play className="w-3 h-3 fill-current"/>}
                    {isActive ? "停止测试 (STOP)" : "开始测试 (START)"}
                </button>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-slate-100 p-6 gap-6 overflow-hidden">
            {/* Left: Test Cases */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pr-2 scrollbar-thin">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <AlertOctagon className="w-6 h-6 text-red-600" />
                            异常测试 (Chaos Testing)
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            通过模拟网络风暴、畸形请求等极端场景，验证 PLC 通讯的健壮性。
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-100 text-xs font-bold">
                        <ShieldAlert className="w-4 h-4" />
                        请在非生产环境下使用
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-10">
                    
                    {/* 1. Connection Storm */}
                    {renderCard('STORM', '连接风暴 (Connection Storm)', '快速建立并销毁连接，耗尽 TCP 资源。', 'red', Zap, (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">次数 (Count)</label>
                                <input type="number" className="w-full border rounded px-2 py-1 outline-none" value={connStormCount} onChange={e => setConnStormCount(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">间隔 (ms)</label>
                                <input type="number" className="w-full border rounded px-2 py-1 outline-none" value={connStormDelay} onChange={e => setConnStormDelay(Number(e.target.value))} />
                            </div>
                        </div>
                    ), runConnectionStorm)}

                    {/* 2. Tag Fuzzer */}
                    {renderCard('FUZZ', '标签模糊 (Tag Fuzzer)', '发送非法标签名，测试路径解析健壮性。', 'purple', Bug, (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">请求次数 (Reqs)</label>
                                <input type="number" className="w-full border rounded px-2 py-1 outline-none" value={fuzzCount} onChange={e => setFuzzCount(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">间隔 (ms)</label>
                                <input type="number" className="w-full border rounded px-2 py-1 outline-none" value={fuzzDelay} onChange={e => setFuzzDelay(Number(e.target.value))} />
                            </div>
                        </div>
                    ), runTagFuzzer)}

                    {/* 3. Stress Test */}
                    {renderCard('STRESS', '高频压测 (Max Throughput)', '0ms 间隔死循环读取，测算极限 TPS。', 'amber', Activity, (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">循环次数</label>
                                <input type="number" className="w-full border rounded px-2 py-1 outline-none" value={stressCount} onChange={e => setStressCount(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">目标标签</label>
                                <input className="w-full border rounded px-2 py-1 outline-none font-mono text-xs" value={stressTag} onChange={e => setStressTag(e.target.value)} />
                            </div>
                        </div>
                    ), runStressTest)}

                    {/* 4. Cache Thrashing (Scan Storm) */}
                    {renderCard('SCAN_STORM', '缓存震荡 (Cache Thrashing)', '反复重置缓存并读取，强制完整扫描。', 'orange', RefreshCcw, (
                         <div className="flex flex-col gap-2">
                             <div className="grid grid-cols-2 gap-2">
                                 <div>
                                     <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">循环次数 (0=∞)</label>
                                     <input type="number" min="0" className="w-full border rounded px-2 py-1 outline-none" value={scanStormCount} onChange={e => setScanStormCount(Number(e.target.value))} />
                                 </div>
                                 <div>
                                     <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">清空后等待 (ms)</label>
                                     <input type="number" min="0" className="w-full border rounded px-2 py-1 outline-none" value={scanStormDelay} onChange={e => setScanStormDelay(Number(e.target.value))} />
                                 </div>
                             </div>
                             <div>
                                 <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">触发标签 (Trigger)</label>
                                 <input className="w-full border rounded px-2 py-1 outline-none font-mono text-xs" value={scanStormTag} onChange={e => setScanStormTag(e.target.value)} />
                             </div>
                         </div>
                    ), runScanStorm)}

                    {/* 5. Boundary */}
                    {renderCard('BOUNDARY', '越界访问 (Boundary)', '访问超大数组索引，测试内存保护。', 'cyan', Ban, (
                         <div className="p-2 text-center text-slate-400 italic text-xs">
                             此功能集成在模糊测试策略中。
                             <br/>(Coming Soon)
                         </div>
                    ), () => alert("请使用模糊测试 (Tag Fuzzer)，已包含数组越界策略。"))}

                </div>
            </div>

            {/* Right: Console & Stats */}
            <div className="w-96 bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                        <Terminal className="w-4 h-4 text-slate-500" /> 控制台 (Console)
                    </div>
                    <button onClick={resetStats} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-red-500" title="Clear">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
                
                {/* Stats Header */}
                <div className="grid grid-cols-3 border-b border-slate-100 bg-white p-2 text-center shadow-sm z-10">
                    <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Total</div>
                        <div className="text-lg font-mono font-bold text-blue-600">{stats.sent}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">OK</div>
                        <div className="text-lg font-mono font-bold text-emerald-600">{stats.success}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Err</div>
                        <div className={`text-lg font-mono font-bold ${stats.error > 0 ? 'text-red-500' : 'text-slate-300'}`}>{stats.error}</div>
                    </div>
                </div>

                {/* Log Body */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-900 font-mono text-xs">
                    {logs.length === 0 && <div className="text-slate-600 text-center italic mt-10">Ready to start chaos...</div>}
                    {logs.map((log) => (
                        <div key={log.id} className={`flex gap-2 ${
                            log.type === 'error' ? 'text-red-400' : 
                            log.type === 'warn' ? 'text-amber-400' : 
                            log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                        }`}>
                            <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                            <span className="break-all">{log.msg}</span>
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    );
};
