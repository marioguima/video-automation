# FlowShopy Decision Log

## 2026-04-29 / 2026-04-30 - Produto ativo

Decisao:

- FlowShopy e o produto ativo em `G:\tool\video-automation`.
- `G:\tool\vizlec` e referencia somente leitura.

Motivo:

- evitar dois produtos divergentes;
- reaproveitar pipeline maduro do VizLec;
- evoluir para COPE/content-first.

## Dominio

Decisao:

- existem dois elementos centrais: conteudo e projeto;
- conteudo e a base reutilizavel;
- projeto e o agrupador que da contexto, fluxo e utilidade ao conteudo;
- conteudo sozinho pode existir como rascunho/biblioteca, mas so ganha impacto quando associado a projeto;
- um conteudo pode ser usado em mais de um projeto;
- curso, canal, campanha ou musica podem ser contexto de um projeto, mas nao `kind` do projeto.

Motivo:

- o produto precisa servir curso, YouTube, TikTok, Instagram, Facebook e musica;
- modulo so faz sentido em curso.

## 2026-04-30 - Revisao do conceito de Projeto

Decisao:

- projeto pode organizar curso, canal do YouTube, perfil do Instagram, pagina do Facebook, perfil do TikTok, lancamento, campanha, serie, colecao ou musica sem carregar um campo `kind`;
- canais/perfis/paginas podem ser contexto operacional do projeto, mas aparecem no contrato como destinations/variantes;
- canais aparecem como destino/entrega quando um projeto publica em varios canais;
- nao existe mais o conceito de "criar curso" como fluxo separado de produto; cursos devem entrar como projetos;
- a producao ocorre na visao de projeto;
- deve existir acesso rapido para iniciar por conteudo e depois associar a projeto.

Motivo:

- conteudo sem projeto nao e suficiente para organizar producao nem estrategia;
- o usuario pensa em agrupadores reais de trabalho, mas o produto nao deve forcar uma classificacao inicial do projeto;
- o mesmo conteudo pode ser reaproveitado em varios projetos;
- o projeto define canais de entrega, formatos possiveis e entregaveis.

Observacao:

- qualquer implementacao anterior que tratou projeto como tipo/categoria deve ser revisada;
- canais/perfis/paginas pertencem a destinations/variantes, nao ao tipo de projeto;
- esta decisao substitui a direcao provisoria anterior.

## 2026-04-30 - Tela Content

Decisao:

- a entrada `Content` deve ser voltada para producao do conteudo/roteiro;
- configuracao de canais de entrega, formatos e aspect ratios pertence ao projeto/variantes;
- a tela de conteudo deve ter area principal de escrita e um bloco de prompt/conversa para solicitacoes a IA;
- conteudo precisa ser associado a projeto para entrar no fluxo de producao, mas a associacao nao deve dominar a experiencia visual da tela.
- a tela de conteudo nao deve pedir o tipo de midia antes da escrita; video, imagem, musica, texto e PDF sao entregaveis/variantes, nao o conteudo em si.

Motivo:

- conteudo e somente o conteudo;
- o projeto define canais, formatos e entregaveis;
- a tela atual estava parecendo mais configuracao de delivery channels do que producao de roteiro.
- uma ideia nao e video, imagem ou musica; ela pode se tornar qualquer uma dessas saidas conforme o projeto/canal/formato.

## 2026-04-30 - Produto orientado a promocao

Decisao:

- FlowShopy deve ser tratado como uma maquina de atencao para promocao de produtos, ofertas e eventos;
- o objetivo nao e gerar views vazias;
- projetos devem poder promover um ou mais produtos por periodo;
- short links internos redirecionaveis sao parte estrategica da evolucao do produto;
- materiais publicados devem preferir short links/QR codes internos para permitir troca futura do destino real.

Motivo:

- links em PDFs, e-books, imagens, descricoes antigas e materiais distribuidos podem nao ser editaveis;
- ao trocar o destino de um short link, todos os materiais que usam aquele link passam a apontar para o novo produto/oferta;
- isso conecta conteudo, atencao e resultado comercial.

## Banco

Decisao:

- nao renomear fisicamente tabelas agora;
- manter Course/Module/Lesson como backing tecnico;
- adicionar ContentProject/ContentItem.

Motivo:

- entregar rapido;
- reduzir risco;
- preservar editor/jobs/render existentes.

## Documentacao

Decisao:

- reduzir `docs` a poucos documentos canonicos;
- remover snapshots, binarios, outputs e documentacao antiga da pasta ativa;
- manter contexto historico resumido neste log.

Motivo:

- muita documentacao estava reduzindo clareza;
- produto precisa de visao clara, arquitetura clara e plano executavel.

## Gemini

Decisao:

- adicionar Gemini como LLM configuravel;
- exigir API key quando selecionado;
- usar Gemini no worker para tarefas LLM.

Motivo:

- melhorar analise/segmentacao de roteiros;
- permitir qualidade melhor que modelos locais pequenos.

## Musica

Decisao:

- manter no radar;
- na primeira versao, usuario fornece audio;
- nao gerar musica por API agora.

Motivo:

- APIs de musica ainda nao sao prioridade/viabilidade definida;
- core de video deve vir primeiro.

## Feed/Kanban/Agenda

Decisao:

- Feed, Kanban e Agenda fazem parte da experiencia de produto;
- entrar na Fase 1 como visoes iniciais simples.

Motivo:

- producao de conteudo se perde sem organizacao;
- o usuario precisa enxergar acervo, status e planejamento;
- prepara multi-tenancy/responsaveis.

## Assuntos em aberto

- Quando criar tabela `Variant`.
- Quando criar tabela `ContentSource`.
- Como modelar thumbnails.
- Qual provider de animacao imagem-para-video usar.
- Qual estrategia de analise de links de video usar.
- Quando mover de SQLite para Postgres no SaaS.
- Como criptografar API keys em repouso.
