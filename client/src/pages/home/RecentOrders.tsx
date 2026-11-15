import { Box, Flex, Skeleton, Text } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';
import { afterReset, Order, useAutomations, useOrders, useSandbox } from '@/api/gateway';
import { EmptyHint, Stamp } from '@/components/kit';
import { composerText, eur } from '@/pages/playbook/graph';
import { doneSentence } from '@/pages/workspace/model';
import { Fig, InkLink, Ledger, LedgerRow } from './Ledger';
import { when } from './format';

const COLUMNS = '76px 104px minmax(0, 1fr) 96px 92px 14px';

// The status word for a finished order; the colour comes from doneSentence so it matches the order page.
const stampWord: Partial<Record<Order['status'], string>> = {
  executed: 'Ordered',
  partial: 'Partly',
  declined: 'Declined',
  blocked: 'Blocked',
  expired: 'Timed out',
};

/**
 * The last five orders — number, status LED, request, when, the total; each opens on its order. Orders
 * waiting for an approval are under "Waiting for you" instead. Plus where standing orders live.
 */
export const RecentOrders = () => {
  const orders = useOrders({ limit: 20 });
  const automations = useAutomations();
  const sandbox = useSandbox();
  const resetAt = sandbox.data?.sandbox ? sandbox.data.resetAt : null;
  const recent = afterReset(orders.data ?? [], resetAt)
    .filter((o) => o.status !== 'pending_approval')
    .slice(0, 5);
  const standing = automations.data?.length ?? 0;

  return (
    <Box>
      <Ledger n="03" title="Log · recent orders" action={<InkLink to="/app/activity">All orders</InkLink>}>
        {orders.isLoading ? (
          <Skeleton height="230px" borderRadius="0" />
        ) : recent.length ? (
          recent.map((o) => (
            <LedgerRow key={o.id} to={`/app/runs/${o.id}`} columns={COLUMNS}>
              <Fig color="fg.subtle">{o.id}</Fig>
              <Box>
                <Stamp tone={doneSentence(o).tone}>{stampWord[o.status] ?? o.status}</Stamp>
              </Box>
              <Text fontSize="14px" fontWeight="500" truncate>
                {composerText(o) ?? o.title}
              </Text>
              <Fig color="fg.subtle">{when(o.createdAt)}</Fig>
              <Fig align="right">{o.committedTotal ? eur(o.committedTotal) : '—'}</Fig>
            </LedgerRow>
          ))
        ) : (
          <Box padding={4}>
            <EmptyHint>No orders yet.</EmptyHint>
          </Box>
        )}
      </Ledger>
      {/* Standing orders, as one more line under the log. */}
      <Link to="/app/standing">
        <Flex
          align="center"
          gap={2}
          marginTop={3}
          paddingX={4}
          textStyle="label"
          color="fg.muted"
          _hover={{ color: 'brand.fg', '& .go': { transform: 'translateX(2px)' } }}
          transition="color 0.15s"
        >
          <Text>Standing orders</Text>
          <Box flex={1} height="1px" bg="border" />
          <Fig color="inherit">{standing ? `${standing} scheduled` : 'none yet'}</Fig>
          <Box className="go" alignSelf="center" transition="transform 0.2s">
            <LuArrowRight />
          </Box>
        </Flex>
      </Link>
    </Box>
  );
};
