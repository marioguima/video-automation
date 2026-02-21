"use client";

import { Manifest, Validation } from "@/lib/types";

type Props = {
  manifest: Manifest;
  validation: Validation;
};

function sumDuration(manifest: Manifest): number {
  return Number(
    manifest.blocks
      .reduce((acc, block) => acc + block.estimated_duration_sec, 0)
      .toFixed(2)
  );
}

export function ManifestDashboard({ manifest, validation }: Props) {
  const totalDuration = sumDuration(manifest);

  return (
    <section className="panel">
      <div className="metrics">
        <article>
          <h3>Paragraphs</h3>
          <p>{manifest.paragraphs.length}</p>
        </article>
        <article>
          <h3>Blocks</h3>
          <p>{manifest.blocks.length}</p>
        </article>
        <article>
          <h3>Est. Duration</h3>
          <p>{totalDuration}s</p>
        </article>
        <article>
          <h3>Validation</h3>
          <p>{validation.valid ? "OK" : `${validation.errors.length} errors`}</p>
        </article>
      </div>

      {!validation.valid && (
        <div className="errors">
          {validation.errors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      )}

      <div className="blockList">
        {manifest.blocks.map((block) => (
          <article className="blockCard" key={block.block_id}>
            <header>
              <strong>{block.block_id}</strong>
              <span>{block.estimated_duration_sec}s</span>
            </header>
            <p>{block.source_text}</p>
            <footer>
              <span>
                span: {block.source_span.start}-{block.source_span.end}
              </span>
              <span>tts chunks: {block.tts_chunks.length}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
