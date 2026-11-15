// Home hub formatting. Every time is the kitchen's (Europe/Helsinki).
import type { Agent, Product, Unit } from '@/api/gateway';

const TZ = 'Europe/Helsinki';

/** "3 min ago", "in 2 h", "in 3 days". */
export const relative = (iso: string, now = Date.now()) => {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const text =
    mins < 1 ? 'now' : mins < 60 ? `${mins} min` : mins < 60 * 36 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
  if (text === 'now') return diff >= 0 ? 'in a moment' : 'just now';
  return diff >= 0 ? `in ${text}` : `${text} ago`;
};

const localDay = (d: string | number | Date) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });

/** "Today 06:00", "Tomorrow 06:00", "Mon 16 Nov 06:00". */
export const when = (iso: string) => {
  const day = localDay(iso);
  const time = new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  if (day === localDay(Date.now())) return `Today ${time}`;
  if (day === localDay(Date.now() + 864e5)) return `Tomorrow ${time}`;
  if (day === localDay(Date.now() - 864e5)) return `Yesterday ${time}`;
  const date = new Date(iso)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
    .replace(',', '');
  return `${date} ${time}`;
};

export const isToday = (iso: string) => localDay(iso) === localDay(Date.now());

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The Gemini buyer agent if there is one, else the first agent. */
export const defaultAgent = (agents: Agent[] | undefined) =>
  agents?.find((a) => /gemini|google/i.test(`${a.name} ${a.vendor}`)) ?? agents?.[0] ?? null;

export const shortName = (name: string) => name.replace(/^Valio\s+/, '');

export const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

/** The unit a product is ordered in: litres, kilos or pieces. */
export const unitFor = (p: Product): Unit => {
  const base = p.salesUnit.baseUnit.toLowerCase();
  return base === 'l' || base === 'kg' ? base : 'pcs';
};

