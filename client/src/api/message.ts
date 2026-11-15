import { MyMessage } from '@/types';
import { doFetch } from './fetch';

export async function getMyMessages(): Promise<MyMessage[]> {
  return doFetch('/api/message');
}
