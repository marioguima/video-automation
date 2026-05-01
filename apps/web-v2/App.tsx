
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Editor from './components/Editor';
import Courses from './components/Courses';
import CourseModules from './components/CourseModules';
import CourseEditor from './components/CourseEditor';
import ModuleEditor from './components/ModuleEditor';
import ModuleContainerEditor from './components/ModuleContainerEditor';
import Library from './components/Library';
import UserProfile from './components/UserProfile';
import Billing from './components/Billing';
import Settings from './components/Settings';
import Security from './components/Security';
import HelpCenter from './components/HelpCenter';
import Auth from './components/Auth';
import ImageModal from './components/ImageModal';
import { ViewType, Course, LessonBlock, Module, Theme, Ticket, Notification } from './types';
import { COURSES as INITIAL_COURSES, COURSE_MODULES as INITIAL_MODULES } from './constants';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // App State
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [courseModules, setCourseModules] = useState<Module[]>(INITIAL_MODULES);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonBlock | null>(null);
  const [editingModuleContainer, setEditingModuleContainer] = useState<Module | null>(null);
  
  // Theme State - Defaulting to Navy based on request for premium feel
  const [currentTheme, setCurrentTheme] = useState<Theme>('navy');
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  // Support & Notification State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Reset all classes first
    root.classList.remove('dark', 'theme-navy');

    if (currentTheme === 'light') {
      // Light mode: No specific classes needed (default Tailwind)
    } else if (currentTheme === 'dark') {
      // Standard Slate Dark Mode
      root.classList.add('dark');
    } else if (currentTheme === 'navy') {
      // Premium Navy Dark Mode
      root.classList.add('dark', 'theme-navy');
    }
  }, [currentTheme]);

  // Helper boolean for legacy components that just check isDarkMode
  const isDarkMode = currentTheme !== 'light';

  // Cycling theme function for Header toggle
  const toggleTheme = () => {
    if (currentTheme === 'light') setCurrentTheme('dark');
    else if (currentTheme === 'dark') setCurrentTheme('navy');
    else setCurrentTheme('light');
  };

  // Auth Handlers
  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => setIsAuthenticated(false);

  // Ticket & Notification Handlers
  const handleCreateTicket = (newTicket: Ticket) => {
    setTickets([newTicket, ...tickets]);
    
    // Simulate Support Response after 5 seconds
    setTimeout(() => {
      const responseMsg = {
        id: Math.random().toString(36).substr(2, 9),
        senderId: 'support-agent-1',
        senderName: 'Sarah form Support',
        senderRole: 'support' as const,
        content: `Hello! Thanks for reaching out. We have received your ticket #${newTicket.number} regarding "${newTicket.subject}". An agent will review it shortly.`,
        timestamp: new Date().toISOString()
      };
      
      setTickets(prevTickets => prevTickets.map(t => {
        if (t.id === newTicket.id) {
          return {
            ...t,
            status: 'In Progress',
            lastUpdated: new Date().toISOString(),
            messages: [...t.messages, responseMsg]
          };
        }
        return t;
      }));

      // Add Notification
      const newNotification: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        title: 'New Reply on Ticket',
        message: `Sarah from Support replied to ticket #${newTicket.number}`,
        time: 'Just now',
        read: false,
        type: 'ticket_reply',
        relatedTicketId: newTicket.id
      };
      setNotifications(prev => [newNotification, ...prev]);

    }, 5000);
  };

  const handleUpdateTicket = (ticketId: string, newMessageContent: string) => {
    const userMsg = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: 'user-1',
      senderName: 'John Cena',
      senderRole: 'user' as const,
      content: newMessageContent,
      timestamp: new Date().toISOString()
    };

    setTickets(prev => prev.map(t => 
      t.id === ticketId 
        ? { ...t, messages: [...t.messages, userMsg], lastUpdated: new Date().toISOString(), status: 'Waiting for Reply' }
        : t
    ));

    // Simulate Another Reply
    setTimeout(() => {
        const supportMsg = {
            id: Math.random().toString(36).substr(2, 9),
            senderId: 'support-agent-1',
            senderName: 'Sarah form Support',
            senderRole: 'support' as const,
            content: "Thank you for the additional information. I'm looking into this right now.",
            timestamp: new Date().toISOString()
        };

        setTickets(prev => prev.map(t => 
            t.id === ticketId 
            ? { ...t, messages: [...t.messages, supportMsg], lastUpdated: new Date().toISOString(), status: 'In Progress' }
            : t
        ));

        const ticket = tickets.find(t => t.id === ticketId);
        const newNotification: Notification = {
            id: Math.random().toString(36).substr(2, 9),
            title: 'Support Update',
            message: `New message on ticket #${ticket?.number || 'Unknown'}`,
            time: 'Just now',
            read: false,
            type: 'ticket_reply',
            relatedTicketId: ticketId
        };
        setNotifications(prev => [newNotification, ...prev]);
    }, 4000);
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
    
    // Navigate to ticket
    if (notification.relatedTicketId) {
        setActiveTicketId(notification.relatedTicketId);
        setCurrentView('help');
    }
  };

  const handleCourseSelect = (course: Course) => {
    setSelectedCourse(course);
    setCurrentView('modules');
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setCurrentView('course-editor');
  };

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setCurrentView('course-editor');
  };

  const handleSaveCourse = (courseData: Course) => {
    if (editingCourse) {
      setCourses(courses.map(c => c.id === courseData.id ? courseData : c));
    } else {
      setCourses([courseData, ...courses]);
    }
    setCurrentView('courses');
  };

  const handleDeleteCourse = (id: string) => {
    setCourses(courses.filter(c => c.id !== id));
    setCurrentView('courses');
  };

  const handleAddLesson = () => {
    setEditingLesson(null);
    setCurrentView('module-editor');
  };

  const handleEditLesson = (lesson: LessonBlock) => {
    setEditingLesson(lesson);
    setCurrentView('module-editor');
  };

  const handleAddModuleContainer = () => {
    setEditingModuleContainer(null);
    setCurrentView('module-container-editor');
  };

  const handleEditModuleContainer = (module: Module) => {
    setEditingModuleContainer(module);
    setCurrentView('module-container-editor');
  };

  const handleSaveModuleContainer = (moduleData: Module) => {
    if (courseModules.find(m => m.id === moduleData.id)) {
      setCourseModules(courseModules.map(m => m.id === moduleData.id ? { ...m, title: moduleData.title } : m));
    } else {
      setCourseModules([...courseModules, moduleData]);
    }
    setCurrentView('modules');
  };

  const handleDeleteModuleContainer = (id: string) => {
    setCourseModules(courseModules.filter(m => m.id !== id));
    setCurrentView('modules');
  };

  const handleSaveLesson = (lessonData: LessonBlock) => {
    const updatedModules = courseModules.map(m => ({
      ...m,
      lessons: m.lessons.find(l => l.id === lessonData.id) 
        ? m.lessons.map(l => l.id === lessonData.id ? lessonData : l)
        : m.lessons
    }));
    setCourseModules(updatedModules);
    setCurrentView('modules');
  };

  const handleStartAIGen = (lessonData: LessonBlock) => {
    handleSaveLesson(lessonData);
    setCurrentView('editor');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard setView={setCurrentView} />;
      case 'courses':
        return (
          <Courses 
            courses={courses}
            setView={setCurrentView} 
            onSelectCourse={handleCourseSelect}
            onEditCourse={handleEditCourse}
            onAddCourse={handleAddCourse}
            onImageClick={setActiveImageUrl}
          />
        );
      case 'course-editor':
        return (
          <CourseEditor 
            course={editingCourse} 
            onSave={handleSaveCourse} 
            onCancel={() => setCurrentView('courses')}
            onDelete={handleDeleteCourse}
          />
        );
      case 'modules':
        return (
          <CourseModules 
            course={selectedCourse} 
            modules={courseModules}
            setModules={setCourseModules}
            setView={setCurrentView} 
            onEditLesson={handleEditLesson}
            onEditModule={handleEditModuleContainer}
            onAddModuleContainer={handleAddModuleContainer}
            onImageClick={setActiveImageUrl}
          />
        );
      case 'module-editor':
        return (
          <ModuleEditor 
            module={editingLesson}
            onSave={handleSaveLesson}
            onCancel={() => setCurrentView('modules')}
            onStartAIGen={handleStartAIGen}
          />
        );
      case 'module-container-editor':
        return (
          <ModuleContainerEditor 
            module={editingModuleContainer}
            onSave={handleSaveModuleContainer}
            onCancel={() => setCurrentView('modules')}
            onDelete={handleDeleteModuleContainer}
          />
        );
      case 'editor':
        return <Editor onImageClick={setActiveImageUrl} />;
      case 'library':
        return <Library onImageClick={setActiveImageUrl} />;
      case 'profile':
        return <UserProfile />;
      case 'billing':
        return <Billing />;
      case 'settings':
        return (
          <Settings 
            currentTheme={currentTheme}
            setTheme={setCurrentTheme}
          />
        );
      case 'security':
        return <Security />;
      case 'help':
        return (
          <HelpCenter 
            tickets={tickets}
            onCreateTicket={handleCreateTicket}
            onUpdateTicket={handleUpdateTicket}
            initialActiveTicketId={activeTicketId}
            clearActiveTicket={() => setActiveTicketId(null)}
          />
        );
      default:
        return <Dashboard setView={setCurrentView} />;
    }
  };

  // Auth Flow
  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} />;
  }

  // Main App Flow
  return (
    <div className={`h-screen flex transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Header 
          toggleTheme={toggleTheme} 
          isDarkMode={isDarkMode} 
          currentView={currentView} 
          onAddCourse={handleAddCourse}
          onAddModule={handleAddModuleContainer}
          onAddLesson={handleAddLesson}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
        />
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>

      <ImageModal url={activeImageUrl} onClose={() => setActiveImageUrl(null)} />
    </div>
  );
};

export default App;
