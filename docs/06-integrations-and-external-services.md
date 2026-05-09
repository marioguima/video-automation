# FlowShopy Integrations and External Services

## LLM

### Ollama

Uso:

- provider local;
- bom para local-first;
- custo variavel zero apos setup.

Configurações:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`

Uso esperado:

- segmentar roteiro;
- gerar on-screen;
- gerar prompts de imagem;
- gerar prompts de animação;
- criar roteiro a partir de ideia;
- adaptar roteiro para variantes curtas.

### Gemini

Uso:

- provider cloud configurável;
- melhora análise/segmentação quando modelo local não for suficiente;
- pode analisar vídeos no futuro, dependendo de limites/custo/API.

Implementado:

- settings aceita Gemini;
- exige API key;
- worker chama Gemini quando selecionado.

Arquivo:

```text
packages/shared/src/gemini.ts
```

Pesquisar antes da feature de vídeo analysis:

- formatos aceitos;
- limites por arquivo;
- limites por request;
- tempo de retencao;
- custo;
- cotas gratuitas;
- termos de uso;
- necessidade de upload vs URL.

### OpenAI

Pode entrar como provider futuro. Não tratar como completo até haver implementação end-to-end no worker.

## TTS

Provider já integrado no worker hoje:

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

- gerar áudio por bloco;
- permitir escolha de voz;
- salvar metadata de voz/provider;
- medir duração real via ffprobe;
- permitir reprocessamento por bloco.
- configurar limite de caracteres por idioma/provider antes da segmentação;
- bloquear geração de TTS quando o projeto usa uma língua sem rota TTS configurada.

Configuração esperada:

- o XTTS deve continuar como caminho real de geração de fala;
- Settings mantem o catálogo de providers, vozes, línguas e limites;
- cada projeto escolhe qual rota TTS usar;
- cada língua disponível no catálogo deve apontar para exatamente um provider TTS e uma voz;
- a tela de settings deve configurar quais línguas cada provider TTS atende;
- dois providers não podem possuir a mesma língua, porque isso torna ambígua a resolucao de provider durante o fluxo;
- cada rota de língua deve carregar um orçamento de fala, inicialmente `targetChars`, `maxChars` e, quando aplicavel, limite estimado de segundos;
- outros providers podem entrar depois usando o mesmo contrato de rotas por língua; a escolha de uso fica no projeto.

Observação sobre vídeo com fala nativa:

- limites de providers de vídeo com áudio nativo, como janelas de até 8 segundos, não devem ser tratados como limite de XTTS;
- esses limites devem entrar em um contrato separado de orçamento de fala/vídeo e serem usados pela segmentação quando a fala for gerada pelo provider de vídeo.

## Troca de voz por amostra

Objetivo futuro:

- permitir que um vídeo já gerado, inclusive por Veo com fala nativa, tenha a voz original substituida por uma voz clonada a partir de uma amostra fornecida pelo usuário;
- resolver casos em que o vídeo ficou visualmente bom, mas as vozes ficaram inconsistentes ou não correspondem ao personagem/marca desejados;
- reaproveitar o roteiro/tempo da cena sem obrigar nova geração cara de vídeo.

Fluxo conceitual:

1. usuário fornece uma amostra de voz e associa a um personagem, narrador ou marca;
2. sistema registra a amostra como asset de voz, com consentimento/metadata de origem;
3. worker extrai o áudio original do vídeo;
4. opcionalmente separa voz, música e efeitos quando for necessário preservar trilha/ambiencia;
5. sistema usa o texto conhecido da cena ou transcreve o áudio original;
6. provider de clonagem/TTS gera nova fala com a voz alvo;
7. alinhador ajusta timing, pausas e duração da fala gerada ao vídeo original;
8. ffmpeg remixa a nova voz com áudio de fundo/efeitos e salva um novo vídeo final.

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

- essa feature não substitui a configuração TTS por língua; ela usa o mesmo cadastro de providers/vozes quando a fala final vier de TTS/clonagem;
- se o vídeo original tiver fala nativa de provider visual, o limite de duração continua vindo do provider visual, mas a voz final pode ser refeita por provider TTS/voice cloning;
- precisa haver politica explícita para amostras de voz, direitos de uso, consentimento e identificacao do dono da voz.

## Orcamento de fala para segmentação

Conceito:

- todo fluxo que gerar fala precisa declarar um orçamento antes da segmentação;
- o orçamento não pertence ao prompt por si so; ele vem do motor que vai gerar a fala;
- se a fala for gerada por TTS externo, usar limites da rota TTS por língua;
- se a fala for gerada pelo motor de vídeo com áudio nativo, usar limites do provider/modelo de vídeo;
- a segmentação LLM deve receber esse orçamento e o validador deve rejeitar blocos acima do limite.

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

- `external_tts`: `maxChars` e `targetChars` são obrigatorios;
- `video_native_audio`: `maxSpeechSeconds` e durações aceitas pelo provider/modelo são obrigatorias;
- se o projeto/variant exigir fala e não houver orçamento resolvido, bloquear antes de criar blocos;
- edições manuais de `ttsText` também devem validar/avisar contra o mesmo orçamento.

## Imagem

### ComfyUI

Uso:

- gerar imagem base da cena;
- usar prompt de imagem por bloco;
- salvar seed/metadata;
- permitir regeneracao.

Configurações:

- `COMFYUI_BASE_URL`
- `COMFY_PROMPT_TIMEOUT_MS`
- `COMFY_GENERATION_TIMEOUT_MS`
- `COMFY_VIEW_TIMEOUT_MS`
- `COMFY_SETTINGS_PATH`

## Geração de imagem e vídeo

Estado atual:

- imagem base está acoplada ao ComfyUI;
- vídeo animado ainda não está implementado no pipeline;
- `animationPromptJson` já existe como contrato por bloco/cena.

Direção alvo:

- criar uma configuração de providers de geração visual, semelhante ao LLM/TTS, mas separando capacidades;
- suportar motores diferentes para `text_to_image`, `image_to_image`, `text_to_video`, `image_to_video` e `video_with_native_audio`;
- resolver provider/modelo pelo `metadata.pipeline` do projeto e, no futuro, por variant/formato, não como um único global fixo;
- permitir que um projeto use somente imagem local via ComfyUI e outro use Veo Extension/Veo 3 para imagem e vídeo;
- vídeo deve ser opcional no projeto, porque nem todo fluxo precisa animar cenas;
- salvar limites do provider/modelo para orientar segmentação, prompts, duração e validação antes de executar jobs caros.

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

- objetivo central do FlowShopy: comunicar com uma extensao externa para pedir geração de imagem/vídeo com Veo sem depender diretamente da API oficial em todos os fluxos;
- a extensao deve receber prompts, parâmetros de modelo/aspect ratio/duração e assets de entrada quando houver;
- a extensao deve retornar status, arquivos gerados e metadados suficientes para o worker continuar o fluxo como hoje faz com ComfyUI;
- a integração deve ser tratada como provider `veo_extension`, não como lógica espalhada pelo worker.

Referência atual a validar periodicamente:

- docs oficiais do Vertex AI indicam que modelos Veo 3 aceitam durações de 4, 6 ou 8 segundos e exigem `generateAudio` para modelos Veo 3 na API de geração de vídeo;
- esse limite deve ficar em settings/model metadata porque pode mudar e porque outros motores terao limites diferentes.

## Animação de imagem

Ainda não implementado.

Provider futuro deve aceitar:

- imagem base;
- prompt de animação;
- aspect ratio;
- duração;
- seed/config;
- retorno MP4 ou frames.

## Sound effects e música de fundo

Ainda não implementado.

Direção para sound effects:

- tratar efeitos sonoros como camada opcional do pipeline do projeto;
- gerar ou selecionar efeitos por bloco/cena quando o projeto pedir;
- manter `soundEffectPromptJson` como contrato de preparacao, sem obrigar geração nesta fase;
- mixar efeitos depois de TTS/musica para controlar volume, timing e fade.

Direção para background music:

- criar biblioteca global de músicas enviadas pelo usuário;
- permitir que cada projeto selecione quais faixas podem entrar no vídeo final;
- politica de uso por projeto/variant: manual, aleatoria ou sequencial;
- mixagem com volume, loop, fade in/out e crossfade;
- futuramente adicionar provider de música instrumental IA para gerar trilhas sem letra.

Essas camadas pertencem ao render/mix final. Elas não devem complicar a segmentação estrutural do roteiro.

Tipos de job futuros:

- `image_animation`
- `render_animated_scene`

## Audio/vídeo tooling

### ffmpeg

Uso:

- render clip;
- concatenar vídeo final;
- aplicar transições;
- mixar áudio/music/sound effects;
- extrair primeiro frame para thumbnails.

### ffprobe

Uso:

- medir duração real do áudio;
- validar assets;
- inspecionar vídeos.

### Playwright

Uso:

- render HTML/CSS de slide/composição para PNG.

## Plataformas sociais

### YouTube

Roadmap:

- upload vídeo;
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
- feed image/vídeo;
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

- vídeo;
- Reels;
- página;
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

- links em descrições de vídeos;
- links em posts;
- QRCode em vídeos/imagens;
- links em PDFs/e-books/isca digital;
- materiais já distribuídos que não podem ser editados.

Requisitos:

- gerar slug curto interno;
- redirecionar para URL atual;
- trocar destino sem alterar o link publicado;
- associar short link a projeto/produto/oferta;
- suportar período de promoção;
- gerar QRCode;
- registrar histórico de destinos;
- coletar cliques/metadados quando viavel.

Servicos possíveis:

- implementação interna com tabela própria e endpoint de redirect;
- provedor externo de short links apenas se fizer sentido comercialmente.

Decisao inicial:

- preferir implementação interna, porque redirecionamento e estratégia central do produto.

## PDF / Lead Magnet

Futuro, fora da V1 de vídeo.

Uso:

- transformar conteúdo em PDF/isca digital;
- criar material complementar para captacao de lead;
- usar short links e QRCode dentro do PDF;
- reaproveitar o mesmo conteúdo que originou vídeos.

Requisitos a estudar:

- templates de PDF;
- formatos por objetivo: checklist, guia, roteiro, workbook, lead magnet;
- captura de lead e integração com email/CRM;
- rastreamento via short links.

## Fontes externas de conteúdo

### Links de vídeo

Opções:

1. baixar vídeo, transcrever, analisar texto e/ou frames;
2. usar Gemini/VLM para análise direta.

Decisao:

- não bloquear core por isso;
- implementar depois de roteiro -> vídeo estar estável;
- respeitar termos de uso das plataformas.

### Transcrição

Possíveis providers:

- Whisper local;
- APIs cloud;
- transcrição fornecida pelo usuário.

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

## Email/notificações

Futuro:

- convites;
- reset de senha;
- notificações de render concluido;
- alertas de falha;
- lembretes de agenda.

Providers possíveis:

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
