import { Box, Flex, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useEffect, useRef, useState } from 'react';
import { LuChevronDown, LuChevronUp } from 'react-icons/lu';
import { actorLabel, hkiTime, shortHash, steps } from './graph';
import { RunState } from './useRun';
import { statusMeta } from './visuals';

const enter = keyframes`
  from { transform: translateY(4px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

type Props = {
  run: RunState;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** The run's audit entries as a ledger — hash-linked, collapsed to one line until asked for. */
export const RunLog = ({ run, selectedId, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [run.log.length, open]);

  if (!run.log.length) return null;

  return (
    <Flex direction="column" flexShrink={0} borderTopWidth="1px" borderColor="border" bg="bg">
      <Flex
        as="button"
        align="center"
        gap={2.5}
        paddingX={5}
        height="40px"
        flexShrink={0}
        color="fg.subtle"
        cursor="pointer"
        _hover={{ color: 'fg.muted' }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Text textStyle="caps">Audit log</Text>
        <Text fontSize="11.5px" className="tnum">
          {run.log.length} {run.log.length === 1 ? 'entry' : 'entries'}
        </Text>
        <Text fontFamily="mono" fontSize="11.5px" color="fg.subtle" truncate>
          head {shortHash(run.log.at(-1)!.hash)}
        </Text>
        <Box flex={1} />
        <Flex align="center" gap={1} fontSize="12.5px" color="fg.muted">
          {open ? 'Hide log' : 'Show log'} {open ? <LuChevronDown /> : <LuChevronUp />}
        </Flex>
      </Flex>

      {open ? (
        <Box ref={scroller} maxHeight="200px" overflowY="auto" paddingBottom={2} borderTopWidth="1px" borderColor="border.strong" marginX={5}>
          {run.log.map((entry) => {
            const meta = statusMeta[entry.status];
            const step = steps.find((s) => s.id === entry.step);
            return (
              <Flex
                key={entry.seq}
                align="center"
                gap={4}
                paddingX={2}
                marginX={-2}
                height="30px"
                fontSize="12.5px"
                cursor="pointer"
                borderBottomWidth="1px"
                borderColor="border"
                bg={selectedId === entry.step ? 'brand.subtle' : undefined}
                _hover={{ bg: selectedId === entry.step ? undefined : 'bg.hover' }}
                css={{ animation: `${enter} 0.5s ease-out` }}
                title={`#${entry.seq} · ${entry.hash}`}
                onClick={() => onSelect(entry.step)}
              >
                <Text fontSize="11.5px" color="fg.subtle" width="36px" flexShrink={0} className="tnum">
                  #{String(entry.seq).padStart(3, '0')}
                </Text>
                <Text fontSize="11.5px" color="fg.subtle" width="64px" flexShrink={0} className="tnum">
                  {hkiTime(entry.at)}
                </Text>
                <Box width="7px" height="7px" borderRadius="full" bg={meta.color} flexShrink={0} />
                <Text width="150px" fontWeight="500" truncate flexShrink={0}>
                  {step?.title ?? entry.step}
                </Text>
                <Text width="96px" textStyle="caps" fontSize="12px" color="fg.subtle" truncate flexShrink={0}>
                  {actorLabel[entry.actor]}
                </Text>
                <Text flex={1} color="fg.muted" truncate>
                  {entry.message}
                </Text>
                <Text fontFamily="mono" fontSize="11px" color="fg.subtle" flexShrink={0} display={{ base: 'none', lg: 'block' }}>
                  ← {shortHash(entry.prevHash)} · {shortHash(entry.hash)}
                </Text>
              </Flex>
            );
          })}
        </Box>
      ) : null}
    </Flex>
  );
};
