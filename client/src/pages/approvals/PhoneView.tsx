import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuBan, LuBatteryFull, LuCheck, LuChevronLeft, LuFingerprint, LuSignal, LuSplit, LuWifi } from 'react-icons/lu';
import type { ApprovalListItem, OrderDetail } from '@/api/gateway';
import { RuleNo, Num, Stamp } from '@/components/kit';
import { LogoMark } from '@/components/Logo';
import type { DecisionKind } from './Detail';
import { Decided, LineTag, askedLines, checksOf, clauseNo, eur, fmtQty, fmtTime, fmtWhen, limitCheck, mmss, orderedTotal, plainReason, proposedLines, proposedTotal, tradeoffLine } from './model';
import { decisionMeta } from './parts';
import { msLeft, useClock } from './useClock';

type Props = {
  item: ApprovalListItem;
  detail: OrderDetail | undefined;
  deciding: DecisionKind | null;
  onDecide: (kind: DecisionKind) => void;
};

/** Short product name for the phone: drop the brand and packaging noise. */
const short = (name: string) => name.replace(/^Valio\s+/, '').replace(/\s+(milk drink|lactose free|UHT)/gi, '').trim();

/** The same request as Mikko gets it on the phone: push notification + one-tap approval screen. */
export const PhoneView = ({ item, detail, deciding, onDecide }: Props) => {
  const now = useClock();
  const approverFirst = item.approver.name.split(' ')[0];
  const windowMin = Math.round((Date.parse(item.expiresAt) - Date.parse(item.createdAt)) / 60000);
  return (
    <Flex flex={1} minWidth={0} minHeight={0} overflow="auto" align="center" justify="center" gap={14} paddingX={10} paddingY={6} bg="bg">
      <Stack gap={5} width="300px" flexShrink={0}>
        <Box>
          <Text textStyle="caps" color="fg.subtle" marginBottom={2}>
            Phone preview
          </Text>
          <Text fontWeight="550" fontSize="34px" letterSpacing="-0.02em" lineHeight="1.1">
            What {approverFirst} sees on the phone
          </Text>
          <Text color="fg.muted" fontSize="14px" marginTop={3} lineHeight="1.6">
            {approverFirst} is in the kitchen, not at a desk. The same request arrives as a push notification — one tap decides, and the decision lands in the same audit trail.
          </Text>
        </Box>
        <Box padding={3} borderRadius="l3" bg="bg.panel" borderWidth="1px" borderColor="border.strong" boxShadow="float">
          <Flex align="center" gap={2}>
            <LogoMark size={18} />
            <Text fontSize="13.5px" lineHeight="1" color="fg.muted">
              AI-MO
            </Text>
            <Box flex={1} />
            <Text className="tnum" fontSize="11px" color="fg.subtle">
              {item.status !== 'pending' ? fmtWhen(item.createdAt, now) : fmtTime(item.createdAt)}
            </Text>
          </Flex>
          <Text fontSize="13.5px" fontWeight="600" marginTop={2}>
            Needs your approval · <Num>{eur(proposedTotal(item))}</Num>
          </Text>
          <Text fontSize="12.5px" color="fg.muted" lineHeight="1.45">
            {item.order.title}
          </Text>
        </Box>
        <Text fontSize="12.5px" color="fg.subtle" lineHeight="1.6" paddingTop={3} borderTopWidth="1px" borderColor="border">
          No answer in <Num>{windowMin} min</Num> → {item.fallback.lines.length ? `only the in-stock part is ordered (${eur(item.fallback.total)})` : 'nothing is ordered'}.
        </Text>
      </Stack>

      <PhoneFrame time={fmtTime(now)}>
        <PhoneScreen item={item} detail={detail} now={now} deciding={deciding} onDecide={onDecide} />
      </PhoneFrame>
    </Flex>
  );
};

const PhoneFrame = ({ time, children }: { time: string; children: ReactNode }) => (
  <Box
    flexShrink={0}
    width="372px"
    height="min(790px, calc(100vh - 110px))"
    minHeight="640px"
    padding="9px"
    borderRadius="52px"
    bg="bg.panel"
    borderWidth="1px"
    borderColor="border.strong"
    boxShadow="float"
    position="relative"
  >
    <Flex direction="column" height="100%" borderRadius="42px" overflow="hidden" bg="bg" borderWidth="1px" borderColor="border" position="relative">
      {/* Status bar + dynamic island */}
      <Flex align="center" height="50px" paddingX={7} flexShrink={0} fontSize="14px" fontWeight="600" position="relative">
        <Text fontSize="13px" className="tnum">
          {time}
        </Text>
        <Box position="absolute" left="50%" top="11px" transform="translateX(-50%)" width="110px" height="30px" borderRadius="full" bg="fg" _dark={{ bg: 'bg.canvas' }} />
        <Box flex={1} />
        <Flex gap={1.5} align="center" fontSize="15px">
          <LuSignal />
          <LuWifi />
          <LuBatteryFull />
        </Flex>
      </Flex>
      {children}
      <Box position="absolute" bottom="8px" left="50%" transform="translateX(-50%)" width="120px" height="4px" borderRadius="full" bg="fg.subtle" />
    </Flex>
  </Box>
);

const PhoneScreen = ({ item, detail, now, deciding, onDecide }: { item: ApprovalListItem; detail: OrderDetail | undefined; now: number; deciding: DecisionKind | null; onDecide: Props['onDecide'] }) => {
  const d = item.status !== 'pending';
  const total = proposedTotal(item);
  const left = msLeft(item.expiresAt, now);
  const qLeft = msLeft(detail?.quote?.expiresAt, now);
  const checks = checksOf(item, detail?.checks);
  const overLimit = [limitCheck(checks, 'limit.perOrder'), limitCheck(checks, 'limit.perWeek')].find((c) => c && !c.passed);
  const closed = left <= 0;

  return (
    <>
      <Flex align="center" gap={2} paddingX={4} height="44px" flexShrink={0} borderBottomWidth="1px" borderColor="border" bg="bg.panel">
        <Box color="brand.fg" fontSize="18px">
          <LuChevronLeft />
        </Box>
        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="19px" lineHeight="1" flex={1}>
          Approval
        </Text>
        <Num color="fg.subtle">{item.orderId}</Num>
      </Flex>

      <Box flex={1} overflowY="auto" paddingX={4} paddingTop={4} paddingBottom={4} css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {d ? (
          <PhoneDecision item={item} now={now} />
        ) : (
          <Flex align="center" gap={2}>
            <Stamp tone="pending">Needs your OK</Stamp>
            <Box flex={1} />
            <Text fontSize="13px" color={left < 5 * 60_000 ? 'status.blocked' : 'status.pending'} className="tnum">
              {mmss(left)} left
            </Text>
          </Flex>
        )}

        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="26px" lineHeight="1.12" marginTop={4}>
          {item.order.title}
        </Text>
        <Text fontSize="12px" color="fg.subtle" marginTop={1.5}>
          {item.agent?.name ?? 'Buyer agent'} · {fmtWhen(item.createdAt, now)}
        </Text>

        <Flex align="baseline" gap={2} marginTop={4}>
          <Text fontFamily="dot" fontWeight="800" fontSize="36px" letterSpacing="0" lineHeight="1.1" className="tnum">
            {eur(total)}
          </Text>
          {overLimit ? (
            <Text className="tnum" fontSize="11px" color="status.pending">
              {overLimit.rule === 'limit.perWeek' ? `week ${eur(overLimit.observed, 0)} / ${eur(overLimit.limit, 0)}` : `limit ${eur(overLimit.limit, 0)}`}
            </Text>
          ) : null}
        </Flex>

        <PhoneBlock title="What was asked">
          {askedLines(item, detail?.quote).map((l) => (
            <PhoneLine key={l.key} qty={fmtQty(l.qty, l.unit)} name={short(l.name)} />
          ))}
        </PhoneBlock>
        <PhoneBlock title="What the gateway proposes">
          {proposedLines(item).map((l) => (
            <PhoneLine key={l.key} qty={fmtQty(l.qty, l.unit)} name={short(l.name)} tag={l.tag && l.tag !== 'short' ? l.tag : undefined} />
          ))}
        </PhoneBlock>

        <PhoneBlock title="Why it needs approval">
          {item.reasons.map((r, i) => (
            <Flex key={r.rule} gap={2.5} align="baseline" paddingY={1}>
              <Box width="20px" flexShrink={0}>
                <RuleNo n={clauseNo(checks, r.rule, i)} />
              </Box>
              <Text fontSize="13px" lineHeight="1.5">
                {plainReason(r, checks)}.
              </Text>
            </Flex>
          ))}
          <Text fontSize="13px" lineHeight="1.55" color="fg.muted" marginTop={1.5}>
            {tradeoffLine(item)}
          </Text>
        </PhoneBlock>

        <Flex align="center" gap={2} marginTop={3} fontSize="11.5px" color="fg.subtle">
          <LuFingerprint />
          <Text truncate>{d ? 'Prices were fixed by a signed quote' : !detail?.quote ? 'Signed quote…' : qLeft > 0 ? `Prices fixed for ${mmss(qLeft)}` : 'Re-quoted at the same prices on approval'}</Text>
        </Flex>
      </Box>

      {!d ? (
        <Stack gap={2} paddingX={4} paddingTop={3} paddingBottom={7} borderTopWidth="1px" borderColor="border" bg="bg.panel" flexShrink={0}>
          <PhoneButton primary disabled={closed || !!deciding} onClick={() => onDecide('approve')}>
            <LuCheck /> {deciding === 'approve' ? 'Signing…' : `Approve ${eur(total)}`}
          </PhoneButton>
          <Flex gap={2}>
            {item.fallback.lines.length ? (
              <PhoneButton disabled={closed || !!deciding} onClick={() => onDecide('partial')}>
                <LuSplit /> In-stock only
              </PhoneButton>
            ) : null}
            <PhoneButton danger disabled={closed || !!deciding} onClick={() => onDecide('decline')}>
              <LuBan /> Decline
            </PhoneButton>
          </Flex>
        </Stack>
      ) : null}
    </>
  );
};

const PhoneDecision = ({ item, now }: { item: ApprovalListItem; now: number }) => {
  const status = item.status as Decided;
  const meta = decisionMeta[status];
  const total = orderedTotal(item);
  return (
    <Flex direction="column" align="center" textAlign="center" paddingY={3}>
      <Stamp tone={meta.tone} size="lg">
        {meta.stamp}
      </Stamp>
      {meta.label !== meta.stamp ? (
        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="20px" marginTop={4}>
          {meta.label}
        </Text>
      ) : null}
      <Text fontSize="12px" color="fg.muted" marginTop={meta.label !== meta.stamp ? 0.5 : 4}>
        {item.status === 'timed_out' ? 'Gateway fallback' : item.decidedBy} · {fmtWhen(item.decidedAt ?? item.createdAt, now)}
      </Text>
      <Text className="tnum" fontSize="11.5px" color="fg.subtle" marginTop={0.5}>
        {total ? `Ordered ${eur(total)}` : 'Nothing ordered'}
      </Text>
    </Flex>
  );
};

const PhoneBlock = ({ title, children }: { title: string; accent?: boolean; children: ReactNode }) => (
  <Box marginTop={5}>
    <Text textStyle="caps" color="fg.subtle" paddingBottom={1.5} marginBottom={1} borderBottomWidth="1px" borderColor="border">
      {title}
    </Text>
    {children}
  </Box>
);

const tagWords: Partial<Record<LineTag, string>> = { substitute: 'Substitute', blocked: 'Blocked', 'not-ordered': 'Not ordered' };

const PhoneLine = ({ qty, name, tag }: { qty: string; name: string; code?: string; tag?: LineTag }) => (
  <Flex gap={2.5} align="baseline" fontSize="13px" paddingY={1}>
    <Text fontSize="12px" color="fg.muted" width="58px" flexShrink={0} className="tnum">
      {qty}
    </Text>
    <Box flex={1} minWidth={0}>
      <Text truncate>{name}</Text>
      {tag && tagWords[tag] ? (
        <Text fontSize="12px" color={tag === 'substitute' ? 'status.pending' : 'fg.subtle'}>
          {tagWords[tag]}
        </Text>
      ) : null}
    </Box>
  </Flex>
);

const PhoneButton = ({ children, onClick, primary, danger, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) => (
  <Flex
    as="button"
    flex={primary ? 'none' : 1}
    flexShrink={0}
    align="center"
    justify="center"
    gap={2}
    height={primary ? '48px' : '42px'}
    borderRadius="l2"
    fontSize={primary ? '15px' : '13.5px'}
    fontWeight="600"
    bg={primary ? 'status.auto' : 'bg.panel'}
    borderWidth={primary ? 0 : '1px'}
    borderColor="border.emphasized"
    color={primary ? 'status.contrast' : danger ? 'status.blocked' : 'fg'}
    _hover={{ opacity: 0.9 }}
    _active={{ transform: 'scale(0.98)' }}
    transition="transform 0.1s"
    cursor={disabled ? 'not-allowed' : 'pointer'}
    opacity={disabled ? 0.5 : 1}
    {...{ disabled }}
    onClick={disabled ? undefined : onClick}
  >
    {children}
  </Flex>
);
