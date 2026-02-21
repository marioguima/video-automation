"use client";

import { useMemo, useState } from "react";
import { buildManifest, buildManifestFromFile } from "@/lib/api";
import { ManifestResponse } from "@/lib/types";
import { ManifestDashboard } from "@/components/ManifestDashboard";

const DEFAULT_EXAMPLE_PATH =
  "d:\\channels\\Dieta\\Videos\\V1-Cardio em Jejum Acelera ou Destrói Seu Metabolismo\\Cardio em Jejum Acelera ou Destrói Seu Metabolismo_.md";

export default function HomePage() {
  const [script, setScript] = useState("");
  const [maxVisualChars, setMaxVisualChars] = useState(320);
  const [maxTtsChars, setMaxTtsChars] = useState(200);
  const [examplePath, setExamplePath] = useState(DEFAULT_EXAMPLE_PATH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManifestResponse | null>(null);

  const statusText = useMemo(() => {
    if (loading) return "Processando...";
    if (error) return `Erro: ${error}`;
    if (!result) return "Aguardando manifesto";
    return result.validation.valid
      ? `OK: ${result.manifest.blocks.length} blocos`
      : `Falha: ${result.validation.errors.length} erros`;
  }, [loading, error, result]);

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
      const data = await buildManifestFromFile(examplePath);
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
        <h1>Video Automation Studio</h1>
        <p>Roteiro -> blocos visuais -> chunks TTS (<=200) com validação.</p>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <div className="fieldGrid">
            <label>
              Visual chars
              <input
                type="number"
                value={maxVisualChars}
                onChange={(e) => setMaxVisualChars(Number(e.target.value || 320))}
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
