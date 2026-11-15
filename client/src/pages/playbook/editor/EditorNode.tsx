import { Box, Flex, IconButton, Menu, Portal, Spinner, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { Handle, Node, NodeProps, Position } from '@xyflow/react';
import { ReactNode, memo } from 'react';
import { LuCheck, LuEllipsis, LuMessageSquareText, LuMinus, LuPlus, LuTrash2, LuTriangleAlert, LuX } from 'react-icons/lu';
import { Dot, Stamp, Tone, toneColor } from '@/components/kit';
import { StepStatus } from '../graph';
import { stepIcon } from '../visuals';
import { ADDABLE, AddableType, CLAUSE_HEIGHT, CLAUSE_WIDTH, Change, EDITOR_NODE_WIDTH, EditorStep } from './model';

export type EditorNodeData = {
  step: EditorStep;
  status: StepStatus;
  outcome?: string;
  editing: boolean;
  /** A preview is on the graph: words in the conditional. */
  preview: boolean;
  problem?: string;
  targets: { top: boolean; left: boolean };
  sources: { right: boolean; bottom: boolean };
  onDelete?: () => void;
};

export type EditorNodeType = Node<EditorNodeData, 'editor'>;

// Port jacks where the traces plug in (as on the order page).
const port = {
  width: 9,
  height: 9,
  background: 'var(--chakra-colors-node-handle)',
  border: '1.5px solid var(--chakra-colors-node-border)',
  borderRadius: '50%',
} as const;

// A running module's scan line sweeps along its top edge.
const pulse = keyframes`
  0% { transform: scaleX(0); transform-origin: left; }
  50% { transform: scaleX(1); transform-origin: left; }
  50.01% { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
`;

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

const markTone: Record<StepStatus, Tone> = {
  auto: 'auto',
  pending: 'pending',
  blocked: 'blocked',
  running: 'running',
  idle: 'idle',
  skipped: 'idle',
};
const markIcon: Partial<Record<StepStatus, ReactNode>> = {
  auto: <LuCheck strokeWidth={3} />,
  pending: <LuTriangleAlert strokeWidth={2.5} />,
  blocked: <LuX strokeWidth={3} />,
  skipped: <LuMinus strokeWidth={3} />,
};

// A real order's decided steps get a status plate; a dry run decides nothing.
const STAMPS: Record<string, Partial<Record<StepStatus, string>>> = {
  approval: { auto: 'Approved', pending: 'Waiting', blocked: 'Declined' },
  order: { auto: 'Ordered', blocked: 'Not ordered' },
};

/** "New" / "Changed": the latest change, pencilled in. */
export const ChangeMark = ({ change }: { change: Change }) => (
  <Text
    as="span"
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
    title={change === 'new' ? 'Added by the latest change' : 'Changed by the latest change'}
  >
    {change === 'new' ? 'New' : 'Changed'}
  </Text>
);

const DeleteMenu = ({ onDelete }: { onDelete: () => void }) => (
  <Menu.Root positioning={{ placement: 'bottom-end' }} onSelect={({ value }) => value === 'delete' && onDelete()}>
    <Menu.Trigger asChild>
      <IconButton
        className="nodrag nopan"
        aria-label="Rule actions"
        size="2xs"
        variant="ghost"
        color="fg.subtle"
        marginRight={-1.5}
        marginTop={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <LuEllipsis />
      </IconButton>
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content minWidth="150px">
          <Menu.Item value="delete" color="status.blocked" onClick={(e) => e.stopPropagation()}>
            <LuTrash2 /> Delete rule
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

/** A step of the flow: a hardware module on the board — its number, its name, the policy's words for it, and what the order did here. */
export const EditorNode = memo(({ data, selected }: NodeProps<EditorNodeType>) => {
  const { step, status, outcome, problem, targets, sources, preview } = data;
  const Icon = step.icon ?? stepIcon[step.id];
  const running = status === 'running';
  const skipped = status === 'skipped';
  const shownOutcome = skipped ? (preview ? 'Not needed' : 'Skipped') : outcome;
  const stamp = !preview ? STAMPS[step.id]?.[status] : undefined;

  return (
    <Box position="relative" width={`${EDITOR_NODE_WIDTH}px`} opacity={skipped ? 0.6 : 1} transition="opacity 0.3s">
      {targets.left ? <Handle type="target" id="left" position={Position.Left} style={port} /> : null}
      {targets.top ? <Handle type="target" id="top" position={Position.Top} style={port} /> : null}

      <Box
        position="relative"
        borderRadius="l3"
        borderWidth="1px"
        borderStyle={skipped ? 'dashed' : 'solid'}
        borderColor={problem ? 'status.blocked' : selected ? 'brand.accent' : borderOf[status]}
        bg="node.bg"
        boxShadow={selected ? '0 0 0 2px var(--chakra-colors-brand-accent)' : skipped ? 'none' : 'node'}
        transition="border-color 0.25s, box-shadow 0.2s, transform 0.2s var(--chakra-easings-out)"
        paddingX={3.5}
        paddingTop={2.5}
        paddingBottom={3}
        overflow="hidden"
        _hover={selected ? undefined : { borderColor: 'fg.subtle', transform: 'translateY(-1px)' }}
      >
        {running ? (
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            height="2px"
            bg="brand.accent"
            css={{ animation: `${pulse} 1.4s var(--chakra-easings-out) infinite` }}
          />
        ) : null}
        <Flex align="center" gap={2} marginBottom={1}>
          <Text textStyle="label" fontSize="10px" color="fg">
            {step.no}
          </Text>
          {Icon ? (
            <Box color={status === 'idle' || skipped ? 'fg.subtle' : `kind.${step.kind}`} fontSize="13px">
              <Icon />
            </Box>
          ) : null}
          <Box flex={1} />
          {step.change ? <ChangeMark change={step.change} /> : null}
        </Flex>
        <Text fontWeight="600" fontSize="14px" letterSpacing="-0.01em" lineHeight="1.25" color="fg" truncate title={step.title}>
          {step.title}
        </Text>
        <Text
          fontSize="12px"
          color={problem ? 'status.blocked' : 'fg.muted'}
          lineHeight="1.4"
          marginTop={1}
          lineClamp={2}
          title={problem ?? step.sentence ?? step.subtitle}
        >
          {problem ?? step.sentence ?? step.subtitle}
        </Text>
        {shownOutcome && status !== 'idle' ? (
          <Flex align="center" gap={1.5} marginTop={1.5} fontSize="12px" fontWeight="500" color={lineColor[status]}>
            {running ? (
              <Spinner size="xs" borderWidth="1.5px" />
            ) : (
              <Dot tone={markTone[status]} size={6} />
            )}
            <Text as="span" truncate className="tnum">
              {running ? 'Checking…' : shownOutcome}
            </Text>
          </Flex>
        ) : null}
      </Box>
      {stamp ? (
        <Box key={stamp} position="absolute" top="-10px" right="10px" bg="node.bg" pointerEvents="none">
          <Stamp tone={markTone[status]}>
            {stamp}
          </Stamp>
        </Box>
      ) : null}

      {sources.right ? <Handle type="source" id="ok" position={Position.Right} style={port} /> : null}
      {sources.bottom ? <Handle type="source" id="alt" position={Position.Bottom} style={port} /> : null}
    </Box>
  );
});

export type ClauseNodeType = Node<EditorNodeData, 'clause'>;

/** A product rule: one rule in the rack — its R number, its words, and the test order's mark. */
export const ClauseNode = memo(({ data, selected }: NodeProps<ClauseNodeType>) => {
  const { step, status, outcome, editing, problem, onDelete } = data;
  const running = status === 'running';
  const tone = markTone[status];
  const marked = !!markIcon[status] && status !== 'skipped';
  const sentence = problem ?? step.sentence ?? step.subtitle;
  return (
    <Flex
      align="start"
      gap={2.5}
      width={`${CLAUSE_WIDTH}px`}
      height={`${CLAUSE_HEIGHT}px`}
      paddingX={2.5}
      paddingY={2.5}
      borderBottomWidth="1px"
      borderColor="border"
      bg={selected ? 'brand.subtle' : 'transparent'}
      boxShadow={selected ? 'inset 2px 0 0 var(--chakra-colors-brand-accent)' : 'none'}
      opacity={status === 'skipped' ? 0.6 : 1}
      transition="background 0.2s"
      _hover={selected ? undefined : { bg: 'bg.hover' }}
    >
      <Text
        fontFamily="mono"
        fontSize="10.5px"
        lineHeight="1.6"
        color={selected ? 'brand.fg' : 'fg.subtle'}
        width="26px"
        flexShrink={0}
        className="tnum"
      >
        {step.no}
      </Text>
      <Box flex={1} minWidth={0}>
        <Flex align="start" gap={1.5}>
          <Text fontWeight="600" fontSize="13px" lineHeight="1.3" color="fg" truncate flex={1} minWidth={0} title={step.title}>
            {step.title}
          </Text>
          {step.change ? <ChangeMark change={step.change} /> : null}
        </Flex>
        <Text
          fontSize="12px"
          lineHeight="1.4"
          marginTop={0.5}
          color={problem ? 'status.blocked' : 'fg.muted'}
          lineClamp={outcome && status !== 'idle' ? 1 : 2}
          title={sentence}
        >
          {sentence}
        </Text>
        {outcome && status !== 'idle' ? (
          <Text marginTop={1} fontSize="11.5px" fontWeight="500" color={lineColor[status]} truncate className="tnum">
            {running ? 'Checking…' : outcome}
          </Text>
        ) : null}
      </Box>
      <Flex direction="column" align="end" gap={1} flexShrink={0}>
        {editing && onDelete ? <DeleteMenu onDelete={onDelete} /> : null}
        {status !== 'idle' ? (
          <Flex
            key={status}
            align="center"
            justify="center"
            width="20px"
            height="20px"
            marginTop="1px"
            borderRadius="l1"
            borderWidth="1.5px"
            borderColor={marked ? toneColor[tone] : 'border.emphasized'}
            borderStyle={marked || running ? 'solid' : 'dashed'}
            color={marked ? toneColor[tone] : 'fg.subtle'}
            fontSize="11px"
            css={marked ? { animation: 'readout-on 0.3s var(--chakra-easings-out) both' } : undefined}
          >
            {running ? <Spinner size="xs" borderWidth="1.5px" /> : marked ? markIcon[status] : null}
          </Flex>
        ) : null}
      </Flex>
    </Flex>
  );
});

/** What "+ Add rule" picked: a rule type with defaults, or 'describe' to write one in words. */
export type AddChoice = AddableType | 'describe';

export type LaneNodeData = {
  count: number;
  no: string;
  editing: boolean;
  onAdd: (choice: AddChoice) => void;
  width: number;
  height: number;
};
export type LaneNodeType = Node<LaneNodeData, 'lane'>;

/** The rules rack: the mandate's product rules as numbered modules, with "+ Add a rule" at its foot in edit mode. */
export const LaneNode = memo(({ data }: NodeProps<LaneNodeType>) => (
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
    {data.count ? <Handle type="target" id="left" position={Position.Left} style={port} /> : null}
    <Flex
      position="absolute"
      top={0}
      left="12px"
      right="12px"
      height="40px"
      align="center"
      gap={2}
      borderBottomWidth="1px"
      borderColor="border.emphasized"
    >
      <Text textStyle="label" fontSize="10px" color="fg">
        {data.no}
      </Text>
      <Text textStyle="label" fontSize="10px" color="fg.muted">
        Rules
      </Text>
      <Box flex={1} />
      {data.count ? (
        <Text fontFamily="mono" fontSize="10.5px" color="fg.subtle">
          {String(data.count).padStart(2, '0')} {data.count === 1 ? 'rule' : 'rules'}
        </Text>
      ) : null}
    </Flex>
    {data.count === 0 ? (
      <Text
        position="absolute"
        top="78px"
        left={0}
        right={0}
        textAlign="center"
        fontSize="12.5px"
        fontFamily="mono"
        color="fg.subtle"
      >
        No product rules
      </Text>
    ) : null}
    {data.editing ? (
      <Flex position="absolute" bottom="10px" left="10px" right="10px">
        <AddRuleMenu onAdd={data.onAdd}>
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
            borderColor="brand.accent/40"
            color="brand.fg"
            fontSize="12.5px"
            fontWeight="600"
            cursor="pointer"
            transition="background 0.2s, border-color 0.2s"
            _hover={{ bg: 'brand.subtle', borderColor: 'brand.accent', borderStyle: 'solid' }}
            onClick={(e) => e.stopPropagation()}
          >
            <LuPlus /> Add a rule
          </Flex>
        </AddRuleMenu>
      </Flex>
    ) : null}
    {data.count ? <Handle type="source" id="ok" position={Position.Right} style={port} /> : null}
  </Box>
));

/** "+ Add rule": describe one in words first, then the rule types with defaults. */
export const AddRuleMenu = ({ onAdd, children }: { onAdd: (choice: AddChoice) => void; children: React.ReactElement }) => (
  <Menu.Root positioning={{ placement: 'bottom' }} onSelect={({ value }) => onAdd(value as AddChoice)}>
    <Menu.Trigger asChild>{children}</Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content width="290px" padding={1} borderRadius="l3" boxShadow="float">
          <Menu.Item value="describe" paddingY={2} alignItems="start" onClick={(e) => e.stopPropagation()}>
            <Box color="brand.fg" fontSize="15px" marginTop="2px">
              <LuMessageSquareText />
            </Box>
            <Box>
              <Text fontSize="13px" fontWeight="600">
                Describe a rule
              </Text>
              <Text fontSize="12px" color="fg.subtle">
                In your own words, e.g. “Nothing from outside Finland”
              </Text>
            </Box>
          </Menu.Item>
          <Menu.Separator />
          <Text textStyle="caps" color="fg.subtle" paddingX={2} paddingTop={1.5} paddingBottom={1}>
            Or start from a template
          </Text>
          {ADDABLE.map((a) => (
            <Menu.Item key={a.type} value={a.type} paddingY={2} alignItems="start" onClick={(e) => e.stopPropagation()}>
              <Box color="kind.rule" fontSize="15px" marginTop="2px">
                <a.icon />
              </Box>
              <Box>
                <Text fontSize="13px" fontWeight="500">
                  {a.label}
                </Text>
                <Text fontSize="12px" color="fg.subtle">
                  {a.hint}
                </Text>
              </Box>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);
