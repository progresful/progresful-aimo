// Shared UI pieces for the app pages — the "instrument" look: a device shell with white
// modules on it, dark hairlines, engraved mono captions, LEDs for status, keycaps for
// actions and a dot-matrix face for the big readouts. Everything here reads colours from
// the theme tokens in theme/system.ts — reuse these rather than restyling per page.
import { Box, BoxProps, Flex, Text, TextProps } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { IconType } from 'react-icons';

export type Tone = 'auto' | 'pending' | 'blocked' | 'running' | 'idle';

export const toneColor: Record<Tone, string> = {
  auto: 'status.auto',
  pending: 'status.pending',
  blocked: 'status.blocked',
  running: 'status.running',
  idle: 'status.idle',
};

const ledColor: Record<Tone, string> = {
  auto: 'led.auto',
  pending: 'led.pending',
  blocked: 'led.blocked',
  running: 'led.running',
  idle: 'led.idle',
};

/** The page's running head: the trail as an engraved mono path, optional meta and actions on the right. */
export const PageHeader = ({ trail, meta, actions }: { trail: string[]; meta?: ReactNode; actions?: ReactNode }) => (
  <Flex align="center" gap={3} paddingX={6} height="44px" borderBottomWidth="1px" borderColor="border" bg="bg" flexShrink={0}>
    <Flex align="center" gap={2} textStyle="label" color="fg.subtle" minWidth={0}>
      {trail.map((part, i) => (
        <Flex key={part} align="center" gap={2} color={i === trail.length - 1 ? 'fg' : undefined} whiteSpace="nowrap">
          {i > 0 ? (
            <Text as="span" color="fg.subtle">
              /
            </Text>
          ) : null}
          {part}
        </Flex>
      ))}
    </Flex>
    {meta}
    <Box flex={1} />
    {actions}
  </Flex>
);

/** Full-height page frame: running head + scrollable body. */
export const Page = ({ header, children, maxWidth = '1180px' }: { header: ReactNode; children: ReactNode; maxWidth?: string }) => (
  <Flex direction="column" height="100%" minHeight={0}>
    {header}
    <Box flex={1} overflowY="auto" minHeight={0}>
      <Box maxWidth={maxWidth} marginX="auto" paddingX={8} paddingTop={10} paddingBottom={12}>
        {children}
      </Box>
    </Box>
  </Flex>
);

/** The page title, a one-line description, and the actions on the right. */
export const PageIntro = ({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) => (
  <Box marginBottom={8}>
    <Flex align="end" justify="space-between" gap={6}>
      <Box minWidth={0}>
        <Text as="h1" textStyle="display">
          {title}
        </Text>
        {description ? (
          <Text color="fg.muted" marginTop={2} maxWidth="680px" fontSize="15px">
            {description}
          </Text>
        ) : null}
      </Box>
      {actions}
    </Flex>
  </Box>
);

/** Registration marks in a module's four corners — the small machined detail on key panels. */
export const Corners = ({ color = 'fg', inset = '5px', size = 7 }: { color?: string; inset?: string; size?: number }) => {
  const arm = `${size}px`;
  const mark = (pos: BoxProps) => (
    <Box position="absolute" width={arm} height={arm} borderColor={color} pointerEvents="none" {...pos} />
  );
  return (
    <>
      {mark({ top: inset, left: inset, borderTopWidth: '1px', borderLeftWidth: '1px' })}
      {mark({ top: inset, right: inset, borderTopWidth: '1px', borderRightWidth: '1px' })}
      {mark({ bottom: inset, left: inset, borderBottomWidth: '1px', borderLeftWidth: '1px' })}
      {mark({ bottom: inset, right: inset, borderBottomWidth: '1px', borderRightWidth: '1px' })}
    </>
  );
};

/** The engraved caption on a module: "01 INPUT". */
export const Caption = ({ n, children, color = 'fg.subtle', ...props }: { n?: string; children: ReactNode } & TextProps) => (
  <Text textStyle="label" color={color} whiteSpace="nowrap" {...props}>
    {n ? (
      <Text as="span" color="fg" marginRight="0.7em">
        {n}
      </Text>
    ) : null}
    {children}
  </Text>
);

/** A white module on the shell, outlined in a dark hairline. */
export const Panel = ({ children, ...props }: BoxProps) => (
  <Box borderRadius="l3" borderWidth="1px" borderColor="border.strong" bg="bg.panel" {...props}>
    {children}
  </Box>
);

/** A list in a module: rows separated by hairlines, the whole row hoverable. */
export const List = ({ children, ...props }: BoxProps) => (
  <Box
    borderRadius="l3"
    borderWidth="1px"
    borderColor="border.strong"
    bg="bg.panel"
    overflow="hidden"
    css={{ '& > *:not(:last-child)': { borderBottomWidth: '1px', borderColor: 'var(--chakra-colors-border)' } }}
    {...props}
  >
    {children}
  </Box>
);

/** Engraved section caption with a hairline running out to the right. */
export const Section = ({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) => (
  <Box>
    <Flex align="center" gap={3} marginBottom={3}>
      <Text textStyle="label" color="fg.subtle" flexShrink={0}>
        {title}
      </Text>
      <Box flex={1} height="1px" bg="border" />
      {action}
    </Flex>
    {children}
  </Box>
);

/** Inline numbers — money, quantities, times, order numbers — in tabular figures. */
export const Num = ({ children, color }: { children: ReactNode; color?: string }) => (
  <Text as="span" className="tnum" color={color}>
    {children}
  </Text>
);

/** Inline technical strings only: hashes, key ids, product codes, paths. */
export const Mono = ({ children, color }: { children: ReactNode; color?: string }) => (
  <Text as="span" fontFamily="mono" fontSize="0.9em" color={color}>
    {children}
  </Text>
);

/** A dot-matrix readout: a verdict word, a total, a counter. */
export const Readout = ({ children, size = 40, color = 'fg', ...props }: { children: ReactNode; size?: number } & TextProps) => (
  <Text textStyle="readout" fontSize={`${size}px`} color={color} whiteSpace="nowrap" {...props}>
    {children}
  </Text>
);

/** An LED: the everyday status mark. Pending blinks unless `steady`. */
export const Dot = ({ tone, size = 7, steady }: { tone: Tone; size?: number; steady?: boolean }) => {
  const c = ledColor[tone];
  return (
    <Box
      width={`${size}px`}
      height={`${size}px`}
      borderRadius="full"
      bg={c}
      flexShrink={0}
      css={{
        // The only glow in the system: a faint halo of the LED's own colour.
        boxShadow: tone === 'idle' ? 'none' : `0 0 ${size}px 0 color-mix(in srgb, var(--chakra-colors-${c.replace('.', '-')}) 55%, transparent)`,
        animation: tone === 'pending' && !steady ? 'led-blink 1.6s steps(1) infinite' : undefined,
      }}
    />
  );
};

/**
 * A status. `sm` (the default) is an LED + sentence-case words in the status ink.
 * `lg` is the indicator plate for the one big verdict on a page: an LED and the word in mono caps.
 */
export const Stamp = ({ tone, children, size = 'sm' }: { tone: Tone; children: ReactNode; size?: 'sm' | 'lg' }) => {
  const color = toneColor[tone];
  if (size === 'sm') {
    return (
      <Flex as="span" display="inline-flex" align="center" gap={1.5} color={color} fontSize="12.5px" fontWeight="500" whiteSpace="nowrap" flexShrink={0} lineHeight="1.2">
        <Dot tone={tone} size={6} />
        {children}
      </Flex>
    );
  }
  return (
    <Flex
      as="span"
      display="inline-flex"
      align="center"
      gap={2}
      paddingX={2.5}
      height="28px"
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="l2"
      bg="bg.panel"
      color={color}
      fontFamily="mono"
      fontSize="11.5px"
      fontWeight="600"
      letterSpacing="0.1em"
      textTransform="uppercase"
      whiteSpace="nowrap"
      flexShrink={0}
      width="max-content"
      lineHeight="1"
    >
      <Dot tone={tone} size={7} />
      {children}
    </Flex>
  );
};

/** A rule's number, "R01", in mono. */
export const RuleNo = ({ n, color = 'fg.subtle', size = 12 }: { n: number | string; color?: string; size?: number }) => (
  <Text as="span" fontFamily="mono" fontSize={`${size}px`} fontWeight="500" lineHeight="1" color={color} flexShrink={0} letterSpacing="0.02em">
    {typeof n === 'number' ? `R${String(n).padStart(2, '0')}` : /^\d+$/.test(n) ? `R${n.padStart(2, '0')}` : n}
  </Text>
);

/** Spec line: label on the left, a mono value on the right (money, codes, policy ids). */
export const Leader = ({
  label,
  value,
  strong,
  color,
  mono,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  color?: string;
  mono?: boolean;
}) => (
  <Flex align="baseline" gap={3} fontSize="13px" color={color}>
    <Box minWidth={0} truncate fontWeight={strong ? '600' : undefined}>
      {label}
    </Box>
    <Box flex={1} minWidth="16px" />
    <Text
      as="span"
      fontFamily={mono ? 'mono' : undefined}
      fontSize={mono ? '12.5px' : '13px'}
      fontWeight={strong ? '600' : '500'}
      className="tnum"
      whiteSpace="nowrap"
    >
      {value}
    </Text>
  </Flex>
);

/** Icon in a hairline square. Pass a token like `kind.policy`. */
export const IconTile = ({ icon: Icon, tint = 'fg', size = 36 }: { icon: IconType; tint?: string; size?: number }) => (
  <Flex
    align="center"
    justify="center"
    flexShrink={0}
    width={`${size}px`}
    height={`${size}px`}
    borderRadius="l2"
    bg="bg.panel"
    color={tint}
    borderWidth="1px"
    borderColor="border.strong"
    fontSize={`${Math.round(size * 0.46)}px`}
  >
    <Icon />
  </Flex>
);

/** A segmented bar gauge — lit segments up to value / max — with the figures in mono. */
export const Meter = ({
  label,
  value,
  max,
  color,
  format = (n: number) => n.toLocaleString('en-US'),
}: {
  label: ReactNode;
  value: number;
  max: number;
  color: string;
  format?: (n: number) => string;
}) => {
  const segments = 24;
  const lit = Math.round(Math.min(1, value / max) * segments);
  return (
    <Box>
      <Flex justify="space-between" fontSize="12.5px" marginBottom={1.5}>
        <Text color="fg.muted">{label}</Text>
        <Text fontFamily="mono" fontSize="12px">
          <Text as="span" color={color} fontWeight="600">
            {format(value)}
          </Text>
          <Text as="span" color="fg.subtle">
            {' '}
            / {format(max)}
          </Text>
        </Text>
      </Flex>
      <Flex gap="2px" height="8px">
        {Array.from({ length: segments }, (_, i) => (
          <Box key={i} flex={1} borderRadius="1px" bg={i < lit ? color : 'border'} transition="background 0.2s" />
        ))}
      </Flex>
    </Box>
  );
};

export const EmptyHint = ({ children }: { children: ReactNode }) => (
  <Text
    fontSize="13px"
    fontFamily="mono"
    color="fg.subtle"
    borderWidth="1px"
    borderStyle="dashed"
    borderColor="border.emphasized"
    borderRadius="l3"
    paddingX={4}
    paddingY={7}
    textAlign="center"
  >
    {children}
  </Text>
);

/** Monospace code block (JSON, curl snippets). */
export const Code = ({ children, maxHeight }: { children: string; maxHeight?: string }) => (
  <Box
    as="pre"
    fontFamily="mono"
    fontSize="12px"
    lineHeight="1.7"
    color="fg.code"
    bg="bg.code"
    borderWidth="1px"
    borderColor="border"
    borderRadius="l3"
    padding={4}
    overflow="auto"
    maxHeight={maxHeight}
    whiteSpace="pre"
  >
    {children}
  </Box>
);

/** A small keycap — presets, shortcuts. Rendered as a `button` unless `as` says otherwise. */
export const Keycap = ({ children, active, ...props }: { children: ReactNode; active?: boolean } & BoxProps) => (
  <Box
    as="button"
    display="inline-flex"
    alignItems="center"
    gap={1.5}
    height="28px"
    paddingX={2.5}
    borderRadius="l2"
    borderWidth="1px"
    borderColor="border.strong"
    bg={active ? 'brand.solid' : 'bg.panel'}
    color={active ? 'brand.contrast' : 'fg'}
    boxShadow="keyLight"
    fontSize="12.5px"
    fontWeight="500"
    whiteSpace="nowrap"
    cursor="pointer"
    transition="transform 0.12s, box-shadow 0.12s, background 0.12s"
    _hover={{ bg: active ? 'brand.solidHover' : 'bg.muted' }}
    _active={{ transform: 'translateY(2px)', boxShadow: 'none' }}
    {...props}
  >
    {children}
  </Box>
);

/** The board: a faint grid of dots on the shell, so the modules on it read first. */
export const board = {
  bg: 'bg.canvas',
  backgroundImage: 'radial-gradient(circle at 1px 1px, var(--chakra-colors-canvas-dot) 1px, transparent 1.2px)',
  backgroundSize: '20px 20px',
} as const;
