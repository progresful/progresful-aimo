import { Box, Button, Dialog, Flex, IconButton, Menu, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { LuBan, LuEllipsis, LuKeyRound } from 'react-icons/lu';
import { Agent, useRevokeAgentKey } from '@/api/gateway';
import { Leader, Stamp, Tone } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { CopyButton } from './CopyButton';
import { errorMessage, stamp, when } from './format';

const statusOf = (agent: Agent): { tone: Tone; label: string } => {
  const key = agent.key;
  if (!key) return { tone: 'blocked', label: 'No key' };
  if (!key.enabled) return { tone: 'blocked', label: 'Key revoked' };
  if (agent.policy.version === null) return { tone: 'pending', label: 'Policy unsigned' };
  return { tone: 'auto', label: 'Live' };
};

/** The word on the rubber stamp for each status. */
const stampWord: Record<string, string> = { Live: 'Active', 'Key revoked': 'Revoked', 'No key': 'No key', 'Policy unsigned': 'Unsigned' };

/**
 * One agent as its letter of authority: who it is, the signed mandate its key is bound to,
 * the key itself, what it has done with it — and a stamp saying whether it still holds.
 */
export const AgentCard = ({
  agent,
  index,
  signedBy,
  isNew,
  onNewKey,
}: {
  agent: Agent;
  index: number;
  signedBy: string | null;
  isNew: boolean;
  onNewKey: () => void;
}) => {
  const key = agent.key;
  const status = statusOf(agent);
  const inEu = /finland/i.test(agent.host);
  const [confirm, setConfirm] = useState(false);
  const revoke = useRevokeAgentKey();

  const doRevoke = () => {
    if (!key) return;
    revoke.mutate(
      { agentId: agent.id, keyId: key.id },
      {
        onSuccess: () =>
          toaster.create({
            title: `Revoked ${key.start}… — ${agent.name} now gets 401`,
            description: 'Create a new key to reconnect it.',
            type: 'info',
          }),
        onError: (e) => toaster.create({ title: 'Could not revoke the key', description: errorMessage(e), type: 'error' }),
        onSettled: () => setConfirm(false),
      }
    );
  };

  const usage: [string, number | null][] = [
    ['Requests', key ? key.requestCount : null],
    ['Orders placed', agent.stats.ordersPlaced],
    ['Approvals asked', agent.stats.approvalsRequested],
    ['Blocked', agent.stats.blocked],
  ];

  return (
    <Box
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="l3"
      bg="bg.panel"
      boxShadow="panel"
      paddingX={7}
      paddingTop={5}
      paddingBottom={6}
    >
      <Flex align="center" gap={3}>
        <Text textStyle="caps" color="fg.subtle" flex={1}>
          Letter of authority ·{' '}
          <Text as="span" className="tnum">
            No. {String(index + 1).padStart(2, '0')}
          </Text>
          <Text as="span" color="fg.subtle" fontWeight="400">
            {' '}
            · {agent.transport === 'mcp' ? 'MCP' : 'OpenAPI'}
          </Text>
        </Text>
        <Menu.Root
          positioning={{ placement: 'bottom-end' }}
          onSelect={({ value }) => (value === 'new' ? onNewKey() : value === 'revoke' ? setConfirm(true) : null)}
        >
          <Menu.Trigger asChild>
            <IconButton aria-label={`More for ${agent.name}`} size="xs" variant="ghost" color="fg.muted" marginRight={-2}>
              <LuEllipsis />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minWidth="180px" borderRadius="l3" boxShadow="float">
                <Menu.Item value="new">
                  <LuKeyRound /> {key?.enabled ? 'Replace key' : 'New key'}
                </Menu.Item>
                {key?.enabled ? (
                  <Menu.Item value="revoke" color="status.blocked" _hover={{ bg: 'status.blocked/8' }}>
                    <LuBan /> Revoke key
                  </Menu.Item>
                ) : null}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>

      <Flex align="center" gap={6} marginTop={1} paddingBottom={4} borderBottomWidth="1px" borderColor="border.strong">
        <Box flex={1} minWidth={0}>
          <Text textStyle="title" fontSize="32px" lineHeight="1.15" truncate>
            {agent.name}
          </Text>
          <Text fontSize="13px" color="fg.subtle" marginTop={1} truncate>
            {agent.model} · {agent.host}
            {inEu ? (
              <Text as="span" color="status.auto">
                {' '}
                · data stays in the EU
              </Text>
            ) : null}
          </Text>
        </Box>
        <Box title={status.label} paddingRight={2}>
          <Stamp tone={status.tone}>
            {stampWord[status.label] ?? status.label}
          </Stamp>
        </Box>
      </Flex>

      <Box display="grid" gridTemplateColumns="minmax(0, 1.25fr) minmax(0, 1fr)" columnGap={10} marginTop={4}>
        <Box display="flex" flexDirection="column" gap={2.5}>
          <Leader
            label={
              <Text as="span" color="fg.muted">
                Bound to mandate
              </Text>
            }
            value={
              <Text as="span" title={agent.policy.name ?? agent.policy.key}>
                <Text as="span" fontFamily="mono" fontSize="12.5px">
                  {agent.policy.key}
                </Text>{' '}
                <Text as="span" color={agent.policy.version !== null ? 'fg' : 'status.pending'}>
                  {agent.policy.version !== null ? `v${agent.policy.version}` : 'unsigned'}
                </Text>
              </Text>
            }
          />
          <Leader
            label={
              <Text as="span" color="fg.muted">
                Signed by
              </Text>
            }
            value={
              <Text as="span">
                {signedBy ?? (agent.policy.version !== null ? '—' : 'not signed')}
              </Text>
            }
          />
          <Leader
            label={
              <Text as="span" color="fg.muted">
                Key
              </Text>
            }
            value={
              key ? (
                <Flex as="span" display="inline-flex" align="center" gap={1} marginY="-4px">
                  {isNew ? (
                    <Text as="span" textStyle="caps" color="status.auto" marginRight={1}>
                      new
                    </Text>
                  ) : null}
                  <Text
                    as="span"
                    fontFamily="mono"
                    fontSize="12.5px"
                    color={key.enabled ? 'fg' : 'fg.subtle'}
                    textDecoration={key.enabled ? undefined : 'line-through'}
                  >
                    {key.start}
                    <Text as="span" color="fg.subtle">
                      ••••••••
                    </Text>
                  </Text>
                  <CopyButton value={key.start} label="Key prefix copied" />
                </Flex>
              ) : (
                <Text as="span" color="fg.subtle">
                  None — the agent can’t call the gateway
                </Text>
              )
            }
          />
          <Leader
            label={
              <Text as="span" color="fg.muted">
                Last used
              </Text>
            }
            value={<span title={stamp(key?.lastRequest)}>{key ? (key.lastRequest ? when(key.lastRequest) : 'Not yet') : '—'}</span>}
          />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(4, minmax(0, 1fr))"
          alignContent="start"
          borderLeftWidth="1px"
          borderColor="border.muted"
        >
          {usage.map(([label, n]) => (
            <Box key={label} paddingLeft={4} minWidth={0}>
              <Text fontSize="22px" lineHeight="1.2" className="tnum" color={n ? 'fg' : 'fg.subtle'}>
                {n === null ? '—' : n.toLocaleString('en-US')}
              </Text>
              <Text fontSize="12px" color="fg.subtle" marginTop={1}>
                {label}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Dialog.Root open={confirm} onOpenChange={(e) => setConfirm(e.open)} placement="center" role="alertdialog">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content bg="bg.panel" borderRadius="l3" boxShadow="float" maxWidth="420px">
              <Dialog.Header paddingX={6} paddingTop={6} paddingBottom={2}>
                <Dialog.Title textStyle="title">Revoke {agent.name}’s key?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body paddingX={6} paddingY={2} fontSize="13.5px" color="fg.muted">
                <Text as="span" fontFamily="mono">
                  {key?.start}…
                </Text>{' '}
                stops working immediately; the agent gets 401 until you give it a new key.
              </Dialog.Body>
              <Dialog.Footer paddingX={6} paddingBottom={6} paddingTop={4}>
                <Dialog.ActionTrigger asChild>
                  <Button size="sm" variant="ghost" color="fg.muted">
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  size="sm"
                  bg="status.blocked"
                  color="status.contrast"
                  borderRadius="l2"
                  _hover={{ opacity: 0.9 }}
                  loading={revoke.isPending}
                  onClick={doRevoke}
                >
                  Revoke key
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
};
