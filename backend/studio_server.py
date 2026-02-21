import json
import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

try:
    from .script_pipeline import build_manifest, load_script_file, validate_manifest
except ImportError:
    from script_pipeline import build_manifest, load_script_file, validate_manifest


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
            self._send_json(
                {
                    "service": "video-automation-api",
                    "status": "ok",
                    "endpoints": [
                        "GET /api/health",
                        "POST /api/manifest",
                        "POST /api/manifest/from-file",
                    ],
                }
            )
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
                max_visual_chars = int(payload.get("max_visual_chars", 0))
                max_tts_chars = int(payload.get("max_tts_chars", 200))
                split_mode = str(payload.get("split_mode", "topic"))
                topic_min_chars = int(payload.get("topic_min_chars", 120))
                topic_similarity_threshold = float(payload.get("topic_similarity_threshold", 0.16))
                if not script_text.strip():
                    self._send_json({"error": "script is required"}, status=400)
                    return

                manifest = build_manifest(
                    script_text=script_text,
                    max_visual_chars=max_visual_chars,
                    max_tts_chars=max_tts_chars,
                    split_mode=split_mode,
                    topic_min_chars=topic_min_chars,
                    topic_similarity_threshold=topic_similarity_threshold,
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
                split_mode = str(payload.get("split_mode", "topic"))
                topic_min_chars = int(payload.get("topic_min_chars", 120))
                topic_similarity_threshold = float(payload.get("topic_similarity_threshold", 0.16))
                if not file_path:
                    self._send_json({"error": "path is required"}, status=400)
                    return
                script_text = load_script_file(file_path)
                manifest = build_manifest(
                    script_text=script_text,
                    split_mode=split_mode,
                    topic_min_chars=topic_min_chars,
                    topic_similarity_threshold=topic_similarity_threshold,
                )
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
    parser = argparse.ArgumentParser(description="Video Automation API server")
    parser.add_argument("host", nargs="?", default="127.0.0.1")
    parser.add_argument("port", nargs="?", type=int, default=8080)
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload when Python files change (requires watchfiles).",
    )
    args = parser.parse_args()

    if args.reload:
        try:
            from watchfiles import run_process
        except ImportError as exc:
            raise SystemExit(
                "Auto-reload requires watchfiles. Install with: pip install watchfiles"
            ) from exc

        print(f"Studio reload mode on http://{args.host}:{args.port}")
        run_process(
            ".",
            target=run_server,
            kwargs={"host": args.host, "port": args.port},
        )
    else:
        run_server(host=args.host, port=args.port)
