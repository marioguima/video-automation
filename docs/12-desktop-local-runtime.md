# Desktop Local Runtime

## Objetivo

O produto passa a assumir `local execution first`.

Isso significa:

- a experiencia principal roda como aplicacao instalada;
- processamento pesado fica na maquina do cliente;
- a nuvem deixa de ser dependencia do caminho critico de geracao;
- servicos cloud viram `control plane`, nao `execution plane`.

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

Responsavel por:

- iniciar a aplicacao instalada;
- definir `DATA_DIR` local;
- subir API e worker locais;
- abrir a UI;
- encerrar processos locais junto com a aplicacao;
- concentrar integracoes desktop futuras, como atualizacao, licenca e diagnostico.

Implementacao atual:

- `apps/desktop/main.mjs`
- `apps/desktop/preload.mjs`

### UI local

Responsavel por:

- edicao de projetos, conteudos e blocos;
- monitoramento de jobs;
- configuracao de providers;
- preview;
- diagnostico operacional.

Implementacao atual:

- `apps/web`

### API local

Responsavel por:

- sessao local e autenticacao do produto instalado;
- regras de dominio;
- persistencia em SQLite;
- criacao e acompanhamento de jobs;
- stream de progresso para a UI;
- fachada unica para a interface.

Implementacao atual:

- `apps/api`

### Worker local

Responsavel por:

- segmentacao;
- TTS;
- geracao de imagem;
- render de slide;
- render de video;
- acesso a providers e binarios locais;
- gravacao de assets e logs tecnicos.

Implementacao atual:

- `apps/worker`

### Control plane cloud

Responsavel por:

- login;
- licenca;
- atualizacao de versao;
- sync opcional;
- telemetria opcional;
- distribuicao de catalogos e presets;
- suporte remoto futuro.

Nao fica no caminho critico de:

- render;
- ffmpeg;
- Playwright;
- TTS;
- geracao de imagem;
- leitura/escrita de assets locais.

## Decisoes tecnicas aplicadas

- a UI desktop usa Electron;
- o frontend web continua em `apps/web`;
- a API continua separada do worker, mas ambos sobem localmente como runtime interno;
- `apps/web` agora gera build com `base: "./"` para suportar `file://`;
- o fallback de `API_BASE` no frontend volta para `127.0.0.1` mesmo quando a UI abre fora de um host HTTP;
- o shell desktop sobe `apps/api/src/index.ts` e `apps/worker/src/index.ts` localmente com `tsx`;
- desenvolvimento e distribuicao usam runtime Node real para backend local, nao a ABI do Electron para `api` e `worker`;
- o build desktop prepara um `node.exe` embarcado em `apps/desktop/vendor/node` para ser incluido no instalador;
- `DATA_DIR` do desktop usa `app.getPath("userData")` quando nao houver `DATA_DIR` explicito.

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
- conta do usuario
- catalogo de updates
- sync e backup opcionais
- distribuicao de configuracoes globais

### Pode existir nos dois lados

- metadata de projeto
- catalogo de presets
- configuracoes nao sensiveis

Regra:

- o cloud coordena;
- a maquina local executa.

## Fluxo de execucao

```text
Abrir app desktop
  -> shell define DATA_DIR
  -> shell sobe API local
  -> shell sobe worker local
  -> shell aguarda healthchecks
  -> shell carrega UI
  -> UI fala com API local
  -> API cria jobs locais
  -> worker executa jobs locais
  -> UI acompanha progresso via WS/SSE local
```

## Modelo de evolucao

### Ja implementado agora

- app Electron em `apps/desktop`;
- script `pnpm dev:desktop`;
- script `pnpm build:desktop`;
- script `pnpm dist:desktop`;
- script `pnpm prepare:desktop-node`;
- inicializacao local de API e worker pelo shell;
- carregamento da UI instalada via Electron;
- documentacao do modo local-first.

### Proximo trabalho tecnico no mesmo trilho

1. reduzir dependencias do modelo distribuido antigo no caminho principal;
2. separar com mais clareza endpoints exclusivamente locais dos endpoints de control plane;
3. criar tela de diagnostico desktop para status de API, worker e providers;
4. mover credenciais comerciais e de licenca para integracao cloud especifica;
5. introduzir atualizacao de aplicacao e sync opcional;
6. remover o pareamento como requisito para fluxo local padrao.

## Plano de execucao direto

Esse plano nao e de analise lenta por fases. Ele e a decomposicao do trabalho para continuar implementando de forma agressiva.

### Trilha 1: runtime local

- manter Electron como entrypoint oficial;
- estabilizar bootstrap local de API e worker;
- persistir logs do shell desktop;
- adicionar restart de runtime e diagnostics.

### Trilha 2: simplificacao da API

- identificar endpoints que ainda assumem agent remoto;
- criar caminho local-first sem dependencia de pareamento;
- preservar os contratos da UI enquanto o backend interno simplifica.

### Trilha 3: worker como engine local

- tratar `apps/worker` como engine do produto instalado;
- remover premissas de descoberta de maquina para execucao normal;
- manter websocket/controle remoto apenas como extensao futura, nao como prerequisito.

### Trilha 4: empacotamento

- consolidar `electron-builder`;
- distribuir instalador `.exe` como artefato principal para Windows;
- incluir shell Electron + UI build + backend local + runtime Node embarcado;
- validar distribuicao Windows;
- incluir runtime, frontend build, schema Prisma e dependencias locais necessarias;
- adicionar processo de release instalavel.

## Distribuicao recomendada

Objetivo de experiencia:

- usuario recebe um instalador `.exe`;
- instala com proximo/proximo/concluir;
- abre o app;
- configura providers;
- usa.

Conteudo do instalador:

- shell Electron;
- frontend build;
- `apps/api`;
- `apps/worker`;
- `packages/shared`;
- `packages/db`;
- `node_modules` necessarios;
- runtime Node embarcado para subir `api` e `worker`;
- arquivos de configuracao versionados.

Conteudo que nao deve ir preconfigurado no git:

- banco do usuario;
- assets gerados;
- segredos do cliente;
- configuracoes locais sensiveis.

## Resultado esperado

O repositorio deixa de ter como narrativa principal um site controlando um worker remoto. A narrativa principal passa a ser:

```text
produto instalado
  -> interface local
  -> backend local
  -> processamento local pesado
  -> cloud opcional para controle e distribuicao
```
