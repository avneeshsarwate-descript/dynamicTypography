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

export type LookParameters = {
  fontSize: number;
  crumpleStrength: number;
  crumpleScale: number;
  twist: number;
  revealDuration: number;
  wordDuration: number;
  blockGap: number;
  letterSpacing: number;
  meshDensity: number;
  seed: number;
  background: string;
  fill: string;
  activeFill: string;
  showMesh: boolean;
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
