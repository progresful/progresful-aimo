import { Box } from '@chakra-ui/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import type { AuditEntry } from '@/api/gateway';
import { PlaybookCanvas } from './PlaybookCanvas';
import { runStateFrom } from './useRun';

/** One order's final state on the graph — small, read-only (approvals review). */
export const OrderGraph = ({ audit, orderId, waiting, height = '220px' }: { audit: AuditEntry[]; orderId: string; waiting?: boolean; height?: string }) => {
  const run = useMemo(() => runStateFrom(audit, { orderId, waiting }), [audit, orderId, waiting]);
  return (
    <Box position="relative" height={height} borderRadius="l3" borderWidth="1px" borderColor="border" overflow="hidden">
      <ReactFlowProvider>
        <PlaybookCanvas run={run} selectedId={null} onSelect={() => undefined} follow={false} inspectorOpen={false} compact />
      </ReactFlowProvider>
    </Box>
  );
};
