import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { LuRotateCcw } from 'react-icons/lu';
import { Stamp } from '@/components/kit';
import { Policy, PolicyVersion } from '@/api/gateway';
import { shortDate } from './visuals';

const COLS = '44px 104px 1fr 156px';

/**
 * Every signed version of the policy, newest first — a ledger: caps heads over an ink rule, dotted
 * rows. Read-only; an earlier version can be restored (its rules applied again as a new version, signed by you).
 */
export const Versions = ({
  policy: p,
  inEffect,
  restoring,
  onRestore,
}: {
  policy: Policy;
  /** The version in effect: it can't be restored onto itself. */
  inEffect: number;
  restoring: boolean;
  onRestore: (v: PolicyVersion) => void;
}) => {
  // A draft row only exists for the moment a change is being signed.
  const versions = (p.versions ?? []).filter((v) => v.status !== 'draft');
  if (!versions.length)
    return (
      <Text fontSize="13.5px" color="fg.subtle">
        No versions yet.
      </Text>
    );
  return (
    <Box>
      <Grid
        templateColumns={COLS}
        gap={4}
        paddingBottom={2}
        borderBottomWidth="1px"
        borderColor="border.strong"
        textStyle="caps"
        color="fg.subtle"
      >
        <Text>Ver.</Text>
        <Text>Status</Text>
        <Text>What changed</Text>
        <Text textAlign="right">Date</Text>
      </Grid>
      {versions.map((v) => (
        <Grid
          key={v.id}
          templateColumns={COLS}
          gap={4}
          paddingY={3}
          alignItems="start"
          borderBottomWidth="1px"
          borderColor="border"
          fontSize="13px"
        >
          <Text fontSize="13px" fontWeight="600" className="tnum" paddingTop="1px">
            v{v.version}
          </Text>
          <Flex direction="column" align="start" gap={1}>
            {v.status === 'signed' ? (
              <Stamp tone="auto">Signed</Stamp>
            ) : (
              <Stamp tone="idle">Superseded</Stamp>
            )}
            {v.signature?.valid === false ? <Stamp tone="blocked">Tampered</Stamp> : null}
          </Flex>
          <Box minWidth={0}>
            <Text color="fg" lineHeight="1.5">
              {v.summary ?? (v.rules.length ? `${v.rules.length} rules` : 'No rules drafted yet')}
            </Text>
            {v.signature ? (
              <Text color="fg.subtle" fontSize="12.5px" marginTop={0.5}>
                Signed by{' '}
                <Text as="span" fontSize="13.5px" color="fg.muted">
                  {v.signature.signedBy}
                </Text>
                , {v.signature.role} ·{' '}
                <Text as="span" fontFamily="mono" fontSize="11.5px">
                  {v.signature.short ?? v.signature.value.slice(0, 20)}
                </Text>
              </Text>
            ) : null}
            {v.version !== inEffect && v.rules.length ? (
              <Button
                size="2xs"
                variant="plain"
                height="auto"
                minWidth={0}
                padding={0}
                marginTop={1}
                fontSize="12.5px"
                color="fg.muted"
                textDecoration="underline"
                _hover={{ color: 'fg' }}
                disabled={restoring}
                onClick={() => onRestore(v)}
              >
                <LuRotateCcw /> Restore this version
              </Button>
            ) : null}
          </Box>
          <Text
            fontFamily="mono"
            fontSize="11.5px"
            color="fg.subtle"
            textAlign="right"
            className="tnum"
            paddingTop="2px"
            whiteSpace="nowrap"
          >
            {shortDate(v.signature?.signedAt ?? v.updatedAt)}
          </Text>
        </Grid>
      ))}
    </Box>
  );
};
