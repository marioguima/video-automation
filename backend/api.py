from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import time

try:
    from .project_store import (
        create_channel,
        create_video,
        get_video,
        ingest_video_script,
        init_db,
        get_job_state_compat,
        get_system_settings,
        list_video_audios_compat,
        list_channels,
        list_video_blocks_compat,
        list_video_images_compat,
        list_video_slides_compat,
        list_video_versions_compat,
        list_videos,
        patch_video_block_compat,
        run_llm_prompt_pipeline,
        update_system_settings,
    )
    from .script_pipeline import build_manifest, load_script_file, validate_manifest
except ImportError:
    from project_store import (
        create_channel,
        create_video,
        get_video,
        ingest_video_script,
        init_db,
        get_job_state_compat,
        get_system_settings,
        list_video_audios_compat,
        list_channels,
        list_video_blocks_compat,
        list_video_images_compat,
        list_video_slides_compat,
        list_video_versions_compat,
        list_videos,
        patch_video_block_compat,
        run_llm_prompt_pipeline,
        update_system_settings,
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


class RunLlmPromptPipelineRequest(BaseModel):
    style_notes: str = ""
    reference_images: list[str] = Field(default_factory=list)
    visual_dna: dict | None = None
    aesthetic_anchor: str | None = None
    force_reprocess: bool = False
    block_codes: list[str] | None = None


class CompatBlockPatchRequest(BaseModel):
    ttsText: str | None = None
    onScreen: dict | None = None
    imagePrompt: dict | None = None


class CompatJobCreateResponse(BaseModel):
    id: str
    status: str


class LlmSettingsPatch(BaseModel):
    provider: str | None = None
    base_url: str | None = None
    baseUrl: str | None = None
    model: str | None = None
    api_key: str | None = None
    apiKey: str | None = None
    timeout_sec: int | None = None
    timeoutSec: int | None = None
    timeoutMs: int | None = None


class SettingsPatchRequest(BaseModel):
    llm: LlmSettingsPatch | None = None


_COMPAT_JOB_STORE: dict[str, dict] = {}


def _compat_job(status: str = "succeeded", **extra: object) -> dict:
    job_id = f"compat-{int(time.time() * 1000)}"
    payload = {"id": job_id, "status": status, **extra}
    _COMPAT_JOB_STORE[job_id] = payload
    return payload


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
            "POST /api/videos/{id}/llm/prompts",
            "GET /api/videos/{id}/versions",
            "GET /api/video-versions/{id}/blocks",
            "PATCH /api/blocks/{id}",
            "GET /api/settings",
            "PATCH /api/settings",
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


@app.post("/api/videos/{video_id}/llm/prompts")
def videos_llm_prompts(video_id: int, payload: RunLlmPromptPipelineRequest) -> dict:
    try:
        return run_llm_prompt_pipeline(
            video_id=video_id,
            style_notes=payload.style_notes,
            reference_images=payload.reference_images,
            visual_dna=payload.visual_dna,
            aesthetic_anchor=payload.aesthetic_anchor,
            force_reprocess=payload.force_reprocess,
            block_codes=payload.block_codes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/videos/{video_id}/versions")
def videos_versions(video_id: int) -> list[dict]:
    try:
        return list_video_versions_compat(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/blocks")
def video_versions_blocks(version_id: int) -> list[dict]:
    try:
        return list_video_blocks_compat(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/slides")
def video_versions_slides(version_id: int, templateId: str | None = Query(default=None)) -> dict:
    try:
        return list_video_slides_compat(version_id, template_id=templateId)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/audios")
def video_versions_audios(version_id: int) -> dict:
    try:
        return list_video_audios_compat(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/images")
def video_versions_images(version_id: int) -> dict:
    try:
        return list_video_images_compat(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/job-state")
def video_versions_job_state(version_id: int) -> dict:
    try:
        return get_job_state_compat(version_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/blocks/{block_id}")
def blocks_patch(block_id: int, payload: CompatBlockPatchRequest) -> dict:
    try:
        return patch_video_block_compat(
            block_id=block_id,
            tts_text=payload.ttsText,
            image_prompt_payload=payload.imagePrompt,
            on_screen_payload=payload.onScreen,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/tts/voices")
def tts_voices() -> dict:
    # Minimal compat response for migrated editor while TTS integration is being wired.
    return {"voices": []}


@app.get("/api/integrations/xtts/health")
def xtts_health() -> dict:
    # Do not block the migration editor on XTTS health during kernel port.
    return {"ok": True}


@app.get("/api/tts/provider")
def tts_provider() -> dict:
    return {"provider": "xtts"}


@app.get("/api/slide-templates")
def slide_templates() -> list[dict]:
    # Minimal list for migrated editor; slides are disabled in MVP migration mode.
    return [
        {"id": "subtitle-only", "label": "Subtitle Only (MVP)", "kind": "text"},
    ]


@app.get("/api/settings")
def settings() -> dict:
    current = get_system_settings()
    return {
        **current,
        "tts": {"defaultVoiceId": None},
    }


@app.patch("/api/settings")
def settings_patch(payload: SettingsPatchRequest) -> dict:
    patch = payload.dict(exclude_unset=True)
    try:
        current = update_system_settings(patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        **current,
        "tts": {"defaultVoiceId": None},
    }


@app.patch("/api/video-versions/{version_id}/preferences")
def video_version_preferences(version_id: int, payload: dict) -> dict:
    _ = (version_id, payload)
    return {
        "id": str(version_id),
        "speechRateWps": 2.5,
        "preferredVoiceId": payload.get("preferredVoiceId"),
        "preferredTemplateId": payload.get("preferredTemplateId"),
    }


@app.get("/api/jobs/{job_id}")
def jobs_get(job_id: str) -> dict:
    return _COMPAT_JOB_STORE.get(job_id, {"id": job_id, "status": "succeeded"})


@app.post("/api/jobs/{job_id}/cancel")
def jobs_cancel(job_id: str, payload: dict | None = None) -> dict:
    _ = payload
    current = _COMPAT_JOB_STORE.get(job_id, {"id": job_id})
    current["status"] = "canceled"
    _COMPAT_JOB_STORE[job_id] = current
    return {"ok": True, "id": job_id, "status": "canceled"}


@app.post("/api/video-versions/{version_id}/segment")
def video_versions_segment(version_id: int, payload: dict | None = None) -> dict:
    _ = payload
    # Real action: reuse current ingest pipeline to create/update blocks.
    ingest_video_script(version_id)
    return _compat_job(status="succeeded")


@app.post("/api/blocks/{block_id}/segment/retry")
def blocks_segment_retry(block_id: int, payload: dict | None = None) -> dict:
    _ = (block_id, payload)
    # Stub for imported editor flow; real single-block segment regeneration comes later.
    return _compat_job(status="succeeded")


@app.post("/api/video-versions/{version_id}/tts")
def video_versions_tts(version_id: int, payload: dict | None = None) -> dict:
    _ = (version_id, payload)
    return _compat_job(status="pending")


@app.post("/api/blocks/{block_id}/tts")
def blocks_tts(block_id: int, payload: dict | None = None) -> dict:
    _ = (block_id, payload)
    return _compat_job(status="pending")


@app.post("/api/video-versions/{version_id}/images")
def video_versions_images_generate(version_id: int, payload: dict | None = None) -> dict:
    _ = (version_id, payload)
    return _compat_job(status="pending")


@app.post("/api/blocks/{block_id}/image")
def blocks_image(block_id: int, payload: dict | None = None) -> dict:
    _ = (block_id, payload)
    return _compat_job(status="pending")


@app.post("/api/video-versions/{version_id}/slides")
def video_versions_slides_generate(version_id: int, payload: dict | None = None) -> dict:
    _ = (version_id, payload)
    return _compat_job(status="pending")


@app.post("/api/video-versions/{version_id}/final-video")
def video_versions_final_video_generate(version_id: int, payload: dict | None = None) -> dict:
    _ = (version_id, payload)
    return _compat_job(status="pending")


@app.get("/api/blocks/{block_id}/audio/raw")
def blocks_audio_raw(block_id: int):
    try:
        for video in list_videos():
            compat = list_video_audios_compat(int(video["id"]))
            for item in compat["blocks"]:
                if item["blockId"] != str(block_id) or not item.get("url"):
                    continue
                path = Path(str(item["url"]))
                if not path.exists():
                    raise HTTPException(status_code=404, detail="audio file missing on disk")
                return FileResponse(path)
        raise HTTPException(status_code=404, detail="audio not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/blocks/{block_id}/image/raw")
def blocks_image_raw(block_id: int):
    try:
        for video in list_videos():
            compat = list_video_images_compat(int(video["id"]))
            for item in compat["blocks"]:
                if item["blockId"] != str(block_id) or not item.get("url"):
                    continue
                path = Path(str(item["url"]))
                if not path.exists():
                    raise HTTPException(status_code=404, detail="image file missing on disk")
                return FileResponse(path)
        raise HTTPException(status_code=404, detail="image not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/video-versions/{version_id}/final-video")
def video_versions_final_video(version_id: int):
    video = get_video(version_id)
    if not video:
        raise HTTPException(status_code=404, detail="video not found")
    raise HTTPException(status_code=404, detail="final video not generated yet")


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
