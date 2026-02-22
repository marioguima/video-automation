from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .project_store import (
        create_channel,
        create_video,
        get_video,
        ingest_video_script,
        init_db,
        list_channels,
        list_videos,
    )
    from .script_pipeline import build_manifest, load_script_file, validate_manifest
except ImportError:
    from project_store import (
        create_channel,
        create_video,
        get_video,
        ingest_video_script,
        init_db,
        list_channels,
        list_videos,
    )
    from script_pipeline import build_manifest, load_script_file, validate_manifest


class ManifestRequest(BaseModel):
    script: str
    max_visual_chars: int = 0
    max_tts_chars: int = 200
    split_mode: str = "topic"
    topic_min_chars: int = 120
    topic_similarity_threshold: float = 0.16


class ManifestFromFileRequest(BaseModel):
    path: str
    split_mode: str = "topic"
    topic_min_chars: int = 120
    topic_similarity_threshold: float = 0.16


class CreateChannelRequest(BaseModel):
    name: str
    niche: str | None = None
    language: str = "pt-BR"


class CreateVideoRequest(BaseModel):
    channel_id: int
    title: str
    script_text: str
    split_mode: str = "topic"
    topic_min_chars: int = 120
    topic_similarity_threshold: float = 0.16
    max_visual_chars: int = 0
    max_tts_chars: int = 200
    source_type: str = "external_script"


app = FastAPI(title="Video Automation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def root() -> dict:
    return {
        "service": "video-automation-api",
        "status": "ok",
        "endpoints": [
            "GET /api/health",
            "GET /api/channels",
            "POST /api/channels",
            "GET /api/videos?channel_id=1",
            "POST /api/videos",
            "GET /api/videos/{id}",
            "POST /api/videos/{id}/ingest-script",
            "POST /api/manifest",
            "POST /api/manifest/from-file",
        ],
    }


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/channels")
def channels() -> dict:
    return {"items": list_channels()}


@app.post("/api/channels", status_code=201)
def channels_create(payload: CreateChannelRequest) -> dict:
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    try:
        return create_channel(name=payload.name, niche=payload.niche, language=payload.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/videos")
def videos(channel_id: int | None = Query(default=None)) -> dict:
    return {"items": list_videos(channel_id=channel_id)}


@app.post("/api/videos", status_code=201)
def videos_create(payload: CreateVideoRequest) -> dict:
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if not payload.script_text.strip():
        raise HTTPException(status_code=400, detail="script_text is required")
    try:
        return create_video(
            channel_id=payload.channel_id,
            title=payload.title,
            script_text=payload.script_text,
            split_mode=payload.split_mode,
            topic_min_chars=payload.topic_min_chars,
            topic_similarity_threshold=payload.topic_similarity_threshold,
            max_visual_chars=payload.max_visual_chars,
            max_tts_chars=payload.max_tts_chars,
            source_type=payload.source_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/videos/{video_id}")
def videos_get(video_id: int) -> dict:
    result = get_video(video_id)
    if not result:
        raise HTTPException(status_code=404, detail="video not found")
    return result


@app.post("/api/videos/{video_id}/ingest-script")
def videos_ingest_script(video_id: int) -> dict:
    try:
        return ingest_video_script(video_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/manifest")
def manifest(payload: ManifestRequest) -> dict:
    if not payload.script.strip():
        raise HTTPException(status_code=400, detail="script is required")
    try:
        manifest_result = build_manifest(
            script_text=payload.script,
            max_visual_chars=payload.max_visual_chars,
            max_tts_chars=payload.max_tts_chars,
            split_mode=payload.split_mode,
            topic_min_chars=payload.topic_min_chars,
            topic_similarity_threshold=payload.topic_similarity_threshold,
        )
        validation = validate_manifest(manifest_result)
        return {"manifest": manifest_result, "validation": validation}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/manifest/from-file")
def manifest_from_file(payload: ManifestFromFileRequest) -> dict:
    if not payload.path:
        raise HTTPException(status_code=400, detail="path is required")
    try:
        script_text = load_script_file(payload.path)
        manifest_result = build_manifest(
            script_text=script_text,
            split_mode=payload.split_mode,
            topic_min_chars=payload.topic_min_chars,
            topic_similarity_threshold=payload.topic_similarity_threshold,
        )
        validation = validate_manifest(manifest_result)
        return {"manifest": manifest_result, "validation": validation}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
