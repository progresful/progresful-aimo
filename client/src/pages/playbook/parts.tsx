// Pieces shared by the playbook design view (/app/policy/graph) and the run view (/app/runs/:orderId).
import { Box, Flex, IconButton, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuCrosshair } from 'react-icons/lu';
import { AuditEntry, OrderDetail, useDecide } from '@/api/gateway';
import { Tooltip } from '@/components/ui/tooltip';
import { toaster } from '@/components/ui/toaster';
import { eur } from './graph';
import { Decision } from './Inspector';

export const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

/** Navigation state that asks the run view to animate the run step by step. */
export type RunNavState = { fresh?: boolean };

/** Floating card, top-left of the canvas: what the agent asked for. */
export const RequestCard = ({ label, text }: { label: string; text: ReactNode }) => (
  <Flex position="absolute" top={3} left={3} gap={2} zIndex={5} align="center">
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderTopWidth="2px"
      borderColor="border"
      borderTopColor="border.strong"
      borderRadius="l2"
      boxShadow="float"
      paddingX={3.5}
      paddingY={2.5}
      maxWidth="460px"
    >
      <Text textStyle="caps" color="fg.subtle">
        {label}
      </Text>
      <Text fontWeight="550" letterSpacing="-0.02em" fontSize="19px" lineHeight="1.25" marginTop={1}>
        {text}
      </Text>
    </Box>
  </Flex>
);

/** Bottom-centre floating controls: a primary action plus the follow-camera toggle. */
export const CanvasControls = ({ follow, onFollow, children }: { follow: boolean; onFollow: () => void; children?: ReactNode }) => (
  <Flex position="absolute" bottom={4} right={4} gap={2} zIndex={5} align="center">
    {children}
    <Tooltip content={follow ? 'Camera follows the run' : 'Camera stays put'} showArrow>
      <IconButton
        aria-label="Follow run"
        variant="outline"
        size="sm"
        borderRadius="l2"
        bg={follow ? 'brand.subtle' : 'bg.panel'}
        color={follow ? 'brand.fg' : 'fg.muted'}
        borderColor={follow ? 'brand.border' : 'border'}
        _hover={{ bg: follow ? 'brand.subtle' : 'bg.hover' }}
        onClick={onFollow}
      >
        <LuCrosshair />
      </IconButton>
    </Tooltip>
  </Flex>
);

/** Approve / decline / partial from the graph's approval step; new audit entries continue the run. */
export const useDecideOnRun = (detail: OrderDetail | null, append: (entries: AuditEntry[]) => void) => {
  const decide = useDecide();
  const onDecide = (decision: Decision) => {
    const approval = detail?.approval;
    if (!approval) return;
    decide.mutate(
      { id: approval.id, decision },
      {
        onSuccess: (res) => {
          append(res.audit);
          toaster.create(
            decision === 'approve'
              ? { type: 'success', title: 'Approved — ordered', description: `${eur(res.order.committedTotal)} at the quoted prices` }
              : decision === 'partial'
                ? {
                    type: 'info',
                    title: 'In-stock part ordered',
                    description: `${eur(res.order.committedTotal)} placed · the rest stays open for the agent`,
                  }
                : { type: 'warning', title: 'Declined', description: 'Nothing ordered. The agent has been told why.' }
          );
        },
        onError: (err) => toaster.create({ type: 'error', title: 'Decision not recorded', description: errorText(err) }),
      }
    );
  };
  return { onDecide, deciding: decide.isPending ? (decide.variables.decision as Decision) : null };
};
