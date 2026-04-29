import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from .llm.pipeline import LLMPipeline
    from .script_pipeline import build_manifest, validate_manifest
except ImportError:
    from llm.pipeline import LLMPipeline
    from script_pipeline import build_manifest, validate_manifest


DB_DIR = Path(__file__).parent / "data"
DB_PATH = DB_DIR / "studio.db"


def get_connection() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    names: set[str] = set()
    for row in rows:
        # pragma table_info columns: cid, name, type, notnull, dflt_value, pk
        names.add(str(row[1]))
    return names


def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, ddl_suffix: str) -> None:
    if column_name in _table_columns(conn, table_name):
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl_suffix}")


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                niche TEXT,
                language TEXT NOT NULL DEFAULT 'pt-BR',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                source_type TEXT NOT NULL DEFAULT 'external_script',
                script_text TEXT NOT NULL,
                split_mode TEXT NOT NULL DEFAULT 'topic',
                topic_min_chars INTEGER NOT NULL DEFAULT 120,
                topic_similarity_threshold REAL NOT NULL DEFAULT 0.16,
                max_visual_chars INTEGER NOT NULL DEFAULT 0,
                max_tts_chars INTEGER NOT NULL DEFAULT 200,
                scheduled_publish_at TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE TABLE IF NOT EXISTS video_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                block_order INTEGER NOT NULL,
                paragraph_id TEXT NOT NULL,
                block_code TEXT NOT NULL,
                source_text TEXT NOT NULL,
                span_start INTEGER NOT NULL,
                span_end INTEGER NOT NULL,
                image_prompt TEXT NOT NULL DEFAULT '',
                estimated_duration_sec REAL NOT NULL,
                tts_chunks_json TEXT NOT NULL,
                analysis_json TEXT NOT NULL DEFAULT '{}',
                storyboard_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                UNIQUE(video_id, block_order)
            );

            CREATE TABLE IF NOT EXISTS block_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_block_id INTEGER NOT NULL REFERENCES video_blocks(id) ON DELETE CASCADE,
                asset_type TEXT NOT NULL CHECK(asset_type IN ('image','audio')),
                status TEXT NOT NULL DEFAULT 'pending',
                provider TEXT,
                model TEXT,
                file_path TEXT,
                duration_sec REAL,
                prompt_hash TEXT,
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE TABLE IF NOT EXISTS pipeline_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                stage TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE TABLE IF NOT EXISTS video_renders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending',
                output_path TEXT,
                duration_sec REAL,
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
            CREATE INDEX IF NOT EXISTS idx_blocks_video ON video_blocks(video_id);
            CREATE INDEX IF NOT EXISTS idx_assets_block ON block_assets(video_block_id);
            CREATE INDEX IF NOT EXISTS idx_jobs_video_stage ON pipeline_jobs(video_id, stage);
            """
        )
        # Incremental columns for migration/compat support.
        _ensure_column(conn, "video_blocks", "tts_text", "TEXT")
        _ensure_column(conn, "video_blocks", "subtitle_json", "TEXT")
        _ensure_column(conn, "videos", "bgm_file_path", "TEXT")
        _ensure_column(conn, "videos", "bgm_volume", "REAL")


DEFAULT_LLM_SETTINGS: dict[str, Any] = {
    "provider": "ollama",
    "base_url": "http://127.0.0.1:11434/v1",
    "model": "qwen2.5:7b",
    "api_key": "ollama",
    "timeout_sec": 120,
}


def get_system_settings() -> dict[str, Any]:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT value_json FROM system_settings WHERE key = ?", ("app",)).fetchone()
    if not row:
        return {"llm": dict(DEFAULT_LLM_SETTINGS)}
    try:
        data = json.loads(str(row["value_json"]))
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    llm = data.get("llm") if isinstance(data.get("llm"), dict) else {}
    return {"llm": {**DEFAULT_LLM_SETTINGS, **llm}}


def update_system_settings(patch: dict[str, Any]) -> dict[str, Any]:
    current = get_system_settings()
    next_settings = dict(current)
    if isinstance(patch.get("llm"), dict):
        llm_patch = patch["llm"]
        llm = {**DEFAULT_LLM_SETTINGS, **dict(current.get("llm") or {})}
        provider = str(llm_patch.get("provider", llm.get("provider", "ollama"))).strip().lower()
        if provider not in {"ollama", "gemini", "openai"}:
            raise ValueError("llm.provider must be one of: ollama, gemini, openai")
        llm["provider"] = provider
        for incoming, stored in (
            ("base_url", "base_url"),
            ("baseUrl", "base_url"),
            ("model", "model"),
            ("api_key", "api_key"),
            ("apiKey", "api_key"),
        ):
            if incoming in llm_patch and llm_patch[incoming] is not None:
                llm[stored] = str(llm_patch[incoming]).strip()
        if "timeout_sec" in llm_patch or "timeoutSec" in llm_patch or "timeoutMs" in llm_patch:
            raw_timeout = llm_patch.get("timeout_sec", llm_patch.get("timeoutSec", llm_patch.get("timeoutMs")))
            timeout = int(float(raw_timeout))
            if timeout > 1000:
                timeout = int(timeout / 1000)
            if timeout <= 0:
                raise ValueError("llm.timeout_sec must be positive")
            llm["timeout_sec"] = timeout
        if provider == "gemini" and not str(llm.get("api_key") or "").strip():
            raise ValueError("Gemini API key is required when Gemini is selected")
        if provider == "openai" and not str(llm.get("api_key") or "").strip():
            raise ValueError("OpenAI API key is required when OpenAI is selected")
        if provider == "gemini" and not str(llm.get("base_url") or "").strip():
            llm["base_url"] = "https://generativelanguage.googleapis.com/v1beta"
        if provider == "openai" and not str(llm.get("base_url") or "").strip():
            llm["base_url"] = "https://api.openai.com/v1"
        if provider == "ollama" and not str(llm.get("api_key") or "").strip():
            llm["api_key"] = "ollama"
        next_settings["llm"] = llm

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO system_settings(key, value_json, updated_at)
            VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            ("app", json.dumps(next_settings, ensure_ascii=False)),
        )
    return get_system_settings()


def get_llm_settings() -> dict[str, Any]:
    return dict(get_system_settings()["llm"])


def has_saved_system_settings() -> bool:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT 1 FROM system_settings WHERE key = ?", ("app",)).fetchone()
    return row is not None


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def create_channel(name: str, niche: str | None = None, language: str = "pt-BR") -> dict[str, Any]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO channels(name, niche, language)
            VALUES(?,?,?)
            """,
            (name.strip(), niche, language),
        )
        channel_id = cur.lastrowid
        row = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return _row_to_dict(row)


def list_channels() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT c.*, COUNT(v.id) AS videos_count
            FROM channels c
            LEFT JOIN videos v ON v.channel_id = c.id
            GROUP BY c.id
            ORDER BY c.id DESC
            """
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def create_video(
    channel_id: int,
    title: str,
    script_text: str,
    split_mode: str = "topic",
    topic_min_chars: int = 120,
    topic_similarity_threshold: float = 0.16,
    max_visual_chars: int = 0,
    max_tts_chars: int = 200,
    source_type: str = "external_script",
) -> dict[str, Any]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO videos(
                channel_id, title, source_type, script_text, split_mode,
                topic_min_chars, topic_similarity_threshold, max_visual_chars, max_tts_chars, status
            )
            VALUES(?,?,?,?,?,?,?,?,?,'script_ready')
            """,
            (
                channel_id,
                title.strip(),
                source_type,
                script_text,
                split_mode,
                topic_min_chars,
                topic_similarity_threshold,
                max_visual_chars,
                max_tts_chars,
            ),
        )
        video_id = cur.lastrowid
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
    return _row_to_dict(row)


def list_videos(channel_id: int | None = None) -> list[dict[str, Any]]:
    where = ""
    params: tuple[Any, ...] = ()
    if channel_id is not None:
        where = "WHERE v.channel_id = ?"
        params = (channel_id,)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.*,
                COUNT(b.id) AS blocks_count,
                SUM(CASE WHEN a.asset_type='image' AND a.status='done' THEN 1 ELSE 0 END) AS images_done,
                SUM(CASE WHEN a.asset_type='audio' AND a.status='done' THEN 1 ELSE 0 END) AS audios_done
            FROM videos v
            LEFT JOIN video_blocks b ON b.video_id = v.id
            LEFT JOIN block_assets a ON a.video_block_id = b.id
            {where}
            GROUP BY v.id
            ORDER BY v.id DESC
            """,
            params,
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_video(video_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        if not row:
            return None
        blocks = conn.execute(
            """
            SELECT * FROM video_blocks
            WHERE video_id = ?
            ORDER BY block_order
            """,
            (video_id,),
        ).fetchall()

    video = _row_to_dict(row)
    video["blocks"] = [_row_to_dict(b) for b in blocks]
    return video


def ingest_video_script(video_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        if not row:
            raise ValueError(f"video_id {video_id} not found")

        manifest = build_manifest(
            script_text=row["script_text"],
            max_visual_chars=row["max_visual_chars"],
            max_tts_chars=row["max_tts_chars"],
            split_mode=row["split_mode"],
            topic_min_chars=row["topic_min_chars"],
            topic_similarity_threshold=row["topic_similarity_threshold"],
        )
        validation = validate_manifest(manifest)
        if not validation["valid"]:
            raise ValueError(f"manifest validation failed: {validation['errors']}")

        conn.execute("DELETE FROM block_assets WHERE video_block_id IN (SELECT id FROM video_blocks WHERE video_id = ?)", (video_id,))
        conn.execute("DELETE FROM video_blocks WHERE video_id = ?", (video_id,))

        for idx, block in enumerate(manifest["blocks"], start=1):
            cur = conn.execute(
                """
                INSERT INTO video_blocks(
                    video_id, block_order, paragraph_id, block_code, source_text,
                    span_start, span_end, image_prompt, estimated_duration_sec, tts_chunks_json, tts_text
                )
                VALUES(?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    video_id,
                    idx,
                    block["paragraph_id"],
                    block["block_id"],
                    block["source_text"],
                    block["source_span"]["start"],
                    block["source_span"]["end"],
                    block["image_prompt"],
                    block["estimated_duration_sec"],
                    json.dumps(block["tts_chunks"], ensure_ascii=False),
                    block["source_text"],
                ),
            )
            block_db_id = cur.lastrowid
            conn.execute(
                """
                INSERT INTO block_assets(video_block_id, asset_type, status)
                VALUES(?, 'image', 'pending'), (?, 'audio', 'pending')
                """,
                (block_db_id, block_db_id),
            )

        conn.execute(
            "UPDATE videos SET status = 'blocks_ready', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            (video_id,),
        )

    return {"video_id": video_id, "blocks_count": len(manifest["blocks"]), "status": "blocks_ready"}


def mark_block_asset(
    video_block_id: int,
    asset_type: str,
    status: str,
    file_path: str | None = None,
    duration_sec: float | None = None,
    provider: str | None = None,
    model: str | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM block_assets
            WHERE video_block_id = ? AND asset_type = ?
            """,
            (video_block_id, asset_type),
        ).fetchone()
        if not row:
            cur = conn.execute(
                """
                INSERT INTO block_assets(video_block_id, asset_type, status, file_path, duration_sec, provider, model, meta_json)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                (
                    video_block_id,
                    asset_type,
                    status,
                    file_path,
                    duration_sec,
                    provider,
                    model,
                    json.dumps(meta or {}, ensure_ascii=False),
                ),
            )
            asset_id = cur.lastrowid
        else:
            asset_id = row["id"]
            conn.execute(
                """
                UPDATE block_assets
                SET status = ?, file_path = ?, duration_sec = ?, provider = ?, model = ?, meta_json = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE id = ?
                """,
                (
                    status,
                    file_path,
                    duration_sec,
                    provider,
                    model,
                    json.dumps(meta or {}, ensure_ascii=False),
                    asset_id,
                ),
            )

        updated = conn.execute("SELECT * FROM block_assets WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_dict(updated)


def create_pipeline_job(video_id: int, stage: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO pipeline_jobs(video_id, stage, payload_json)
            VALUES(?,?,?)
            """,
            (video_id, stage, json.dumps(payload or {}, ensure_ascii=False)),
        )
        job_id = cur.lastrowid
        row = conn.execute("SELECT * FROM pipeline_jobs WHERE id = ?", (job_id,)).fetchone()
    return _row_to_dict(row)


def update_pipeline_job(
    job_id: int,
    status: str,
    attempts_inc: bool = False,
    last_error: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with get_connection() as conn:
        current = conn.execute("SELECT * FROM pipeline_jobs WHERE id = ?", (job_id,)).fetchone()
        if not current:
            raise ValueError(f"job_id {job_id} not found")
        attempts = int(current["attempts"]) + (1 if attempts_inc else 0)
        payload_json = current["payload_json"]
        if payload is not None:
            payload_json = json.dumps(payload, ensure_ascii=False)
        conn.execute(
            """
            UPDATE pipeline_jobs
            SET status = ?, attempts = ?, last_error = ?, payload_json = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?
            """,
            (status, attempts, last_error, payload_json, job_id),
        )
        row = conn.execute("SELECT * FROM pipeline_jobs WHERE id = ?", (job_id,)).fetchone()
    return _row_to_dict(row)


def list_video_blocks(video_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, block_order, block_code, source_text, analysis_json, storyboard_json, image_prompt
            FROM video_blocks
            WHERE video_id = ?
            ORDER BY block_order
            """,
            (video_id,),
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def list_video_versions_compat(video_id: int) -> list[dict[str, Any]]:
    """Compatibility shape for the imported vizlec editor (`/videos/{id}/versions`)."""
    with get_connection() as conn:
        video = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
    if not video:
        raise ValueError(f"video_id {video_id} not found")
    return [
        {
            "id": str(video_id),
            "lessonId": str(video_id),  # compat field name expected by editor snapshot
            "speechRateWps": 2.5,
            "preferredVoiceId": None,
            "preferredTemplateId": None,
            "createdAt": str(video["created_at"]),
        }
    ]


def list_video_blocks_compat(video_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                b.id,
                b.video_id,
                b.block_order,
                b.source_text,
                COALESCE(b.tts_text, b.source_text) AS tts_text,
                b.image_prompt,
                b.analysis_json,
                b.storyboard_json
            FROM video_blocks b
            WHERE b.video_id = ?
            ORDER BY b.block_order
            """,
            (video_id,),
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        image_prompt_json = None
        if str(d.get("image_prompt", "")).strip():
            image_prompt_json = json.dumps(
                {
                    "block_prompt": d["image_prompt"],
                    "avoid": "",
                    "seed_hint": "",
                    "seed": 0,
                },
                ensure_ascii=False,
            )
        items.append(
            {
                "id": str(d["id"]),
                "lessonVersionId": str(d["video_id"]),  # compat field name
                "index": int(d["block_order"]),
                "sourceText": d["source_text"],
                "ttsText": d["tts_text"],
                "onScreenJson": None,  # on-screen removed from MVP
                "imagePromptJson": image_prompt_json,
                "status": "ready" if str(d.get("image_prompt", "")).strip() else "editing",
                "segmentError": None,
            }
        )
    return items


def patch_video_block_compat(
    block_id: int,
    tts_text: str | None = None,
    image_prompt_payload: dict[str, Any] | None = None,
    on_screen_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with get_connection() as conn:
        current = conn.execute("SELECT * FROM video_blocks WHERE id = ?", (block_id,)).fetchone()
        if not current:
            raise ValueError(f"block_id {block_id} not found")
        if tts_text is not None:
            conn.execute(
                """
                UPDATE video_blocks
                SET tts_text = ?, created_at = created_at
                WHERE id = ?
                """,
                (tts_text.strip(), block_id),
            )
        if image_prompt_payload is not None:
            block_prompt = str(image_prompt_payload.get("block_prompt", "")).strip()
            conn.execute(
                """
                UPDATE video_blocks
                SET image_prompt = ?
                WHERE id = ?
                """,
                (block_prompt, block_id),
            )
        # On-screen is intentionally ignored in the MVP migration path.
        _ = on_screen_payload
        row = conn.execute(
            """
            SELECT id, video_id, block_order, source_text, COALESCE(tts_text, source_text) AS tts_text, image_prompt
            FROM video_blocks WHERE id = ?
            """,
            (block_id,),
        ).fetchone()
    result = _row_to_dict(row)
    return {
        "id": str(result["id"]),
        "lessonVersionId": str(result["video_id"]),
        "index": int(result["block_order"]),
        "sourceText": result["source_text"],
        "ttsText": result["tts_text"],
        "onScreenJson": None,
        "imagePromptJson": (
            json.dumps({"block_prompt": result["image_prompt"]}, ensure_ascii=False)
            if str(result.get("image_prompt", "")).strip()
            else None
        ),
        "status": "ready" if str(result.get("image_prompt", "")).strip() else "editing",
        "segmentError": None,
    }


def list_video_audios_compat(video_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.id AS block_id, a.file_path, a.status
            FROM video_blocks b
            LEFT JOIN block_assets a
              ON a.video_block_id = b.id AND a.asset_type = 'audio'
            WHERE b.video_id = ?
            ORDER BY b.block_order
            """,
            (video_id,),
        ).fetchall()
    return {
        "blocks": [
            {
                "blockId": str(r["block_id"]),
                "url": str(r["file_path"]) if r["file_path"] and str(r["status"]) == "done" else None,
            }
            for r in rows
        ]
    }


def list_video_images_compat(video_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.id AS block_id, a.file_path, a.status
            FROM video_blocks b
            LEFT JOIN block_assets a
              ON a.video_block_id = b.id AND a.asset_type = 'image'
            WHERE b.video_id = ?
            ORDER BY b.block_order
            """,
            (video_id,),
        ).fetchall()
    return {
        "blocks": [
            {
                "blockId": str(r["block_id"]),
                "url": str(r["file_path"]) if r["file_path"] and str(r["status"]) == "done" else None,
            }
            for r in rows
        ]
    }


def list_video_slides_compat(video_id: int, template_id: str | None = None) -> dict[str, Any]:
    _ = template_id
    blocks = list_video_blocks_compat(video_id)
    return {"blocks": [{"blockId": item["id"], "exists": False} for item in blocks]}


def get_job_state_compat(video_id: int) -> dict[str, Any]:
    _ = video_id
    idle = {
        "active": False,
        "jobId": None,
        "status": "idle",
        "phase": "idle",
        "current": 0,
        "total": 0,
    }
    return {
        "finalVideoReady": False,
        "segment": dict(idle),
        "tts": dict(idle),
        "image": dict(idle),
        "slides": dict(idle),
        "finalVideo": dict(idle),
        "blockJobs": {"segment": [], "tts": [], "image": []},
    }


def update_video_blocks_llm(video_id: int, updates: list[dict[str, Any]]) -> None:
    if not updates:
        return
    with get_connection() as conn:
        for item in updates:
            conn.execute(
                """
                UPDATE video_blocks
                SET analysis_json = ?, storyboard_json = ?, image_prompt = ?
                WHERE id = ? AND video_id = ?
                """,
                (
                    item["analysis_json"],
                    item["storyboard_json"],
                    item["image_prompt"],
                    item["id"],
                    video_id,
                ),
            )
            conn.execute(
                """
                UPDATE block_assets
                SET provider = ?, model = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE video_block_id = ? AND asset_type = 'image'
                """,
                (
                    item["storyboard_provider"],
                    item["storyboard_model"],
                    item["id"],
                ),
            )


def run_llm_prompt_pipeline(
    video_id: int,
    style_notes: str = "",
    reference_images: list[str] | None = None,
    visual_dna: dict[str, Any] | None = None,
    aesthetic_anchor: str | None = None,
    force_reprocess: bool = False,
    block_codes: list[str] | None = None,
) -> dict[str, Any]:
    with get_connection() as conn:
        video = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
    if not video:
        raise ValueError(f"video_id {video_id} not found")

    blocks = list_video_blocks(video_id)
    if not blocks:
        raise ValueError("video has no blocks; run ingest-script first")

    style_payload = None
    if visual_dna is not None or aesthetic_anchor is not None:
        style_payload = {
            "aesthetic_anchor": aesthetic_anchor or "estilo editorial didatico",
            "visual_dna": visual_dna or {},
        }

    pipeline = LLMPipeline()
    if has_saved_system_settings() and hasattr(pipeline, "router") and hasattr(pipeline.router, "apply_runtime_settings"):
        pipeline.router.apply_runtime_settings(get_llm_settings())
    job = create_pipeline_job(video_id=video_id, stage="llm_analysis", payload={"force_reprocess": force_reprocess})

    try:
        update_pipeline_job(job_id=job["id"], status="running")
        result = pipeline.run_for_video_blocks(
            blocks=blocks,
            style_notes=style_notes,
            reference_images=reference_images or [],
            style_payload=style_payload,
            force_reprocess=force_reprocess,
            selected_block_codes=block_codes,
        )
        update_video_blocks_llm(video_id, result["updates"])
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE videos
                SET status = 'llm_ready', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE id = ?
                """,
                (video_id,),
            )
        update_pipeline_job(
            job_id=job["id"],
            status="done",
            payload={
                "processed_blocks": result["meta"]["processed_blocks"],
                "cache_hits": result["meta"]["cache_hits"],
            },
        )
        return {
            "video_id": video_id,
            "job_id": job["id"],
            "status": "llm_ready",
            "processed_blocks": result["meta"]["processed_blocks"],
            "cache_hits": result["meta"]["cache_hits"],
        }
    except Exception as exc:
        update_pipeline_job(
            job_id=job["id"],
            status="failed",
            attempts_inc=True,
            last_error=str(exc),
        )
        raise
