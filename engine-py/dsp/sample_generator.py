"""Synthetic audio generator for testing, simulating Menotti's 'Sebastian's Dance' orchestral motifs."""
from pathlib import Path
from typing import Dict, Union
import numpy as np
import soundfile as sf

def _envelope_pluck(length: int, decay: float = 8.0) -> np.ndarray:
    t = np.linspace(0, 1, length, endpoint=False)
    return np.exp(-decay * t)

def _generate_drums(total_samples: int, sr: int) -> np.ndarray:
    """Generate rhythmic chamber percussion (snare rimshots, woodblocks, tympani thuds)."""
    audio = np.zeros(total_samples, dtype=np.float32)
    # Allegro vivace (~144 BPM) -> beat interval ~ 0.416s
    beat_samples = int(sr * 60.0 / 144.0)
    
    # Tympani/Kick thud on beats 0, 2
    for b in range(0, total_samples, beat_samples * 2):
        hit_len = min(int(sr * 0.15), total_samples - b)
        if hit_len > 0:
            t = np.linspace(0, hit_len / sr, hit_len, endpoint=False)
            freq_env = 120.0 * np.exp(-15.0 * t) + 45.0
            thud = np.sin(2 * np.pi * freq_env * t) * np.exp(-12.0 * t)
            audio[b:b + hit_len] += 0.7 * thud.astype(np.float32)
            
    # Sharp transient clicks / woodblock on 8th notes
    half_beat = beat_samples // 2
    for b in range(0, total_samples, half_beat):
        hit_len = min(int(sr * 0.05), total_samples - b)
        if hit_len > 0:
            noise = np.random.uniform(-1.0, 1.0, hit_len).astype(np.float32)
            t = np.linspace(0, hit_len / sr, hit_len, endpoint=False)
            click = noise * np.exp(-60.0 * t) * np.sin(2 * np.pi * 1800.0 * t)
            audio[b:b + hit_len] += 0.45 * click.astype(np.float32)
            
    return np.clip(audio, -1.0, 1.0)

def _generate_bass(total_samples: int, sr: int) -> np.ndarray:
    """Generate pizzicato/marcato cello & contrabass ostinato (Menotti modal dance theme)."""
    audio = np.zeros(total_samples, dtype=np.float32)
    beat_samples = int(sr * 60.0 / 144.0)
    # Motive pitches in Hz: D2 (73.4), F2 (87.3), G2 (98.0), A2 (110.0), C3 (130.8)
    pitches = [73.42, 87.31, 98.00, 110.00, 98.00, 87.31, 73.42, 65.41]
    
    step = 0
    for b in range(0, total_samples, beat_samples):
        pitch = pitches[step % len(pitches)]
        step += 1
        note_len = min(int(sr * 0.35), total_samples - b)
        if note_len > 0:
            t = np.linspace(0, note_len / sr, note_len, endpoint=False)
            env = np.exp(-9.0 * t)
            # Rich sawtooth-like cello body
            wave = (np.sin(2 * np.pi * pitch * t) + 
                    0.5 * np.sin(2 * np.pi * pitch * 2 * t) + 
                    0.25 * np.sin(2 * np.pi * pitch * 3 * t))
            audio[b:b + note_len] += (0.65 * wave * env).astype(np.float32)
            
    return np.clip(audio, -1.0, 1.0)

def _generate_other(total_samples: int, sr: int) -> np.ndarray:
    """Generate syncopated string chord swells and brass accents."""
    audio = np.zeros(total_samples, dtype=np.float32)
    beat_samples = int(sr * 60.0 / 144.0)
    # Chord triads (D minor, F major, G minor, A minor)
    chords = [
        [220.0, 261.63, 329.63], # A3, C4, E4
        [174.61, 220.0, 261.63], # F3, A3, C4
        [196.00, 246.94, 293.66], # G3, B3, D4
        [220.00, 277.18, 329.63], # A3, C#4, E4
    ]
    
    measure_samples = beat_samples * 4
    for m in range(0, total_samples, measure_samples):
        chord = chords[(m // measure_samples) % len(chords)]
        chord_len = min(measure_samples, total_samples - m)
        if chord_len > 0:
            t = np.linspace(0, chord_len / sr, chord_len, endpoint=False)
            # Bowed envelope with attack
            attack_len = min(int(sr * 0.1), chord_len)
            decay_len = min(int(sr * 0.2), chord_len)
            env = np.ones(chord_len, dtype=np.float32)
            if attack_len > 0:
                env[:attack_len] = np.linspace(0, 1, attack_len)
            if decay_len > 0:
                env[-decay_len:] = np.linspace(1, 0, decay_len)
                
            wave = np.zeros(chord_len, dtype=np.float32)
            for f in chord:
                wave += np.sin(2 * np.pi * f * t + 0.05 * np.sin(2 * np.pi * 5.0 * t)).astype(np.float32)
            audio[m:m + chord_len] += (0.25 * wave * env).astype(np.float32)
            
    return np.clip(audio, -1.0, 1.0)

def _generate_vocals(total_samples: int, sr: int) -> np.ndarray:
    """Generate expressive solo woodwind / melodic voice (vocal-range lead line)."""
    audio = np.zeros(total_samples, dtype=np.float32)
    beat_samples = int(sr * 60.0 / 144.0)
    # Lyrical dramatic melody line: D4, E4, F4, G4, A4, Bb4, A4, F4, D4
    melody = [293.66, 329.63, 349.23, 392.00, 440.00, 466.16, 440.00, 349.23, 293.66]
    
    time_cursor = 0
    for idx, pitch in enumerate(melody):
        if time_cursor >= total_samples:
            break
        duration_beats = 2 if idx % 3 == 0 else 1
        note_len = min(int(beat_samples * duration_beats), total_samples - time_cursor)
        if note_len > 0:
            t = np.linspace(0, note_len / sr, note_len, endpoint=False)
            # 5 Hz vibrato
            vibrato = 1.0 + 0.015 * np.sin(2 * np.pi * 5.5 * t)
            phase = np.cumsum(2 * np.pi * pitch * vibrato / sr)
            # Flute/voice timbre: strong fundamental + subtle second harmonic
            wave = np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)
            
            # Smooth envelope
            env = np.sin(np.pi * np.linspace(0, 1, note_len)) ** 0.5
            audio[time_cursor:time_cursor + note_len] += (0.5 * wave * env).astype(np.float32)
            time_cursor += note_len
            
    return np.clip(audio, -1.0, 1.0)

def generate_sebastians_dance(
    output_dir: Union[str, Path], 
    duration_sec: float = 8.0, 
    sr: int = 44100
) -> Dict[str, Union[Path, Dict[str, Path]]]:
    """
    Generate synthetic orchestral audio stems simulating Menotti's 'Sebastian's Dance'.
    Returns paths to the mix audio and the 4 isolated stems (drums, bass, other, vocals).
    """
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    stems_dir = out_path / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    
    total_samples = int(duration_sec * sr)
    
    drums = _generate_drums(total_samples, sr)
    bass = _generate_bass(total_samples, sr)
    other = _generate_other(total_samples, sr)
    vocals = _generate_vocals(total_samples, sr)
    
    # Save individual stems
    stem_paths = {
        "drums": stems_dir / "drums.wav",
        "bass": stems_dir / "bass.wav",
        "other": stems_dir / "other.wav",
        "vocals": stems_dir / "vocals.wav"
    }
    
    sf.write(str(stem_paths["drums"]), drums, sr, subtype="PCM_24")
    sf.write(str(stem_paths["bass"]), bass, sr, subtype="PCM_24")
    sf.write(str(stem_paths["other"]), other, sr, subtype="PCM_24")
    sf.write(str(stem_paths["vocals"]), vocals, sr, subtype="PCM_24")
    
    # Master mixdown
    mix = 0.35 * drums + 0.4 * bass + 0.3 * other + 0.45 * vocals
    mix = np.clip(mix, -0.98, 0.98)
    mix_path = out_path / "sebastians_dance_mix.wav"
    sf.write(str(mix_path), mix, sr, subtype="PCM_24")
    
    return {
        "mix": mix_path,
        "stems": stem_paths
    }
