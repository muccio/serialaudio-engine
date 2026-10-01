import { AudioSliceMetadata, MatrixMetadata, RenderResult, TransformationForm, DensityPoint, StemWeights } from '../types';

const API_BASE = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';

export const api = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async generateDemo(durationSec: number = 8.0): Promise<{ session_id: string; mix_url: string; stems: Record<string, string> }> {
    const res = await fetch(`${API_BASE}/api/generate-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_sec: durationSec })
    });
    if (!res.ok) throw new Error(`Demo generation failed: ${res.statusText}`);
    return res.json();
  },

  async uploadAudio(file: File): Promise<{ session_id: string; filename: string; mix_url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(`Audio upload failed: ${res.statusText}`);
    return res.json();
  },

  async separateStems(sessionId: string): Promise<{ session_id: string; stems: Record<string, string> }> {
    const res = await fetch(`${API_BASE}/api/separate?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`Stem separation failed: ${res.statusText}`);
    return res.json();
  },

  async sliceEvents(params: {
    sessionId: string;
    method: 'spectral_flux' | 'hfc' | 'energy';
    threshold: number;
    minDurationMs: number;
    maxDurationMs: number;
    crossfadeMs: number;
  }): Promise<{ session_id: string; slices: Record<string, AudioSliceMetadata[]>; total_slices: number }> {
    const res = await fetch(`${API_BASE}/api/slice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: params.sessionId,
        method: params.method,
        threshold: params.threshold,
        min_event_duration_ms: params.minDurationMs,
        max_event_duration_ms: params.maxDurationMs,
        crossfade_envelope_ms: params.crossfadeMs
      })
    });
    if (!res.ok) throw new Error(`Slicing failed: ${res.statusText}`);
    return res.json();
  },

  async getMatrix(sessionId: string, stem: string = 'other'): Promise<MatrixMetadata> {
    const res = await fetch(`${API_BASE}/api/matrix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, stem })
    });
    if (!res.ok) throw new Error(`Failed to compute serial matrix: ${res.statusText}`);
    return res.json();
  },

  async renderTimeline(params: {
    sessionId: string;
    targetDurationSec: number;
    densityCurve: DensityPoint[];
    stemWeights: StemWeights;
    activeForm: TransformationForm;
    activeMatrixRow: number;
    reverseBuffers: boolean;
    sampleRate: number;
  }): Promise<RenderResult> {
    const res = await fetch(`${API_BASE}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: params.sessionId,
        target_duration_sec: params.targetDurationSec,
        density_curve: params.densityCurve,
        stem_weights: params.stemWeights,
        active_form: params.activeForm,
        active_matrix_row: params.activeMatrixRow,
        reverse_buffers: params.reverseBuffers,
        sample_rate: params.sampleRate
      })
    });
    if (!res.ok) throw new Error(`Timeline render failed: ${res.statusText}`);
    return res.json();
  },

  getAudioUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    return `${API_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  },

  createWebSocket(onMessage: (data: any) => void): WebSocket {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch {
        // Ignored keepalives
      }
    };
    return ws;
  },

  getStemDownloadUrl(sessionId: string, stem: string): string {
    return `${API_BASE}/api/download/stem/${encodeURIComponent(sessionId)}/${encodeURIComponent(stem)}`;
  },

  getStemsZipDownloadUrl(sessionId: string): string {
    return `${API_BASE}/api/download/stems-zip/${encodeURIComponent(sessionId)}`;
  },

  getSlicesZipDownloadUrl(sessionId: string, stem?: string): string {
    const q = stem ? `?stem=${encodeURIComponent(stem)}` : '';
    return `${API_BASE}/api/download/slices-zip/${encodeURIComponent(sessionId)}${q}`;
  },

  getSlicesMetaDownloadUrl(sessionId: string): string {
    return `${API_BASE}/api/download/slices-meta/${encodeURIComponent(sessionId)}`;
  },

  getMatrixJsonDownloadUrl(sessionId: string, stem: string): string {
    return `${API_BASE}/api/download/matrix-json/${encodeURIComponent(sessionId)}/${encodeURIComponent(stem)}`;
  },

  getRawMixDownloadUrl(sessionId: string): string {
    return `${API_BASE}/api/download/raw-mix/${encodeURIComponent(sessionId)}`;
  },

  getSliceDownloadUrl(sessionId: string, stem: string, sliceId: string): string {
    return `${API_BASE}/api/download/slice/${encodeURIComponent(sessionId)}/${encodeURIComponent(stem)}/${encodeURIComponent(sliceId)}`;
  }
};
