export type StemType = 'drums' | 'bass' | 'other' | 'vocals';

export interface AudioSliceMetadata {
  id: string;
  stem_source: StemType | string;
  timestamp_start: number;
  duration: number;
  spectral_centroid: number;
  estimated_pitch_hz: number;
  pitch_semitone: number;
  audio_url?: string;
}

export type TransformationForm = 'P' | 'R' | 'I' | 'RI';

export interface MatrixMetadata {
  matrix: number[][];
  prime_row: AudioSliceMetadata[];
  pitch_classes: number[];
  stem: string;
}

export interface DensityPoint {
  time: number;
  events_per_sec: number;
}

export interface StemWeights {
  drums: number;
  bass: number;
  other: number;
  vocals: number;
}

export interface RenderResult {
  session_id: string;
  master_url: string;
  export_url: string;
  event_count: number;
  duration_sec: number;
  peak_amplitude: number;
}

export interface WebSocketProgressPayload {
  session_id: string;
  progress: number;
  stage: string;
  message: string;
}
