import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { AudioIngest } from './components/AudioIngest';
import { WaveformViewer } from './components/WaveformViewer';
import { SerialMatrixViewer } from './components/SerialMatrixViewer';
import { TimelineCanvas } from './components/TimelineCanvas';
import { WorkflowGuide } from './components/WorkflowGuide';
import { api } from './services/api';
import {
  AudioSliceMetadata,
  DensityPoint,
  MatrixMetadata,
  RenderResult,
  StemWeights,
  TransformationForm,
  WebSocketProgressPayload
} from './types';

export default function App() {
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stems, setStems] = useState<Record<string, string>>({});
  const [slices, setSlices] = useState<Record<string, AudioSliceMetadata[]>>({});
  const [activeStemForMatrix, setActiveStemForMatrix] = useState<string>('other');
  const [matrixData, setMatrixData] = useState<MatrixMetadata | null>(null);

  // Serial transformations
  const [activeForm, setActiveForm] = useState<TransformationForm>('P');
  const [activeRow, setActiveRow] = useState<number>(0);
  const [reverseBuffers, setReverseBuffers] = useState<boolean>(false);

  // Timeline & Density
  const [targetDurationSec, setDurationSec] = useState<number>(15);
  const [densityCurve, setDensityCurve] = useState<DensityPoint[]>([
    { time: 0, events_per_sec: 2.0 },
    { time: 7.5, events_per_sec: 9.0 },
    { time: 15, events_per_sec: 2.5 }
  ]);
  const [stemWeights, setStemWeights] = useState<StemWeights>({
    drums: 0.35,
    bass: 0.25,
    other: 0.25,
    vocals: 0.15
  });
  const [sampleRate, setSampleRate] = useState<number>(44100);

  // Execution states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [progress, setProgress] = useState<WebSocketProgressPayload | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  // Audio Playback
  const [isPlayingMaster, setIsPlayingMaster] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // 1. Initial health check & WebSocket setup
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    const checkHealth = async () => {
      const ok = await api.checkHealth();
      setIsBackendConnected(ok);
      if (ok && !ws) {
        try {
          ws = api.createWebSocket((msg: WebSocketProgressPayload) => {
            if (msg.progress !== undefined) {
              setProgress(msg);
              if (msg.progress >= 1.0) {
                setTimeout(() => setIsProcessing(false), 800);
              }
            }
          });
        } catch {
          // Retry
        }
      }
    };

    checkHealth();
    pollInterval = setInterval(checkHealth, 3000);

    return () => {
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, []);

  // Update matrix data when active stem changes or when slices update
  useEffect(() => {
    if (sessionId && activeStemForMatrix && slices[activeStemForMatrix]?.length > 0) {
      api.getMatrix(sessionId, activeStemForMatrix)
        .then(setMatrixData)
        .catch((err) => console.error('Matrix load error:', err));
    }
  }, [sessionId, activeStemForMatrix, slices]);

  // Audio playhead sync
  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTimeSec(audio.currentTime);
    };
    const onEnded = () => {
      setIsPlayingMaster(false);
      setCurrentTimeSec(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Handlers
  const handleLoadDemo = async () => {
    try {
      setIsProcessing(true);
      setProgress({ session_id: '', progress: 0.1, stage: 'demo', message: 'Synthesizing Sebastian\'s Dance motifs...' });
      const demo = await api.generateDemo(8.0);
      setSessionId(demo.session_id);
      setStems(demo.stems);

      // Auto trigger slice detection
      setProgress({ session_id: demo.session_id, progress: 0.5, stage: 'slicing', message: 'Running MIR transient detector on 4 stems...' });
      const sliceRes = await api.sliceEvents({
        sessionId: demo.session_id,
        method: 'spectral_flux',
        threshold: 0.2,
        minDurationMs: 50,
        maxDurationMs: 1200,
        crossfadeMs: 5
      });
      setSlices(sliceRes.slices);

      // Load matrix for first harmonic stem
      const mat = await api.getMatrix(demo.session_id, 'other');
      setMatrixData(mat);
      setActiveStemForMatrix('other');
      setIsProcessing(false);
    } catch (err: any) {
      alert(`Error loading demo: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setProgress({ session_id: '', progress: 0.05, stage: 'upload', message: `Uploading ${file.name}...` });
      const uploadRes = await api.uploadAudio(file);
      setSessionId(uploadRes.session_id);

      // Trigger Demucs separation
      setProgress({ session_id: uploadRes.session_id, progress: 0.25, stage: 'separation', message: 'Running Demucs neural stem separation...' });
      const sepRes = await api.separateStems(uploadRes.session_id);
      setStems(sepRes.stems);

      // Trigger Slicing
      const sliceRes = await api.sliceEvents({
        sessionId: uploadRes.session_id,
        method: 'spectral_flux',
        threshold: 0.2,
        minDurationMs: 50,
        maxDurationMs: 1200,
        crossfadeMs: 5
      });
      setSlices(sliceRes.slices);

      const mat = await api.getMatrix(uploadRes.session_id, 'other');
      setMatrixData(mat);
      setActiveStemForMatrix('other');
      setIsProcessing(false);
    } catch (err: any) {
      alert(`Error processing file: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleDetectSlices = async (params: {
    method: 'spectral_flux' | 'hfc' | 'energy';
    threshold: number;
    minDurationMs: number;
    maxDurationMs: number;
    crossfadeMs: number;
  }) => {
    if (!sessionId) return;
    try {
      setIsProcessing(true);
      const res = await api.sliceEvents({
        sessionId,
        ...params
      });
      setSlices(res.slices);

      if (activeStemForMatrix) {
        const mat = await api.getMatrix(sessionId, activeStemForMatrix);
        setMatrixData(mat);
      }
      setIsProcessing(false);
    } catch (err: any) {
      alert(`Slice error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleSelectStemForMatrix = async (stem: string) => {
    setActiveStemForMatrix(stem);
    if (sessionId && slices[stem]?.length > 0) {
      try {
        const mat = await api.getMatrix(sessionId, stem);
        setMatrixData(mat);
      } catch (err: any) {
        console.error('Matrix error:', err);
      }
    }
  };

  const handlePreviewSlice = (slice: AudioSliceMetadata) => {
    if (slice.audio_url) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = new Audio(api.getAudioUrl(slice.audio_url));
      previewAudioRef.current = audio;
      audio.play().catch(() => {});
    }
  };

  const handleTriggerRender = async () => {
    if (!sessionId) return;
    try {
      setIsRendering(true);
      const res = await api.renderTimeline({
        sessionId,
        targetDurationSec,
        densityCurve,
        stemWeights,
        activeForm,
        activeMatrixRow: activeRow,
        reverseBuffers,
        sampleRate
      });
      setRenderResult(res);
      setIsRendering(false);

      // Load into master audio player
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = api.getAudioUrl(res.master_url);
        audioPlayerRef.current.play().then(() => setIsPlayingMaster(true)).catch(() => {});
      }
    } catch (err: any) {
      alert(`Render error: ${err.message}`);
      setIsRendering(false);
    }
  };

  const handleToggleMasterPlay = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    if (isPlayingMaster) {
      audio.pause();
      setIsPlayingMaster(false);
    } else {
      audio.play().then(() => setIsPlayingMaster(true)).catch(() => {});
    }
  };

  const handleExportMaster = () => {
    if (!renderResult || !sessionId) return;
    window.open(api.getAudioUrl(renderResult.export_url), '_blank');
  };

  const totalSlices = Object.values(slices).reduce((acc, list) => acc + list.length, 0);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans">
      {/* Hidden Master Audio Element */}
      <audio ref={audioPlayerRef} preload="auto" />

      {/* Header Bar */}
      <Header
        isBackendConnected={isBackendConnected}
        sampleRate={sampleRate}
        setSampleRate={setSampleRate}
        isPlayingMaster={isPlayingMaster}
        hasMaster={!!renderResult}
        onToggleMasterPlay={handleToggleMasterPlay}
        onExportMaster={handleExportMaster}
        isRendering={isRendering}
        onTriggerRender={handleTriggerRender}
      />

      {/* Main DAW Workspace Layout */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Interactive Step-by-Step Workflow Guide & Tutorial Drawer */}
        <WorkflowGuide
          hasStems={Object.keys(stems).length > 0}
          hasSlices={totalSlices > 0}
          hasMatrix={matrixData !== null}
          hasMaster={renderResult !== null}
          activeStemForMatrix={activeStemForMatrix}
          totalSlices={totalSlices}
        />

        {/* Module 1: Ingestion & Stem Separation */}
        <AudioIngest
          onFileUpload={handleFileUpload}
          onLoadDemo={handleLoadDemo}
          onDetectSlices={handleDetectSlices}
          isProcessing={isProcessing}
          progress={progress}
          hasAudio={!!sessionId}
          hasStems={Object.keys(stems).length > 0}
          hasSlices={totalSlices > 0}
          stemCount={Object.keys(stems).length}
        />

        {/* Module 2: Multi-Track Waveform & Slice Boundary Inspector */}
        <WaveformViewer
          stems={stems}
          slices={slices}
          activeStemForMatrix={activeStemForMatrix}
          onSelectStemForMatrix={handleSelectStemForMatrix}
          onPreviewSlice={handlePreviewSlice}
        />

        {/* Module 3: 12-Tone Serial Matrix & DSP Permutations */}
        <SerialMatrixViewer
          matrixData={matrixData}
          activeForm={activeForm}
          onChangeForm={setActiveForm}
          activeRow={activeRow}
          onChangeRow={setActiveRow}
          reverseBuffers={reverseBuffers}
          onToggleReverseBuffers={() => setReverseBuffers(!reverseBuffers)}
        />

        {/* Module 4: Timeline Automation & Density Mixdown Generator */}
        <TimelineCanvas
          durationSec={targetDurationSec}
          setDurationSec={setDurationSec}
          densityCurve={densityCurve}
          setDensityCurve={setDensityCurve}
          stemWeights={stemWeights}
          setStemWeights={setStemWeights}
          currentTimeSec={currentTimeSec}
          isPlaying={isPlayingMaster}
          onSeek={(t) => {
            if (audioPlayerRef.current) audioPlayerRef.current.currentTime = t;
          }}
        />

        {/* Render Result Notification Card */}
        {renderResult && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between font-mono text-xs text-emerald-200">
            <div className="flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Master Mixdown Synthesized: {renderResult.event_count} serial events &bull; {renderResult.duration_sec}s &bull; Peak: {renderResult.peak_amplitude.toFixed(4)} FS
              </span>
            </div>
            <button
              onClick={handleExportMaster}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow transition active:scale-95"
            >
              Download 24-bit WAV
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-surfaceBorder py-4 text-center text-xs text-slate-500 font-mono">
        SerialAudio Engine v0.1.0 &bull; Demucs PyTorch &bull; Librosa MIR &bull; 12-Tone Serial DSP Matrix &bull; Tauri v2
      </footer>
    </div>
  );
}
