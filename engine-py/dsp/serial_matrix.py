"""12-Tone Serial Matrix & Audio DSP Transformation Engine."""
from copy import deepcopy
from typing import Dict, List, Literal, Optional, Tuple, Union
import numpy as np
import librosa

from dsp.onset_detector import AudioSlice

TransformationType = Literal["P", "R", "I", "RI"]

class DodecaphonicMatrix:
    """Computes and manages the 12x12 dodecaphonic permutation matrix for audio slices."""
    
    def __init__(self, slices: List[AudioSlice]):
        if len(slices) < 12:
            # Pad with repeated slices or silence if less than 12
            needed = 12 - len(slices)
            padded = list(slices)
            for i in range(needed):
                clone = deepcopy(slices[i % len(slices)])
                clone.id = f"{clone.id}_pad{i}"
                padded.append(clone)
            self.prime_row = padded[:12]
        else:
            self.prime_row = list(slices[:12])
            
        # Calculate pitch classes (mod 12)
        self.pitch_classes = []
        for s in self.prime_row:
            if s.pitch_semitone > 0:
                pc = int(round(s.pitch_semitone)) % 12
            else:
                # Use spectral centroid as pitch class proxy if unpitched
                pc = int(round(librosa.hz_to_midi(max(50.0, s.spectral_centroid)))) % 12
            self.pitch_classes.append(pc)
            
        self.matrix = self._build_matrix()

    def _build_matrix(self) -> np.ndarray:
        """
        Build standard 12x12 Babbitt matrix.
        Row 0 is P0.
        Column 0 is I0.
        Cell (i, j) = (P0[j] - P0[0] + I0[i]) mod 12
        """
        p0 = np.array(self.pitch_classes, dtype=int)
        first_p = p0[0]
        # Inversion of P0: I0[j] = (2 * first_p - p0[j]) mod 12
        i0 = (2 * first_p - p0) % 12
        
        matrix = np.zeros((12, 12), dtype=int)
        for i in range(12):
            for j in range(12):
                matrix[i, j] = (p0[j] - first_p + i0[i]) % 12
                
        return matrix

    def compute_matrix(self) -> np.ndarray:
        return self.matrix

    def get_row(self, form: TransformationType, index: int) -> List[AudioSlice]:
        """
        Retrieve a 12-slice sequence corresponding to form ('P', 'R', 'I', 'RI') and index (0..11).
        Maps the matrix row permutation back to the corresponding audio slices.
        """
        idx = max(0, min(11, index))
        # Find which slices correspond to the pitch class sequence
        target_pcs = []
        if form == "P":
            target_pcs = list(self.matrix[idx, :])
        elif form == "R":
            target_pcs = list(self.matrix[idx, ::-1])
        elif form == "I":
            target_pcs = list(self.matrix[:, idx])
        elif form == "RI":
            target_pcs = list(self.matrix[::-1, idx])

        # Map each target pitch class to the closest available slice
        result: List[AudioSlice] = []
        used_indices = set()
        
        for pc in target_pcs:
            # Find best match from prime row
            best_i = None
            best_diff = 999
            for i, s_pc in enumerate(self.pitch_classes):
                diff = abs(s_pc - pc) % 12
                diff = min(diff, 12 - diff)
                if i not in used_indices and diff < best_diff:
                    best_diff = diff
                    best_i = i
            if best_i is None:
                # If all used, find overall closest
                best_i = int(np.argmin([abs(s_pc - pc) % 12 for s_pc in self.pitch_classes]))
            else:
                used_indices.add(best_i)

            chosen = deepcopy(self.prime_row[best_i])
            result.append(chosen)

        return result

    def get_matrix_metadata(self) -> Dict:
        """Returns JSON-serializable matrix metadata with pitch classes and slice labels."""
        return {
            "matrix": self.matrix.tolist(),
            "prime_row": [s.to_dict() for s in self.prime_row],
            "pitch_classes": self.pitch_classes
        }


class SerialRowTransformer:
    """Performs DSP audio buffer transformations: Prime, Retrograde, Inversion, Retrograde Inversion."""

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def invert_slice(self, slice_item: AudioSlice, centroid_semitone: float) -> AudioSlice:
        """
        Invert an individual slice:
        - If harmonic/pitched: pitch interval mirrored around centroid_semitone
          Delta_st = semitone - centroid -> shifted by -2 * Delta_st semitones.
        - If unpitched/inharmonic (e.g. drums): FFT spectral band inversion.
        """
        buf = slice_item.buffer.copy()
        inv_slice = deepcopy(slice_item)
        inv_slice.id = f"{slice_item.id}_inv"

        # Check if slice is harmonic
        if slice_item.estimated_pitch_hz > 50.0 and slice_item.pitch_semitone > 0:
            delta = slice_item.pitch_semitone - centroid_semitone
            shift_steps = -2.0 * delta
            # Constrain pitch shift to within +/- 24 semitones (2 octaves)
            shift_steps = float(np.clip(shift_steps, -24.0, 24.0))

            if abs(shift_steps) >= 0.25:
                try:
                    if buf.ndim == 1:
                        shifted = librosa.effects.pitch_shift(buf, sr=self.sr, n_steps=shift_steps)
                    else:
                        chans = [
                            librosa.effects.pitch_shift(buf[:, c], sr=self.sr, n_steps=shift_steps)
                            for c in range(buf.shape[1])
                        ]
                        shifted = np.stack(chans, axis=1)
                    inv_slice.buffer = shifted.astype(np.float32)
                    new_pitch = slice_item.pitch_semitone + shift_steps
                    inv_slice.pitch_semitone = float(round(new_pitch, 2))
                    inv_slice.estimated_pitch_hz = float(round(librosa.midi_to_hz(new_pitch), 2))
                    return inv_slice
                except Exception:
                    pass

        # Inharmonic / transient spectral band inversion via STFT
        try:
            is_stereo = (buf.ndim > 1 and buf.shape[1] > 1)
            audio_ch = buf[:, 0] if is_stereo else buf
            
            n_fft = min(2048, 1 << (len(audio_ch) - 1).bit_length())
            if n_fft < 256:
                inv_slice.buffer = buf
                return inv_slice
                
            hop_length = n_fft // 4
            D = librosa.stft(audio_ch, n_fft=n_fft, hop_length=hop_length)
            mag, phase = np.abs(D), np.angle(D)

            # Invert frequency bins (flip magnitude along frequency axis)
            mag_inv = np.flip(mag, axis=0)
            
            # Reconstruct complex spectrogram with phase
            D_inv = mag_inv * np.exp(1j * phase)
            inv_audio = librosa.istft(D_inv, hop_length=hop_length, length=len(audio_ch))

            if is_stereo:
                inv_slice.buffer = np.column_stack([inv_audio, inv_audio]).astype(np.float32)
            else:
                inv_slice.buffer = inv_audio.astype(np.float32)
                
            inv_slice.spectral_centroid = max(100.0, float(self.sr / 2.0 - slice_item.spectral_centroid))
            return inv_slice
        except Exception:
            inv_slice.buffer = buf
            return inv_slice

    def transform_row(
        self,
        slices: List[AudioSlice],
        form: TransformationType = "P",
        reverse_buffers: bool = False
    ) -> List[AudioSlice]:
        """
        Apply 12-tone transformation to a sequence of slices.
        - P: Prime (original sequence)
        - R: Retrograde (sequence reversed; optional audio buffer reverse)
        - I: Inversion (pitch interval mirroring & FFT spectral inversion)
        - RI: Retrograde Inversion (inversion then retrograde)
        """
        if not slices:
            return []

        # Calculate row pitch centroid
        valid_pitches = [s.pitch_semitone for s in slices if s.pitch_semitone > 0]
        if valid_pitches:
            centroid = float(np.mean(valid_pitches))
        else:
            centroid = 60.0  # Middle C fallback

        if form == "P":
            res = [deepcopy(s) for s in slices]

        elif form == "R":
            res = [deepcopy(s) for s in reversed(slices)]
            if reverse_buffers:
                for s in res:
                    s.buffer = np.ascontiguousarray(s.buffer[::-1])

        elif form == "I":
            res = [self.invert_slice(s, centroid) for s in slices]

        elif form == "RI":
            inv_slices = [self.invert_slice(s, centroid) for s in slices]
            res = list(reversed(inv_slices))
            if reverse_buffers:
                for s in res:
                    s.buffer = np.ascontiguousarray(s.buffer[::-1])
        else:
            res = [deepcopy(s) for s in slices]

        return res

    def render_row(
        self,
        slices: List[AudioSlice],
        form: TransformationType = "P",
        reverse_buffers: bool = False,
        crossfade_overlap_samples: int = 256
    ) -> np.ndarray:
        """
        Render transformed row sequence into a continuous audio buffer.
        """
        transformed = self.transform_row(slices, form=form, reverse_buffers=reverse_buffers)
        if not transformed:
            return np.zeros(0, dtype=np.float32)

        # Determine channels
        channels = 2 if any(s.buffer.ndim > 1 and s.buffer.shape[1] == 2 for s in transformed) else 1

        # Calculate total length with crossfades
        total_len = sum(len(s.buffer) for s in transformed)
        
        if channels == 1:
            out_buf = np.zeros(total_len, dtype=np.float32)
        else:
            out_buf = np.zeros((total_len, 2), dtype=np.float32)

        cursor = 0
        for s in transformed:
            buf = s.buffer
            if channels == 2 and buf.ndim == 1:
                buf = np.column_stack([buf, buf])
            elif channels == 1 and buf.ndim > 1:
                buf = buf.mean(axis=1)

            blen = len(buf)
            out_buf[cursor:cursor + blen] += buf
            cursor += blen

        # Normalize without clipping
        peak = np.max(np.abs(out_buf))
        if peak > 0.98:
            out_buf = (out_buf / peak) * 0.95

        return out_buf.astype(np.float32)
