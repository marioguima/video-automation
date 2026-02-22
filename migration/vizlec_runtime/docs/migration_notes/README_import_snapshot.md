# Vizlec Import (Kernel Port - WIP)

Objetivo: trazer o kernel do `vizlec` para este projeto de forma incremental, mantendo o frontend/UX e a base de dados/jobs, enquanto o motor visual/ffmpeg continua vindo deste repositório.

## Escopo desta pasta (inicio)

- Snapshot de arquivos-chave do frontend do `vizlec` para adaptação local.
- Referência de contratos e componentes antes da recontextualização (`course/module/lesson` -> `channel/video`).

## Arquivos copiados (primeira leva)

- `apps/web/src/components/Editor.tsx`
- `apps/web/src/components/VoiceSelectorModal.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/types.ts`

## Estratégia de adaptação (ordem)

1. Rodar/entender o kernel de edição e revisão de blocos.
2. Remover dependência de `on-screen` no fluxo de vídeo (legenda como padrão).
3. Criar camada de compatibilidade de domínio (`lesson` -> `video`) temporária.
4. Integrar backend/API deste projeto (LLM + ffmpeg cinematic pipeline).
5. Recontextualizar UI/rotas para `channel -> video`.

## Observações

- Esta pasta é uma área de migração e referência. Não é a integração final.
- A integração final pode mover código adaptado para `frontend/` e/ou `backend/`.
