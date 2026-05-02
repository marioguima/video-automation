# VizLec — Especificação Técnica Inicial (Prompt)

Você é um Product + Engineering lead. Crie uma **especificação técnica inicial** (mistura de PRD + desenho técnico) para um produto chamado **VizLec**.

## Contexto
VizLec transforma o **roteiro completo** de uma aula (teleprompter, palavra por palavra) em um **vídeo final** composto por slides (imagens) sincronizados com áudio (TTS). O usuário não precisa de editor visual; precisa do resultado final e de uma UI simples para revisar e regerar partes.

Tudo deve rodar **localmente** (local-first):
- LLM: **Ollama**
- Imagem: **ComfyUI**
- Narração (TTS): **Qwen TTS**
- Vídeo: **ffmpeg/ffprobe**

Render de slide deve ser **HTML/CSS → PNG** com **Playwright**.
Backend/orquestração pode ser em **Node.js**. Use fila e banco. Docker é importante, porém **não pode depender de Docker Desktop** (principalmente no Windows). A instalação precisa ser o mais “app” possível.

## Pipeline obrigatório (sequência)
1) A LLM recebe o roteiro completo da aula.
2) A LLM segmenta em **blocos** (cada bloco vira 1 slide), tentando atingir **15–20s** por bloco (estimado). Para cada bloco retornar:
   - `source_text`: o texto completo daquele trecho (para narrar)
   - `on_screen`: texto curto (título + bullets ou variações) para guiar o aluno
3) Para cada `source_text`, gerar áudio via Qwen TTS.
4) Para cada áudio, obter duração via ffprobe; esta é a duração do slide.
5) Com o mesmo texto do bloco, gerar um `image_prompt` (prompt “do bloco”). Um template fornece prompts mestre (positive/negative) e estilo.
6) Gerar imagem via ComfyUI (1920x1080 inicialmente; roadmap para 4K).
7) Com imagem + `on_screen`, renderizar slide final em PNG via Playwright.
8) Criar clips MP4 por slide: imagem estática com duração igual ao áudio.
9) Concatenar clips com transição leve e exportar vídeo final.

## Requisitos de produto
- UI web simples para:
  - cadastrar curso/módulos/aulas e colar roteiro
  - ver blocos gerados
  - preview de imagem e player de áudio por bloco
  - editar **texto do TTS** (para corrigir pronúncia) e regenerar áudio
  - editar **prompt do bloco** e regenerar imagem
  - re-renderizar apenas o que mudou
  - renderizar vídeo final e baixar

- Reprocessamento e cache:
  - deve ser possível regerar quantas vezes quiser
  - não regenerar se não mudou (hash/versão)
  - guardar seeds e metadados para reprodutibilidade

- Hardware alvo: GPU com **8GB VRAM**.
  - oferecer execução serial por padrão (LLM → imagem → TTS → render → vídeo)
  - permitir paralelismo controlado no futuro

## O que produzir
Crie um documento com seções claras, pelo menos:

1) **Resumo do produto** (1–2 parágrafos)
2) **Objetivos e não-objetivos (MVP)**
3) **Fluxo do usuário (UX)** (passo a passo)
4) **Arquitetura técnica**
   - componentes (web, API, worker, fila, DB, storage)
   - comunicação entre serviços
   - estratégia para rodar local sem Docker Desktop (launcher/instalador)
5) **Modelo de dados (schema)**
   - entidades principais (Course/Module/Lesson/LessonVersion/Block/Asset/Job)
   - campos mínimos do Block e do Job
6) **Contratos de API** (endpoints mínimos) e estados de job
7) **Templates e renderização**
   - como o template define style/prompt mestre/layout
   - como Playwright renderiza PNG
8) **Pipeline de vídeo com ffmpeg**
   - geração de clip por slide
   - concatenação e transição
9) **Estratégia de caching/reprodutibilidade**
10) **Estratégia de execução com VRAM limitada** (scheduler serial)
11) **Riscos e mitigação** (custos, qualidade de imagem/voz, latência, falhas do ComfyUI/TTS)
12) **Roadmap** (Milestone 1–4)

## Regras de escrita
- Seja prático e implementável.
- Faça escolhas explícitas e justifique (ex.: SQLite vs Postgres; Redis vs polling; Tauri vs Electron).
- Sempre que mencionar uma decisão que depende de informação ausente, liste as opções e recomende uma para MVP.
