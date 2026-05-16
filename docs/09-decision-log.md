# FlowShopy Decision Log

## 2026-04-29 / 2026-04-30 - Produto ativo

Decisão:

- FlowShopy é o produto ativo em `G:\tool\video-automation`.
- `G:\tool\flowshopy` é referência somente leitura.
- o foco atual do produto é `single-machine local-first`;
- sincronização remota futura deve cobrir configurações, projetos e metadados mínimos compartilhados;
- assets pesados permanecem locais por padrão;
- segredos internos do runtime desktop devem ser gerados no primeiro boot e persistidos localmente, sem dependência de `.env` do usuário final.

Motivo:

- evitar dois produtos divergentes;
- reaproveitar pipeline maduro do FlowShopy;
- evoluir para COPE/content-first.

## Domínio

Decisão:

- existem dois elementos centrais: conteúdo e projeto;
- conteúdo é a base reutilizável;
- projeto é o agrupador que dá contexto, fluxo e utilidade ao conteúdo;
- conteúdo sozinho pode existir como rascunho/biblioteca, mas só ganha impacto quando associado a projeto;
- um conteúdo pode ser usado em mais de um projeto;
- curso, canal, campanha ou música podem ser contexto de um projeto, mas não `kind` do projeto.

Motivo:

- o produto precisa servir curso, YouTube, TikTok, Instagram, Facebook e música;
- módulo só faz sentido em curso.

## 2026-04-30 - Revisão do conceito de Projeto

Decisão:

- projeto pode organizar curso, canal do YouTube, perfil do Instagram, página do Facebook, perfil do TikTok, lançamento, campanha, série, coleção ou música sem carregar um campo `kind`;
- canais/perfis/paginas podem ser contexto operacional do projeto, mas aparecem no contrato como destinations/outputs;
- canais aparecem como destino/entrega quando um projeto publica em vários canais;
- não existe mais o conceito de "criar curso" como fluxo separado de produto; cursos devem entrar como projetos;
- a produção ocorre na visão de projeto;
- deve existir acesso rápido para iniciar por conteúdo e depois associar a projeto.

Motivo:

- conteúdo sem projeto não é suficiente para organizar produção nem estratégia;
- o usuário pensa em agrupadores reais de trabalho, mas o produto não deve forçar uma classificação inicial do projeto;
- o mesmo conteúdo pode ser reaproveitado em vários projetos;
- o projeto define canais de entrega, formatos possíveis e entregáveis.

Observação:

- qualquer implementação anterior que tratou projeto como tipo/categoria deve ser revisada;
- canais/perfis/paginas pertencem a destinations/outputs, não ao tipo de projeto;
- esta decisão substitui a direção provisória anterior.

## 2026-04-30 - Tela Content

Decisão:

- a entrada `Content` deve ser voltada para produção do conteúdo/roteiro;
- configuração de canais de entrega, formatos e aspect ratios pertence ao projeto/outputs;
- a tela de conteúdo deve ter área principal de escrita voltada para criação e preparação do conteúdo;
- conteúdo precisa ser associado a projeto para entrar no fluxo de produção, mas a associação não deve dominar a experiência visual da tela.
- a tela de conteúdo não deve pedir o tipo de mídia antes da escrita; vídeo, imagem, música, texto e PDF são entregáveis/outputs, não o conteúdo em si.

Motivo:

- conteúdo é somente o conteúdo;
- o projeto define canais, formatos e entregáveis;
- a tela atual estava parecendo mais configuração de delivery channels do que produção de roteiro.
- uma ideia não é vídeo, imagem ou música; ela pode se tornar qualquer uma dessas saídas conforme o projeto/canal/formato.

Observação:

- interação conversacional/prompt direto na tela `Content` pode voltar no futuro como hipótese de UX;
- isso não faz parte do foco aprovado para o V0;
- nesta fase, o uso principal de prompts deve permanecer nos prompts pré-configurados e ajustáveis por projeto, canal e formato.

## 2026-04-30 - Produto orientado a promoção

Decisão:

- FlowShopy deve ser tratado como uma máquina de atenção para promoção de produtos, ofertas e eventos;
- o objetivo não é gerar views vazias;
- projetos devem poder promover um ou mais produtos por período;
- short links internos redirecionáveis são parte estratégica da evolução do produto;
- materiais publicados devem preferir short links/QR codes internos para permitir troca futura do destino real.

Motivo:

- links em PDFs, e-books, imagens, descrições antigas e materiais distribuídos podem não ser editáveis;
- ao trocar o destino de um short link, todos os materiais que usam aquele link passam a apontar para o novo produto/oferta;
- isso conecta conteúdo, atenção e resultado comercial.

## Banco

Decisão:

- não renomear fisicamente tabelas agora;
- manter Course/Module/Lesson como backing técnico;
- adicionar ContentProject/ContentItem.

Motivo:

- entregar rápido;
- reduzir risco;
- preservar editor/jobs/render existentes.

## 2026-05-16 - Revisão do modelo físico de dados

Decisão:

- a nomenclatura física atual de tabelas do domínio novo ainda não está boa o suficiente;
- `ContentProject` deve evoluir para um nome físico alinhado ao produto, preferencialmente `Project`;
- `ContentProjectItem` deve evoluir para um nome físico alinhado à função de vínculo, preferencialmente `ProjectContent`;
- a remoção física do legado `Course/Module/Lesson` só deve acontecer depois que o editor e o fluxo de produção estiverem dirigidos por `Project`/`ProjectContentOutput`;
- tabelas filhas devem apontar para seu pai de domínio direto, e não repetir `workspaceId` por padrão sem necessidade clara;
- `workspace` deve ser entendido principalmente como camada organizacional e de controle de acesso, não como pai operacional de quase todas as entidades locais;
- quando for necessário registrar autoria/auditoria, `userId` é mais importante do que propagar `workspaceId` em toda a árvore;
- tabelas de controle de acesso, licença e gestão do produto pertencem ao FlowShopy online/control plane;
- tabelas de execução, assets, jobs e produção pertencem primariamente ao runtime local.
- `WorkspaceMembership` deve evoluir para `WorkspaceUser` para refletir melhor a relação direta entre workspace e usuário;
- o papel do usuário deve viver nessa relação, e não em `User.role`;
- `Invitation.inviteeName` é apenas o nome inicial sugerido para bootstrap do perfil e deve poder ser ajustado depois nas configurações do usuário;
- `Project.language` deve definir o idioma-alvo dos outputs finais do projeto, independentemente do idioma da fonte bruta;
- `Project.metadataJson` precisa ser decomposto com base no conteúdo real já persistido hoje;
- a V0 desktop precisa explicitar na UI quem está logado e qual workspace está ativa, mesmo antes da camada de sync online.
- `ProjectContentOutput` permanece como nome preferido para a entidade de output concreto, porque cada linha representa a saída específica de um conteúdo associado a um projeto para uma definição de canal/formato/destino.

Motivo:

- os nomes atuais carregam transição técnica demais e deixam o schema menos legível;
- manter o legado no banco por tempo demais aumenta custo de migração futura;
- propagar `workspaceId` em excesso gera redundância estrutural e enfraquece a leitura real das relações pai-filho;
- o produto é local-first no plano de execução, mas login, acesso e governança pertencem a uma camada online separada.

## 2026-05-05 - Saída definitiva do modelo de curso

Decisão:

- o produto não deve continuar evoluindo como gerador de aulas;
- `Course/Module/Lesson` deixa de ser direção de produto e passa a ser somente legado técnico temporário;
- o alvo oficial passa a ser uma fábrica de conteúdo promocional orientada por `ContentItem`, `Project`, `ProjectContentOutput`, `NarrativeUnit` e `Composition`;
- o legado deve ser removido progressivamente quando o fluxo novo cobrir os casos principais, e não apenas escondido na UI.

Motivo:

- manter dois modelos de produto em paralelo tende a duplicar regras, linguagem e custos de manutenção;
- curso é apenas um dos contextos possíveis de um projeto;
- o produto precisa suportar vídeo, imagem, clips, overlays, CTA, promoção e composição áudiovisual mais ampla do que o modelo de aula permite.

## 2026-05-05 - Composição e preview com Remotion

Decisão:

- `Remotion` passa a ser a direção principal para composição, preview e timeline;
- `ffmpeg` permanece como infraestrutura de mídia e export, não como camada principal de autoria;
- `slide` deixa de ser unidade central do produto e passa a ser apenas um tipo simples de composição.

Motivo:

- o produto precisa de visualizador, timeline, efeitos, transições, overlays e composição declarativa;
- `ffmpeg` é muito forte como executor, mas fraco como camada de autoria/preview;
- o preview antes do render final reduz custo e aumenta controle editorial.

## 2026-05-05 - Novo significado de template

Decisão:

- `template` não deve mais significar apenas texto sobre imagem;
- o conceito correto é um sistema de composição formado por `StyleDNA`, `Component`, `CompositionPreset` e `VariationRules`;
- vídeos devem manter identidade visual sem se tornarem clones.

Motivo:

- o produto precisa reaproveitar componentes testados sem cair em uma fábrica de vídeos parecidos;
- uma coisa é manter consistência de marca; outra é produzir saídas visualmente repetitivas;
- a combinação de componentes, presets e regras de variação cria identidade com originalidade.

## 2026-05-06 - Conteúdo nasce fora do projeto

Decisão:

- `Content` continua sendo a área única de criação e edição da matéria-prima editorial;
- `Project` não deve duplicar essa experiência com um segundo formulário principal de conteúdo;
- dentro do projeto, a ação correta é localizar e associar conteúdos existentes;
- um mesmo conteúdo pode se relacionar com um, vários ou nenhum projeto;
- o conteúdo não deve conhecer projeto; o projeto é que conhece o conteúdo por meio da camada de vínculo e orquestração;
- `Studio` existe para transformar conteúdo associado em output/composição, não para competir com a área `Content`.

Motivo:

- conteúdo é matéria-prima e precisa existir por si;
- projeto sozinho não gera valor; ele apenas parametriza a fábrica/core;
- manter o conteúdo sem campos/controle de projeto evita acoplamento indevido entre matéria-prima e entrega;
- duplicar a criação de conteúdo em mais de um lugar aumenta ambiguidade e deixa a UI menos clara;
- a complexidade precisa ficar debaixo do capo, com um fluxo único e direto para o usuário.

## Documentação

Decisão:

- reduzir `docs` a poucos documentos canônicos;
- remover snapshots, binários, outputs e documentação antiga da pasta ativa;
- manter contexto histórico resumido neste log.

Motivo:

- muita documentação estava reduzindo clareza;
- produto precisa de visão clara, arquitetura clara e plano executável.

## Gemini

Decisão:

- adicionar Gemini como LLM configurável;
- exigir API key quando selecionado;
- usar Gemini no worker para tarefas LLM.

Motivo:

- melhorar análise/segmentação de roteiros;
- permitir qualidade melhor que modelos locais pequenos.

## Música

Decisão:

- manter no radar;
- na primeira versão, usuário fornece áudio;
- não gerar música por API agora.

Motivo:

- APIs de música ainda não são prioridade/viabilidade definida;
- core de vídeo deve vir primeiro.

## Feed/Kanban/Agenda

Decisao:

- Feed, Kanban e Agenda fazem parte da experiência de produto;
- entrar na Fase 1 como visões iniciais simples.

Motivo:

- produção de conteúdo se perde sem organização;
- o usuário precisa enxergar acervo, status e planejamento;
- prepara multi-tenancy/responsáveis.

## Assuntos em aberto

- Como e quando remover definitivamente a linguagem de `Variant` do domínio restante.
- Quando criar tabela `ContentSource`.
- Como modelar thumbnails.
- Qual provider de animação imagem-para-vídeo usar.
- Qual estratégia de análise de links de vídeo usar.
- Quando mover de SQLite para Postgres no SaaS.
- Como criptografar API keys em repouso.
