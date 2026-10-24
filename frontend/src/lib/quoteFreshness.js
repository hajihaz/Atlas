// UI freshness is based on the provider's event time, not our fetch time.
export function isRecentQuote(quote, now = Date.now()) {
  if (!quote || typeof quote.price !== 'number' || !Number.isFinite(quote.price)
      || quote.price <= 0 || !quote.sourceAt) return false;
  const age = now - Date.parse(quote.sourceAt);
  return Number.isFinite(age) && age >= -5000 && age <= 90000;
}

export function connectionDescription(status, recentStream) {
  if (status === 'STREAMING' && recentStream)
    return '1s public stream · updates on provider events';
  if (status === 'STREAMING')
    return 'Stream idle for INR pairs · REST fallback every 15s';
  return `Stream ${String(status).toLowerCase()} · REST fallback every 15s`;
}
