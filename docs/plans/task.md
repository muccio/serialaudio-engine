| Task | Status | Details |
| --- | --- | --- |
| Fix Matrix Layout Bug | DONE | Fixed 1-column collapse in `SerialMatrixViewer.tsx` using `repeat(13, minmax(2rem, 2.5rem))` and tailwind config |
| Fix 404 & Manifest Webmanifest Bug | DONE | Created `manifest.webmanifest`, `manifest.json`, `vite.svg` in `src-ui/public` and added FastAPI endpoints |
| Fix Step 3 Matrix Generation & Wiring | DONE | Added stem switcher tabs in Step 3, automatic fallback generation, preview synthesizer tones, and wired all props in App.tsx |
| Implement Intermediate Products Download | DONE | Implemented ZIP/JSON/WAV downloads for stems, all slices (with metadata JSON/CSV), matrix JSON, and input mix across backend and UI |
| Remove 60s Duration Limit | DONE | Uncapped timeline scheduler duration, added direct numeric input, dynamic slider scaling, and presets (15s, 30s, 60s, 120s, 300s) |
| 12-Tone Matrix Audio DSP Tutorial | DONE | Added detailed operational and mathematical tutorial in `WorkflowGuide.tsx` and `docs/TUTORIAL_GUIDE.md` explaining P, R, I, RI audio transformations |
| Implement Save & Load Project Feature | DONE | Added complete project bundle (.serialproj ZIP with project.json + all audio: raw, stems, slices, master, full UI state restoration) |
| Run Full Verification & Tests | DONE | Verified all 15 tests and Vite production build passing via `./run.sh test` |
