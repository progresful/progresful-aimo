import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDateFor, nextRunAfter, normalizeDays, scheduleLabel, slotsBetween } from '../gateway.schedule.ts';
import { helsinkiTime, localTime } from '../gateway.time.ts';

const MON_THU = { days: [1, 4], time: '06:00' };

test('next run: the next matching weekday at the Helsinki wall-clock time', () => {
  // Sat 2026-11-14 12:00 Helsinki → Mon 16 Nov 06:00 (EET, UTC+2 → 04:00Z)
  assert.equal(nextRunAfter(MON_THU, helsinkiTime('2026-11-14', '12:00'))!.toISOString(), '2026-11-16T04:00:00.000Z');
  // Monday before 06:00 → the same morning; at/after 06:00 → Thursday
  assert.equal(nextRunAfter(MON_THU, helsinkiTime('2026-11-16', '05:59'))!.toISOString(), '2026-11-16T04:00:00.000Z');
  assert.equal(nextRunAfter(MON_THU, helsinkiTime('2026-11-16', '06:00'))!.toISOString(), '2026-11-19T04:00:00.000Z');
  // Sunday-only schedule from Sunday evening → next Sunday
  assert.equal(nextRunAfter({ days: [7], time: '23:30' }, helsinkiTime('2026-11-15', '23:45'))!.toISOString(), helsinkiTime('2026-11-22', '23:30').toISOString());
  // Late-night Helsinki time whose UTC instant is the previous UTC day
  assert.equal(nextRunAfter({ days: [1], time: '01:00' }, helsinkiTime('2026-11-15', '12:00'))!.toISOString(), '2026-11-15T23:00:00.000Z');
});

test('no days → no next run; days are deduplicated and sorted', () => {
  assert.equal(nextRunAfter({ days: [], time: '06:00' }, new Date()), null);
  assert.deepEqual(normalizeDays([4, 1, 4, 9, 0]), [1, 4]);
});

test('DST: 06:00 stays 06:00 local across the spring and autumn switches', () => {
  // Europe/Helsinki: EET→EEST on Sun 2027-03-28, EEST→EET on Sun 2026-10-25.
  const beforeSpring = nextRunAfter({ days: [5], time: '06:00' }, helsinkiTime('2027-03-20', '12:00'))!; // Fri 26 Mar (EET)
  const afterSpring = nextRunAfter({ days: [5], time: '06:00' }, beforeSpring)!; // Fri 2 Apr (EEST)
  assert.equal(beforeSpring.toISOString(), '2027-03-26T04:00:00.000Z');
  assert.equal(afterSpring.toISOString(), '2027-04-02T03:00:00.000Z');
  assert.equal(localTime(afterSpring), '06:00');
  const autumn = slotsBetween({ days: [1, 2, 3, 4, 5, 6, 7], time: '06:00' }, helsinkiTime('2026-10-23', '12:00'), helsinkiTime('2026-10-27', '12:00'));
  assert.deepEqual(autumn.map(localTime), ['06:00', '06:00', '06:00', '06:00']);
  assert.equal(autumn[1].toISOString(), '2026-10-25T04:00:00.000Z'); // switch day: 04:00 → 03:00 happened before 06:00, so EET (UTC+2)
  assert.equal(autumn[0].toISOString(), '2026-10-24T03:00:00.000Z'); // EEST (UTC+3)
});

test('lead days: delivery = Helsinki run day + leadDays, even when the UTC day differs', () => {
  assert.equal(deliveryDateFor(helsinkiTime('2026-11-16', '06:00'), 1), '2026-11-17');
  assert.equal(deliveryDateFor(helsinkiTime('2026-11-16', '06:00'), 0), '2026-11-16');
  assert.equal(deliveryDateFor(helsinkiTime('2026-11-19', '06:00'), 4), '2026-11-23');
  // 00:30 Helsinki on Tue 17 Nov is still Mon 16 Nov in UTC
  assert.equal(deliveryDateFor(helsinkiTime('2026-11-17', '00:30'), 1), '2026-11-18');
});

test('schedule labels', () => {
  assert.equal(scheduleLabel({ days: [1, 4], time: '06:00', leadDays: 1 }), 'Every Mon & Thu at 06:00 · delivery next day');
  assert.equal(scheduleLabel({ days: [3], time: '06:30', leadDays: 0 }), 'Every Wed at 06:30 · delivery same day');
  assert.equal(scheduleLabel({ days: [1, 3, 5], time: '07:15', leadDays: 2 }), 'Every Mon, Wed & Fri at 07:15 · delivery in 2 days');
  assert.equal(scheduleLabel({ days: [1, 2, 3, 4, 5], time: '06:00', leadDays: 1 }), 'Every weekday at 06:00 · delivery next day');
});
