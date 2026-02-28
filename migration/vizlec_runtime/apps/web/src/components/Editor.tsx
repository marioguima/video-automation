
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Loader2,
  Mic, 
  AudioLines,
  Image as ImageIcon,
  Plus,
  Play,
  Pause,
  Type,
  Trash2,
  MonitorPlay,
  Layers,
  GripVertical,
  Layout as LayoutIcon,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Search,
  Headphones,
  Captions,
  Volume2,
  VolumeX,
  Copy,
  Clapperboard,
  ExternalLink,
  Maximize2,
  Settings2,
  Ellipsis,
  Eye,
  EyeOff,
  Download
} from 'lucide-react';
import { LessonBlock, Template, Voice } from '../types';
import { apiGet, apiPost, apiPatch, API_BASE } from '../lib/api';
import { JOB_STREAM_EVENT, WS_EVENT, readVizlecWsDetail } from '../lib/events';
import VoiceSelectorModal from './VoiceSelectorModal';
import ConfirmDialog from './ui/confirm-dialog';

interface EditorProps {
  lessonId: string | null;
  dispatchAgentId: string | null;
  lessonTitle?: string;
  moduleTitle?: string;
  courseTitle?: string;
  autoQueuePlan?: {
    requestId: string;
    generateAudio: boolean;
    generateImage: boolean;
  } | null;
  onImageClick?: (url: string) => void;
  onGoCourse?: () => void;
  onGoModule?: () => void;
}

// Componente de Player de Áudio Customizado
const AudioPlayer: React.FC<{ src?: string }> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current && src) {
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
      const next = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
      if (next > 0) {
        setDuration(next);
      }
    }
  };

  const onDurationChange = () => {
    if (audioRef.current) {
      const next = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
      if (next > 0) {
        setDuration(next);
      }
    }
  };

  const onCanPlay = () => {
    if (audioRef.current) {
      const next = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
      if (next > 0) {
        setDuration(next);
      }
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

  const hasSrc = Boolean(src);
  const isReady = hasSrc && duration > 0;

  useEffect(() => {
    if (!audioRef.current) return;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [src]);

  useEffect(() => {
    if (!audioRef.current || !isPlaying) return;
    let raf = 0;
    const tick = () => {
      if (!audioRef.current) return;
      const next = audioRef.current.currentTime;
      setCurrentTime((prev) => {
        if (Math.abs(prev - next) < 0.015) return prev;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return (
    <div className="flex flex-1 items-center gap-1 px-2 py-1.5 rounded-[5px] border border-[hsl(var(--editor-input-border))] h-9">
      <audio 
        ref={audioRef} 
        src={src}
        preload="metadata"
        crossOrigin="use-credentials"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onCanPlay={onCanPlay}
        onError={() => {
          setIsPlaying(false);
          setDuration(0);
          setCurrentTime(0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (audioRef.current) {
            const end = Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
              ? audioRef.current.duration
              : audioRef.current.currentTime;
            if (end > 0) {
              setDuration(end);
              setCurrentTime(end);
            }
          }
        }}
      />
      
      <button 
        onClick={togglePlay}
        disabled={!isReady}
        className="w-5 h-5 flex-shrink-0 bg-orange-600 text-white rounded-full flex items-center justify-center hover:bg-orange-700 transition-all active:scale-90 shadow-sm disabled:opacity-40 disabled:hover:bg-orange-600"
      >
        {isPlaying ? (
          <Pause size={9} fill="currentColor" />
        ) : (
          <Play size={9} fill="currentColor" />
        )}
      </button>

      <div className="flex-1 flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
          {isReady ? formatTime(currentTime) : '--:--'}
        </span>
        
        <input 
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={currentTime}
          onChange={handleSeek}
          disabled={!isReady}
          className="flex-1 h-3 bg-transparent appearance-none cursor-pointer mx-1 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:bg-slate-200 dark:[&::-webkit-slider-runnable-track]:bg-slate-700 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-600 [&::-webkit-slider-thumb]:mt-[-4px] [&::-moz-range-track]:h-1 [&::-moz-range-track]:w-full [&::-moz-range-track]:bg-slate-200 dark:[&::-moz-range-track]:bg-slate-700 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-orange-600 [&::-moz-range-thumb]:border-none"
        />
        
        <span className="text-[9px] font-bold text-muted-foreground tabular-nums text-right">
          {isReady ? formatTime(duration) : '--:--'}
        </span>
      </div>

    </div>
  );
};

type NarratedAudioPanelProps = {
  blockId: string;
  originalText?: string;
  value: string;
  audioUrl?: string;
  isGenerating: boolean;
  isGeneratingTts: boolean;
  isGeneratingText: boolean;
  isLocked?: boolean;
  ttsReady: boolean;
  missingOnScreen?: boolean;
  onDraft: (blockId: string, value: string) => void;
  onSave: (blockId: string, value: string) => void;
  onRegenerate: (blockId: string) => void;
};

const NarratedAudioPanel: React.FC<NarratedAudioPanelProps> = React.memo(
  ({ blockId, originalText, value, audioUrl, isGenerating, isGeneratingTts, isGeneratingText, isLocked = false, ttsReady, missingOnScreen = false, onDraft, onSave, onRegenerate }) => {
    const [draft, setDraft] = useState(value);
    const [isFocused, setIsFocused] = useState(false);
    const [activeTab, setActiveTab] = useState<'original' | 'narrated'>('narrated');
    const [didCopyOriginal, setDidCopyOriginal] = useState(false);
    const saveTimer = useRef<number | null>(null);
    const copyFeedbackTimer = useRef<number | null>(null);

    useEffect(() => {
      if (!isFocused) {
        setDraft(value);
      }
    }, [value, isFocused]);

    useEffect(() => {
      return () => {
        if (saveTimer.current) {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        if (copyFeedbackTimer.current) {
          window.clearTimeout(copyFeedbackTimer.current);
          copyFeedbackTimer.current = null;
        }
      };
    }, []);

    const charCount = draft.length;
    const overLimit = charCount > AUDIO_CHAR_LIMIT;
    const showLimit = activeTab === 'narrated' && (isFocused || overLimit);
    const isRegenerateDisabled = Boolean(
      isGenerating || isGeneratingTts || isGeneratingText || isLocked || !ttsReady || missingOnScreen
    );
    const regenerateLabel = missingOnScreen
      ? 'Preencha o On-Screen deste bloco para gerar áudio.'
      : !ttsReady
      ? 'TTS indisponível no momento.'
      : 'Regenerate audio';

    const scheduleSave = (nextValue: string) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        onSave(blockId, nextValue);
        saveTimer.current = null;
      }, 400);
    };

    const handleChange = (nextValue: string) => {
      setDraft(nextValue);
      onDraft(blockId, nextValue);
      scheduleSave(nextValue);
    };

    const flushSave = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (draft !== value) {
        onSave(blockId, draft);
      }
    };

    const handleTabSelect = (nextTab: 'original' | 'narrated') => {
      if (activeTab === nextTab) return;
      if (activeTab === 'narrated') {
        setIsFocused(false);
        flushSave();
      }
      setActiveTab(nextTab);
    };

    const handleCopyOriginalText = async () => {
      const text = originalText?.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setDidCopyOriginal(true);
        if (copyFeedbackTimer.current) {
          window.clearTimeout(copyFeedbackTimer.current);
        }
        copyFeedbackTimer.current = window.setTimeout(() => {
          setDidCopyOriginal(false);
          copyFeedbackTimer.current = null;
        }, 1500);
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div className="relative inline-grid grid-cols-2 h-8 rounded-[7px] bg-[hsl(var(--editor-surface-2))] p-0.5 min-w-[238px]">
            <span
              className={`absolute left-0.5 top-0.5 bottom-0.5 w-[calc(50%-3px)] rounded-[5px] bg-[hsl(var(--editor-surface))] shadow-sm transition-transform duration-200 ease-out ${
                activeTab === 'original' ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              onClick={() => handleTabSelect('narrated')}
              className={`relative z-10 pl-4 pr-3 h-7 rounded-[5px] inline-flex items-center justify-center leading-none text-[10px] font-bold uppercase tracking-wide transition-colors ${
                activeTab === 'narrated'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/80 hover:text-muted-foreground'
              }`}
            >
              Narrated Script
            </button>
            <button
              type="button"
              onClick={() => handleTabSelect('original')}
              className={`relative z-10 pl-3 pr-4 h-7 rounded-[5px] inline-flex items-center justify-center leading-none text-[10px] font-bold uppercase tracking-wide transition-colors ${
                activeTab === 'original'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/80 hover:text-muted-foreground'
              }`}
            >
              Original Text
            </button>
          </div>
          {showLimit ? (
            <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest">
              <span className={overLimit ? 'text-amber-500' : 'text-muted-foreground'}>
                {charCount}/{AUDIO_CHAR_LIMIT} chars
              </span>
              {overLimit ? <span className="text-amber-500">Recommended up to {AUDIO_CHAR_LIMIT}</span> : null}
            </div>
          ) : null}
          {activeTab === 'original' ? (
            <button
              type="button"
              onClick={handleCopyOriginalText}
              disabled={!originalText?.trim()}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground"
            >
              {didCopyOriginal ? <Check size={12} /> : <Copy size={12} />}
              {didCopyOriginal ? 'Copied' : 'Copy Text'}
            </button>
          ) : null}
        </div>
        {activeTab === 'original' ? (
          <textarea
            rows={2}
            readOnly
            tabIndex={-1}
            className="w-full p-3 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[6px] text-sm leading-relaxed outline-none transition-all resize-none overflow-y-auto text-muted-foreground/80 italic"
            value={originalText?.trim() ? originalText : 'No original text available.'}
          />
        ) : (
          <textarea
            rows={2}
            className={`w-full p-3 bg-[hsl(var(--editor-input))] border rounded-[6px] text-sm leading-relaxed outline-none focus:border-primary/40 transition-all resize-none text-foreground/85 placeholder:text-muted-foreground ${
              overLimit ? 'border-amber-500/60 bg-amber-500/10' : 'border-[hsl(var(--editor-input-border))]'
            }`}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              flushSave();
            }}
            disabled={isGeneratingText || isLocked}
          />
        )}
        <div className="flex items-center gap-4 pt-1">
          <AudioPlayer src={isGenerating ? undefined : audioUrl} />
          <button
            onClick={() => onRegenerate(blockId)}
            disabled={isRegenerateDisabled}
            title={regenerateLabel}
            className={`flex items-center gap-2 px-3 h-9 bg-transparent border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[10px] font-bold text-muted-foreground transition-all shadow-sm ${
              isRegenerateDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-orange-600'
            }`}
          >
            <RefreshCw size={14} className={`${isGenerating ? 'animate-spin text-orange-600' : 'text-muted-foreground'}`} />
            {isGenerating ? 'Generating...' : 'Regenerate Audio'}
          </button>
        </div>
      </>
    );
  }
);

NarratedAudioPanel.displayName = "NarratedAudioPanel";

type OnScreenEditorProps = {
  blockId: string;
  value: LessonBlock["onScreenText"];
  onSave: (blockId: string, value: LessonBlock["onScreenText"]) => void;
  disabled?: boolean;
  invalid?: boolean;
};

const OnScreenEditor: React.FC<OnScreenEditorProps> = React.memo(({ blockId, value, onSave, disabled = false, invalid = false }) => {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const saveTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (disabled) {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      isEditingRef.current = false;
      setDraft(value);
      draftRef.current = value;
      return;
    }
    if (!isEditingRef.current) {
      setDraft(value);
      draftRef.current = value;
    }
  }, [value, disabled]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  const scheduleSave = (nextValue: LessonBlock["onScreenText"]) => {
    if (disabled) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      onSave(blockId, nextValue);
      saveTimer.current = null;
    }, 400);
  };

  const commitSave = () => {
    if (disabled) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSave(blockId, draftRef.current);
  };

  const updateDraft = (updater: (prev: LessonBlock["onScreenText"]) => LessonBlock["onScreenText"]) => {
    if (disabled) return;
    setDraft((prev) => {
      const next = updater(prev);
      draftRef.current = next;
      scheduleSave(next);
      return next;
    });
  };

  const handleFocus = () => {
    if (disabled) return;
    isEditingRef.current = true;
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!containerRef.current?.contains(active)) {
        isEditingRef.current = false;
        commitSave();
      }
    }, 0);
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.style.opacity = "0.4";
    }, 0);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const onDragEnd = (e: React.DragEvent) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    target.style.opacity = "1";
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    updateDraft((prev) => {
      const nextBullets = [...prev.bullets];
      const [reordered] = nextBullets.splice(draggedIndex, 1);
      nextBullets.splice(index, 0, reordered);
      return { ...prev, bullets: nextBullets };
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={`space-y-5 rounded-[7px] p-2 transition-colors ${disabled ? 'opacity-60' : ''} ${invalid ? 'bg-red-500/10 ring-1 ring-red-500/40' : ''}`} ref={containerRef}>
      <div className="relative space-y-2">
        <div className="relative">
          <input
            className={`w-full px-4 bg-[hsl(var(--editor-input))] border rounded-[6px] font-semibold text-foreground text-sm outline-none transition-all h-9 ${
              invalid
                ? 'border-red-500/60 bg-red-500/10 focus:border-red-500/70'
                : 'border-[hsl(var(--editor-input-border))] focus:border-primary/40'
            }`}
            value={draft.title}
            onChange={(e) => updateDraft((prev) => ({ ...prev, title: e.target.value }))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
          />
          {/* Parent connector: starts below the title block, ~20px inset */}
          <span className="pointer-events-none absolute left-5 top-full h-3 border-l border-dashed border-[hsl(var(--editor-border))]/80" />
        </div>
        <div className="relative pt-1 space-y-2">
          {/* Main trunk: connected to title stem, ends at add-button row line */}
          <span className="pointer-events-none absolute left-5 top-0 bottom-[18px] border-l border-dashed border-[hsl(var(--editor-border))]/80" />
          {draft.bullets.map((bullet, idx) => (
            <div key={`${blockId}-bullet-${idx}`} className="relative pl-9">
              <span className="pointer-events-none absolute left-5 top-1/2 w-4 -translate-y-1/2 border-t border-dashed border-[hsl(var(--editor-border))]/75" />
              <div
                draggable={!disabled}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
                onDrop={(e) => onDrop(e, idx)}
                className={`flex items-center gap-3 group bg-[hsl(var(--editor-input))] px-4 py-0 rounded-[6px] border transition-all cursor-move h-9 ${
                  dragOverIndex === idx && draggedIndex !== idx
                    ? "border-orange-500 border-dashed"
                    : "border-[hsl(var(--editor-input-border))] hover:border-orange-500/30"
                }`}
              >
                <GripVertical size={14} className="text-muted-foreground/60 group-hover:text-muted-foreground flex-shrink-0" />
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full flex-shrink-0" />
                <input
                  className="flex-1 text-sm outline-none font-medium text-foreground transition-colors cursor-text h-9 bg-transparent border border-transparent px-2"
                  value={bullet}
                  onChange={(e) =>
                    updateDraft((prev) => {
                      const nextBullets = [...prev.bullets];
                      nextBullets[idx] = e.target.value;
                      return { ...prev, bullets: nextBullets };
                    })
                  }
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  disabled={disabled}
                />
                <button
                  onClick={() =>
                    updateDraft((prev) => ({
                      ...prev,
                      bullets: prev.bullets.filter((_, i) => i !== idx)
                    }))
                  }
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/60 hover:text-red-500 transition-opacity cursor-pointer"
                  disabled={disabled}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          <div className="relative pl-9 pt-0.5">
            <span className="pointer-events-none absolute left-5 top-1/2 w-4 -translate-y-1/2 border-t border-dashed border-[hsl(var(--editor-border))]/75" />
            <button
              onClick={() =>
                updateDraft((prev) => ({
                  ...prev,
                  bullets: [...prev.bullets, "New Key Point"]
                }))
              }
              className="w-full h-9 px-3 rounded-[6px] border border-dashed border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/35 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 inline-flex items-center justify-center gap-1.5 hover:bg-[hsl(var(--editor-surface-2))]/55 hover:text-muted-foreground transition-colors disabled:opacity-60"
              disabled={disabled}
            >
              <Plus size={12} /> Add New Point
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

OnScreenEditor.displayName = "OnScreenEditor";

type ImagePromptEditorProps = {
  blockId: string;
  value: LessonBlock["imagePrompt"];
  onSave: (blockId: string, value: LessonBlock["imagePrompt"]) => void;
  disabled?: boolean;
  invalid?: boolean;
};

const MAX_IMAGE_SEED = 2147483647;
const ASSETS_JOB_STORAGE_KEY = 'vizlec_assets_job';
const MIXER_MIN_DB = -60;
const MIXER_MAX_DB = 6;
const MIXER_DB_TICKS = [6, 0, -6, -12, -18, -30, -60] as const;
const MIXER_MAX_GAIN = Math.pow(10, MIXER_MAX_DB / 20);

const clampSeedValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > MAX_IMAGE_SEED) return MAX_IMAGE_SEED;
  return Math.floor(value);
};

const generateRandomSeed = () => Math.floor(Math.random() * MAX_IMAGE_SEED);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampMixerLinearGain = (value: number) => Math.max(0, Math.min(MIXER_MAX_GAIN, value));
const clampMixerDb = (value: number) => Math.max(MIXER_MIN_DB, Math.min(MIXER_MAX_DB, value));
const dbToLinearGain = (db: number) => {
  if (!Number.isFinite(db)) return 0;
  if (db <= MIXER_MIN_DB) return 0;
  return Math.pow(10, db / 20);
};
const linearGainToDb = (gain: number) => {
  const safe = clampMixerLinearGain(gain);
  if (safe <= 0.000001) return MIXER_MIN_DB;
  return clampMixerDb(20 * Math.log10(safe));
};
const formatDbLabel = (db: number) => {
  if (db <= MIXER_MIN_DB) return '-inf dB';
  const rounded = Math.round(db * 10) / 10;
  if (Math.abs(rounded) < 0.05) return '0 dB';
  return `${rounded > 0 ? '+' : ''}${rounded} dB`;
};

type AssetsJobStorage = {
  jobId: string;
  versionId: string;
  kind: 'batch' | 'block';
  blockId?: string;
};

type JobPhase = 'idle' | 'waiting' | 'running';
type SingleQueueState = {
  total: number;
  completed: number;
  active: number;
};

const ImagePromptEditor: React.FC<ImagePromptEditorProps> = React.memo(({ blockId, value, onSave, disabled = false, invalid = false }) => {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const saveTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (disabled) {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      isEditingRef.current = false;
      setDraft(value);
      draftRef.current = value;
      return;
    }
    if (!isEditingRef.current) {
      setDraft(value);
      draftRef.current = value;
    }
  }, [value, disabled]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  const scheduleSave = (nextValue: LessonBlock["imagePrompt"]) => {
    if (disabled) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      onSave(blockId, nextValue);
      saveTimer.current = null;
    }, 400);
  };

  const commitSave = () => {
    if (disabled) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSave(blockId, draftRef.current);
  };

  const updateDraft = (updater: (prev: LessonBlock["imagePrompt"]) => LessonBlock["imagePrompt"]) => {
    if (disabled) return;
    setDraft((prev) => {
      const next = updater(prev);
      draftRef.current = next;
      scheduleSave(next);
      return next;
    });
  };

  const handleFocus = () => {
    if (disabled) return;
    isEditingRef.current = true;
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!containerRef.current?.contains(active)) {
        isEditingRef.current = false;
        commitSave();
      }
    }, 0);
  };

  return (
    <div className={`space-y-2 rounded-[7px] p-1 transition-colors ${disabled ? 'opacity-60' : ''} ${invalid ? 'bg-red-500/10 ring-1 ring-red-500/40' : ''}`} ref={containerRef}>
      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Prompt</label>
        <textarea
          className={`w-full p-3 bg-[hsl(var(--editor-input))] border rounded-[6px] text-xs text-foreground font-medium outline-none transition-all resize-none leading-relaxed h-20 ${
            invalid
              ? 'border-red-500/60 bg-red-500/10 focus:border-red-500/70'
              : 'border-[hsl(var(--editor-input-border))] focus:border-primary/40'
          }`}
          value={draft.prompt}
          onChange={(e) => updateDraft((prev) => ({ ...prev, prompt: e.target.value }))}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Avoid</label>
          <input
            className="w-full bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[6px] text-xs outline-none focus:border-primary/40 transition-all h-9 text-foreground px-3"
            value={draft.avoid}
            onChange={(e) => updateDraft((prev) => ({ ...prev, avoid: e.target.value }))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
          />
        </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Seed</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={MAX_IMAGE_SEED}
                step={1}
                value={draft.seedNumber}
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed = raw === '' ? 0 : Number(raw);
                  const nextSeed = clampSeedValue(parsed);
                  updateDraft((prev) => ({ ...prev, seedNumber: nextSeed }));
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={disabled}
                className="w-full bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-xs font-mono font-bold text-orange-600 rounded-[6px] h-9 px-3 outline-none focus:border-primary/40 transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  const nextSeed = generateRandomSeed();
                  updateDraft((prev) => ({ ...prev, seedNumber: nextSeed }));
                }}
                disabled={disabled}
                className="h-9 w-9 flex items-center justify-center bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-[6px] text-orange-600 hover:bg-orange-100/70 dark:hover:bg-orange-900/30 transition-all disabled:opacity-60"
                title="Randomize seed"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
      </div>
    </div>
  );
});

ImagePromptEditor.displayName = "ImagePromptEditor";

type LegacyLessonVersion = {
  id: string;
  lessonId: string;
  speechRateWps: number;
  preferredVoiceId?: string | null;
  preferredTemplateId?: string | null;
  voiceVolume?: string | number | null;
  masterVolume?: string | number | null;
  bgmPath?: string | null;
  bgmVolume?: number | null;
  createdAt: string;
};

type BgmLibraryItem = {
  path: string;
  name: string;
  sizeBytes: number;
  ext: string;
};

type LegacyBlock = {
  id: string;
  lessonVersionId: string;
  videoVersionId?: string;
  index: number;
  sourceText: string;
  ttsText: string;
  onScreenJson: string | null;
  imagePromptJson?: string | null;
  status: string | null;
  segmentError?: string | null;
  audioDurationS?: number | null;
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

const formatSrtTimestamp = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

type SubtitleCuesPayload = {
  template_id?: string;
  width?: number;
  height?: number;
  cues?: SubtitleCue[];
};

type SubtitleRawFileEntry = {
  block_index?: number;
  offset_start?: number;
  offset_end?: number;
  expected_duration?: number | null;
  detected_duration?: number | null;
};

type SubtitleRawPayload = {
  files?: SubtitleRawFileEntry[];
  block_windows?: { block_index?: number; start?: number; end?: number }[];
};

type SlideTemplateOption = {
  id: string;
  label: string;
  kind: string;
};

type TtsVoiceOption = {
  id: string;
  label: string;
  description?: string | null;
  preview_url?: string | null;
};

type AppSettings = {
  tts?: {
    defaultVoiceId?: string | null;
  };
};

type JobStateEntry = {
  active: boolean;
  jobId: string | null;
  status: string;
  phase: JobPhase;
  current: number;
  total: number;
};

type JobStatePayload = {
  finalVideoReady?: boolean;
  lastFinalVideoRenderSeconds?: number | null;
  segment: JobStateEntry;
  tts: JobStateEntry;
  image: JobStateEntry;
  slides: JobStateEntry;
  transcription?: JobStateEntry;
  finalVideo: JobStateEntry;
  blockJobs?: {
    segment?: Array<{ jobId: string; blockId: string; status: string; phase: JobPhase }>;
    tts?: Array<{ jobId: string; blockId: string; status: string; phase: JobPhase }>;
    image?: Array<{ jobId: string; blockId: string; status: string; phase: JobPhase }>;
  };
};

type SubtitleListPayload = {
  ready?: boolean;
  items?: Array<{
    kind: string;
    exists: boolean;
    createdAt?: string | null;
  }>;
};

const templateColors = [
  'bg-slate-900',
  'bg-indigo-500/20',
  'bg-emerald-500/20',
  'bg-orange-500/20'
];
const resolveTemplateLayout = (kind?: string): Template['layout'] => {
  if (kind === 'text') return 'centered';
  if (kind === 'image') return 'split';
  return 'overlay';
};
const AUDIO_CHAR_LIMIT = 200;
const TTS_OFFLINE_GRACE_MS = 3 * 60 * 1000;
const getNarratedCharCount = (text?: string) => (text ?? '').length;

const parseOnScreen = (raw: string | null): { title?: string; bullets?: string[] } | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { title?: string; bullets?: string[] };
  } catch {
    return null;
  }
};

const parseImagePrompt = (raw: string | null | undefined): { block_prompt?: string; avoid?: string; seed_hint?: string; seed?: number } | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { block_prompt?: string; avoid?: string; seed_hint?: string; seed?: number };
  } catch {
    return null;
  }
};

const hasOnScreenText = (block: LessonBlock) => Boolean(block.onScreenText?.title?.trim());
const hasImagePromptText = (block: LessonBlock) => Boolean(block.imagePrompt?.prompt?.trim());
const SLIDES_DISABLED_MVP = true;

const mapLegacyStatus = (status?: string | null): LessonBlock['status'] => {
  if (!status) return 'Empty';
  if (status.toLowerCase().includes('segment_error') || status.toLowerCase().includes('error')) return 'Error';
  if (status.toLowerCase().includes('ready')) return 'Ready';
  if (status.toLowerCase().includes('image')) return 'Image Pending';
  if (status.toLowerCase().includes('edit')) return 'Editing Now';
  return 'Editing Now';
};

const formatActiveCounter = (
  phase: JobPhase,
  progress: { current: number; total: number } | null
) => {
  const total = Math.max(0, progress?.total ?? 0);
  const rawCurrent = Math.max(0, progress?.current ?? 0);
  if (total === 0) return `0/${total}`;
  if (phase === 'running') {
    const runningCurrent = Math.min(total, Math.max(1, rawCurrent + 1));
    return `${runningCurrent}/${total}`;
  }
  return `${Math.min(total, rawCurrent)}/${total}`;
};

const formatElapsedTime = (totalSeconds: number) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const RightRailIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
    {open ? <rect x="15.8" y="4.5" width="4.7" height="15" rx="1.2" fill="currentColor" opacity="0.35" stroke="none" /> : null}
  </svg>
);

const Editor: React.FC<EditorProps> = ({
  lessonId,
  dispatchAgentId,
  lessonTitle,
  moduleTitle,
  courseTitle,
  autoQueuePlan,
  onImageClick,
  onGoCourse,
  onGoModule
}) => {
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string>('');
  const [templateOptions, setTemplateOptions] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template>({
    id: '',
    name: 'Select Template',
    previewColor: 'bg-slate-900',
    fontFamily: 'Inter',
    layout: 'centered'
  });
  const [versions, setVersions] = useState<LegacyLessonVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [slideTemplates, setSlideTemplates] = useState<SlideTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [bgmLibrary, setBgmLibrary] = useState<BgmLibraryItem[]>([]);
  const [selectedBgmPath, setSelectedBgmPath] = useState<string>('');
  const [voiceVolumeDraft, setVoiceVolumeDraft] = useState<number>(1);
  const [masterVolumeDraft, setMasterVolumeDraft] = useState<number>(1);
  const [bgmVolumeDraft, setBgmVolumeDraft] = useState<number>(0.2);
  const [mixerIsPlaying, setMixerIsPlaying] = useState(false);
  const [mixerVoiceMuted, setMixerVoiceMuted] = useState(false);
  const [mixerMusicMuted, setMixerMusicMuted] = useState(false);
  const [mixerVoiceIndex, setMixerVoiceIndex] = useState(0);
  const [mixerMasterPeak, setMixerMasterPeak] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [assetsRevision, setAssetsRevision] = useState(0);
  const [audioRevisions, setAudioRevisions] = useState<Record<string, number>>({});
  const [imageRevisions, setImageRevisions] = useState<Record<string, number>>({});
  const [slideAvailability, setSlideAvailability] = useState<Record<string, boolean>>({});
  const [slideAvailabilityLoadedKey, setSlideAvailabilityLoadedKey] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [brokenRawImages, setBrokenRawImages] = useState<Record<string, boolean>>({});
  const [brokenSlides, setBrokenSlides] = useState<Record<string, boolean>>({});
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState<{ current: number; total: number } | null>(null);
  const [segmentPhase, setSegmentPhase] = useState<JobPhase>('idle');
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsProgress, setTtsProgress] = useState<{ current: number; total: number } | null>(null);
  const [ttsPhase, setTtsPhase] = useState<JobPhase>('idle');
  const [singleTtsQueue, setSingleTtsQueue] = useState<SingleQueueState>({
    total: 0,
    completed: 0,
    active: 0
  });
  const [singleImageQueue, setSingleImageQueue] = useState<SingleQueueState>({
    total: 0,
    completed: 0,
    active: 0
  });
  const [singleImagePhase, setSingleImagePhase] = useState<JobPhase>('idle');
  const [singleTextQueue, setSingleTextQueue] = useState<SingleQueueState>({
    total: 0,
    completed: 0,
    active: 0
  });
  const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
  const [imagePhase, setImagePhase] = useState<JobPhase>('idle');
  const [segmentJobId, setSegmentJobId] = useState<string | null>(null);
  const [assetsJobId, setAssetsJobId] = useState<string | null>(null);
  const [assetsJobMode, setAssetsJobMode] = useState<'none' | 'image' | 'slides'>('none');
  const [ttsJobId, setTtsJobId] = useState<string | null>(null);
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);
  const [isGeneratingTranscription, setIsGeneratingTranscription] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState<{ current: number; total: number } | null>(null);
  const [transcriptionPhase, setTranscriptionPhase] = useState<JobPhase>('idle');
  const [subtitleFiles, setSubtitleFiles] = useState<Record<string, boolean>>({});
  const [subtitleListRevision, setSubtitleListRevision] = useState(0);
  const [subtitleCuesData, setSubtitleCuesData] = useState<SubtitleCuesPayload | null>(null);
  const [subtitleRawData, setSubtitleRawData] = useState<SubtitleRawPayload | null>(null);
  const [subtitleReviewTextByVersion, setSubtitleReviewTextByVersion] = useState<Record<string, Record<string, string>>>({});
  const [finalVideoJobId, setFinalVideoJobId] = useState<string | null>(null);
  const [isGeneratingFinalVideo, setIsGeneratingFinalVideo] = useState(false);
  const [finalVideoProgress, setFinalVideoProgress] = useState<{ current: number; total: number } | null>(null);
  const [finalVideoPhase, setFinalVideoPhase] = useState<JobPhase>('idle');
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [isFinalVideoModalOpen, setIsFinalVideoModalOpen] = useState(false);
  const [isDownloadingFinalVideo, setIsDownloadingFinalVideo] = useState(false);
  const [finalVideoDownloadError, setFinalVideoDownloadError] = useState<string | null>(null);
  const [finalVideoElapsedSeconds, setFinalVideoElapsedSeconds] = useState(0);
  const [finalVideoLastElapsedSeconds, setFinalVideoLastElapsedSeconds] = useState<number | null>(null);
  const [audioReviewActive, setAudioReviewActive] = useState(false);
  const [audioReviewQueue, setAudioReviewQueue] = useState<string[]>([]);
  const [audioReviewIndex, setAudioReviewIndex] = useState(0);
  const [audioReviewMarked, setAudioReviewMarked] = useState<Record<string, boolean>>({});
  const [audioReviewStartedByVersion, setAudioReviewStartedByVersion] = useState<Record<string, boolean>>({});
  const [audioReviewCheckedByVersion, setAudioReviewCheckedByVersion] = useState<Record<string, Record<string, boolean>>>({});
  const [audioReviewPlaying, setAudioReviewPlaying] = useState(false);
  const [audioReviewRegenerating, setAudioReviewRegenerating] = useState(false);
  const [audioReviewPopupReady, setAudioReviewPopupReady] = useState(false);
  const [audioReviewModalVisible, setAudioReviewModalVisible] = useState(false);
  const [audioReviewCurrentTime, setAudioReviewCurrentTime] = useState(0);
  const [audioReviewDuration, setAudioReviewDuration] = useState(0);
  const [audioReviewSeekableEnd, setAudioReviewSeekableEnd] = useState(0);
  const [audioReviewTextDraft, setAudioReviewTextDraft] = useState('');
  const [audioReviewTextFocused, setAudioReviewTextFocused] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<TtsVoiceOption[]>([]);
  const [ttsHealthy, setTtsHealthy] = useState(true);
  const [ttsHealthChecked, setTtsHealthChecked] = useState(false);
  const [ttsHealthError, setTtsHealthError] = useState<string | null>(null);
  const [ttsHealthWarmupActive, setTtsHealthWarmupActive] = useState(false);
  const [imagePanelTabs, setImagePanelTabs] = useState<Record<string, 'image' | 'prompt'>>({});
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [isMobileActionsMenuOpen, setIsMobileActionsMenuOpen] = useState(false);
  const [isScriptSidebarOpen, setIsScriptSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [templateSearch, setTemplateSearch] = useState('');
  const [generatingStates, setGeneratingStates] = useState<Record<string, { text: boolean, image: boolean, audio?: boolean, global?: boolean }>>({});
  const [isImageBatchCancelConfirmOpen, setIsImageBatchCancelConfirmOpen] = useState(false);
  const [isAudioBatchCancelConfirmOpen, setIsAudioBatchCancelConfirmOpen] = useState(false);
  const [isSegmentCancelConfirmOpen, setIsSegmentCancelConfirmOpen] = useState(false);
  const [isSlidesBatchCancelConfirmOpen, setIsSlidesBatchCancelConfirmOpen] = useState(false);
  const [isTranscriptionCancelConfirmOpen, setIsTranscriptionCancelConfirmOpen] = useState(false);
  const [isFinalVideoCancelConfirmOpen, setIsFinalVideoCancelConfirmOpen] = useState(false);
  const [isFinalVideoPreflightConfirmOpen, setIsFinalVideoPreflightConfirmOpen] = useState(false);
  const [finalVideoPreflightDescription, setFinalVideoPreflightDescription] = useState('');
  const [slidesProgress, setSlidesProgress] = useState<{ current: number; total: number } | null>(null);
  const [slidesPhase, setSlidesPhase] = useState<JobPhase>('idle');

  // Lesson Voice Selection State (Global for all blocks in this lesson)
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [lessonVoiceId, setLessonVoiceId] = useState<string | undefined>();
  const [defaultVoiceId, setDefaultVoiceId] = useState<string | undefined>();
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const dispatchAgentIdRef = useRef<string | null>(dispatchAgentId ?? null);
  const narratedDraftsRef = useRef<Record<string, string>>({});
  const ttsBatchStartPendingRef = useRef(false);
  const singleTtsJobsRef = useRef<Record<string, { blockId: string; done: boolean }>>({});
  const singleImageJobsRef = useRef<Record<string, { blockId: string; done: boolean }>>({});
  const singleTextJobsRef = useRef<Record<string, { blockId: string; done: boolean }>>({});
  const processedTerminalJobEventsRef = useRef<Set<string>>(new Set());
  const lastSegmentReadyCountRef = useRef<number | null>(null);
  const lastTtsReadyCountRef = useRef<number | null>(null);
  const lastImageReadyCountRef = useRef<number | null>(null);
  const segmentJobIdRef = useRef<string | null>(null);
  const ttsJobIdRef = useRef<string | null>(null);
  const transcriptionJobIdRef = useRef<string | null>(null);
  const assetsJobIdRef = useRef<string | null>(null);
  const finalVideoJobIdRef = useRef<string | null>(null);
  const selectedVersionIdRef = useRef<string | null>(null);
  const hasInitializedTemplateSelectionRef = useRef(false);
  const autoSlidesForTemplateSwitchRef = useRef<{ key: string | null; armed: boolean }>({
    key: null,
    armed: false
  });
  const bgmVolumeSaveTimeoutRef = useRef<number | null>(null);
  const voiceVolumeSaveTimeoutRef = useRef<number | null>(null);
  const masterVolumeSaveTimeoutRef = useRef<number | null>(null);
  const bgmPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mixerVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const mixerAudioContextRef = useRef<AudioContext | null>(null);
  const mixerBgmSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mixerVoiceSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mixerBgmGainNodeRef = useRef<GainNode | null>(null);
  const mixerVoiceGainNodeRef = useRef<GainNode | null>(null);
  const mixerMasterGainNodeRef = useRef<GainNode | null>(null);
  const mixerAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const mixerMeterFrameRef = useRef<number | null>(null);
  const audioReviewRef = useRef<HTMLAudioElement | null>(null);
  const audioReviewItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const audioReviewModalRef = useRef<HTMLDivElement | null>(null);
  const audioReviewOpenJustStartedRef = useRef(false);
  const audioReviewAdvanceTimerRef = useRef<number | null>(null);
  const autoQueueHandledRequestRef = useRef<string | null>(null);
  const autoQueuePhaseRef = useRef<'idle' | 'waiting_audio' | 'waiting_image' | 'done'>('idle');
  const autoQueueGenerateImageRef = useRef(false);
  const finalVideoStartedAtRef = useRef<number | null>(null);
  const ttsHealthFailuresRef = useRef(0);
  const ttsHealthFirstFailureAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (blocks.length === 0) return;
    setImagePanelTabs((prev) => {
      let changed = false;
      const next: Record<string, 'image' | 'prompt'> = { ...prev };
      const blockIds = new Set(blocks.map((block) => block.id));

      for (const blockId of Object.keys(next)) {
        if (!blockIds.has(blockId)) {
          delete next[blockId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [blocks]);

  useEffect(() => {
    segmentJobIdRef.current = segmentJobId;
  }, [segmentJobId]);

  useEffect(() => {
    ttsJobIdRef.current = ttsJobId;
  }, [ttsJobId]);

  useEffect(() => {
    transcriptionJobIdRef.current = transcriptionJobId;
  }, [transcriptionJobId]);

  useEffect(() => {
    assetsJobIdRef.current = assetsJobId;
  }, [assetsJobId]);

  useEffect(() => {
    finalVideoJobIdRef.current = finalVideoJobId;
  }, [finalVideoJobId]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  const slideBrokenKey = useCallback((blockId: string, templateId: string) => {
    return `${blockId}::${templateId}`;
  }, []);

  const isSlideBrokenForActiveTemplate = useCallback(
    (blockId: string) => {
      if (!selectedTemplateId) return false;
      return Boolean(brokenSlides[slideBrokenKey(blockId, selectedTemplateId)]);
    },
    [brokenSlides, selectedTemplateId, slideBrokenKey]
  );

  const clearBrokenSlidesForBlocks = useCallback(
    (blockIds: string[]) => {
      if (blockIds.length === 0) return;
      setBrokenSlides((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const blockId of blockIds) {
          if (blockId in next) {
            delete next[blockId];
            changed = true;
          }
          for (const key of Object.keys(next)) {
            if (key.startsWith(`${blockId}::`)) {
              delete next[key];
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    },
    []
  );

  const markBrokenSlideForActiveTemplate = useCallback(
    (blockId: string) => {
      if (!selectedTemplateId) return;
      const key = slideBrokenKey(blockId, selectedTemplateId);
      setBrokenSlides((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    },
    [selectedTemplateId, slideBrokenKey]
  );

  useEffect(() => {
    dispatchAgentIdRef.current = dispatchAgentId ?? null;
  }, [dispatchAgentId]);

  const checkTtsHealth = useCallback(async () => {
    const markHealthy = () => {
      ttsHealthFailuresRef.current = 0;
      ttsHealthFirstFailureAtRef.current = null;
      setTtsHealthy(true);
      setTtsHealthChecked(true);
      setTtsHealthError(null);
      setTtsHealthWarmupActive(false);
      return true;
    };
    const markFailure = (message: string) => {
      const now = Date.now();
      ttsHealthFailuresRef.current += 1;
      if (ttsHealthFirstFailureAtRef.current === null) {
        ttsHealthFirstFailureAtRef.current = now;
      }
      const elapsed = now - ttsHealthFirstFailureAtRef.current;
      setTtsHealthChecked(true);
      if (elapsed < TTS_OFFLINE_GRACE_MS) {
        // Keep TTS enabled while XTTS is still warming up; rechecks continue in background.
        setTtsHealthy(true);
        setTtsHealthError(null);
        setTtsHealthWarmupActive(true);
        return true;
      }
      setTtsHealthy(false);
      setTtsHealthError(message);
      setTtsHealthWarmupActive(false);
      return false;
    };

    try {
      const providerInfo = await apiGet<{ provider?: string }>('/tts/provider', { cacheMs: 0 });
      const provider = providerInfo?.provider?.toLowerCase() ?? '';
      if (provider !== 'xtts' && provider !== 'xtts_api') {
        return markHealthy();
      }
      const agentQuery = dispatchAgentId ? `?agentId=${encodeURIComponent(dispatchAgentId)}` : '';
      const status = await apiGet<{ ok: boolean; error?: string }>(`/integrations/xtts/health${agentQuery}`, { cacheMs: 0 });
      const ok = Boolean(status?.ok);
      if (ok) {
        return markHealthy();
      }
      return markFailure(status?.error ?? 'XTTS API unavailable.');
    } catch (err) {
      return markFailure((err as Error).message ?? 'XTTS API unavailable.');
    }
  }, [dispatchAgentId]);

  const ensureTtsReady = useCallback(async () => {
    const ok = await checkTtsHealth();
    if (!ok) {
      setError(ttsHealthError ?? 'XTTS API unavailable.');
    }
    return ok;
  }, [checkTtsHealth, ttsHealthError]);

  useEffect(() => {
    setSlideTemplates([]);
    setSelectedTemplateId('');

    const agentQuery = dispatchAgentId ? `?agentId=${encodeURIComponent(dispatchAgentId)}` : '';
    apiGet<{ voices: TtsVoiceOption[] }>(`/tts/voices${agentQuery}`)
      .then((data) => setTtsVoices(data.voices ?? []))
      .catch((err) => {
        console.error(err);
        setError(err.message ?? 'Failed to load voices.');
      });
    checkTtsHealth();

    apiGet<AppSettings>('/settings')
      .then((data) => {
        const nextDefaultVoiceId = data.tts?.defaultVoiceId ?? undefined;
        setDefaultVoiceId(nextDefaultVoiceId);
        if (nextDefaultVoiceId) setLessonVoiceId(nextDefaultVoiceId);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message ?? 'Failed to load settings.');
      });

    apiGet<{ items: BgmLibraryItem[] }>('/bgm/library')
      .then((data) => setBgmLibrary(data.items ?? []))
      .catch((err) => {
        console.error(err);
        setError(err.message ?? 'Failed to load BGM library.');
      });
  }, [checkTtsHealth]);

  const selectedVersion = useMemo(
    () => versions.find((item) => item.id === selectedVersionId) ?? null,
    [versions, selectedVersionId]
  );

  const updateSelectedVersionPreferences = useCallback(
    async (payload: {
      preferredVoiceId?: string | null;
      preferredTemplateId?: string | null;
      voiceVolume?: number | null;
      masterVolume?: number | null;
      bgmPath?: string | null;
      bgmVolume?: number | null;
    }) => {
      if (!selectedVersionId) return;
      try {
        const updated = await apiPatch<{
          id: string;
          preferredVoiceId?: string | null;
          preferredTemplateId?: string | null;
          voiceVolume?: number | null;
          masterVolume?: number | null;
          bgmPath?: string | null;
          bgmVolume?: number | null;
        }>(`/video-versions/${selectedVersionId}/preferences`, payload);
        setVersions((prev) =>
          prev.map((item) =>
            item.id === selectedVersionId
              ? {
                  ...item,
                  preferredVoiceId:
                    payload.preferredVoiceId !== undefined
                      ? updated.preferredVoiceId ?? null
                      : item.preferredVoiceId ?? null,
                  preferredTemplateId:
                    payload.preferredTemplateId !== undefined
                      ? updated.preferredTemplateId ?? null
                      : item.preferredTemplateId ?? null,
                  voiceVolume:
                    payload.voiceVolume !== undefined
                      ? (typeof updated.voiceVolume === 'number' ? updated.voiceVolume : null)
                      : (typeof item.voiceVolume === 'number' ? item.voiceVolume : null),
                  masterVolume:
                    payload.masterVolume !== undefined
                      ? (typeof updated.masterVolume === 'number' ? updated.masterVolume : null)
                      : (typeof item.masterVolume === 'number' ? item.masterVolume : null),
                  bgmPath:
                    payload.bgmPath !== undefined
                      ? updated.bgmPath ?? null
                      : item.bgmPath ?? null,
                  bgmVolume:
                    payload.bgmVolume !== undefined
                      ? (typeof updated.bgmVolume === 'number' ? updated.bgmVolume : null)
                      : (typeof item.bgmVolume === 'number' ? item.bgmVolume : null)
                }
              : item
          )
        );
      } catch (err) {
        console.error(err);
        setError((err as Error).message ?? 'Failed to save video generation preferences.');
      }
    },
    [selectedVersionId]
  );

  useEffect(() => {
    if (!selectedVersionId || !selectedVersion) return;
    const preferredVoiceId = selectedVersion.preferredVoiceId?.trim() || null;
    setLessonVoiceId(preferredVoiceId ?? defaultVoiceId);
    const preferredTemplateId = selectedVersion.preferredTemplateId?.trim() || null;
    const fallbackTemplateId =
      slideTemplates.find((item) => item.kind === 'image')?.id ?? slideTemplates[0]?.id ?? '';
    const hasPreferredTemplate =
      Boolean(preferredTemplateId) &&
      slideTemplates.some((item) => item.id === preferredTemplateId);
    setSelectedTemplateId(hasPreferredTemplate ? (preferredTemplateId as string) : fallbackTemplateId);
    setVoiceVolumeDraft(
      typeof selectedVersion.voiceVolume === 'number' && Number.isFinite(selectedVersion.voiceVolume)
        ? clampMixerLinearGain(selectedVersion.voiceVolume)
        : 1
    );
    setMasterVolumeDraft(
      typeof selectedVersion.masterVolume === 'number' && Number.isFinite(selectedVersion.masterVolume)
        ? clampMixerLinearGain(selectedVersion.masterVolume)
        : 1
    );
    setSelectedBgmPath(selectedVersion.bgmPath?.trim() || '');
    setBgmVolumeDraft(
      typeof selectedVersion.bgmVolume === 'number' && Number.isFinite(selectedVersion.bgmVolume)
        ? clampMixerLinearGain(selectedVersion.bgmVolume)
        : 0.2
    );
  }, [selectedVersionId, selectedVersion, slideTemplates, defaultVoiceId]);

  useEffect(() => {
    if (slideTemplates.length === 0) return;
    const mapped = slideTemplates.map((item, index) => ({
      id: item.id,
      name: item.label,
      previewColor: templateColors[index % templateColors.length],
      fontFamily: 'Inter',
      layout: resolveTemplateLayout(item.kind)
    }));
    setTemplateOptions(mapped);
    setActiveTemplate(
      (prev) =>
        mapped.find((t) => t.id === selectedTemplateId) ??
        mapped.find((t) => t.id === prev.id) ??
        mapped[0]
    );
  }, [slideTemplates, selectedTemplateId]);

  useEffect(() => {
    return () => {
      const mixerCtx = mixerAudioContextRef.current;
      if (mixerMeterFrameRef.current) {
        cancelAnimationFrame(mixerMeterFrameRef.current);
        mixerMeterFrameRef.current = null;
      }
      if (mixerCtx) {
        void mixerCtx.close().catch(() => null);
        mixerAudioContextRef.current = null;
      }
      if (bgmVolumeSaveTimeoutRef.current) {
        window.clearTimeout(bgmVolumeSaveTimeoutRef.current);
        bgmVolumeSaveTimeoutRef.current = null;
      }
      if (voiceVolumeSaveTimeoutRef.current) {
        window.clearTimeout(voiceVolumeSaveTimeoutRef.current);
        voiceVolumeSaveTimeoutRef.current = null;
      }
      if (masterVolumeSaveTimeoutRef.current) {
        window.clearTimeout(masterVolumeSaveTimeoutRef.current);
        masterVolumeSaveTimeoutRef.current = null;
      }
      processedTerminalJobEventsRef.current.clear();
      singleTtsJobsRef.current = {};
      singleImageJobsRef.current = {};
      singleTextJobsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!lessonId) {
      setVersions([]);
      setSelectedVersionId(null);
      setBlocks([]);
      setActiveBlockId('');
      narratedDraftsRef.current = {};
      setIsLoadingVersions(false);
      return;
    }
    setIsLoadingVersions(true);
    apiGet<LegacyLessonVersion[]>(`/videos/${lessonId}/versions`)
      .then((items) => {
        setVersions(items);
        setSelectedVersionId(items[0]?.id ?? null);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message ?? 'Failed to load video versions.');
        setVersions([]);
        setSelectedVersionId(null);
      })
      .finally(() => {
        setIsLoadingVersions(false);
      });
  }, [lessonId]);

  useEffect(() => {
    if (!selectedVersionId) {
      setBlocks([]);
      setActiveBlockId('');
      narratedDraftsRef.current = {};
      setIsLoadingBlocks(false);
      setFinalVideoUrl(null);
      setIsGeneratingFinalVideo(false);
      setFinalVideoJobId(null);
      setFinalVideoPhase('idle');
      setFinalVideoProgress(null);
      setFinalVideoLastElapsedSeconds(null);
      setAudioReviewActive(false);
      setAudioReviewQueue([]);
      setAudioReviewIndex(0);
      setAudioReviewMarked({});
      setAudioReviewPlaying(false);
      setAudioReviewRegenerating(false);
      setSubtitleCuesData(null);
      return;
    }
    setIsLoadingBlocks(true);
    apiGet<LegacyBlock[]>(`/video-versions/${selectedVersionId}/blocks`)
      .then((items) => {
        const mapped = items.map((block) => {
          const prompt = parseImagePrompt(block.imagePromptJson);
          return {
            id: block.id,
            number: String(block.index),
            title: '',
            duration: '',
            status: mapLegacyStatus(block.status),
            thumbnail: '/lesson-placeholder.svg',
            thumbLandscape: '/lesson-placeholder.svg',
            thumbPortrait: '/lesson-placeholder-portrait.svg',
            audioDurationSeconds:
              typeof block.audioDurationS === 'number' && Number.isFinite(block.audioDurationS)
                ? block.audioDurationS
                : null,
            originalText: block.sourceText ?? '',
            narratedText: block.ttsText ?? block.sourceText ?? '',
            onScreenText: {
              title: '',
              bullets: []
            },
            imagePrompt: {
              prompt: prompt?.block_prompt ?? '',
              avoid: prompt?.avoid ?? '',
              seedText: prompt?.seed_hint ?? '',
              seedNumber: prompt?.seed ?? 0
            }
          } as LessonBlock;
        });
        setBlocks(mapped);
        setActiveBlockId(mapped[0]?.id ?? '');
      })
      .catch((err) => {
        console.error(err);
        setError(err.message ?? 'Failed to load blocks.');
        setBlocks([]);
        setActiveBlockId('');
      })
      .finally(() => {
        setIsLoadingBlocks(false);
      });
  }, [selectedVersionId]);

  useEffect(() => {
    setSlideAvailability({});
    setBrokenSlides({});
    setSlideAvailabilityLoadedKey(null);
  }, [selectedVersionId, selectedTemplateId, assetsRevision]);

  useEffect(() => {
    if (SLIDES_DISABLED_MVP) {
      autoSlidesForTemplateSwitchRef.current = { key: null, armed: false };
      return;
    }
    if (!selectedVersionId || !selectedTemplateId) {
      hasInitializedTemplateSelectionRef.current = false;
      autoSlidesForTemplateSwitchRef.current = { key: null, armed: false };
      return;
    }
    const nextKey = `${selectedVersionId}:${selectedTemplateId}`;
    if (!hasInitializedTemplateSelectionRef.current) {
      hasInitializedTemplateSelectionRef.current = true;
      autoSlidesForTemplateSwitchRef.current = { key: nextKey, armed: false };
      return;
    }
    if (autoSlidesForTemplateSwitchRef.current.key !== nextKey) {
      autoSlidesForTemplateSwitchRef.current = { key: nextKey, armed: true };
    }
  }, [selectedVersionId, selectedTemplateId]);

  useEffect(() => {
      if (!selectedVersionId) {
        setAudioUrls({});
        return;
      }
    apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
      `/video-versions/${selectedVersionId}/audios`,
      { cacheMs: 0 }
    )
      .then((data) => {
        const next: Record<string, string> = {};
        data.blocks.forEach((item) => {
          if (item.url) {
            next[item.blockId] = item.url;
          }
        });
        setAudioUrls(next);
      })
      .catch((err) => {
        console.error(err);
        setAudioUrls({});
      });
    }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId || assetsJobId) return;
      let cancelled = false;
      try {
        const raw = window.localStorage.getItem(ASSETS_JOB_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as AssetsJobStorage;
        if (!parsed?.jobId || parsed.versionId !== selectedVersionId) return;
        apiGet<{ status: string; id: string }>(`/jobs/${parsed.jobId}`, { cacheMs: 0 })
          .then((job) => {
            if (cancelled) return;
            if (!job || !job.id) return;
            if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
              clearPersistedAssetsJob();
              if (job.status === 'succeeded') {
                setAssetsRevision((prev) => prev + 1);
              }
              return;
            }
            setAssetsJobId(parsed.jobId);
            setIsGeneratingAssets(true);
            setAssetsJobMode('image');
            setImagePhase('waiting');
            setImageProgress({ current: 0, total: blocks.length });
            if (parsed.kind === 'batch') {
              setGeneratingStates((prev) => {
                const next: typeof prev = {};
                blocks.forEach((block) => {
                  next[block.id] = { ...prev[block.id], image: true };
                });
                return { ...prev, ...next };
              });
            }
            if (parsed.kind === 'block' && parsed.blockId) {
              setGeneratingStates((prev) => ({
                ...prev,
                [parsed.blockId as string]: { ...prev[parsed.blockId as string], image: true }
              }));
            }
          })
          .catch((err) => {
            console.error(err);
          });
      } catch (err) {
        console.error(err);
      }
      return () => {
        cancelled = true;
      };
    }, [selectedVersionId, assetsJobId, blocks]);

  useEffect(() => {
    if (!selectedVersionId) {
      setIsSegmenting(false);
      setSegmentJobId(null);
      setSegmentPhase('idle');
      setSegmentProgress(null);
      setIsGeneratingTts(false);
      setTtsJobId(null);
      setTtsPhase('idle');
      setTtsProgress(null);
      setIsGeneratingTranscription(false);
      setTranscriptionJobId(null);
      setTranscriptionPhase('idle');
      setTranscriptionProgress(null);
      setSubtitleFiles({});
      ttsBatchStartPendingRef.current = false;
      setIsGeneratingAssets(false);
      setAssetsJobId(null);
      setAssetsJobMode('none');
      setImagePhase('idle');
      setImageProgress(null);
      setSlidesPhase('idle');
      setSlidesProgress(null);
      setIsGeneratingFinalVideo(false);
      setFinalVideoJobId(null);
      setFinalVideoPhase('idle');
      setFinalVideoProgress(null);
      setSingleTextQueue({ total: 0, completed: 0, active: 0 });
      setSingleTtsQueue({ total: 0, completed: 0, active: 0 });
      setSingleImageQueue({ total: 0, completed: 0, active: 0 });
      return;
    }

    let cancelled = false;

    const syncJobState = async () => {
      try {
        const state = await apiGet<JobStatePayload>(
          `/video-versions/${selectedVersionId}/job-state`,
          { cacheMs: 0, dedupe: false }
        );
        if (cancelled) return;

        if (state.segment.active && state.segment.jobId) {
          setSegmentJobId(state.segment.jobId);
          setIsSegmenting(true);
          setSegmentPhase(state.segment.phase);
          setSegmentProgress({ current: state.segment.current, total: state.segment.total });
        } else {
          setIsSegmenting(false);
          setSegmentJobId(null);
          setSegmentPhase('idle');
          setSegmentProgress(null);
        }

        if (state.tts.active) {
          ttsBatchStartPendingRef.current = false;
          setTtsJobId(state.tts.jobId ?? null);
          setIsGeneratingTts(true);
          setTtsPhase(state.tts.phase);
          setTtsProgress({ current: state.tts.current, total: state.tts.total });
        } else if (!ttsBatchStartPendingRef.current) {
          setIsGeneratingTts(false);
          setTtsJobId(null);
          setTtsPhase('idle');
          setTtsProgress(null);
        }

        if (state.image.active) {
          setAssetsJobId(state.image.jobId ?? null);
          setAssetsJobMode('image');
          setIsGeneratingAssets(true);
          setImagePhase(state.image.phase);
          setImageProgress({ current: state.image.current, total: state.image.total });
          setSlidesPhase('idle');
          setSlidesProgress(null);
        } else if (state.slides.active && state.slides.jobId) {
          setAssetsJobId(state.slides.jobId);
          setAssetsJobMode('slides');
          setIsGeneratingAssets(true);
          setSlidesPhase(state.slides.phase);
          setSlidesProgress({ current: state.slides.current, total: state.slides.total });
          setImagePhase('idle');
          setImageProgress(null);
        } else {
          setIsGeneratingAssets(false);
          setAssetsJobId(null);
          setAssetsJobMode('none');
          setImagePhase('idle');
          setImageProgress(null);
          setSlidesPhase('idle');
          setSlidesProgress(null);
        }

        if (state.finalVideo.active && state.finalVideo.jobId) {
          setIsGeneratingFinalVideo(true);
          setFinalVideoJobId(state.finalVideo.jobId);
          setFinalVideoPhase(state.finalVideo.phase);
          setFinalVideoProgress({
            current: state.finalVideo.current,
            total: state.finalVideo.total
          });
        } else {
          setIsGeneratingFinalVideo(false);
          setFinalVideoJobId(null);
          setFinalVideoPhase('idle');
          setFinalVideoProgress(null);
        }
        if (state.transcription?.active) {
          setIsGeneratingTranscription(true);
          setTranscriptionJobId(state.transcription.jobId ?? null);
          setTranscriptionPhase(state.transcription.phase);
          setTranscriptionProgress({
            current: state.transcription.current,
            total: state.transcription.total
          });
        } else {
          setIsGeneratingTranscription(false);
          setTranscriptionJobId(null);
          setTranscriptionPhase('idle');
          setTranscriptionProgress(null);
        }
        if (typeof state.lastFinalVideoRenderSeconds === 'number' && Number.isFinite(state.lastFinalVideoRenderSeconds)) {
          setFinalVideoLastElapsedSeconds(Math.max(0, Math.floor(state.lastFinalVideoRenderSeconds)));
        }
        if (state.finalVideoReady && selectedVersionId) {
          setFinalVideoUrl((prev) => prev ?? `${API_BASE}/video-versions/${selectedVersionId}/final-video?v=${Date.now()}`);
        } else if (!state.finalVideoReady) {
          setFinalVideoUrl(null);
          setFinalVideoLastElapsedSeconds(null);
        }

        const activeSegmentJobs = state.blockJobs?.segment ?? [];
        const activeTtsJobs = state.blockJobs?.tts ?? [];
        const activeImageJobs = state.blockJobs?.image ?? [];

        const singleSegmentActive = activeSegmentJobs.length;
        const singleTtsActive = activeTtsJobs.length;
        const singleImageActive = activeImageJobs.length;
        setSingleTextQueue(singleSegmentActive > 0 ? { total: singleSegmentActive, completed: 0, active: singleSegmentActive } : { total: 0, completed: 0, active: 0 });
        setSingleTtsQueue(singleTtsActive > 0 ? { total: singleTtsActive, completed: 0, active: singleTtsActive } : { total: 0, completed: 0, active: 0 });
        setSingleImageQueue(singleImageActive > 0 ? { total: singleImageActive, completed: 0, active: singleImageActive } : { total: 0, completed: 0, active: 0 });
        setSingleImagePhase(
          activeImageJobs.some((job) => job.phase === 'running')
            ? 'running'
            : activeImageJobs.length > 0
              ? 'waiting'
              : 'idle'
        );

        const activeTextBlocks = new Set<string>(activeSegmentJobs.map((job) => job.blockId));
        const activeAudioBlocks = new Set<string>(activeTtsJobs.map((job) => job.blockId));
        const activeImageBlocks = new Set<string>(activeImageJobs.map((job) => job.blockId));

        setGeneratingStates((prev) => {
          const keys = new Set<string>([
            ...Object.keys(prev),
            ...Array.from(activeTextBlocks),
            ...Array.from(activeAudioBlocks),
            ...Array.from(activeImageBlocks)
          ]);
          const next: typeof prev = {};
          keys.forEach((blockId) => {
            const current = prev[blockId] ?? { text: false, image: false, audio: false };
            const text = state.segment.active
              ? (activeTextBlocks.size > 0 ? activeTextBlocks.has(blockId) : Boolean(current.text))
              : activeTextBlocks.has(blockId);
            const audio = state.tts.active
              ? (activeAudioBlocks.size > 0 ? activeAudioBlocks.has(blockId) : Boolean(current.audio))
              : activeAudioBlocks.has(blockId);
            const image = (state.image.active || state.slides.active)
              ? (activeImageBlocks.size > 0 ? activeImageBlocks.has(blockId) : Boolean(current.image))
              : activeImageBlocks.has(blockId);
            if (!text && !image && !audio && !current.global) {
              return;
            }
            next[blockId] = {
              ...current,
              text,
              image,
              audio
            };
          });
          return next;
        });
      } catch (err) {
        console.error(err);
      }
    };

    void syncJobState();

    return () => {
      cancelled = true;
    };
  }, [selectedVersionId]);

  const invalidateFinalVideoLocal = useCallback(() => {
    setFinalVideoUrl(null);
    setFinalVideoLastElapsedSeconds(null);
  }, []);

  const invalidateSubtitleAssetsLocal = useCallback(() => {
    setSubtitleFiles({});
    setSubtitleListRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!selectedVersionId) return;
    const readBuildVideoSnapshot = (
      buildStatus: Record<string, unknown> | null | undefined,
      targetVideoId: string,
      targetVideoVersionId: string
    ): {
      blocksTotal: number | null;
      blocksReady: number | null;
      audioReady: number | null;
      imagesReady: number | null;
    } | null => {
      if (!buildStatus || typeof buildStatus !== 'object') return null;
      const sections = Array.isArray((buildStatus as { sections?: unknown[] }).sections)
        ? ((buildStatus as { sections: unknown[] }).sections)
        : Array.isArray((buildStatus as { modules?: unknown[] }).modules)
          ? ((buildStatus as { modules: unknown[] }).modules)
          : [];
      for (const section of sections) {
        if (!section || typeof section !== 'object') continue;
        const videos = Array.isArray((section as { videos?: unknown[] }).videos)
          ? ((section as { videos: unknown[] }).videos)
          : [];
        for (const video of videos) {
          if (!video || typeof video !== 'object') continue;
          const rec = video as Record<string, unknown>;
          const scopedVideoId = typeof rec.videoId === 'string' ? rec.videoId.trim() : '';
          const scopedVideoVersionId = typeof rec.videoVersionId === 'string' ? rec.videoVersionId.trim() : '';
          if ((targetVideoId && scopedVideoId && scopedVideoId !== targetVideoId)) continue;
          if ((targetVideoVersionId && scopedVideoVersionId && scopedVideoVersionId !== targetVideoVersionId)) continue;
          const blocks = rec.blocks && typeof rec.blocks === 'object' ? (rec.blocks as Record<string, unknown>) : null;
          const audio = rec.audio && typeof rec.audio === 'object' ? (rec.audio as Record<string, unknown>) : null;
          const images = rec.images && typeof rec.images === 'object' ? (rec.images as Record<string, unknown>) : null;
          const asInt = (value: unknown) =>
            typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
          return {
            blocksTotal: asInt(blocks?.total),
            blocksReady: asInt(blocks?.ready),
            audioReady: asInt(audio?.ready),
            imagesReady: asInt(images?.ready)
          };
        }
      }
      return null;
    };

    const toPhase = (status: string): JobPhase => {
      if (status === 'running') return 'running';
      if (status === 'pending') return 'waiting';
      return 'idle';
    };
    const isTerminal = (status: string) =>
      status === 'succeeded' || status === 'failed' || status === 'canceled';
    const onWsEvent = (event: Event) => {
      const detail = readVizlecWsDetail<{
        jobId?: string;
        status?: string;
        type?: string;
        blockId?: string | null;
        lessonVersionId?: string | null;
        videoVersionId?: string | null;
        progressPercent?: number | null;
        videoId?: string | null;
        buildStatus?: Record<string, unknown> | null;
      }>(event);
      if (!detail || detail.event !== WS_EVENT.JOB_UPDATE) return;
      const payload = detail.payload;
      const scopedVersionId = (payload?.videoVersionId ?? payload?.lessonVersionId)?.trim();
      if (!scopedVersionId || scopedVersionId !== selectedVersionId) return;
      const jobId = payload?.jobId?.trim();
      const status = payload?.status?.trim() ?? '';
      const type = payload?.type?.trim() ?? '';
      const progressPercent =
        typeof payload?.progressPercent === 'number' && Number.isFinite(payload.progressPercent)
          ? Math.max(1, Math.min(99, Math.trunc(payload.progressPercent)))
          : null;
      const blockId = payload?.blockId?.trim() ?? '';
      const blockScoped = blockId.length > 0;
      if (!jobId || !status || !type) return;
      if (isTerminal(status)) {
        const terminalKey = `${jobId}:${status}`;
        if (processedTerminalJobEventsRef.current.has(terminalKey)) return;
        processedTerminalJobEventsRef.current.add(terminalKey);
        if (processedTerminalJobEventsRef.current.size > 5000) {
          processedTerminalJobEventsRef.current.clear();
        }
      }
      if (
        !isTerminal(status) &&
        (type === 'segment' || type === 'segment_block' || type === 'tts' || type === 'image')
      ) {
        invalidateFinalVideoLocal();
      }

      if (blockScoped) {
        if (type === 'segment_block') {
          const active = !isTerminal(status);
          setGeneratingStates((prev) => ({
            ...prev,
            [blockId]: { ...prev[blockId], text: active }
          }));
          const singleTextMeta = singleTextJobsRef.current[jobId];
          if (singleTextMeta) {
            if (status === 'running') {
              setSingleTextQueue((prev) => ({
                ...prev,
                active: Math.max(prev.active, 1)
              }));
            }
            if (isTerminal(status) && !singleTextMeta.done) {
              singleTextMeta.done = true;
              setSingleTextQueue((prev) => {
                const nextActive = Math.max(0, prev.active - 1);
                const nextCompleted = Math.min(prev.total, prev.completed + 1);
                if (nextActive === 0) return { total: 0, completed: 0, active: 0 };
                return { total: prev.total, completed: nextCompleted, active: nextActive };
              });
              delete singleTextJobsRef.current[jobId];
            }
          }
          if (status === 'succeeded') {
            apiGet<LegacyBlock[]>(`/video-versions/${selectedVersionId}/blocks`, {
              cacheMs: 0,
              dedupe: false
            })
              .then((items) => {
                const updated = items.find((item) => item.id === blockId);
                if (updated) {
                  mergeLegacyBlock(updated);
                }
              })
              .catch((err) => {
                console.error(err);
              });
          }
          return;
        }

        if (type === 'tts') {
          const active = !isTerminal(status);
          setGeneratingStates((prev) => ({
            ...prev,
            [blockId]: { ...prev[blockId], audio: active }
          }));
          const singleTtsMeta = singleTtsJobsRef.current[jobId];
          if (singleTtsMeta) {
            if (status === 'running') {
              setSingleTtsQueue((prev) => ({
                ...prev,
                active: Math.max(prev.active, 1)
              }));
            }
            if (isTerminal(status) && !singleTtsMeta.done) {
              singleTtsMeta.done = true;
              setSingleTtsQueue((prev) => {
                const nextActive = Math.max(0, prev.active - 1);
                const nextCompleted = Math.min(prev.total, prev.completed + 1);
                if (nextActive === 0) return { total: 0, completed: 0, active: 0 };
                return { total: prev.total, completed: nextCompleted, active: nextActive };
              });
              delete singleTtsJobsRef.current[jobId];
            }
          }
          if (status === 'succeeded') {
            setAudioUrls((prev) => ({ ...prev, [blockId]: `/blocks/${blockId}/audio/raw` }));
            setAudioRevisions((prev) => ({
              ...prev,
              [blockId]: (prev[blockId] ?? 0) + 1
            }));
          }
          return;
        }

        if (type === 'image') {
          const active = !isTerminal(status);
          setGeneratingStates((prev) => ({
            ...prev,
            [blockId]: { ...prev[blockId], image: active }
          }));
          const singleImageMeta = singleImageJobsRef.current[jobId];
          if (singleImageMeta) {
            if (status === 'pending') setSingleImagePhase('waiting');
            if (status === 'running') setSingleImagePhase('running');
            if (isTerminal(status) && !singleImageMeta.done) {
              singleImageMeta.done = true;
              setSingleImageQueue((prev) => {
                const nextActive = Math.max(0, prev.active - 1);
                const nextCompleted = Math.min(prev.total, prev.completed + 1);
                if (nextActive === 0) return { total: 0, completed: 0, active: 0 };
                return { total: prev.total, completed: nextCompleted, active: nextActive };
              });
              delete singleImageJobsRef.current[jobId];
            }
          }
          if (status === 'succeeded') {
            invalidateSlidesForBlocks([blockId]);
            setBrokenRawImages((prev) => ({ ...prev, [blockId]: false }));
            clearBrokenSlidesForBlocks([blockId]);
            setImageUrls((prev) => ({ ...prev, [blockId]: `/blocks/${blockId}/image/raw` }));
            setImageRevisions((prev) => ({
              ...prev,
              [blockId]: (prev[blockId] ?? 0) + 1
            }));
          }
          return;
        }
      }

      if (type === 'segment') {
        if (isTerminal(status) && segmentJobIdRef.current === jobId) {
          lastSegmentReadyCountRef.current = null;
          setIsSegmenting(false);
          setSegmentJobId(null);
          setSegmentPhase('idle');
          setSegmentProgress(null);
          setGeneratingStates((prev) => {
            const next: typeof prev = {};
            Object.keys(prev).forEach((key) => {
              next[key] = { ...prev[key], text: false };
            });
            return next;
          });
          if (status === 'succeeded') {
            apiGet<LegacyBlock[]>(`/video-versions/${selectedVersionId}/blocks`, {
              cacheMs: 0,
              dedupe: false
            })
              .then((items) => {
                items.forEach(mergeLegacyBlock);
              })
              .catch((err) => {
                console.error(err);
              });
            setAssetsRevision((prev) => prev + 1);
          }
          return;
        }
        if (!isTerminal(status)) {
          setSegmentJobId(jobId);
          setIsSegmenting(true);
          setSegmentPhase(toPhase(status));
          const snapshot = readBuildVideoSnapshot(
            (payload?.buildStatus as Record<string, unknown> | null | undefined) ?? null,
            payload?.videoId?.trim() ?? '',
            selectedVersionId
          );
          const totalCount = snapshot?.blocksTotal ?? null;
          const readyCount = snapshot?.blocksReady ?? null;

          if (totalCount !== null && totalCount > 0) {
            const safeReady = Math.min(totalCount, Math.max(0, readyCount ?? 0));
            setSegmentProgress({
              // UI adds +1 while running for historical zero-based progress streams.
              current: status === 'running' ? Math.max(0, safeReady - 1) : safeReady,
              total: totalCount
            });
            if (readyCount !== null && lastSegmentReadyCountRef.current !== safeReady) {
              lastSegmentReadyCountRef.current = safeReady;
              apiGet<LegacyBlock[]>(`/video-versions/${selectedVersionId}/blocks`, {
                cacheMs: 0,
                dedupe: false
              })
                .then((items) => {
                  if (selectedVersionIdRef.current !== selectedVersionId) return;
                  items.forEach((item) => mergeLegacyBlockRef.current(item));
                })
                .catch((err) => {
                  console.error(err);
                });
            }
          }
        }
        return;
      }

      if (type === 'tts') {
        if (isTerminal(status) && ttsJobIdRef.current === jobId) {
          lastTtsReadyCountRef.current = null;
          setIsGeneratingTts(false);
          setTtsJobId(null);
          setTtsPhase('idle');
          setTtsProgress(null);
          setGeneratingStates((prev) => {
            const next: typeof prev = {};
            Object.keys(prev).forEach((key) => {
              next[key] = { ...prev[key], audio: false };
            });
            return next;
          });
          if (status === 'succeeded') {
            if (selectedVersionIdRef.current) {
              apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
                `/video-versions/${selectedVersionIdRef.current}/audios`,
                { cacheMs: 0, dedupe: false }
              )
                .then((payload) => {
                  if (selectedVersionIdRef.current !== selectedVersionId) return;
                  const nextUrls: Record<string, string> = {};
                  const touchedBlocks: string[] = [];
                  payload.blocks.forEach((item) => {
                    if (!item.url) return;
                    nextUrls[item.blockId] = item.url;
                    touchedBlocks.push(item.blockId);
                  });
                  setAudioUrls(nextUrls);
                  if (touchedBlocks.length > 0) {
                    setAudioRevisions((prev) => {
                      const next = { ...prev };
                      touchedBlocks.forEach((blockId) => {
                        next[blockId] = (next[blockId] ?? 0) + 1;
                      });
                      return next;
                    });
                  }
                })
                .catch((err) => {
                  console.error(err);
                });
            }
            setAssetsRevision((prev) => prev + 1);
          }
          return;
        }
        if (!isTerminal(status)) {
          ttsBatchStartPendingRef.current = false;
          setTtsJobId(jobId);
          setIsGeneratingTts(true);
          setTtsPhase(toPhase(status));
          const snapshot = readBuildVideoSnapshot(
            (payload?.buildStatus as Record<string, unknown> | null | undefined) ?? null,
            payload?.videoId?.trim() ?? '',
            selectedVersionId
          );
          const totalCount = snapshot?.blocksTotal ?? (blocks.length > 0 ? blocks.length : null);
          const readyCount = snapshot?.audioReady ?? null;
          if (totalCount && totalCount > 0) {
            const safeReady = Math.min(totalCount, Math.max(0, readyCount ?? 0));
            setTtsProgress({
              current: status === 'running' ? Math.max(0, safeReady - 1) : safeReady,
              total: totalCount
            });
            if (readyCount !== null && lastTtsReadyCountRef.current !== safeReady) {
              lastTtsReadyCountRef.current = safeReady;
              apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
                `/video-versions/${selectedVersionId}/audios`,
                { cacheMs: 0, dedupe: false }
              )
                .then((audioPayload) => {
                  if (selectedVersionIdRef.current !== selectedVersionId) return;
                  const nextUrls: Record<string, string> = {};
                  const touchedBlocks: string[] = [];
                  audioPayload.blocks.forEach((item) => {
                    if (!item.url) return;
                    nextUrls[item.blockId] = item.url;
                    touchedBlocks.push(item.blockId);
                  });
                  setAudioUrls(nextUrls);
                  if (touchedBlocks.length > 0) {
                    setAudioRevisions((prev) => {
                      const next = { ...prev };
                      touchedBlocks.forEach((blockId) => {
                        next[blockId] = (next[blockId] ?? 0) + 1;
                      });
                      return next;
                    });
                  }
                })
                .catch((err) => {
                  console.error(err);
                });
            }
            if (readyCount !== null && safeReady >= totalCount) {
              lastTtsReadyCountRef.current = null;
              setIsGeneratingTts(false);
              setTtsJobId(null);
              setTtsPhase('idle');
              setTtsProgress(null);
              setGeneratingStates((prev) => {
                const next: typeof prev = {};
                Object.keys(prev).forEach((key) => {
                  next[key] = { ...prev[key], audio: false };
                });
                return next;
              });
              setAssetsRevision((prev) => prev + 1);
            }
          }
        }
        return;
      }

      if (type === 'image' || type === 'render_slide') {
        if (isTerminal(status) && assetsJobIdRef.current === jobId) {
          if (type === 'image') {
            lastImageReadyCountRef.current = null;
          }
          const settledVersionId = selectedVersionIdRef.current;
          setIsGeneratingAssets(false);
          setAssetsJobId(null);
          setAssetsJobMode('none');
          setImagePhase('idle');
          setImageProgress(null);
          setSlidesPhase('idle');
          setSlidesProgress(null);
          setGeneratingStates((prev) => {
            const next: typeof prev = {};
            Object.keys(prev).forEach((key) => {
              next[key] = { ...prev[key], image: false };
            });
            return next;
          });
          if (status === 'succeeded') {
            if (type === 'image' && settledVersionId) {
              apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
                `/video-versions/${settledVersionId}/images`,
                { cacheMs: 0, dedupe: false }
              )
                .then((payload) => {
                  if (selectedVersionIdRef.current !== settledVersionId) return;
                  const nextUrls: Record<string, string> = {};
                  const touchedBlocks: string[] = [];
                  payload.blocks.forEach((item) => {
                    if (!item.url) return;
                    nextUrls[item.blockId] = item.url;
                    touchedBlocks.push(item.blockId);
                  });
                  setImageUrls(nextUrls);
                  if (touchedBlocks.length > 0) {
                    setImageRevisions((prev) => {
                      const next = { ...prev };
                      touchedBlocks.forEach((id) => {
                        next[id] = (next[id] ?? 0) + 1;
                      });
                      return next;
                    });
                  }
                })
                .catch((err) => {
                  console.error(err);
                });
            }
            setAssetsRevision((prev) => prev + 1);
          }
          return;
        }
        if (!isTerminal(status)) {
          setAssetsJobId(jobId);
          setIsGeneratingAssets(true);
          if (type === 'render_slide') {
            setAssetsJobMode('slides');
            setSlidesPhase(toPhase(status));
          } else {
            setAssetsJobMode('image');
            setImagePhase(toPhase(status));
            const snapshot = readBuildVideoSnapshot(
              (payload?.buildStatus as Record<string, unknown> | null | undefined) ?? null,
              payload?.videoId?.trim() ?? '',
              selectedVersionId
            );
            const totalCount = snapshot?.blocksTotal ?? (blocks.length > 0 ? blocks.length : null);
            const readyCount = snapshot?.imagesReady ?? null;
            if (totalCount && totalCount > 0) {
              const safeReady = Math.min(totalCount, Math.max(0, readyCount ?? 0));
              setImageProgress({
                current: status === 'running' ? Math.max(0, safeReady - 1) : safeReady,
                total: totalCount
              });
              if (readyCount !== null && lastImageReadyCountRef.current !== safeReady) {
                lastImageReadyCountRef.current = safeReady;
                apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
                  `/video-versions/${selectedVersionId}/images`,
                  { cacheMs: 0, dedupe: false }
                )
                  .then((imagePayload) => {
                    if (selectedVersionIdRef.current !== selectedVersionId) return;
                    const nextUrls: Record<string, string> = {};
                    const touchedBlocks: string[] = [];
                    imagePayload.blocks.forEach((item) => {
                      if (!item.url) return;
                      nextUrls[item.blockId] = item.url;
                      touchedBlocks.push(item.blockId);
                    });
                    setImageUrls(nextUrls);
                    if (touchedBlocks.length > 0) {
                      invalidateSlidesForBlocks(touchedBlocks);
                      clearBrokenSlidesForBlocks(touchedBlocks);
                      setBrokenRawImages((prev) => {
                        const next = { ...prev };
                        touchedBlocks.forEach((blockId) => {
                          next[blockId] = false;
                        });
                        return next;
                      });
                      setImageRevisions((prev) => {
                        const next = { ...prev };
                        touchedBlocks.forEach((blockId) => {
                          next[blockId] = (next[blockId] ?? 0) + 1;
                        });
                        return next;
                      });
                    }
                  })
                  .catch((err) => {
                    console.error(err);
                  });
              }
              if (readyCount !== null && safeReady >= totalCount) {
                lastImageReadyCountRef.current = null;
                setIsGeneratingAssets(false);
                setAssetsJobId(null);
                setAssetsJobMode('none');
                setImagePhase('idle');
                setImageProgress(null);
                setGeneratingStates((prev) => {
                  const next: typeof prev = {};
                  Object.keys(prev).forEach((key) => {
                    next[key] = { ...prev[key], image: false };
                  });
                  return next;
                });
                setAssetsRevision((prev) => prev + 1);
              }
            }
          }
        }
        return;
      }

      if (type === 'subtitle_transcription') {
        if (isTerminal(status) && transcriptionJobIdRef.current === jobId) {
          setIsGeneratingTranscription(false);
          setTranscriptionJobId(null);
          setTranscriptionPhase('idle');
          setTranscriptionProgress(null);
          if (status === 'succeeded') {
            setSubtitleListRevision((prev) => prev + 1);
          } else if (status === 'failed') {
            setError('Failed to generate transcription.');
          }
          return;
        }
        if (!isTerminal(status)) {
          setIsGeneratingTranscription(true);
          setTranscriptionJobId(jobId);
          setTranscriptionPhase(toPhase(status));
          if (progressPercent !== null) {
            const total = Math.max(1, blocks.length);
            const estimatedCurrent = Math.max(0, Math.min(total, Math.trunc((progressPercent / 100) * total)));
            setTranscriptionProgress({ current: estimatedCurrent, total });
          }
        }
        return;
      }

      if (type === 'concat_video') {
        if (isTerminal(status) && finalVideoJobIdRef.current === jobId) {
          const startedAt = finalVideoStartedAtRef.current;
          const elapsed = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
          setFinalVideoElapsedSeconds(elapsed);
          setIsGeneratingFinalVideo(false);
          setFinalVideoJobId(null);
          setFinalVideoPhase('idle');
          setFinalVideoProgress(null);
          if (status === 'succeeded') {
            setFinalVideoLastElapsedSeconds(elapsed);
            setFinalVideoUrl(`${API_BASE}/video-versions/${selectedVersionId}/final-video?v=${Date.now()}`);
          } else if (status === 'failed') {
            setFinalVideoLastElapsedSeconds(null);
            setError('Failed to generate final video.');
          } else if (status === 'canceled') {
            setFinalVideoLastElapsedSeconds(null);
          }
          setSubtitleListRevision((prev) => prev + 1);
          return;
        }
        if (!isTerminal(status)) {
          setIsGeneratingFinalVideo(true);
          setFinalVideoJobId(jobId);
          setFinalVideoPhase(toPhase(status));
          if (progressPercent !== null && blocks.length > 0) {
            const estimatedCurrent = Math.max(
              1,
              Math.min(blocks.length, Math.trunc((progressPercent / 100) * blocks.length))
            );
            setFinalVideoProgress({ current: estimatedCurrent, total: blocks.length });
          }
        }
      }
    };

    window.addEventListener('vizlec:ws', onWsEvent as EventListener);
    return () => {
      window.removeEventListener('vizlec:ws', onWsEvent as EventListener);
    };
  }, [invalidateFinalVideoLocal, selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId) {
      setSubtitleFiles({});
      setSubtitleCuesData(null);
      setSubtitleRawData(null);
      return;
    }
    apiGet<SubtitleListPayload>(`/video-versions/${selectedVersionId}/subtitles`, {
      cacheMs: 0,
      dedupe: false
    })
      .then((data) => {
        const next: Record<string, boolean> = {};
        (data.items ?? []).forEach((item) => {
          if (typeof item.kind === 'string') {
            next[item.kind] = Boolean(item.exists);
          }
        });
        setSubtitleFiles(next);
      })
      .catch((err) => {
        console.error(err);
        setSubtitleFiles({});
      });
  }, [selectedVersionId, subtitleListRevision]);

  useEffect(() => {
    if (!selectedVersionId) {
      setSubtitleCuesData(null);
      return;
    }
    apiGet<SubtitleCuesPayload>(`/video-versions/${selectedVersionId}/subtitles/cues`, {
      cacheMs: 0,
      dedupe: false
    })
      .then((data) => {
        setSubtitleCuesData(data && Array.isArray(data.cues) ? data : { cues: [] });
      })
      .catch(() => {
        setSubtitleCuesData(null);
      });
  }, [selectedVersionId, subtitleListRevision]);

  useEffect(() => {
    if (!selectedVersionId) {
      setSubtitleRawData(null);
      return;
    }
    apiGet<SubtitleRawPayload>(`/video-versions/${selectedVersionId}/subtitles/raw`, {
      cacheMs: 0,
      dedupe: false
    })
      .then((data) => {
        setSubtitleRawData(data && typeof data === 'object' ? data : null);
      })
      .catch(() => {
        setSubtitleRawData(null);
      });
  }, [selectedVersionId, subtitleListRevision]);

  useEffect(() => {
    if (!selectedVersionId) {
      setImageUrls({});
      return;
    }
    apiGet<{ blocks: { blockId: string; url?: string | null }[] }>(
      `/video-versions/${selectedVersionId}/images`,
      { cacheMs: 0 }
    )
      .then((data) => {
        const next: Record<string, string> = {};
        data.blocks.forEach((item) => {
          if (item.url) {
            next[item.blockId] = item.url;
          }
        });
        setImageUrls(next);
      })
      .catch((err) => {
        console.error(err);
        setImageUrls({});
      });
  }, [selectedVersionId, blocks.length, assetsRevision]);

  useEffect(() => {
    if (Object.keys(imageUrls).length === 0) return;
    setBrokenRawImages((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(imageUrls).forEach((blockId) => {
        if (next[blockId]) {
          next[blockId] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [imageUrls]);

  const resolveAudioUrl = (blockId: string) => {
    const path = audioUrls[blockId];
    if (!path) return undefined;
    const base = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${API_BASE}${path}`;
    const token = `${assetsRevision}-${audioRevisions[blockId] ?? 0}`;
    return base.includes('?') ? `${base}&v=${token}` : `${base}?v=${token}`;
  };

  const resolveImageUrl = (blockId: string) => {
    const path = imageUrls[blockId];
    if (!path) return undefined;
    const base = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${API_BASE}${path}`;
    const token = `${assetsRevision}-${imageRevisions[blockId] ?? 0}`;
    return base.includes('?') ? `${base}&v=${token}` : `${base}?v=${token}`;
  };

  useEffect(() => {
    if (blocks.length === 0) return;
    setBlocks((prev) =>
      prev.map((block) => ({
        ...block,
        audioUrl: resolveAudioUrl(block.id),
        rawImageUrl: brokenRawImages[block.id]
          ? undefined
          : resolveImageUrl(block.id),
        slideUrl: slideAvailability[block.id] && !isSlideBrokenForActiveTemplate(block.id)
          ? `${API_BASE}/blocks/${block.id}/slide?templateId=${selectedTemplateId}&v=${assetsRevision}`
          : undefined,
        generatedImageUrl: brokenRawImages[block.id]
          ? undefined
          : resolveImageUrl(block.id)
      }))
    );
  }, [assetsRevision, audioRevisions, imageRevisions, selectedTemplateId, blocks.length, slideAvailability, brokenRawImages, audioUrls, imageUrls, isSlideBrokenForActiveTemplate]);

  useEffect(() => {
    if (singleImageQueue.active > 0) return;
    setSingleImagePhase('idle');
  }, [singleImageQueue.active]);

  // Close template menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
      if (mobileActionsMenuRef.current && !mobileActionsMenuRef.current.contains(event.target as Node)) {
        setIsMobileActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter templates based on search
  const filteredTemplates = useMemo(() => {
    return templateOptions.filter(t => 
      t.name.toLowerCase().includes(templateSearch.toLowerCase())
    );
  }, [templateOptions, templateSearch]);

  const currentTemplate = useMemo(
    () => templateOptions.find((t) => t.id === selectedTemplateId) ?? activeTemplate,
    [templateOptions, selectedTemplateId, activeTemplate]
  );

  const availableVoices = useMemo<Voice[]>(
    () => ttsVoices.map((voice) => ({
      name: voice.label,
      voice_id: voice.id,
      preview_url: voice.preview_url ?? ''
    })),
    [ttsVoices]
  );

  const getNarratedDraft = useCallback((blockId: string, fallback?: string) => {
    const draft = narratedDraftsRef.current[blockId];
    return draft ?? fallback ?? '';
  }, []);

  const setNarratedDraft = useCallback((blockId: string, value: string) => {
    narratedDraftsRef.current[blockId] = value;
  }, []);

  const clearNarratedDraft = useCallback((blockId: string) => {
    if (blockId in narratedDraftsRef.current) {
      delete narratedDraftsRef.current[blockId];
    }
  }, []);

  // Reset search when menu closes
  useEffect(() => {
    if (!isTemplateMenuOpen) setTemplateSearch('');
  }, [isTemplateMenuOpen]);

  useEffect(() => {
    if (!isScriptSidebarOpen) {
      setIsTemplateMenuOpen(false);
    }
  }, [isScriptSidebarOpen]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const syncSidebarForViewport = (matchesMobile: boolean) => {
      if (matchesMobile) {
        setIsScriptSidebarOpen(false);
      }
    };
    syncSidebarForViewport(media.matches);
    const onChange = (event: MediaQueryListEvent) => {
      syncSidebarForViewport(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Automatic selection via scroll (Intersection Observer)
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

  const invalidateSlidesForBlocks = useCallback((blockIds: string[]) => {
    if (blockIds.length === 0) return;
    const ids = new Set(blockIds);
    setSlideAvailability((prev) => {
      const next = { ...prev };
      blockIds.forEach((id) => {
        next[id] = false;
      });
      return next;
    });
    clearBrokenSlidesForBlocks(blockIds);
    setBlocks((prev) =>
      prev.map((block) =>
        ids.has(block.id)
          ? {
              ...block,
              slideUrl: undefined
            }
          : block
      )
    );
  }, [clearBrokenSlidesForBlocks]);

  const clearImagePreviewsForBlocks = useCallback((blockIds: string[]) => {
    if (blockIds.length === 0) return;
    const ids = new Set(blockIds);
    invalidateSlidesForBlocks(blockIds);
    setImageUrls((prev) => {
      let changed = false;
      const next = { ...prev };
      blockIds.forEach((id) => {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setBrokenRawImages((prev) => {
      let changed = false;
      const next = { ...prev };
      blockIds.forEach((id) => {
        if (next[id]) {
          next[id] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    clearBrokenSlidesForBlocks(blockIds);
    setBlocks((prev) =>
      prev.map((block) =>
        ids.has(block.id)
          ? {
              ...block,
              rawImageUrl: undefined,
              generatedImageUrl: undefined,
              slideUrl: undefined
            }
          : block
      )
    );
  }, [invalidateSlidesForBlocks, clearBrokenSlidesForBlocks]);

  const clearAudioPreviewsForBlocks = useCallback((blockIds: string[]) => {
    if (blockIds.length === 0) return;
    const ids = new Set(blockIds);
    setAudioUrls((prev) => {
      let changed = false;
      const next = { ...prev };
      blockIds.forEach((id) => {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setBlocks((prev) =>
      prev.map((block) =>
        ids.has(block.id)
          ? {
              ...block,
              audioUrl: undefined
            }
          : block
      )
    );
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<LessonBlock>) => {
    setBlocks((prev) => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const saveNarratedText = useCallback(async (blockId: string, value: string) => {
    if (!value?.trim()) {
      return;
    }
    try {
      await apiPatch(`/blocks/${blockId}`, { ttsText: value });
      clearAudioPreviewsForBlocks([blockId]);
      invalidateSubtitleAssetsLocal();
      invalidateFinalVideoLocal();
      updateBlock(blockId, { narratedText: value });
      clearNarratedDraft(blockId);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to save narrated text.');
    }
  }, [clearAudioPreviewsForBlocks, clearNarratedDraft, invalidateFinalVideoLocal, invalidateSubtitleAssetsLocal, updateBlock]);

  const saveOnScreen = useCallback(async (blockId: string, value: LessonBlock["onScreenText"]) => {
    try {
      const payload = {
        title: value.title,
        bullets: value.bullets
      };
      await apiPatch(`/blocks/${blockId}`, { onScreen: payload });
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === blockId
            ? {
                ...block,
                onScreenText: value,
                title: value.title.trim() || `Block ${block.number}`
              }
            : block
        )
      );
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to save on-screen content.');
    }
  }, []);

  const saveImagePrompt = useCallback(async (blockId: string, value: LessonBlock["imagePrompt"]) => {
    try {
      const payload = {
        block_prompt: value.prompt,
        avoid: value.avoid,
        seed_hint: value.seedText,
        seed: value.seedNumber
      };
      await apiPatch(`/blocks/${blockId}`, { imagePrompt: payload });
      clearImagePreviewsForBlocks([blockId]);
      invalidateFinalVideoLocal();
      updateBlock(blockId, { imagePrompt: value });
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to save image prompt.');
    }
  }, [clearImagePreviewsForBlocks, invalidateFinalVideoLocal, updateBlock]);

  const handleRegenerateText = useCallback(async (id: string) => {
    if (!lessonId) return;
    if (isGeneratingFinalVideo) return;
    if (isSegmenting || singleTextQueue.active > 0) return;
    invalidateFinalVideoLocal();
    setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], text: true } }));
    try {
      const job = await apiPost<{ id: string; status: string }>(`/blocks/${id}/segment/retry`, {
        clientId: dispatchAgentIdRef.current
      });

      singleTextJobsRef.current[job.id] = { blockId: id, done: false };
      setSingleTextQueue((prev) => ({
        total: prev.total + 1,
        completed: prev.completed,
        active: prev.active + 1
      }));
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to regenerate block.');
      setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], text: false } }));
    }
  }, [invalidateFinalVideoLocal, isGeneratingFinalVideo, isSegmenting, lessonId, singleTextQueue.active]);

  const handleRegenerateAudio = useCallback(async (id: string) => {
    if (!lessonId) return;
    if (isGeneratingFinalVideo) return;
    const current = blocks.find((block) => block.id === id);
    if (!(await ensureTtsReady())) return;
    invalidateFinalVideoLocal();
    invalidateSubtitleAssetsLocal();
    if (selectedVersionId) {
      setAudioReviewCheckedByVersion((prev) => {
        const currentChecks = prev[selectedVersionId];
        if (!currentChecks?.[id]) return prev;
        const nextChecks = { ...currentChecks };
        delete nextChecks[id];
        return { ...prev, [selectedVersionId]: nextChecks };
      });
    }
    const currentText = getNarratedDraft(id, current?.narratedText);
    if (currentText && current && currentText !== current.narratedText) {
      await saveNarratedText(id, currentText);
    }
    setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], audio: true } }));
    setAudioUrls((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
      try {
        const job = await apiPost<{ id: string; status: string }>(`/blocks/${id}/tts`, {
          clientId: dispatchAgentIdRef.current,
          voiceId: lessonVoiceId ?? undefined,
          requestId: crypto.randomUUID()
        });

      singleTtsJobsRef.current[job.id] = { blockId: id, done: false };
      setSingleTtsQueue((prev) => ({
        total: prev.total + 1,
        completed: prev.completed,
        active: prev.active + 1
      }));
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to regenerate audio.');
      setGeneratingStates(prev => ({ ...prev, [id]: { ...prev[id], audio: false } }));
    }
  }, [blocks, ensureTtsReady, getNarratedDraft, invalidateFinalVideoLocal, invalidateSubtitleAssetsLocal, isGeneratingFinalVideo, lessonId, lessonVoiceId, saveNarratedText, selectedVersionId]);

  const handleGenerateSlides = async () => {
    setError('Slides are disabled in this MVP.');
  };

  useEffect(() => {
    if (SLIDES_DISABLED_MVP) return;
    const autoState = autoSlidesForTemplateSwitchRef.current;
    if (!autoState.armed || !autoState.key) return;
    if (slideAvailabilityLoadedKey !== autoState.key) return;
    if (!selectedVersionId || !selectedTemplateId) return;
    if (blocks.length === 0) {
      autoSlidesForTemplateSwitchRef.current.armed = false;
      return;
    }

    const hasActiveTextGeneration = isSegmenting || singleTextQueue.active > 0;
    const hasHardLockGeneration = hasActiveTextGeneration || isGeneratingFinalVideo;
    const hasActiveImageOrSlideGeneration = isGeneratingAssets || singleImageQueue.active > 0;
    if (hasHardLockGeneration || hasActiveImageOrSlideGeneration) return;

    const missingForTemplate = blocks.some((block) => !slideAvailability[block.id]);
    autoSlidesForTemplateSwitchRef.current.armed = false;
    if (!missingForTemplate) return;
    void handleGenerateSlides();
  }, [
    blocks,
    handleGenerateSlides,
    isGeneratingAssets,
    isGeneratingFinalVideo,
    isSegmenting,
    selectedTemplateId,
    selectedVersionId,
    singleImageQueue.active,
    singleTextQueue.active,
    slideAvailability,
    slideAvailabilityLoadedKey
  ]);

  const runBatchImageGeneration = async () => {
    if (isGeneratingFinalVideo) return;
    if (!selectedVersionId) return;
    invalidateFinalVideoLocal();
    const missingPrompt = blocks.find((block) => !hasImagePromptText(block));
    if (missingPrompt) {
      setError(`O bloco ${missingPrompt.number} está sem prompt de imagem. Preencha para continuar.`);
      scrollToBlock(missingPrompt.id);
      return;
    }
    const totalImages = blocks.length;
    if (!totalImages) {
      setError('No blocks available to generate images.');
      return;
    }
    const seedUpdates = blocks.map((block) => ({
      blockId: block.id,
      seed: generateRandomSeed(),
      imagePrompt: block.imagePrompt
    }));
    clearImagePreviewsForBlocks(seedUpdates.map((item) => item.blockId));
    setBlocks((prev) =>
      prev.map((block) => {
        const match = seedUpdates.find((update) => update.blockId === block.id);
        if (!match || !block.imagePrompt) return block;
        return {
          ...block,
          imagePrompt: {
            ...block.imagePrompt,
            seedNumber: match.seed
          }
        };
      })
    );
    try {
      await Promise.all(
        seedUpdates.map(async ({ blockId, seed, imagePrompt }) => {
          if (!imagePrompt) return;
          const payload = {
            block_prompt: imagePrompt.prompt,
            avoid: imagePrompt.avoid,
            seed_hint: imagePrompt.seedText,
            seed
          };
          await apiPatch(`/blocks/${blockId}`, { imagePrompt: payload });
        })
      );
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to update block seeds.');
      return;
    }
    setGeneratingStates((prev) => {
      const next: typeof prev = {};
      blocks.forEach((block) => {
        next[block.id] = { ...prev[block.id], image: true };
      });
      return { ...prev, ...next };
    });
    setIsGeneratingAssets(true);
    setAssetsJobMode('image');
    setImagePhase('waiting');
    setImageProgress({ current: 0, total: blocks.length });
    try {
      const job = await apiPost<{ id: string; status: string }>(
        `/video-versions/${selectedVersionId}/images`,
        {
          templateId: selectedTemplateId || undefined,
          clientId: dispatchAgentIdRef.current,
          requestId: crypto.randomUUID()
        }
      );
      setImagePhase(job.status === 'running' ? 'running' : 'waiting');
      persistAssetsJob({ jobId: job.id, versionId: selectedVersionId, kind: 'batch' });
      setAssetsJobId(job.id);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to generate images.');
      setIsGeneratingAssets(false);
      setAssetsJobMode('none');
      setImagePhase('idle');
      setImageProgress(null);
    }
  };

  const handleGenerateImages = async () => {
    if (isGeneratingFinalVideo) return;
    if (!selectedVersionId) return;
    const missingPrompt = blocks.find((block) => !hasImagePromptText(block));
    if (missingPrompt) {
      setError(`O bloco ${missingPrompt.number} está sem prompt de imagem. Preencha para continuar.`);
      scrollToBlock(missingPrompt.id);
      return;
    }
    if (!blocks.length) {
      setError('No blocks available to generate images.');
      return;
    }
    await runBatchImageGeneration();
  };

  const handleRegenerateImage = async (blockId: string) => {
    if (!blockId) return;
    if (isGeneratingFinalVideo) return;
    if (isSegmenting || singleTextQueue.active > 0) return;
    invalidateFinalVideoLocal();
    const current = blocks.find((block) => block.id === blockId);
    if (current && !hasImagePromptText(current)) {
      setError(`O bloco ${current.number} está sem prompt de imagem. Preencha o prompt para gerar a imagem.`);
      scrollToBlock(current.id);
      return;
    }
    clearImagePreviewsForBlocks([blockId]);
    setGeneratingStates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], image: true } }));
    setSingleImagePhase('waiting');
    try {
      const job = await apiPost<{ id: string; status: string }>(
        `/blocks/${blockId}/image`,
        {
          templateId: selectedTemplateId || undefined,
          clientId: dispatchAgentIdRef.current,
          requestId: crypto.randomUUID()
        }
      );
      setSingleImagePhase(job.status === 'running' ? 'running' : 'waiting');
      singleImageJobsRef.current[job.id] = { blockId, done: false };
      setSingleImageQueue((prev) => ({
        total: prev.total + 1,
        completed: prev.completed,
        active: prev.active + 1
      }));
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to generate image.');
      setGeneratingStates((prev) => ({ ...prev, [blockId]: { ...prev[blockId], image: false } }));
    }
  };

  const startSegmentJob = async (purge = false) => {
    if (isGeneratingFinalVideo) return;
    if (!selectedVersionId) return;
    invalidateFinalVideoLocal();
    try {
      setGeneratingStates((prev) => {
        const next: typeof prev = {};
        blocks.forEach((block) => {
          next[block.id] = { ...prev[block.id], text: true };
        });
        return { ...prev, ...next };
      });
      setIsSegmenting(true);
      setSegmentPhase('waiting');
      setSegmentProgress({ current: 0, total: blocks.length });
      if (purge) {
        setBlocks([]);
        setActiveBlockId('');
        setBrokenRawImages({});
        setBrokenSlides({});
      }
      const job = await apiPost<{ id: string; status: string }>(
        `/video-versions/${selectedVersionId}/segment`,
        { clientId: dispatchAgentIdRef.current, requestId: crypto.randomUUID(), purge }
      );
      setSegmentJobId(job.id);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to generate blocks.');
      setIsSegmenting(false);
      setSegmentPhase('idle');
      setSegmentProgress(null);
    }
  };

  const startBatchTtsGeneration = useCallback(async (): Promise<boolean> => {
    if (!selectedVersionId) {
      setError('Create a video version before generating audios.');
      return false;
    }
    setError(null);
    invalidateFinalVideoLocal();
    if (selectedVersionId) {
      setAudioReviewCheckedByVersion((prev) => ({ ...prev, [selectedVersionId]: {} }));
    }
    setAudioReviewMarked({});
    ttsBatchStartPendingRef.current = true;
    setIsGeneratingTts(true);
    setTtsPhase('waiting');
    setTtsProgress({ current: 0, total: blocks.length });
    try {
      if (!(await ensureTtsReady())) {
        ttsBatchStartPendingRef.current = false;
        setIsGeneratingTts(false);
        setTtsPhase('idle');
        setTtsProgress(null);
        return false;
      }
      const blockIdSet = new Set(blocks.map((block) => block.id));
      const draftEntries = Object.entries({ ...narratedDraftsRef.current }).filter(([blockId]) =>
        blockIdSet.has(blockId)
      );
      if (draftEntries.length > 0) {
        await Promise.all(draftEntries.map(([blockId, value]) => saveNarratedText(blockId, value)));
      }
      setGeneratingStates((prev) => {
        const next: typeof prev = {};
        blocks.forEach((block) => {
          next[block.id] = { ...prev[block.id], audio: true };
        });
        return { ...prev, ...next };
      });
      setAudioUrls({});
      invalidateSubtitleAssetsLocal();
      setTtsProgress((prev) => prev ?? { current: 0, total: blocks.length });
      setTtsPhase('waiting');
      const job = await apiPost<{ id: string; status: string }>(
        `/video-versions/${selectedVersionId}/tts`,
        {
          clientId: dispatchAgentIdRef.current,
          voiceId: lessonVoiceId ?? undefined,
          requestId: crypto.randomUUID()
        }
      );
      setIsGeneratingTts(true);
      setTtsPhase(job.status === 'running' ? 'running' : 'waiting');
      setTtsJobId(job.id);
      return true;
    } catch (err) {
      console.error(err);
      ttsBatchStartPendingRef.current = false;
      setError((err as Error).message ?? 'Failed to generate audios.');
      setIsGeneratingTts(false);
      setTtsPhase('idle');
      setTtsProgress(null);
      return false;
    }
  }, [blocks, ensureTtsReady, invalidateFinalVideoLocal, invalidateSubtitleAssetsLocal, lessonVoiceId, saveNarratedText, selectedVersionId]);

  const handleGlobalAction = async (action: string) => {
    if (!lessonId) return;
    const hasActiveTextGeneration = isSegmenting || singleTextQueue.active > 0;
    const hasActiveAudioGeneration = isGeneratingTts || singleTtsQueue.active > 0;
    const hasActiveTranscriptionGeneration = isGeneratingTranscription;
    const hasActiveImageOrSlideGeneration = isGeneratingAssets || singleImageQueue.active > 0;
    const hasHardLockGeneration = hasActiveTextGeneration || isGeneratingFinalVideo;
    const hasOtherGenerationRunning =
      hasActiveTextGeneration ||
      hasActiveAudioGeneration ||
      hasActiveTranscriptionGeneration ||
      hasActiveImageOrSlideGeneration ||
      isGeneratingFinalVideo;

    if (isGeneratingFinalVideo && action !== 'generateFinalVideo') {
      setError('Wait for final video generation to finish before editing or starting new jobs.');
      return;
    }

    if (action === 'generateBlocks') {
      if (hasOtherGenerationRunning) {
        setError('Stop current audio/image/slide/final video jobs before generating blocks.');
        return;
      }
      if (!selectedVersionId) {
        setError('Create a video version before generating blocks.');
        return;
      }
      await startSegmentJob(false);
      return;
    }
    if (action === 'generateSlides') {
      setError('Slides are disabled in this MVP.');
      return;
    }
    if (action === 'generateImages') {
      if (hasHardLockGeneration) {
        setError('Wait for block/final video generation to finish before generating images.');
        return;
      }
      if (missingImagePromptBlocks.length > 0) {
        const first = missingImagePromptBlocks[0];
        setError(`O bloco ${first.number} está sem prompt de imagem. Preencha para gerar imagens.`);
        scrollToBlock(first.id);
        return;
      }
      handleGenerateImages();
      return;
    }
    if (action === 'generateAudios') {
      if (hasHardLockGeneration) {
        setError('Wait for block/final video generation to finish before generating audios.');
        return;
      }
      if (!selectedVersionId) {
        setError('Create a video version before generating audios.');
        return;
      }
      if (!blocks.length) {
        setError('No blocks available to generate audios.');
        return;
      }
      if (blocks.some((block) => Boolean(audioReviewMarked[block.id]))) {
        await regenerateFlaggedAudios();
        return;
      }
      await startBatchTtsGeneration();
      return;
    }
      if (action === 'generateTranscription') {
        if (hasOtherGenerationRunning) {
          setError('Wait for current block/audio/image/transcription/final video jobs to finish before generating transcription.');
          return;
        }
        if (!selectedVersionId) {
          setError('Create a video version before generating transcription.');
          return;
        }
        if (blocks.length === 0) {
          setError('No blocks available to generate transcription.');
          return;
        }
        const missingAudio = missingAudioBlocksForFinal[0];
        if (missingAudio) {
          setError(`Block ${missingAudio.number} does not have audio yet. Generate audios before transcription.`);
          scrollToBlock(missingAudio.id);
          return;
        }
        try {
          setError(null);
          setIsGeneratingTranscription(true);
          setTranscriptionPhase('waiting');
          setTranscriptionProgress({ current: 0, total: Math.max(1, blocks.length) });
          const job = await apiPost<{ id: string; status: string }>(
            `/video-versions/${selectedVersionId}/transcription`,
            {
              clientId: dispatchAgentIdRef.current,
              requestId: crypto.randomUUID()
            }
          );
          setTranscriptionJobId(job.id);
          setTranscriptionPhase(job.status === 'running' ? 'running' : 'waiting');
        } catch (err) {
          console.error(err);
          setError((err as Error).message ?? 'Failed to generate transcription.');
          setIsGeneratingTranscription(false);
          setTranscriptionJobId(null);
          setTranscriptionPhase('idle');
          setTranscriptionProgress(null);
        }
        return;
      }
      if (action === 'generateFinalVideo') {
        if (hasActiveTextGeneration || hasActiveAudioGeneration || hasActiveTranscriptionGeneration || hasActiveImageOrSlideGeneration) {
          setError('Wait for current block/audio/image jobs to finish before generating the final video.');
          return;
        }
        if (!selectedVersionId) {
          setError('Create a video version before generating the final video.');
          return;
        }
        if (blocks.length === 0) {
          setError('No blocks available to generate the final video.');
          return;
        }
        const missingAudio = missingAudioBlocksForFinal[0];
        if (missingAudio) {
          setError(`Block ${missingAudio.number} does not have audio yet. Generate audios before the final video.`);
          scrollToBlock(missingAudio.id);
          return;
        }
        const missingImageAsset = missingImageAssetsForFinal[0];
        if (missingImageAsset) {
          setError(`Block ${missingImageAsset.number} does not have an image yet. Generate images before the final video.`);
          scrollToBlock(missingImageAsset.id);
          return;
        }
        const preflightWarnings: string[] = [];
        const audioReviewStartedForVersion = selectedVersionId
          ? Boolean(audioReviewStartedByVersion[selectedVersionId])
          : false;
        const hasFlaggedAudioPending = blocks.some((block) => Boolean(audioReviewMarked[block.id]));
        if (hasFlaggedAudioPending) {
          preflightWarnings.push('There are flagged audios pending regeneration.');
        } else if (!audioReviewStartedForVersion) {
          preflightWarnings.push('Audio review was not started for this version.');
        } else if (audioReviewPlayableCount > 0 && !isAudioReviewComplete) {
          preflightWarnings.push(`Audio review is incomplete (${audioReviewHeardCount}/${audioReviewPlayableCount} listened).`);
        }
        if (!selectedBgmPath.trim()) {
          preflightWarnings.push('No background music (BGM) is selected.');
        }
        const isMissingSubtitles = !hasSubtitleTranscriptionReady;
        if (preflightWarnings.length > 0 || isMissingSubtitles) {
          const intro = isMissingSubtitles
            ? 'Transcription/subtitles were not generated. Do you want to continue without subtitles?'
            : 'Please review these items before generating the final video. Do you still want to continue?';
          setFinalVideoPreflightDescription(
            `${intro} ${preflightWarnings.join(' ')}`
          );
          setIsFinalVideoPreflightConfirmOpen(true);
          return;
        }
        await startFinalVideoGenerationJob();
      }
    };

  useEffect(() => {
    if (!autoQueuePlan?.requestId) return;
    // Queue orchestration is backend-driven now.
    // Frontend should only mirror state and avoid creating follow-up jobs.
    if (autoQueueHandledRequestRef.current === autoQueuePlan.requestId) return;
    autoQueueHandledRequestRef.current = autoQueuePlan.requestId;
    autoQueueGenerateImageRef.current = Boolean(autoQueuePlan.generateImage);
    autoQueuePhaseRef.current = 'done';
  }, [autoQueuePlan]);

  const handleConfirmCancelAudioBatch = async () => {
    const activeSingleJobIds = Object.entries(singleTtsJobsRef.current)
      .filter(([, meta]) => !meta.done)
      .map(([jobId]) => jobId);

    if (!ttsJobId && activeSingleJobIds.length === 0) {
      setIsAudioBatchCancelConfirmOpen(false);
      return;
    }
    try {
      const requests: Promise<unknown>[] = [];
      if (ttsJobId) {
        requests.push(
          apiPost(`/jobs/${ttsJobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      for (const jobId of activeSingleJobIds) {
        requests.push(
          apiPost(`/jobs/${jobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      await Promise.allSettled(requests);
      setIsAudioBatchCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel audio generation.');
    }
  };

  const handleConfirmCancelSegmentBatch = async () => {
    const activeSingleJobIds = Object.entries(singleTextJobsRef.current)
      .filter(([, meta]) => !meta.done)
      .map(([jobId]) => jobId);

    if (!segmentJobId && activeSingleJobIds.length === 0) {
      setIsSegmentCancelConfirmOpen(false);
      return;
    }
    try {
      const requests: Promise<unknown>[] = [];
      if (segmentJobId) {
        requests.push(
          apiPost(`/jobs/${segmentJobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      for (const jobId of activeSingleJobIds) {
        requests.push(
          apiPost(`/jobs/${jobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      await Promise.allSettled(requests);
      setIsSegmentCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel block generation.');
    }
  };

  const handleConfirmCancelImageBatch = async () => {
    const activeSingleJobIds = Object.entries(singleImageJobsRef.current)
      .filter(([, meta]) => !meta.done)
      .map(([jobId]) => jobId);

    if ((!assetsJobId || assetsJobMode !== 'image') && activeSingleJobIds.length === 0) {
      setIsImageBatchCancelConfirmOpen(false);
      return;
    }
    try {
      const requests: Promise<unknown>[] = [];
      if (assetsJobId && assetsJobMode === 'image') {
        requests.push(
          apiPost(`/jobs/${assetsJobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      for (const jobId of activeSingleJobIds) {
        requests.push(
          apiPost(`/jobs/${jobId}/cancel`, {
            clientId: dispatchAgentIdRef.current
          })
        );
      }
      await Promise.allSettled(requests);
      setIsImageBatchCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel image generation.');
    }
  };

  const handleConfirmCancelSlidesBatch = async () => {
    if (!assetsJobId || assetsJobMode !== 'slides') {
      setIsSlidesBatchCancelConfirmOpen(false);
      return;
    }
    try {
      await apiPost(`/jobs/${assetsJobId}/cancel`, {
        clientId: dispatchAgentIdRef.current
      });
      setIsSlidesBatchCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel slide generation.');
    }
  };

  const handleConfirmCancelFinalVideo = async () => {
    if (!isGeneratingFinalVideo || !finalVideoJobId) {
      setIsFinalVideoCancelConfirmOpen(false);
      return;
    }
    try {
      await apiPost(`/jobs/${finalVideoJobId}/cancel`, {
        clientId: dispatchAgentIdRef.current
      });
      setIsFinalVideoCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel final video generation.');
    }
  };

  const handleConfirmCancelTranscription = async () => {
    if (!isGeneratingTranscription || !transcriptionJobId) {
      setIsTranscriptionCancelConfirmOpen(false);
      return;
    }
    try {
      await apiPost(`/jobs/${transcriptionJobId}/cancel`, {
        clientId: dispatchAgentIdRef.current
      });
      setIsTranscriptionCancelConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to cancel transcription generation.');
    }
  };

  const markAudioReviewChecked = useCallback((blockId: string) => {
    if (!selectedVersionId || !blockId) return;
    setAudioReviewCheckedByVersion((prev) => ({
      ...prev,
      [selectedVersionId]: {
        ...(prev[selectedVersionId] ?? {}),
        [blockId]: true
      }
    }));
  }, [selectedVersionId]);

  const clearAudioReviewChecksForBlocks = useCallback((blockIds: string[]) => {
    if (!selectedVersionId || blockIds.length === 0) return;
    setAudioReviewCheckedByVersion((prev) => {
      const current = prev[selectedVersionId];
      if (!current) return prev;
      let changed = false;
      const nextCurrent = { ...current };
      blockIds.forEach((id) => {
        if (nextCurrent[id]) {
          delete nextCurrent[id];
          changed = true;
        }
      });
      if (!changed) return prev;
      return { ...prev, [selectedVersionId]: nextCurrent };
    });
  }, [selectedVersionId]);

  const startFinalVideoGenerationJob = useCallback(async () => {
    if (!selectedVersionId) {
      setError('Create a video version before generating the final video.');
      return;
    }
    try {
      setError(null);
      setFinalVideoUrl(null);
      setFinalVideoLastElapsedSeconds(null);
      setIsGeneratingFinalVideo(true);
      setFinalVideoPhase('waiting');
      setFinalVideoProgress({ current: 0, total: blocks.length });
      const job = await apiPost<{ id: string; status: string }>(
        `/video-versions/${selectedVersionId}/final-video`,
        {
          clientId: dispatchAgentIdRef.current,
          requestId: crypto.randomUUID(),
          templateId: selectedTemplateId || undefined
        }
      );
      setFinalVideoJobId(job.id);
      setFinalVideoPhase(job.status === 'running' ? 'running' : 'waiting');
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Failed to generate final video.');
      setIsGeneratingFinalVideo(false);
      setFinalVideoPhase('idle');
      setFinalVideoProgress(null);
      setFinalVideoLastElapsedSeconds(null);
    }
  }, [blocks.length, selectedTemplateId, selectedVersionId]);

  const persistAssetsJob = (payload: AssetsJobStorage) => {
    try {
      window.localStorage.setItem(ASSETS_JOB_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error(err);
    }
  };

  const clearPersistedAssetsJob = () => {
    try {
      window.localStorage.removeItem(ASSETS_JOB_STORAGE_KEY);
    } catch (err) {
      console.error(err);
    }
  };

  const mergeLegacyBlock = (legacy: LegacyBlock) => {
    const prompt = parseImagePrompt(legacy.imagePromptJson);
    setBlocks((prev) => {
      const existingIndex = prev.findIndex((b) => b.id === legacy.id);
      const mapped: LessonBlock = {
        id: legacy.id,
        number: String(legacy.index),
        title: '',
        duration: '',
        status: mapLegacyStatus(legacy.status),
        thumbnail: '/lesson-placeholder.svg',
        thumbLandscape: '/lesson-placeholder.svg',
        thumbPortrait: '/lesson-placeholder-portrait.svg',
        originalText: legacy.sourceText ?? '',
        narratedText: legacy.ttsText ?? legacy.sourceText ?? '',
        onScreenText: {
          title: '',
          bullets: []
        },
        imagePrompt: {
          prompt: prompt?.block_prompt ?? '',
          avoid: prompt?.avoid ?? '',
          seedText: prompt?.seed_hint ?? '',
          seedNumber: prompt?.seed ?? 0
        },
        audioUrl: resolveAudioUrl(legacy.id),
        rawImageUrl: brokenRawImages[legacy.id]
          ? undefined
          : resolveImageUrl(legacy.id),
        slideUrl: selectedTemplateId && slideAvailability[legacy.id] && !isSlideBrokenForActiveTemplate(legacy.id)
          ? `${API_BASE}/blocks/${legacy.id}/slide?templateId=${selectedTemplateId}&v=${assetsRevision}`
          : undefined,
        generatedImageUrl: brokenRawImages[legacy.id]
          ? undefined
          : resolveImageUrl(legacy.id)
      };

      if (existingIndex === -1) {
        return [...prev, mapped].sort((a, b) => Number(a.number) - Number(b.number));
      }
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...mapped };
      return next;
    });
  };

  const mergeLegacyBlockRef = useRef(mergeLegacyBlock);
  const invalidateSlidesForBlocksRef = useRef(invalidateSlidesForBlocks);
  const clearBrokenSlidesForBlocksRef = useRef(clearBrokenSlidesForBlocks);

  useEffect(() => {
    mergeLegacyBlockRef.current = mergeLegacyBlock;
  }, [mergeLegacyBlock]);

  useEffect(() => {
    invalidateSlidesForBlocksRef.current = invalidateSlidesForBlocks;
  }, [invalidateSlidesForBlocks]);

  useEffect(() => {
    clearBrokenSlidesForBlocksRef.current = clearBrokenSlidesForBlocks;
  }, [clearBrokenSlidesForBlocks]);

  useEffect(() => {
    const activeStreams = [
      segmentJobId ? { jobId: segmentJobId, kind: 'segment' as const } : null,
      ttsJobId ? { jobId: ttsJobId, kind: 'tts' as const } : null,
      transcriptionJobId ? { jobId: transcriptionJobId, kind: 'subtitle_transcription' as const } : null,
      assetsJobId ? { jobId: assetsJobId, kind: assetsJobMode === 'slides' ? 'render_slide' as const : 'image' as const } : null,
      finalVideoJobId ? { jobId: finalVideoJobId, kind: 'concat_video' as const } : null
    ].filter((item): item is { jobId: string; kind: 'segment' | 'tts' | 'subtitle_transcription' | 'image' | 'render_slide' | 'concat_video' } => Boolean(item));

    if (activeStreams.length === 0) return;

    const sources: EventSource[] = [];
    const parseData = (event: Event) => {
      const msg = event as MessageEvent;
      try {
        return JSON.parse(msg.data) as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    for (const stream of activeStreams) {
      const es = new EventSource(`${API_BASE}/jobs/${stream.jobId}/stream`, { withCredentials: true });
      sources.push(es);

      es.addEventListener(JOB_STREAM_EVENT.BLOCK, (event) => {
        const data = parseData(event);
        const block = (data?.block ?? null) as LegacyBlock | null;
        if (!block) return;
        const blockVersionId =
          (typeof block.videoVersionId === 'string' && block.videoVersionId.trim()) ||
          (typeof block.lessonVersionId === 'string' && block.lessonVersionId.trim()) ||
          '';
        if (selectedVersionIdRef.current && blockVersionId && blockVersionId !== selectedVersionIdRef.current) return;
        mergeLegacyBlockRef.current(block);
      });

      es.addEventListener(JOB_STREAM_EVENT.AUDIO_BLOCK, (event) => {
        const data = parseData(event);
        const blockId = typeof data?.blockId === 'string' ? data.blockId : '';
        if (!blockId) return;
        setAudioUrls((prev) => ({ ...prev, [blockId]: `/blocks/${blockId}/audio/raw` }));
        setAudioRevisions((prev) => ({ ...prev, [blockId]: (prev[blockId] ?? 0) + 1 }));
      });

      es.addEventListener(JOB_STREAM_EVENT.IMAGE, (event) => {
        const data = parseData(event);
        const blockId = typeof data?.blockId === 'string' ? data.blockId : '';
        if (!blockId) return;
        invalidateSlidesForBlocksRef.current([blockId]);
        setBrokenRawImages((prev) => ({ ...prev, [blockId]: false }));
        clearBrokenSlidesForBlocksRef.current([blockId]);
        setImageUrls((prev) => ({ ...prev, [blockId]: `/blocks/${blockId}/image/raw` }));
        setImageRevisions((prev) => ({ ...prev, [blockId]: (prev[blockId] ?? 0) + 1 }));
        setGeneratingStates((prev) => {
          const current = prev[blockId];
          if (!current?.image) return prev;
          return {
            ...prev,
            [blockId]: {
              ...current,
              image: false
            }
          };
        });
      });

      es.addEventListener(JOB_STREAM_EVENT.PROGRESS, (event) => {
        const data = parseData(event);
        const index = typeof data?.index === 'number' ? data.index : null;
        const total = typeof data?.total === 'number' ? data.total : null;
        if (index === null || total === null) return;
        if (stream.kind === 'segment') {
          setSegmentPhase('running');
          setSegmentProgress({ current: index, total });
          return;
        }
        if (stream.kind === 'tts') {
          setTtsPhase('running');
          setTtsProgress({ current: index, total });
          return;
        }
        if (stream.kind === 'image') {
          setImagePhase('running');
          setImageProgress({ current: index, total });
          return;
        }
        if (stream.kind === 'render_slide') {
          setSlidesPhase('running');
          setSlidesProgress({ current: index, total });
          return;
        }
        if (stream.kind === 'subtitle_transcription') {
          setTranscriptionPhase('running');
          setTranscriptionProgress({ current: index, total });
          return;
        }
        if (stream.kind === 'concat_video') {
          setFinalVideoPhase('running');
          setFinalVideoProgress({ current: index, total });
        }
      });

      es.addEventListener(JOB_STREAM_EVENT.FINAL_VIDEO, (event) => {
        const data = parseData(event);
        const url = typeof data?.url === 'string' ? data.url : '';
        if (!url) return;
        setFinalVideoUrl(`${API_BASE}${url}?v=${Date.now()}`);
      });

      es.addEventListener(JOB_STREAM_EVENT.DONE, () => {
        es.close();
      });
    }

    return () => {
      sources.forEach((source) => source.close());
    };
  }, [
    assetsJobId,
    assetsJobMode,
    finalVideoJobId,
    segmentJobId,
    transcriptionJobId,
    ttsJobId
  ]);

  // 6.8.2.6.13: editor job lifecycle uses WS-only events (`vizlec:ws`).

  useEffect(() => {
    if (!isGeneratingFinalVideo) {
      finalVideoStartedAtRef.current = null;
      return;
    }
    if (finalVideoStartedAtRef.current === null) {
      finalVideoStartedAtRef.current = Date.now();
      setFinalVideoElapsedSeconds(0);
    }
    const tick = () => {
      const startedAt = finalVideoStartedAtRef.current;
      if (!startedAt) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setFinalVideoElapsedSeconds(elapsed);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isGeneratingFinalVideo]);

  useEffect(() => {
    if (!isGeneratingFinalVideo) return;
    setIsTemplateMenuOpen(false);
    setIsVoiceModalOpen(false);
    setIsMobileActionsMenuOpen(false);
  }, [isGeneratingFinalVideo]);

  

  // Global Voice update
  const handleVoiceSelected = (voice: Voice) => {
    setLessonVoiceId(voice.voice_id);
    
    setIsVoiceModalOpen(false);
    void updateSelectedVersionPreferences({ preferredVoiceId: voice.voice_id });
  };

  const hasSingleTextQueue = singleTextQueue.active > 0;
  const showTopSegmentBusy = isSegmenting || hasSingleTextQueue;
  const isTextGenerationBusy = showTopSegmentBusy;
  const hasBatchSegmentProgress = isSegmenting;
  const topSegmentCurrent = hasBatchSegmentProgress
    ? (segmentPhase === 'running'
      ? Math.min(segmentProgress?.total ?? 0, (segmentProgress?.current ?? 0) + 1)
      : (segmentProgress?.current ?? 0))
    : hasSingleTextQueue
      ? Math.min(singleTextQueue.total, singleTextQueue.completed + 1)
      : 0;
  const topSegmentTotal = hasBatchSegmentProgress
    ? (segmentProgress?.total ?? 0)
    : hasSingleTextQueue
      ? singleTextQueue.total
      : 0;
  const topSegmentProgressWidth =
    topSegmentTotal > 0 ? Math.min(100, (topSegmentCurrent / topSegmentTotal) * 100) : 0;
  const topSegmentProgressLabel = hasBatchSegmentProgress
    ? formatActiveCounter(segmentPhase, segmentProgress)
    : `${Math.min(topSegmentTotal, Math.max(0, topSegmentCurrent))}/${topSegmentTotal}`;

  const hasSingleTtsQueue = singleTtsQueue.active > 0;
  const showTopTtsBusy = isGeneratingTts || hasSingleTtsQueue;
  const topTtsCurrent = isGeneratingTts
    ? (ttsPhase === 'running'
      ? Math.min(ttsProgress?.total ?? 0, (ttsProgress?.current ?? 0) + 1)
      : (ttsProgress?.current ?? 0))
    : hasSingleTtsQueue
      ? Math.min(singleTtsQueue.total, singleTtsQueue.completed + 1)
      : 0;
  const topTtsTotal = isGeneratingTts
    ? (ttsProgress?.total ?? 0)
    : hasSingleTtsQueue
      ? singleTtsQueue.total
      : 0;
  const topTtsProgressWidth =
    topTtsTotal > 0 ? Math.min(100, (topTtsCurrent / topTtsTotal) * 100) : 0;
  const topTtsProgressLabel = `${Math.min(topTtsTotal, Math.max(0, topTtsCurrent))}/${topTtsTotal}`;

  const hasSingleImageQueue = singleImageQueue.active > 0;
  const showTopImageBusy = (isGeneratingAssets && assetsJobMode === 'image') || hasSingleImageQueue;
  const topImageCurrent = isGeneratingAssets && assetsJobMode === 'image'
    ? (imagePhase === 'running'
      ? Math.min(imageProgress?.total ?? 0, (imageProgress?.current ?? 0) + 1)
      : (imageProgress?.current ?? 0))
    : hasSingleImageQueue
      ? Math.min(singleImageQueue.total, singleImageQueue.completed + 1)
      : 0;
  const topImageTotal = isGeneratingAssets && assetsJobMode === 'image'
    ? (imageProgress?.total ?? 0)
    : hasSingleImageQueue
      ? singleImageQueue.total
      : 0;
  const topImageProgressWidth =
    topImageTotal > 0 ? Math.min(100, (topImageCurrent / topImageTotal) * 100) : 0;
  const topImageProgressLabel = `${Math.min(topImageTotal, Math.max(0, topImageCurrent))}/${topImageTotal}`;
  const showTopSlidesBusy = isGeneratingAssets && assetsJobMode === 'slides';
  const topSlidesCurrent = slidesPhase === 'running'
    ? Math.min(slidesProgress?.total ?? 0, Math.max(1, (slidesProgress?.current ?? 0) + 1))
    : (slidesProgress?.current ?? 0);
  const topSlidesTotal = slidesProgress?.total ?? 0;
  const topSlidesProgressWidth =
    topSlidesTotal > 0 ? Math.min(100, (topSlidesCurrent / topSlidesTotal) * 100) : 0;
  const topSlidesProgressLabel = `${Math.min(topSlidesTotal, Math.max(0, topSlidesCurrent))}/${topSlidesTotal}`;
  const showTopTranscriptionBusy = isGeneratingTranscription;
  const topTranscriptionCurrent = transcriptionPhase === 'running'
    ? Math.min(transcriptionProgress?.total ?? 0, Math.max(1, (transcriptionProgress?.current ?? 0) + 1))
    : (transcriptionProgress?.current ?? 0);
  const topTranscriptionTotal = transcriptionProgress?.total ?? 0;
  const topTranscriptionProgressWidth =
    topTranscriptionTotal > 0 ? Math.min(100, (topTranscriptionCurrent / topTranscriptionTotal) * 100) : 0;
  const topTranscriptionProgressLabel = `${Math.min(topTranscriptionTotal, Math.max(0, topTranscriptionCurrent))}/${topTranscriptionTotal}`;
  const topFinalCurrent = finalVideoPhase === 'running'
    ? Math.min(finalVideoProgress?.total ?? 0, Math.max(1, (finalVideoProgress?.current ?? 0) + 1))
    : (finalVideoProgress?.current ?? 0);
  const topFinalTotal = finalVideoProgress?.total ?? 0;
  const isFinalVideoBlockPhase =
    isGeneratingFinalVideo &&
    finalVideoPhase === 'running' &&
    topFinalTotal > 0 &&
    topFinalCurrent < topFinalTotal;
  const isFinalVideoComposePhase =
    isGeneratingFinalVideo &&
    finalVideoPhase === 'running' &&
    (topFinalTotal === 0 || topFinalCurrent >= topFinalTotal);
  const topFinalProgressWidth =
    topFinalTotal > 0 ? Math.min(100, (topFinalCurrent / topFinalTotal) * 100) : 0;
  const topFinalElapsedLabel = formatElapsedTime(finalVideoElapsedSeconds);
  const topFinalLastElapsedLabel =
    finalVideoLastElapsedSeconds !== null ? formatElapsedTime(finalVideoLastElapsedSeconds) : null;
  const hasFinalVideoReady = Boolean(finalVideoUrl) && !isGeneratingFinalVideo;
  const hasSubtitleTranscriptionReady = Boolean(subtitleFiles['subtitle_srt']);
  const finalVideoLink = finalVideoUrl ?? undefined;
  const finalVideoModalSrc = finalVideoLink ? `${finalVideoLink}&modal=1` : undefined;
  const downloadFinalVideoInChunks = async (url: string, rawTitle: string) => {
    setIsDownloadingFinalVideo(true);
    setFinalVideoDownloadError(null);
    try {
      const chunkSize = 2 * 1024 * 1024;
      const chunks: BlobPart[] = [];
      let start = 0;
      let total: number | null = null;
      let safety = 0;

      while (total === null || start < total) {
        if (safety++ > 10000) {
          throw new Error('Download interrupted: too many chunks');
        }
        const end: number = total === null ? start + chunkSize - 1 : Math.min(total - 1, start + chunkSize - 1);
        const response: Response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: { Range: `bytes=${start}-${end}` }
        });
        if (response.status === 416) {
          const contentRange416 = response.headers.get('Content-Range');
          const totalMatch = contentRange416 ? /bytes\s+\*\/(\d+)/i.exec(contentRange416) : null;
          const reportedTotal = totalMatch ? Number(totalMatch[1]) : null;
          if (reportedTotal !== null && Number.isFinite(reportedTotal)) {
            total = reportedTotal;
          }
          if (chunks.length > 0 && total !== null && start >= total) {
            break;
          }
        }
        if (response.status !== 200 && response.status !== 206) {
          const fallbackText = `${response.status} ${response.statusText}`.trim();
          let message = fallbackText || 'Download failed';
          try {
            const data = await response.json() as { error?: string };
            if (data?.error) message = data.error;
          } catch {
            // ignore non-json body
          }
          throw new Error(message);
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) {
          throw new Error('Download failed: empty chunk');
        }
        chunks.push(buffer);

        if (response.status === 206) {
          const contentRange: string | null = response.headers.get('Content-Range');
          const match: RegExpExecArray | null = contentRange ? /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(contentRange) : null;
          if (match) {
            const receivedEnd = Number(match[2]);
            total = Number(match[3]);
            start = receivedEnd + 1;
          } else {
            start += buffer.byteLength;
          }
        } else {
          total = buffer.byteLength;
          start = buffer.byteLength;
        }
      }

      const safeBase = (rawTitle || 'final-video')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[.\s]+$/g, '')
        .trim() || 'final-video';
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${safeBase}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setFinalVideoDownloadError((err as Error).message || 'Download failed');
    } finally {
      setIsDownloadingFinalVideo(false);
    }
  };
  const topFinalComposeGaugeOffset = ((finalVideoElapsedSeconds * 16) % 140) - 40;
  const breadcrumbParts = [
    { key: 'channel' as const, label: (courseTitle ?? '').trim(), onClick: onGoCourse },
    { key: 'section' as const, label: (moduleTitle ?? '').trim(), onClick: onGoModule },
    { key: 'video' as const, label: (lessonTitle ?? '').trim(), onClick: undefined }
  ].filter((part) => part.label.length > 0);
  const audioReviewQueueSet = useMemo(() => new Set(audioReviewQueue), [audioReviewQueue]);
  const blocksById = useMemo(() => {
    const map: Record<string, LessonBlock> = {};
    blocks.forEach((block) => {
      map[block.id] = block;
    });
    return map;
  }, [blocks]);
  const selectedSlideTemplateKind =
    slideTemplates.find((template) => template.id === selectedTemplateId)?.kind ?? null;
  const templateRequiresImageAsset = selectedSlideTemplateKind === 'image';
  const selectedBgmPreviewUrl = selectedBgmPath
    ? `${API_BASE}/bgm/library/raw?path=${encodeURIComponent(selectedBgmPath)}&v=${encodeURIComponent(
        selectedVersionId ?? ''
      )}`
    : null;
  const mixerVoiceQueue = useMemo(
    () =>
      blocks
        .filter((block) => Boolean(block.audioUrl))
        .map((block) => ({ blockId: block.id, url: block.audioUrl as string })),
    [blocks]
  );
  const voiceDbDraft = useMemo(() => linearGainToDb(voiceVolumeDraft), [voiceVolumeDraft]);
  const masterDbDraft = useMemo(() => linearGainToDb(masterVolumeDraft), [masterVolumeDraft]);
  const musicDbDraft = useMemo(() => linearGainToDb(bgmVolumeDraft), [bgmVolumeDraft]);
  const effectiveVoiceGain = mixerVoiceMuted ? 0 : clampMixerLinearGain(voiceVolumeDraft);
  const effectiveMusicGain = mixerMusicMuted ? 0 : clampMixerLinearGain(bgmVolumeDraft);
  const effectiveMasterGain = clampMixerLinearGain(masterVolumeDraft);
  const mixerClipRisk = effectiveMasterGain * (effectiveVoiceGain + effectiveMusicGain) > 1.001 || mixerMasterPeak >= 0.99;

  const scheduleBgmVolumeSave = useCallback(
    (nextVolume: number) => {
      if (bgmVolumeSaveTimeoutRef.current) {
        window.clearTimeout(bgmVolumeSaveTimeoutRef.current);
      }
      bgmVolumeSaveTimeoutRef.current = window.setTimeout(() => {
        bgmVolumeSaveTimeoutRef.current = null;
        void updateSelectedVersionPreferences({ bgmVolume: nextVolume });
      }, 300);
    },
    [updateSelectedVersionPreferences]
  );
  const scheduleVoiceVolumeSave = useCallback(
    (nextVolume: number) => {
      if (voiceVolumeSaveTimeoutRef.current) {
        window.clearTimeout(voiceVolumeSaveTimeoutRef.current);
      }
      voiceVolumeSaveTimeoutRef.current = window.setTimeout(() => {
        voiceVolumeSaveTimeoutRef.current = null;
        void updateSelectedVersionPreferences({ voiceVolume: nextVolume });
      }, 300);
    },
    [updateSelectedVersionPreferences]
  );
  const scheduleMasterVolumeSave = useCallback(
    (nextVolume: number) => {
      if (masterVolumeSaveTimeoutRef.current) {
        window.clearTimeout(masterVolumeSaveTimeoutRef.current);
      }
      masterVolumeSaveTimeoutRef.current = window.setTimeout(() => {
        masterVolumeSaveTimeoutRef.current = null;
        void updateSelectedVersionPreferences({ masterVolume: nextVolume });
      }, 300);
    },
    [updateSelectedVersionPreferences]
  );

  const ensureMixerAudioGraph = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const bgmEl = bgmPreviewAudioRef.current;
    const voiceEl = mixerVoiceAudioRef.current;
    if (!bgmEl || !voiceEl) return null;

    let ctx = mixerAudioContextRef.current;
    if (!ctx) {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      mixerAudioContextRef.current = ctx;
    }

    if (!mixerMasterGainNodeRef.current) {
      mixerMasterGainNodeRef.current = ctx.createGain();
    }
    if (!mixerAnalyserNodeRef.current) {
      mixerAnalyserNodeRef.current = ctx.createAnalyser();
      mixerAnalyserNodeRef.current.fftSize = 2048;
      mixerAnalyserNodeRef.current.smoothingTimeConstant = 0.75;
    }
    if (!mixerBgmGainNodeRef.current) {
      mixerBgmGainNodeRef.current = ctx.createGain();
      mixerBgmGainNodeRef.current.connect(mixerMasterGainNodeRef.current);
    }
    if (!mixerVoiceGainNodeRef.current) {
      mixerVoiceGainNodeRef.current = ctx.createGain();
      mixerVoiceGainNodeRef.current.connect(mixerMasterGainNodeRef.current);
    }
    if (mixerMasterGainNodeRef.current && mixerAnalyserNodeRef.current) {
      try {
        mixerMasterGainNodeRef.current.disconnect();
      } catch {}
      mixerMasterGainNodeRef.current.connect(mixerAnalyserNodeRef.current);
      mixerAnalyserNodeRef.current.connect(ctx.destination);
    }
    try {
      if (!mixerBgmSourceNodeRef.current) {
        mixerBgmSourceNodeRef.current = ctx.createMediaElementSource(bgmEl);
        mixerBgmSourceNodeRef.current.connect(mixerBgmGainNodeRef.current);
      }
      if (!mixerVoiceSourceNodeRef.current) {
        mixerVoiceSourceNodeRef.current = ctx.createMediaElementSource(voiceEl);
        mixerVoiceSourceNodeRef.current.connect(mixerVoiceGainNodeRef.current);
      }
    } catch (err) {
      console.error('Mixer WebAudio graph init failed, using element fallback', err);
      return null;
    }

    bgmEl.volume = 1;
    voiceEl.volume = 1;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => null);
    }
    return ctx;
  }, []);

  useEffect(() => {
    const gain = mixerBgmGainNodeRef.current;
    if (gain) {
      gain.gain.value = mixerMusicMuted ? 0 : clampMixerLinearGain(bgmVolumeDraft);
      return;
    }
    const player = bgmPreviewAudioRef.current;
    if (!player) return;
    player.volume = mixerMusicMuted ? 0 : clamp01(bgmVolumeDraft);
  }, [bgmVolumeDraft, selectedBgmPreviewUrl, mixerMusicMuted]);

  useEffect(() => {
    const gain = mixerVoiceGainNodeRef.current;
    if (gain) {
      gain.gain.value = mixerVoiceMuted ? 0 : clampMixerLinearGain(voiceVolumeDraft);
      return;
    }
    const player = mixerVoiceAudioRef.current;
    if (!player) return;
    player.volume = mixerVoiceMuted ? 0 : clamp01(voiceVolumeDraft);
  }, [voiceVolumeDraft, mixerVoiceMuted]);

  useEffect(() => {
    const gain = mixerMasterGainNodeRef.current;
    if (gain) {
      gain.gain.value = clampMixerLinearGain(masterVolumeDraft);
    }
  }, [masterVolumeDraft]);

  useEffect(() => {
    if (!mixerIsPlaying) {
      setMixerMasterPeak(0);
      if (mixerMeterFrameRef.current) {
        cancelAnimationFrame(mixerMeterFrameRef.current);
        mixerMeterFrameRef.current = null;
      }
      return;
    }
    const analyser = mixerAnalyserNodeRef.current;
    if (!analyser) return;
    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let peak = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = Math.abs(buffer[i] ?? 0);
        if (v > peak) peak = v;
      }
      setMixerMasterPeak(peak);
      mixerMeterFrameRef.current = requestAnimationFrame(tick);
    };
    mixerMeterFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (mixerMeterFrameRef.current) {
        cancelAnimationFrame(mixerMeterFrameRef.current);
        mixerMeterFrameRef.current = null;
      }
    };
  }, [mixerIsPlaying]);

  useEffect(() => {
    if (mixerVoiceIndex >= mixerVoiceQueue.length) {
      setMixerVoiceIndex(0);
    }
  }, [mixerVoiceIndex, mixerVoiceQueue.length]);

  const stopMixer = useCallback(() => {
    setMixerIsPlaying(false);
    setMixerMasterPeak(0);
    bgmPreviewAudioRef.current?.pause();
    mixerVoiceAudioRef.current?.pause();
  }, []);

  const startMixer = useCallback(async () => {
    const hasVoice = mixerVoiceQueue.length > 0;
    const hasMusic = Boolean(selectedBgmPreviewUrl);
    if (!hasVoice && !hasMusic) return;
    setMixerIsPlaying(true);
    const mixerCtx = await ensureMixerAudioGraph();
    if (!mixerCtx) {
      if (bgmPreviewAudioRef.current) {
        bgmPreviewAudioRef.current.volume = mixerMusicMuted ? 0 : clamp01(bgmVolumeDraft);
      }
      if (mixerVoiceAudioRef.current) {
        mixerVoiceAudioRef.current.volume = mixerVoiceMuted ? 0 : clamp01(voiceVolumeDraft);
      }
    }

    if (hasMusic && bgmPreviewAudioRef.current) {
      void bgmPreviewAudioRef.current.play().catch((err) => {
        console.error('Mixer BGM play failed', err);
      });
    }
    if (hasVoice && mixerVoiceAudioRef.current) {
      const safeIndex = Math.max(0, Math.min(mixerVoiceIndex, mixerVoiceQueue.length - 1));
      const nextUrl = mixerVoiceQueue[safeIndex]?.url;
      if (nextUrl && mixerVoiceAudioRef.current.src !== nextUrl) {
        mixerVoiceAudioRef.current.src = nextUrl;
        setMixerVoiceIndex(safeIndex);
      }
      void mixerVoiceAudioRef.current.play().catch((err) => {
        console.error('Mixer voice play failed', err);
      });
    }
  }, [
    ensureMixerAudioGraph,
    bgmVolumeDraft,
    mixerMusicMuted,
    mixerVoiceIndex,
    mixerVoiceMuted,
    mixerVoiceQueue,
    selectedBgmPreviewUrl,
    voiceVolumeDraft
  ]);

  const toggleMixerPlayback = useCallback(() => {
    if (mixerIsPlaying) {
      stopMixer();
      return;
    }
    void startMixer();
  }, [mixerIsPlaying, startMixer, stopMixer]);

  useEffect(() => {
    if (!mixerIsPlaying || !selectedBgmPreviewUrl) return;
    void ensureMixerAudioGraph().catch(() => null);
    void bgmPreviewAudioRef.current?.play().catch(() => null);
  }, [ensureMixerAudioGraph, selectedBgmPreviewUrl, mixerIsPlaying]);

  const missingOnScreenBlocks = blocks.filter((block) => !hasOnScreenText(block));
  const missingImagePromptBlocks = blocks.filter((block) => !hasImagePromptText(block));
  const missingAudioBlocksForFinal = blocks.filter((block) => !audioUrls[block.id]);
  const missingSlideBlocksForFinal = blocks.filter((block) => !slideAvailability[block.id]);
  const missingImageAssetsForFinal = blocks.filter((block) => !imageUrls[block.id] && !block.rawImageUrl && !block.generatedImageUrl);
  const areBlocksPhaseReady = blocks.length > 0;
  const areAudiosPhaseReady = blocks.length > 0 && missingAudioBlocksForFinal.length === 0;
  const areImagesPhaseReady = blocks.length > 0 && missingImageAssetsForFinal.length === 0;
  const audioReviewCurrentBlockId = audioReviewQueue[audioReviewIndex] ?? '';
  const audioReviewCurrentBlock = audioReviewCurrentBlockId ? blocksById[audioReviewCurrentBlockId] : undefined;
  const audioReviewCurrentUrl = audioReviewCurrentBlock?.audioUrl;
  const subtitleCues = useMemo<Array<SubtitleCue & { index: number }>>(
    () =>
      Array.isArray(subtitleCuesData?.cues)
        ? subtitleCuesData.cues
            .filter((cue) => cue && Number.isFinite(cue.start) && Number.isFinite(cue.end) && typeof cue.text === 'string')
            .map((cue, idx) => ({ index: idx + 1, start: Number(cue.start), end: Number(cue.end), text: String(cue.text) }))
        : [],
    [subtitleCuesData]
  );
  const subtitleDataByBlock = useMemo(() => {
    let cursor = 0;
    const out: Record<string, { start: number; end: number; cues: Array<SubtitleCue & { index: number }> }> = {};
    const rawFileEntries = Array.isArray(subtitleRawData?.files) ? subtitleRawData.files : [];
    const rawBlockWindows = Array.isArray(subtitleRawData?.block_windows) ? subtitleRawData.block_windows : [];
    const rawTimingByBlockIndex = new Map<number, { start: number; end: number }>();
    rawFileEntries.forEach((entry, idx) => {
      const blockIndex =
        typeof entry?.block_index === 'number' && Number.isFinite(entry.block_index)
          ? Math.trunc(entry.block_index)
          : idx;
      const start =
        typeof entry?.offset_start === 'number' && Number.isFinite(entry.offset_start)
          ? Number(entry.offset_start)
          : null;
      const end =
        typeof entry?.offset_end === 'number' && Number.isFinite(entry.offset_end)
          ? Number(entry.offset_end)
          : null;
      if (start !== null && end !== null && end > start) {
        rawTimingByBlockIndex.set(blockIndex, { start, end });
      }
    });
    rawBlockWindows.forEach((entry, idx) => {
      const blockIndex =
        typeof entry?.block_index === 'number' && Number.isFinite(entry.block_index)
          ? Math.trunc(entry.block_index)
          : idx;
      const start =
        typeof entry?.start === 'number' && Number.isFinite(entry.start)
          ? Number(entry.start)
          : null;
      const end =
        typeof entry?.end === 'number' && Number.isFinite(entry.end)
          ? Number(entry.end)
          : null;
      if (start !== null && end !== null && end > start && !rawTimingByBlockIndex.has(blockIndex)) {
        rawTimingByBlockIndex.set(blockIndex, { start, end });
      }
    });
    blocks.forEach((block, fallbackIndex) => {
      const blockIndex = typeof block.index === 'number' && Number.isFinite(block.index) ? block.index : fallbackIndex;
      const dur = typeof block.audioDurationSeconds === 'number' && Number.isFinite(block.audioDurationSeconds) && block.audioDurationSeconds > 0
        ? block.audioDurationSeconds
        : 0;
      const rawTiming = rawTimingByBlockIndex.get(blockIndex);
      const start = rawTiming?.start ?? cursor;
      const end = rawTiming?.end ?? (cursor + dur);
      const cues = subtitleCues
        .filter((cue) => cue.end > start && cue.start < end)
        .map((cue) => ({ ...cue, text: cue.text.replace(/\\N/g, '\n').trim() }))
        .filter((cue) => cue.text);
      out[block.id] = { start, end, cues };
      cursor = end;
    });
    return out;
  }, [blocks, subtitleCues, subtitleRawData]);
  const subtitlePlainTextByBlock = useMemo(() => {
    const out: Record<string, string> = {};
    for (const block of blocks) {
      const blockData = subtitleDataByBlock[block.id];
      const cues = blockData?.cues ?? [];
      out[block.id] = cues
        .map((cue) => cue.text)
        .join('\n\n');
    }
    return out;
  }, [blocks, subtitleDataByBlock]);
  const subtitleReviewDraftsForVersion = selectedVersionId ? (subtitleReviewTextByVersion[selectedVersionId] ?? {}) : {};
  const audioReviewCurrentSubtitleCues = audioReviewCurrentBlockId
    ? (subtitleDataByBlock[audioReviewCurrentBlockId]?.cues ?? [])
    : [];
  const audioReviewCurrentSubtitleWindow = audioReviewCurrentBlockId
    ? subtitleDataByBlock[audioReviewCurrentBlockId]
    : undefined;
  const audioReviewCurrentAbsoluteTime = (audioReviewCurrentSubtitleWindow?.start ?? 0) + audioReviewCurrentTime;
  const audioReviewCurrentSubtitleOverlayText = useMemo(() => {
    if (!audioReviewCurrentSubtitleCues.length) return '';
    const active = audioReviewCurrentSubtitleCues
      .filter((cue) => cue.start <= audioReviewCurrentAbsoluteTime && cue.end > audioReviewCurrentAbsoluteTime)
      .map((cue) => cue.text.trim())
      .filter(Boolean);
    if (active.length > 0) return active.join('\n');
    if (audioReviewCurrentTime <= 0.05) {
      return audioReviewCurrentSubtitleCues[0]?.text?.trim?.() ?? '';
    }
    return '';
  }, [audioReviewCurrentAbsoluteTime, audioReviewCurrentSubtitleCues, audioReviewCurrentTime]);
  const audioReviewCurrentSubtitleText = audioReviewCurrentBlockId
    ? (subtitleReviewDraftsForVersion[audioReviewCurrentBlockId] ?? subtitlePlainTextByBlock[audioReviewCurrentBlockId] ?? '')
    : '';
  const audioReviewCurrentNarratedText = audioReviewTextDraft;
  const audioReviewCurrentImageUrl =
    audioReviewCurrentBlock?.generatedImageUrl ??
    audioReviewCurrentBlock?.rawImageUrl ??
    audioReviewCurrentBlock?.slideUrl;
  const audioReviewCurrentCharCount = getNarratedCharCount(audioReviewCurrentNarratedText);
  const audioReviewCurrentOverLimit = audioReviewCurrentCharCount > AUDIO_CHAR_LIMIT;
  const audioReviewMarkedCount = audioReviewQueue.filter((id) => Boolean(audioReviewMarked[id])).length;
  const audioReviewGeneratingTotal = audioReviewRegenerating ? audioReviewQueue.length : 0;
  const audioReviewGeneratingDone = audioReviewRegenerating
    ? audioReviewQueue.reduce((count, id) => count + (generatingStates[id]?.audio ? 0 : 1), 0)
    : 0;
  const audioReviewGeneratingCurrent = audioReviewRegenerating
    ? Math.min(audioReviewGeneratingTotal, audioReviewGeneratingDone + 1)
    : 0;
  const audioReviewPlayableCount = blocks.filter((block) => Boolean(audioUrls[block.id])).length;
  const audioReviewControlsLocked = audioReviewRegenerating || isGeneratingFinalVideo;
  const hasActiveTextGeneration = showTopSegmentBusy;
  const hasActiveAudioGeneration = showTopTtsBusy;
  const hasActiveTranscriptionGeneration = showTopTranscriptionBusy;
  const hasActiveImageOrSlideGeneration = showTopImageBusy || showTopSlidesBusy;
  const hasHardLockGeneration = hasActiveTextGeneration || isGeneratingFinalVideo;
  const isAnyGenerationRunning =
    hasActiveTextGeneration ||
    hasActiveAudioGeneration ||
    hasActiveTranscriptionGeneration ||
    hasActiveImageOrSlideGeneration ||
    isGeneratingFinalVideo;
  const isGenerateBlocksDisabled = isAnyGenerationRunning;
  const isGenerateAudiosDisabled =
    hasHardLockGeneration || (ttsHealthChecked && !ttsHealthy);
  const isGenerateImagesDisabled = hasHardLockGeneration || blocks.length === 0 || missingImagePromptBlocks.length > 0;
  const isGenerateSlidesDisabled = hasHardLockGeneration || blocks.length === 0 || missingOnScreenBlocks.length > 0;
  const isGenerateTranscriptionDisabled =
    isAnyGenerationRunning ||
    blocks.length === 0 ||
    missingAudioBlocksForFinal.length > 0;
  const isGenerateFinalVideoDisabled =
    isAnyGenerationRunning ||
    blocks.length === 0 ||
    missingAudioBlocksForFinal.length > 0 ||
    missingImageAssetsForFinal.length > 0;
  const isAudioReviewDisabled = audioReviewPlayableCount === 0 || isAnyGenerationRunning || isGeneratingFinalVideo;
  const contentValidationAlerts = [
    ...missingImagePromptBlocks.map((block) => ({
      key: `missing-prompt-${block.id}`,
      blockId: block.id,
      message: `${block.number}: missing image prompt.`
    }))
  ];
  const flaggedAudioBlocks = blocks.filter((block) => Boolean(audioReviewMarked[block.id]));
  const flaggedAudioCount = flaggedAudioBlocks.length;
  const audioReviewCheckedMapForVersion =
    selectedVersionId ? (audioReviewCheckedByVersion[selectedVersionId] ?? {}) : {};
  const audioReviewHeardCount = blocks.reduce(
    (count, block) => count + (audioUrls[block.id] && audioReviewCheckedMapForVersion[block.id] ? 1 : 0),
    0
  );
  const isAudioReviewComplete = audioReviewPlayableCount > 0 && audioReviewHeardCount >= audioReviewPlayableCount;
  const globalAudioActionLabel = flaggedAudioCount > 0
    ? `Regenerate Flagged Audios (${flaggedAudioCount})`
    : areAudiosPhaseReady
      ? 'Regenerate Audios'
      : 'Generate Audios';
  const mobileStatusLabel = isGeneratingFinalVideo
    ? 'Final video in progress'
    : showTopTranscriptionBusy
    ? `Transcription ${topTranscriptionProgressLabel}`
    : showTopImageBusy
    ? `Images ${topImageProgressLabel}`
    : showTopTtsBusy
    ? `Audios ${topTtsProgressLabel}`
    : showTopSegmentBusy
    ? `Blocks ${topSegmentProgressLabel}`
    : 'No active jobs';
  const toolbarDisabledLikeAudioReview =
    'disabled:bg-indigo-500/10 disabled:border-indigo-500/20 disabled:text-muted-foreground disabled:hover:bg-indigo-500/10 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed';
  const canGoPrevAudioReview = audioReviewIndex > 0;
  const canGoNextAudioReview = audioReviewIndex < Math.max(0, audioReviewQueue.length - 1);
  const canSeekBackwardAudioReview = audioReviewCurrentTime > 0.05;
  const maxAudioReviewSeek = Math.max(audioReviewSeekableEnd, audioReviewDuration);
  const canSeekForwardAudioReview = maxAudioReviewSeek > 0 && audioReviewCurrentTime < Math.max(0, maxAudioReviewSeek - 0.05);
  const audioReviewFormattedTime = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const audioReviewProgressPct = maxAudioReviewSeek > 0
    ? Math.min(100, (audioReviewCurrentTime / maxAudioReviewSeek) * 100)
    : 0;

  const startAudioReview = useCallback(() => {
    if (isAnyGenerationRunning) {
      setError('Wait for current jobs to finish before starting review.');
      return;
    }
    const queue = blocks.filter((block) => Boolean(audioUrls[block.id])).map((block) => block.id);
    if (queue.length === 0) {
      setError('Generate audios before starting review.');
      return;
    }
    setError(null);
    setAudioReviewQueue(queue);
    setAudioReviewIndex(0);
    audioReviewOpenJustStartedRef.current = true;
    setAudioReviewPopupReady(false);
    setAudioReviewModalVisible(false);
    if (selectedVersionId) {
      setAudioReviewStartedByVersion((prev) => ({ ...prev, [selectedVersionId]: true }));
    }
    setAudioReviewActive(true);
    setAudioReviewPlaying(false);
  }, [audioUrls, blocks, isAnyGenerationRunning, selectedVersionId]);

  const stopAudioReview = useCallback(() => {
    if (selectedVersionId && audioReviewQueue.length > 0) {
      const hasAnyFlagged = audioReviewQueue.some((id) => Boolean(audioReviewMarked[id]));
      if (!hasAnyFlagged) {
        setAudioReviewCheckedByVersion((prev) => ({
          ...prev,
          [selectedVersionId]: {
            ...(prev[selectedVersionId] ?? {}),
            ...Object.fromEntries(audioReviewQueue.map((id) => [id, true]))
          }
        }));
      }
    }
    setAudioReviewActive(false);
    setAudioReviewQueue([]);
    setAudioReviewIndex(0);
    setAudioReviewPlaying(false);
    setAudioReviewRegenerating(false);
    setAudioReviewCurrentTime(0);
    setAudioReviewDuration(0);
    setAudioReviewSeekableEnd(0);
    setAudioReviewTextFocused(false);
    setAudioReviewTextDraft('');
    setAudioReviewPopupReady(false);
    setAudioReviewModalVisible(false);
    audioReviewOpenJustStartedRef.current = false;
    if (audioReviewAdvanceTimerRef.current) {
      window.clearTimeout(audioReviewAdvanceTimerRef.current);
      audioReviewAdvanceTimerRef.current = null;
    }
    if (audioReviewRef.current) {
      audioReviewRef.current.pause();
      audioReviewRef.current.currentTime = 0;
    }
  }, [audioReviewMarked, audioReviewQueue, selectedVersionId]);

  const goToPreviousAudioReview = useCallback(() => {
    setAudioReviewIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNextAudioReview = useCallback(() => {
    setAudioReviewIndex((prev) => Math.min(Math.max(0, audioReviewQueue.length - 1), prev + 1));
  }, [audioReviewQueue.length]);

  const seekAudioReviewBy = useCallback((deltaSeconds: number) => {
    const player = audioReviewRef.current;
    if (!player || !audioReviewCurrentUrl) return;
    const seekableEnd =
      player.seekable && player.seekable.length > 0
        ? player.seekable.end(player.seekable.length - 1)
        : 0;
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
    const maxSeek = seekableEnd > 0 ? seekableEnd : duration;
    const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const next = maxSeek > 0
      ? Math.min(maxSeek, Math.max(0, current + deltaSeconds))
      : Math.max(0, current + deltaSeconds);
    player.currentTime = next;
    setAudioReviewCurrentTime(next);
    if (seekableEnd > 0) {
      setAudioReviewSeekableEnd(seekableEnd);
    }
  }, [audioReviewCurrentUrl]);

  const seekAudioReviewBackward = useCallback(() => {
    seekAudioReviewBy(-3);
  }, [seekAudioReviewBy]);

  const seekAudioReviewForward = useCallback(() => {
    seekAudioReviewBy(3);
  }, [seekAudioReviewBy]);

  const toggleAudioReviewPlayback = useCallback(() => {
    const player = audioReviewRef.current;
    if (!player || !audioReviewCurrentUrl) return;
    if (player.paused) {
      const nearEnd =
        Number.isFinite(player.duration) &&
        player.duration > 0 &&
        player.currentTime >= Math.max(0, player.duration - 0.05);
      if (nearEnd || player.ended) {
        player.currentTime = 0;
      }
      void player.play().catch(() => null);
      return;
    }
    player.pause();
  }, [audioReviewCurrentUrl]);

  const toggleMarkAudioReview = useCallback(() => {
    if (!audioReviewCurrentBlockId) return;
    setAudioReviewMarked((prev) => ({
      ...prev,
      [audioReviewCurrentBlockId]: !prev[audioReviewCurrentBlockId]
    }));
  }, [audioReviewCurrentBlockId]);

  const toggleMarkAudioReviewById = useCallback((blockId: string) => {
    setAudioReviewMarked((prev) => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  }, []);

  const regenerateMarkedFromAudioReview = useCallback(async () => {
    if (audioReviewRegenerating) return;
    const markedIds = audioReviewQueue.filter((id) => Boolean(audioReviewMarked[id]));
    if (markedIds.length === 0) {
      setError('No marked audio to regenerate.');
      return;
    }
    setError(null);
    if (audioReviewRef.current) {
      audioReviewRef.current.pause();
      setAudioReviewPlaying(false);
    }
    setGeneratingStates((prev) => {
      const next = { ...prev };
      markedIds.forEach((id) => {
        next[id] = { ...next[id], audio: true };
      });
      return next;
    });
    setAudioReviewQueue(markedIds);
    setAudioReviewIndex(0);
    setAudioReviewMarked({});
    setAudioReviewRegenerating(true);
    for (const blockId of markedIds) {
      // Reuse existing single-audio job flow and keep SSE tracking intact.
      // eslint-disable-next-line no-await-in-loop
      await handleRegenerateAudio(blockId);
    }
  }, [audioReviewMarked, audioReviewQueue, audioReviewRegenerating, handleRegenerateAudio]);

  const regenerateFlaggedAudios = useCallback(async () => {
    const markedIds = blocks.filter((block) => Boolean(audioReviewMarked[block.id])).map((block) => block.id);
    if (markedIds.length === 0) {
      setError('No flagged audio to regenerate.');
      return;
    }
    setError(null);
    clearAudioReviewChecksForBlocks(markedIds);
    setGeneratingStates((prev) => {
      const next = { ...prev };
      markedIds.forEach((id) => {
        next[id] = { ...next[id], audio: true };
      });
      return next;
    });
    setAudioReviewMarked((prev) => {
      const next = { ...prev };
      markedIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    for (const blockId of markedIds) {
      // eslint-disable-next-line no-await-in-loop
      await handleRegenerateAudio(blockId);
    }
  }, [audioReviewMarked, blocks, clearAudioReviewChecksForBlocks, handleRegenerateAudio]);

  useEffect(() => {
    setAudioReviewMarked({});
  }, [selectedVersionId]);

  useEffect(() => {
    setAudioReviewQueue((prev) =>
      prev.filter((id) =>
        blocks.some((block) =>
          audioReviewActive || audioReviewRegenerating
            ? block.id === id
            : block.id === id && Boolean(block.audioUrl)
        )
      )
    );
  }, [blocks, audioReviewActive, audioReviewRegenerating]);

  useEffect(() => {
    setAudioReviewIndex((prev) => {
      if (audioReviewQueue.length === 0) return 0;
      return Math.min(prev, audioReviewQueue.length - 1);
    });
  }, [audioReviewQueue]);

  useEffect(() => {
    if (!audioReviewActive) return;
    if (audioReviewQueue.length > 0) return;
    setAudioReviewActive(false);
    setAudioReviewPlaying(false);
  }, [audioReviewActive, audioReviewQueue.length]);

  useEffect(() => {
    if (!audioReviewActive || !audioReviewCurrentBlockId) return;
    if (audioReviewRegenerating) return;
    scrollToBlock(audioReviewCurrentBlockId);
  }, [audioReviewActive, audioReviewCurrentBlockId, audioReviewRegenerating]);

  useEffect(() => {
    if (!audioReviewActive || !audioReviewCurrentBlockId) return;
    const target = audioReviewItemRefs.current[audioReviewCurrentBlockId];
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [audioReviewActive, audioReviewCurrentBlockId, audioReviewIndex]);

  useEffect(() => {
    if (!audioReviewCurrentBlock) {
      setAudioReviewTextDraft('');
      return;
    }
    if (audioReviewTextFocused) return;
    setAudioReviewTextDraft(
      getNarratedDraft(audioReviewCurrentBlock.id, audioReviewCurrentBlock.narratedText)
    );
  }, [audioReviewCurrentBlock, audioReviewTextFocused, getNarratedDraft]);

  useEffect(() => {
    if (!audioReviewActive) return;
    const modal = audioReviewModalRef.current;
    if (!modal) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const rect = entry.boundingClientRect;
        const style = window.getComputedStyle(modal);
        const visible =
          entry.isIntersecting &&
          entry.intersectionRatio >= 0.25 &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0.01;
        setAudioReviewModalVisible(visible);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    observer.observe(modal);
    return () => {
      observer.disconnect();
    };
  }, [audioReviewActive]);

  useEffect(() => {
    if (!audioReviewActive || !audioReviewModalVisible) return;
    let cancelled = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          setAudioReviewPopupReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [audioReviewActive, audioReviewModalVisible]);

  useEffect(() => {
    if (!audioReviewActive) return;
    if (audioReviewRegenerating) return;
    if (!audioReviewPopupReady) return;
    if (!audioReviewModalVisible) return;
    const player = audioReviewRef.current;
    if (!player) return;
    setAudioReviewPlaying(false);
    setAudioReviewCurrentTime(0);
    setAudioReviewDuration(0);
    setAudioReviewSeekableEnd(0);
    player.pause();
    player.currentTime = 0;
    if (!audioReviewCurrentUrl) return;
    player.load();
    const shouldDelayFirstPlay = audioReviewOpenJustStartedRef.current;
    let timer: number | null = null;
    const startPlayback = () => {
      void player.play().catch(() => null);
      audioReviewOpenJustStartedRef.current = false;
    };
    if (shouldDelayFirstPlay) {
      timer = window.setTimeout(startPlayback, 180);
    } else {
      startPlayback();
    }
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [
    audioReviewActive,
    audioReviewCurrentUrl,
    audioReviewIndex,
    audioReviewRegenerating,
    audioReviewPopupReady,
    audioReviewModalVisible
  ]);

  useEffect(() => {
    if (!audioReviewRegenerating || audioReviewQueue.length === 0) return;
    const allSettled = audioReviewQueue.every((id) => !generatingStates[id]?.audio);
    if (!allSettled) return;
    setAudioReviewRegenerating(false);
    setAudioReviewIndex(0);
    setAudioReviewMarked({});
    setError(null);
  }, [audioReviewRegenerating, audioReviewQueue, generatingStates]);

  useEffect(() => {
    if (!audioReviewActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        target?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select';
      if (isEditable) return;
      const isArrowUp = event.key === 'ArrowUp' || event.code === 'ArrowUp' || event.key === 'Up';
      const isArrowDown = event.key === 'ArrowDown' || event.code === 'ArrowDown' || event.key === 'Down';
      const isArrowLeft = event.key === 'ArrowLeft' || event.code === 'ArrowLeft' || event.key === 'Left';
      const isArrowRight = event.key === 'ArrowRight' || event.code === 'ArrowRight' || event.key === 'Right';

      if (isArrowUp) {
        event.preventDefault();
        goToPreviousAudioReview();
        return;
      }
      if (isArrowDown) {
        event.preventDefault();
        goToNextAudioReview();
        return;
      }
      if (audioReviewControlsLocked) {
        return;
      }
      if (isArrowLeft) {
        event.preventDefault();
        seekAudioReviewBackward();
        return;
      }
      if (isArrowRight) {
        event.preventDefault();
        seekAudioReviewForward();
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        toggleAudioReviewPlayback();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleMarkAudioReview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    audioReviewActive,
    audioReviewControlsLocked,
    goToNextAudioReview,
    goToPreviousAudioReview,
    seekAudioReviewBackward,
    seekAudioReviewForward,
    toggleAudioReviewPlayback,
    toggleMarkAudioReview
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground transition-colors duration-300">
      {isAudioBatchCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel audio generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current audio batch job.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsAudioBatchCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelAudioBatch}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {isImageBatchCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel image generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current image generation jobs.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImageBatchCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelImageBatch}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Jobs
              </button>
            </div>
          </div>
        </div>
      )}

      {isSegmentCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel block generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current block generation jobs.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSegmentCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelSegmentBatch}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Jobs
              </button>
            </div>
          </div>
        </div>
      )}

      {isSlidesBatchCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel slide generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current slide generation job.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSlidesBatchCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelSlidesBatch}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {isFinalVideoCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel final video generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current final video job.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsFinalVideoCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelFinalVideo}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {isTranscriptionCancelConfirmOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[8px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl">
            <div className="p-5 border-b border-[hsl(var(--editor-border))]">
              <h3 className="text-lg font-bold">Cancel transcription generation?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will cancel the current subtitle transcription job.
              </p>
            </div>
            <div className="p-5 border-t border-[hsl(var(--editor-border))] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsTranscriptionCancelConfirmOpen(false)}
                className="px-4 h-9 rounded-[5px] border border-[hsl(var(--editor-border))] text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Keep Running
              </button>
              <button
                onClick={handleConfirmCancelTranscription}
                className="px-4 h-9 rounded-[5px] bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
              >
                Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={isFinalVideoPreflightConfirmOpen}
        title="Continue final video generation?"
        description={finalVideoPreflightDescription}
        confirmLabel="Continue"
        cancelLabel="Back"
        confirmClassName="bg-orange-600 hover:bg-orange-700 text-white"
        onCancel={() => {
          setIsFinalVideoPreflightConfirmOpen(false);
          setFinalVideoPreflightDescription('');
        }}
        onConfirm={() => {
          setIsFinalVideoPreflightConfirmOpen(false);
          void startFinalVideoGenerationJob();
        }}
      />

      {audioReviewActive && (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            ref={audioReviewModalRef}
            className="w-full max-w-6xl h-[82vh] rounded-[10px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="px-5 h-14 border-b border-[hsl(var(--editor-border))] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Headphones size={16} className="text-orange-600" />
                <h3 className="text-sm font-bold uppercase tracking-widest">Review</h3>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {audioReviewQueue.length > 0 ? audioReviewIndex + 1 : 0}/{audioReviewQueue.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (audioReviewRegenerating) {
                      setIsAudioBatchCancelConfirmOpen(true);
                      return;
                    }
                    void regenerateMarkedFromAudioReview();
                  }}
                  disabled={!audioReviewRegenerating && audioReviewMarkedCount === 0}
                  className={`relative overflow-hidden px-3 h-9 rounded-[5px] text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${
                    audioReviewRegenerating
                      ? 'bg-[#5b3a24] border border-[#8d582d] text-[#f3b15f] hover:bg-[#684128]'
                      : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100'
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {audioReviewRegenerating ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    {audioReviewRegenerating
                      ? `Generating audios... ${audioReviewGeneratingCurrent}/${audioReviewGeneratingTotal} • Cancel`
                      : `Regenerate Marked (${audioReviewMarkedCount})`}
                  </span>
                </button>
                <button
                  onClick={stopAudioReview}
                  className="px-3 h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                >
                  <X size={12} />
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex">
              <div className="w-[340px] border-r border-[hsl(var(--editor-border))] overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                {audioReviewQueue.map((blockId, idx) => {
                  const block = blocksById[blockId];
                  if (!block) return null;
                  const isCurrent = blockId === audioReviewCurrentBlockId;
                  const isMarked = Boolean(audioReviewMarked[blockId]);
                  const isChecked = Boolean(audioReviewCheckedMapForVersion[blockId]);
                  const isBlockGenerating = audioReviewControlsLocked && Boolean(generatingStates[blockId]?.audio);
                  return (
                    <div
                      key={blockId}
                      ref={(el) => {
                        audioReviewItemRefs.current[blockId] = el;
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setAudioReviewIndex(idx)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setAudioReviewIndex(idx);
                        }
                      }}
                        className={`relative w-full text-left p-2 rounded-[6px] border transition-colors duration-100 cursor-pointer ${
                          isCurrent
                            ? 'border-orange-500/30 bg-orange-500/10'
                          : isMarked
                          ? 'border-red-500/40 bg-red-500/10'
                          : isChecked
                          ? 'border-emerald-500/35 bg-emerald-500/10'
                          : 'border-[hsl(var(--editor-input-border))]/35 bg-[hsl(var(--editor-input))]/35 hover:bg-[hsl(var(--editor-input))]/55 hover:border-[hsl(var(--editor-input-border))]/60'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 pl-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                            {block.number}
                          </span>
                          {isChecked && !isMarked && (
                            <span className="px-1.5 h-4 rounded-full text-[8px] font-bold uppercase tracking-wide inline-flex items-center border border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                              Heard
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMarkAudioReviewById(blockId);
                          }}
                          disabled={audioReviewControlsLocked}
                          className={`px-2.5 h-5 rounded-full text-[8px] font-bold uppercase tracking-wide transition-colors inline-flex items-center gap-1 ${
                            isBlockGenerating
                              ? 'bg-orange-500/18 border border-orange-500/45 text-orange-400'
                              : isMarked
                              ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                              : 'border border-[hsl(var(--editor-input-border))] text-muted-foreground'
                          }`}
                        >
                          {isBlockGenerating ? (
                            <>
                              <RefreshCw size={9} className="animate-spin" />
                              Generating...
                            </>
                          ) : isMarked ? (
                            <>
                              <Check size={9} />
                              Flagged
                            </>
                          ) : (
                            <>
                              <Check size={9} />
                              Flag
                            </>
                          )}
                        </button>
                      </div>
                      <div className="mt-0.5 pl-1 text-[11px] font-semibold text-foreground/80 line-clamp-2 leading-snug">
                        {(block.narratedText || block.originalText || '').trim()}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex-1 p-6 flex flex-col gap-4 min-h-0 overflow-y-auto custom-scrollbar">
                {audioReviewCurrentBlock ? (
                  <>
                    <div className="space-y-4 min-h-0">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Narrated Text
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                            <span className={audioReviewCurrentOverLimit ? 'text-amber-500' : 'text-muted-foreground'}>
                              {audioReviewCurrentCharCount}/{AUDIO_CHAR_LIMIT}
                            </span>
                            {audioReviewCurrentOverLimit ? (
                              <span className="text-amber-500">Warning</span>
                            ) : null}
                          </div>
                        </div>
                        {audioReviewCurrentOverLimit ? (
                          <div className="text-[11px] text-amber-500">
                            Text above {AUDIO_CHAR_LIMIT} characters. In Review, this is only a warning.
                          </div>
                        ) : null}
                        <textarea
                          value={audioReviewCurrentNarratedText}
                          disabled={audioReviewControlsLocked}
                          onFocus={() => {
                            setAudioReviewTextFocused(true);
                          }}
                          onChange={(event) => {
                            const next = event.target.value;
                            setAudioReviewTextDraft(next);
                            setNarratedDraft(audioReviewCurrentBlock.id, next);
                          }}
                          onBlur={() => {
                            setAudioReviewTextFocused(false);
                            if (audioReviewControlsLocked) {
                              return;
                            }
                            const next = audioReviewTextDraft;
                            if (next !== audioReviewCurrentBlock.narratedText) {
                              void saveNarratedText(audioReviewCurrentBlock.id, next);
                            }
                          }}
                          className={`w-full h-24 p-3 bg-[hsl(var(--editor-input))] border rounded-[6px] text-sm leading-relaxed text-foreground resize-none ${
                            audioReviewCurrentOverLimit
                              ? 'border-amber-500/50 bg-amber-500/10'
                              : 'border-[hsl(var(--editor-input-border))]'
                          }`}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Subtitle (Review Draft)
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Local draft only (MVP)
                          </div>
                        </div>
                        <textarea
                          value={audioReviewCurrentSubtitleText}
                          disabled={audioReviewControlsLocked || !audioReviewCurrentBlockId}
                          wrap="soft"
                          onChange={(event) => {
                            if (!selectedVersionId || !audioReviewCurrentBlockId) return;
                            const next = event.target.value;
                            setSubtitleReviewTextByVersion((prev) => ({
                              ...prev,
                              [selectedVersionId]: {
                                ...(prev[selectedVersionId] ?? {}),
                                [audioReviewCurrentBlockId]: next
                              }
                            }));
                          }}
                          className="w-full h-24 p-3 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[6px] text-[11px] leading-snug font-semibold text-foreground resize-y whitespace-pre-wrap break-words"
                          placeholder="Subtitle text for this block (review draft)"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Video Subtitle Preview
                        </div>
                        <div className="mx-auto relative w-[440px] max-w-full aspect-video rounded-[6px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] overflow-hidden">
                          {audioReviewCurrentImageUrl ? (
                            <img
                              src={audioReviewCurrentImageUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                              No image available
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 via-black/40 to-transparent">
                            <div className="max-h-24 overflow-y-auto rounded-[4px] bg-black/45 px-2 py-1 text-[11px] leading-snug font-semibold text-white whitespace-pre-wrap break-words">
                              {audioReviewCurrentSubtitleOverlayText || 'No subtitle at this timestamp'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="h-2 rounded-full bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] overflow-hidden">
                          <div
                            className="h-full bg-orange-600 transition-all duration-150"
                            style={{ width: `${audioReviewProgressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                          <span>{audioReviewFormattedTime(audioReviewCurrentTime)}</span>
                          <span>{audioReviewFormattedTime(maxAudioReviewSeek)}</span>
                        </div>
                        <div className="grid w-full grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                        <button
                          onClick={goToPreviousAudioReview}
                          disabled={!canGoPrevAudioReview}
                          className="w-full px-2 h-[34px] rounded-[5px] border bg-indigo-500/10 border-indigo-500/20 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100 inline-flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          <ArrowUp size={12} />
                          Prev (Up)
                        </button>
                        <button
                          onClick={seekAudioReviewBackward}
                          disabled={audioReviewControlsLocked || !canSeekBackwardAudioReview}
                          className="w-full px-2 h-[34px] rounded-[5px] border bg-indigo-500/10 border-indigo-500/20 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100 inline-flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          <ArrowLeft size={12} />
                          -3s (Left)
                        </button>
                        <button
                          onClick={toggleAudioReviewPlayback}
                          disabled={audioReviewControlsLocked || !audioReviewCurrentUrl}
                          className="w-full px-2 h-[34px] rounded-[5px] border bg-indigo-500/10 border-indigo-500/20 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100 inline-flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          {audioReviewPlaying ? <Pause size={12} /> : <Play size={12} />}
                          {audioReviewPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          onClick={seekAudioReviewForward}
                          disabled={audioReviewControlsLocked || !canSeekForwardAudioReview}
                          className="w-full px-2 h-[34px] rounded-[5px] border bg-indigo-500/10 border-indigo-500/20 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100 inline-flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          <ArrowRight size={12} />
                          +3s (Right)
                        </button>
                        <button
                          onClick={goToNextAudioReview}
                          disabled={!canGoNextAudioReview}
                          className="w-full px-2 h-[34px] rounded-[5px] border bg-indigo-500/10 border-indigo-500/20 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100 inline-flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          <ArrowDown size={12} />
                          Next (Down)
                        </button>
                        <button
                          onClick={toggleMarkAudioReview}
                          disabled={audioReviewControlsLocked || !audioReviewCurrentBlockId}
                          className={`w-full px-2 h-[34px] text-[9px] rounded-[5px] font-bold uppercase tracking-wide whitespace-nowrap inline-flex items-center justify-center gap-1 shadow-sm transition-all ${
                            audioReviewControlsLocked
                              ? 'bg-orange-500/14 border border-orange-500/35 text-orange-400'
                              : audioReviewCurrentBlockId && audioReviewMarked[audioReviewCurrentBlockId]
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'border bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:bg-indigo-500/8 disabled:border-indigo-500/20 disabled:text-indigo-700/45 dark:disabled:text-indigo-300/45 disabled:opacity-100'
                          }`}
                        >
                          {audioReviewControlsLocked
                            ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                Generating...
                              </>
                            )
                            : audioReviewCurrentBlockId && audioReviewMarked[audioReviewCurrentBlockId]
                            ? (
                              <>
                                <Check size={12} />
                                Marked (M)
                              </>
                            )
                            : (
                              <>
                                <Check size={12} />
                                Mark (M)
                              </>
                            )}
                        </button>
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          Keys: Up Prev Audio, Down Next Audio, Left -3s, Right +3s, Space Play/Pause, M Mark
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No audio selected.
                  </div>
                )}

                <audio
                  ref={audioReviewRef}
                  src={audioReviewCurrentUrl}
                  onPlay={() => {
                    setAudioReviewPlaying(true);
                    if (audioReviewCurrentBlockId) {
                      markAudioReviewChecked(audioReviewCurrentBlockId);
                    }
                  }}
                  onPause={() => setAudioReviewPlaying(false)}
                  onLoadedMetadata={() => {
                    const player = audioReviewRef.current;
                    const duration = player && Number.isFinite(player.duration) ? player.duration : 0;
                    setAudioReviewDuration(duration > 0 ? duration : 0);
                    const seekableEnd =
                      player && player.seekable && player.seekable.length > 0
                        ? player.seekable.end(player.seekable.length - 1)
                        : 0;
                    setAudioReviewSeekableEnd(seekableEnd > 0 ? seekableEnd : 0);
                  }}
                  onTimeUpdate={() => {
                    const player = audioReviewRef.current;
                    const current = player && Number.isFinite(player.currentTime) ? player.currentTime : 0;
                    setAudioReviewCurrentTime(current > 0 ? current : 0);
                    const seekableEnd =
                      player && player.seekable && player.seekable.length > 0
                        ? player.seekable.end(player.seekable.length - 1)
                        : 0;
                    if (seekableEnd > 0) {
                      setAudioReviewSeekableEnd(seekableEnd);
                    }
                  }}
                  onProgress={() => {
                    const player = audioReviewRef.current;
                    const seekableEnd =
                      player && player.seekable && player.seekable.length > 0
                        ? player.seekable.end(player.seekable.length - 1)
                        : 0;
                    if (seekableEnd > 0) {
                      setAudioReviewSeekableEnd(seekableEnd);
                    }
                  }}
                  onEnded={() => {
                    setAudioReviewPlaying(false);
                    const player = audioReviewRef.current;
                    const finalTime =
                      player && Number.isFinite(player.duration) && player.duration > 0
                        ? player.duration
                        : maxAudioReviewSeek;
                    setAudioReviewCurrentTime(finalTime > 0 ? finalTime : 0);
                    if (finalTime > 0) {
                      setAudioReviewDuration((prev) => Math.max(prev, finalTime));
                      setAudioReviewSeekableEnd((prev) => Math.max(prev, finalTime));
                    }
                    if (audioReviewAdvanceTimerRef.current) {
                      window.clearTimeout(audioReviewAdvanceTimerRef.current);
                      audioReviewAdvanceTimerRef.current = null;
                    }
                    audioReviewAdvanceTimerRef.current = window.setTimeout(() => {
                      setAudioReviewIndex((prev) => {
                        if (prev >= audioReviewQueue.length - 1) return prev;
                        return prev + 1;
                      });
                      audioReviewAdvanceTimerRef.current = null;
                    }, 120);
                  }}
                  preload="metadata"
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Barra Horizontal Superior (Fixa e Full Width) */}
      <div className="px-6 lg:pr-3 py-1.5 bg-[hsl(var(--editor-surface))] border-b border-[hsl(var(--editor-border))] flex-shrink-0 z-30">
        <div className="flex items-center gap-2 min-h-5 min-w-0">
          {breadcrumbParts.length > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0 h-5">
              {breadcrumbParts.map((part, index) => (
                <React.Fragment key={`${part.key}-${index}`}>
                  {index > 0 ? (
                    <span className="text-[10px] font-medium text-muted-foreground/45 leading-none">&gt;</span>
                  ) : null}
                  {part.onClick ? (
                    <button
                      onClick={part.onClick}
                      title={part.label}
                      className="max-w-[240px] truncate bg-transparent p-0 border-0 text-[10px] font-medium text-muted-foreground/90 hover:text-foreground transition-colors"
                    >
                      {part.label}
                    </button>
                  ) : (
                    <span
                      title={part.label}
                      className="max-w-[320px] truncate text-[10px] font-semibold text-foreground/85"
                    >
                      {part.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex flex-col gap-2 lg:gap-2.5">
          <div className="flex lg:hidden items-center justify-end gap-2 min-w-0">
            <div className="relative" ref={mobileActionsMenuRef}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsScriptSidebarOpen((prev) => !prev)}
                  className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={isScriptSidebarOpen ? 'Hide video panel' : 'Show video panel'}
                >
                  <RightRailIcon open={isScriptSidebarOpen} />
                </button>
                <button
                  onClick={() => setIsMobileActionsMenuOpen((prev) => !prev)}
                  className="h-8 w-8 rounded-[5px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors inline-flex items-center justify-center"
                  aria-label="Open video actions"
                >
                  <Ellipsis size={16} />
                </button>
              </div>

              {isMobileActionsMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-[280px] bg-[hsl(var(--editor-surface))] border border-[hsl(var(--editor-border))] rounded-[8px] shadow-2xl z-50 p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-[hsl(var(--editor-border))]">
                    {mobileStatusLabel}
                  </div>

                  {showTopSegmentBusy ? (
                    <button
                      onClick={() => {
                        setIsSegmentCancelConfirmOpen(true);
                        setIsMobileActionsMenuOpen(false);
                      }}
                      className="w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    >
                      Stop blocks ({topSegmentProgressLabel})
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleGlobalAction('generateBlocks');
                        setIsMobileActionsMenuOpen(false);
                      }}
                      disabled={isGenerateBlocksDisabled}
                      className={`w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border ${
                        areBlocksPhaseReady
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-muted-foreground'
                          : 'bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-muted-foreground'
                      } ${toolbarDisabledLikeAudioReview}`}
                    >
                      {areBlocksPhaseReady ? 'Regenerate blocks' : 'Generate blocks'}
                    </button>
                  )}

                  {showTopTtsBusy ? (
                    <button
                      onClick={() => {
                        setIsAudioBatchCancelConfirmOpen(true);
                        setIsMobileActionsMenuOpen(false);
                      }}
                      className="w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    >
                      Stop audios ({topTtsProgressLabel})
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleGlobalAction('generateAudios');
                        setIsMobileActionsMenuOpen(false);
                      }}
                      disabled={isGenerateAudiosDisabled}
                      className={`w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border ${
                        ttsHealthChecked && !ttsHealthy
                          ? 'bg-red-500/10 border-red-500/30 text-red-500'
                          : areAudiosPhaseReady
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-muted-foreground'
                          : 'bg-indigo-500/10 border-indigo-500/20 text-muted-foreground'
                      } ${toolbarDisabledLikeAudioReview}`}
                    >
                      {globalAudioActionLabel}
                    </button>
                  )}

                  {showTopTranscriptionBusy ? (
                    <button
                      onClick={() => {
                        setIsTranscriptionCancelConfirmOpen(true);
                        setIsMobileActionsMenuOpen(false);
                      }}
                      className="w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    >
                      {`Stop transcription (${topTranscriptionProgressLabel})`}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleGlobalAction('generateTranscription');
                        setIsMobileActionsMenuOpen(false);
                      }}
                      disabled={isGenerateTranscriptionDisabled}
                      className={`w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border ${
                        hasSubtitleTranscriptionReady
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-muted-foreground'
                          : 'border-indigo-500/20 bg-indigo-500/10 text-muted-foreground'
                      } ${toolbarDisabledLikeAudioReview}`}
                    >
                      {hasSubtitleTranscriptionReady ? 'Regenerate transcription' : 'Generate transcription'}
                    </button>
                  )}

                  {showTopImageBusy ? (
                    <button
                      onClick={() => {
                        setIsImageBatchCancelConfirmOpen(true);
                        setIsMobileActionsMenuOpen(false);
                      }}
                      className="w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    >
                      Stop images ({topImageProgressLabel})
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleGlobalAction('generateImages');
                        setIsMobileActionsMenuOpen(false);
                      }}
                      disabled={isGenerateImagesDisabled}
                      className={`w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border ${
                        areImagesPhaseReady
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-muted-foreground'
                          : 'border-indigo-500/20 bg-indigo-500/10 text-muted-foreground'
                      } ${toolbarDisabledLikeAudioReview}`}
                    >
                      {areImagesPhaseReady ? 'Regenerate images' : 'Generate images'}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      startAudioReview();
                      setIsMobileActionsMenuOpen(false);
                    }}
                    disabled={isAudioReviewDisabled}
                    className="w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-indigo-500/20 bg-indigo-500/10 text-muted-foreground disabled:opacity-50"
                  >
                    {`Review (${audioReviewPlayableCount})`}
                  </button>

                  {hasFinalVideoReady ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsFinalVideoModalOpen(true);
                          setFinalVideoDownloadError(null);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full h-9 px-3 rounded-[5px] text-left text-[11px] font-bold uppercase tracking-wide border border-emerald-500/35 bg-emerald-600 text-white inline-flex items-center"
                      >
                        View final video
                      </button>
                      <button
                        onClick={() => {
                          handleGlobalAction('generateFinalVideo');
                          setIsMobileActionsMenuOpen(false);
                        }}
                        disabled={isGenerateFinalVideoDisabled}
                        className={`w-full h-8 px-3 rounded-[5px] text-left text-[11px] font-semibold border border-orange-500/25 bg-orange-500/10 text-muted-foreground ${toolbarDisabledLikeAudioReview}`}
                      >
                        Regenerate final video
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (isGeneratingFinalVideo) {
                          setIsFinalVideoCancelConfirmOpen(true);
                        } else {
                          handleGlobalAction('generateFinalVideo');
                        }
                        setIsMobileActionsMenuOpen(false);
                      }}
                      disabled={!isGeneratingFinalVideo && isGenerateFinalVideoDisabled}
                      className={`w-full h-9 px-3 rounded-[5px] text-left text-[11px] font-bold uppercase tracking-wide ${
                        isGeneratingFinalVideo
                          ? 'bg-orange-700 text-white'
                          : `bg-orange-600 text-white ${toolbarDisabledLikeAudioReview}`
                      }`}
                    >
                      {isGeneratingFinalVideo ? `Stop final video (${topFinalElapsedLabel})` : 'Generate final video'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons and primary action */}
          <div className="hidden lg:flex w-full items-center justify-end gap-2.5 min-w-0">
          
          {showTopSegmentBusy ? (
            <div className="flex items-center h-8 rounded-[6px] border border-orange-500/35 bg-orange-500/10 shadow-sm overflow-hidden">
              <div className="relative overflow-hidden flex items-center gap-2 px-3 h-8 text-[10px] font-bold text-orange-700 dark:text-orange-300 min-w-[180px]">
                {topSegmentTotal > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500/25 transition-all duration-300"
                    style={{
                      width: `${topSegmentProgressWidth}%`
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 w-full">
                  <RefreshCw
                    size={14}
                    className={
                      hasBatchSegmentProgress && segmentPhase === 'running' ? 'animate-spin' : ''
                    }
                  />
                  <span className="truncate">
                    {!isSegmenting && !hasSingleTextQueue
                      ? 'Preparing blocks...'
                      : 'Generating blocks...'}
                  </span>
                  {topSegmentTotal > 0 && (
                    <span className="ml-auto inline-flex items-center rounded-[4px] bg-black/35 px-1.5 py-0.5 text-[9px] leading-none text-orange-200 tabular-nums">
                      {topSegmentProgressLabel}
                    </span>
                  )}
                </span>
              </div>
              {(isSegmenting || hasSingleTextQueue) && (
                <button
                  onClick={() => setIsSegmentCancelConfirmOpen(true)}
                  className="h-8 px-2.5 text-[10px] font-bold rounded-r-[6px] border-l border-orange-500/30 bg-[rgba(239,68,68,0.08)] text-red-600 dark:text-red-100 hover:bg-[rgba(239,68,68,0.14)] hover:text-red-700 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <button 
              onClick={() => handleGlobalAction('generateBlocks')}
              disabled={isGenerateBlocksDisabled}
              className={`flex items-center gap-2 px-3 h-8 rounded-[5px] text-[10px] font-bold transition-all shadow-sm ${
                areBlocksPhaseReady
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-muted-foreground hover:bg-emerald-500/15'
                  : 'bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-muted-foreground hover:text-orange-600'
              } ${toolbarDisabledLikeAudioReview}`}
            >
              <Layers size={14} className="text-current" />
              {areBlocksPhaseReady ? 'Regenerate Blocks' : 'Generate Blocks'}
            </button>
          )}
          <div className="h-5 w-[1px] bg-[hsl(var(--editor-border))]/60"></div>

          {showTopTtsBusy ? (
            <div className="flex items-center h-8 rounded-[6px] border border-orange-500/35 bg-orange-500/10 shadow-sm overflow-hidden">
              <div className="relative overflow-hidden flex items-center gap-2 px-3 h-8 text-[10px] font-bold text-orange-700 dark:text-orange-300 min-w-[190px]">
                {topTtsTotal > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500/25 transition-all duration-300"
                    style={{
                      width: `${topTtsProgressWidth}%`
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 w-full">
                  <RefreshCw size={14} className={ttsPhase === 'running' ? 'animate-spin' : ''} />
                  <span className="truncate">
                    {ttsPhase === 'waiting' ? 'Preparing audios...' : 'Generating audios...'}
                  </span>
                  {topTtsTotal > 0 && (
                    <span className="ml-auto inline-flex items-center rounded-[4px] bg-black/35 px-1.5 py-0.5 text-[9px] leading-none text-orange-200 tabular-nums">
                      {topTtsProgressLabel}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setIsAudioBatchCancelConfirmOpen(true)}
                className="h-8 px-2.5 text-[10px] font-bold rounded-r-[6px] border-l border-orange-500/30 bg-[rgba(239,68,68,0.08)] text-red-600 dark:text-red-100 hover:bg-[rgba(239,68,68,0.14)] hover:text-red-700 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button 
              onClick={() => {
                handleGlobalAction('generateAudios');
              }}
              disabled={isGenerateAudiosDisabled}
              className={`relative overflow-hidden flex items-center gap-2 px-3 h-8 rounded-[5px] text-[10px] font-bold transition-all shadow-sm ${
                ttsHealthChecked && !ttsHealthy
                  ? 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/15'
                  : areAudiosPhaseReady
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-muted-foreground hover:bg-emerald-500/15'
                  : 'bg-indigo-500/10 border border-indigo-500/20 text-muted-foreground hover:bg-indigo-500/15'
              } ${toolbarDisabledLikeAudioReview}`}
            >
              <AudioLines size={14} className="text-current" />
              {globalAudioActionLabel}
            </button>
          )}

          {showTopTranscriptionBusy ? (
            <div className="flex items-center h-8 rounded-[6px] border border-orange-500/35 bg-orange-500/10 shadow-sm overflow-hidden">
              <div className="relative overflow-hidden flex items-center gap-2 px-3 h-8 text-[10px] font-bold text-orange-700 dark:text-orange-300 min-w-[190px]">
                {topTranscriptionTotal > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500/25 transition-all duration-300"
                    style={{
                      width: `${topTranscriptionProgressWidth}%`
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 w-full">
                  <Captions size={14} className={transcriptionPhase === 'running' ? 'animate-pulse' : ''} />
                  <span className="truncate">
                    {transcriptionPhase === 'waiting' ? 'Preparing transcription...' : 'Generating transcription...'}
                  </span>
                  {topTranscriptionTotal > 0 && (
                    <span className="ml-auto inline-flex items-center rounded-[4px] bg-black/35 px-1.5 py-0.5 text-[9px] leading-none text-orange-200 tabular-nums">
                      {topTranscriptionProgressLabel}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setIsTranscriptionCancelConfirmOpen(true)}
                className="h-8 px-2.5 text-[10px] font-bold rounded-r-[6px] border-l border-orange-500/30 bg-[rgba(239,68,68,0.08)] text-red-600 dark:text-red-100 hover:bg-[rgba(239,68,68,0.14)] hover:text-red-700 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleGlobalAction('generateTranscription')}
              disabled={isGenerateTranscriptionDisabled}
              className={`relative overflow-hidden flex items-center gap-2 px-3 h-8 rounded-[5px] text-[10px] font-bold transition-all shadow-sm ${
                hasSubtitleTranscriptionReady
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-muted-foreground hover:bg-emerald-500/15'
                  : 'bg-indigo-500/10 border border-indigo-500/20 text-muted-foreground hover:bg-indigo-500/15'
              } ${toolbarDisabledLikeAudioReview}`}
              title={hasSubtitleTranscriptionReady ? 'Regenerate transcription/subtitles' : 'Generate transcription/subtitles'}
            >
              <Captions size={14} className="text-current" />
              <span className="truncate">{hasSubtitleTranscriptionReady ? 'Regenerate Transcription' : 'Generate Transcription'}</span>
            </button>
          )}

          {showTopImageBusy ? (
            <div className="flex items-center h-8 rounded-[6px] border border-orange-500/35 bg-orange-500/10 shadow-sm overflow-hidden">
              <div className="relative overflow-hidden flex items-center gap-2 px-3 h-8 text-[10px] font-bold text-orange-700 dark:text-orange-300 min-w-[190px]">
                {topImageTotal > 0 && (isGeneratingAssets ? imagePhase === 'running' : singleImagePhase === 'running') && (
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-500/25 transition-all duration-300"
                    style={{
                      width: `${topImageProgressWidth}%`
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2 w-full">
                  <RefreshCw
                    size={14}
                    className={
                      (isGeneratingAssets && assetsJobMode === 'image' ? imagePhase : singleImagePhase) === 'running'
                        ? 'animate-spin'
                        : ''
                    }
                  />
                  <span className="truncate">
                    {(isGeneratingAssets && assetsJobMode === 'image' ? imagePhase : singleImagePhase) === 'waiting'
                      ? 'Preparing images...'
                      : 'Generating images...'}
                  </span>
                  {topImageTotal > 0 && (
                    <span className="ml-auto inline-flex items-center rounded-[4px] bg-black/35 px-1.5 py-0.5 text-[9px] leading-none text-orange-200 tabular-nums">
                      {topImageProgressLabel}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setIsImageBatchCancelConfirmOpen(true)}
                className="h-8 px-2.5 text-[10px] font-bold rounded-r-[6px] border-l border-orange-500/30 bg-[rgba(239,68,68,0.08)] text-red-600 dark:text-red-100 hover:bg-[rgba(239,68,68,0.14)] hover:text-red-700 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button 
              onClick={() => handleGlobalAction('generateImages')}
              disabled={isGenerateImagesDisabled}
              className={`relative overflow-hidden flex items-center gap-2 px-3 h-8 rounded-[5px] text-[10px] font-bold transition-all shadow-sm ${
                areImagesPhaseReady
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-muted-foreground hover:bg-emerald-500/15'
                  : 'bg-indigo-500/10 border border-indigo-500/20 text-muted-foreground hover:bg-indigo-500/15'
              } ${toolbarDisabledLikeAudioReview}`}
            >
              <ImageIcon size={14} className="text-current" />
              <span className="truncate">{areImagesPhaseReady ? 'Regenerate Images' : 'Generate Images'}</span>
            </button>
          )}

          <button
            onClick={startAudioReview}
            disabled={isAudioReviewDisabled}
            className="flex items-center gap-2 px-3 h-8 rounded-[5px] text-[10px] font-bold transition-all bg-indigo-500/10 border border-indigo-500/20 text-muted-foreground hover:bg-indigo-500/15 shadow-sm disabled:opacity-50 disabled:hover:bg-indigo-500/10"
          >
            <Headphones size={14} className="text-current" />
            {`Review (${audioReviewPlayableCount})`}
          </button>

          {/* Right Divider */}
          <div className="h-4 w-[1px] bg-[hsl(var(--editor-border))]/60"></div>

          {/* Primary Action */}
          {hasFinalVideoReady ? (
            <div className="flex items-center h-8 rounded-[5px] border border-emerald-500/40 bg-emerald-600 shadow-lg shadow-emerald-500/10 overflow-hidden">
              {topFinalLastElapsedLabel && (
                <div className="h-8 px-2.5 border-r border-emerald-500/35 bg-black/10 text-white/90 inline-flex items-center text-[10px] font-bold tracking-wider tabular-nums">
                  {topFinalLastElapsedLabel}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setFinalVideoDownloadError(null);
                  setIsFinalVideoModalOpen(true);
                }}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-5 h-8 text-white hover:bg-emerald-700 transition-colors"
              >
                <ExternalLink size={14} />
                View Final Video
              </button>
              <button
                onClick={() => handleGlobalAction('generateFinalVideo')}
                disabled={isGenerateFinalVideoDisabled}
                title="Regenerate final video"
                className={`h-8 px-2.5 border-l border-emerald-500/35 bg-white/5 text-white/90 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5`}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center h-8 rounded-[5px] overflow-hidden shadow-lg shadow-orange-500/10">
              <button 
                onClick={() => handleGlobalAction('generateFinalVideo')}
                disabled={isGenerateFinalVideoDisabled || isGeneratingFinalVideo}
                className={`relative overflow-hidden flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-5 h-8 transition-all active:scale-95 ${
                  isGeneratingFinalVideo
                    ? 'bg-orange-700 text-white'
                    : `rounded-[5px] bg-orange-600 text-white hover:bg-orange-700 border border-transparent ${toolbarDisabledLikeAudioReview} disabled:shadow-none`
                } ${isGeneratingFinalVideo ? 'rounded-l-[5px]' : ''}`}
              >
                {isGeneratingFinalVideo && isFinalVideoBlockPhase && topFinalTotal > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-orange-400/40 transition-all duration-300"
                    style={{
                      width: `${topFinalProgressWidth}%`
                    }}
                  />
                )}
                {isGeneratingFinalVideo && isFinalVideoComposePhase && (
                  <>
                    <div className="absolute inset-y-0 left-0 w-full bg-orange-400/15" />
                    <div
                      className="absolute inset-y-0 bg-orange-300/35 transition-all duration-1000"
                      style={{
                        left: `${topFinalComposeGaugeOffset}%`,
                        width: '40%'
                      }}
                    />
                  </>
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {isGeneratingFinalVideo ? (
                    <MonitorPlay size={15} className="animate-pulse" strokeWidth={2.5} />
                  ) : (
                    <Clapperboard size={15} strokeWidth={2.5} />
                  )}
                  {isGeneratingFinalVideo
                    ? finalVideoPhase === 'waiting'
                      ? `Preparing final video pipeline... ${topFinalElapsedLabel}`
                      : isFinalVideoBlockPhase
                      ? `Rendering block videos... ${topFinalCurrent}/${topFinalTotal} • ${topFinalElapsedLabel}`
                      : `Composing final video... ${topFinalElapsedLabel}`
                    : topFinalLastElapsedLabel
                    ? `Generate Final Video • ${topFinalLastElapsedLabel}`
                    : 'Generate Final Video'}
                </span>
              </button>
              {isGeneratingFinalVideo && (
                <button
                  onClick={() => setIsFinalVideoCancelConfirmOpen(true)}
                  className="h-8 px-2.5 text-[10px] font-bold rounded-r-[5px] border-l border-orange-500/30 bg-[rgba(239,68,68,0.08)] text-red-600 dark:text-red-100 hover:bg-[rgba(239,68,68,0.14)] hover:text-red-700 dark:hover:text-white transition-colors"
                  title="Cancel final video generation"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          <div className="h-4 w-[1px] bg-[hsl(var(--editor-border))]/60"></div>
          <button
            onClick={() => setIsScriptSidebarOpen((prev) => !prev)}
            className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isScriptSidebarOpen ? 'Hide video panel' : 'Show video panel'}
            title={isScriptSidebarOpen ? 'Hide video panel' : 'Show video panel'}
          >
            <RightRailIcon open={isScriptSidebarOpen} />
          </button>
          </div>
        </div>
      </div>

      {/* Content area (blocks + sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Scroll container only for the blocks area */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-12 scroll-smooth"
        >
          {contentValidationAlerts.length > 0 && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
              <div className="text-xs font-semibold uppercase tracking-wide mb-2">
                Review the blocks below to continue
              </div>
              <div className="flex flex-wrap gap-2">
                {contentValidationAlerts.map((alert) => (
                  <button
                    key={alert.key}
                    onClick={() => scrollToBlock(alert.blockId)}
                    className="inline-flex items-center rounded-[5px] border border-red-300/80 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium hover:bg-red-500/15 transition-colors dark:border-red-800/70"
                  >
                    {alert.message}
                  </button>
                ))}
              </div>
            </div>
          )}
          {flaggedAudioBlocks.length > 0 && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Flagged audios to regenerate ({flaggedAudioBlocks.length})
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void regenerateFlaggedAudios()}
                    disabled={isAnyGenerationRunning || isGeneratingFinalVideo}
                    className="inline-flex items-center rounded-[5px] border border-amber-300/80 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Regenerate flagged
                  </button>
                  <button
                    onClick={() => setAudioReviewMarked({})}
                    className="inline-flex items-center rounded-[5px] border border-amber-300/80 bg-transparent px-2.5 py-1 text-[11px] font-medium hover:bg-amber-500/10 transition-colors"
                  >
                    Clear flags
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {flaggedAudioBlocks.map((block) => (
                  <button
                    key={`flagged-audio-${block.id}`}
                    onClick={() => scrollToBlock(block.id)}
                    className="inline-flex items-center rounded-[5px] border border-amber-300/80 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-500/15 transition-colors dark:border-amber-800/70"
                  >
                    {block.number}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
          {ttsHealthChecked && !ttsHealthy && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-xs px-4 py-2 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
              TTS offline: {ttsHealthError ?? 'XTTS API unavailable.'}
            </div>
          )}

          {!lessonId && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-border bg-[hsl(var(--editor-surface))] p-8 text-center text-muted-foreground">
              Select a video to start editing.
            </div>
          )}

          {lessonId && (isLoadingVersions || isLoadingBlocks) && (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" aria-label="Loading video" />
            </div>
          )}

          {lessonId && selectedVersionId && blocks.length === 0 && !isLoadingBlocks && (
            <div className="max-w-[1200px] mx-auto bg-[hsl(var(--editor-surface))] border border-[hsl(var(--editor-border))] rounded-[5px] p-6 text-sm text-muted-foreground">
              No blocks generated yet. Use “Generate Blocks” to create them from the current video version.
            </div>
          )}

          {audioReviewActive ? (
            <div className="max-w-[1200px] mx-auto rounded-[5px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] p-6 text-sm text-muted-foreground">
              Review is open. Close the modal to return to the full editor.
            </div>
          ) : blocks.map((block) => {
              const blockMissingPrompt = !hasImagePromptText(block);
              return (
            <div
              key={block.id}
              id={`block-${block.id}`}
              ref={el => { blockRefs.current[block.id] = el; }}
              className="max-w-[1200px] mx-auto space-y-2"
            >
              <div className="bg-[hsl(var(--editor-surface))] border border-[hsl(var(--editor-border))] rounded-[8px] overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/35">
                  <div className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold rounded-[5px] shadow-sm transition-colors">
                    {block.number}
                  </div>
                  <span
                    className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-[5px] border ${
                      audioUrls[block.id]
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                        : 'bg-slate-500/10 border-slate-500/30 text-muted-foreground'
                    }`}
                  >
                    {audioUrls[block.id] ? 'Audio Ready' : 'Audio Pending'}
                  </span>
                  <span
                    className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-[5px] border ${
                      (imageUrls[block.id] || block.rawImageUrl || block.generatedImageUrl) && !brokenRawImages[block.id]
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                        : blockMissingPrompt
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300'
                        : 'bg-slate-500/10 border-slate-500/30 text-muted-foreground'
                    }`}
                  >
                    {(imageUrls[block.id] || block.rawImageUrl || block.generatedImageUrl) && !brokenRawImages[block.id]
                      ? 'Image Ready'
                      : blockMissingPrompt
                      ? 'Prompt Missing'
                      : 'Image Pending'}
                  </span>
                  {audioReviewActive && audioReviewQueueSet.has(block.id) && (
                    <span
                      className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-[5px] border ${
                        audioReviewMarked[block.id]
                          ? 'bg-red-500/10 border-red-500/40 text-red-500'
                          : block.id === audioReviewCurrentBlockId
                          ? 'bg-orange-500/10 border-orange-500/40 text-orange-600'
                          : 'bg-slate-500/10 border-slate-500/30 text-muted-foreground'
                      }`}
                    >
                      {audioReviewMarked[block.id]
                        ? 'Marked for Regeneration'
                        : block.id === audioReviewCurrentBlockId
                        ? 'Current in Review'
                        : 'In Review Queue'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-0">
                {/** Overlay state for regeneration */}
                {/** Keep inside each column for proper scroll and interaction lock */}
                {/* Block editing section (left) */}
                <div className="min-w-0 p-4 lg:p-5 space-y-4 relative">
                {/* 1. Script & TTS Section */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between border-b border-dashed border-[hsl(var(--editor-border))] pb-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      <Mic size={14} className="text-orange-600" />
                      Voiceover & Scripting
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleRegenerateText(block.id)}
                        disabled={Boolean(generatingStates[block.id]?.text || showTopSegmentBusy || isGeneratingFinalVideo)}
                        className={`flex items-center gap-2 px-3 h-8 bg-transparent border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[10px] font-bold text-muted-foreground transition-all shadow-sm ${
                          generatingStates[block.id]?.text ? '' : 'hover:text-orange-600'
                        }`}
                      >
                        {generatingStates[block.id]?.text ? (
                          <div className="w-3.5 h-3.5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Sparkles size={14} className="text-muted-foreground" />
                        )}
                        {generatingStates[block.id]?.text ? 'Generating...' : 'Regenerate Script'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 group">
                    <NarratedAudioPanel
                      blockId={block.id}
                      originalText={block.originalText}
                      value={block.narratedText}
                      audioUrl={block.audioUrl}
                      isGenerating={Boolean(generatingStates[block.id]?.audio)}
                      isGeneratingTts={isGeneratingTts}
                      isGeneratingText={Boolean(generatingStates[block.id]?.text || isTextGenerationBusy)}
                      isLocked={isGeneratingFinalVideo}
                      ttsReady={ttsHealthy}
                      missingOnScreen={false}
                      onDraft={setNarratedDraft}
                      onSave={saveNarratedText}
                      onRegenerate={handleRegenerateAudio}
                    />
                  </div>
                </section>

              </div>

                {/* Preview and Image Forge section (right) */}
                <div className="bg-[hsl(var(--editor-surface))] p-4 lg:p-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar border-t lg:border-t-0 lg:border-l border-[hsl(var(--editor-border))] relative">
                {(() => {
                  const currentImagePanelTab =
                    imagePanelTabs[block.id] ??
                    (imageUrls[block.id] || block.rawImageUrl || block.generatedImageUrl ? 'image' : 'prompt');
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 rounded-[5px] bg-[hsl(var(--editor-surface-2))] px-1.5 py-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setImagePanelTabs((prev) => ({ ...prev, [block.id]: 'image' }))}
                            className={`h-7 px-2.5 rounded-[4px] text-[10px] font-bold uppercase tracking-widest transition-colors ${
                              currentImagePanelTab === 'image'
                                ? 'bg-[hsl(var(--editor-surface))] text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Image
                          </button>
                          <button
                            type="button"
                            onClick={() => setImagePanelTabs((prev) => ({ ...prev, [block.id]: 'prompt' }))}
                            className={`h-7 px-2.5 rounded-[4px] text-[10px] font-bold uppercase tracking-widest transition-colors ${
                              currentImagePanelTab === 'prompt'
                                ? 'bg-orange-600 text-white shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Prompt
                          </button>
                        </div>
                        {currentImagePanelTab === 'prompt' ? (
                          <button
                            onClick={() => handleRegenerateImage(block.id)}
                            disabled={Boolean(generatingStates[block.id]?.image || isTextGenerationBusy || isGeneratingFinalVideo || blockMissingPrompt)}
                            title={blockMissingPrompt ? 'Preencha o prompt de imagem deste bloco para gerar a imagem.' : 'Generate image'}
                            className={`flex items-center gap-2 px-3 h-7 bg-[hsl(var(--editor-surface))] border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[10px] font-bold text-muted-foreground transition-all shadow-sm disabled:shadow-none ${
                              generatingStates[block.id]?.image ? '' : 'hover:text-orange-600 hover:border-orange-200'
                            }`}
                          >
                            <RefreshCw size={14} className={`${generatingStates[block.id]?.image ? 'animate-spin text-orange-600' : 'text-muted-foreground'}`} />
                            Generate
                          </button>
                        ) : <div className="w-[94px]" />}
                      </div>

                      {currentImagePanelTab === 'image' ? (
                      <div className="relative group/asset aspect-[16/10] rounded-[6px] overflow-hidden border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] shadow-sm">
                          {!brokenRawImages[block.id] && (block.rawImageUrl || block.generatedImageUrl) ? (
                            <img 
                              src={block.rawImageUrl || block.generatedImageUrl} 
                              className={`w-full h-full object-cover transition-all duration-700 cursor-zoom-in ${generatingStates[block.id]?.image ? 'blur-xl opacity-40' : 'blur-0 opacity-100'}`}
                              alt="Asset"
                              onClick={() => onImageClick?.(block.rawImageUrl || block.generatedImageUrl || '')}
                              onError={() => setBrokenRawImages((prev) => ({ ...prev, [block.id]: true }))}
                            />
                          ) : null}
                          
                          {!generatingStates[block.id]?.image && (
                            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/asset:opacity-100 transition-all z-20">
                              <button 
                                onClick={(e) => { e.stopPropagation(); onImageClick?.(block.rawImageUrl || block.generatedImageUrl || ''); }}
                                className="p-1.5 bg-black/50 hover:bg-orange-600 text-white rounded-md backdrop-blur-sm"
                                title="View raw asset"
                              >
                                <Maximize2 size={14} />
                              </button>
                              <a 
                                href={block.rawImageUrl || block.generatedImageUrl} 
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
                      ) : (
                        <section className="space-y-1 p-0">
                          <ImagePromptEditor
                            blockId={block.id}
                            value={block.imagePrompt}
                            onSave={saveImagePrompt}
                            disabled={Boolean(generatingStates[block.id]?.text || isTextGenerationBusy || isGeneratingFinalVideo)}
                            invalid={blockMissingPrompt}
                          />
                        </section>
                      )}
                    </div>
                  );
                })()}
                </div>
                </div>
              </div>
            </div>
              );
          })}
          <div className="h-44" />
        </div>

        {/* Right video rail (fixed on the right with independent scroll) */}
        {isScriptSidebarOpen && (
          <aside className="w-72 bg-[hsl(var(--editor-surface))] p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-shrink-0 border-l border-[hsl(var(--editor-border))] z-10">
            <div className="space-y-2 border-b border-[hsl(var(--editor-border))] pb-3">
              <h3 className="font-bold text-muted-foreground text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                <Settings2 size={13} />
                Video Controls
              </h3>

              <button
                onClick={() => setIsVoiceModalOpen(true)}
                disabled={isGeneratingFinalVideo}
                className={`w-full flex items-center gap-2 px-3 h-8 bg-[hsl(var(--editor-surface-2))] border border-[hsl(var(--editor-border))] rounded-[5px] text-[10px] font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all shadow-sm group ${toolbarDisabledLikeAudioReview}`}
              >
                <Mic size={14} className="text-muted-foreground/80 group-hover:scale-110 transition-transform shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground/80 tracking-wide">Voice</span>
                <span className="ml-auto truncate max-w-[130px]">
                  {lessonVoiceId ? lessonVoiceId.toUpperCase() : 'SELECT VOICE'}
                </span>
              </button>

              <div className="relative" ref={templateMenuRef}>
                <button
                  onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                  disabled={isGeneratingFinalVideo}
                  className={`w-full flex items-center gap-2 px-3 h-8 bg-[hsl(var(--editor-surface-2))] border border-[hsl(var(--editor-border))] rounded-[5px] text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all group ${toolbarDisabledLikeAudioReview}`}
                >
                  <div className={`w-3 h-3 rounded-full border border-white/20 shadow-sm shrink-0 ${currentTemplate.previewColor}`}></div>
                  <span className="text-[10px] font-semibold text-muted-foreground/80 tracking-wide">Template</span>
                  <span className="ml-auto truncate max-w-[120px]">{currentTemplate.name}</span>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform shrink-0 ${isTemplateMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isTemplateMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-[hsl(var(--editor-surface))] border border-[hsl(var(--editor-border))] rounded-[8px] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                    <div className="p-3 border-b border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/60">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <input
                          autoFocus
                          type="text"
                          className="w-full pl-9 pr-3 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[4px] text-xs outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground h-8 text-foreground"
                          placeholder="Pesquisar tema..."
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-1.5">
                      {filteredTemplates.length > 0 ? (
                        filteredTemplates.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              setSelectedTemplateId(t.id);
                              void updateSelectedVersionPreferences({ preferredTemplateId: t.id });
                              setIsTemplateMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-[6px] transition-all mb-1 group relative ${
                              selectedTemplateId === t.id
                                ? 'bg-orange-50 dark:bg-orange-600/10 ring-1 ring-orange-500/20'
                                : 'hover:bg-[hsl(var(--editor-surface-2))]'
                            }`}
                          >
                            <div className={`w-14 h-9 rounded-[4px] border border-[hsl(var(--editor-border))] overflow-hidden flex-shrink-0 relative shadow-sm ${t.previewColor}`}>
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
                              <p className={`text-[11px] font-bold ${selectedTemplateId === t.id ? 'text-orange-600 dark:text-orange-500' : 'text-foreground'}`}>
                                {t.name}
                              </p>
                              <p className="text-[9px] text-muted-foreground uppercase font-medium tracking-tight">
                                {t.layout} layout
                              </p>
                            </div>

                            {selectedTemplateId === t.id && (
                              <div className="bg-orange-500 rounded-full p-0.5 shadow-sm">
                                <Check size={10} className="text-white" strokeWidth={4} />
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-xs text-muted-foreground font-medium italic">No theme found</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-[6px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Background Music
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {formatDbLabel(musicDbDraft)}
                  </div>
                </div>
                <select
                  value={selectedBgmPath}
                  disabled={isGeneratingFinalVideo}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedBgmPath(next);
                    void updateSelectedVersionPreferences({ bgmPath: next || null });
                  }}
                  className={`w-full h-8 px-2.5 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[11px] text-foreground ${toolbarDisabledLikeAudioReview}`}
                >
                  <option value="">No music</option>
                  {bgmLibrary.map((item) => (
                    <option key={item.path} value={item.path}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <div className="rounded-[6px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface))] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Preview Mixer
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {mixerVoiceQueue.length} voice clips • loop preview
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {mixerClipRisk ? (
                        <span className="inline-flex items-center rounded-[4px] border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-red-500">
                          Clip
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={toggleMixerPlayback}
                        disabled={
                          (!selectedBgmPreviewUrl && mixerVoiceQueue.length === 0) ||
                          (isGeneratingFinalVideo && !mixerIsPlaying)
                        }
                        className={`h-7 px-2.5 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface-2))]/40 text-[10px] font-bold flex items-center gap-1.5 ${toolbarDisabledLikeAudioReview}`}
                      >
                        {mixerIsPlaying ? <Pause size={12} /> : <Play size={12} />}
                        {mixerIsPlaying ? 'Pause' : 'Play'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="flex flex-col items-center gap-2 rounded-[6px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/20 p-2">
                      <button
                        type="button"
                        onClick={() => setMixerVoiceMuted((prev) => !prev)}
                        className="h-7 w-7 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface))] flex items-center justify-center text-muted-foreground hover:text-foreground"
                        title={mixerVoiceMuted ? 'Unmute voice' : 'Mute voice'}
                      >
                        {mixerVoiceMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <div className="h-24 flex items-center gap-1">
                        <div className="h-24 w-7 flex flex-col justify-between items-end text-[8px] leading-none pr-0.5">
                          {MIXER_DB_TICKS.map((tick) => (
                            <span
                              key={`voice-tick-${tick}`}
                              className={tick === 0 ? 'text-foreground/80 font-semibold' : 'text-muted-foreground/80'}
                            >
                              {tick > 0 ? `+${tick}` : tick}
                            </span>
                          ))}
                        </div>
                        <div className="h-24 w-7 flex items-center justify-center relative">
                          <input
                            type="range"
                            min={MIXER_MIN_DB}
                            max={MIXER_MAX_DB}
                            step={0.5}
                            value={voiceDbDraft}
                            onChange={(e) => {
                              const nextDb = clampMixerDb(Number(e.target.value));
                              const nextGain = dbToLinearGain(nextDb);
                              setVoiceVolumeDraft(nextGain);
                              scheduleVoiceVolumeSave(nextGain);
                            }}
                            title={`Voice gain ${formatDbLabel(voiceDbDraft)}`}
                            className="w-24 accent-orange-600"
                            style={{ transform: 'rotate(-90deg)' }}
                          />
                        </div>
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Voice</div>
                      <div className="text-[9px] text-muted-foreground">{formatDbLabel(voiceDbDraft)}</div>
                    </div>

                    <div className="flex flex-col items-center gap-2 rounded-[6px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/20 p-2">
                      <button
                        type="button"
                        onClick={() => setMixerMusicMuted((prev) => !prev)}
                        className="h-7 w-7 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface))] flex items-center justify-center text-muted-foreground hover:text-foreground"
                        title={mixerMusicMuted ? 'Unmute music' : 'Mute music'}
                      >
                        {mixerMusicMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <div className="h-24 flex items-center gap-1">
                        <div className="h-24 w-7 flex flex-col justify-between items-end text-[8px] leading-none pr-0.5">
                          {MIXER_DB_TICKS.map((tick) => (
                            <span
                              key={`music-tick-${tick}`}
                              className={tick === 0 ? 'text-foreground/80 font-semibold' : 'text-muted-foreground/80'}
                            >
                              {tick > 0 ? `+${tick}` : tick}
                            </span>
                          ))}
                        </div>
                        <div className="h-24 w-7 flex items-center justify-center relative">
                          <input
                            type="range"
                            min={MIXER_MIN_DB}
                            max={MIXER_MAX_DB}
                            step={0.5}
                            value={musicDbDraft}
                            onChange={(e) => {
                              const nextDb = clampMixerDb(Number(e.target.value));
                              const nextGain = dbToLinearGain(nextDb);
                              setBgmVolumeDraft(nextGain);
                              scheduleBgmVolumeSave(nextGain);
                            }}
                            title={`Music gain ${formatDbLabel(musicDbDraft)}`}
                            className="w-24 accent-orange-600"
                            style={{ transform: 'rotate(-90deg)' }}
                          />
                        </div>
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Music</div>
                      <div className="text-[9px] text-muted-foreground">{formatDbLabel(musicDbDraft)}</div>
                    </div>

                    <div className="flex flex-col items-center gap-2 rounded-[6px] border border-[hsl(var(--editor-border))] bg-[hsl(var(--editor-surface-2))]/20 p-2">
                      <div className="h-7 w-7 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface))] flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        M
                      </div>
                      <div className="h-24 flex items-center gap-1">
                        <div className="h-24 w-7 flex flex-col justify-between items-end text-[8px] leading-none pr-0.5">
                          {MIXER_DB_TICKS.map((tick) => (
                            <span
                              key={`master-tick-${tick}`}
                              className={tick === 0 ? 'text-foreground/80 font-semibold' : 'text-muted-foreground/80'}
                            >
                              {tick > 0 ? `+${tick}` : tick}
                            </span>
                          ))}
                        </div>
                        <div className="h-24 w-7 flex items-center justify-center relative">
                          <input
                            type="range"
                            min={MIXER_MIN_DB}
                            max={MIXER_MAX_DB}
                            step={0.5}
                            value={masterDbDraft}
                            onChange={(e) => {
                              const nextDb = clampMixerDb(Number(e.target.value));
                              const nextGain = dbToLinearGain(nextDb);
                              setMasterVolumeDraft(nextGain);
                              scheduleMasterVolumeSave(nextGain);
                            }}
                            title={`Master gain ${formatDbLabel(masterDbDraft)}`}
                            className="w-24 accent-orange-600"
                            style={{ transform: 'rotate(-90deg)' }}
                          />
                        </div>
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Master</div>
                      <div className="text-[9px] text-muted-foreground">{formatDbLabel(masterDbDraft)}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>Master peak</span>
                      <span className={mixerMasterPeak >= 0.99 ? 'text-red-500 font-semibold' : ''}>
                        {Math.round(mixerMasterPeak * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[hsl(var(--editor-surface-2))] border border-[hsl(var(--editor-border))] overflow-hidden">
                      <div
                        className={`h-full transition-[width] duration-75 ${mixerMasterPeak >= 0.99 ? 'bg-red-500' : mixerMasterPeak >= 0.9 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, mixerMasterPeak * 100))}%` }}
                      />
                    </div>
                  </div>

                  <audio
                    ref={bgmPreviewAudioRef}
                    crossOrigin="use-credentials"
                    preload="none"
                    src={selectedBgmPreviewUrl ?? undefined}
                    loop
                    hidden
                    onLoadedMetadata={(e) => {
                      e.currentTarget.volume = 1;
                      if (mixerIsPlaying && selectedBgmPreviewUrl) {
                        void e.currentTarget.play().catch(() => null);
                      }
                    }}
                  />
                  <audio
                    ref={mixerVoiceAudioRef}
                    crossOrigin="use-credentials"
                    preload="none"
                    hidden
                    onLoadedMetadata={(e) => {
                      e.currentTarget.volume = 1;
                    }}
                    onEnded={(e) => {
                      if (!mixerIsPlaying || mixerVoiceQueue.length === 0) return;
                      const nextIndex = mixerVoiceIndex + 1 >= mixerVoiceQueue.length ? 0 : mixerVoiceIndex + 1;
                      const nextUrl = mixerVoiceQueue[nextIndex]?.url;
                      if (!nextUrl) return;
                      setMixerVoiceIndex(nextIndex);
                      e.currentTarget.src = nextUrl;
                      void e.currentTarget.play().catch(() => null);
                    }}
                  />
                </div>
              </div>
            </div>

            <h3 className="font-bold text-muted-foreground text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
              <LayoutIcon size={14} />
              Video Outline
            </h3>
            <nav className="space-y-1">
              {blocks.map((block) => {
                const isActive = block.id === activeBlockId;
                const hasError = block.status === 'Error';
                return (
                  <button 
                    key={block.id}
                    onClick={() => scrollToBlock(block.id)}
                    className={`w-full relative flex items-center gap-3 py-2 px-3 rounded-[5px] transition-all group text-left ${
                      isActive
                        ? 'bg-orange-500/10 dark:bg-orange-500/16 ring-1 ring-orange-500/20 shadow-sm' 
                        : hasError
                          ? 'border border-red-500/45 bg-red-500/10 hover:bg-red-500/15'
                        : 'hover:bg-[hsl(var(--editor-surface-2))]'
                    }`}
                  >
                    <div 
                      className="relative w-12 h-8 rounded-[4px] overflow-hidden flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity border border-[hsl(var(--editor-border))] cursor-zoom-in"
                      onClick={(e) => { e.stopPropagation(); onImageClick?.(block.thumbLandscape || block.thumbnail || '/lesson-placeholder.svg'); }}
                    >
                      <img src={block.thumbLandscape || block.thumbnail || '/lesson-placeholder.svg'} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 size={10} className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-foreground/50 mb-0.5">
                        {block.number}
                      </p>
                      <p className={`text-[11px] font-semibold truncate ${
                        hasError
                          ? 'text-red-500'
                          : isActive
                            ? 'text-foreground/40'
                            : 'text-muted-foreground/50 group-hover:text-foreground/40'
                      }`}>
                        {(block.narratedText || block.originalText || '').trim()}
                      </p>
                    </div>
                    {hasError ? (
                      <span className="absolute top-2 right-2 inline-flex px-1.5 h-4 items-center rounded border border-red-500/50 bg-red-500/15 text-[8px] font-bold uppercase tracking-widest text-red-500">
                        Error
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}
      </div>

      {/* Voice Selector Modal */}
      {isFinalVideoModalOpen && finalVideoModalSrc && (
        <div
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm p-3 sm:p-6"
          onClick={() => setIsFinalVideoModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Final video preview"
        >
          <div
            className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[8px] border border-white/15 bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/90 px-4 py-3 text-white">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Final Video</div>
                <div className="truncate text-sm font-semibold">{lessonTitle || 'Preview'}</div>
                {finalVideoDownloadError ? (
                  <div className="mt-1 text-[11px] text-red-300">{finalVideoDownloadError}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadFinalVideoInChunks(finalVideoModalSrc, lessonTitle || 'final-video')}
                  disabled={isDownloadingFinalVideo}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-emerald-300/25 bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
                  aria-label="Download final video"
                  title="Download MP4"
                >
                  {isDownloadingFinalVideo ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Download MP4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFinalVideoModalOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  aria-label="Close video preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black">
              <video
                key={finalVideoModalSrc}
                src={finalVideoModalSrc}
                controls
                controlsList="nodownload"
                playsInline
                preload="metadata"
                crossOrigin="use-credentials"
                className="h-full w-full bg-black"
              />
            </div>
          </div>
        </div>
      )}
      <VoiceSelectorModal 
        isOpen={isVoiceModalOpen} 
        onClose={() => setIsVoiceModalOpen(false)} 
        onSelect={handleVoiceSelected}
        currentVoiceId={lessonVoiceId}
        voices={availableVoices}
      />
    </div>
  );
};

export default Editor;
