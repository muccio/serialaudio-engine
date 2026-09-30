"""Tests for synthetic sample generator and Demucs stem separation pipeline."""
import os
import shutil
import tempfile
from pathlib import Path
import soundfile as sf
import pytest

from dsp.sample_generator import generate_sebastians_dance
from dsp.demucs_pipeline import DemucsPipeline

@pytest.fixture
def temp_session_dir():
    dirpath = tempfile.mkdtemp(prefix="serialaudio_test_")
    yield Path(dirpath)
    shutil.rmtree(dirpath, ignore_errors=True)

def test_generate_sebastians_dance(temp_session_dir):
    """Verify synthetic orchestral fixture generation simulating Menotti's Sebastian's Dance."""
    result = generate_sebastians_dance(temp_session_dir, duration_sec=4.0, sr=44100)
    
    assert "mix" in result
    assert result["mix"].exists()
    assert "stems" in result
    for stem_name in ["drums", "bass", "other", "vocals"]:
        assert stem_name in result["stems"]
        stem_path = result["stems"][stem_name]
        assert stem_path.exists()
        
        # Verify audio validity
        data, sr = sf.read(str(stem_path))
        assert sr == 44100
        assert len(data) == int(4.0 * 44100)
        assert data.ndim in [1, 2]

def test_demucs_pipeline_cache_and_structure(temp_session_dir):
    """Test Demucs separation pipeline session caching and stem dictionary."""
    pipeline = DemucsPipeline(session_cache_dir=temp_session_dir, model_name="htdemucs", use_mock_fallback=True)
    
    # Generate test audio
    audio_fixtures = generate_sebastians_dance(temp_session_dir / "fixtures", duration_sec=2.0, sr=44100)
    mix_path = audio_fixtures["mix"]
    
    progress_updates = []
    def on_progress(p: float, msg: str):
        progress_updates.append((p, msg))
        
    stems = pipeline.separate(mix_path, session_id="test_sess_01", progress_callback=on_progress)
    
    assert set(stems.keys()) == {"drums", "bass", "other", "vocals"}
    for stem, path in stems.items():
        assert Path(path).exists()
        info = sf.info(str(path))
        assert info.samplerate == 44100
        
    assert len(progress_updates) > 0
    assert progress_updates[-1][0] == 1.0  # Finished 100%
    
    # Test Cache Hit: calling again should return existing stems immediately
    stems_cached = pipeline.separate(mix_path, session_id="test_sess_01")
    assert stems_cached == stems
