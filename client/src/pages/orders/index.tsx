import { Box, Button, Flex, Grid, Skeleton, Text } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LuChevronRight, LuRefreshCw } from 'react-icons/lu';
import { Caption, Corners, EmptyHint, PageHeader, PageIntro } from '@/components/kit';
import { Order, afterReset, useOrders, useSandbox, useStats } from '@/api/gateway';
import { currentWeek, eur, fmtDate, fmtDay, fmtTime, localDay } from './format';
import { StatusStamp, notPlaced, statusGroups, whoAsked } from './parts';

const PAGE = 20;

export const OrdersPage = () => {
  const orders = useOrders({ limit: 200 });
  const stats = useStats();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [shown, setShown] = useState(PAGE);
  // Old deep links (/app/activity?order=VA-20481) now open the run view.
  const [searchParams] = useSearchParams();
  const legacy = searchParams.get('order');

  const sandbox = useSandbox();
  const resetAt = sandbox.data?.sandbox ? sandbox.data.resetAt : null;
  // Sandbox: only what happened since the last reset.
  const all = useMemo(() => afterReset(orders.data ?? [], resetAt), [orders.data, resetAt]);
  if (legacy) return <Navigate to={`/app/runs/${legacy}`} replace />;

  const group = statusGroups.find((g) => g.value === filter)!;
  const visible = group.statuses ? all.filter((o) => group.statuses!.includes(o.status)) : all;

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <PageHeader trail={['Orders']} />
      <Box flex={1} overflowY="auto" minHeight={0}>
        <Box maxWidth="1080px" marginX="auto" paddingX={8} paddingTop={10} paddingBottom={16}>
          <PageIntro title="Orders" description="Everything agents ordered, and what the gateway decided." />

          <Summary stats={stats} orders={all} />

          {/* Filters as text tabs over a hairline; the active one is underlined in ink. */}
          <Flex gap={7} marginTop={12} borderBottomWidth="1px" borderColor="border" role="tablist">
            {statusGroups.map((f) => {
              const active = f.value === filter;
              const count = f.statuses ? all.filter((o) => f.statuses!.includes(o.status)).length : all.length;
              return (
                <Flex
                  key={f.value}
                  as="button"
                  role="tab"
                  aria-selected={active}
                  align="baseline"
                  gap={1.5}
                  height="38px"
                  paddingTop="10px"
                  marginBottom="-1px"
                  fontSize="13.5px"
                  fontWeight={active ? '600' : '500'}
                  color={active ? 'fg' : 'fg.muted'}
                  borderBottomWidth="2px"
                  borderColor={active ? 'border.strong' : 'transparent'}
                  _hover={{ color: 'fg' }}
                  transition="color 0.2s, border-color 0.2s"
                  cursor="pointer"
                  onClick={() => {
                    setFilter(f.value);
                    setShown(PAGE);
                  }}
                >
                  {f.label}
                  {orders.data ? (
                    <Text as="span" fontSize="11px" color="fg.subtle" fontWeight="400" className="tnum">
                      {count}
                    </Text>
                  ) : null}
                </Flex>
              );
            })}
          </Flex>

          {orders.isPending ? (
            <Box marginTop={6}>
              {Array.from({ length: 6 }, (_, i) => (
                <Flex key={i} height="56px" align="center" borderBottomWidth="1px" borderColor="border.muted">
                  <Skeleton height="14px" width={`${50 + ((i * 7) % 30)}%`} borderRadius="l1" />
                </Flex>
              ))}
            </Box>
          ) : orders.isError ? (
            <ErrorLine message={orders.error.message} onRetry={() => void orders.refetch()} />
          ) : visible.length ? (
            <>
              <Box marginTop={6} borderBottomWidth="1px" borderColor="border.strong">
                <LedgerHead />
                {visible.slice(0, shown).map((o) => (
                  <OrderRow key={o.id} order={o} onClick={() => navigate(`/app/runs/${o.id}`)} />
                ))}
              </Box>
              {visible.length > shown ? (
                <Flex justify="center" marginTop={4}>
                  <Button size="sm" variant="ghost" color="brand.fg" borderRadius="l2" onClick={() => setShown((n) => n + PAGE)}>
                    Show more · {visible.length - shown} older
                  </Button>
                </Flex>
              ) : null}
            </>
          ) : (
            <Box marginTop={6}>
              <EmptyHint>
                {all.length
                  ? 'Nothing here for this filter.'
                  : 'No orders yet. When an agent orders through the gateway, it shows up here.'}
              </EmptyHint>
            </Box>
          )}
        </Box>
      </Box>
    </Flex>
  );
};

/** This week at a glance: four dot-matrix counters, caps labels, hairline column rules. */
const Summary = ({ stats, orders }: { stats: ReturnType<typeof useStats>; orders: Order[] }) => {
  if (stats.isPending) return <Skeleton height="86px" borderRadius="l1" />;
  if (stats.isError)
    return <ErrorLine message={`Couldn’t load this week’s numbers: ${stats.error.message}`} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  const week = currentWeek();
  const thisWeek = orders.filter((o) => localDay(o.createdAt) >= week.start);
  const auto = thisWeek.filter((o) => o.status === 'executed' && !o.approval).length;
  const { thisWeek: spent, limitPerWeek } = s.spend;
  const figures: { label: string; value: string; note?: string; tone?: string }[] = [
    { label: s.week.ordersThisWeek === 1 ? 'Order this week' : 'Orders this week', value: String(s.week.ordersThisWeek), note: week.label },
    { label: 'Went through on their own', value: String(auto), note: s.week.ordersThisWeek ? `of ${s.week.ordersThisWeek}` : undefined },
    { label: 'Waiting for approval', value: String(s.pendingApprovals), tone: s.pendingApprovals ? 'status.pending' : undefined },
    { label: 'Spent this week', value: eur(spent, 0), note: limitPerWeek ? `of ${eur(limitPerWeek, 0)} a week` : undefined, tone: limitPerWeek && spent > limitPerWeek ? 'status.pending' : undefined },
  ];
  return (
    <Grid position="relative" templateColumns="repeat(4, minmax(0, 1fr))" bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3">
      <Corners />
      {figures.map((f, i) => (
        <Box key={f.label} paddingX={6} paddingY={5} borderLeftWidth={i ? '1px' : 0} borderColor="border" minWidth={0}>
          <Caption n={`0${i + 1}`} truncate>
            {f.label}
          </Caption>
          <Text fontFamily="dot" fontWeight="800" fontSize="40px" letterSpacing="0" lineHeight="1.1" marginTop={2} color={f.tone} className="tnum" truncate>
            {f.value}
          </Text>
          {f.note ? (
            <Text fontFamily="mono" fontSize="11px" color="fg.subtle" marginTop={1} truncate>
              {f.note}
            </Text>
          ) : null}
        </Box>
      ))}
    </Grid>
  );
};

const ErrorLine = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Flex align="center" gap={3} paddingY={3} fontSize="13px">
    <Text color="status.blocked" flex={1}>
      {message}
    </Text>
    <Button size="xs" variant="ghost" color="brand.fg" onClick={onRetry}>
      <LuRefreshCw /> Retry
    </Button>
  </Flex>
);

// Ledger columns: number · order · when · verdict · total · go.
const COLS = '92px minmax(0, 1fr) 118px 292px 104px 16px';

const LedgerHead = () => (
  <Grid templateColumns={COLS} columnGap={5} paddingBottom={2} borderBottomWidth="1px" borderColor="border.strong" textStyle="label" color="fg.subtle">
    <Text>No.</Text>
    <Text>Order</Text>
    <Text>Placed</Text>
    <Text>Verdict</Text>
    <Text textAlign="right">Total</Text>
    <span />
  </Grid>
);

const OrderRow = ({ order: o, onClick }: { order: Order; onClick: () => void }) => {
  const off = notPlaced(o);
  const amount = o.committedTotal || o.total;
  return (
    <Grid
      as="button"
      width="100%"
      textAlign="left"
      templateColumns={COLS}
      columnGap={5}
      alignItems="center"
      minHeight="58px"
      paddingY={2}
      borderBottomWidth="1px"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
      _hover={{ bg: 'bg.hover', '& .go': { color: 'fg', transform: 'translateX(2px)' } }}
      transition="background 0.2s"
      cursor="pointer"
      onClick={onClick}
    >
      <Text fontFamily="mono" fontSize="12px" color="fg.muted" truncate>
        {o.id}
      </Text>
      <Box minWidth={0}>
        <Text fontSize="14px" fontWeight="500" truncate>
          {o.title}
        </Text>
        <Text fontSize="12px" color="fg.subtle" marginTop="1px" truncate>
          {whoAsked(o)} · delivery {fmtDate(o.deliveryDate)}
        </Text>
      </Box>
      <Text fontFamily="mono" fontSize="12px" color="fg.muted" whiteSpace="nowrap">
        {fmtDay(o.createdAt)} {fmtTime(o.createdAt)}
      </Text>
      <StatusStamp order={o} />
      <Text textAlign="right" fontFamily="mono" fontSize="12.5px" color={off ? 'fg.subtle' : 'fg'}>
        {off ? '—' : eur(amount)}
      </Text>
      <Box className="go" color="fg.subtle" transition="color 0.2s, transform 0.2s">
        <LuChevronRight />
      </Box>
    </Grid>
  );
};
