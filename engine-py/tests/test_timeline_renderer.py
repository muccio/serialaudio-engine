"""Tests for Density Timeline Mixdown Generator."""
import numpy as np
import pytest
import soundfile as sf
import tempfile
from pathlib import Path

from dsp.onset_detector import AudioSlice
from dsp.serial_matrix import DodecaphonicMatrix
from dsp.timeline_renderer import TimelineRenderer, DensityPoint, TimelineConfig

@pytest.fixture
def stem_slices():
    slices_by_stem = {"drums": [], "bass": [], "other": [], "vocals": []}
    sr = 44100
    for stem in slices_by_stem.keys():
        for i in range(12):
            midi = 50 + i * 2
            freq = 440.0 * (2.0 ** ((midi - 69) / 12.0))
            t = np.linspace(0, 0.15, int(sr * 0.15), endpoint=False)
            buf = (0.4 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
            sl = AudioSlice(
                id=f"{stem}_{i:02d}",
                stem_source=stem,
                timestamp_start=i * 0.15,
                duration=0.15,
                spectral_centroid=freq * 2.0,
                estimated_pitch_hz=freq,
                pitch_semitone=float(midi),
                buffer=buf
            )
            slices_by_stem[stem].append(sl)
    return slices_by_stem

def test_timeline_renderer_synthesis(stem_slices):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out_wav = Path(f.name)

    renderer = TimelineRenderer(sr=44100, bit_depth="PCM_24")
    
    config = TimelineConfig(
        target_duration_sec=3.0,
        density_curve=[
            DensityPoint(time=0.0, events_per_sec=3.0),
            DensityPoint(time=1.5, events_per_sec=10.0),
            DensityPoint(time=3.0, events_per_sec=2.0)
        ],
        stem_weights={"drums": 0.4, "bass": 0.3, "other": 0.2, "vocals": 0.1},
        active_form="P",
        active_matrix_row=0,
        reverse_buffers=False
    )
    
    result = renderer.render(
        slices_by_stem=stem_slices,
        config=config,
        output_filepath=out_wav
    )
    
    assert out_wav.exists()
    info = sf.info(str(out_wav))
    assert info.samplerate == 44100
    assert info.subtype == "PCM_24"
    assert abs(info.duration - 3.0) < 0.25
    assert result["event_count"] >= 5
    assert result["peak_amplitude"] <= 1.0
    
    out_wav.unlink(missing_ok=True)
