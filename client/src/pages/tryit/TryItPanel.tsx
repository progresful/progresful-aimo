import { Box, Button, Flex, Stack, Text } from '@chakra-ui/react';
import { Link, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuCheck } from 'react-icons/lu';
import { useEffect } from 'react';
import { useOrder } from '@/api/gateway';
import { CHALLENGES, challengeLink } from './challenges';
import { markDone, toggleDone, useTryIt } from './progress';

/**
 * "Try it yourself" — six challenges for judges, a numbered checklist. Each opens the real UI
 * with the example filled in (what to expect is told there); a tick appears when the page sees
 * the real outcome (or by hand).
 */
export const TryItPanel = () => {
  const progress = useTryIt();
  const navigate = useNavigate();
  const done = CHALLENGES.filter((c) => progress.done[c.id]).length;

  // Over budget: done once the order that waited for approval has been decided by a person.
  const budget = useOrder(progress.done.budget ? null : (progress.budgetOrderId ?? null));
  const approval = budget.data?.approval ?? null;
  const decided = !!approval && approval.status !== 'pending' && approval.status !== 'timed_out' && !!approval.decidedBy;
  useEffect(() => {
    if (decided) markDone('budget');
  }, [decided]);
  const waiting = !progress.done.budget && approval?.status === 'pending';

  return (
    <Box>
      {/* Progress: a dot-matrix count and a segmented gauge, over the list. */}
      <Flex align="end" gap={6} paddingBottom={3} borderBottomWidth="1px" borderColor="border.strong">
        <Text textStyle="caps" color="fg.subtle" flex={1}>
          Challenges
        </Text>
        <Box width="160px" height="3px" bg="border" marginBottom="7px" flexShrink={0}>
          <Box height="100%" width={`${(done / CHALLENGES.length) * 100}%`} bg="status.auto" transition="width 0.4s var(--chakra-easings-out)" />
        </Box>
        <Text fontFamily="dot" fontWeight="800" fontSize="28px" letterSpacing="0" lineHeight="1" className="tnum" flexShrink={0} color={done === CHALLENGES.length ? 'status.auto' : 'fg'}>
          {done}
          <Text as="span" color="fg.subtle">
            {' '}
            / {CHALLENGES.length}
          </Text>
        </Text>
      </Flex>
      <Stack gap={0}>
        {CHALLENGES.map((c, i) => {
          const isDone = !!progress.done[c.id];
          return (
            <Flex
              key={c.id}
              align="start"
              gap={5}
              paddingY={5}
              borderBottomWidth="1px"
              borderColor="border"
            >
              <Text fontFamily="dot" fontWeight="800" fontSize="40px" letterSpacing="0" lineHeight="0.9" width="28px" flexShrink={0} color={isDone ? 'fg.subtle' : 'fg'} className="tnum">
                {i + 1}
              </Text>
              <Box flex={1} minWidth={0}>
                <Text textStyle="heading" color={isDone ? 'fg.muted' : 'fg'}>
                  {c.title}
                </Text>
                {c.id === 'budget' && waiting ? (
                  <Link to={`/app/runs/${progress.budgetOrderId}`}>
                    <Flex align="center" gap={1} marginTop={1} fontSize="13px" color="status.pending" _hover={{ textDecoration: 'underline' }}>
                      Your order is waiting — approve it <LuArrowRight />
                    </Flex>
                  </Link>
                ) : (
                  <Text marginTop={1} fontSize="13px" color="fg.muted" title={c.expect}>
                    {c.tryText}
                  </Text>
                )}
              </Box>
              <Button
                size="xs"
                variant="ghost"
                color={isDone ? 'fg.subtle' : 'brand.fg'}
                flexShrink={0}
                marginTop="-2px"
                onClick={() => navigate(challengeLink(c.id))}
              >
                {isDone ? 'Again' : c.action} <LuArrowRight />
              </Button>
              {/* The tick box: a hairline square; done = a tick in stamp ink, set at a slight angle. */}
              <Flex
                as="button"
                align="center"
                justify="center"
                width="26px"
                height="26px"
                flexShrink={0}
                borderRadius="l1"
                borderWidth="1px"
                borderColor={isDone ? 'status.auto' : 'border.emphasized'}
                color="status.auto"
                fontSize="26px"
                cursor="pointer"
                transition="border-color 0.2s"
                _hover={{ borderColor: isDone ? 'status.auto' : 'fg.subtle' }}
                title={isDone ? 'Mark as not done' : 'Mark as done'}
                aria-label={isDone ? `${c.title}: done` : `${c.title}: not done`}
                aria-pressed={isDone}
                onClick={() => toggleDone(c.id)}
              >
                {isDone ? (
                  // Drawn a little over the box's edge, as a pen tick would be.
                  <Box transform="rotate(-8deg) translate(3px, -4px)">
                    <LuCheck strokeWidth={3} />
                  </Box>
                ) : null}
              </Flex>
            </Flex>
          );
        })}
      </Stack>
    </Box>
  );
};
