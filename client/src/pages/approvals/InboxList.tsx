import { Box, Grid, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuChevronRight } from 'react-icons/lu';
import type { ApprovalListItem } from '@/api/gateway';
import { Stamp } from '@/components/kit';
import { eur, fmtWhen, mmss, orderedTotal, proposedTotal } from './model';
import { decisionMeta, decisionWords } from './parts';
import { msLeft, useClock } from './useClock';

// Inbox columns: number · what · verdict or countdown · total · go.
const COLS = '88px minmax(0, 1fr) 96px 104px 16px';

/** A waiting request folded shut: number, what, time left, cost. */
export const PendingRow = ({ item, onClick }: { item: ApprovalListItem; onClick: () => void }) => {
  const now = useClock();
  const left = msLeft(item.expiresAt, now);
  return (
    <Row onClick={onClick}>
      <Text className="tnum" fontSize="12px" color="fg.muted">
        {item.orderId}
      </Text>
      <Text minWidth={0} fontSize="14px" fontWeight="500" truncate>
        {item.order.title}
      </Text>
      <Text fontSize="12.5px" className="tnum" color={left < 5 * 60_000 ? 'status.blocked' : 'status.pending'} whiteSpace="nowrap">
        {left > 0 ? `${mmss(left)} left` : 'time’s up'}
      </Text>
      <Text fontSize="13px" textAlign="right" className="tnum">
        {eur(proposedTotal(item))}
      </Text>
      <Box className="go" color="fg.subtle" transition="color 0.2s, transform 0.2s">
        <LuChevronRight />
      </Box>
    </Row>
  );
};

/** A decided request: stamp, what, "Approved by Mikko Laine · Fri 14:02", what was ordered. */
export const HistoryRow = ({ item, onClick }: { item: ApprovalListItem; onClick: () => void }) => {
  const now = useClock(30_000);
  const status = item.status === 'pending' ? null : decisionMeta[item.status];
  const total = orderedTotal(item);
  return (
    <Row onClick={onClick}>
      <Text className="tnum" fontSize="12px" color="fg.muted">
        {item.orderId}
      </Text>
      <Box minWidth={0}>
        <Text fontSize="13.5px" truncate>
          {item.order.title}
        </Text>
        <Text fontSize="12px" color="fg.subtle" truncate>
          {decisionWords(item)} · {fmtWhen(item.decidedAt ?? item.createdAt, now)}
        </Text>
      </Box>
      <Box>{status ? <Stamp tone={status.tone}>{status.stamp}</Stamp> : null}</Box>
      <Text fontSize="13px" textAlign="right" className="tnum" color={total ? 'fg' : 'fg.subtle'}>
        {total ? eur(total) : '—'}
      </Text>
      <Box className="go" color="fg.subtle" transition="color 0.2s, transform 0.2s">
        <LuChevronRight />
      </Box>
    </Row>
  );
};

const Row = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <Grid
    as="button"
    width="100%"
    textAlign="left"
    templateColumns={COLS}
    columnGap={5}
    alignItems="center"
    paddingX={2}
    minHeight="56px"
    paddingY={2}
    borderBottomWidth="1px"
    borderColor="border.muted"
    _hover={{ bg: 'bg.hover', '& .go': { color: 'fg', transform: 'translateX(2px)' } }}
    transition="background 0.2s"
    cursor="pointer"
    onClick={onClick}
  >
    {children}
  </Grid>
);
