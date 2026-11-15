import { Box } from '@chakra-ui/react';
import { Background, BackgroundVariant, Controls, Node, ReactFlow, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PlaybookEdge, edges as playbookEdges, steps } from './graph';
import { useColorMode } from '@/components/ui/color-mode';
import { RunState } from './useRun';
import { NODE_WIDTH, StepNode, StepNodeType } from './StepNode';
import { FlowEdge, FlowEdgeType } from './FlowEdge';
import { ClauseNode, EditorNode, LaneNode } from './editor/EditorNode';

const nodeTypes = { step: StepNode, editor: EditorNode, clause: ClauseNode, lane: LaneNode };
const edgeTypes = { flow: FlowEdge };

const targetsOn = (handle: string) => new Set(playbookEdges.filter((e) => e.targetHandle === handle).map((e) => e.target));
const topTargets = targetsOn('top');
const bottomTargets = targetsOn('bottom');

// Keep the graph clear of the floating panels: inspector on the right, request card
// top-left, run controls along the bottom.
const INSPECTOR_SPACE = 404;
const fitOptions = (inspectorOpen: boolean) =>
  ({
    padding: { top: '56px', right: `${inspectorOpen ? INSPECTOR_SPACE + 32 : 32}px`, bottom: '72px' as `${number}px`, left: '32px' },
  }) as const;

type Props = {
  run: RunState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  follow: boolean;
  inspectorOpen: boolean;
  /** Predicted run (order workspace): taken edges are dashed. */
  preview?: boolean;
  /** Small read-only graph (approvals): fits the view, no controls, no panning or zooming. */
  compact?: boolean;
  /** A graph built elsewhere (the playbook editor): its nodes as given, and its edges. */
  custom?: { nodes: Node[]; edges: PlaybookEdge[] };
  /** Extra space kept clear at the bottom of the fit (floating panels). */
  bottomInset?: number;
  /**
   * Never fit smaller than this: a wide graph in a narrow canvas starts at this zoom,
   * left-aligned (where an order starts) and vertically centred, and can be panned.
   */
  minFitZoom?: number;
};

export const PlaybookCanvas = ({
  run,
  selectedId,
  onSelect,
  follow,
  inspectorOpen,
  preview,
  compact,
  custom,
  bottomInset,
  minFitZoom,
}: Props) => {
  const { setCenter, fitView: fitAll, getViewport, setViewport, getNode, getNodes, getNodesBounds, getInternalNode } = useReactFlow();
  const { colorMode } = useColorMode();
  const box = useRef<HTMLDivElement>(null);

  // fitView, but with minFitZoom: too small to read → that zoom, anchored left.
  const fitView = useCallback(
    (opts: { padding: ReturnType<typeof fitOptions>['padding']; duration?: number }) => {
      const width = box.current?.clientWidth;
      const height = box.current?.clientHeight;
      const nodes = getNodes();
      if (!minFitZoom || !width || !height || !nodes.length) return void fitAll(opts);
      const px = (v: string) => parseFloat(v) || 0;
      const { top, right, bottom, left } = opts.padding;
      const b = getNodesBounds(nodes);
      const fits = Math.min((width - px(left) - px(right)) / b.width, (height - px(top) - px(bottom)) / b.height);
      if (fits >= minFitZoom) return void fitAll(opts);
      const zoom = minFitZoom;
      const y = Math.max(px(top), (height - b.height * zoom) / 2) - b.y * zoom;
      void setViewport({ x: px(left) - b.x * zoom, y, zoom }, { duration: opts.duration });
    },
    [minFitZoom, fitAll, getNodes, getNodesBounds, setViewport]
  );

  const graphEdges = custom?.edges ?? playbookEdges;

  const staticNodes = useMemo<StepNodeType[]>(
    () =>
      steps.map((step) => ({
        id: step.id,
        type: 'step',
        position: step.position,
        // Known size up front: nodes are rebuilt on every status change, and without it React
        // Flow can hide them (visibility: hidden) until it measures them again.
        initialWidth: NODE_WIDTH,
        initialHeight: 68,
        selected: step.id === selectedId,
        data: {
          step,
          status: run.statuses[step.id] ?? 'idle',
          outcome: run.outcomes[step.id],
          hasTopTarget: topTargets.has(step.id),
          hasBottomTarget: bottomTargets.has(step.id),
        },
      })),
    [run.statuses, run.outcomes, selectedId]
  );
  const nodes: Node[] = custom?.nodes ?? staticNodes;

  // The first fit once the nodes have their sizes (ReactFlow's own fitView prop can't clamp).
  useEffect(() => {
    if (!minFitZoom) return;
    let tries = 0;
    const t = setInterval(() => {
      const ready = !!box.current?.clientWidth && getNodes().some((n) => getInternalNode(n.id)?.measured.width);
      if (ready) fitView(fitOptions(false));
      if (ready || ++tries > 50) clearInterval(t);
    }, 60);
    return () => clearInterval(t);
  }, [minFitZoom, fitView, getNodes, getInternalNode]);

  const edges = useMemo<FlowEdgeType[]>(
    () =>
      graphEdges.map((edge) => ({
        id: edge.id,
        type: 'flow',
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? 'ok',
        targetHandle: edge.targetHandle ?? 'left',
        data: {
          label: edge.label,
          dashed: preview,
          state: run.liveEdges.includes(edge.id) && run.phase !== 'done' ? 'live' : run.takenEdges.includes(edge.id) ? 'taken' : 'idle',
        },
      })),
    [graphEdges, run.liveEdges, run.takenEdges, run.phase, preview]
  );

  // A custom graph keeps its camera while the side panel opens: pan just enough to keep the selected node in view.
  useEffect(() => {
    if (!custom || !selectedId) return;
    const t = setTimeout(() => {
      const node = getNode(selectedId);
      const width = box.current?.clientWidth;
      const height = box.current?.clientHeight;
      if (!node || !width || !height) return;
      const vp = getViewport();
      const right = (node.position.x + (node.measured?.width ?? NODE_WIDTH)) * vp.zoom + vp.x;
      const left = node.position.x * vp.zoom + vp.x;
      const top = node.position.y * vp.zoom + vp.y;
      const bottom = (node.position.y + (node.measured?.height ?? 90)) * vp.zoom + vp.y;
      const margin = 32;
      // Floating panels along the bottom (the test card) cover part of the canvas.
      const floor = height - (bottomInset ?? margin);
      let { x, y } = vp;
      if (right > width - margin) x -= right - width + margin;
      else if (left < margin) x += margin - left;
      // Off the top or bottom (e.g. a rule just added at the end of a long lane): fit the whole graph again —
      // or, when the graph is kept readable (minFitZoom), just pan to it.
      if (bottom > floor || top < 56) {
        if (!minFitZoom) {
          fitView({ padding: { ...fitOptions(false).padding, bottom: `${bottomInset ?? 72}px` }, duration: 300 });
          return;
        }
        y += bottom > floor ? floor - bottom : 56 - top;
      }
      if (x !== vp.x || y !== vp.y) setViewport({ ...vp, x, y }, { duration: 300 });
    }, 30);
    return () => clearTimeout(t);
  }, [custom, selectedId, getNode, getViewport, setViewport, fitView, bottomInset, minFitZoom]);

  // Camera follows the step being evaluated, like watching the gateway think.
  useEffect(() => {
    if (!follow || !run.activeStepId) return;
    const step = (custom?.nodes ?? steps).find((s) => s.id === run.activeStepId);
    // With the inspector open, shift the centre right so the step lands mid-canvas.
    const zoom = 0.95;
    const offset = inspectorOpen ? INSPECTOR_SPACE / 2 / zoom : 0;
    if (step) setCenter(step.position.x + NODE_WIDTH / 2 + offset, step.position.y + 60, { zoom, duration: 700 });
  }, [follow, run.activeStepId, setCenter, inspectorOpen, custom?.nodes]);

  useEffect(() => {
    if (run.phase === 'done' && follow) {
      const t = setTimeout(() => fitView({ ...fitOptions(inspectorOpen), duration: 900 }), 600);
      return () => clearTimeout(t);
    }
  }, [run.phase, follow, fitView, inspectorOpen]);

  return (
    <Box
      ref={box}
      position="absolute"
      inset={0}
      bg="bg.canvas"
      css={{
        '& .react-flow': {
          '--xy-background-color': 'transparent',
          '--xy-controls-button-background-color': 'var(--chakra-colors-bg-panel)',
          '--xy-controls-button-background-color-hover': 'var(--chakra-colors-bg-muted)',
          '--xy-controls-button-color': 'var(--chakra-colors-fg-muted)',
          '--xy-controls-button-color-hover': 'var(--chakra-colors-fg)',
          '--xy-controls-button-border-color': 'var(--chakra-colors-border)',
          '--xy-controls-box-shadow': 'none',
        },
        '& .react-flow__controls': {
          borderRadius: '3px',
          overflow: 'hidden',
          border: '1px solid var(--chakra-colors-border)',
          boxShadow: 'var(--chakra-shadows-node)',
        },
        '& .react-flow__controls-button': { borderBottomColor: 'var(--chakra-colors-border-muted)' },
        '& .react-flow__node': { cursor: compact ? 'default' : 'pointer' },
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
        fitView={!minFitZoom}
        fitViewOptions={
          compact
            ? { padding: { top: '40px', right: '16px', bottom: '16px', left: '16px' } }
            : bottomInset
              ? { padding: { ...fitOptions(false).padding, bottom: `${bottomInset}px` } }
              : fitOptions(false)
        }
        minZoom={compact ? 0.1 : Math.min(0.3, minFitZoom ?? 0.3)}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!compact}
        panOnDrag={!compact}
        zoomOnScroll={!compact}
        zoomOnPinch={!compact}
        zoomOnDoubleClick={!compact}
        preventScrolling={!compact}
        onNodeClick={(_, node) => onSelect(node.type === 'lane' ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: true }}
      >
        {/* Engineering paper: a fine grid, every fifth line stronger (as on the order page). */}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--chakra-colors-canvas-dot)" />
        {compact ? null : <Controls position="bottom-left" showInteractive={false} />}
      </ReactFlow>
    </Box>
  );
};
