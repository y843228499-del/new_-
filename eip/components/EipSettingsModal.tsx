
import React, { useState } from 'react';
import { X, Settings, Globe, Monitor, Zap, Info } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface EipSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EipSettingsModal: React.FC<EipSettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, language, setLanguage } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-slate-700" />
            <h2 className="text-xl font-bold text-slate-800">EIP 全局设置</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="p-8 space-y-8">
            <section>
                <label className="block text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-600" /> 语言选择 (Language)
                </label>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setLanguage('zh')}
                        className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${language === 'zh' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                        简体中文 (推荐)
                    </button>
                    <button 
                        onClick={() => setLanguage('en')}
                        className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${language === 'en' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                        English
                    </button>
                </div>
            </section>

            <section className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">通讯默认值</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">标签扫描周期 (ms)</label>
                        <input type="number" defaultValue={100} className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">通讯超时 (ms)</label>
                        <input type="number" defaultValue={2000} className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white" />
                    </div>
                </div>
            </section>
        </div>

        <div className="p-4 bg-slate-50 border-t flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 shadow-lg">保存并关闭</button>
        </div>
      </div>
    </div>
  );
};
