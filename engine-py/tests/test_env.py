"""Environment and dependency import verification test."""
import pytest

def test_python_version():
    import sys
    assert sys.version_info >= (3, 11), f"Expected Python >= 3.11, got {sys.version}"

def test_torch_available():
    import torch
    assert torch.__version__ is not None
    # Verify device capability detection (MPS, CUDA, or CPU)
    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    assert device in ["mps", "cuda", "cpu"]

def test_dsp_libraries():
    import librosa
    import soundfile
    import scipy
    import numpy as np

    # Generate quick test buffer
    sr = 44100
    t = np.linspace(0, 0.1, int(sr * 0.1), endpoint=False)
    sine = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    assert len(sine) == 4410

def test_api_libraries():
    import fastapi
    import uvicorn
    import websockets
    import pydantic
    assert fastapi.__version__ is not None
