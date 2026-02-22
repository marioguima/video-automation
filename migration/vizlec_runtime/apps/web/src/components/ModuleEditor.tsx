
import React, { useEffect, useRef, useState } from 'react';
import { 
  ChevronLeft, 
  Sparkles, 
  FileText, 
  Layout, 
  ArrowRight,
  Zap,
  CheckCircle2,
  Check,
  Volume2,
  Image as ImageIcon
} from 'lucide-react';
import { LessonBlock } from '../types';
import AIGenerationOverlay from './AIGenerationOverlay';
import { apiGet, apiPatch, apiPost } from '../lib/api';

interface ModuleEditorProps {
  moduleId: string | null;
  module: LessonBlock | null;
  dispatchAgentId: string | null;
  onSave: (module: LessonBlock, moduleId?: string | null) => void;
  onCancel: () => void;
  onStartAIGen: (
    module: LessonBlock,
    options?: { generateAudio: boolean; generateImage: boolean }
  ) => void;
}

const buildEmptyLessonDraft = (): LessonBlock => ({
  id: Math.random().toString(36).substr(2, 9),
  number: '',
  title: '',
  duration: '00:00',
  status: 'Empty',
  thumbnail: '/lesson-placeholder.svg',
  thumbLandscape: '/lesson-placeholder.svg',
  thumbPortrait: '/lesson-placeholder-portrait.svg',
  originalText: '',
  narratedText: '',
  onScreenText: { title: '', bullets: [] },
  imagePrompt: { prompt: '', avoid: '', seedText: '', seedNumber: 1234 }
});

const ModuleEditor: React.FC<ModuleEditorProps> = ({ moduleId, module, dispatchAgentId, onSave, onCancel, onStartAIGen }) => {
  const isEditMode = Boolean(module?.id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelingGeneration, setIsCancelingGeneration] = useState(false);
  const [segmentJobContext, setSegmentJobContext] = useState<{ jobId: string; clientId: string | null } | null>(null);
  const cancelRequestedRef = useRef(false);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [generateImage, setGenerateImage] = useState(true);
  const [generationStatus, setGenerationStatus] = useState('Preparing lesson...');
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(1);
  const landscapeInputRef = useRef<HTMLInputElement | null>(null);
  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState<LessonBlock>(module ?? buildEmptyLessonDraft());
  const [isLoadingStoredScript, setIsLoadingStoredScript] = useState(false);
  const segmentWaitersRef = useRef<Record<string, { resolve: () => void; reject: (error: Error) => void }>>({});

  useEffect(() => {
    setFormData(module ?? buildEmptyLessonDraft());
  }, [module]);

  useEffect(() => {
    if (!module?.id) {
      setIsLoadingStoredScript(false);
      return;
    }

    let cancelled = false;
    setIsLoadingStoredScript(true);
    apiGet<Array<{ id: string; scriptText: string }>>(`/lessons/${module.id}/versions`, { cacheMs: 0, dedupe: false })
      .then((versions) => {
        if (cancelled) return;
        const latestScript = versions?.[0]?.scriptText?.trim() ?? '';
        if (!latestScript) return;
        setFormData((prev) => ({
          ...prev,
          originalText: latestScript,
          narratedText: prev.narratedText?.trim() ? prev.narratedText : latestScript
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingStoredScript(false);
      });

    return () => {
      cancelled = true;
    };
  }, [module?.id]);

  const appendLog = (message: string) => {
    setGenerationLogs((prev) => [message, ...prev].slice(0, 6));
  };
  const setRunningLog = (message: string) => {
    setGenerationLogs((prev) => {
      const withoutRunning = prev.filter((item) => !item.startsWith('RUNNING|'));
      return [`RUNNING|${message}`, ...withoutRunning].slice(0, 8);
    });
  };
  const appendOutcomeLog = (message: string, kind: 'SUCCESS' | 'ERROR' | 'INFO') => {
    setGenerationLogs((prev) => {
      const running = prev.find((item) => item.startsWith('RUNNING|'));
      const withoutRunning = prev.filter((item) => !item.startsWith('RUNNING|'));
      const next = [`${kind}|${message}`, ...withoutRunning];
      return running ? [running, ...next].slice(0, 8) : next.slice(0, 8);
    });
  };

  const handleThumbnailFile = (target: 'landscape' | 'portrait', file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      if (target === 'landscape') {
        setFormData((prev) => ({
          ...prev,
          thumbLandscape: result,
          thumbnail: result
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          thumbPortrait: result
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const waitForSegmentJob = (jobId: string): Promise<void> =>
    new Promise((resolve, reject) => {
      segmentWaitersRef.current[jobId] = { resolve, reject };
    });

  useEffect(() => {
    const onWs = (event: Event) => {
      const detail = (event as CustomEvent<{
        event?: string;
        payload?: { jobId?: string; status?: string; type?: string; blockId?: string | null };
      }>).detail;
      if (!detail || detail.event !== 'job_update') return;
      const payload = detail.payload;
      const jobId = payload?.jobId?.trim();
      const status = payload?.status?.trim() ?? '';
      const type = payload?.type?.trim() ?? '';
      if (!jobId || !status) return;

      const waiter = segmentWaitersRef.current[jobId];
      if (!waiter) return;

      if (type === 'segment' || type === 'segment_block') {
        if (status === 'pending') {
          setCurrentBlock(0);
          setGenerationStatus('Queued. Waiting for analysis worker...');
          setRunningLog('Waiting for worker to start block analysis...');
        } else if (status === 'running') {
          setCurrentBlock((prev) => Math.max(1, prev));
          setGenerationStatus('Analyzing lesson blocks...');
          setRunningLog('Generating title, bullets and image prompt...');
        }
      }

      if (status === 'succeeded') {
        appendOutcomeLog('All blocks analyzed successfully.', 'SUCCESS');
        setGenerationStatus('Analysis finished. Opening editor...');
        setRunningLog('Preparing editor...');
        delete segmentWaitersRef.current[jobId];
        waiter.resolve();
        return;
      }
      if (status === 'canceled') {
        delete segmentWaitersRef.current[jobId];
        waiter.reject(new Error(cancelRequestedRef.current ? '__USER_CANCELED_SEGMENT__' : 'Segmentation canceled.'));
        return;
      }
      if (status === 'failed') {
        delete segmentWaitersRef.current[jobId];
        waiter.reject(new Error('Segmentation finished with status: failed'));
      }
    };

    window.addEventListener('vizlec:ws', onWs as EventListener);
    return () => {
      Object.values(segmentWaitersRef.current).forEach((waiter) => {
        try {
          waiter.reject(new Error('Segmentation watcher disposed.'));
        } catch {
          // ignore
        }
      });
      segmentWaitersRef.current = {};
      window.removeEventListener('vizlec:ws', onWs as EventListener);
    };
  }, []);

  const handleCancelGeneration = async () => {
    if (!segmentJobContext) return;
    cancelRequestedRef.current = true;
    setIsCancelingGeneration(true);
    setGenerationStatus('Canceling block generation...');
    setRunningLog('Cancel requested. Finishing current step...');
    try {
      await apiPost(`/jobs/${segmentJobContext.jobId}/cancel`, {
        clientId: segmentJobContext.clientId
      });
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (!message.includes('job already finished')) {
        console.error(err);
      }
    }
  };

  const handleStartProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = formData.title.trim();
    const scriptText = formData.originalText.trim();
    if (!title || !scriptText) {
      alert('Title and script are required.');
      return;
    }
    if (!isEditMode && !moduleId) {
      alert('Select a module before creating the lesson.');
      return;
    }
    setGenerationLogs([]);
    setCurrentBlock(0);
    setTotalBlocks(1);
    cancelRequestedRef.current = false;
    setIsCancelingGeneration(false);
    setSegmentJobContext(null);
    setGenerationStatus(isEditMode ? 'Updating lesson...' : 'Creating lesson...');
    setIsGenerating(true);
    try {
      const clientId = dispatchAgentId ?? null;
      const lesson = isEditMode
        ? await apiPatch<{ id: string; title: string }>(`/lessons/${module!.id}`, { title })
        : await apiPost<{ id: string; title: string }>(`/modules/${moduleId}/lessons`, { title });
      appendOutcomeLog(isEditMode ? 'Lesson updated.' : 'Lesson created.', 'INFO');
      const version = await apiPost<{ id: string }>(`/lessons/${lesson.id}/versions`, {
        scriptText
      });
      appendOutcomeLog('Lesson script version created.', 'INFO');
      onSave(
        {
          ...formData,
          id: lesson.id,
          title: lesson.title,
          originalText: scriptText,
          narratedText: scriptText,
          build: {
            lessonVersionId: version.id,
            blocksTotal: formData.build?.blocksTotal ?? 0,
            blocksReady: formData.build?.blocksReady ?? 0,
            audioReady: formData.build?.audioReady ?? 0,
            imagesReady: formData.build?.imagesReady ?? 0,
            finalVideoReady: formData.build?.finalVideoReady ?? false,
            progressPercent: formData.build?.progressPercent ?? 0,
            jobs: formData.build?.jobs ?? {
              blocks: { pending: 0, running: 0 },
              audio: { pending: 0, running: 0 },
              images: { pending: 0, running: 0 },
              video: { pending: 0, running: 0 }
            }
          }
        },
        moduleId
      );
      const segmentJob = await apiPost<{ id: string; status: string }>(
        `/lesson-versions/${version.id}/segment`,
        {
          clientId,
          requestId: crypto.randomUUID(),
          purge: true
        }
      );
      setSegmentJobContext({ jobId: segmentJob.id, clientId });
      appendOutcomeLog('Segmentation job queued.', 'INFO');
      setGenerationStatus('Analyzing and splitting script into blocks...');
      setRunningLog('Analyzing script and splitting into blocks...');
      await waitForSegmentJob(segmentJob.id);
      onStartAIGen(
        {
          ...formData,
          id: lesson.id,
          title: lesson.title,
          originalText: scriptText,
          narratedText: scriptText
        },
        {
          generateAudio,
          generateImage
        }
      );
      cancelRequestedRef.current = false;
      setSegmentJobContext(null);
      setIsCancelingGeneration(false);
    } catch (err) {
      console.error(err);
      setSegmentJobContext(null);
      if ((err as Error).message === '__USER_CANCELED_SEGMENT__') {
        setIsGenerating(false);
        cancelRequestedRef.current = false;
        setIsCancelingGeneration(false);
        return;
      }
      setIsGenerating(false);
      cancelRequestedRef.current = false;
      alert((err as Error).message ?? (isEditMode ? 'Failed to update lesson.' : 'Failed to create lesson.'));
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background flex items-start justify-center">
      
      {/* Enhanced AI Generation Transition State */}
      <AIGenerationOverlay 
        isActive={isGenerating} 
        mode="controlled"
        totalBlocks={totalBlocks}
        currentBlock={currentBlock}
        statusText={generationStatus}
        logs={generationLogs}
        onCancel={segmentJobContext ? handleCancelGeneration : undefined}
        cancelLabel={isCancelingGeneration ? 'Canceling...' : 'Cancel'}
        cancelDisabled={isCancelingGeneration}
      />

      <div className="w-full max-w-4xl p-8 py-12">
        {/* Workflow Stepper */}
        <div className="flex items-center justify-center gap-6 mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-orange-600/30 ring-4 ring-orange-500/10">1</div>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-orange-600">Lesson Info</span>
          </div>
          
          <div className="w-16 h-[2px] bg-slate-200 dark:bg-slate-800 rounded-full"></div>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold">2</div>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Block Generation</span>
          </div>
        </div>

        {/* Back Button */}
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-400 hover:text-orange-600 font-bold text-[10px] uppercase tracking-widest mb-6 transition-colors h-9"
        >
          <ChevronLeft size={14} />
          Cancel and return
        </button>

        <form onSubmit={handleStartProcess} className="space-y-6">
            <div className="bg-card rounded-[5px] border border-border shadow-2xl shadow-slate-200/50 dark:shadow-none overflow-hidden transition-colors duration-300">
            
            {/* Form Section: Basic Info */}
            <div className="p-8 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
                  <Layout className="text-orange-600" size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Lesson Registration</h1>
                  <p className="text-xs text-muted-foreground font-medium">Step 1: Define the core content of your video lesson.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-12 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Lesson Title
                  </label>
                  <input 
                    required
                    className="w-full border rounded-[5px] text-sm font-bold outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g. Introduction to Quantum Physics"
                  />
                </div>
                <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
                  <div className="space-y-2 md:col-span-7">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <ImageIcon size={12} className="text-orange-600" /> Thumbnail 16:9
                    </label>
                    <input
                      ref={landscapeInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleThumbnailFile('landscape', e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => landscapeInputRef.current?.click()}
                        className="group relative w-full aspect-video rounded-[5px] overflow-hidden border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-left"
                      >
                        <img
                          src={formData.thumbLandscape || formData.thumbnail || '/lesson-placeholder.svg'}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          alt="Landscape thumbnail preview"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold uppercase tracking-widest">
                            Click to upload
                          </span>
                        </div>
                      </button>
                      <div className="flex flex-col gap-2 w-28">
                        <button
                          type="button"
                          onClick={() => landscapeInputRef.current?.click()}
                          className="px-3 h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, thumbLandscape: '/lesson-placeholder.svg', thumbnail: '/lesson-placeholder.svg' }))}
                          className="px-3 h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-4 md:col-start-9">
                    <div className="w-fit space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <ImageIcon size={12} className="text-orange-600" /> Thumbnail 9:16
                      </label>
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => portraitInputRef.current?.click()}
                          className="group relative w-[40%] min-w-[132px] max-w-[160px] aspect-[9/16] rounded-[5px] overflow-hidden border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-left"
                        >
                          <img
                            src={formData.thumbPortrait || '/lesson-placeholder-portrait.svg'}
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            alt="Portrait thumbnail preview"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center text-center px-2">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold uppercase tracking-widest">
                              Click to upload
                            </span>
                          </div>
                        </button>
                        <div className="flex flex-col gap-2 w-24">
                          <button
                            type="button"
                            onClick={() => portraitInputRef.current?.click()}
                            className="px-3 h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                          >
                            Upload
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, thumbPortrait: '/lesson-placeholder-portrait.svg' }))}
                            className="px-3 h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                    <input
                      ref={portraitInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleThumbnailFile('portrait', e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Form Section: The Script */}
            <div className="p-8 bg-[hsl(var(--secondary))]/60">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} className="text-orange-600" />
                  Original Source Material (Script)
                </label>
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded text-[9px] font-bold uppercase tracking-tighter">
                  <Zap size={10} fill="currentColor" /> AI Ready
                </div>
              </div>
              <textarea 
                required
                className="w-full border rounded-[5px] p-5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/40 transition-all min-h-[380px] shadow-sm placeholder:text-slate-300 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                value={formData.originalText}
                onChange={e => setFormData({...formData, originalText: e.target.value})}
                disabled={isLoadingStoredScript}
                placeholder="Paste your raw lecture content, research paper or script notes here."
              />
              {isLoadingStoredScript ? (
                <div className="mt-2 text-[11px] text-muted-foreground">Loading script from saved lesson version...</div>
              ) : null}
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                <CheckCircle2 size={12} className="text-green-500" />
                Your script will be analyzed to generate voiceover and visual assets automatically.
              </div>
              <div className="mt-5 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))]/50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Generation Queue
                  </p>
                  <p className="text-[10px] font-semibold text-orange-600/90">Audio first, then images</p>
                </div>
                <div className="grid gap-2">
                  <label
                    className={`group relative flex items-center gap-3 rounded-[5px] border px-3 py-2.5 cursor-pointer transition-colors duration-100 ease-out ${
                      generateAudio
                        ? 'border-orange-500/40 bg-orange-500/10 shadow-[0_0_0_1px_rgba(249,115,22,0.18)]'
                        : 'border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface))]/40 hover:border-orange-500/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={generateAudio}
                      onChange={(e) => setGenerateAudio(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors duration-100 ease-out ${
                        generateAudio
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-transparent'
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-orange-500/15 text-orange-600 dark:text-orange-400">
                      <Volume2 size={14} />
                    </span>
                    <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Generate audios after analysis</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      {generateAudio ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>

                  <label
                    className={`group relative flex items-center gap-3 rounded-[5px] border px-3 py-2.5 cursor-pointer transition-colors duration-100 ease-out ${
                      generateImage
                        ? 'border-orange-500/40 bg-orange-500/10 shadow-[0_0_0_1px_rgba(249,115,22,0.18)]'
                        : 'border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-surface))]/40 hover:border-orange-500/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={generateImage}
                      onChange={(e) => setGenerateImage(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors duration-100 ease-out ${
                        generateImage
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-transparent'
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                      <ImageIcon size={14} />
                    </span>
                    <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Generate images after audios</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      {generateImage ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-4 pt-4">
            <button 
              type="button"
              onClick={onCancel}
              className="px-6 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-300 transition-all uppercase tracking-widest h-9"
            >
              Discard Changes
            </button>
            <button 
              type="submit"
              className="flex items-center gap-3 bg-orange-600 hover:bg-orange-700 border border-orange-500/70 text-white px-8 rounded-[5px] font-bold transition-all shadow-xl shadow-orange-600/20 active:scale-95 group h-9"
            >
              <span className="text-sm">
                {isEditMode ? 'Update & Generate Video Blocks' : 'Create & Generate Video Blocks'}
              </span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModuleEditor;
