"""FastAPI & WebSocket IPC service for SerialAudio Engine."""
import asyncio
import datetime
import io
import json
import logging
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Dict, List, Literal, Optional, Union

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from dsp.demucs_pipeline import DemucsPipeline
from dsp.onset_detector import AudioSlice, OnsetDetector
from dsp.sample_generator import generate_sebastians_dance
from dsp.serial_matrix import DodecaphonicMatrix, TransformationType
from dsp.timeline_renderer import DensityPoint, TimelineConfig, TimelineRenderer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("serialaudio-engine")

app = FastAPI(title="SerialAudio Engine API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent.resolve()
CACHE_DIR = BASE_DIR / "session_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

demucs_pipeline = DemucsPipeline(session_cache_dir=CACHE_DIR)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# In-memory session cache
sessions: Dict[str, Dict] = {}

def get_or_create_session(session_id: Optional[str] = None) -> str:
    if not session_id:
        session_id = f"sess_{uuid.uuid4().hex[:10]}"
    sess_dir = CACHE_DIR / session_id
    sess_dir.mkdir(parents=True, exist_ok=True)
    if session_id not in sessions:
        # Rehydrate existing disk stems if session was created earlier
        stems_dir = sess_dir / "stems"
        stems = {}
        if stems_dir.exists():
            for s in ["drums", "bass", "other", "vocals"]:
                p = stems_dir / f"{s}.wav"
                if p.exists() and p.stat().st_size > 0:
                    stems[s] = p

        mix_path = None
        for p in sess_dir.glob("*.wav"):
            if "master" not in p.name:
                mix_path = p
                break

        sessions[session_id] = {
            "session_id": session_id,
            "dir": sess_dir,
            "mix_path": mix_path,
            "stems": stems,
            "slices": {},
            "matrices": {},
            "master_path": None
        }
    return session_id

# Pydantic Request Models
class GenerateDemoRequest(BaseModel):
    duration_sec: float = 8.0
    sr: int = 44100

class SliceRequest(BaseModel):
    session_id: str
    method: Literal["spectral_flux", "hfc", "energy"] = "spectral_flux"
    threshold: float = 0.2
    min_event_duration_ms: float = 50.0
    max_event_duration_ms: float = 2000.0
    crossfade_envelope_ms: float = 5.0

class MatrixRequest(BaseModel):
    session_id: str
    stem: str = "other"

class RenderRequest(BaseModel):
    session_id: str
    target_duration_sec: float = 20.0
    density_curve: List[Dict[str, float]]
    stem_weights: Dict[str, float] = Field(default_factory=lambda: {
        "drums": 0.35, "bass": 0.25, "other": 0.25, "vocals": 0.15
    })
    active_form: TransformationType = "P"
    active_matrix_row: int = 0
    reverse_buffers: bool = False
    sample_rate: int = 44100
    bit_depth: str = "PCM_24"

@app.get("/health")
def health():
    return {"status": "ok", "engine": "SerialAudio Python 3.11 DSP"}

@app.get("/favicon.ico")
def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/manifest.webmanifest")
def manifest():
    return {
        "name": "SerialAudio Engine",
        "short_name": "SerialAudio",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0b0c10",
        "theme_color": "#6366f1"
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keepalive receiver
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

def _send_progress_sync(session_id: str, progress: float, stage: str, message: str):
    """Bridge sync callbacks to async WebSocket broadcast via running event loop if available."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(
                manager.broadcast({
                    "session_id": session_id,
                    "progress": progress,
                    "stage": stage,
                    "message": message
                })
            )
    except Exception:
        pass

@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    session_id = get_or_create_session()
    sess = sessions[session_id]
    
    file_ext = Path(file.filename).suffix or ".wav"
    out_file = sess["dir"] / f"uploaded_mix{file_ext}"
    
    with open(out_file, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    sess["mix_path"] = out_file
    
    # Broadcast upload done
    await manager.broadcast({
        "session_id": session_id,
        "progress": 1.0,
        "stage": "upload",
        "message": f"Uploaded {file.filename}"
    })
    
    return {
        "session_id": session_id,
        "filename": file.filename,
        "mix_url": f"/api/audio/{session_id}/raw/uploaded_mix{file_ext}"
    }

@app.post("/api/generate-demo")
async def generate_demo(req: GenerateDemoRequest):
    session_id = get_or_create_session()
    sess = sessions[session_id]
    
    await manager.broadcast({
        "session_id": session_id,
        "progress": 0.2,
        "stage": "demo_generation",
        "message": "Generating orchestral motifs for Menotti's 'Sebastian's Dance'..."
    })
    
    res = generate_sebastians_dance(
        output_dir=sess["dir"],
        duration_sec=req.duration_sec,
        sr=req.sr
    )
    
    sess["mix_path"] = res["mix"]
    sess["stems"] = res["stems"]
    
    stem_urls = {
        stem: f"/api/audio/{session_id}/stems/{stem}.wav"
        for stem in res["stems"]
    }
    
    await manager.broadcast({
        "session_id": session_id,
        "progress": 1.0,
        "stage": "demo_generation",
        "message": "Sebastian's Dance motifs synthesized successfully."
    })
    
    return {
        "session_id": session_id,
        "mix_url": f"/api/audio/{session_id}/raw/{res['mix'].name}",
        "stems": stem_urls
    }

@app.post("/api/separate")
async def separate_stems(session_id: str):
    if session_id not in sessions or not sessions[session_id]["mix_path"]:
        raise HTTPException(status_code=404, detail="Session or audio not found")
        
    sess = sessions[session_id]
    
    def on_progress(p: float, msg: str):
        _send_progress_sync(session_id, p, "separation", msg)

    stems = demucs_pipeline.separate(
        audio_path=sess["mix_path"],
        session_id=session_id,
        progress_callback=on_progress
    )
    sess["stems"] = stems
    
    stem_urls = {
        stem: f"/api/audio/{session_id}/stems/{stem}.wav"
        for stem in stems
    }
    
    return {
        "session_id": session_id,
        "stems": stem_urls
    }

@app.post("/api/slice")
async def slice_events(req: SliceRequest):
    session_id = req.session_id
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    sess = sessions[session_id]
    stems = sess["stems"]
    if not stems:
        raise HTTPException(status_code=400, detail="No stems available to slice. Run separate or generate-demo first.")

    detector = OnsetDetector(
        method=req.method,
        threshold=req.threshold,
        min_event_duration_ms=req.min_event_duration_ms,
        max_event_duration_ms=req.max_event_duration_ms,
        crossfade_envelope_ms=req.crossfade_envelope_ms
    )
    
    slices_by_stem: Dict[str, List[AudioSlice]] = {}
    slices_metadata: Dict[str, List[Dict]] = {}
    
    slices_dir = sess["dir"] / "slices"
    slices_dir.mkdir(parents=True, exist_ok=True)
    
    total_stems = len(stems)
    for idx, (stem_name, stem_path) in enumerate(stems.items()):
        stem_slices_dir = slices_dir / stem_name
        stem_slices_dir.mkdir(parents=True, exist_ok=True)
        
        detected_slices = detector.detect_and_slice(
            audio_input=stem_path,
            stem_source=stem_name,
            save_dir=stem_slices_dir
        )
        slices_by_stem[stem_name] = detected_slices
        
        # Attach relative URLs
        meta_list = []
        for s in detected_slices:
            m = s.to_dict()
            m["audio_url"] = f"/api/audio/{session_id}/slices/{stem_name}/{s.id}.wav"
            meta_list.append(m)
        slices_metadata[stem_name] = meta_list
        
        _send_progress_sync(
            session_id, 
            (idx + 1) / total_stems, 
            "slicing", 
            f"Detected {len(detected_slices)} slices in stem '{stem_name}'"
        )

    sess["slices"] = slices_by_stem
    
    # Pre-build matrices
    for stem_name, sl_list in slices_by_stem.items():
        if sl_list:
            sess["matrices"][stem_name] = DodecaphonicMatrix(sl_list)

    return {
        "session_id": session_id,
        "slices": slices_metadata,
        "total_slices": sum(len(v) for v in slices_by_stem.values())
    }

@app.post("/api/matrix")
async def get_serial_matrix(req: MatrixRequest):
    session_id = req.session_id
    if session_id not in sessions:
        sess_dir = CACHE_DIR / session_id
        if sess_dir.exists():
            get_or_create_session(session_id)
        else:
            raise HTTPException(status_code=404, detail="Session not found")
        
    sess = sessions[session_id]
    stem = req.stem
    if stem not in sess["matrices"] or not sess["matrices"][stem]:
        # 1. Use existing in-memory slices for this stem
        if stem in sess["slices"] and sess["slices"][stem]:
            sess["matrices"][stem] = DodecaphonicMatrix(sess["slices"][stem])
        else:
            # 2. Check if stem audio exists on disk and slice it
            stem_file = sess["dir"] / "stems" / f"{stem}.wav"
            if stem_file.exists():
                detector = OnsetDetector()
                detected = detector.detect_and_slice(stem_file, stem_source=stem)
                sess["slices"][stem] = detected
                sess["matrices"][stem] = DodecaphonicMatrix(detected)
            else:
                # 3. Check if any other stem has slices
                any_stem_slices = next((v for v in sess["slices"].values() if v), None)
                if any_stem_slices:
                    sess["matrices"][stem] = DodecaphonicMatrix(any_stem_slices)
                else:
                    # 4. Fallback to default chromatic series so Step 3 always displays
                    sess["matrices"][stem] = DodecaphonicMatrix([])

    mat_obj: DodecaphonicMatrix = sess["matrices"][stem]
    meta = mat_obj.get_matrix_metadata()
    
    # Add audio_url to prime row and ensure preview audio file exists
    for item in meta["prime_row"]:
        actual_stem = item.get("stem_source") or stem
        stem_dir = sess["dir"] / "slices" / actual_stem
        stem_dir.mkdir(parents=True, exist_ok=True)
        slice_wav = stem_dir / f"{item['id']}.wav"
        if not slice_wav.exists():
            freq = item.get("estimated_pitch_hz") or 440.0
            t = np.linspace(0, 0.2, int(0.2 * 44100), endpoint=False)
            tone = 0.3 * np.sin(2 * np.pi * freq * t)
            fade_len = int(0.01 * 44100)
            tone[:fade_len] *= np.linspace(0, 1, fade_len)
            tone[-fade_len:] *= np.linspace(1, 0, fade_len)
            sf.write(str(slice_wav), tone.astype(np.float32), 44100, subtype='PCM_16')
        item["audio_url"] = f"/api/audio/{session_id}/slices/{actual_stem}/{item['id']}.wav"
        
    return {
        "session_id": session_id,
        "stem": stem,
        **meta
    }

@app.post("/api/render")
async def render_timeline(req: RenderRequest):
    session_id = req.session_id
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
        
    sess = sessions[session_id]
    slices_by_stem = sess.get("slices", {})
    if not slices_by_stem:
        raise HTTPException(status_code=400, detail="No slices available to render. Slice stems first.")

    out_master_file = sess["dir"] / f"master_render_{uuid.uuid4().hex[:6]}.wav"
    
    renderer = TimelineRenderer(sr=req.sample_rate, bit_depth=req.bit_depth)
    
    curve_points = [
        DensityPoint(time=p["time"], events_per_sec=p["density"] if "density" in p else p["events_per_sec"])
        for p in req.density_curve
    ]
    
    config = TimelineConfig(
        target_duration_sec=req.target_duration_sec,
        density_curve=curve_points,
        stem_weights=req.stem_weights,
        active_form=req.active_form,
        active_matrix_row=req.active_matrix_row,
        reverse_buffers=req.reverse_buffers
    )
    
    _send_progress_sync(session_id, 0.3, "rendering", "Synthesizing 12-tone serial mixdown...")
    
    render_stats = renderer.render(
        slices_by_stem=slices_by_stem,
        config=config,
        output_filepath=out_master_file
    )
    
    sess["master_path"] = out_master_file
    
    _send_progress_sync(session_id, 1.0, "rendering", "Mixdown complete.")
    
    return {
        "session_id": session_id,
        "master_url": f"/api/audio/{session_id}/master/{out_master_file.name}",
        "export_url": f"/api/export/{session_id}",
        **render_stats
    }

@app.get("/api/audio/{session_id}/{category}/{filename:path}")
async def get_audio_file(session_id: str, category: str, filename: str):
    if session_id not in sessions:
        # Check cache on disk directly
        sess_dir = CACHE_DIR / session_id
        if not sess_dir.exists():
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        sess_dir = sessions[session_id]["dir"]

    if category == "raw":
        target = sess_dir / filename
    elif category == "stems":
        target = sess_dir / "stems" / filename
    elif category == "slices":
        target = sess_dir / "slices" / filename
    elif category == "master":
        target = sess_dir / filename
    else:
        target = sess_dir / filename

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Audio file '{filename}' not found at {target}")

    return FileResponse(str(target), media_type="audio/wav")

@app.get("/api/export/{session_id}")
async def export_master(session_id: str):
    if session_id not in sessions or not sessions[session_id]["master_path"]:
        raise HTTPException(status_code=404, detail="No rendered master found for this session")

    master_path = sessions[session_id]["master_path"]
    return FileResponse(
        str(master_path),
        media_type="audio/wav",
        filename="serialaudio_master.wav"
    )

# --- Intermediate Products Download Endpoints ---

@app.get("/api/download/stem/{session_id}/{stem}")
async def download_single_stem(session_id: str, stem: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    stem_file = sess_dir / "stems" / f"{stem}.wav"
    if not stem_file.exists():
        raise HTTPException(status_code=404, detail=f"Stem '{stem}' not found")
    return FileResponse(
        str(stem_file),
        media_type="audio/wav",
        filename=f"{stem}_{session_id[:8]}.wav"
    )

@app.get("/api/download/stems-zip/{session_id}")
async def download_stems_zip(session_id: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    stems_dir = sess_dir / "stems"
    if not stems_dir.exists() or not any(stems_dir.glob("*.wav")):
        raise HTTPException(status_code=404, detail="No stems found in session")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem_file in sorted(stems_dir.glob("*.wav")):
            zf.write(stem_file, arcname=f"stems/{stem_file.name}")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="serialaudio_stems_{session_id[:8]}.zip"'}
    )

@app.get("/api/download/slices-zip/{session_id}")
async def download_slices_zip(session_id: str, stem: Optional[str] = None):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    slices_dir = sess_dir / "slices"
    if not slices_dir.exists():
        raise HTTPException(status_code=404, detail="No slices found in session")

    sess = sessions.get(session_id, {})
    slices_map = sess.get("slices", {})

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        csv_rows = ["id,stem,timestamp_start,duration,pitch_hz,pitch_semitone,spectral_centroid"]
        meta_dict = {}

        stem_dirs = [slices_dir / stem] if (stem and (slices_dir / stem).exists()) else sorted(slices_dir.iterdir())
        for sdir in stem_dirs:
            if not sdir.is_dir():
                continue
            stem_name = sdir.name
            meta_dict[stem_name] = []
            for wav_file in sorted(sdir.glob("*.wav")):
                zf.write(wav_file, arcname=f"slices/{stem_name}/{wav_file.name}")
                matching_slice = None
                if stem_name in slices_map:
                    matching_slice = next((s for s in slices_map[stem_name] if s.id == wav_file.stem), None)

                if matching_slice:
                    d = matching_slice.to_dict()
                    meta_dict[stem_name].append(d)
                    csv_rows.append(f"{d['id']},{d['stem_source']},{d['timestamp_start']:.3f},{d['duration']:.3f},{d['estimated_pitch_hz']:.1f},{d['pitch_semitone']:.1f},{d['spectral_centroid']:.1f}")
                else:
                    csv_rows.append(f"{wav_file.stem},{stem_name},0,0,0,0,0")

        zf.writestr("slices_metadata.json", json.dumps(meta_dict, indent=2))
        zf.writestr("slices_metadata.csv", "\n".join(csv_rows))

    buf.seek(0)
    zip_name = f"serialaudio_slices_{stem}_{session_id[:8]}.zip" if stem else f"serialaudio_all_slices_{session_id[:8]}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )

@app.get("/api/download/slices-meta/{session_id}")
async def download_slices_metadata(session_id: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sessions.get(session_id, {})
    slices_map = sess.get("slices", {})
    meta_dict = {
        k: [s.to_dict() for s in v]
        for k, v in slices_map.items()
    }
    content = json.dumps(meta_dict, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="slices_metadata_{session_id[:8]}.json"'}
    )

@app.get("/api/download/matrix-json/{session_id}/{stem}")
async def download_matrix_json(session_id: str, stem: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sessions.get(session_id, {})
    mat_obj = sess.get("matrices", {}).get(stem)
    if not mat_obj:
        if stem in sess.get("slices", {}) and sess["slices"][stem]:
            mat_obj = DodecaphonicMatrix(sess["slices"][stem])
        else:
            stem_file = sess_dir / "stems" / f"{stem}.wav"
            if stem_file.exists():
                detector = OnsetDetector()
                det = detector.detect_and_slice(stem_file, stem_source=stem)
                mat_obj = DodecaphonicMatrix(det)
            else:
                mat_obj = DodecaphonicMatrix([])
        sess.setdefault("matrices", {})[stem] = mat_obj

    meta = mat_obj.get_matrix_metadata()
    data = {
        "session_id": session_id,
        "stem": stem,
        "pitch_names": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        **meta
    }
    content = json.dumps(data, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="serial_matrix_{stem}_{session_id[:8]}.json"'}
    )

@app.get("/api/download/raw-mix/{session_id}")
async def download_raw_mix(session_id: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    sess = sessions.get(session_id, {})
    mix_path = sess.get("mix_path")
    if not mix_path or not Path(mix_path).exists():
        matches = list(sess_dir.glob("raw/*")) + list(sess_dir.glob("uploaded_mix*")) + list(sess_dir.glob("sebastians_dance*"))
        if matches:
            mix_path = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Raw mix not found")
    return FileResponse(
        str(mix_path),
        media_type="audio/wav",
        filename=Path(mix_path).name
    )

@app.get("/api/download/slice/{session_id}/{stem}/{slice_id}")
async def download_single_slice(session_id: str, stem: str, slice_id: str):
    sess_dir = CACHE_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    slice_path = sess_dir / "slices" / stem / f"{slice_id}.wav"
    if not slice_path.exists():
        raise HTTPException(status_code=404, detail=f"Slice '{slice_id}' not found")
    return FileResponse(
        str(slice_path),
        media_type="audio/wav",
        filename=f"{slice_id}.wav"
    )

# --- Save & Load Project Endpoints ---

class SaveProjectRequest(BaseModel):
    session_id: str
    project_name: Optional[str] = "SerialAudio_Project"
    ui_state: Optional[Dict] = None

@app.post("/api/project/save")
async def save_project(req: SaveProjectRequest):
    session_id = req.session_id
    if session_id not in sessions:
        sess_dir = CACHE_DIR / session_id
        if sess_dir.exists():
            get_or_create_session(session_id)
        else:
            raise HTTPException(status_code=404, detail="Session not found")

    sess = sessions[session_id]
    sess_dir = sess["dir"]

    # Gather slices metadata
    slices_meta = {}
    for stem_name, slist in sess.get("slices", {}).items():
        slices_meta[stem_name] = [s.to_dict() for s in slist]

    # Gather matrices metadata
    matrices_meta = {}
    for stem_name, mat in sess.get("matrices", {}).items():
        if mat:
            matrices_meta[stem_name] = mat.get_matrix_metadata()

    # Determine master path
    master_path_exists = sess.get("master_path") is not None and Path(sess["master_path"]).exists()

    project_manifest = {
        "format": "SerialAudio_Project_v1",
        "session_id": session_id,
        "project_name": req.project_name or "SerialAudio_Project",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "ui_state": req.ui_state or {},
        "slices_metadata": slices_meta,
        "matrices_metadata": matrices_meta,
        "has_master": master_path_exists,
        "stems_list": list(sess.get("stems", {}).keys())
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Project Manifest
        zf.writestr("project.json", json.dumps(project_manifest, indent=2))

        # 2. Raw / Demo mix if present
        raw_files = list(sess_dir.glob("raw/*")) + list(sess_dir.glob("uploaded_mix*")) + list(sess_dir.glob("sebastians_dance*"))
        if sess.get("mix_path") and Path(sess["mix_path"]).exists():
            p = Path(sess["mix_path"])
            zf.write(p, arcname=f"raw/{p.name}")
        elif raw_files:
            zf.write(raw_files[0], arcname=f"raw/{raw_files[0].name}")

        # 3. Stems
        stems_dir = sess_dir / "stems"
        if stems_dir.exists():
            for stem_f in sorted(stems_dir.glob("*.wav")):
                zf.write(stem_f, arcname=f"stems/{stem_f.name}")

        # 4. Slices
        slices_dir = sess_dir / "slices"
        if slices_dir.exists():
            for stem_sdir in sorted(slices_dir.iterdir()):
                if stem_sdir.is_dir():
                    for slice_f in sorted(stem_sdir.glob("*.wav")):
                        zf.write(slice_f, arcname=f"slices/{stem_sdir.name}/{slice_f.name}")

        # 5. Master Render if present
        if master_path_exists:
            mp = Path(sess["master_path"])
            zf.write(mp, arcname=f"master/{mp.name}")

    buf.seek(0)
    clean_name = "".join(c for c in (req.project_name or "SerialAudio_Project") if c.isalnum() or c in ('_', '-'))
    filename = f"{clean_name}.serialproj"
    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.post("/api/project/load")
async def load_project(file: UploadFile = File(...)):
    new_session_id = uuid.uuid4().hex
    new_dir = CACHE_DIR / new_session_id
    new_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    buf = io.BytesIO(content)

    try:
        with zipfile.ZipFile(buf, "r") as zf:
            zf.extractall(new_dir)
    except Exception as e:
        shutil.rmtree(new_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Invalid project file archive: {str(e)}")

    manifest_file = new_dir / "project.json"
    if not manifest_file.exists():
        shutil.rmtree(new_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Missing project.json in project archive")

    with open(manifest_file, "r") as f:
        manifest = json.load(f)

    # Reconstruct session in memory
    get_or_create_session(new_session_id)
    sess = sessions[new_session_id]

    # 1. Locate raw audio
    raw_candidates = list((new_dir / "raw").glob("*")) if (new_dir / "raw").exists() else []
    if raw_candidates:
        sess["mix_path"] = raw_candidates[0]
    else:
        raw_matches = list(new_dir.glob("uploaded_mix*")) + list(new_dir.glob("sebastians_dance*"))
        if raw_matches:
            sess["mix_path"] = raw_matches[0]

    # 2. Locate Stems
    stems_dir = new_dir / "stems"
    stems_map = {}
    stem_urls = {}
    if stems_dir.exists():
        for stem_f in sorted(stems_dir.glob("*.wav")):
            stem_name = stem_f.stem
            stems_map[stem_name] = stem_f
            stem_urls[stem_name] = f"/api/audio/{new_session_id}/stems/{stem_f.name}"
    sess["stems"] = stems_map

    # 3. Rebuild Slices
    slices_dir = new_dir / "slices"
    slices_by_stem: Dict[str, List[AudioSlice]] = {}
    slices_metadata_out: Dict[str, List[Dict]] = {}
    manifest_slices = manifest.get("slices_metadata", {})

    if slices_dir.exists():
        for stem_sdir in sorted(slices_dir.iterdir()):
            if stem_sdir.is_dir():
                stem_name = stem_sdir.name
                slices_by_stem[stem_name] = []
                slices_metadata_out[stem_name] = []
                meta_by_id = {m["id"]: m for m in manifest_slices.get(stem_name, [])}

                for slice_wav in sorted(stem_sdir.glob("*.wav")):
                    slice_id = slice_wav.stem
                    try:
                        data, sr = sf.read(str(slice_wav), dtype='float32')
                    except Exception:
                        data = np.zeros(4410, dtype=np.float32)

                    meta = meta_by_id.get(slice_id, {})
                    sl = AudioSlice(
                        id=slice_id,
                        stem_source=meta.get("stem_source", stem_name),
                        timestamp_start=meta.get("timestamp_start", 0.0),
                        duration=meta.get("duration", len(data) / 44100.0),
                        spectral_centroid=meta.get("spectral_centroid", 1000.0),
                        estimated_pitch_hz=meta.get("estimated_pitch_hz", 440.0),
                        pitch_semitone=meta.get("pitch_semitone", 60.0),
                        buffer=data
                    )
                    slices_by_stem[stem_name].append(sl)

                    out_meta = sl.to_dict()
                    out_meta["audio_url"] = f"/api/audio/{new_session_id}/slices/{stem_name}/{sl.id}.wav"
                    slices_metadata_out[stem_name].append(out_meta)

    sess["slices"] = slices_by_stem

    # 4. Rebuild Matrices
    for stem_name, slist in slices_by_stem.items():
        if slist:
            sess["matrices"][stem_name] = DodecaphonicMatrix(slist)

    # 5. Locate Master Render
    master_dir = new_dir / "master"
    master_render_res = None
    if master_dir.exists():
        master_files = list(master_dir.glob("*.wav"))
        if master_files:
            sess["master_path"] = master_files[0]
            master_render_res = {
                "master_url": f"/api/audio/{new_session_id}/master/{master_files[0].name}",
                "export_url": f"/api/export/{new_session_id}",
                "event_count": manifest.get("ui_state", {}).get("last_render_event_count", 0),
                "duration_sec": manifest.get("ui_state", {}).get("target_duration_sec", 15.0),
                "peak_amplitude": 0.95
            }

    # Active stem matrix metadata
    active_stem = manifest.get("ui_state", {}).get("active_stem_for_matrix", "other")
    if active_stem not in sess["matrices"] and slices_by_stem:
        active_stem = next(iter(slices_by_stem.keys()))

    mat_data = None
    if active_stem in sess["matrices"]:
        mat_data = {
            "session_id": new_session_id,
            "stem": active_stem,
            **sess["matrices"][active_stem].get_matrix_metadata()
        }
        for item in mat_data.get("prime_row", []):
            item["audio_url"] = f"/api/audio/{new_session_id}/slices/{active_stem}/{item['id']}.wav"

    return {
        "session_id": new_session_id,
        "project_name": manifest.get("project_name", file.filename or "Loaded_Project"),
        "created_at": manifest.get("created_at"),
        "stems": stem_urls,
        "slices": slices_metadata_out,
        "matrix": mat_data,
        "ui_state": manifest.get("ui_state", {}),
        "render_result": master_render_res
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
