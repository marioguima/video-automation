import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - optional test dependency in local env
    TestClient = None  # type: ignore[assignment]

from backend import project_store
from backend.api import app


class VizlecCompatApiIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        if TestClient is None:
            self.skipTest("fastapi TestClient unavailable (missing httpx)")
        self.temp_dir = tempfile.TemporaryDirectory(prefix="va_compat_api_")
        self.tmp_path = Path(self.temp_dir.name)
        self.db_dir = self.tmp_path / "data"
        self.db_dir.mkdir(parents=True, exist_ok=True)

        self._orig_db_dir = project_store.DB_DIR
        self._orig_db_path = project_store.DB_PATH
        project_store.DB_DIR = self.db_dir
        project_store.DB_PATH = self.db_dir / "studio.db"
        project_store.init_db()
        self.client = TestClient(app)

        ch = project_store.create_channel("compat-test-channel", niche="test", language="pt-BR")
        self.video = project_store.create_video(
            channel_id=int(ch["id"]),
            title="compat-test-video",
            script_text="Primeiro trecho. Segundo trecho com mais contexto para segmentacao.",
        )
        project_store.ingest_video_script(int(self.video["id"]))

    def tearDown(self) -> None:
        project_store.DB_DIR = self._orig_db_dir
        project_store.DB_PATH = self._orig_db_path
        self.temp_dir.cleanup()

    def test_versions_and_blocks_compat_endpoints(self) -> None:
        video_id = int(self.video["id"])
        versions = self.client.get(f"/api/videos/{video_id}/versions")
        self.assertEqual(versions.status_code, 200)
        versions_json = versions.json()
        self.assertEqual(len(versions_json), 1)
        self.assertEqual(versions_json[0]["id"], str(video_id))

        blocks = self.client.get(f"/api/video-versions/{video_id}/blocks")
        self.assertEqual(blocks.status_code, 200)
        blocks_json = blocks.json()
        self.assertGreaterEqual(len(blocks_json), 1)
        first = blocks_json[0]
        self.assertEqual(first["lessonVersionId"], str(video_id))
        self.assertIn("sourceText", first)
        self.assertIn("ttsText", first)

    def test_patch_block_compat_tts_and_image_prompt(self) -> None:
        video_id = int(self.video["id"])
        blocks = self.client.get(f"/api/video-versions/{video_id}/blocks").json()
        block_id = blocks[0]["id"]
        resp = self.client.patch(
            f"/api/blocks/{block_id}",
            json={
                "ttsText": "texto narrado revisado",
                "imagePrompt": {"block_prompt": "prompt visual revisado"},
                "onScreen": {"title": "ignorado no mvp"},
            },
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["ttsText"], "texto narrado revisado")
        self.assertIn("prompt visual revisado", payload["imagePromptJson"])

    def test_migration_support_endpoints_do_not_404(self) -> None:
        video_id = int(self.video["id"])
        self.assertEqual(self.client.get("/api/tts/provider").status_code, 200)
        self.assertEqual(self.client.get("/api/slide-templates").status_code, 200)
        self.assertEqual(self.client.get("/api/settings").status_code, 200)
        self.assertEqual(self.client.get("/api/video-versions/999/job-state").status_code, 200)
        self.assertEqual(self.client.get(f"/api/video-versions/{video_id}/audios").status_code, 200)
        self.assertEqual(self.client.get(f"/api/video-versions/{video_id}/images").status_code, 200)


if __name__ == "__main__":
    unittest.main()
