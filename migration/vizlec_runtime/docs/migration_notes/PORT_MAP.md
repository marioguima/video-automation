# Port Map (Vizlec -> Video Automation)

Status: `WIP`

## Regras

- `copiar`: trazer snapshot para referência/adaptação.
- `adaptar`: portar para o projeto com mudanças de domínio/fluxo.
- `adiar`: não entra no MVP imediato.

## Frontend (vizlec web)

| Origem (`vizlec`) | Destino (este repo) | Ação | Prioridade | Observações |
|---|---|---|---|---|
| `apps/web/src/components/Editor.tsx` | `frontend/...` (novo editor de vídeo) | adaptar | P0 | Núcleo do fluxo de blocos/áudio; remover dependência de `on-screen` no MVP |
| `apps/web/src/components/VoiceSelectorModal.tsx` | `frontend/...` | adaptar | P0 | Reaproveitável para TTS por bloco/lote |
| `apps/web/src/lib/api.ts` | `frontend/lib/...` | adaptar | P0 | Ajustar rotas de `lesson` -> `video` |
| `apps/web/src/types.ts` | `frontend/lib/...` | adaptar | P0 | Criar tradução de domínio |
| `apps/web/src/components/ui/*` | `frontend/components/ui/*` | adaptar | P1 | Reaproveitamento visual/UX |
| `apps/web/src/App.tsx` | `frontend/app/*` | adaptar | P1 | Reescrever navegação para `channel -> video` |
| `apps/web/src/components/Courses*.tsx` | `frontend/...` | adaptar | P1 | Renomear para `Channels/Videos` |
| `apps/web/src/components/Library.tsx` | `frontend/...` | adiar | P2 | Útil depois para assets |

## Backend/API (vizlec api)

| Origem (`vizlec`) | Destino (este repo) | Ação | Prioridade | Observações |
|---|---|---|---|---|
| `apps/api/src/index.ts` (endpoints de blocos/TTS/assets/jobs) | `backend/` | adaptar | P0 | Não copiar monolítico; extrair rotas por domínio |
| `packages/db/prisma/schema.prisma` (User/Workspace/Block/Asset/Job) | `backend/` (novo schema ou migração) | adaptar | P0 | Manter auth + multitenancy; mapear domínio vídeo |
| Endpoints `/blocks/:id`, `/.../tts`, `/.../audios`, `/tts/voices` | `backend/api.py` ou novo backend TS | adaptar | P0 | Definir backend-alvo antes de portar |
| Websocket de jobs/notificações | `backend/` | adiar | P1 | MVP local pode iniciar sem WS completo, mas é forte reaproveitamento |

## Engine visual (este projeto)

| Origem (este repo) | Destino | Ação | Prioridade | Observações |
|---|---|---|---|---|
| `backend/effects.py` | manter | manter | P0 | T6 e motions já aprovados |
| `backend/transitions.py` | manter | manter | P0 | `XF3b` white/black premium |
| `backend/main.py` | manter | adaptar | P0 | Integrar com jobs/assets persistidos |
| `backend/llm/*` | manter | manter | P0 | Motor de prompts por bloco |

## MVP simplificação (decisão ativa)

- `on-screen` fora do MVP.
- Legenda é o texto principal em tela.
- Reintroduzir `on-screen` depois como recurso opcional por tipo de vídeo.

## Status da migração (iniciado)

- [x] Snapshot frontend importado (`Editor`, `VoiceSelectorModal`, `api.ts`, `types.ts`)
- [x] Snapshot schema Prisma importado (`packages/db/prisma/schema.prisma`)
- [x] Inventário inicial de endpoints extraído (`apps/api/src/ENDPOINTS_INDEX.txt`)
- [x] `Editor` (snapshot de migração) com flag para desabilitar bloqueios de `on-screen` no MVP
- [ ] Próximo: criar adapter de domínio (`lesson/version/block` -> `video/version/block`)
