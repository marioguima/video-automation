
import React, { useState } from 'react';
import { ChevronLeft, Save, Trash2, Image as ImageIcon, User, DollarSign, Star } from 'lucide-react';
import { Course } from '../types';

interface CourseEditorProps {
  course: Course | null;
  onSave: (course: Course) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

const CourseEditor: React.FC<CourseEditorProps> = ({ course, onSave, onCancel, onDelete }) => {
  const [formData, setFormData] = useState<Course>(
    course || {
      id: Math.random().toString(36).substr(2, 9),
      title: '',
      thumbnail: 'https://images.unsplash.com/photo-1547658719-da2b51169166?q=80&w=800&auto=format&fit=crop',
      rating: 5.0,
      reviews: 0,
      views: '0',
      lessons: 0,
      instructor: {
        name: '',
        role: '',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop',
      },
      students: '0',
      price: '$0',
      oldPrice: '',
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
            className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest transition-colors"
          >
            <ChevronLeft size={16} />
            Back to list
          </button>
          {course && (
            <button 
              onClick={() => { if(confirm('Delete course?')) onDelete(course.id); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-red-600 hover:border-red-500/30 transition-all shadow-sm"
            >
              <Trash2 size={14} className="text-slate-400" />
              Delete Course
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[5px] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {course ? 'Edit Course' : 'Create New Course'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Fill in the details for your course metadata.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {/* Main Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  Course Title
                </label>
                <input 
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 p-3 text-slate-800 dark:text-slate-100 text-sm outline-none transition-all"
                  placeholder="Ex: Advanced Typography..."
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />

                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pt-2">
                  <ImageIcon size={14} className="text-orange-600" />
                  Thumbnail URL
                </label>
                <input 
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 p-3 text-slate-800 dark:text-slate-100 text-sm outline-none transition-all"
                  placeholder="https://images.unsplash.com..."
                  value={formData.thumbnail}
                  onChange={e => setFormData({...formData, thumbnail: e.target.value})}
                />
              </div>

              <div className="aspect-video rounded-[5px] overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative group">
                <img src={formData.thumbnail} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-bold uppercase tracking-widest">Thumbnail Preview</span>
                </div>
              </div>
            </div>

            <div className="h-[1px] w-full bg-slate-100 dark:bg-slate-800"></div>

            {/* Instructor & Pricing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <User size={16} className="text-cyan-500" />
                  Instructor Details
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <input 
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                    placeholder="Full Name"
                    value={formData.instructor.name}
                    onChange={e => setFormData({...formData, instructor: {...formData.instructor, name: e.target.value}})}
                  />
                  <input 
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                    placeholder="Role (e.g. Lead Developer)"
                    value={formData.instructor.role}
                    onChange={e => setFormData({...formData, instructor: {...formData.instructor, role: e.target.value}})}
                  />
                  <input 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                    placeholder="Avatar URL"
                    value={formData.instructor.avatar}
                    onChange={e => setFormData({...formData, instructor: {...formData.instructor, avatar: e.target.value}})}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <DollarSign size={16} className="text-amber-500" />
                  Pricing & Stats
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price</span>
                    <input 
                      required
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                      placeholder="$100"
                      value={formData.price}
                      onChange={e => setFormData({...formData, price: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Old Price</span>
                    <input 
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                      placeholder="200"
                      value={formData.oldPrice}
                      onChange={e => setFormData({...formData, oldPrice: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initial Lessons</span>
                    <input 
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                      value={formData.lessons}
                      onChange={e => setFormData({...formData, lessons: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rating</span>
                    <div className="flex items-center gap-2">
                      <Star size={14} className="text-cyan-500" fill="currentColor" />
                      <input 
                        type="number"
                        step="0.1"
                        max="5"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] focus:ring-2 focus:ring-orange-500/20 p-3 text-sm outline-none"
                        value={formData.rating}
                        onChange={e => setFormData({...formData, rating: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 flex gap-4">
              <button 
                type="submit"
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-[5px] flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Save size={20} />
                Save Course
              </button>
              <button 
                type="button"
                onClick={onCancel}
                className="px-8 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-[5px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
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

export default CourseEditor;
