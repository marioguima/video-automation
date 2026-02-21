import json
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from script_pipeline import build_manifest, load_script_file, validate_manifest


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "web"


class StudioHandler(BaseHTTPRequestHandler):
    def _set_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text: str, status: int = 200, content_type: str = "text/plain") -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            html_path = STATIC_DIR / "index.html"
            self._send_text(html_path.read_text(encoding="utf-8"), content_type="text/html")
            return
        if parsed.path == "/api/health":
            self._send_json({"ok": True})
            return
        self._send_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._set_cors()
        self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/api/manifest":
            try:
                payload = self._read_json()
                script_text = payload.get("script", "")
                max_visual_chars = int(payload.get("max_visual_chars", 320))
                max_tts_chars = int(payload.get("max_tts_chars", 200))
                if not script_text.strip():
                    self._send_json({"error": "script is required"}, status=400)
                    return

                manifest = build_manifest(
                    script_text=script_text,
                    max_visual_chars=max_visual_chars,
                    max_tts_chars=max_tts_chars,
                )
                validation = validate_manifest(manifest)
                self._send_json({"manifest": manifest, "validation": validation})
                return
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=500)
                return

        if self.path == "/api/manifest/from-file":
            try:
                payload = self._read_json()
                file_path = payload.get("path", "")
                if not file_path:
                    self._send_json({"error": "path is required"}, status=400)
                    return
                script_text = load_script_file(file_path)
                manifest = build_manifest(script_text=script_text)
                validation = validate_manifest(manifest)
                self._send_json({"manifest": manifest, "validation": validation})
                return
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=500)
                return

        self._send_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)


def run_server(host: str = "127.0.0.1", port: int = 8080) -> None:
    server = ThreadingHTTPServer((host, port), StudioHandler)
    print(f"Studio running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8080
    if len(sys.argv) >= 2:
        host = sys.argv[1]
    if len(sys.argv) >= 3:
        port = int(sys.argv[2])
    run_server(host=host, port=port)
