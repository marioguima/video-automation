# FlowShopy Integrations and External Services

## LLM

### Ollama

Uso:

- provider local;
- bom para local-first;
- custo variavel zero apos setup.

Configuracoes:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`

Uso esperado:

- segmentar roteiro;
- gerar on-screen;
- gerar prompts de imagem;
- gerar prompts de animacao;
- criar roteiro a partir de ideia;
- adaptar roteiro para variantes curtas.

### Gemini

Uso:

- provider cloud configuravel;
- melhora analise/segmentacao quando modelo local nao for suficiente;
- pode analisar videos no futuro, dependendo de limites/custo/API.

Implementado:

- settings aceita Gemini;
- exige API key;
- worker chama Gemini quando selecionado.

Arquivo:

```text
packages/shared/src/gemini.ts
```

Pesquisar antes da feature de video analysis:

- formatos aceitos;
- limites por arquivo;
- limites por request;
- tempo de retencao;
- custo;
- cotas gratuitas;
- termos de uso;
- necessidade de upload vs URL.

### OpenAI

Pode entrar como provider futuro. Nao tratar como completo ate haver implementacao end-to-end no worker.

## TTS

Providers previstos/atuais:

- XTTS;
- Chatterbox;
- Qwen TTS.

Requisitos:

- gerar audio por bloco;
- permitir escolha de voz;
- salvar metadata de voz/provider;
- medir duracao real via ffprobe;
- permitir reprocessamento por bloco.

## Imagem

### ComfyUI

Uso:

- gerar imagem base da cena;
- usar prompt de imagem por bloco;
- salvar seed/metadata;
- permitir regeneracao.

Configuracoes:

- `COMFYUI_BASE_URL`
- `COMFY_PROMPT_TIMEOUT_MS`
- `COMFY_GENERATION_TIMEOUT_MS`
- `COMFY_VIEW_TIMEOUT_MS`
- `COMFY_SETTINGS_PATH`

## Animacao de imagem

Ainda nao implementado.

Provider futuro deve aceitar:

- imagem base;
- prompt de animacao;
- aspect ratio;
- duracao;
- seed/config;
- retorno MP4 ou frames.

Tipos de job futuros:

- `image_animation`
- `render_animated_scene`

## Audio/video tooling

### ffmpeg

Uso:

- render clip;
- concatenar video final;
- aplicar transicoes;
- mixar audio/music/sound effects;
- extrair primeiro frame para thumbnails.

### ffprobe

Uso:

- medir duracao real do audio;
- validar assets;
- inspecionar videos.

### Playwright

Uso:

- render HTML/CSS de slide/composicao para PNG.

## Plataformas sociais

### YouTube

Roadmap:

- upload video;
- upload Shorts;
- metadata/titulo/descricao/tags;
- thumbnail;
- agendamento;
- OAuth.

Aspect ratios:

- `16:9`;
- `9:16` Shorts.

### TikTok

Roadmap:

- upload vertical;
- caption;
- agendamento se API permitir;
- OAuth;
- checar limitacoes comerciais.

Aspect ratio:

- `9:16`.

### Instagram

Roadmap:

- Reels;
- feed image/video;
- carousel;
- caption;
- agendamento via Meta APIs;
- OAuth/Meta Business.

Aspect ratios:

- `9:16`;
- `1:1`;
- `4:5`.

### Facebook

Roadmap:

- video;
- Reels;
- pagina;
- imagem/feed;
- agendamento via Meta APIs.

Aspect ratios:

- `16:9`;
- `9:16`;
- `1:1`;
- `4:5`.

## Short links e QRCode

Futuro central do produto.

Uso:

- links em descricoes de videos;
- links em posts;
- QRCode em videos/imagens;
- links em PDFs/e-books/isca digital;
- materiais ja distribuidos que nao podem ser editados.

Requisitos:

- gerar slug curto interno;
- redirecionar para URL atual;
- trocar destino sem alterar o link publicado;
- associar short link a projeto/produto/oferta;
- suportar periodo de promocao;
- gerar QRCode;
- registrar historico de destinos;
- coletar cliques/metadados quando viavel.

Servicos possiveis:

- implementacao interna com tabela propria e endpoint de redirect;
- provedor externo de short links apenas se fizer sentido comercialmente.

Decisao inicial:

- preferir implementacao interna, porque redirecionamento e estrategia central do produto.

## PDF / Lead Magnet

Futuro, fora da V1 de video.

Uso:

- transformar conteudo em PDF/isca digital;
- criar material complementar para captacao de lead;
- usar short links e QRCode dentro do PDF;
- reaproveitar o mesmo conteudo que originou videos.

Requisitos a estudar:

- templates de PDF;
- formatos por objetivo: checklist, guia, roteiro, workbook, lead magnet;
- captura de lead e integracao com email/CRM;
- rastreamento via short links.

## Fontes externas de conteudo

### Links de video

Opcoes:

1. baixar video, transcrever, analisar texto e/ou frames;
2. usar Gemini/VLM para analise direta.

Decisao:

- nao bloquear core por isso;
- implementar depois de roteiro -> video estar estavel;
- respeitar termos de uso das plataformas.

### Transcricao

Possiveis providers:

- Whisper local;
- APIs cloud;
- transcricao fornecida pelo usuario.

## Pagamentos

Provider planejado:

- Stripe.

Uso:

- assinatura mensal;
- plano por workspace;
- limites de uso;
- billing portal;
- status de pagamento;
- trials/cupons.

## Email/notificacoes

Futuro:

- convites;
- reset de senha;
- notificacoes de render concluido;
- alertas de falha;
- lembretes de agenda.

Providers possiveis:

- Resend;
- Postmark;
- SES.

## Segredos/API keys

V1:

- armazenar localmente em settings/DB;
- mascarar na UI.

Futuro:

- criptografar secrets em repouso;
- usar OS keychain no desktop;
- usar KMS/secret manager no SaaS.
