
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, CheckCircle2, Loader2, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface AIGenerationOverlayProps {
  isActive: boolean;
  mode?: 'simulation' | 'controlled';
  totalBlocks?: number;
  currentBlock?: number;
  statusText?: string;
  logs?: string[];
  onComplete?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  titleText?: string;
  subtitleText?: string;
  contextItems?: Array<{ label: string; value: string }>;
  progressLabel?: string;
  summaryItems?: Array<{ label: string; value: string }>;
  contentWidthClassName?: string;
  detailsPanel?: React.ReactNode;
  showActivityLog?: boolean;
  stageSteps?: Array<{
    key: string;
    label: string;
    description?: string;
    status: 'pending' | 'running' | 'done';
    progressText?: string;
  }>;
  onDismiss?: () => void;
  dismissLabel?: string;
  dismissDisabled?: boolean;
}

const AIGenerationOverlay: React.FC<AIGenerationOverlayProps> = ({ 
  isActive, 
  mode = 'simulation',
  totalBlocks = 10, 
  currentBlock: currentBlockProp,
  statusText,
  logs: logsProp,
  onComplete,
  onCancel,
  cancelLabel = 'Cancel',
  cancelDisabled = false,
  titleText = 'Generating Video Blocks...',
  subtitleText,
  contextItems,
  progressLabel = 'Progress',
  summaryItems,
  contentWidthClassName = 'max-w-lg',
  detailsPanel,
  showActivityLog = true,
  stageSteps,
  onDismiss,
  dismissLabel = 'Close',
  dismissDisabled = false
}) => {
  const [currentBlock, setCurrentBlock] = useState(0);
  const [status, setStatus] = useState('Initializing AI Engine...');
  const [logs, setLogs] = useState<string[]>([]);
  
  const statusMessages = useMemo(() => [
    "Analyzing script sentiment...",
    "Extracting key concepts...",
    "Structuring lesson flow...",
    "Defining visual style guidelines...",
    "Optimizing prompt tokens...",
  ], []);

  const blockTasks = useMemo(() => [
    "Creating scene layout",
    "Generating visual prompt",
    "Synthesizing narration",
    "Applying template styles",
  ], []);

  useEffect(() => {
    if (mode !== 'simulation') return;
    if (!isActive) return;

    let blockTimer: any;
    let logTimer: any;
    
    // Initial analysis phase
    const startSimulation = async () => {
      // Phase 1: Pre-processing
      for (let i = 0; i < statusMessages.length; i++) {
        setStatus(statusMessages[i]);
        await new Promise(r => setTimeout(r, 600));
      }

      // Phase 2: Block by block generation
      for (let b = 1; b <= totalBlocks; b++) {
        setCurrentBlock(b);
        setStatus(`Generating Video Block ${b} of ${totalBlocks}...`);
        
        // Simulate tasks for this specific block
        for (let t = 0; t < blockTasks.length; t++) {
          const newTask = `Block ${b}: ${blockTasks[t]}`;
          setLogs(prev => [newTask, ...prev].slice(0, 4));
          await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
        }
        
        // Small pause between blocks
        await new Promise(r => setTimeout(r, 300));
      }

      setStatus("Finalizing sequence and assets...");
      await new Promise(r => setTimeout(r, 1000));
      onComplete?.();
    };

    startSimulation();

    return () => {
      clearTimeout(blockTimer);
      clearTimeout(logTimer);
    };
  }, [isActive, totalBlocks, onComplete, statusMessages, blockTasks, mode]);

  if (!isActive) return null;

  const effectiveCurrentBlock = mode === 'controlled' ? Math.max(0, currentBlockProp ?? 0) : currentBlock;
  const effectiveStatus = mode === 'controlled' ? statusText ?? status : status;
  const effectiveLogs = mode === 'controlled' ? logsProp ?? [] : logs;
  const progress = (effectiveCurrentBlock / totalBlocks) * 100;
  const decodeLog = (entry: string, index: number): { kind: 'running' | 'success' | 'error' | 'info'; text: string } => {
    if (entry.startsWith('RUNNING|')) return { kind: 'running', text: entry.slice(8) };
    if (entry.startsWith('SUCCESS|')) return { kind: 'success', text: entry.slice(8) };
    if (entry.startsWith('ERROR|')) return { kind: 'error', text: entry.slice(6) };
    if (entry.startsWith('INFO|')) return { kind: 'info', text: entry.slice(5) };
    return { kind: index === 0 ? 'running' : 'success', text: entry };
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-700">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-600/10 dark:bg-orange-600/5 blur-[120px] rounded-full"></div>
      
      <div className={cn('relative z-10 w-full', contentWidthClassName)}>

        {/* Animated Icon Container */}
        <div className="relative mb-12 flex justify-center">
          <div className="absolute inset-0 bg-orange-600/20 dark:bg-orange-600/30 blur-3xl animate-pulse"></div>
          <div className="w-28 h-28 bg-white/50 dark:bg-slate-900/50 border border-orange-500/30 rounded-full flex items-center justify-center relative shadow-2xl overflow-hidden group">
             {/* Spinning border effect */}
             <div className="absolute inset-0 border-2 border-transparent border-t-orange-500/50 rounded-full animate-spin"></div>
             <Sparkles className="text-orange-500 w-12 h-12 animate-pulse" />
          </div>
        </div>

        {/* Text Content */}
        <h2 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
          {titleText}
        </h2>
        <p className="text-muted-foreground text-sm font-medium min-h-6 transition-all duration-300">
          {subtitleText ?? effectiveStatus}
        </p>
        {contextItems && contextItems.length > 0 ? (
          contextItems.length === 1 ? (
            <p className="mt-2 mb-8 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold">{contextItems[0].label}:</span> {contextItems[0].value}
            </p>
          ) : (
            <div className="mt-3 mb-8 flex flex-wrap items-center justify-center gap-2">
              {contextItems.map((item) => (
                <div key={item.label} className="inline-flex items-center gap-1.5 rounded-[5px] border border-border/70 bg-slate-50/80 dark:bg-slate-900/40 px-2.5 py-1 text-[11px]">
                  <span className="font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{item.label}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 max-w-[340px] truncate">{item.value}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="mb-10" />
        )}

        {stageSteps && stageSteps.length > 0 ? (
          <div className="mb-8 grid gap-2 sm:grid-cols-2">
            {stageSteps.map((stage) => {
              const isRunning = stage.status === 'running';
              const isDone = stage.status === 'done';
              return (
                <div
                  key={stage.key}
                  className={cn(
                    'rounded-[6px] border px-3 py-2 text-left transition-colors',
                    isDone
                      ? 'border-emerald-400/40 bg-emerald-500/10'
                      : isRunning
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-border/60 bg-slate-50/60 dark:bg-slate-900/30'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {stage.label}
                    </p>
                    {stage.progressText ? (
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {stage.progressText}
                      </span>
                    ) : null}
                  </div>
                  {stage.description ? (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{stage.description}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Progress System */}
        <div className="space-y-3 mb-10 max-w-2xl mx-auto">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1">
            <span>{progressLabel}</span>
            <span className="text-orange-600 dark:text-orange-500">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden border border-border p-0.5 shadow-inner">
            <div 
              className="h-full bg-orange-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_15px_rgba(234,88,12,0.4)]" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {summaryItems && summaryItems.length > 0 ? (
          <div className="mb-8 grid grid-cols-2 gap-3">
            {summaryItems.slice(0, 4).map((item) => (
              <div key={item.label} className="rounded-[5px] border border-border/60 px-3 py-2 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Live panels */}
        <div
          className={cn(
            'mb-8 max-w-2xl mx-auto',
            detailsPanel && showActivityLog ? 'grid lg:grid-cols-2 gap-4' : 'block'
          )}
        >
          {detailsPanel ? (
            <div className="bg-slate-50/80 dark:bg-slate-900/40 border border-border/50 rounded-xl p-6 min-h-[160px] shadow-inner">
              {detailsPanel}
            </div>
          ) : null}
          {showActivityLog ? (
            <div className="bg-slate-50/80 dark:bg-slate-900/40 border border-border/50 rounded-xl p-6 min-h-[160px] flex flex-col items-start gap-3 shadow-inner">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 border-b border-border pb-2 w-full text-left">
                Activity Log
              </div>
              {effectiveLogs.length > 0 ? (
                effectiveLogs.map((raw, idx) => {
                  const item = decodeLog(raw, idx);
                  return (
                  <div
                    key={mode === 'controlled' ? `${raw}-${idx}` : `${raw}-${idx}`}
                    className={`flex items-center gap-3 text-xs font-medium ${
                      mode === 'controlled' ? '' : 'animate-in slide-in-from-bottom-2 fade-in duration-300'
                    }`}
                    style={{ opacity: 1 - idx * 0.25 }}
                  >
                    {item.kind === 'running' ? (
                      <Loader2 size={14} className="text-orange-600 dark:text-orange-500 animate-spin" />
                    ) : item.kind === 'error' ? (
                      <AlertTriangle size={14} className="text-red-500" />
                    ) : item.kind === 'info' ? (
                      <Info size={14} className="text-slate-500 dark:text-slate-400" />
                    ) : (
                      <CheckCircle2 size={14} className="text-green-600 dark:text-green-500/80" />
                    )}
                    <span
                      className={
                        item.kind === 'running'
                          ? 'text-slate-800 dark:text-slate-200'
                          : item.kind === 'error'
                            ? 'text-red-500'
                            : item.kind === 'info'
                              ? 'text-slate-600 dark:text-slate-400'
                              : 'text-slate-400 dark:text-slate-500'
                      }
                    >
                      {item.text}
                    </span>
                  </div>
                )})
              ) : (
                <div className="text-xs italic text-slate-400 dark:text-slate-600 w-full pt-4 text-left">Waiting for initial analysis...</div>
              )}
            </div>
          ) : null}
        </div>

        {(onDismiss || onCancel) ? (
          <div className="mt-4 max-w-2xl mx-auto flex justify-end gap-2">
            {onDismiss ? (
              <Button
                type="button"
                onClick={onDismiss}
                disabled={dismissDisabled}
                variant="outline"
                size="sm"
                className="h-8 rounded-[5px] px-3 text-[10px] font-semibold"
              >
                {dismissLabel}
              </Button>
            ) : null}
            {onCancel ? (
              <Button
                type="button"
                onClick={onCancel}
                disabled={cancelDisabled}
                variant="ghost"
                size="sm"
                className="h-8 rounded-[5px] px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-500 hover:bg-transparent hover:text-slate-500 dark:hover:text-slate-300 disabled:opacity-50"
              >
                <X size={12} className="mr-1.5" />
                {cancelLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes progress-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

export default AIGenerationOverlay;
