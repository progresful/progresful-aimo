import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { LuArrowRight } from 'react-icons/lu';
import { NavLink } from 'react-router-dom';
import { PublicHeader } from '@/components/PublicHeader';
import { SignalBoard } from '@/components/SignalBoard';
import { Caption, Corners, Dot, Readout, board } from '@/components/kit';
import { LogoMark } from '@/components/Logo';
import { useUser } from '@/providers/session';

const steps: { title: string; body: string }[] = [
  {
    title: 'Write the rules, sign them',
    body: 'Say in plain words what the kitchen may buy. AI-MO drafts numbered rules in an open policy format, and a named person signs them with their key.',
  },
  {
    title: 'Agents order through the gateway',
    body: 'Every order is checked on Valio Aimo’s side. Inside the rules it is ordered; outside them it waits for the named person; hard rules block. Prices and stock come back as signed quotes.',
  },
  {
    title: 'Every step is on the record',
    body: 'Requests, quotes, decisions and approvals go into one hash-chained log both sides can verify — and replay step by step.',
  },
];

export const Landing = () => {
  const { user } = useUser();

  return (
    <Box minHeight="100%" bg="bg" overflowX="hidden">
      <PublicHeader />

      {/* The name in dot-matrix, the pitch, and the board running one order. */}
      <Box borderBottomWidth="1px" borderColor="border.strong" {...board}>
        <Grid
          maxWidth="1280px"
          marginX="auto"
          paddingX={{ base: 6, md: 10 }}
          paddingTop={{ base: 12, md: 16 }}
          paddingBottom={{ base: 14, md: 20 }}
          templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }}
          gap={{ base: 12, lg: 14 }}
          alignItems="center"
        >
          <Box>
            <Flex align="center" gap={2} textStyle="label" color="fg.muted">
              <Dot tone="running" size={7} />A trust gateway for AI buyer agents
            </Flex>
            <Text as="h1" textStyle="hero" fontSize={{ base: '64px', md: '96px', xl: '112px' }} marginTop={6} marginLeft="-4px">
              AI-MO
            </Text>
            <Text fontSize={{ base: '24px', md: '30px' }} fontWeight="500" letterSpacing="-0.035em" lineHeight="1.15" marginTop={6} maxWidth="560px">
              Let AI agents buy. <Text as="span" color="brand.fg">On terms you signed.</Text>
            </Text>
            <Text fontSize="16px" color="fg.muted" maxWidth="520px" lineHeight="1.6" marginTop={4}>
              AI-MO turns a kitchen’s purchasing rules into a signed mandate that Valio Aimo’s gateway checks on every agent order — spend
              limits, allergens, substitutions and who signs off.
            </Text>
            <Flex gap={4} marginTop={8} align="center" wrap="wrap">
              <NavLink to={user ? '/app' : '/login'}>
                <Button size="lg" height="46px" paddingX={5}>
                  {user ? 'Open the app' : 'Try the demo'} <LuArrowRight />
                </Button>
              </NavLink>
              <a href="#how">
                <Button size="lg" height="46px" paddingX={5} variant="outline">
                  How it works
                </Button>
              </a>
            </Flex>
          </Box>

          <Box position="relative" bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3" paddingX={5} paddingTop={4} paddingBottom={5}>
            <Corners />
            <Flex justify="space-between" align="center" marginBottom={2}>
              <Caption>Live · one order through the gateway</Caption>
              <Text textStyle="label" color="fg.subtle">
                VA-20514
              </Text>
            </Flex>
            <SignalBoard />
          </Box>
        </Grid>
      </Box>

      {/* How it works: three modules, numbered in dot-matrix. */}
      <Box id="how" bg="bg">
        <Box
          maxWidth="1280px"
          marginX="auto"
          paddingX={{ base: 6, md: 10 }}
          paddingTop={{ base: 12, md: 16 }}
          paddingBottom={{ base: 14, md: 20 }}
        >
          <Flex align="end" justify="space-between" gap={8} wrap="wrap">
            <Box>
              <Caption>How it works</Caption>
              <Text as="h2" textStyle="display" marginTop={3}>
                Three steps, one signature.
              </Text>
            </Box>
            <Text fontSize="17px" color="fg.muted" maxWidth="420px" lineHeight="1.4">
              Guardrails live in the protocol, not in the prompt.
            </Text>
          </Flex>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4} marginTop={10}>
            {steps.map((s, i) => (
              <Box key={s.title} position="relative" bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3" padding={6}>
                <Flex justify="space-between" align="start">
                  <Readout size={56} color={i === 1 ? 'brand.fg' : 'fg'}>
                    0{i + 1}
                  </Readout>
                  <Caption>{['Sign', 'Check', 'Record'][i]}</Caption>
                </Flex>
                <Text textStyle="heading" fontSize="17px" marginTop={8}>
                  {s.title}
                </Text>
                <Text color="fg.muted" fontSize="14.5px" lineHeight="1.6" marginTop={2}>
                  {s.body}
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>
      </Box>

      <Box borderTopWidth="1px" borderColor="border.strong">
        <Flex
          maxWidth="1280px"
          marginX="auto"
          paddingX={{ base: 6, md: 10 }}
          paddingY={6}
          align="center"
          justify="space-between"
          gap={4}
          wrap="wrap"
          fontSize="12.5px"
          color="fg.subtle"
        >
          <Flex align="center" gap={2.5}>
            <LogoMark size={18} />
            <Text>Open source under MIT · Built at Junction 2026</Text>
          </Flex>
          <Text textStyle="label">
            ed25519 signatures · hash-chained audit log
          </Text>
        </Flex>
      </Box>
    </Box>
  );
};
