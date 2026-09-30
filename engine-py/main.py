"""FastAPI & WebSocket IPC service for SerialAudio Engine."""
import asyncio
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, List, Literal, Optional, Union

import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
    if session_id not in sessions:
        sess_dir = CACHE_DIR / session_id
        sess_dir.mkdir(parents=True, exist_ok=True)
        sessions[session_id] = {
            "session_id": session_id,
            "dir": sess_dir,
            "mix_path": None,
            "stems": {},
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
        raise HTTPException(status_code=404, detail="Session not found")
        
    sess = sessions[session_id]
    stem = req.stem
    if stem not in sess["matrices"]:
        if stem in sess["slices"] and sess["slices"][stem]:
            sess["matrices"][stem] = DodecaphonicMatrix(sess["slices"][stem])
        else:
            raise HTTPException(status_code=400, detail=f"No slices available for stem '{stem}'")

    mat_obj: DodecaphonicMatrix = sess["matrices"][stem]
    meta = mat_obj.get_matrix_metadata()
    
    # Add audio_url to prime row
    for item in meta["prime_row"]:
        item["audio_url"] = f"/api/audio/{session_id}/slices/{stem}/{item['id']}.wav"
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
