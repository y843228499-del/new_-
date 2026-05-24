
import React from 'react';
import { AlertTriangle, X, Save, Trash2, RotateCcw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ProjectConfirmModalProps {
  isOpen: boolean;
  onChoice: (choice: 'YES' | 'NO' | 'CANCEL') => void;
}

const ProjectConfirmModal: React.FC<ProjectConfirmModalProps> = ({ isOpen, onChoice }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {t.projectConfirm.title}
            </h3>
            <button onClick={() => onChoice('CANCEL')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center text-center gap-4">
            <div className="p-4 bg-amber-50 rounded-full text-amber-600 mb-2">
                <Save className="w-10 h-10" />
            </div>
            <p className="text-slate-600 font-medium leading-relaxed">
                {t.projectConfirm.message}
            </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-3 gap-2">
            <button 
                onClick={() => onChoice('YES')}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm active:scale-95"
            >
                <Save className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase">{t.projectConfirm.yes}</span>
            </button>
            <button 
                onClick={() => onChoice('NO')}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-white border border-slate-200 text-red-600 hover:bg-red-50 rounded-lg transition-all shadow-sm active:scale-95"
            >
                <Trash2 className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase">{t.projectConfirm.no}</span>
            </button>
            <button 
                onClick={() => onChoice('CANCEL')}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-lg transition-all active:scale-95"
            >
                <RotateCcw className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase">{t.projectConfirm.cancel}</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectConfirmModal;
