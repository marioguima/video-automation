# COPE Execution Plan

Status: `ACTIVE`

Data da decisao: 2026-04-29

## Direcao do produto

O produto deixa de ser orientado a `curso` ou `canal` como dominio principal. O foco passa a ser **conteudo reutilizavel**, seguindo o principio COPE: Create Once, Publish Everywhere.

O usuario deve criar um conteudo uma vez e conseguir gerar variantes de video para diferentes destinos, formatos e contextos:

- curso
- YouTube
- TikTok
- Instagram
- Facebook
- projeto generico de video
- projeto musical/visualizer em fase posterior

Nesta etapa, a saida suportada sera apenas **video**. Outros formatos como e-book/PDF ficam fora deste produto.

## Fonte tecnica oficial

`G:\tool\vizlec` passa a ser a base tecnica de referencia porque e a versao original e mais atualizada.

`migration/vizlec_runtime` deve ser tratado como snapshot historico de migracao, nao como fonte ativa de novas alteracoes. A copia pode ser removida depois de confirmado que nenhum arquivo unico dela precisa ser preservado.

## Problema a corrigir

O VizLec nasceu para:

```text
Course -> Module -> Lesson -> LessonVersion -> Blocks -> Assets/Jobs
```

O `video-automation` atual precisa suportar:

```text
ContentProject -> ContentPiece -> Variant -> Blocks/Scenes -> Assets/Jobs
```

Para curso, agrupamento intermediario continua valido:

```text
ContentProject(kind=course) -> Section/Module -> ContentPiece(video)
```

Para canais, perfis, paginas e projetos genericos, o agrupamento intermediario deve ser invisivel ou inexistente:

```text
ContentProject(kind=youtube_channel | instagram_profile | tiktok_profile | facebook_page | generic_video)
-> ContentPiece(video)
```

## Modelo alvo

### ContentProject

Representa o conteudo como produto/editorial, nao o destino final.

Campos conceituais:

- `id`
- `workspaceId`
- `kind`: `course`, `youtube_channel`, `instagram_profile`, `tiktok_profile`, `facebook_page`, `generic_video`, `music_visualizer`
- `title`
- `description`
- `language`
- `styleDnaJson`
- `status`
- `createdAt`
- `updatedAt`

### Section

Agrupador opcional.

Regras:

- obrigatorio/visivel para `kind=course`
- invisivel e criado automaticamente para projetos sem agrupamento
- pode ser removido fisicamente no futuro, mas nao nesta primeira entrega

### ContentPiece

Unidade editorial que vira video.

Na V1, substitui semanticamente `Lesson`/`Video`.

Campos conceituais:

- `id`
- `projectId`
- `sectionId` opcional no modelo conceitual; temporariamente obrigatorio no banco se for necessario compatibilidade
- `type`: `video`
- `title`
- `sourceText`
- `status`
- `order`

### Variant

Representa uma saida geravel/publicavel do mesmo conteudo.

Campos conceituais:

- `id`
- `contentPieceId`
- `destination`: `youtube`, `tiktok`, `instagram`, `facebook`, `course`, `generic`
- `aspectRatio`: `16:9`, `9:16`, `1:1`
- `durationTargetSec`
- `styleOverridesJson`
- `status`

Na implementacao de 5 dias, `Variant` pode comecar como campos dentro de `VideoVersion`/`LessonVersion` para reduzir refator.

### Blocks / Scenes

O bloco continua sendo a menor unidade de revisao humana.

Cada bloco deve suportar:

- texto fonte
- texto narrado/TTS
- prompt de imagem
- prompt de animacao da imagem
- status de audio/imagem/animacao/render

O campo `animationPromptJson` deve existir no plano mesmo se a geracao de animacao ficar desligada na V1.

### Music Visualizer

Fica no radar, mas fora do escopo principal da V1.

Primeiro suporte viavel:

- usuario fornece uma ou mais faixas
- nao exige roteiro narrado
- usuario fornece briefing/prompt visual por faixa
- sistema gera imagens/cenas e renderiza video com musica

Sem geracao de musica por API nesta fase.

## Estrategia tecnica

Para entregar em ate 5 dias, nao fazer rename fisico completo do banco de imediato.

Usar abordagem incremental:

1. Manter a base `G:\tool\vizlec` como repo operacional.
2. Introduzir linguagem de produto `Project/Content/Video` na UI e contratos novos.
3. Manter `Course/Module/Lesson` internamente onde o custo de refator for alto.
4. Criar aliases/camada de dominio para que a UI trate tudo como `Project`.
5. Para projetos nao-curso, criar uma `default section` interna e esconder isso da UI.
6. Migrar nomes fisicos depois que o fluxo COPE estiver validado.

## Plano de 5 dias

### Dia 1 - Decisao e base unica

- Confirmar `G:\tool\vizlec` como base unica.
- Congelar `migration/vizlec_runtime` como snapshot historico.
- Criar branch/plano de migracao COPE.
- Adicionar tipos de projeto: `course`, `youtube_channel`, `instagram_profile`, `tiktok_profile`, `facebook_page`, `generic_video`, `music_visualizer`.
- Definir helper de dominio para decidir se o projeto usa agrupamento visivel.

Aceite:

- Documentacao atualizada.
- Nenhuma nova alteracao deve ser feita em `migration/vizlec_runtime`.

### Dia 2 - UI: Projects e agrupamento opcional

- Renomear labels principais de `Courses` para `Projects` ou `Content Projects`.
- No formulario de projeto, adicionar `kind`.
- Esconder tela/acoes de modulo quando `kind != course`.
- Para projetos sem agrupamento, exibir lista direta de videos.
- Manter `Section/Module` interno como default invisivel.

Aceite:

- Usuario cria projeto YouTube/TikTok/Instagram/Facebook e ve videos direto, sem modulo.
- Usuario cria projeto Curso e ainda ve secoes/modulos.

### Dia 3 - API: aliases COPE sem quebrar fluxo

- Criar endpoints canônicos ou aliases:
  - `GET /projects`
  - `POST /projects`
  - `GET /projects/:projectId/content-pieces`
  - `POST /projects/:projectId/content-pieces`
  - `GET /content-pieces/:id/versions`
  - `POST /content-pieces/:id/versions`
- Internamente podem chamar `courses/modules/lessons` no primeiro momento.
- Criar default section automaticamente para `kind != course`.

Aceite:

- UI nova não precisa chamar `/courses` diretamente para fluxo principal.
- Fluxo legado continua funcionando.

### Dia 4 - Video pipeline COPE

- Adicionar `aspectRatio` e `destination` ao fluxo de geracao/render.
- Adicionar `animationPromptJson` ao contrato de bloco, mesmo sem animacao ativa.
- Preparar render para diferenciar vertical/horizontal/square em nivel de configuracao.
- Manter saida principal como video final.

Aceite:

- Um mesmo conteudo consegue ter ao menos duas variantes conceituais: `youtube 16:9` e `tiktok/instagram 9:16`.
- Blocos carregam prompt de imagem e campo reservado para prompt de animacao.

### Dia 5 - Polimento, remocao de duplicidade e validacao

- Atualizar docs/README do repo escolhido.
- Marcar `migration/vizlec_runtime` como removivel.
- Testar fluxo minimo:
  - criar projeto generico
  - criar video
  - gerar blocos
  - editar prompt de imagem
  - gerar audio/imagem quando disponivel
  - renderizar video
- Testar fluxo curso:
  - criar projeto curso
  - criar modulo/secao
  - criar video/aula
  - abrir editor

Aceite:

- O produto opera com um dominio de conteudo unico.
- Curso vira apenas um tipo de projeto, nao o modelo central.
- Runtime copiado deixa de ser dependencia mental/tecnica.

## Decisoes de arquitetura

1. Conteudo e o centro; destino e variante.
2. Curso, canal, perfil e pagina sao tipos/contextos de projeto.
3. Modulo/secao e opcional e so deve aparecer quando fizer sentido.
4. Video e a unica saida prioritaria nesta etapa.
5. Prompt de imagem e prompt de animacao sao capacidades basicas do pipeline de video.
6. Musica entra como projeto de video com audio fornecido pelo usuario; geracao de musica fica para depois.
7. Evitar manter dois produtos vivos. Consolidar em uma base.

## Fora do escopo imediato

- Geracao de e-book/PDF.
- Geracao de musica por API.
- Remocao fisica completa de `Section/Module`.
- Rename fisico completo de todas as tabelas.
- Publicacao automatica nas plataformas.

## Proxima acao recomendada

Comecar no `G:\tool\vizlec` original criando a camada `Project` e escondendo `Module` para projetos nao-curso. Depois que o fluxo estiver validado, remover `migration/vizlec_runtime` deste repo para evitar confusao.
