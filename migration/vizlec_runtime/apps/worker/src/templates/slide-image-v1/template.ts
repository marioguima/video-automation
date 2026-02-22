type SlideImagePayload = {
  title: string;
  bullets: string[];
  imageUrl?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderImageSlideHtml(payload: SlideImagePayload): string {
  const title = escapeHtml(payload.title.trim());
  const bullets = payload.bullets
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const imageSrc = payload.imageUrl?.trim() ? escapeAttr(payload.imageUrl.trim()) : "";
  const imageTag = imageSrc
    ? `<img class="bg-photo" src="${imageSrc}" alt="" crossorigin="anonymous" />`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=swap");
      :root {
        --ink: #ffffff;
        --muted: rgba(255, 255, 255, 0.82);
        --accent: #fb923c;
        --scale: 5.7142857143; /* 1920 / 336 (preview inner width) */
      }
      * { box-sizing: border-box; }
      html, body {
        width: 1920px;
        height: 1080px;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: "Inter", "Segoe UI", "Helvetica Neue", "Arial", sans-serif;
        background: #000;
        overflow: hidden;
      }
      .canvas {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
      }
      .image {
        position: absolute;
        inset: 0;
        background-color: #0f172a;
        background-image: radial-gradient(1200px 900px at 20% 25%, #334155 0%, #0f172a 72%, #020617 100%);
        background-size: cover;
        background-position: center;
      }
      .bg-photo {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.7;
      }
      .overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 100%);
      }
      .content {
        position: absolute;
        inset: 0;
        padding: calc(24px * var(--scale));
        padding-right: calc(96px * var(--scale));
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        color: var(--ink);
        pointer-events: none;
        z-index: 2;
      }
      .title {
        margin: 0 0 calc(12px * var(--scale)) 0;
        font-size: calc(18px * var(--scale));
        font-weight: 700;
        line-height: 1.25;
        text-shadow: 0 8px 20px rgba(0, 0, 0, 0.42), 0 3px 8px rgba(0, 0, 0, 0.48);
      }
      .bullets {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: calc(6px * var(--scale));
      }
      .bullets li {
        font-size: calc(9px * var(--scale));
        line-height: 1.5;
        font-weight: 500;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: calc(8px * var(--scale));
        text-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      }
      .bullets li::before {
        content: "";
        width: calc(4px * var(--scale));
        height: calc(4px * var(--scale));
        border-radius: 999px;
        background: var(--accent);
        flex: 0 0 calc(4px * var(--scale));
      }
    </style>
  </head>
  <body>
    <section class="canvas">
      <div class="image"></div>
      ${imageTag}
      <div class="overlay"></div>
      <div class="content">
        <h1 class="title">${title || "Sem titulo"}</h1>
        <ul class="bullets">${bullets || "<li>Conteudo em preparo.</li>"}</ul>
      </div>
    </section>
  </body>
</html>`;
}
