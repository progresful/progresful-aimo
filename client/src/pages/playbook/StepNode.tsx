import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { Handle, Node, NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';
import { PlaybookStep, StepStatus, steps } from './graph';
import { Dot } from '@/components/kit';
import { statusMeta, stepIcon } from './visuals';

export type StepNodeData = {
  step: PlaybookStep;
  status: StepStatus;
  outcome?: string;
  hasTopTarget: boolean;
  hasBottomTarget: boolean;
};

export type StepNodeType = Node<StepNodeData, 'step'>;

// Port jacks where the traces plug in (as on the order page).
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

export const NODE_WIDTH = 208;

/** A step of the fixed flow: a module with its number, name and — once run — what happened there. */
export const StepNode = memo(({ data, selected }: NodeProps<StepNodeType>) => {
  const { step, status, outcome, hasTopTarget, hasBottomTarget } = data;
  const Icon = stepIcon[step.id];
  const meta = statusMeta[status];
  const ran = status !== 'idle' && status !== 'running' && status !== 'skipped';
  const no = String(steps.findIndex((s) => s.id === step.id) + 1).padStart(2, '0');

  return (
    <Box position="relative" width={`${NODE_WIDTH}px`} opacity={status === 'skipped' ? 0.5 : 1} transition="opacity 0.3s">
      <Handle type="target" id="left" position={Position.Left} style={port} />
      {hasTopTarget ? <Handle type="target" id="top" position={Position.Top} style={port} /> : null}
      {hasBottomTarget ? <Handle type="target" id="bottom" position={Position.Bottom} style={{ ...port, left: '28%' }} /> : null}

      <Box
        borderRadius="l3"
        borderWidth="1px"
        borderStyle={status === 'skipped' ? 'dashed' : 'solid'}
        borderColor={selected ? 'brand.accent' : borderOf[status]}
        bg="node.bg"
        boxShadow={selected ? '0 0 0 2px var(--chakra-colors-brand-accent)' : 'node'}
        transition="border-color 0.3s"
        paddingX={3.5}
        paddingTop={2.5}
        paddingBottom={3}
      >
        <Flex align="center" gap={2} marginBottom={1}>
          <Text textStyle="label" fontSize="10px" color="fg">
            {no}
          </Text>
          <Box color={status === 'idle' || status === 'skipped' ? 'fg.subtle' : `kind.${step.kind}`} fontSize="13px">
            <Icon />
          </Box>
          <Box flex={1} />
          {status === 'running' ? <Spinner size="xs" borderWidth="1.5px" color="status.running" /> : null}
          {ran ? <Dot tone={status === 'auto' ? 'auto' : status === 'pending' ? 'pending' : 'blocked'} size={7} /> : null}
        </Flex>
        <Text fontWeight="600" fontSize="14px" letterSpacing="-0.01em" lineHeight="1.25" color="fg" truncate>
          {step.title}
        </Text>
        <Text fontSize="11.5px" color="fg.subtle" lineHeight="1.4" marginTop="2px" truncate>
          {step.subtitle}
        </Text>
      </Box>

      {ran && outcome ? (
        <Flex
          position="absolute"
          // Edges leave through the bottom of branching steps, so their note goes on top.
          {...(step.branches || hasBottomTarget ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' })}
          left="0"
          right="0"
          justify="center"
          pointerEvents="none"
        >
          <Flex
            align="center"
            gap={1.5}
            paddingX={1.5}
            height="20px"
            borderRadius="l1"
            bg="node.bg"
            borderWidth="1px"
            borderColor={`${meta.color}/50`}
            color={meta.color}
            fontSize="11px"
            whiteSpace="nowrap"
            className="tnum"
          >
            <Box width="5px" height="5px" borderRadius="full" bg={meta.color} />
            {outcome}
          </Flex>
        </Flex>
      ) : null}

      <Handle type="source" id="ok" position={Position.Right} style={port} />
      {step.branches ? <Handle type="source" id="alt" position={Position.Bottom} style={{ ...port, left: '72%' }} /> : null}
    </Box>
  );
});
