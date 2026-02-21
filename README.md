# Video Automation

Pipeline local para:

- transformar roteiro em blocos validados (`script_pipeline.py`)
- gerar manifesto JSON para front-end/orquestração
- montar vídeo com FFmpeg (`main.py`, `effects.py`, `transitions.py`, `audio.py`)
- testar em UI local (`studio_server.py`)

## Requisitos

- Windows, macOS ou Linux
- Python 3.11+ (testado com 3.13)
- FFmpeg no `PATH`

Verificar:

```powershell
python --version
ffmpeg -version
```

## Estrutura

- `main.py`: montagem de vídeo (clips + xfade + overlays opcionais + áudio)
- `script_pipeline.py`: parser de roteiro, divisão em blocos, chunk TTS e validação
- `studio_server.py`: servidor HTTP local com API + página web
- `web/index.html`: interface de teste local
- `output/`: saída de testes e manifestos

## Ambiente virtual

Use apenas um dos métodos abaixo.

### Opção A: uv

```powershell
uv venv .venv
.venv\Scripts\Activate.ps1
uv pip install --upgrade pip
```

### Opção B: Poetry

```powershell
poetry init -n
poetry env use python
poetry shell
```

### Opção C: Python (.venv padrão)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Observação: atualmente o projeto usa só biblioteca padrão Python; não há dependências obrigatórias de `pip`.

## Como subir local

### 1) Studio web (recomendado para validar roteiro e manifesto)

```powershell
python studio_server.py 127.0.0.1 8765
```

Abrir no navegador:

- `http://127.0.0.1:8765`

Endpoints:

- `GET /api/health`
- `POST /api/manifest`
- `POST /api/manifest/from-file`

### 2) Gerar manifesto por script (sem UI)

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

### 3) Render de vídeo (exemplo mínimo)

```powershell
@'
from main import create_video_pipeline

out = create_video_pipeline(
    media_files=[
        "output/test_assets/scene1.jpg",
        "output/test_assets/scene2.jpg",
    ],
    durations=[3.0, 3.0],
    output="output/test_render.mp4",
    transition="fade",
    transition_duration=0.8,
)
print(out)
'@ | python -
```

## Transições overlay (`assets/transitions`)

- Arquivos `.mov` em `assets/transitions` são opcionais.
- Só são usados quando você aplica overlay (`apply_overlay_transition`).
- Se estiverem vazios/fake, o pipeline base com `xfade` continua funcionando normalmente.

## Troubleshooting

- Erro de porta (ex.: `WinError 10013`):
  - rode em outra porta, por exemplo:
  - `python studio_server.py 127.0.0.1 8766`

- `ffmpeg` não encontrado:
  - instale FFmpeg e garanta que o executável está no `PATH`.

- Arquivo de mídia não encontrado:
  - confira caminhos absolutos/relativos passados para `create_video_pipeline(...)`.

## Próximos passos

- integrar LLM em 2 passadas (segmentação -> validação -> prompt de imagem)
- integrar TTS real e substituir durações estimadas por durações reais (`ffprobe`)
- conectar manifesto ao front-end definitivo (edição manual de blocos/prompts/timeline)
