// Formatting for orders. Every time is shown in the kitchen's zone (Europe/Helsinki).
import type { Unit } from '@/api/gateway';

export const TZ = 'Europe/Helsinki';

export const eur = (n: number, digits = 2) => `€${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** "2026-11-13" for an instant, in Helsinki. */
export const localDay = (iso: string | number | Date) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });

export const fmtTime = (iso: string, seconds = false) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: TZ });

const weekdayDate = (d: Date, timeZone: string) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).replace(',', '');

/** "Today", "Yesterday" or "Thu 12 Nov". */
export const fmtDay = (iso: string) => {
  const day = localDay(iso);
  if (day === localDay(Date.now())) return 'Today';
  if (day === localDay(Date.now() - 864e5)) return 'Yesterday';
  return weekdayDate(new Date(iso), TZ);
};

export const fmtWhen = (iso: string) => `${fmtDay(iso)} ${fmtTime(iso)}`;

/** A calendar date ("2026-11-16") → "Mon 16 Nov". */
export const fmtDate = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? weekdayDate(new Date(`${date}T12:00:00Z`), 'UTC') : date);

/** 6.8 → "6m 48s". */
export const minutes = (m: number) => {
  const s = Math.round(m * 60);
  const mm = Math.floor(s / 60);
  return mm ? `${mm}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

export const fmtQty = (qty: number, unit: Unit) => `${qty.toLocaleString('en-US')} ${unit}`;
export const unitLabel = (unit: Unit) => (unit === 'pcs' ? 'pc' : unit);

/** "Valio Eila semi skimmed milk drink 1 l UHT lactose free" → "Eila semi skimmed milk drink 1 l UHT lactose free". */
export const shortName = (name: string) => name.replace(/^Valio\s+/, '');

/** ISO week number and Monday–Sunday range of the current Helsinki week. */
export const currentWeek = (now = new Date()) => {
  const [y, m, d] = localDay(now).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(date.getTime() - dow * 864e5);
  const sunday = new Date(monday.getTime() + 6 * 864e5);
  const thursday = new Date(monday.getTime() + 3 * 864e5);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 864e5 + 1) / 7);
  const fmt = (x: Date, month: boolean) => x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' }).replace(',', '');
  return { week, start: monday.toISOString().slice(0, 10), label: `Week ${week} · ${fmt(monday, monday.getUTCMonth() !== sunday.getUTCMonth())} – ${fmt(sunday, true)}` };
};
