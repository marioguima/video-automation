
import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Library as LibraryIcon, 
  FolderHeart, 
  BarChart3, 
  HelpCircle, 
  Settings, 
  ChevronDown,
  User,
  CreditCard,
  LogOut,
  Users,
  Shield,
  Bell,
  Zap,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ViewType } from '../types';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@radix-ui/react-avatar';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  onLogout?: () => void;
}

const LogoIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className} 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, onLogout }) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'editor', label: 'Editor', Icon: FileText },
    { id: 'courses', label: 'My Courses', Icon: LibraryIcon },
    { id: 'library', label: 'Library', Icon: FolderHeart },
    { id: 'reports', label: 'Reports', Icon: BarChart3 },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper to generate consistent button classes
  const getButtonClass = (isActive: boolean) => `
    w-full justify-start gap-3 h-12 font-semibold border transition-all duration-200
    ${isCollapsed ? 'justify-center px-0' : ''}
    ${isActive 
      ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 shadow-sm' 
      : 'text-muted-foreground border-transparent hover:bg-slate-100 hover:text-primary dark:hover:bg-primary/5'
    }
  `;

  return (
    <aside 
      className={`
        ${isCollapsed ? 'w-24' : 'w-24 lg:w-72'} 
        border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex flex-col h-screen sticky top-0 transition-all duration-300 z-50 group/sidebar relative
      `}
    >
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-16 z-50 h-6 w-6 rounded-full shadow-sm hidden lg:flex bg-background hover:bg-accent border-slate-200 dark:border-slate-800"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </Button>

      {/* Logo Section */}
      <div className={`flex items-center gap-3 h-20 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}>
        <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20 text-white">
          <LogoIcon className="w-7 h-7" />
        </div>
        <h1 className={`text-xl font-bold tracking-tight text-slate-900 dark:text-white transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 hidden' : 'hidden lg:block'}`}>
          VizLec
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {navItems.map(({ id, label, Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setView(id as ViewType)}
            className={getButtonClass(currentView === id)}
          >
            <Icon 
              size={22} 
              strokeWidth={1.5} 
              className="flex-shrink-0" 
            />
            
            <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 hidden' : 'hidden lg:block truncate'}`}>
              {label}
            </span>
          </Button>
        ))}

        <div className={`pt-8 pb-2 px-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 hidden' : 'hidden lg:block'}`}>
          Support
        </div>
        
        <Button
          variant="ghost"
          onClick={() => setView('help')}
          className={getButtonClass(currentView === 'help')}
        >
          <HelpCircle size={22} strokeWidth={1.5} className="flex-shrink-0" />
          <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 hidden' : 'hidden lg:block'}`}>
            Help Center
          </span>
        </Button>

        <div className={`pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 hidden' : 'hidden lg:block'}`}>
          System
        </div>

        <Button
          variant="ghost"
          onClick={() => setView('settings')}
          className={getButtonClass(currentView === 'settings')}
        >
          <Settings size={22} strokeWidth={1.5} className="flex-shrink-0" />
          <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 hidden' : 'hidden lg:block'}`}>
            Settings
          </span>
        </Button>
      </nav>

      {/* Profile Section */}
      <div className="p-4 relative border-t border-slate-200 dark:border-slate-800" ref={profileMenuRef}>
        {isProfileMenuOpen && (
          <div className="absolute bottom-full left-4 mb-3 w-[280px] bg-popover text-popover-foreground border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 zoom-in-95 duration-200 z-[60]">
             <div className="p-2 border-b">
                <div className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Account</div>
                <div className="space-y-0.5">
                  <DropdownItem icon={User} label="Profile" onClick={() => { setView('profile'); setIsProfileMenuOpen(false); }} shortcut="⌘P" />
                  <DropdownItem icon={CreditCard} label="Billing" onClick={() => { setView('billing'); setIsProfileMenuOpen(false); }} />
                  <DropdownItem icon={Shield} label="Security" onClick={() => { setView('security'); setIsProfileMenuOpen(false); }} shortcut="⌘S" />
                  <DropdownItem icon={Bell} label="Notifications" />
                </div>
             </div>

             <div className="p-2 border-b">
                <div className="bg-muted/50 rounded-lg p-3 border relative overflow-hidden group">
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-1.5">
                       <h4 className="text-sm font-bold flex items-center gap-1.5">
                         <Zap size={14} className="text-primary fill-primary" /> Upgrade to Pro
                       </h4>
                       <span className="text-[10px] bg-foreground text-background px-1.5 py-0.5 rounded font-bold">NEW</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      Get unlimited AI generations, 4K export and priority support.
                    </p>
                    <Button size="sm" className="w-full h-8 text-xs font-bold">
                      Upgrade Now
                    </Button>
                  </div>
                </div>
             </div>

             <div className="p-2 bg-muted/50">
               <div className="flex items-center justify-between group px-2 py-1">
                 <div className="flex items-center gap-3 overflow-hidden">
                    <div className="relative">
                      <img 
                        src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150&auto=format&fit=crop" 
                        className="w-9 h-9 rounded-lg object-cover border"
                        alt="User"
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full"></div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold truncate">John Cena</span>
                      <span className="text-xs text-muted-foreground truncate">john@vizlec.com</span>
                    </div>
                 </div>
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onLogout}>
                    <LogOut size={16} />
                 </Button>
               </div>
             </div>
          </div>
        )}

        <Button
          variant="ghost"
          className={`w-full justify-start p-2 h-auto rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? 'justify-center' : ''}`}
          onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
        >
          <div className="relative flex-shrink-0">
            <img
              alt="User avatar"
              className="w-9 h-9 rounded-lg object-cover shadow-sm"
              src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150&auto=format&fit=crop"
            />
          </div>
          <div className={`flex-1 overflow-hidden text-left ml-3 transition-all duration-200 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'hidden lg:block'}`}>
            <p className="text-sm font-bold truncate text-slate-900 dark:text-white">John Cena</p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Pro Account</p>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 ml-auto transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''} ${isCollapsed ? 'hidden' : 'hidden lg:block'}`} 
          />
        </Button>
      </div>
    </aside>
  );
};

const DropdownItem = ({ icon: Icon, label, shortcut, onClick }: { icon: any, label: string, shortcut?: string, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md group transition-colors"
  >
    <div className="flex items-center gap-2.5">
      <Icon size={16} className="text-muted-foreground group-hover:text-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </div>
    {shortcut && (
      <span className="text-[10px] font-bold text-muted-foreground border px-1.5 py-0.5 rounded bg-muted/50">{shortcut}</span>
    )}
  </button>
);

export default Sidebar;
