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

## Esteira editorial

O ponto mais importante do domínio é este: o formato de entrada não define uma pipeline separada. O que muda é em que estágio da esteira aquele insumo entra.

Exemplos:

- uma ideia em texto já entra como matéria-prima textual;
- um PDF entra antes, porque precisa ter o texto extraído;
- um áudio entra antes, porque precisa ser transcrito;
- um link de vídeo entra ainda antes, porque pode exigir download, extração de áudio e speech-to-text;
- um script pronto entra mais adiante, porque já chega perto do estado de script aprovado.

Ou seja: entradas diferentes não existem para criar pipelines diferentes. Elas existem porque cada insumo chega em um estado diferente e precisa caminhar até um mesmo ponto de convergência.

Esse ponto comum é:

```text
script_ready
```

Todo conteúdo que vai virar entregável precisa, em algum momento, chegar a script.

O que varia é apenas:

- quais etapas anteriores ainda faltam;
- quanto de automação será usado;
- quanto de revisão humana será exigido;
- se o usuário já forneceu o script pronto ou se ele ainda será desenvolvido.

### Estados da esteira

Leitura de produto sugerida:

1. `source_ingested`
2. `source_processed`
3. `source_analyzed`
4. `script_developing`
5. `script_ready`
6. `output_adapting`
7. `output_structuring`
8. `production_ready`
9. `rendering`
10. `ready`

Definição de cada etapa:

- `source_ingested`: o usuário enviou ou registrou um insumo;
- `source_processed`: o sistema extraiu o que precisava do formato de entrada;
- `source_analyzed`: o material já foi lido editorialmente e pode orientar criação;
- `script_developing`: o script está sendo escrito, refinado ou transformado com ajuda humana/IA;
- `script_ready`: existe um script aprovado para seguir;
- `output_adapting`: o script está sendo adaptado para um entregável específico;
- `output_structuring`: o entregável já está sendo quebrado em cenas, cards, páginas, seções ou blocos;
- `production_ready`: prompts, composição e plano operacional já estão definidos;
- `rendering`: geração de assets e render final em andamento;
- `ready`: entregável pronto.

Princípio obrigatório:

- o produto não deve tratar link de vídeo, áudio, PDF e texto como produtos diferentes;
- o produto deve tratar esses inputs como estados diferentes de uma mesma esteira de transformação editorial.

### Convergência em script

Existem duas entradas principais para a esteira:

- `source mode`: o usuário fornece matéria-prima e o FlowShopy ajuda a desenvolver o script;
- `provided script mode`: o usuário já fornece o script pronto e pula etapas anteriores.

Esses dois modos não criam naturezas diferentes de conteúdo. Eles apenas colocam o conteúdo em pontos diferentes da esteira.

Regra de produto:

- todo conteúdo que vai gerar output precisa chegar a `script_ready`;
- se o usuário já trouxe o script pronto, isso só significa que etapas anteriores já vieram resolvidas;
- o momento de ser tratado como script sempre existe.

### Script master e scripts por output

O conteúdo pode convergir para um script-base aprovado, mas isso não significa que todos os outputs usarão exatamente o mesmo texto final.

Exemplo:

- tema central: como ganhar dinheiro;
- script master: versão editorial base do tema;
- output A: vídeo YouTube horizontal com 5 minutos;
- output B: vídeo curto vertical com 60 segundos;
- output C: publicação em imagem com texto;
- output D: carousel;
- output E: e-book.

Todos podem nascer do mesmo tema e até do mesmo script-base, mas a linguagem final de cada saída pode divergir.

Por isso, o produto deve distinguir:

- matéria-prima;
- script-base aprovado;
- script adaptado por output.

## Escopo da V1

V1 deve entregar o fluxo principal de vídeo:

1. criar ou iniciar um conteúdo;
2. produzir/refinar o conteúdo com escrita manual e/ou apoio de IA;
3. associar o conteúdo a um projeto;
4. usar configurações do projeto para parametrizar a fábrica de entregáveis;
5. materializar outputs de vídeo 16:9 e 9:16 a partir da combinação projeto + conteúdo;
6. fazer o conteúdo chegar a `script_ready`, seja por criação assistida ou por script já fornecido;
7. adaptar esse script para cada output de vídeo selecionado;
8. permitir abrir o editor assim que existir um output de vídeo associado ao projeto;
9. gerar estrutura semântica e composição do output selecionado;
10. gerar/editar áudio, imagem, clips, motion e CTA conforme o output;
11. visualizar timeline/preview;
12. renderizar vídeo final;
13. baixar MP4 final.

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

Também deve aceitar múltiplos tipos de entrada, sempre deixando claro em que etapa da esteira o conteúdo está:

- texto;
- script pronto;
- áudio;
- vídeo local;
- link de vídeo;
- PDF;
- outros formatos futuros.

Regra:

- cada tipo de entrada pode exigir etapas diferentes de ingestão e preparação;
- o usuário precisa enxergar que o sistema está levando aquele input até o estado em que ele possa virar script.

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

Regra adicional:

- o editor não é o lugar de extrair fonte bruta nem de decidir se o conteúdo já virou script;
- ele entra depois que já existe um output de vídeo e depois que o sistema já tem material suficiente para operar aquele output.

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

- Source
- Analysis
- Script
- Scenes
- Assets
- Editing
- Ready
- Scheduled
- Published

Leitura correta:

- `Source` cobre ingestão, extração e preparação da matéria-prima;
- `Analysis` cobre entendimento editorial e desenvolvimento até script;
- `Script` indica que o conteúdo já está apto para adaptação por output;
- as demais colunas representam a produção do entregável.

## Templates e estratégia de seleção

Projeto não deve carregar apenas um padrão fixo por formato. Ele deve poder usar mais de um template/preset por tipo de saída.

Exemplos:

- dois templates diferentes para vídeos curtos;
- uma família de layouts para carrossel;
- uma combinação de estilos para posts de imagem;
- presets diferentes para CTA final.

O projeto deve permitir definir:

- quais templates estão habilitados;
- para quais outputs cada template vale;
- se a seleção será aleatória;
- se a seleção será em fila;
- se a seleção será rotativa;
- se a seleção depende de contexto, canal ou estágio da campanha.

Princípio:

- a configuração do projeto não deve ser apenas "qual formato gerar";
- ela também deve dizer "como escolher a forma de gerar".

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
