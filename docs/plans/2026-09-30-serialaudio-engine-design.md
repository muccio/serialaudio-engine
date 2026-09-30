# SerialAudio Engine — Architecture & Technical Design

**Date:** 2026-09-30  
**Status:** Approved  
**Author:** Senior Audio Software Engineer & Algorithmic Music Systems Architect  

---

## 1. System Overview

**SerialAudio Engine** is a hybrid algorithmic audio workstation that fuses Music Information Retrieval (MIR) transient extraction with 12-tone serial composition techniques mapped to digital signal processing (DSP).

### Tech Stack
- **Frontend / UI:** Tauri v2, React 18, TypeScript, Tailwind CSS, HTML5 Canvas 2D for high-performance waveform and timeline density visualization.
- **Backend / DSP Service:** Python 3.11 with FastAPI, WebSockets, PyTorch (`htdemucs`), Librosa, Soundfile, and Scipy/Pedalboard.
- **IPC & Process Management:** Tauri spawns or connects to the Python engine on `localhost:8000`. WebSocket provides bidirectional real-time progress streaming; REST endpoints handle structured file operations and audio downloads.

```
+--------------------------------------------------------------+
|                   Tauri v2 / React Frontend                  |
|  - File Upload & Separation Control                          |
|  - Multi-Track Waveform Viewer (Slices & Boundaries)         |
|  - 12x12 Serial Matrix Visualizer (P, R, I, RI rows)         |
|  - Interactive Density Envelope Automation Canvas            |
+------------------------------+-------------------------------+
                               |
                   REST / WebSocket IPC (ws://localhost:8000)
                               |
+------------------------------v-------------------------------+
|                    Python DSP Engine (engine-py)             |
|  +-------------------------+    +--------------------------+ |
|  |  Demucs 4-Stem Model    |    |  MIR Onset & Pitch       | |
|  |  (drums, bass, other,   |--->|  - Flux / HFC / Energy   | |
|  |   vocals) Session Cache |    |  - pYIN & Centroid Calc  | |
|  +-------------------------+    +------------+-------------+ |
|                                              |               |
|  +-------------------------------------------v-------------+ |
|  |  12-Tone Serial Audio Matrix & DSP Transformer          | |
|  |  - Prime (P), Retrograde (R), Inversion (I), RI         | |
|  |  - Pitch-Interval Mirroring & FFT Spectral Inversion    | |
|  +-------------------------------------------+-------------+ |
|                                              |               |
|  +-------------------------------------------v-------------+ |
|  |  Timeline Density Mixdown Generator                     | |
|  |  - Density Envelope (events/sec)                        | |
|  |  - Stem Weights & Stochastic/Serial Allocator           | |
|  |  - 24-bit 44.1/48kHz Master WAV Synthesis               | |
|  +---------------------------------------------------------+ |
+--------------------------------------------------------------+
```

---

## 2. Audio Processing & MIR Engine (`engine-py`)

### 2.1 Ingestion & Stem Separation
- **Model:** Demucs v4 (`htdemucs`) 4-stem model (drums, bass, other, vocals).
- **Execution:** PyTorch with auto-device fallback (`mps` on Apple Silicon, `cuda` on Nvidia, `cpu` otherwise).
- **Session Cache:** Persistent storage under `session_cache/{session_id}/stems/` with hash-based deduplication.
- **Test Ingestion:** Provides built-in generation of orchestral/chamber test stems simulating Menotti's "Sebastian's Dance" (rhythmic strings, solo oboe/flute, bass ostinato, light percussion) for instantaneous end-to-end automated testing without network downloads.

### 2.2 Onset & Event Detection Engine
- **Algorithms:**
  - `spectral_flux`: Half-wave rectified spectral difference (`librosa.onset.onset_strength`).
  - `hfc`: High Frequency Content weighting emphasizing sharp transient attacks.
  - `energy`: RMS temporal energy envelope detector.
- **Parameters:**
  - `threshold` / `sensitivity`: Adaptive peak pick thresholding (`librosa.util.peak_pick`).
  - `min_event_duration_ms` (e.g. 50ms) & `max_event_duration_ms` (e.g. 2000ms).
  - `crossfade_envelope_ms` (e.g. 5ms): Raised-cosine (Hann) ramp at onset and offset to eliminate zero-crossing clicks.
- **Metadata Output:**
  ```json
  {
    "id": "slice_001",
    "stem": "other",
    "timestamp_start": 1.240,
    "duration": 0.420,
    "spectral_centroid": 1420.5,
    "estimated_pitch_hz": 440.0,
    "pitch_semitone": 69.0,
    "audio_path": "slices/slice_001.wav"
  }
  ```
- **Pitch Estimation:** `librosa.pyin` for harmonic stems (`vocals`, `bass`, `other`); fallback to `spectral_centroid` for inharmonic/percussive stems (`drums`).

### 2.3 Dodecaphonic Audio Transformation Engine
- **Row Construction:** Groups detected slices into ordered 12-event rows ($S = \{s_0, s_1, \dots, s_{11}\}$).
- **Transformations:**
  - **P (Prime):** Sequential forward playback of slices $s_0 \to s_{11}$.
  - **R (Retrograde):** Reverses sequence order $s_{11} \to s_0$, with configurable slice buffer reversal ($x_i[-t]$).
  - **I (Inversion):**
    - Pitch interval mirroring around the row's pitch centroid $C = \frac{1}{12}\sum semitones$:
      $$\Delta st_i = semitone(s_i) - C \implies semitone_{inv}(s_i) = C - \Delta st_i$$
      Audio buffer is pitch-shifted by $-2 \cdot \Delta st_i$ semitones using high-quality phase-vocoder / time-domain pitch shift (`librosa.effects.pitch_shift` or `pedalboard`).
    - Inharmonic transient mode (e.g. drums): Spectral band inversion via Short-Time Fourier Transform:
      $$X_{inv}[k, m] = X[K - 1 - k, m]$$
      with Griffin-Lim or conjugate phase reconstruction to invert low and high spectral energy.
  - **RI (Retrograde Inversion):** Conjugate transformation applying Inversion to the Retrograded row.
- **Serial Matrix:** Computes the complete $12 \times 12$ matrix of forms ($P_0 \dots P_{11}$, $R_0 \dots R_{11}$, $I_0 \dots I_{11}$, $RI_0 \dots RI_{11}$).

### 2.4 Timeline & Mixdown Generator
- **Density Envelope:** Continuous user automation curve defining events per second $\lambda(t)$ over the timeline duration (e.g. 10s to 120s).
- **Stochastic / Serial Scheduler:** Allocates serial row events over time following the density curve $\lambda(t)$ with stem weighting probabilities ($w_{drums}, w_{bass}, w_{other}, w_{vocals}$).
- **Mixdown Renderer:**
  - Multi-track buffer accumulator with overlap-add.
  - Formats: 44.1 kHz / 48 kHz, 24-bit PCM WAV.
  - Soft-knee limiter / normalizer to prevent digital clipping.

---

## 3. Frontend Architecture (`src-ui` & `src-tauri`)

### 3.1 UI Component Hierarchy
1. **Header / Control Bar:** Session status, audio input selection, sample rate selector (44.1k/48k), Play / Stop, and Export Master button.
2. **Ingestion & Separation Panel:** Drag-and-drop file upload, progress bar with Demucs status, and preset loader ("Sebastian's Dance" demo).
3. **Multi-Track Waveform Viewer:**
   - 4-lane Canvas rendering waveforms for Drums, Bass, Other, Vocals.
   - Interactive transient slicing boundary markers.
   - Click-to-audition slice behavior.
4. **12-Tone Serial Matrix Panel:**
   - $12 \times 12$ matrix grid representing all pitch/slice permutations.
   - Quick selection buttons: $P_n, R_n, I_n, RI_n$.
   - Live transformation inspector showing interval shifts and spectral modifications.
5. **Timeline & Density Curve Canvas:**
   - Interactive Bézier / multi-point density automation graph (events/sec vs. time).
   - Stem balance weight sliders.
   - Master playback waveform with progress playhead.

---

## 4. Repository Structure

```
.
├── Cargo.toml / tauri.conf.json  # Tauri v2 configuration
├── src-tauri/                    # Rust native window wrapper & process supervisor
│   ├── src/main.rs
│   └── Cargo.toml
├── src-ui/                       # React 18 + TypeScript + Tailwind
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── components/           # WaveformViewer, SerialMatrix, TimelineCanvas, etc.
│       ├── services/             # WebSocket and REST client
│       └── App.tsx
├── engine-py/                    # Python 3.11 DSP Engine
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── main.py                   # FastAPI + WebSocket server
│   ├── dsp/
│   │   ├── demucs_pipeline.py    # Demucs separation runner
│   │   ├── onset_detector.py     # Librosa MIR transient & pitch analysis
│   │   ├── serial_matrix.py      # Dodecaphonic matrix & audio DSP transforms
│   │   ├── timeline_renderer.py  # Density scheduler & 24-bit WAV mixdown
│   │   └── sample_generator.py   # Test audio fixture generator (Sebastian's Dance)
│   └── tests/
│       └── test_dsp_pipeline.py
├── run.sh                        # Unified setup and launch script
└── docs/plans/
    ├── task.md
    └── 2026-09-30-serialaudio-engine-design.md
```

---

## 5. Verification & Testing Strategy

1. **Python DSP Pipeline Unit Tests:**
   - Test synthetic test audio generation (Sebastian's Dance orchestral motifs).
   - Test Demucs pipeline mock/fallback and real separation hooks.
   - Test onset detection algorithms across `spectral_flux`, `hfc`, and `energy`.
   - Test 12-tone matrix generation and audio transformations ($P, R, I, RI$).
   - Test timeline mixdown rendering to 24-bit WAV.
2. **FastAPI & WebSocket Integration Test:**
   - Validate REST endpoints (`/health`, `/upload`, `/separate`, `/slice`, `/matrix`, `/render`).
   - Validate WebSocket event broadcasting.
3. **Frontend Build Verification:**
   - Verify TypeScript compilation and Vite build (`npm run build`).
4. **Unified Launcher (`run.sh` / `Makefile`):**
   - Automatically configure virtualenv, install dependencies, and start engine & UI.
