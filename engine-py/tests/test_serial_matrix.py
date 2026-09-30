"""Tests for Dodecaphonic Serial Matrix and Audio DSP transformations."""
import numpy as np
import pytest
from dsp.onset_detector import AudioSlice
from dsp.serial_matrix import SerialRowTransformer, DodecaphonicMatrix

@pytest.fixture
def twelve_sample_slices():
    slices = []
    sr = 44100
    # Create 12 distinct chromatic pitch slices (C4 to B4: MIDI 60 to 71)
    for i in range(12):
        midi = 60 + i
        freq = 440.0 * (2.0 ** ((midi - 69) / 12.0))
        t = np.linspace(0, 0.2, int(sr * 0.2), endpoint=False)
        buf = 0.5 * np.sin(2 * np.pi * freq * t).astype(np.float32)
        
        sl = AudioSlice(
            id=f"slice_{i:02d}",
            stem_source="other" if i % 2 == 0 else "drums",
            timestamp_start=i * 0.2,
            duration=0.2,
            spectral_centroid=freq * 2.0,
            estimated_pitch_hz=freq,
            pitch_semitone=float(midi),
            buffer=buf
        )
        slices.append(sl)
    return slices

def test_serial_matrix_calculation(twelve_sample_slices):
    matrix_engine = DodecaphonicMatrix(twelve_sample_slices)
    matrix = matrix_engine.compute_matrix()
    
    assert matrix.shape == (12, 12)
    # Row 0 must be P0
    p0 = matrix_engine.get_row("P", 0)
    assert len(p0) == 12
    assert [s.pitch_semitone % 12 for s in p0] == [int(twelve_sample_slices[i].pitch_semitone % 12) for i in range(12)]
    
    # Retrograde row 0
    r0 = matrix_engine.get_row("R", 0)
    assert [s.id for s in r0] == [s.id for s in reversed(p0)]
    
    # Inversion row 0
    i0 = matrix_engine.get_row("I", 0)
    assert len(i0) == 12
    assert i0[0].id == p0[0].id

def test_serial_dsp_transforms(twelve_sample_slices):
    transformer = SerialRowTransformer(sr=44100)
    
    # 1. Prime (P)
    p_audio = transformer.render_row(twelve_sample_slices, form="P", reverse_buffers=False)
    assert len(p_audio) > 0
    assert not np.all(p_audio == 0)
    
    # 2. Retrograde (R) with buffer reversal
    r_audio = transformer.render_row(twelve_sample_slices, form="R", reverse_buffers=True)
    assert len(r_audio) == len(p_audio)
    
    # 3. Inversion (I)
    i_audio = transformer.render_row(twelve_sample_slices, form="I")
    assert len(i_audio) == len(p_audio)
    
    # 4. Retrograde Inversion (RI)
    ri_audio = transformer.render_row(twelve_sample_slices, form="RI")
    assert len(ri_audio) == len(p_audio)

def test_spectral_inversion_inharmonic():
    transformer = SerialRowTransformer(sr=44100)
    # White noise transient
    sr = 44100
    noise = np.random.uniform(-0.5, 0.5, int(sr * 0.1)).astype(np.float32)
    sl = AudioSlice(
        id="drum_transient",
        stem_source="drums",
        timestamp_start=0.0,
        duration=0.1,
        spectral_centroid=5000.0,
        estimated_pitch_hz=0.0,
        pitch_semitone=0.0,
        buffer=noise
    )
    inv_slice = transformer.invert_slice(sl, centroid_semitone=60.0)
    assert len(inv_slice.buffer) == len(noise)
    assert not np.all(inv_slice.buffer == 0)
