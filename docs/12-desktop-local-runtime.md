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
- no desktop instalado, o runtime local usa `%LOCALAPPDATA%/FlowShopy Desktop/data` por padrão;
- fora do desktop, o fallback padrão e `<repo-root>/data`;
- portas do runtime desktop ficam em `desktop.runtime.json`;
- segredos internos do runtime desktop são gerados no primeiro boot e persistidos localmente.

Regra importante de implementação atual:

- o desktop instalado não usa `DATA_DIR` mesmo que essa env esteja preenchida;
- quem decide isso hoje é a checagem `isDev()` em `apps/desktop/main.mjs`;
- em desenvolvimento, `DATA_DIR` pode redirecionar `data`;
- no app empacotado, `DATA_DIR` é ignorado e o runtime força `%LOCALAPPDATA%/FlowShopy Desktop/data`.

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

## Ambientes de execução

Esta parte precisa ficar inequívoca: hoje existem dois contextos válidos de teste.

### Ambiente de desenvolvimento

Objetivo:

- validar bootstrap local;
- validar atualização automática do runtime;
- validar integração entre Electron, API, worker e frontend sem precisar empacotar o instalador a cada teste.

Pastas relevantes:

```text
apps/desktop/vendor
  -> runtime ativo em desenvolvimento

data/
  -> banco, configs locais e artefatos de desenvolvimento, salvo override por DATA_DIR

%LOCALAPPDATA%/FlowShopy/electron-session
  -> sessão/cache do Electron em desenvolvimento
```

Comandos principais:

- `pnpm dev:desktop`
- `pnpm prepare:desktop-runtime`
- `pnpm clean:desktop-runtime`

### Ambiente instalado

Objetivo:

- validar a experiência real do produto distribuído;
- validar seed do instalador;
- validar reconstrução e atualização do runtime mutável sem depender do repositório.

Pastas relevantes:

```text
%LOCALAPPDATA%/FlowShopy Desktop/
  data/
    -> banco, configs e artefatos do usuário
  vendor/
    -> runtime ativo e mutável usado por API e worker

resources/vendor
  -> cópia inicial entregue pelo instalador

%LOCALAPPDATA%/FlowShopy/electron-session
  -> sessão/cache local do Electron
```

Comandos principais para teste do app instalado:

- `pnpm dist:desktop`
- `pnpm clean:installed-desktop-runtime`

Regra prática:

- em desenvolvimento, o runtime ativo mora no repositório;
- no app instalado, o runtime ativo mora em `%LOCALAPPDATA%/FlowShopy Desktop/vendor`;
- `resources/vendor` não deve ser tratado como runtime mutável.
- em desenvolvimento, `DATA_DIR` ainda pode alterar o diretório de dados;
- no app instalado, isso não acontece porque o código só respeita `DATA_DIR` quando `isDev()` é verdadeiro.

## Modelo de evolução

### Ja implementado agora

- app Electron em `apps/desktop`;
- script `pnpm dev:desktop`;
- script `pnpm build:desktop`;
- script `pnpm dist:desktop`;
- script `pnpm prepare:desktop-node`;
- script `pnpm prepare:desktop-ffmpeg`;
- script `pnpm prepare:desktop-python`;
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

Esse plano não é de análise lenta por fases. Ele é a decomposição do trabalho para continuar implementando de forma agressiva.

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

## Dependências locais embarcadas

Para o produto instalado funcionar na máquina do usuário final, dependências críticas não podem depender de instalação prévia no sistema operacional.

Regra:

- o app não deve assumir `ffmpeg` no PATH;
- o app não deve assumir `python` no PATH;
- o app não deve assumir bibliotecas Python instaladas globalmente;
- o app não deve assumir que o usuário sabe preparar ambiente técnico.

Dependências que devem ser tratadas como runtime do produto:

- Node runtime do backend local;
- `ffmpeg` e `ffprobe`;
- runtime Python usado por scripts auxiliares;
- bibliotecas Python exigidas por ingestão, transcrição e TTS;
- modelos locais necessários para fluxos offline ou semidependentes de rede.

## Solução imediata do beta

No beta, a direção aceita é usar binários e runtimes `standalone` ou embarcados para tudo que for crítico no fluxo local.

Isso significa:

- manter `apps/api` e `apps/worker` em Node.js local já embarcado;
- embarcar `ffmpeg` e `ffprobe` em pasta `vendor`;
- embarcar runtime Python em pasta `vendor`;
- instalar as bibliotecas Python necessárias dentro desse runtime embarcado;
- resolver caminhos absolutos para esses binários a partir do app instalado;
- nunca depender do Python ou do ffmpeg do sistema do usuário.

Estrutura alvo do empacotamento desktop:

```text
resources/
  vendor/
    node/
    ffmpeg/
      ffmpeg.exe
      ffprobe.exe
    python/
      python.exe
      Lib/
      site-packages/
    models/
      faster-whisper/
```

Separação operacional do runtime:

```text
resources/vendor
  -> cópia inicial entregue pelo instalador

%LOCALAPPDATA%/FlowShopy Desktop/vendor
  -> runtime ativo e mutável usado por API e worker
```

Regra:

- o instalador entrega uma cópia inicial do runtime em `resources/vendor`;
- no primeiro boot, o desktop copia o que faltar para `%LOCALAPPDATA%/FlowShopy Desktop/vendor`;
- a execução local passa a usar `%LOCALAPPDATA%/FlowShopy Desktop/vendor`;
- quando versões, URLs, modelo ou `requirements` divergirem, o desktop reprovisiona o runtime ativo sem depender de editar `resources/vendor`.

No beta, `standalone` aqui significa:

- binário ou runtime distribuído junto com o app;
- caminho conhecido e controlado pelo shell desktop;
- nenhuma exigência de instalação manual de dependência externa pelo usuário final.

Scripts de preparação hoje:

- `pnpm prepare:desktop-node`
- `pnpm prepare:desktop-ffmpeg`
- `pnpm prepare:desktop-python`
- `pnpm prepare:desktop-runtime`
- `pnpm clean:desktop-runtime`
- `pnpm clean:installed-desktop-runtime`

Comportamento atual desses scripts:

- `prepare:desktop-node` copia o runtime Node usado no build;
- `prepare:desktop-ffmpeg` baixa automaticamente um build `standalone` de `ffmpeg` e `ffprobe` para `apps/desktop/vendor/ffmpeg`;
- `prepare:desktop-python` baixa automaticamente o Python embeddable oficial, habilita `site-packages`, instala `yt-dlp` e `faster-whisper`, e pré-baixa o modelo inicial de transcrição em `apps/desktop/vendor/models/faster-whisper`;
- `prepare:desktop-runtime` executa a preparação completa do runtime desktop antes do empacotamento.
- `clean:desktop-runtime` remove `vendor/node`, `vendor/ffmpeg`, `vendor/python` e `vendor/models` para permitir teste do zero.
- `clean:installed-desktop-runtime` remove o runtime ativo do app instalado em `%LOCALAPPDATA%/FlowShopy Desktop/data`, `%LOCALAPPDATA%/FlowShopy Desktop/vendor` e a sessão local do Electron para permitir teste limpo da instalação.

Comportamento no bootstrap desktop em desenvolvimento:

- `pnpm dev:desktop` não depende mais de preparar o runtime antes;
- o shell Electron abre a splash;
- o shell verifica no boot se `node`, `ffmpeg`, `python` e o modelo inicial de transcrição no runtime ativo estão presentes e na versão/configuração esperada;
- essa verificação usa `runtime.json` de cada vendor e, no caso do Python, também compara o hash atual de `apps/worker/python-requirements.txt`;
- se faltar algo ou se a versão/configuração divergir, a splash mostra a etapa atual e o shell executa a atualização automaticamente;
- o gauge da splash avança por etapa, mesmo quando não há percentual exato do download.

Comportamento dos scripts de preparação:

- os downloads e extrações usam diretório temporário do sistema durante a execução;
- a pasta temporária é removida ao final;
- em desenvolvimento, `apps/desktop/vendor` é o runtime ativo;
- no app instalado, o estado persistente mutável do runtime fica em `%LOCALAPPDATA%/FlowShopy Desktop/vendor`.

## Como compilar

### Para desenvolvimento

Usar:

```powershell
pnpm dev:desktop
```

Opcionalmente, para preparar tudo antes:

```powershell
pnpm prepare:desktop-runtime
pnpm dev:desktop
```

### Para gerar instalador

Usar:

```powershell
pnpm dist:desktop
```

Efeito esperado:

- roda `prepare:desktop-runtime`;
- roda o build do frontend;
- gera o instalador desktop em `dist/desktop`.

Observação importante para Windows em desenvolvimento:

- para testes locais do instalador, o empacotamento está configurado com `signAndEditExecutable: false`;
- isso evita depender do pacote `winCodeSign` durante o build local;
- essa configuração é aceitável para validação funcional do instalador;
- assinatura de código real continua sendo uma etapa de release posterior.

## Como limpar e retestar

### Desenvolvimento

Para simular o primeiro boot do runtime local:

```powershell
pnpm clean:desktop-runtime
pnpm dev:desktop
```

O que deve ser removido:

- `apps/desktop/vendor/node`
- `apps/desktop/vendor/ffmpeg`
- `apps/desktop/vendor/python`
- `apps/desktop/vendor/models`
- `%LOCALAPPDATA%/FlowShopy/electron-session` pode permanecer; ele não é o runtime do produto.

### App instalado

Para simular o primeiro boot do app já instalado:

```powershell
pnpm clean:installed-desktop-runtime
```

O que esse script remove:

- `%LOCALAPPDATA%/FlowShopy Desktop/data`
- `%LOCALAPPDATA%/FlowShopy Desktop/vendor`
- `%LOCALAPPDATA%/FlowShopy/electron-session`

Depois disso:

1. abrir o app instalado;
2. observar a splash;
3. confirmar a recriação do runtime ativo em `%LOCALAPPDATA%/FlowShopy Desktop/vendor`.

## O que observar na UI

### Splash

Hoje o principal sinal visual do bootstrap correto está na splash screen.

Mensagens esperadas:

- `Verificando runtimes locais...`
- `Preparando runtime Node local...` quando necessário
- `Baixando runtime de mídia...` quando necessário
- `Preparando runtime Python e transcrição...` quando necessário
- `Preparando banco e arquivos locais...`
- `Iniciando API local...`
- `Conectando worker local...`
- `Aguardando API responder...`
- `Sincronizando worker e serviços locais...`
- `Carregando interface instalada...`
- `Aplicação pronta.`

Leitura correta:

- se o runtime já estiver íntegro, a splash deve passar rápido pela verificação;
- se houver ausência ou divergência, a splash deve gastar tempo nas etapas de preparo;
- o gauge não é percentual real de download por bytes; ele é progresso por etapa operacional.

### Depois da splash

Hoje ainda não existe uma tela dedicada de diagnóstico do runtime no produto.

Portanto, os sinais práticos de sucesso são:

- a UI abre normalmente;
- login e navegação funcionam;
- a tela `Content` abre;
- a criação de conteúdo abre sem erro;
- a API local responde;
- o worker local responde;
- ao iniciar um fluxo de fonte YouTube, a fonte sai de espera e avança de estado.

## O que observar no filesystem

### Desenvolvimento

Depois de `pnpm dev:desktop` em ambiente limpo, deve existir:

```text
apps/desktop/vendor/node
apps/desktop/vendor/ffmpeg
apps/desktop/vendor/python
apps/desktop/vendor/models/faster-whisper
```

### App instalado

Depois de abrir o app instalado com runtime limpo, deve existir:

```text
resources/vendor
  -> cópia inicial do runtime no diretório instalado do app

%LOCALAPPDATA%/FlowShopy Desktop/
  data/
  vendor/
    node/
    ffmpeg/
    python/
    models/
      faster-whisper/
```

## Checklists de validação

### Checklist de desenvolvimento

1. rodar `pnpm clean:desktop-runtime`
2. rodar `pnpm dev:desktop`
3. observar a splash preparar runtimes
4. confirmar criação de `apps/desktop/vendor/*`
5. confirmar que a UI abriu
6. alterar `scripts/desktop-runtime-versions.mjs` ou `apps/worker/python-requirements.txt`
7. rodar `pnpm dev:desktop` novamente
8. confirmar que o vendor afetado foi refeito automaticamente

### Checklist do app instalado

1. rodar `pnpm dist:desktop`
2. instalar o app
3. fechar o app
4. rodar `pnpm clean:installed-desktop-runtime`
5. abrir o app
6. observar a splash reconstruir o runtime ativo
7. confirmar criação de `%LOCALAPPDATA%/FlowShopy Desktop/vendor`
8. confirmar abertura normal da UI

## Falhas conhecidas de empacotamento local

### Erro de `winCodeSign` com symlink no Windows

Se o build falhar com mensagens como:

- `Cannot create symbolic link`
- `O cliente não tem o privilégio necessário`

isso não significa falha do runtime do produto.

Isso significa que o ambiente Windows bloqueou a extração do pacote auxiliar de assinatura do `electron-builder`.

Tratamento adotado agora:

- o empacotamento local de teste desabilita `signAndEditExecutable`;
- isso reduz atrito para validar o instalador funcionalmente.

Se no futuro quisermos assinatura real no build local, as alternativas serão:

- executar com privilégios compatíveis;
- ativar Developer Mode no Windows;
- ou configurar a etapa oficial de assinatura no pipeline de release.

## Quando usar VM

VM não é requisito para validar o fluxo técnico principal.

Use VM quando o objetivo for:

- testar a experiência real em Windows limpo;
- validar ausência total de resíduos de desenvolvimento;
- validar instalação/desinstalação;
- validar permissões e diretórios em perfil de usuário diferente;
- validar comportamento sem histórico local do Electron e sem qualquer runtime remanescente.

Defaults atuais da fase imediata:

- Python embeddable oficial: `3.13.13` 64-bit;
- `ffmpeg` Windows: asset `ffmpeg-master-latest-win64-gpl.zip` da trilha `latest` de `BtbN/FFmpeg-Builds`;
- modelo inicial de transcrição: `small`.

Env vars de override da fase imediata:

- `FLOWSHOPY_FFMPEG_URL`
- `FLOWSHOPY_FFMPEG_ARCHIVE_PATH`
- `FLOWSHOPY_PYTHON_VERSION`
- `FLOWSHOPY_PYTHON_URL`
- `FLOWSHOPY_PYTHON_ARCHIVE_PATH`
- `FLOWSHOPY_GET_PIP_URL`
- `FLOWSHOPY_FASTER_WHISPER_MODEL`

Env vars consumidas pelo runtime desktop:

- `FLOWSHOPY_DESKTOP_VENDOR_DIR`
- `FLOWSHOPY_PYTHON_PATH`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `FLOWSHOPY_FASTER_WHISPER_MODEL`
- `FLOWSHOPY_FASTER_WHISPER_MODEL_DIR`

## Fase imediata aceita para YouTube + transcrição

Para a pipeline inicial de fontes YouTube, a solução imediata aceita é:

1. `yt-dlp` rodando dentro do runtime Python embarcado;
2. `ffmpeg` embarcado para extração de áudio;
3. `faster-whisper` rodando dentro do runtime Python embarcado;
4. modelo de transcrição pré-baixado e controlado pelo app.

No fluxo do produto:

```text
link do YouTube
  -> download do vídeo
  -> extração de áudio
  -> transcrição
  -> texto bruto salvo como fonte pronta
```

Essa é a solução imediata do beta porque entrega valor rápido sem exigir que o usuário prepare máquina manualmente.

## Como testar do zero

Teste de ambiente limpo em desenvolvimento:

1. executar `pnpm clean:desktop-runtime`;
2. confirmar que `apps/desktop/vendor/ffmpeg`, `apps/desktop/vendor/python` e `apps/desktop/vendor/models` foram removidos;
3. executar `pnpm dev:desktop`;
4. observar a splash do desktop;
5. confirmar as mensagens por etapa:
   - verificação de runtimes locais;
   - preparação do runtime Node local, se necessário;
   - download do runtime de mídia;
   - preparação do runtime Python e transcrição;
   - preparação do banco e arquivos locais;
   - inicialização de API e worker;
   - carregamento da interface.

Resultado esperado:

- o runtime é reconstruído automaticamente;
- nenhum `ffmpeg` ou `python` do sistema é necessário;
- ao final da preparação, a UI abre normalmente.

Teste de atualização automática:

1. alterar uma versão ou URL em `scripts/desktop-runtime-versions.mjs`, ou alterar `apps/worker/python-requirements.txt`;
2. executar `pnpm dev:desktop`;
3. observar a splash executar novamente a preparação do vendor afetado.

Resultado esperado:

- o desktop detecta a divergência sem exigir ação manual do usuário;
- o vendor afetado é refeito automaticamente antes da API e do worker subirem.

Teste limpo da aplicação instalada:

1. instalar o app desktop;
2. fechar completamente o app;
3. executar `pnpm clean:installed-desktop-runtime`, ou definir `FLOWSHOPY_USERDATA_DIR` para limpar outra pasta `userData` alvo;
4. abrir o app instalado novamente;
5. observar a splash reconstruir `%LOCALAPPDATA%/FlowShopy Desktop/vendor` a partir da cópia inicial e da verificação de runtime.

Resultado esperado:

- o teste acontece sem depender de máquina virtual;
- o runtime ativo do app instalado é recriado do zero;
- o app continua sem depender de Python ou ffmpeg do sistema.

Quando usar VM:

- VM não é obrigatória para validar o bootstrap e a atualização do runtime;
- VM passa a valer a pena quando quisermos provar instalação em Windows realmente limpo, sem resíduos de sessões anteriores, sem variáveis locais de desenvolvimento e sem artefatos do repositório.

Teste rápido sem limpeza:

1. executar `pnpm prepare:desktop-runtime`;
2. executar `pnpm dev:desktop`;
3. confirmar que a splash passa direto pela verificação e segue para API/worker sem baixar nada de novo.

## Pendências explícitas dessa fase

Mesmo sendo a solução correta para o beta, ela ainda deixa pendências de evolução que precisam ficar registradas:

- revisar se `yt-dlp` continua como pacote Python embarcado ou migra para binário dedicado;
- revisar se o modelo `faster-whisper` continua embarcado no instalador ou passa para download assistido por primeira execução;
- revisar a permanência de `Playwright` no runtime local depois que `Remotion` assumir composição/preview, para avaliar se a geração de slides PNG também pode convergir para o mesmo motor;
- tratar atualização e versionamento desses binários embarcados;
- criar diagnóstico desktop para informar ausência ou corrupção de runtime embarcado;
- evitar crescimento excessivo do instalador conforme novos modelos forem adicionados.

## Estado-alvo posterior

O estado-alvo mais maduro continua sendo:

- o instalador já leva os runtimes essenciais do produto;
- o usuário não instala dependências técnicas manualmente;
- o shell desktop gerencia caminhos, healthchecks e diagnóstico;
- cada dependência crítica é versionada como parte do runtime da aplicação.

Isso não exige remover Python imediatamente.

O ponto principal é:

- se continuar usando script Python, ele precisa vir embarcado de forma oficial;
- se no futuro parte disso migrar para binários ou serviços locais dedicados, essa troca deve reduzir complexidade operacional sem reintroduzir dependência externa do sistema do usuário.

## Resultado esperado

O repositório deixa de ter como narrativa principal um site controlando um worker remoto. A narrativa principal passa a ser:

```text
produto instalado
  -> interface local
  -> backend local
  -> processamento local pesado
  -> cloud opcional para controle e distribuicao
```
