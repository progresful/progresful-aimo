import { Box, Button, CloseButton, Dialog, Flex, Menu, Portal, Spinner, Stack, Text } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuArrowRight, LuChevronDown, LuPencil, LuPlus } from 'react-icons/lu';
import {
  Check,
  OrderDetail,
  OrderResult,
  Policy,
  PolicyRule,
  Scenario,
  useAgents,
  useOrder,
  usePolicies,
  usePolicy,
  useRunScenario,
} from '@/api/gateway';
import { Num, Section, Stamp } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { defaultAgent } from '@/pages/home/format';
import { RequestEditor } from '@/pages/workspace/RequestEditor';
import { Applied, changeSummary, signedVersionOf, useApplyRules, useDropLeftoverDraft } from '@/pages/policies/apply';
import { approverOf, diffSummary, rememberSentence, ruleSentence } from '@/pages/policies/visuals';
import { BOUND_POLICY_KEY, scenarios } from './graph';
import { CheckRow, SheetHead, StepInspector } from './Inspector';
import { CanvasControls, RequestCard, errorText, useDecideOnRun } from './parts';
import { PlaybookCanvas } from './PlaybookCanvas';
import { Details, StatusText } from './quiet';
import { RunLog } from './RunLog';
import { RunState, useRun } from './useRun';
import { AddChoice, AddRuleMenu } from './editor/EditorNode';
import { DescribeRule } from '@/pages/policies/DescribeRule';
import { ChallengeStrip } from '@/pages/tryit/ChallengeStrip';
import { markDone } from '@/pages/tryit/progress';
import {
  AddableType,
  EditorGraph,
  buildEditorGraph,
  changesAgainst,
  insertRule,
  newRule,
  nodeOfRule,
  paintRun,
  problemsOf,
  ruleNodeId,
  stableJson,
} from './editor/model';
import { RulePanel } from './editor/RulePanel';
import { useEditorNodes } from './editor/nodes';
import { TestCard, TestRequest, defaultTestRequest, useNamedLines, useTestRuns } from './editor/TestRun';

const TEST = '__test';
const DESCRIBE = '__describe';
/** Panels that aren't a step on the graph. */
const isPanel = (id: string | null) => id === TEST || id === DESCRIBE;

/**
 * /app/policy/graph — the playbook: the signed policy as a graph, built from its rules.
 * View mode: click a step to read what it does; a demo menu plays a real run on it.
 * Edit mode (?edit=1): click a step to change its rule, add or remove product rules — each
 * change takes effect shortly after the last edit, signed by you (Undo in the toast) — and
 * see what it does to a sample order.
 * `?policy=<key>` picks the policy (default: the demo agents' dairy policy).
 */
export const PlaybookPage = () => {
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1';
  // Default: the demo dairy policy, else (e.g. in the judge sandbox) the first policy an agent is bound to.
  const policies = usePolicies();
  const fallbackKey = policies.data?.some((x) => x.key === BOUND_POLICY_KEY)
    ? BOUND_POLICY_KEY
    : (policies.data?.find((x) => x.agents.length)?.key ?? policies.data?.[0]?.key);
  const policyKey = params.get('policy') ?? fallbackKey;
  const policyQ = usePolicy(policyKey);
  const p = policyQ.data;

  const setEditing = (on: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (on) next.set('edit', '1');
        else next.delete('edit');
        return next;
      },
      { replace: true }
    );

  if (!p)
    return (
      <Flex height="100%" align="center" justify="center" color="fg.subtle" fontSize="13px" gap={2}>
        {policyQ.error ? <Text color="status.blocked">{errorText(policyQ.error)}</Text> : <Spinner size="sm" />}
      </Flex>
    );
  return (
    <Playbook
      key={p.key}
      policy={p}
      editing={editing}
      setEditing={setEditing}
      describe={editing ? params.get('describe') : null}
      challenge={params.get('try') === 'rule'}
    />
  );
};

const Playbook = ({
  policy: p,
  editing,
  setEditing,
  describe,
  challenge,
}: {
  policy: Policy;
  editing: boolean;
  setEditing: (on: boolean) => void;
  /** `?describe=` — open "Describe a rule" with this sentence filled in. */
  describe: string | null;
  /** Opened from the "Write your own rule" challenge. */
  challenge: boolean;
}) => {
  const signed = signedVersionOf(p);
  useDropLeftoverDraft(p);
  const [local, setLocal] = useState<PolicyRule[] | null>(null);
  const [last, setLast] = useState<Applied | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(describe ? DESCRIBE : null);
  const [confirm, setConfirm] = useState<'leave' | null>(null);
  const [describeRun, setDescribeRun] = useState(0);
  const qc = useQueryClient();
  const { apply, applying } = useApplyRules();

  // What's on the graph: the rules in effect, or the edit being made to them.
  const serverRules = useMemo(() => signed?.rules ?? p.rules, [signed, p.rules]);
  const rules = editing ? (local ?? serverRules) : serverRules;
  const dirty = editing && local !== null && stableJson(local) !== stableJson(serverRules);
  // Marks: the edit being made, else the latest change while it's the version in effect.
  const markAgainst = dirty ? serverRules : last && signed && last.version === signed.version ? last.before : null;
  const changes = useMemo(() => (editing ? changesAgainst(rules, markAgainst) : {}), [editing, rules, markAgainst]);
  const problems = useMemo(() => problemsOf(rules), [rules]);
  const graph = useMemo(() => buildEditorGraph(rules, changes, editing), [rules, changes, editing]);
  const hasProblems = Object.keys(problems).length > 0;

  const setRules = (next: PolicyRule[], select?: string) => {
    setLocal(next);
    if (select) setSelectedId(select);
    else if (selectedId?.startsWith('rule:') && !next.some((r) => ruleNodeId(r.key) === selectedId)) setSelectedId(null);
  };
  const addRule = (choice: AddChoice) => {
    if (choice === 'describe') {
      setDescribeRun((n) => n + 1); // a fresh box every time it's opened
      return setSelectedId(DESCRIBE);
    }
    const type: AddableType = choice;
    // One delivery-days rule per policy: open the one there is.
    if (type === 'delivery.days' && rules.some((r) => r.type === type)) return setSelectedId('stock');
    const rule = newRule(type, rules);
    setRules([...rules, rule], nodeOfRule(rule));
  };
  const addDrafted = (drafted: PolicyRule, sentence: string | null) => {
    const { rules: next, rule } = insertRule(rules, drafted);
    rememberSentence(rule.key, sentence);
    markDone('rule');
    setRules(next, nodeOfRule(rule));
    addedSentence.current = { key: rule.key, words: sentence ?? ruleSentence(rule) };
  };
  const deleteRule = (key: string) => setRules(rules.filter((r) => r.key !== key));

  // --- Every change takes effect on its own: shortly after the last edit, signed by you ------
  const addedSentence = useRef<{ key: string; words: string } | null>(null);
  const summaryOf = (next: PolicyRule[]) => {
    const added = addedSentence.current;
    if (added && next.some((r) => r.key === added.key) && !serverRules.some((r) => r.key === added.key))
      return changeSummary('Added', added.words);
    const words = diffSummary(next, serverRules, approverOf(next, p.approver));
    return changeSummary('Changed', words);
  };
  const applyNow = (next: PolicyRule[]) =>
    apply(p.key, next, summaryOf(next), { onUndone: setLast }).then((done) => {
      // Keep edits made while this change was on its way.
      setLocal((cur) => (cur && stableJson(cur) !== stableJson(next) ? cur : null));
      if (done) setLast(done);
      return done;
    });
  const latestApply = useRef(applyNow);
  useEffect(() => {
    latestApply.current = applyNow;
  });
  const toApply = dirty && !hasProblems && local ? stableJson(local) : null;
  useEffect(() => {
    if (!toApply) return;
    const t = setTimeout(() => void latestApply.current(JSON.parse(toApply) as PolicyRule[]), 800);
    return () => clearTimeout(t);
  }, [toApply]);

  const leave = () => {
    // An edit that can't be applied as it stands is dropped (after asking); a valid one applies now.
    if (dirty && hasProblems) return setConfirm('leave');
    if (dirty && local) void applyNow(local);
    setSelectedId(null);
    setEditing(false);
  };

  // --- Test with an order (edit mode) ---------------------------------------------
  const agents = useAgents();
  const [test, setTest] = useState<TestRequest>(defaultTestRequest);
  const namedLines = useNamedLines(test.lines);
  const agent = agents.data?.find((a) => a.id === test.agentId) ?? defaultAgent(agents.data);
  const results = useTestRuns(test, editing ? (agent?.id ?? null) : null, signed?.id ?? null);
  const painted = results.signed;

  // --- Runs on the graph ---------------------------------------------------------
  const { state: run, play, show, append, reset } = useRun();
  const [shape, setShape] = useState('');
  useEffect(() => {
    if (!editing) return;
    if (!painted) {
      reset();
      setShape('');
      return;
    }
    // A new path sweeps across the graph; same path with new numbers updates in place.
    const next = painted.steps.map((s) => `${s.step}:${s.status}`).join() + painted.checks.map((c) => `${c.rule}:${c.passed}`).join();
    if (next !== shape) play(painted.steps, { orderId: 'preview', speed: 0.22 });
    else show(painted.steps, { orderId: 'preview' });
    setShape(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painted, editing]);

  // Demo runs (view mode).
  const navigate = useNavigate();
  const [follow, setFollow] = useState(false);
  const [lastResult, setLastResult] = useState<OrderResult | null>(null);
  const runScenario = useRunScenario();
  const orderQ = useOrder(editing ? null : run.orderId === 'preview' ? null : run.orderId);
  const detail: OrderDetail | null =
    orderQ.data ??
    (lastResult && lastResult.order.id === run.orderId
      ? {
          order: lastResult.order,
          checks: lastResult.checks,
          quote: lastResult.quote,
          approval: lastResult.approval,
          audit: lastResult.audit,
        }
      : null);
  const liveOrder = orderQ.data;
  useEffect(() => {
    if (editing || run.phase !== 'waiting' || !liveOrder) return;
    append(liveOrder.audit, { waiting: liveOrder.approval?.status === 'pending' });
  }, [editing, run.phase, liveOrder, append]);

  const toggleEdit = () => {
    if (editing) return leave();
    reset();
    setSelectedId(null);
    setEditing(true);
  };

  const start = (id: Scenario) => {
    reset();
    setSelectedId(null);
    runScenario.mutate(id, {
      onSuccess: (result) => {
        setLastResult(result);
        qc.setQueryData(['gw', 'order', result.order.id], {
          order: result.order,
          checks: result.checks,
          quote: result.quote,
          approval: result.approval,
          audit: result.audit,
        } satisfies OrderDetail);
        play(result.audit, { orderId: result.order.id, waiting: result.approval?.status === 'pending' });
      },
      onError: (err) => toaster.create({ type: 'error', title: 'The demo didn’t run', description: errorText(err) }),
    });
  };
  const { onDecide, deciding } = useDecideOnRun(detail, append);

  const checks: Check[] | null = editing ? (painted?.checks ?? null) : (detail?.checks ?? null);
  const paintedRun = useMemo(() => paintRun(run, graph, rules, checks), [run, graph, rules, checks]);

  const inspected = selectedId ?? (!editing && run.phase === 'waiting' ? 'approval' : null);
  const nodes = useEditorNodes(graph, paintedRun, inspected, editing, problems, addRule, deleteRule);
  const isBound = p.key === BOUND_POLICY_KEY;
  const requestEntry = run.log.find((e) => e.step === 'request');
  const busy = run.phase === 'running' || runScenario.isPending;
  const panelOpen = !!inspected;

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <Flex
        align="center"
        gap={4}
        paddingX={6}
        paddingY={3}
        minHeight="72px"
        borderBottomWidth="1px"
        borderColor="border"
        bg="bg"
        flexShrink={0}
      >
        <Box minWidth={0} flex={1}>
          <Flex align="baseline" gap={3} minWidth={0}>
            <Text textStyle="title" lineHeight="1.1" flexShrink={0}>
              Playbook
            </Text>
            <Text textStyle="caps" color="fg.subtle" truncate>
              {p.name}
            </Text>
          </Flex>
          <Flex align="center" gap={3} marginTop={1.5} fontSize="12.5px" minWidth={0}>
            <VersionStatus policy={p} busy={(dirty && !hasProblems) || applying} />
            <Link to="/app/policy">
              <Text
                as="span"
                color="brand.fg"
                fontSize="12.5px"
                textDecoration="underline"
                textDecorationColor="brand.accent/40"
                textUnderlineOffset="3px"
                _hover={{ textDecorationColor: 'brand.accent' }}
                whiteSpace="nowrap"
              >
                Read the mandate
              </Text>
            </Link>
          </Flex>
        </Box>

        {editing ? (
          <Flex gap={2} flexShrink={0} align="center">
            <AddRuleMenu onAdd={addRule}>
              <Button size="sm" variant="ghost" color="brand.fg">
                <LuPlus /> Add rule
              </Button>
            </AddRuleMenu>
            <Box width="1px" height="24px" bg="border" marginX={1} />
            <Button size="sm" borderRadius="l2" variant="outline" onClick={toggleEdit}>
              Done
            </Button>
          </Flex>
        ) : (
          <Flex gap={3} flexShrink={0} align="center">
            <Flex gap={4} display={{ base: 'none', xl: 'flex' }} marginRight={2}>
              <StatusText tone="auto" size="12.5px">
                Passes on its own
              </StatusText>
              <StatusText tone="pending" size="12.5px">
                Needs a person
              </StatusText>
              <StatusText tone="blocked" size="12.5px">
                Blocked
              </StatusText>
            </Flex>
            {isBound ? (
              <Menu.Root positioning={{ placement: 'bottom-end' }} onSelect={({ value }) => start(value as Scenario)}>
                <Menu.Trigger asChild>
                  <Button size="sm" variant="ghost" color="fg.muted" loading={runScenario.isPending} loadingText="Running…" disabled={busy}>
                    Run a demo <LuChevronDown />
                  </Button>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content width="300px" padding={1} borderRadius="l3" boxShadow="float">
                      {scenarios.map((s) => (
                        <Menu.Item key={s.id} value={s.id} paddingY={2} alignItems="start">
                          <Box>
                            <Text fontSize="13px" fontWeight="500">
                              {s.name}
                            </Text>
                            <Text fontSize="12px" color="fg.subtle" whiteSpace="normal">
                              {s.summary}
                            </Text>
                          </Box>
                        </Menu.Item>
                      ))}
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            ) : null}
            <Button size="sm" borderRadius="l2" variant="outline" onClick={toggleEdit}>
              <LuPencil /> Edit
            </Button>
          </Flex>
        )}
      </Flex>

      <Flex flex={1} minHeight={0}>
        <Box flex={1} position="relative" minWidth={0} overflow="hidden">
          <ReactFlowProvider>
            <PlaybookCanvas
              run={paintedRun}
              selectedId={isPanel(inspected) ? null : inspected}
              onSelect={(id) => setSelectedId(id)}
              follow={!editing && follow}
              inspectorOpen={false}
              preview={editing}
              custom={{ nodes, edges: graph.drawn }}
              bottomInset={editing ? 176 : undefined}
            />
          </ReactFlowProvider>

          {editing ? (
            <>
              <Text
                position="absolute"
                top={4}
                left={5}
                fontSize="13.5px"
                color="fg.subtle"
                zIndex={5}
                pointerEvents="none"
              >
                Click a step or a rule to change it. Dashed = what the test order would do.
              </Text>
              <TestCard
                req={{ ...test, lines: namedLines }}
                results={results}
                version={signed?.version ?? null}
                applying={(dirty && !hasProblems) || applying}
                invalid={dirty && hasProblems}
                changing={inspected === TEST}
                onChange={() => setSelectedId((s) => (s === TEST ? null : TEST))}
              />
            </>
          ) : requestEntry || runScenario.isPending ? (
            <RequestCard
              label={`Demo request · ${(requestEntry?.payload.agent as { name?: string } | undefined)?.name ?? 'buyer agent'}`}
              text={requestEntry ? requestEntry.message.replace(/ · policy .*$/, '') : 'Sending to the gateway…'}
            />
          ) : (
            <Text position="absolute" top={4} left={5} fontSize="13.5px" color="fg.subtle" zIndex={5}>
              Click a step or a rule to see what it checks.
            </Text>
          )}

          {!editing ? (
            <CanvasControls follow={follow} onFollow={() => setFollow((f) => !f)}>
              {run.orderId && run.orderId !== 'preview' && run.phase !== 'running' ? (
                <>
                  <Button size="sm" borderRadius="l2" variant="outline" onClick={() => navigate(`/app/runs/${run.orderId}`)}>
                    Open this run <LuArrowRight />
                  </Button>
                  <Button size="sm" borderRadius="l2" variant="ghost" color="fg.muted" onClick={reset}>
                    Clear
                  </Button>
                </>
              ) : null}
            </CanvasControls>
          ) : null}
        </Box>

        {panelOpen ? (
          // The inspector is a sheet laid beside the graph paper, an ink rule along its top.
          <Box
            width="380px"
            flexShrink={0}
            borderLeftWidth="1px"
            borderTopWidth="2px"
            borderColor="border"
            borderTopColor="border.strong"
            overflowY="auto"
            bg="bg.panel"
            boxShadow="float"
            position="relative"
            zIndex={2}
          >
            {inspected === DESCRIBE ? (
              <Box padding={5}>
                <Flex justify="end" marginBottom={-7} marginTop={-1} marginRight={-1.5}>
                  <CloseButton size="xs" color="fg.muted" onClick={() => setSelectedId(null)} />
                </Flex>
                {challenge ? (
                  <Box marginBottom={5} marginTop={8}>
                    <ChallengeStrip id="rule" />
                  </Box>
                ) : null}
                <DescribeRule
                  key={describeRun}
                  policyKey={p.key}
                  onAdd={addDrafted}
                  onManual={addRule}
                  initialText={describeRun === 0 ? (describe ?? undefined) : undefined}
                />
              </Box>
            ) : inspected === TEST ? (
              <Box>
                <RequestEditor
                  text=""
                  onText={() => undefined}
                  onParse={() => undefined}
                  parsing={false}
                  parseError={null}
                  parsed={null}
                  hideDescribe
                  lines={namedLines}
                  onLines={(fn) => setTest((t) => ({ ...t, lines: fn(t.lines) }))}
                  date={test.date}
                  onDate={(date) => setTest((t) => ({ ...t, date }))}
                  suggestedDate={null}
                  agents={agents.data ?? []}
                  agentId={agent?.id ?? null}
                  onAgent={(agentId) => setTest((t) => ({ ...t, agentId }))}
                  allowSubstitutes={test.allowSubstitutes}
                  onAllowSubstitutes={(allowSubstitutes) => setTest((t) => ({ ...t, allowSubstitutes }))}
                  title="Test order"
                  source="A dry run against the rules in effect — nothing is ordered."
                />
                <Box paddingX={5} paddingBottom={5}>
                  <Button size="xs" variant="ghost" color="fg.muted" marginLeft={-2} onClick={() => setTest(defaultTestRequest())}>
                    Back to the sample order
                  </Button>
                </Box>
              </Box>
            ) : editing ? (
              <RulePanel
                key={inspected}
                stepId={inspected!}
                graph={graph}
                rules={rules}
                signedRules={markAgainst}
                problems={problems}
                checks={painted?.checks ?? null}
                onRules={setRules}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <ViewPanel
                stepId={inspected!}
                graph={graph}
                rules={rules}
                run={paintedRun}
                detail={detail}
                detailLoading={orderQ.isLoading}
                deciding={deciding}
                onDecide={onDecide}
                onClose={() => setSelectedId(null)}
              />
            )}
          </Box>
        ) : null}
      </Flex>

      {!editing ? (
        <RunLog
          run={run}
          selectedId={inspected}
          onSelect={(id) =>
            setSelectedId(id === 'lactose' ? (graph.steps.find((s) => s.ruleKey?.startsWith('nutrition'))?.id ?? null) : id)
          }
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title="Leave without this change?"
        body="The rule marked in red isn’t valid, so it can’t take effect. The rules in effect stay as they are."
        confirmLabel="Leave"
        loading={false}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setLocal(null);
          setConfirm(null);
          setSelectedId(null);
          setEditing(false);
        }}
      />
    </Flex>
  );
};

/** "SIGNED v3 · in effect, signed by Mikko" / "SIGNED v3 · applying your change…" — a stamp, the version in mono, then words. */
const VersionStatus = ({ policy: p, busy }: { policy: Policy; busy: boolean }) => {
  const signed = p.activeVersion;
  const sig = signedVersionOf(p)?.signature ?? null;
  const line = (tone: 'auto' | 'pending' | 'running', word: string, version: number, rest: ReactNode) => (
    <Flex align="center" gap={2} minWidth={0} color="fg.muted">
      <Stamp tone={tone}>{word}</Stamp>
      <Num color="fg">v{version}</Num>
      <Text as="span" truncate>
        {rest}
      </Text>
    </Flex>
  );
  if (!signed) return line('pending', 'Not in effect', p.version, 'apply it from the Rules page');
  if (busy) return line('running', 'Signed', signed, 'applying your change…');
  return line('auto', 'Signed', signed, `in effect${sig ? `, signed by ${sig.signedBy}` : ''}`);
};

/** View mode: what a step does (and did, for a demo run). */
const ViewPanel = ({
  stepId,
  graph,
  rules,
  run,
  detail,
  detailLoading,
  deciding,
  onDecide,
  onClose,
}: {
  stepId: string;
  graph: EditorGraph;
  rules: PolicyRule[];
  run: RunState;
  detail: OrderDetail | null;
  detailLoading: boolean;
  deciding: Parameters<typeof StepInspector>[0]['deciding'];
  onDecide: Parameters<typeof StepInspector>[0]['onDecide'];
  onClose: () => void;
}) => {
  const step = graph.steps.find((s) => s.id === stepId);
  if (!step) return null;
  if (!step.ruleKey)
    return (
      <StepInspector
        key={stepId}
        stepId={stepId}
        run={run}
        detail={detail}
        detailLoading={detailLoading}
        deciding={deciding}
        onClose={onClose}
        onDecide={onDecide}
        stepOverride={{
          title: step.title,
          no: step.no,
          description: step.sentence ? `${step.sentence}. ${step.description}` : step.description,
        }}
      />
    );
  const rule = rules.find((r) => r.key === step.ruleKey);
  const check = detail?.checks.find((c) => c.rule === step.ruleKey);
  return (
    <Stack gap={5} padding={5}>
      <SheetHead eyebrow="Rule of the mandate" clause={step.no} title={step.title} onClose={onClose} />
      {rule ? (
        <Text fontSize="15px" lineHeight="1.55">
          {ruleSentence(rule)}
        </Text>
      ) : null}
      <Text color="fg.muted" fontSize="13px" lineHeight="1.6">
        {step.description}
      </Text>
      {check ? (
        <Section title="In this order">
          <CheckRow check={check} />
        </Section>
      ) : null}
      {rule ? (
        <Details>
          <Text fontSize="12px" color="fg.subtle" fontFamily="mono" whiteSpace="pre-wrap">
            {JSON.stringify(rule, null, 2)}
          </Text>
        </Details>
      ) : null}
    </Stack>
  );
};

const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Dialog.Root open={open} onOpenChange={(e) => (e.open ? null : onCancel())} placement="center" size="sm">
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content
          bg="bg.panel"
          borderWidth="1px"
          borderTopWidth="2px"
          borderColor="border.strong"
          borderTopColor="status.blocked"
          borderRadius="l3"
          boxShadow="float"
        >
          <Dialog.Header>
            <Dialog.Title textStyle="title" fontWeight="400">
              {title}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Text fontSize="13px" color="fg.muted">
              {body}
            </Text>
          </Dialog.Body>
          <Dialog.Footer>
            <Button size="sm" variant="ghost" color="fg.muted" onClick={onCancel}>
              Keep editing
            </Button>
            <Button
              size="sm"
              borderRadius="l2"
              bg="status.blocked"
              color="status.contrast"
              _hover={{ opacity: 0.92 }}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);
