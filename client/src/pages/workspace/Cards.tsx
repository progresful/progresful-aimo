// The small cards that open on the order graph: a rule (why, change, remove), a step
// (what happened there), the approval, and "Add a rule" in plain words.
import { Box, Button, Flex, Input, Stack, Text } from '@chakra-ui/react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { LuTrash2 } from 'react-icons/lu';
import { DraftRuleResult, OrderDetail, PolicyRule, useDraftRule } from '@/api/gateway';
import { Caption, Dot, Keycap, Readout, type Tone } from '@/components/kit';
import { minutesLeft } from '@/pages/approvals/model';
import { errorText, shortName } from '@/pages/home/format';
import { insertRule, nodeOfRule } from '@/pages/playbook/editor/model';
import { RuleForm } from '@/pages/playbook/editor/RulePanel';
import { eur, num } from '@/pages/playbook/graph';
import type { Decision } from '@/pages/playbook/Inspector';
import { StatusText } from '@/pages/playbook/quiet';
import { useNow } from '@/pages/playbook/useNow';
import { changeSummary } from '@/pages/policies/apply';
import { rememberSentence, ruleSentence } from '@/pages/policies/visuals';
import { markDone } from '@/pages/tryit/progress';
import type { PolicyDraft } from './hooks';
import { firstName, namesOf, plain, reasonOf, ruleShort } from './model';

/** A card's heading. */
const Head = ({ children }: { children: ReactNode }) => (
  <Text fontSize="17px" fontWeight="600" lineHeight="1.3" letterSpacing="-0.02em">
    {children}
  </Text>
);

/** The card's top bar, like a control panel's: its number and kind engraved, an LED on the right. */
const Kicker = ({ children, no, tone }: { children: ReactNode; no?: string; tone?: Tone }) => (
  <Flex align="center" gap={2} marginX={-5} marginTop={-5} marginBottom={1} paddingX={5} height="36px" borderBottomWidth="1px" borderColor="border">
    <Caption n={no}>{children}</Caption>
    <Box flex={1} />
    {tone ? <Dot tone={tone} size={7} /> : null}
  </Flex>
);

/** A step: its name and a few plain lines about what happened there. */
export const StepCard = ({ title, no, lines }: { title: string; no?: string; lines: { tone?: Tone; text: string }[] }) => (
  <Stack gap={2} padding={5}>
    <Kicker no={no} tone={lines.find((l) => l.tone)?.tone}>
      Step
    </Kicker>
    <Head>{title}</Head>
    {lines.map((l, i) =>
      l.tone ? (
        <StatusText key={i} tone={l.tone} size="13px">
          {l.text}
        </StatusText>
      ) : (
        <Text key={i} fontSize="13px" color="fg.muted" lineHeight="1.5">
          {l.text}
        </Text>
      )
    )}
  </Stack>
);

/**
 * A rule: the full sentence, what it says about this order and — on an order not placed
 * yet — its fields, ready to edit. A change takes effect on its own, signed by you (shortly
 * after the last edit, and when the card closes): one edit, one version. Remove takes the
 * rule out the same way. Each says so in a toast with Undo.
 */
export const RuleCard = ({
  rule,
  no,
  verdict,
  draft,
  editable,
  onClose,
}: {
  rule: PolicyRule;
  /** Its number on the graph ("R03"). */
  no?: string;
  verdict: { tone: Tone; text: string } | null;
  draft: PolicyDraft | null;
  editable: boolean;
  onClose: () => void;
}) => {
  const local = draft?.rules.find((r) => r.key === rule.key) ?? rule;
  const problem = draft?.problems[rule.key];
  const pending = !!draft?.dirty && !problem;

  // The latest draft state, read by the timers below without restarting them each render.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  // "Changed R01: up to €100 per order without approval" — the version's summary.
  const summaryOf = (d: PolicyDraft) => {
    const now = d.rules.find((r) => r.key === rule.key) ?? rule;
    return changeSummary(`Changed ${no ?? rule.key}`, plain(ruleShort(now)));
  };
  const latestSummary = useRef(summaryOf);
  useEffect(() => {
    latestSummary.current = summaryOf;
  });

  // Applied shortly after the last edit — typing "100" is one change, not three.
  const toApply = pending && draft ? JSON.stringify(draft.rules) : null;
  useEffect(() => {
    if (!toApply) return;
    const t = setTimeout(() => {
      const d = latest.current;
      if (d) void d.apply(d.rules, latestSummary.current(d));
    }, 800);
    return () => clearTimeout(t);
  }, [toApply]);

  // Closing the card applies what's left, or drops an edit that isn't valid.
  useEffect(
    () => () => {
      const d = latest.current;
      if (!d?.local) return;
      if (d.dirty && !Object.keys(d.problems).length) void d.apply(d.rules, latestSummary.current(d));
      else d.setLocal(null);
    },
    []
  );

  return (
    <Stack gap={3} padding={5}>
      <Kicker no={no} tone={verdict?.tone}>
        {rule.type === 'approval' ? 'Approval rule' : rule.hard ? 'Rule · hard' : 'Rule'}
      </Kicker>
      <Head>{plain(ruleSentence(local))}</Head>
      {verdict ? (
        <StatusText tone={verdict.tone} size="13px">
          <Text as="span" color="fg">
            {verdict.text}
          </Text>
        </StatusText>
      ) : null}
      {editable && draft ? (
        <>
          <Box borderTopWidth="1px" borderColor="border" paddingTop={3}>
            <RuleForm rule={local} rules={draft.rules} onRules={(next) => draft.setLocal(next)} />
          </Box>
          {problem ? (
            <StatusText tone="blocked" size="12.5px">
              {problem}
            </StatusText>
          ) : null}
          <Flex align="center" justify="space-between" gap={2}>
            <Text textStyle="label" color="fg.subtle">
              {draft.applying || pending ? 'Applying…' : 'Takes effect at once'}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              color="status.blocked"
              disabled={draft.applying}
              onClick={() =>
                void draft
                  .apply(
                    draft.rules.filter((r) => r.key !== rule.key),
                    changeSummary(`Removed ${no ?? rule.key}`, plain(ruleShort(local)))
                  )
                  .then((done) => done && onClose())
              }
            >
              <LuTrash2 /> Remove rule
            </Button>
          </Flex>
        </>
      ) : null}
    </Stack>
  );
};

const EXAMPLES = ['No single line over 200 litres', 'Local only', 'Never products with soy'];

/** "+ Add a rule": a sentence in, a rule in effect (signed by you) — it shows on the graph with its verdict straight away. */
export const AddRuleCard = ({
  draft,
  initialText,
  onAdded,
}: {
  draft: PolicyDraft;
  initialText?: string;
  onAdded: (nodeId: string) => void;
}) => {
  const [text, setText] = useState(initialText ?? '');
  const ask = useDraftRule();
  const [refused, setRefused] = useState<DraftRuleResult | null>(null);
  const p = draft.policy;

  const submit = (words = text) => {
    const t = words.trim();
    if (!t || !p) return;
    setText(t);
    setRefused(null);
    ask.mutate(
      { id: p.key, text: t },
      {
        onSuccess: (res) => {
          if (!res.supported || !res.rule) return setRefused(res);
          const { rules, rule } = insertRule(draft.rules, res.rule);
          rememberSentence(rule.key, res.sentence);
          void draft.apply(rules, changeSummary('Added', plain(ruleShort(rule)))).then((done) => {
            if (!done) return;
            markDone('rule');
            onAdded(nodeOfRule(rule));
          });
        },
      }
    );
  };

  return (
    <Stack gap={3} padding={5}>
      <Kicker no="R+">New rule</Kicker>
      <Head>Add a rule</Head>
      <Flex gap={2}>
        <Input
          size="sm"
          borderRadius="l2"
          fontSize="14px"
          placeholder="Say it in your own words"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="The rule, in your own words"
        />
        <Button
          size="sm"
          borderRadius="l2"
          flexShrink={0}
          disabled={!text.trim()}
          loading={ask.isPending || draft.applying}
          onClick={() => submit()}
        >
          Add
        </Button>
      </Flex>
      {refused ? (
        <StatusText tone="pending" size="12.5px">
          <Text as="span" color="fg" lineHeight="1.5">
            Can’t check that one.{' '}
            <Text as="span" color="fg.muted">
              {refused.notes[0] && !refused.notes[0].startsWith('Not expressible') ? refused.notes[0] : ''}
            </Text>
          </Text>
        </StatusText>
      ) : ask.error ? (
        <Text fontSize="12.5px" color="status.blocked">
          Couldn’t read it — {errorText(ask.error)}
        </Text>
      ) : (
        <Stack gap={2} align="start">
          <Text textStyle="label" color="fg.subtle">
            For example
          </Text>
          {EXAMPLES.map((ex) => (
            <Keycap key={ex} onClick={() => submit(ex)}>
              {ex}
            </Keycap>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

/**
 * The approval, decided where the order paused: what's proposed, why it needs an OK, and
 * the choices. Someone other than the named approver decides on their behalf (recorded as such).
 */
export const ApprovalCard = ({
  detail,
  me,
  deciding,
  onDecide,
}: {
  detail: OrderDetail;
  me: string | null;
  deciding: Decision | null;
  onDecide: (d: Decision) => void;
}) => {
  const approval = detail.approval!;
  const now = useNow(5_000);
  const left = Date.parse(approval.expiresAt) - now;
  const approver = approval.approver.name;
  const isMe = !!me && me.trim().toLowerCase() === approver.trim().toLowerCase();
  const names = namesOf(detail.order.lines, detail.order.open, detail.order.candidates);
  const proposal = approval.proposal;
  const proposed = (proposal?.lines ?? [])
    .map((l) => `${num(l.quantity)} ${l.unit} ${shortName(l.name)}${l.role === 'substitute' ? ' (substitute)' : ''}`)
    .join(' + ');
  const checks = detail.checks ?? detail.order.checks;
  const why = approval.reasons.map((r) => {
    const c = checks.find((x) => x.rule === r.rule);
    return c ? reasonOf(c, names) : plain(r.detail, names);
  });
  const off = !!deciding || left <= 0;
  return (
    <Stack gap={3} padding={5}>
      <Flex align="center" gap={2} marginX={-5} marginTop={-5} marginBottom={1} paddingX={5} height="36px" borderBottomWidth="1px" borderColor="border">
        <Caption n="03">Approval · hold</Caption>
        <Box flex={1} />
        <Text fontFamily="mono" fontSize="11px" color={left < 5 * 60_000 ? 'status.blocked' : 'status.pending'} flexShrink={0}>
          {minutesLeft(left)}
        </Text>
        <Dot tone="pending" size={7} />
      </Flex>
      <Head>{isMe ? 'Your OK is needed' : `Waiting for ${firstName(approver)}`}</Head>
      <Text fontSize="13px" lineHeight="1.5" color="fg.muted">
        {proposed || '—'}
      </Text>
      <Flex align="center" justify="space-between" borderTopWidth="1px" borderColor="border.strong" paddingTop={2.5}>
        <Text textStyle="label" color="fg.subtle">
          Total
        </Text>
        <Readout size={26} letterSpacing="0">
          {eur(proposal?.total ?? detail.order.total)}
        </Readout>
      </Flex>
      {why.length ? (
        <Text fontSize="13px" color="fg.muted" lineHeight="1.5">
          {why.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('. ')}.
        </Text>
      ) : null}
      {/* The two-key panel. */}
      <Flex gap={2.5} padding={2.5} marginX={-1} borderRadius="l3" bg="bg.muted" borderWidth="1px" borderColor="border">
        <Button
          flex={1}
          height="44px"
          borderRadius="l2"
          bg="status.auto"
          color="status.contrast"
          _hover={{ opacity: 0.92 }}
          loading={deciding === 'approve'}
          disabled={off}
          onClick={() => onDecide('approve')}
        >
          Approve
        </Button>
        <Button
          flex={1}
          height="44px"
          borderRadius="l2"
          variant="outline"
          loading={deciding === 'decline'}
          disabled={off}
          onClick={() => onDecide('decline')}
        >
          Decline
        </Button>
      </Flex>
      {approval.fallback.lines.length ? (
        <Button
          size="xs"
          variant="ghost"
          color="fg.muted"
          loading={deciding === 'partial'}
          disabled={off}
          onClick={() => onDecide('partial')}
        >
          Only what’s in stock ({eur(approval.fallback.total, 0)})
        </Button>
      ) : null}
      <Box borderTopWidth="1px" borderColor="border" paddingTop={2}>
        <Text fontSize="11.5px" color="fg.subtle">
          {isMe ? `Signed as ${me}, with the time — into the audit log.` : `Recorded as decided by ${me ?? 'you'} for ${firstName(approver)}.`}
        </Text>
      </Box>
    </Stack>
  );
};
