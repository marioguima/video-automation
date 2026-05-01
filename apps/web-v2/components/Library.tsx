
import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Headphones, 
  Video, 
  ChevronRight, 
  Search, 
  MoreVertical, 
  Download, 
  ExternalLink,
  ArrowLeft,
  Grid,
  List as ListIcon,
  Filter,
  Calendar,
  Maximize2
} from 'lucide-react';
import { COURSES, COURSE_MODULES } from '../constants';
import { Course, Module, LessonBlock } from '../types';

type NavigationDepth = 'courses' | 'modules' | 'lessons' | 'files';

interface BreadcrumbItem {
  id: string;
  label: string;
  depth: NavigationDepth;
}

interface LibraryProps {
  onImageClick?: (url: string) => void;
}

const Library: React.FC<LibraryProps> = ({ onImageClick }) => {
  const [depth, setDepth] = useState<NavigationDepth>('courses');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'audio' | 'video'>('all');

  // Seleções atuais
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<LessonBlock | null>(null);

  // Navegação
  const navigateTo = (item: any, nextDepth: NavigationDepth) => {
    if (nextDepth === 'modules') {
      setSelectedCourse(item);
      setBreadcrumbs([{ id: item.id, label: item.title, depth: 'courses' }]);
    } else if (nextDepth === 'lessons') {
      setSelectedModule(item);
      setBreadcrumbs(prev => [...prev, { id: item.id, label: item.title, depth: 'modules' }]);
    } else if (nextDepth === 'files') {
      setSelectedLesson(item);
      setBreadcrumbs(prev => [...prev, { id: item.id, label: item.title, depth: 'lessons' }]);
    }
    setDepth(nextDepth);
  };

  const jumpToBreadcrumb = (index: number) => {
    const item = breadcrumbs[index];
    if (!item) {
      setDepth('courses');
      setBreadcrumbs([]);
      return;
    }
    
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    
    if (item.depth === 'courses') setDepth('modules');
    else if (item.depth === 'modules') setDepth('lessons');
    else if (item.depth === 'lessons') setDepth('files');
  };

  const goBack = () => {
    if (depth === 'files') setDepth('lessons');
    else if (depth === 'lessons') setDepth('modules');
    else if (depth === 'modules') setDepth('courses');
    
    setBreadcrumbs(prev => prev.slice(0, -1));
  };

  // Simulação de arquivos dentro de uma lição
  const getLessonFiles = (lesson: LessonBlock) => {
    return [
      { id: 'f1', name: 'Raw_Asset.png', type: 'image', size: '1.2 MB', date: '2 mins ago', url: lesson.thumbnail },
      { id: 'f2', name: 'Narration_V1.mp3', type: 'audio', size: '2.4 MB', date: '5 mins ago', url: '#' },
      { id: 'f3', name: 'Final_Render.mp4', type: 'video', size: '18.5 MB', date: '10 mins ago', url: '#' },
      { id: 'f4', name: 'Script_Draft.pdf', type: 'document', size: '45 KB', date: '1 hour ago', url: '#' },
    ].filter(f => filterType === 'all' || f.type === filterType);
  };

  const renderContent = () => {
    const filteredSearch = searchQuery.toLowerCase();

    if (depth === 'courses') {
      return (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-2"}>
          {COURSES.filter(c => c.title.toLowerCase().includes(filteredSearch)).map(course => (
            <FolderCard 
              key={course.id} 
              title={course.title} 
              subtitle={`${course.lessons} Lessons`} 
              viewMode={viewMode}
              onClick={() => navigateTo(course, 'modules')}
            />
          ))}
        </div>
      );
    }

    if (depth === 'modules') {
      return (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-2"}>
          {COURSE_MODULES.filter(m => m.title.toLowerCase().includes(filteredSearch)).map(module => (
            <FolderCard 
              key={module.id} 
              title={module.title} 
              subtitle={`${module.lessons.length} Lessons`} 
              viewMode={viewMode}
              onClick={() => navigateTo(module, 'lessons')}
            />
          ))}
        </div>
      );
    }

    if (depth === 'lessons') {
      const lessons = selectedModule?.lessons || [];
      return (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-2"}>
          {lessons.filter(l => l.title.toLowerCase().includes(filteredSearch)).map(lesson => (
            <FolderCard 
              key={lesson.id} 
              title={lesson.title} 
              subtitle={lesson.duration} 
              viewMode={viewMode}
              thumbnail={lesson.thumbnail}
              onClick={() => navigateTo(lesson, 'files')}
              onThumbnailClick={() => onImageClick?.(lesson.thumbnail)}
            />
          ))}
        </div>
      );
    }

    if (depth === 'files' && selectedLesson) {
      const files = getLessonFiles(selectedLesson);
      return (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-2"}>
          {files.filter(f => f.name.toLowerCase().includes(filteredSearch)).map(file => (
            <FileCard key={file.id} file={file} viewMode={viewMode} onImageClick={onImageClick} />
          ))}
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Library Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Library Manager</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Browse and manage generated assets across your courses.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" size={16} />
                <input 
                  type="text"
                  placeholder="Search files..."
                  className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-orange-500 rounded-lg text-sm outline-none w-64 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-400'}`}
                >
                  <Grid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-400'}`}
                >
                  <ListIcon size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Breadcrumbs Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button 
              onClick={() => jumpToBreadcrumb(-1)}
              className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-orange-600 transition-colors uppercase tracking-widest whitespace-nowrap"
            >
              Root
            </button>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight size={14} className="text-slate-300" />
                <button 
                  onClick={() => jumpToBreadcrumb(idx)}
                  className={`text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                    idx === breadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-400 hover:text-orange-600'
                  }`}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="max-w-7xl w-full mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {depth !== 'courses' && (
            <button 
              onClick={goBack}
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-orange-600 transition-colors font-bold text-xs uppercase tracking-widest"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">Filter:</span>
            <FilterButton active={filterType === 'all'} label="All" onClick={() => setFilterType('all')} />
            <FilterButton active={filterType === 'image'} label="Images" onClick={() => setFilterType('image')} />
            <FilterButton active={filterType === 'audio'} label="Audio" onClick={() => setFilterType('audio')} />
            <FilterButton active={filterType === 'video'} label="Video" onClick={() => setFilterType('video')} />
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Calendar size={14} />
          Sorted by Date
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto pb-24">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Componente Interno: Pasta
const FolderCard: React.FC<{ 
  title: string; 
  subtitle: string; 
  onClick: () => void; 
  viewMode: 'grid' | 'list';
  thumbnail?: string;
  onThumbnailClick?: () => void;
}> = ({ title, subtitle, onClick, viewMode, thumbnail, onThumbnailClick }) => {
  if (viewMode === 'list') {
    return (
      <div 
        onClick={onClick}
        className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-orange-500/50 transition-all cursor-pointer group"
      >
        <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-600">
          <Folder size={20} fill="currentColor" fillOpacity={0.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate group-hover:text-orange-600">{title}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>
        </div>
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    );
  }

  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-orange-500/50 hover:shadow-lg transition-all cursor-pointer group text-center flex flex-col items-center"
    >
      <div 
        className="w-20 h-20 mb-4 bg-orange-50 dark:bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform relative overflow-hidden cursor-zoom-in"
        onClick={(e) => {
          if (thumbnail) {
            e.stopPropagation();
            onThumbnailClick?.();
          }
        }}
      >
        {thumbnail ? (
          <img src={thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
        ) : (
          <Folder size={40} fill="currentColor" fillOpacity={0.2} />
        )}
      </div>
      <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-orange-600 transition-colors line-clamp-1">{title}</h4>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>
    </div>
  );
};

// Componente Interno: Arquivo
const FileCard: React.FC<{ file: any; viewMode: 'grid' | 'list', onImageClick?: (url: string) => void }> = ({ file, viewMode, onImageClick }) => {
  const getIcon = () => {
    switch (file.type) {
      case 'image': return <ImageIcon size={20} />;
      case 'audio': return <Headphones size={20} />;
      case 'video': return <Video size={20} />;
      default: return <FileText size={20} />;
    }
  };

  const getColor = () => {
    switch (file.type) {
      case 'image': return 'text-cyan-500 bg-cyan-500/10';
      case 'audio': return 'text-indigo-500 bg-indigo-500/10';
      case 'video': return 'text-orange-500 bg-orange-500/10';
      default: return 'text-slate-500 bg-slate-500/10';
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-orange-500/50 transition-all group">
        <div 
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColor()} ${file.type === 'image' ? 'cursor-zoom-in' : ''}`}
          onClick={() => file.type === 'image' && onImageClick?.(file.url)}
        >
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            <span>{file.size}</span>
            <span>•</span>
            <span>{file.date}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {file.type === 'image' && (
            <button 
              onClick={() => onImageClick?.(file.url)}
              className="p-2 text-slate-400 hover:text-orange-600 transition-colors"
            >
              <Maximize2 size={16} />
            </button>
          )}
          <button className="p-2 text-slate-400 hover:text-orange-600 transition-colors"><Download size={16} /></button>
          <button className="p-2 text-slate-400 hover:text-orange-600 transition-colors"><MoreVertical size={16} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-orange-500/50 hover:shadow-lg transition-all group">
      <div 
        className="aspect-video relative bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden cursor-zoom-in"
        onClick={() => file.type === 'image' && onImageClick?.(file.url)}
      >
        {file.type === 'image' ? (
          <img src={file.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className={getColor() + " p-4 rounded-full"}>
            {/* Fix: Cast to ReactElement<any> to allow 'size' property in cloneElement */}
            {React.cloneElement(getIcon() as React.ReactElement<any>, { size: 32 })}
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          {file.type === 'image' && (
            <button 
              onClick={(e) => { e.stopPropagation(); onImageClick?.(file.url); }}
              className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center hover:bg-orange-600 hover:text-white transition-all"
            >
              <Maximize2 size={18} />
            </button>
          )}
          <button className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center hover:bg-orange-600 hover:text-white transition-all">
            <Download size={18} />
          </button>
          <button className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center hover:bg-orange-600 hover:text-white transition-all">
            <ExternalLink size={18} />
          </button>
        </div>
      </div>
      <div className="p-4">
        <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate mb-1">{file.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{file.size}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{file.date}</span>
        </div>
      </div>
    </div>
  );
};

const FilterButton: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
      active 
        ? 'bg-orange-600 text-white shadow-sm' 
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-orange-600 dark:text-slate-400'
    }`}
  >
    {label}
  </button>
);

export default Library;
