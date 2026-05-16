# FlowShopy Data Model Review

## Propósito deste documento

Este documento é a referência canônica para revisão do modelo de dados.

Ele responde:

- quais tabelas existem hoje no schema;
- por que cada tabela existe;
- por que cada campo existe;
- por que cada relacionamento existe;
- o que é canônico, transitório, legado ou mal modelado;
- qual deve ser a direção de remodelagem antes de continuar expandindo o produto.

Ele não substitui `docs/03-technical-architecture.md`.
O `03` explica arquitetura.
Este arquivo entra no detalhe do banco.

## Regra de leitura

Cada tabela é descrita por:

- `Papel`: o que a tabela representa no produto;
- `Situação`: `canônica`, `transitória`, `legado`, `controle online` ou `precisa revisão`;
- `Pai de domínio`: qual entidade deveria ser considerada o pai real dessa tabela;
- `Campos`: explicação objetiva de cada coluna;
- `Relacionamentos`: por que a tabela aponta para outras tabelas;
- `Direção`: o que manter, renomear, remodelar ou remover.

## Limitação importante sobre comentários no banco

Hoje o runtime principal usa `SQLite`.

Isso implica:

- não devemos assumir a mesma camada madura de comentários nativos de tabela/coluna que bancos como `Postgres` oferecem com `COMMENT ON`;
- portanto, a fonte de verdade agora precisa ser:
  - este documento;
  - comentários `///` no `schema.prisma`;
  - futura geração de comentários SQL reais quando o banco suportar isso de forma adequada.

Direção prática:

- enquanto o banco principal for `SQLite`, documentar primeiro no schema e neste arquivo;
- quando o schema físico estabilizar e houver suporte adequado no banco alvo, adicionar comentários reais visíveis em ferramentas como DBeaver.

## Mapa de nomes

Nomenclatura oficial aprovada para a remodelagem:

- `Workspace` -> `Workspace`
- `ContentProject` -> `Project`
- `ContentItem` -> `Content`
- `ContentProjectItem` -> `ProjectContent`

Os nomes atuais misturam produto, transição e legado.

Mapa atual:

| Conceito de produto | Nome físico atual | Nome físico desejado |
| --- | --- | --- |
| Usuário de acesso | `User` | `User` |
| Organização/conta | `Workspace` | `Workspace` ou `Account`, a revisar |
| Vínculo usuário-organização | `WorkspaceMembership` | `WorkspaceUser` |
| Projeto | `ContentProject` | `Project` |
| Conteúdo | `ContentItem` | `Content` |
| Vínculo projeto-conteúdo | `ContentProjectItem` | `ProjectContent` |
| Definição de output | `ProjectOutputDefinition` | `ProjectOutputDefinition` |
| Output concreto | `ProjectContentOutput` | `ProjectContentOutput` |
| Promoção | `PromotionTarget` | `PromotionTarget` |
| Link curto | `ShortLink` | `ShortLink` |
| Unidade narrativa | `NarrativeUnit` | `NarrativeUnit` |
| Composição | `Composition` | `Composition` |
| Legado Vizlec | `Course/Module/Lesson/...` | remover |

Leitura registrada para `ProjectContentOutput`:

- o nome foi mantido por decisão;
- ele representa a saída concreta gerada a partir da relação entre `Project` e `Content`;
- cada linha tende a representar uma combinação específica de output para aquele conteúdo associado, como `YouTube 16:9`, `YouTube 9:16`, `TikTok 9:16` ou equivalente;
- por isso, `ProjectContentOutput` comunica melhor a finalidade da tabela do que alternativas genéricas como `ProjectOutputItem`.

## Visão relacional atual

```text
User
  -> WorkspaceUser -> Workspace
  -> Invitation (como criador do convite)

Workspace
  -> Agent
  -> Invitation
  -> ContentProject
  -> ContentItem
  -> ContentProjectItem
  -> PromotionTarget
  -> ShortLink
  -> ProjectOutputDefinition
  -> ProjectContentOutput
  -> NarrativeUnit
  -> Composition
  -> Course
  -> Module
  -> Lesson
  -> LessonVersion
  -> Block
  -> Asset
  -> Job
  -> Notification

ContentProject
  -> ContentProjectItem -> ContentItem
  -> ProjectOutputDefinition
  -> ProjectContentOutput
  -> PromotionTarget -> ShortLink

ProjectOutputDefinition
  -> ProjectContentOutput

ProjectContentOutput
  -> NarrativeUnit
  -> Composition

ContentItem
  -> metadata.backing -> Course -> Module -> Lesson -> LessonVersion -> Block -> Asset/Job
```

## Visão relacional desejada

```text
User
  -> WorkspaceUser -> Workspace

Project
  -> ProjectContent -> Content
  -> ProjectOutputDefinition
  -> PromotionTarget -> ShortLink

ProjectContent
  -> ProjectContentOutput

ProjectContentOutput
  -> NarrativeUnit
  -> Composition
  -> future OutputBlock / OutputAsset / OutputJob
```

Princípios do modelo desejado:

- `Content` não conhece `Project`;
- tabelas filhas apontam para o pai de domínio direto;
- `workspaceId` não deve ser propagado sem necessidade;
- `userId` é melhor para auditoria do que usar `workspaceId` como rastro operacional;
- tabelas de acesso/licença/governança pertencem ao control plane online;
- tabelas de execução, output e mídia pertencem ao runtime local.

## Tabelas de controle online

### `User`

Papel:

- representa a identidade da pessoa que pode autenticar e operar o produto.

Situação:

- `controle online`.

Pai de domínio:

- nenhum pai local; é raiz de identidade.

Campos:

- `id`: identificador estável do operador humano. Deve existir para autenticação e auditoria.
- `name`: nome de exibição da pessoa. Serve para convites, telas de equipe e trilha de autoria.
- `email`: identificador principal de login e contato.
- `passwordHash`: segredo persistido para autenticação. Não é dado de produto; é dado de acesso.
- `role`: papel global simples. Hoje existe, mas conflita conceitualmente com a ideia correta de que papéis devem viver por workspace.
- `createdAt`: quando a identidade foi criada.
- `updatedAt`: quando o registro de identidade foi atualizado.

Relacionamentos:

- `WorkspaceUser[]`: usuário pode participar de um ou muitos workspaces.
- `Invitation[]` como `sentInvites`: usuário pode criar convites.

Direção:

- remover `role` de `User` no modelo-alvo;
- o papel deve existir apenas na relação entre usuário e workspace;
- no curto prazo, o sistema precisa assumir ao menos dois níveis simples:
  - admin/owner da workspace;
  - demais usuários da workspace;
- papéis mais complexos, como gerente/aprovador, ficam apenas como hipótese futura de produto.

### `Workspace`

Papel:

- representa a conta/organização no control plane.

Situação:

- `controle online`, mas hoje também é usado como raiz técnica no banco local.

Pai de domínio:

- nenhum.

Campos:

- `id`: identificador da organização/conta.
- `name`: nome visível da organização/conta.
- `createdAt`: criação da organização.
- `updatedAt`: atualização da organização.

Relacionamentos:

- hoje aponta para quase tudo, o que revela sobrecarga de escopo.

Direção:

- manter como entidade organizacional;
- reduzir o uso de `workspaceId` como FK universal nas tabelas locais;
- o workspace não deve ser o “ator operacional” de cada objeto da árvore local.

### `WorkspaceMembership` / alvo `WorkspaceUser`

Papel:

- vincula um `User` a um `Workspace` com papel de acesso.
- no modelo-alvo, o nome deve evoluir para `WorkspaceUser` para deixar explícita a relação direta entre workspace e usuário.

Situação:

- `controle online`.

Pai de domínio:

- `Workspace` e `User`.

Campos:

- `id`: identificador do vínculo de participação do usuário naquele workspace.
- `workspaceId`: organização à qual o usuário pertence.
- `userId`: usuário participante.
- `role`: papel do usuário naquele workspace. É aqui, e não em `User`, que a autorização deve viver.
- `createdAt`: momento em que o vínculo foi criado.

Relacionamentos:

- `workspace`: define o escopo organizacional.
- `user`: define quem participa.

Direção:

- renomear para `WorkspaceUser`;
- manter a ideia da relação;
- no futuro pode fazer mais sentido usar `workspaceUserId` em trilhas de auditoria do que repetir `workspaceId` em massa.

### `Invitation`

Papel:

- controla convites de acesso ao workspace.

Situação:

- `controle online`.

Pai de domínio:

- `Workspace`.

Campos:

- `id`: identificador do convite.
- `workspaceId`: workspace para o qual o convite foi emitido.
- `inviteeName`: nome inicial sugerido ao convidado. Ao aceitar o convite, esse valor pode preencher o perfil inicial, mas o usuário deve poder ajustá-lo depois nas configurações do perfil.
- `email`: destino principal do convite.
- `role`: papel que será concedido ao aceitar.
- `tokenHash`: token seguro para validação do convite.
- `expiresAt`: momento em que o convite deixa de ser válido.
- `revokedAt`: momento de revogação explícita.
- `acceptedAt`: momento de aceitação.
- `createdAt`: emissão do convite.
- `invitedByUserId`: quem criou o convite.

Relacionamentos:

- `invitedBy`: auditoria de autoria.
- `workspace`: escopo do convite.

Direção:

- manter;
- pertence ao online/control plane, não ao núcleo local de produção;
- para a V0/Beta, convites devem ser tratados como ação exclusiva do admin/owner da workspace;
- papéis futuros como gerente que convida ou apenas aprova devem ficar apenas no roadmap como hipótese de produto ainda não validada.

### `Agent`

Papel:

- representa um runtime/agente conectado ao workspace para execução local por meio de um canal persistente de comunicação com a API.

Situação:

- `controle operacional híbrido`, mas em revisão.

Pai de domínio:

- hoje `Workspace`; no futuro pode depender de um modelo explícito de instalação/dispositivo, ou pode deixar de existir se essa ponte persistente deixar de fazer sentido.

Campos:

- `id`: identificador lógico do agente/runtime.
- `workspaceId`: organização à qual esse runtime está vinculado.
- `label`: nome amigável da máquina/instalação.
- `machineFingerprint`: identificação técnica da máquina para reconexão e diagnóstico.
- `status`: estado conhecido do agente (`online`, `offline`).
- `lastSeenAt`: último heartbeat/reconhecimento de presença.
- `createdAt`: criação do registro.
- `updatedAt`: última atualização do registro.

Relacionamentos:

- `workspace`: escopo organizacional do runtime.

Uso real hoje:

- a API mantém sessões WebSocket por agente;
- comandos de integração e comandos de worker são enviados para o agente conectado;
- respostas voltam de forma assíncrona e são reconciliadas pela API;
- isso ainda é usado para health checks, wake-up de fila, cleanup e obtenção/envio de dados de processamento.

Direção:

- revisar a necessidade real de permanência;
- hoje ela ainda tem utilidade porque a API conversa com um runtime conectado por canal persistente;
- essa utilidade vem da herança da arquitetura em que o servidor podia despachar comandos e receber respostas do runtime por WebSocket;
- se a arquitetura local-first evoluir para um acoplamento mais direto entre UI, API local e worker local sem essa ponte, o `Agent` pode ser simplificado ou removido;
- enquanto isso não acontecer, a entidade ainda tem função operacional concreta.

## Tabelas canônicas do domínio novo

### `ContentProject`

Papel:

- representa o projeto editorial/comercial do FlowShopy.

Situação:

- `canônica`, mas com nome físico ruim.

Pai de domínio:

- deveria ser raiz do núcleo de produção.

Campos:

- `id`: identificador do projeto.
- `workspaceId`: escopo organizacional. Hoje existe por herança arquitetural; precisa revisão.
- `name`: nome editorial/comercial usado para localizar o projeto.
- `description`: contexto estratégico livre. É onde o usuário explica intenção, campanha, oferta ou linha editorial.
- `language`: idioma padrão do projeto para roteiro, outputs e providers.
- `language` não descreve o idioma da fonte bruta. Ele define o idioma-alvo que o projeto deve impor aos artefatos finais derivados, como script adaptado, TTS, texto final sobre imagem, PDF e outros outputs.
- `status`: estado administrativo do projeto (`draft`, etc.). Não é a fase da produção do conteúdo.
- `metadataJson`: bolsa de configuração transitória. Hoje acumula pipeline, outputs padrão e outras configurações que ainda não viraram colunas/tabelas próprias.
- `metadataJson` hoje concentra configuração demais e precisa ser revisado com leitura real do que já está sendo persistido. O objetivo é transformar em tabela ou coluna dedicada tudo que tiver estrutura estável, mantendo dinâmico apenas o que for genuinamente variável ou experimental.
- `createdAt`: criação do projeto.
- `updatedAt`: atualização do projeto.

Relacionamentos:

- `workspace`: escopo organizacional atual.
- `projectItems`: conteúdos associados ao projeto.
- `promotionTargets`: ofertas/promos vinculadas ao projeto.
- `outputDefinitions`: saídas declaradas para o projeto.
- `projectContentOutputs`: outputs materializados para conteúdos associados.

Direção:

- renomear para `Project`;
- tratar `language` como idioma-alvo obrigatório dos outputs finais do projeto, mesmo quando a fonte original estiver em outro idioma;
- reduzir dependência de `metadataJson`;
- manter como raiz do domínio de produção;
- revisar necessidade de `workspaceId` direto após fechar a separação local/control plane.

### `ContentItem`

Papel:

- representa a matéria-prima editorial reutilizável.

Situação:

- `canônica`, mas com nome e campos ainda em revisão.

Pai de domínio:

- nenhum; conteúdo deve existir por si.

Campos:

- `id`: identificador do conteúdo.
- `workspaceId`: escopo organizacional atual. Precisa revisão conforme a nova estratégia de escopo local.
- `kind`: resíduo de modelagem antiga. Hoje contradiz a direção de conteúdo mídia-agnóstico.
- `title`: título de identificação do conteúdo na biblioteca.
- `sourceText`: texto principal atualmente salvo no conteúdo. Hoje é ambíguo porque mistura matéria-prima, texto bruto e script em certos fluxos.
- `orientation`: resíduo de modelagem antiga ligado ao tipo de saída, não ao conteúdo.
- `status`: estado simplificado atual do conteúdo. Hoje ainda mistura leitura editorial e leitura operacional.
- `metadataJson`: bolsa transitória que hoje carrega `sourceMode`, `editorialState`, `contentSources`, `backing` legado e outros estados.
- `createdAt`: criação do conteúdo.
- `updatedAt`: atualização do conteúdo.

Relacionamentos:

- `workspace`: escopo organizacional atual.
- `projectItems`: vínculos com projetos.
- `projectContentOutputs`: outputs concretos derivados desse conteúdo.

Direção:

- decidir se o nome final será `Content`;
- remover ou reinterpretar `kind` e `orientation`;
- manter o conteúdo sem conhecimento direto de projeto no contrato;
- decompor `metadataJson` em estruturas mais explícitas.

### `ContentProjectItem`

Papel:

- representa o vínculo N:N entre projeto e conteúdo.

Situação:

- `canônica`, mas com nome físico ruim.

Pai de domínio:

- deveria existir como filho lógico de `Project`, apontando para `Content`.

Campos:

- `id`: identificador do vínculo.
- `workspaceId`: escopo organizacional atual. Redundante em potencial se `projectId` já apontar para o projeto pai.
- `projectId`: projeto que usa o conteúdo.
- `itemId`: conteúdo associado.
- `createdAt`: momento em que a associação foi criada.

Relacionamentos:

- `workspace`: escopo atual.
- `project`: pai editorial/comercial do vínculo.
- `item`: conteúdo associado.
- `outputs`: outputs concretos gerados a partir desta associação.

Direção:

- renomear para `ProjectContent`;
- no modelo alvo, esta é a entidade certa para centralizar regras de relação projeto-conteúdo;
- revisar se `workspaceId` deve sair daqui.

### `ProjectOutputDefinition`

Papel:

- descreve o que o projeto quer gerar como saídas possíveis/esperadas.

Situação:

- `canônica`, mas ainda parcialmente derivada de metadata.

Pai de domínio:

- `Project`.

Campos:

- `id`: identificador da definição de output.
- `workspaceId`: escopo atual; revisar necessidade.
- `projectId`: projeto dono da definição.
- `key`: chave estável derivada para garantir identidade e upsert idempotente.
- `channel`: canal principal ao qual a saída se destina.
- `label`: nome legível da saída para a UI.
- `mediaType`: tipo de mídia esperado (`video`, etc.).
- `destination`: destino operacional/canal lógico da saída.
- `aspectRatio`: proporção visual esperada.
- `presetId`: preset inicial de composição/render.
- `language`: idioma da saída, herdado ou sobrescrito.
- `isActive`: indica se a definição ainda está habilitada para gerar outputs.
- `metadataJson`: bolsa transitória para detalhes ainda não estabilizados no contrato.
- `createdAt`: criação da definição.
- `updatedAt`: atualização da definição.

Relacionamentos:

- `workspace`: escopo atual.
- `project`: projeto ao qual a saída pertence.
- `outputs`: outputs concretos materializados a partir desta definição.

Direção:

- manter a entidade;
- tirar a origem de `metadata.defaultOutputs` e dar contrato dedicado de configuração;
- revisar redundância de `workspaceId`.

### `ProjectContentOutput`

Papel:

- representa um output concreto para a combinação `projeto + conteúdo + definição de output`.

Situação:

- `canônica`, mas ainda não é o pai operacional final de toda a produção.

Pai de domínio:

- deveria ser filho direto de `ProjectContent` e `ProjectOutputDefinition`.

Campos:

- `id`: identificador do output concreto.
- `workspaceId`: escopo atual; potencialmente redundante.
- `projectId`: projeto dono do output. Hoje ajuda consultas, mas pode ser derivável do vínculo pai.
- `projectItemId`: vínculo `ProjectContent` do qual esse output nasce.
- `itemId`: conteúdo base. Hoje duplicado por conveniência.
- `outputDefinitionId`: definição de output usada.
- `title`: rótulo calculado do output, útil para UI e listagem.
- `mediaType`: snapshot do tipo de mídia.
- `channel`: snapshot do canal.
- `destination`: snapshot do destino.
- `aspectRatio`: snapshot da proporção.
- `presetId`: snapshot do preset usado.
- `status`: estado macro do output.
- `currentStage`: etapa operacional atual dentro do fluxo.
- `targetDurationS`: duração alvo do output, útil para narrativa e composição.
- `metadataJson`: bolsa transitória para rastros/flags adicionais.
- `createdAt`: criação do output.
- `updatedAt`: atualização do output.

Relacionamentos:

- `workspace`: escopo atual.
- `project`: projeto pai atual.
- `projectItem`: vínculo `ProjectContent`.
- `item`: conteúdo base.
- `outputDefinition`: definição de output.
- `narrativeUnits`: estrutura semântica do output.
- `composition`: composição atual do output.

Direção:

- manter;
- manter o nome `ProjectContentOutput`;
- a justificativa é que a entidade só existe por causa da relação `Project + Content`, e cada linha representa uma saída concreta dessa relação para uma definição específica de output;
- reduzir duplicações de `projectId` e `itemId` se o pai ficar bem definido;
- fazer esta tabela virar o pai operacional real do Studio, jobs e render.

### `NarrativeUnit`

Papel:

- guarda a estrutura narrativa/semântica inicial de um output.

Situação:

- `canônica`.

Pai de domínio:

- `ProjectContentOutput`.

Campos:

- `id`: identificador da unidade narrativa.
- `workspaceId`: escopo atual; revisar necessidade.
- `projectContentOutputId`: output ao qual a unidade pertence.
- `order`: posição sequencial na narrativa.
- `role`: papel semântico (`hook`, `cta`, etc.).
- `sourceText`: texto-base daquele trecho narrativo.
- `narrationText`: texto ajustado para fala/narração.
- `title`: título curto opcional do trecho.
- `durationEstimateS`: estimativa de duração.
- `visualIntentJson`: intenção visual do trecho.
- `ctaIntentJson`: intenção de CTA do trecho.
- `metadataJson`: extensão transitória para dados narrativos extras.
- `createdAt`: criação da unidade.
- `updatedAt`: atualização da unidade.

Relacionamentos:

- `workspace`: escopo atual.
- `projectContentOutput`: output dono da narrativa.

Direção:

- manter;
- reduzir `workspaceId` se o pai operacional já bastar.

### `Composition`

Papel:

- representa a timeline composicional de um output.

Situação:

- `canônica`.

Pai de domínio:

- `ProjectContentOutput`.

Campos:

- `id`: identificador da composição.
- `workspaceId`: escopo atual; revisar necessidade.
- `projectContentOutputId`: output ao qual a composição pertence.
- `fps`: frames por segundo.
- `width`: largura da composição.
- `height`: altura da composição.
- `durationFrames`: duração total em frames.
- `status`: estado da composição (`draft`, etc.).
- `timelineJson`: timeline serializada. Hoje é a principal carga estrutural da composição.
- `metadataJson`: extensão transitória de metadados.
- `createdAt`: criação da composição.
- `updatedAt`: atualização da composição.

Relacionamentos:

- `workspace`: escopo atual.
- `projectContentOutput`: output dono da composição.

Direção:

- manter;
- continuar como fonte de verdade da composição;
- revisar necessidade de `workspaceId`.

### `PromotionTarget`

Papel:

- representa o destino promocional/comercial que um projeto quer empurrar.

Situação:

- `canônica`, mas ainda fora do happy path principal.

Pai de domínio:

- `Project`.

Campos:

- `id`: identificador do alvo promocional.
- `workspaceId`: escopo atual.
- `projectId`: projeto que promove esse alvo.
- `name`: nome do alvo promocional do ponto de vista do time/editor.
- `description`: contexto e detalhes da promoção.
- `destinationUrl`: destino real final da promoção.
- `ctaLabel`: rótulo curto de CTA associado.
- `status`: estado administrativo da promoção.
- `metadataJson`: bolsa para janela temporal, histórico e dados extras.
- `createdAt`: criação do alvo.
- `updatedAt`: atualização do alvo.

Relacionamentos:

- `workspace`: escopo atual.
- `project`: projeto dono da promoção.
- `shortLinks`: links curtos que apontam para esse alvo.

Direção:

- manter;
- revisar se parte da rastreabilidade deve virar tabela própria.

### `ShortLink`

Papel:

- representa um link curto redirecionável ligado a um alvo promocional.

Situação:

- `canônica`, mas ainda parcial no produto.

Pai de domínio:

- `PromotionTarget`.

Campos:

- `id`: identificador do link curto.
- `workspaceId`: escopo atual.
- `promotionTargetId`: alvo promocional dono do link.
- `code`: slug/código público do link curto.
- `url`: destino atual do redirecionamento.
- `status`: estado do link (`active`, etc.).
- `metadataJson`: bolsa para histórico, origem, UTM e outros dados futuros.
- `createdAt`: criação do link.
- `updatedAt`: atualização do link.

Relacionamentos:

- `workspace`: escopo atual.
- `promotionTarget`: pai promocional.

Direção:

- manter;
- revisar se `url` deve virar `currentDestinationUrl` para ficar semanticamente mais claro.

## Tabelas legadas ainda ativas

### `Course`

Papel:

- raiz do legado Vizlec usada hoje como backing técnico para manter a pipeline antiga viva.

Situação:

- `legado`.

Pai de domínio:

- não deveria existir no modelo final do FlowShopy.

Campos:

- `id`: identificador legado do container de produção.
- `workspaceId`: escopo atual.
- `name`: nome técnico/visual legado.
- `description`: descrição legada.
- `categoryId`: campo herdado do produto antigo.
- `productLanguage`: idioma de produto legado.
- `emailLanguage`: idioma de automação/email legado.
- `primarySalesCountry`: país comercial legado.
- `salesPageUrl`: URL comercial herdada.
- `imageAssetId`: referência visual herdada.
- `status`: estado administrativo legado.
- `createdAt`: criação.
- `updatedAt`: atualização.

Relacionamentos:

- `workspace`: escopo atual.
- `modules`: módulos legados.

Direção:

- remover depois que o editor estiver 100% dirigido pelo modelo de projeto.

### `Module`

Papel:

- agrupador legado intermediário do Vizlec.

Situação:

- `legado`.

Pai de domínio:

- `Course`.

Campos:

- `id`: identificador do módulo legado.
- `workspaceId`: escopo atual.
- `courseId`: curso legado pai.
- `name`: rótulo do módulo.
- `order`: ordem do módulo dentro do curso.
- `createdAt`: criação do módulo.

Relacionamentos:

- `workspace`: escopo atual.
- `course`: pai legado.
- `lessons`: lições legadas.

Direção:

- remover.

### `Lesson`

Papel:

- unidade herdada usada como ponte para editor/render.

Situação:

- `legado operacional`.

Pai de domínio:

- `Module`.

Campos:

- `id`: identificador da lição legada.
- `workspaceId`: escopo atual.
- `moduleId`: módulo pai.
- `order`: ordem da lição no módulo.
- `title`: título da lição legada.
- `createdAt`: criação da lição.

Relacionamentos:

- `workspace`: escopo atual.
- `module`: módulo legado pai.
- `versions`: versões legadas.

Direção:

- remover quando não houver mais editor/worker dependente de `lessonId`.

### `LessonVersion`

Papel:

- versão roteirizada da lição usada pelo segmentador e pelo worker.

Situação:

- `legado operacional crítico`.

Pai de domínio:

- `Lesson`.

Campos:

- `id`: identificador da versão.
- `workspaceId`: escopo atual.
- `lessonId`: lição pai.
- `scriptText`: roteiro efetivo usado pela segmentação herdada.
- `speechRateWps`: orçamento base de fala por segundo.
- `preferredVoiceId`: voz preferida para TTS no legado.
- `preferredTemplateId`: template visual preferido no legado.
- `createdAt`: criação da versão.

Relacionamentos:

- `workspace`: escopo atual.
- `lesson`: lição pai.
- `blocks`: blocos operacionais derivados.
- `jobs`: jobs ligados à versão.

Direção:

- migrar responsabilidades para `ProjectContentOutput` e futuras entidades de output.

### `Block`

Papel:

- unidade operacional real de edição e geração usada hoje.

Situação:

- `legado operacional crítico`.

Pai de domínio:

- hoje `LessonVersion`; no futuro deve depender do output novo.

Campos:

- `id`: identificador do bloco.
- `workspaceId`: escopo atual.
- `lessonVersionId`: versão legada dona do bloco.
- `index`: posição do bloco dentro da versão.
- `sourceText`: texto-base do bloco.
- `ttsText`: texto ajustado para fala.
- `wordCount`: contagem de palavras para validação/orçamento.
- `durationEstimateS`: estimativa de duração.
- `audioDurationS`: duração real do áudio gerado, quando existir.
- `onScreenJson`: conteúdo textual visual da cena.
- `imagePromptJson`: prompt de geração de imagem.
- `animationPromptJson`: prompt de animação/movimento.
- `directionNotesJson`: notas de direção não narradas.
- `soundEffectPromptJson`: intenção de efeito sonoro.
- `segmentMs`: custo/tempo de segmentação.
- `segmentError`: último erro de segmentação.
- `status`: estado do bloco.
- `createdAt`: criação.
- `updatedAt`: atualização.

Relacionamentos:

- `workspace`: escopo atual.
- `lessonVersion`: pai legado.
- `assets`: arquivos gerados a partir do bloco.
- `jobs`: jobs por bloco.

Direção:

- não expandir conceitualmente;
- planejar sucessão por entidade de bloco/cena ligada a `ProjectContentOutput`.

### `Asset`

Papel:

- armazena arquivos gerados na pipeline atual.

Situação:

- `legado operacional crítico`, mas conceito continua necessário.

Pai de domínio:

- hoje `Block`; no futuro deve ser filho do novo bloco/cena do output.

Campos:

- `id`: identificador do asset.
- `workspaceId`: escopo atual.
- `blockId`: bloco dono do asset.
- `kind`: tipo do asset gerado.
- `path`: caminho no filesystem local.
- `sha256`: integridade/identidade do arquivo.
- `metaJson`: metadados adicionais do asset.
- `templateId`: template visual relacionado, quando existir.
- `createdAt`: criação do asset.

Relacionamentos:

- `workspace`: escopo atual.
- `block`: bloco dono.

Direção:

- manter o conceito;
- migrar o pai operacional quando o novo modelo de output assumir a produção.

### `Job`

Papel:

- fila e rastreio de processamento do worker.

Situação:

- `legado operacional crítico`, mas conceito continua necessário.

Pai de domínio:

- hoje `LessonVersion` e/ou `Block`; no futuro deve depender do novo pai operacional do output.

Campos:

- `id`: identificador do job.
- `workspaceId`: escopo atual.
- `scope`: escopo do job (`lesson`, `block` no legado).
- `lessonVersionId`: versão legado alvo do job.
- `blockId`: bloco alvo do job.
- `type`: tipo da tarefa executada.
- `status`: estado do job.
- `attempts`: número de tentativas.
- `error`: último erro conhecido.
- `inputHash`: hash para idempotência/reprocessamento.
- `priority`: prioridade de fila.
- `clientId`: cliente/solicitante lógico.
- `requestId`: idempotência/rastreio da requisição.
- `metaJson`: parâmetros e contexto do job.
- `leaseExpiresAt`: controle de lease para concorrência/claim.
- `canceledAt`: cancelamento explícito.
- `templateId`: template relacionado, quando existir.
- `createdAt`: criação do job.
- `updatedAt`: atualização do job.

Relacionamentos:

- `workspace`: escopo atual.
- `lessonVersion`: alvo legado macro.
- `block`: alvo legado micro.

Direção:

- manter o conceito;
- remodelar o pai operacional e o `scope` quando o legado sair.

### `Notification`

Papel:

- registro de eventos e avisos operacionais para a UX atual.

Situação:

- `suporte operacional`.

Pai de domínio:

- hoje nenhum pai forte; funciona como caixa de eventos.

Campos:

- `id`: identificador da notificação.
- `workspaceId`: escopo atual.
- `title`: título curto do evento.
- `message`: mensagem detalhada.
- `type`: tipo de notificação.
- `read`: estado de leitura.
- `jobId`: job relacionado, quando houver.
- `jobType`: tipo do job relacionado.
- `jobStatus`: status do job relacionado no momento do registro.
- `lessonId`: lição relacionada no legado.
- `lessonVersionId`: versão relacionada no legado.
- `createdAt`: criação da notificação.
- `updatedAt`: atualização do registro.

Relacionamentos:

- `workspace`: escopo atual.

Direção:

- manter como conceito;
- revisar se deve continuar no banco local ou evoluir para trilha de eventos mais clara.

### `SlideTemplate`

Papel:

- catálogo legado de templates de slide.

Situação:

- `legado operacional`.

Pai de domínio:

- nenhum pai forte; catálogo estático.

Campos:

- `id`: identificador do template.
- `label`: nome legível do template.
- `kind`: família/tipo do template.
- `fileName`: arquivo físico associado.
- `isActive`: habilitação do template.
- `createdAt`: criação do registro.

Relacionamentos:

- não possui relações diretas no schema.

Direção:

- manter apenas enquanto o renderer legado depender disso;
- revisar substituição futura por componentes/presets do novo sistema de composição.

## Problemas centrais do schema atual

1. O nome físico das tabelas principais ainda está em transição e não reflete bem o produto.
2. O conteúdo ainda carrega resíduos de classificação de mídia (`kind`, `orientation`).
3. O contrato da API ainda faz `Content` conhecer associação por `projectIds`.
4. `workspaceId` está propagado em excesso.
5. `metadataJson` está sendo usado como bolsa para estados e contratos ainda não modelados.
6. A produção real ainda depende de `Course/Module/Lesson/LessonVersion/Block`.
7. O nome da tabela de conteúdo ainda não foi decidido de forma limpa (`Content` vs `ContentItem`).

## Ordem recomendada para a revisão do banco

1. Decidir a árvore pai-filho correta do domínio novo.
2. Decidir quais tabelas pertencem ao runtime local e quais pertencem ao control plane online.
3. Fechar o contrato de `Source Preparation`.
4. Tirar `projectIds` do contrato principal de `Content`.
5. Fazer `ProjectContentOutput` virar o pai operacional real do Studio.
6. Só depois remover fisicamente `Course/Module/Lesson` e renomear o schema.

## Regra de manutenção

Ao mudar qualquer tabela ou campo:

- atualizar este documento;
- atualizar `docs/03-technical-architecture.md`;
- atualizar `docs/08-roadmap-status-and-handoff.md` quando houver impacto de migração ou prioridade;
- registrar a decisão em `docs/09-decision-log.md`.
