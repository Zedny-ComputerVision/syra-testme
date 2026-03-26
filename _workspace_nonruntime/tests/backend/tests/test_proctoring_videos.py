from src.app.modules.proctoring.routes_public import _build_registered_video_info, _normalize_saved_video_meta
from src.app.services.cloudflare_media import infer_cloudflare_ready_to_stream


def test_infer_cloudflare_ready_to_stream_blocks_processing_status():
    assert infer_cloudflare_ready_to_stream(
        status="processing",
        ready_to_stream=True,
        playback_url="https://example.com/video.m3u8",
    ) is False


def test_normalize_saved_video_meta_blocks_processing_recordings():
    item = _normalize_saved_video_meta({
        "provider": "cloudflare",
        "name": "clip.m3u8",
        "source": "camera",
        "playback_url": "https://example.com/video.m3u8",
        "status": "processing",
        "ready_to_stream": True,
    })

    assert item is not None
    assert item["ready_to_stream"] is False
    assert item["status"] == "processing"


def test_build_registered_video_info_marks_processing_cloudflare_videos_unplayable():
    file_info = _build_registered_video_info(
        "37d0acab-29f7-46d6-944a-e5bbeef8dbb5",
        {
            "playback_url": "https://example.com/video.m3u8",
            "status": "processing",
            "ready_to_stream": True,
            "name": "clip.m3u8",
        },
        session_id="session-1",
        source="camera",
    )

    assert file_info["ready_to_stream"] is False
    assert file_info["status"] == "processing"
