"""Demucs stem separation pipeline with session caching and hardware acceleration."""
import logging
from pathlib import Path
from typing import Callable, Dict, Optional, Union
import numpy as np
import soundfile as sf
import torch

from dsp.sample_generator import generate_sebastians_dance

logger = logging.getLogger(__name__)

STEM_NAMES = ["drums", "bass", "other", "vocals"]

class DemucsPipeline:
    def __init__(
        self,
        session_cache_dir: Union[str, Path] = "session_cache",
        model_name: str = "htdemucs",
        device: Optional[str] = None,
        use_mock_fallback: bool = True
    ):
        self.session_cache_dir = Path(session_cache_dir)
        self.session_cache_dir.mkdir(parents=True, exist_ok=True)
        self.model_name = model_name
        self.use_mock_fallback = use_mock_fallback
        
        if device is None:
            if torch.backends.mps.is_available():
                self.device = "mps"
            elif torch.cuda.is_available():
                self.device = "cuda"
            else:
                self.device = "cpu"
        else:
            self.device = device
            
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from demucs.pretrained import get_model
                self._model = get_model(self.model_name)
                self._model.to(self.device)
            except Exception as e:
                logger.warning(f"Could not load Demucs model '{self.model_name}': {e}")
                if not self.use_mock_fallback:
                    raise
        return self._model

    def get_session_stem_paths(self, session_id: str) -> Dict[str, Path]:
        stems_dir = self.session_cache_dir / session_id / "stems"
        return {s: stems_dir / f"{s}.wav" for s in STEM_NAMES}

    def is_cached(self, session_id: str) -> bool:
        paths = self.get_session_stem_paths(session_id)
        return all(p.exists() and p.stat().st_size > 0 for p in paths.values())

    def separate(
        self,
        audio_path: Union[str, Path],
        session_id: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Path]:
        """
        Separate audio file into 4 stems: drums, bass, other, vocals.
        Uses session cache if stems are already present.
        """
        stem_paths = self.get_session_stem_paths(session_id)
        stems_dir = self.session_cache_dir / session_id / "stems"
        stems_dir.mkdir(parents=True, exist_ok=True)

        # Check Cache
        if self.is_cached(session_id):
            if progress_callback:
                progress_callback(1.0, "Loaded from session cache.")
            return stem_paths

        if progress_callback:
            progress_callback(0.1, f"Initializing separation on device: {self.device}...")

        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Source audio file not found: {audio_path}")

        # Attempt Demucs PyTorch separation
        model_loaded = False
        try:
            model = self._get_model()
            if model is not None:
                model_loaded = True
        except Exception:
            model_loaded = False

        if model_loaded:
            try:
                if progress_callback:
                    progress_callback(0.25, f"Reading audio for {self.model_name}...")
                import torchaudio
                from demucs.apply import apply_model

                wav, sr = torchaudio.load(str(audio_path))
                if wav.shape[0] == 1:
                    wav = wav.repeat(2, 1)  # Convert mono to stereo for Demucs
                elif wav.shape[0] > 2:
                    wav = wav[:2]

                # Resample if needed
                if sr != model.samplerate:
                    resampler = torchaudio.transforms.Resample(sr, model.samplerate)
                    wav = resampler(wav)
                    sr = model.samplerate

                if progress_callback:
                    progress_callback(0.5, "Running deep separation neural network...")

                # Apply Demucs model
                ref = wav.mean(0)
                wav = (wav - ref.mean()) / ref.std()
                sources = apply_model(model, wav[None], device=self.device, split=True)[0]
                sources = sources * ref.std() + ref.mean()

                # Model stem names
                src_names = model.sources
                for name, source_wav in zip(src_names, sources):
                    if name in stem_paths:
                        out_file = stem_paths[name]
                        # source_wav is [channels, samples]
                        audio_np = source_wav.cpu().numpy().T
                        sf.write(str(out_file), audio_np, sr, subtype="PCM_24")

                if progress_callback:
                    progress_callback(1.0, "Demucs separation complete.")
                return stem_paths
            except Exception as e:
                logger.warning(f"Demucs neural separation encountered error: {e}. Falling back to acoustic filter separation.")
                if not self.use_mock_fallback:
                    raise

        # Fallback acoustic separation (frequency band and transient decomposition)
        if progress_callback:
            progress_callback(0.4, "Running acoustic MIR stem decomposition...")

        data, sr = sf.read(str(audio_path))
        if data.ndim > 1:
            mono = data.mean(axis=1)
        else:
            mono = data

        total_samples = len(mono)
        
        # Spectral decomposition
        import scipy.signal as signal
        # Bass: Lowpass 180 Hz
        sos_bass = signal.butter(4, 180, 'lowpass', fs=sr, output='sos')
        bass = signal.sosfilt(sos_bass, mono)

        # Drums: Highpass 3500 Hz transients + Lowpass punch (80-120 Hz)
        sos_hp = signal.butter(4, 3500, 'highpass', fs=sr, output='sos')
        drums_high = signal.sosfilt(sos_hp, mono)
        drums = np.clip(drums_high + 0.3 * signal.sosfilt(signal.butter(4, 90, 'lowpass', fs=sr, output='sos'), mono), -1.0, 1.0)

        # Vocals: Mid-range bandpass 400 - 3200 Hz
        sos_vocals = signal.butter(4, [400, 3200], 'bandpass', fs=sr, output='sos')
        vocals = signal.sosfilt(sos_vocals, mono)

        # Other: Residual
        other = mono - (0.6 * bass + 0.5 * drums + 0.6 * vocals)
        other = np.clip(other, -1.0, 1.0)

        sf.write(str(stem_paths["drums"]), drums.astype(np.float32), sr, subtype="PCM_24")
        sf.write(str(stem_paths["bass"]), bass.astype(np.float32), sr, subtype="PCM_24")
        sf.write(str(stem_paths["other"]), other.astype(np.float32), sr, subtype="PCM_24")
        sf.write(str(stem_paths["vocals"]), vocals.astype(np.float32), sr, subtype="PCM_24")

        if progress_callback:
            progress_callback(1.0, "Stem separation complete.")

        return stem_paths
