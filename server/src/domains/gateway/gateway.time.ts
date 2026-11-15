// Calendar helpers. Business days and weeks are reckoned in the kitchen's time
// zone (Europe/Helsinki); dates travel as plain `YYYY-MM-DD` strings.

export const TIME_ZONE = 'Europe/Helsinki';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Helsinki calendar day of an instant, `YYYY-MM-DD`. */
export const localDay = (at: Date = new Date()) => dayFormat.format(at);

const parseDay = (day: string) => new Date(`${day}T00:00:00Z`);

export const addDays = (day: string, days: number) => {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 1 = Monday … 7 = Sunday. */
export const weekday = (day: string) => parseDay(day).getUTCDay() || 7;

/** Monday of the ISO week that contains `day`. */
export const weekStart = (day: string) => addDays(day, 1 - weekday(day));

export const sameWeek = (a: Date, b: Date) => weekStart(localDay(a)) === weekStart(localDay(b));

/** The next Monday strictly after `day`. */
export const nextMonday = (day: string) => addDays(day, 8 - weekday(day));

/** "Mon 16 Nov". */
export const fmtDay = (day: string) =>
  parseDay(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

/** "Monday". */
export const weekdayName = (day: string) => parseDay(day).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime());

/** A clock the orchestration reads; seeds pass a stepped, backdated one. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** Starts at `start` and moves forward `stepMs` on every read. */
export const steppedClock = (start: Date, stepMs = 1500): Clock & { jump: (ms: number) => void } => {
  let t = start.getTime() - stepMs;
  const clock = (() => {
    t += stepMs;
    return new Date(t);
  }) as Clock & { jump: (ms: number) => void };
  clock.jump = (ms: number) => {
    t += ms;
  };
  return clock;
};

const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' });

/** Helsinki's UTC offset in minutes at an instant (+120 in winter, +180 in summer). */
export const helsinkiOffsetMinutes = (at: Date) => {
  const offset = offsetFormat.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = offset.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 120;
};

/**
 * The instant of a Helsinki wall-clock time, e.g. helsinkiTime('2026-11-12', '08:14').
 * DST-safe: the offset is re-read at the first estimate, so times near the switch
 * resolve correctly (a time skipped in spring lands one hour later).
 */
export const helsinkiTime = (day: string, hhmm: string) => {
  const guess = new Date(`${day}T${hhmm}:00Z`).getTime();
  const first = guess - helsinkiOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess - helsinkiOffsetMinutes(new Date(first)) * 60_000);
};

/** "06:00" — the Helsinki wall-clock time of an instant. */
export const localTime = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
