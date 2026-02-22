eu:
github models gratuito, nunca ouvi falar



ai:
É uma jogada bem interessante que pouca gente conhece! Deixa eu te explicar tudo:

---

## 🎁 O que é GitHub Models?

É uma plataforma do GitHub (da Microsoft) que dá acesso gratuito via API a modelos como GPT-4o, Llama, Mistral, e outros — sem precisar pagar por APIs ou configurar infraestrutura complexa, usando apenas uma conta do GitHub.

---

## 📊 Limites gratuitos

Os modelos são categorizados em níveis. Para o GPT-4o (nível "High"), os limites são: 10 requisições por minuto, 50 por dia, 8.000 tokens de entrada e 4.000 de saída por requisição, e 2 requisições concorrentes.

Mas você pode combinar modelos — GPT-4o mini tem 150 req/dia e GPT-4o tem 50/dia, ou seja, 200 requisições diárias só nesses dois. E existem dezenas de modelos disponíveis.

---

## ⚙️ Como usar na prática (TypeScript/Python)

É compatível com o SDK da OpenAI, só muda a `baseURL` e usa seu GitHub Token no lugar da API key:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN, // seu Personal Access Token do GitHub
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Olá!" }],
});
```

Se quiser subir para produção depois, basta trocar o GitHub token por uma chave do Azure — o resto do código fica igual.

---

## 🔑 Como gerar o token

1. Vai em `github.com` → Settings → Developer Settings → **Personal access tokens → Fine-grained**
2. Em Permissions → Account permissions → **Models**, muda para "Read-only". Isso é necessário para ter acesso ao GitHub Models.
3. Gera o token e usa como `apiKey`

---

## 🔗 Onde ver os modelos disponíveis

Acessa: **`github.com/marketplace/models`**

Lá tem um playground pra testar e a aba "Code" que mostra exatamente o snippet pronto para usar.

---

Para uso pessoal e prototipagem, é uma das melhores opções gratuitas disponíveis hoje. Quer que eu monte um exemplo mais completo de código?



Eu:
sim, preciso de algo que consiga rotacionar os modelos que sejam capazes de analisar um texto e gerar um prompt de imagem com base em um contexto que será enviado, um prompt relativamente grande, vou te mostrar os prompts, porque tem uma ordem:

Esse será executado apenas uma vez, precisa ser um vlm, porque ele precisa ser capaz de 'ler' uma imagem e interpretar o que o prompt pede:

📦 PROMPT PADRÃO — EXTRAÇÃO PROFUNDA DE ESTILO VISUAL
Analise cuidadosamente a(s) imagem(ns) fornecida(s).
Sua tarefa não é descrever o que está acontecendo na cena, nem os elementos narrativos. Sua tarefa é extrair e documentar o estilo visual com profundidade técnica e estratégica, gerando material detalhado que possa servir como base para criação futura de prompts de geração de imagens para diferentes partes de um roteiro.
Estruture sua análise com foco nos seguintes pontos:
1️⃣ Estilo Geral da Arte
* Tipo de ilustração (cartoon, semi-realista, flat design, 2D digital, etc.)
* Nível de realismo (baixo, médio, alto)
* Influências visuais percebidas
* Sensação transmitida (leve, dramática, educativa, humorística, etc.)
* Grau de simplificação ou detalhamento
2️⃣ Personagens
* Estilo do personagem (stick figure, minimalista, caricatural, anatômico, etc.)
* Proporções corporais
* Expressividade facial
* Presença ou ausência de traços detalhados
* Contorno (espessura da linha, suavidade, cor)
* Sombreamento aplicado ou não
* Texturas
3️⃣ Objetos e Cenário
* Nível de detalhamento do ambiente
* Estilo dos objetos (realistas, simplificados, estilizados)
* Uso de perspectiva
* Profundidade de campo
* Tratamento de luz e sombra
* Texturas e acabamentos
4️⃣ Paleta de Cores
* Tipo de paleta (pastel, vibrante, neutra, monocromática, etc.)
* Saturação
* Contraste
* Temperatura de cor
* Harmonia entre fundo e personagens
5️⃣ Iluminação
* Tipo de iluminação (difusa, suave, dramática, flat)
* Presença de sombras
* Direção da luz
* Intensidade
6️⃣ Linha e Contorno
* Espessura predominante
* Uniformidade
* Presença de outline escuro
* Estilo vetorial ou pintura digital
7️⃣ Composição
* Organização espacial
* Centralização
* Espaço negativo
* Simplicidade vs complexidade
* Foco visual
8️⃣ Adequação para Conteúdo Educativo
* Se o estilo favorece explicações didáticas
* Clareza visual
* Facilidade de leitura em miniaturas (YouTube)
* Potencial para animação leve
9️⃣ Diretrizes para Reutilização
Com base na análise, extraia:
* Um resumo técnico reutilizável do estilo
* Um modelo descritivo que possa ser reutilizado em prompts futuros
* Um mini-template pronto para gerar novas imagens mantendo consistência visual
⚠️ Importante:
* Não descreva a história da imagem.
* Não descreva ações específicas.
* Foque exclusivamente em características estilísticas e estruturais.
* Produza material técnico suficiente para padronização visual ao longo de um projeto completo.

PROMPT 2 — CURVA EMOCIONAL POR BLOCO

```
Você é um Diretor Narrativo.

Analise exclusivamente o bloco textual fornecido.

Determine:

1️⃣ Intensidade emocional do bloco (NIV 1–5)
2️⃣ Tipo de tensão presente (conflito, revelação, aplicação, ruptura, estabilização)
3️⃣ Estado mental inicial do espectador
4️⃣ Estado mental desejado ao final do bloco
5️⃣ Se este bloco deve aumentar, manter ou reduzir intensidade em relação ao anterior

⚠️ Não analise o roteiro completo.
⚠️ Trabalhe apenas com o bloco fornecido.

```

PROMPT 3 — ESTADO NARRATIVO POR BLOCO

```
Você é um Tradutor Simbólico Universal.

Com base exclusivamente no bloco fornecido:

1️⃣ Identifique o tipo narrativo
2️⃣ Extraia o arquétipo dominante
3️⃣ Extraia um arquétipo secundário
4️⃣ Defina transformação implícita (de → para)
5️⃣ Gere 3 possíveis representações visuais simbólicas

⚠️ Trabalhe apenas com o bloco atual.
```


PROMPT 4 — MOTOR DE RUPTURA

```
Você é um Diretor Cinematográfico.

Com base no bloco atual + seu NIV + seu arquétipo:

Determine:

1️⃣ Há necessidade de ruptura estilística?
2️⃣ Justifique narrativamente
3️⃣ Tipo de ruptura (nenhuma, semi-realista, realista, abstrata)
4️⃣ Intensidade da ruptura (leve, média, forte)
5️⃣ Duração estimada da ruptura

⚠️ Trabalhe apenas com o bloco atual.

```

PROMPT 5 — STORYBOARD DVS CINEMATOGRÁFICO POR BLOCO

```
Você é um Diretor de Dramaturgia Visual Silenciosa.

Entrada:

DNA_VISUAL.json (obrigatório)

ANCORA_ESTETICA (obrigatório)

Texto do BLOCO atual (obrigatório)

Saídas das camadas 2–4 do BLOCO (NIV, arquétipos, decisão de ruptura)

Sua tarefa

Gerar um storyboard para apenas este bloco, com 4 a 8 cenas, onde cada cena comunica uma única ideia sem texto na imagem.

Regras obrigatórias de fidelidade (NÃO NEGOCIÁVEIS)

Você deve seguir estritamente DNA_VISUAL.json.

É proibido exceder nivel_maximo_de_realismo, contraste_maximo e saturacao_maxima.

Se o bloco exigir mais emoção, aumente emoção usando direção (close, expressão, espaço negativo, luz), nunca “mudando para outro estilo”.

Ruptura só pode ocorrer se regras_de_fidelidade permitir E se a camada 4 marcar ruptura = “Sim”.

Para cada cena, gere exatamente estes campos

cena_id (01, 02…)

ideia_central (1 frase)

funcao_emocional (1–2 palavras)

simbolo_dominante (apenas um)

plano_camera (aberto / médio / close / super close)

luz_contraste (coerente com JSON)

composicao (espaço negativo, foco)

transicao_para_proxima (suave / impacto)

prompt_imagem (o prompt final para gerar a imagem)

Formato do prompt_imagem (muito importante)

Todo prompt_imagem deve começar com:

“ESTILO OBRIGATÓRIO: {cole aqui a ANCORA_ESTETICA}”

E em seguida:

descreva a cena visualmente

inclua restrições do JSON (ex: “contorno preto uniforme”, “fundo off-white”, etc.)

proíba explicitamente os itens do JSON em proibicoes_absolutas quando relevante

⚠️ Não mencione “DVS”, “camadas”, nem termos técnicos no resultado final.
⚠️ Não descreva o próximo bloco.
⚠️ Não conclua o vídeo.

1️⃣ Divida o bloco textual em unidades dramáticas claras.
2️⃣ Liste cada unidade textual com numeração.
3️⃣ Para cada unidade, gere no máximo uma cena correspondente.

Formato obrigatório por cena:

CENA 01
trecho_texto_origem:
"Existe uma guerra silenciosa acontecendo dentro do mundo da saúde."

funcao_emocional:
Instalar conflito

simbolo_dominante:
Divisão

descricao_visual:
...

prompt_imagem:
...

⚠️ Proibido misturar dois trechos distintos na mesma cena
⚠️ Proibido criar cena sem trecho correspondente
⚠️ Proibido usar texto que não esteja no bloco

IMPORTANTE Todo o texto do bloco deve estar presente no trecho_texto_origem, cada trecho utilizado
```

---
Como pode ver são alguns prompts, mas você pode analisar e ver qual a melhor maneira de chegar nesse mesmo resultado, até porque parte do problema já foi resolvido, que é a fase de divisão dos bloco, como pode ver na imagem, já tenho uma forma de dividir o texto usando nlp via código python, agora o que preciso na prática é otimizar esses prompts para que eles extraiam do texto seu melhor, para que ao final eu tenha prompts de imagens que criem uma história



ai:
Entendi o sistema todo. Deixa eu analisar os pontos críticos antes de sugerir otimizações:

---

## 🔍 Diagnóstico do pipeline atual

**O problema de custo:** Com 82 blocos, você teria:
- 1x Prompt 1 (VLM)
- 82x Prompt 2
- 82x Prompt 3
- 82x Prompt 4
- 82x Prompt 5

= **329 chamadas por vídeo.** Inviável no free tier.

**O problema de redundância:** Prompts 2, 3 e 4 analisam o **mesmo bloco**, e o 4 só precisa do output do 2 e 3. Eles podem virar **uma única chamada**.

---

## ✅ Arquitetura otimizada

```
[1x]  Prompt 1  →  DNA_VISUAL.json + ANCORA_ESTETICA
                          ↓
[82x] Prompt 2+3+4 fundidos  →  BLOCO_CONTEXT.json
                          ↓
[82x] Prompt 5  →  Storyboard + prompts de imagem
```

De 329 para **165 chamadas**, e com modelos certos, quase tudo no free tier.

---

## 🔄 Estratégia de rotação de modelos

| Etapa | Modelo ideal | Por quê | Limite/dia |
|---|---|---|---|
| Prompt 1 | `gpt-4o` | Precisa de visão (VLM) | 50 |
| Prompt 2+3+4 | `meta-llama-3.1-70b-instruct` ou `gpt-4o-mini` | Análise textual, não precisa de visão | 150–∞ |
| Prompt 5 | `gpt-4o` ou `gpt-4o-mini` | Output final, precisa de qualidade | 50/150 |

Com rotação: você usa GPT-4o-mini pra análise e reserva GPT-4o pro storyboard final.

---

## 🧠 Prompt 2+3+4 fundido (otimizado)

```
Você é um Diretor Narrativo + Tradutor Simbólico + Diretor Cinematográfico.

Analise exclusivamente o bloco textual abaixo.

BLOCO:
{texto_do_bloco}

BLOCO ANTERIOR (contexto de intensidade):
NIV anterior: {niv_anterior} | Tipo: {tipo_anterior}

Retorne um JSON com exatamente esta estrutura:

{
  "emocional": {
    "niv": 1-5,
    "tipo_tensao": "conflito|revelação|aplicação|ruptura|estabilização",
    "estado_inicial": "",
    "estado_final": "",
    "tendencia": "aumentar|manter|reduzir"
  },
  "narrativo": {
    "tipo_narrativo": "",
    "arquetipo_dominante": "",
    "arquetipo_secundario": "",
    "transformacao": "de → para",
    "representacoes_visuais": ["", "", ""]
  },
  "ruptura": {
    "necessaria": true|false,
    "justificativa": "",
    "tipo": "nenhuma|semi-realista|realista|abstrata",
    "intensidade": "leve|média|forte",
    "duracao_estimada": ""
  }
}

⚠️ Retorne APENAS o JSON. Sem texto antes ou depois.
```

**Por que isso é melhor:**
- 1 chamada ao invés de 3
- JSON estruturado facilita passar pro Prompt 5
- Inclui contexto do bloco anterior (que os originais ignoravam)

---

## 🎬 Prompt 5 otimizado

```
Você é um Diretor de Storyboard Visual.

ANCORA_ESTETICA: {ancora}
DNA_VISUAL: {dna_visual_json}
BLOCO_CONTEXT: {bloco_context_json}

TEXTO DO BLOCO:
{texto_do_bloco}

Divida o bloco em unidades dramáticas (frases ou grupos de frases com ideia única).
Para cada unidade, gere UMA cena. Máximo 8 cenas.

Para cada cena, retorne:

CENA {N}
trecho: "{trecho exato do bloco}"
ideia_central: 
funcao_emocional: 
simbolo_dominante: 
plano: aberto|médio|close|super close
composicao: 
prompt_imagem: ESTILO OBRIGATÓRIO: {ancora} | [descrição visual da cena] | Restrições: {restricoes_do_dna}

⚠️ Todo trecho_texto_origem deve vir literalmente do bloco.
⚠️ Nenhuma cena sem trecho correspondente.
⚠️ Nenhum trecho em duas cenas.
```

---

## 💡 Sugestão de código (Python)

```python
import time
from openai import OpenAI

MODELS = [
    "gpt-4o-mini",           # 150/dia - análise
    "meta-llama-3.1-70b",    # rotação
    "mistral-large",         # rotação
]

class ModelRotator:
    def __init__(self):
        self.counts = {m: 0 for m in MODELS}
    
    def get_model(self, requires_vision=False):
        if requires_vision:
            return "gpt-4o"
        # pega o modelo com menos uso
        return min(self.counts, key=self.counts.get)
    
    def call(self, messages, requires_vision=False):
        model = self.get_model(requires_vision)
        self.counts[model] += 1
        # chama a API...
        time.sleep(0.5)  # evita rate limit
```

---

## 📋 Próximos passos sugeridos

1. **Agora:** Fundir os prompts 2+3+4 e testar com 3-4 blocos manualmente
2. **Depois:** Implementar o rotador de modelos
3. **Paralelo:** Guardar o output de cada bloco em JSON para não reprocessar se travar

Quer que eu escreva o código completo do pipeline, ou prefere começar refinando os prompts primeiro?



eu:
uma outra maneira, se for possível, é usar LLMs locais que consigam fazer o trabalho rodando em um nvidia 3060 de 12 gb vram, se é que é possível



ai:
É totalmente possível! Deixa eu mapear o que cabe na sua 3060:

---

## 🎯 O que cabe em 12GB VRAM

A regra geral de quantização 4-bit é:

| Modelo | VRAM necessária | Cabe? |
|---|---|---|
| 7B params | ~4–5GB | ✅ confortável |
| 13B params | ~8–9GB | ✅ justo |
| 30B params | ~18GB | ❌ |
| 70B params | ~40GB | ❌ |

Então você fica no mundo dos **7B–13B**, que hoje são surpreendentemente bons para tarefas estruturadas.

---

## 🔍 Prompt 1 — VLM (precisa ver imagem)

Esse é o mais crítico. Opções que cabem:

**Qwen2-VL 7B** — melhor custo-benefício atualmente para VLM local. Entende imagens com boa profundidade analítica.

**Phi-3.5-Vision** — da Microsoft, leve (~4GB), surpreendentemente capaz para análise de estilo visual.

**LLaVA-1.6 Mistral 7B** — clássico, bem documentado, fácil de rodar com Ollama.

---

## 📝 Prompts 2–5 — Análise textual + JSON

Aqui você tem mais opções e os resultados são melhores:

**Mistral 7B Instruct** — excelente em seguir instruções e gerar JSON estruturado. Provavelmente o melhor custo-benefício pra sua tarefa.

**Llama 3.1 8B** — ótimo raciocínio narrativo, segue prompts complexos bem.

**Qwen2.5 7B** — muito bom em tarefas estruturadas e JSON, às vezes supera o Llama no seguimento de formato.

**Gemma 2 9B** — cabe justo (~9.5GB), qualidade bem acima dos 7B em raciocínio.

---

## ⚡ Como rodar — Ollama é o caminho mais simples

```bash
# instala o Ollama
curl -fsSL https://ollama.com/install.sh | sh

# baixa os modelos
ollama pull mistral          # análise textual
ollama pull llava            # VLM para prompt 1
ollama pull qwen2.5:7b       # alternativa JSON
```

E no Python, compatível com a API do OpenAI:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",  # qualquer string
)

# texto
response = client.chat.completions.create(
    model="mistral",
    messages=[{"role": "user", "content": prompt}],
    response_format={"type": "json_object"}  # força JSON
)

# com imagem (prompt 1)
response = client.chat.completions.create(
    model="llava",
    messages=[{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
            {"type": "text", "text": prompt_extracao_estilo}
        ]
    }]
)
```

---

## 🤔 A questão real: qualidade vs cloud

A honestidade aqui é importante. Para seus prompts complexos:

**O que funciona bem local:** JSON estruturado, seguir formato, análise simples de bloco, prompts 2, 3 e 4 fundidos.

**O que pode sofrer local:** Prompt 5 (storyboard completo) exige raciocínio narrativo longo e criativo — 7B às vezes perde o fio. O prompt 1 (análise de estilo visual profunda) também pode ficar superficial.

**Estratégia híbrida inteligente:**

```
Prompt 1  →  GitHub Models (GPT-4o) — 1x por projeto, usa visão real
Prompts 2+3+4  →  Local (Mistral 7B) — 82 chamadas, zero custo
Prompt 5  →  Local (Llama 3.1 8B) — testa, se qualidade ok, mantém
              se não → GitHub Models (gpt-4o-mini, 150/dia)
```

Dessa forma você usa a nuvem só onde realmente faz diferença.

---

Quer que eu monte o código completo do pipeline com essa estratégia híbrida, já integrado com o sistema de blocos que você tem?
