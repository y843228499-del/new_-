
import React, { useState } from 'react';
import { Terminal, Send, Download } from 'lucide-react';
import { EipSessionInfo, ConnectionStatus } from '../../types';

interface EipCipConsoleProps {
    session: EipSessionInfo;
}

export const EipCipConsole: React.FC<EipCipConsoleProps> = ({ session }) => {
    const isConnected = session.status === ConnectionStatus.CONNECTED;
    
    // --- CIP 控制台相关状态 ---
    const [serviceCode, setServiceCode] = useState("0x0E");
    const [classCode, setClassCode] = useState("0x01");
    const [instanceId, setInstanceId] = useState("1");
    const [attrId, setAttrId] = useState("");

    const applyPreset = (p: {s: string, c: string, i: string, a: string}) => {
        setServiceCode(p.s); setClassCode(p.c); setInstanceId(p.i); setAttrId(p.a);
    };

    const handleExportCsv = () => {
        if (session.config.logs.length === 0) return;
        let csvContent = "Log\n";
        session.config.logs.forEach(log => {
            csvContent += `"${log.replace(/"/g, '""')}"\n`;
        });
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eip_cip_logs_${new Date().toISOString().replace(/:/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="flex h-full animate-in fade-in">
            <div className="w-80 border-r p-6 bg-slate-50/50 flex flex-col gap-6 overflow-y-auto">
                 <div className="flex items-center gap-2 border-b border-slate-200 pb-2"><Terminal className="w-4 h-4 text-purple-600" /><h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">CIP 显式消息执行器</h3></div>
                 <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">常用对象预设 (Presets)</label>
                        <select onChange={(e) => {
                            const val = e.target.value;
                            if(val==='id') applyPreset({s:'0x01', c:'0x01', i:'1', a:'1'});
                            if(val==='tcp') applyPreset({s:'0x0E', c:'0xF5', i:'1', a:'1'});
                            if(val==='eth') applyPreset({s:'0x0E', c:'0xF6', i:'1', a:'1'});
                        }} className="border rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500">
                            <option value="">-- 手动输入 --</option>
                            <option value="id">Identity (获取设备信息)</option>
                            <option value="tcp">TCP/IP Interface (网络配置)</option>
                            <option value="eth">Ethernet Link (端口状态)</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">服务 (Service)</label><input value={serviceCode} onChange={e => setServiceCode(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                        <div className="flex flex-col gap-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">类 (Class)</label><input value={classCode} onChange={e => setClassCode(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                    </div>
                    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">实例 (Instance)</label><input value={instanceId} onChange={e => setInstanceId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                    <div className="flex flex-col gap-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">属性 (Attribute)</label><input value={attrId} onChange={e => setAttrId(e.target.value)} placeholder="可选" className="border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                 </div>
                 <button onClick={()=>{}} disabled={!isConnected} className="mt-auto py-3 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-purple-700 disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95 transition-all"><Send className="w-4 h-4" /> 执行请求</button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-slate-900 overflow-hidden">
                 <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                     <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">CIP 流量日志记录 (HEX Stream)</span>
                     <button onClick={handleExportCsv} className="text-slate-500 hover:text-white transition-colors" title="导出 CSV">
                         <Download className="w-3.5 h-3.5" />
                     </button>
                 </div>
                 <div className="flex-1 overflow-auto p-4 font-mono text-xs text-indigo-400 space-y-1.5 scrollbar-thin">
                     {session.config.logs.map((log, i) => <div key={i} className="py-1 px-3 bg-white/5 rounded border border-white/5 hover:bg-white/10 transition-colors">{log}</div>)}
                     {session.config.logs.length === 0 && <div className="text-slate-600 italic text-center p-20 select-none">等待 CIP 消息交换...</div>}
                 </div>
            </div>
        </div>
    );
};
