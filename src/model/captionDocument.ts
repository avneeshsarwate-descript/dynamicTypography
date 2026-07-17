import type {
  ActiveCaptionState,
  CaptionBlock,
  CaptionDocument,
  CaptionTau,
  CaptionWord,
  LookParameters,
} from '../types';

const MIN_BLOCK_DURATION = 0.72;
const EMPTY_BLOCK_DURATION = 0.42;

function tokenizeWords(text: string): Array<{ text: string; start: number; length: number }> {
  return Array.from(text.matchAll(/\S+/gu), (match) => ({
    text: match[0],
    start: match.index ?? 0,
    length: match[0].length,
  }));
}

export function buildCaptionDocument(
  text: string,
  look: Pick<LookParameters, 'wordDuration' | 'blockGap'>,
  revision: number,
): CaptionDocument {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: CaptionBlock[] = [];
  let cursor = 0;

  lines.forEach((line, lineIndex) => {
    const tokens = tokenizeWords(line);
    const blockStart = cursor;
    const words: CaptionWord[] = [];
    const taus: CaptionTau[] = [];
    let wordCursor = blockStart;

    tokens.forEach((token, wordIndex) => {
      const lengthWeight = Math.min(1.65, Math.max(0.72, token.text.length / 5));
      const duration = look.wordDuration * lengthWeight;
      const tauId = `line-${lineIndex}-tau-${wordIndex}`;
      taus.push({
        id: tauId,
        text: token.text,
        textStart: token.start,
        textLength: token.length,
        startTime: wordCursor,
        endTime: wordCursor + duration,
      });
      words.push({
        id: `line-${lineIndex}-word-${wordIndex}`,
        text: token.text,
        textStart: token.start,
        textLength: token.length,
        startTime: wordCursor,
        endTime: wordCursor + duration,
        tauIds: [tauId],
      });
      wordCursor += duration;
    });

    const contentDuration = tokens.length
      ? Math.max(MIN_BLOCK_DURATION, wordCursor - blockStart)
      : EMPTY_BLOCK_DURATION;
    const blockEnd = blockStart + contentDuration;
    blocks.push({
      id: `line-${lineIndex}`,
      sourceLine: lineIndex,
      text: line,
      startTime: blockStart,
      endTime: blockEnd,
      taus,
      words,
    });
    cursor = blockEnd + look.blockGap;
  });

  return {
    revision,
    blocks,
    duration: Math.max(0.01, cursor - look.blockGap),
  };
}

export function activeCaptionAt(document: CaptionDocument, time: number): ActiveCaptionState {
  const block = document.blocks.find(
    (candidate) => time >= candidate.startTime && time < candidate.endTime,
  );
  const word = block?.words.find(
    (candidate) => time >= candidate.startTime && time < candidate.endTime,
  );
  const tau = block?.taus.find(
    (candidate) => time >= candidate.startTime && time < candidate.endTime,
  );
  return { block, tau, word };
}
