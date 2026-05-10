# FlowShopy Product Specification

## Entidades de produto

### Workspace

Escopo de isolamento multi-tenant.

Tudo que o usuário cria deve pertencer a um workspace:

- projetos;
- conteúdos;
- assets;
- jobs;
- configurações;
- usuários/membros;
- agentes/workers locais.

Regra de produto:

- o app roda instalado localmente, mas não e single-user por definição;
- o usuário autentica primeiro e depois opera dentro de um workspace com autorização por papel;
- a V1 precisa assumir pelo menos `owner`, `admin` e `member`, mesmo que alguns limites comerciais ainda não estejam fechados;
- a área atual de convite de membros é apenas a semente dessa camada e ainda não representa o modelo final de equipe.

### Project

Agrupador editorial/comercial. Projeto é o contexto que da utilidade ao conteúdo e onde a produção passa a fluir.

Um conteúdo sozinho pode existir como ideia, rascunho ou biblioteca reutilizável, mas só passa a ter impacto quando associado a um projeto.

Definição operacional:

- projeto informa ao core o que se espera que seja feito com um conteúdo;
- projeto não é um tipo de conteúdo nem um canal isolado;
- projeto concentra objetivos, destinos, formatos, estilo, CTA, pipeline e regras de saída;
- projeto é o contrato de intenção entre o usuário e a fábrica do FlowShopy.

Regra de UX: criação de projeto não pede tipo/contexto inicial. O usuário informa nome e descrição, depois escolhe destinos e formatos padrão. O assunto do projeto pode ser campanha, música, produto, evento ou qualquer outro tema, mas isso não deve direcionar o primeiro passo da criação.

Regra de domínio: Project não possui `kind`. Canal, perfil, música, campanha, produto, evento e formato são contexto editorial, destination ou entregável, não classificação do projeto.

Campos conceituais:

- `id`
- `workspaceId`
- `name`
- `description`
- `language`
- `styleDnaJson`
- `defaultDestinationsJson`
- `defaultAspectRatiosJson`
- `outputDefinitionsJson`
- `promotionTargetsJson`
- `shortLinksJson`
- `status`
- `createdAt`
- `updatedAt`

Status sugeridos:

- `draft`
- `active`
- `paused`
- `archived`

### ContentItem

Unidade editorial reutilizável.

Conteúdo é a base para gerar entregáveis. Ele pode ser iniciado rapidamente fora de um projeto, mas precisa ser associado a pelo menos um projeto para entrar em fluxo de produção e entrega.

Um mesmo conteúdo pode ser usado em projetos diferentes. O sistema deve permitir ver onde cada conteúdo está sendo usado.

A tela de criação/edição de conteúdo deve ser voltada para ingestão e preparação do conteúdo:

- ideia;
- pauta;
- roteiro;
- briefing;
- texto base;
- fontes diversas;
- extração até texto bruto utilizável.

Ela não deve concentrar configuração de canais de entrega, aspect ratios ou formatos. Esses dados pertencem ao projeto e às variantes/entregáveis derivados do projeto.

Princípio operacional:

- `ContentItem` não deve ser entendido apenas como texto digitado pelo usuário;
- ele representa o conteúdo em trânsito dentro de uma esteira editorial;
- diferentes tipos de entrada apenas colocam o conteúdo em estágios diferentes dessa esteira.

Tipos previstos:

- `content`

O conteúdo não deve ser classificado como vídeo, imagem, música, texto ou PDF no momento da criação. Uma ideia é apenas uma ideia/conteúdo. Vídeo, imagem, texto, música e PDF são entregáveis/variantes definidos posteriormente pelo projeto, canal de entrega e formato.

Regra: a tela de conteúdo não deve exibir botoes como "vídeo script", "image concept" ou "music vídeo concept" antes do conteúdo existir. Isso antecipa uma decisao de entrega que pertence ao projeto.

Regra: conteúdo isolado não gera cenas, clips ou vídeo. Segmentação em cenas e renderizacao pertencem ao fluxo do projeto/variante, porque somente o projeto define canal de saída, formato, aspect ratio, CTA e entregável.

Campos conceituais:

- `id`
- `workspaceId`
- `projectIds`
- `kind`
- `title`
- `ideaText`
- `sourceText`
- `scriptText`
- `orientation`
- `status`
- `metadataJson`
- `createdAt`
- `updatedAt`

Observação: conteúdo é uma entidade independente de projeto. A associação com projetos deve ser feita por uma tabela de vínculo, permitindo conteúdo sem projeto e conteúdo usado em muitos projetos.

Estados editoriais sugeridos:

- fase `preparation`
  - `source_ingested`
  - `downloading_video`
  - `extracting_audio`
  - `transcribing`
  - `extracting_text`
  - `source_processed`
  - `source_analyzed`
  - `script_developing`
  - `script_ready`
- fase `creation`
  - `output_adapting`
  - `output_structuring`
  - `prompt_review`
  - `tts_review`
  - `image_review`
  - `video_review`
  - `timeline_preview`
  - `ready_for_render`
  - `production_ready`
  - `rendering`
  - `ready`
- fase `publication`
  - `queued_for_publish`
  - `scheduled`
  - `published`

Status de produção sugeridos:

- `idea`
- `script`
- `scenes`
- `assets`
- `editing`
- `ready`
- `scheduled`
- `published`

### ContentSource

Fonte usada para criar ou enriquecer o conteúdo.

Tipos:

- `idea`
- `final_content`
- `text`
- `audio`
- `video_file`
- `video_url`
- `video_url_batch`
- `transcript`
- `pdf`
- `document`
- `manual_notes`

Campos conceituais:

- `id`
- `workspaceId`
- `contentItemId`
- `type`
- `url`
- `localPath`
- `mimeType`
- `rawText`
- `extractedText`
- `transcriptText`
- `analysisJson`
- `artifactsJson`
- `status`

Estados sugeridos:

- `ingested`
- `downloading`
- `downloaded`
- `extracting_audio`
- `transcribing`
- `extracting_text`
- `processed`
- `analyzing`
- `ready_for_script`
- `failed`

Regra de produto:

- `ContentSource` não descreve uma pipeline paralela;
- ele apenas registra de onde o conteúdo veio e quais etapas de preparação ainda faltam;
- um link de vídeo entra mais atrás na esteira do que um texto;
- um PDF entra antes do texto analisado, porque ainda precisa virar texto bruto;
- vários formatos de entrada precisam convergir para o mesmo estado editorial antes da criação de script.
- um conteúdo pode ter uma ou muitas fontes;
- a UI não deve modelar ingestão como um único campo simples quando o objetivo for suportar múltiplas fontes de preparo.
- ao confirmar uma nova fonte, o processamento dela deve começar imediatamente.

Regra de produto para V1 evolutiva:

- a ingestão e preparação de fontes pertence à área `Content`, não à área `Project`;
- o sistema deve identificar a origem da fonte e escolher a pipeline adequada automaticamente;
- não é necessário expor um Kanban para a fase de ingestão de fontes;
- o objetivo dessa fase é sempre convergir para texto bruto utilizável.
- a fila inicial de preparação deve ser sequencial, uma fonte por vez;
- vídeo por link ou arquivo: download -> extração de áudio -> transcrição;
- áudio: transcrição;
- PDF/documento: extração de texto;
- texto: persistência direta como texto bruto.

Regra de associação com projeto:

- um conteúdo pode ser associado a projeto antes do fim da preparação;
- nesse caso, o detalhe do projeto deve exibir o conteúdo na fase `Preparation`;
- o conteúdo só fica plenamente apto para `Creation` quando todas as fontes confirmadas tiverem convergido para texto bruto.

### ContentScript

Representa o estado em que o conteúdo já pode ser tratado como script.

Leitura correta:

- todo conteúdo que vai gerar entregável precisa, em algum momento, virar script;
- alguns inputs passam por análise e desenvolvimento até chegar lá;
- outros já entram praticamente nesse estado porque o usuário forneceu o script pronto.

Tipos previstos:

- `master_script`
- `output_script`

Campos conceituais:

- `id`
- `workspaceId`
- `contentItemId`
- `projectContentOutputId`
- `kind`
- `sourceMode`
- `title`
- `scriptText`
- `language`
- `status`
- `approvalStatus`
- `metadataJson`

Estados sugeridos:

- `draft`
- `in_review`
- `approved`
- `rejected`

Regras:

- `master_script` e o script-base aprovado do conteúdo;
- `output_script` e a adaptação do script para um output específico;
- `final content mode` não cria outro tipo de conteúdo; apenas coloca o conteúdo mais adiante na esteira;
- o sistema deve permitir revisão humana antes de outputs seguirem para produção.
- `script_ready` ainda pertence ao conteúdo, não ao output;
- a produção por output só começa depois dessa convergência, salvo quando o usuário já forneceu script específico aprovado.
- `source mode` e `final content mode` são decisão do usuário, não do formato de saída;
- em `final content mode`, o sistema deve conseguir verificar se todos os outputs obrigatórios do projeto já receberam seus conteúdos finais;
- quando um projeto exigir múltiplas saídas, `script_ready` do conteúdo não deve significar que todos os outputs já estão prontos para `Creation`;
- a UI não deve expor um botão de “marcar como script pronto”;
- `script_ready` precisa ser derivado do que realmente já foi produzido e validado;
- quando houver controle por saída, cada combinação `canal + formato` pode avançar para `Creation` assim que seu script específico estiver pronto.
- a cadeia correta é `conteudo -> projeto -> canal -> formato -> prompt -> final content`;
- o resultado da preparação não é o vídeo final, mas um `final content` para cada entregável configurado.
- para entrar em `Creation`, cada `ProjectContentOutput` precisa ter seu próprio script final resolvido.

### ProjectOutputDefinition

Contrato declarativo de saída esperado pelo projeto.

Ele descreve quais tipos de entregável o projeto quer produzir a partir de conteúdos associados.

Tipos previstos:

- `video`
- `image`
- `text`
- `audio`
- `ebook`
- `infographic`
- `carousel`

Campos conceituais:

- `id`
- `workspaceId`
- `projectId`
- `outputType`
- `destination`
- `format`
- `aspectRatio`
- `language`
- `ctaStrategyJson`
- `pipelineJson`
- `styleOverridesJson`
- `publishPolicyJson`
- `templateSelectionStrategyJson`
- `status`

Regras:

- o projeto pode ter uma ou muitas definicoes de output;
- nem todo projeto precisa gerar vídeo;
- o projeto pode declarar saídas futuras mesmo que a execução inicial da V1 priorize vídeo;
- canais, formatos e pipelines devem nascer aqui, não em `ContentItem`.
- a definição de output também deve permitir parâmetros editoriais e operacionais por saída, como:
  - duração mínima;
  - duração máxima;
  - limite de caracteres por bloco;
  - template/preset elegível;
  - estratégia de seleção de template.

### ProjectContentOutput

Saída derivada de um `ContentItem` dentro de um `Project`, seguindo uma `ProjectOutputDefinition`.

Exemplos:

- YouTube vídeo `16:9`
- YouTube Shorts `9:16`
- TikTok `9:16`
- Instagram Reels `9:16`
- Instagram feed `1:1`
- Facebook vídeo `16:9`
- PDF derivado
- carousel educacional
- narração em áudio

Campos conceituais:

- `id`
- `workspaceId`
- `contentItemId`
- `projectId`
- `projectOutputDefinitionId`
- `destination`
- `format`
- `aspectRatio`
- `durationTargetSec`
- `durationMinSec`
- `durationMaxSec`
- `blockCharLimit`
- `scriptStrategy`
- `scriptSourceMode`
- `ctaStrategyJson`
- `templatePoolJson`
- `selectedTemplateId`
- `templateSelectionTraceJson`
- `renderPlanJson`
- `styleOverridesJson`
- `publishCopy`
- `plannedPublishAt`
- `status`

Na primeira implementação, `ProjectContentOutput` pode viver parcialmente em `metadataJson` até ficar claro o contrato final.

Regras:

- um `ProjectContentOutput` representa um entregável concreto de um conteúdo dentro de um projeto;
- cenas, cards, páginas, seções e renders devem ser gerados a partir de um `ProjectContentOutput`, não do `ContentItem` isolado;
- YouTube `16:9`, YouTube Shorts `9:16`, TikTok `9:16`, Instagram Reels e Facebook vídeo são variantes diferentes;
- cada variante pode ter CTA específico de canal;
- partes comuns devem ser reaproveitadas sempre que possível;
- partes específicas de canal devem ser renderizadas separadamente quando isso reduzir custo e tempo.
- um output pode usar script derivado do conteúdo-base ou script específico já fornecido pelo usuário;
- o output precisa saber qual preset/template foi escolhido e por qual estratégia.
- o output não deve ser a unidade responsável pela preparação inicial do conteúdo;
- download de vídeo, extração de áudio, transcrição e extração de texto ainda pertencem à fase de preparação compartilhada do conteúdo.
- quando o projeto estiver em `final content mode`, cada output deve poder apontar explicitamente para o conteúdo final correspondente;
- se um output obrigatório não tiver script final, ele deve permanecer fora da fase `Creation`.

Regra adicional:

- em `source mode`, cada `ProjectContentOutput` precisa ter um prompt próprio de transformação;
- esse prompt é definido por combinação `canal + formato`;
- a ferramenta pode fornecer prompts padrão como ponto de partida;
- na fase atual do projeto, esses prompts devem ficar visíveis ao usuário para aprendizado e validação.
- a execução desses prompts ainda pertence ao fechamento da fase `Preparation`;

Estados sugeridos para outputs:

- `waiting_for_script`
- `script_ready`
- `adapting`
- `structured`
- `production_ready`
- `rendering`
- `ready`
- `failed`

### OutputTemplate e TemplateSelectionStrategy

Projeto e output não devem depender de um único template fixo por formato.

`OutputTemplate` representa uma receita de apresentação, estrutura e produção para determinado tipo de saída.

Campos conceituais:

- `id`
- `workspaceId`
- `name`
- `outputType`
- `destination`
- `format`
- `aspectRatio`
- `structureRulesJson`
- `visualRulesJson`
- `promptRulesJson`
- `status`

`TemplateSelectionStrategy` representa a forma como um projeto escolhe templates elegíveis.

Tipos previstos:

- `fixed`
- `random`
- `round_robin`
- `priority_queue`
- `contextual`

Campos conceituais:

- `strategy`
- `eligibleTemplateIds`
- `rotationStateJson`
- `contextRulesJson`

Regras:

- um projeto pode habilitar múltiplos templates por saída;
- a estratégia de seleção deve ser rastreável;
- o usuário precisa conseguir decidir se quer repetição fixa, variação controlada ou rotação automática.

### Orquestração de projeto

A visão principal do projeto não deve obrigar o usuário a avançar manualmente output por output com uma sequência de botões.

Campos conceituais:

- `startPolicy`
- `queuePolicyJson`
- `humanGatePolicyJson`
- `automationPolicyJson`

Regras:

- o projeto precisa aceitar um comando principal de início;
- esse comando deve disparar a esteira para todos os entregáveis elegíveis;
- a execução pode ser serial, paralela limitada ou baseada em fila, conforme hardware e regras locais;
- pontos de revisão humana continuam existindo, mas o avanço operacional não deve depender de dezenas de cliques fragmentados.
- antes de disparar `Creation`, o sistema precisa validar se:
  - a preparação compartilhada do conteúdo terminou;
  - ou, no caso de `final content mode`, se os conteúdos finais exigidos por saída já foram fornecidos.

### DeliveryChannel

Canal de saída/entrega associado a um projeto ou variante.

Tipos previstos:

- `youtube`
- `youtube_shorts`
- `instagram_reels`
- `instagram_feed`
- `facebook_video`
- `facebook_feed`
- `tiktok`
- `community_post`
- `pdf`

Regras:

- canal define formatos possíveis;
- formato define tipo de entregável: vídeo, imagem, texto, PDF ou combinação;
- aspect ratio/dimensoes devem respeitar o canal;
- V1 foca em vídeo, mas texto/imagem/PDF devem ficar previstos.

Mapeamento inicial de entregáveis:

| Canal | Entregáveis previstos |
| --- | --- |
| YouTube | vídeo horizontal, Shorts vertical, futuro Community post texto/imagem/enquete |
| TikTok | vídeo vertical |
| Instagram | vídeo vertical, imagem, carousel futuro |
| Facebook | vídeo horizontal, vídeo vertical, imagem, texto futuro |
| PDF/Lead magnet | PDF derivado do conteúdo, futuro |

Itens a verificar antes de implementar formatos não-vídeo:

- recursos e limites atuais da aba Comunidade do YouTube;
- dimensões recomendadas para imagens e vídeos no Facebook;
- formatos aceitos no Instagram feed/Reels/carousel;
- limites e requisitos de APIs de publicação;
- melhores praticas para PDF/isca digital por tipo de conteúdo.

### PromotionTarget

Produto, oferta, evento ou destino comercial promovido por um projeto.

Campos conceituais:

- `id`
- `workspaceId`
- `projectId`
- `name`
- `description`
- `destinationUrl`
- `shortLinkId`
- `qrCodeAssetId`
- `startsAt`
- `endsAt`
- `status`
- `metadataJson`

Regras:

- um projeto pode promover mais de um produto;
- promoções podem ter período de início e fim;
- o produto promovido pode mudar ao longo do tempo;
- materiais publicados devem preferir short links internos em vez de URLs finais;
- trocar o destino do short link deve atualizar o destino de todos os materiais já distribuídos que usam aquele short link.

### ShortLink

Link curto interno redirecionável.

Uso:

- descrições de vídeo;
- PDFs/e-books;
- QRCode;
- imagens;
- posts;
- materiais que podem não ser editáveis depois da publicação.

Campos conceituais:

- `id`
- `workspaceId`
- `slug`
- `currentDestinationUrl`
- `status`
- `createdAt`
- `updatedAt`
- `metadataJson`

Requisitos futuros:

- histórico de destinos;
- cliques;
- origem/referrer quando disponível;
- UTM;
- expiração;
- QRCode;
- auditoria.

### Scene / Block

Menor unidade de geração e revisão.

Campos:

- `variantId`
- `role`
- `variantScope`
- `sourceText`
- `ttsText`
- `onScreenJson`
- `imagePromptJson`
- `animationPromptJson`
- `directionNotesJson`
- `soundEffectPromptJson`
- `durationEstimateS`
- `audioDurationS`
- `status`

Regras:

- cenas pertencem ao fluxo de produção de uma Variant;
- Nem todo texto do roteiro precisa ser narrado.
- Uma cena pode ter texto narrado, texto em tela e notas de direção.
- `role` pode ser `core`, `intro`, `cta`, `outro` ou `platform_specific`;
- `variantScope` pode ser `shared` ou específico de um destino/formato;
- Prompt de imagem deve ser específico para a cena.
- Prompt de animação deve descrever movimento/camera/ação da imagem.
- Notas de direção devem orientar edição, continuidade visual e restrições que não devem ser narradas.
- Prompt de sound effect e opcional e pode ficar vazio quando a cena não pede efeito sonoro.

Regra de vocabulario:

- `Scene` e `Block` são unidades editoriais/técnicas do output;
- elas não devem ser descritas ao usuário com terminologia herdada de ensino ou estruturas equivalentes.

## Fluxos funcionais

### Fluxo 1: criar projeto

1. Usuário abre Projects.
2. Ve a grade visual de projetos.
3. Escolhe criar novo projeto.
4. Entra em uma tela separada de cadastro de projeto.
5. Informa nome e descrição.
6. Define destinos e aspect ratios padrão.
7. Sistema cria Project.
8. Usuário volta para o detalhe do projeto.

Aceite:

- projeto aparece na lista;
- projeto abre uma área própria com Contents, Feed e Kanban;
- `Agenda` não precisa aparecer no fluxo principal enquanto ainda não houver integrações reais de contas/plataformas;
- usuário pode seguir a produção de entregáveis a partir de conteúdos já associados;
- usuário não cria conteúdo dentro do detalhe do projeto.

### Fluxo 1B: iniciar por conteúdo rápido

1. Usuário abre a área Content.
2. Sistema exibe uma listagem de conteúdos existentes em um fluxo próprio de biblioteca editorial.
3. Usuário aciona o botão de incluir novo conteúdo.
4. Sistema abre a tela de cadastro de conteúdo.
5. Usuário informa ideia, roteiro ou fonte.
6. Usuário pode adicionar uma ou muitas fontes e acompanhar sua preparação até texto bruto.
7. Usuário pode associar o conteúdo a um ou mais projetos existentes.
8. Sistema salva o conteúdo e registra seus usos no workspace.
9. Canais de entrega, formatos, cenas e renders ficam para o fluxo do projeto/variante.

Aceite:

- área Content abre em modo listagem;
- listagem possui botão para incluir novo conteúdo;
- listagem mostra todos os conteúdos já criados no workspace, independente do projeto;
- listagem deve ter foco visual no conteúdo: titulo, resumo, data, status e usos;
- projeto não deve ser o destaque do card/lista; deve aparecer apenas como metadado secundario de uso;
- listagem permite alternar entre grade e lista;
- listagem permite filtrar por nome e data de criação;
- listagem permite filtrar por projeto associado;
- listagem permite filtrar por destination, usando destinos do conteúdo quando existirem ou destinos padrão do projeto enquanto Variant/ProjectContent não existir;
- conteúdo pode ser criado rapidamente;
- tela prioriza ingestão e preparação de fontes;
- a etapa não expõe prompt de IA;
- cadastro de conteúdo não cria projeto;
- conteúdo pode existir sem projeto, mas precisa estar associado a um projeto para entrar em produção de entregável;
- tela Content não gera cenas, blocos, assets ou vídeo;
- conteúdo pode ser aberto para edição quando ainda não iniciou produção de entregável;
- V1 bloqueia edição de conteúdo que já iniciou produção de entregável;
- associação a um ou mais projetos não bloqueia edição por si so;
- o bloqueio só ocorre quando algum projeto iniciou criação/geração de entregável com base naquele conteúdo;
- versão futura deve permitir nova versão do conteúdo quando ele já tiver sido usado em entregáveis;
- ao associar a projeto, o conteúdo fica disponível para o fluxo do projeto;
- usuário consegue ver em quais projetos o conteúdo está sendo usado.

### Fluxo 2: produzir entregável a partir de conteúdo associado

1. Usuário abre um projeto com conteúdo associado.
2. Sistema lista os conteúdos associados.
3. Usuário escolhe um conteúdo existente.
4. Usuário escolhe qual output do projeto deseja produzir.
5. Sistema gera um `ProjectContentOutput`.
6. Sistema gera cenas/blocos a partir do conteúdo no contexto desse output.
7. Usuário abre o editor para seguir com o entregável.
8. Conteúdo continua sendo unidade editorial genérica; vídeo, imagem, texto, áudio, e-book, infográfico ou carousel são entregáveis derivados.
9. Usuário opera a produção no contexto do output, nunca do conteúdo isolado.

Aceite:

- ContentItem e salvo;
- área Content não exibe `Generate Blocks`, `Generate Scenes` ou `Open Editor`;
- geração de blocos/cenas fica no projeto/output;
- usuário não precisa escolher vídeo, imagem, texto, áudio ou e-book antes de produzir o conteúdo;
- usuário não precisa entender nenhuma entidade herdada do projeto anterior.

### Fluxo 3: criar conteúdo por ideia

1. Usuário escreve uma ideia.
2. Usuário escolhe modelo/LLM.
3. Sistema gera roteiro.
4. Usuário revisa.
5. Usuário associa a um projeto.
6. Segmentação em cenas acontece depois, no fluxo de uma variante do projeto.

V1 pode iniciar com texto manual. Geração por LLM entra em seguida.

### Fluxo 4: gerar vídeo final

1. Usuário abre um projeto com conteúdo associado.
2. Projeto define canais, formatos e outputs.
3. Usuário inicia a produção de um output de vídeo.
4. Sistema gera cenas comuns (`core`) e cenas específicas (`intro`, `cta`, `outro`, `platform_specific`) conforme o canal/formato.
5. Sistema gera TTS.
6. Sistema gera imagens.
7. Sistema anima/renderiza cenas.
8. Sistema renderiza blocos comuns reutilizáveis e blocos específicos de canal.
9. Sistema compoe o vídeo final do output.
10. Sistema disponibiliza download.

Aceite:

- MP4 final fica acessivel por link/download;
- edições em blocos invalidam apenas dependências necessarias;
- mudanca em CTA de uma plataforma deve reprocessar preferencialmente só o bloco específico e a composição final daquele output;
- status de jobs aparece no produto.

### Fluxo 4B: CTAs e render por blocos

1. Conteúdo gera um plano base comum dentro do projeto.
2. Cada canal/formato recebe um output.
3. Outputs podem compartilhar cenas `core`.
4. Outputs podem ter cenas CTA específicas.
5. Blocos comuns podem ser renderizados e cacheados.
6. Blocos específicos de canal podem ser renderizados separadamente.
7. A composição final une blocos comuns e específicos.

Regras:

- se a transição entre blocos for simples, como corte seco ou fade previsivel, o sistema pode concatenar clips renderizados;
- se a transição depender visualmente da cena anterior/proxima, o render da variante deve recompor a borda afetada ou renderizar a sequencia final em uma passagem;
- V1 deve preferir transições simples entre blocos variáveis para permitir cache e reaproveitamento;
- CTAs devem poder ser diferentes por plataforma sem exigir re-render completo do conteúdo comum;
- exemplos de CTA: YouTube pede inscrição no canal, Facebook pede seguir a página, TikTok pode pedir tocar no botão de seguir do perfil.

### Fluxo 5: Feed

1. Usuário abre Feed.
2. Sistema lista conteúdos do projeto em grade.
3. Cada card mostra preview, status, destinos e aspect ratios.
4. Conteúdos sem asset usam placeholder.

Aceite:

- grade funciona sem thumbnails reais;
- card deixa claro se e vídeo horizontal, vertical, imagem ou misto;
- usuário consegue abrir o conteúdo/editor a partir do card.

### Fluxo 6: Kanban

1. Usuário abre Kanban.
2. Sistema agrupa conteúdos por status.
3. Usuário visualiza andamento.
4. Futuro: usuário arrasta entre colunas.

Aceite inicial:

- colunas aparecem;
- conteúdos aparecem na coluna correta;
- estado vazio e claro.
- a tela evita blocos longos de texto explicativo;
- contagens aparecem inline no título das colunas ou visões, no formato `Preparation (3)`;
- ajuda textual da tela deve migrar para um painel lateral direito aberto por ícone de interrogação na barra superior;
- o painel de ajuda deve ser sensível ao contexto da tela atual.

Regra de domínio para o Kanban do projeto:

- `Review` não aparece como fase macro separada;
- aprovações humanas acontecem dentro de `Creation`;
- exemplos: revisão de prompts por bloco, revisão de TTS, revisão de imagens, revisão de vídeos, aprovação do preview/timeline antes do render;
- somente depois dessa aprovação o output pode ser marcado para render imediato ou fila de render.

### Fluxo 7: Agenda operacional

Precondicao:

- existe integração autorizada com contas/plataformas de distribuição;
- o sistema consegue ler ou reconciliar agendamentos/publicações reais.

1. Usuário abre Agenda.
2. Sistema mostra postagens agendadas e publicações realizadas por plataforma.
3. Sistema cruza projeto, output, responsável e status operacional.
4. Usuário filtra por responsável, plataforma, projeto e status.

Aceite inicial correto:

- agenda mostra dados operacionais reais ou reconciliados;
- agendamentos não dependem apenas de metadata manual solta;
- postagens/publicações podem ser vistas por plataforma;
- conteúdos sem data real podem continuar em uma secao auxiliar, mas não devem definir a utilidade principal da Agenda.

## Plataformas, entregáveis e aspect ratios

Mapeamento inicial:

| Plataforma/canal | Formatos |
| --- | --- |
| YouTube | `16:9`, `9:16` Shorts |
| TikTok | `9:16` |
| Instagram | `9:16` Reels, `1:1`, `4:5`, carousel futuro |
| Facebook | `16:9`, `9:16`, imagem/feed futuro |
| PDF/isca digital | dimensões/formato a definir em feature futura |

Regra: vídeo longo `16:9` não deve virar automáticamente vertical por crop. Uma variante curta deve poder ter roteiro/cenas próprias geradas pela LLM a partir dos pontos altos.

Regra: cada canal deve controlar quais entregáveis são permitidos. Exemplo: TikTok não deve sugerir imagem/PDF como entrega primaria; YouTube pode sugerir vídeo horizontal, Shorts e futuramente Community post; Instagram/Facebook podem sugerir imagem e vídeo.

## Requisitos não funcionais

- Local-first na V1.
- SQLite local por padrão.
- Worker serial por padrão para preservar VRAM.
- Multi-workspace no domínio.
- Jobs rastreaveis.
- Reprocessamento granular.
- Assets em filesystem sob `DATA_DIR`.
- Configurações por usuário/workspace.
- UI utilizável por não-técnicos.

## Critérios de aceite do MVP de FlowShopy

- usuário cria projeto content-first;
- usuário cria ou associa conteúdo a projeto sem qualquer referência a estruturas herdadas;
- usuário gera cenas/blocos somente no contexto de projeto/output de vídeo;
- usuário edita cenas no editor;
- usuário gera assets;
- usuário renderiza MP4;
- Feed mostra conteúdos;
- Kanban mostra produção;
- Agenda entra depois, quando houver integrações reais de contas e distribuição;
- Gemini pode ser configurado como LLM;
- referências herdadas podem continuar existindo internamente por um período, mas não aparecem como modelo do produto.
