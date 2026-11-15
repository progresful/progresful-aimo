import { addDays, helsinkiTime, localDay, weekday } from './gateway.time.ts';

// Schedule math for automations (pure — no I/O, unit-tested). A schedule is a
// set of ISO weekdays and a Helsinki wall-clock time; each slot is the instant
// of that wall-clock time on that day, so 06:00 stays 06:00 across DST.

export type Schedule = { days: number[]; time: string; leadDays: number };

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const normalizeDays = (days: number[]) => [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);

/** The first slot strictly after `after`, or null when the schedule has no days. */
export const nextRunAfter = (schedule: Pick<Schedule, 'days' | 'time'>, after: Date): Date | null => {
  const days = new Set(normalizeDays(schedule.days));
  if (!days.size) return null;
  const start = addDays(localDay(after), -1);
  for (let i = 0; i <= 15; i++) {
    const day = addDays(start, i);
    if (!days.has(weekday(day))) continue;
    const at = helsinkiTime(day, schedule.time);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
};

/** Every slot in (from, to] — used to count what a restart missed. */
export const slotsBetween = (schedule: Pick<Schedule, 'days' | 'time'>, from: Date, to: Date) => {
  const slots: Date[] = [];
  for (let at = nextRunAfter(schedule, from); at && at <= to; at = nextRunAfter(schedule, at)) slots.push(at);
  return slots;
};

/** Delivery date for a run that happens at `runAt`: its Helsinki day + leadDays. */
export const deliveryDateFor = (runAt: Date, leadDays: number) => addDays(localDay(runAt), leadDays);

const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`);

const daysLabel = (days: number[]) => {
  const d = normalizeDays(days);
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Every weekday';
  if (d.join() === '6,7') return 'Every weekend day';
  return `Every ${joinAnd(d.map((x) => DAY_SHORT[x - 1]))}`;
};

const leadLabel = (leadDays: number) => (leadDays === 0 ? 'delivery same day' : leadDays === 1 ? 'delivery next day' : `delivery in ${leadDays} days`);

/** "Every Mon & Thu at 06:00 · delivery next day". */
export const scheduleLabel = (s: Schedule) => `${daysLabel(s.days)} at ${s.time} · ${leadLabel(s.leadDays)}`;

/** Scheduled slots older than this are skipped instead of run late. */
export const MISSED_SLOT_GRACE_MS = 2 * 60 * 60 * 1000;
