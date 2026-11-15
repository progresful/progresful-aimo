import { decodeTime } from 'ulid';

export const getTimestampFromUlid = (ulid: string): number => {
  return decodeTime(ulid);
};

export const getUlidAge = (ulid: string): number => {
  const timestamp = getTimestampFromUlid(ulid);
  return Date.now() - timestamp;
};

export const isUlidOlderThan = (ulid: string, maxAgeDays: number): boolean => {
  return getUlidAge(ulid) > maxAgeDays * 24 * 60 * 60 * 1000;
};
