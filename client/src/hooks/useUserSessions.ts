import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { UserSession } from '@/types';

export const useUserSessions = () => {
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);

  const listSessions = async () => {
    const data = await authClient.listSessions();
    return (data as unknown as UserSession[]) ?? [];
  };

  const revokeUserSession = useCallback(async (token: string) => {
    await authClient.revokeSession({ token });
  }, []);

  const revokeOtherUserSessions = useCallback(async () => {
    await authClient.revokeOtherSessions();
  }, []);

  useEffect(() => {
    listSessions().then((res) => setUserSessions(res ?? []));
  }, []);

  return { userSessions, revokeUserSession, revokeOtherUserSessions };
};
