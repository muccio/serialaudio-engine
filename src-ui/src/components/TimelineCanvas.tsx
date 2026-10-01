import React, { useEffect, useRef, useState } from 'react';
import { Activity, Clock, Sliders, Wand2 } from 'lucide-react';
import { DensityPoint, StemWeights } from '../types';

interface TimelineCanvasProps {
  durationSec: number;
  setDurationSec: (d: number) => void;
  densityCurve: DensityPoint[];
  setDensityCurve: (curve: DensityPoint[]) => void;
  stemWeights: StemWeights;
  setStemWeights: (w: StemWeights) => void;
  currentTimeSec: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

export function TimelineCanvas({
  durationSec,
  setDurationSec,
  densityCurve,
  setDensityCurve,
  stemWeights,
  setStemWeights,
  currentTimeSec
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const maxDensity = 16.0; // max events/sec on vertical axis

  // Render density envelope
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1a1e2b';
    ctx.lineWidth = 1;

    // Horizontal density lines (e.g. 4, 8, 12 events/sec)
    [4, 8, 12].forEach((val) => {
      const y = height - (val / maxDensity) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.fillText(`${val} ev/s`, 8, y - 4);
    });

    // Vertical time lines
    const timeStep = Math.max(1, Math.floor(durationSec / 8));
    for (let t = 0; t <= durationSec; t += timeStep) {
      const x = (t / durationSec) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.fillText(`${t}s`, x + 4, height - 6);
    }

    // Draw Density Curve
    const sorted = [...densityCurve].sort((a, b) => a.time - b.time);
    if (sorted.length > 0) {
      // Shaded area
      ctx.beginPath();
      const firstX = (sorted[0].time / durationSec) * width;
      const firstY = height - (Math.min(maxDensity, sorted[0].events_per_sec) / maxDensity) * height;
      ctx.moveTo(firstX, height);
      ctx.lineTo(firstX, firstY);

      sorted.forEach((pt) => {
        const x = (pt.time / durationSec) * width;
        const y = height - (Math.min(maxDensity, pt.events_per_sec) / maxDensity) * height;
        ctx.lineTo(x, y);
      });

      const lastX = (sorted[sorted.length - 1].time / durationSec) * width;
      ctx.lineTo(lastX, height);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke Line
      ctx.beginPath();
      sorted.forEach((pt, i) => {
        const x = (pt.time / durationSec) * width;
        const y = height - (Math.min(maxDensity, pt.events_per_sec) / maxDensity) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw interactive handle points
      sorted.forEach((pt) => {
        const x = (pt.time / durationSec) * width;
        const y = height - (Math.min(maxDensity, pt.events_per_sec) / maxDensity) * height;

        ctx.fillStyle = '#6366f1';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.fillText(`${pt.events_per_sec.toFixed(1)}/s`, x - 12, y - 10);
      });
    }

    // Playhead Line
    if (currentTimeSec >= 0 && currentTimeSec <= durationSec) {
      const playheadX = (currentTimeSec / durationSec) * width;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(playheadX, 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [densityCurve, durationSec, currentTimeSec]);

  // Handle canvas interactions (drag control points / add point)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;

    // Check if clicked close to existing point
    let closestIndex = -1;
    let closestDist = 20; // 20px radius

    densityCurve.forEach((pt, i) => {
      const ptX = (pt.time / durationSec) * width;
      const ptY = height - (Math.min(maxDensity, pt.events_per_sec) / maxDensity) * height;
      const dist = Math.hypot(clickX - ptX, clickY - ptY);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    });

    if (closestIndex !== -1) {
      setDraggingIndex(closestIndex);
    } else {
      // Add new point at click
      const newTime = Math.max(0, Math.min(durationSec, (clickX / width) * durationSec));
      const newDensity = Math.max(0.5, Math.min(maxDensity, ((height - clickY) / height) * maxDensity));
      const updated = [...densityCurve, { time: roundVal(newTime), events_per_sec: roundVal(newDensity) }];
      updated.sort((a, b) => a.time - b.time);
      setDensityCurve(updated);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIndex === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;

    const newTime = Math.max(0, Math.min(durationSec, (curX / width) * durationSec));
    const newDensity = Math.max(0.5, Math.min(maxDensity, ((height - curY) / height) * maxDensity));

    const updated = [...densityCurve];
    updated[draggingIndex] = {
      time: roundVal(newTime),
      events_per_sec: roundVal(newDensity)
    };
    updated.sort((a, b) => a.time - b.time);
    setDensityCurve(updated);
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
  };

  const roundVal = (v: number) => Math.round(v * 10) / 10;

  // Preset density envelopes
  const applyPreset = (type: 'crescendo' | 'arch' | 'polyrhythmic') => {
    if (type === 'crescendo') {
      setDensityCurve([
        { time: 0, events_per_sec: 1.5 },
        { time: durationSec * 0.5, events_per_sec: 5.0 },
        { time: durationSec, events_per_sec: 14.0 }
      ]);
    } else if (type === 'arch') {
      setDensityCurve([
        { time: 0, events_per_sec: 2.0 },
        { time: durationSec * 0.5, events_per_sec: 12.0 },
        { time: durationSec, events_per_sec: 1.8 }
      ]);
    } else if (type === 'polyrhythmic') {
      setDensityCurve([
        { time: 0, events_per_sec: 4.0 },
        { time: durationSec * 0.25, events_per_sec: 10.0 },
        { time: durationSec * 0.5, events_per_sec: 3.0 },
        { time: durationSec * 0.75, events_per_sec: 11.0 },
        { time: durationSec, events_per_sec: 2.5 }
      ]);
    }
  };

  return (
    <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-surfaceBorder">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            Timeline Automation & Density Generator
          </h2>
        </div>

        {/* Envelope presets */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-slate-400 flex items-center space-x-1">
            <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Curves:</span>
          </span>
          <button
            onClick={() => applyPreset('arch')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Golden Arch
          </button>
          <button
            onClick={() => applyPreset('crescendo')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Crescendo
          </button>
          <button
            onClick={() => applyPreset('polyrhythmic')}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Polyrhythmic
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Density Envelope Canvas */}
        <div className="lg:col-span-8 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Density Automation Curve: lambda(t) Events / Sec &bull; Click to add points, drag handles</span>
            <span>Target: {durationSec}s</span>
          </div>

          <div className="relative h-44 w-full rounded-xl bg-slate-950 border border-slate-800 overflow-hidden cursor-crosshair">
            <canvas
              ref={canvasRef}
              width={800}
              height={176}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-full block"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1 flex-wrap gap-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Duration:</span>
              <input
                type="range"
                min="5"
                max={Math.max(300, Math.ceil(durationSec * 1.5))}
                step="1"
                value={durationSec}
                onChange={(e) => setDurationSec(parseInt(e.target.value))}
                className="w-28 accent-indigo-500 cursor-pointer"
              />
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={durationSec}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    setDurationSec(val);
                  }}
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-indigo-300 font-mono text-center text-xs focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-xs">sec</span>
              </div>
              <div className="flex items-center space-x-1 pl-1">
                {[15, 30, 60, 120, 300].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setDurationSec(sec)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                      durationSec === sec
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                setDensityCurve([
                  { time: 0, events_per_sec: 2.0 },
                  { time: durationSec * 0.5, events_per_sec: 7.0 },
                  { time: durationSec, events_per_sec: 2.0 }
                ])
              }
              className="text-slate-500 hover:text-slate-300 transition"
            >
              Reset Points
            </button>
          </div>
        </div>

        {/* Stem Allocation Weight Sliders */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-semibold uppercase tracking-wider">Stem Balance Weights</span>
            </div>
          </div>

          {(['drums', 'bass', 'other', 'vocals'] as (keyof StemWeights)[]).map((stem) => {
            const colors: Record<string, string> = {
              drums: 'text-rose-400 accent-rose-500',
              bass: 'text-amber-400 accent-amber-500',
              other: 'text-cyan-400 accent-cyan-500',
              vocals: 'text-purple-400 accent-purple-500'
            };

            return (
              <div key={stem} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className={`capitalize font-medium ${colors[stem].split(' ')[0]}`}>{stem}</span>
                  <span className="text-slate-300">{(stemWeights[stem] * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={stemWeights[stem]}
                  onChange={(e) =>
                    setStemWeights({
                      ...stemWeights,
                      [stem]: parseFloat(e.target.value)
                    })
                  }
                  className={`w-full cursor-pointer ${colors[stem].split(' ')[1]}`}
                />
              </div>
            );
          })}

          <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
            Probability distribution governing which stem feeds the next serial event along the density envelope.
          </p>
        </div>
      </div>
    </div>
  );
}
