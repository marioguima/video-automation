
import React, { useState, useEffect } from 'react';
import { 
  PlayCircle, 
  Clock, 
  Database, 
  Filter, 
  ArrowUpDown, 
  MoreHorizontal, 
  UploadCloud,
  LayoutGrid,
  List as ListIcon,
  Bookmark,
  BookOpen,
  PieChart as PieChartIcon,
  ArrowRight
} from 'lucide-react';
import { Pie, PieChart, Label, Cell } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { COURSES } from '../constants';
import { ViewType, Course } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface DashboardProps {
  setView: (view: ViewType) => void;
}

const courseTopicData = [
  { topic: "design", count: 40, fill: "var(--color-design)" },
  { topic: "code", count: 30, fill: "var(--color-code)" },
  { topic: "business", count: 20, fill: "var(--color-business)" },
  { topic: "data", count: 10, fill: "var(--color-data)" },
]

const courseTopicConfig = {
  count: { label: "Courses" },
  design: { label: "Design", color: "hsl(24.6 95% 53.1%)" },
  code: { label: "Code", color: "hsl(24.6 95% 43.1%)" },
  business: { label: "Business", color: "hsl(24.6 95% 63.1%)" },
  data: { label: "Data", color: "hsl(24.6 95% 73.1%)" },
} satisfies ChartConfig

const progressConfig = {
  completed: { label: "Completed", color: "hsl(var(--primary))" },
  remaining: { label: "Remaining", color: "hsl(var(--muted))" },
} satisfies ChartConfig

const Dashboard: React.FC<DashboardProps> = ({ setView }) => {
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const fetchRecent = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      setRecentCourses(COURSES); 
      setIsLoading(false);
    };

    fetchRecent();
  }, []);

  const getCategoryColor = (category: string) => {
     const cat = category?.toLowerCase();
     switch(cat) {
        case 'design': return "hsl(24.6 95% 53.1%)";
        case 'code': return "hsl(24.6 95% 43.1%)";
        case 'business': return "hsl(24.6 95% 63.1%)";
        case 'data': return "hsl(24.6 95% 73.1%)";
        case 'science': return "hsl(24.6 95% 33.1%)";
        default: return "hsl(var(--primary))";
     }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="xl:col-span-3 space-y-8">
            
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Courses" value="24" trend="+3" icon={BookOpen} color="indigo" />
              <StatCard title="Total Lessons" value="428" trend="+12%" icon={PlayCircle} color="blue" />
              <StatCard title="Content Hours" value="124.5h" trend="Overall" icon={Clock} color="amber" />
              <StatCard title="Storage Space" value="14.2 GB" trend="82% Used" icon={Database} color="orange" showProgress />
            </div>

            {/* Recent Projects Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold tracking-tight">Recent Projects</h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted p-1 rounded-md mr-2">
                    <Button 
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setViewMode('grid')}
                      className="h-7 w-7"
                    >
                      <LayoutGrid size={16} />
                    </Button>
                    <Button 
                      variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setViewMode('list')}
                      className="h-7 w-7"
                    >
                      <ListIcon size={16} />
                    </Button>
                  </div>
                  
                  <Button variant="ghost" className="hidden sm:flex text-xs font-bold text-primary" onClick={() => setView('courses')}>
                    VIEW ALL
                  </Button>
                  
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Filter size={16} />
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <ArrowUpDown size={16} />
                  </Button>
                </div>
              </div>

              <div className="min-h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64 border border-dashed rounded-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : viewMode === 'list' ? (
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px]">Project Name</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px]">Category</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Lessons</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px]">Duration</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {recentCourses.map((course) => (
                            <tr 
                              key={course.id} 
                              className="hover:bg-muted/50 transition-colors cursor-pointer group"
                              onClick={() => setView('courses')}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-md overflow-hidden bg-muted">
                                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                    <p className="font-semibold">{course.title}</p>
                                    <p className="text-xs text-muted-foreground font-mono">ID: {course.id.toUpperCase()}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Badge variant="secondary" className="text-[10px]">
                                  {course.category || 'General'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="font-semibold text-muted-foreground">{course.lessons}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-muted-foreground">{course.duration || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal size={16} />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentCourses.map((course) => (
                      <Card 
                        key={course.id}
                        className="overflow-hidden cursor-pointer transition-all group flex flex-col"
                        onClick={() => setView('courses')}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden">
                          <img 
                            src={course.thumbnail} 
                            alt={course.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <Badge className="absolute bottom-3 right-3 bg-background/90 text-foreground backdrop-blur-sm shadow-sm hover:bg-background/90">
                            {course.price}
                          </Badge>
                        </div>

                        <CardContent className="p-4 flex-1 flex flex-col justify-start">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-orange-600">
                                {course.category || 'Course'}
                              </p>
                              <h3 className="font-bold leading-tight mb-2 line-clamp-2">
                                {course.title}
                              </h3>
                              <p className="text-xs text-muted-foreground font-medium">
                                {course.lessons} Lessons • {course.duration || 'Flexible'}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-primary">
                              <Bookmark size={18} />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* New Lesson Template Card - Restored Layout */}
              <Card className="bg-primary text-primary-foreground border-none relative overflow-hidden group flex flex-col justify-end min-h-[220px] transition-all hover:-translate-y-1">
                <div className="relative z-10 p-8">
                  <h4 className="text-xl font-bold mb-2">New Lesson Template?</h4>
                  <p className="text-primary-foreground/90 text-sm font-medium leading-relaxed max-w-sm mb-6">
                    Start faster with pre-designed layouts for tutorials, lectures, and sales pitches.
                  </p>
                  <Button className="bg-white text-orange-600 hover:bg-slate-50 dark:bg-white dark:text-orange-600 dark:hover:bg-slate-100 font-bold border-none shadow-md">Explore Templates</Button>
                </div>
              </Card>
              
              <Card className="border-2 border-dashed flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer p-8">
                <div className="w-14 h-14 bg-muted rounded-md flex items-center justify-center mb-4 group-hover:scale-110 transition-all">
                  <UploadCloud size={28} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="font-bold mb-1">Import Script</h4>
                <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">Drag and drop your script here.</p>
                <Button variant="outline" size="sm">Choose File</Button>
              </Card>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="xl:col-span-1 space-y-8">
            
            {/* Course Topic Donut Chart */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                 <h3 className="text-lg font-bold">Course Topic</h3>
                 <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal size={16} />
                 </Button>
              </div>
              <Card className="p-6">
                 <div className="flex flex-col items-center justify-center mb-8 relative">
                   <ChartContainer config={courseTopicConfig} className="mx-auto aspect-square w-full max-h-[200px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={courseTopicData}
                          dataKey="count"
                          nameKey="topic"
                          innerRadius={60}
                          outerRadius={80}
                          strokeWidth={5}
                        >
                          <Label
                            content={({ viewBox }) => {
                              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                return (
                                  <text
                                    x={viewBox.cx}
                                    y={viewBox.cy}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                  >
                                    <tspan
                                      x={viewBox.cx}
                                      y={viewBox.cy}
                                      className="fill-foreground text-3xl font-bold"
                                    >
                                      42
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy || 0) + 24}
                                      className="fill-muted-foreground text-xs font-bold uppercase"
                                    >
                                      Total Course
                                    </tspan>
                                  </text>
                                )
                              }
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-[3px] bg-[hsl(24.6_95%_53.1%)]"></div>
                       <span className="text-xs font-bold text-muted-foreground">Design <span className="text-muted-foreground/60 font-normal">(40%)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-[3px] bg-[hsl(24.6_95%_43.1%)]"></div>
                       <span className="text-xs font-bold text-muted-foreground">Code <span className="text-muted-foreground/60 font-normal">(30%)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-[3px] bg-[hsl(24.6_95%_63.1%)]"></div>
                       <span className="text-xs font-bold text-muted-foreground">Business <span className="text-muted-foreground/60 font-normal">(20%)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-[3px] bg-[hsl(24.6_95%_73.1%)]"></div>
                       <span className="text-xs font-bold text-muted-foreground">Data <span className="text-muted-foreground/60 font-normal">(10%)</span></span>
                    </div>
                 </div>
              </Card>
            </div>

            {/* Continue Creating */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                 <h3 className="text-lg font-bold">Continue Creating</h3>
                 <Button variant="ghost" className="text-xs font-bold text-primary flex items-center gap-1 uppercase tracking-wide px-0 hover:bg-transparent hover:text-primary/80">
                   View All <ArrowRight size={12}/>
                 </Button>
              </div>

              <div className="space-y-4">
                 {recentCourses.slice(0, 3).map((course, idx) => {
                    const progress = [75, 60, 40][idx] || 50; 
                    const ringData = [
                      { name: "completed", value: progress, fill: getCategoryColor(course.category || '') },
                      { name: "remaining", value: 100 - progress, fill: "hsl(var(--muted))" },
                    ];

                    return (
                       <Card key={course.id} onClick={() => setView('courses')} className="p-3 flex items-start gap-4 transition-all cursor-pointer group">
                          <div className="w-16 h-16 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                             <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          </div>

                          <div className="flex-1 min-w-0">
                             <p className="text-[10px] font-bold uppercase tracking-wider mb-1 text-orange-600">
                                {course.category || 'General'}
                             </p>
                             <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                                {course.title}
                             </h4>
                             <p className="text-[10px] font-medium text-muted-foreground mt-1">
                                {course.lessons} / {Math.round(course.lessons * 1.5)} Lessons
                             </p>
                          </div>

                          <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                             <ChartContainer config={progressConfig} className="aspect-square w-full h-full">
                                <PieChart>
                                  <Pie
                                    data={ringData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={18}
                                    outerRadius={24}
                                    startAngle={90}
                                    endAngle={-270}
                                    strokeWidth={0}
                                  >
                                    <Label
                                      content={({ viewBox }) => {
                                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                          return (
                                            <text
                                              x={viewBox.cx}
                                              y={viewBox.cy}
                                              textAnchor="middle"
                                              dominantBaseline="middle"
                                            >
                                              <tspan
                                                x={viewBox.cx}
                                                y={(viewBox.cy || 0) + 1}
                                                className="fill-muted-foreground text-[10px] font-bold"
                                              >
                                                {progress}%
                                              </tspan>
                                            </text>
                                          )
                                        }
                                      }}
                                    />
                                  </Pie>
                                </PieChart>
                             </ChartContainer>
                          </div>
                       </Card>
                    );
                 })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string, value: string, trend: string, icon: any, color: string, showProgress?: boolean }> = ({ title, value, trend, icon: Icon, color, showProgress }) => {
  const colorMap: any = {
    blue: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    orange: 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };

  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 ${colorMap[color]} rounded-md flex items-center justify-center`}>
            <Icon size={24} strokeWidth={1.5} />
          </div>
          <Badge variant="secondary" className={`${trend.includes('+') ? 'text-green-600 bg-green-100 dark:bg-green-500/10' : ''}`}>
            {trend}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{title}</p>
          <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
        </div>
        {showProgress && (
          <div className="w-full h-1.5 bg-muted rounded-full mt-5 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '82%' }}></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Dashboard;
