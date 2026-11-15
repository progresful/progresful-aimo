import { Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';
import { useAgents, useHealth, usePolicies, useSandbox } from '@/api/gateway';
import { EmptyHint, Page, PageHeader, PageIntro, Section } from '@/components/kit';
import { AgentCard } from './AgentCard';
import { ConnectPanel } from './ConnectPanel';
import { CreateKeyDialog } from './CreateKeyDialog';
import { errorMessage } from './format';
import { SandboxKeyPanel } from './SandboxKeyPanel';

export const AgentsPage = () => {
  const agents = useAgents();
  const policies = usePolicies();
  const health = useHealth();
  const sandbox = useSandbox();
  const [params] = useSearchParams();
  const tryAgent = params.get('try') === 'agent';
  const showConnect = !!sandbox.data?.sandbox || tryAgent;
  // Opened from "Try it yourself": bring the key section into view once it renders.
  useEffect(() => {
    if (tryAgent && agents.data) document.getElementById('sandbox-key')?.scrollIntoView({ block: 'start' });
  }, [tryAgent, agents.data]);
  const [dialog, setDialog] = useState<{ open: boolean; agentId: string | null }>({ open: false, agentId: null });
  const [highlight, setHighlight] = useState<string | null>(null);

  const list = agents.data ?? [];
  const signedBy = (key: string) => policies.data?.find((p) => p.key === key && p.activeVersion !== null)?.signature?.signedBy ?? null;
  const openCreate = (agentId?: string) => setDialog({ open: true, agentId: agentId ?? null });

  return (
    <Page header={<PageHeader trail={['Gateway', 'Agents & keys']} />} maxWidth="920px">
      <PageIntro
        title="Agents & keys"
        description="Any agent that speaks MCP or OpenAPI can order — every key is bound to a signed policy."
        actions={
          <Button
            size="sm"
            borderRadius="l2"
            onClick={() => openCreate()}
            disabled={!list.length}
          >
            <LuPlus /> New key
          </Button>
        }
      />

      {showConnect && (agents.data || sandbox.data?.sandbox) ? (
        <SandboxKeyPanel sandbox={sandbox.data} agents={list} challenge={tryAgent} />
      ) : null}

      {agents.isLoading ? (
        <Flex justify="center" paddingY={16} color="fg.subtle">
          <Spinner size="sm" />
        </Flex>
      ) : agents.error ? (
        <Text fontSize="13px" color="status.blocked" paddingY={4}>
          Could not load agents — {errorMessage(agents.error)}
        </Text>
      ) : !list.length ? (
        <EmptyHint>No agents registered for this organisation.</EmptyHint>
      ) : (
        <Section title={`Letters of authority · ${list.length} ${list.length === 1 ? 'agent' : 'agents'}`}>
          <Stack gap={5}>
            {list.map((a, i) => (
              <AgentCard
                key={a.id}
                index={i}
                agent={a}
                signedBy={signedBy(a.policy.key)}
                isNew={!!a.key && a.key.id === highlight}
                onNewKey={() => openCreate(a.id)}
              />
            ))}
          </Stack>
        </Section>
      )}

      <Box marginTop={10}>
        <ConnectPanel health={health.data} />
      </Box>

      <CreateKeyDialog
        open={dialog.open}
        agents={list}
        initialAgentId={dialog.agentId}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onCreated={setHighlight}
      />
    </Page>
  );
};
