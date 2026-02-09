export type PitchDetectOptions = {
  minFreq?: number;
  maxFreq?: number;
  minRms?: number;
  correlationThreshold?: number;
};

export function detectPitchAutocorrelation(
  buffer: Float32Array,
  sampleRate: number,
  opts?: PitchDetectOptions,
): number | null {
  const minFreq = opts?.minFreq ?? 50;
  const maxFreq = opts?.maxFreq ?? 1200;
  const minRms = opts?.minRms ?? 0.01;
  const correlationThreshold = opts?.correlationThreshold ?? 0.2;

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  if (buffer.length < 64) return null;

  // RMS gate for silence/noise floor.
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i += 1) sumSq += buffer[i] * buffer[i];
  const rms = Math.sqrt(sumSq / buffer.length);
  if (!Number.isFinite(rms) || rms < minRms) return null;

  const maxLag = Math.min(buffer.length - 2, Math.floor(sampleRate / minFreq));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (minLag >= maxLag) return null;

  // Basic autocorrelation: choose lag with the max average correlation.
  let bestLag = -1;
  let bestCorr = -Infinity;

  // Precompute energy for normalization (avoid pitch drifting due to amplitude).
  // We normalize by energy of the overlapping windows at each lag.
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    let energyA = 0;
    let energyB = 0;
    const n = buffer.length - lag;
    for (let i = 0; i < n; i += 1) {
      const a = buffer[i];
      const b = buffer[i + lag];
      corr += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom = Math.sqrt(energyA * energyB);
    const norm = denom > 0 ? corr / denom : 0;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || !Number.isFinite(bestCorr) || bestCorr < correlationThreshold) {
    return null;
  }

  // Parabolic interpolation around bestLag for a refined estimate.
  const c0 = normalizedCorrAtLag(buffer, bestLag - 1);
  const c1 = normalizedCorrAtLag(buffer, bestLag);
  const c2 = normalizedCorrAtLag(buffer, bestLag + 1);
  const denom = 2 * (2 * c1 - c2 - c0);
  let shift = 0;
  if (Number.isFinite(denom) && Math.abs(denom) > 1e-9) {
    shift = (c2 - c0) / denom;
    if (!Number.isFinite(shift)) shift = 0;
    if (Math.abs(shift) > 1) shift = 0;
  }

  const refinedLag = bestLag + shift;
  if (!Number.isFinite(refinedLag) || refinedLag <= 0) return null;
  return sampleRate / refinedLag;

  function normalizedCorrAtLag(buf: Float32Array, lag: number): number {
    if (lag < minLag || lag > maxLag) return 0;
    let corr = 0;
    let energyA = 0;
    let energyB = 0;
    const n = buf.length - lag;
    for (let i = 0; i < n; i += 1) {
      const a = buf[i];
      const b = buf[i + lag];
      corr += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom2 = Math.sqrt(energyA * energyB);
    return denom2 > 0 ? corr / denom2 : 0;
  }
}

