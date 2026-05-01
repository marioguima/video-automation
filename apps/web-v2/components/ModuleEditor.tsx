
import React, { useState } from 'react';
import { 
  ChevronLeft, 
  Sparkles, 
  FileText, 
  Hash, 
  Layout, 
  Clock, 
  ArrowRight,
  Zap,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { LessonBlock } from '../types';
import AIGenerationOverlay from './AIGenerationOverlay';

interface ModuleEditorProps {
  module: LessonBlock | null;
  onSave: (module: LessonBlock) => void;
  onCancel: () => void;
  onStartAIGen: (module: LessonBlock) => void;
}

const ModuleEditor: React.FC<ModuleEditorProps> = ({ module, onSave, onCancel, onStartAIGen }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<LessonBlock>(
    module || {
      id: Math.random().toString(36).substr(2, 9),
      number: '#' + (Math.floor(Math.random() * 99) + 1).toString().padStart(2, '0'),
      title: '',
      duration: '00:00',
      status: 'Empty',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
      originalText: '',
      narratedText: '',
      onScreenText: { title: '', bullets: [] },
      imagePrompt: { prompt: '', avoid: '', seedText: '', seedNumber: 1234 }
    }
  );

  const handleStartProcess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.originalText) {
      alert("Please fill in the title and the script material.");
      return;
    }
    setIsGenerating(true);
  };

  const handleGenerationComplete = () => {
    onStartAIGen(formData);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 flex items-start justify-center">
      
      {/* Enhanced AI Generation Transition State */}
      <AIGenerationOverlay 
        isActive={isGenerating} 
        totalBlocks={8} 
        onComplete={handleGenerationComplete} 
      />

      <div className="w-full max-w-4xl p-8 py-12">
        {/* Workflow Stepper */}
        <div className="flex items-center justify-center gap-6 mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-orange-600/30 ring-4 ring-orange-500/10">1</div>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-orange-600">Lesson Info</span>
          </div>
          
          <div className="w-16 h-[2px] bg-slate-200 dark:bg-slate-800 rounded-full"></div>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold">2</div>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Block Generation</span>
          </div>
        </div>

        {/* Back Button */}
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-400 hover:text-orange-600 font-bold text-[10px] uppercase tracking-widest mb-6 transition-colors"
        >
          <ChevronLeft size={14} />
          Cancel and return
        </button>

        <form onSubmit={handleStartProcess} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none overflow-hidden transition-colors duration-300">
            
            {/* Form Section: Basic Info */}
            <div className="p-8 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
                  <Layout className="text-orange-600" size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Lesson Registration</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Step 1: Define the core content of your video lesson.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Hash size={12} className="text-orange-600" /> Lesson No.
                  </label>
                  <input 
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-mono outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all dark:text-white"
                    value={formData.number}
                    onChange={e => setFormData({...formData, number: e.target.value})}
                    placeholder="#01"
                  />
                </div>
                <div className="md:col-span-7 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Lesson Title
                  </label>
                  <input 
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-bold outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all dark:text-white"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g. Introduction to Quantum Physics"
                  />
                </div>
                <div className="md:col-span-3 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={12} className="text-orange-600" /> Duration
                  </label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all dark:text-white"
                    value={formData.duration}
                    onChange={e => setFormData({...formData, duration: e.target.value})}
                    placeholder="05:00"
                  />
                </div>

                <div className="md:col-span-12 space-y-2 pt-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <ImageIcon size={12} className="text-orange-600" /> Thumbnail URL
                  </label>
                  <div className="flex gap-4">
                    <input 
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all dark:text-white"
                      value={formData.thumbnail}
                      onChange={e => setFormData({...formData, thumbnail: e.target.value})}
                      placeholder="https://images.unsplash.com/..."
                    />
                    <div className="w-20 h-11 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0 shadow-inner">
                      <img src={formData.thumbnail} className="w-full h-full object-cover" alt="Preview" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Section: The Script */}
            <div className="p-8 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} className="text-orange-600" />
                  Original Source Material (Script)
                </label>
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded text-[9px] font-bold uppercase tracking-tighter">
                  <Zap size={10} fill="currentColor" /> AI Ready
                </div>
              </div>
              <textarea 
                required
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-sm leading-relaxed outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all min-h-[280px] shadow-sm dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600"
                value={formData.originalText}
                onChange={e => setFormData({...formData, originalText: e.target.value})}
                placeholder="Paste your raw lecture content, research paper or script notes here."
              />
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                <CheckCircle2 size={12} className="text-green-500" />
                Your script will be analyzed to generate voiceover and visual assets automatically.
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-4 pt-4">
            <button 
              type="button"
              onClick={onCancel}
              className="px-6 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300 transition-all uppercase tracking-widest"
            >
              Discard Changes
            </button>
            <button 
              type="submit"
              className="flex items-center gap-3 bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-xl shadow-orange-600/20 active:scale-95 group"
            >
              <span className="text-sm">Create & Generate Video Blocks</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModuleEditor;
