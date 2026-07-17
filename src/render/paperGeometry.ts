import paper from 'paper';

type FontPathCommand = {
  command: string;
  args: number[];
};

let paperReady = false;

function ensurePaper() {
  if (!paperReady) {
    paper.setup(new paper.Size(1, 1));
    paperReady = true;
  }
}

export type GlyphTransform = {
  scale: number;
  x: number;
  baseline: number;
};

function point(x: number, y: number, transform: GlyphTransform): paper.Point {
  return new paper.Point(
    transform.x + x * transform.scale,
    transform.baseline - y * transform.scale,
  );
}

/**
 * Converts fontkit's editable font outline commands into Paper geometry.
 * Paper is deliberately used as geometry only; it never renders the glyph.
 */
export function fontPathToPaper(
  commands: readonly FontPathCommand[],
  transform: GlyphTransform,
): paper.CompoundPath {
  ensurePaper();
  const contours: paper.Path[] = [];
  let current: paper.Path | undefined;

  const finishCurrent = () => {
    if (current && current.segments.length >= 2) {
      if (!current.closed) current.closePath();
      contours.push(current);
    } else {
      current?.remove();
    }
    current = undefined;
  };

  for (const command of commands) {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = command.args;
    switch (command.command) {
      case 'moveTo':
        finishCurrent();
        current = new paper.Path();
        current.moveTo(point(x1, y1, transform));
        break;
      case 'lineTo':
        current?.lineTo(point(x1, y1, transform));
        break;
      case 'quadraticCurveTo':
        current?.quadraticCurveTo(point(x1, y1, transform), point(x2, y2, transform));
        break;
      case 'bezierCurveTo':
        current?.cubicCurveTo(
          point(x1, y1, transform),
          point(x2, y2, transform),
          point(x3, y3, transform),
        );
        break;
      case 'closePath':
        if (current) current.closePath();
        finishCurrent();
        break;
    }
  }
  finishCurrent();

  return new paper.CompoundPath({ children: contours });
}

export function flattenedClone(item: paper.CompoundPath, flatness: number): paper.CompoundPath {
  const clone = item.clone({ insert: false }) as paper.CompoundPath;
  for (const child of clone.children as paper.Path[]) {
    child.flatten(flatness);
  }
  return clone;
}
