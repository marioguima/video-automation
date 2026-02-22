import argparse
from pathlib import Path

import uvicorn


def run_server(host: str = "127.0.0.1", port: int = 8080, reload: bool = False) -> None:
    backend_dir = Path(__file__).resolve().parent
    uvicorn.run(
        "api:app",
        host=host,
        port=port,
        reload=reload,
        app_dir=str(backend_dir),
        log_level="info",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Automation API server (FastAPI)")
    parser.add_argument("host", nargs="?", default="127.0.0.1")
    parser.add_argument("port", nargs="?", type=int, default=8080)
    parser.add_argument("--reload", action="store_true", help="Enable uvicorn auto-reload.")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port, reload=args.reload)
