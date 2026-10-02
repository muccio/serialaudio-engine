import React, { useEffect, useRef, useState } from 'react';
import { Archive, Download, FileJson, Layers, Loader2 } from 'lucide-react';
import { AudioSliceMetadata } from '../types';
import { api } from '../services/api';
import { downloadFile } from '../utils/downloader';

interface WaveformViewerProps {
  sessionId?: string | null;
  stems: Record<string, string>;
  slices: Record<string, AudioSliceMetadata[]>;
  activeStemForMatrix: string;
  onSelectStemForMatrix: (stem: string) => void;
  onPreviewSlice: (slice: AudioSliceMetadata) => void;
  onTriggerDownload?: (url: string, filename: string) => Promise<void>;
}

const STEM_COLORS: Record<string, { base: string; wave: string; border: string; bg: string }> = {
  drums: { base: '#f43f5e', wave: '#fb7185', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
  bass: { base: '#eab308', wave: '#facc15', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
  other: { base: '#06b6d4', wave: '#22d3ee', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  vocals: { base: '#a855f7', wave: '#c084fc', border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
};

export function WaveformViewer({
  sessionId,
  stems,
  slices,
  activeStemForMatrix,
  onSelectStemForMatrix,
  onPreviewSlice,
  onTriggerDownload
}: WaveformViewerProps) {
  const [hoveredSlice, setHoveredSlice] = useState<AudioSliceMetadata | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const handleDownload = async (key: string, url: string, defaultFilename: string) => {
    try {
      setDownloadingKey(key);
      if (onTriggerDownload) {
        await onTriggerDownload(url, defaultFilename);
      } else {
        await downloadFile({ url, defaultFilename });
      }
    } catch (err: any) {
      console.error(`Download ${defaultFilename} failed:`, err);
    } finally {
      setDownloadingKey(null);
    }
  };

  // Compute maximum duration across all slices
  let maxTime = 1.0;
  Object.values(slices).forEach(list => {
    list.forEach(s => {
      const end = s.timestamp_start + s.duration;
      if (end > maxTime) maxTime = end;
    });
  });

  // Render waveform lanes
  useEffect(() => {
    Object.keys(stems).forEach((stem) => {
      const canvas = canvasRefs.current[stem];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const colors = STEM_COLORS[stem] || STEM_COLORS.other;

      ctx.clearRect(0, 0, width, height);

      // Background grid
      ctx.strokeStyle = '#1e2230';
      ctx.lineWidth = 1;
      const gridIntervalSec = 1.0;
      for (let t = 0; t <= maxTime; t += gridIntervalSec) {
        const x = (t / maxTime) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw synthetic waveform representation based on slice activity
      const stemSlices = slices[stem] || [];
      ctx.fillStyle = colors.wave;
      
      const midY = height / 2;
      const ampMax = height * 0.42;

      // Draw stylized audio transients
      stemSlices.forEach((slice) => {
        const startX = (slice.timestamp_start / maxTime) * width;
        const sliceW = Math.max(2, (slice.duration / maxTime) * width);

        // Draw slice background highlight
        ctx.fillStyle = colors.bg;
        ctx.fillRect(startX, 0, sliceW, height);

        // Draw boundary line
        ctx.strokeStyle = colors.base;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();

        // Waveform envelope in slice
        ctx.fillStyle = colors.wave;
        const steps = Math.max(6, Math.floor(sliceW / 2));
        for (let s = 0; s < steps; s++) {
          const x = startX + (s / steps) * sliceW;
          const progress = s / steps;
          const env = Math.exp(-3.5 * progress) * (0.3 + 0.7 * Math.sin(progress * Math.PI));
          const h = ampMax * env * (0.6 + 0.4 * Math.sin(s * 1.5));
          ctx.fillRect(x, midY - h, 1.5, h * 2);
        }

        // Draw pitch / slice badge
        ctx.fillStyle = colors.base;
        ctx.font = '9px monospace';
        const label = slice.pitch_semitone > 0
          ? `M${Math.round(slice.pitch_semitone)}`
          : `${Math.round(slice.spectral_centroid)}Hz`;
        ctx.fillText(label, startX + 3, 12);
      });
    });
  }, [stems, slices, maxTime]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>, stem: string) => {
    const canvas = canvasRefs.current[stem];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const clickTime = clickRatio * maxTime;

    const stemSlices = slices[stem] || [];
    const clickedSlice = stemSlices.find(
      s => clickTime >= s.timestamp_start && clickTime <= (s.timestamp_start + s.duration)
    );
    if (clickedSlice) {
      onPreviewSlice(clickedSlice);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, stem: string) => {
    const canvas = canvasRefs.current[stem];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const hoverTime = (hoverX / rect.width) * maxTime;

    const stemSlices = slices[stem] || [];
    const slice = stemSlices.find(
      s => hoverTime >= s.timestamp_start && hoverTime <= (s.timestamp_start + s.duration)
    );
    setHoveredSlice(slice || null);
  };

  const handleCanvasMouseLeave = () => {
    setHoveredSlice(null);
  };

  const stemKeys = Object.keys(stems);

  return (
    <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-surfaceBorder">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            Multi-Track Waveform & Transient Slices
          </h2>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono flex-wrap gap-y-1">
          {sessionId && stemKeys.length > 0 && (
            <button
              onClick={() => handleDownload('stems-zip', api.getStemsZipDownloadUrl(sessionId), `stems_${sessionId.slice(0, 8)}.zip`)}
              disabled={downloadingKey === 'stems-zip'}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition shadow-sm disabled:opacity-50"
              title="Scarica tutti e 4 gli stem (drums, bass, other, vocals) in archivio ZIP"
            >
              {downloadingKey === 'stems-zip' ? (
                <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
              ) : (
                <Archive className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>{downloadingKey === 'stems-zip' ? 'Downloading...' : 'Stems (ZIP)'}</span>
            </button>
          )}

          {sessionId && Object.values(slices).some((l) => l.length > 0) && (
            <>
              <button
                onClick={() => handleDownload('slices-zip', api.getSlicesZipDownloadUrl(sessionId), `slices_all_${sessionId.slice(0, 8)}.zip`)}
                disabled={downloadingKey === 'slices-zip'}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition shadow-sm disabled:opacity-50"
                title="Scarica tutte le fette audio (WAV) + metadati JSON/CSV in archivio ZIP"
              >
                {downloadingKey === 'slices-zip' ? (
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>{downloadingKey === 'slices-zip' ? 'Downloading...' : 'All Slices (ZIP)'}</span>
              </button>

              <button
                onClick={() => handleDownload('meta-json', api.getSlicesMetaDownloadUrl(sessionId), `slices_metadata_${sessionId.slice(0, 8)}.json`)}
                disabled={downloadingKey === 'meta-json'}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition shadow-sm disabled:opacity-50"
                title="Scarica il file metadati JSON delle fette"
              >
                {downloadingKey === 'meta-json' ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                ) : (
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{downloadingKey === 'meta-json' ? 'Downloading...' : 'Metadata (JSON)'}</span>
              </button>
            </>
          )}

          <span className="text-slate-400 text-[11px] pl-1">Duration: {maxTime.toFixed(2)}s</span>

          {hoveredSlice && (
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700 px-2.5 py-0.5 rounded text-indigo-300">
              <span>{hoveredSlice.id}</span> &bull; 
              <span> {hoveredSlice.duration.toFixed(3)}s</span> &bull; 
              <span> {hoveredSlice.pitch_semitone > 0 ? `MIDI ${hoveredSlice.pitch_semitone}` : 'Inharmonic'}</span> &bull;
              <span> {hoveredSlice.spectral_centroid} Hz</span>
              {sessionId && (
                <button
                  onClick={() => handleDownload(`slice-${hoveredSlice.id}`, api.getSliceDownloadUrl(sessionId, hoveredSlice.stem_source, hoveredSlice.id), `${hoveredSlice.id}.wav`)}
                  disabled={downloadingKey === `slice-${hoveredSlice.id}`}
                  className="p-0.5 hover:text-white text-slate-400 ml-1 disabled:opacity-50"
                  title="Scarica questo singolo slice WAV"
                >
                  {downloadingKey === `slice-${hoveredSlice.id}` ? (
                    <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3 text-emerald-400" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {stemKeys.length === 0 ? (
        <div className="py-12 text-center text-slate-500 font-mono text-sm">
          Load or upload an audio track above to view separated waveforms and slice boundaries.
        </div>
      ) : (
        <div className="space-y-3">
          {stemKeys.map((stem) => {
            const colors = STEM_COLORS[stem] || STEM_COLORS.other;
            const stemSlices = slices[stem] || [];
            const isSelected = activeStemForMatrix === stem;

            return (
              <div
                key={stem}
                className={`bg-slate-950/60 rounded-lg p-2.5 border transition ${isSelected ? 'border-indigo-500/80 shadow-md shadow-indigo-950/40' : 'border-slate-800'}`}
              >
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: colors.base }}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                      {stem}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      ({stemSlices.length} slices)
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {sessionId && (
                      <button
                        onClick={() => handleDownload(`stem-${stem}`, api.getStemDownloadUrl(sessionId, stem), `${stem}.wav`)}
                        disabled={downloadingKey === `stem-${stem}`}
                        className="flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50"
                        title={`Scarica ${stem}.wav`}
                      >
                        {downloadingKey === `stem-${stem}` ? (
                          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3 text-indigo-400" />
                        )}
                        <span>{downloadingKey === `stem-${stem}` ? 'Downloading...' : 'WAV'}</span>
                      </button>
                    )}

                    {sessionId && stemSlices.length > 0 && (
                      <button
                        onClick={() => handleDownload(`slices-${stem}`, api.getSlicesZipDownloadUrl(sessionId, stem), `slices_${stem}_${sessionId.slice(0, 8)}.zip`)}
                        disabled={downloadingKey === `slices-${stem}`}
                        className="flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50"
                        title={`Scarica le ${stemSlices.length} fette di ${stem} in ZIP`}
                      >
                        {downloadingKey === `slices-${stem}` ? (
                          <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                        ) : (
                          <Archive className="w-3 h-3 text-cyan-400" />
                        )}
                        <span>{downloadingKey === `slices-${stem}` ? 'Downloading...' : 'ZIP'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => onSelectStemForMatrix(stem)}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                    >
                      {isSelected ? 'Active Matrix Stem' : 'Select for Matrix'}
                    </button>
                  </div>
                </div>

                <div className="relative h-16 w-full rounded bg-slate-900 overflow-hidden cursor-crosshair">
                  <canvas
                    ref={(el) => (canvasRefs.current[stem] = el)}
                    width={1000}
                    height={64}
                    onClick={(e) => handleCanvasClick(e, stem)}
                    onMouseMove={(e) => handleCanvasMouseMove(e, stem)}
                    onMouseLeave={handleCanvasMouseLeave}
                    className="w-full h-full block"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
