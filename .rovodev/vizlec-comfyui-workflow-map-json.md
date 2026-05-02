# VizLec Prompt — ComfyUI Workflow Map (Parametrização) [JSON]

Você é um engenheiro de integração. Sua tarefa é definir como o VizLec deve parametrizar e executar um workflow do **ComfyUI** via API.
Retorne **apenas JSON válido**.

## Objetivo
- Mapear entradas do VizLec (prompt do bloco, negative prompt do template, seed, resolução, steps etc.) para um workflow do ComfyUI.
- Definir contrato de execução: enqueue, polling, obtenção do output e erros.

## Regras
- Considerar que o VizLec terá:
  - `block_prompt` (variável por slide)
  - `master_positive_prompt` (fixo do template)
  - `negative_prompt` (fixo do template)
  - `seed_policy` (fixed / random / derived)
  - `width`, `height` (1920x1080 no MVP)
  - parâmetros: steps, cfg, sampler, scheduler, model checkpoint, vae

- O output deve ser uma imagem por bloco (PNG).
- Deve prever reprodutibilidade: guardar seed e parâmetros.

## Output JSON
{
  "api": {
    "base_url": "http://127.0.0.1:8188",
    "endpoints": {
      "prompt": "/prompt",
      "history": "/history/{prompt_id}",
      "view": "/view"
    },
    "timeouts_ms": {
      "enqueue": 10000,
      "poll": 300000
    },
    "polling": {
      "interval_ms": 1000,
      "max_attempts": 600
    }
  },
  "workflow": {
    "workflow_source": "file|inline",
    "workflow_file": "string|null",
    "nodes": [
      {
        "name": "string",
        "id": "string|number",
        "role": "positive_prompt|negative_prompt|seed|width|height|steps|cfg|sampler|scheduler|checkpoint|vae|output",
        "field_path": "string",
        "example": "string"
      }
    ],
    "parameter_overrides": {
      "positive_prompt": "string",
      "negative_prompt": "string",
      "seed": 0,
      "width": 1920,
      "height": 1080,
      "steps": 0,
      "cfg": 0,
      "sampler": "string",
      "scheduler": "string",
      "checkpoint": "string",
      "vae": "string"
    },
    "seed_policy": {
      "mode": "fixed|random|derived",
      "derived_from": "block_prompt|source_text|both",
      "notes": "string"
    }
  },
  "execution": {
    "enqueue_request_shape": "string",
    "success_criteria": ["string"],
    "error_modes": [
      {
        "name": "string",
        "symptoms": ["string"],
        "mitigation": ["string"]
      }
    ]
  },
  "output": {
    "expected_count": 1,
    "selection_strategy": "first|largest|by_node_role",
    "file_naming": "block_{index}_{seed}.png",
    "persist": {
      "raw_dir": "string",
      "metadata_file": "string"
    }
  }
}

## Input
WORKFLOW_JSON (cole o workflow exportado do ComfyUI ou descreva os nós):
{{WORKFLOW_JSON}}

TEMPLATE_DEFAULTS (master prompts e parâmetros padrão do template):
{{TEMPLATE_DEFAULTS_JSON}}
