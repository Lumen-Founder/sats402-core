export function validateDemoPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') errors.push('payload is not an object');
  if (typeof payload?.symbol !== 'string') errors.push('symbol must be string');
  if (typeof payload?.signal !== 'string') errors.push('signal must be string');
  if (!Number.isFinite(payload?.confidence)) errors.push('confidence must be number');
  if (payload?.confidence < 0 || payload?.confidence > 1) errors.push('confidence must be between 0 and 1');
  if (!payload?.generated_at) errors.push('generated_at required');
  return { ok: errors.length === 0, errors };
}
