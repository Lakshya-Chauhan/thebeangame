export function fmt$(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtPnL(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${n.toFixed(2)}`;
}

export function fmtTime(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function pnlClass(n) {
  if (n > 0) return 'pos';
  if (n < 0) return 'neg';
  return 'neu';
}

export function sentimentClass(s) {
  if (s === 'BULLISH') return 'bull';
  if (s === 'BEARISH') return 'bear';
  if (s === 'ANNOUNCEMENT') return 'ann';
  return 'neu-news';
}

export function sentimentIcon(s) {
  if (s === 'BULLISH') return '📈';
  if (s === 'BEARISH') return '📉';
  if (s === 'ANNOUNCEMENT') return '🔔';
  return '📰';
}
