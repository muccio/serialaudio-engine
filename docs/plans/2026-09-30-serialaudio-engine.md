# SerialAudio Engine Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build a complete hybrid algorithmic audio workstation that separates stems with Demucs, detects transient slices via MIR algorithms, transforms slices using 12-tone serial DSP operations (P, R, I, RI), and synthesizes a master mixdown driven by interactive density curves.

**Architecture:** Decoupled Tauri v2 desktop application fronting a FastAPI + WebSocket Python 3.11 DSP service. The Python engine executes Demucs stem separation, Librosa onset/pitch extraction, dodecaphonic matrix audio transformations, and 24-bit WAV mixdown rendering, while the React/TypeScript frontend provides canvas-based multi-track waveforms, an interactive 12x12 serial matrix, and density automation curves.

**Tech Stack:** Python 3.11, PyTorch, Demucs v4, Librosa, Soundfile, Scipy, FastAPI, WebSockets, Tauri v2, React 18, TypeScript, Tailwind CSS, HTML5 Canvas 2D.

---

### Task 1: Environment & Project Foundation

**Files:**
- Create: `engine-py/requirements.txt`
- Create: `engine-py/pyproject.toml`
- Create: `.gitignore`
- Create: `README.md`
- Test: `engine-py/tests/test_env.py`

**Step 1: Write the failing test**
Create `engine-py/tests/test_env.py` verifying essential audio and DSP dependencies can be imported.

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_env.py`
Expected: FAIL (missing dependencies or files)

**Step 3: Implement dependencies and configuration**
Create `requirements.txt` specifying `torch`, `torchaudio`, `demucs`, `librosa`, `soundfile`, `scipy`, `fastapi`, `uvicorn[standard]`, `websockets`, `pydantic`, `pytest`, `numpy`.
Create `pyproject.toml` and `.gitignore`.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_env.py`
Expected: PASS

---

### Task 2: Audio Ingestion, Sample Generator & Demucs Pipeline

**Files:**
- Create: `engine-py/dsp/sample_generator.py`
- Create: `engine-py/dsp/demucs_pipeline.py`
- Test: `engine-py/tests/test_sample_and_demucs.py`

**Step 1: Write test for sample generator and Demucs pipeline**
Create `engine-py/tests/test_sample_and_demucs.py` testing synthetic generation of Menotti's "Sebastian's Dance" (rhythmic strings, woodwind motif, ostinato bass, light percussion) and stem separation output structure (`drums`, `bass`, `other`, `vocals`).

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_sample_and_demucs.py`
Expected: FAIL (modules not found)

**Step 3: Implement sample generator and Demucs pipeline**
- In `sample_generator.py`: synthesize 4 distinct 44.1kHz audio stems imitating Menotti's "Sebastian's Dance" (spiccato string ostinato, syncopated chamber percussion, lyrical woodwind, cello bassline) and export combined mixed audio and pre-separated stems.
- In `demucs_pipeline.py`: wrap Demucs `htdemucs` separation with fallback to session cache and automated fallback to synthesized separation if PyTorch model checkpoint is offline.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_sample_and_demucs.py`
Expected: PASS

---

### Task 3: Onset & Event Detection Engine (MIR)

**Files:**
- Create: `engine-py/dsp/onset_detector.py`
- Test: `engine-py/tests/test_onset_detector.py`

**Step 1: Write test for onset detection**
Create `engine-py/tests/test_onset_detector.py` testing:
- Methods: `spectral_flux`, `hfc`, `energy`
- Duration constraints: `min_event_duration_ms`, `max_event_duration_ms`
- Crossfade envelope smoothing (Hann ramp)
- Pitch estimation via `librosa.pyin` and spectral centroid calculations.

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_onset_detector.py`
Expected: FAIL

**Step 3: Implement OnsetDetector**
- Implement `OnsetDetector` class in `engine-py/dsp/onset_detector.py`.
- Compute onset detection functions via Librosa STFT.
- Peak-picking with adaptive threshold and hop length.
- Extract slice buffers with cosine crossfades.
- Calculate spectral centroid and estimate fundamental frequency $f_0$.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_onset_detector.py`
Expected: PASS

---

### Task 4: Dodecaphonic Serial Matrix & DSP Transformer

**Files:**
- Create: `engine-py/dsp/serial_matrix.py`
- Test: `engine-py/tests/test_serial_matrix.py`

**Step 1: Write test for 12-tone serial transformations**
Create `engine-py/tests/test_serial_matrix.py` testing:
- Generation of 12-event serial rows.
- Full $12 \times 12$ Babbitt matrix computation ($P_0 \dots P_{11}$, $R_0 \dots R_{11}$, $I_0 \dots I_{11}$, $RI_0 \dots RI_{11}$).
- Audio DSP buffer transformations:
  - P: forward sequence.
  - R: reverse order & reverse audio buffer.
  - I: pitch interval mirroring around row pitch centroid for harmonic slices, and FFT spectral band inversion ($X[K-1-k]$) for inharmonic percussion.
  - RI: conjugate of I and R.

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_serial_matrix.py`
Expected: FAIL

**Step 3: Implement SerialMatrix & DSP Transformer**
- In `serial_matrix.py`, implement `SerialMatrix` class and transformation functions.
- Implement pitch interval calculation and transposition using `librosa.effects.pitch_shift`.
- Implement FFT spectral band inversion with STFT inversion for percussive transients.
- Compute full matrix coordinates and row selectors.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_serial_matrix.py`
Expected: PASS

---

### Task 5: Density Timeline Mixdown Generator

**Files:**
- Create: `engine-py/dsp/timeline_renderer.py`
- Test: `engine-py/tests/test_timeline_renderer.py`

**Step 1: Write test for timeline rendering**
Create `engine-py/tests/test_timeline_renderer.py` testing:
- Density envelope parsing (events/sec curve over target duration).
- Stem weighting selection ($w_{drums}, w_{bass}, w_{other}, w_{vocals}$).
- Multi-track overlap-add mixdown to 24-bit 44.1/48kHz WAV with soft-clipping prevention.

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_timeline_renderer.py`
Expected: FAIL

**Step 3: Implement TimelineRenderer**
- In `timeline_renderer.py`, implement time-point density integration to schedule slice triggers.
- Overlap-add slices into stereo/mono master buffer.
- Convert to 24-bit PCM WAV using `soundfile.write(..., subtype='PCM_24')`.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_timeline_renderer.py`
Expected: PASS

---

### Task 6: FastAPI Service & WebSocket IPC

**Files:**
- Create: `engine-py/main.py`
- Test: `engine-py/tests/test_api.py`

**Step 1: Write test for FastAPI REST & WebSocket endpoints**
Create `engine-py/tests/test_api.py` testing:
- `GET /health`
- `POST /api/generate-demo`
- `POST /api/upload`
- `POST /api/separate`
- `POST /api/slice`
- `POST /api/matrix`
- `POST /api/render`
- `GET /api/audio/{filename}`
- WebSocket `/ws` progress stream.

**Step 2: Run test to verify failure**
Run: `pytest engine-py/tests/test_api.py`
Expected: FAIL

**Step 3: Implement FastAPI server and WebSocket manager**
- Build `main.py` with CORS, static file streaming, WebSocket progress notifier, and pipeline orchestrators.

**Step 4: Run test to verify it passes**
Run: `pytest engine-py/tests/test_api.py`
Expected: PASS

---

### Task 7: React + TypeScript Frontend Foundation

**Files:**
- Create: `src-ui/package.json`
- Create: `src-ui/vite.config.ts`
- Create: `src-ui/tsconfig.json`
- Create: `src-ui/tailwind.config.js`
- Create: `src-ui/postcss.config.js`
- Create: `src-ui/index.html`
- Create: `src-ui/src/index.css`
- Create: `src-ui/src/types/index.ts`
- Create: `src-ui/src/services/api.ts`

**Step 1: Configure project dependencies & build config**
Configure Vite, Tailwind, Lucide React, and TypeScript definitions for audio stems, slices, matrix, and timeline.

**Step 2: Test build configuration**
Run: `npm --prefix src-ui run build`
Expected: PASS

---

### Task 8: Interactive UI Components

**Files:**
- Create: `src-ui/src/components/Header.tsx`
- Create: `src-ui/src/components/AudioIngest.tsx`
- Create: `src-ui/src/components/WaveformViewer.tsx`
- Create: `src-ui/src/components/SerialMatrixViewer.tsx`
- Create: `src-ui/src/components/TimelineCanvas.tsx`
- Create: `src-ui/src/components/MixdownControls.tsx`
- Modify: `src-ui/src/App.tsx`

**Step 1: Build WaveformViewer component**
Canvas-based 4-stem multi-track display with slice boundary highlighting and zoom/audition controls.

**Step 2: Build SerialMatrixViewer component**
$12 \times 12$ matrix visualizer with P, R, I, RI row selector buttons, interval transpositions, and real-time slice preview.

**Step 3: Build TimelineCanvas & MixdownControls component**
Interactive Bézier/density automation envelope canvas, stem balance sliders, duration/sample rate pickers, and master export.

**Step 4: Wire all components into App.tsx**
Connect WebSocket status, API state management, audio players, and responsive dark-theme audio workstation layout.

**Step 5: Verify frontend compilation**
Run: `npm --prefix src-ui run build`
Expected: PASS with zero TypeScript or build errors.

---

### Task 9: Tauri v2 Desktop Shell

**Files:**
- Create: `Cargo.toml`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/build.rs`

**Step 1: Implement Tauri v2 configuration**
Set up `tauri.conf.json` configuring window dimensions, title "SerialAudio Engine", webview dev/build paths, and app permissions.

**Step 2: Implement Rust entry point**
Set up `src-tauri/src/main.rs` and Cargo workspace.

**Step 3: Verify Tauri build readiness**
Check Cargo manifest syntax and workspace configuration.

---

### Task 10: Setup Script, Makefile & End-to-End Verification

**Files:**
- Create: `run.sh`
- Create: `Makefile`

**Step 1: Create `run.sh`**
Unified startup script that:
1. Detects Python 3.11/virtualenv and installs requirements.
2. Checks Node.js/npm dependencies for `src-ui`.
3. Runs the complete test suite.
4. Starts backend engine and frontend server.

**Step 2: Execute full verification suite**
Run all Python DSP unit tests, API tests, and frontend build tests.
Verify Menotti's "Sebastian's Dance" synthetic stem separation, onset detection, 12-tone matrix generation, and 24-bit WAV mixdown render.
