# Video Automation

Projeto dividido em 2 partes:

- `backend/`: API, segmentacao do roteiro e render de video (FFmpeg)
- `frontend/`: app Next.js para operar e visualizar o manifesto

## Requisitos

- Python 3.11+
- FFmpeg no `PATH`
- Node.js 20+ (para o front)

Verifique:

```powershell
python --version
ffmpeg -version
node --version
npm --version
```

## Estrutura

- `backend/studio_server.py`: runner do servidor FastAPI (uvicorn)
- `backend/api.py`: rotas HTTP da API
- `backend/project_store.py`: persistencia SQLite (canal, video, blocos, assets, jobs)
- `backend/script_pipeline.py`: parser + divisao em blocos + validacao
- `backend/main.py`: montagem de video (xfade, overlays opcionais, audio)
- `backend/effects.py`: Ken Burns
- `backend/transitions.py`: transicoes FFmpeg
- `backend/audio.py`: mux de audio
- `frontend/`: UI Next.js
- `assets/`: arquivos de midia base
- `output/`: saidas geradas

## Ambiente Python (escolha 1 opcao)

### Opcao A: uv

```powershell
uv venv backend\.venv
backend\.venv\Scripts\Activate.ps1
uv pip install --upgrade pip
uv pip install -r backend/requirements.txt
```

### Opcao B: Poetry

```powershell
poetry init -n
poetry env use python
poetry shell
poetry add $(Get-Content backend/requirements.txt)
```

### Opcao C: venv padrao

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

## Subir o projeto local

### 1) Backend API

Sem reload:

```powershell
python backend/studio_server.py 127.0.0.1 8765
```

Com auto-reload:

```powershell
python backend/studio_server.py 127.0.0.1 8765 --reload
```

Endpoints:

- `GET /api/health`
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/videos?channel_id=1`
- `POST /api/videos`
- `GET /api/videos/{id}`
- `POST /api/videos/{id}/ingest-script`
- `POST /api/manifest`
- `POST /api/manifest/from-file`
- `GET /docs` (Swagger UI)
- `GET /redoc`

### 2) Frontend Next.js

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Abra:

- `http://127.0.0.1:3000`

Padrao de API no front:

- `NEXT_PUBLIC_STUDIO_API=http://127.0.0.1:8765`

## Variaveis de ambiente (servidor backend)

Para a pipeline LLM local via Ollama:

- `OLLAMA_AUTO_PULL_MISSING=1` (padrao): baixa automaticamente modelos locais ausentes.
- `OLLAMA_AUTO_PULL_MISSING=0`: desliga auto-download de modelos.

## Exemplo: gerar manifesto via script

```powershell
@'
from backend.script_pipeline import load_script_file, build_manifest, validate_manifest, save_manifest

path = r"d:\channels\Dieta\Videos\V1-Cardio em Jejum Acelera ou Destrói Seu Metabolismo\Cardio em Jejum Acelera ou Destrói Seu Metabolismo_.md"
script = load_script_file(path)
manifest = build_manifest(
    script_text=script,
    max_visual_chars=0,
    max_tts_chars=200,
    split_mode="topic",
    topic_min_chars=120,
    topic_similarity_threshold=0.16,
)
validation = validate_manifest(manifest)
print(validation)
save_manifest(manifest, "output/manifest.json")
'@ | python -
```

## Exemplo: render de video

```powershell
@'
from backend.main import create_video_pipeline

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

## Testes de integracao (pipeline LLM)

Executar a suite de integracao da pipeline A->B->C:

```powershell
backend\.venv\Scripts\python.exe -m unittest backend.tests.integration.test_llm_pipeline_integration -v
```

Observacoes:

- O teste usa um servidor fake OpenAI-compatible para validar fluxo, cache e persistencia sem custo de API.
- Existe um teste opcional com roteiro real (`d:\channels\...`); ele e pulado automaticamente quando o arquivo nao existe.

## Como a divisao por topicos funciona (explicacao para leigo)

Imagine um texto como uma conversa longa. O sistema tenta achar onde o assunto muda, sem usar LLM.

Passo a passo:

1. Quebra o paragrafo em frases.
2. Remove palavras muito comuns (ex.: "de", "e", "a", "o").
3. Compara uma frase com a seguinte para medir se falam de coisa parecida.
4. Se a semelhanca cair bastante, entende que o assunto mudou.
5. Nesse ponto, fecha um bloco e inicia outro.
6. Depois ajusta pelo tamanho para nao ficar bloco grande demais.

Modos:

- `split_mode = "length"`: divide principalmente por tamanho.
- `split_mode = "topic"`: divide quando detecta mudanca de tema.
  - use `max_visual_chars=0` para nao cortar por tamanho no bloco visual.

Parametros de `topic`:

- `topic_min_chars`: tamanho minimo antes de permitir corte por tema.
- `topic_similarity_threshold`: sensibilidade da mudanca.
  - valor maior: corta mais facil (mais blocos)
  - valor menor: junta mais frases (menos blocos)

Importante:

- limite de `200` e somente para `max_tts_chars` (TTS), nao para bloco visual.

Guia tecnico detalhado:

- `backend/SEGMENTATION_TECHNICAL_GUIDE.md`

## Notas

- `assets/transitions/*.mov` sao opcionais para overlays premium.
- Se esses arquivos estiverem vazios, o pipeline base com `xfade` ainda funciona.

## Troubleshooting

- Erro de porta (`WinError 10013`):
  - rode em outra porta, ex.: `python backend/studio_server.py 127.0.0.1 8766`
- `ffmpeg` nao encontrado:
  - instale FFmpeg e confirme no `PATH`.

Arquitetura de dados/persistencia:

- `backend/DATA_ARCHITECTURE.md`

Nota sobre ORM:

- Nesta fase, o backend usa `sqlite3` nativo para manter stack Python simples.
- Prisma pode ser avaliado depois se houver necessidade forte de ecossistema Node/TypeScript no backend.
