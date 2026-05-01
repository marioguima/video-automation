
import React, { useState, useRef, useEffect } from 'react';
import { Search, Sun, Moon, Bell, PlusCircle, MessageSquare } from 'lucide-react';
import { ViewType, Notification } from '../types';

interface HeaderProps {
  toggleTheme: () => void;
  isDarkMode: boolean;
  currentView: ViewType;
  onAddCourse: () => void;
  onAddModule: () => void;
  onAddLesson: () => void;
  notifications?: Notification[];
  onNotificationClick?: (notification: Notification) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  toggleTheme, 
  isDarkMode, 
  currentView, 
  onAddCourse, 
  onAddModule, 
  onAddLesson,
  notifications = [],
  onNotificationClick
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Lógica para definir o texto e a ação do botão baseado no contexto
  const getButtonConfig = () => {
    switch (currentView) {
      case 'modules':
        return { 
          text: 'Create New Module', 
          action: onAddModule 
        };
      case 'editor':
        return { 
          text: 'Create New Lesson', 
          action: onAddLesson 
        };
      case 'module-editor':
        return { 
          text: 'New Lesson', 
          action: onAddLesson 
        };
      default:
        return { 
          text: 'Create New Course', 
          action: onAddCourse 
        };
    }
  };

  const buttonConfig = getButtonConfig();
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 transition-colors duration-300">
      <div className="flex-1 max-w-2xl relative group flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors pointer-events-none" strokeWidth={1.5} />
        <input
          className="w-full pl-12 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-transparent focus:border-orange-500 rounded-[5px] focus:ring-4 focus:ring-orange-500/5 text-sm transition-all outline-none dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
          placeholder="Search lessons, scripts, or assets..."
          type="text"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <button
          onClick={toggleTheme}
          className="p-2.5 text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-slate-800 rounded-[5px] transition-all active:scale-90"
        >
          {isDarkMode ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
        </button>
        
        {/* Notification Dropdown */}
        <div className="relative" ref={notifRef}>
            <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={`relative p-2.5 rounded-[5px] transition-all ${isNotifOpen ? 'bg-orange-50 text-orange-600 dark:bg-slate-800' : 'text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-slate-800'}`}
            >
                <Bell size={20} strokeWidth={1.5} />
                {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse"></span>
                )}
            </button>

            {isNotifOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Notifications</h4>
                        {unreadCount > 0 && (
                            <span className="bg-orange-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount} New</span>
                        )}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <p className="text-sm">No new notifications</p>
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <button 
                                    key={notif.id}
                                    onClick={() => {
                                        if (onNotificationClick) onNotificationClick(notif);
                                        setIsNotifOpen(false);
                                    }}
                                    className={`w-full text-left p-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative group ${!notif.read ? 'bg-orange-50/30 dark:bg-orange-500/5' : ''}`}
                                >
                                    {!notif.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500"></div>}
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 p-1.5 rounded-full ${notif.type === 'ticket_reply' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20' : 'bg-slate-100 text-slate-500'}`}>
                                            {notif.type === 'ticket_reply' ? <MessageSquare size={12} /> : <Bell size={12} />}
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold mb-0.5 ${!notif.read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {notif.title}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                                {notif.message}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-tight">
                                                {notif.time}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-center">
                        <button className="text-[10px] font-bold text-orange-600 hover:text-orange-700 uppercase tracking-widest">
                            Mark all as read
                        </button>
                    </div>
                </div>
            )}
        </div>
        
        <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2"></div>
        
        <button 
          onClick={buttonConfig.action}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-[5px] font-bold flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-orange-500/25 active:scale-95 text-sm shadow-none"
        >
          <PlusCircle size={18} strokeWidth={1.5} />
          <span className="hidden sm:inline">{buttonConfig.text}</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
