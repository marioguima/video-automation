import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from .script_pipeline import build_manifest, validate_manifest
except ImportError:
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

            CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
            CREATE INDEX IF NOT EXISTS idx_blocks_video ON video_blocks(video_id);
            CREATE INDEX IF NOT EXISTS idx_assets_block ON block_assets(video_block_id);
            CREATE INDEX IF NOT EXISTS idx_jobs_video_stage ON pipeline_jobs(video_id, stage);
            """
        )


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
                    span_start, span_end, image_prompt, estimated_duration_sec, tts_chunks_json
                )
                VALUES(?,?,?,?,?,?,?,?,?,?)
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
