// The order's graph: the few steps an order goes through, with the rules as nodes of
// their own — each says what it means for this order (✓ / ! / ✕). Built from the
// policy, painted from a dry run or the order's real audit trail. A node's details
// (and the approval, and "Add a rule") open as a small card anchored to it.
import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import {
  Background,
  BackgroundVariant,
  Handle,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  useUpdateNodeInternals,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ReactNode, createContext, memo, useContext, useEffect, useMemo, useRef } from 'react';
import type { IconType } from 'react-icons';
import { LuCheck, LuMinus, LuPackageSearch, LuPlus, LuReplace, LuShoppingCart, LuTriangleAlert, LuUserCheck, LuX } from 'react-icons/lu';
import type { Candidate, Check, PolicyRule } from '@/api/gateway';
import { Dot, Tone, toneColor } from '@/components/kit';
import { useColorMode } from '@/components/ui/color-mode';
import { shortName } from '@/pages/home/format';
import { FlowEdge, FlowEdgeType } from '@/pages/playbook/FlowEdge';
import { Change, changesAgainst } from '@/pages/playbook/editor/model';
import { StepStatus, eur, fmtDay, num } from '@/pages/playbook/graph';
import type { RunState } from '@/pages/playbook/useRun';
import { Verdict, VerdictContext, firstName, ruleShort, verdictOf } from './model';

// --- The graph, from the rules and a run ------------------------------------------------

export type GraphNode = {
  id: string;
  kind: 'step' | 'rule';
  icon?: IconType;
  tint?: string;
  title: string;
  /** One status line: what happened (or would happen) here. */
  line: string | null;
  status: StepStatus;
  mark?: Verdict['mark'];
  /** The step's number on the diagram ("01"); a rule's number ("R03"). */
  no: string;
  change?: Change;
  rule?: PolicyRule;
  position: { x: number; y: number };
  width: number;
  height: number;
};

type GraphEdge = { id: string; source: string; target: string; state: 'idle' | 'taken' | 'live' };

export type OrderGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lane: { x: number; y: number; width: number; height: number; count: number; no: string };
};

/** Rules that only shape the flow get no node: the approver is the approval step, ranking belongs to substitutes. */
const laneRules = (rules: PolicyRule[], substitutes: boolean) =>
  rules.filter((r) => r.type !== 'approval' && r.type !== 'substitution.rank' && (r.type !== 'substitution' || substitutes));

const STEP_W = 212;
const RULE_W = 244;
const GAP = 72;
const LANE_PAD = 10;
const LANE_HEAD = 44;
const ADD_ROOM = 50;
const STEP_H = 84;
// A rule is one or two lines of title over its status line; rules are rows in the rack.
const RULE_H = [56, 72];
/** The empty rules lane's hint. */
const EMPTY_H = 104;
const RULE_GAP = 0;
const ruleH = (title: string) => RULE_H[title.length > 21 ? 1 : 0];

const reached = (s: StepStatus | undefined) => s === 'auto' || s === 'pending' || s === 'blocked';
const flows = (s: StepStatus | undefined) => s === 'auto' || s === 'pending';

const toneStatus: Record<Tone, StepStatus> = { auto: 'auto', pending: 'pending', blocked: 'blocked', running: 'running', idle: 'skipped' };

type Input = {
  rules: PolicyRule[];
  /** The rules before the latest change (or the edit being typed): marks the new and changed ones. */
  signedRules: PolicyRule[] | null;
  run: RunState;
  checks: Check[] | null;
  ctx: VerdictContext;
  /** A dry run is on the graph: words in the conditional. */
  preview: boolean;
  date: string | null;
  candidates: Candidate[];
  total: number | null;
  editable: boolean;
};

export const buildOrderGraph = ({
  rules,
  signedRules,
  run,
  checks,
  ctx,
  preview,
  date,
  candidates,
  total,
  editable,
}: Input): OrderGraph => {
  const s = run.statuses;
  const changes = changesAgainst(rules, signedRules);
  const all = checks ?? [];
  const failed = (rule: string) => all.find((c) => c.rule === rule && !c.passed);
  const showSubs = reached(s.substitutes) || s.substitutes === 'running';
  const lane = laneRules(rules, ctx.substitutes);
  const approver = firstName(ctx.approver);

  // Columns, left to right; the rules stack in one (or two) columns of their own.
  const cols = lane.length > 6 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(lane.length / cols));
  // Each row as tall as its tallest rule.
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(RULE_H[0], ...lane.slice(r * cols, r * cols + cols).map((x) => ruleH(ruleShort(x)))));
  const rowY = rowH.map((_, r) => LANE_HEAD + rowH.slice(0, r).reduce((a, h) => a + h + RULE_GAP, 0));
  // No rules: room for the hint on how to get some.
  const rulesH = lane.length ? rowH.reduce((a, h) => a + h, 0) + (rows - 1) * RULE_GAP : editable ? EMPTY_H : 56;
  const laneW = cols * RULE_W + (cols - 1) * 16 + LANE_PAD * 2;
  const laneH = LANE_HEAD + rulesH + (editable ? ADD_ROOM : 0) + LANE_PAD;
  const midY = laneH / 2 - STEP_H / 2;
  let x = 0;
  const next = (w: number) => {
    const at = x;
    x += w + GAP;
    return at;
  };
  const xValio = next(STEP_W);
  const xSubs = showSubs ? next(STEP_W) : 0;
  const xLane = next(laneW);
  const xApproval = next(STEP_W);
  const xOrder = next(STEP_W);

  // Valio: price and stock in one step.
  const valioStatus: StepStatus =
    s.lookup === 'running' || s.stock === 'running'
      ? 'running'
      : !reached(s.stock)
        ? reached(s.lookup)
          ? s.lookup!
          : (s.stock ?? 'idle')
        : failed('order.nonEmpty') || failed('catalog.known')
          ? 'blocked'
          : failed('stock.coverage')
            ? 'pending'
            : 'auto';
  const stockEntry = run.log.filter((e) => e.step === 'stock').at(-1);
  const short = ((stockEntry?.payload?.lines as { short: number; unit: string }[] | undefined) ?? []).filter((l) => l.short > 0);
  const valioLine = !reached(valioStatus)
    ? null
    : failed('order.nonEmpty')
      ? `Can’t deliver ${date ? fmtDay(date).split(' ')[0] : 'then'}`
      : failed('catalog.known')
        ? 'Unknown product'
        : short.length
          ? `Short ${short.map((l) => `${num(l.short)} ${l.unit}`).join(' + ')}`
          : `In stock${date ? ` for ${fmtDay(date).split(' ')[0]}` : ''}`;

  const picked = candidates.find((c) => c.verdict === 'picked');

  const ruleNodes: GraphNode[] = lane.map((r, i) => {
    const gate = r.type === 'nutrition' && reached(s.lactose) ? s.lactose : s.policy;
    const running = s.policy === 'running' || (r.type === 'nutrition' && s.lactose === 'running');
    const v = reached(gate) || reached(s.policy) ? verdictOf(r, checks, ctx) : null;
    const untested = !!changes[r.key] && !all.some((c) => c.rule === r.key) && r.type !== 'nutrition';
    const status: StepStatus = running
      ? 'running'
      : untested
        ? 'idle'
        : v
          ? toneStatus[v.tone]
          : s.policy === 'skipped'
            ? 'skipped'
            : 'idle';
    const title = ruleShort(r);
    return {
      id: `rule:${r.key}`,
      kind: 'rule',
      title,
      line: running ? 'Checking…' : untested ? 'Not checked yet' : (v?.label ?? null),
      status,
      mark: v && !untested ? v.mark : undefined,
      change: changes[r.key],
      rule: r,
      no: `R${String(i + 1).padStart(2, '0')}`,
      position: { x: xLane + LANE_PAD + (i % cols) * (RULE_W + 16), y: rowY[Math.floor(i / cols)] },
      width: RULE_W,
      height: rowH[Math.floor(i / cols)],
    };
  });

  const approvalLine = (() => {
    switch (s.approval) {
      case 'skipped':
        return 'Not needed';
      case 'running':
        return `Asking ${approver}…`;
      case 'pending':
        return preview ? 'Would be asked' : 'Waiting';
      case 'auto':
        return ctx.decided?.status === 'partial' ? 'In-stock part approved' : `Approved by ${firstName(ctx.decided?.by ?? ctx.approver)}`;
      case 'blocked':
        return ctx.decided?.status === 'timed_out' ? 'Nobody answered' : `Declined by ${firstName(ctx.decided?.by ?? ctx.approver)}`;
      default:
        // No rule can ask a person for anything.
        return lane.length === 0 ? 'Not needed' : null;
    }
  })();

  const orderLine = (() => {
    switch (s.order) {
      case 'auto':
        return preview ? `Would order${total ? ` ${eur(total)}` : ''}` : `Ordered${total ? ` · ${eur(total)}` : ''}`;
      case 'blocked':
        return 'Not ordered';
      case 'skipped':
        return preview ? `Once ${approver} says OK` : 'Not ordered';
      case 'running':
        return 'Placing…';
      default:
        return null;
    }
  })();

  // Steps are numbered left to right; the rules lane takes its number in the chain.
  const order = ['valio', ...(showSubs ? ['substitutes'] : []), 'lane', 'approval', 'order'];
  const noOf = (id: string) => String(order.indexOf(id) + 1).padStart(2, '0');
  const step = (
    id: string,
    xAt: number,
    title: string,
    icon: IconType,
    tint: string,
    status: StepStatus | undefined,
    line: string | null
  ): GraphNode => ({
    id,
    kind: 'step',
    icon,
    tint,
    title,
    no: noOf(id),
    // A step at work says so, until it has something to report.
    line: line ?? (status === 'running' ? 'Working…' : null),
    status: status ?? 'idle',
    position: { x: xAt, y: midY },
    width: STEP_W,
    height: STEP_H,
  });

  const nodes: GraphNode[] = [
    step('valio', xValio, 'Valio stock', LuPackageSearch, 'kind.valio', valioStatus, valioLine),
    ...(showSubs
      ? [
          step(
            'substitutes',
            xSubs,
            'Substitute',
            LuReplace,
            'kind.rank',
            s.substitutes,
            picked ? `${shortName(picked.name)} instead` : reached(s.substitutes) ? 'None fits' : null
          ),
        ]
      : []),
    ...ruleNodes,
    step('approval', xApproval, `${approver}’s OK`, LuUserCheck, 'kind.human', s.approval, approvalLine),
    step('order', xOrder, preview ? 'Place order' : 'Order', LuShoppingCart, 'kind.action', s.order, orderLine),
  ];

  // The lane counts as reached once the rules were checked.
  const laneStatus: StepStatus | undefined = reached(s.policy)
    ? s.policy
    : s.policy === 'running' || s.lactose === 'running'
      ? 'running'
      : s.policy;
  const st: Record<string, StepStatus | undefined> = {
    valio: valioStatus,
    substitutes: s.substitutes,
    lane: laneStatus,
    // A skipped approval is passed straight through.
    approval: s.approval === 'skipped' && reached(s.order) ? 'auto' : s.approval,
    order: s.order,
  };
  const chain = ['valio', ...(showSubs ? ['substitutes'] : []), 'lane', 'approval', 'order'];
  const edges: GraphEdge[] = chain.slice(1).map((target, i) => {
    const source = chain[i];
    return {
      id: `e-${source}-${target}`,
      source,
      target,
      state: st[target] === 'running' ? 'live' : flows(st[source]) && reached(st[target]) ? 'taken' : 'idle',
    };
  });

  return { nodes, edges, lane: { x: xLane, y: 0, width: laneW, height: laneH, count: lane.length, no: noOf('lane') } };
};

// --- Drawing it ------------------------------------------------------------------------

type Ctx = {
  selectedId: string | null;
  /** The card anchored to a node, if it has one open. */
  cardFor: (id: string) => ReactNode | null;
  onAddRule?: () => void;
};

const GraphCtx = createContext<Ctx>({ selectedId: null, cardFor: () => null });

// Port jacks where the traces plug in: small rings on the module's edge.
const port = {
  width: 9,
  height: 9,
  background: 'var(--chakra-colors-node-handle)',
  border: '1.5px solid var(--chakra-colors-node-border)',
  borderRadius: '50%',
} as const;

const borderOf: Record<StepStatus, string> = {
  idle: 'node.border',
  running: 'brand.accent',
  auto: 'node.border',
  pending: 'status.pending',
  blocked: 'status.blocked',
  skipped: 'border.emphasized',
};

const lineColor: Record<StepStatus, string> = {
  idle: 'fg.subtle',
  running: 'status.running',
  auto: 'status.auto',
  pending: 'status.pending',
  blocked: 'status.blocked',
  skipped: 'fg.subtle',
};

const markIcon: Record<Verdict['mark'], ReactNode> = {
  '✓': <LuCheck strokeWidth={3} />,
  '!': <LuTriangleAlert strokeWidth={2.5} />,
  '✕': <LuX strokeWidth={3} />,
  '·': <LuMinus strokeWidth={3} />,
};

// A running module's scan line sweeps along its top edge; cards rise into place.
const pulse = keyframes`
  0% { transform: scaleX(0); transform-origin: left; }
  50% { transform: scaleX(1); transform-origin: left; }
  50.01% { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
`;
const rise = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
`;

type StepData = { node: GraphNode; hasIn: boolean; hasOut: boolean };
type LaneData = { width: number; height: number; count: number; no: string; editable: boolean };

const markTone = (s: StepStatus): Tone => (s === 'auto' ? 'auto' : s === 'pending' ? 'pending' : s === 'blocked' ? 'blocked' : s === 'running' ? 'running' : 'idle');

/** "New" / "Changed": the latest change, pencilled in. */
const ChangeMark = ({ change }: { change: Change }) => (
  <Text
    fontFamily="mono"
    fontSize="9.5px"
    fontWeight="600"
    letterSpacing="0.08em"
    textTransform="uppercase"
    color="status.pending"
    borderWidth="1px"
    borderStyle="dashed"
    borderColor="status.pending"
    borderRadius="l1"
    paddingX={1}
    lineHeight="14px"
    flexShrink={0}
  >
    {change === 'new' ? 'New' : 'Changed'}
  </Text>
);

/** A hard rule's switch: locked on. */
const HardSwitch = () => (
  <Flex align="center" gap={1} flexShrink={0} title="Hard rule — always enforced, nobody can wave it through">
    <Text fontFamily="mono" fontSize="8.5px" fontWeight="600" letterSpacing="0.08em" color="fg.muted">
      HARD
    </Text>
    <Box position="relative" width="18px" height="10px" borderRadius="full" bg="fg" flexShrink={0}>
      <Box position="absolute" top="2px" right="2px" width="6px" height="6px" borderRadius="full" bg="bg.panel" />
    </Box>
  </Flex>
);

/** A step: a hardware module on the board — engraved number + name, an LED, its title and one status line. */
const StepNode = memo(({ data }: NodeProps<Node<StepData>>) => {
  const { node, hasIn, hasOut } = data;
  const { selectedId } = useContext(GraphCtx);
  const selected = selectedId === node.id;
  const Icon = node.icon;
  const running = node.status === 'running';
  const off = node.status === 'skipped' || node.status === 'idle';
  return (
    <Box position="relative" width={`${node.width}px`} opacity={node.status === 'skipped' ? 0.55 : 1} transition="opacity 0.3s">
      {hasIn ? <Handle type="target" position={Position.Left} style={port} /> : null}
      <Box
        position="relative"
        minHeight={`${node.height}px`}
        borderRadius="l3"
        borderWidth="1px"
        borderStyle={node.status === 'skipped' ? 'dashed' : 'solid'}
        borderColor={selected ? 'brand.accent' : borderOf[node.status]}
        bg="node.bg"
        boxShadow={selected ? '0 0 0 2px var(--chakra-colors-brand-accent)' : node.status === 'skipped' ? 'none' : 'node'}
        transition="border-color 0.2s, box-shadow 0.2s, transform 0.2s var(--chakra-easings-out)"
        overflow="hidden"
        _hover={selected ? undefined : { transform: 'translateY(-1px)' }}
      >
        {running ? (
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            height="2px"
            bg="brand.accent"
            css={{ animation: `${pulse} 1.2s var(--chakra-easings-out) infinite` }}
          />
        ) : null}
        <Flex align="center" gap={2} height="26px" paddingX={3} borderBottomWidth="1px" borderColor="border">
          <Text textStyle="label" fontSize="10px" color="fg" flexShrink={0}>
            {node.no}
          </Text>
          {Icon ? (
            <Box color={off ? 'fg.subtle' : 'fg.muted'} fontSize="12px">
              <Icon />
            </Box>
          ) : null}
          <Box flex={1} />
          <Dot tone={markTone(node.status)} size={7} />
        </Flex>
        <Box paddingX={3} paddingTop={2} paddingBottom={2.5}>
          <Text fontWeight="600" fontSize="14.5px" letterSpacing="-0.015em" lineHeight="1.25" color="fg" truncate title={node.title}>
            {node.title}
          </Text>
          {node.line ? (
            <Flex align="center" gap={1.5} marginTop={1} fontSize="12px" fontWeight="500" color={lineColor[node.status]}>
              {running ? <Spinner size="xs" borderWidth="1.5px" /> : null}
              <Text as="span" truncate>
                {node.line}
              </Text>
            </Flex>
          ) : null}
        </Box>
      </Box>
      {hasOut ? <Handle type="source" position={Position.Right} style={port} /> : null}
    </Box>
  );
});

/** A rule: one module in the rack — LED, its number, its words, this order's mark; a hard rule shows its switch. */
const RuleNode = memo(({ data }: NodeProps<Node<StepData>>) => {
  const { node } = data;
  const { selectedId } = useContext(GraphCtx);
  const selected = selectedId === node.id;
  const running = node.status === 'running';
  const tone = markTone(node.status);
  const marked = !!node.mark && tone !== 'idle' && tone !== 'running';
  return (
    <Flex
      align="start"
      gap={2.5}
      width={`${node.width}px`}
      height={`${node.height}px`}
      paddingX={3}
      paddingY={2}
      borderBottomWidth="1px"
      borderColor="border"
      bg={selected ? 'brand.subtle' : 'transparent'}
      boxShadow={selected ? 'inset 3px 0 0 var(--chakra-colors-brand-accent)' : 'none'}
      transition="background 0.15s"
      _hover={selected ? undefined : { bg: 'bg.hover' }}
    >
      <Flex direction="column" align="center" gap={1.5} width="26px" flexShrink={0} paddingTop="2px">
        <Dot tone={tone} size={7} />
        <Text fontFamily="mono" fontSize="10px" lineHeight="1" color={selected ? 'brand.fg' : 'fg.subtle'} letterSpacing="0.02em">
          {node.no}
        </Text>
      </Flex>
      <Box flex={1} minWidth={0}>
        <Text fontWeight="500" fontSize="13px" lineHeight="1.3" color="fg" lineClamp={2} title={node.title}>
          {node.title}
        </Text>
        {node.line || node.change ? (
          <Flex align="center" gap={1.5} marginTop={0.5} minWidth={0}>
            {node.line ? (
              <Text fontSize="11.5px" fontWeight="500" color={lineColor[node.status]} truncate minWidth={0}>
                {node.line}
              </Text>
            ) : null}
            {node.change ? <ChangeMark change={node.change} /> : null}
          </Flex>
        ) : null}
      </Box>
      <Flex direction="column" align="end" gap={1.5} flexShrink={0} paddingTop="1px">
        <Flex
          key={`${node.mark ?? ''}${node.status}`}
          align="center"
          justify="center"
          width="18px"
          height="18px"
          borderRadius="l1"
          borderWidth="1px"
          borderColor={marked ? toneColor[tone] : 'border.emphasized'}
          borderStyle={marked || running ? 'solid' : 'dashed'}
          color={marked ? toneColor[tone] : 'fg.subtle'}
          fontSize="11px"
          css={marked ? { animation: 'readout-on 0.3s var(--chakra-easings-out) both' } : undefined}
        >
          {running ? <Spinner size="xs" borderWidth="1.5px" /> : marked && node.mark ? markIcon[node.mark] : null}
        </Flex>
        {node.rule?.hard ? <HardSwitch /> : null}
      </Flex>
    </Flex>
  );
});

/** The rules lane: a rack of rule modules under an engraved head, with "+ Add a rule" at its foot. */
const LaneNode = memo(({ data }: NodeProps<Node<LaneData>>) => {
  const { onAddRule } = useContext(GraphCtx);
  return (
    <Box
      position="relative"
      width={`${data.width}px`}
      height={`${data.height}px`}
      borderRadius="l3"
      borderWidth="1px"
      borderColor="canvas.laneBorder"
      bg="canvas.lane"
      boxShadow="node"
      cursor="default"
    >
      <Handle type="target" position={Position.Left} style={port} />
      <Flex
        position="absolute"
        top={0}
        left="12px"
        right="12px"
        height={`${LANE_HEAD - 6}px`}
        align="center"
        gap={2}
        borderBottomWidth="1px"
        borderColor="border.strong"
      >
        <Text textStyle="label" fontSize="10px" color="fg">
          {data.no}
        </Text>
        <Text textStyle="label" fontSize="10px" color="fg.muted">
          Rules · in effect
        </Text>
        <Box flex={1} />
        {data.count ? (
          <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle">
            {String(data.count).padStart(2, '0')} {data.count === 1 ? 'rule' : 'rules'}
          </Text>
        ) : null}
      </Flex>
      {data.count === 0 ? (
        <Flex
          position="absolute"
          top={`${LANE_HEAD}px`}
          bottom={data.editable ? `${ADD_ROOM}px` : '10px'}
          left="14px"
          right="14px"
          direction="column"
          align="center"
          justify="center"
          gap={1}
          textAlign="center"
        >
          <Text fontSize="12.5px" fontFamily="mono" color="fg.muted">
            No rules yet
          </Text>
          {data.editable ? (
            <Text fontSize="12px" lineHeight="1.45" color="fg.subtle">
              Say them in your request (e.g. “local only”, “lactose-free”, “under €300”) or add one
            </Text>
          ) : null}
        </Flex>
      ) : null}
      {data.editable && onAddRule ? (
        <Flex position="absolute" bottom="10px" left="10px" right="10px">
          <Flex
            as="button"
            className="nodrag nopan"
            flex={1}
            align="center"
            justify="center"
            gap={1.5}
            height="32px"
            borderRadius="l2"
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="border.emphasized"
            color="brand.fg"
            fontSize="12.5px"
            fontWeight="600"
            cursor="pointer"
            transition="background 0.15s, border-color 0.15s"
            _hover={{ bg: 'brand.subtle', borderColor: 'brand.accent', borderStyle: 'solid' }}
            onClick={(e) => {
              e.stopPropagation();
              onAddRule();
            }}
          >
            <LuPlus /> Add a rule
          </Flex>
        </Flex>
      ) : null}
      <Handle type="source" position={Position.Right} style={port} />
    </Box>
  );
});

const legend: [Tone, string][] = [
  ['auto', 'Passes'],
  ['pending', 'A person decides'],
  ['blocked', 'Blocked'],
  ['running', 'Signal'],
];

const nodeTypes = { step: StepNode, rule: RuleNode, lane: LaneNode };
const FIT_PAD = { top: '56px', right: '32px', bottom: '40px', left: '32px' } as const;
// The docked card's width plus its margins.
const CARD_ROOM = 380;
const edgeTypes = { flow: FlowEdge };

type CanvasProps = {
  graph: OrderGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  cardFor: (id: string) => ReactNode | null;
  onAddRule?: () => void;
  /** A dry run: the path it would take is dashed. */
  preview: boolean;
  editable: boolean;
};

export const OrderCanvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);

const Canvas = ({ graph, selectedId, onSelect, cardFor, onAddRule, preview, editable }: CanvasProps) => {
  const { setViewport } = useReactFlow();
  const { colorMode } = useColorMode();
  const box = useRef<HTMLDivElement>(null);
  const right = graph.lane.x + graph.lane.width;

  const nodes = useMemo<Node[]>(() => {
    const ids = new Set(graph.edges.flatMap((e) => [e.source, e.target]));
    return [
      {
        id: 'lane',
        type: 'lane',
        position: { x: graph.lane.x, y: graph.lane.y },
        initialWidth: graph.lane.width,
        initialHeight: graph.lane.height,
        selectable: false,
        zIndex: 0,
        data: { width: graph.lane.width, height: graph.lane.height, count: graph.lane.count, no: graph.lane.no, editable } satisfies LaneData,
      },
      ...graph.nodes.map((n): Node => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        // Known size up front, so React Flow never hides a node while it measures it again.
        initialWidth: n.width,
        initialHeight: n.height,
        data: {
          node: n,
          hasIn: n.kind === 'step' && ids.has(n.id) && n.id !== 'valio',
          hasOut: n.kind === 'step' && ids.has(n.id) && n.id !== 'order',
        } satisfies StepData,
      })),
    ];
  }, [graph, editable, right]);

  const edges = useMemo<FlowEdgeType[]>(
    () =>
      graph.edges.map((e) => ({ id: e.id, type: 'flow', source: e.source, target: e.target, data: { state: e.state, dashed: preview } })),
    [graph.edges, preview]
  );

  const ctx = useMemo<Ctx>(() => ({ selectedId, cardFor, onAddRule }), [selectedId, cardFor, onAddRule]);
  // The one open card — the picked node's, else "Add a rule", else a waiting approval — docked
  // to the canvas edge so it always fits on screen, however tall it gets.
  const openId = [selectedId, 'lane', 'approval'].find((id) => id && cardFor(id));
  const card = openId ? cardFor(openId) : null;
  const docked = !!card;
  const first = useRef(true);
  // Everything drawn, in graph coordinates.
  const maxX = Math.max(graph.lane.x + graph.lane.width, ...graph.nodes.map((n) => n.position.x + n.width));
  const maxY = Math.max(graph.lane.y + graph.lane.height, ...graph.nodes.map((n) => n.position.y + n.height));
  const bounds = useMemo(() => ({ x: 0, y: 0, width: maxX, height: maxY }), [maxX, maxY]);
  // Fit the whole order when its shape changes or the window does — never smaller than readable.
  const shape = `${graph.nodes.length}:${graph.lane.height}:${right}`;
  const ids = useMemo(() => shape && ['lane', ...graph.nodes.map((n) => n.id)], [shape, graph.nodes]);
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => {
    // Fit the order on screen. An open card docks on the right: rather than shrinking the
    // graph, slide it left (as far as it can go) so it stays clear of the card.
    const fit = (duration = 0) => {
      const el = box.current;
      if (!el || !el.clientWidth) return;
      const w = el.clientWidth;
      let vp = getViewportForBounds(bounds, w, el.clientHeight, 0.55, 1, FIT_PAD);
      // A docked card: first try fitting the order beside it, if that keeps the words readable.
      const beside = docked ? getViewportForBounds(bounds, w - CARD_ROOM, el.clientHeight, 0.55, 1, FIT_PAD) : null;
      if (beside && beside.zoom >= 0.8) vp = beside;
      else if (docked) {
        const left = vp.x + bounds.x * vp.zoom;
        const overlap = left + bounds.width * vp.zoom - (w - CARD_ROOM);
        if (overlap > 0) vp.x -= Math.min(overlap, left - 24);
      }
      void setViewport(vp, { duration });
    };
    // Re-measure the handles once the nodes are on screen, or edges can go missing after a route change.
    const t = setTimeout(() => {
      updateInternals(ids);
      fit(first.current ? 0 : 240);
      first.current = false;
    }, 30);
    const ro = new ResizeObserver(() => fit());
    if (box.current) ro.observe(box.current);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [shape, ids, bounds, setViewport, updateInternals, docked]);

  return (
    <GraphCtx.Provider value={ctx}>
      <Box
        ref={box}
        position="absolute"
        inset={0}
        css={{
          '& .react-flow': { '--xy-background-color': 'transparent' },
          '& .react-flow__node': { cursor: 'pointer' },
          '& .react-flow__handle': { pointerEvents: 'none' },
          '& .react-flow__node-lane': { cursor: 'default' },
          '& .react-flow__attribution': { display: 'none' },
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={colorMode}
          minZoom={0.4}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => onSelect(node.type === 'lane' ? null : node.id === selectedId ? null : node.id)}
          onPaneClick={() => onSelect(null)}
          proOptions={{ hideAttribution: true }}
        >
          {/* The board: a fine dot grid. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--chakra-colors-canvas-dot)" />
        </ReactFlow>
        {/* The board's legend, engraved in the corner: what the LEDs mean. */}
        <Flex position="absolute" left={5} bottom={4} gap={4} textStyle="label" color="fg.subtle" pointerEvents="none" zIndex={4}>
          {legend.map(([tone, words]) => (
            <Flex key={tone} align="center" gap={1.5}>
              <Dot tone={tone} size={6} steady />
              {words}
            </Flex>
          ))}
        </Flex>
        {card ? (
          <Box
            key={openId}
            position="absolute"
            top={4}
            right={4}
            width="348px"
            maxWidth="calc(100% - 32px)"
            maxHeight="calc(100% - 32px)"
            overflowY="auto"
            bg="bg.panel"
            borderWidth="1px"
            borderColor="border.strong"
            borderRadius="l3"
            boxShadow="float"
            zIndex={10}
            css={{ animation: `${rise} 0.2s var(--chakra-easings-out) both` }}
          >
            {card}
          </Box>
        ) : null}
      </Box>
    </GraphCtx.Provider>
  );
};
