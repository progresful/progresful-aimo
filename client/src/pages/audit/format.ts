import { keyframes } from '@emotion/react';
import type { AuditEntry } from '@/api/gateway';

export type HashState = 'idle' | 'checking' | 'ok' | 'bad';

export const tick = keyframes`
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); }
`;

export const slideIn = keyframes`
  from { transform: translateX(16px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

export const time = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Helsinki' }) +
    '.' +
    String(d.getUTCMilliseconds()).padStart(3, '0')
  );
};

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Helsinki' });

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Helsinki',
    timeZoneName: 'short',
  });

export const entryJson = (e: AuditEntry) => JSON.stringify(e, null, 2);

/** "2026-11-13" for an instant, in Helsinki. */
export const localDay = (iso: string | number) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
