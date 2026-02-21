# Segmentacao de Texto: Guia Tecnico de Manutencao

Este documento explica como a divisao de blocos funciona no `backend/script_pipeline.py`.
Objetivo: permitir manutencao por quem nao conhece NLP em profundidade.

## 1) Visao geral do pipeline

O pipeline de segmentacao transforma um roteiro em blocos visuais e chunks de TTS:

1. normaliza texto (`normalize_space`)
2. separa paragrafos (`split_markdown_into_paragraphs`)
3. divide paragrafos em blocos (`split_mode = length` ou `topic`)
4. valida se os blocos cobrem 100% do texto (`validate_manifest`)
5. quebra cada bloco para TTS (`_chunk_tts_text`, limite de chars)

Saida principal: `manifest` com `blocks[].source_text`, `source_span`, `tts_chunks`.

## 2) Dois modos de divisao

### `split_mode="length"`

- estrategia mecanica baseada em tamanho
- agrupa frases ate `max_visual_chars`
- se uma frase excede o limite, quebra por virgula e depois por palavras
- comportamento previsivel e estavel

Quando usar:

- quando precisa de blocos com tamanho uniforme
- quando o texto ja vem bem estruturado

### `split_mode="topic"`

- estrategia sem LLM baseada em "coesao local"
- compara frases vizinhas e tenta detectar mudanca de assunto
- usa tokenizacao simples + frequencia de termos + similaridade cosseno

Quando usar:

- quando o texto mistura ideias e voce quer blocos mais "naturais"
- quando narrativa tem transicoes de tema dentro do mesmo paragrafo

## 3) Como funciona a segmentacao por topico

Implementacao principal: `split_paragraph_into_blocks_by_topic(...)`.

### 3.1) Frases

O paragrafo e quebrado com regex de fim de frase:

- `.` `!` `?`

Funcao: `_split_into_sentences`.

### 3.2) Tokens

Cada frase vira lista de tokens:

- apenas letras/numeros (`TOKEN_RE`)
- lowercase
- remove stopwords comuns em portugues (`STOPWORDS_PT`)

Funcao: `_tokenize`.

### 3.3) Vetor por frase

Cada frase vira um dicionario `termo -> frequencia`.

Funcao: `_term_freq`.

Exemplo simplificado:

- frase A: "insulina baixa aumenta queima gordura"
  - `{"insulina":1, "baixa":1, "aumenta":1, "queima":1, "gordura":1}`
- frase B: "insulina alta favorece armazenamento gordura"
  - `{"insulina":1, "alta":1, "favorece":1, "armazenamento":1, "gordura":1}`

### 3.4) Similaridade cosseno

Compara vetores de duas frases vizinhas:

- `1.0` = muito parecidas
- `0.0` = sem relacao lexical

Funcao: `_cosine_similarity`.

## 4) Regra de corte no modo `topic`

Para cada nova frase:

1. calcula similaridade com a frase anterior
2. testa duas condicoes:
   - estourou tamanho maximo do bloco (`max_chars`)
   - houve mudanca de topico (`sim < topic_similarity_threshold`) e o bloco atual ja tem tamanho minimo (`topic_min_chars`)
3. se uma condicao for verdadeira, fecha bloco e inicia novo

Regra em linguagem simples:

- "corte por tema so e permitido se o bloco atual nao estiver pequeno demais"
- isso evita fragmentacao exagerada

## 5) Entendendo `topic_similarity_threshold`

Esse parametro controla a sensibilidade de mudanca de assunto.

Comparacao usada:

- `sim < threshold` => considera que o tema mudou

### Efeito pratico

- threshold maior (ex.: `0.25`)
  - mais facil cair abaixo do limite
  - resultado: mais cortes, mais blocos
- threshold menor (ex.: `0.10`)
  - mais dificil disparar corte
  - resultado: menos cortes, blocos maiores

### Faixas iniciais recomendadas

- conservador (menos cortes): `0.10` a `0.14`
- balanceado: `0.15` a `0.20`
- agressivo (mais cortes): `0.21` a `0.28`

Obs.: valores ideais dependem do estilo de escrita e repeticao lexical.

## 6) Entendendo `topic_min_chars`

Evita blocos curtos demais.

Mesmo que haja mudanca de tema, o corte por topico so acontece quando o bloco atual ja atingiu esse minimo.

### Efeito pratico

- `topic_min_chars` alto (ex.: `180`)
  - menos cortes por tema
  - blocos maiores
- `topic_min_chars` baixo (ex.: `80`)
  - permite corte cedo
  - blocos menores

## 7) Interacao com `max_visual_chars`

`max_visual_chars` continua sendo limite "duro".

Se o bloco estoura limite:

- o corte ocorre mesmo sem mudanca de tema
- e frase muito longa pode ser subdividida por virgula/palavra

Resumo:

- `topic_similarity_threshold` e `topic_min_chars`: controle semantico aproximado
- `max_visual_chars`: controle estrutural obrigatorio

Observacao atual do projeto:

- em `split_mode="topic"`, `max_visual_chars=0` desativa esse controle estrutural.
- assim, a quebra visual acontece por semelhanca de assunto.
- o limite de 200 caracteres fica restrito ao TTS (`max_tts_chars`).

## 8) Validacao e seguranca de dados

A etapa `validate_manifest(...)` protege contra perda de texto:

- reconstrucao do paragrafo pela concatenacao de blocos
- comparacao normalizada com texto original
- deteccao de spans invalidos/sobrepostos

Se validacao falhar, o manifesto nao deve seguir para geracao de midia.

## 9) Limites da abordagem (importante)

Como nao usa LLM/embeddings:

- mede semelhanca lexical (palavras), nao entendimento profundo
- sinonimos diferentes podem parecer "mudanca de tema"
- repeticao de palavras pode mascarar mudanca real

Ainda assim, e uma estrategia robusta, barata e deterministicamente reproduzivel.

## 10) Como ajustar em manutencao (playbook)

Sintoma: blocos demais (muito picado)

1. reduzir `topic_similarity_threshold`
2. aumentar `topic_min_chars`
3. aumentar `max_visual_chars` (se fizer sentido visual)

Sintoma: blocos grandes misturando assuntos

1. aumentar `topic_similarity_threshold`
2. reduzir `topic_min_chars`
3. reduzir `max_visual_chars`

## 11) Exemplo de tuning inicial

Para roteiro narrativo de YouTube:

- `split_mode="topic"`
- `max_visual_chars=320`
- `topic_min_chars=120`
- `topic_similarity_threshold=0.16`
- `max_tts_chars=200`

Para texto tecnico denso:

- subir threshold para `0.18` ou `0.20`

Para texto muito repetitivo:

- baixar threshold para `0.12` a `0.15`

## 12) Pontos do codigo para manutencao

- funcoes base:
  - `_split_into_sentences`
  - `_tokenize`
  - `_term_freq`
  - `_cosine_similarity`
  - `split_paragraph_into_blocks_by_topic`
- entrada principal:
  - `build_manifest(...)`
- verificacao final:
  - `validate_manifest(...)`

Arquivo: `backend/script_pipeline.py`
