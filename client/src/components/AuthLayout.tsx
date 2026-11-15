import { Box, Flex, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { SignalBoard } from './SignalBoard';
import { ThemeToggle } from './ThemeToggle';
import { Caption, Corners, Dot, board } from './kit';

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

// Instrument inputs: hairline fields with mono values and an orange focus ring.
// TextInputField is shared, so the look is applied here rather than in it.
const formCss = {
  '& label': {
    fontFamily: 'var(--chakra-fonts-mono)',
    fontSize: '10.5px',
    fontWeight: '500',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--chakra-colors-fg-subtle)',
  },
  '& input': {
    height: '42px',
    borderRadius: 'var(--chakra-radii-l2)',
    borderColor: 'var(--chakra-colors-border-strong)',
    background: 'var(--chakra-colors-bg-muted)',
    fontFamily: 'var(--chakra-fonts-mono)',
    fontSize: '14px',
  },
  '& input:focus-visible': {
    borderColor: 'var(--chakra-colors-brand-accent)',
    outline: '1px solid var(--chakra-colors-brand-accent)',
    outlineOffset: '0',
  },
} as const;

// Login / signup: the "unlock" module on the left, the signal board with the dot-matrix name on the right.
export const AuthLayout = ({ eyebrow, title, subtitle, children, footer }: Props) => (
  <Flex minHeight="100%" bg="bg">
    <Flex direction="column" flex={1} minWidth={0} paddingX={{ base: 6, md: 10 }} paddingY={5}>
      <Flex align="center" justify="space-between" paddingBottom={4}>
        <NavLink to="/">
          <Logo size={24} />
        </NavLink>
        <ThemeToggle size="sm" />
      </Flex>
      <Flex flex={1} align="center" justify="center" paddingY={10}>
        <Box position="relative" width="100%" maxWidth="420px" bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3">
          <Corners />
          <Flex align="center" justify="space-between" paddingX={7} paddingTop={5}>
            <Caption n="00">{eyebrow}</Caption>
            <Flex align="center" gap={1.5} textStyle="label" color="fg.subtle">
              <Dot tone="pending" size={6} />
              Locked
            </Flex>
          </Flex>
          <Box paddingX={7} paddingTop={6} paddingBottom={7}>
            <Text as="h1" textStyle="display">
              {title}
            </Text>
            <Text color="fg.muted" marginTop={2} marginBottom={7} fontSize="14.5px">
              {subtitle}
            </Text>
            <Box css={formCss}>{children}</Box>
            <Flex justify="center" gap={2} marginTop={6} fontSize="13px" color="fg.muted">
              {footer}
            </Flex>
          </Box>
        </Box>
      </Flex>
      <Text textStyle="label" color="fg.subtle">
        Junction 2026 · Valio Aimo · Trusted Trade Agents
      </Text>
    </Flex>

    <Flex
      display={{ base: 'none', lg: 'flex' }}
      flex={1.1}
      direction="column"
      justify="center"
      gap={10}
      paddingX={14}
      paddingY={12}
      borderLeftWidth="1px"
      borderColor="border.strong"
      {...board}
    >
      <Box maxWidth="560px" width="100%" marginX="auto">
        <Text textStyle="hero" fontSize="88px" color="fg">
          AI-MO
        </Text>
        <Text fontSize="20px" fontWeight="500" letterSpacing="-0.02em" lineHeight="1.3" marginTop={5} maxWidth="440px">
          Guardrails live in the protocol, <Text as="span" color="brand.fg">not in the prompt.</Text>
        </Text>
      </Box>
      <Box position="relative" maxWidth="560px" width="100%" marginX="auto" bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3" padding={4}>
        <Corners />
        <SignalBoard />
      </Box>
    </Flex>
  </Flex>
);
