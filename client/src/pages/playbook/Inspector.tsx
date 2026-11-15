import { Box, Button, Flex, IconButton, Skeleton, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconType } from 'react-icons';
import { LuArrowRight, LuX } from 'react-icons/lu';
import { RuleNo, Mono, Num, Section, Stamp, Tone } from '@/components/kit';
import type { Candidate, Check, OrderDetail, Quote } from '@/api/gateway';
import { eur, fmtDay, hkiTime, num, shortHash, shortSig, steps } from './graph';
import { Details, Facts, StatusText } from './quiet';
import { useNow } from './useNow';
import { RunState } from './useRun';
import { kindLabel } from './visuals';

export type Decision = 'approve' | 'decline' | 'partial';

type Props = {
  stepId: string;
  run: RunState;
  /** The order on the graph, fresh from the gateway (quote, checks, candidates, approval). */
  detail: OrderDetail | null;
  detailLoading: boolean;
  deciding: Decision | null;
  onClose: () => void;
  onDecide: (decision: Decision) => void;
  /** Label for the close button, e.g. "Summary" when closing returns to the run summary. */
  closeLabel?: string;
  /** The graph shows a dry run (order workspace): words in the conditional, nothing happened yet. */
  preview?: boolean;
  /** Step-specific actions under the evidence (e.g. "Use Mon 16 Nov"). */
  extra?: ReactNode;
  /** Title / description / icon / number for a graph built from the policy (playbook editor), instead of the static step's. */
  stepOverride?: { title: string; description: string; icon?: IconType; no?: string };
};

const stepTone: Record<string, Tone> = {
  auto: 'auto',
  pending: 'pending',
  blocked: 'blocked',
  running: 'running',
  idle: 'idle',
  skipped: 'idle',
};
const stepWords: Record<string, string> = {
  auto: 'Passed',
  pending: 'Needed a person',
  blocked: 'Blocked',
  running: 'Checking…',
  idle: 'Not reached',
  skipped: 'Not needed',
};
const previewWords: Record<string, string> = {
  auto: 'Would pass',
  pending: 'Would need a person',
  blocked: 'Would be blocked',
  running: 'Checking…',
  idle: 'Not reached',
  skipped: 'Not needed',
};

/** One step of the graph: what it does, and what it decided for this order. */
export const StepInspector = ({
  stepId,
  run,
  detail,
  detailLoading,
  deciding,
  onClose,
  onDecide,
  closeLabel,
  preview,
  extra,
  stepOverride,
}: Props) => {
  const words = preview ? previewWords : stepWords;
  const base = steps.find((s) => s.id === stepId)!;
  const step = stepOverride ? { ...base, ...stepOverride } : base;
  const status = run.statuses[step.id] ?? 'idle';
  const hasRun = status !== 'idle' && status !== 'skipped' && status !== 'running';
  const approvalOpen = step.id === 'approval' && detail?.approval?.status === 'pending' && run.statuses.approval === 'pending';
  const no = stepOverride?.no ?? String(steps.findIndex((s) => s.id === step.id) + 1).padStart(2, '0');

  return (
    <Stack gap={5} padding={5}>
      <SheetHead
        eyebrow={
          <>
            Step <Num>{no}</Num> · {kindLabel[step.kind]}
          </>
        }
        title={step.title}
        onClose={onClose}
        closeLabel={closeLabel}
      >
        {run.orderId ? (
          <StatusText tone={stepTone[status] ?? 'idle'} size="12.5px">
            {words[status] ?? status}
          </StatusText>
        ) : null}
      </SheetHead>

      <Text color="fg.muted" fontSize="13px" lineHeight="1.6">
        {step.description}
      </Text>

      {approvalOpen && detail?.approval ? <ApprovalCard detail={detail} deciding={deciding} onDecide={onDecide} /> : null}

      {!run.orderId ? null : hasRun ? (
        <Section title={preview ? 'What would happen' : 'In this order'}>
          {detail ? (
            <Evidence stepId={step.id} run={run} detail={detail} preview={preview} />
          ) : detailLoading ? (
            <Stack gap={2}>
              <Skeleton height="16px" borderRadius="l2" />
              <Skeleton height="48px" borderRadius="l2" />
            </Stack>
          ) : (
            <Text fontSize="13px" color="fg.subtle">
              Couldn’t load this order from the gateway.
            </Text>
          )}
        </Section>
      ) : (
        <Text fontSize="13px" color="fg.subtle">
          {status === 'skipped'
            ? `Not needed — ${lastEntry(run, step.id)?.message ?? 'the order never reached this step.'}`
            : status === 'running'
              ? 'Checking…'
              : 'The order didn’t reach this step.'}
        </Text>
      )}

      {extra}
    </Stack>
  );
};

/**
 * The head of a side sheet: a caps eyebrow ("Step 03 · Valio Aimo", "Rule of the mandate"),
 * the title — a rule shows its R number in front — and a close control.
 */
export const SheetHead = ({
  eyebrow,
  title,
  clause,
  onClose,
  closeLabel,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  /** A rule number ("R03"), set in front of the title. */
  clause?: string;
  onClose: () => void;
  closeLabel?: string;
  children?: ReactNode;
}) => (
  <Flex align="start" gap={3}>
    <Box flex={1} minWidth={0}>
      <Text textStyle="caps" color="fg.subtle">
        {eyebrow}
      </Text>
      <Flex align="baseline" gap={2.5} marginTop={2}>
        {clause ? <RuleNo n={clause} color="brand.fg" /> : null}
        <Text textStyle="title" fontSize="24px" minWidth={0}>
          {title}
        </Text>
      </Flex>
      {children ? <Box marginTop={1.5}>{children}</Box> : null}
    </Box>
    {closeLabel ? (
      <Button size="xs" variant="ghost" color="fg.muted" onClick={onClose}>
        {closeLabel}
      </Button>
    ) : (
      <IconButton aria-label="Close" variant="ghost" size="xs" color="fg.muted" marginTop={-1} marginRight={-1.5} onClick={onClose}>
        <LuX />
      </IconButton>
    )}
  </Flex>
);

const lastEntry = (run: RunState, stepId: string) => [...run.log].reverse().find((e) => e.step === stepId);

const Said = ({ children }: { children: ReactNode }) => (
  <Text fontSize="13px" lineHeight="1.55">
    {children}
  </Text>
);

const Evidence = ({ stepId, run, detail, preview }: { stepId: string; run: RunState; detail: OrderDetail; preview?: boolean }) => {
  const entry = lastEntry(run, stepId);
  const message = entry ? <Said>{entry.message}</Said> : null;
  const { order, quote, approval } = detail;
  const checks = (detail.checks ?? order.checks ?? []) as Check[];
  const nameOf = (code: string) =>
    order.lines.find((l) => l.code === code)?.name ?? quote?.lines.find((l) => l.code === code)?.name ?? code;

  switch (stepId) {
    case 'request':
      return (
        <Stack gap={3}>
          <Facts
            rows={[
              ['Asked by', order.agent?.name ?? order.agent?.id ?? '—'],
              ['Delivery', fmtDay(order.request.requestedDate ?? order.deliveryDate)],
              ...order.request.lines.map((l): [ReactNode, ReactNode] => [nameOf(l.code), `${num(l.quantity)} ${l.unit}`]),
            ]}
          />
          <Details>
            <Stack gap={1} fontSize="12px" color="fg.subtle">
              {entry ? <Text>{entry.message}</Text> : null}
              <Text>
                Policy <Mono>{`${order.policy.key} v${order.policy.version}`}</Mono>
              </Text>
              {order.request.lines.map((l) => (
                <Text key={l.code}>
                  <Mono>{l.code}</Mono> · {num(l.quantity)} {l.unit}
                </Text>
              ))}
            </Stack>
          </Details>
        </Stack>
      );
    case 'lookup':
      return quote ? (
        <QuoteEvidence quote={quote} message={message} />
      ) : (
        <Stack gap={3}>
          {message}
          <Text fontSize="13px" color="fg.subtle">
            No quote on this order.
          </Text>
        </Stack>
      );
    case 'stock': {
      const day = order.request.requestedDate ?? order.deliveryDate;
      const coverage = order.request.lines.map((l) => {
        const q = quote?.lines.find((x) => x.code === l.code);
        const available = q ? q.deliveries.filter((d) => d.date <= day).reduce((s, d) => s + d.amount, 0) * (q.salesUnit.contains || 1) : 0;
        return {
          ...l,
          available,
          deliveries: q?.deliveries ?? [],
          simulatedCap: q?.simulatedCap ?? null,
          cutoffPassed: !!q?.cutoffPassed,
          closingTime: q?.closingTime ?? null,
        };
      });
      return (
        <Stack gap={3}>
          {message}
          {coverage.map((c) => (
            <Box key={c.code}>
              <StatusText tone={c.available >= c.quantity ? 'auto' : 'pending'}>
                <Text as="span" color="fg">
                  {c.available >= c.quantity ? 'Enough' : `${num(Math.min(c.available, c.quantity))} of ${num(c.quantity)} ${c.unit}`} by{' '}
                  {fmtDay(day)}
                </Text>
              </StatusText>
              <Text fontSize="12.5px" color="fg.subtle" paddingLeft="13px">
                {nameOf(c.code)}
              </Text>
              {c.simulatedCap !== null ? (
                <Text fontSize="12px" color="fg.subtle" paddingLeft="13px">
                  Simulated supply disruption (capped at {num(c.simulatedCap)}).
                </Text>
              ) : null}
              {c.cutoffPassed ? (
                <Text fontSize="12px" color="status.blocked" paddingLeft="13px">
                  Order cut-off has passed.
                </Text>
              ) : null}
            </Box>
          ))}
          <Details label="Delivery lines">
            <Stack gap={2}>
              {coverage.map((c) => (
                <Box key={c.code} fontSize="12px" color="fg.subtle">
                  <Mono>{c.code}</Mono>
                  {c.deliveries.map((d) => (
                    <Text key={d.date}>
                      {fmtDay(d.date)}: {stockAmount(d.amount)} {d.salesUnit}
                      {d.date > day ? ' · too late' : ''}
                    </Text>
                  ))}
                  {c.closingTime ? <Text>Cut-off {hkiDateTime(c.closingTime)}</Text> : null}
                </Box>
              ))}
            </Stack>
          </Details>
        </Stack>
      );
    }
    case 'substitutes':
    case 'lactose': {
      const ranked = [...order.candidates].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.score - a.score);
      return (
        <Stack gap={3}>
          {message}
          {ranked.length ? (
            <Box borderTopWidth="1px" borderColor="border.muted">
              {ranked.map((c) => (
                <CandidateRow key={`${c.for}-${c.code}`} candidate={c} />
              ))}
            </Box>
          ) : (
            <Text fontSize="13px" color="fg.subtle">
              No substitutes were needed.
            </Text>
          )}
          {ranked.length ? (
            <Details>
              <Stack gap={1} fontSize="12px" color="fg.subtle">
                {ranked.map((c) => (
                  <Text key={`${c.for}-${c.code}`}>
                    <Mono>{c.code}</Mono> · LACS {c.lacs ?? '—'} g/100 g · score {c.score.toFixed(2)} · reliability{' '}
                    {c.reliability.toFixed(2)} · {eur(c.pricePerBase)}/{c.salesUnit.includes('kg') ? 'kg' : 'l'}
                  </Text>
                ))}
              </Stack>
            </Details>
          ) : null}
        </Stack>
      );
    }
    case 'policy': {
      const perOrder = checks.find((c) => c.rule === 'limit.perOrder');
      const perWeek = checks.find((c) => c.rule === 'limit.perWeek');
      const failing = checks.filter((c) => !c.passed);
      const passing = checks.filter((c) => c.passed);
      return (
        <Stack gap={3}>
          {perOrder && typeof perOrder.observed === 'number' ? (
            <Said>
              This order is {eur(perOrder.observed, 0)} of the {eur(Number(perOrder.limit), 0)} per-order limit
              {perWeek && typeof perWeek.observed === 'number'
                ? `; the week comes to ${eur(perWeek.observed, 0)} of ${eur(Number(perWeek.limit), 0)}.`
                : '.'}
            </Said>
          ) : (
            message
          )}
          {failing.map((c) => (
            <CheckRow key={c.rule} check={c} />
          ))}
          {passing.length ? (
            <Details label={`${passing.length} other check${passing.length > 1 ? 's' : ''} passed`}>
              <Stack gap={2}>
                {passing.map((c) => (
                  <CheckRow key={c.rule} check={c} />
                ))}
              </Stack>
            </Details>
          ) : null}
        </Stack>
      );
    }
    case 'approval': {
      const reasons = arr<{ rule: string; detail: string }>(entry?.payload?.reasons);
      return (
        <Stack gap={3}>
          {message}
          {preview && !approval
            ? reasons.map((r) => (
                <Text key={r.rule} fontSize="13px" color="fg.muted">
                  {r.detail}
                </Text>
              ))
            : null}
          {approval ? (
            <>
              {approval.reasons.map((r) => (
                <Text key={r.rule} fontSize="13px" color="fg.muted">
                  {r.detail}
                </Text>
              ))}
              <Facts
                rows={[
                  ['Approver', `${approval.approver.name}, ${approval.approver.role}`],
                  ...(approval.decidedAt
                    ? ([
                        [
                          'Decided by',
                          `${approval.decidedBy}${approval.decidedRole && approval.decidedRole !== 'system' ? `, ${approval.decidedRole}` : ''}`,
                        ],
                        ['When', `${fmtDay(approval.decidedAt)} ${hkiTime(approval.decidedAt).slice(0, 5)}`],
                        ...(approval.comment ? [['Comment', approval.comment] as [ReactNode, ReactNode]] : []),
                      ] as [ReactNode, ReactNode][])
                    : [['Window closes', <WindowLeft key="w" expiresAt={approval.expiresAt} />] as [ReactNode, ReactNode]]),
                ]}
              />
              {approval.signatureShort || approval.reasons.length ? (
                <Details>
                  <Stack gap={1} fontSize="12px" color="fg.subtle">
                    {approval.signatureShort ? (
                      <Text>
                        Signature <Mono>{approval.signatureShort}</Mono>
                      </Text>
                    ) : null}
                    {approval.reasons.map((r) => (
                      <Text key={r.rule}>
                        Rule <Mono>{r.rule}</Mono>
                      </Text>
                    ))}
                  </Stack>
                </Details>
              ) : null}
            </>
          ) : null}
        </Stack>
      );
    }
    case 'order':
      return (
        <Stack gap={3}>
          {message}
          {preview ? <ProposedLines detail={detail} /> : <OrderLines detail={detail} />}
        </Stack>
      );
    case 'audit': {
      const head = detail.audit.at(-1);
      return (
        <Stack gap={3}>
          <Said>{detail.audit.length} steps recorded for this order. The log is shared with Valio and can’t be edited after the fact.</Said>
          <Link to="/app/audit">
            <Flex display="inline-flex" align="center" gap={1} fontSize="12.5px" color="fg.muted" _hover={{ color: 'fg' }}>
              Open the audit trail <LuArrowRight />
            </Flex>
          </Link>
          {head ? (
            <Details>
              <Stack gap={1} fontSize="12px" color="fg.subtle">
                <Text>
                  Chain head <Mono>{shortHash(head.hash)}</Mono>
                </Text>
                <Text>
                  Previous <Mono>{shortHash(head.prevHash)}</Mono>
                </Text>
              </Stack>
            </Details>
          ) : null}
        </Stack>
      );
    }
    default:
      return message;
  }
};

/** What was ordered, at what price, and what is still open. */
export const OrderLines = ({ detail }: { detail: OrderDetail }) => {
  const { order } = detail;
  const ordered = order.lines.filter((l) => l.status === 'ordered');
  const other = order.lines.filter((l) => l.status !== 'ordered' && !order.open.some((o) => o.code === l.code));
  return (
    <Stack gap={2}>
      {ordered.length ? (
        <Facts
          rows={[
            ...ordered.map((l): [ReactNode, ReactNode] => [
              <Text as="span" color="fg" key="n">
                {num(l.quantity)} {l.unit} {l.name.replace(/^Valio\s+/, '')}
                {l.role === 'substitute' ? (
                  <Text as="span" color="fg.subtle">
                    {' '}
                    · substitute
                  </Text>
                ) : null}
              </Text>,
              eur(l.total),
            ]),
            [
              <Text as="span" fontWeight="600" color="fg" key="t">
                Total
              </Text>,
              <Text as="span" fontWeight="600" key="v">
                {eur(order.committedTotal)}
              </Text>,
            ],
          ]}
        />
      ) : (
        <Text fontSize="13px" color="fg.subtle">
          Nothing was ordered.
        </Text>
      )}
      {other.map((l) => (
        <Text key={`${l.code}-${l.role}`} fontSize="12.5px" color="fg.subtle">
          Not ordered: {num(l.quantity)} {l.unit} {l.name.replace(/^Valio\s+/, '')}
        </Text>
      ))}
      {order.open.length ? (
        <Stack gap={1}>
          {order.open.map((o) => (
            <StatusText key={o.code} tone="pending" size="12.5px">
              Still open: {num(o.quantity)} {o.unit} {o.name.replace(/^Valio\s+/, '')}
            </StatusText>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

/** What a preview would order: requested lines and picked substitutes, with prices. */
export const ProposedLines = ({ detail }: { detail: OrderDetail }) => {
  const { order } = detail;
  const lines = order.lines.filter((l) => l.status === 'proposed' || l.status === 'ordered');
  const other = order.lines.filter((l) => !lines.includes(l));
  return (
    <Stack gap={2}>
      {lines.length ? (
        <Facts
          rows={[
            ...lines.map((l): [ReactNode, ReactNode] => [
              <Text as="span" color="fg" key="n">
                {num(l.quantity)} {l.unit} {l.name.replace(/^Valio\s+/, '')}
                {l.role === 'substitute' ? (
                  <Text as="span" color="fg.subtle">
                    {' '}
                    · substitute
                  </Text>
                ) : null}
              </Text>,
              eur(l.total),
            ]),
            [
              <Text as="span" fontWeight="600" color="fg" key="t">
                Total
              </Text>,
              <Text as="span" fontWeight="600" key="v">
                {eur(order.total)}
              </Text>,
            ],
          ]}
        />
      ) : (
        <Text fontSize="13px" color="fg.subtle">
          Nothing would be ordered.
        </Text>
      )}
      {other.map((l) => (
        <Text key={`${l.code}-${l.role}`} fontSize="12.5px" color="fg.subtle">
          Not ordered: {num(l.quantity)} {l.unit} {l.name.replace(/^Valio\s+/, '')}
          {l.note ? ` — ${l.note}` : ''}
        </Text>
      ))}
      {order.open.map((o) => (
        <StatusText key={o.code} tone="pending" size="12.5px">
          Would stay open: {num(o.quantity)} {o.unit} {o.name.replace(/^Valio\s+/, '')}
        </StatusText>
      ))}
    </Stack>
  );
};

const WindowLeft = ({ expiresAt }: { expiresAt: string }) => {
  const now = useNow();
  const left = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return <>{left ? `in ${mmss}` : 'closed — fallback applies'}</>;
};

const QuoteEvidence = ({ quote, message }: { quote: Quote; message: ReactNode }) => {
  const now = useNow();
  const expired = Date.parse(quote.expiresAt) <= now;
  return (
    <Stack gap={3}>
      <Facts
        rows={quote.lines.map((l): [ReactNode, ReactNode] => [
          l.name.replace(/^Valio\s+/, ''),
          `${eur(l.unitPrice)} / ${l.salesUnit.unit}`,
        ])}
      />
      <Text fontSize="12.5px" color="fg.subtle">
        Fixed list prices from {quote.source === 'simulator' ? 'the Valio simulator' : 'Valio Aimo'}, {expired ? 'expired' : 'valid until'}{' '}
        {hkiTime(quote.expiresAt).slice(0, 5)}.
      </Text>
      <Details>
        <Stack gap={1} fontSize="12px" color="fg.subtle">
          {message ? <Box>{message}</Box> : null}
          <Text>
            Quote <Mono>{quote.id}</Mono>
          </Text>
          <Text>
            Key <Mono>{quote.kid}</Mono>
          </Text>
          <Text>
            Signature <Mono>{shortSig(quote.signature)}</Mono>
          </Text>
          {quote.lines.map((l) => (
            <Text key={l.code}>
              <Mono>{l.code}</Mono> ·{' '}
              {l.deliveries.map((d) => `${fmtDay(d.date)}: ${stockAmount(d.amount)} ${d.salesUnit}`).join(' · ') || 'no deliveries'}
            </Text>
          ))}
        </Stack>
      </Details>
    </Stack>
  );
};

export const CheckRow = ({ check: c }: { check: Check }) => (
  <Box>
    <StatusText tone={c.passed ? 'auto' : c.severity === 'hard' ? 'blocked' : 'pending'}>
      <Text as="span" color="fg" fontWeight={c.passed ? '400' : '500'}>
        {c.title}
      </Text>
    </StatusText>
    <Text fontSize="12.5px" color="fg.subtle" paddingLeft="13px">
      {c.detail}
    </Text>
  </Box>
);

const first = (name: string) => name.trim().split(/\s+/)[0];

/** The decision itself: approve, decline, or order only the in-stock part. */
export const ApprovalCard = ({
  detail,
  deciding,
  onDecide,
}: {
  detail: OrderDetail;
  deciding: Decision | null;
  onDecide: (d: Decision) => void;
}) => {
  const approval = detail.approval!;
  const nameOf = (code: string) => (detail.order.lines.find((l) => l.code === code)?.name ?? code).replace(/^Valio\s+/, '');
  const asked = detail.order.request.lines.map((l) => `${num(l.quantity)} ${l.unit} ${nameOf(l.code)}`).join(' + ');
  const proposed = (approval.proposal?.lines ?? [])
    .map((l) => `${num(l.quantity)} ${l.unit} ${l.name.replace(/^Valio\s+/, '')}`)
    .join(' + ');
  const total = approval.proposal?.total ?? detail.order.total;
  return (
    <Box
      borderRadius="l2"
      borderWidth="1px"
      borderTopWidth="2px"
      borderColor="border"
      borderTopColor="status.pending"
      bg="bg.panel"
      padding={4}
    >
      <Flex align="center" justify="space-between" gap={3}>
        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="20px" lineHeight="1.2">
          Waiting for {first(approval.approver.name)}
        </Text>
        <Stamp tone="pending">Sign-off</Stamp>
      </Flex>
      <Stack gap={1.5} marginTop={3} fontSize="13px">
        <Text>
          <Text as="span" color="fg.subtle">
            Asked:{' '}
          </Text>
          {asked}
        </Text>
        <Text>
          <Text as="span" color="fg.subtle">
            Proposed:{' '}
          </Text>
          {proposed || '—'} ·{' '}
          <Text as="span" fontSize="12.5px" className="tnum">
            {eur(total)}
          </Text>
        </Text>
        {approval.tradeoffs.map((t) => (
          <Text key={t.code} color="fg.muted">
            {t.summary.replace(/^\S+ for \S+: /, '')}
          </Text>
        ))}
      </Stack>
      <Flex gap={2} marginTop={4}>
        <Button
          flex={1}
          size="sm"
          borderRadius="l2"
          loading={deciding === 'approve'}
          disabled={!!deciding}
          onClick={() => onDecide('approve')}
        >
          Approve
        </Button>
        <Button
          flex={1}
          size="sm"
          borderRadius="l2"
          variant="outline"
          loading={deciding === 'decline'}
          disabled={!!deciding}
          onClick={() => onDecide('decline')}
        >
          Decline
        </Button>
      </Flex>
      {approval.fallback.lines.length ? (
        <Button
          width="full"
          marginTop={2}
          size="sm"
          variant="ghost"
          color="fg.muted"
          loading={deciding === 'partial'}
          disabled={!!deciding}
          onClick={() => onDecide('partial')}
        >
          Order only what’s in stock ({eur(approval.fallback.total)})
        </Button>
      ) : null}
    </Box>
  );
};

const verdictTone: Record<string, { tone: Tone; label: string }> = {
  picked: { tone: 'auto', label: 'Picked' },
  ranked: { tone: 'idle', label: 'Ranked' },
  late: { tone: 'pending', label: 'Too late' },
  blocked: { tone: 'blocked', label: 'Blocked' },
  missing_data: { tone: 'blocked', label: 'No data' },
};

const CandidateRow = ({ candidate: c }: { candidate: Candidate }) => {
  const v = verdictTone[c.verdict] ?? { tone: 'idle' as const, label: c.verdict };
  return (
    <Box paddingY={2.5} borderBottomWidth="1px" borderColor="border.muted">
      <Flex justify="space-between" align="start" gap={3}>
        <Text fontSize="13px" fontWeight={c.verdict === 'picked' ? '600' : '500'} lineClamp={2}>
          {c.name.replace(/^Valio\s+/, '')}
        </Text>
        <Stamp tone={v.tone}>{v.label}</Stamp>
      </Flex>
      <Text fontSize="12.5px" color="fg.subtle" marginTop={0.5}>
        {c.reason}
        {c.earliestDelivery ? ` · earliest ${fmtDay(c.earliestDelivery)}` : ''}
        {c.valioSubstitute ? ' · Valio’s own substitute' : ''}
      </Text>
    </Box>
  );
};

// Valio reports "no limit" as a huge sentinel amount (9,999,999,999).
const stockAmount = (amount: number) => (amount >= 1e8 ? 'no limit' : num(amount));

// Cut-offs are ISO from Valio, or a bare "14:00" from the simulator.
const hkiDateTime = (value: string) =>
  Number.isNaN(Date.parse(value))
    ? value
    : new Date(value)
        .toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Helsinki',
        })
        .replace(',', '');
