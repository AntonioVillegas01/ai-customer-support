export function relativeTime(iso: string | null): string {
  if (iso === null) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < hour) return rtf.format(Math.round(-diff / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(-diff / hour), 'hour');
  return rtf.format(Math.round(-diff / day), 'day');
}

export function toDateTime(iso: string | null): string {
  return iso === null ? '—' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
