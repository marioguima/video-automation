# FlowShopy Development and Operations

## Objetivo

Este documento explica como preparar, executar, validar e manter o projeto em desenvolvimento.

Ele cobre:

- setup local;
- primeiro boot do runtime de desenvolvimento;
- comandos de execução;
- healthchecks;
- logs;
- limpeza;
- validação técnica;
- rotina recomendada para manutenção.

Ele nao cobre o cenário de app empacotado como guia principal. Para isso, use:

- [12-desktop-local-runtime.md](12-desktop-local-runtime.md)
- [13-desktop-installed-mode-validation.md](13-desktop-installed-mode-validation.md)

## Ambiente local suportado

Ambiente principal atual:

- Windows
- PowerShell

Ferramentas exigidas pelo repositório:

- Node.js `22.17.1`
- pnpm `9.12.3`

Dependências e serviços que podem entrar no fluxo, dependendo da feature testada:

- Playwright browsers
- Ollama ou Gemini
- ComfyUI
- XTTS, Chatterbox ou Qwen TTS

Ponto importante:

- em desenvolvimento, o projeto prepara o runtime desktop local;
- você nao precisa instalar manualmente `ffmpeg`, `ffprobe`, Python e o modelo inicial de transcrição para a trilha principal do desktop;
- esses itens sao preparados pelo próprio projeto quando necessário.

## Setup inicial do repositório

### 1. Instalar dependências do monorepo

```powershell
pnpm install
```

### 2. Instalar browsers do Playwright

```powershell
pnpm --filter @flowshopy/worker exec playwright install
```

### 3. Criar `.env`

```powershell
Copy-Item .env.example .env
```

Valores mínimos de referência para desenvolvimento:

```env
DATA_DIR=G:\tool\video-automation\data
API_PORT=4110
WORKER_PORT=4111
API_BASE_URL=http://127.0.0.1:4110
WEB_APP_BASE_URL=http://127.0.0.1:4273
INTERNAL_JOBS_EVENT_TOKEN=flowshopy-local-dev-internal-token
AGENT_CONTROL_TOKEN_SECRET=flowshopy-local-dev-agent-token
```

### 4. Configurar o frontend

Criar `apps/web/.env.local` com:

```env
VITE_API_BASE=http://127.0.0.1:4110
```

Regra:

- use o mesmo host na API e na UI;
- se a API estiver em `127.0.0.1`, abra a UI em `127.0.0.1`, não em `localhost`.

## Diretórios importantes em desenvolvimento

### Runtime ativo

Em desenvolvimento, o runtime ativo do desktop fica em:

```text
apps/desktop/vendor/
```

Estrutura esperada:

```text
apps/desktop/vendor/
  node/
  ffmpeg/
  python/
  models/
  db/
  workspace-node-modules/
```

### Dados

Em desenvolvimento, os dados ficam em:

- `DATA_DIR`, se definido e se o app estiver em modo dev;
- caso contrário, no fallback local do projeto.

Configuração recomendada:

```text
G:\tool\video-automation\data
```

### Banco

Banco de desenvolvimento esperado:

```text
data/data.db
```

Referência de URL:

```text
FLOWSHOPY_DB_URL=file:G:/tool/video-automation/data/data.db
```

## Portas de desenvolvimento

```text
web:    http://127.0.0.1:4273/
api:    http://127.0.0.1:4110
worker: http://127.0.0.1:4111
```

## Fluxo principal de execução em desenvolvimento

### Comando recomendado

```powershell
pnpm dev:desktop
```

Esse é o fluxo principal do projeto hoje.

O que ele faz:

1. verifica o runtime desktop de desenvolvimento;
2. prepara vendors ausentes ou divergentes;
3. sobe a UI;
4. sobe a API local;
5. sobe o worker local;
6. abre o Electron.

### O que esperar no primeiro boot

Se você limpou o runtime antes, o primeiro boot pode demorar mais porque o projeto pode:

- preparar Node local do backend;
- preparar workspace runtime;
- baixar ffmpeg;
- baixar Python embeddable;
- instalar libs Python;
- preparar o modelo inicial de transcrição;
- preparar a seed do banco.

### Comandos separados por processo

Use apenas quando quiser depurar uma camada isoladamente.

API:

```powershell
pnpm dev:api
```

Worker:

```powershell
pnpm dev:worker
```

Web:

```powershell
pnpm dev:web
```

## Preparação explícita do runtime

Se quiser preparar tudo antes de abrir o desktop:

```powershell
pnpm prepare:desktop-runtime
```

Esse comando executa:

```text
prepare:desktop-node
prepare:desktop-workspace-node-modules
prepare:desktop-ffmpeg
prepare:desktop-python
prepare:desktop-db-seed
```

Use isso quando quiser:

- antecipar downloads;
- validar scripts de preparação;
- depurar falhas de provisionamento sem abrir o app;
- comparar mudanças no runtime.

## Healthchecks

API:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4110/health
```

Worker:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4111/health
```

Web:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4273/
```

## Login local atual

Usuário de desenvolvimento:

```text
email: marioguimaraes@flowshopy.com
senha: TempPass123!
```

Se a senha precisar ser recriada, o ajuste deve ser feito diretamente sobre a base local de desenvolvimento.

## Logs

Logs principais de desenvolvimento:

```text
tmp/api-4110.log
tmp/worker-4111.log
tmp/web-4273.log
logs/desktop/desktop-bootstrap.log
logs/worker-actions.log
logs/worker-job-events.log
```

### Leitura rápida dos logs

#### `logs/desktop/desktop-bootstrap.log`

Use para problemas de:

- startup do Electron;
- runtime ausente;
- API não iniciando;
- worker não iniciando;
- travamento da splash.

#### `tmp/api-4110.log`

Use para:

- erros HTTP;
- autenticação;
- rotas quebradas;
- problemas de banco refletidos na API.

#### `tmp/worker-4111.log`

Use para:

- pipeline de jobs;
- providers;
- TTS;
- imagem;
- render;
- falhas na preparação de fontes.

#### `logs/worker-actions.log`

Use para eventos operacionais gerais do worker.

#### `logs/worker-job-events.log`

Use para eventos por job em JSONL, incluindo:

- segmentação;
- TTS;
- imagem;
- render;
- falhas por bloco.

## Como limpar e retestar em desenvolvimento

Para simular o primeiro boot do runtime local:

```powershell
pnpm clean:desktop-runtime
pnpm dev:desktop
```

Esse comando remove o runtime ativo de desenvolvimento em `apps/desktop/vendor`.

Use isso para:

- validar provisionamento do zero;
- confirmar correção em script de prepare;
- confirmar atualização automática de vendor;
- investigar regressões no bootstrap.

## Como validar mudanças técnicas

### Typecheck por pacote

API:

```powershell
pnpm --filter @flowshopy/api typecheck
```

Web:

```powershell
pnpm --filter @flowshopy/web typecheck
```

Worker:

```powershell
pnpm --filter @flowshopy/worker typecheck
```

### Verificação crítica

```powershell
pnpm verify:critical
```

### Exemplo de teste relevante já usado no projeto

```powershell
pnpm --filter @flowshopy/api run test:one -- test/content-cope-flow.test.ts
```

### Build web isolado

```powershell
pnpm build:web
```

## Rotina recomendada de manutenção

1. ler [08-roadmap-status-and-handoff.md](08-roadmap-status-and-handoff.md)
2. confirmar o documento canônico da área alterada
3. fazer mudanças pequenas e verificáveis
4. rodar typecheck do pacote alterado
5. rodar o teste relevante
6. atualizar documentação se o contrato mudou
7. atualizar o handoff se o estado real mudou

## Regras de implementação

- não editar `G:\tool\flowshopy`
- toda implementação ativa acontece em `G:\tool\video-automation`
- não fazer rename estrutural grande sem fase planejada
- preferir mudanças com contrato claro e verificável
- preservar coerência entre código e documentação

## Diferença para o modo instalado

Este documento trata desenvolvimento.

Quando a validação precisa responder:

- “o app empacotado cria `%LOCALAPPDATA%` corretamente?”
- “o vendor do app instalado foi reconstruído?”
- “a splash do app empacotado está correta?”

use:

- [12-desktop-local-runtime.md](12-desktop-local-runtime.md)
- [13-desktop-installed-mode-validation.md](13-desktop-installed-mode-validation.md)

## Problemas conhecidos em ambiente restrito

Em alguns ambientes, podem ocorrer falhas como:

- `spawn EPERM`
- bloqueio de binário nativo
- bloqueio de subprocesso
- falha em `node:test`

Se isso ocorrer:

- rode o pacote isoladamente;
- valide o mesmo fluxo fora do sandbox quando necessário;
- não trate bloqueio de ambiente como falha de código sem reproduzir.
