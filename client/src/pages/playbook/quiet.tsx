// Quiet building blocks shared by Home, the run view, the policy graph and the
// policy page: a disclosure for technical proof, status as a square of stamp ink + words,
// and plain section headings. Structure comes from whitespace and hairlines.
import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { Tone, toneColor } from '@/components/kit';

/** "Show technical details" — closed by default. */
export const Details = ({ label = 'Details', children, defaultOpen = false }: { label?: string; children: ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box>
      <Flex
        as="button"
        align="center"
        gap={1}
        fontSize="12.5px"
        color="fg.subtle"
        cursor="pointer"
        _hover={{ color: 'fg.muted' }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <LuChevronDown /> : <LuChevronRight />}
        {label}
      </Flex>
      {open ? (
        <Box marginTop={2.5} paddingLeft={4}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
};

/** A small dot of stamp ink + plain words. */
export const StatusText = ({ tone, children, size = '13px' }: { tone: Tone; children: ReactNode; size?: string }) => (
  <Flex display="inline-flex" align="start" gap={1.5} fontSize={size} color="fg.muted">
    <Box width="7px" height="7px" borderRadius="full" bg={toneColor[tone]} flexShrink={0} marginTop="calc(0.75em - 3.5px)" />
    {children}
  </Flex>
);

/** Serif section heading with an optional quiet action on the right. */
export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <Flex align="baseline" justify="space-between" gap={3} marginBottom={3}>
    <Text fontWeight="550" letterSpacing="-0.02em" fontSize="22px" lineHeight="1.2">
      {children}
    </Text>
    {action}
  </Flex>
);

/** Label / value pairs separated by hairlines — no grey well. */
export const Facts = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <Stack gap={0}>
    {rows.map(([label, value], i) => (
      <Flex key={i} justify="space-between" gap={4} paddingY={1.5} fontSize="12.5px" borderBottomWidth="1px" borderColor="border" _last={{ borderBottomWidth: 0 }}>
        <Text color="fg.subtle" minWidth={0}>
          {label}
        </Text>
        <Box textAlign="right" flexShrink={0} maxWidth="65%">
          {value}
        </Box>
      </Flex>
    ))}
  </Stack>
);
