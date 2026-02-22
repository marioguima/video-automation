# Vizlec Runtime (Sandbox de Migracao)

Objetivo: rodar o kernel original do `vizlec` dentro de `migration/vizlec_runtime` sem alterar o dominio (`course/module/lesson`).

## Portas desta copia (isoladas)
- API: `4110`
- Web: `4273`
- Worker (se subir depois): `4111`

## Instalar dependencias
```powershell
pnpm install
```

## Rodar API
```powershell
pnpm --filter @vizlec/api dev
```

## Rodar Web (porta fixa do sandbox)
```powershell
pnpm dev:web:sandbox
```

## Scripts prontos (sandbox)
```powershell
pnpm dev:api:sandbox
pnpm dev:web:sandbox
pnpm dev:worker:sandbox
```

## Healthcheck
```powershell
Invoke-WebRequest http://127.0.0.1:4110/health -UseBasicParsing
```

## Pareamento do Worker (workspace correto)

Se `/tts/voices`, `/images`, `/audios` etc. retornarem `503 {"error":"agent_offline"}` mesmo com worker rodando,
o worker provavelmente esta conectado com `WORKSPACE_ID/AGENT_ID/TOKEN` de outro workspace (copiados do `.env` original).

### 1) Gerar `pairingToken` (no navegador, logado na UI)

Abra o `vizlec` em `http://127.0.0.1:4273`, faca login e rode no **Console do navegador (DevTools)**:

```js
await fetch('http://127.0.0.1:4110/agent-control/pairing-token', {
  method: 'POST',
  credentials: 'include'
}).then(async (r) => ({ status: r.status, body: await r.json() }))
```

Copie o valor `pairingToken` retornado.

### 2) Validar o worker e gerar credenciais (PowerShell)

```powershell
$body = @{
  pairingToken = "ptk_COLE_AQUI"
  machineFingerprint = "video-automation-local-01"
  label = "Minha maquina local"
} | ConvertTo-Json

$res = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:4110/agent-control/validate-worker" `
  -ContentType "application/json" `
  -Body $body

$res | Format-List *
```

Observacoes:
- `pairingToken` e de **uso unico** (se reutilizar, falha).
- `machineFingerprint` deve ser estavel para a mesma maquina.

### 3) Atualizar `.env` do sandbox (`migration/vizlec_runtime/.env`)

Substitua os valores com os retornados em `$res`:

```env
AGENT_CONTROL_TOKEN=...
WORKSPACE_ID=...
AGENT_ID=...
API_BASE_URL=http://127.0.0.1:4110
MACHINE_FINGERPRINT=video-automation-local-01
AGENT_LABEL=Minha maquina local
```

### 4) Reiniciar API e Worker

```powershell
pnpm dev:api:sandbox
pnpm dev:worker:sandbox
```

### 5) Validacao

- No log do worker, deve aparecer conexao com `agent_control_connected` e depois handshake (sem `ws_startup_timeout`).
- Na UI, requests como `/tts/voices` devem parar de retornar `agent_offline`.

Observacao:
- Esta fase e propositalmente no contexto original (`course/module/lesson`).
- A migracao para `channel/video` vem depois que este runtime estiver validado.
