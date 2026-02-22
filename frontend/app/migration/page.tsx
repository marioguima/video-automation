"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CompatBlock,
  CompatVideoVersion,
  createChannel,
  createVideo,
  ingestVideo,
  listChannels,
  listVideoVersionBlocks,
  listVideoVersions,
  listVideos,
  patchBlock,
} from "@/lib/migration-api";

const DEMO_SCRIPT =
  "Inteligencia artificial nao e magia. Ela funciona melhor quando recebe contexto claro. " +
  "Neste video vamos testar um fluxo de producao por blocos com revisao humana de texto narrado e prompt visual.";

function parseBlockPrompt(imagePromptJson?: string | null): string {
  if (!imagePromptJson) return "";
  try {
    const parsed = JSON.parse(imagePromptJson) as { block_prompt?: string };
    return parsed.block_prompt ?? "";
  } catch {
    return "";
  }
}

export default function MigrationPage() {
  const [channels, setChannels] = useState<Array<{ id: number; name: string }>>([]);
  const [videos, setVideos] = useState<Array<{ id: number; title: string; status: string }>>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [versions, setVersions] = useState<CompatVideoVersion[]>([]);
  const [blocks, setBlocks] = useState<CompatBlock[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { ttsText: string; imagePrompt: string }>>({});
  const [channelName, setChannelName] = useState("Canal Migracao");
  const [videoTitle, setVideoTitle] = useState("Video Migracao Kernel");
  const [scriptText, setScriptText] = useState(DEMO_SCRIPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Aguardando");

  const activeVersionId = versions[0]?.id ?? null;

  const readyBlocks = useMemo(
    () =>
      blocks.map((b) => ({
        ...b,
        draft: drafts[b.id] ?? { ttsText: b.ttsText, imagePrompt: parseBlockPrompt(b.imagePromptJson) },
      })),
    [blocks, drafts]
  );

  async function refreshChannels() {
    const data = await listChannels();
    setChannels(data.items);
    if (data.items.length && selectedChannelId == null) {
      setSelectedChannelId(data.items[0].id);
    }
  }

  async function refreshVideos(channelId: number) {
    const data = await listVideos(channelId);
    setVideos(data.items);
  }

  async function refreshVersionsAndBlocks(videoId: number) {
    const vv = await listVideoVersions(videoId);
    setVersions(vv);
    if (vv.length > 0) {
      const bb = await listVideoVersionBlocks(vv[0].id);
      setBlocks(bb);
      setDrafts(
        Object.fromEntries(
          bb.map((b) => [b.id, { ttsText: b.ttsText, imagePrompt: parseBlockPrompt(b.imagePromptJson) }])
        )
      );
    } else {
      setBlocks([]);
      setDrafts({});
    }
  }

  useEffect(() => {
    void refreshChannels().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (selectedChannelId == null) return;
    void refreshVideos(selectedChannelId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedChannelId]);

  useEffect(() => {
    if (selectedVideoId == null) return;
    void refreshVersionsAndBlocks(selectedVideoId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedVideoId]);

  async function handleCreateChannelAndVideo() {
    setBusy(true);
    setError(null);
    try {
      const ch = await createChannel({ name: `${channelName} ${Date.now()}`, language: "pt-BR" });
      setStatus(`Canal criado: ${ch.name}`);
      setSelectedChannelId(ch.id);
      const vid = await createVideo({
        channel_id: ch.id,
        title: `${videoTitle} ${Date.now()}`,
        script_text: scriptText,
      });
      setStatus(`Video criado: ${vid.title}`);
      setSelectedVideoId(vid.id);
      await refreshVideos(ch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar canal/video");
    } finally {
      setBusy(false);
    }
  }

  async function handleIngest() {
    if (!selectedVideoId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ingestVideo(selectedVideoId);
      setStatus(`Blocos gerados: ${result.blocks_count}`);
      await refreshVersionsAndBlocks(selectedVideoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao segmentar");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBlock(blockId: string) {
    const draft = drafts[blockId];
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchBlock(blockId, {
        ttsText: draft.ttsText,
        imagePrompt: { block_prompt: draft.imagePrompt },
      });
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? updated : b)));
      setStatus(`Bloco ${blockId} salvo`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar bloco");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Migration Kernel Probe</h1>
      <p style={{ opacity: 0.8 }}>
        Teste de migracao do kernel ("vizlec" {"->"} "channel/video") sem "on-screen" no MVP.
      </p>

      <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Nome do canal" />
          <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Titulo do video" />
        </div>
        <textarea
          rows={4}
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder="Roteiro"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCreateChannelAndVideo} disabled={busy}>Criar canal + video</button>
          <button onClick={handleIngest} disabled={busy || !selectedVideoId}>Gerar blocos (segment)</button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label>
            Canal:
            <select
              value={selectedChannelId ?? ""}
              onChange={(e) => setSelectedChannelId(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            >
              <option value="">--</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Video:
            <select
              value={selectedVideoId ?? ""}
              onChange={(e) => setSelectedVideoId(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            >
              <option value="">--</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} - {v.title} ({v.status})
                </option>
              ))}
            </select>
          </label>
          <span>VideoVersion compat: {activeVersionId ?? "-"}</span>
        </div>
        <div>Status: {status}</div>
        {error ? <div style={{ color: "crimson" }}>Erro: {error}</div> : null}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        {readyBlocks.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Nenhum bloco carregado.</div>
        ) : (
          readyBlocks.map((block) => (
            <article key={block.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
              <header>
                <strong>Bloco {block.index}</strong> <span style={{ opacity: 0.7 }}>id={block.id}</span>
              </header>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Texto fonte</div>
                <div>{block.sourceText}</div>
              </div>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Texto narrado (TTS)</span>
                <textarea
                  rows={3}
                  value={block.draft.ttsText}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [block.id]: { ...block.draft, ttsText: e.target.value } }))
                  }
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Prompt de imagem</span>
                <textarea
                  rows={2}
                  value={block.draft.imagePrompt}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [block.id]: { ...block.draft, imagePrompt: e.target.value } }))
                  }
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => void handleSaveBlock(block.id)} disabled={busy}>
                  Salvar bloco
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
