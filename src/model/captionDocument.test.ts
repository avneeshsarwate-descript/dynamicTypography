import { describe, expect, it } from 'vitest';
import { activeCaptionAt, buildCaptionDocument } from './captionDocument';

const timing = { wordDuration: 0.5, blockGap: 0.25 };

describe('caption document', () => {
  it('turns every newline into a block, including an empty line', () => {
    const document = buildCaptionDocument('one two\n\nthree', timing, 7);

    expect(document.blocks).toHaveLength(3);
    expect(document.blocks.map((block) => block.text)).toEqual(['one two', '', 'three']);
    expect(document.blocks[0]?.words.map((word) => word.text)).toEqual(['one', 'two']);
    expect(document.blocks[0]?.taus.map((tau) => tau.text)).toEqual(['one', 'two']);
    expect(document.blocks[0]?.words[0]?.tauIds).toEqual(['line-0-tau-0']);
    expect(document.blocks[1]?.words).toEqual([]);
    expect(document.revision).toBe(7);
  });

  it('exposes the active word inside the active block', () => {
    const document = buildCaptionDocument('small typography', timing, 1);
    const first = document.blocks[0]!.words[0]!;
    const second = document.blocks[0]!.words[1]!;

    expect(activeCaptionAt(document, first.startTime + 0.01).word?.id).toBe(first.id);
    expect(activeCaptionAt(document, second.startTime + 0.01).word?.id).toBe(second.id);
  });

  it('has no active caption during a block gap', () => {
    const document = buildCaptionDocument('first\nsecond', timing, 1);
    const gapTime = document.blocks[0]!.endTime + timing.blockGap / 2;

    expect(activeCaptionAt(document, gapTime)).toEqual({
      block: undefined,
      tau: undefined,
      word: undefined,
    });
  });

  it('weights timing by word length while keeping words contiguous', () => {
    const document = buildCaptionDocument('a significantly', timing, 1);
    const [shortWord, longWord] = document.blocks[0]!.words;

    expect(shortWord!.endTime).toBe(longWord!.startTime);
    expect(longWord!.endTime - longWord!.startTime).toBeGreaterThan(
      shortWord!.endTime - shortWord!.startTime,
    );
  });
});
