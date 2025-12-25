export interface Recording {
  id: string;
  uri: string;
  filename: string;
  createdAt: string; // ISO date string
  duration: number; // in milliseconds
  segments?: string[]; // Optional: multiple audio file URIs for checkpoint recordings
}
