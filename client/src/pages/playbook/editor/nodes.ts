import { Node } from '@xyflow/react';
import { useMemo } from 'react';
import type { RunState } from '../useRun';
import type { AddChoice } from './EditorNode';
import { CLAUSE_HEIGHT, CLAUSE_WIDTH, EDITOR_NODE_WIDTH, EditorGraph } from './model';

/** The editor graph as React Flow nodes: the rules sheet behind its clauses, one tag per step. */
export const useEditorNodes = (
  graph: EditorGraph,
  run: RunState,
  selectedId: string | null,
  editing: boolean,
  problems: Record<string, string>,
  onAdd: (choice: AddChoice) => void,
  onDelete: (key: string) => void
): Node[] =>
  useMemo(() => {
    const lane: Node = {
      id: 'lane',
      type: 'lane',
      position: { x: graph.lane.x, y: graph.lane.y },
      initialWidth: graph.lane.width,
      initialHeight: graph.lane.height,
      selectable: false,
      draggable: false,
      zIndex: -1,
      data: { count: graph.ruleIds.length, no: graph.lane.no, editing, onAdd, width: graph.lane.width, height: graph.lane.height },
    };
    // Handles follow the edges as drawn: a clause has none, the sheet carries them.
    const edges = graph.drawn;
    return [
      lane,
      ...graph.steps.map((step): Node => {
        const clause = !!step.ruleKey;
        return {
          id: step.id,
          type: clause ? 'clause' : 'editor',
          position: step.position,
          initialWidth: clause ? CLAUSE_WIDTH : EDITOR_NODE_WIDTH,
          initialHeight: clause ? CLAUSE_HEIGHT : 96,
          selected: step.id === selectedId,
          data: {
            step,
            status: run.statuses[step.id] ?? 'idle',
            outcome: run.outcomes[step.id],
            editing,
            preview: run.orderId === 'preview',
            problem: step.ruleKey ? problems[step.ruleKey] : undefined,
            targets: {
              left: edges.some((e) => e.target === step.id && (e.targetHandle ?? 'left') === 'left'),
              top: edges.some((e) => e.target === step.id && e.targetHandle === 'top'),
            },
            sources: {
              right: edges.some((e) => e.source === step.id && (e.sourceHandle ?? 'ok') === 'ok'),
              bottom: edges.some((e) => e.source === step.id && e.sourceHandle === 'alt'),
            },
            onDelete: step.ruleKey ? () => onDelete(step.ruleKey!) : undefined,
          },
        };
      }),
    ];
  }, [graph, run.statuses, run.outcomes, run.orderId, selectedId, editing, problems, onAdd, onDelete]);
