import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';
import { Caption } from '@/components/kit';

// Home's logs ("Waiting for you", "Recent orders"): a module with an engraved caption bar,
// compact hairline rows, mono figures right-aligned — a device's event log, not an app list.
// No column heads: the content says what it is.

/** A log module: the caption bar ("02 LOG · Recent orders") and the rows under it. */
export const Ledger = ({ n, title, action, children }: { n: string; title: ReactNode; action?: ReactNode; children: ReactNode }) => (
  <Box borderWidth="1px" borderColor="border.strong" borderRadius="l3" bg="bg.panel" overflow="hidden">
    <Flex align="center" justify="space-between" gap={3} height="38px" paddingX={4} borderBottomWidth="1px" borderColor="border.strong">
      <Caption n={n}>{title}</Caption>
      {action}
    </Flex>
    <Box css={{ '& > a:last-of-type > div': { borderBottomWidth: 0 } }}>{children}</Box>
  </Box>
);

/** One log row, linked to its order; the arrow lights up on hover. */
export const LedgerRow = ({ to, columns, children }: { to: string; columns: string; children: ReactNode }) => (
  <Link to={to}>
    <Grid
      templateColumns={columns}
      columnGap={4}
      alignItems="center"
      minHeight="46px"
      paddingX={4}
      paddingY={2}
      borderBottomWidth="1px"
      borderColor="border"
      transition="background 0.15s"
      _hover={{ bg: 'bg.hover', '& .go': { color: 'brand.fg', transform: 'translateX(2px)' } }}
    >
      {children}
      <Box className="go" color="fg.subtle" fontSize="14px" transition="color 0.15s, transform 0.15s">
        <LuArrowRight />
      </Box>
    </Grid>
  </Link>
);

/** A quiet "All orders →" link, engraved. */
export const InkLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to}>
    <Flex align="center" gap={1} textStyle="label" color="fg.muted" _hover={{ color: 'brand.fg' }}>
      {children} <LuArrowRight />
    </Flex>
  </Link>
);

/** A mono figure. */
export const Fig = ({ children, color = 'fg', align = 'left' }: { children: ReactNode; color?: string; align?: 'left' | 'right' }) => (
  <Text fontFamily="mono" fontSize="12px" color={color} textAlign={align} whiteSpace="nowrap">
    {children}
  </Text>
);
