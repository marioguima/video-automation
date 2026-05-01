# FlowShopy Production Infrastructure

## Estrategia de distribuicao tecnica

FlowShopy deve suportar tres modos:

1. Local-first desktop/self-hosted.
2. Self-hosted em servidor/lab.
3. SaaS/control plane futuro com workers/agentes locais.

A V1 deve priorizar local-first porque geracao de video, imagem e TTS pode ter custo alto de GPU/API.

## Componentes em producao

### Frontend

- React/Vite build estatico;
- servido por API, servidor web ou container;
- deve apontar para API via env/config.

### API

- Node.js/Fastify;
- autentica usuarios;
- gerencia workspaces;
- gerencia projetos/conteudos/jobs/settings;
- expõe WebSocket/HTTP para worker/agente.

### Worker

- Node.js;
- executa jobs pesados;
- acessa LLM/TTS/ComfyUI/ffmpeg/Playwright;
- deve rodar proximo da GPU/servicos locais.

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

Requisitos minimos:

- CPU moderna;
- 16 GB RAM recomendado;
- GPU NVIDIA 8 GB VRAM minimo para fluxos locais com imagem/TTS pesados;
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
- worker em maquina com GPU;
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
- fila cloud para tarefas nao-GPU;
- observabilidade central.

## Variaveis criticas

- `DATA_DIR`
- `VIZLEC_DB_URL`
- `API_HOST`
- `API_PORT`
- `WORKER_PORT`
- `WEB_APP_BASE_URL`
- `API_BASE_URL`
- `AUTH_JWT_SECRET`
- `AUTH_COOKIE_SECURE`
- `INTERNAL_JOBS_EVENT_TOKEN`
- `AGENT_CONTROL_TOKEN_SECRET`
- `OLLAMA_BASE_URL`
- `COMFYUI_BASE_URL`
- `TTS_PROVIDER`
- `XTTS_API_BASE_URL`
- `APP_SETTINGS_PATH`
- `COMFY_SETTINGS_PATH`

## HTTPS e seguranca

Producao deve usar:

- HTTPS obrigatorio;
- cookies secure;
- secrets fortes;
- CORS restrito;
- backups criptografados quando possivel;
- nao salvar API keys em texto aberto no longo prazo;
- mascarar secrets na UI/logs;
- separar workspaces logicamente.

## Backup

Backup minimo V1:

- `DATA_DIR/vizlec.db`;
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
- healthcheck de dependencias;
- abrir UI;
- logs simples;
- configurador de providers;
- atualizacao do app.

## Deploy container/lab

Docker pode ser usado em dev/lab, mas nao deve ser dependencia obrigatoria para usuario final.

Compose deve cobrir:

- API;
- worker;
- volumes de dados;
- envs;
- healthchecks.

Ollama/ComfyUI/TTS podem ficar fora do compose por causa de GPU/drivers.

## Observabilidade

Necessario evoluir:

- logs estruturados por `workspaceId`, `jobId`, `contentItemId`;
- historico de jobs no DB;
- tela diagnostics;
- health de providers;
- metricas de tempo por etapa;
- erros acionaveis para usuario.

