import os
import subprocess
from dataclasses import dataclass

from .providers import ProviderTarget


@dataclass(frozen=True)
class RouteCandidate:
    provider_name: str
    model: str


class LLMRouter:
    """Routes stage calls across local/cloud models with fallback order."""

    def __init__(self) -> None:
        self.local_target = ProviderTarget(
            name="local",
            base_url=os.getenv("LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434/v1"),
            api_key=os.getenv("LOCAL_LLM_API_KEY", "ollama"),
            timeout_sec=int(os.getenv("LOCAL_LLM_TIMEOUT_SEC", "120")),
        )
        self.auto_pull_missing_local = os.getenv("OLLAMA_AUTO_PULL_MISSING", "1").strip() not in {
            "0",
            "false",
            "False",
            "no",
            "NO",
        }
        self._installed_local_models_cache: set[str] | None = None
        cloud_base = os.getenv("CLOUD_LLM_BASE_URL", "").strip()
        cloud_key = os.getenv("CLOUD_LLM_API_KEY", "").strip()
        self.cloud_target = (
            ProviderTarget(
                name="cloud",
                base_url=cloud_base,
                api_key=cloud_key,
                timeout_sec=int(os.getenv("CLOUD_LLM_TIMEOUT_SEC", "120")),
            )
            if cloud_base and cloud_key
            else None
        )

    def get_provider_target(self, provider_name: str) -> ProviderTarget:
        if provider_name == "local":
            return self.local_target
        if provider_name == "cloud" and self.cloud_target:
            return self.cloud_target
        raise ValueError(f"provider unavailable: {provider_name}")

    def route(self, stage: str) -> list[RouteCandidate]:
        if stage == "A":
            return self._route_stage_a()
        if stage == "B":
            return self._route_stage_b()
        if stage == "C":
            return self._route_stage_c()
        raise ValueError(f"unknown stage: {stage}")

    def _route_stage_a(self) -> list[RouteCandidate]:
        candidates: list[RouteCandidate] = []
        cloud_models = self._split_models_env("LLM_STAGE_A_CLOUD_MODELS", "gpt-4o")
        # Vision step: keep a 7B VLM default for 12GB VRAM setups.
        local_models = self._split_models_env("LLM_STAGE_A_LOCAL_MODELS", "llava:7b")
        if self.cloud_target:
            candidates.extend([RouteCandidate("cloud", m) for m in cloud_models])
        candidates.extend(self._route_local_candidates(local_models))
        return self._dedupe(candidates)

    def _route_stage_b(self) -> list[RouteCandidate]:
        candidates: list[RouteCandidate] = []
        # Analysis step: prioritize JSON-friendly 7B/8B models on 12GB VRAM.
        local_models = self._split_models_env(
            "LLM_STAGE_B_LOCAL_MODELS",
            "qwen2.5:7b,llama3.1:8b,mistral:7b",
        )
        cloud_models = self._split_models_env("LLM_STAGE_B_CLOUD_MODELS", "gpt-4o-mini")
        candidates.extend(self._route_local_candidates(local_models))
        if self.cloud_target:
            candidates.extend([RouteCandidate("cloud", m) for m in cloud_models])
        return self._dedupe(candidates)

    def _route_stage_c(self) -> list[RouteCandidate]:
        candidates: list[RouteCandidate] = []
        # Storyboard step: try best local quality first, still within 12GB-class cards.
        local_models = self._split_models_env(
            "LLM_STAGE_C_LOCAL_MODELS",
            "qwen3:14b,qwen2.5:7b,llama3.1:8b",
        )
        cloud_models = self._split_models_env("LLM_STAGE_C_CLOUD_MODELS", "gpt-4o-mini,gpt-4o")
        candidates.extend(self._route_local_candidates(local_models))
        if self.cloud_target:
            candidates.extend([RouteCandidate("cloud", m) for m in cloud_models])
        return self._dedupe(candidates)

    def _route_local_candidates(self, desired_models: list[str]) -> list[RouteCandidate]:
        installed = self._get_installed_ollama_models()
        if installed is None:
            return [RouteCandidate("local", m) for m in desired_models]

        candidates: list[RouteCandidate] = []
        for model in desired_models:
            if model in installed:
                candidates.append(RouteCandidate("local", model))
                continue
            if self.auto_pull_missing_local and self._pull_model(model):
                installed.add(model)
                candidates.append(RouteCandidate("local", model))
        return candidates

    @staticmethod
    def _split_models_env(name: str, default: str) -> list[str]:
        raw = os.getenv(name, default)
        models = [item.strip() for item in raw.split(",") if item.strip()]
        return models or [default]

    @staticmethod
    def _dedupe(candidates: list[RouteCandidate]) -> list[RouteCandidate]:
        seen: set[tuple[str, str]] = set()
        unique: list[RouteCandidate] = []
        for candidate in candidates:
            key = (candidate.provider_name, candidate.model)
            if key in seen:
                continue
            seen.add(key)
            unique.append(candidate)
        return unique

    def _get_installed_ollama_models(self) -> set[str] | None:
        if not self._is_probably_ollama_local():
            return None
        if self._installed_local_models_cache is not None:
            return set(self._installed_local_models_cache)
        try:
            result = subprocess.run(
                ["ollama", "list"],
                capture_output=True,
                text=True,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            return None

        models: set[str] = set()
        for line in result.stdout.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("NAME"):
                continue
            parts = stripped.split()
            if parts:
                models.add(parts[0].strip())
        self._installed_local_models_cache = set(models)
        return models

    def _pull_model(self, model: str) -> bool:
        try:
            subprocess.run(
                ["ollama", "pull", model],
                capture_output=True,
                text=True,
                check=True,
            )
            return True
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False

    def _is_probably_ollama_local(self) -> bool:
        base = self.local_target.base_url.lower()
        return "11434" in base or "ollama" in base or "127.0.0.1" in base or "localhost" in base
