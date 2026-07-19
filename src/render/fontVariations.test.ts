import { readFileSync } from 'node:fs';
import * as fontkit from 'fontkit';
import { describe, expect, it } from 'vitest';
import { fontAtWeight } from './fontVariations';

describe('prototype variable font', () => {
  it('creates distinct thin and bold outline instances', () => {
    const bytes = readFileSync(new URL(
      '../../public/Sora-Variable.ttf',
      import.meta.url,
    ));
    const font = fontkit.create(
      bytes as unknown as Parameters<typeof fontkit.create>[0],
    ) as fontkit.Font;
    const thin = fontAtWeight(font, 240);
    const bold = fontAtWeight(font, 700);

    expect(font.variationAxes.wght).toBeDefined();
    expect(thin.layout('Type').glyphs[0]!.path.commands).not.toEqual(
      bold.layout('Type').glyphs[0]!.path.commands,
    );
  });
});
