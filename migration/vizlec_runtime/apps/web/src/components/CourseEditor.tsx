import React, { useState } from 'react';
import { ChevronLeft, Save, Trash2 } from 'lucide-react';
import { Course } from '../types';
import ConfirmDialog from './ui/confirm-dialog';

interface CourseEditorProps {
  course: Course | null;
  onSave: (course: Course) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

const HOTMART_PRODUCT_LANGUAGES = [
  { value: 'PT_BR', label: 'Português (Brasil)' },
  { value: 'ES', label: 'Español' },
  { value: 'EN', label: 'English' },
  { value: 'FR', label: 'Français' },
  { value: 'PT_PT', label: 'Português (Portugal)' },
  { value: 'RU', label: 'Русский' },
  { value: 'AR', label: 'العربية' },
  { value: 'DE', label: 'Deutsch' },
  { value: 'JA', label: '日本語' },
  { value: 'IT', label: 'Italiano' }
];

const KIWIFY_EMAIL_LANGUAGES = [
  { value: 'PT', label: 'Português' },
  { value: 'EN', label: 'English' },
  { value: 'ES', label: 'Espanhol' }
];

const PRODUCT_CATEGORIES = [
  { value: '', label: 'Selecione uma categoria' },
  { value: 'HEALTH_SPORTS', label: 'Saúde e Esportes' },
  { value: 'FINANCE_INVESTMENTS', label: 'Finanças e Investimentos' },
  { value: 'RELATIONSHIPS', label: 'Relacionamentos' },
  { value: 'BUSINESS_CAREER', label: 'Negócios e Carreira' },
  { value: 'SPIRITUALITY', label: 'Espiritualidade' },
  { value: 'SEXUALITY', label: 'Sexualidade' },
  { value: 'ENTERTAINMENT', label: 'Entretenimento' },
  { value: 'COOKING_GASTRONOMY', label: 'Culinária e Gastronomia' },
  { value: 'LANGUAGES', label: 'Idiomas' },
  { value: 'LAW', label: 'Direito' },
  { value: 'APPS_SOFTWARE', label: 'Apps & Software' },
  { value: 'LITERATURE', label: 'Literatura' },
  { value: 'HOME_CONSTRUCTION', label: 'Casa e Construção' },
  { value: 'PERSONAL_DEVELOPMENT', label: 'Desenvolvimento Pessoal' },
  { value: 'FASHION_BEAUTY', label: 'Moda e Beleza' },
  { value: 'ANIMALS_PLANTS', label: 'Animais e Plantas' },
  { value: 'EDUCATIONAL', label: 'Educacional' },
  { value: 'HOBBIES', label: 'Hobbies' },
  { value: 'DESIGN', label: 'Design' },
  { value: 'INTERNET', label: 'Internet' },
  { value: 'ECOLOGY_ENVIRONMENT', label: 'Ecologia e Meio Ambiente' },
  { value: 'MUSIC_ARTS', label: 'Música e Artes' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Tecnologia da Informação' },
  { value: 'DIGITAL_ENTREPRENEURSHIP', label: 'Empreendedorismo Digital' },
  { value: 'OTHERS', label: 'Outros' }
];

const DEFAULT_COURSE: Course = {
  id: Math.random().toString(36).slice(2, 11),
  title: '',
  description: '',
  categoryId: '',
  productLanguage: 'PT_BR',
  emailLanguage: 'PT',
  primarySalesCountry: 'BR',
  salesPageUrl: '',
  imageAssetId: '',
  status: 'draft',
  thumbnail: '/course-placeholder.svg',
  thumbLandscape: '/course-placeholder.svg',
  thumbPortrait: '/course-placeholder-portrait.svg',
  rating: 0,
  reviews: 0,
  views: '0',
  lessons: 0,
  moduleCount: 0,
  instructor: {
    name: 'Instructor',
    role: 'Creator',
    avatar: '/avatar-placeholder.svg'
  },
  students: '0',
  price: '$0',
  oldPrice: ''
};

const CourseEditor: React.FC<CourseEditorProps> = ({ course, onSave, onCancel, onDelete }) => {
  const [formData, setFormData] = useState<Course>(course ?? DEFAULT_COURSE);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
            Back to list
          </button>
          {course && (
            <button
              onClick={() => {
                setIsDeleteDialogOpen(true);
              }}
              className="flex items-center gap-2 px-3 h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[10px] font-bold text-muted-foreground hover:text-red-600 hover:border-red-500/30 transition-all shadow-sm"
            >
              <Trash2 size={14} className="text-slate-400" />
              Delete Course
            </button>
          )}
        </div>

        <div className="bg-card rounded-[5px] border border-border overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-[hsl(var(--secondary))]/60">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {course ? 'Edit Course' : 'Create New Course'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Phase 1 commercial fields for product registration.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Name</label>
              <input
                required
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Ex.: VizLec Pro"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
              <textarea
                value={formData.description ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                maxLength={2000}
                rows={4}
                className="w-full border rounded-[5px] px-3 py-2 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Describe your course/product."
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category ID</label>
              <select
                value={formData.categoryId ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
              >
                {PRODUCT_CATEGORIES.map((item) => (
                  <option key={item.value || 'placeholder'} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
              <select
                value={formData.status ?? 'draft'}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as Course['status']
                  }))
                }
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Language</label>
              <select
                value={formData.productLanguage ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, productLanguage: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
              >
                {HOTMART_PRODUCT_LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Language (Kiwify)</label>
              <select
                value={formData.emailLanguage ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, emailLanguage: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
              >
                {KIWIFY_EMAIL_LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Primary Sales Country</label>
              <input
                value={formData.primarySalesCountry ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, primarySalesCountry: e.target.value.toUpperCase() }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Ex.: BR"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sales Page URL</label>
              <input
                type="url"
                value={formData.salesPageUrl ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, salesPageUrl: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="https://example.com/sales-page"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Image Asset ID</label>
              <input
                value={formData.imageAssetId ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, imageAssetId: e.target.value }))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="asset_..."
              />
            </div>

            <div className="md:col-span-2 pt-3 flex gap-4">
              <button
                type="submit"
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-[5px] flex items-center justify-center gap-3 transition-all active:scale-95 h-9"
              >
                <Save size={18} />
                Save Course
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-8 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-[5px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all h-9"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Delete course?"
        description={`This will permanently delete "${course?.title ?? 'this course'}" in cascade, including all modules, all lessons, generated assets, generated files, and empty folders left after cleanup. This cannot be undone.`}
        confirmLabel="Delete course"
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (!course) return;
          setIsDeleteDialogOpen(false);
          onDelete(course.id);
        }}
      />
    </div>
  );
};

export default CourseEditor;
