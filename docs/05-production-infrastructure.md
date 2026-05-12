# FlowShopy Production Infrastructure

## Estratégia de distribuição técnica

FlowShopy deve suportar tres modos:

1. Local-first desktop/self-hosted.
2. Self-hosted em servidor/lab.
3. SaaS/control plane futuro com workers/agentes locais.

A V1 deve priorizar local-first porque geração de vídeo, imagem e TTS pode ter custo alto de GPU/API.

## Componentes em produção

### Frontend

- React/Vite build estático;
- servido por API, servidor web ou container;
- deve apontar para API via env/config.

### API

- Node.js/Fastify;
- autentica usuários;
- gerencia workspaces;
- gerencia projetos/conteúdos/jobs/settings;
- expõe WebSocket/HTTP para worker/agente.

### Worker

- Node.js;
- executa jobs pesados;
- acessa LLM/TTS/ComfyUI/ffmpeg/Playwright;
- deve rodar próximo da GPU/servicos locais.

### Banco

V1:

- SQLite em volume persistente.

Futuro SaaS:

- Postgres recomendado;
- separar storage de assets;
- filas robustas se volume exigir.

### Storage

V1:

- filesystem local sob `DATA_DIR`.

Futuro:

- S3/R2/MinIO para assets;
- CDN para downloads;
- politicas de retencao.

## Infra local-first

Requisitos mínimos:

- CPU moderna;
- 16 GB RAM recomendado;
- GPU NVIDIA 8 GB VRAM mínimo para fluxos locais com imagem/TTS pesados;
- disco SSD;
- ffmpeg;
- Node.js runtime;
- servicos locais conforme provider.

Servicos locais:

- Ollama ou Gemini para LLM;
- ComfyUI para imagem;
- XTTS/Chatterbox/Qwen para TTS;
- Playwright browsers;
- ffmpeg/ffprobe.

## Infra self-hosted/lab

Modelo:

- API e frontend em servidor;
- worker em máquina com GPU;
- SQLite em volume persistente para single-node;
- reverse proxy HTTPS;
- backups de `DATA_DIR`.

Componentes:

- Traefik ou Nginx;
- systemd/PM2/NSSM ou container;
- volume para `DATA_DIR`;
- logs centralizados;
- healthchecks.

## Infra SaaS futura

Modelo:

- control plane cloud multi-tenant;
- banco Postgres;
- storage S3/R2;
- workers locais pareados por workspace;
- billing Stripe;
- conectores sociais por OAuth;
- fila cloud para tarefas não-GPU;
- observabilidade central.

## Variaveis críticas

- `DATA_DIR`
- `FLOWSHOPY_DB_URL`
- `AUTH_JWT_SECRET`
- `AUTH_COOKIE_SECURE`
- `INTERNAL_JOBS_EVENT_TOKEN`
- `AGENT_CONTROL_TOKEN_SECRET`
- `APP_SETTINGS_PATH`

## HTTPS e seguranca

Produção deve usar:

- HTTPS obrigatorio;
- cookies secure;
- secrets fortes;
- CORS restrito;
- backups criptografados quando possível;
- não salvar API keys em texto aberto no longo prazo;
- mascarar secrets na UI/logs;
- separar workspaces lógicamente.

## Backup

Backup mínimo V1:

- `DATA_DIR/data.db`;
- pasta de assets;
- settings JSON;
- vozes/custom assets.

Politica sugerida:

- snapshot diario;
- retencao 7/30/90 dias;
- restore testado mensalmente.

## Empacotamento desktop futuro

Recomendacao:

- Electron ou launcher nativo;
- iniciar API/worker;
- definir `DATA_DIR`;
- healthcheck de dependências;
- abrir UI;
- logs simples;
- configurador de providers;
- atualização do app.

### Diretriz de empacotamento de dependências críticas

Para o produto desktop local-first, dependências críticas de execução devem ser distribuídas junto com a aplicação.

Isso vale especialmente para:

- `ffmpeg` e `ffprobe`;
- runtime Python;
- bibliotecas Python necessárias para ingestão, transcrição e TTS;
- modelos locais necessários para o caminho crítico.

Regra operacional:

- nenhuma feature central do beta pode depender de ferramenta pré-instalada no sistema operacional do usuário final;
- `PATH` do sistema deve ser tratado apenas como fallback de desenvolvimento, não como requisito de produto.

### Fase aceita para o beta

A fase aceita para o beta é usar runtimes e binários `standalone` ou embarcados.

Isso significa:

- Electron distribui o shell;
- `vendor/node` sobe API e worker;
- `vendor/ffmpeg` executa tarefas de mídia;
- `vendor/python` executa scripts auxiliares;
- modelos e assets de suporte ficam sob controle do app.

Preparação operacional atual do `vendor`:

- `pnpm prepare:desktop-node`
- `pnpm prepare:desktop-ffmpeg`
- `pnpm prepare:desktop-python`
- `pnpm prepare:desktop-runtime`
- `pnpm clean:desktop-runtime`

Na fase imediata aceita hoje:

- `prepare:desktop-ffmpeg` baixa automaticamente o pacote `standalone` de `ffmpeg`/`ffprobe`;
- `prepare:desktop-python` baixa automaticamente o Python embeddable oficial, instala `yt-dlp` e `faster-whisper`, e pré-baixa o modelo inicial de transcrição;
- `build:desktop` executa `prepare:desktop-runtime` antes do empacotamento.
- `dev:desktop` verifica e prepara o runtime faltante durante a splash screen do Electron.
- no app instalado, `resources/vendor` funciona como seed do instalador e `userData/vendor` funciona como runtime ativo mutável.

Essa decisão foi aceita para reduzir risco de instalação e aumentar previsibilidade do suporte.

### Pendências controladas

Pontos que ficam explicitamente registrados para revisão futura:

- estudar quando vale trocar dependências Python por binários dedicados;
- decidir entre embarcar modelos no instalador ou baixar no primeiro uso;
- medir impacto do tamanho final do instalador;
- ampliar a rotina já existente de verificação e reparo automático de runtimes embarcados para o cenário de aplicação instalada com atualização do próprio app;
- adicionar documentação e diagnóstico de versão das dependências empacotadas.

## Deploy container/lab

Docker pode ser usado em dev/lab, mas não deve ser dependência obrigatoria para usuário final.

Compose deve cobrir:

- API;
- worker;
- volumes de dados;
- envs;
- healthchecks.

Ollama/ComfyUI/TTS podem ficar fora do compose por causa de GPU/drivers.

## Observabilidade

Necessário evoluir:

- logs estruturados por `workspaceId`, `jobId`, `contentItemId`;
- histórico de jobs no DB;
- tela diagnostics;
- health de providers;
- metricas de tempo por etapa;
- erros acionaveis para usuário.
