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

export function renderImageCleanSlideHtml(payload: SlideVisualPayload): string {
  const imageSrc = payload.imageUrl?.trim() ? escapeAttr(payload.imageUrl.trim()) : "";
  const imageTag = imageSrc
    ? `<img class="bg-photo" src="${imageSrc}" alt="" crossorigin="anonymous" />`
    : `<div class="fallback-glow" aria-hidden="true"></div>`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;700&display=swap");
      * { box-sizing: border-box; }
      html, body {
        width: 1920px;
        height: 1080px;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: "Manrope", "Segoe UI", sans-serif;
        background: #050816;
        overflow: hidden;
      }
      .canvas {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background:
          radial-gradient(circle at 16% 20%, rgba(59, 130, 246, 0.35), transparent 26%),
          radial-gradient(circle at 82% 18%, rgba(244, 114, 182, 0.22), transparent 24%),
          linear-gradient(160deg, #020617 0%, #0f172a 52%, #111827 100%);
      }
      .bg-photo {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.04) contrast(1.02);
      }
      .fallback-glow {
        position: absolute;
        inset: 10%;
        border-radius: 48px;
        background:
          radial-gradient(circle at 30% 30%, rgba(125, 211, 252, 0.35), transparent 0 32%),
          radial-gradient(circle at 70% 65%, rgba(249, 115, 22, 0.3), transparent 0 26%),
          linear-gradient(135deg, rgba(15, 23, 42, 0.2), rgba(30, 41, 59, 0.5));
        filter: blur(28px);
      }
      .vignette {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at center, transparent 38%, rgba(2, 6, 23, 0.28) 72%, rgba(2, 6, 23, 0.78) 100%),
          linear-gradient(180deg, rgba(2, 6, 23, 0.16) 0%, rgba(2, 6, 23, 0.4) 100%);
      }
      .frame {
        position: absolute;
        inset: 32px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 32px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      }
    </style>
  </head>
  <body>
    <section class="canvas">
      ${imageTag}
      <div class="vignette"></div>
      <div class="frame"></div>
    </section>
  </body>
</html>`;
}
