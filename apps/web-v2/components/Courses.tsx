
import React, { useState } from 'react';
import { 
  Star, 
  Eye, 
  PlayCircle, 
  Filter, 
  ArrowUpDown, 
  Pencil, 
  LayoutGrid, 
  List,
  ChevronRight,
  ExternalLink,
  Maximize2,
  MoreHorizontal
} from 'lucide-react';
import { ViewType, Course } from '../types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface CoursesProps {
  courses: Course[];
  setView: (view: ViewType) => void;
  onSelectCourse: (course: Course) => void;
  onEditCourse: (course: Course) => void;
  onAddCourse: () => void;
  onImageClick?: (url: string) => void;
}

const Courses: React.FC<CoursesProps> = ({ courses, setView, onSelectCourse, onEditCourse, onImageClick }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-7xl mx-auto pb-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">My Courses</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">Manage your curriculum and student engagement.</p>
          </div>
          
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-[5px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1 mr-2 border-r border-slate-200 dark:border-slate-800 pr-2">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-[3px] transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} strokeWidth={2} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-[3px] transition-all ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
                title="List View"
              >
                <List size={18} strokeWidth={2} />
              </button>
            </div>
            
            <button className="p-1.5 text-slate-400 hover:text-orange-600 transition-all">
              <Filter size={18} strokeWidth={1.5} />
            </button>
            <button className="p-1.5 text-slate-400 hover:text-orange-600 transition-all">
              <ArrowUpDown size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((course) => (
              <div 
                key={course.id} 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[5px] overflow-hidden transition-all duration-300 group relative shadow-sm hover:shadow-md"
              >
                <div className="absolute top-3 right-3 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onImageClick?.(course.thumbnail); }}
                    className="p-2 bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-500 rounded-[5px] transition-all shadow-sm"
                    title="View large thumbnail"
                  >
                    <Maximize2 size={16} strokeWidth={2} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEditCourse(course); }}
                    className="p-2 bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-500 rounded-[5px] transition-all shadow-sm"
                    title="Edit Course"
                  >
                    <Pencil size={16} strokeWidth={2} />
                  </button>
                </div>

                <div onClick={() => onSelectCourse(course)} className="cursor-pointer">
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img 
                      src={course.thumbnail} 
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                      onClick={(e) => { e.stopPropagation(); onImageClick?.(course.thumbnail); }}
                    />
                  </div>

                  <div className="p-5">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-500 uppercase tracking-tighter">
                        <Star size={12} fill="currentColor" strokeWidth={0} />
                        <span>{course.rating} ({course.reviews})</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                        <Eye size={12} strokeWidth={2} />
                        <span>{course.views}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-amber-500 uppercase tracking-tighter">
                        <PlayCircle size={12} strokeWidth={2} />
                        <span>{course.lessons} Lesson</span>
                      </div>
                    </div>

                    <h3 className="font-bold text-slate-800 dark:text-white leading-tight mb-6 line-clamp-2 group-hover:text-orange-600 transition-colors h-10">
                      {course.title}
                    </h3>

                    <div className="h-[1px] w-full bg-slate-100 dark:bg-slate-800 mb-5"></div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img 
                          src={course.instructor.avatar} 
                          alt={course.instructor.name}
                          className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in"
                          onClick={(e) => { e.stopPropagation(); onImageClick?.(course.instructor.avatar); }}
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-white">{course.instructor.name}</p>
                          <p className="text-[10px] font-medium text-amber-500">{course.instructor.role}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter mb-1">
                          {course.students} <span className="text-slate-400">Students</span>
                        </p>
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{course.price}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 dark:bg-slate-900/50">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Course Name</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Category</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-center">Lessons</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Price</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {courses.map((course) => (
                    <tr 
                      key={course.id} 
                      className="hover:bg-muted/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                      onClick={() => onSelectCourse(course)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                            <img 
                              src={course.thumbnail} 
                              alt={course.title} 
                              className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                              onClick={(e) => { e.stopPropagation(); onImageClick?.(course.thumbnail); }}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-orange-600 transition-colors">
                              {course.title}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono uppercase">ID: {course.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-tight">
                          {course.category || 'General'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{course.lessons}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 dark:text-white">{course.price}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-orange-600"
                            onClick={(e) => { e.stopPropagation(); onEditCourse(course); }}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-slate-900 dark:hover:text-white"
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Courses;
