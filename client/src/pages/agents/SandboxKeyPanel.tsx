import { Box, Button, Flex, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { LuKeyRound, LuTriangleAlert } from 'react-icons/lu';
import { Agent, Sandbox, useCreateAgentKey, useSandboxKey } from '@/api/gateway';
import { Mono } from '@/components/kit';
import { defaultAgent } from '@/pages/home/format';
import { ChallengeStrip } from '@/pages/tryit/ChallengeStrip';
import { nextMonday } from '@/pages/tryit/challenges';
import { markDone } from '@/pages/tryit/progress';
import { Snippet } from './ConnectPanel';
import { CopyButton } from './CopyButton';
import { errorMessage } from './format';

const origin = typeof window !== 'undefined' ? window.location.origin : '';

const mcpConfig = (key: string) => `{
  "mcpServers": {
    "valio-aimo": {
      "type": "http",
      "url": "${origin}/mcp",
      "headers": { "x-api-key": "${key}" }
    }
  }
}`;

const curlPreview = (key: string) => `curl -X POST ${origin}/api/gw/orders/preview \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requestedDate": "${nextMonday()}",
    "lines": [{ "code": "463359", "quantity": 200, "unit": "l" }]
  }'`;

/**
 * "Connect your own AI agent" — one button issues a key (shown once), then everything
 * needed to use it: the MCP URL, a client config and a curl call. In a sandbox the key
 * comes from POST /sandbox/key; elsewhere it's a normal agent key.
 */
export const SandboxKeyPanel = ({ sandbox, agents, challenge }: { sandbox: Sandbox | undefined; agents: Agent[]; challenge: boolean }) => {
  const isSandbox = !!sandbox?.sandbox;
  const options = isSandbox ? sandbox.agents : agents.map((a) => ({ id: a.id, name: a.name }));
  const [agentId, setAgentId] = useState<string | null>(null);
  const chosen = agentId ?? (isSandbox ? options[0]?.id : defaultAgent(agents)?.id) ?? null;
  const sandboxKey = useSandboxKey();
  const agentKey = useCreateAgentKey();
  const pending = sandboxKey.isPending || agentKey.isPending;
  const error = sandboxKey.error ?? agentKey.error;
  const [issued, setIssued] = useState<{ key: string; agentId: string } | null>(null);

  const getKey = () => {
    if (!chosen) return;
    const onSuccess = (r: { key: string; agentId: string }) => {
      setIssued({ key: r.key, agentId: r.agentId });
      markDone('agent');
    };
    if (isSandbox) sandboxKey.mutate({ agentId: chosen }, { onSuccess });
    else agentKey.mutate({ agentId: chosen }, { onSuccess });
  };

  const key = issued?.key ?? 'mk_…';
  const agentName = options.find((a) => a.id === (issued?.agentId ?? chosen))?.name ?? 'the agent';

  return (
    <Box
      id="sandbox-key"
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="l3"
      bg="bg.panel"
      boxShadow="panel"
      paddingX={7}
      paddingY={6}
      marginBottom={10}
      scrollMarginTop="16px"
    >
      {challenge ? (
        <Box marginBottom={4}>
          <ChallengeStrip id="agent" />
        </Box>
      ) : null}
      {challenge ? null : (
        <Text textStyle="title" marginBottom={1}>
          Connect your own AI agent
        </Text>
      )}
      <Text fontSize="13.5px" color="fg.muted" lineHeight="1.6" maxWidth="680px">
        {isSandbox ? 'A key for one of your sandbox agents.' : 'A key for one of your agents.'} Any MCP client (Claude, Cursor, your own
        code) or plain REST works — the gateway applies the agent’s signed policy to every call.
      </Text>

      <Flex align="center" gap={2} marginTop={5} wrap="wrap">
        {options.length > 1 ? (
          <NativeSelect.Root size="sm" width="240px">
            <NativeSelect.Field
              value={chosen ?? ''}
              onChange={(e) => setAgentId(e.target.value)}
              borderRadius="l2"
              fontSize="13px"
              aria-label="Agent"
            >
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        ) : null}
        <Button
          size="sm"
          borderRadius="l2"
          loading={pending}
          loadingText="Issuing…"
          disabled={!chosen}
          onClick={getKey}
        >
          <LuKeyRound /> {issued ? 'Get another key' : isSandbox ? 'Get a sandbox key' : 'Get a key'}
        </Button>
      </Flex>
      {error ? (
        <Flex align="center" gap={2} marginTop={2} fontSize="12.5px" color="status.blocked">
          <LuTriangleAlert /> Couldn’t issue a key — {errorMessage(error)}
        </Flex>
      ) : null}

      {issued ? (
        <Box marginTop={5} paddingX={4} paddingY={3} borderLeftWidth="2px" borderColor="status.pending" bg="bg.code">
          <Text textStyle="caps" color="status.pending">
            Key for {agentName} — shown once. Copy it now.
          </Text>
          <Flex align="center" gap={2} marginTop={1.5}>
            <Text fontFamily="mono" fontSize="13px" wordBreak="break-all" flex={1}>
              {issued.key}
            </Text>
            <CopyButton value={issued.key} label="Key copied" size="sm" />
          </Flex>
        </Box>
      ) : null}

      <Stack gap={5} marginTop={6} paddingTop={5} borderTopWidth="1px" borderColor="border">
        <Flex align="center" gap={3} fontSize="13px">
          <Text textStyle="caps" color="fg.subtle" flexShrink={0}>
            MCP URL
          </Text>
          <Box
            flex={1}
            maxWidth="120px"
            borderBottomWidth="1px"
            borderColor="border"
            transform="translateY(2px)"
          />
          <Mono>{origin}/mcp</Mono>
          <CopyButton value={`${origin}/mcp`} label="MCP URL copied" />
        </Flex>
        <Snippet label="MCP client config" code={mcpConfig(key)} />
        <Snippet label="Preview an order with curl" code={curlPreview(key)} />
        <Text fontSize="12.5px" color="fg.subtle">
          The curl asks for 200 l of Valio semi skimmed milk 1 l (LACS 4.8) under the sandbox's rules in effect. With no rules it goes
          through; with a lactose rule (say “lactose-free” in a request) the gateway blocks it and offers a lactose-free substitute, which
          needs approval. A preview orders nothing.
        </Text>
      </Stack>
    </Box>
  );
};
