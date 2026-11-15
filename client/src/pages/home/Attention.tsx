import { Box, Text } from '@chakra-ui/react';
import { useApprovals } from '@/api/gateway';
import { Stamp } from '@/components/kit';
import { eur } from '@/pages/playbook/graph';
import { Fig, Ledger, LedgerRow } from './Ledger';
import { relative } from './format';

const first = (name: string) => name.trim().split(/\s+/)[0];

const COLUMNS = '76px minmax(0, 1fr) 112px 92px 14px';

/** "Waiting for you" — orders paused for an approval; each opens on its order. Renders nothing when all is clear. */
export const Attention = () => {
  const approvals = useApprovals({ status: 'pending' });
  const pending = [...(approvals.data ?? [])].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  if (!pending.length) return null;

  return (
    <Ledger n="02" title={`Hold · waiting for you · ${pending.length}`}>
      {pending.slice(0, 5).map((a) => (
        <LedgerRow key={a.id} to={`/app/runs/${a.order.id}`} columns={COLUMNS}>
          <Fig color="fg.subtle">{a.order.id}</Fig>
          <Box minWidth={0}>
            <Text fontSize="14px" fontWeight="500" truncate>
              {a.order.request.note || a.order.title}
            </Text>
            <Box marginTop={1}>
              <Stamp tone="pending">Needs {first(a.approver.name)}’s OK</Stamp>
            </Box>
          </Box>
          <Fig color="status.pending">{relative(a.expiresAt).replace(/^in /, '')} left</Fig>
          <Fig align="right">{a.proposal ? eur(a.proposal.total) : '—'}</Fig>
        </LedgerRow>
      ))}
    </Ledger>
  );
};
