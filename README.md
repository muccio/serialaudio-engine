# SerialAudio Engine

A hybrid algorithmic audio workstation that separates stems with Demucs, extracts MIR transient events with Librosa, recombines acoustic slices using 12-tone serial transformations mapped to DSP, and renders mixdowns driven by interactive density curves.

## Architecture

- **Frontend/GUI**: Tauri v2, React 18, TypeScript, Tailwind CSS, HTML5 Canvas 2D.
- **Backend/DSP**: Python 3.11 service with FastAPI and WebSocket IPC.
- **Stem Separation**: Demucs v4 (`htdemucs` 4-stems: drums, bass, other, vocals) with session caching.
- **MIR Slicing**: Configurable onset detection (`spectral_flux`, `hfc`, `energy`), Hann crossfading, and pitch estimation via pYIN / spectral centroid.
- **Dodecaphonic Matrix**: 12-tone serial transformations ($P$, $R$, $I$, $RI$) with interval pitch-mirroring and FFT spectral band inversion.
- **Timeline Generator**: Stochastic/Poisson density scheduler ($\lambda(t)$ events/sec), stem weighting, and 24-bit 44.1/48 kHz WAV export.

## Quick Start

```bash
# Setup dependencies and start engine + UI
./run.sh
```

Or run services individually:

```bash
# Python DSP Engine
source engine-py/.venv/bin/activate
cd engine-py && uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# React UI (in another terminal)
cd src-ui && npm install && npm run dev

# Tauri Desktop Shell
cargo tauri dev
```
