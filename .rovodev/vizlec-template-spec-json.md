# VizLec Prompt — Template Spec (HTML/CSS Slide Theme) [JSON]

Você é um designer de sistemas + engenheiro front-end. Defina um **template de slides** para vídeo-aulas (texto sobre imagem), pensado para renderização **HTML/CSS → PNG** via Playwright.
Retorne **apenas JSON válido**.

## Objetivo
Criar um template "clean premium" para 1920x1080, com roadmap para 4K, garantindo legibilidade (sobre qualquer imagem de fundo), safe margins e consistência visual.

## Requisitos
- Resolução base: 1920x1080.
- Deve prever modo 4K (3840x2160) escalando corretamente.
- Usar safe margins (padding) e grid.
- Componentes do slide:
  - background image (cover)
  - overlay para legibilidade (gradient/blur/dim)
  - title
  - bullets (2–5)
  - footer opcional (ex.: curso/módulo)
- Tipografia:
  - definir font stack e tamanhos (em px) para 1080p
  - limites: title max 8 palavras, bullet max 10 palavras
- Acessibilidade/legibilidade:
  - contraste mínimo, line-height, espaçamento
  - evitar texto encostado nas bordas

## Output JSON
{
  "template": {
    "name": "string",
    "version": "string",
    "aspect_ratio": "16:9",
    "base_resolution": {"width": 1920, "height": 1080},
    "safe_margins_px": {"top": 0, "right": 0, "bottom": 0, "left": 0},
    "grid": {
      "columns": 12,
      "gutter_px": 0,
      "max_content_width_px": 0
    }
  },
  "typography": {
    "font_family": "string",
    "fallbacks": ["string"],
    "title": {"font_size_px": 0, "font_weight": 0, "line_height": 0},
    "bullet": {"font_size_px": 0, "font_weight": 0, "line_height": 0},
    "footer": {"font_size_px": 0, "font_weight": 0, "line_height": 0}
  },
  "colors": {
    "text": "#RRGGBB",
    "muted_text": "#RRGGBB",
    "overlay": {
      "type": "gradient|solid|blur",
      "css": "string"
    }
  },
  "layout": {
    "title_area": {"x": 0, "y": 0, "width": 0, "height": 0},
    "bullets_area": {"x": 0, "y": 0, "width": 0, "height": 0},
    "footer_area": {"x": 0, "y": 0, "width": 0, "height": 0}
  },
  "css_tokens": {
    "--safe-top": "string",
    "--safe-right": "string",
    "--safe-bottom": "string",
    "--safe-left": "string",
    "--title-size": "string",
    "--bullet-size": "string",
    "--overlay": "string"
  },
  "html_contract": {
    "data_model": {
      "title": "string",
      "bullets": ["string"],
      "footer": "string|null",
      "background_image_url": "string"
    },
    "dom_ids": {
      "root": "string",
      "bg": "string",
      "overlay": "string",
      "title": "string",
      "bullets": "string",
      "footer": "string"
    }
  },
  "rendering_notes": ["string"],
  "roadmap_4k": {
    "approach": "string",
    "changes": ["string"]
  }
}

## Input
Template style hint (optional):
{{STYLE_HINT}}
