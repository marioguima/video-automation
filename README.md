# FlowShopy

FlowShopy e uma plataforma content-first para transformar ideias, roteiros e fontes de conteudo em videos publicaveis para multiplas plataformas.

O produto segue COPE: Create Once, Publish Everywhere.

Na V1, a saida prioritaria e video. O core e:

```text
conteudo -> roteiro -> cenas -> assets -> variantes -> video final
```

## Documentacao ativa

A documentacao canonica fica em [docs/README.md](docs/README.md).

Leia nessa ordem:

1. [Product Vision](docs/01-product-vision.md)
2. [Product Specification](docs/02-product-specification.md)
3. [Technical Architecture](docs/03-technical-architecture.md)
4. [Development and Operations](docs/04-development-and-operations.md)
5. [Production Infrastructure](docs/05-production-infrastructure.md)
6. [Integrations and External Services](docs/06-integrations-and-external-services.md)
7. [Sales and Distribution Plan](docs/07-sales-and-distribution-plan.md)
8. [Roadmap, Status and Handoff](docs/08-roadmap-status-and-handoff.md)
9. [Decision Log](docs/09-decision-log.md)

## Monorepo

```text
apps/api      Fastify API
apps/web      React/Vite frontend
apps/worker   local job worker
packages/db   Prisma + SQLite
packages/shared shared runtime helpers
```

## Requisitos de desenvolvimento

- Node.js 20+
- pnpm 9+
- PowerShell 7 no Windows
- SQLite local via Prisma
- ffmpeg/ffprobe
- Playwright browsers
- providers conforme uso:
  - Ollama ou Gemini para LLM
  - ComfyUI para imagem
  - XTTS/Chatterbox/Qwen para TTS

## Setup rapido

```powershell
pnpm install
pnpm --filter @vizlec/worker exec playwright install
```

Configurar frontend dev:

```text
apps/web/.env.local
VITE_API_BASE=http://127.0.0.1:4110
```

## Rodar localmente

API:

```powershell
pnpm --filter @vizlec/api dev
```

Worker:

```powershell
pnpm --filter @vizlec/worker dev
```

Web:

```powershell
pnpm --dir apps\web dev -- --host 127.0.0.1 --port 4273
```

URLs usadas no desenvolvimento atual:

```text
web:    http://127.0.0.1:4273/
api:    http://127.0.0.1:4110
worker: http://127.0.0.1:4111
```

## Validar

```powershell
pnpm --filter @vizlec/api typecheck
pnpm --filter @vizlec/web typecheck
pnpm --filter @vizlec/worker typecheck
pnpm verify:critical
pnpm --filter @vizlec/api run test:one -- test/content-cope-flow.test.ts
```

## Regra importante

`G:\tool\vizlec` foi usado como referencia tecnica historica. Nao editar esse projeto.

Toda implementacao ativa deve acontecer neste repositorio:

```text
G:\tool\video-automation
```

