import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { PolicyRule } from '@/api/gateway';
import { RuleNo, Stamp } from '@/components/kit';
import { describeRule, fadeUp, pulse, ruleChanged, ruleSentence } from './visuals';

/** A clause's words; a hard rule says "always enforced" with its stamp instead of in the sentence. */
const clauseWords = (r: PolicyRule) => {
  const hard = !!describeRule(r).never;
  return { hard, words: hard ? ruleSentence(r).replace(/ — always enforced$/, '') : ruleSentence(r) };
};

/** Pencilled-in marks for the latest change: dashed, ochre (or vermilion for a removal). */
const Pencil = ({ children, tone = 'status.pending' }: { children: ReactNode; tone?: string }) => (
  <Text
    as="span"
    display="inline-block"
    fontSize="10.5px"
    fontWeight="600"
    color={tone}
    borderWidth="1px"
    borderStyle="dashed"
    borderColor={tone}
    borderRadius="l1"
    paddingX={1}
    lineHeight="15px"
    textDecoration="none"
    verticalAlign="2px"
    marginLeft={2}
  >
    {children}
  </Text>
);

const Row = ({ n, children, aside, anim }: { n: ReactNode; children: ReactNode; aside?: ReactNode; anim?: object }) => (
  <Flex
    as="li"
    gap={4}
    paddingY={3.5}
    align="start"
    borderBottomWidth="1px"
    borderColor="border"
    css={anim}
  >
    <Box width="40px" flexShrink={0} paddingTop="1px">
      {n}
    </Box>
    <Box flex={1} minWidth={0}>
      {children}
    </Box>
    {aside ? (
      <Box flexShrink={0} paddingTop="2px">
        {aside}
      </Box>
    ) : null}
  </Flex>
);

/** The rules as the mandate's numbered clauses. With `previous`, changed and new clauses are pencilled in and the old wording shown. */
export const RulesList = ({
  rules,
  previous,
  drafting,
  animate,
}: {
  rules: PolicyRule[];
  previous: PolicyRule[] | null;
  drafting: boolean;
  animate: boolean;
}) => {
  if (drafting) return <DraftingSkeleton />;
  if (!rules.length)
    return (
      <Text fontSize="13.5px" color="fg.subtle" paddingY={4}>
        No rules yet. Edit the policy text, then draft the rules — you review every rule before anything is signed.
      </Text>
    );
  const removed = previous ? previous.filter((p) => !rules.some((r) => r.key === p.key)) : [];
  return (
    <Stack gap={0} as="ol" listStyleType="none" borderTopWidth="1px" borderColor="border.strong">
      {rules.map((r, i) => {
        const before = previous ? (previous.find((p) => p.key === r.key) ?? null) : undefined;
        const changed = before !== undefined && ruleChanged(r, before);
        const { hard, words } = clauseWords(r);
        return (
          <Row
            key={r.key}
            n={<RuleNo n={i + 1} color={changed ? 'status.pending' : 'fg.subtle'} />}
            aside={hard ? <Stamp tone="blocked">Hard</Stamp> : null}
            anim={animate ? { animation: `${fadeUp} 0.42s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 90}ms` } : undefined}
          >
            <Text fontSize="15.5px" lineHeight="1.6" color="fg">
              {words}
              {changed ? <Pencil>{before ? 'Changed' : 'New'}</Pencil> : null}
            </Text>
            {changed && before ? (
              <Text fontSize="13px" color="fg.subtle" textDecoration="line-through" marginTop={0.5}>
                {ruleSentence(before)}
              </Text>
            ) : null}
          </Row>
        );
      })}
      {removed.map((r) => (
        <Row key={r.key} n={<RuleNo n="–" color="status.blocked" />}>
          <Text fontSize="14px" lineHeight="1.6" color="fg.subtle">
            <Text as="span" textDecoration="line-through">
              {ruleSentence(r)}
            </Text>
            <Pencil tone="status.blocked">Removed</Pencil>
          </Text>
        </Row>
      ))}
    </Stack>
  );
};

const DraftingSkeleton = () => (
  <Stack gap={0} borderTopWidth="1px" borderColor="border.strong">
    <Text
      fontFamily="mono"
      fontSize="12.5px"
      color="fg.muted"
      paddingY={3}
      css={{ animation: `${pulse} 1.2s ease-in-out infinite` }}
    >
      Reading the text and drafting the rules…
    </Text>
    {[0, 1, 2, 3, 4].map((i) => (
      <Flex
        key={i}
        gap={4}
        paddingY={4}
        borderBottomWidth="1px"
        borderColor="border"
        opacity={1 - i * 0.15}
      >
        <RuleNo n={i + 1} color="border.emphasized" />
        <Box
          width={`${55 + ((i * 17) % 35)}%`}
          height="12px"
          marginTop="6px"
          borderRadius="l1"
          css={{ background: 'var(--chakra-colors-bg-tag)', animation: `${pulse} 1.3s ease-in-out infinite` }}
        />
      </Flex>
    ))}
  </Stack>
);
