"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  buildManifest,
  buildManifestFromFile,
  getSystemSettings,
  LlmProvider,
  updateSystemSettings,
} from "@/lib/api";
import { ManifestResponse } from "@/lib/types";
import { ManifestDashboard } from "@/components/ManifestDashboard";

const DEFAULT_EXAMPLE_PATH =
  "d:\\channels\\Dieta\\Videos\\V1-Cardio em Jejum Acelera ou Destrói Seu Metabolismo\\Cardio em Jejum Acelera ou Destrói Seu Metabolismo_.md";

export default function HomePage() {
  const [script, setScript] = useState("");
  const [maxVisualChars, setMaxVisualChars] = useState(0);
  const [maxTtsChars, setMaxTtsChars] = useState(200);
  const [splitMode, setSplitMode] = useState<"length" | "topic">("topic");
  const [topicMinChars, setTopicMinChars] = useState(120);
  const [topicSimilarityThreshold, setTopicSimilarityThreshold] = useState(0.16);
  const [examplePath, setExamplePath] = useState(DEFAULT_EXAMPLE_PATH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManifestResponse | null>(null);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("ollama");
  const [llmBaseUrl, setLlmBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [llmModel, setLlmModel] = useState("qwen2.5:7b");
  const [llmApiKey, setLlmApiKey] = useState("ollama");
  const [llmTimeoutSec, setLlmTimeoutSec] = useState(120);
  const [settingsStatus, setSettingsStatus] = useState("Config carregando...");

  const statusText = useMemo(() => {
    if (loading) return "Processando...";
    if (error) return `Erro: ${error}`;
    if (!result) return "Aguardando manifesto";
    return result.validation.valid
      ? `OK: ${result.manifest.blocks.length} blocos`
      : `Falha: ${result.validation.errors.length} erros`;
  }, [loading, error, result]);

  useEffect(() => {
    void getSystemSettings()
      .then((settings) => {
        setLlmProvider(settings.llm.provider);
        setLlmBaseUrl(settings.llm.base_url);
        setLlmModel(settings.llm.model);
        setLlmApiKey(settings.llm.api_key);
        setLlmTimeoutSec(settings.llm.timeout_sec);
        setSettingsStatus("Config pronta");
      })
      .catch((err) => setSettingsStatus(err instanceof Error ? err.message : "Falha ao carregar config"));
  }, []);

  function selectProvider(provider: LlmProvider) {
    setLlmProvider(provider);
    if (provider === "gemini") {
      setLlmBaseUrl("https://generativelanguage.googleapis.com/v1beta");
      setLlmModel((current) => (current && !current.includes(":") ? current : "gemini-2.0-flash"));
      if (llmApiKey === "ollama") setLlmApiKey("");
      return;
    }
    if (provider === "openai") {
      setLlmBaseUrl("https://api.openai.com/v1");
      setLlmModel((current) => (current && !current.includes(":") ? current : "gpt-4o-mini"));
      if (llmApiKey === "ollama") setLlmApiKey("");
      return;
    }
    setLlmBaseUrl("http://127.0.0.1:11434/v1");
    setLlmModel((current) => (current.includes(":") ? current : "qwen2.5:7b"));
    setLlmApiKey((current) => current || "ollama");
  }

  async function handleSaveSettings() {
    if ((llmProvider === "gemini" || llmProvider === "openai") && !llmApiKey.trim()) {
      setSettingsStatus(`${llmProvider === "gemini" ? "Gemini" : "OpenAI"} exige API key.`);
      return;
    }
    setSettingsStatus("Salvando...");
    try {
      const settings = await updateSystemSettings({
        llm: {
          provider: llmProvider,
          base_url: llmBaseUrl,
          model: llmModel,
          api_key: llmApiKey,
          timeout_sec: llmTimeoutSec,
        },
      });
      setLlmProvider(settings.llm.provider);
      setLlmBaseUrl(settings.llm.base_url);
      setLlmModel(settings.llm.model);
      setLlmApiKey(settings.llm.api_key);
      setLlmTimeoutSec(settings.llm.timeout_sec);
      setSettingsStatus(`LLM ativa: ${settings.llm.provider} / ${settings.llm.model}`);
    } catch (err) {
      setSettingsStatus(err instanceof Error ? err.message : "Erro ao salvar config");
    }
  }

  async function handleGenerate() {
    if (!script.trim()) {
      setError("Cole um roteiro ou carregue de arquivo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await buildManifest({
        script,
        max_visual_chars: maxVisualChars,
        max_tts_chars: maxTtsChars,
        split_mode: splitMode,
        topic_min_chars: topicMinChars,
        topic_similarity_threshold: topicSimilarityThreshold,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadExample() {
    setLoading(true);
    setError(null);
    try {
      const data = await buildManifestFromFile({
        path: examplePath,
        split_mode: splitMode,
        topic_min_chars: topicMinChars,
        topic_similarity_threshold: topicSimilarityThreshold,
      });
      setScript(data.manifest.script);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="topBar">
        <h1 className="srOnly">Video Automation Studio</h1>
        <div className="brand">
          <Image
            src="/logo-light.png"
            alt="Video Automation"
            width={320}
            height={358}
            className="brandLogo brandLight"
            priority
          />
          <Image
            src="/logo-dark.png"
            alt="Video Automation"
            width={319}
            height={357}
            className="brandLogo brandDark"
            priority
          />
          <Image
            src="/wordmark-light.png"
            alt="Video Automation Studio"
            width={744}
            height={358}
            className="brandWordmark brandLight"
            priority
          />
          <Image
            src="/wordmark-dark.png"
            alt="Video Automation Studio"
            width={744}
            height={357}
            className="brandWordmark brandDark"
            priority
          />
        </div>
        <p>Roteiro {"->"} blocos visuais {"->"} chunks TTS (&lt;=200) com validação.</p>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <section className="settingsBox" aria-label="System Settings">
            <div className="settingsHeader">
              <strong>System Settings</strong>
              <span>{settingsStatus}</span>
            </div>
            <div className="providerTabs">
              {(["ollama", "gemini", "openai"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={llmProvider === provider ? "providerActive" : "secondary"}
                  onClick={() => selectProvider(provider)}
                >
                  {provider}
                </button>
              ))}
            </div>
            <label>
              Modelo
              <input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
            </label>
            <label>
              Base URL
              <input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
            </label>
            {(llmProvider === "gemini" || llmProvider === "openai") ? (
              <label>
                API key
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={llmProvider === "gemini" ? "Google Gemini API key" : "OpenAI API key"}
                />
              </label>
            ) : null}
            <label>
              Timeout (s)
              <input
                type="number"
                min={1}
                value={llmTimeoutSec}
                onChange={(e) => setLlmTimeoutSec(Number(e.target.value || 120))}
              />
            </label>
            <button type="button" onClick={handleSaveSettings}>
              Salvar LLM
            </button>
          </section>

          <div className="fieldGrid">
            <label>
              Visual chars
              <input
                type="number"
                value={maxVisualChars}
                onChange={(e) => setMaxVisualChars(Number(e.target.value || 0))}
              />
            </label>
            <label>
              TTS chars
              <input
                type="number"
                value={maxTtsChars}
                onChange={(e) => setMaxTtsChars(Number(e.target.value || 200))}
              />
            </label>
            <label>
              Split mode
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as "length" | "topic")}
              >
                <option value="topic">topic</option>
                <option value="length">length</option>
              </select>
            </label>
            <label>
              Topic min chars
              <input
                type="number"
                value={topicMinChars}
                onChange={(e) => setTopicMinChars(Number(e.target.value || 120))}
              />
            </label>
            <label>
              Topic threshold
              <input
                type="number"
                step="0.01"
                value={topicSimilarityThreshold}
                onChange={(e) => setTopicSimilarityThreshold(Number(e.target.value || 0.16))}
              />
            </label>
          </div>

          <label>
            Caminho do roteiro
            <input
              value={examplePath}
              onChange={(e) => setExamplePath(e.target.value)}
              placeholder="d:\\...\\roteiro.md"
            />
          </label>

          <div className="buttonRow">
            <button onClick={handleGenerate} disabled={loading}>
              Gerar Manifesto
            </button>
            <button className="secondary" onClick={handleLoadExample} disabled={loading}>
              Carregar Arquivo
            </button>
          </div>

          <label>
            Roteiro
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Cole aqui seu roteiro markdown/texto"
            />
          </label>
          <small>
            Dica: em <strong>topic</strong>, use Visual chars = <strong>0</strong> para dividir so por semelhanca.
            O limite de 200 e aplicado apenas nos chunks de TTS.
          </small>
        </aside>

        <section className="panel viewer">
          <div className="status">{statusText}</div>
          {result ? (
            <ManifestDashboard manifest={result.manifest} validation={result.validation} />
          ) : (
            <div className="emptyState">Gere um manifesto para visualizar os blocos.</div>
          )}
        </section>
      </section>
    </main>
  );
}
