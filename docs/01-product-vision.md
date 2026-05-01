# FlowShopy Product Vision

## Produto

FlowShopy e uma plataforma de criacao e automacao de conteudo com foco em video, pensada como uma maquina de atencao para promocao de produtos.

O produto segue o principio COPE: Create Once, Publish Everywhere. O usuario cria um conteudo central e gera variantes publicaveis para diferentes destinos, formatos e aspect ratios.

Na V1, o produto entrega videos. No futuro, o mesmo dominio deve aceitar imagens, carrosseis, e-books/PDFs e outros formatos, mas isso nao deve bloquear a primeira versao.

O objetivo nao e gerar views vazias. O objetivo e transformar conteudo em entregaveis que atraem atencao qualificada e podem promover produtos, eventos, ofertas ou links estrategicos.

## Proposta de valor

FlowShopy reduz o custo e a complexidade de transformar uma ideia ou roteiro em videos prontos para publicacao.

O valor entregue ao usuario e:

- sair de uma ideia/roteiro para um video final com menos trabalho manual;
- reutilizar o mesmo conteudo em varias plataformas;
- controlar cada cena do video;
- gerar narracao, imagens, prompts visuais, assets e render final em um fluxo rastreavel;
- enxergar o andamento da producao por projeto, feed, Kanban e agenda;
- preparar a automacao de publicacao sem perder o controle editorial.
- associar projetos a produtos/ofertas promovidas;
- permitir que links publicados continuem uteis por meio de short links redirecionaveis.

## Problema que resolve

Criar conteudo em video exige varias tarefas desconectadas:

- pensar pauta;
- escrever roteiro;
- dividir roteiro em cenas;
- criar imagens;
- criar movimentos/animacoes;
- gerar ou gravar narracao;
- editar video;
- adaptar formatos para plataformas;
- acompanhar status de producao;
- publicar ou agendar em cada destino.

Sem organizacao, o criador se perde em arquivos, versoes, plataformas, prazos, formatos e objetivos comerciais. FlowShopy centraliza esse fluxo em torno de conteudos e projetos.

## Usuario principal

Criador, empreendedor, educador, afiliado, gestor de conteudo ou pequena equipe que precisa produzir videos de forma recorrente.

O usuario pode trabalhar sozinho ou em equipe. A arquitetura deve suportar multi-tenancy por workspace, mesmo que a primeira versao seja local/self-hosted.

## Principio de dominio

O destino nao e o centro do produto.

O centro e:

```text
conteudo -> projeto -> entregaveis -> publicacao/promocao
```

Existem dois elementos principais:

- `Content`: a base reutilizavel. Pode nascer de ideia, roteiro, pesquisa, transcricao ou outro insumo.
- `Project`: o agrupador editorial/comercial que da utilidade e fluxo ao conteudo. Um conteudo sozinho pode existir como rascunho ou biblioteca, mas passa a ter impacto real quando associado a um projeto.

Um projeto nao deve comecar por uma classificacao como canal, perfil, campanha ou musica. Ele e um workspace de producao com nome, descricao, destinos padrao e formatos. O assunto, objetivo comercial ou contexto editorial entram na descricao e nos conteudos associados.

Um mesmo conteudo pode ser usado em mais de um projeto. O produto deve permitir enxergar facilmente onde cada conteudo esta sendo utilizado.

## Escopo da V1

V1 deve entregar o fluxo principal de video:

1. criar ou iniciar um conteudo;
2. produzir/refinar o conteudo com escrita manual e/ou apoio de IA;
3. associar o conteudo a um projeto;
4. usar configuracoes do projeto para canais de entrega e formatos;
5. gerar/editar cenas;
6. gerar texto narrado;
7. gerar prompts de imagem;
8. reservar/editar prompts de animacao;
9. gerar audio TTS;
10. gerar imagens;
11. renderizar cenas/slides/clipes;
12. concatenar video final;
13. baixar MP4 final.

## Visoes de produto obrigatorias

### Setup

Fluxo inicial para criar projeto e/ou associar conteudo a projeto.

Deve guiar:

- nome do projeto;
- descricao/contexto editorial livre;
- destinos de entrega;
- formatos e aspect ratios permitidos por canal;
- primeiro conteudo;
- ideia/roteiro;
- geracao de cenas.

Tambem deve existir um acesso rapido para iniciar pela criacao de conteudo. Essa tela deve ser voltada para producao do conteudo/roteiro, com area de escrita e um bloco de prompt/conversa para pedir ajuda da IA. Ela nao deve ser a tela principal de configuracao de canais e formatos; isso pertence ao projeto.

### Feed

Visao visual do acervo/publicacoes do projeto.

Deve mostrar conteudos em grade, com cards que representam:

- video horizontal;
- video vertical;
- imagem;
- combinacao video + imagem;
- multiplos aspect ratios;
- placeholder enquanto nao houver thumb.

Fallback de preview:

1. thumbnail definida;
2. primeiro frame de video;
3. imagem principal;
4. placeholder com titulo/status.

### Kanban

Visao de producao.

Colunas iniciais:

- Idea
- Script
- Scenes
- Assets
- Editing
- Ready
- Scheduled
- Published

### Agenda

Visao de prazo, responsavel e publicacao.

Deve evoluir para:

- responsavel;
- prazo;
- data de publicacao;
- plataforma;
- status;
- notificacoes.

## Musica

Musica fica no radar, mas nao e core da V1.

Primeiro suporte:

- usuario fornece audio/musica;
- usuario fornece prompt visual por faixa/trecho;
- sistema gera imagens e futuramente animacoes;
- sistema renderiza video com musica.

Fora da V1:

- gerar musica por API;
- sintetizar canto/letra;
- distribuir musica em plataformas musicais.

## Fora do escopo imediato

- e-book/PDF;
- publicacao automatica;
- Stripe/pagamentos;
- analise completa de videos externos;
- geracao de musica;
- marketplace de templates;
- SaaS multi-tenant completo.

Esses pontos devem ser planejados, mas nao podem bloquear o core de video.

## Promocao de produtos e short links

Um projeto pode promover um ou mais produtos, ofertas, eventos ou destinos comerciais.

Essa promocao deve suportar:

- produto/oferta promovida;
- link de destino;
- QRCode;
- periodo de inicio e fim;
- troca de produto/oferta ao longo do tempo;
- historico de alteracoes;
- short link interno redirecionavel.

Motivo: links publicados em videos, descricoes, PDFs, e-books ou imagens podem nao ser editaveis depois da distribuicao. Com short links internos, o usuario troca o destino real sem precisar alterar todos os materiais ja publicados.

Essa capacidade e parte central da evolucao do produto: FlowShopy deve ser uma maquina de atencao para promocao de produtos, nao apenas uma ferramenta para publicar conteudo.
