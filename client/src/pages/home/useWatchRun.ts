import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OrderDetail, OrderResult } from '@/api/gateway';
import type { RunNavState } from '@/pages/playbook/parts';

/** Seeds the order cache with a fresh result and opens its run, animated step by step. */
export const useWatchRun = () => {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    (result: OrderResult) => {
      const { order, checks, quote, approval, audit } = result;
      client.setQueryData(['gw', 'order', order.id], { order, checks, quote, approval, audit } satisfies OrderDetail);
      navigate(`/app/runs/${order.id}`, { state: { fresh: true } satisfies RunNavState });
    },
    [client, navigate]
  );
};
