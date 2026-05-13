# FlowShopy

FlowShopy e um produto local-first para transformar fontes de conteudo em entregaveis publicaveis, com foco inicial em video.

O produto segue a ideia de COPE:

```text
Create Once, Publish Everywhere
```

Na pratica:

- o usuario cria ou importa um `Content`;
- esse conteudo pode ter uma ou varias fontes;
- as fontes sao preparadas ate virarem texto bruto;
- o conteudo e associado a um `Project`;
- o projeto define canais, formatos e prompts por entregavel;
- cada combinacao `canal + formato` gera um `final content`;
- a partir desse `final content`, o produto entra na fase de criacao do entregavel.

Hoje a V1 esta focada em:

- conteudo reutilizavel;
- projetos como parametrizadores;
- video como entregavel principal;
- runtime local com Electron, API local, worker local e SQLite local.

## Para quem este README existe

Este README e para quem tem acesso ao codigo e vai:

- desenvolver;
- depurar;
- empacotar;
- validar;
- manter o projeto.

Ele nao e um guia de cliente final.

O guia para simular a experiencia de "app instalado" durante desenvolvimento fica em:

- [docs/13-desktop-installed-mode-validation.md](docs/13-desktop-installed-mode-validation.md)

O documento canonico do runtime desktop continua sendo:

- [docs/12-desktop-local-runtime.md](docs/12-desktop-local-runtime.md)

## O que o projeto entrega

O dominio principal atual e este:

```text
Content -> Project -> Channel -> Format -> Prompt -> Final Content -> Output
```

Regras importantes do produto neste estado:

- `Content` existe fora de `Project`;
- `Content` pode ter varias fontes;
- cada fonte e preparada ate texto bruto;
- `Project` nao e o conteudo; ele orquestra a criacao dos entregaveis;
- a IA nao atua na fase de preparacao do conteudo;
- a IA entra depois, no contexto do projeto, por combinacao `canal + formato`.

Fontes suportadas agora:

- texto;
- links do YouTube;
- PDF.

Fluxo atual de preparacao:

- texto: ja entra como fonte pronta;
- YouTube: download -> extracao de audio -> transcricao;
- PDF: extracao de texto.

Quando todas as fontes de um conteudo tiverem convergido para texto bruto, esse conteudo passa a estar pronto para uso nos projetos.

## Arquitetura em uma tela

```text
Electron Desktop Shell
  -> React UI local
  -> Fastify API local
  -> Worker local
  -> SQLite local
  -> runtime vendorizado
     - Node
     - ffmpeg
     - Python
     - modelos locais
```

Diretorios principais:

```text
apps/desktop  shell Electron e bootstrap do runtime local
apps/web      frontend React/Vite
apps/api      API Fastify
apps/worker   jobs locais, ingestao, providers e render
packages/db   Prisma + SQLite
packages/shared utilitarios de runtime e config
scripts/      preparacao, limpeza, empacotamento e suporte
docs/         documentacao canonica
```

## Ordem de leitura recomendada

Se voce vai mexer no produto, leia nesta ordem:

1. [docs/01-product-vision.md](docs/01-product-vision.md)
2. [docs/02-product-specification.md](docs/02-product-specification.md)
3. [docs/03-technical-architecture.md](docs/03-technical-architecture.md)
4. [docs/04-development-and-operations.md](docs/04-development-and-operations.md)
5. [docs/12-desktop-local-runtime.md](docs/12-desktop-local-runtime.md)
6. [docs/08-roadmap-status-and-handoff.md](docs/08-roadmap-status-and-handoff.md)

## Requisitos de desenvolvimento

Ambiente principal atual:

- Windows
- PowerShell

Versoes exigidas pelo repositorio:

- Node.js `22.17.1`
- pnpm `9.12.3`

Outros pontos:

- internet na primeira preparacao do runtime desktop;
- Playwright browsers instalados localmente para a parte que ainda usa render headless;
- providers locais ou externos conforme a feature testada.

Providers e servicos que podem entrar no fluxo, dependendo do que voce for validar:

- Ollama ou Gemini para LLM;
- ComfyUI para imagem;
- XTTS, Chatterbox ou Qwen TTS;
- Playwright para a trilha atual de slides PNG;
- ffmpeg, Python e modelos locais sao tratados pelo proprio runtime do app.

## Setup completo do ambiente de desenvolvimento

### 1. Instalar dependencias do monorepo

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

Valores minimos de referencia para desenvolvimento:

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

Crie `apps/web/.env.local` com:

```env
VITE_API_BASE=http://127.0.0.1:4110
```

Regra importante:

- use o mesmo host na web e na API;
- se usar `127.0.0.1` em `VITE_API_BASE`, abra a UI em `127.0.0.1`, nao em `localhost`.

### 5. Entender o que sera baixado automaticamente

Voce nao precisa instalar manualmente no Windows para o runtime desktop:

- Node do backend local;
- ffmpeg;
- ffprobe;
- Python;
- libs Python do worker;
- modelo inicial de transcricao.

Esses itens sao preparados pelo proprio projeto.

## Como rodar em desenvolvimento

### Modo recomendado

Use:

```powershell
pnpm dev:desktop
```

Esse e o modo principal de desenvolvimento hoje.

Ele faz o seguinte:

1. verifica e prepara o runtime desktop se necessario;
2. sobe a UI;
3. sobe a API local;
4. sobe o worker local;
5. abre o shell Electron.

### Modo separado por processo

Use isso apenas quando quiser depurar uma camada isoladamente.

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

### URLs de desenvolvimento

```text
web:    http://127.0.0.1:4273/
api:    http://127.0.0.1:4110
worker: http://127.0.0.1:4111
```

## O que o projeto cria em desenvolvimento

### Runtime desktop de desenvolvimento

Em desenvolvimento, o runtime ativo fica no repositorio:

```text
apps/desktop/vendor/
  node/
  ffmpeg/
  python/
  models/
  db/
  workspace-node-modules/
```

### Dados de desenvolvimento

Em desenvolvimento, os dados ficam em:

- `DATA_DIR`, se ele estiver definido;
- senao, no fallback de desenvolvimento do projeto.

Hoje a configuracao recomendada e:

```text
G:\tool\video-automation\data
```

### Logs

Logs importantes:

```text
tmp/api-4110.log
tmp/worker-4111.log
tmp/web-4273.log
logs/worker-actions.log
logs/worker-job-events.log
logs/desktop/desktop-bootstrap.log
```

## Como saber se o modo de desenvolvimento esta funcionando

### Healthchecks

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

### Sinais visuais

No bootstrap do desktop, a splash deve passar por mensagens como:

- `Verificando runtimes locais...`
- `Preparando banco e arquivos locais...`
- `Iniciando API local...`
- `Conectando worker local...`
- `Aguardando API responder...`
- `Aplicacao pronta.`

Se travar, o primeiro lugar para olhar e:

- `logs/desktop/desktop-bootstrap.log`

## Como limpar e retestar em desenvolvimento

Quando quiser simular o primeiro boot do runtime de desenvolvimento:

```powershell
pnpm clean:desktop-runtime
pnpm dev:desktop
```

Esse fluxo limpa o runtime vendorizado de desenvolvimento e deixa o bootstrap reconstruir tudo.

Use isso para validar:

- downloads;
- preparacao do runtime;
- regressao no bootstrap;
- mudanca de versao de vendor;
- mudanca de dependencias Python.

## Como compilar a aplicacao desktop

### Build interno do desktop

```powershell
pnpm build:desktop
```

Isso faz:

1. prepara o runtime desktop;
2. builda o frontend;
3. deixa o projeto pronto para empacotamento.

### Gerar o instalador

```powershell
pnpm dist:desktop
```

Saida esperada:

```text
dist/desktop/
```

Ali voce encontra:

- instalador;
- `win-unpacked`;
- arquivos auxiliares do empacotamento.

## Como testar o modo instalado

Existe uma diferenca importante entre:

- rodar o desktop em desenvolvimento;
- validar a experiencia do app instalado.

Para simular o app instalado, use:

```powershell
pnpm clean:installed-desktop-runtime
pnpm run:desktop-unpacked
```

Esse fluxo testa o comportamento do app empacotado sem precisar instalar manualmente a cada iteracao.

Guia completo:

- [docs/13-desktop-installed-mode-validation.md](docs/13-desktop-installed-mode-validation.md)

## O que o projeto cria no modo instalado

Quando o app esta rodando como app instalado ou `win-unpacked`, a regra muda.

### Runtime inicial entregue com o app

```text
resources/vendor
```

Essa e a copia inicial entregue pelo build.

### Runtime ativo usado pela aplicacao

```text
%LOCALAPPDATA%/FlowShopy Desktop/vendor
```

### Dados do usuario

```text
%LOCALAPPDATA%/FlowShopy Desktop/data
```

### Logs do bootstrap desktop

```text
%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log
```

## Regra importante sobre `DATA_DIR`

Esse ponto e critico e deliberado:

- em desenvolvimento, `DATA_DIR` pode redirecionar o diretorio de dados;
- no app empacotado, `DATA_DIR` e ignorado;
- o app empacotado sempre usa `%LOCALAPPDATA%/FlowShopy Desktop/data`.

O motivo real no codigo e:

- a checagem de `isDev()` em `apps/desktop/main.mjs`;
- nao e o valor de `DATA_DIR` estar vazio ou preenchido que decide isso;
- o que decide e se o app esta em desenvolvimento ou empacotado.

## Como validar o modo instalado

Checklist curto:

1. rodar `pnpm dist:desktop`
2. rodar `pnpm clean:installed-desktop-runtime`
3. rodar `pnpm run:desktop-unpacked`
4. verificar a splash
5. verificar:
   - `%LOCALAPPDATA%/FlowShopy Desktop/data`
   - `%LOCALAPPDATA%/FlowShopy Desktop/vendor`
   - `%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log`
6. confirmar que a API sobe em `4110`
7. confirmar que o worker sobe em `4111`

## Pipeline local de YouTube

Hoje a fase de preparacao de fonte do YouTube e:

```text
link do YouTube
  -> download do video
  -> extracao de audio
  -> transcricao
  -> texto bruto salvo no Content
```

Runtime usado nessa trilha:

- `yt-dlp` dentro do Python vendorizado;
- `ffmpeg` vendorizado;
- `faster-whisper` vendorizado;
- modelo local inicial de transcricao.

## Comandos mais importantes

Setup:

```powershell
pnpm install
pnpm --filter @flowshopy/worker exec playwright install
```

Preparacao de runtime:

```powershell
pnpm prepare:desktop-runtime
```

Desenvolvimento:

```powershell
pnpm dev:desktop
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Limpeza:

```powershell
pnpm clean:desktop-runtime
pnpm clean:installed-desktop-runtime
```

Empacotamento e validacao:

```powershell
pnpm build:desktop
pnpm dist:desktop
pnpm run:desktop-unpacked
```

Validacao tecnica:

```powershell
pnpm --filter @flowshopy/api typecheck
pnpm --filter @flowshopy/web typecheck
pnpm --filter @flowshopy/worker typecheck
pnpm verify:critical
```

## Arquivos que mais importam para manutencao

Bootstrap desktop:

- [apps/desktop/main.mjs](apps/desktop/main.mjs)

Empacotamento:

- [apps/desktop/electron-builder.json](apps/desktop/electron-builder.json)

Preparacao de runtime:

- [scripts/prepare-desktop-node.mjs](scripts/prepare-desktop-node.mjs)
- [scripts/prepare-desktop-workspace-node-modules.mjs](scripts/prepare-desktop-workspace-node-modules.mjs)
- [scripts/prepare-desktop-ffmpeg.mjs](scripts/prepare-desktop-ffmpeg.mjs)
- [scripts/prepare-desktop-python.mjs](scripts/prepare-desktop-python.mjs)
- [scripts/prepare-desktop-db-seed.mjs](scripts/prepare-desktop-db-seed.mjs)

Limpeza:

- [scripts/clean-desktop-runtime.mjs](scripts/clean-desktop-runtime.mjs)
- [scripts/clean-installed-desktop-runtime.mjs](scripts/clean-installed-desktop-runtime.mjs)

Frontend de conteudo:

- [apps/web/src/components/ContentQuickStart.tsx](apps/web/src/components/ContentQuickStart.tsx)

Worker:

- [apps/worker/src/index.ts](apps/worker/src/index.ts)

Banco:

- [packages/db/src/index.ts](packages/db/src/index.ts)

## Regras de manutencao

- nao editar `G:\\tool\\flowshopy`;
- toda implementacao ativa acontece em `G:\\tool\\video-automation`;
- se mudar contrato de produto, atualizar `docs/01`, `docs/02` e `docs/03`;
- se mudar runtime desktop, atualizar `docs/12`;
- se mudar fluxo de validacao do app instalado, atualizar `docs/13`;
- se mudar o estado real do trabalho, atualizar `docs/08`.

## O que ainda nao e guia de cliente final

Ainda falta produzir um material separado para:

- cliente que recebe um instalador;
- suporte que precisa orientar reinstalacao;
- QA fora do repositorio;
- troubleshooting para usuario final sem acesso ao codigo.

Esse material nao deve virar README do repositiorio.

Enquanto isso, a referencia para simular esse cenario dentro do projeto e:

- [docs/13-desktop-installed-mode-validation.md](docs/13-desktop-installed-mode-validation.md)
