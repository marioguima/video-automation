
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Mic, 
  Image as ImageIcon,
  Plus,
  Play,
  Pause,
  Volume2,
  Type,
  Trash2,
  MonitorPlay,
  Layers,
  Edit3,
  GripVertical,
  Layout as LayoutIcon,
  ChevronDown,
  Check,
  Search,
  Headphones,
  Presentation,
  Clapperboard,
  ExternalLink,
  FileText,
  Maximize2,
  Settings2
} from 'lucide-react';
import { LESSON_BLOCKS, TEMPLATES } from '../constants';
import { LessonBlock, Template, Voice } from '../types';
import VoiceSelectorModal from './VoiceSelectorModal';

interface EditorProps {
  onImageClick?: (url: string) => void;
}

// Componente de Player de Áudio Customizado
const AudioPlayer: React.FC<{ src?: string }> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-1 items-center gap-3 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-[5px] border border-slate-200 dark:border-slate-700/50">
      <audio 
        ref={audioRef} 
        src={src || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"} // Placeholder para demonstração
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      
      <button 
        onClick={togglePlay}
        className="w-6 h-6 flex-shrink-0 bg-orange-600 text-white rounded-full flex items-center justify-center hover:bg-orange-700 transition-all active:scale-90 shadow-sm"
      >
        {isPlaying ? (
          <Pause size={10} fill="currentColor" className="translate-y-[0.5px]" />
        ) : (
          <Play size={10} className="ml-0.5 translate-y-[0.5px]" fill="currentColor" />
        )}
      </button>

      <div className="flex-1 flex items-center gap-2">
        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tabular-nums min-w-[24px]">
          {formatTime(currentTime)}
        </span>
        
        <input 
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="
            flex-1 h-3 bg-transparent appearance-none cursor-pointer
            [&::-webkit-slider-runnable-track]:h-1 
            [&::-webkit-slider-runnable-track]:w-full 
            [&::-webkit-slider-runnable-track]:bg-slate-200 
            dark:[&::-webkit-slider-runnable-track]:bg-slate-700 
            [&::-webkit-slider-runnable-track]:rounded-full 
            
            [&::-webkit-slider-thumb]:appearance-none 
            [&::-webkit-slider-thumb]:h-3 
            [&::-webkit-slider-thumb]:w-3 
            [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:bg-orange-600 
            [&::-webkit-slider-thumb]:mt-[-4px] 
            
            [&::-moz-range-track]:h-1 
            [&::-moz-range-track]:w-full 
            [&::-moz-range-track]:bg-slate-200 
            dark:[&::-moz-range-track]:bg-slate-700 
            [&::-moz-range-track]:rounded-full 
            
            [&::-moz-range-thumb]:h-3 
            [&::-moz-range-thumb]:w-3 
            [&::-moz-range-thumb]:rounded-full 
            [&::-moz-range-thumb]:bg-orange-600 
            [&::-moz-range-thumb]:border-none
          "
        />
        
        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tabular-nums min-w-[24px] text-right">
          {formatTime(duration)}
        </span>
      </div>

      <Volume2 size={12} className="text-slate-400 flex-shrink-0" />
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ onImageClick }) => {
  const [blocks, setBlocks] = useState<LessonBlock[]>(LESSON_BLOCKS);
  const [activeBlockId, setActiveBlockId] = useState<string>(LESSON_BLOCKS[0]?.id);
  const [activeTemplate, setActiveTemplate] = useState<Template>(TEMPLATES[0]);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [generatingStates, setGeneratingStates] = useState<Record<string, { text: boolean, image: boolean, audio?: boolean, global?: boolean }>>({});
  const [draggedItem, setDraggedItem] = useState<{ blockId: string, index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Lesson Voice Selection State (Global for all blocks in this lesson)
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [lessonVoiceId, setLessonVoiceId] = useState<string | undefined>(blocks[0]?.voiceId || 'a-forja');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  // Close template menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter templates based on search
  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter(t => 
      t.name.toLowerCase().includes(templateSearch.toLowerCase())
    );
  }, [templateSearch]);

  // Reset search when menu closes
  useEffect(() => {
    if (!isTemplateMenuOpen) setTemplateSearch('');
  }, [isTemplateMenuOpen]);

  // Implementação da Seleção Automática via Scroll (Intersection Observer)
  useEffect(() => {
    const observerOptions = {
      root: scrollContainerRef.current,
      rootMargin: '-10% 0px -70% 0px', 
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      if (isProgrammaticScroll.current) return;

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const blockId = entry.target.id.replace('block-', '');
          setActiveBlockId(blockId);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    
    (Object.values(blockRefs.current) as (HTMLDivElement | null)[]).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [blocks]);

  const scrollToBlock = (id: string) => {
    setActiveBlockId(id);
    const element = blockRefs.current[id];
    if (element && scrollContainerRef.current) {
      isProgrammaticScroll.current = true;
      
      const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
      const elementTop = element.getBoundingClientRect().top;
      const scrollPos = elementTop - containerTop + scrollContainerRef.current.scrollTop;
      
      scrollContainerRef.current.scrollTo({
        top: scrollPos - 24,
        behavior: 'smooth'
      });

      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 800);
    }
  };

  const updateBlock = (id: string, updates: Partial<LessonBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const handleRegenerateText = (id: string) => {
    setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], text: true } }));
    setTimeout(() => {
      setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], text: false } }));
    }, 1200);
  };

  const handleRegenerateAudio = (id: string) => {
    setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], audio: true } }));
    setTimeout(() => {
      setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], audio: false } }));
    }, 1500);
  };

  const handleRegenerateImage = (id: string) => {
    setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], image: true } }));
    setTimeout(() => {
      setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], image: false } }));
    }, 1800);
  };

  const handleGlobalAction = (action: string) => {
    console.log(`Global action triggered: ${action}`);
    // Simular loading global
    setGeneratingStates(prev => ({ ...prev, global: { ...prev.global, [action]: true } } as any));
    setTimeout(() => {
      setGeneratingStates(prev => ({ ...prev, global: { ...prev.global, [action]: false } } as any));
    }, 2000);
  };

  const handleBulletChange = (blockId: string, index: number, value: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const newBullets = [...block.onScreenText.bullets];
    newBullets[index] = value;
    updateBlock(blockId, {
      onScreenText: { ...block.onScreenText, bullets: newBullets }
    });
  };

  const onDragStart = (e: React.DragEvent, blockId: string, index: number) => {
    setDraggedItem({ blockId, index });
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.style.opacity = '0.4';
    }, 0);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const onDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const onDrop = (e: React.DragEvent, blockId: string, index: number) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.blockId !== blockId) return;
    
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const newBullets = [...block.onScreenText.bullets];
    const [reorderedItem] = newBullets.splice(draggedItem.index, 1);
    newBullets.splice(index, 0, reorderedItem);

    updateBlock(blockId, {
      onScreenText: { ...block.onScreenText, bullets: newBullets }
    });
    
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  // Global Voice update
  const handleVoiceSelected = (voice: Voice) => {
    setLessonVoiceId(voice.voice_id);
    
    // Update all blocks in state with the new voice ID
    const updatedBlocks = blocks.map(b => ({ ...b, voiceId: voice.voice_id }));
    setBlocks(updatedBlocks);
    
    setIsVoiceModalOpen(false);
    
    // Visually indicate that audios need regeneration or trigger it
    console.log(`Sincronizando voz da lição para: ${voice.name}`);
    handleGlobalAction('generateAudios');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      
      {/* Barra Horizontal Superior (Fixa e Full Width) */}
      <div className="h-14 px-8 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 z-30">
        <div className="flex items-center gap-8">
          {/* Seletor de Voz da Lição (Global) */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Voice:</span>
            <button 
              onClick={() => setIsVoiceModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 rounded-[5px] text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-all shadow-sm group"
            >
              <Mic size={14} className="text-indigo-500 group-hover:scale-110 transition-transform" />
              {lessonVoiceId ? lessonVoiceId.toUpperCase() : 'SELECT VOICE'}
              <Settings2 size={12} className="ml-1 opacity-50" />
            </button>
          </div>

          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

          {/* Template Selector */}
          <div className="flex items-center gap-4 relative" ref={templateMenuRef}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Template:</span>
            
            <button
              onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
              className="flex items-center gap-3 px-4 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-orange-500/50 transition-all min-w-[180px] justify-between group"
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full border border-white/20 shadow-sm ${activeTemplate.previewColor}`}></div>
                <span>{activeTemplate.name}</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isTemplateMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isTemplateMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                {/* Search Header */}
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      autoFocus
                      type="text"
                      className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[4px] text-xs outline-none focus:border-orange-500/50 transition-all placeholder:text-slate-400"
                      placeholder="Pesquisar tema..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* List with Thumbnails */}
                <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-1.5">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setActiveTemplate(t);
                          setIsTemplateMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2 rounded-[6px] transition-all mb-1 group relative ${
                          activeTemplate.id === t.id 
                            ? 'bg-orange-50 dark:bg-orange-600/10 ring-1 ring-orange-500/20' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className={`w-14 h-9 rounded-[4px] border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 relative shadow-sm ${t.previewColor}`}>
                          {/* Mini layout preview */}
                          {t.layout === 'split' && (
                            <div className="absolute inset-0 flex">
                              <div className="w-1/2 h-full bg-black/10"></div>
                            </div>
                          )}
                          {t.layout === 'centered' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-1/2 h-1/2 bg-black/10 rounded-sm"></div>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-left">
                          <p className={`text-[11px] font-bold ${activeTemplate.id === t.id ? 'text-orange-600 dark:text-orange-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {t.name}
                          </p>
                          <p className="text-[9px] text-slate-400 uppercase font-medium tracking-tight">
                            {t.layout} layout
                          </p>
                        </div>
                        
                        {activeTemplate.id === t.id && (
                          <div className="bg-orange-500 rounded-full p-0.5 shadow-sm">
                            <Check size={10} className="text-white" strokeWidth={4} />
                          </div>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs text-slate-400 font-medium italic">Nenhum tema encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons and primary action */}
        <div className="flex items-center gap-3">
          {/* Left Divider */}
          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
          
          <button 
            onClick={() => handleGlobalAction('generateBlocks')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 transition-all shadow-sm"
          >
            <Layers size={14} className="text-slate-400" />
            Generate Blocks
          </button>
          
          <button 
            onClick={() => handleGlobalAction('generateAudios')}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/50 rounded-[5px] text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/80 transition-all shadow-sm"
          >
            <Headphones size={14} />
            Generate All Audios
          </button>

          {/* Right Divider */}
          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

          {/* Primary Action */}
          <button 
            onClick={() => handleGlobalAction('generateFinalVideo')}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider bg-orange-600 text-white px-5 py-2.5 rounded-[5px] hover:bg-orange-700 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            <Clapperboard size={15} strokeWidth={2.5} />
            Generate Final Video
          </button>
        </div>
      </div>

      {/* Área de Conteúdo (Blocks + Sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Container de Scroll apenas para a área dos blocos */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-12 scroll-smooth"
        >
          {blocks.map((block) => (
            <div 
              key={block.id}
              id={`block-${block.id}`}
              ref={el => { blockRefs.current[block.id] = el; }}
              className="max-w-[1200px] mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[5px] flex overflow-hidden min-h-[600px]"
            >
              {/* Seção de Edição do Bloco (Esquerda) */}
              <div className="flex-1 p-8 space-y-12 border-r border-dashed border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="px-2 py-1 bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 text-[10px] font-bold rounded transition-colors">
                    {block.number}
                  </div>
                  <h3 className="font-bold text-lg">{block.title}</h3>
                </div>

                {/* 1. Script & TTS Section */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between border-b border-dashed border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Mic size={14} className="text-orange-600" />
                      Voiceover & Scripting
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleRegenerateText(block.id)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 transition-all shadow-sm"
                      >
                        <Sparkles size={14} className="text-slate-400" />
                        {generatingStates[block.id]?.text ? 'Generating...' : 'Regenerate Script'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-3">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1.5">
                        Original Source
                      </label>
                      <div className="text-xs text-slate-500 italic leading-relaxed">
                        "{block.originalText}"
                      </div>
                    </div>
                    <div className="space-y-3 group">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={14} className="text-orange-600" />
                        Narrated Script 
                        <Edit3 size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                      </label>
                      <textarea 
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[6px] text-sm leading-relaxed outline-none focus:border-orange-500 transition-all resize-none text-slate-800 dark:text-slate-100 h-24"
                        value={block.narratedText}
                        onChange={(e) => updateBlock(block.id, { narratedText: e.target.value })}
                      />
                      <div className="flex items-center gap-4 pt-1">
                        {/* Player de Áudio Real */}
                        <AudioPlayer src={block.audioUrl} />

                        <button 
                          onClick={() => handleRegenerateAudio(block.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 transition-all shadow-sm h-full"
                        >
                          <RefreshCw size={14} className={`text-slate-400 ${generatingStates[block.id]?.audio ? 'animate-spin' : ''}`} />
                          Regenerate Audio
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. On-Screen Content Section */}
                <section className="space-y-6 text-slate-900 dark:text-slate-100">
                  <div className="flex items-center justify-between border-b border-dashed border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Type size={14} className="text-orange-600" />
                      On-Screen Content
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Slide Headline</label>
                      <input 
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[6px] font-bold text-slate-800 dark:text-white text-base outline-none focus:border-orange-500 transition-all"
                        value={block.onScreenText.title}
                        onChange={(e) => updateBlock(block.id, {
                          onScreenText: { ...block.onScreenText, title: e.target.value }
                        })}
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Key Point Bullets</label>
                      <div className="space-y-2">
                        {block.onScreenText.bullets.map((bullet, idx) => (
                          <div 
                            key={`${block.id}-bullet-${idx}`}
                            draggable
                            onDragStart={(e) => onDragStart(e, block.id, idx)}
                            onDragOver={(e) => onDragOver(e, idx)}
                            onDragEnd={onDragEnd}
                            onDrop={(e) => onDrop(e, block.id, idx)}
                            className={`flex items-center gap-3 group bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-[6px] border transition-all shadow-sm cursor-move ${
                              dragOverIndex === idx && draggedItem?.blockId === block.id && draggedItem?.index !== idx 
                                ? 'border-orange-500 border-dashed bg-orange-50/30 dark:bg-orange-500/5' 
                                : 'border-slate-100 dark:border-slate-700 hover:border-orange-500/30'
                            }`}
                          >
                            <GripVertical size={14} className="text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
                            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full flex-shrink-0" />
                            <input 
                              className="flex-1 bg-transparent text-sm outline-none font-medium text-slate-800 dark:text-slate-100 focus:text-slate-900 dark:focus:text-white transition-colors cursor-text"
                              value={bullet}
                              onChange={(e) => handleBulletChange(block.id, idx, e.target.value)}
                            />
                            <button 
                              onClick={() => {
                                const newBullets = block.onScreenText.bullets.filter((_, i) => i !== idx);
                                updateBlock(block.id, {
                                  onScreenText: { ...block.onScreenText, bullets: newBullets }
                                });
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-opacity cursor-pointer"
                            >
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => {
                          updateBlock(block.id, {
                            onScreenText: {
                              ...block.onScreenText,
                              bullets: [...block.onScreenText.bullets, "New Key Point"]
                            }
                          });
                        }}
                        className="text-[10px] font-bold text-cyan-500 flex items-center gap-1.5 hover:text-cyan-600 pt-2 pl-3"
                      >
                        <Plus size={12} /> Add New Point
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              {/* Seção de Previews e Image Forge (Direita) */}
              <div className="w-[400px] bg-white dark:bg-slate-900 p-8 flex flex-col gap-5 overflow-y-auto custom-scrollbar border-slate-100 dark:border-slate-800">
                {/* 1. Final Composition */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <MonitorPlay size={14} />
                    Final Composition
                  </div>
                  <div className={`relative group/composition aspect-video rounded-[6px] overflow-hidden border border-slate-200 dark:border-slate-800 ${activeTemplate.previewColor} shadow-md`}>
                    <img 
                      src={block.generatedImageUrl} 
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 cursor-zoom-in ${activeTemplate.layout === 'centered' ? 'opacity-20' : 'opacity-70'}`}
                      alt="Slide"
                      onClick={() => onImageClick?.(block.generatedImageUrl || '')}
                    />
                    
                    {/* Link Direto Overlay */}
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/composition:opacity-100 transition-all z-20">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onImageClick?.(block.generatedImageUrl || ''); }}
                        className="p-1.5 bg-black/50 hover:bg-orange-600 text-white rounded-md backdrop-blur-sm"
                        title="View full composition"
                      >
                        <Maximize2 size={14} />
                      </button>
                      <a 
                        href={block.generatedImageUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1.5 bg-black/50 hover:bg-orange-600 text-white rounded-md backdrop-blur-sm"
                        title="Download raw asset"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    <div className={`absolute inset-0 p-6 flex flex-col pointer-events-none ${
                      activeTemplate.layout === 'centered' ? 'items-center justify-center text-center' :
                      activeTemplate.layout === 'split' ? 'items-start justify-center bg-gradient-to-r from-black/80 to-transparent pr-24' :
                      'items-start justify-end bg-gradient-t-from-black/80 via-black/20 to-transparent'
                    }`}>
                      <h4 className="text-lg font-bold text-white mb-3 leading-tight drop-shadow-lg">{block.onScreenText.title}</h4>
                      <ul className="space-y-1.5">
                        {block.onScreenText.bullets.map((b, i) => (
                          <li key={`preview-bullet-${block.id}-${i}`} className="flex items-center gap-2 text-[9px] font-medium text-white/80 drop-shadow">
                            <div className="w-1 h-1 bg-orange-400 rounded-full" /> {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 text-center uppercase tracking-widest font-bold">
                    Engine: <span className="text-orange-500">{activeTemplate.name}</span>
                  </p>
                </div>

                {/* Dashed Horizontal Divider between composition and asset */}
                <div className="border-t border-dashed border-slate-100 dark:border-slate-800"></div>

                {/* 2. Raw Visual Asset */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <Layers size={14} />
                    Raw Visual Asset
                  </div>
                  <div className="relative group/asset aspect-video rounded-[6px] overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <img 
                      src={block.generatedImageUrl} 
                      className={`w-full h-full object-cover transition-all duration-700 cursor-zoom-in ${generatingStates[block.id]?.image ? 'blur-xl opacity-40' : 'blur-0 opacity-100'}`}
                      alt="Asset"
                      onClick={() => onImageClick?.(block.generatedImageUrl || '')}
                    />
                    
                    {/* View Controls */}
                    {!generatingStates[block.id]?.image && (
                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/asset:opacity-100 transition-all z-20">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onImageClick?.(block.generatedImageUrl || ''); }}
                          className="p-1.5 bg-black/50 hover:bg-orange-600 text-white rounded-md backdrop-blur-sm"
                          title="View raw asset"
                        >
                          <Maximize2 size={14} />
                        </button>
                        <a 
                          href={block.generatedImageUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 bg-black/50 hover:bg-orange-600 text-white rounded-md backdrop-blur-sm"
                          title="Download"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    )}

                    {generatingStates[block.id]?.image && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. AI Image Generation */}
                <section className="space-y-3 pt-2 border-t border-dashed border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <ImageIcon size={14} className="text-orange-600" />
                      AI Image Generation
                    </div>
                    <button 
                      onClick={() => handleRegenerateImage(block.id)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[5px] text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 transition-all shadow-sm"
                    >
                      <RefreshCw size={14} className={`text-slate-400 ${generatingStates[block.id]?.image ? 'animate-spin' : ''}`} />
                      Generate
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Prompt</label>
                      <textarea 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[6px] text-xs text-slate-800 dark:text-slate-100 font-medium outline-none focus:border-orange-500 transition-all resize-none leading-relaxed h-20"
                        value={block.imagePrompt.prompt}
                        onChange={(e) => updateBlock(block.id, {
                          imagePrompt: { ...block.imagePrompt, prompt: e.target.value }
                        })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Avoid</label>
                        <input 
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[4px] text-xs outline-none focus:border-orange-500 transition-all" 
                          value={block.imagePrompt.avoid}
                          onChange={(e) => updateBlock(block.id, {
                            imagePrompt: { ...block.imagePrompt, avoid: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Seed</label>
                        <div className="p-2.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-xs font-mono font-bold text-orange-600 rounded-[4px] flex items-center justify-between">
                          <span>#{block.imagePrompt.seedNumber}</span>
                          <RefreshCw size={10} className="cursor-pointer" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ))}
          <div className="h-44" />
        </div>

        {/* Sidebar de Currículo (Fixa à direita e com scroll independente) */}
        <aside className="w-72 bg-white dark:bg-slate-950 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-shrink-0 border-l border-slate-200 dark:border-slate-800 z-10">
          <h3 className="font-bold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
            <LayoutIcon size={14} />
            Curriculum
          </h3>
          <nav className="space-y-1">
            {blocks.map((block) => {
              const isActive = block.id === activeBlockId;
              return (
                <button 
                  key={block.id}
                  onClick={() => scrollToBlock(block.id)}
                  className={`w-full relative flex items-center gap-4 py-3 px-3 rounded-[5px] transition-all group text-left ${
                    isActive 
                      ? 'bg-orange-50 dark:bg-orange-600/20 shadow-sm' 
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div 
                    className="relative w-14 h-9 rounded-[4px] overflow-hidden flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity border border-slate-100 dark:border-slate-800 cursor-zoom-in"
                    onClick={(e) => { e.stopPropagation(); onImageClick?.(block.thumbnail); }}
                  >
                    <img src={block.thumbnail} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Maximize2 size={10} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                      {block.number}
                    </p>
                    <p className={`text-[11px] font-bold truncate ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-700 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200'}`}>
                      {block.title}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>
      </div>

      {/* Voice Selector Modal */}
      <VoiceSelectorModal 
        isOpen={isVoiceModalOpen} 
        onClose={() => setIsVoiceModalOpen(false)} 
        onSelect={handleVoiceSelected}
        currentVoiceId={lessonVoiceId}
      />
    </div>
  );
};

export default Editor;
