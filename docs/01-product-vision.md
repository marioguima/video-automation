# FlowShopy Product Vision

## Produto

FlowShopy é uma plataforma de criação e automação de conteúdo com foco em vídeo, pensada como uma máquina de atenção para promoção de produtos.

O produto segue o princípio COPE: Create Once, Publish Everywhere. O usuário cria um conteúdo central e gera outputs publicáveis para diferentes destinos, formatos e aspect ratios.

Na V1, o produto entrega vídeos. No futuro, o mesmo domínio deve aceitar imagens, carrosséis, e-books/PDFs e outros formatos, mas isso não deve bloquear a primeira versão.

O objetivo não é gerar views vazias. O objetivo é transformar conteúdo em entregáveis que atraem atenção qualificada e podem promover produtos, eventos, ofertas ou links estratégicos.

## Proposta de valor

FlowShopy reduz o custo e a complexidade de transformar uma ideia ou roteiro em vídeos prontos para publicação.

O valor entregue ao usuário é:

- sair de uma ideia/roteiro para um vídeo final com menos trabalho manual;
- reutilizar o mesmo conteúdo em várias plataformas;
- controlar cada cena do vídeo;
- entrar cedo no editor quando o entregável já for um output de vídeo;
- gerar narração, imagens, prompts visuais, assets e render final em um fluxo rastreável;
- enxergar o andamento da produção por projeto, feed e Kanban;
- preparar a automação de publicação sem perder o controle editorial;
- associar projetos a produtos/ofertas promovidas;
- permitir que links publicados continuem úteis por meio de short links redirecionáveis.

## Problema que resolve

Criar conteúdo em vídeo exige várias tarefas desconectadas:

- pensar pauta;
- escrever roteiro;
- dividir roteiro em cenas;
- criar imagens;
- criar movimentos/animações;
- gerar ou gravar narração;
- editar vídeo;
- adaptar formatos para plataformas;
- acompanhar status de produção;
- publicar ou agendar em cada destino.

Sem organização, o criador se perde em arquivos, versões, plataformas, prazos, formatos e objetivos comerciais. FlowShopy centraliza esse fluxo em torno de conteúdos e projetos.

## Usuário principal

Criador, empreendedor, educador, afiliado, gestor de conteúdo ou pequena equipe que precisa produzir vídeos de forma recorrente.

O usuário pode trabalhar sozinho ou em equipe. A arquitetura deve suportar multi-tenancy por workspace, mesmo que a primeira versão seja local/self-hosted.

## Princípio de domínio

O destino não é o centro do produto.

O centro é:

```text
conteudo -> projeto -> entregaveis -> publicacao/promocao
```

Existem dois elementos principais:

- `Content`: a base reutilizável. Pode nascer de ideia, roteiro, pesquisa, transcrição ou outro insumo.
- `Project`: o conjunto de parâmetros que orquestra a transformação do conteúdo em entregáveis. Um conteúdo sozinho pode existir como rascunho ou biblioteca, mas passa a ter impacto real quando associado a um projeto.

Um projeto não deve começar por uma classificação como canal, perfil, campanha ou música. Ele é um workspace de produção com nome, descrição, destinos padrão e formatos. O assunto, objetivo comercial ou contexto editorial entram na descrição e nos conteúdos associados.

Um mesmo conteúdo pode ser usado em mais de um projeto. O produto deve permitir enxergar facilmente onde cada conteúdo está sendo utilizado.

Regras de produto:

- conteúdo é matéria-prima e existe por si só;
- projeto não cria valor sozinho; ele precisa de conteúdo associado;
- projeto não é o entregável final; ele define parâmetros para o core/fábrica gerar o entregável;
- a criação de conteúdo pertence a área `Content`;
- a área de `Project` deve localizar, associar e orquestrar conteúdos existentes, não duplicar a experiência de escrita.

## Escopo da V1

V1 deve entregar o fluxo principal de vídeo:

1. criar ou iniciar um conteúdo;
2. produzir/refinar o conteúdo com escrita manual e/ou apoio de IA;
3. associar o conteúdo a um projeto;
4. usar configurações do projeto para parametrizar a fábrica de entregáveis;
5. materializar outputs de vídeo 16:9 e 9:16 a partir da combinação projeto + conteúdo;
6. permitir abrir o editor assim que existir um output de vídeo associado ao projeto;
7. gerar estrutura semântica e composição do output selecionado;
8. gerar/editar áudio, imagem, clips, motion e CTA conforme o output;
9. visualizar timeline/preview;
10. renderizar vídeo final;
11. baixar MP4 final.

## Visoes de produto obrigatorias

### Setup

Fluxo inicial para criar projeto e/ou associar conteúdo a projeto.

Deve guiar:

- nome do projeto;
- descrição/contexto editorial livre;
- destinos de entrega;
- formatos e aspect ratios permitidos por canal;
- primeiro conteúdo;
- ideia/roteiro;
- geração de cenas.

Também deve existir um acesso rápido para iniciar pela criação de conteúdo. Essa tela deve ser voltada para a produção do conteúdo/roteiro, com área de escrita e um bloco de prompt/conversa para pedir ajuda da IA. Ela não deve ser a tela principal de configuração de canais e formatos; isso pertence ao projeto.

Regra de UX:

- `Content` cria e edita conteúdo;
- `Project` associa conteúdo existente e o transforma em entregável;
- `Editor`/`Studio` entra quando já existe um output de vídeo e deve ficar acessível desde cedo nesse fluxo;
- não deve haver duas telas principais diferentes para criar o mesmo conteúdo.

### Editor / Studio

Visão operacional do entregável de vídeo.

O editor não deve aparecer como etapa tardia ou escondida. Ele deve fazer sentido assim que existir um output de vídeo dentro do projeto.

Regra:

- se o projeto tiver um output de vídeo, o usuário deve poder entrar no editor desse output desde o início;
- isso vale para YouTube, TikTok, Instagram, Facebook e outros canais, independentemente do aspect ratio;
- o editor é onde o usuário acompanha as fases do output e interage com a produção;
- o editor deve permitir ajustar prompts, revisar blocos/cenas, acompanhar geração de imagem, ver previews e, quando houver suporte no template/pipeline, visualizar animações e seus estados;
- o editor não deve depender de o pipeline já ter concluído TTS, imagem ou render para ser útil.

Objetivo:

- transformar o editor no centro operacional do output de vídeo, e não em uma tela tardia acessada só depois de várias automações.

### Feed

Visão visual do acervo/publicações do projeto.

Deve mostrar conteúdos em grade, com cards que representam:

- vídeo horizontal;
- vídeo vertical;
- imagem;
- combinação vídeo + imagem;
- múltiplos aspect ratios;
- placeholder enquanto não houver thumb.

Fallback de preview:

1. thumbnail definida;
2. primeiro frame de vídeo;
3. imagem principal;
4. placeholder com titulo/status.

### Kanban

Visão de produção.

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

Visão operacional de distribuição.

Ela faz sentido quando o produto já consegue interagir com contas autorizadas do usuário e refletir operação real.

Deve evoluir para:

- responsável;
- prazo;
- data de publicação;
- plataforma;
- status real da plataforma;
- notificações;
- agendamentos e publicações reconciliados com as contas conectadas.

## Música

Música fica no radar, mas não é core da V1.

Primeiro suporte:

- usuário fornece áudio/música;
- usuário fornece prompt visual por faixa/trecho;
- sistema gera imagens e futuramente animações;
- sistema renderiza vídeo com música.

Fora da V1:

- gerar música por API;
- sintetizar canto/letra;
- distribuir música em plataformas musicais.

## Fora do escopo imediato

- e-book/PDF;
- publicação automática;
- agenda operacional completa antes das integrações de contas;
- Stripe/pagamentos;
- análise completa de vídeos externos;
- geração de música;
- marketplace de templates;
- SaaS multi-tenant completo.

Esses pontos devem ser planejados, mas não podem bloquear o core de vídeo.

## Promoção de produtos e short links

Um projeto pode promover um ou mais produtos, ofertas, eventos ou destinos comerciais.

Essa promoção deve suportar:

- produto/oferta promovida;
- link de destino;
- QRCode;
- período de início e fim;
- troca de produto/oferta ao longo do tempo;
- histórico de alterações;
- short link interno redirecionável.

Motivo: links publicados em vídeos, descrições, PDFs, e-books ou imagens podem não ser editáveis depois da distribuição. Com short links internos, o usuário troca o destino real sem precisar alterar todos os materiais já publicados.

Essa capacidade é parte central da evolução do produto: FlowShopy deve ser uma máquina de atenção para promoção de produtos, não apenas uma ferramenta para publicar conteúdo.
