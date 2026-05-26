export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface ExternalSubtitleTrack {
  id: string;
  label: string;
  url: string;
}
