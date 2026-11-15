import { Box, Button, Flex, Grid, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuArrowUpRight, LuCheck } from 'react-icons/lu';
import { Link } from 'react-router-dom';
import type { ApprovalListItem, OrderDetail } from '@/api/gateway';
import { Caption, Dot, Meter, Mono, Num, Panel, RuleNo, Stamp } from '@/components/kit';
import { Details as Disclosure, Facts } from '@/pages/playbook/quiet';
import {
  Decided,
  askedLines,
  checksOf,
  clauseNo,
  eur,
  fmtDate,
  fmtDay,
  fmtQty,
  fmtTime,
  fmtWhen,
  limitCheck,
  mmss,
  num,
  orderedTotal,
  plainReason,
  proposedLines,
  proposedTotal,
  shortName,
  sumLines,
  tradeoffLine,
} from './model';
import { OrderGraph } from '@/pages/playbook/OrderGraph';
import { Receipt, Rubric, SignatureLine, decisionMeta, decisionWords, lineNote } from './parts';
import { msLeft, useClock } from './useClock';

export type DecisionKind = 'approve' | 'decline' | 'partial';

type Props = {
  item: ApprovalListItem;
  /** Full order (quote, fresh checks, audit) — loads after the list item. */
  detail: OrderDetail | undefined;
  policyLabel: string | null;
  signingAs: string;
  deciding: DecisionKind | null;
  onDecide: (kind: DecisionKind) => void;
};

/** The short word on each triggered rule's status. */
const ruleStamp = (rule: string) =>
  rule.startsWith('limit.') ? 'Over limit' : rule === 'substitution.requiresApproval' ? 'Substitute' : rule === 'stock.coverage' ? 'Short' : rule === 'data.missing' ? 'Data missing' : 'Needs OK';

/**
 * One request as a document awaiting a signature: asked vs proposed as receipts, the
 * triggered rules, then the signature line and the decision. Proof sits behind "Details".
 */
export const Detail = ({ item, detail, policyLabel, signingAs, deciding, onDecide }: Props) => {
  const now = useClock();
  const pending = item.status === 'pending';
  const checks = checksOf(item, detail?.checks);
  const day = fmtDay(item.createdAt, now);
  const approverFirst = item.approver.name.split(' ')[0];

  return (
    <Panel overflow="hidden" data-sheet={pending ? 'pending' : 'decided'}>
      {/* The sheet's head: what kind of document, its number, its stamp. */}
      <Flex align="center" gap={3} paddingX={7} height="44px" borderBottomWidth="1px" borderColor="border">
        <Caption n={item.orderId}>{pending ? 'Request for approval' : 'Decided request'}</Caption>
        <Box flex={1} />
        {pending ? <Stamp tone="pending">Needs OK</Stamp> : null}
      </Flex>

      <Box paddingX={7} paddingTop={6} paddingBottom={6}>
        {/* What, who, how much */}
        <Flex gap={8} align="start">
          <Box flex={1} minWidth={0}>
            <Text as="h2" textStyle="title" fontSize="30px" lineHeight="1.15">
              {item.order.title}
            </Text>
            <Text fontSize="13px" color="fg.muted" marginTop={2}>
              {item.agent?.name ?? 'Buyer agent'} asked {day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : `on ${day}`} at{' '}
              <Num>{fmtTime(item.createdAt)}</Num> · delivery <Num>{fmtDate(item.order.deliveryDate)}</Num>
            </Text>
          </Box>
          <Box textAlign="right" flexShrink={0}>
            <Text fontFamily="dot" fontWeight="800" fontSize="38px" letterSpacing="0" lineHeight="1" className="tnum">
              {eur(pending ? proposedTotal(item) : orderedTotal(item))}
            </Text>
            <Text textStyle="caps" color="fg.subtle" marginTop={2}>
              {pending ? 'proposed' : orderedTotal(item) ? 'ordered' : 'nothing ordered'}
            </Text>
          </Box>
        </Flex>

        {!pending ? <Outcome item={item} detail={detail} now={now} /> : null}

        {detail?.audit.length ? (
          <Box marginTop={6}>
            <OrderGraph audit={detail.audit} orderId={item.orderId} waiting={pending} />
          </Box>
        ) : null}

        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} columnGap={10} rowGap={7} marginTop={7}>
          <Asked item={item} detail={detail} />
          <Proposed item={item} pending={pending} />
        </Grid>

        <Box marginTop={8}>
          <Rubric>Why it stops for {pending ? `${approverFirst}’s OK` : 'an OK'}</Rubric>
          <Stack gap={0}>
            {item.reasons.map((r, i) => (
              <Flex key={r.rule} align="baseline" gap={4} paddingY={2.5} borderBottomWidth="1px" borderColor="border">
                <Box width="28px" flexShrink={0}>
                  <RuleNo n={clauseNo(checks, r.rule, i)} color="fg.muted" />
                </Box>
                <Text flex={1} minWidth={0} fontSize="14px" lineHeight="1.5">
                  {plainReason(r, checks)}.
                </Text>
                <Stamp tone="pending">{ruleStamp(r.rule)}</Stamp>
              </Flex>
            ))}
          </Stack>
          <Text fontSize="13.5px" lineHeight="1.6" color="fg.muted" marginTop={3} paddingLeft="44px">
            {tradeoffLine(item)}
          </Text>
        </Box>
      </Box>

      {pending ? (
        <Decide item={item} detail={detail} signingAs={signingAs} deciding={deciding} onDecide={onDecide} now={now} />
      ) : (
        <Box paddingX={7} paddingBottom={6}>
          <Box maxWidth="380px">
            <SignatureLine
              name={item.status === 'timed_out' ? 'Gateway fallback' : (item.decidedBy ?? item.approver.name)}
              caption={
                <>
                  {item.status === 'timed_out' ? 'Not signed' : 'Signed'} · {fmtDate(item.decidedAt ?? item.createdAt)} {fmtTime(item.decidedAt ?? item.createdAt)}
                  {item.signatureShort ? (
                    <>
                      {' '}
                      · <Mono>{item.signatureShort}</Mono>
                    </>
                  ) : null}
                </>
              }
            />
          </Box>
        </Box>
      )}

      <Flex align="start" gap={5} paddingX={7} paddingY={4} borderTopWidth="1px" borderColor="border" bg="bg">
        <Box flex={1} minWidth={0}>
          <Disclosure>
            <Proof item={item} detail={detail} policyLabel={policyLabel} signingAs={signingAs} now={now} />
          </Disclosure>
        </Box>
        <Link to={`/app/runs/${item.orderId}`}>
          <Flex align="center" gap={1} fontSize="12.5px" color="brand.fg" _hover={{ textDecoration: 'underline' }} whiteSpace="nowrap">
            See how the gateway decided <LuArrowUpRight />
          </Flex>
        </Link>
      </Flex>
    </Panel>
  );
};

/** The signature block: countdowns, the line to sign on, and the three answers. */
const Decide = ({
  item,
  detail,
  signingAs,
  deciding,
  onDecide,
  now,
}: Pick<Props, 'item' | 'detail' | 'signingAs' | 'deciding' | 'onDecide'> & { now: number }) => {
  const left = msLeft(item.expiresAt, now);
  const quote = detail?.quote;
  const qLeft = quote ? msLeft(quote.expiresAt, now) : 0;
  const closed = left <= 0 || !!deciding;
  const urgent = left < 5 * 60_000;
  return (
    <Box marginX={7} marginBottom={6} paddingTop={5} borderTopWidth="1px" borderColor="border.strong">
      <Grid templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) auto' }} columnGap={10} rowGap={5} alignItems="end">
        <SignatureLine name={signingAs} unsigned caption={`Your OK, recorded as signed by ${signingAs} · ${fmtDate(now)}`} />
        <Flex gap={8} justify={{ base: 'start', md: 'end' }}>
          <Box textAlign="right">
            <Text textStyle="caps" color="fg.subtle">
              {left > 0 ? 'Window closes in' : 'Window'}
            </Text>
            <Text fontSize="26px" lineHeight="1.2" marginTop={1} color={urgent ? 'status.blocked' : 'status.pending'} className="tnum">
              {left > 0 ? mmss(left) : 'closed'}
            </Text>
          </Box>
          <Box textAlign="right">
            <Text textStyle="caps" color="fg.subtle">
              Prices fixed for
            </Text>
            <Text fontSize="26px" lineHeight="1.2" marginTop={1} color="fg.muted" className="tnum" title={quote ? `Signed quote ${quote.id}` : undefined}>
              {!quote ? '··:··' : qLeft > 0 ? mmss(qLeft) : 're-quote'}
            </Text>
          </Box>
        </Flex>
      </Grid>
      {left <= 0 ? (
        <Text fontSize="12.5px" color="status.blocked" marginTop={3}>
          Time’s up — falling back…
        </Text>
      ) : null}

      <Flex align="center" gap={2.5} marginTop={6} flexWrap="wrap">
        <Button
          size="md"
          borderRadius="l2"
          bg="status.auto"
          color="status.contrast"
          fontWeight="600"
          _hover={{ bg: 'status.auto/90' }}
          disabled={closed}
          loading={deciding === 'approve'}
          onClick={() => onDecide('approve')}
          title={`Signed as ${signingAs} and added to the audit trail`}
        >
          <LuCheck /> Approve <Num>{eur(proposedTotal(item), 0)}</Num>
        </Button>
        {item.fallback.lines.length ? (
          <Button
            size="md"
            borderRadius="l2"
            variant="outline"
            color="fg"
            _hover={{ bg: 'bg.hover' }}
            disabled={closed}
            loading={deciding === 'partial'}
            onClick={() => onDecide('partial')}
          >
            Order only what’s in stock · <Num>{eur(item.fallback.total, 0)}</Num>
          </Button>
        ) : null}
        <Button
          size="md"
          borderRadius="l2"
          variant="outline"
          color="fg.muted"
          _hover={{ color: 'status.blocked', borderColor: 'status.blocked' }}
          disabled={closed}
          loading={deciding === 'decline'}
          onClick={() => onDecide('decline')}
        >
          Decline
        </Button>
      </Flex>
    </Box>
  );
};

const Outcome = ({ item, detail, now }: { item: ApprovalListItem; detail: OrderDetail | undefined; now: number }) => {
  const status = item.status as Decided;
  const total = orderedTotal(item);
  const open = detail?.order.open ?? [];
  const what =
    status === 'approved'
      ? `Ordered at the quoted prices.`
      : status === 'declined'
        ? 'Nothing was ordered. The agent was told why.'
        : total
          ? `Only the in-stock part was ordered${open.length ? ` — ${open.map((o) => fmtQty(o.quantity, o.unit)).join(' + ')} still open` : ''}.`
          : 'Nothing the policy allows on its own — nothing was ordered.';
  return (
    <Flex align="start" gap={4} marginTop={5}>
      <Stamp tone={decisionMeta[status].tone} size="lg">
        {decisionMeta[status].stamp}
      </Stamp>
      <Box minWidth={0} paddingTop="2px">
        <Text fontSize="13.5px">
          {decisionWords(item)} · <Num>{fmtWhen(item.decidedAt ?? item.createdAt, now)}</Num>
        </Text>
        <Text fontSize="13px" color="fg.muted" marginTop={0.5}>
          {item.comment ? `“${item.comment}” ` : ''}
          {what}
        </Text>
      </Box>
    </Flex>
  );
};

const Asked = ({ item, detail }: { item: ApprovalListItem; detail: OrderDetail | undefined }) => {
  const asked = askedLines(item, detail?.quote);
  // Priced only when every line has a price from the quote or the proposal.
  const total = asked.every((l) => l.price > 0) ? sumLines(asked) : null;
  return (
    <Receipt
      title="What was asked"
      lines={asked}
      total={total}
      totalLabel="At quoted prices"
      noteOf={(l) => (l.tag === 'short' && l.note ? l.note.replace(' by ', ' available by ') : null)}
      footer={
        item.order.request.note ? (
          <Text fontSize="13.5px" color="fg.muted" marginTop={3}>
            “{item.order.request.note}”
          </Text>
        ) : null
      }
    />
  );
};

const Proposed = ({ item, pending }: { item: ApprovalListItem; pending: boolean }) => {
  const nameOf = (code: string) => shortName(item.proposal?.lines.find((l) => l.code === code)?.name ?? item.order.candidates.find((c) => c.code === code)?.name ?? code);
  return (
    <Receipt
      title={pending ? 'What the gateway proposes' : 'What was proposed'}
      lines={proposedLines(item)}
      total={proposedTotal(item)}
      noteOf={(l) => {
        const forCode = item.proposal?.lines.find((x) => `${x.code}-${x.role}` === l.key)?.substituteFor;
        return lineNote(l, forCode ? nameOf(forCode) : undefined);
      }}
    />
  );
};

/** Everything technical: every check as a clause, spend meters, the signed quote, the decision signature. */
const Proof = ({ item, detail, policyLabel, signingAs, now }: { item: ApprovalListItem; detail: OrderDetail | undefined; policyLabel: string | null; signingAs: string; now: number }) => {
  const checks = checksOf(item, detail?.checks);
  const stopRules = new Set(item.reasons.map((r) => r.rule));
  const perOrder = limitCheck(checks, 'limit.perOrder');
  const perWeek = limitCheck(checks, 'limit.perWeek');
  const others = item.order.candidates.filter((c) => c.verdict !== 'picked');
  const quote = detail?.quote;
  const seq = detail?.audit.find((e) => e.step === 'approval' && e.status !== 'pending')?.seq;
  const quoteLeft = quote ? msLeft(quote.expiresAt, now) : 0;
  const mono = (v: string) => <Mono>{v}</Mono>;

  return (
    <Stack gap={7} paddingTop={2} paddingBottom={2}>
      <Box>
        <Rubric>Every clause checked</Rubric>
        {checks.map((c, i) => {
          const stopped = stopRules.has(c.rule);
          return (
            <Flex key={c.rule} gap={3} align="baseline" paddingY={1.5} borderBottomWidth="1px" borderColor="border" _last={{ borderBottomWidth: 0 }} fontSize="12.5px">
              <Box width="24px" flexShrink={0}>
                <RuleNo n={i + 1} />
              </Box>
              <Box alignSelf="center">
                <Dot tone={stopped ? (c.severity === 'hard' ? 'blocked' : 'pending') : c.passed ? 'auto' : 'blocked'} />
              </Box>
              <Text width="180px" flexShrink={0} color={stopped ? 'fg' : 'fg.muted'}>
                {c.title}
              </Text>
              <Text flex={1} minWidth={0} color="fg.muted">
                {c.detail}
              </Text>
              <Text fontFamily="mono" fontSize="11px" color="fg.subtle" flexShrink={0}>
                {c.rule}
              </Text>
            </Flex>
          );
        })}
      </Box>

      {perOrder || perWeek ? (
        <Flex gap={8}>
          {perOrder ? (
            <Box flex={1}>
              <Meter label="This order" value={perOrder.observed} max={perOrder.limit} format={(n) => eur(n, 0)} color={perOrder.passed ? 'status.auto' : 'status.pending'} />
            </Box>
          ) : null}
          {perWeek ? (
            <Box flex={1}>
              <Meter label="This week, incl. this order" value={perWeek.observed} max={perWeek.limit} format={(n) => eur(n, 0)} color={perWeek.passed ? 'status.auto' : 'status.pending'} />
            </Box>
          ) : null}
        </Flex>
      ) : null}

      {others.length ? (
        <Box>
          <Rubric>Also considered</Rubric>
          <Facts rows={others.map((c) => [shortName(c.name), <Text color="fg.muted">{c.reason}</Text>])} />
        </Box>
      ) : null}

      <Box>
        <Rubric>Proof</Rubric>
        <Facts
          rows={[
            ...(policyLabel ? ([['Policy', policyLabel]] as [string, string][]) : []),
            ['Order', mono(item.orderId)],
            ...(quote
              ? ([
                  ['Signed quote', mono(quote.id)],
                  [
                    'Quote valid',
                    <>
                      <Num>
                        {fmtTime(quote.issuedAt, true)} – {fmtTime(quote.expiresAt, true)}
                      </Num>
                      {item.status === 'pending' ? (quoteLeft > 0 ? ` · ${mmss(quoteLeft)} left` : ' · expired, re-quoted at the same prices on approval') : ''}
                    </>,
                  ],
                  ['Quote key id', mono(quote.kid)],
                  ['Quote signature', mono(`${quote.signature.slice(0, 16)}…${quote.signature.slice(-6)}`)],
                ] as [string, ReactNode][])
              : ([['Signed quote', mono(item.order.quoteId ?? '—')]] as [string, ReactNode][])),
            ['Fallback', item.fallback.lines.length ? `${item.fallback.description} (${eur(item.fallback.total)})` : 'Nothing is ordered if no one answers'],
            ...(item.status === 'pending'
              ? ([['Signing as', `${signingAs} — your decision is signed and added to the audit trail`]] as [string, string][])
              : ([
                  [
                    'Decided',
                    <>
                      {item.decidedBy ?? 'gateway'}
                      {item.decidedRole ? ` · ${item.decidedRole}` : ''} ·{' '}
                      <Num>
                        {fmtDate(item.decidedAt ?? item.createdAt)} {fmtTime(item.decidedAt ?? item.createdAt, true)}
                      </Num>
                    </>,
                  ],
                  ['Decision signature', mono(`${item.signatureShort ?? 'unsigned'}${seq ? ` · audit #${seq}` : ''}`)],
                ] as [string, ReactNode][])),
            ['Approval window', mono(`${num(Math.round((Date.parse(item.expiresAt) - Date.parse(item.createdAt)) / 60000))} min`)],
          ]}
        />
      </Box>
    </Stack>
  );
};
