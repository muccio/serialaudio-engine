"""Tests for FastAPI backend and WebSocket IPC."""
import pytest
from fastapi.testclient import TestClient
from main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_demo_and_pipeline_flow(client):
    # 1. Generate demo audio (Menotti's Sebastian's Dance)
    res_demo = client.post("/api/generate-demo", json={"duration_sec": 3.0})
    assert res_demo.status_code == 200
    demo_data = res_demo.json()
    session_id = demo_data["session_id"]
    assert "mix_url" in demo_data
    assert set(demo_data["stems"].keys()) == {"drums", "bass", "other", "vocals"}
    
    # 2. Slice stems
    res_slice = client.post("/api/slice", json={
        "session_id": session_id,
        "method": "spectral_flux",
        "threshold": 0.2,
        "min_event_duration_ms": 50.0,
        "max_event_duration_ms": 1000.0,
        "crossfade_envelope_ms": 5.0
    })
    assert res_slice.status_code == 200
    slice_data = res_slice.json()
    assert "slices" in slice_data
    assert "drums" in slice_data["slices"]
    assert len(slice_data["slices"]["drums"]) > 0

    # 3. Request 12-Tone Matrix
    res_matrix = client.post("/api/matrix", json={
        "session_id": session_id,
        "stem": "other"
    })
    assert res_matrix.status_code == 200
    mat_data = res_matrix.json()
    assert "matrix" in mat_data
    assert len(mat_data["matrix"]) == 12
    assert len(mat_data["matrix"][0]) == 12

    # 4. Render Timeline Mixdown
    res_render = client.post("/api/render", json={
        "session_id": session_id,
        "target_duration_sec": 3.0,
        "density_curve": [
            {"time": 0.0, "events_per_sec": 3.0},
            {"time": 1.5, "events_per_sec": 8.0},
            {"time": 3.0, "events_per_sec": 2.0}
        ],
        "stem_weights": {"drums": 0.4, "bass": 0.3, "other": 0.2, "vocals": 0.1},
        "active_form": "P",
        "active_matrix_row": 0,
        "sample_rate": 44100
    })
    assert res_render.status_code == 200
    render_data = res_render.json()
    assert render_data["event_count"] > 0
    assert "master_url" in render_data

    # 5. Audio streaming endpoint
    audio_url = render_data["master_url"]
    audio_res = client.get(audio_url)
    assert audio_res.status_code == 200
    assert audio_res.headers["content-type"] in ["audio/wav", "audio/x-wav"]

    # 6. Intermediate products download endpoints
    stem_res = client.get(f"/api/download/stem/{session_id}/drums")
    assert stem_res.status_code == 200
    assert stem_res.headers["content-type"] in ["audio/wav", "audio/x-wav"]

    stems_zip_res = client.get(f"/api/download/stems-zip/{session_id}")
    assert stems_zip_res.status_code == 200
    assert "zip" in stems_zip_res.headers["content-type"]

    slices_zip_res = client.get(f"/api/download/slices-zip/{session_id}")
    assert slices_zip_res.status_code == 200
    assert "zip" in slices_zip_res.headers["content-type"]

    slices_meta_res = client.get(f"/api/download/slices-meta/{session_id}")
    assert slices_meta_res.status_code == 200
    assert "json" in slices_meta_res.headers["content-type"]

    matrix_json_res = client.get(f"/api/download/matrix-json/{session_id}/other")
    assert matrix_json_res.status_code == 200
    assert "json" in matrix_json_res.headers["content-type"]
    assert "matrix" in matrix_json_res.json()

    raw_mix_res = client.get(f"/api/download/raw-mix/{session_id}")
    assert raw_mix_res.status_code == 200
    assert raw_mix_res.headers["content-type"] in ["audio/wav", "audio/x-wav"]

    # 7. Test uncapped duration (> 60s)
    res_render_long = client.post("/api/render", json={
        "session_id": session_id,
        "target_duration_sec": 75.0,
        "density_curve": [
            {"time": 0.0, "events_per_sec": 1.0},
            {"time": 75.0, "events_per_sec": 2.0}
        ],
        "stem_weights": {"drums": 0.5, "bass": 0.5},
        "active_form": "R",
        "sample_rate": 44100
    })
    assert res_render_long.status_code == 200
    assert res_render_long.json()["duration_sec"] == 75.0
