import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { AudioIngest } from './components/AudioIngest';
import { WaveformViewer } from './components/WaveformViewer';
import { SerialMatrixViewer } from './components/SerialMatrixViewer';
import { TimelineCanvas } from './components/TimelineCanvas';
import { WorkflowGuide } from './components/WorkflowGuide';
import { GlobalProgressBar, GlobalProgressState } from './components/GlobalProgressBar';
import { api } from './services/api';
import { downloadFile } from './utils/downloader';
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
  const [isSavingProject, setIsSavingProject] = useState<boolean>(false);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);
  const [projectName, setProjectName] = useState<string>("SerialAudio_Project");
  const [progress, setProgress] = useState<WebSocketProgressPayload | null>(null);
  const [globalProgress, setGlobalProgress] = useState<GlobalProgressState>({
    isActive: false,
    stage: 'idle',
    progress: 0,
    message: ''
  });
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
              setGlobalProgress({
                isActive: msg.progress < 1.0,
                stage: msg.stage,
                progress: msg.progress,
                message: msg.message,
                isComplete: msg.progress >= 1.0
              });
              if (msg.progress >= 1.0) {
                setTimeout(() => {
                  setIsProcessing(false);
                  setGlobalProgress(prev => ({ ...prev, isComplete: false, isActive: false }));
                }, 1800);
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

  const triggerDownloadWithProgress = async (url: string, defaultFilename: string) => {
    setGlobalProgress({
      isActive: true,
      stage: 'download',
      progress: 0.1,
      message: `Avvio download di ${defaultFilename}...`
    });
    try {
      await downloadFile({
        url,
        defaultFilename,
        onProgress: (pct, msg) => {
          setGlobalProgress({
            isActive: true,
            stage: 'download',
            progress: pct / 100,
            message: msg
          });
        },
        onSuccess: (filename) => {
          setGlobalProgress({
            isActive: false,
            stage: 'download',
            progress: 1.0,
            message: `Download completato: ${filename}`,
            isComplete: true
          });
          setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2500);
        },
        onError: (err) => {
          setGlobalProgress({
            isActive: false,
            stage: 'download',
            progress: 0,
            message: `Errore download: ${err.message}`
          });
        }
      });
    } catch (err: any) {
      alert(`Errore download: ${err.message}`);
    }
  };

  const totalSlices = Object.values(slices).reduce((acc, list) => acc + list.length, 0);

  // Update matrix data when active stem changes or when stems/slices update
  useEffect(() => {
    if (sessionId && activeStemForMatrix) {
      if (Object.keys(stems).length > 0 || totalSlices > 0) {
        api.getMatrix(sessionId, activeStemForMatrix)
          .then(setMatrixData)
          .catch((err) => console.error('Matrix load error:', err));
      }
    }
  }, [sessionId, activeStemForMatrix, totalSlices, stems]);

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
      const startMsg = { session_id: '', progress: 0.1, stage: 'demo_generation', message: "Sintesi dei motivi orchestrali di Menotti 'Sebastian's Dance'..." };
      setProgress(startMsg);
      setGlobalProgress({ isActive: true, stage: 'demo_generation', progress: 0.1, message: startMsg.message });

      const demo = await api.generateDemo(8.0);
      setSessionId(demo.session_id);
      setStems(demo.stems);

      // Auto trigger slice detection
      const sliceMsg = { session_id: demo.session_id, progress: 0.5, stage: 'slicing', message: 'Rilevamento transienti MIR su 4 stem in corso...' };
      setProgress(sliceMsg);
      setGlobalProgress({ isActive: true, stage: 'slicing', progress: 0.5, message: sliceMsg.message });

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
      setGlobalProgress({
        isActive: false,
        stage: 'demo_generation',
        progress: 1.0,
        message: 'Demo caricata e analizzata con successo!',
        isComplete: true
      });
      setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2000);
    } catch (err: any) {
      alert(`Error loading demo: ${err.message}`);
      setIsProcessing(false);
      setGlobalProgress({ isActive: false, stage: 'error', progress: 0, message: `Errore demo: ${err.message}` });
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      const upMsg = { session_id: '', progress: 0.05, stage: 'upload', message: `Caricamento di ${file.name}...` };
      setProgress(upMsg);
      setGlobalProgress({ isActive: true, stage: 'upload', progress: 0.05, message: upMsg.message });

      const uploadRes = await api.uploadAudio(file);
      setSessionId(uploadRes.session_id);

      // Trigger Demucs separation
      const sepMsg = { session_id: uploadRes.session_id, progress: 0.25, stage: 'separation', message: 'Separazione neurale Demucs v4 (drums, bass, other, vocals)...' };
      setProgress(sepMsg);
      setGlobalProgress({ isActive: true, stage: 'separation', progress: 0.25, message: sepMsg.message });

      const sepRes = await api.separateStems(uploadRes.session_id);
      setStems(sepRes.stems);

      // Trigger Slicing
      const slMsg = { session_id: uploadRes.session_id, progress: 0.65, stage: 'slicing', message: 'Rilevamento transienti MIR e stima altezza pYIN...' };
      setProgress(slMsg);
      setGlobalProgress({ isActive: true, stage: 'slicing', progress: 0.65, message: slMsg.message });

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
      setGlobalProgress({
        isActive: false,
        stage: 'separation',
        progress: 1.0,
        message: `${file.name} elaborato con successo!`,
        isComplete: true
      });
      setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2000);
    } catch (err: any) {
      alert(`Error processing file: ${err.message}`);
      setIsProcessing(false);
      setGlobalProgress({ isActive: false, stage: 'error', progress: 0, message: `Errore caricamento: ${err.message}` });
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
    if (sessionId) {
      try {
        setIsProcessing(true);
        const mat = await api.getMatrix(sessionId, stem);
        setMatrixData(mat);
        setIsProcessing(false);
      } catch (err: any) {
        console.error('Matrix error:', err);
        setIsProcessing(false);
      }
    }
  };

  const handleForceGenerateMatrix = async () => {
    try {
      setIsProcessing(true);
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        setProgress({ session_id: '', progress: 0.1, stage: 'demo', message: "Inizializzazione demo orchestrale..." });
        const demo = await api.generateDemo(8.0);
        currentSessionId = demo.session_id;
        setSessionId(demo.session_id);
        setStems(demo.stems);
      }

      if (totalSlices === 0) {
        setProgress({ session_id: currentSessionId, progress: 0.4, stage: 'slicing', message: 'Rilevamento transienti per generazione matrice...' });
        const sliceRes = await api.sliceEvents({
          sessionId: currentSessionId,
          method: 'spectral_flux',
          threshold: 0.2,
          minDurationMs: 50,
          maxDurationMs: 1200,
          crossfadeMs: 5
        });
        setSlices(sliceRes.slices);
      }

      const stemToUse = activeStemForMatrix || 'other';
      const mat = await api.getMatrix(currentSessionId, stemToUse);
      setMatrixData(mat);
      setIsProcessing(false);
    } catch (err: any) {
      alert(`Errore generazione matrice: ${err.message}`);
      setIsProcessing(false);
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
      setGlobalProgress({
        isActive: true,
        stage: 'rendering',
        progress: 0.25,
        message: 'Sintesi algoritmica 12-tone su timeline in corso...'
      });

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

      setGlobalProgress({
        isActive: false,
        stage: 'rendering',
        progress: 1.0,
        message: `Mixdown completato (${res.event_count} eventi generati, ${res.duration_sec}s)!`,
        isComplete: true
      });
      setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2500);

      // Load into master audio player
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = api.getAudioUrl(res.master_url);
        audioPlayerRef.current.play().then(() => setIsPlayingMaster(true)).catch(() => {});
      }
    } catch (err: any) {
      alert(`Render error: ${err.message}`);
      setIsRendering(false);
      setGlobalProgress({
        isActive: false,
        stage: 'error',
        progress: 0,
        message: `Errore render: ${err.message}`
      });
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

  const handleExportMaster = async () => {
    if (!renderResult || !sessionId) return;
    const filename = `serialaudio_master_${renderResult.session_id.slice(0, 8)}.wav`;
    await triggerDownloadWithProgress(api.getAudioUrl(renderResult.export_url), filename);
  };

  const handleSaveProject = async () => {
    if (!sessionId) {
      alert("Nessun progetto o sessione attiva da salvare. Carica o crea prima una traccia.");
      return;
    }
    const name = projectName.trim() || 'SerialAudio_Project';
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    try {
      setIsSavingProject(true);
      console.log(`[SerialAudio App] Starting save for project "${name}" (session: ${sessionId})`);
      setGlobalProgress({
        isActive: true,
        stage: 'save_project',
        progress: 0.2,
        message: `Preparazione pacchetto ${cleanName}.serialproj...`
      });

      const blob = await api.saveProject({
        sessionId,
        projectName: name,
        uiState: {
          active_stem_for_matrix: activeStemForMatrix,
          active_form: activeForm,
          active_row: activeRow,
          reverse_buffers: reverseBuffers,
          target_duration_sec: targetDurationSec,
          density_curve: densityCurve,
          stem_weights: stemWeights,
          sample_rate: sampleRate,
          last_render_event_count: renderResult?.event_count || 0
        }
      });

      console.log(`[SerialAudio App] Received project blob: ${blob.size} bytes`);
      setGlobalProgress({
        isActive: true,
        stage: 'save_project',
        progress: 0.85,
        message: `Download di ${cleanName}.serialproj (${(blob.size / (1024 * 1024)).toFixed(2)} MB)...`
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${cleanName}.serialproj`;
      document.body.appendChild(a);
      a.click();

      // CRITICAL: Keep object URL alive for 60 seconds
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        console.log(`[SerialAudio App] Cleaned up temporary blob URL for ${cleanName}.serialproj`);
      }, 60000);

      setIsSavingProject(false);
      setGlobalProgress({
        isActive: false,
        stage: 'save_project',
        progress: 1.0,
        message: `Progetto "${cleanName}.serialproj" scaricato con successo!`,
        isComplete: true
      });
      setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2500);
    } catch (err: any) {
      console.error('[SerialAudio App] Save project failed:', err);
      alert(`Errore salvataggio progetto: ${err.message}`);
      setIsSavingProject(false);
      setGlobalProgress({
        isActive: false,
        stage: 'error',
        progress: 0,
        message: `Errore salvataggio: ${err.message}`
      });
    }
  };

  const handleLoadProjectFile = async (file: File) => {
    try {
      setIsLoadingProject(true);
      console.log(`[SerialAudio App] Loading project file: ${file.name}`);
      setGlobalProgress({
        isActive: true,
        stage: 'load_project',
        progress: 0.2,
        message: `Caricamento progetto ${file.name} in memoria...`
      });

      const loaded = await api.loadProject(file);

      // Restore session & project name
      setSessionId(loaded.session_id);
      setProjectName(loaded.project_name || file.name.replace(/\.[^/.]+$/, ''));
      setStems(loaded.stems || {});
      setSlices(loaded.slices || {});

      // Restore UI State if present
      if (loaded.ui_state) {
        if (loaded.ui_state.active_stem_for_matrix) setActiveStemForMatrix(loaded.ui_state.active_stem_for_matrix);
        if (loaded.ui_state.active_form) setActiveForm(loaded.ui_state.active_form);
        if (typeof loaded.ui_state.active_row === 'number') setActiveRow(loaded.ui_state.active_row);
        if (typeof loaded.ui_state.reverse_buffers === 'boolean') setReverseBuffers(loaded.ui_state.reverse_buffers);
        if (loaded.ui_state.target_duration_sec) setDurationSec(loaded.ui_state.target_duration_sec);
        if (loaded.ui_state.density_curve && Array.isArray(loaded.ui_state.density_curve)) setDensityCurve(loaded.ui_state.density_curve);
        if (loaded.ui_state.stem_weights) setStemWeights(loaded.ui_state.stem_weights);
        if (loaded.ui_state.sample_rate) setSampleRate(loaded.ui_state.sample_rate);
      }

      // Restore Matrix
      if (loaded.matrix) {
        setMatrixData(loaded.matrix);
      } else if (loaded.ui_state?.active_stem_for_matrix) {
        api.getMatrix(loaded.session_id, loaded.ui_state.active_stem_for_matrix).then(setMatrixData).catch(() => {});
      }

      // Restore Master render if present
      if (loaded.render_result) {
        setRenderResult(loaded.render_result);
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = api.getAudioUrl(loaded.render_result.master_url);
        }
      } else {
        setRenderResult(null);
      }

      setIsLoadingProject(false);
      setGlobalProgress({
        isActive: false,
        stage: 'load_project',
        progress: 1.0,
        message: `Progetto "${file.name}" caricato con successo!`,
        isComplete: true
      });
      setTimeout(() => setGlobalProgress(prev => ({ ...prev, isComplete: false })), 2500);
    } catch (err: any) {
      console.error('[SerialAudio App] Load project error:', err);
      alert(`Errore caricamento progetto: ${err.message}`);
      setIsLoadingProject(false);
      setGlobalProgress({
        isActive: false,
        stage: 'error',
        progress: 0,
        message: `Errore caricamento: ${err.message}`
      });
    }
  };

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
        hasSession={!!sessionId}
        onToggleMasterPlay={handleToggleMasterPlay}
        onExportMaster={handleExportMaster}
        isRendering={isRendering}
        onTriggerRender={handleTriggerRender}
        onSaveProject={handleSaveProject}
        onLoadProjectFile={handleLoadProjectFile}
        isSavingProject={isSavingProject}
        isLoadingProject={isLoadingProject}
        projectName={projectName}
        setProjectName={setProjectName}
        isBusy={isProcessing || isRendering || isSavingProject || isLoadingProject || globalProgress.isActive}
      />

      {/* Global Real-Time Multi-Operation Progress Bar */}
      <GlobalProgressBar
        state={globalProgress}
        onDismiss={() => setGlobalProgress(prev => ({ ...prev, isComplete: false, isActive: false }))}
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
          sessionId={sessionId}
          onFileUpload={handleFileUpload}
          onLoadDemo={handleLoadDemo}
          onDetectSlices={handleDetectSlices}
          onTriggerDownload={triggerDownloadWithProgress}
          isProcessing={isProcessing}
          progress={progress}
          hasAudio={!!sessionId}
          hasStems={Object.keys(stems).length > 0}
          hasSlices={totalSlices > 0}
          stemCount={Object.keys(stems).length}
        />

        {/* Module 2: Multi-Track Waveform & Slice Boundary Inspector */}
        <WaveformViewer
          sessionId={sessionId}
          stems={stems}
          slices={slices}
          activeStemForMatrix={activeStemForMatrix}
          onSelectStemForMatrix={handleSelectStemForMatrix}
          onPreviewSlice={handlePreviewSlice}
          onTriggerDownload={triggerDownloadWithProgress}
        />

        {/* Module 3: 12-Tone Serial Matrix & DSP Permutations */}
        <SerialMatrixViewer
          sessionId={sessionId}
          matrixData={matrixData}
          activeForm={activeForm}
          onChangeForm={setActiveForm}
          activeRow={activeRow}
          onChangeRow={setActiveRow}
          reverseBuffers={reverseBuffers}
          onToggleReverseBuffers={() => setReverseBuffers(!reverseBuffers)}
          activeStem={activeStemForMatrix}
          onSelectStem={handleSelectStemForMatrix}
          availableStems={Object.keys(stems).length > 0 ? Object.keys(stems) : ['drums', 'bass', 'other', 'vocals']}
          slicesCountByStem={Object.fromEntries(
            (Object.keys(stems).length > 0 ? Object.keys(stems) : ['drums', 'bass', 'other', 'vocals']).map(k => [k, slices[k]?.length || 0])
          )}
          onForceGenerateMatrix={handleForceGenerateMatrix}
          onTriggerDownload={triggerDownloadWithProgress}
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
