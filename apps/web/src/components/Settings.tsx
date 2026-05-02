
import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Cpu, 
  Mic, 
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  Monitor,
  ExternalLink
} from 'lucide-react';
import { Theme } from '../types';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import ConfirmDialog from './ui/confirm-dialog';

type LLMProvider = 'ollama' | 'gemini' | 'openai';

interface SettingsProps {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const Settings: React.FC<SettingsProps> = ({ currentTheme, setTheme }) => {
  // General State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<'appearance' | 'llm' | 'comfy' | 'tts' | 'runtime'>('appearance');
  const [currentFamily, currentMode] = currentTheme.split('-') as [
    'classic' | 'premium' | 'minimal',
    'light' | 'dark'
  ];

  // LLM State
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedLlmModel, setSelectedLlmModel] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [llmTimeout, setLlmTimeout] = useState('60'); // Seconds

  // ComfyUI State
  const [comfyUiUrl, setComfyUiUrl] = useState('http://127.0.0.1:8188');
  const [comfyPromptTimeoutMs, setComfyPromptTimeoutMs] = useState('60000');
  const [comfyGenerationTimeoutMs, setComfyGenerationTimeoutMs] = useState('300000');
  const [comfyViewTimeoutMs, setComfyViewTimeoutMs] = useState('60000');
  const [comfyMasterPrompt, setComfyMasterPrompt] = useState('');
  const [comfyWorkflowFile, setComfyWorkflowFile] = useState('vantage-z-image-turbo-api.json');
  const [availableComfyWorkflows, setAvailableComfyWorkflows] = useState<string[]>([]);
  const [isImportingComfyWorkflow, setIsImportingComfyWorkflow] = useState(false);
  const [comfyImportStatus, setComfyImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [comfyImportMessage, setComfyImportMessage] = useState('');
  const [isOverwriteWorkflowConfirmOpen, setIsOverwriteWorkflowConfirmOpen] = useState(false);
  const [overwriteWorkflowTargetName, setOverwriteWorkflowTargetName] = useState('');
  const [pendingWorkflowOverwrite, setPendingWorkflowOverwrite] = useState<{
    fileName: string;
    workflow: unknown;
  } | null>(null);
  const [isTestingComfy, setIsTestingComfy] = useState(false);
  const [comfyTestStatus, setComfyTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [comfyTestMessage, setComfyTestMessage] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // TTS State
  const [ttsUrl, setTtsUrl] = useState('http://127.0.0.1:8020');
  const [ttsTimeout, setTtsTimeout] = useState('5000000'); // Microseconds
  const [ttsLanguage, setTtsLanguage] = useState('pt');
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState('cohesive-pt-santiago-22050hz');
  const [idleUnloadMs, setIdleUnloadMs] = useState('900000');

  type ComfyWorkflowNode = {
    inputs?: Record<string, unknown>;
    class_type?: string;
  };

  const validateComfyWorkflowMinimum = (workflow: unknown): string | null => {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
      return 'Workflow must be a JSON object in ComfyUI API format.';
    }
    const nodes = Object.values(workflow as Record<string, ComfyWorkflowNode>);
    if (nodes.length === 0) {
      return 'Workflow cannot be empty.';
    }
    const hasPromptNode = nodes.some(
      (node) => node.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string'
    );
    if (!hasPromptNode) {
      return 'Workflow missing CLIPTextEncode node with text input.';
    }
    const hasSeedNode = nodes.some(
      (node) => node.class_type === 'KSampler' && Boolean(node.inputs && 'seed' in node.inputs)
    );
    if (!hasSeedNode) {
      return 'Workflow missing KSampler node with seed input.';
    }
    const hasSaveNode = nodes.some((node) => node.class_type === 'SaveImage');
    if (!hasSaveNode) {
      return 'Workflow missing SaveImage node.';
    }
    return null;
  };

  const fetchOllamaModels = async () => {
    setIsFetchingModels(true);
    setFetchError(null);
    setOllamaModels([]);

    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to connect to Ollama server');
      
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        const modelNames = data.models.map((m: any) => m.name);
        setOllamaModels(modelNames);
        if (modelNames.length > 0 && !selectedLlmModel) {
          setSelectedLlmModel(modelNames[0]);
        }
      }
    } catch (err) {
      console.error(err);
      setFetchError('Could not fetch models. Check if Ollama is running and CORS is configured.');
      setOllamaModels(['llama3:latest', 'mistral:latest', 'gemma:2b']);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const selectLlmProvider = (provider: LLMProvider) => {
    setLlmProvider(provider);
    if (provider === 'gemini') {
      setOllamaUrl('https://generativelanguage.googleapis.com/v1beta');
      setSelectedLlmModel((current) =>
        current && !current.includes(':') && !current.startsWith('gpt-') ? current : 'gemini-2.0-flash'
      );
      return;
    }
    if (provider === 'openai') {
      setOllamaUrl('https://api.openai.com/v1');
      setSelectedLlmModel((current) =>
        current && !current.includes(':') && !current.startsWith('gemini-') ? current : 'gpt-4o-mini'
      );
      return;
    }
    setOllamaUrl('http://127.0.0.1:11434');
    setSelectedLlmModel((current) => current.includes(':') ? current : 'llama3.2:3b');
  };

  useEffect(() => {
    apiGet<{
      theme?: { family?: string; mode?: string };
      llm?: {
        provider?: LLMProvider;
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        apiKeys?: { gemini?: string; openai?: string };
        timeoutMs?: number;
      };
      comfy?: {
        baseUrl?: string;
        promptTimeoutMs?: number;
        generationTimeoutMs?: number;
        viewTimeoutMs?: number;
        masterPrompt?: string;
        workflowFile?: string;
        availableWorkflows?: string[];
      };
      tts?: { baseUrl?: string; timeoutUs?: number; language?: string; defaultVoiceId?: string };
      memory?: { idleUnloadMs?: number };
    }>('/settings')
      .then((data) => {
        if (data.llm?.provider) setLlmProvider(data.llm.provider);
        if (data.llm?.baseUrl) setOllamaUrl(data.llm.baseUrl);
        if (data.llm?.model) setSelectedLlmModel(data.llm.model);
        const provider = data.llm?.provider;
        setGeminiApiKey(data.llm?.apiKeys?.gemini ?? (provider === 'gemini' ? data.llm?.apiKey ?? '' : ''));
        setOpenAiApiKey(data.llm?.apiKeys?.openai ?? (provider === 'openai' ? data.llm?.apiKey ?? '' : ''));
        if (data.llm?.timeoutMs) setLlmTimeout(String(Math.round(data.llm.timeoutMs / 1000)));

        if (data.comfy?.baseUrl) setComfyUiUrl(data.comfy.baseUrl);
        if (data.comfy?.promptTimeoutMs) setComfyPromptTimeoutMs(String(data.comfy.promptTimeoutMs));
        if (data.comfy?.generationTimeoutMs) setComfyGenerationTimeoutMs(String(data.comfy.generationTimeoutMs));
        if (data.comfy?.viewTimeoutMs) setComfyViewTimeoutMs(String(data.comfy.viewTimeoutMs));
        if (data.comfy?.masterPrompt !== undefined && data.comfy?.masterPrompt !== null) {
          setComfyMasterPrompt(data.comfy.masterPrompt);
        }
        if (data.comfy?.workflowFile) {
          setComfyWorkflowFile(data.comfy.workflowFile);
        }
        if (Array.isArray(data.comfy?.availableWorkflows)) {
          setAvailableComfyWorkflows(data.comfy.availableWorkflows);
          if (!data.comfy?.workflowFile && data.comfy.availableWorkflows.length > 0) {
            setComfyWorkflowFile(data.comfy.availableWorkflows[0]);
          }
        }

        if (data.theme?.family && data.theme?.mode) {
          setTheme(`${data.theme.family}-${data.theme.mode}` as Theme);
        }
        if (data.tts?.baseUrl) setTtsUrl(data.tts.baseUrl);
        if (data.tts?.timeoutUs) setTtsTimeout(String(data.tts.timeoutUs));
        if (data.tts?.language) setTtsLanguage(data.tts.language);
        if (data.tts?.defaultVoiceId) setTtsDefaultVoice(data.tts.defaultVoiceId);
        if (data.memory?.idleUnloadMs !== undefined) setIdleUnloadMs(String(data.memory.idleUnloadMs));
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSettingsError(null);
    const promptMs = Number(comfyPromptTimeoutMs);
    const generationMs = Number(comfyGenerationTimeoutMs);
    const viewMs = Number(comfyViewTimeoutMs);
    const llmTimeoutMs = Number(llmTimeout) * 1000;
    const ttsTimeoutUsValue = Number(ttsTimeout);
    const idleUnloadMsValue = Number(idleUnloadMs);
    if (!Number.isFinite(promptMs) || promptMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy prompt timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(generationMs) || generationMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy generation timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(viewMs) || viewMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy view timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(llmTimeoutMs) || llmTimeoutMs <= 0) {
      setIsSaving(false);
      setSettingsError('LLM timeout must be a positive number.');
      return;
    }
    const activeApiKey = llmProvider === 'gemini' ? geminiApiKey.trim() : llmProvider === 'openai' ? openAiApiKey.trim() : 'ollama';
    if ((llmProvider === 'gemini' || llmProvider === 'openai') && !activeApiKey) {
      setIsSaving(false);
      setSettingsError(`${llmProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key is required.`);
      return;
    }
    if (!Number.isFinite(ttsTimeoutUsValue) || ttsTimeoutUsValue <= 0) {
      setIsSaving(false);
      setSettingsError('TTS timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(idleUnloadMsValue) || idleUnloadMsValue < 0) {
      setIsSaving(false);
      setSettingsError('Idle unload must be zero or a positive number.');
      return;
    }
    if (!comfyWorkflowFile.trim()) {
      setIsSaving(false);
      setSettingsError('Comfy workflow is required.');
      return;
    }
    try {
      await apiPatch('/settings', {
        theme: { family: currentFamily, mode: currentMode },
        llm: {
          provider: llmProvider,
          baseUrl: ollamaUrl,
          model: selectedLlmModel,
          apiKey: activeApiKey,
          apiKeys: {
            gemini: geminiApiKey.trim(),
            openai: openAiApiKey.trim()
          },
          timeoutMs: llmTimeoutMs
        },
        comfy: {
          baseUrl: comfyUiUrl,
          promptTimeoutMs: promptMs,
          generationTimeoutMs: generationMs,
          viewTimeoutMs: viewMs,
          masterPrompt: comfyMasterPrompt,
          workflowFile: comfyWorkflowFile
        },
        tts: {
          baseUrl: ttsUrl,
          timeoutUs: ttsTimeoutUsValue,
          language: ttsLanguage,
          defaultVoiceId: ttsDefaultVoice
        },
        memory: {
          idleUnloadMs: Math.trunc(idleUnloadMsValue)
        }
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSettingsError((err as Error).message ?? 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeSelect = (family: 'classic' | 'premium' | 'minimal', mode: 'light' | 'dark') => {
    const nextTheme = `${family}-${mode}` as Theme;
    setTheme(nextTheme);
  };

  const handleTestComfy = async () => {
    setIsTestingComfy(true);
    setComfyTestStatus('idle');
    setComfyTestMessage('');
    try {
      await apiPost('/integrations/comfyui/health', { baseUrl: comfyUiUrl });
      setComfyTestStatus('success');
      setComfyTestMessage('Connection successful.');
    } catch (err) {
      setComfyTestStatus('error');
      setComfyTestMessage((err as Error).message ?? 'Connection failed.');
    } finally {
      setIsTestingComfy(false);
    }
  };

  const handleImportComfyWorkflow = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setComfyImportStatus('idle');
    setComfyImportMessage('');
    setSettingsError(null);
    setIsImportingComfyWorkflow(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const validationError = validateComfyWorkflowMinimum(parsed);
      if (validationError) {
        throw new Error(validationError);
      }
      let response: { workflowFile: string; availableWorkflows: string[] };
      try {
        response = await apiPost<{ workflowFile: string; availableWorkflows: string[] }>(
          '/integrations/comfyui/workflows/import',
          { fileName: file.name, workflow: parsed }
        );
      } catch (err) {
        const message = (err as Error).message ?? 'Failed to import workflow.';
        const existsPrefix = 'Workflow already exists: ';
        if (!message.includes(existsPrefix)) {
          throw err;
        }
        const existingFileName = message.split(existsPrefix)[1]?.trim() || file.name;
        setOverwriteWorkflowTargetName(existingFileName);
        setPendingWorkflowOverwrite({ fileName: file.name, workflow: parsed });
        setIsOverwriteWorkflowConfirmOpen(true);
        return;
      }
      setAvailableComfyWorkflows(response.availableWorkflows ?? []);
      if (response.workflowFile) {
        setComfyWorkflowFile(response.workflowFile);
      }
      setComfyImportStatus('success');
      setComfyImportMessage(`Workflow imported: ${response.workflowFile}`);
    } catch (err) {
      setComfyImportStatus('error');
      setComfyImportMessage((err as Error).message ?? 'Failed to import workflow.');
    } finally {
      setIsImportingComfyWorkflow(false);
    }
  };

  const handleCancelOverwriteWorkflow = () => {
    setIsOverwriteWorkflowConfirmOpen(false);
    setOverwriteWorkflowTargetName('');
    setPendingWorkflowOverwrite(null);
  };

  const handleConfirmOverwriteWorkflow = async () => {
    if (!pendingWorkflowOverwrite) {
      handleCancelOverwriteWorkflow();
      return;
    }
    setIsImportingComfyWorkflow(true);
    setComfyImportStatus('idle');
    setComfyImportMessage('');
    try {
      const response = await apiPost<{ workflowFile: string; availableWorkflows: string[] }>(
        '/integrations/comfyui/workflows/import',
        {
          fileName: pendingWorkflowOverwrite.fileName,
          workflow: pendingWorkflowOverwrite.workflow,
          overwrite: true
        }
      );
      setAvailableComfyWorkflows(response.availableWorkflows ?? []);
      if (response.workflowFile) {
        setComfyWorkflowFile(response.workflowFile);
      }
      setComfyImportStatus('success');
      setComfyImportMessage(`Workflow imported: ${response.workflowFile}`);
      handleCancelOverwriteWorkflow();
    } catch (err) {
      setComfyImportStatus('error');
      setComfyImportMessage((err as Error).message ?? 'Failed to import workflow.');
    } finally {
      setIsImportingComfyWorkflow(false);
    }
  };

  const sections = [
    { id: 'appearance' as const, label: 'Appearance', hint: 'Themes & mode', icon: Monitor },
    { id: 'llm' as const, label: 'LLM', hint: 'Providers & models', icon: Cpu },
    { id: 'comfy' as const, label: 'ComfyUI', hint: 'Image generation', icon: Server },
    { id: 'tts' as const, label: 'TTS', hint: 'Voices & language', icon: Mic },
    { id: 'runtime' as const, label: 'Runtime', hint: 'Memory behavior', icon: SettingsIcon }
  ];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[5px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                <SettingsIcon size={18} />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">System Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Configure themes, AI providers, endpoints, and behaviors.</p>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 rounded-[5px] text-xs font-bold uppercase tracking-widest transition-all shadow-lg h-9 ${ saveSuccess ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20 active:scale-95' }`}
          >
            {isSaving ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 size={16} />
            ) : (
              <Save size={16} />
            )}
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-4">
              <div className="bg-card border border-border rounded-[5px] p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 pb-3">
                  Sections
                </div>
                <div className="space-y-1">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-[5px] transition-all border ${
                          isActive
                            ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20'
                            : 'border-transparent hover:border-border hover:bg-[hsl(var(--secondary))]/60 text-muted-foreground'
                        }`}
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={14} />
                          <span className="text-sm font-bold">{section.label}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest mt-1 opacity-70">{section.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[hsl(var(--secondary))]/50 border border-border rounded-[5px] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tip</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Changes are saved manually. Review each section and click Save when ready.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">

          {/* 1. Theme Configuration (NEW) */}
          {activeSection === 'appearance' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-[hsl(var(--secondary))]/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-500/10 rounded-[5px] text-purple-600 dark:text-purple-400">
                  <Monitor size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Appearance</h2>
                  <p className="text-xs text-muted-foreground">Theme family and display mode.</p>
                </div>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Mode: {currentMode === 'dark' ? 'Dark' : 'Light'}
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Interface Theme</label>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {(['classic', 'premium', 'minimal'] as const).map((family) => (
                    <div
                      key={family}
                      className={`rounded-[5px] border ${currentFamily === family ? 'border-orange-200 dark:border-orange-500/20' : 'border-border'} overflow-hidden bg-card`}
                    >
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <div className="font-bold text-sm text-foreground">
                          {family === 'classic' ? 'Classic' : family === 'premium' ? 'Premium Navy' : 'Minimal'}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme</div>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Light */}
                        <button
                          onClick={() => handleThemeSelect(family, 'light')}
                          className={`w-full text-left rounded-[5px] border transition-all overflow-hidden ${
                            currentFamily === family && currentMode === 'light'
                              ? 'border-orange-500 ring-2 ring-orange-500/20'
                              : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className={`aspect-[10/4] relative p-3 flex flex-col gap-2 ${family === 'minimal' ? 'bg-white' : family === 'premium' ? 'bg-[#eef2f7]' : 'bg-slate-50'}`}>
                            <div className="w-full h-2 bg-white rounded-full shadow-sm"></div>
                            <div className="flex gap-2 h-full">
                              <div className="w-1/4 h-full bg-white rounded-[5px] shadow-sm"></div>
                              <div className="w-3/4 h-full bg-white rounded-[5px] border border-slate-100 shadow-sm"></div>
                            </div>
                          </div>
                          <div className="px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Light
                            {currentFamily === family && currentMode === 'light' && (
                              <span className="text-orange-600">Selected</span>
                            )}
                          </div>
                        </button>

                        {/* Dark */}
                        <button
                          onClick={() => handleThemeSelect(family, 'dark')}
                          className={`w-full text-left rounded-[5px] border transition-all overflow-hidden ${
                            currentFamily === family && currentMode === 'dark'
                              ? 'border-orange-500 ring-2 ring-orange-500/20'
                              : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div
                            className={`aspect-[10/4] relative p-3 flex flex-col gap-2 ${
                              family === 'premium' ? 'bg-[#0b0e14]' : family === 'minimal' ? 'bg-[#0b0f19]' : 'bg-[#0b1020]'
                            }`}
                          >
                            <div className={`w-full h-2 rounded-full ${family === 'premium' ? 'bg-[#151a25]' : family === 'minimal' ? 'bg-[#0b0f19]' : 'bg-[#1c2540]'} ${family === 'minimal' ? 'border border-[#1f2937]' : ''}`}></div>
                            <div className="flex gap-2 h-full">
                              <div className={`w-1/4 h-full rounded-[5px] ${family === 'premium' ? 'bg-[#151a25]' : family === 'minimal' ? 'bg-[#0b0f19] border border-[#1f2937]' : 'bg-[#1c2540]'}`}></div>
                              <div className={`w-3/4 h-full rounded-[5px] border ${
                                family === 'premium'
                                  ? 'bg-[#151a25] border-[#2a3245]'
                                  : family === 'minimal'
                                  ? 'bg-[#0b0f19] border-[#1f2937]'
                                  : 'bg-[#1c2540] border-[#2a355a]'
                              }`}></div>
                            </div>
                          </div>
                          <div className="px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Dark
                            {currentFamily === family && currentMode === 'dark' && (
                              <span className="text-orange-600">Selected</span>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 2. LLM Configuration */}
          {activeSection === 'llm' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-[5px] text-indigo-600 dark:text-indigo-400">
                <Cpu size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">LLM Configuration</h2>
                <p className="text-xs text-muted-foreground">Provider, model, and timeout.</p>
              </div>
            </div>

            <div className="p-8 space-y-8">
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">AI Provider</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['ollama', 'gemini', 'openai'] as const).map((provider) => (
                    <div 
                      key={provider}
                      onClick={() => selectLlmProvider(provider)}
                      className={`cursor-pointer rounded-[5px] p-4 border-2 transition-all flex items-center gap-3 ${
                        llmProvider === provider 
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/5' 
                          : 'border-slate-100 dark:border-slate-800 hover:border-orange-500/30'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        llmProvider === provider ? 'border-orange-600' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {llmProvider === provider && <div className="w-2.5 h-2.5 rounded-full bg-orange-600" />}
                      </div>
                      <span className="font-bold capitalize text-slate-700 dark:text-slate-200">{provider}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Provider Specific Settings */}
              {llmProvider === 'ollama' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Server URL</label>
                      <input 
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:11434</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Seconds)</label>
                       <input 
                        type="number"
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                        value={llmTimeout}
                        onChange={(e) => setLlmTimeout(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[5px] border border-border">
                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Available Models</label>
                        <select 
                          className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                          value={selectedLlmModel}
                          onChange={(e) => setSelectedLlmModel(e.target.value)}
                          disabled={ollamaModels.length === 0}
                        >
                          {ollamaModels.length === 0 ? (
                            <option>No models loaded</option>
                          ) : (
                            ollamaModels.map(model => <option key={model} value={model}>{model}</option>)
                          )}
                        </select>
                      </div>
                      <button 
                        onClick={fetchOllamaModels}
                        disabled={isFetchingModels}
                        className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[5px] text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all disabled:opacity-50 h-9"
                      >
                        {isFetchingModels ? <RefreshCw size={16} className="animate-spin" /> : <Database size={16} />}
                        Fetch Models
                      </button>
                    </div>
                    {fetchError && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
                        <AlertCircle size={14} />
                        {fetchError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(llmProvider === 'gemini' || llmProvider === 'openai') && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Model</label>
                      <input
                        value={selectedLlmModel}
                        onChange={(e) => setSelectedLlmModel(e.target.value)}
                        placeholder={llmProvider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'}
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Seconds)</label>
                      <input
                        type="number"
                        value={llmTimeout}
                        onChange={(e) => setLlmTimeout(e.target.value)}
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API Base URL</label>
                    <input
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                        {llmProvider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
                      </label>
                      {llmProvider === 'gemini' && (
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 hover:text-orange-500 transition-colors"
                        >
                          Create Gemini API key
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    <input
                      type="password"
                      value={llmProvider === 'gemini' ? geminiApiKey : openAiApiKey}
                      onChange={(e) => {
                        if (llmProvider === 'gemini') {
                          setGeminiApiKey(e.target.value);
                        } else {
                          setOpenAiApiKey(e.target.value);
                        }
                      }}
                      placeholder={`Enter your ${llmProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API Key`}
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                    {llmProvider === 'gemini' && (
                      <p className="text-[10px] text-slate-400">
                        Opens Google AI Studio, where Gemini API keys are created and managed.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* 3. ComfyUI Configuration */}
          {activeSection === 'comfy' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-pink-100 dark:bg-pink-500/10 rounded-[5px] text-pink-600 dark:text-pink-400">
                <Server size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">ComfyUI Integration</h2>
                <p className="text-xs text-muted-foreground">Base URL, timeouts, and master prompt.</p>
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-6">
                {settingsError && (
                  <div className="flex items-center gap-2 text-xs text-red-500">
                    <AlertCircle size={14} />
                    {settingsError}
                  </div>
                )}
                <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ComfyUI URL</label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1 space-y-2">
                    <input 
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyUiUrl}
                      onChange={(e) => {
                        setComfyUiUrl(e.target.value);
                        if (comfyTestStatus !== 'idle') {
                          setComfyTestStatus('idle');
                          setComfyTestMessage('');
                        }
                      }}
                    />
                    <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:8188</p>
                  </div>
                  <div className="relative flex flex-col items-start">
                    {comfyTestStatus !== 'idle' && (
                      <div
                        className={`absolute -top-5 left-0 text-xs font-medium ${
                          comfyTestStatus === 'success' ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {comfyTestMessage}
                      </div>
                    )}
                    <button
                      onClick={handleTestComfy}
                      disabled={isTestingComfy}
                      className="px-6 h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-muted-foreground font-bold text-xs uppercase rounded-[5px] hover:text-orange-600 transition-all disabled:opacity-60"
                    >
                      {isTestingComfy ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Workflow</label>
                    <select
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyWorkflowFile}
                      onChange={(e) => setComfyWorkflowFile(e.target.value)}
                    >
                      {availableComfyWorkflows.length === 0 && (
                        <option value={comfyWorkflowFile}>{comfyWorkflowFile}</option>
                      )}
                      {availableComfyWorkflows.map((workflow) => (
                        <option key={workflow} value={workflow}>
                          {workflow}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">Workflow em formato API do ComfyUI (JSON).</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Import Workflow</label>
                    <div className="flex items-center gap-3">
                      <label className="px-4 h-9 inline-flex items-center bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-muted-foreground font-bold text-xs uppercase rounded-[5px] hover:text-orange-600 transition-all cursor-pointer">
                        {isImportingComfyWorkflow ? 'Importing...' : 'Import .json'}
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={handleImportComfyWorkflow}
                          disabled={isImportingComfyWorkflow}
                        />
                      </label>
                    </div>
                    {comfyImportStatus !== 'idle' && (
                      <p className={`text-xs ${comfyImportStatus === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {comfyImportMessage}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400">Valida: CLIPTextEncode(text), KSampler(seed) e SaveImage.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Prompt Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyPromptTimeoutMs}
                      onChange={(e) => setComfyPromptTimeoutMs(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Generation Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyGenerationTimeoutMs}
                      onChange={(e) => setComfyGenerationTimeoutMs(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">View Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyViewTimeoutMs}
                      onChange={(e) => setComfyViewTimeoutMs(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Master Prompt</label>
                  <textarea
                    rows={4}
                    className="w-full bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 py-2 text-sm outline-none focus:border-primary/40 transition-all text-foreground resize-y"
                    value={comfyMasterPrompt}
                    onChange={(e) => setComfyMasterPrompt(e.target.value)}
                    placeholder="Always prepended to image prompts (will be placed before the block prompt)."
                  />
                  <p className="text-[10px] text-slate-400">This text is concatenated before each block prompt when generating images.</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 4. TTS Configuration */}
          {activeSection === 'tts' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-[5px] text-emerald-600 dark:text-emerald-400">
                <Mic size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Text-to-Speech (TTS)</h2>
                <p className="text-xs text-muted-foreground">Endpoints, defaults, and language.</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API URL</label>
                  <input 
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    value={ttsUrl}
                    onChange={(e) => setTtsUrl(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:8020</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Microseconds)</label>
                  <input 
                    type="number"
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                    value={ttsTimeout}
                    onChange={(e) => setTtsTimeout(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Globe size={12} /> Default Language
                  </label>
                  <input 
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                    value={ttsLanguage}
                    onChange={(e) => setTtsLanguage(e.target.value)}
                    placeholder="e.g. pt"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Voice ID</label>
                  <input 
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                    value={ttsDefaultVoice}
                    onChange={(e) => setTtsDefaultVoice(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 5. Runtime Configuration */}
          {activeSection === 'runtime' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-[5px] text-amber-600 dark:text-amber-400">
                <SettingsIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Runtime Memory</h2>
                <p className="text-xs text-muted-foreground">Global memory behavior for model unload.</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Idle Unload (ms)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                  value={idleUnloadMs}
                  onChange={(e) => setIdleUnloadMs(e.target.value)}
                />
              </div>

              <div className="rounded-[5px] border border-border/70 p-4 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Defines how long the worker stays idle before unloading generation models from memory.
                </p>
                <p className="mt-2">
                  This setting is global: it applies to both image and TTS pipelines (when unload is supported by the active provider).
                </p>
                <p className="mt-2">
                  Use <strong>0</strong> to disable idle-based unload.
                </p>
                <p className="mt-2">
                  Quick conversion: <strong>1000 ms = 1 s</strong>.
                </p>
                <p className="mt-1">
                  Examples: 60000 ms = 60 s (1 min), 300000 ms = 300 s (5 min), 600000 ms = 600 s (10 min), 1200000 ms = 1200 s (20 min), 1800000 ms = 1800 s (30 min).
                </p>
              </div>
            </div>
          </div>
          )}

          </div>
        </div>
      </div>
      <ConfirmDialog
        open={isOverwriteWorkflowConfirmOpen}
        title="Sobrescrever workflow?"
        description={`Ja existe um workflow com o nome "${overwriteWorkflowTargetName}". Deseja substituir esse arquivo?`}
        confirmLabel="Sobrescrever"
        cancelLabel="Cancelar"
        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        onCancel={handleCancelOverwriteWorkflow}
        onConfirm={handleConfirmOverwriteWorkflow}
      />
    </div>
  );
};

export default Settings;
