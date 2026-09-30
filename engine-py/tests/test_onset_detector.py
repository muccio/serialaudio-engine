"""Tests for MIR Onset and Event Detection Engine."""
import numpy as np
import pytest
import soundfile as sf
import tempfile
from pathlib import Path

from dsp.onset_detector import OnsetDetector, AudioSlice

@pytest.fixture
def test_audio_file():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        path = Path(f.name)
        
    sr = 44100
    duration = 2.0
    total_samples = int(duration * sr)
    audio = np.zeros(total_samples, dtype=np.float32)
    
    # Place 3 distinct transient bursts (at 0.2s, 0.8s, 1.4s)
    # Burst 1: 440 Hz (A4)
    t1 = np.linspace(0, 0.3, int(sr * 0.3), endpoint=False)
    burst1 = np.sin(2 * np.pi * 440.0 * t1) * np.exp(-10.0 * t1)
    audio[int(0.2 * sr):int(0.2 * sr) + len(burst1)] += burst1
    
    # Burst 2: 880 Hz (A5)
    t2 = np.linspace(0, 0.3, int(sr * 0.3), endpoint=False)
    burst2 = np.sin(2 * np.pi * 880.0 * t2) * np.exp(-10.0 * t2)
    audio[int(0.8 * sr):int(0.8 * sr) + len(burst2)] += burst2
    
    # Burst 3: 220 Hz (A3)
    t3 = np.linspace(0, 0.3, int(sr * 0.3), endpoint=False)
    burst3 = np.sin(2 * np.pi * 220.0 * t3) * np.exp(-10.0 * t3)
    audio[int(1.4 * sr):int(1.4 * sr) + len(burst3)] += burst3
    
    sf.write(str(path), audio, sr)
    yield path
    path.unlink(missing_ok=True)

def test_onset_detector_spectral_flux(test_audio_file):
    detector = OnsetDetector(
        method="spectral_flux",
        threshold=0.2,
        min_event_duration_ms=60.0,
        max_event_duration_ms=800.0,
        crossfade_envelope_ms=5.0
    )
    slices = detector.detect_and_slice(test_audio_file, stem_source="other")
    
    assert len(slices) >= 2
    for s in slices:
        assert isinstance(s, AudioSlice)
        assert s.stem_source == "other"
        assert s.timestamp_start >= 0.0
        assert 0.05 <= s.duration <= 0.85
        assert s.spectral_centroid > 0.0
        assert len(s.buffer) > 0

def test_onset_detector_methods(test_audio_file):
    for method in ["hfc", "energy", "spectral_flux"]:
        detector = OnsetDetector(method=method, threshold=0.2)
        slices = detector.detect_and_slice(test_audio_file, stem_source="drums")
        assert len(slices) > 0
        assert slices[0].stem_source == "drums"

def test_onset_detector_pitch_estimation(test_audio_file):
    detector = OnsetDetector(method="spectral_flux", threshold=0.15)
    slices = detector.detect_and_slice(test_audio_file, stem_source="vocals")
    
    # First slice starts around 0.2s with ~440 Hz
    first_slice = [s for s in slices if 0.15 <= s.timestamp_start <= 0.3]
    assert len(first_slice) > 0
    # Should have pitch estimation
    assert first_slice[0].estimated_pitch_hz > 0
    # ~440 Hz is MIDI 69
    assert abs(first_slice[0].pitch_semitone - 69.0) < 3.0
