import { Box, Button, CloseButton, Dialog, Field, Flex, NativeSelect, Portal, Stack, Text } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { LuFingerprint, LuKeyRound } from 'react-icons/lu';
import { Agent, useCreateAgentKey } from '@/api/gateway';
import { Leader, Mono, Stamp } from '@/components/kit';
import { CopyButton } from './CopyButton';
import { errorMessage } from './format';

type Props = {
  open: boolean;
  agents: Agent[];
  initialAgentId?: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (keyId: string) => void;
};

export const CreateKeyDialog = ({ open, agents, initialAgentId, onOpenChange, onCreated }: Props) => {
  const [picked, setPicked] = useState<string | null>(null);
  const create = useCreateAgentKey();
  const agentId = picked ?? initialAgentId ?? agents[0]?.id ?? '';
  const agent = agents.find((a) => a.id === agentId);
  const secret = create.data?.key ?? null;

  const reset = () => {
    setPicked(null);
    create.reset();
  };

  const submit = () => create.mutate({ agentId }, { onSuccess: (r) => onCreated(r.keyId) });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) setTimeout(reset, 200);
      }}
      placement="center"
      closeOnInteractOutside={!secret}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3" boxShadow="float" maxWidth="500px">
            <Dialog.Header paddingX={6} paddingTop={6} paddingBottom={4}>
              <Flex gap={3} align="start">
                <Box flex={1} minWidth={0} paddingBottom={4} borderBottomWidth="1px" borderColor="border.strong">
                  <Text textStyle="caps" color="fg.subtle" marginBottom={1}>
                    Agent key · x-api-key
                  </Text>
                  <Dialog.Title textStyle="title">{secret ? 'Your new API key' : 'New key'}</Dialog.Title>
                  <Text fontSize="13px" color="fg.muted" marginTop={1}>
                    {secret
                      ? 'Give it to the agent — this is the only time it is shown.'
                      : 'One live key per agent. The agent’s policy comes with it.'}
                  </Text>
                </Box>
                {secret ? (
                  <Box position="absolute" top="64px" right="28px">
                    <Stamp tone="auto">
                      Issued
                    </Stamp>
                  </Box>
                ) : null}
              </Flex>
            </Dialog.Header>

            <Dialog.Body paddingX={6} paddingY={2}>
              {secret && create.data ? (
                <Stack gap={4}>
                  <Flex
                    align="center"
                    gap={2}
                    paddingLeft={3}
                    paddingRight={1.5}
                    minHeight="44px"
                    borderRadius="l2"
                    bg="bg.code"
                    borderWidth="1px"
                    borderColor="border.emphasized"
                  >
                    <Text fontFamily="mono" fontSize="12.5px" flex={1} color="fg" wordBreak="break-all" paddingY={2}>
                      {secret}
                    </Text>
                    <CopyButton value={secret} label="API key copied" size="sm" />
                  </Flex>
                  <Warning title="Copy it now.">
                    The gateway only stores a hash, so this key won’t be shown again. If it’s lost, issue a new one.
                  </Warning>
                  <Stack gap={2}>
                    <Leader
                      label={
                        <Text as="span" color="fg.muted">
                          Agent
                        </Text>
                      }
                      value={
                        <Text as="span">{agent?.name ?? create.data.agentId}</Text>
                      }
                    />
                    <Leader
                      label={
                        <Text as="span" color="fg.muted">
                          Bound policy
                        </Text>
                      }
                      value={`${agent?.policy.key ?? ''} ${agent?.policy.version !== null ? `v${agent?.policy.version}` : 'unsigned'}`}
                      mono
                    />
                    <Leader
                      label={
                        <Text as="span" color="fg.muted">
                          Header
                        </Text>
                      }
                      value="x-api-key"
                      mono
                    />
                    <Leader
                      label={
                        <Text as="span" color="fg.muted">
                          Starts with
                        </Text>
                      }
                      value={create.data.start}
                      mono
                    />
                  </Stack>
                </Stack>
              ) : (
                <Stack gap={4}>
                  <FieldRow label="Agent" hint="Shown in the audit trail next to every call.">
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field value={agentId} onChange={(e) => setPicked(e.target.value)} borderRadius="l2">
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.vendor}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </FieldRow>
                  {agent ? (
                    <Flex align="flex-start" gap={2} fontSize="12px" color="fg.subtle">
                      <Box color="brand.fg" marginTop="2px">
                        <LuFingerprint />
                      </Box>
                      <Text>
                        Bound to <Mono>{agent.policy.key}</Mono> {agent.policy.version !== null ? `v${agent.policy.version}` : '(unsigned)'}{' '}
                        — readable with <Mono>get_policy</Mono>, never changeable.
                      </Text>
                    </Flex>
                  ) : null}
                  {agent?.key ? (
                    <Warning title="This revokes the current key.">
                      {agent.name}’s key <Mono>{agent.key.start}…</Mono> stops working immediately; the agent gets 401 until you give it the
                      new one.
                    </Warning>
                  ) : null}
                  {create.error ? (
                    <Text fontSize="12.5px" color="status.blocked">
                      {errorMessage(create.error)}
                    </Text>
                  ) : null}
                </Stack>
              )}
            </Dialog.Body>

            <Dialog.Footer paddingX={6} paddingBottom={6} paddingTop={5}>
              {secret ? (
                <Dialog.ActionTrigger asChild>
                  <Button size="sm" borderRadius="l2">
                    I’ve stored the key
                  </Button>
                </Dialog.ActionTrigger>
              ) : (
                <>
                  <Dialog.ActionTrigger asChild>
                    <Button size="sm" variant="ghost" color="fg.muted">
                      Cancel
                    </Button>
                  </Dialog.ActionTrigger>
                  <Button
                    size="sm"
                    borderRadius="l2"
                    onClick={submit}
                    disabled={!agent}
                    loading={create.isPending}
                  >
                    <LuKeyRound /> {agent?.key ? 'Revoke old key & create new' : 'Create key'}
                  </Button>
                </>
              )}
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild top={4} right={4}>
              <CloseButton size="sm" color="fg.muted" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

/** A caution note: a rule of ochre ink down the left edge, not a tinted box. */
const Warning = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box
    paddingLeft={3.5}
    paddingY={1}
    borderLeftWidth="2px"
    borderColor="status.pending"
    fontSize="12.5px"
    color="fg.muted"
    lineHeight="1.55"
  >
    <Text as="span" color="status.pending" fontWeight="600">
      {title}
    </Text>{' '}
    {children}
  </Box>
);

const FieldRow = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <Field.Root>
    <Field.Label textStyle="caps" color="fg.subtle">
      {label}
    </Field.Label>
    {children}
    {hint ? (
      <Field.HelperText fontSize="11.5px" color="fg.subtle">
        {hint}
      </Field.HelperText>
    ) : null}
  </Field.Root>
);
