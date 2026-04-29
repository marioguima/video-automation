import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class LLMProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class ProviderTarget:
    name: str
    base_url: str
    api_key: str
    timeout_sec: int = 120


class OpenAICompatibleProvider:
    """Thin client for OpenAI-compatible chat.completions endpoints."""

    def __init__(self, target: ProviderTarget) -> None:
        self.target = target

    def complete_json(
        self,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 2200,
    ) -> dict[str, Any]:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        try:
            raw = self._post_json(payload)
        except LLMProviderError as exc:
            if exc.status_code == 400:
                # Some local providers ignore OpenAI response_format.
                payload.pop("response_format", None)
                raw = self._post_json(payload)
            else:
                raise

        content = self._extract_content(raw)
        return self._extract_json(content)

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.target.base_url.rstrip('/')}/chat/completions"
        req = urllib.request.Request(
            url=url,
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.target.api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.target.timeout_sec) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LLMProviderError(
                f"provider {self.target.name} HTTP {exc.code}: {detail}",
                status_code=exc.code,
            ) from exc
        except urllib.error.URLError as exc:
            raise LLMProviderError(f"provider {self.target.name} connection error: {exc}") from exc

    @staticmethod
    def _extract_content(response_json: dict[str, Any]) -> str:
        choices = response_json.get("choices") or []
        if not choices:
            raise LLMProviderError("empty LLM response: missing choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            if parts:
                return "\n".join(parts)
        raise LLMProviderError("invalid LLM response: missing textual content")

    @staticmethod
    def _extract_json(content: str) -> dict[str, Any]:
        text = content.strip()
        if not text:
            raise LLMProviderError("empty message content")

        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
        if fenced:
            try:
                parsed = json.loads(fenced.group(1))
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            maybe_json = text[start : end + 1]
            try:
                parsed = json.loads(maybe_json)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

        raise LLMProviderError("could not parse JSON object from model output")


class GeminiProvider:
    """Client for Gemini generateContent JSON responses."""

    def __init__(self, target: ProviderTarget) -> None:
        self.target = target

    def complete_json(
        self,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.2,
        max_tokens: int = 2200,
    ) -> dict[str, Any]:
        api_key = self.target.api_key.strip()
        if not api_key:
            raise LLMProviderError("Gemini API key is required")

        payload: dict[str, Any] = {
            "contents": self._to_contents(messages),
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        }
        system_instruction = self._system_instruction(messages)
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        raw = self._post_json(model=model, api_key=api_key, payload=payload)
        content = self._extract_content(raw)
        return OpenAICompatibleProvider._extract_json(content)

    def _post_json(self, model: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        base_url = self.target.base_url.rstrip("/") or "https://generativelanguage.googleapis.com/v1beta"
        url = f"{base_url}/models/{urllib.parse.quote(model, safe='')}:generateContent?key={urllib.parse.quote(api_key, safe='')}"
        req = urllib.request.Request(
            url=url,
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.target.timeout_sec) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LLMProviderError(
                f"provider {self.target.name} HTTP {exc.code}: {detail}",
                status_code=exc.code,
            ) from exc
        except urllib.error.URLError as exc:
            raise LLMProviderError(f"provider {self.target.name} connection error: {exc}") from exc

    @staticmethod
    def _system_instruction(messages: list[dict[str, Any]]) -> str:
        parts: list[str] = []
        for message in messages:
            if message.get("role") != "system":
                continue
            text = GeminiProvider._message_text(message.get("content"))
            if text:
                parts.append(text)
        return "\n\n".join(parts)

    @staticmethod
    def _to_contents(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        contents: list[dict[str, Any]] = []
        for message in messages:
            role = message.get("role")
            if role == "system":
                continue
            text = GeminiProvider._message_text(message.get("content"))
            if not text:
                continue
            contents.append({
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text}],
            })
        if not contents:
            contents.append({"role": "user", "parts": [{"text": "Retorne um objeto JSON valido."}]})
        return contents

    @staticmethod
    def _message_text(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return "\n".join(parts)
        return ""

    @staticmethod
    def _extract_content(response_json: dict[str, Any]) -> str:
        prompt_feedback = response_json.get("promptFeedback") or {}
        block_reason = prompt_feedback.get("blockReason")
        if block_reason:
            raise LLMProviderError(f"Gemini prompt blocked: {block_reason}")
        candidates = response_json.get("candidates") or []
        if not candidates:
            raise LLMProviderError("empty Gemini response: missing candidates")
        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
        content = "".join(texts).strip()
        if not content:
            raise LLMProviderError("empty Gemini response: missing textual content")
        return content
