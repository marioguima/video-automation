
import React, { useState, useRef, useEffect } from 'react';
import { Search, Sun, Moon, Bell, PlusCircle, MessageSquare } from 'lucide-react';
import { ViewType, Notification } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface HeaderProps {
  toggleTheme: () => void;
  isDarkMode: boolean;
  currentView: ViewType;
  onAddCourse: () => void;
  onAddModule: () => void;
  onAddLesson: () => void;
  notifications?: Notification[];
  onNotificationClick?: (notification: Notification) => void;
  onMarkAllRead?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  toggleTheme, 
  isDarkMode, 
  currentView, 
  onAddCourse, 
  onAddModule, 
  onAddLesson,
  notifications = [],
  onNotificationClick,
  onMarkAllRead
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
          text: 'Create New Section', 
          action: onAddModule 
        };
      case 'editor':
        return { 
          text: 'Create New Video', 
          action: onAddLesson 
        };
      case 'module-editor':
        return { 
          text: 'New Video', 
          action: onAddLesson 
        };
      default:
        return { 
          text: 'Create New Channel', 
          action: onAddCourse 
        };
    }
  };

  const buttonConfig = getButtonConfig();
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="h-16 bg-[hsl(var(--header))]/90 text-[hsl(var(--header-foreground))] backdrop-blur-md sticky top-0 z-50 border-b border-[hsl(var(--header-border))] flex items-center justify-between px-8 transition-colors duration-300">
      <div className="flex-1 max-w-2xl relative group flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" strokeWidth={1.5} />
        <Input
          className="w-full h-8 pl-12 pr-4 bg-[hsl(var(--header-input))] border border-[hsl(var(--header-input-border))] focus:border-primary/40 rounded-[5px] focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Search videos, scripts, or assets..."
          type="text"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-[5px] text-muted-foreground hover:text-primary hover:bg-accent"
        >
          {isDarkMode ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
        </Button>
        
        {/* Notification Dropdown */}
        <div className="relative" ref={notifRef}>
            <Button 
                variant="ghost"
                size="icon"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={`relative rounded-[5px] transition-all ${isNotifOpen ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-primary hover:bg-accent'}`}
            >
                <Bell size={20} strokeWidth={1.5} />
                {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-background rounded-full animate-pulse"></span>
                )}
            </Button>

            {isNotifOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-border flex justify-between items-center bg-muted/40">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notifications</h4>
                        {unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount} New</span>
                        )}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
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
                                    className={`w-full text-left p-4 border-b border-border hover:bg-accent transition-colors relative group ${!notif.read ? 'bg-primary/5' : ''}`}
                                >
                                    {!notif.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500"></div>}
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 p-1.5 rounded-full ${notif.type === 'ticket_reply' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20' : 'bg-muted text-muted-foreground'}`}>
                                            {notif.type === 'ticket_reply' ? <MessageSquare size={12} /> : <Bell size={12} />}
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold mb-0.5 ${!notif.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {notif.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground leading-relaxed whitespace-normal break-words">
                                                {notif.message}
                                            </p>
                                            <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-tight">
                                                {new Date(notif.time).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    <div className="p-2 bg-muted/40 border-t border-border text-center">
                        <button
                          onClick={() => onMarkAllRead?.()}
                          className="text-[10px] font-bold text-orange-600 hover:text-orange-700 uppercase tracking-widest h-9"
                        >
                            Mark all as read
                        </button>
                    </div>
                </div>
            )}
        </div>
        
        <div className="h-8 w-[1px] bg-border mx-2"></div>
        
        <Button
          onClick={buttonConfig.action}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 h-8 rounded-[5px] font-bold flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-95 text-sm shadow-none"
        >
          <PlusCircle size={18} strokeWidth={1.5} />
          <span className="hidden sm:inline">{buttonConfig.text}</span>
        </Button>
      </div>
    </header>
  );
};

export default Header;
