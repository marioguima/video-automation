
import React, { useState } from 'react';
import { ChevronLeft, Save, Trash2, Image as ImageIcon } from 'lucide-react';
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
      thumbLandscape: '/module-placeholder.svg',
      thumbPortrait: '/module-placeholder-portrait.svg',
      lessons: [],
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest transition-colors h-9"
          >
            <ChevronLeft size={16} />
            Back to course content
          </button>
          {module && onDelete && (
            <button
              onClick={() => { if (confirm('Delete this module grouping?')) onDelete(module.id); }}
              className="flex items-center gap-2 px-3 h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[10px] font-bold text-muted-foreground hover:text-red-600 hover:border-red-500/30 transition-all shadow-sm"
            >
              <Trash2 size={14} className="text-slate-400" />
              Delete Module
            </button>
          )}
        </div>

        <div className="bg-card rounded-[5px] border border-border overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-[hsl(var(--secondary))]/60">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {module ? 'Edit Module' : 'Create New Module'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Define the section or module title.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  Module Title
                </label>
                <input
                  required
                  autoFocus
                  className="w-full border rounded-[5px] focus:ring-2 focus:ring-primary/10 focus:border-primary/40 text-sm font-semibold outline-none transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Module 1: Introduction to Physics"
                />

                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pt-2">
                  <ImageIcon size={14} className="text-orange-600" />
                  Thumbnail 16:9
                </label>
                <input
                  className="w-full border rounded-[5px] focus:ring-2 focus:ring-primary/10 focus:border-primary/40 text-sm outline-none transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                  value={formData.thumbLandscape || ''}
                  onChange={e => setFormData({ ...formData, thumbLandscape: e.target.value })}
                  placeholder="/module-placeholder.svg"
                />

                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pt-2">
                  <ImageIcon size={14} className="text-orange-600" />
                  Thumbnail 9:16
                </label>
                <input
                  className="w-full border rounded-[5px] focus:ring-2 focus:ring-primary/10 focus:border-primary/40 text-sm outline-none transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                  value={formData.thumbPortrait || ''}
                  onChange={e => setFormData({ ...formData, thumbPortrait: e.target.value })}
                  placeholder="/module-placeholder-portrait.svg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="aspect-video rounded-[5px] overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative group">
                  <img
                    src={formData.thumbLandscape || '/module-placeholder.svg'}
                    alt="Module 16:9 preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-bold uppercase tracking-widest">16:9 Preview</span>
                  </div>
                </div>
                <div className="aspect-[9/16] rounded-[5px] overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative group">
                  <img
                    src={formData.thumbPortrait || '/module-placeholder-portrait.svg'}
                    alt="Module 9:16 preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-bold uppercase tracking-widest">9:16 Preview</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center gap-4">
              <button
                type="submit"
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-[5px] flex items-center justify-center gap-3 transition-all active:scale-95 h-9"
              >
                <Save size={18} />
                Save Module
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-6 h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-slate-600 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300 rounded-[5px] transition-all text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ModuleContainerEditor;
