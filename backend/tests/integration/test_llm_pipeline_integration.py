import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from backend import project_store
from backend.llm.pipeline import LLMPipeline
from backend.script_pipeline import load_script_file


EXAMPLE_SCRIPT_PATH = (
    r"d:\channels\Dieta\Videos\V1-Cardio em Jejum Acelera ou Destrói Seu Metabolismo"
    r"\Cardio em Jejum Acelera ou Destrói Seu Metabolismo_.md"
)


class _FakeLLMHandler(BaseHTTPRequestHandler):
    request_count = 0
    model_counts: dict[str, int] = {}
    lock = threading.Lock()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/chat/completions":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length).decode("utf-8")
        body = json.loads(raw)
        model = str(body.get("model", "unknown"))
        messages = body.get("messages") or []
        payload = self._build_payload(messages)

        with _FakeLLMHandler.lock:
            _FakeLLMHandler.request_count += 1
            _FakeLLMHandler.model_counts[model] = _FakeLLMHandler.model_counts.get(model, 0) + 1

        response = {
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": json.dumps(payload)}}],
        }
        encoded = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    @staticmethod
    def _build_payload(messages: list[dict]) -> dict:
        user_message = next((m for m in messages if m.get("role") == "user"), {})
        content = user_message.get("content")
        text_blob = _extract_text(content)

        if '"aesthetic_anchor"' in text_blob and '"visual_dna"' in text_blob:
            return {
                "aesthetic_anchor": "2d educational editorial style",
                "visual_dna": {
                    "art_style": "2d digital",
                    "character_style": "semi-cartoon",
                    "color_palette": "neutral with warm accent",
                    "lighting": "diffuse",
                    "composition": "clean and central",
                    "constraints": ["keep clear silhouettes"],
                    "forbidden_elements": ["text overlay"],
                },
            }

        if '"emotional"' in text_blob and '"narrative"' in text_blob and '"rupture"' in text_blob:
            return {
                "emotional": {
                    "niv": 3,
                    "tension_type": "aplicacao",
                    "state_initial": "curiosidade",
                    "state_final": "clareza",
                    "trend_vs_previous": "manter",
                },
                "narrative": {
                    "narrative_type": "educativo",
                    "dominant_archetype": "mentor",
                    "secondary_archetype": "explorador",
                    "transformation": "duvida -> entendimento",
                    "symbolic_representations": ["ponte", "mapa", "seta"],
                },
                "rupture": {
                    "needed": False,
                    "justification": "bloco estavel",
                    "type": "nenhuma",
                    "intensity": "leve",
                    "estimated_duration_sec": 0.0,
                },
            }

        excerpt = _extract_block_excerpt(text_blob)
        return {
            "scenes": [
                {
                    "scene_id": "01",
                    "source_excerpt": excerpt,
                    "central_idea": "visao central do bloco",
                    "emotional_function": "clareza",
                    "dominant_symbol": "ponte",
                    "camera_shot": "medio",
                    "light_contrast": "suave",
                    "composition": "foco no sujeito",
                    "transition_to_next": "suave",
                    "image_prompt": "ESTILO OBRIGATORIO: 2d educational editorial style | cena simbolica limpa",
                }
            ]
        }


def _extract_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""


def _extract_block_excerpt(text_blob: str) -> str:
    marker = "BLOCO:\n"
    idx = text_blob.find(marker)
    if idx < 0:
        return "trecho do bloco"
    start = idx + len(marker)
    tail = text_blob[start:]
    for stop in ("\n\nANCORA_ESTETICA", "\n\nCONTEXTO", "\n\nRetorne JSON"):
        end = tail.find(stop)
        if end > 0:
            snippet = tail[:end].strip()
            if snippet:
                return snippet[:220]
    return tail.strip()[:220] or "trecho do bloco"


class FakeLLMServer:
    def __init__(self) -> None:
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.base_url = ""

    def start(self) -> None:
        _FakeLLMHandler.request_count = 0
        _FakeLLMHandler.model_counts = {}
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeLLMHandler)
        port = self._server.server_address[1]
        self.base_url = f"http://127.0.0.1:{port}/v1"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        if self._thread:
            self._thread.join(timeout=2)

    @property
    def request_count(self) -> int:
        return _FakeLLMHandler.request_count


class LLMPipelineIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fake_server = FakeLLMServer()
        cls.fake_server.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.fake_server.stop()

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="va_test_")
        self.tmp_path = Path(self.temp_dir.name)
        self.db_dir = self.tmp_path / "data"
        self.cache_dir = self.tmp_path / "cache"
        self.db_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._orig_db_dir = project_store.DB_DIR
        self._orig_db_path = project_store.DB_PATH
        self._orig_pipeline_cls = project_store.LLMPipeline

        project_store.DB_DIR = self.db_dir
        project_store.DB_PATH = self.db_dir / "studio.db"

        class _TestPipeline(LLMPipeline):
            def __init__(self) -> None:
                super().__init__(cache_dir=self_cache_dir)

        self_cache_dir = self.cache_dir
        project_store.LLMPipeline = _TestPipeline
        project_store.init_db()

        self.env_patch = patch.dict(
            os.environ,
            {
                "LOCAL_LLM_BASE_URL": self.fake_server.base_url,
                "LOCAL_LLM_API_KEY": "local-test",
                "CLOUD_LLM_BASE_URL": self.fake_server.base_url,
                "CLOUD_LLM_API_KEY": "cloud-test",
                "OLLAMA_AUTO_PULL_MISSING": "0",
                "LLM_STAGE_A_LOCAL_MODELS": "local-a",
                "LLM_STAGE_B_LOCAL_MODELS": "local-b",
                "LLM_STAGE_C_LOCAL_MODELS": "local-c",
                "LLM_STAGE_A_CLOUD_MODELS": "cloud-a",
                "LLM_STAGE_B_CLOUD_MODELS": "cloud-b",
                "LLM_STAGE_C_CLOUD_MODELS": "cloud-c",
            },
            clear=False,
        )
        self.router_patch = patch(
            "backend.llm.router.LLMRouter._get_installed_ollama_models",
            return_value=None,
        )
        self.env_patch.start()
        self.router_patch.start()

    def tearDown(self) -> None:
        self.router_patch.stop()
        self.env_patch.stop()
        project_store.LLMPipeline = self._orig_pipeline_cls
        project_store.DB_DIR = self._orig_db_dir
        project_store.DB_PATH = self._orig_db_path
        try:
            self.temp_dir.cleanup()
        except PermissionError:
            # Windows may keep sqlite WAL handles alive for a short time.
            pass

    def test_pipeline_end_to_end_persists_results(self) -> None:
        video_id, blocks_count = self._create_video_with_ingested_blocks(_sample_script_text())
        before_calls = self.fake_server.request_count

        result = project_store.run_llm_prompt_pipeline(video_id=video_id, style_notes="visual style notes")
        after_calls = self.fake_server.request_count

        self.assertEqual(result["status"], "llm_ready")
        self.assertEqual(result["processed_blocks"], blocks_count)
        self.assertGreater(after_calls - before_calls, 0)

        video = project_store.get_video(video_id)
        assert video is not None
        self.assertEqual(video["status"], "llm_ready")
        self.assertEqual(len(video["blocks"]), blocks_count)

        for block in video["blocks"]:
            self.assertTrue(str(block["image_prompt"]).strip())
            analysis = json.loads(block["analysis_json"])
            storyboard = json.loads(block["storyboard_json"])
            self.assertIn("emotional", analysis)
            self.assertIn("scenes", storyboard)
            self.assertGreaterEqual(len(storyboard["scenes"]), 1)

    def test_cache_and_partial_reprocess_behavior(self) -> None:
        video_id, _ = self._create_video_with_ingested_blocks(_sample_script_text())

        project_store.run_llm_prompt_pipeline(video_id=video_id, style_notes="visual style notes")
        calls_after_first = self.fake_server.request_count

        second = project_store.run_llm_prompt_pipeline(video_id=video_id, style_notes="visual style notes")
        calls_after_second = self.fake_server.request_count
        self.assertEqual(calls_after_second, calls_after_first)
        self.assertGreaterEqual(second["cache_hits"], 2)

        first_block_code = project_store.list_video_blocks(video_id)[0]["block_code"]
        partial_cached = project_store.run_llm_prompt_pipeline(
            video_id=video_id,
            style_notes="visual style notes",
            block_codes=[first_block_code],
        )
        calls_after_partial_cached = self.fake_server.request_count
        self.assertEqual(calls_after_partial_cached, calls_after_second)
        self.assertEqual(partial_cached["processed_blocks"], 1)
        self.assertGreaterEqual(partial_cached["cache_hits"], 2)

        project_store.run_llm_prompt_pipeline(
            video_id=video_id,
            style_notes="visual style notes",
            block_codes=[first_block_code],
            force_reprocess=True,
        )
        calls_after_force = self.fake_server.request_count
        self.assertEqual(calls_after_force - calls_after_partial_cached, 2)

    def test_optional_real_example_script_path(self) -> None:
        path = Path(EXAMPLE_SCRIPT_PATH)
        if not path.exists():
            self.skipTest(f"optional script file not found: {EXAMPLE_SCRIPT_PATH}")

        script_text = load_script_file(str(path))
        video_id, blocks_count = self._create_video_with_ingested_blocks(script_text)
        self.assertGreater(blocks_count, 0)

        block_codes = [item["block_code"] for item in project_store.list_video_blocks(video_id)[:3]]
        result = project_store.run_llm_prompt_pipeline(
            video_id=video_id,
            style_notes="real script integration",
            block_codes=block_codes,
        )
        self.assertEqual(result["processed_blocks"], len(block_codes))

    def _create_video_with_ingested_blocks(self, script_text: str) -> tuple[int, int]:
        channel = project_store.create_channel(name=f"test-channel-{self._rand_suffix()}", niche="test", language="pt-BR")
        video = project_store.create_video(
            channel_id=int(channel["id"]),
            title=f"test-video-{self._rand_suffix()}",
            script_text=script_text,
            split_mode="topic",
            topic_min_chars=80,
            topic_similarity_threshold=0.18,
            max_visual_chars=0,
            max_tts_chars=200,
            source_type="external_script",
        )
        ingest = project_store.ingest_video_script(int(video["id"]))
        return int(video["id"]), int(ingest["blocks_count"])

    @staticmethod
    def _rand_suffix() -> str:
        return next(tempfile._get_candidate_names())  # type: ignore[attr-defined]


def _sample_script_text() -> str:
    return (
        "Existe uma guerra silenciosa no metabolismo que muita gente ignora. "
        "No inicio parece apenas uma escolha de horario, mas o corpo interpreta contexto energetico.\n\n"
        "Quando o jejum entra em cena, o cerebro tenta economizar combustivel e reorganiza prioridades. "
        "Se ha estresse alto, a resposta hormonal muda e o resultado pode ser oposto ao esperado.\n\n"
        "A aplicacao correta depende de objetivo, rotina e sinais de recuperacao. "
        "Com ajustes simples, o protocolo fica seguro e sustentavel a longo prazo."
    )


if __name__ == "__main__":
    unittest.main()
