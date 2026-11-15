import { Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { LuPlay, LuSmartphone, LuX } from 'react-icons/lu';
import { useApprovals, useDecide, useOrder, usePolicies, useRunScenario } from '@/api/gateway';
import { Num, PageHeader, PageIntro } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { useUser } from '@/providers/session';
import { Detail, DecisionKind } from './Detail';
import { HistoryRow, PendingRow } from './InboxList';
import { eur, sortInbox } from './model';
import { Rubric } from './parts';
import { PhoneView } from './PhoneView';

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

export const ApprovalsPage = () => {
  const approvals = useApprovals();
  const items = approvals.data ?? [];
  const { pending, history } = sortInbox(items);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const { user } = useUser();
  const policies = usePolicies();
  const decide = useDecide();
  const runScenario = useRunScenario();

  // The open card: the one picked, else the request closing soonest.
  const open = items.find((i) => i.id === selectedId) ?? pending[0] ?? null;
  const phoneItem = open ?? history[0] ?? null;
  const order = useOrder(phone ? phoneItem?.orderId : open?.orderId);
  const shown = phone ? phoneItem : open;
  const detail = order.data?.order.id === shown?.orderId ? order.data : undefined;
  const policy = detail ? policies.data?.find((p) => p.key === detail.order.policy.key) : undefined;
  const policyLabel = detail ? `“${policy?.name ?? detail.order.policy.key}” v${detail.order.policy.version}${policy?.signature ? ` · signed by ${policy.signature.signedBy}` : ''}` : null;
  // Before any approval exists, the bound policy still names the approver.
  const boundPolicy = policies.data?.find((p) => p.key === 'pol_hospital-ward-dairy') ?? policies.data?.find((p) => p.agents.length);
  const approverName = shown?.approver.name ?? boundPolicy?.approver?.name ?? null;
  const approverFirst = approverName?.split(' ')[0] ?? 'the approver';
  const signingAs = user?.name ?? user?.email ?? 'you';
  const deciding = decide.isPending && decide.variables.id === shown?.id ? decide.variables.decision : null;

  const onDecide = (kind: DecisionKind) => {
    if (!shown) return;
    decide.mutate(
      { id: shown.id, decision: kind },
      {
        onSuccess: (res) => {
          const total = res.order.committedTotal;
          setSelectedId(res.approval.id);
          toaster.create(
            kind === 'approve'
              ? { type: 'success', title: `Approved — ${eur(total)} ordered`, description: `Signed by ${res.approval.decidedBy} and added to the audit trail.` }
              : kind === 'partial'
                ? { type: 'info', title: `In-stock part ordered — ${eur(total)}`, description: 'The rest stays open for the agent.' }
                : { type: 'warning', title: 'Declined', description: 'Nothing was ordered. The agent has been told why.' }
          );
        },
        onError: (err) => toaster.create({ type: 'error', title: 'Decision not recorded', description: errorText(err) }),
      }
    );
  };

  const runStockout = () =>
    runScenario.mutate('stockout', {
      onSuccess: (res) => {
        if (res.approval) setSelectedId(res.approval.id);
        toaster.create(
          res.approval
            ? { type: 'info', title: 'A new request needs a decision', description: res.order.title }
            : { type: 'success', title: 'It went through on its own', description: 'The stock-out run stayed inside the policy this time.' }
        );
      },
      onError: (err) => toaster.create({ type: 'error', title: 'The gateway couldn’t run the scenario', description: errorText(err) }),
    });

  const intro = approvals.isLoading
    ? ' '
    : pending.length
      ? `${pending.length === 1 ? 'One order is' : `${pending.length} orders are`} waiting for ${approverFirst}. Everything inside the signed policy goes through on its own.`
      : 'Nothing is waiting. Orders inside the signed policy go through on their own.';

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <PageHeader
        trail={['Approvals']}
        actions={
          phoneItem ? (
            <Button size="xs" variant="ghost" color="fg.muted" onClick={() => setPhone((p) => !p)}>
              {phone ? <LuX /> : <LuSmartphone />} {phone ? 'Close phone preview' : 'Preview on phone'}
            </Button>
          ) : null
        }
      />
      {phone && phoneItem ? (
        <PhoneView key={phoneItem.id} item={phoneItem} detail={detail} deciding={deciding} onDecide={onDecide} />
      ) : (
        <Box flex={1} overflowY="auto" minHeight={0}>
          <Box maxWidth="920px" marginX="auto" paddingX={8} paddingTop={10} paddingBottom={16}>
            <PageIntro title="Approvals" description={intro} />

            {approvals.isLoading ? (
              <Stack gap={3}>
                <Skeleton height="52px" borderRadius="l1" />
                <Skeleton height="320px" borderRadius="l3" />
              </Stack>
            ) : approvals.isError ? (
              <Flex align="center" gap={3} fontSize="13px">
                <Text color="status.blocked">Couldn’t load approvals — {errorText(approvals.error)}</Text>
                <Button size="xs" variant="ghost" color="brand.fg" onClick={() => void approvals.refetch()}>
                  Retry
                </Button>
              </Flex>
            ) : (
              <>
                {pending.length ? (
                  <Box>
                    <Rubric action={<Num color="fg.subtle">{pending.length}</Num>}>Awaiting your signature</Rubric>
                    <Stack gap={0}>
                      {pending.map((item) =>
                        item.id === open?.id ? (
                          <Sheet key={item.id} stacked={pending.length > 1}>
                            <Detail item={item} detail={detail} policyLabel={policyLabel} signingAs={signingAs} deciding={deciding} onDecide={onDecide} />
                          </Sheet>
                        ) : (
                          <PendingRow key={item.id} item={item} onClick={() => setSelectedId(item.id)} />
                        )
                      )}
                    </Stack>
                  </Box>
                ) : (
                  <Flex align="center" gap={6} paddingY={6} borderTopWidth="1px" borderBottomWidth="1px" borderColor="border">
                    <Box flex={1}>
                      <Text fontWeight="550" letterSpacing="-0.02em" fontSize="24px" lineHeight="1.2">
                        Nothing awaits your signature.
                      </Text>
                      <Text fontSize="13px" color="fg.muted" marginTop={1}>
                        Run the stock-out scenario to see an order that stops for {approverFirst}.
                      </Text>
                    </Box>
                    <Button size="sm" variant="outline" borderRadius="l2" color="fg" loading={runScenario.isPending} onClick={runStockout}>
                      <LuPlay /> Run the stock-out scenario
                    </Button>
                  </Flex>
                )}

                {history.length ? (
                  <Box marginTop={14}>
                    <Rubric action={<Num color="fg.subtle">{history.length}</Num>}>Signed and filed</Rubric>
                    <Box>
                      {history.map((item) =>
                        item.id === open?.id ? (
                          <Box key={item.id} marginY={4}>
                            <Detail item={item} detail={detail} policyLabel={policyLabel} signingAs={signingAs} deciding={deciding} onDecide={onDecide} />
                          </Box>
                        ) : (
                          <HistoryRow key={item.id} item={item} onClick={() => setSelectedId(item.id)} />
                        )
                      )}
                    </Box>
                  </Box>
                ) : null}
              </>
            )}
          </Box>
        </Box>
      )}
    </Flex>
  );
};

/** The open request on top of the pile: when more wait, the next sheets peek out beneath it. */
const Sheet = ({ stacked, children }: { stacked: boolean; children: ReactNode }) => (
  <Box position="relative" marginTop={3} marginBottom={stacked ? 6 : 3} isolation="isolate">
    {stacked
      ? [2, 1].map((n) => (
          <Box
            key={n}
            position="absolute"
            zIndex={-1}
            insetX={`${n * 6}px`}
            top="8px"
            bottom={`${-n * 5}px`}
            bg="bg.panel"
            borderWidth="1px"
            borderColor="border.strong"
            borderRadius="l3"
            aria-hidden
          />
        ))
      : null}
    {children}
  </Box>
);
