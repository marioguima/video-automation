
import React, { useState } from 'react';
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
  Moon,
  Sun
} from 'lucide-react';
import { Theme } from '../types';

type LLMProvider = 'ollama' | 'gemini' | 'openai';

interface SettingsProps {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const Settings: React.FC<SettingsProps> = ({ currentTheme, setTheme }) => {
  // General State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // LLM State
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedLlmModel, setSelectedLlmModel] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [llmTimeout, setLlmTimeout] = useState('600'); // Seconds

  // ComfyUI State
  const [comfyUiUrl, setComfyUiUrl] = useState('http://127.0.0.1:8188');

  // TTS State
  const [ttsUrl, setTtsUrl] = useState('http://127.0.0.1:8020');
  const [ttsTimeout, setTtsTimeout] = useState('5000000'); // Microseconds
  const [ttsLanguage, setTtsLanguage] = useState('pt');
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState('cohesive-pt-santiago-22050hz');

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

  const handleSave = () => {
    setIsSaving(true);
    // Simulating API save
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1000);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <SettingsIcon className="text-slate-400" />
              System Settings
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-9">Configure themes, AI providers, endpoints, and behaviors.</p>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-widest transition-all shadow-lg ${
              saveSuccess 
                ? 'bg-green-500 text-white shadow-green-500/20' 
                : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20 active:scale-95'
            }`}
          >
            {isSaving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 size={18} />
            ) : (
              <Save size={18} />
            )}
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-8">

          {/* 1. Theme Configuration (NEW) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-purple-100 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400">
                <Monitor size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Appearance</h2>
            </div>

            <div className="p-8">
              <div className="space-y-4">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Interface Theme</label>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Light Theme Option */}
                    <button 
                      onClick={() => setTheme('light')}
                      className={`relative group rounded-xl border-2 overflow-hidden transition-all text-left ${currentTheme === 'light' ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                       <div className="aspect-video bg-slate-50 relative p-4 flex flex-col gap-2">
                          <div className="w-full h-2 bg-white rounded-full shadow-sm"></div>
                          <div className="flex gap-2 h-full">
                             <div className="w-1/4 h-full bg-white rounded-md shadow-sm"></div>
                             <div className="w-3/4 h-full bg-white rounded-md shadow-sm border border-slate-100"></div>
                          </div>
                          {currentTheme === 'light' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-orange-500/10 backdrop-blur-[1px]">
                                <div className="bg-orange-500 text-white rounded-full p-1.5 shadow-lg">
                                  <CheckCircle2 size={20} />
                                </div>
                             </div>
                          )}
                       </div>
                       <div className="p-3 bg-white dark:bg-slate-900">
                          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-sm">
                             <Sun size={14} /> Light Mode
                          </div>
                       </div>
                    </button>

                    {/* Slate Dark Theme Option */}
                    <button 
                      onClick={() => setTheme('dark')}
                      className={`relative group rounded-xl border-2 overflow-hidden transition-all text-left ${currentTheme === 'dark' ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                       <div className="aspect-video bg-[#0f172a] relative p-4 flex flex-col gap-2">
                          <div className="w-full h-2 bg-[#1e293b] rounded-full"></div>
                          <div className="flex gap-2 h-full">
                             <div className="w-1/4 h-full bg-[#1e293b] rounded-md"></div>
                             <div className="w-3/4 h-full bg-[#1e293b] rounded-md border border-[#334155]"></div>
                          </div>
                          {currentTheme === 'dark' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-orange-500/10 backdrop-blur-[1px]">
                                <div className="bg-orange-500 text-white rounded-full p-1.5 shadow-lg">
                                  <CheckCircle2 size={20} />
                                </div>
                             </div>
                          )}
                       </div>
                       <div className="p-3 bg-white dark:bg-slate-900">
                          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-sm">
                             <Moon size={14} /> Classic Dark
                          </div>
                       </div>
                    </button>

                    {/* Premium Navy Theme Option */}
                    <button 
                      onClick={() => setTheme('navy')}
                      className={`relative group rounded-xl border-2 overflow-hidden transition-all text-left ${currentTheme === 'navy' ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                       <div className="aspect-video bg-[#0B0E14] relative p-4 flex flex-col gap-2">
                          <div className="w-full h-2 bg-[#151A25] rounded-full"></div>
                          <div className="flex gap-2 h-full">
                             <div className="w-1/4 h-full bg-[#151A25] rounded-md"></div>
                             <div className="w-3/4 h-full bg-[#151A25] rounded-md border border-[#2A3245]"></div>
                          </div>
                          {currentTheme === 'navy' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-orange-500/10 backdrop-blur-[1px]">
                                <div className="bg-orange-500 text-white rounded-full p-1.5 shadow-lg">
                                  <CheckCircle2 size={20} />
                                </div>
                             </div>
                          )}
                       </div>
                       <div className="p-3 bg-white dark:bg-slate-900">
                          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-sm">
                             <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-blue-900 to-slate-900 border border-white/20"></div> 
                             Premium Navy
                          </div>
                       </div>
                    </button>
                 </div>
              </div>
            </div>
          </div>

          {/* 2. LLM Configuration */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Cpu size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">LLM Configuration</h2>
            </div>

            <div className="p-8 space-y-8">
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">AI Provider</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['ollama', 'gemini', 'openai'] as const).map((provider) => (
                    <div 
                      key={provider}
                      onClick={() => setLlmProvider(provider)}
                      className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex items-center gap-3 ${
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
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-mono outline-none focus:border-orange-500 transition-all dark:text-white"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:11434</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Seconds)</label>
                       <input 
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                        value={llmTimeout}
                        onChange={(e) => setLlmTimeout(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Available Models</label>
                        <select 
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
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
                        className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all disabled:opacity-50"
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
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API Key</label>
                    <input 
                      type="password"
                      placeholder={`Enter your ${llmProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API Key`}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-mono outline-none focus:border-orange-500 transition-all dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. ComfyUI Configuration */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-pink-100 dark:bg-pink-500/10 rounded-lg text-pink-600 dark:text-pink-400">
                <Server size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">ComfyUI Integration</h2>
            </div>

            <div className="p-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ComfyUI URL</label>
                <div className="flex gap-4">
                  <input 
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-mono outline-none focus:border-orange-500 transition-all dark:text-white"
                    value={comfyUiUrl}
                    onChange={(e) => setComfyUiUrl(e.target.value)}
                  />
                  <button className="px-6 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                    Test Connection
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:8188</p>
              </div>
            </div>
          </div>

          {/* 4. TTS Configuration */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Mic size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Text-to-Speech (TTS)</h2>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API URL</label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm font-mono outline-none focus:border-orange-500 transition-all dark:text-white"
                    value={ttsUrl}
                    onChange={(e) => setTtsUrl(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:8020</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Microseconds)</label>
                  <input 
                    type="number"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                    value={ttsTimeout}
                    onChange={(e) => setTtsTimeout(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Globe size={12} /> Default Language
                  </label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                    value={ttsLanguage}
                    onChange={(e) => setTtsLanguage(e.target.value)}
                    placeholder="e.g. pt"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Voice ID</label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                    value={ttsDefaultVoice}
                    onChange={(e) => setTtsDefaultVoice(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;
