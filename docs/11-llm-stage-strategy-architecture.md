# LLM Stage-First Strategy Architecture

## Objective

The segmentation pipeline no longer treats LLM selection as a single global provider/model choice.
It is now configured by pipeline objective:

- `struct`: analyze the full script and produce block segmentation
- `blocks`: analyze each block and generate block metadata

Each stage owns an ordered list of provider/model strategies.
Each strategy points to a configured `providerId`.
Each strategy may also define a same-provider fallback model.

This design solves four operational problems:

1. `structure` and `block` have different quality/latency requirements.
2. One provider outage should not immediately force heuristic fallback.
3. Better models should be reserved for large-context analysis.
4. Logs must expose every attempt in order to diagnose failures and budget overruns.

## Data Model

`AppSettings.llm` now uses only these keys:

```json
{
  "llm": {
    "providers": {
      "ollama": {
        "provider": "ollama",
        "displayName": "Ollama local",
        "baseUrl": "http://127.0.0.1:11434",
        "timeoutMs": 600000
      },
      "gemini": {
        "provider": "gemini",
        "displayName": "Google Gemini",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        "apiKey": "",
        "timeoutMs": 600000
      },
      "groq": {
        "provider": "openai",
        "displayName": "Groq production",
        "baseUrl": "https://api.groq.com/openai/v1",
        "apiKey": "",
        "timeoutMs": 600000
      }
    },
    "stages": {
      "structure": {
        "priorities": [
          {
            "providerId": "groq",
            "model": "llama-3.3-70b-versatile",
            "fallbackModel": "openai/gpt-oss-120b"
          },
          {
            "providerId": "gemini",
            "model": "gemma-4-27b-it",
            "fallbackModel": "gemma-4-26b-a4b-it"
          }
        ]
      },
      "block": {
        "priorities": [
          {
            "providerId": "groq",
            "model": "llama-3.1-8b-instant",
            "fallbackModel": "llama-3.3-70b-versatile"
          },
          {
            "providerId": "ollama",
            "model": "llama3.1:8b",
            "fallbackModel": "llama3.2:3b"
          }
        ]
      }
    }
  }
}
```

## Resolution Rules

For each stage:

1. Read `llm.stages.<stage>.priorities` in order.
2. For each priority item, resolve `providerId` in `llm.providers`.
3. For each priority item, create one primary attempt.
4. If `fallbackModel` is present and different from `model`, create one additional attempt immediately after the primary.
5. Resolve provider defaults only when `model` is blank:
   - `ollama`: `config.ollamaModel`
   - `gemini`: `gemma-4-26b-a4b-it`
   - `openai`: `gpt-4o-mini`
6. Execute attempts sequentially.
7. Only after every LLM attempt fails does the worker fall back to the deterministic heuristic splitter.

This means:

- `2 providers x 2 models each` = up to `4 attempts`
- `3 providers x 2 models each` = up to `6 attempts`

## UI Model

The Settings page is split into two concepts:

1. `Provider Catalog`
- edits `providerId`, base type, label, endpoint, API key, and timeout for each provider instance
- does not choose the active segmentation route

2. `Stage Strategies`
- configures ordered priorities for `Struct`
- configures ordered priorities for `Blocks`

This prevents provider configuration from being confused with orchestration strategy.

## Worker Execution Flow

### Structure Stage

The worker builds a stage attempt chain from `llm.stages.structure`.
Each attempt carries:

- `stage`
- `priority`
- `strategyIndex`
- `variant` (`primary` or `fallback`)
- `providerId`
- `provider`
- `model`
- `baseUrl`
- `timeoutMs`

The worker then:

1. logs stage start with the entire strategy chain
2. executes each attempt in order
3. validates and normalizes the block result
4. if all attempts fail, logs the failures and uses the heuristic splitter

### Block Stage

The worker repeats the same process for `llm.stages.block`.
If all attempts fail, it logs the failures and falls back to `buildFallbackMeta(...)`.

## Logging Contract

The implementation is intentionally verbose for diagnosis.

Key events emitted during segmentation:

- `segment_started`
- `segment_llm_preflight_ok`
- `segment_structure_started`
- `segment_structure_llm_request_started`
- `segment_structure_llm_request_completed`
- `segment_structure_llm_failed`
- `segment_structure_llm_completed`
- `segment_structure_heuristic_used`
- `segment_block_meta_started`
- `segment_block_llm_request_started`
- `segment_block_llm_request_completed`
- `segment_block_llm_request_failed`
- `segment_block_meta_attempt_failed`
- `segment_block_meta_completed`
- `segment_block_meta_failed`
- `segment_block_meta_fallback_used`

Each attempt-oriented log includes enough context to reconstruct:

- which stage ran
- which priority entry was used
- whether the attempt was primary or fallback
- which provider/model/base URL executed
- why the attempt failed

## API Contract

`GET /settings` returns:

- `llm.providers`
- `llm.stages`
- `llm.effective.structureChain`
- `llm.effective.blockChain`
- `llm.effective.structurePrimary`
- `llm.effective.blockPrimary`
- `llm.effective.structureAttempts`
- `llm.effective.blockAttempts`

`PATCH /settings` accepts:

- provider catalog edits in `llm.providers`
- orchestration edits in `llm.stages`

No legacy `llm.provider` or `llm.routing` keys are part of the new design.

## Heuristic Fallback Policy

The heuristic splitter now respects both:

- character budget
- estimated word/speech budget

This prevents the deterministic fallback from producing a first block that violates the TTS duration ceiling.

## Test Scope

Automated coverage:

- settings persistence of `llm.stages`
- effective chain resolution in `GET /settings`
- worker segmentation budget heuristic
- existing content flow regression
- agent-control integration health regression

Manual coverage:

1. configure multi-provider priorities in Settings
2. save and inspect `data/app_settings.json`
3. verify `GET /settings`
4. trigger a segmentation job
5. inspect logs for every LLM attempt and final fallback behavior

## Migration Note

This is a clean architecture replacement for the LLM routing model.
The system is now stage-first and no longer uses a single active provider/model for segmentation decisions.
