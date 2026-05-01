
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

interface AIGenerationOverlayProps {
  isActive: boolean;
  totalBlocks?: number;
  onComplete: () => void;
}

const AIGenerationOverlay: React.FC<AIGenerationOverlayProps> = ({ 
  isActive, 
  totalBlocks = 10, 
  onComplete 
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
      onComplete();
    };

    startSimulation();

    return () => {
      clearTimeout(blockTimer);
      clearTimeout(logTimer);
    };
  }, [isActive, totalBlocks, onComplete, statusMessages, blockTasks]);

  if (!isActive) return null;

  const progress = (currentBlock / totalBlocks) * 100;

  return (
    <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-700">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-600/10 dark:bg-orange-600/5 blur-[120px] rounded-full"></div>
      
      <div className="relative z-10 w-full max-w-lg">
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
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">
          Generating Video Blocks...
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium h-6 mb-10 transition-all duration-300">
          {status}
        </p>

        {/* Progress System */}
        <div className="space-y-3 mb-12">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1">
            <span>Progress</span>
            <span className="text-orange-600 dark:text-orange-500">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 p-0.5 shadow-inner">
            <div 
              className="h-full bg-orange-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_15px_rgba(234,88,12,0.4)]" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Live Task Logs */}
        <div className="bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50 rounded-xl p-6 min-h-[160px] flex flex-col items-start gap-3 shadow-inner">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 border-b border-slate-200 dark:border-slate-800 pb-2 w-full text-left">
            Activity Log
          </div>
          {logs.length > 0 ? (
            logs.map((log, idx) => (
              <div 
                key={`${log}-${idx}`} 
                className="flex items-center gap-3 text-xs font-medium animate-in slide-in-from-bottom-2 fade-in duration-300"
                style={{ opacity: 1 - idx * 0.25 }}
              >
                {idx === 0 ? (
                  <Loader2 size={14} className="text-orange-600 dark:text-orange-500 animate-spin" />
                ) : (
                  <CheckCircle2 size={14} className="text-green-600 dark:text-green-500/80" />
                )}
                <span className={idx === 0 ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}>
                  {log}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs italic text-slate-400 dark:text-slate-600 w-full pt-4 text-left">Waiting for initial analysis...</div>
          )}
        </div>
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
