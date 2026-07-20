const SETTLE_THRESHOLD = 0.005;
const FORCED_TAIL_FRACTION = 0.1;

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function springDisplacement(
  elapsed: number,
  amplitude: number,
  frequency: number,
  dampingRatio: number,
): number {
  const naturalFrequency = Math.PI * 2 * Math.max(0.001, frequency);
  const ratio = Math.min(0.999, Math.max(0.001, dampingRatio));
  const decay = ratio * naturalFrequency;
  const dampedFrequency = naturalFrequency * Math.sqrt(1 - ratio * ratio);
  return amplitude
    * Math.exp(-decay * elapsed)
    * (
      Math.cos(dampedFrequency * elapsed)
      + decay / dampedFrequency * Math.sin(dampedFrequency * elapsed)
    );
}

function springSettleTime(
  amplitude: number,
  frequency: number,
  dampingRatio: number,
): number {
  const naturalFrequency = Math.PI * 2 * Math.max(0.001, frequency);
  const ratio = Math.min(0.999, Math.max(0.001, dampingRatio));
  const decay = ratio * naturalFrequency;
  const envelopeAmplitude = Math.abs(amplitude) / Math.sqrt(1 - ratio * ratio);
  return Math.max(0, Math.log(Math.max(1, envelopeAmplitude / SETTLE_THRESHOLD)) / decay);
}

function elasticScaleAtTime(
  time: number,
  startTime: number,
  endTime: number,
  peakScale: number,
  requestedPullDuration: number,
  frequency: number,
  dampingRatio: number,
): number {
  if (time < startTime || time >= endTime) return 1;
  const duration = Math.max(0.001, endTime - startTime);
  const elapsed = Math.min(duration, Math.max(0, time - startTime));
  const pullDuration = Math.min(requestedPullDuration, duration * 0.8);
  const amplitude = peakScale - 1;
  if (elapsed < pullDuration) {
    return 1 + amplitude * smootherstep(elapsed / Math.max(0.001, pullDuration));
  }

  const releaseElapsed = elapsed - pullDuration;
  const releaseDuration = duration - pullDuration;
  let displacement = springDisplacement(
    releaseElapsed,
    amplitude,
    frequency,
    dampingRatio,
  );
  if (springSettleTime(amplitude, frequency, dampingRatio) > releaseDuration) {
    const tailStart = duration * (1 - FORCED_TAIL_FRACTION);
    if (elapsed > tailStart) {
      const tailProgress = (elapsed - tailStart) / (duration - tailStart);
      displacement *= 1 - smootherstep(tailProgress);
    }
  }
  return Math.max(0.08, 1 + displacement);
}

export const elasticScaleWgsl = /* wgsl */ `
fn smootherstep(value: f32) -> f32 {
  return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
}

fn springDisplacement(
  elapsed: f32,
  amplitude: f32,
  frequency: f32,
  dampingRatio: f32,
) -> f32 {
  let naturalFrequency = 6.2831853 * max(0.001, frequency);
  let ratio = clamp(dampingRatio, 0.001, 0.999);
  let decay = ratio * naturalFrequency;
  let dampedFrequency = naturalFrequency * sqrt(1.0 - ratio * ratio);
  return amplitude
    * exp(-decay * elapsed)
    * (
      cos(dampedFrequency * elapsed)
      + decay / dampedFrequency * sin(dampedFrequency * elapsed)
    );
}

fn springSettleTime(amplitude: f32, frequency: f32, dampingRatio: f32) -> f32 {
  let naturalFrequency = 6.2831853 * max(0.001, frequency);
  let ratio = clamp(dampingRatio, 0.001, 0.999);
  let decay = ratio * naturalFrequency;
  let envelopeAmplitude = abs(amplitude) / sqrt(1.0 - ratio * ratio);
  return max(0.0, log(max(1.0, envelopeAmplitude / 0.005)) / decay);
}

fn elasticScale(timing: vec2f) -> f32 {
  if (globals.time < timing.x || globals.time >= timing.y) {
    return 1.0;
  }
  let duration = max(0.001, timing.y - timing.x);
  let elapsed = clamp(globals.time - timing.x, 0.0, duration);
  let pullDuration = min(globals.pullDuration, duration * 0.8);
  let amplitude = globals.peakScale - 1.0;
  if (elapsed < pullDuration) {
    return 1.0 + amplitude * smootherstep(elapsed / max(0.001, pullDuration));
  }

  let releaseElapsed = elapsed - pullDuration;
  let releaseDuration = duration - pullDuration;
  var displacement = springDisplacement(
    releaseElapsed,
    amplitude,
    globals.frequency,
    globals.dampingRatio,
  );
  if (springSettleTime(amplitude, globals.frequency, globals.dampingRatio) > releaseDuration) {
    let tailStart = duration * 0.9;
    if (elapsed > tailStart) {
      let tailProgress = (elapsed - tailStart) / (duration - tailStart);
      displacement *= 1.0 - smootherstep(tailProgress);
    }
  }
  return max(0.08, 1.0 + displacement);
}
`;

export const exportedForTesting = {
  elasticScaleAtTime,
  springDisplacement,
  springSettleTime,
};
