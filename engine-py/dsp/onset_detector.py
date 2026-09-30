"""MIR Onset and Event Detection Engine."""
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Union
import numpy as np
import soundfile as sf
import librosa

@dataclass
class AudioSlice:
    id: str
    stem_source: str
    timestamp_start: float
    duration: float
    spectral_centroid: float
    estimated_pitch_hz: float
    pitch_semitone: float
    buffer: np.ndarray
    audio_path: Optional[str] = None

    def to_dict(self) -> Dict:
        d = asdict(self)
        d.pop("buffer", None)  # Exclude raw numpy buffer from json serialization
        return d

class OnsetDetector:
    def __init__(
        self,
        method: str = "spectral_flux",
        threshold: float = 0.2,
        min_event_duration_ms: float = 50.0,
        max_event_duration_ms: float = 2000.0,
        crossfade_envelope_ms: float = 5.0,
        hop_length: int = 512,
        n_fft: int = 2048
    ):
        """
        method: 'spectral_flux' | 'hfc' | 'energy'
        threshold: peak picking sensitivity (0.05 to 1.0)
        min_event_duration_ms: minimum duration of an event slice
        max_event_duration_ms: maximum duration of an event slice
        crossfade_envelope_ms: ramp duration for anti-click Hann window
        """
        self.method = method
        self.threshold = threshold
        self.min_event_duration_ms = min_event_duration_ms
        self.max_event_duration_ms = max_event_duration_ms
        self.crossfade_envelope_ms = crossfade_envelope_ms
        self.hop_length = hop_length
        self.n_fft = n_fft

    def _compute_onset_strength(self, y: np.ndarray, sr: int) -> np.ndarray:
        if self.method == "spectral_flux":
            return librosa.onset.onset_strength(
                y=y, sr=sr, hop_length=self.hop_length, n_fft=self.n_fft
            )
        elif self.method == "hfc":
            # High Frequency Content: sum(k * |X[k]|)
            S = np.abs(librosa.stft(y, n_fft=self.n_fft, hop_length=self.hop_length))
            freq_weights = np.arange(S.shape[0])[:, np.newaxis]
            hfc = np.sum(freq_weights * S, axis=0)
            # Normalize to 0..1
            max_val = np.max(hfc) + 1e-8
            return (hfc / max_val).astype(np.float32)
        elif self.method == "energy":
            rms = librosa.feature.rms(y=y, hop_length=self.hop_length)[0]
            # First difference of energy envelope
            diff = np.diff(rms, prepend=rms[0])
            diff = np.maximum(0, diff)
            max_val = np.max(diff) + 1e-8
            return (diff / max_val).astype(np.float32)
        else:
            return librosa.onset.onset_strength(y=y, sr=sr, hop_length=self.hop_length)

    def _estimate_pitch(self, slice_audio: np.ndarray, sr: int) -> float:
        """Estimate fundamental frequency in Hz using pYIN or autocorrelation fallback."""
        if len(slice_audio) < 1024:
            return 0.0

        try:
            # Use librosa.pyin for robust f0 tracking
            f0, voiced_flag, _ = librosa.pyin(
                slice_audio,
                fmin=librosa.note_to_hz('C2'),
                fmax=librosa.note_to_hz('C7'),
                sr=sr,
                frame_length=min(1024, len(slice_audio)),
                hop_length=min(256, len(slice_audio) // 4)
            )
            voiced_f0 = f0[voiced_flag & ~np.isnan(f0)]
            if len(voiced_f0) > 0:
                return float(np.median(voiced_f0))
        except Exception:
            pass

        # Autocorrelation fallback
        try:
            corr = np.correlate(slice_audio, slice_audio, mode='full')
            corr = corr[len(corr) // 2:]
            # Search lag between 50 Hz and 1500 Hz
            min_lag = int(sr / 1500)
            max_lag = int(sr / 50)
            if max_lag < len(corr):
                peak_lag = min_lag + np.argmax(corr[min_lag:max_lag])
                if corr[peak_lag] > 0.3 * corr[0]:
                    return float(sr / peak_lag)
        except Exception:
            pass

        return 0.0

    def _apply_crossfade(self, buffer: np.ndarray, sr: int) -> np.ndarray:
        """Apply raised-cosine (Hann) ramp at onset and offset to eliminate clicks."""
        buf = buffer.copy()
        fade_samples = int(sr * (self.crossfade_envelope_ms / 1000.0))
        fade_samples = min(fade_samples, len(buf) // 4)
        if fade_samples > 2:
            ramp = 0.5 * (1.0 - np.cos(np.pi * np.linspace(0, 1, fade_samples, endpoint=False)))
            if buf.ndim == 1:
                buf[:fade_samples] *= ramp
                buf[-fade_samples:] *= ramp[::-1]
            else:
                buf[:fade_samples, :] *= ramp[:, np.newaxis]
                buf[-fade_samples:, :] *= ramp[::-1, np.newaxis]
        return buf

    def detect_and_slice(
        self,
        audio_input: Union[str, Path, np.ndarray],
        sr: int = 44100,
        stem_source: str = "mix",
        save_dir: Optional[Union[str, Path]] = None
    ) -> List[AudioSlice]:
        """
        Detect onsets and extract sliced events with MIR metadata.
        """
        if isinstance(audio_input, (str, Path)):
            y, sr = sf.read(str(audio_input))
            if y.ndim > 1:
                mono = y.mean(axis=1)
            else:
                mono = y
        else:
            if audio_input.ndim > 1:
                mono = audio_input.mean(axis=1)
            else:
                mono = audio_input
            y = audio_input

        total_duration = len(mono) / sr
        onset_env = self._compute_onset_strength(mono, sr)

        # Min wait samples between onsets
        min_wait_frames = max(1, int((self.min_event_duration_ms / 1000.0) * sr / self.hop_length))
        
        # Adaptive peak picking
        delta_val = max(0.01, self.threshold * (np.max(onset_env) - np.mean(onset_env)))
        peaks = librosa.util.peak_pick(
            onset_env,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=5,
            delta=float(delta_val),
            wait=min_wait_frames
        )

        onset_times = librosa.frames_to_time(peaks, sr=sr, hop_length=self.hop_length)

        # Ensure first slice starts at onset or 0.0 if there is sound
        if len(onset_times) == 0 or onset_times[0] > 0.1:
            # Check if there is initial energy
            if np.max(np.abs(mono[:int(sr * 0.1)])) > 0.05:
                onset_times = np.insert(onset_times, 0, 0.0)

        # Build slice boundaries
        slice_boundaries = []
        min_sec = self.min_event_duration_ms / 1000.0
        max_sec = self.max_event_duration_ms / 1000.0

        for i in range(len(onset_times)):
            t_start = float(onset_times[i])
            if i < len(onset_times) - 1:
                t_end = min(float(onset_times[i + 1]), t_start + max_sec)
            else:
                t_end = min(total_duration, t_start + max_sec)

            duration = t_end - t_start
            if duration >= min_sec:
                slice_boundaries.append((t_start, t_end))

        # If no slices found, fallback to fixed segmenting
        if not slice_boundaries and total_duration >= min_sec:
            slice_boundaries.append((0.0, min(total_duration, max_sec)))

        slices: List[AudioSlice] = []
        if save_dir:
            save_path = Path(save_dir)
            save_path.mkdir(parents=True, exist_ok=True)
        else:
            save_path = None

        for idx, (t_start, t_end) in enumerate(slice_boundaries):
            sample_start = int(t_start * sr)
            sample_end = min(len(y), int(t_end * sr))
            
            raw_buf = y[sample_start:sample_end]
            mono_buf = mono[sample_start:sample_end]
            if len(raw_buf) == 0:
                continue

            processed_buf = self._apply_crossfade(raw_buf, sr)

            # MIR feature extraction
            # 1. Spectral Centroid
            try:
                centroids = librosa.feature.spectral_centroid(y=mono_buf, sr=sr)
                centroid_val = float(np.mean(centroids))
            except Exception:
                centroid_val = 1000.0

            # 2. Pitch estimation
            pitch_hz = self._estimate_pitch(mono_buf, sr)
            if pitch_hz > 20.0:
                pitch_semitone = float(librosa.hz_to_midi(pitch_hz))
            else:
                pitch_semitone = 0.0

            slice_id = f"{stem_source}_{idx:04d}"
            audio_file_path = None
            if save_path:
                out_file = save_path / f"{slice_id}.wav"
                sf.write(str(out_file), processed_buf, sr, subtype="PCM_24")
                audio_file_path = str(out_file)

            slice_obj = AudioSlice(
                id=slice_id,
                stem_source=stem_source,
                timestamp_start=round(t_start, 4),
                duration=round(t_end - t_start, 4),
                spectral_centroid=round(centroid_val, 2),
                estimated_pitch_hz=round(pitch_hz, 2),
                pitch_semitone=round(pitch_semitone, 2),
                buffer=processed_buf,
                audio_path=audio_file_path
            )
            slices.append(slice_obj)

        return slices
