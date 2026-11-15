import { Edge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { memo } from 'react';

export type FlowEdgeData = {
  label?: string;
  state: 'idle' | 'taken' | 'live';
  /** A predicted path (order workspace preview): drawn dashed, nothing has happened yet. */
  dashed?: boolean;
};

export type FlowEdgeType = Edge<FlowEdgeData, 'flow'>;

const stroke = {
  idle: 'var(--chakra-colors-edge-idle)',
  taken: 'var(--chakra-colors-edge-live)',
  live: 'var(--chakra-colors-edge-live)',
};

// Traces on a circuit board: orthogonal runs with rounded corners, plugged into the
// modules' port jacks (no arrowheads — the flow reads left to right). A path taken is
// energised in signal orange, start to end (keyframes `ink-draw` in theme/system.ts); a
// live one carries a travelling signal pulse; a predicted one is dashed and marches (`flow-march`).
export const FlowEdge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<FlowEdgeType>) => {
  const state = data?.state ?? 'idle';
  // Nearly level ends: one straight line, not a 1px zig-zag.
  const level = Math.abs(sourceY - targetY) < 8;
  const [stepPath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    offset: 24,
  });
  const path = level ? `M ${sourceX},${sourceY} L ${targetX},${sourceY}` : stepPath;
  const marching = !!data?.dashed && state !== 'idle';
  const color = stroke[state];
  const width = state === 'idle' ? 1.25 : 2;
  const animation = marching
    ? `flow-march ${state === 'live' ? 0.6 : 1.4}s linear infinite`
    : state === 'live'
      ? 'ink-draw 1.1s var(--chakra-easings-out) infinite'
      : state === 'taken'
        ? 'ink-draw 0.6s var(--chakra-easings-out) both'
        : undefined;

  return (
    <>
      {/* The bare copper under an energised trace, so the drawing-in reads as power arriving. */}
      {state !== 'idle' && !marching ? <path d={path} fill="none" style={{ stroke: stroke.idle, strokeWidth: 1.25 }} /> : null}
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        fill="none"
        // A unit path length lets one keyframe draw any edge in.
        pathLength={marching || state === 'idle' ? undefined : 1}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeLinecap: 'round',
          strokeDasharray: marching ? '5 4' : state === 'idle' ? undefined : '1',
          animation,
          transition: 'stroke 0.3s',
        }}
      />
      {state === 'live' ? (
        <g>
          <circle r={8} fill="var(--chakra-colors-edge-live)" opacity={0.2}>
            <animateMotion dur="1s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={3.5} fill="var(--chakra-colors-edge-live)">
            <animateMotion dur="1s" repeatCount="indefinite" path={path} />
          </circle>
        </g>
      ) : null}
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              fontSize: 11,
              fontWeight: 500,
              padding: '1px 7px',
              borderRadius: 4,
              fontFamily: 'var(--chakra-fonts-mono)',
              background: 'var(--chakra-colors-bg-panel)',
              border: `1px solid ${state === 'idle' ? 'var(--chakra-colors-border)' : 'var(--chakra-colors-brand-border)'}`,
              color: state === 'idle' ? 'var(--chakra-colors-edge-label-fg)' : 'var(--chakra-colors-edge-label-taken-fg)',
              transition: 'all 0.4s',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
