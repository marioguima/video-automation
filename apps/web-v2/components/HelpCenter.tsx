
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  MessageSquare, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Send, 
  Paperclip, 
  User, 
  Zap, 
  HelpCircle, 
  FileText,
  PlayCircle,
  Pause,
  Play,
  XCircle,
  ShieldCheck,
  Layout,
  Maximize,
  Minimize,
  PanelLeft,
  Columns,
  BoxSelect
} from 'lucide-react';
import { Ticket, TicketStatus } from '../types';

interface HelpCenterProps {
  tickets: Ticket[];
  onCreateTicket: (ticket: Ticket) => void;
  onUpdateTicket: (ticketId: string, message: string) => void;
  initialActiveTicketId: string | null;
  clearActiveTicket: () => void;
}

// Layout Modes
type LayoutMode = 'full-width' | 'full-width-center' | 'center';

// Data Structures for FAQ
interface HelpBlock {
  id: string;
  type: 'title' | 'paragraph';
  text: string;
}

interface HelpTopic {
  id: string;
  title: string;
  content: HelpBlock[];
}

interface HelpCategory {
  id: string;
  title: string;
  icon: any;
  topics: HelpTopic[];
}

const HELP_DATA: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Zap,
    topics: [
      {
        id: 'welcome',
        title: 'Welcome to VizLec',
        content: [
          { id: 'b1', type: 'title', text: 'Introduction to VizLec Platform' },
          { id: 'b2', type: 'paragraph', text: 'VizLec is an AI-powered video creation platform designed for educators and content creators. It streamlines the process of converting scripts into engaging video lessons.' },
          { id: 'b3', type: 'paragraph', text: 'In this section, we will guide you through the initial setup, understanding the dashboard, and creating your very first project from scratch.' }
        ]
      },
      {
        id: 'account-setup',
        title: 'Setting up your account',
        content: [
          { id: 'b4', type: 'title', text: 'Completing your Profile' },
          { id: 'b5', type: 'paragraph', text: 'To get the most out of VizLec, ensure your profile is 100% complete. Navigate to the Settings tab to update your personal information and preferences.' }
        ]
      }
    ]
  },
  {
    id: 'editor',
    title: 'Using the Editor',
    icon: Layout,
    topics: [
      {
        id: 'blocks',
        title: 'Understanding Blocks',
        content: [
          { id: 'b6', type: 'title', text: 'The Logic of Lesson Blocks' },
          { id: 'b7', type: 'paragraph', text: 'A lesson in VizLec is composed of multiple "blocks". Each block represents a distinct segment of your video, containing script, audio, visual assets, and on-screen text.' },
          { id: 'b8', type: 'paragraph', text: 'You can drag and drop these blocks to reorder the flow of your narrative. The AI engine processes each block independently before stitching them into a final video.' }
        ]
      },
      {
        id: 'ai-generation',
        title: 'AI Generation Features',
        content: [
          { id: 'b9', type: 'title', text: 'Generating Visuals and Audio' },
          { id: 'b10', type: 'paragraph', text: 'VizLec uses advanced generative models. For audio, simply type your script and select a voice. For visuals, describe the scene in the prompt box, and the AI will create a unique image asset.' }
        ]
      }
    ]
  },
  {
    id: 'security',
    title: 'Security & Privacy',
    icon: ShieldCheck,
    topics: [
      {
        id: '2fa',
        title: 'Two-Factor Authentication',
        content: [
          { id: 'b11', type: 'title', text: 'Securing your Account' },
          { id: 'b12', type: 'paragraph', text: 'We strongly recommend enabling 2FA. This adds an extra layer of security by requiring a code from your mobile device when logging in.' }
        ]
      }
    ]
  }
];

const StatusBadge = ({ status }: { status: TicketStatus }) => {
  const styles = {
    'Open': 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    'Resolved': 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    'Waiting for Reply': 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400'
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
};

const AudioBlock: React.FC<{ 
  block: HelpBlock; 
  isPlaying: boolean; 
  isPaused: boolean;
  onPlay: () => void; 
}> = ({ block, isPlaying, isPaused, onPlay }) => {
  return (
    <div 
      onClick={onPlay}
      className={`
        group relative p-4 rounded-xl transition-all cursor-pointer border border-transparent
        ${isPlaying 
          ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20' 
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-800'
        }
      `}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1">
          {block.type === 'title' ? (
             <h3 className={`text-lg font-bold transition-colors ${isPlaying ? 'text-orange-800 dark:text-orange-200' : 'text-slate-900 dark:text-white'}`}>
                {block.text}
             </h3>
          ) : (
             <p className={`text-sm leading-relaxed transition-colors ${isPlaying ? 'text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>
                {block.text}
             </p>
          )}
        </div>
        
        <div className={`
           flex-shrink-0 transition-opacity duration-200
           ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}>
           <button className={`
              w-8 h-8 flex items-center justify-center transition-all
              ${isPlaying 
                ? 'text-orange-600' 
                : 'text-slate-400 hover:text-orange-600 hover:scale-110'
              }
           `}>
              {isPlaying && !isPaused ? (
                 <div className="flex gap-0.5 items-end justify-center h-3">
                    <div className="w-0.5 bg-orange-600 animate-[bounce_1s_infinite] h-2"></div>
                    <div className="w-0.5 bg-orange-600 animate-[bounce_1.2s_infinite] h-3"></div>
                    <div className="w-0.5 bg-orange-600 animate-[bounce_0.8s_infinite] h-1.5"></div>
                 </div>
              ) : (
                 <PlayCircle size={28} strokeWidth={1} />
              )}
           </button>
        </div>
      </div>
    </div>
  );
};

const HelpCenter: React.FC<HelpCenterProps> = ({ 
  tickets, 
  onCreateTicket, 
  onUpdateTicket,
  initialActiveTicketId,
  clearActiveTicket
}) => {
  const [activeTab, setActiveTab] = useState<'support' | 'faq'>('support');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('center');
  const [currentView, setCurrentView] = useState<'ticket-list' | 'ticket-detail' | 'create-ticket'>('ticket-list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newMessage, setNewMessage] = useState('');
  
  // FAQ State
  const [activeCategory, setActiveCategory] = useState<HelpCategory>(HELP_DATA[0]);
  const [activeTopic, setActiveTopic] = useState<HelpTopic>(HELP_DATA[0].topics[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // Audio State
  const [playingBlockId, setPlayingBlockId] = useState<string | null>(null);
  const [currentSpokenText, setCurrentSpokenText] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Create Ticket Form State
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState('General Inquiry');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');

  // Handle initial ticket selection from props
  useEffect(() => {
    if (initialActiveTicketId) {
      const ticket = tickets.find(t => t.id === initialActiveTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        setCurrentView('ticket-detail');
        setActiveTab('support');
      }
      clearActiveTicket();
    }
  }, [initialActiveTicketId, tickets, clearActiveTicket]);

  // Update selected ticket data when tickets prop updates (e.g. new message arrived)
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  }, [tickets, selectedTicket]);

  useEffect(() => {
    return () => {
      synthRef.current.cancel();
    };
  }, []);

  // Audio Functions
  const handlePlayText = (text: string, blockId: string) => {
    synthRef.current.cancel();
    
    if (playingBlockId === blockId && !isPaused) {
      setPlayingBlockId(null);
      setCurrentSpokenText(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onend = () => {
      setPlayingBlockId(null);
      setCurrentSpokenText(null);
      setIsPaused(false);
    };

    utterance.onstart = () => {
      setPlayingBlockId(blockId);
      setCurrentSpokenText(text);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const handleGlobalPause = () => {
    if (synthRef.current.speaking && !synthRef.current.paused) {
      synthRef.current.pause();
      setIsPaused(true);
    } else if (synthRef.current.paused) {
      synthRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleGlobalStop = () => {
    synthRef.current.cancel();
    setPlayingBlockId(null);
    setCurrentSpokenText(null);
    setIsPaused(false);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketSubject || !newTicketMessage) return;

    const newTicket: Ticket = {
      id: Math.random().toString(36).substr(2, 9),
      number: Math.floor(10000 + Math.random() * 90000).toString(),
      subject: newTicketSubject,
      category: newTicketCategory,
      status: 'Open',
      lastUpdated: new Date().toISOString(),
      messages: [
        {
          id: Math.random().toString(36).substr(2, 9),
          senderId: 'current-user', 
          senderName: 'John Cena',
          senderRole: 'user',
          content: newTicketMessage,
          timestamp: new Date().toISOString()
        }
      ]
    };
    
    onCreateTicket(newTicket);
    setNewTicketSubject('');
    setNewTicketMessage('');
    setCurrentView('ticket-list');
  };

  const handleSendMessage = () => {
    if (!selectedTicket || !newMessage.trim()) return;
    onUpdateTicket(selectedTicket.id, newMessage);
    setNewMessage('');
  };

  const filteredTickets = tickets.filter(t => 
    t.subject.toLowerCase().includes(ticketSearch.toLowerCase()) || 
    t.number.includes(ticketSearch)
  );

  // Filter logic for FAQ
  const filteredCategories = searchQuery 
    ? HELP_DATA.map(cat => ({
        ...cat,
        topics: cat.topics.filter(t => 
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          t.content.some(c => c.text.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      })).filter(cat => cat.topics.length > 0)
    : HELP_DATA;

  // Layout Container Classes based on active tab and mode
  const getContainerClass = () => {
    if (activeTab === 'support') {
      return 'max-w-5xl mx-auto';
    }
    // FAQ Tab Logic
    switch (layoutMode) {
      case 'center': return 'max-w-5xl mx-auto';
      case 'full-width': return 'w-full';
      case 'full-width-center': return 'w-full';
      default: return 'max-w-5xl mx-auto';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 relative">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-6 flex-shrink-0">
        <div className={`flex items-center justify-between ${layoutMode === 'center' || activeTab === 'support' ? 'max-w-5xl mx-auto' : ''}`}>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <HelpCircle className="text-orange-600" />
              Help Center
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Get support, view your tickets, and browse FAQs.</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* View Mode Toggle (Only visible in FAQ) */}
            {activeTab === 'faq' && (
              <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <button 
                  onClick={() => setLayoutMode('center')}
                  className={`p-1.5 rounded-md transition-all ${layoutMode === 'center' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                  title="Centered Box"
                >
                  <BoxSelect size={16} />
                </button>
                <button 
                  onClick={() => setLayoutMode('full-width-center')}
                  className={`p-1.5 rounded-md transition-all ${layoutMode === 'full-width-center' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                  title="Full Width (Centered Text)"
                >
                  <PanelLeft size={16} />
                </button>
                <button 
                  onClick={() => setLayoutMode('full-width')}
                  className={`p-1.5 rounded-md transition-all ${layoutMode === 'full-width' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                  title="Full Width (Expanded)"
                >
                  <Maximize size={16} />
                </button>
              </div>
            )}

            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block"></div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab('support')}
                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'support' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                My Tickets
              </button>
              <button 
                onClick={() => setActiveTab('faq')}
                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'faq' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Knowledge Base
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full w-full flex flex-col ${getContainerClass()} transition-all duration-300`}>
          
          {/* VIEW: Ticket List */}
          {activeTab === 'support' && currentView === 'ticket-list' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="flex items-center justify-between mb-6">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Search tickets..."
                      className="pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-orange-500 transition-all w-64"
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                    />
                 </div>
                 <button 
                   onClick={() => setCurrentView('create-ticket')}
                   className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all shadow-md shadow-orange-600/20"
                 >
                   <Plus size={16} /> New Ticket
                 </button>
              </div>

              {filteredTickets.length > 0 ? (
                <div className="space-y-4">
                  {filteredTickets.map(ticket => (
                    <div 
                      key={ticket.id}
                      onClick={() => { setSelectedTicket(ticket); setCurrentView('ticket-detail'); }}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-orange-500/50 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                           <span className="text-xs font-mono font-bold text-slate-400">#{ticket.number}</span>
                           <StatusBadge status={ticket.status} />
                           <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Clock size={12} /> {new Date(ticket.lastUpdated).toLocaleDateString()}
                           </span>
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-white mb-2">{ticket.subject}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                         <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">
                           {ticket.category}
                         </span>
                         <span>•</span>
                         <span className="flex items-center gap-1">
                            <MessageSquare size={12} /> {ticket.messages.length} messages
                         </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                   <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                      <MessageSquare size={32} className="opacity-50" />
                   </div>
                   <h3 className="font-bold text-slate-600 dark:text-slate-300 mb-1">No tickets found</h3>
                   <p className="text-sm">Create a new ticket to get help.</p>
                </div>
              )}
            </div>
          )}

          {/* VIEW: Create Ticket */}
          {activeTab === 'support' && currentView === 'create-ticket' && (
             <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <button 
                  onClick={() => setCurrentView('ticket-list')}
                  className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest mb-6 transition-colors"
                >
                  <ArrowLeft size={16} /> Cancel & Back
                </button>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 max-w-2xl mx-auto shadow-sm">
                   <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Create New Support Ticket</h2>
                   <form onSubmit={handleCreateSubmit} className="space-y-6">
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subject</label>
                         <input 
                           required
                           className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                           placeholder="Brief description of the issue"
                           value={newTicketSubject}
                           onChange={(e) => setNewTicketSubject(e.target.value)}
                         />
                      </div>
                      
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                         <select 
                           className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                           value={newTicketCategory}
                           onChange={(e) => setNewTicketCategory(e.target.value)}
                         >
                            <option>General Inquiry</option>
                            <option>Technical Issue</option>
                            <option>Billing Support</option>
                            <option>Feature Request</option>
                         </select>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Message</label>
                         <textarea 
                           required
                           className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white h-40 resize-none"
                           placeholder="Describe your issue in detail..."
                           value={newTicketMessage}
                           onChange={(e) => setNewTicketMessage(e.target.value)}
                         />
                      </div>

                      <div className="pt-4 flex justify-end gap-3">
                         <button 
                           type="button"
                           onClick={() => setCurrentView('ticket-list')}
                           className="px-6 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all uppercase tracking-widest"
                         >
                           Cancel
                         </button>
                         <button 
                           type="submit"
                           className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3 rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-orange-600/20 transition-all active:scale-95"
                         >
                           Submit Ticket
                         </button>
                      </div>
                   </form>
                </div>
             </div>
          )}

          {/* VIEW: Ticket Detail (Timeline) */}
          {activeTab === 'support' && currentView === 'ticket-detail' && selectedTicket && (
              <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-6 border-b-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-4">
                          <button 
                             onClick={() => setCurrentView('ticket-list')}
                             className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                          >
                             <ArrowLeft size={20} className="text-slate-500" />
                          </button>
                          <div>
                              <div className="flex items-center gap-3">
                                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                      #{selectedTicket.number}: {selectedTicket.subject}
                                  </h2>
                                  <StatusBadge status={selectedTicket.status} />
                              </div>
                              <p className="text-xs text-slate-500">Last updated: {new Date(selectedTicket.lastUpdated).toLocaleString()}</p>
                          </div>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50 dark:bg-slate-950">
                      <div className="max-w-3xl mx-auto relative">
                          {/* Vertical Timeline Line */}
                          <div className="absolute top-0 bottom-0 left-[23px] w-[2px] bg-slate-200 dark:bg-slate-800"></div>

                          {/* Initial Event */}
                          <div className="relative pl-14 pb-8">
                               <div className="absolute left-[16px] top-1 w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded-full border-2 border-white dark:border-slate-900 z-10"></div>
                               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ticket Created • {new Date(selectedTicket.messages[0].timestamp).toLocaleDateString()}</p>
                          </div>

                          {selectedTicket.messages.map((msg, idx) => (
                              <div key={msg.id} className="relative pl-14 pb-10 group">
                                  {/* Timeline Node */}
                                  <div className={`absolute left-[10px] top-0 w-8 h-8 rounded-full border-4 border-white dark:border-slate-950 flex items-center justify-center z-10 ${
                                      msg.senderRole === 'support' ? 'bg-orange-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                  }`}>
                                      {msg.senderRole === 'support' ? <Zap size={14} fill="currentColor" /> : <User size={14} />}
                                  </div>

                                  <div className={`bg-white dark:bg-slate-900 border ${msg.senderRole === 'support' ? 'border-orange-200 dark:border-orange-900/30 shadow-orange-500/5' : 'border-slate-200 dark:border-slate-800'} rounded-xl p-6 shadow-sm`}>
                                      <div className="flex items-center justify-between mb-4">
                                          <div>
                                              <p className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                                  {msg.senderName}
                                                  {msg.senderRole === 'support' && (
                                                      <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-500/10 text-orange-600 text-[9px] font-bold uppercase rounded tracking-wide">
                                                          Support Team
                                                      </span>
                                                  )}
                                              </p>
                                              <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                                  <Clock size={10} /> {new Date(msg.timestamp).toLocaleString()}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                          {msg.content}
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Reply Area */}
                  <div className="p-6 pt-0 bg-slate-50 dark:bg-slate-950">
                      <div className="max-w-3xl mx-auto">
                          <div className="relative">
                              <textarea 
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 pr-32 text-sm outline-none focus:border-orange-500 transition-all dark:text-white resize-none h-32 shadow-sm"
                                  placeholder="Type your reply here..."
                                  value={newMessage}
                                  onChange={(e) => setNewMessage(e.target.value)}
                              />
                              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                  <button className="p-2 text-slate-400 hover:text-orange-600 transition-colors">
                                      <Paperclip size={18} />
                                  </button>
                                  <button 
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md"
                                  >
                                      <Send size={16} /> Reply
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* VIEW: FAQ / Knowledge Base */}
          {activeTab === 'faq' && (
             <div className="flex flex-1 overflow-hidden h-full">
                {/* FAQ Sidebar */}
                <aside className="w-64 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar hidden md:block bg-white dark:bg-slate-900 p-6 flex-shrink-0">
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                        type="text"
                        placeholder="Search topics..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-950 border focus:border-orange-500 rounded-lg outline-none transition-all text-xs"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <nav className="space-y-6">
                    {filteredCategories.map(category => (
                        <div key={category.id}>
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-3">
                            <category.icon size={14} />
                            {category.title}
                        </h3>
                        <div className="space-y-1">
                            {category.topics.map(topic => (
                            <button
                                key={topic.id}
                                onClick={() => {
                                setActiveCategory(category);
                                setActiveTopic(topic);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between group ${
                                activeTopic.id === topic.id 
                                    ? 'bg-orange-50 dark:bg-orange-600/10 text-orange-700 dark:text-orange-400' 
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                            >
                                {topic.title}
                                {activeTopic.id === topic.id && <ChevronRight size={14} />}
                            </button>
                            ))}
                        </div>
                        </div>
                    ))}
                    </nav>
                </aside>

                {/* FAQ Main Content */}
                <main className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50 dark:bg-slate-950">
                    <div className={`
                      transition-all duration-300
                      ${layoutMode === 'full-width' ? 'max-w-none px-4' : ''}
                      ${layoutMode === 'full-width-center' ? 'max-w-4xl mx-auto' : ''}
                      ${layoutMode === 'center' ? 'max-w-3xl mx-auto' : ''}
                    `}>
                        <div className="mb-2 text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                            {activeCategory.title}
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8 border-b border-slate-200 dark:border-slate-800 pb-6">
                            {activeTopic.title}
                        </h2>

                        <div className="space-y-2">
                            {activeTopic.content.map((block) => (
                            <AudioBlock 
                                key={block.id} 
                                block={block} 
                                isPlaying={playingBlockId === block.id}
                                isPaused={isPaused}
                                onPlay={() => handlePlayText(block.text, block.id)}
                            />
                            ))}
                        </div>
                    </div>
                </main>
             </div>
          )}

        </div>
      </div>

      {/* Sticky Player Bar (Only for Knowledge Base and when active) */}
      {activeTab === 'faq' && currentSpokenText && (
        <div className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shadow-2xl z-50 animate-in slide-in-from-bottom-5`}>
           <div className={`flex items-center gap-6 ${layoutMode === 'full-width' ? 'max-w-full px-6' : 'max-w-5xl mx-auto'}`}>
              <button 
                onClick={handleGlobalPause}
                className="w-12 h-12 rounded-full bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/20 flex-shrink-0"
              >
                 {isPaused ? <Play fill="currentColor" size={20} /> : <Pause fill="currentColor" size={20} />}
              </button>

              <div className="flex-1 min-w-0">
                 <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Now Reading</p>
                 <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate pr-4">
                    {currentSpokenText}
                 </p>
                 <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-orange-500 w-full animate-[progress-shimmer_2s_infinite_linear] origin-left" style={{ animationDuration: '30s' }}></div>
                 </div>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-200 dark:border-slate-800 pl-6 hidden sm:flex">
                 <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">John Hunt</span>
                    <span className="text-[10px] text-slate-400">AI Narrator</span>
                 </div>
                 <button 
                  onClick={handleGlobalStop}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                  title="Stop"
                 >
                    <XCircle size={24} />
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default HelpCenter;
