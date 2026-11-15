import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Account } from '@/types';

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);

  const listAccounts = async () => {
    const data = await authClient.listAccounts();
    return (data as unknown as Account[]) ?? [];
  };

  useEffect(() => {
    listAccounts().then((res) => setAccounts(res ?? []));
  }, []);

  return { accounts };
};
