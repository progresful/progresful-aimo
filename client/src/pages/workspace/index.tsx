// The order page — one layout before, during and after the order runs.
//   Top   — the request as a sentence (click to change it), one status sentence, one button
//           (Place order → Approve / Decline → New order), the products and the delivery date.
//   Graph — the order's few steps, with each rule as a node saying ✓ / ! / ✕ for this order.
//           Before placing it's painted with a dry run; a rule can be changed or removed, and
//           "+ Add a rule" adds one in plain words — each change takes effect at once, signed
//           by you (Undo in the toast), and the order is re-checked. After placing, the real run lights it up step by step, and an approval is
//           decided on the card at the approval step (or with the header buttons).
// /app/new is before placing; /app/runs/:orderId during and after.
import { Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useQueries } from '@tanstack/react-query';
import { ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';
import {
  Candidate,
  Check,
  OrderPreview,
  OrderRequestBody,
  ParsedRequest,
  Unit,
  productQuery,
  useAgents,
  useAutomations,
  useOrder,
  useParseRequest,
  usePlaceOrder,
  usePolicy,
  useSandbox,
} from '@/api/gateway';
import { type Tone } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { useUser } from '@/providers/session';
import { defaultAgent, errorText, shortName } from '@/pages/home/format';
import { useWatchRun } from '@/pages/home/useWatchRun';
import { composerText, eur, fmtDay, num } from '@/pages/playbook/graph';
import { RunNavState, useDecideOnRun } from '@/pages/playbook/parts';
import { useRun } from '@/pages/playbook/useRun';
import { approverOf as policyApprover } from '@/pages/policies/visuals';
import { isChallenge, markDone, rememberBudgetOrder, useTryIt } from '@/pages/tryit/progress';
import { AddRuleCard, ApprovalCard, RuleCard, StepCard } from './Cards';
import { GraphNode, OrderCanvas, buildOrderGraph } from './Graph';
import { FromRequest, usePlan, usePolicyDraft, useRequestRules } from './hooks';
import {
  Names,
  Said,
  VerdictContext,
  checkFor,
  doneSentence,
  firstName,
  planSentence,
  reasonOf,
  ruleShort,
  signedOf,
  verdictContext,
  verdictStamp,
  fmtStamp,
  verdictDetail,
  verdictOf,
} from './model';
import { BuilderLine, Seed, blankSeed, linesFromParse, newKey, seedFromAutomation, seedFromOrder } from './request';
import { OrderTop, OrderedRows, ProductRows } from './Top';

const isDay = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

// --- /app/new --------------------------------------------------------------------------

/**
 * Where a new order starts: `?text=` someone's words (read on load), `?from=<orderId>` an
 * earlier order, `?automation=<id>` a standing order, `?line=CODE:QTY:UNIT&date=` exact lines.
 * `?describe=` opens "Add a rule" with a sentence filled in; `?try=` a judge challenge.
 */
export const NewOrderPage = () => {
  const [params] = useSearchParams();
  const text = params.get('text');
  const from = params.get('from');
  const automationId = params.get('automation');
  const order = useOrder(from);
  const automations = useAutomations();
  const tryParam = params.get('try');
  const challenge = isChallenge(tryParam) ? tryParam : null;
  const describe = params.get('describe');
  const lineParams = params.getAll('line');
  const dateParam = params.get('date');
  const lineSpecs = lineParams
    .map((s) => s.split(':'))
    .filter(([code, qty]) => code && Number(qty) > 0)
    .map(([code, qty, unit]) => ({ code, quantity: Number(qty), unit: (['l', 'kg', 'pcs'].includes(unit) ? unit : 'l') as Unit }));
  const named = useQueries({ queries: lineSpecs.map((l) => productQuery(l.code)) });

  let seed: Seed | null = null;
  let key = 'blank';
  if (lineSpecs.length) {
    if (named.every((q) => !q.isLoading)) {
      seed = {
        ...blankSeed,
        text: text ?? '',
        date: isDay(dateParam) ? dateParam : '',
        lines: lineSpecs.map((l, i) => ({
          key: newKey(),
          ...l,
          name: named[i].data?.name ?? l.code,
          salesUnit: named[i].data?.salesUnit.unit,
          options: [],
        })),
      };
      key = `lines-${lineParams.join(',')}-${dateParam}`;
    }
  } else if (from) {
    if (order.data) {
      seed = seedFromOrder(order.data.order);
      key = `from-${from}`;
    } else if (order.isError) seed = blankSeed;
  } else if (automationId) {
    const a = automations.data?.find((x) => x.id === automationId);
    if (a) {
      seed = seedFromAutomation(a);
      key = `automation-${automationId}`;
    } else if (automations.data || automations.isError) seed = blankSeed;
  } else if (text) {
    seed = { ...blankSeed, text, parseOnLoad: true };
    key = `text-${text}`;
  } else seed = isDay(dateParam) ? { ...blankSeed, date: dateParam } : blankSeed;

  if (!seed) return <Loading />;
  // Keyed by where it starts, so following another link starts clean.
  return <PlanWorkspace key={`${key}-${challenge ?? ''}-${describe ?? ''}`} seed={seed} challenge={challenge} describe={describe} />;
};

const PlanWorkspace = ({ seed, challenge, describe }: { seed: Seed; challenge: string | null; describe: string | null }) => {
  const [text, setText] = useState(seed.text);
  const [lines, setLines] = useState<BuilderLine[]>(seed.lines);
  const [date, setDate] = useState(seed.date);
  const [allowSubstitutes, setAllowSubstitutes] = useState(seed.allowSubstitutes);
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(!!describe);

  const agents = useAgents();
  // The default agent places it (an order from an earlier one keeps its agent).
  const agent = agents.data?.find((a) => a.id === seed.agentId) ?? defaultAgent(agents.data);
  const { mutateAsync: parseRequest } = useParseRequest();
  const place = usePlaceOrder();
  const watch = useWatchRun();
  const { state: run, show, reset } = useRun();

  // --- Words → lines ---------------------------------------------------------------
  // Promise-based with local state: in StrictMode a mutation observer started from an effect never hears back.
  const [parsing, setParsing] = useState(seed.parseOnLoad);
  const [parseError, setParseError] = useState<string | null>(null);
  const agentForParse = agent?.id;
  const runParse = (t: string) =>
    parseRequest({ text: t, agentId: agentForParse })
      .then((p) => {
        setParsed(p);
        setLines(linesFromParse(p));
        // No day in the words: the next weekday, so the plan shows straight away (the dry run offers a later one if Valio can't).
        setDate((d) => p.requestedDate ?? (isDay(d) ? d : nextWeekday()));
        setParseError(null);
      })
      .catch((err) => setParseError(errorText(err)))
      .finally(() => setParsing(false));
  const parsedOnLoad = useRef(false);
  const parseOnLoad = useEffectEvent(() => void runParse(seed.text.trim()));
  useEffect(() => {
    if (!seed.parseOnLoad || parsedOnLoad.current || !agents.data) return;
    parsedOnLoad.current = true;
    parseOnLoad();
  }, [seed, agents.data]);

  // --- The request as the gateway gets it --------------------------------------------
  const valid = lines.filter((l) => l.code && Number.isFinite(l.quantity) && l.quantity > 0);
  const linesKey = valid.map((l) => `${l.code}:${l.quantity}:${l.unit}`).join('|');
  const agentId = agent?.id ?? null;
  const body = requestBody(agentId, linesKey, date, allowSubstitutes);

  // --- Rules and the dry run -----------------------------------------------------------
  const draft = usePolicyDraft(agent?.policy.key ?? null);
  const plan = usePlan(body, draft.policy);
  // Judge sandbox: the rules are the ones the request states ("local only" → Finnish origin) — signed by you, with Undo.
  // Everywhere else the signed rules change only when someone edits them.
  const sandbox = useSandbox();
  const fromRequest = useRequestRules(draft, sandbox.data?.sandbox === true, parsed?.rules ? parsed : null);
  const fromWords = fromRequest.active;
  const painted = plan.signed;
  useEffect(() => {
    if (painted) show(painted.steps, { orderId: 'preview' });
    else reset();
  }, [painted, show, reset]);

  // Challenges watch the real outcome, once it's on screen.
  useEffect(() => {
    if (!plan.signed || !plan.fresh) return;
    if (challenge === 'lactose' && plan.signed.checks.some((c) => !c.passed && c.rule.startsWith('nutrition'))) markDone('lactose');
    if (challenge === 'lactose' && plan.signed.steps.some((s) => s.step === 'lactose' && s.status === 'blocked')) markDone('lactose');
    if (challenge === 'lactose' && plan.signed.steps.some((s) => s.step === 'lactose' && / blocked/.test(s.message))) markDone('lactose');
    if (challenge === 'catalog' && plan.signed.lines.length) markDone('catalog');
  }, [plan.signed, plan.fresh, challenge]);

  const approverName = draft.policy ? (policyApprover(draft.rules, draft.policy.approver)?.name ?? null) : null;
  const requested = lines.filter((l) => l.code).map((l) => ({ code: l.code, name: l.name }));
  const ctx = verdictContext(painted, approverName, { steps: painted?.steps, requested });
  const graph = buildOrderGraph({
    rules: draft.rules,
    // The latest change (or the edit being typed) is marked; nothing else.
    signedRules: draft.local ? (draft.signed?.rules ?? null) : draft.previous,
    run,
    checks: painted?.checks ?? null,
    ctx,
    preview: true,
    date,
    candidates: painted?.candidates ?? [],
    total: painted?.total ?? null,
    editable: !!draft.policy,
  });

  // --- The status sentence, and the one button ----------------------------------------
  const signed = plan.signed;
  const decision = signed?.decision ?? null;
  const suggestedDate = plan.fresh && decision === 'block' ? (signed?.suggestedDate ?? null) : null;
  const sub = signed?.lines.find((l) => l.role === 'substitute' && l.substituteFor);
  const stopped = ctx.keptOut.length ? keptOutWords(ctx.keptOut[0], ctx.names, painted) : null;

  const submit = () => {
    if (!body || !signed || decision === 'block') return;
    place.mutate(
      { ...body, note: text.trim() || undefined, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (result) => {
          if (result.decision === 'execute') markDone('within');
          if (result.decision === 'needs_approval') rememberBudgetOrder(result.order.id);
          watch(result);
        },
        onError: (err) => toaster.create({ type: 'error', title: 'The gateway didn’t take the order', description: errorText(err) }),
      }
    );
  };

  let said: Said | null = null;
  if (plan.error) said = { tone: 'blocked', text: `Couldn’t check this order — ${plan.error}` };
  else if (parseError) said = { tone: 'blocked', text: `Couldn’t read that — ${parseError}` };
  else if (!body && (text.trim() || lines.length))
    said = {
      tone: 'idle',
      text: !lines.length
        ? parsed?.unmatched.length
          ? `Didn’t find “${parsed.unmatched[0]}” — add it below`
          : 'Add a product'
        : 'Pick a delivery date',
    };
  else if (signed) said = planSentence(signed, approverName, ctx.names, stopped);
  const busy = parsing ? 'Reading your request…' : body && !signed && !plan.error ? 'Checking with Valio and the rules…' : null;

  // Ways out: the substitute the gateway found, another date, or letting it look for one.
  const takeSub = sub
    ? () =>
        setLines((ls) =>
          ls.map((l) =>
            l.code === sub.substituteFor
              ? { ...l, code: sub.code, name: sub.name, salesUnit: sub.salesUnit, unsure: false, options: [] }
              : l
          )
        )
    : null;
  // (Not while the rules are being set from the request: the block may be about to go away.)
  const fix =
    decision === 'block' && plan.fresh && !fromRequest.busy && !draft.applying
      ? takeSub
        ? { label: 'Use the substitute', run: takeSub }
        : suggestedDate
          ? { label: `Deliver ${fmtDay(suggestedDate)} instead`, run: () => setDate(suggestedDate) }
          : !allowSubstitutes
            ? { label: 'Allow substitutes', run: () => setAllowSubstitutes(true) }
            : null
      : null;
  // Nothing to place yet (a blank order): no button at all.
  const primary =
    !lines.length && !parsing ? null : plan.error ? (
      <Button borderRadius="l2" variant="outline" onClick={plan.retry}>
        Try again
      </Button>
    ) : fix ? (
      <Button
        borderRadius="l2"
        onClick={fix.run}
        maxWidth="340px"
        title={fix.label}
      >
        <Text truncate>{fix.label}</Text>
      </Button>
    ) : (
      <>
        {takeSub && stopped && plan.fresh ? (
          <Button
            borderRadius="l2"
            variant="outline"
            onClick={takeSub}
            title={`Order ${shortName(sub!.name)} instead`}
          >
            Use the substitute
          </Button>
        ) : null}
        <Button
          borderRadius="l2"
          disabled={!plan.fresh || !signed || decision === 'block' || !body || draft.applying || fromRequest.busy}
          loading={place.isPending}
          loadingText="Placing…"
          onClick={submit}
        >
          Place order <LuArrowRight />
        </Button>
      </>
    );

  // --- Cards on the graph ------------------------------------------------------------
  const cardFor = (id: string): ReactNode => {
    if (id === 'lane')
      return adding && draft.policy ? (
        <AddRuleCard
          draft={draft}
          initialText={describe ?? undefined}
          onAdded={(nodeId) => {
            setAdding(false);
            setSelectedId(nodeId);
          }}
        />
      ) : null;
    if (id !== selectedId) return null;
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return null;
    if (node.rule)
      return (
        <RuleCard
          key={id}
          rule={node.rule}
          no={node.no}
          verdict={verdictWords(node, painted?.checks ?? null, ctx)}
          draft={draft}
          editable
          onClose={() => setSelectedId(null)}
        />
      );
    if (id === 'approval') {
      const rule = draft.rules.find((r) => r.type === 'approval');
      const asked = decision === 'needs_approval';
      const words = {
        tone: (asked ? 'pending' : 'idle') as Tone,
        text: asked ? `${firstName(approverName)} would be asked to approve ${eur(signed?.total ?? 0)}` : 'Not needed for this order',
      };
      return rule ? (
        <RuleCard key={id} rule={rule} no={node.no} verdict={signed ? words : null} draft={draft} editable onClose={() => setSelectedId(null)} />
      ) : (
        <StepCard title="Approval" no={node.no} lines={[words]} />
      );
    }
    return (
      <StepCard
        title={node.title}
        no={node.no}
        lines={stepLines(id, painted, ctx.names, { request: text.trim() || null, agent: agent?.name ?? null, date })}
      />
    );
  };

  return (
    <Layout
      top={
        <OrderTop
          folio={
            <>
              Purchase order · <Text as="span" color="status.pending">Not placed yet</Text>
              {draft.signed ? ` · checked against the rules, v${draft.signed.version}` : ''}
            </>
          }
          sentence={text.trim() || lineWords(lines)}
          onSentence={(t) => {
            setText(t);
            setParsing(true);
            void runParse(t);
          }}
          said={said}
          busy={busy}
          verdict={
            busy
              ? { tone: 'running', label: 'Check' }
              : plan.error || parseError
                ? { tone: 'blocked', label: 'Error' }
                : decision && plan.fresh
                  ? decision === 'execute'
                    ? { tone: 'auto', label: 'Clear' }
                    : decision === 'needs_approval'
                      ? { tone: 'pending', label: 'Hold' }
                      : { tone: 'blocked', label: 'Blocked' }
                  : lines.length
                    ? { tone: 'idle', label: 'Standby' }
                    : null
          }
          aside={
            fromWords && (fromWords.rules.length || fromWords.cleared) ? (
              <RequestRulesLine made={fromWords} undoing={fromRequest.undoing} onUndo={fromRequest.undo} />
            ) : fromRequest.busy && !parsing ? (
              <Text fontSize="12.5px" color="fg.muted" marginTop={0.5} paddingLeft="16px">
                Setting the rules from your request…
              </Text>
            ) : null
          }
          actions={primary}
        >
          {lines.length || parsing || text.trim() ? (
            <ProductRows
              lines={lines}
              onLines={setLines}
              prices={painted?.lines ?? []}
              stopped={ctx.keptOut}
              date={date}
              onDate={setDate}
              loading={parsing}
            />
          ) : null}
        </OrderTop>
      }
    >
      <OrderCanvas
        graph={graph}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        cardFor={cardFor}
        onAddRule={() => {
          setSelectedId(null);
          setAdding(true);
        }}
        preview
        editable
      />
    </Layout>
  );
};

/** The order as the gateway gets it, once it has products and a date. */
/** Tomorrow, or Monday when tomorrow is a weekend day — as YYYY-MM-DD in local time. */
const nextWeekday = () => {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const requestBody = (agentId: string | null, linesKey: string, date: string, allowSubstitutes: boolean): OrderRequestBody | null =>
  agentId && linesKey && isDay(date)
    ? {
        agentId,
        lines: linesKey.split('|').map((s) => {
          const [code, quantity, unit] = s.split(':');
          return { code, quantity: Number(quantity), unit: unit as Unit };
        }),
        requestedDate: date,
        allowSubstitutes,
      }
    : null;

/** "20 kg Eila butter + 10 l whipping cream" — the request in words when there were none. */
const lineWords = (lines: BuilderLine[]) => lines.map((l) => `${num(l.quantity)} ${l.unit} ${shortName(l.name)}`).join(' + ');

/** "Semi skimmed milk 1 l isn't lactose-free — a lactose-free one is proposed". */
const keptOutWords = (code: string, names: Names, p: OrderPreview | null) => {
  const stand = p?.lines.some((l) => l.role === 'substitute' && l.substituteFor === code);
  return `${names[code] ?? code} isn’t lactose-free${stand ? ' — a lactose-free one is proposed' : ''}`;
};

/** What a rule node's card says about this order. */
const verdictWords = (node: GraphNode, checks: Check[] | null, ctx: VerdictContext): { tone: Tone; text: string } | null => {
  if (!node.rule) return null;
  const v = verdictOf(node.rule, checks, ctx);
  if (!v) return null;
  // A rule this order doesn't touch: the card says it in full ("No dairy in this order — the rule doesn't apply").
  const na = checkFor(node.rule, checks);
  if (na?.applies === false) return { tone: v.tone, text: `Not applicable — ${na.detail.charAt(0).toLowerCase()}${na.detail.slice(1)}` };
  const why = verdictDetail(node.rule, checks, ctx.names ?? {});
  return { tone: v.tone, text: `${v.label}${why ? ` — ${why}` : ''}` };
};

/** A step's card, in plain words: what it looked at for this order and what it found. */
const stepLines = (
  id: string,
  p: {
    steps: { step: string; payload?: Record<string, unknown> }[];
    checks: Check[];
    candidates: Candidate[];
    lines: { code: string; role: string; substituteFor?: string; name: string }[];
  } | null,
  names: Names,
  about: { request: string | null; agent: string | null; date: string | null }
): { tone?: Tone; text: string }[] => {
  const failing = (p?.checks ?? []).filter((c) => !c.passed && ['order.nonEmpty', 'catalog.known', 'stock.coverage'].includes(c.rule));
  switch (id) {
    case 'request':
      return [
        ...(about.request ? [{ text: `“${about.request}”` }] : []),
        ...(about.agent ? [{ text: `Placed by ${about.agent}, under the signed rules.` }] : []),
      ];
    case 'valio': {
      if (!p) return [{ text: 'Prices and stock come from Valio when the order is checked.' }];
      const stock =
        (p.steps.find((s) => s.step === 'stock')?.payload?.lines as { code: string; short: number; unit: string }[] | undefined) ?? [];
      const day = about.date ? fmtDay(about.date) : 'the day';
      return [
        ...stock.map((l) => ({
          tone: (l.short > 0 ? 'pending' : 'auto') as Tone,
          text: `${names[l.code] ?? l.code}: ${l.short > 0 ? `short by ${num(l.short)} ${l.unit}` : `in stock for ${day}`}`,
        })),
        ...failing.map((c) => ({ tone: (c.severity === 'hard' ? 'blocked' : 'pending') as Tone, text: capital(reasonOf(c, names)) })),
        { text: 'Prices are Valio’s fixed list prices.' },
      ];
    }
    case 'substitutes': {
      const top = (p?.candidates ?? []).filter((c) => c.verdict === 'picked' || c.verdict === 'blocked').slice(0, 3);
      return top.length
        ? top.map((c) => ({
            tone: (c.verdict === 'picked' ? 'auto' : 'blocked') as Tone,
            text: `${shortName(c.name)} — ${c.verdict === 'picked' ? `instead of ${names[c.for] ?? c.for}` : 'doesn’t pass the rules'}`,
          }))
        : [{ text: 'No substitute fits the rules and the date.' }];
    }
    case 'order':
      return [{ text: 'Ordered from Valio at the quoted price once every rule passes — or once the approver says OK.' }];
    default:
      return [];
  }
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Rules adjusted for this order: allowed pasta · lactose rule doesn't apply · Undo". */
/** "Rules from your request: Only products from Finland · Undo" — what the words put in effect. */
const RequestRulesLine = ({ made, undoing, onUndo }: { made: FromRequest; undoing: boolean; onUndo: () => void }) => (
  <Flex align="baseline" gap={2} marginTop={1} paddingLeft="16px" fontSize="12.5px" minWidth={0}>
    <Text
      color="status.pending"
      truncate
      title={[
        ...made.rules.map((r) => `“${r.words}” → ${r.sentence}`),
        ...(made.cleared ? [`${made.cleared} earlier ${made.cleared === 1 ? 'rule' : 'rules'} cleared`] : []),
      ].join('\n')}
    >
      <Text as="span" fontWeight="600">
        {made.rules.length ? 'Rules from your request:' : 'No rules in your request'}
      </Text>{' '}
      {made.rules.length ? made.rules.map((r) => ruleShort(r.rule)).join(' · ') : '— earlier ones cleared'}
    </Text>
    {made.applied ? (
      <Button
        size="2xs"
        variant="plain"
        height="auto"
        minWidth={0}
        padding={0}
        fontSize="12.5px"
        color="fg.muted"
        textDecoration="underline"
        _hover={{ color: 'fg' }}
        loading={undoing}
        onClick={onUndo}
      >
        Undo
      </Button>
    ) : null}
  </Flex>
);

// --- /app/runs/:orderId ------------------------------------------------------------------

export const RunOrderPage = () => {
  const { orderId = '' } = useParams();
  // Keyed by order so switching runs starts from a clean graph.
  return <RunWorkspace key={orderId} orderId={orderId} />;
};

const RunWorkspace = ({ orderId }: { orderId: string }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const fresh = !!(location.state as RunNavState | null)?.fresh;
  const { user } = useUser();
  const progress = useTryIt();

  const { state: run, play, append, show } = useRun();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const orderQ = useOrder(orderId);
  const detail = orderQ.data ?? null;
  const { onDecide, deciding } = useDecideOnRun(detail, (entries) => append(entries));

  // Put the order on the graph once: step by step when it was just placed, else its final state.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!detail || detail.order.id !== orderId || loadedFor.current === orderId) return;
    loadedFor.current = orderId;
    const opts = { orderId, waiting: detail.approval?.status === 'pending' };
    if (fresh) {
      play(detail.audit, opts);
      // A reload or going back should show the final state, not animate again.
      navigate(location.pathname, { replace: true, state: null });
    } else show(detail.audit, opts);
  }, [detail, orderId, fresh, play, show, navigate, location.pathname]);

  // Decisions made elsewhere (Approvals, the phone, the timeout) continue the run here too.
  useEffect(() => {
    if (run.phase !== 'waiting' || !detail || run.orderId !== detail.order.id) return;
    append(detail.audit, { waiting: detail.approval?.status === 'pending' });
  }, [run.phase, run.orderId, detail, append]);

  // "Go over budget and approve it yourself": done once a person decided the order it placed.
  const approval = detail?.approval ?? null;
  useEffect(() => {
    if (
      approval &&
      progress.budgetOrderId === orderId &&
      approval.status !== 'pending' &&
      approval.decidedBy &&
      approval.decidedRole !== 'system'
    )
      markDone('budget');
  }, [approval, progress.budgetOrderId, orderId]);

  // The rules the order ran under: its policy version.
  const policyQ = usePolicy(detail?.order.policy.key);
  const p = policyQ.data;
  const version = p?.versions?.find((v) => v.version === detail?.order.policy.version) ?? (p ? signedOf(p) : null);
  const rules = useMemo(() => version?.rules ?? p?.rules ?? [], [version, p]);

  if (!detail)
    return orderQ.isError ? (
      <Stack gap={3} paddingX={8} paddingY={10} maxWidth="620px">
        <Text textStyle="title">Couldn’t open this order</Text>
        <Text fontSize="13px" color="fg.muted">
          {errorText(orderQ.error)}
        </Text>
        <Button size="sm" variant="outline" alignSelf="start" onClick={() => navigate('/app')}>
          Back to Home
        </Button>
      </Stack>
    ) : (
      <Loading />
    );

  const { order } = detail;
  const checks = detail.checks ?? order.checks;
  const pending = approval?.status === 'pending';
  const waiting = pending && run.phase === 'waiting';
  const running = run.phase === 'running' || run.phase === 'idle';
  const approverName = approval?.approver.name ?? (p ? (policyApprover(rules, p.approver)?.name ?? null) : null);
  const decided = approval && approval.status !== 'pending' ? { status: approval.status, by: approval.decidedBy } : null;
  const ctx = verdictContext(
    {
      lines: order.lines,
      open: order.open,
      candidates: order.candidates,
      decision: approval ? 'needs_approval' : order.status === 'blocked' ? 'block' : 'execute',
    },
    approverName,
    {
      decided,
      steps: detail.audit,
      requested: order.request.lines.map((l) => ({
        code: l.code,
        name: order.lines.find((x) => x.code === l.code)?.name ?? order.open.find((x) => x.code === l.code)?.name ?? l.code,
      })),
    }
  );
  const graph = buildOrderGraph({
    rules,
    signedRules: null,
    run,
    checks,
    ctx,
    preview: false,
    date: order.request.requestedDate,
    candidates: order.candidates,
    total: order.committedTotal || order.total,
    editable: false,
  });

  const total = approval?.proposal?.total ?? order.total;
  const why = approval?.reasons.map((r) => {
    const c = checks.find((x) => x.rule === r.rule);
    return c ? reasonOf(c, ctx.names) : r.detail;
  })[0];
  const said: Said | null = running
    ? null
    : waiting
      ? { tone: 'pending', text: `Waiting for ${firstName(approverName)}’s OK · ${eur(total)}${why ? ` — ${why}` : ''}` }
      : doneSentence(order);

  const cardFor = (id: string): ReactNode => {
    if (id === 'approval' && waiting)
      return <ApprovalCard detail={detail} me={user?.name ?? null} deciding={deciding} onDecide={onDecide} />;
    if (id !== selectedId) return null;
    const node = graph.nodes.find((n) => n.id === id);
    if (!node || node.status === 'idle' || node.status === 'running') return null;
    if (node.rule)
      return (
        <RuleCard
          key={id}
          rule={node.rule}
          no={node.no}
          verdict={verdictWords(node, checks, ctx)}
          draft={null}
          editable={false}
          onClose={() => setSelectedId(null)}
        />
      );
    if (id === 'approval')
      return (
        <StepCard
          title="Approval"
          no={node.no}
          lines={[
            { tone: node.status === 'auto' ? 'auto' : node.status === 'blocked' ? 'blocked' : 'idle', text: node.line ?? '' },
            ...(approval?.decidedAt
              ? [
                  {
                    text: `Decided ${new Date(approval.decidedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })}`,
                  },
                ]
              : []),
          ]}
        />
      );
    return (
      <StepCard
        title={node.title}
        no={node.no}
        lines={stepLines(id, { steps: detail.audit, checks, candidates: order.candidates, lines: order.lines }, ctx.names, {
          request: composerText(order),
          agent: order.agent?.name ?? null,
          date: order.request.requestedDate,
        })}
      />
    );
  };

  return (
    <Layout
      top={
        <OrderTop
          folio={
            <>
              Order{' '}
              <Text as="span" className="tnum" fontWeight="500" color="fg">
                {order.id}
              </Text>{' '}
              · {fmtStamp(order.createdAt)}
            </>
          }
          verdict={running ? { tone: 'running', label: 'Running' } : waiting ? { tone: 'pending', label: 'Hold' } : verdictStamp(order)}
          sentence={composerText(order) ?? order.title}
          onSentence={(t) => navigate(`/app/new?text=${encodeURIComponent(t)}`)}
          said={said}
          busy={running ? 'Going through the steps…' : null}
          link={
            !running && !waiting ? (
              <Link to={`/app/audit?order=${order.id}`}>
                <Text as="span" fontSize="12.5px" color="fg.subtle" marginLeft={1} _hover={{ color: 'fg', textDecoration: 'underline' }}>
                  · Audit log
                </Text>
              </Link>
            ) : null
          }
          actions={
            waiting ? (
              <>
                <Button
                  borderRadius="l2"
                  variant="outline"
                  loading={deciding === 'decline'}
                  disabled={!!deciding}
                  onClick={() => onDecide('decline')}
                >
                  Decline
                </Button>
                <Button
                  borderRadius="l2"
                  bg="status.auto"
                  color="status.contrast"
                  _hover={{ opacity: 0.92 }}
                  loading={deciding === 'approve'}
                  disabled={!!deciding}
                  onClick={() => onDecide('approve')}
                >
                  Approve {eur(total, 0)}
                </Button>
              </>
            ) : running ? null : (
              <Button
                borderRadius="l2"
                onClick={() => navigate('/app/new')}
              >
                New order
              </Button>
            )
          }
        >
          <OrderedRows detail={detail} />
        </OrderTop>
      }
    >
      <OrderCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} cardFor={cardFor} preview={false} editable={false} />
    </Layout>
  );
};

// --- Layout -------------------------------------------------------------------------------

/** The top over the graph, which takes the rest of the page. */
const Layout = ({ top, children }: { top: ReactNode; children: ReactNode }) => (
  <Flex direction="column" height="100%" minHeight={0}>
    {top}
    <Box flex={1} position="relative" minHeight={0} overflow="hidden" bg="bg.canvas">
      {children}
    </Box>
  </Flex>
);

const Loading = () => (
  <Stack gap={3} paddingX={8} paddingY={6}>
    <Skeleton height="12px" width="220px" borderRadius="l1" />
    <Skeleton height="40px" width="520px" borderRadius="l2" />
    <Skeleton height="16px" width="280px" borderRadius="l2" />
    <Skeleton height="400px" borderRadius="l3" marginTop={6} />
  </Stack>
);
