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

Provider ja integrado no worker hoje:

- XTTS;

Providers futuros/sugeridos:

- Chatterbox;
- Qwen TTS;
- ElevenLabs;
- Fish Speech;
- F5-TTS;
- GPT-SoVITS;
- OpenAI TTS/custom.

Requisitos:

- gerar audio por bloco;
- permitir escolha de voz;
- salvar metadata de voz/provider;
- medir duracao real via ffprobe;
- permitir reprocessamento por bloco.
- configurar limite de caracteres por idioma/provider antes da segmentacao;
- bloquear geracao de TTS quando o projeto usa uma lingua sem rota TTS configurada.

Configuracao esperada:

- o XTTS deve continuar como caminho real de geracao de fala;
- Settings mantem o catalogo de providers, vozes, linguas e limites;
- cada projeto escolhe qual rota TTS usar;
- cada lingua disponivel no catalogo deve apontar para exatamente um provider TTS e uma voz;
- a tela de settings deve configurar quais linguas cada provider TTS atende;
- dois providers nao podem possuir a mesma lingua, porque isso torna ambigua a resolucao de provider durante o fluxo;
- cada rota de lingua deve carregar um orcamento de fala, inicialmente `targetChars`, `maxChars` e, quando aplicavel, limite estimado de segundos;
- outros providers podem entrar depois usando o mesmo contrato de rotas por lingua; a escolha de uso fica no projeto.

Observacao sobre video com fala nativa:

- limites de providers de video com audio nativo, como janelas de ate 8 segundos, nao devem ser tratados como limite de XTTS;
- esses limites devem entrar em um contrato separado de orcamento de fala/video e serem usados pela segmentacao quando a fala for gerada pelo provider de video.

## Troca de voz por amostra

Objetivo futuro:

- permitir que um video ja gerado, inclusive por Veo com fala nativa, tenha a voz original substituida por uma voz clonada a partir de uma amostra fornecida pelo usuario;
- resolver casos em que o video ficou visualmente bom, mas as vozes ficaram inconsistentes ou nao correspondem ao personagem/marca desejados;
- reaproveitar o roteiro/tempo da cena sem obrigar nova geracao cara de video.

Fluxo conceitual:

1. usuario fornece uma amostra de voz e associa a um personagem, narrador ou marca;
2. sistema registra a amostra como asset de voz, com consentimento/metadata de origem;
3. worker extrai o audio original do video;
4. opcionalmente separa voz, musica e efeitos quando for necessario preservar trilha/ambiencia;
5. sistema usa o texto conhecido da cena ou transcreve o audio original;
6. provider de clonagem/TTS gera nova fala com a voz alvo;
7. alinhador ajusta timing, pausas e duracao da fala gerada ao video original;
8. ffmpeg remixa a nova voz com audio de fundo/efeitos e salva um novo video final.

Contrato conceitual:

```text
voiceReplacement
- sourceVideoAssetId
- sourceVoiceSampleAssetId
- targetVoiceId
- language
- providerId
- preserveBackgroundAudio
- alignmentMode: script | transcription | forced_alignment
- maxDriftMs
```

Novos tipos esperados:

- asset `voice_sample_audio`;
- asset `voice_replacement_audio`;
- asset `voice_replaced_video_mp4`;
- job `voice_replacement`;
- job `audio_source_separation`;
- job `forced_audio_alignment`.

Regras:

- essa feature nao substitui a configuracao TTS por lingua; ela usa o mesmo cadastro de providers/vozes quando a fala final vier de TTS/clonagem;
- se o video original tiver fala nativa de provider visual, o limite de duracao continua vindo do provider visual, mas a voz final pode ser refeita por provider TTS/voice cloning;
- precisa haver politica explicita para amostras de voz, direitos de uso, consentimento e identificacao do dono da voz.

## Orcamento de fala para segmentacao

Conceito:

- todo fluxo que gerar fala precisa declarar um orcamento antes da segmentacao;
- o orcamento nao pertence ao prompt por si so; ele vem do motor que vai gerar a fala;
- se a fala for gerada por TTS externo, usar limites da rota TTS por lingua;
- se a fala for gerada pelo motor de video com audio nativo, usar limites do provider/modelo de video;
- a segmentacao LLM deve receber esse orcamento e o validador deve rejeitar blocos acima do limite.

Contrato conceitual:

```text
SpeechBudget
- mode: external_tts | video_native_audio | none
- language
- sourceProviderId
- targetChars
- maxChars
- targetSpeechSeconds
- maxSpeechSeconds
- notes
```

Regras:

- `external_tts`: `maxChars` e `targetChars` sao obrigatorios;
- `video_native_audio`: `maxSpeechSeconds` e duracoes aceitas pelo provider/modelo sao obrigatorias;
- se o projeto/variant exigir fala e nao houver orcamento resolvido, bloquear antes de criar blocos;
- edicoes manuais de `ttsText` tambem devem validar/avisar contra o mesmo orcamento.

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

## Geracao de imagem e video

Estado atual:

- imagem base esta acoplada ao ComfyUI;
- video animado ainda nao esta implementado no pipeline;
- `animationPromptJson` ja existe como contrato por bloco/cena.

Direcao alvo:

- criar uma configuracao de providers de geracao visual, semelhante ao LLM/TTS, mas separando capacidades;
- suportar motores diferentes para `text_to_image`, `image_to_image`, `text_to_video`, `image_to_video` e `video_with_native_audio`;
- resolver provider/modelo por projeto/variant/formato, nao como um unico global fixo;
- permitir que um projeto use somente imagem local via ComfyUI e outro use Veo Extension/Veo 3 para imagem e video;
- video deve ser opcional no projeto, porque nem todo fluxo precisa animar cenas;
- salvar limites do provider/modelo para orientar segmentacao, prompts, duracao e validacao antes de executar jobs caros.

Contrato conceitual:

```text
visualGeneration.providers.<providerId>
- provider: comfyui | veo_extension | vertex_veo | custom
- displayName
- baseUrl
- capabilities: text_to_image, image_to_image, text_to_video, image_to_video, native_audio
- models.<modelId>
  - kind
  - acceptedAspectRatios
  - acceptedDurationsSeconds
  - maxNativeSpeechSeconds
  - supportsPromptEnhancement
  - costTier
```

Veo/extensao:

- objetivo central do FlowShopy: comunicar com uma extensao externa para pedir geracao de imagem/video com Veo sem depender diretamente da API oficial em todos os fluxos;
- a extensao deve receber prompts, parametros de modelo/aspect ratio/duracao e assets de entrada quando houver;
- a extensao deve retornar status, arquivos gerados e metadados suficientes para o worker continuar o fluxo como hoje faz com ComfyUI;
- a integracao deve ser tratada como provider `veo_extension`, nao como logica espalhada pelo worker.

Referencia atual a validar periodicamente:

- docs oficiais do Vertex AI indicam que modelos Veo 3 aceitam duracoes de 4, 6 ou 8 segundos e exigem `generateAudio` para modelos Veo 3 na API de geracao de video;
- esse limite deve ficar em settings/model metadata porque pode mudar e porque outros motores terao limites diferentes.

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
