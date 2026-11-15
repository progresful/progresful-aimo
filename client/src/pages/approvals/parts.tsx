import { Box, Flex, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import type { ApprovalListItem } from '@/api/gateway';
import { Tone } from '@/components/kit';
import { Decided, LineTag, ViewLine, eur, fmtQty, shortName } from './model';

export const decisionMeta: Record<Decided, { label: string; stamp: string; tone: Tone }> = {
  approved: { label: 'Approved', stamp: 'Approved', tone: 'auto' },
  declined: { label: 'Declined', stamp: 'Declined', tone: 'blocked' },
  partial: { label: 'Only in-stock ordered', stamp: 'Partial', tone: 'pending' },
  timed_out: { label: 'No answer in time', stamp: 'No answer', tone: 'idle' },
};

/** "Approved by Mikko Laine", "Declined by …", "No answer in time — the gateway fell back". */
export const decisionWords = (item: ApprovalListItem) => {
  if (item.status === 'pending') return `Needs ${item.approver.name.split(' ')[0]}’s approval`;
  const m = decisionMeta[item.status];
  if (item.status === 'timed_out') return `${m.label} — the gateway fell back`;
  return `${m.label} by ${item.decidedBy ?? item.approver.name}`;
};

/** Engraved caption with a hairline running out to the right. */
export const Rubric = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <Flex align="center" gap={3} marginBottom={3}>
    <Text textStyle="label" color="fg.subtle" flexShrink={0}>
      {children}
    </Text>
    <Box flex={1} height="1px" bg="border" />
    {action}
  </Flex>
);

const tagWords: Partial<Record<LineTag, string>> = { substitute: 'Substitute', blocked: 'Blocked', 'not-ordered': 'Not ordered' };

/**
 * A spec list: qty · product · mono price, a dark hairline, then the total.
 * `noteOf` adds the small line under an item (a substitute, a shortfall).
 */
export const Receipt = ({
  title,
  lines,
  total,
  totalLabel = 'Total',
  noteOf,
  footer,
}: {
  title: ReactNode;
  lines: ViewLine[];
  total: number | null;
  totalLabel?: string;
  noteOf?: (l: ViewLine) => ReactNode;
  footer?: ReactNode;
}) => (
  <Box minWidth={0}>
    <Rubric>{title}</Rubric>
    {lines.length ? (
      lines.map((l) => {
        const off = l.tag === 'not-ordered' || l.tag === 'blocked';
        const note = noteOf?.(l);
        return (
          <Box key={l.key} paddingY={1.5} color={off ? 'fg.subtle' : undefined}>
            <Flex align="baseline" gap={2} fontSize="13px">
              <Text as="span" fontFamily="mono" fontSize="11.5px" color="fg.muted" width="64px" flexShrink={0} whiteSpace="nowrap">
                {fmtQty(l.qty, l.unit)}
              </Text>
              <Text as="span" minWidth={0} truncate title={l.name}>
                {shortName(l.name)}
              </Text>
              <Box flex={1} minWidth="14px" />
              <Text as="span" fontFamily="mono" fontSize="12px" whiteSpace="nowrap" textDecoration={off ? 'line-through' : undefined}>
                {l.total ? eur(l.total) : '—'}
              </Text>
            </Flex>
            {note ? (
              <Text fontSize="12px" marginTop="2px" paddingLeft="72px" color={l.tag === 'substitute' || l.tag === 'short' ? 'status.pending' : 'fg.subtle'}>
                {note}
              </Text>
            ) : null}
          </Box>
        );
      })
    ) : (
      <Text fontSize="13.5px" color="fg.subtle" paddingY={1.5}>
        Nothing proposed.
      </Text>
    )}
    <Flex align="baseline" justify="space-between" marginTop={2} paddingTop={2} borderTopWidth="1px" borderColor="border.strong">
      <Text textStyle="caps" color="fg.muted">
        {totalLabel}
      </Text>
      <Text fontFamily="mono" fontSize="13px" fontWeight="600">
        {total === null ? '—' : eur(total)}
      </Text>
    </Flex>
    {footer}
  </Box>
);

/** Default under-line note for proposed lines: "Substitute for …", "Not ordered — …". */
export const lineNote = (l: ViewLine, substituteFor?: string) =>
  l.tag === 'substitute' ? `Substitute${substituteFor ? ` for ${substituteFor}` : ''}` : l.tag && tagWords[l.tag] ? `${tagWords[l.tag]}${l.note ? ` — ${l.note}` : ''}` : null;

/**
 * A signature line: the signer's name as a dot-matrix readout over a ruled line, the
 * particulars in caps underneath. `unsigned` draws it as the line still to be signed.
 */
export const SignatureLine = ({ name, caption, unsigned }: { name: string; caption: ReactNode; unsigned?: boolean }) => (
  <Box minWidth={0}>
    <Flex align="end" gap={2} borderBottomWidth="1px" borderColor="border.strong" paddingBottom={1}>
      <Text fontSize="13.5px" color="fg.subtle" lineHeight="1" paddingBottom="3px">
        ×
      </Text>
      <Text fontFamily="dot" fontWeight="800" fontSize="24px" lineHeight="1.1" color={unsigned ? 'fg.subtle' : 'brand.fg'} truncate>
        {name}
      </Text>
    </Flex>
    <Text textStyle="caps" color="fg.subtle" marginTop={1.5} truncate>
      {caption}
    </Text>
  </Box>
);
