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
10. [Desktop Local Runtime](docs/12-desktop-local-runtime.md)

## Monorepo

```text
apps/desktop  Electron shell, bootstrap local e runtime instalado
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
pnpm --filter @flowshopy/worker exec playwright install
```

Criar o `.env` raiz a partir do exemplo e ajustar os segredos locais:

```powershell
Copy-Item .env.example .env
```

Valores minimos para dev local:

```env
DATA_DIR=G:\tool\video-automation\data
API_PORT=4110
WORKER_PORT=4111
API_BASE_URL=http://127.0.0.1:4110
WEB_APP_BASE_URL=http://127.0.0.1:4273
INTERNAL_JOBS_EVENT_TOKEN=flowshopy-local-dev-internal-token
AGENT_CONTROL_TOKEN_SECRET=flowshopy-local-dev-agent-token
```

Configurar frontend dev:

```text
apps/web/.env.local
VITE_API_BASE=http://127.0.0.1:4110
```

Use o mesmo host no navegador e no `VITE_API_BASE`. Por exemplo, se
`VITE_API_BASE` usa `127.0.0.1`, abra a web em `http://127.0.0.1:4273`.
Misturar `localhost` na web com `127.0.0.1` na API pode impedir o cookie de
sessao de ser enviado em algumas chamadas.

## Runtime alvo

O runtime principal agora e `desktop local-first`.

Modelo:

```text
Electron shell
  -> UI local
  -> API local
  -> worker local
  -> SQLite/assets/providers locais
  -> cloud opcional para licenca, sync e updates
```

## Rodar localmente

Suba os processos em terminais separados.

### Modo desktop recomendado

```powershell
pnpm dev:desktop
```

Esse comando sobe:

- Vite para `apps/web`
- Electron em `apps/desktop`
- API local
- worker local

### Modo backend/web separado

Se precisar depurar os processos individualmente:

API:

```powershell
npm run dev:api
```

Web:

```powershell
npm run dev:web
```

Worker:

```powershell
npm run dev:worker
```

URLs usadas no desenvolvimento atual:

```text
web:    http://127.0.0.1:4273/
api:    http://127.0.0.1:4110
worker: http://127.0.0.1:4111
```

## Build desktop

Build da interface usada pelo shell:

```powershell
pnpm build:desktop
```

Empacotamento instalavel:

```powershell
pnpm dist:desktop
```

## App settings

As configuracoes runtime do aplicativo ficam em `APP_SETTINGS_PATH`, por padrao
`data/app_settings.json`. Esse arquivo e gerado automaticamente quando a API ou
o worker iniciam e nao deve ser versionado, porque pode conter chaves de API.

O template versionado fica fora de `data`:

```text
config/app_settings.template.json
```

Ele contem apenas valores nao criticos: URLs locais, modelos padrao, timeouts,
tema, TTS, ComfyUI e memoria. As chaves de provedores externos ficam vazias no
template e devem ser preenchidas pela tela Settings ou diretamente no arquivo
local de desenvolvimento.

Formato atual do bloco LLM:

```json
{
  "llm": {
    "provider": "gemini",
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434",
        "model": "llama3.2:3b",
        "timeoutMs": 600000
      },
      "gemini": {
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemma-4-26b-a4b-it",
        "apiKey": "",
        "timeoutMs": 600000
      }
    }
  }
}
```

Na inicializacao, a aplicacao:

- cria `data/` se a pasta nao existir;
- cria `data/app_settings.json` a partir do template se o arquivo nao existir;
- normaliza formatos antigos para `llm.providers.<provider>`;
- preserva chaves ja preenchidas no arquivo local;
- registra `app_settings_secret_missing` se o provedor ativo exigir chave e ela
  ainda estiver vazia.

Para recriar o arquivo local a partir do template, apague apenas
`data/app_settings.json` e reinicie a API ou o worker. O arquivo sera gerado de
novo sem segredos.

## Worker, agent e pareamento

O `apps/worker` e o processo local que executa as tarefas pesadas e/ou
dependentes da maquina: geracao de blocos, audio/TTS, imagens, slides, video
final, leitura de arquivos gerados e chamadas a providers locais como Ollama,
ComfyUI e XTTS.

No desenho novo, isso nao e mais a narrativa principal do produto. O fluxo
padrao deve ser `desktop -> API local -> worker local`. O pareamento remoto
permanece como infraestrutura herdada/futura para cenarios distribuidos, nao
como prerequisito do modo instalado local-first.

Para a API conseguir enviar comandos para esse processo, o worker precisa estar
pareado com um workspace. Esse worker pareado e chamado de `agent`.

O pareamento gera tres credenciais que devem ficar no `.env` raiz:

```env
AGENT_CONTROL_TOKEN=
WORKSPACE_ID=
AGENT_ID=
```

Sem `WORKSPACE_ID` e `AGENT_ID`, o worker ainda sobe o endpoint de health em
`http://127.0.0.1:4111/health`, mas ele nao entra no canal de controle da API.
Nesse caso a API retorna `agent_offline` quando a web tenta gerar audio, imagem,
slides, video ou consultar arquivos do worker.

Log tipico de worker nao pareado:

```text
agent_control_connection_failed
reason: missing_agent_identity_or_token
has_api_base_url: true
has_agent_control_token: true
has_workspace_id: false
has_agent_id: false
```

### Como parear o worker local

1. Suba a API:

```powershell
npm run dev:api
```

2. Em outro terminal, gere as credenciais. Ajuste email/senha conforme o usuario
local:

```powershell
$api = "http://127.0.0.1:4110"
$email = "seu-email@exemplo.com"
$password = "sua-senha-local"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Invoke-RestMethod `
  -Method Post `
  -Uri "$api/auth/login" `
  -WebSession $session `
  -ContentType "application/json" `
  -Body (@{
    email = $email
    password = $password
  } | ConvertTo-Json)

$pairing = Invoke-RestMethod `
  -Method Post `
  -Uri "$api/agent-control/pairing-token" `
  -WebSession $session

$creds = Invoke-RestMethod `
  -Method Post `
  -Uri "$api/agent-control/validate-worker" `
  -ContentType "application/json" `
  -Body (@{
    pairingToken = $pairing.pairingToken
    label = "local-worker"
    machineFingerprint = "$env:COMPUTERNAME-local-worker"
  } | ConvertTo-Json)

$creds
```

3. Copie os valores retornados para o `.env`:

```env
AGENT_CONTROL_TOKEN=<valor retornado em AGENT_CONTROL_TOKEN>
WORKSPACE_ID=<valor retornado em WORKSPACE_ID>
AGENT_ID=<valor retornado em AGENT_ID>
AGENT_LABEL=local-worker
MACHINE_FINGERPRINT=<mesmo valor usado em machineFingerprint>
```

4. Reinicie o worker:

```powershell
npm run dev:worker
```

Log esperado quando o pareamento esta correto:

```text
agent_control_connected
agent_hello_ack
```

### Observacoes sobre pareamento

- O token de pareamento (`pairingToken`) e de uso unico e expira rapido.
- `AGENT_CONTROL_TOKEN_SECRET` e o segredo da API usado para assinar tokens de
  agent. Ele nao e o token do worker.
- Se `AGENT_CONTROL_TOKEN_SECRET` mudar, refaca o pareamento, porque os tokens
  antigos deixam de ser validos.
- `INTERNAL_JOBS_EVENT_TOKEN` precisa existir na API e no worker, mas ele nao
  substitui `WORKSPACE_ID` e `AGENT_ID`.
- Se o erro `agent_offline` aparecer, confira primeiro se o log do worker mostra
  `agent_control_connected`. Se mostrar `agent_control_skipped`, ainda falta
  credencial no `.env`.

## Validar

```powershell
pnpm --filter @flowshopy/api typecheck
pnpm --filter @flowshopy/web typecheck
pnpm --filter @flowshopy/worker typecheck
pnpm verify:critical
pnpm --filter @flowshopy/api run test:one -- test/content-cope-flow.test.ts
```

## Pendencias tecnicas

- Mover chaves de providers externos, como Gemini e OpenAI, do arquivo
  `data/app_settings.json` para armazenamento persistido na base com criptografia
  ou envelope encryption. Enquanto isso, tratar `data/app_settings.json` como
  segredo local de desenvolvimento. Esse arquivo e ignorado pelo git.

## Regra importante

`G:\tool\flowshopy` foi usado como referencia tecnica historica. Nao editar esse projeto.

Toda implementacao ativa deve acontecer neste repositorio:

```text
G:\tool\video-automation
```
