export function bandForScore(score) {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError('TrustScore score must be a finite number from 0 to 100');
  }
  if (score < 25) return 'BAND_LOW';
  if (score < 75) return 'BAND_MED';
  return 'BAND_HIGH';
}

// Relative to the persisted top-k signals: >= half is strong, >= one fifth is medium.
export function strengthForSignal(value, totalAbsoluteValue) {
  if (!Number.isFinite(value) || !Number.isFinite(totalAbsoluteValue) || totalAbsoluteValue < 0) {
    throw new RangeError('Signal values must be finite');
  }
  const share = totalAbsoluteValue === 0 ? 0 : Math.abs(value) / totalAbsoluteValue;
  if (share >= 0.5) return 'STRENGTH_STRONG';
  if (share >= 0.2) return 'STRENGTH_MEDIUM';
  return 'STRENGTH_WEAK';
}
