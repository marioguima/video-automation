# Video Automation Studio - Quickstart

## 1) Build manifest from a script file

```powershell
@'
from script_pipeline import load_script_file, build_manifest, validate_manifest, save_manifest

path = r"d:\channels\Dieta\Videos\V1-Cardio em Jejum Acelera ou Destrói Seu Metabolismo\Cardio em Jejum Acelera ou Destrói Seu Metabolismo_.md"
script = load_script_file(path)
manifest = build_manifest(script_text=script, max_visual_chars=320, max_tts_chars=200)
validation = validate_manifest(manifest)
print(validation)
save_manifest(manifest, "output/manifest.json")
'@ | python -
```

## 2) Run local studio (web)

```powershell
python studio_server.py 127.0.0.1 8765
```

Open:

`http://127.0.0.1:8765`

## 3) API endpoints

- `GET /api/health`
- `POST /api/manifest`
- `POST /api/manifest/from-file`

Example request:

```json
{
  "script": "Seu roteiro em markdown ou texto puro",
  "max_visual_chars": 320,
  "max_tts_chars": 200
}
```

## 4) Output contract

The manifest includes:

- `paragraphs[]`
- `blocks[].source_text`
- `blocks[].source_span` (offsets in the paragraph)
- `blocks[].tts_chunks[]` (<= `max_tts_chars`)
- `blocks[].estimated_duration_sec`

This contract is stable for integrating with image generation, TTS rendering, and final video assembly.
