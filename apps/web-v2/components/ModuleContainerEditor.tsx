
import React, { useState } from 'react';
import { ChevronLeft, Save, Layout, Trash2 } from 'lucide-react';
import { Module } from '../types';

interface ModuleContainerEditorProps {
  module: Module | null;
  onSave: (module: Module) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

const ModuleContainerEditor: React.FC<ModuleContainerEditorProps> = ({ module, onSave, onCancel, onDelete }) => {
  const [formData, setFormData] = useState<Module>(
    module || {
      id: Math.random().toString(36).substr(2, 9),
      title: '',
      lessons: [],
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 flex items-start justify-center p-8">
      <div className="w-full max-w-2xl py-12">
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-[10px] uppercase tracking-widest mb-8 transition-colors"
        >
          <ChevronLeft size={14} />
          Back to Course Content
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
                  <Layout className="text-orange-600" size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
                    {module ? 'Edit Module Container' : 'New Module Container'}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Define the section or module title.</p>
                </div>
              </div>
              {module && onDelete && (
                <button 
                  type="button"
                  onClick={() => { if(confirm('Delete this module grouping?')) onDelete(module.id); }}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                  title="Delete Module Container"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Module Title
                </label>
                <input 
                  required
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm font-bold outline-none focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all dark:text-white"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g. Module 1: Introduction to Physics"
                />
              </div>

              <div className="flex items-center justify-end gap-4 pt-4">
                <button 
                  type="button"
                  onClick={onCancel}
                  className="px-6 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300 transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex items-center gap-3 bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-xl shadow-orange-600/20 active:scale-95 group"
                >
                  <Save size={18} />
                  <span className="text-sm">Save Module Details</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleContainerEditor;
