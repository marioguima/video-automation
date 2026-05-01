
import React, { useState } from 'react';
import { 
  ChevronLeft, 
  Play, 
  Clock, 
  CheckCircle2, 
  MoreVertical, 
  Pencil, 
  Plus,
  ChevronDown,
  GripVertical,
  Maximize2
} from 'lucide-react';
import { ViewType, Course, LessonBlock, Module } from '../types';

interface CourseModulesProps {
  course: Course | null;
  modules: Module[];
  setModules: (modules: Module[]) => void;
  setView: (view: ViewType) => void;
  onEditLesson: (lesson: LessonBlock) => void;
  onEditModule?: (module: Module) => void;
  onAddModuleContainer?: () => void;
  onImageClick?: (url: string) => void;
}

const CourseModules: React.FC<CourseModulesProps> = ({ 
  course, 
  modules, 
  setModules, 
  setView, 
  onEditLesson, 
  onEditModule,
  onAddModuleContainer,
  onImageClick
}) => {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({ 'm1': true, 'm2': true });
  const [draggedLesson, setDraggedLesson] = useState<{ moduleId: string, lessonIndex: number } | null>(null);
  const [draggedModuleIndex, setDraggedModuleIndex] = useState<number | null>(null);

  if (!course) return null;

  const toggleModule = (id: string) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const onModuleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedModuleIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onModuleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedModuleIndex === null || draggedModuleIndex === targetIndex) return;

    const newModules = [...modules];
    const [removed] = newModules.splice(draggedModuleIndex, 1);
    newModules.splice(targetIndex, 0, removed);
    
    setModules(newModules);
    setDraggedModuleIndex(null);
  };

  const onLessonDragStart = (e: React.DragEvent, moduleId: string, lessonIndex: number) => {
    e.stopPropagation();
    setDraggedLesson({ moduleId, lessonIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  const onLessonDrop = (e: React.DragEvent, targetModuleId: string, targetLessonIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedLesson) return;

    const newModules = [...modules];
    const sourceModuleIndex = newModules.findIndex(m => m.id === draggedLesson.moduleId);
    const targetModuleIndex = newModules.findIndex(m => m.id === targetModuleId);
    
    if (draggedLesson.moduleId === targetModuleId && draggedLesson.lessonIndex === targetLessonIndex) {
      setDraggedLesson(null);
      return;
    }

    const [removedLesson] = newModules[sourceModuleIndex].lessons.splice(draggedLesson.lessonIndex, 1);
    newModules[targetModuleIndex].lessons.splice(targetLessonIndex, 0, removedLesson);
    
    setModules(newModules);
    setDraggedLesson(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
      <div className="p-8 max-w-5xl mx-auto pb-32">
        <button 
          onClick={() => setView('courses')}
          className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest mb-8 transition-colors"
        >
          <ChevronLeft size={16} />
          Back to Courses
        </button>

        {/* Course Header Info */}
        <div className="flex flex-col md:flex-row gap-8 mb-16">
          <div className="relative group/course w-full md:w-64 h-48 rounded-[5px] overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0 shadow-sm bg-white dark:bg-slate-900">
            <img 
              src={course.thumbnail} 
              alt={course.title} 
              className="w-full h-full object-cover cursor-zoom-in" 
              onClick={() => onImageClick?.(course.thumbnail)}
            />
            <div 
              className="absolute inset-0 bg-black/40 opacity-0 group-hover/course:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              onClick={() => onImageClick?.(course.thumbnail)}
            >
              <Maximize2 className="text-white" size={24} />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-4 leading-tight">{course.title}</h2>
            <div className="flex flex-wrap gap-4 items-center mb-6">
              <span className="px-3 py-1 bg-orange-600/10 text-orange-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-orange-600/20">
                {modules.reduce((acc, m) => acc + m.lessons.length, 0)} Lessons
              </span>
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                <Clock size={14} />
                Total duration: 12h 45m
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-green-500 w-[45%] transition-all duration-500"></div>
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">45% Completed</p>
          </div>
        </div>

        <div className="space-y-12">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Course Content</h3>
          </div>
          
          <div className="space-y-10">
            {modules.map((module, mIdx) => (
              <div 
                key={module.id} 
                className="relative"
                onDragOver={onDragOver}
                onDrop={(e) => onModuleDrop(e, mIdx)}
              >
                {/* Module Header Card */}
                <div 
                  draggable
                  onDragStart={(e) => onModuleDragStart(e, mIdx)}
                  className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between cursor-pointer hover:border-orange-500/30 transition-all group/header shadow-sm z-10 relative ${draggedModuleIndex === mIdx ? 'opacity-50 ring-2 ring-orange-500/20' : ''}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* Grip para o Módulo */}
                    <div className="p-2 -ml-2 text-slate-300 dark:text-slate-700 cursor-grab active:cursor-grabbing hover:text-orange-500 transition-colors">
                      <GripVertical size={20} />
                    </div>

                    <div 
                      onClick={() => toggleModule(module.id)}
                      className="flex items-center gap-4 flex-1"
                    >
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 font-bold text-sm">
                        {mIdx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white group-hover/header:text-orange-600 transition-colors">
                          {module.title}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {module.lessons.length} Lessons • Video Sequence
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 mr-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); if(onEditModule) onEditModule(module); }}
                        className="p-2 text-slate-400 hover:text-orange-600 transition-colors rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Pencil size={18} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-orange-600 transition-colors rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                    <ChevronDown 
                      onClick={(e) => { e.stopPropagation(); toggleModule(module.id); }}
                      size={20} 
                      className={`text-slate-400 transition-transform duration-300 ${expandedModules[module.id] ? 'rotate-180' : ''}`} 
                    />
                  </div>
                </div>

                {/* Lessons Container */}
                <div className={`overflow-hidden transition-all duration-300 ${expandedModules[module.id] ? 'max-h-[2000px] mt-2' : 'max-h-0'}`}>
                  {/* Espinha Vertical Tracejada - Alinhada exatamente abaixo do ícone GripVertical */}
                  <div className="absolute left-[30px] top-[60px] bottom-6 w-[2px] border-l-2 border-dashed border-slate-200 dark:border-slate-800 -z-0"></div>

                  <div className="pl-[30px] space-y-4 pt-4">
                    {module.lessons.map((lesson, idx) => (
                      <div 
                        key={lesson.id}
                        draggable
                        onDragStart={(e) => onLessonDragStart(e, module.id, idx)}
                        onDragOver={onDragOver}
                        onDrop={(e) => onLessonDrop(e, module.id, idx)}
                        className={`group/lesson flex items-center gap-4 p-4 ml-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-orange-500/30 transition-all shadow-sm relative ${draggedLesson?.moduleId === module.id && draggedLesson?.lessonIndex === idx ? 'opacity-40' : ''}`}
                      >
                        {/* Conector Horizontal */}
                        <div className="absolute -left-[24px] top-1/2 -translate-y-1/2 w-[24px] h-[2px] border-t-2 border-dashed border-slate-200 dark:border-slate-800"></div>

                        {/* Grip Handle para Lição */}
                        <div className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-700 group-hover/lesson:text-orange-500 transition-colors">
                          <GripVertical size={16} />
                        </div>

                        <div 
                          onClick={() => setView('editor')}
                          className="w-8 h-8 rounded-md bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-[11px] font-bold text-slate-400 group-hover/lesson:text-orange-600 cursor-pointer"
                        >
                          {mIdx + 1}.{idx + 1}
                        </div>

                        <div 
                          className="relative w-16 h-10 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 shadow-sm border border-slate-200 dark:border-slate-800 cursor-zoom-in"
                          onClick={() => onImageClick?.(lesson.thumbnail)}
                        >
                          <img src={lesson.thumbnail} className="w-full h-full object-cover" />
                        </div>

                        <div onClick={() => setView('editor')} className="flex-1 min-w-0 cursor-pointer">
                          <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate group-hover/lesson:text-orange-600 transition-colors">
                            {lesson.title}
                          </h5>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{lesson.duration}</p>
                        </div>

                        <div className="flex items-center gap-6">
                          {lesson.status === 'Ready' ? (
                            <span className="flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-wider">
                              <CheckCircle2 size={16} />
                              Ready
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-orange-600 text-[10px] font-bold uppercase tracking-wider">
                              <div className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
                              Active
                            </span>
                          )}

                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onEditLesson(lesson); }}
                              className="p-2 text-slate-400 hover:text-orange-600 transition-colors rounded-md"
                            >
                              <Pencil size={18} />
                            </button>
                            <button className="p-2 text-slate-400 hover:text-orange-600 transition-colors rounded-md">
                              <MoreVertical size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Botão de Adicionar Lição */}
                    <div className="relative ml-6">
                      <div className="absolute -left-[24px] top-1/2 -translate-y-1/2 w-[24px] h-[2px] border-t-2 border-dashed border-slate-200 dark:border-slate-800"></div>
                      <button 
                        onClick={() => setView('module-editor')}
                        className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center gap-3 text-[11px] font-bold text-slate-400 hover:text-orange-600 hover:border-orange-500/30 hover:bg-white dark:hover:bg-slate-900 transition-all group"
                      >
                        <Plus size={16} className="group-hover:scale-110 transition-transform" />
                        ADD NEW LESSON TO THIS MODULE
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar Novo Módulo */}
          <button 
            onClick={onAddModuleContainer}
            className="w-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-orange-500/50 hover:bg-orange-50/30 dark:hover:bg-orange-500/5 transition-all group mt-8 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:border-orange-500/20 transition-all">
              <Plus size={28} className="group-hover:text-orange-600" />
            </div>
            <div className="text-center">
              <span className="block text-[12px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 group-hover:text-orange-600 transition-colors">Add New Module Container</span>
              <span className="block text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">Group your lessons by theme or topic</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourseModules;
