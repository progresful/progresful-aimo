import { Flex, Text } from '@chakra-ui/react';
import { Stamp, Tone } from '@/components/kit';
import type { Check, Order, OrderStatus } from '@/api/gateway';
import { fmtQty } from './format';

type OrderLike = Pick<Order, 'status' | 'approval'> & Partial<Pick<Order, 'checks' | 'open'>>;

const first = (name: string) => name.split(' ')[0];

/** Why a hard rule stopped it, in a few plain words. */
const blockedWhy = (checks: Check[] = []) => {
  const c = checks.find((x) => !x.passed && x.severity === 'hard') ?? checks.find((x) => !x.passed);
  switch (c?.rule) {
    case 'nutrition.LACS':
      return 'not lactose-free';
    case 'order.nonEmpty':
      return 'nothing can arrive in time';
    case 'category.allow':
      return 'outside the allowed categories';
    case 'data.missing':
      return 'product data missing';
    default:
      return c ? c.title.toLowerCase() : null;
  }
};

/** Status in words — what the gateway decided, as the kitchen would say it. `stamp` is the short verdict, `label` the sentence. */
export const statusInfo = (o: OrderLike): { tone: Tone; stamp: string; label: string } => {
  const a = o.approval;
  const by = a?.decidedBy && a.decidedBy !== 'gateway' ? a.decidedBy : null;
  switch (o.status) {
    case 'executed':
      return a && a.status === 'approved' ? { tone: 'auto', stamp: 'Ordered', label: `approved by ${by ?? a.approver.name}` } : { tone: 'auto', stamp: 'Ordered', label: 'on its own' };
    case 'pending_approval':
      return { tone: 'pending', stamp: 'Needs OK', label: a ? `waiting for ${first(a.approver.name)}` : 'waiting for approval' };
    case 'partial':
      return { tone: 'pending', stamp: 'Partial', label: o.open?.length ? `${o.open.map((l) => fmtQty(l.quantity, l.unit)).join(' + ')} still open` : 'partly ordered' };
    case 'declined':
      return { tone: 'blocked', stamp: 'Declined', label: by ? `by ${by}` : '' };
    case 'blocked': {
      const why = blockedWhy(o.checks);
      return { tone: 'blocked', stamp: 'Blocked', label: why ?? '' };
    }
    case 'expired':
      return a?.status === 'timed_out' ? { tone: 'idle', stamp: 'No answer', label: 'nothing ordered' } : { tone: 'idle', stamp: 'Expired', label: '' };
    default:
      return { tone: 'idle', stamp: String(o.status), label: '' };
  }
};

/** The verdict as an LED and a word, with the plain-words reason beside it. */
export const StatusStamp = ({ order }: { order: OrderLike }) => {
  const d = statusInfo(order);
  return (
    <Flex align="center" gap={2.5} minWidth={0}>
      <Stamp tone={d.tone}>{d.stamp}</Stamp>
      {d.label ? (
        <Text fontSize="12.5px" color="fg.muted" truncate>
          {d.label}
        </Text>
      ) : null}
    </Flex>
  );
};

/** Filter groups. "All" also holds declined and expired orders. */
export const statusGroups: { value: string; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'pending', label: 'Needs approval', statuses: ['pending_approval'] },
  { value: 'blocked', label: 'Blocked', statuses: ['blocked', 'declined'] },
  { value: 'ordered', label: 'Ordered', statuses: ['executed', 'partial'] },
];

/** Nothing reached Valio Aimo. */
export const notPlaced = (o: Pick<Order, 'status'>) => o.status === 'blocked' || o.status === 'declined' || o.status === 'expired';

/** Who asked: a scheduled automation, a buyer agent, or you (no agent). */
export const whoAsked = (o: Pick<Order, 'agent' | 'automationId'>) => {
  if (o.automationId) return 'Automation';
  if (!o.agent) return 'You';
  return `${(o.agent.name ?? o.agent.id).replace(/\s+buyer agent$/i, '')} agent`;
};
