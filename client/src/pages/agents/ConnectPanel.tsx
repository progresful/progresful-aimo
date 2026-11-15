import { Box, Flex, Link, Spinner, Stack, Tabs, Text } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { LuArrowUpRight, LuChevronRight, LuLock } from 'react-icons/lu';
import { Health, OpenApiDocument, useOpenApi } from '@/api/gateway';
import { Code, Mono, Stamp } from '@/components/kit';
import { CopyButton } from './CopyButton';
import { errorMessage } from './format';
import { mcpTools } from './tools';

const origin = typeof window !== 'undefined' ? window.location.origin : '';

const mcpConfig = `{
  "mcpServers": {
    "valio-aimo": {
      "type": "http",
      "url": "${origin}/mcp",
      "headers": {
        "x-api-key": "mk_live_…"
      }
    }
  }
}`;

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const curlQuote = () => `curl -X POST ${origin}/api/gw/quotes \\
  -H "x-api-key: $AIMO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requestedDate": "${tomorrow()}",
    "products": [
      { "code": "464398", "quantity": 1000, "unit": "l" }
    ]
  }'`;

/** "Connect an agent": one collapsible section with MCP / OpenAPI / Tools tabs. Collapsed by default. */
export const ConnectPanel = ({ health }: { health: Health | undefined }) => {
  const [open, setOpen] = useState(false);
  return (
    <Box borderTopWidth="1px" borderColor="border.strong" paddingTop={5}>
      <Flex
        as="button"
        align="center"
        gap={2}
        width="100%"
        textAlign="left"
        cursor="pointer"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        _hover={{ '& .connect-title': { color: 'brand.fg' } }}
      >
        <Box color="fg.subtle" transform={open ? 'rotate(90deg)' : undefined} transition="transform 0.2s">
          <LuChevronRight />
        </Box>
        <Text className="connect-title" fontWeight="550" letterSpacing="-0.02em" fontSize="24px" lineHeight="1.2" transition="color 0.2s" flexShrink={0}>
          Connect an agent
        </Text>
        <Text fontSize="13px" color="fg.subtle" truncate marginLeft={2}>
          MCP at <Mono>/mcp</Mono> or REST from <Mono>/api/openapi.json</Mono>, with the agent’s own key.
        </Text>
      </Flex>

      {open ? (
        <Box paddingLeft={6} marginTop={4}>
          <Tabs.Root defaultValue="mcp" variant="line" size="sm">
            <Tabs.List borderColor="border" css={{ '--indicator-color': 'var(--chakra-colors-border-strong)' }}>
              {[
                ['mcp', 'MCP'],
                ['openapi', 'OpenAPI'],
                ['tools', 'Tools reference'],
              ].map(([v, label]) => (
                <Tabs.Trigger key={v} value={v} textStyle="caps" color="fg.subtle" _selected={{ color: 'fg' }} paddingX={3}>
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="mcp" paddingTop={4}>
              <Stack gap={3}>
                <Prose>
                  Add this server to the agent’s MCP client (streamable HTTP). Each agent sends its own key in <Mono>x-api-key</Mono> — the
                  key decides which signed policy applies, and the agent can read it with <Mono>get_policy</Mono> but never change it.
                </Prose>
                <Snippet label="mcp.json" code={mcpConfig} />
                {health ? (
                  <Text fontSize="12.5px" color="fg.subtle">
                    Quotes and policies are signed with {health.signing.algorithm} key <Mono>{health.signing.kid}</Mono> — public key at{' '}
                    <Mono>/api/gw/keys</Mono>. Valio connection: {health.valio.mode === 'live' ? 'live API' : 'simulator'}
                    {health.valio.ok ? '' : ' (unreachable)'}.
                  </Text>
                ) : null}
              </Stack>
            </Tabs.Content>
            <Tabs.Content value="openapi" paddingTop={4}>
              <OpenApiTab />
            </Tabs.Content>
            <Tabs.Content value="tools" paddingTop={4}>
              <ToolsReference />
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      ) : null}
    </Box>
  );
};

const methodColor: Record<string, string> = {
  get: 'status.auto',
  post: 'status.running',
  patch: 'status.pending',
  delete: 'status.blocked',
};

const OpenApiTab = () => {
  const doc = useOpenApi();
  const curl = curlQuote();
  const [showOps, setShowOps] = useState(false);
  return (
    <Stack gap={3}>
      <Prose>
        The same operations as plain REST, for agents that call functions from an OpenAPI schema — same gateway, same policy engine, same{' '}
        <Mono>x-api-key</Mono>.{' '}
        <Link href={`${origin}/api/openapi.json`} target="_blank" rel="noreferrer" color="brand.fg">
          Open the spec <LuArrowUpRight />
        </Link>
      </Prose>
      <Snippet label="get_quote over REST" code={curl} />
      {doc.isLoading ? (
        <Spinner size="xs" color="fg.subtle" />
      ) : doc.error ? (
        <Text fontSize="12.5px" color="status.blocked">
          Could not load /api/openapi.json — {errorMessage(doc.error)}
        </Text>
      ) : doc.data ? (
        <Box>
          <Flex
            as="button"
            align="center"
            gap={1.5}
            fontSize="13px"
            color="fg.muted"
            cursor="pointer"
            _hover={{ color: 'fg' }}
            onClick={() => setShowOps((s) => !s)}
          >
            <Box transform={showOps ? 'rotate(90deg)' : undefined} transition="transform 0.15s">
              <LuChevronRight />
            </Box>
            {showOps ? 'Hide' : 'Show'} all {countOps(doc.data)} operations
          </Flex>
          {showOps ? <PathList doc={doc.data} /> : null}
        </Box>
      ) : null}
    </Stack>
  );
};

const countOps = (doc: OpenApiDocument) => Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).length, 0);

const PathList = ({ doc }: { doc: OpenApiDocument }) => {
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({
      path,
      method,
      summary: op.summary ?? '',
      sessionOnly: !!op.security?.length && op.security.every((s) => !('agentKey' in s)),
    }))
  );
  return (
    <Stack gap={0} marginTop={3}>
      {ops.map((o) => (
        <Flex
          key={`${o.method} ${o.path}`}
          align="center"
          gap={3}
          fontSize="12.5px"
          minWidth={0}
          minHeight="30px"
          borderBottomWidth="1px"
          borderColor="border"
          title={o.summary}
        >
          <Text
            fontFamily="mono"
            fontSize="10.5px"
            fontWeight="600"
            letterSpacing="0.06em"
            width="48px"
            flexShrink={0}
            color={methodColor[o.method] ?? 'fg.muted'}
          >
            {o.method.toUpperCase()}
          </Text>
          <Text fontFamily="mono" flexShrink={0}>
            {o.path}
          </Text>
          {o.sessionOnly ? (
            <Box color="fg.subtle" flexShrink={0} fontSize="11px" title="Signed-in person only">
              <LuLock />
            </Box>
          ) : null}
          <Text color="fg.subtle" truncate flex={1} minWidth={0}>
            {o.summary}
          </Text>
        </Flex>
      ))}
      <Text fontSize="12px" color="fg.subtle" marginTop={3}>
        {doc.info.title.split(' — ')[0]} v{doc.info.version}, read live from the spec. <LuLock style={{ display: 'inline' }} /> = signed-in
        person only.
      </Text>
    </Stack>
  );
};

/** The seven tools as a ledger: number, name, what it does and takes, and whether it can write. */
const TOOL_COLUMNS = '28px 168px minmax(0, 1fr) 132px';

const ToolsReference = () => (
  <Box>
    <Box
      display="grid"
      gridTemplateColumns={TOOL_COLUMNS}
      columnGap={4}
      paddingBottom={2}
      textStyle="caps"
      color="fg.subtle"
      borderBottomWidth="1px"
      borderColor="border.strong"
    >
      <Text>No.</Text>
      <Text>Tool</Text>
      <Text>What it does · input</Text>
      <Text textAlign="right">Access</Text>
    </Box>
    {mcpTools.map((t, i) => (
      <Box
        key={t.name}
        display="grid"
        gridTemplateColumns={TOOL_COLUMNS}
        columnGap={4}
        paddingY={3}
        borderBottomWidth="1px"
        borderColor="border"
        alignItems="baseline"
      >
        <Text fontFamily="mono" fontSize="11.5px" color="fg.subtle" className="tnum">
          {String(i + 1).padStart(2, '0')}
        </Text>
        <Text fontFamily="mono" fontSize="13px" fontWeight="600" wordBreak="break-word">
          {t.name}
        </Text>
        <Box minWidth={0}>
          <Text fontSize="13px" color="fg.muted" lineHeight="1.55">
            {t.description}
          </Text>
          <Text fontFamily="mono" fontSize="11.5px" color="fg.subtle" marginTop={1} wordBreak="break-word">
            {t.input}
          </Text>
        </Box>
        <Box textAlign="right">
          <Stamp tone={t.readOnly ? 'idle' : 'pending'}>{t.readOnly ? 'Read-only' : 'Writes · gated'}</Stamp>
        </Box>
      </Box>
    ))}
    <Text paddingTop={3} fontSize="12.5px" color="fg.subtle">
      Mirrors the tools the MCP server at <Mono>/mcp</Mono> registers. Every tool runs as the calling key’s agent, under that agent’s signed
      policy. Writes are policy-gated.
    </Text>
  </Box>
);

const Prose = ({ children }: { children: ReactNode }) => (
  <Text fontSize="13px" color="fg.muted" lineHeight="1.6" maxWidth="720px">
    {children}
  </Text>
);

/** A code snippet with its caption in small caps and a copy button, like a captioned exhibit. */
export const Snippet = ({ label, code }: { label: string; code: string }) => (
  <Box>
    <Flex align="center" justify="space-between" marginBottom={1.5} paddingLeft={0.5}>
      <Text textStyle="caps" color="fg.subtle">
        {label}
      </Text>
      <CopyButton value={code} label="Snippet copied" />
    </Flex>
    <Code>{code}</Code>
  </Box>
);
