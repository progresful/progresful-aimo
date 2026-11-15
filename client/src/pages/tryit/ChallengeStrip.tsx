import { Box, Flex, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowLeft, LuCheck } from 'react-icons/lu';
import { Stamp } from '@/components/kit';
import { CHALLENGES, challengeById } from './challenges';
import { ChallengeId, useTryIt } from './progress';

/** "Challenge 2 of 6" note on the page a challenge opened, with what to expect and a way back. `compact`: just the title. */
export const ChallengeStrip = ({ id, children, compact }: { id: ChallengeId; children?: ReactNode; compact?: boolean }) => {
  const c = challengeById(id);
  const done = !!useTryIt().done[id];
  const n = CHALLENGES.findIndex((x) => x.id === id) + 1;
  return (
    // A note clipped to the page: white sheet, an ink rule down its edge (stamp green once done).
    <Box
      borderWidth="1px"
      borderColor="border"
      borderLeftWidth="3px"
      borderLeftColor={done ? 'status.auto' : 'brand.accent'}
      bg="bg.panel"
      boxShadow="panel"
      borderRadius="l2"
      paddingX={3.5}
      paddingY={3}
      fontSize="12.5px"
    >
      <Flex align="center" gap={2}>
        {done ? (
          <Stamp tone="auto">
            <LuCheck strokeWidth={3} /> Done
          </Stamp>
        ) : (
          <Text textStyle="caps" color="brand.fg" flexShrink={0}>
            Challenge{' '}
            <Text as="span" className="tnum" letterSpacing="0">
              {n} / {CHALLENGES.length}
            </Text>
          </Text>
        )}
        <Box flex={1} />
        <Link to="/app/try">
          <Flex align="center" gap={1} color="fg.subtle" _hover={{ color: 'brand.fg' }} fontSize="12px">
            <LuArrowLeft /> All challenges
          </Flex>
        </Link>
      </Flex>
      <Text color="fg" fontWeight="550" letterSpacing="-0.02em" fontSize="19px" lineHeight="1.25" marginTop={1.5}>
        {c.title}
      </Text>
      {compact ? null : (
        <>
          <Text color="fg.muted" marginTop={0.5}>
            {c.tryText}
          </Text>
          <Text color="fg.subtle">{c.expect}</Text>
        </>
      )}
      {children}
    </Box>
  );
};
