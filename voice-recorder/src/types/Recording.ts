export interface Recording {
  id: string;
  uri: string;
  filename: string;
  createdAt: string; // ISO date string
  duration: number; // in milliseconds
}
