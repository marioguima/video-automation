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

## Instalar dependências

```powershell
pnpm install
```

Instalar browsers Playwright:

```powershell
pnpm --filter @flowshopy/worker exec playwright install
```

## Banco e dados

Banco dev atual:

```text
data/data.db
```

Variavel recomendada para dev local:

```text
FLOWSHOPY_DB_URL=file:G:/tool/video-automation/data/data.db
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
pnpm --filter @flowshopy/api dev
```

Worker:

```powershell
pnpm --filter @flowshopy/worker dev
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

Usuário dev:

```text
email: marioguimaraes@flowshopy.com
senha: TempPass123!
```

Se a senha precisar ser resetada, usar script local com Prisma/argon2 apontando para `data/data.db`.

## Validação

Typecheck API:

```powershell
pnpm --filter @flowshopy/api typecheck
```

Typecheck web:

```powershell
pnpm --filter @flowshopy/web typecheck
```

Typecheck worker:

```powershell
pnpm --filter @flowshopy/worker typecheck
```

Verificacao crítica:

```powershell
pnpm verify:critical
```

Teste COPE:

```powershell
pnpm --filter @flowshopy/api run test:one -- test/content-cope-flow.test.ts
```

Build web:

```powershell
pnpm --filter @flowshopy/web build
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
- não assuma erro de codigo sem reproduzir localmente.

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
registra eventos JSONL por job, incluindo segmentação, TTS, imagem, render e falhas por bloco,
para permitir diagnóstico sem depender apenas do console.

Os timestamps desses arquivos devem ser gravados no horario local real do processo, com offset
explícito, por exemplo `2026-05-02T19:22:36.452-03:00` no Brasil.
`WORKER_LOG_DIR` pode sobrescrever esse diretório quando for necessário.

## Fluxo de trabalho recomendado

1. Ler `docs/08-roadmap-status-and-handoff.md`.
2. Ler a específicacao do que será alterado.
3. Fazer mudancas pequenas.
4. Rodar typecheck do pacote alterado.
5. Rodar teste relacionado.
6. Atualizar docs se mudar decisao/contrato.
7. Atualizar status/handoff.

## Regras de implementação

- Não editar `G:\tool\flowshopy`.
- Não remover `Course/Module/Lesson` ainda.
- Não fazer rename fisico grande sem fase planejada.
- Preferir metadata para prototipar campos ainda instaveis.
- Criar migrations somente quando contrato estiver claro.
- Preservar fluxo legado de curso enquanto FlowShopy evolui.
