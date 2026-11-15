import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Apikey } from '@/types';

export const useApikeys = () => {
  const [apikeys, setApikeys] = useState<Apikey[]>([]);

  const listApiKeys = async () => {
    const data = await authClient.apiKey.list();
    return (data as unknown as Apikey[]) ?? [];
  };

  const refreshApiKeys = useCallback(async () => {
    const data = await authClient.apiKey.list();
    setApikeys(data ?? []);
  }, []);

  const deleteApiKey = useCallback(
    async (keyId: string) => {
      await authClient.apiKey.delete({ keyId });
      refreshApiKeys();
    },
    [refreshApiKeys]
  );

  useEffect(() => {
    listApiKeys().then((res) => setApikeys(res ?? []));
  }, []);

  return { apikeys, refreshApiKeys, deleteApiKey };
};
