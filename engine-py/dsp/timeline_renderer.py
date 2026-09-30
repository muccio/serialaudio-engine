"""Timeline density scheduler & 24-bit WAV mixdown synthesis engine."""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple, Union
import numpy as np
import soundfile as sf

from dsp.onset_detector import AudioSlice
from dsp.serial_matrix import DodecaphonicMatrix, SerialRowTransformer, TransformationType

@dataclass
class DensityPoint:
    time: float
    events_per_sec: float

@dataclass
class TimelineConfig:
    target_duration_sec: float = 20.0
    density_curve: List[DensityPoint] = field(default_factory=lambda: [
        DensityPoint(time=0.0, events_per_sec=2.0),
        DensityPoint(time=10.0, events_per_sec=8.0),
        DensityPoint(time=20.0, events_per_sec=3.0)
    ])
    stem_weights: Dict[str, float] = field(default_factory=lambda: {
        "drums": 0.3,
        "bass": 0.25,
        "other": 0.25,
        "vocals": 0.2
    })
    active_form: TransformationType = "P"
    active_matrix_row: int = 0
    reverse_buffers: bool = False
    crossfade_ms: float = 8.0

class TimelineRenderer:
    def __init__(self, sr: int = 44100, bit_depth: str = "PCM_24"):
        self.sr = sr
        self.bit_depth = bit_depth
        self.transformer = SerialRowTransformer(sr=sr)

    def _interpolate_density(self, t: float, curve: List[DensityPoint]) -> float:
        """Piecewise linear interpolation of density curve."""
        if not curve:
            return 2.0
        sorted_points = sorted(curve, key=lambda p: p.time)
        if t <= sorted_points[0].time:
            return max(0.2, sorted_points[0].events_per_sec)
        if t >= sorted_points[-1].time:
            return max(0.2, sorted_points[-1].events_per_sec)

        for i in range(len(sorted_points) - 1):
            p1, p2 = sorted_points[i], sorted_points[i + 1]
            if p1.time <= t <= p2.time:
                span = p2.time - p1.time
                if span < 1e-6:
                    return max(0.2, p1.events_per_sec)
                alpha = (t - p1.time) / span
                val = p1.events_per_sec + alpha * (p2.events_per_sec - p1.events_per_sec)
                return max(0.2, float(val))
        return 2.0

    def generate_event_timestamps(
        self,
        duration_sec: float,
        curve: List[DensityPoint],
        jitter: float = 0.15
    ) -> List[float]:
        """
        Generate event trigger times using cumulative rate integration.
        """
        timestamps = []
        t = 0.05  # slight initial offset
        
        while t < duration_sec - 0.05:
            timestamps.append(t)
            density = self._interpolate_density(t, curve)
            # Base interval in seconds
            dt_base = 1.0 / density
            # Apply slight humanization/stochastic jitter
            if jitter > 0:
                rand_factor = np.random.uniform(1.0 - jitter, 1.0 + jitter)
                dt = dt_base * rand_factor
            else:
                dt = dt_base
            t += max(0.04, dt)  # at least 40ms interval

        return timestamps

    def render(
        self,
        slices_by_stem: Dict[str, List[AudioSlice]],
        config: TimelineConfig,
        output_filepath: Union[str, Path]
    ) -> Dict:
        """
        Render multi-track timeline mixdown to 24-bit WAV file.
        """
        out_path = Path(output_filepath)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        total_samples = int(config.target_duration_sec * self.sr)
        # Stereo output buffer: [samples, 2]
        master_buffer = np.zeros((total_samples, 2), dtype=np.float32)

        # Prepare transformed 12-tone rows per stem
        matrices = {}
        transformed_rows: Dict[str, List[AudioSlice]] = {}
        row_indices: Dict[str, int] = {}

        for stem, stem_slices in slices_by_stem.items():
            if stem_slices:
                mat = DodecaphonicMatrix(stem_slices)
                matrices[stem] = mat
                row = mat.get_row(config.active_form, config.active_matrix_row)
                transformed_rows[stem] = self.transformer.transform_row(
                    row,
                    form=config.active_form,
                    reverse_buffers=config.reverse_buffers
                )
                row_indices[stem] = 0

        if not transformed_rows:
            # Silence
            sf.write(str(out_path), master_buffer, self.sr, subtype=self.bit_depth)
            return {
                "event_count": 0,
                "duration_sec": config.target_duration_sec,
                "peak_amplitude": 0.0,
                "output_filepath": str(out_path)
            }

        # Normalize stem weights
        stems_available = list(transformed_rows.keys())
        raw_weights = np.array([max(0.0, config.stem_weights.get(s, 0.25)) for s in stems_available], dtype=float)
        if raw_weights.sum() > 0:
            probs = raw_weights / raw_weights.sum()
        else:
            probs = np.ones(len(stems_available)) / len(stems_available)

        # Generate event schedule
        timestamps = self.generate_event_timestamps(config.target_duration_sec, config.density_curve)

        event_count = 0
        pan_positions = {
            "drums": 0.0,      # Center
            "bass": 0.0,       # Center
            "other": -0.4,     # Left-mid
            "vocals": 0.35     # Right-mid
        }

        for t_sec in timestamps:
            chosen_stem = np.random.choice(stems_available, p=probs)
            row = transformed_rows[chosen_stem]
            curr_idx = row_indices[chosen_stem]
            slice_item = row[curr_idx]
            row_indices[chosen_stem] = (curr_idx + 1) % len(row)

            buf = slice_item.buffer
            if len(buf) == 0:
                continue

            # Convert to stereo
            if buf.ndim == 1:
                slice_stereo = np.column_stack([buf, buf])
            else:
                slice_stereo = buf[:, :2] if buf.shape[1] >= 2 else np.column_stack([buf[:, 0], buf[:, 0]])

            # Apply pan law (equal power)
            pan = pan_positions.get(chosen_stem, 0.0)
            theta = (pan + 1.0) * (np.pi / 4.0)
            left_gain = float(np.cos(theta))
            right_gain = float(np.sin(theta))
            slice_stereo[:, 0] *= left_gain
            slice_stereo[:, 1] *= right_gain

            start_sample = int(t_sec * self.sr)
            end_sample = min(total_samples, start_sample + len(slice_stereo))
            event_len = end_sample - start_sample

            if event_len > 0:
                master_buffer[start_sample:end_sample] += slice_stereo[:event_len]
                event_count += 1

        # Soft limiter & Peak normalization
        peak = float(np.max(np.abs(master_buffer)))
        if peak > 0.0:
            if peak > 0.95:
                # Soft knee compression / peak limiter
                scale = 0.95 / peak
                master_buffer *= scale
            peak_final = float(np.max(np.abs(master_buffer)))
        else:
            peak_final = 0.0

        # Export 24-bit WAV master
        sf.write(str(out_path), master_buffer, self.sr, subtype=self.bit_depth)

        return {
            "event_count": event_count,
            "duration_sec": round(total_samples / self.sr, 2),
            "peak_amplitude": round(peak_final, 4),
            "output_filepath": str(out_path)
        }
