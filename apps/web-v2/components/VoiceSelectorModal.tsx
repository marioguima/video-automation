
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Search, 
  Mic2, 
  Play, 
  Pause, 
  Filter, 
  Check, 
  ChevronRight, 
  Volume2, 
  Zap,
  Loader2,
  RefreshCw, 
  User,
  Users
} from 'lucide-react';
import { Voice } from '../types';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (voice: Voice) => void;
  currentVoiceId?: string;
}

const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  currentVoiceId 
}) => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  
  // Ref for managing audio instance
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Filtering States
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [ageFilter, setAgeFilter] = useState<'all' | 'child' | 'young' | 'adult' | 'elderly'>('all');

  // Custom Test States
  const [testText, setTestText] = useState('');
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [selectedVoiceForTest, setSelectedVoiceForTest] = useState<Voice | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchVoices();
    }
    // Cleanup audio when closing or unmounting
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen]);

  const fetchVoices = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('https://xtts-api-server-local-dev.flowshopy.com.br/speakers');
      const data = await response.json();
      const apiBase = 'https://xtts-api-server-local-dev.flowshopy.com.br';
      
      // Since the API only returns name/id/preview, we inject some 
      // mock metadata for demonstration of the requested filters.
      // In production, this would ideally come from the API metadata.
      const enrichedData = data.map((v: Voice, idx: number) => {
        // Fix URL issues for preview
        let previewUrl = v.preview_url;

        if (previewUrl) {
            if (previewUrl.startsWith('/')) {
                // Handle relative paths
                previewUrl = `${apiBase}${previewUrl}`;
            } else if (previewUrl.includes('localhost:8020')) {
                // Handle localhost absolute URLs returned by the API by replacing the host
                // We handle both http and potential https or just the host string
                previewUrl = previewUrl.replace('http://localhost:8020', apiBase);
                previewUrl = previewUrl.replace('localhost:8020', 'xtts-api-server-local-dev.flowshopy.com.br');
            }
        }
        
        return {
          ...v,
          preview_url: previewUrl,
          gender: idx % 2 === 0 ? 'male' : 'female',
          age_group: ['child', 'young', 'adult', 'elderly'][idx % 4]
        };
      });
      
      setVoices(enrichedData);
      if (currentVoiceId) {
        const current = enrichedData.find((v: Voice) => v.voice_id === currentVoiceId);
        if (current) setSelectedVoiceForTest(current);
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVoices = useMemo(() => {
    return voices.filter(v => {
      const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGender = genderFilter === 'all' || v.gender === genderFilter;
      const matchesAge = ageFilter === 'all' || v.age_group === ageFilter;
      return matchesSearch && matchesGender && matchesAge;
    });
  }, [voices, searchQuery, genderFilter, ageFilter]);

  const handlePlaySample = (voice: Voice) => {
    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // If clicking the same voice, toggle off (already paused above)
    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }

    if (!voice.preview_url) {
      console.warn("No preview URL available for voice:", voice.name);
      return;
    }
    
    // Create new audio instance
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;

    setPlayingVoiceId(voice.voice_id);
    
    audio.play().catch(err => {
      console.error("Erro ao reproduzir amostra:", err);
      setPlayingVoiceId(null);
    });
    
    audio.onended = () => {
      setPlayingVoiceId(null);
      audioRef.current = null;
    };

    audio.onerror = (e) => {
      console.error("Audio error:", e);
      setPlayingVoiceId(null);
      audioRef.current = null;
    };
  };

  const handleGenerateTest = async () => {
    if (!testText || !selectedVoiceForTest) return;
    
    setIsGeneratingTest(true);
    try {
      // Simulating TTS Generation
      // In a real app, you would fetch from your TTS endpoint
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTestAudioUrl('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3');
    } catch (error) {
      console.error('TTS test failed', error);
    } finally {
      setIsGeneratingTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 lg:p-12">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-6xl h-full max-h-[850px] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-600/20">
              <Mic2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold dark:text-white tracking-tight">AI Voice Selector</h2>
              <p className="text-sm text-slate-500 font-medium">Browse and test high-quality neural voices.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Filters */}
          <aside className="w-64 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-8 bg-slate-50/50 dark:bg-slate-900/50 overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Search size={14} /> Search
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Voice name..."
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-orange-500 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Filter size={14} /> Gender
              </h3>
              <div className="space-y-2">
                <FilterButton label="All Genders" active={genderFilter === 'all'} onClick={() => setGenderFilter('all')} />
                <FilterButton label="Male" active={genderFilter === 'male'} onClick={() => setGenderFilter('male')} />
                <FilterButton label="Female" active={genderFilter === 'female'} onClick={() => setGenderFilter('female')} />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Users size={14} /> Age Group
              </h3>
              <div className="space-y-2">
                <FilterButton label="All Ages" active={ageFilter === 'all'} onClick={() => setAgeFilter('all')} />
                <FilterButton label="Child" active={ageFilter === 'child'} onClick={() => setAgeFilter('child')} />
                <FilterButton label="Young" active={ageFilter === 'young'} onClick={() => setAgeFilter('young')} />
                <FilterButton label="Adult" active={ageFilter === 'adult'} onClick={() => setAgeFilter('adult')} />
                <FilterButton label="Elderly" active={ageFilter === 'elderly'} onClick={() => setAgeFilter('elderly')} />
              </div>
            </div>
          </aside>

          {/* Voices Grid */}
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-slate-950">
            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                <Loader2 size={40} className="animate-spin text-orange-600" />
                <p className="text-sm font-bold uppercase tracking-widest">Waking up the neural engine...</p>
              </div>
            ) : filteredVoices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVoices.map((voice) => (
                  <div 
                    key={voice.voice_id}
                    onClick={() => {
                      setSelectedVoiceForTest(voice);
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer group relative ${
                      selectedVoiceForTest?.voice_id === voice.voice_id 
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/5 ring-1 ring-orange-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:border-orange-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${voice.gender === 'male' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                          <User size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{voice.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{voice.age_group} • {voice.gender}</p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePlaySample(voice); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          playingVoiceId === voice.voice_id 
                            ? 'bg-orange-600 text-white animate-pulse' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-orange-600'
                        }`}
                      >
                        {playingVoiceId === voice.voice_id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neural v2</span>
                      {currentVoiceId === voice.voice_id && (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 text-[9px] font-bold rounded uppercase">Active</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 opacity-50">
                <Mic2 size={48} />
                <p className="text-sm font-bold uppercase tracking-widest">No voices match your filters</p>
              </div>
            )}
          </main>
        </div>

        {/* Footer Lab (Test Area) */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto flex items-center gap-6">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-2 block">
                Test Laboratory <span className="text-orange-500">— {selectedVoiceForTest?.name || 'Select a voice'}</span>
              </label>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <input 
                    type="text" 
                    placeholder="Type something to hear how it sounds..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white pr-12"
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                  />
                  <button 
                    disabled={!testText || isGeneratingTest || !selectedVoiceForTest}
                    onClick={handleGenerateTest}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-600/10 rounded-lg disabled:opacity-30 transition-all"
                  >
                    {isGeneratingTest ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                  </button>
                </div>

                {testAudioUrl && (
                  <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                    <button 
                      className="h-11 px-4 bg-indigo-600 text-white rounded-xl flex items-center gap-2 font-bold text-xs hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                      onClick={() => {
                        const a = new Audio(testAudioUrl);
                        a.play();
                      }}
                    >
                      <Volume2 size={16} />
                      Play Test
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-slate-200 dark:border-slate-800">
              <button 
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button 
                disabled={!selectedVoiceForTest}
                onClick={() => selectedVoiceForTest && onSelect(selectedVoiceForTest)}
                className="px-8 py-3 bg-orange-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-orange-600/20 hover:bg-orange-700 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={18} />
                Confirm Voice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FilterButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${
      active 
        ? 'bg-orange-600 text-white shadow-md' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
  >
    {label}
    {active && <Check size={12} strokeWidth={3} />}
  </button>
);

export default VoiceSelectorModal;
