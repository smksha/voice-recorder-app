export interface Recording {
  id: string;
  uri: string;
  date: Date;
  duration: number; // in milliseconds
}

export interface RecordingMetadata {
  id: string;
  uri: string;
  date: string; // ISO string for storage
  duration: number;
}
