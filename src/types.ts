export type CaptionTau = {
  id: string;
  text: string;
  textStart: number;
  textLength: number;
  startTime: number;
  endTime: number;
};

export type CaptionWord = {
  id: string;
  text: string;
  textStart: number;
  textLength: number;
  startTime: number;
  endTime: number;
  tauIds: string[];
};

export type CaptionBlock = {
  id: string;
  sourceLine: number;
  text: string;
  startTime: number;
  endTime: number;
  taus: CaptionTau[];
  words: CaptionWord[];
};

export type CaptionDocument = {
  revision: number;
  duration: number;
  blocks: CaptionBlock[];
};

export type PlaybackState = {
  time: number;
  playing: boolean;
};

export type ActiveCaptionState = {
  block: CaptionBlock | undefined;
  tau: CaptionTau | undefined;
  word: CaptionWord | undefined;
};
