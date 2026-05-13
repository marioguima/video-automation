# Desktop Installed Mode Validation

## Objetivo

Este documento nao e um guia de cliente final.

Ele existe para quem esta com o codigo do projeto e precisa validar o comportamento do app como se ele estivesse instalado na maquina do usuario.

Use este documento para:

- testar o `win-unpacked`;
- testar o bootstrap do runtime instalado;
- testar limpeza e recriacao de `data` e `vendor`;
- validar onde o app grava dados e logs;
- confirmar que o comportamento do app empacotado e diferente do ambiente de desenvolvimento quando necessario.

## O que estamos simulando

Queremos validar o mesmo comportamento que um usuario teria ao:

1. baixar um instalador;
2. instalar o app;
3. abrir o app pela primeira vez;
4. deixar o runtime local ser preparado;
5. usar a aplicacao sem depender de Python, ffmpeg ou Node instalados no Windows.

Durante o desenvolvimento, a forma mais rapida de simular isso e com:

```powershell
pnpm dist:desktop
pnpm clean:installed-desktop-runtime
pnpm run:desktop-unpacked
```

Sequencia correta de leitura desse fluxo:

1. preparar o runtime e os artefatos do desktop;
2. empacotar;
3. limpar o estado instalado anterior;
4. executar o app empacotado;
5. observar splash, logs e filesystem;
6. validar a UI e um fluxo funcional.

## Diferenca entre desenvolvimento e modo instalado

### Desenvolvimento

Runtime ativo:

```text
apps/desktop/vendor
```

Dados:

- `DATA_DIR`, se definido em dev;
- ou fallback local do projeto.

### Modo instalado

Copia inicial entregue pelo app:

```text
resources/vendor
```

Runtime ativo usado pelo app:

```text
%LOCALAPPDATA%/FlowShopy Desktop/vendor
```

Dados do usuario:

```text
%LOCALAPPDATA%/FlowShopy Desktop/data
```

Logs do shell:

```text
%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log
```

Regra critica:

- no modo instalado, `DATA_DIR` e ignorado;
- isso acontece por causa da checagem `isDev()` no shell desktop;
- o app empacotado sempre grava em `%LOCALAPPDATA%/FlowShopy Desktop`.

## Como gerar o artefato para teste

### O comando principal

```powershell
pnpm dist:desktop
```

Esse e o comando que gera a versao que sera executada como app empacotado.

O fluxo real e:

```text
pnpm dist:desktop
  -> pnpm build:desktop
    -> pnpm prepare:desktop-runtime
      -> prepare:desktop-node
      -> prepare:desktop-workspace-node-modules
      -> prepare:desktop-ffmpeg
      -> prepare:desktop-python
      -> prepare:desktop-db-seed
    -> pnpm build:web
  -> electron-builder
```

### O que cada etapa faz

#### `prepare:desktop-node`

Prepara o Node vendorizado que a API e o worker vao usar no desktop empacotado.

Resultado esperado:

```text
apps/desktop/vendor/node
```

#### `prepare:desktop-workspace-node-modules`

Monta o conjunto de `node_modules` que o runtime empacotado precisa para:

- `apps/api`
- `apps/worker`
- `apps/desktop`
- `packages/db`

Resultado esperado:

```text
apps/desktop/vendor/workspace-node-modules
```

#### `prepare:desktop-ffmpeg`

Baixa e prepara:

- `ffmpeg`
- `ffprobe`

Resultado esperado:

```text
apps/desktop/vendor/ffmpeg
```

#### `prepare:desktop-python`

Baixa e prepara:

- Python embeddable;
- bibliotecas Python do worker;
- `yt-dlp`;
- `faster-whisper`;
- modelo inicial de transcricao.

Resultado esperado:

```text
apps/desktop/vendor/python
apps/desktop/vendor/models
```

#### `prepare:desktop-db-seed`

Prepara a seed do banco local usada para inicializacao do app instalado.

Resultado esperado:

```text
apps/desktop/vendor/db
```

#### `build:web`

Gera o frontend de producao para o shell Electron carregar.

Resultado esperado:

```text
apps/web/dist
```

#### `electron-builder`

Empacota o aplicativo Electron e copia:

- codigo do shell;
- build do frontend;
- runtime inicial em `resources/vendor`.

### Resultado final esperado do build

Os artefatos mais uteis para validacao tecnica sao:

- `dist/desktop/win-unpacked`
- o instalador gerado em `dist/desktop`

### O que verificar depois do build

Depois de `pnpm dist:desktop`, confirme:

```text
dist/desktop/win-unpacked/FlowShopy Desktop.exe
dist/desktop/win-unpacked/resources/vendor
```

Dentro de `resources/vendor`, o esperado e ver pelo menos:

```text
node/
ffmpeg/
python/
models/
db/
workspace-node-modules/
```

## Como limpar o estado instalado antes do teste

### O comando

```powershell
pnpm clean:installed-desktop-runtime
```

Esse comando remove:

- `%LOCALAPPDATA%/FlowShopy Desktop/data`
- `%LOCALAPPDATA%/FlowShopy Desktop/vendor`
- `%LOCALAPPDATA%/FlowShopy/electron-session`

Objetivo:

- simular primeiro boot;
- remover runtime anterior;
- remover banco anterior;
- testar a recriacao do ambiente pelo app.

### Quando usar

Use esse comando:

- antes de testar um build novo;
- antes de validar reparo automatico do runtime;
- antes de comparar comportamento entre duas versoes;
- antes de investigar bootstrap quebrado no modo instalado.

## Como executar o app empacotado sem instalar

### O comando

```powershell
pnpm run:desktop-unpacked
```

Isso abre o executavel dentro de `dist/desktop/win-unpacked`.

O script faz duas coisas importantes:

1. procura o executavel:

```text
dist/desktop/win-unpacked/FlowShopy Desktop.exe
```

2. remove `ELECTRON_RUN_AS_NODE` antes de abrir o app.

Isso e importante porque, se essa env estiver herdada do terminal, o Electron nao abre como aplicacao desktop; ele tenta agir como Node.

Esse e o caminho recomendado para:

- iterar rapido;
- depurar bootstrap;
- testar logs;
- validar `userData`/`LocalAppData`.

### O que acontece quando voce executa

Ao abrir o app empacotado:

1. o shell sobe;
2. resolve `%LOCALAPPDATA%/FlowShopy Desktop`;
3. cria ou reusa:
   - `data`
   - `vendor`
   - `logs`
4. usa `resources/vendor` como copia inicial;
5. monta o runtime ativo em `%LOCALAPPDATA%/FlowShopy Desktop/vendor`;
6. sobe a API local;
7. sobe o worker local;
8. espera os healthchecks;
9. abre a interface.

### Como testar o app realmente instalado

Se quiser testar o instalador de verdade em vez do `win-unpacked`, a sequencia e:

1. rodar `pnpm dist:desktop`
2. executar o instalador gerado em `dist/desktop`
3. concluir a instalacao
4. fechar o app
5. rodar `pnpm clean:installed-desktop-runtime`
6. abrir o app instalado pelo atalho normal

Nesse caso, a validacao de splash, logs e filesystem e a mesma.

## O que observar na splash

### Ordem esperada

Mensagens esperadas:

- `Verificando runtimes locais...`
- `Preparando banco e arquivos locais...`
- `Iniciando API local...`
- `Conectando worker local...`
- `Aguardando API responder...`
- `Aplicacao pronta.`

Se o runtime estiver faltando ou divergente, a splash pode gastar mais tempo em:

- preparacao de runtime Node;
- runtime Python;
- ffmpeg;
- modelo de transcricao;
- banco local.

### Como interpretar

- se o app abre muito rapido, o runtime ja estava pronto;
- se o app ficou algum tempo em verificacao/preparacao, ele estava reconstruindo partes do runtime;
- se ele travar muito tempo na mesma mensagem, o proximo passo e abrir o log do bootstrap.

## O que observar no filesystem

### Base principal

Depois do bootstrap correto, estas pastas devem existir:

```text
%LOCALAPPDATA%/FlowShopy Desktop/
  data/
  logs/
  vendor/
```

Dentro de `vendor`, o esperado e encontrar:

```text
node/
ffmpeg/
python/
models/
workspace-app/
```

### O que cada pasta representa

#### `%LOCALAPPDATA%/FlowShopy Desktop/data`

Contem dados persistidos do usuario, como:

- banco SQLite;
- `app_settings.json`;
- artefatos locais que pertençam ao diretorio de dados.

#### `%LOCALAPPDATA%/FlowShopy Desktop/vendor`

Contem o runtime ativo que API e worker usam de verdade:

- Node local;
- ffmpeg local;
- Python local;
- modelos locais;
- `workspace-app`;
- dependencias empacotadas do backend.

#### `%LOCALAPPDATA%/FlowShopy Desktop/logs`

Contem logs do bootstrap do shell desktop.

## O que observar nos logs

Arquivo principal:

```text
%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log
```

### O que procurar

Sinais de sucesso:

- `bootstrap start`
- `app ready`
- `splash window created`
- `Initialized desktop SQLite database`
- `spawning api`
- `spawning worker`
- `worker health listening`
- `Server listening at http://127.0.0.1:4110`
- `Aplicacao pronta.`

Sinais de falha tipicos:

- modulo ausente no runtime vendorizado;
- API ou worker encerrando antes do healthcheck;
- erro de bootstrap do banco;
- erro no runtime Python ou ffmpeg.

### Leitura pratica

- se a API nao subir, o erro costuma aparecer no bloco `[api:stderr]`;
- se o worker nao subir, o erro costuma aparecer em `[worker:stderr]`;
- se a splash travar antes da API, o problema geralmente esta no preparo do runtime ou banco;
- se a UI nao abrir, mas API e worker estiverem vivos, o shell provavelmente passou do bootstrap e o problema foi para a camada de frontend.

## Checklist completo de validacao

1. rodar `pnpm dist:desktop`
2. rodar `pnpm clean:installed-desktop-runtime`
3. rodar `pnpm run:desktop-unpacked`
4. observar a splash
5. confirmar criacao de:
   - `%LOCALAPPDATA%/FlowShopy Desktop/data`
   - `%LOCALAPPDATA%/FlowShopy Desktop/vendor`
   - `%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log`
6. abrir o log e confirmar:
   - API subiu
   - worker subiu
   - shell abriu a UI
7. abrir a UI e validar navegacao basica
8. abrir `Content`
9. criar um conteudo simples
10. se estiver validando pipeline, testar uma fonte real

## Fluxo completo recomendado para retestar do zero

Se o objetivo e testar tudo, do preparo ate o app usando `%LOCALAPPDATA%`, use exatamente esta ordem:

### 1. Atualizar o codigo

Tenha certeza de que o repositorio esta no estado que voce quer validar.

### 2. Reinstalar dependencias se necessario

```powershell
pnpm install
```

### 3. Gerar o artefato desktop

```powershell
pnpm dist:desktop
```

### 4. Limpar o estado instalado anterior

```powershell
pnpm clean:installed-desktop-runtime
```

### 5. Executar o app empacotado

```powershell
pnpm run:desktop-unpacked
```

### 6. Observar a splash

Confirme que ela chega em `Aplicacao pronta.`.

### 7. Verificar o filesystem

Confirme a criacao de:

```text
%LOCALAPPDATA%/FlowShopy Desktop/data
%LOCALAPPDATA%/FlowShopy Desktop/vendor
%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log
```

### 8. Verificar o log

Abra:

```text
%LOCALAPPDATA%/FlowShopy Desktop/logs/desktop-bootstrap.log
```

Confirme que:

- API subiu em `4110`;
- worker subiu em `4111`;
- o shell chegou em `Aplicacao pronta.`

### 9. Validar a UI

Na interface:

1. abrir `Content`
2. criar um conteudo
3. salvar
4. editar esse conteudo
5. abrir `Projects`
6. validar navegacao basica

### 10. Validar pipeline funcional

Se for testar preparacao de fonte:

1. criar conteudo com uma fonte real;
2. salvar;
3. acompanhar o estado da fonte;
4. confirmar que o conteudo sai de `Processando` para `Pronto` quando a preparacao terminar.

## Quando instalar de verdade em vez de usar `win-unpacked`

Use o instalador real quando quiser validar:

- fluxo de instalacao;
- permissoes do instalador;
- entrada no menu iniciar;
- desinstalacao;
- comportamento apos reboot;
- experiencia mais proxima do usuario final.

Use `win-unpacked` quando quiser validar:

- bootstrap tecnico;
- runtime;
- API;
- worker;
- filesystem;
- logs;
- correcoes rapidas.

## O que ainda falta fora do repositorio

Ainda nao existe um guia publico de cliente final cobrindo:

- instalar;
- abrir pela primeira vez;
- entender o que o app vai baixar;
- reinstalar;
- limpar estado quebrado;
- diagnosticar falhas comuns sem acesso ao codigo.

Isso deve virar material separado de suporte/onboarding quando a distribuicao ao cliente final estiver estabilizada.
