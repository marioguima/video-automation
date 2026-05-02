# VizLec — PRD + Tech Spec (Prompt, versão completa)

Você é um **Product Lead + Staff Engineer** e deve escrever um documento único que funciona como **PRD + especificação técnica** para um produto chamado **VizLec**.

O documento deve ser extremamente prático, com decisões claras para MVP, e detalhado o suficiente para uma equipe implementar.

---

## 1) Contexto e objetivo
VizLec transforma o **roteiro completo** de uma aula (teleprompter, palavra por palavra) em um **vídeo final** pronto para publicar.

O vídeo final é composto por uma sequência de “slides” **estáticos** (imagens) sincronizados com a narração.

- Não existe necessidade de exportar PPT/PDF.
- Não existe necessidade de editor visual WYSIWYG.
- O foco é: **gerar frames (PNG/WebP) + áudio + vídeo final**.

### Execução local (hard requirement)
Tudo roda localmente, com serviços locais:
- **LLM**: Ollama
- **Geração de imagem**: ComfyUI
- **TTS (narração)**: Qwen TTS
- **Vídeo**: ffmpeg/ffprobe

### Restrições de hardware
- Alvo: **GPU com 8GB VRAM**.
- A pipeline deve ser capaz de rodar com execução **sequencial** por padrão.
- Deve existir plano para paralelismo controlado no futuro.

---

## 2) Pipeline obrigatório (fim-a-fim)
A especificação deve seguir exatamente esta sequência lógica e explicar como cada etapa será implementada, cacheada e reprocessada.

1) Usuário fornece o **roteiro completo** da aula.
2) LLM analisa e separa em **blocos** (cada bloco vira 1 slide).
   - Meta: **15–20 segundos por bloco** (estimado pelo número de palavras e taxa de fala configurável).
   - Para cada bloco, retornar:
     - `source_text`: texto completo do bloco (o que será narrado)
     - `on_screen`: texto curto para exibir no slide (guia visual), em formato:
       - `title`
       - `bullets[]` (MVP usa bullets)
       - opcional: `subtitle`, `footer` (preparar estrutura)
     - `rationale` (opcional, interno): por que esse corte
3) Para cada `source_text`, gerar **áudio via Qwen TTS**.
4) Para cada áudio, obter duração via **ffprobe** (duração real) — esta é a duração do slide.
5) Para cada bloco, gerar um **prompt de imagem** com base no `source_text`.
   - Existe um `template` que define:
     - master positive prompt
     - negative prompt
     - estilo visual do curso
     - parâmetros do ComfyUI (modelo, sampler, steps, CFG, seed policy)
   - O usuário pode editar o prompt “do bloco” (parte variável) e regerar.
6) Chamar **ComfyUI** para gerar uma imagem base (1920x1080 no MVP; 4K depois).
7) Renderizar o slide final **texto sobre imagem** usando **HTML/CSS → PNG** via Playwright.
8) Gerar um clipe de vídeo por slide com ffmpeg:
   - a imagem fica na tela pelo tempo do áudio
   - áudio do bloco como trilha
9) Concatenar clips com transição leve e exportar o MP4 final.

---

## 3) Requisitos de revisão (hard requirement)
O produto precisa suportar revisão e reprocessamento granular por bloco:

- **Imagem**:
  - usuário pode editar o prompt do bloco
  - usuário pode regerar a imagem quantas vezes quiser
  - o sistema deve manter histórico mínimo (ex.: últimas N variações) OU ao menos guardar seed + prompt anterior

- **Áudio**:
  - usuário pode editar o texto enviado ao TTS para corrigir pronúncia
  - (não usar fonemas; permitir “escrever errado” para forçar pronúncia)
  - regerar áudio por bloco

- O sistema deve re-renderizar apenas o necessário:
  - se só o áudio mudou → regenerar clip do slide e vídeo final
  - se só a imagem mudou → re-render PNG e regenerar clip
  - se só on_screen mudou → re-render PNG e regenerar clip

---

## 4) Requisitos de instalação/empacotamento (hard requirement)
- A instalação precisa ser simples como “instalar um programa”.
- **Não pode depender de Docker Desktop.**
- Deve rodar em Windows primeiro, mas ter plano para macOS e Linux.

Especifique uma estratégia realista para MVP e para versão madura:
- MVP: web app local + worker, com assistente para apontar/validar serviços locais (Ollama/ComfyUI/Qwen TTS)
- Versão madura: launcher desktop (Tauri vs Electron) + gerenciamento de processos + downloads de dependências (ffmpeg, browsers Playwright etc.)

---

## 5) Escopo do MVP
Especifique claramente:

### MVP inclui
- UI web simples:
  - cadastro de curso/módulo/aula
  - textarea para roteiro
  - botão: Generate blocks
  - lista de blocos com:
    - on_screen (title + bullets)
    - source_text
    - campo editável `tts_text`
    - campo editável `image_prompt`
    - preview da imagem
    - player do áudio
    - botões: Regenerate Image / Regenerate Audio / Re-render Slide / Rebuild Video

- 1 template visual “clean premium” (1920x1080)
- Render final MP4

### MVP não inclui
- marketplace de templates
- legendas e alinhamento palavra-a-palavra
- animações avançadas
- colaboração multiusuário

---

## 6) Saídas (outputs) e artefatos
Defina os artefatos persistidos em disco por aula:
- `lesson.json` (manifest completo)
- `blocks/*.json` (opcional)
- `assets/images/raw/*.png`
- `assets/images/final/*.png` (slides renderizados)
- `assets/audio/*.mp3`
- `assets/clips/*.mp4`
- `exports/final.mp4`

Defina como lidar com nomes, versões, e limpeza de lixo.

---

## 7) Modelo de dados (schema) — detalhar
Defina entidades e campos mínimos:
- Course, Module, Lesson
- LessonVersion (roteiro original + hash + settings)
- Block:
  - index
  - source_text
  - on_screen (title + bullets)
  - tts_text (editável)
  - image_prompt_user (editável)
  - image_prompt_final (master + user)
  - seed
  - status por etapa (image/audio/render/clip)
  - paths (image raw, slide png, audio, clip)
  - durations
- Job/Task:
  - tipo
  - payload
  - status
  - retries
  - timestamps

Use SQLite no MVP e justifique.

---

## 8) Arquitetura técnica (decisões explícitas)
Proponha uma arquitetura com componentes e responsabilidades, preferencialmente:
- Web/UI + API (Node)
- Worker (Node)
- Queue (começar simples: DB-backed; evoluir para Redis/BullMQ)
- DB (SQLite)
- File storage (app_data)

Explique:
- como o worker processa tarefas
- como garantir idempotência
- como serializar tarefas pesadas por VRAM

---

## 9) Integrações locais (contratos)
Defina contratos mínimos e como detectar disponibilidade:
- Ollama: endpoints, modelo configurável, timeout, fallback
- ComfyUI: workflow JSON, endpoints de enqueue/poll, obtenção do output
- Qwen TTS: defina opções (HTTP vs CLI) e recomende uma para MVP
- ffmpeg/ffprobe: como empacotar/baixar e como chamar
- Playwright: como garantir browser instalado

---

## 10) Prompting / LLM design
Defina como serão os prompts para:
1) segmentação do roteiro em blocos 15–20s
2) geração de on_screen (bullets curtos)
3) geração de prompt de imagem por bloco

Inclua:
- estratégia para evitar alucinação
- limites de tamanho
- validação (JSON Schema)
- retry/repair de JSON

---

## 11) Render de slides (HTML/CSS)
Especifique o sistema de templates:
- estrutura de diretórios do template
- parâmetros configuráveis
- safe margins
- legibilidade (overlay, blur, gradient)
- export 1920x1080 e roadmap 4K

---

## 12) Pipeline de vídeo (ffmpeg)
Descreva claramente como gerar:
- clip por slide: imagem estática + áudio, duração = áudio
- concatenação
- transição leve (fade)
- fps, codec, bitrate sugeridos

---

## 13) Caching e reprodutibilidade
Defina:
- hashing (source_text, tts_text, image_prompt_user, template_version)
- quando invalidar cache
- como registrar seed e versões de modelo

---

## 14) Observabilidade e UX de progresso
Defina:
- estados por etapa e por bloco
- logs
- UI de progresso (fila, etapa atual, ETA aproximada)

---

## 15) Riscos e mitigação
Inclua riscos específicos:
- qualidade do corte em blocos
- TTS com pronúncia
- geração de imagem inconsistente
- VRAM insuficiente
- falhas de serviços locais
- tempo total de processamento

---

## 16) Roadmap
Milestones claros:
1) pipeline end-to-end (1 template, 1 aula)
2) UI de revisão por bloco
3) caching/histórico
4) empacotamento/launcher cross-platform

---

## Estilo de resposta
- Formato: documento estruturado com headings.
- Seja assertivo: recomende escolhas para MVP.
- Use listas e tabelas quando necessário.
- Não escreva código completo; descreva contratos, estrutura e decisões.
