# VizLec

VizLec transforma o roteiro completo de uma aula (teleprompter) em um video final com slides estaticos sincronizados com narracao TTS, tudo rodando localmente.

## O que este repo contem
- Monorepo (pnpm workspaces) com:
  - `apps/api` (Fastify)
  - `apps/worker` (Node)
  - `apps/web` (Vite + React)
  - `packages/db` (Prisma + SQLite)
  - `packages/shared` (config e utils)

## Requisitos
- Node.js 20+ (recomendado)
- pnpm 9+
- SQLite via Prisma (arquivo local)
- Servicos locais esperados (ainda nao integrados no codigo):
  - Ollama
  - ComfyUI
  - Qwen TTS
  - ffmpeg/ffprobe
  - Playwright (para render de slides) + browsers instalados

## Conceitos importantes
- **DATA_DIR**: diretorio base de dados e assets (fonte de verdade no .env).
- **Working dir obrigatorio**: `api` e `worker` devem iniciar com `cwd = DATA_DIR` para que `file:./vizlec.db` resolva sempre no lugar certo (eles ajustam automaticamente se necessario).

## Setup rapido (dev)
1) Instale dependencias:

```bash
pnpm install
```

2) Instale os browsers do Playwright (necessario para gerar slides PNG):

```bash
pnpm --filter @vizlec/worker exec playwright install
```

Windows (PowerShell):

```powershell
pnpm --filter @vizlec/worker exec playwright install
```

Alternativa:

```bash
pnpm -C apps/worker exec playwright install
```

3) Ajuste o `.env` (defina apenas `DATA_DIR` com caminho absoluto):

```bash
cp .env.example .env
# Edite DATA_DIR para um caminho absoluto (ex.: /abs/path/VizLec/data)
```

3.1) (Windows) Configure o XTTS (xtts-api-server) com o script:

```powershell
.\INSTALL_XTTS_TTS.ps1 -ServerDir "G:\projects\back-end\xtts-api-server"
```

Esse script cria/atualiza o venv `.venv-tts-xtts`, instala o `xtts-api-server` (editable) e atualiza o `.env`.
O worker faz auto-start do servidor XTTS quando `TTS_PROVIDER=xtts` (modelo A): ele tenta usar
`XTTS_API_BASE_URL` e, se nao estiver rodando, sobe o servico localmente e aguarda ficar pronto.

Para compartilhar o XTTS entre varios apps seus, aponte todos para o mesmo:
- `XTTS_API_BASE_URL` (porta fixa)
- `XTTS_API_MODEL_DIR` (cache/modelos compartilhados)
- `XTTS_API_SPEAKER_DIR` (vozes)

Vozes do XTTS:
- A lista vem do endpoint do `xtts-api-server` (`/speakers` ou `/speakers_list`).
- O `voice_id` retornado pela API e enviado ao `/tts_to_file` deve ser o nome do arquivo **.wav** sem extensao
  (ex.: `joao.wav` → `joao`) ou o nome de uma pasta com multiplos wavs (multi-sample).

Nota de integracao XTTS:
- O VizLec **usa o endpoint `/tts_to_audio/`** e grava o WAV localmente. Isso evita problemas quando o
  xtts-api-server esta rodando em container (o `/tts_to_file` grava dentro do container).

3.2) (Windows) Configure o Chatterbox TTS com o script:

```powershell
.\INSTALL_CHATTERBOX_TTS.ps1
```

Esse script cria/atualiza o venv `.venv-tts-chatterbox`, instala `chatterbox-tts` + `torch/torchaudio`
e atualiza o `.env` com `TTS_PROVIDER=chatterbox` e os caminhos de voz.
Por padrao ele usa o indice CUDA cu124 (torch 2.6.0). Ajuste o script se precisar CPU ou outra CUDA.

3.3) (Windows) (Opcional) Configure o Qwen TTS com o script:

```powershell
.\INSTALL_QWEN_TTS.ps1
```

Esse script cria/atualiza o venv `.venv-tts-311`, baixa o wheel do FlashAttention2 se necessario,
instala `qwen-tts`/`torch` e atualiza o `.env` com `QWEN_TTS_PYTHON` e `QWEN_TTS_ATTN_IMPLEMENTATION`.

Se precisar de CPU ou outra CUDA, ajuste no script as variaveis `$torchIndexUrl` e `$wheelName`.

Vozes do Chatterbox:
- Arquivos em `DATA_DIR/voices/`
- Registro em `DATA_DIR/voices.json`
- A UI lista as vozes e permite selecionar qual usar no TTS.

Para alternar o provider de TTS, ajuste `TTS_PROVIDER` no `.env` (ex.: `xtts`, `chatterbox` ou `qwen`).

4) Pare a API e o worker antes de migrar (Windows pode travar o Prisma engine).

5) Crie a pasta de dados e gere o banco SQLite com Prisma (usa o `.env`):

```bash
pnpm db:migrate
```

Windows (PowerShell):

```powershell
pnpm db:migrate
```

Exemplo de saida (o caminho confirma onde o SQLite foi criado):

```
Using SQLite at file:G:/tool/vizlec/data/vizlec.db
Datasource "db": SQLite database "vizlec.db" at "file:G:/tool/vizlec/data/vizlec.db"
```

6) Suba os servicos em dev (cada um em um terminal):

```bash
# API
pnpm dev:api

# Worker
pnpm dev:worker

# Web
pnpm dev:web
```

7) Teste healthcheck:

```bash
curl http://127.0.0.1:4010/health
```

8) Acesse a documentação da API:

```
http://127.0.0.1:4010/reference
```

> Para mais detalhes sobre a API e como usar a documentação interativa, veja [apps/api/README.md](apps/api/README.md).

9) Fluxo rapido (primeiro resultado visivel):
   1. Abra a UI (por padrao `http://127.0.0.1:4173`).
   2. Crie **Curso** → **Modulo** → **Aula**.
   3. Cole o roteiro na aula e clique **Generate blocks**.
      - Requer Ollama rodando localmente.
   4. Selecione o template no seletor (Texto v0 ou Imagem v1).
   5. Clique **Generate slides**.
      - Texto v0: gera PNGs texto-only.
      - Imagem v1: usa a imagem do bloco (se existir) e aplica overlay premium.
      - Se nao houver imagem, usa fallback visual.
      - Para testar manualmente, coloque imagens em:
        - `DATA_DIR/courses/<courseId>/modules/<moduleId>/lessons/<lessonId>/versions/<versionId>/blocks/<index>/image_raw/`
   6. Saida dos PNGs:
      - Texto: `.../slide_text_v0.png`
      - Imagem: `.../slide_image_v1.png`

## Scripts principais
- `pnpm dev:api`
- `pnpm dev:worker`
- `pnpm dev:web`
- `pnpm dev` (roda todos em paralelo)
- `pnpm db:migrate` (usa `.env` para criar o SQLite)
- `pnpm --filter @vizlec/worker exec playwright install` (instala browsers do Playwright)
- `pnpm run verify:critical` (typecheck API + typecheck Web + teste de rastreabilidade por correlationId)
- `pnpm run setup:hooks` (configura hooks versionados do repositorio)

## Automacao de verificacao (hooks + CI)
Objetivo:
- evitar push com regressao critica sem mudar seu fluxo de trabalho (`commit + push`);
- manter rastreabilidade de correlationId e checks minimos sempre ativos.

Arquivos envolvidos:
- `.githooks/pre-push` -> hook versionado que roda `pnpm run verify:critical` antes de cada push;
- `scripts/setup-hooks.ps1` -> configura `core.hooksPath=.githooks` no clone atual;
- `.github/workflows/ci.yml` -> workflow remoto que roda no `push` para `main`.

### Passo a passo (obrigatorio por clone)
1. Instale dependencias:

```bash
pnpm install
```

2. Ative hooks versionados no clone atual:

```powershell
pnpm run setup:hooks
```

Alternativa (qualquer shell):

```bash
git config core.hooksPath .githooks
```

3. Valide se o Git esta apontando para os hooks do repo:

```bash
git config --get core.hooksPath
```

Resultado esperado:

```text
.githooks
```

4. (Opcional, recomendado) Rode a verificacao manualmente:

```bash
pnpm run verify:critical
```

### O que acontece no dia a dia
- Ao executar `git push`, o hook `pre-push` roda automaticamente:
  - `pnpm --filter @vizlec/api typecheck`
  - `pnpm --filter @vizlec/web typecheck`
  - `pnpm --filter @vizlec/api run test:one -- test/correlation-id-traceability.test.ts`
- Se falhar, o push e bloqueado localmente.
- Apos push em `main`, o GitHub Actions roda o mesmo pacote critico no remoto.

### Quando clonar em outra maquina
- repita apenas:
  1. `pnpm install`
  2. `pnpm run setup:hooks`

Sem o passo 2, o hook local nao sera executado.

### Troubleshooting rapido
- Hook nao executa no push:
  - confira `git config --get core.hooksPath`;
  - deve retornar `.githooks`.
- Quero pular verificacao em emergencia:
  - use `git push --no-verify` (somente com consciencia do risco).
- Erro no script PowerShell:
  - execute o comando direto `git config core.hooksPath .githooks`.

## Observacoes
- O MVP e single-worker, com fila baseada em DB.
- O banco e sempre `DATA_DIR/vizlec.db`.
- Mais detalhes em `docs/PRD.md`, `docs/especificacao-tecnica-inicial.md` e `docs/arquitetura-decissoes-tecnicas.md`.

## VSCode + Prisma (Windows)
Se o VSCode mostrar aviso sobre `datasource url` (Prisma 7), configure o workspace para usar o Prisma local:

- `.vscode/settings.json` aponta para:
  - `packages/db/node_modules/.bin/prisma.cmd`
  - `packages/db/node_modules/.bin/prisma-fmt.cmd`
