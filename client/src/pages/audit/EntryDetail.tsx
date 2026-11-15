import { Box, Button, Flex, IconButton, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Facts } from '@/pages/playbook/quiet';
import { useNavigate } from 'react-router-dom';
import { LuArrowUp, LuArrowUpRight, LuChevronDown, LuChevronUp, LuCopy, LuX } from 'react-icons/lu';
import { Code, Mono, Stamp, Tone } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import type { AuditEntry, Order } from '@/api/gateway';
import { actorLabel, steps } from '@/pages/playbook/graph';
import { EntryCheck, GENESIS_HASH } from './chain';
import { kindLabel, statusMeta } from '@/pages/playbook/visuals';
import { Kbd } from './parts';
import { entryJson, fullDate, slideIn } from './format';

type Props = {
  entry: AuditEntry;
  order: Order | undefined;
  check: EntryCheck | undefined;
  onClose: () => void;
  onStep: (dir: -1 | 1) => void;
};

export const EntryDetail = ({ entry, order, check, onClose, onStep }: Props) => {
  const navigate = useNavigate();
  const step = steps.find((s) => s.id === entry.step) ?? { id: entry.step, kind: 'audit' as const, title: entry.step };
  const meta = statusMeta[entry.status];
  const verified = check?.ok === true;
  const broken = check?.ok === false;
  const genesis = entry.prevHash === GENESIS_HASH;
  const tone: Tone = entry.status === 'skipped' ? 'idle' : (entry.status as Tone);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toaster.create({ title: `${what} copied`, type: 'success' });
  };

  return (
    <Flex
      key={entry.seq}
      direction="column"
      width="440px"
      flexShrink={0}
      borderLeftWidth="1px"
      borderColor="border"
      bg="bg.panel"
      minHeight={0}
      css={{ animation: `${slideIn} 0.22s ease-out` }}
    >
      <Flex
        align="start"
        gap={3}
        paddingX={6}
        paddingTop={5}
        paddingBottom={4}
        flexShrink={0}
        borderBottomWidth="1px"
        borderColor="border.strong"
        marginX={0}
      >
        <Box flex={1} minWidth={0}>
          <Text textStyle="caps" color="fg.subtle">
            Entry{' '}
            <Text as="span" className="tnum" letterSpacing="0" fontSize="11px" color="fg">
              No. {String(entry.seq).padStart(4, '0')}
            </Text>{' '}
            ·{' '}
            <Text as="span" className="tnum" letterSpacing="0" fontSize="11px">
              {entry.orderId ?? 'Gateway'}
            </Text>
          </Text>
          <Text textStyle="title" marginTop={1} truncate>
            {step.title}
          </Text>
        </Box>
        <Flex gap={0.5} marginTop={-1}>
          <IconButton aria-label="Previous entry" variant="ghost" size="xs" color="fg.muted" onClick={() => onStep(-1)}>
            <LuChevronUp />
          </IconButton>
          <IconButton aria-label="Next entry" variant="ghost" size="xs" color="fg.muted" onClick={() => onStep(1)}>
            <LuChevronDown />
          </IconButton>
          <IconButton aria-label="Close" variant="ghost" size="xs" color="fg.muted" onClick={onClose}>
            <LuX />
          </IconButton>
        </Flex>
      </Flex>

      <Stack flex={1} overflowY="auto" paddingX={6} paddingTop={5} paddingBottom={6} gap={7}>
        <Box>
          <Flex align="center" gap={2} marginBottom={3}>
            <Stamp tone={tone}>{meta.label}</Stamp>
            {verified ? <Stamp tone="auto">Hash verified</Stamp> : broken ? <Stamp tone="blocked">Hash mismatch</Stamp> : null}
          </Flex>
          <Text fontSize="15px" lineHeight="1.55" color="fg">
            {entry.message}
          </Text>
        </Box>

        <Facts
          rows={[
            ['Time', <Mono key="t">{fullDate(entry.at)}</Mono>],
            ['Order', <Mono key="o">{entry.orderId ?? '—'}</Mono>],
            ...(order ? [['Agent', order.agent?.name ?? order.agent?.id ?? '—'] as [ReactNode, ReactNode]] : []),
            ['Actor', actorLabel[entry.actor] ?? entry.actor],
            ['Step type', kindLabel[step.kind]],
            [
              'Entry id',
              <Text key="i" as="span" fontFamily="mono" fontSize="11.5px" display="block" truncate>
                {entry.id}
              </Text>,
            ],
          ]}
        />

        <Box>
          <Heading>Hash chain</Heading>
          <Stack gap={0} align="stretch">
            <HashBox
              label="hash"
              hash={entry.hash}
              note={`entry #${entry.seq}`}
              highlight={verified}
              danger={broken}
              onCopy={() => copy(entry.hash, 'Hash')}
            />
            <Flex align="center" gap={2.5} paddingLeft="14px" height="34px" color="fg.subtle" fontSize="11px">
              <Box width="1px" height="100%" bg={verified ? 'status.auto' : 'border.strong'} />
              <LuArrowUp />
              <Mono>sha256(canonicalJson(entry) ‖ prevHash)</Mono>
            </Flex>
            <HashBox label="prevHash" hash={entry.prevHash} note={genesis ? 'genesis' : `entry #${entry.seq - 1}`} />
            {broken && check ? (
              <Box marginTop={3}>
                <HashBox label="recomputed in this browser" hash={check.recomputed} note={check.reason ?? 'mismatch'} danger />
              </Box>
            ) : null}
          </Stack>
        </Box>

        <Box>
          <Flex align="center" justify="space-between">
            <Heading>Entry JSON</Heading>
            <Button size="2xs" variant="ghost" color="fg.muted" onClick={() => copy(entryJson(entry), 'Entry JSON')} marginTop={-2}>
              <LuCopy /> Copy
            </Button>
          </Flex>
          <Box css={{ '& pre': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}>
            <Code>{entryJson(entry)}</Code>
          </Box>
        </Box>
      </Stack>

      <Flex align="center" gap={2} paddingX={6} paddingY={3} borderTopWidth="1px" borderColor="border" flexShrink={0}>
        <Button
          size="sm"
          variant="outline"
          borderRadius="l2"
          disabled={!entry.orderId}
          onClick={() => navigate(`/app/runs/${entry.orderId}`)}
        >
          Open run <LuArrowUpRight />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          color="brand.fg"
          disabled={!entry.orderId}
          onClick={() => navigate(`/app/activity?order=${entry.orderId}`)}
        >
          Open order
        </Button>
        <Box flex={1} />
        <Flex align="center" gap={1} fontSize="11px" color="fg.subtle">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>esc</Kbd>
        </Flex>
      </Flex>
    </Flex>
  );
};

const Heading = ({ children }: { children: ReactNode }) => (
  <Flex align="center" gap={3} marginBottom={3}>
    <Text textStyle="caps" color="fg.subtle" flexShrink={0}>
      {children}
    </Text>
    <Box flex={1} height="1px" bg="border" />
  </Flex>
);

/** One link of the chain on the sheet: hairline box, the full hash in mono; green when verified, vermilion when it fails. */
const HashBox = ({
  label,
  hash,
  note,
  highlight,
  danger,
  onCopy,
}: {
  label: string;
  hash: string;
  note: string;
  highlight?: boolean;
  danger?: boolean;
  onCopy?: () => void;
}) => {
  const ink = danger ? 'status.blocked' : highlight ? 'status.auto' : undefined;
  return (
    <Box
      borderRadius="l2"
      borderWidth="1px"
      borderColor={ink ?? 'border.emphasized'}
      bg="bg.code"
      paddingX={3}
      paddingY={2.5}
      transition="border-color 0.3s"
    >
      <Flex justify="space-between" align="center" marginBottom={1}>
        <Text fontFamily="mono" fontSize="11px" color={ink ?? 'fg'} fontWeight="600">
          {label}
        </Text>
        <Flex align="center" gap={2}>
          <Text textStyle="caps" fontSize="12px" color="fg.subtle">
            {note}
          </Text>
          {onCopy ? (
            <IconButton aria-label="Copy hash" variant="ghost" size="2xs" minWidth="18px" height="18px" color="fg.subtle" onClick={onCopy}>
              <LuCopy />
            </IconButton>
          ) : null}
        </Flex>
      </Flex>
      <Text fontFamily="mono" fontSize="11.5px" color="fg.muted" wordBreak="break-all" lineHeight="1.55">
        {hash}
      </Text>
    </Box>
  );
};
