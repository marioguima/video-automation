type SlideVisualPayload = {
  imageUrl?: string | null;
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderImageFocusSlideHtml(payload: SlideVisualPayload): string {
  const imageSrc = payload.imageUrl?.trim() ? escapeAttr(payload.imageUrl.trim()) : "";
  const imageTag = imageSrc
    ? `<img class="hero-photo" src="${imageSrc}" alt="" crossorigin="anonymous" />`
    : `<div class="hero-fallback" aria-hidden="true"></div>`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap");
      * { box-sizing: border-box; }
      html, body {
        width: 1920px;
        height: 1080px;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
        background: #111827;
        overflow: hidden;
      }
      .canvas {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background:
          radial-gradient(circle at top left, rgba(251, 146, 60, 0.22), transparent 28%),
          linear-gradient(135deg, #111827 0%, #0f172a 46%, #020617 100%);
      }
      .grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
        background-size: 80px 80px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), transparent 92%);
      }
      .hero {
        position: absolute;
        inset: 86px 110px 86px 420px;
        border-radius: 42px;
        overflow: hidden;
        box-shadow:
          0 40px 100px rgba(0, 0, 0, 0.46),
          0 0 0 1px rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }
      .hero-photo,
      .hero-fallback {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .hero-photo {
        object-fit: cover;
      }
      .hero-fallback {
        background:
          radial-gradient(circle at 30% 30%, rgba(125, 211, 252, 0.35), transparent 0 28%),
          radial-gradient(circle at 72% 62%, rgba(248, 113, 113, 0.26), transparent 0 26%),
          linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.24)),
          linear-gradient(90deg, rgba(15, 23, 42, 0.18), transparent 22%);
      }
      .accent-panel {
        position: absolute;
        inset: 150px auto 150px 110px;
        width: 230px;
        border-radius: 32px;
        background:
          linear-gradient(180deg, rgba(251, 146, 60, 0.18), rgba(251, 146, 60, 0.02)),
          rgba(255, 255, 255, 0.04);
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.06),
          0 24px 60px rgba(0, 0, 0, 0.25);
      }
      .accent-panel::before,
      .accent-panel::after {
        content: "";
        position: absolute;
        left: 36px;
        right: 36px;
        height: 2px;
        background: linear-gradient(90deg, rgba(251, 146, 60, 0), rgba(251, 146, 60, 0.85), rgba(251, 146, 60, 0));
      }
      .accent-panel::before {
        top: 86px;
      }
      .accent-panel::after {
        bottom: 86px;
      }
    </style>
  </head>
  <body>
    <section class="canvas">
      <div class="grid"></div>
      <div class="accent-panel"></div>
      <div class="hero">
        ${imageTag}
      </div>
    </section>
  </body>
</html>`;
}
