# FlowShopy Product Specification

## Entidades de produto

### Workspace

Escopo de isolamento multi-tenant.

Tudo que o usuario cria deve pertencer a um workspace:

- projetos;
- conteudos;
- assets;
- jobs;
- configuracoes;
- usuarios/membros;
- agentes/workers locais.

### Project

Agrupador editorial/comercial. Projeto e o contexto que da utilidade ao conteudo e onde a producao passa a fluir.

Um conteudo sozinho pode existir como ideia, rascunho ou biblioteca reutilizavel, mas so passa a ter impacto quando associado a um projeto.

Regra de UX: criacao de projeto nao pede tipo/contexto inicial. O usuario informa nome e descricao, depois escolhe destinos e formatos padrao. O assunto do projeto pode ser curso, campanha, musica ou qualquer outro tema, mas isso nao deve direcionar o primeiro passo da criacao.

Regra de dominio: Project nao possui `kind`. Canal, perfil, curso, musica, campanha e formato sao contexto editorial, destination ou entregavel, nao classificacao do projeto.

Campos conceituais:

- `id`
- `workspaceId`
- `name`
- `description`
- `language`
- `styleDnaJson`
- `defaultDestinationsJson`
- `defaultAspectRatiosJson`
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

Unidade editorial reutilizavel.

Conteudo e a base para gerar entregaveis. Ele pode ser iniciado rapidamente fora de um projeto, mas precisa ser associado a pelo menos um projeto para entrar em fluxo de producao e entrega.

Um mesmo conteudo pode ser usado em projetos diferentes. O sistema deve permitir ver onde cada conteudo esta sendo usado.

A tela de criacao/edicao de conteudo deve ser voltada para producao do conteudo em si:

- ideia;
- pauta;
- roteiro;
- briefing;
- texto base;
- solicitacoes para IA;
- iteracoes ate chegar a um roteiro/conteudo utilizavel.

Ela nao deve concentrar configuracao de canais de entrega, aspect ratios ou formatos. Esses dados pertencem ao projeto e as variantes/entregaveis derivados do projeto.

Tipos previstos:

- `content`

O conteudo nao deve ser classificado como video, imagem, musica, texto ou PDF no momento da criacao. Uma ideia e apenas uma ideia/conteudo. Video, imagem, texto, musica e PDF sao entregaveis/variantes definidos posteriormente pelo projeto, canal de entrega e formato.

Regra: a tela de conteudo nao deve exibir botoes como "video script", "image concept" ou "music video concept" antes do conteudo existir. Isso antecipa uma decisao de entrega que pertence ao projeto.

Regra: conteudo isolado nao gera cenas, clips ou video. Segmentacao em cenas e renderizacao pertencem ao fluxo do projeto/variante, porque somente o projeto define canal de saida, formato, aspect ratio, CTA e entregavel.

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

Observacao: conteudo e uma entidade independente de projeto. A associacao com projetos deve ser feita por uma tabela de vinculo, permitindo conteudo sem projeto e conteudo usado em muitos projetos.

Status de producao sugeridos:

- `idea`
- `script`
- `scenes`
- `assets`
- `editing`
- `ready`
- `scheduled`
- `published`

### ContentSource

Fonte usada para criar ou enriquecer o conteudo.

Tipos:

- `idea`
- `script`
- `video_url`
- `transcript`
- `file`
- `manual_notes`

Campos conceituais:

- `id`
- `workspaceId`
- `contentItemId`
- `type`
- `url`
- `rawText`
- `analysisJson`
- `status`

### Variant

Saida derivada de um ContentItem.

Exemplos:

- YouTube video `16:9`
- YouTube Shorts `9:16`
- TikTok `9:16`
- Instagram Reels `9:16`
- Instagram feed `1:1`
- Facebook video `16:9`
- Course lesson `16:9`

Campos conceituais:

- `id`
- `workspaceId`
- `contentItemId`
- `projectId`
- `destination`
- `format`
- `aspectRatio`
- `durationTargetSec`
- `scriptStrategy`
- `ctaStrategyJson`
- `renderPlanJson`
- `styleOverridesJson`
- `publishCopy`
- `plannedPublishAt`
- `status`

Na primeira implementacao, Variant pode viver em `metadataJson` ate ficar claro o contrato final.

Regras:

- uma Variant representa um entregavel concreto de um conteudo dentro de um projeto;
- cenas e renders devem ser gerados a partir de uma Variant, nao do ContentItem isolado;
- YouTube `16:9`, YouTube Shorts `9:16`, TikTok `9:16`, Instagram Reels e Facebook video sao variantes diferentes;
- cada variante pode ter CTA especifico de canal;
- partes comuns devem ser reaproveitadas sempre que possivel;
- partes especificas de canal devem ser renderizadas separadamente quando isso reduzir custo e tempo.

### DeliveryChannel

Canal de saida/entrega associado a um projeto ou variante.

Tipos previstos:

- `course`
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

- canal define formatos possiveis;
- formato define tipo de entregavel: video, imagem, texto, PDF ou combinacao;
- aspect ratio/dimensoes devem respeitar o canal;
- V1 foca em video, mas texto/imagem/PDF devem ficar previstos.

Mapeamento inicial de entregaveis:

| Canal | Entregaveis previstos |
| --- | --- |
| Curso | video horizontal |
| YouTube | video horizontal, Shorts vertical, futuro Community post texto/imagem/enquete |
| TikTok | video vertical |
| Instagram | video vertical, imagem, carousel futuro |
| Facebook | video horizontal, video vertical, imagem, texto futuro |
| PDF/Lead magnet | PDF derivado do conteudo, futuro |

Itens a verificar antes de implementar formatos nao-video:

- recursos e limites atuais da aba Comunidade do YouTube;
- dimensoes recomendadas para imagens e videos no Facebook;
- formatos aceitos no Instagram feed/Reels/carousel;
- limites e requisitos de APIs de publicacao;
- melhores praticas para PDF/isca digital por tipo de conteudo.

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
- promocoes podem ter periodo de inicio e fim;
- o produto promovido pode mudar ao longo do tempo;
- materiais publicados devem preferir short links internos em vez de URLs finais;
- trocar o destino do short link deve atualizar o destino de todos os materiais ja distribuidos que usam aquele short link.

### ShortLink

Link curto interno redirecionavel.

Uso:

- descricoes de video;
- PDFs/e-books;
- QRCode;
- imagens;
- posts;
- materiais que podem nao ser editaveis depois da publicacao.

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

- historico de destinos;
- cliques;
- origem/referrer quando disponivel;
- UTM;
- expiracao;
- QRCode;
- auditoria.

### Scene / Block

Menor unidade de geracao e revisao.

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

- cenas pertencem ao fluxo de producao de uma Variant;
- Nem todo texto do roteiro precisa ser narrado.
- Uma cena pode ter texto narrado, texto em tela e notas de direcao.
- `role` pode ser `core`, `intro`, `cta`, `outro` ou `platform_specific`;
- `variantScope` pode ser `shared` ou especifico de um destino/formato;
- Prompt de imagem deve ser especifico para a cena.
- Prompt de animacao deve descrever movimento/camera/acao da imagem.
- Notas de direcao devem orientar edicao, continuidade visual e restricoes que nao devem ser narradas.
- Prompt de sound effect e opcional e pode ficar vazio quando a cena nao pede efeito sonoro.

## Fluxos funcionais

### Fluxo 1: criar projeto

1. Usuario abre Projects.
2. Ve a grade visual de projetos.
3. Escolhe criar novo projeto.
4. Entra em uma tela separada de cadastro de projeto.
5. Informa nome e descricao.
6. Define destinos e aspect ratios padrao.
7. Sistema cria Project.
8. Usuario volta para o detalhe do projeto.

Aceite:

- projeto aparece na lista;
- projeto abre uma area propria com Contents, Feed, Kanban e Agenda;
- usuario pode seguir a producao de entregaveis a partir de conteudos ja associados;
- usuario nao cria conteudo dentro do detalhe do projeto.

### Fluxo 1B: iniciar por conteudo rapido

1. Usuario abre a area Content.
2. Sistema exibe uma listagem de conteudos existentes, em fluxo semelhante a lista de cursos.
3. Usuario aciona o botao de incluir novo conteudo.
4. Sistema abre a tela de cadastro de conteudo.
5. Usuario informa ideia, roteiro ou fonte.
6. Usuario pode escrever livremente e/ou registrar uma instrucao para IA.
7. Usuario associa o conteudo somente a um projeto existente.
8. Sistema salva o conteudo como parte do projeto.
9. Canais de entrega, formatos, cenas e renders ficam para o fluxo do projeto/variante.

Aceite:

- area Content abre em modo listagem;
- listagem possui botao para incluir novo conteudo;
- listagem mostra todos os conteudos ja criados no workspace, independente do projeto;
- listagem deve ter foco visual no conteudo: titulo, resumo, data, status e usos;
- projeto nao deve ser o destaque do card/lista; deve aparecer apenas como metadado secundario de uso;
- listagem permite alternar entre grade e lista;
- listagem permite filtrar por nome e data de criacao;
- listagem permite filtrar por projeto associado;
- listagem permite filtrar por destination, usando destinos do conteudo quando existirem ou destinos padrao do projeto enquanto Variant/ProjectContent nao existir;
- conteudo pode ser criado rapidamente;
- tela prioriza escrita/producao de conteudo;
- existe um bloco claro de prompt/solicitacao para IA;
- cadastro de conteudo nao cria projeto;
- conteudo precisa ser associado a um projeto existente;
- tela Content nao gera cenas, blocos, assets ou video;
- conteudo pode ser aberto para edicao quando ainda nao iniciou producao de entregavel;
- V1 bloqueia edicao de conteudo que ja iniciou producao de entregavel;
- associacao a um ou mais projetos nao bloqueia edicao por si so;
- o bloqueio so ocorre quando algum projeto iniciou criacao/geracao de entregavel com base naquele conteudo;
- versao futura deve permitir nova versao do conteudo quando ele ja tiver sido usado em entregaveis;
- ao associar a projeto, o conteudo fica disponivel para o fluxo do projeto;
- usuario consegue ver em quais projetos o conteudo esta sendo usado.

### Fluxo 2: produzir entregavel a partir de conteudo associado

1. Usuario abre um projeto com conteudo associado.
2. Sistema lista os conteudos associados.
3. Usuario escolhe um conteudo existente.
4. Sistema gera cenas/blocos a partir do conteudo.
5. Usuario abre o editor para seguir com o entregavel.
6. Conteudo continua sendo unidade editorial generica; video, imagem, musica ou PDF sao entregaveis/variantes.
7. Usuario inicia a producao de uma variante de video dentro do projeto.
8. Sistema gera blocos/cenas para aquela variante.
9. Usuario abre editor da variante.

Aceite:

- ContentItem e salvo;
- area Content nao exibe `Generate Blocks`, `Generate Scenes` ou `Open Editor`;
- geracao de blocos/cenas fica no projeto/variante;
- usuario nao precisa escolher video, imagem ou musica antes de produzir o conteudo;
- usuario nao precisa entender Course/Module/Lesson.

### Fluxo 3: criar conteudo por ideia

1. Usuario escreve uma ideia.
2. Usuario escolhe modelo/LLM.
3. Sistema gera roteiro.
4. Usuario revisa.
5. Usuario associa a um projeto.
6. Segmentacao em cenas acontece depois, no fluxo de uma variante do projeto.

V1 pode iniciar com texto manual. Geracao por LLM entra em seguida.

### Fluxo 4: gerar video final

1. Usuario abre um projeto com conteudo associado.
2. Projeto define canais, formatos e variantes de video.
3. Usuario inicia a producao de uma variante.
4. Sistema gera cenas comuns (`core`) e cenas especificas (`intro`, `cta`, `outro`, `platform_specific`) conforme o canal/formato.
5. Sistema gera TTS.
6. Sistema gera imagens.
7. Sistema anima/renderiza cenas.
8. Sistema renderiza blocos comuns reutilizaveis e blocos especificos de canal.
9. Sistema compoe o video final da variante.
10. Sistema disponibiliza download.

Aceite:

- MP4 final fica acessivel por link/download;
- edicoes em blocos invalidam apenas dependencias necessarias;
- mudanca em CTA de uma plataforma deve reprocessar preferencialmente so o bloco especifico e a composicao final daquela variante;
- status de jobs aparece no produto.

### Fluxo 4B: CTAs e render por blocos

1. Conteudo gera um plano base comum dentro do projeto.
2. Cada canal/formato recebe uma Variant.
3. Variants podem compartilhar cenas `core`.
4. Variants podem ter cenas CTA especificas.
5. Blocos comuns podem ser renderizados e cacheados.
6. Blocos especificos de canal podem ser renderizados separadamente.
7. A composicao final une blocos comuns e especificos.

Regras:

- se a transicao entre blocos for simples, como corte seco ou fade previsivel, o sistema pode concatenar clips renderizados;
- se a transicao depender visualmente da cena anterior/proxima, o render da variante deve recompor a borda afetada ou renderizar a sequencia final em uma passagem;
- V1 deve preferir transicoes simples entre blocos variaveis para permitir cache e reaproveitamento;
- CTAs devem poder ser diferentes por plataforma sem exigir re-render completo do conteudo comum;
- exemplos de CTA: YouTube pede inscricao no canal, Facebook pede seguir a pagina, TikTok pode pedir tocar no botao de seguir do perfil.

### Fluxo 5: Feed

1. Usuario abre Feed.
2. Sistema lista conteudos do projeto em grade.
3. Cada card mostra preview, status, destinos e aspect ratios.
4. Conteudos sem asset usam placeholder.

Aceite:

- grade funciona sem thumbnails reais;
- card deixa claro se e video horizontal, vertical, imagem ou misto;
- usuario consegue abrir o conteudo/editor a partir do card.

### Fluxo 6: Kanban

1. Usuario abre Kanban.
2. Sistema agrupa conteudos por status.
3. Usuario visualiza andamento.
4. Futuro: usuario arrasta entre colunas.

Aceite inicial:

- colunas aparecem;
- conteudos aparecem na coluna correta;
- estado vazio e claro.

### Fluxo 7: Agenda

1. Usuario abre Agenda.
2. Sistema mostra proximos prazos/publicacoes.
3. Futuro: usuario filtra por responsavel/plataforma.

Aceite inicial:

- lista/agenda aparece;
- conteudos sem data aparecem em secao "sem data";
- dados podem vir de metadata inicialmente.

## Plataformas, entregaveis e aspect ratios

Mapeamento inicial:

| Plataforma/canal | Formatos |
| --- | --- |
| YouTube | `16:9`, `9:16` Shorts |
| TikTok | `9:16` |
| Instagram | `9:16` Reels, `1:1`, `4:5`, carousel futuro |
| Facebook | `16:9`, `9:16`, imagem/feed futuro |
| Curso | geralmente `16:9`, mas sem restricao tecnica |
| PDF/isca digital | dimensoes/formato a definir em feature futura |

Regra: video longo `16:9` nao deve virar automaticamente vertical por crop. Uma variante curta deve poder ter roteiro/cenas proprias geradas pela LLM a partir dos pontos altos.

Regra: cada canal deve controlar quais entregaveis sao permitidos. Exemplo: TikTok nao deve sugerir imagem/PDF como entrega primaria; YouTube pode sugerir video horizontal, Shorts e futuramente Community post; Instagram/Facebook podem sugerir imagem e video.

## Requisitos nao funcionais

- Local-first na V1.
- SQLite local por padrao.
- Worker serial por padrao para preservar VRAM.
- Multi-workspace no dominio.
- Jobs rastreaveis.
- Reprocessamento granular.
- Assets em filesystem sob `DATA_DIR`.
- Configuracoes por usuario/workspace.
- UI utilizavel por nao-tecnicos.

## Criterios de aceite do MVP de FlowShopy

- usuario cria projeto content-first;
- usuario cria ou associa conteudo a projeto sem modulo visivel;
- usuario gera cenas/blocos somente no contexto de projeto/variante de video;
- usuario edita cenas no editor;
- usuario gera assets;
- usuario renderiza MP4;
- Feed mostra conteudos;
- Kanban mostra producao;
- Agenda mostra planejamento;
- Gemini pode ser configurado como LLM;
- fluxo legado de curso nao quebra.
