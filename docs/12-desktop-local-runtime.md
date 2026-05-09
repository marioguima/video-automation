# Desktop Local Runtime

## Objetivo

O produto passa a assumir `local execution first`.

Isso significa:

- a experiência principal roda como aplicação instalada;
- processamento pesado fica na máquina do cliente;
- a nuvem deixa de ser dependência do caminho crítico de geração;
- servicos cloud viram `control plane`, não `execution plane`.

## Arquitetura alvo

```text
Electron Desktop Shell
  -> React UI local
  -> API local Fastify
  -> Worker local
  -> SQLite + filesystem local
  -> ffmpeg / Playwright / providers locais
  -> cloud control plane opcional
```

## Responsabilidades por camada

### Desktop shell

Responsável por:

- iniciar a aplicação instalada;
- resolver o diretório local de runtime;
- subir API e worker locais;
- abrir a UI;
- encerrar processos locais junto com a aplicação;
- concentrar integrações desktop futuras, como atualização, licença e diagnóstico.

Implementação atual:

- `apps/desktop/main.mjs`
- `apps/desktop/preload.mjs`

### UI local

Responsável por:

- edição de projetos, conteúdos e blocos;
- monitoramento de jobs;
- configuração de providers;
- preview;
- diagnóstico operacional.

Implementação atual:

- `apps/web`

### API local

Responsável por:

- sessão local e autenticação do produto instalado;
- regras de domínio;
- persistencia em SQLite;
- criação e acompanhamento de jobs;
- stream de progresso para a UI;
- fachada única para a interface.

Implementação atual:

- `apps/api`

### Worker local

Responsável por:

- segmentação;
- TTS;
- geração de imagem;
- render de slide;
- render de vídeo;
- acesso a providers e binários locais;
- gravação de assets e logs técnicos.

Implementação atual:

- `apps/worker`

### Control plane cloud

Responsável por:

- login;
- licença;
- atualização de versão;
- sync opcional;
- telemetria opcional;
- distribuição de catálogos e presets;
- suporte remoto futuro.

Não fica no caminho crítico de:

- render;
- ffmpeg;
- Playwright;
- TTS;
- geração de imagem;
- leitura/escrita de assets locais.

## Decisões técnicas aplicadas

- a UI desktop usa Electron;
- o frontend web continua em `apps/web`;
- a API continua separada do worker, mas ambos sobem localmente como runtime interno;
- `apps/web` agora gera build com `base: "./"` para suportar `file://`;
- o fallback de `API_BASE` no frontend volta para `127.0.0.1` mesmo quando a UI abre fora de um host HTTP;
- o shell desktop sobe `apps/api/src/index.ts` e `apps/worker/src/index.ts` localmente com `tsx`;
- desenvolvimento e distribuição usam runtime Node real para backend local, não a ABI do Electron para `api` e `worker`;
- o build desktop prepara um `node.exe` embarcado em `apps/desktop/vendor/node` para ser incluido no instalador;
- `DATA_DIR` virou override técnico opcional;
- no desktop, o runtime local usa `app.getPath("userData")/data` por padrão;
- fora do desktop, o fallback padrão e `<repo-root>/data`;
- portas do runtime desktop ficam em `desktop.runtime.json`;
- segredos internos do runtime desktop são gerados no primeiro boot e persistidos localmente.

## O que fica onde

### Fica local

- `apps/desktop`
- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/db`
- `packages/shared`
- SQLite
- assets gerados
- logs
- cache
- ffmpeg
- Playwright
- providers locais

### Fica cloud

- licenciamento
- conta do usuário
- catálogo de updates
- sync e backup opcionais
- distribuição de configurações globais

### Pode existir nos dois lados

- metadata de projeto
- catálogo de presets
- configurações não sensíveis

Regra:

- o cloud coordena;
- a máquina local executa.

## Fluxo de execução

```text
Abrir app desktop
  -> shell resolve dataDir local
  -> shell sobe API local
  -> shell sobe worker local
  -> shell aguarda healthchecks
  -> shell carrega UI
  -> UI fala com API local
  -> API cria jobs locais
  -> worker executa jobs locais
  -> UI acompanha progresso via WS/SSE local
```

## Modelo de evolução

### Ja implementado agora

- app Electron em `apps/desktop`;
- script `pnpm dev:desktop`;
- script `pnpm build:desktop`;
- script `pnpm dist:desktop`;
- script `pnpm prepare:desktop-node`;
- inicialização local de API e worker pelo shell;
- carregamento da UI instalada via Electron;
- documentação do modo local-first.

### Próximo trabalho técnico no mesmo trilho

1. reduzir dependências do modelo distribuido antigo no caminho principal;
2. separar com mais clareza endpoints exclusivamente locais dos endpoints de control plane;
3. criar tela de diagnóstico desktop para status de API, worker e providers;
4. mover credenciais comerciais e de licença para integração cloud específica;
5. introduzir atualização de aplicação e sync opcional;
6. remover o pareamento como requisito para fluxo local padrão.

## Plano de execução direto

Esse plano não e de análise lenta por fases. Ele é a decomposição do trabalho para continuar implementando de forma agressiva.

### Trilha 1: runtime local

- manter Electron como entrypoint oficial;
- estabilizar bootstrap local de API e worker;
- persistir logs do shell desktop;
- adicionar restart de runtime e diagnostics.

### Trilha 2: simplificacao da API

- identificar endpoints que ainda assumem agent remoto;
- criar caminho local-first sem dependência de pareamento;
- preservar os contratos da UI enquanto o backend interno simplifica.

### Trilha 3: worker como engine local

- tratar `apps/worker` como engine do produto instalado;
- remover premissas de descoberta de máquina para execução normal;
- manter websocket/controle remoto apenas como extensao futura, não como prerequisito.

### Trilha 4: empacotamento

- consolidar `electron-builder`;
- distribuir instalador `.exe` como artefato principal para Windows;
- incluir shell Electron + UI build + backend local + runtime Node embarcado;
- validar distribuição Windows;
- incluir runtime, frontend build, schema Prisma e dependências locais necessarias;
- adicionar processo de release instalavel.

## Distribuição recomendada

Objetivo de experiência:

- usuário recebe um instalador `.exe`;
- instala com próximo/próximo/concluir;
- abre o app;
- configura providers;
- usa.

Conteúdo do instalador:

- shell Electron;
- frontend build;
- `apps/api`;
- `apps/worker`;
- `packages/shared`;
- `packages/db`;
- `node_modules` necessários;
- runtime Node embarcado para subir `api` e `worker`;
- arquivos de configuração versionados.

Conteúdo que não deve ir preconfigurado no git:

- banco do usuário;
- assets gerados;
- segredos do cliente;
- configurações locais sensíveis.

## Resultado esperado

O repositório deixa de ter como narrativa principal um site controlando um worker remoto. A narrativa principal passa a ser:

```text
produto instalado
  -> interface local
  -> backend local
  -> processamento local pesado
  -> cloud opcional para controle e distribuicao
```
