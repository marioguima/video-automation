# FlowShopy Development and Operations

## Ambiente local

Requisitos:

- Windows como ambiente principal atual;
- Node.js 20+;
- pnpm 9.12.3;
- PowerShell 7 recomendado;
- SQLite local via Prisma;
- ffmpeg/ffprobe;
- Playwright browsers;
- servicos locais conforme features usadas:
  - Ollama;
  - ComfyUI;
  - XTTS/Chatterbox/Qwen TTS.

## Instalar dependencias

```powershell
pnpm install
```

Instalar browsers Playwright:

```powershell
pnpm --filter @vizlec/worker exec playwright install
```

## Banco e dados

Banco dev atual:

```text
data/vizlec.db
```

Variavel recomendada para dev local:

```text
VIZLEC_DB_URL=file:G:/tool/video-automation/data/vizlec.db
```

`DATA_DIR` deve apontar para:

```text
G:\tool\video-automation\data
```

## Portas de desenvolvimento usadas

Frontend:

```text
http://127.0.0.1:4273/
```

API:

```text
http://127.0.0.1:4110
```

Worker:

```text
http://127.0.0.1:4111
```

Frontend deve ter:

```text
apps/web/.env.local
VITE_API_BASE=http://127.0.0.1:4110
```

## Rodar

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

Usuario dev:

```text
email: marioguimaraes@vizlec.com
senha: TempPass123!
```

Se a senha precisar ser resetada, usar script local com Prisma/argon2 apontando para `data/vizlec.db`.

## Validacao

Typecheck API:

```powershell
pnpm --filter @vizlec/api typecheck
```

Typecheck web:

```powershell
pnpm --filter @vizlec/web typecheck
```

Typecheck worker:

```powershell
pnpm --filter @vizlec/worker typecheck
```

Verificacao critica:

```powershell
pnpm verify:critical
```

Teste COPE:

```powershell
pnpm --filter @vizlec/api run test:one -- test/content-cope-flow.test.ts
```

Build web:

```powershell
pnpm --filter @vizlec/web build
```

## Problemas conhecidos em sandbox

Em alguns ambientes, comandos que usam subprocessos podem falhar com:

- `spawn EPERM`;
- bloqueio do binario nativo Rollup;
- bloqueio do esbuild;
- falhas no `node:test`.

Se isso ocorrer:

- rode pacotes individualmente;
- valide fora do sandbox quando permitido;
- nao assuma erro de codigo sem reproduzir localmente.

## Logs

Logs usados em dev:

```text
tmp/api-4110.log
tmp/worker-4111.log
tmp/web-4273.log
```

Logs persistidos pelo worker fora de `DATA_DIR`:

```text
logs/worker-actions.log
logs/worker-job-events.log
```

`worker-actions.log` registra eventos operacionais gerais do worker. `worker-job-events.log`
registra eventos JSONL por job, incluindo segmentacao, TTS, imagem, render e falhas por bloco,
para permitir diagnostico sem depender apenas do console.

Os timestamps desses arquivos devem ser gravados no horario local real do processo, com offset
explicito, por exemplo `2026-05-02T19:22:36.452-03:00` no Brasil.
`WORKER_LOG_DIR` pode sobrescrever esse diretorio quando for necessario.

## Fluxo de trabalho recomendado

1. Ler `docs/08-roadmap-status-and-handoff.md`.
2. Ler a especificacao do que sera alterado.
3. Fazer mudancas pequenas.
4. Rodar typecheck do pacote alterado.
5. Rodar teste relacionado.
6. Atualizar docs se mudar decisao/contrato.
7. Atualizar status/handoff.

## Regras de implementacao

- Nao editar `G:\tool\vizlec`.
- Nao remover `Course/Module/Lesson` ainda.
- Nao fazer rename fisico grande sem fase planejada.
- Preferir metadata para prototipar campos ainda instaveis.
- Criar migrations somente quando contrato estiver claro.
- Preservar fluxo legado de curso enquanto FlowShopy evolui.
