
import React from 'react';
import { Workflow } from 'lucide-react';
import { EipSessionInfo } from '../../types';

interface EipChassisProps {
    session: EipSessionInfo;
}

export const EipChassis: React.FC<EipChassisProps> = ({ session }) => {
    return (
        <div className="p-10 flex flex-col h-full bg-slate-100 animate-in zoom-in-95 duration-500 overflow-y-auto">
            <div className="mb-8 border-b pb-4">
                <h3 className="font-bold text-xl text-slate-700 flex items-center gap-2"><Workflow className="w-6 h-6 text-emerald-600"/> 机架仿真视图 (Virtual Chassis)</h3>
                <p className="text-sm text-slate-500">模拟 Logix ControlLogix 机架，管理各槽位 I/O 模块及其映射关系。</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-3xl shadow-2xl border-4 border-slate-700 flex gap-4 min-h-[320px] items-stretch overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600">
                 {session.config.chassis.map((mod, i) => (
                     <div key={i} className={`w-24 shrink-0 rounded-xl flex flex-col border-2 transition-all cursor-pointer relative overflow-hidden bg-slate-300 border-slate-400 hover:border-slate-300`}>
                        <div className={`h-8 flex items-center justify-center text-xs font-black bg-slate-400 text-slate-100`}>SLOT {mod.slot}</div>
                        <div className="flex-1 p-2 flex flex-col items-center justify-center gap-2">
                            <div className="text-[10px] font-bold text-slate-600 truncate w-full text-center">{mod.catalog}</div>
                            <div className={`w-3 h-3 rounded-full ${mod.status === 'Running' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-slate-400'}`}></div>
                        </div>
                     </div>
                 ))}
            </div>
        </div>
    );
};
