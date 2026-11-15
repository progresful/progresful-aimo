// The top of the order page, one readout module in three columns: 01 the request as one
// sentence (click to change it), a status sentence and the one key; 02 the verdict as a
// dot-matrix word; 03 the products as a spec table, the total and the delivery date.
import { Box, Button, Flex, FlexProps, Input, NativeSelect, Popover, Portal, Spinner, Stack, Text, Textarea } from '@chakra-ui/react';
import { ReactNode, useRef, useState } from 'react';
import { LuCalendar, LuPlus, LuX } from 'react-icons/lu';
import type { OrderDetail, OrderLine, Product, Unit } from '@/api/gateway';
import { Caption, Corners, Dot, Readout, Stamp, Tone, toneColor } from '@/components/kit';
import { ProductSearch } from '@/pages/home/AutomationDialog';
import { shortName, unitFor } from '@/pages/home/format';
import { eur, fmtDay, num } from '@/pages/playbook/graph';
import type { Said } from './model';
import { BuilderLine, newKey } from './request';

type TopProps = {
  /** A mono line over the sentence: "Order · draft", the order number and time. */
  folio: ReactNode;
  sentence: string;
  /** Re-read the words (or, on a placed order, start a new one from them). */
  onSentence: (text: string) => void;
  said: Said | null;
  /** "Checking…" in place of the status sentence. */
  busy?: string | null;
  /** A second, quieter line under the status (unsaved rule changes would change it). */
  aside?: ReactNode;
  /** A small link at the end of the status sentence. */
  link?: ReactNode;
  actions: ReactNode;
  /** The verdict readout: one word, lit in its status colour. */
  verdict?: { tone: Tone; label: string } | null;
  /** The spec table: products, total, delivery date. */
  children?: ReactNode;
};

// What each verdict word means, engraved under it.
const hints: Record<string, string> = {
  Clear: 'Inside the rules',
  Hold: 'A person approves',
  Blocked: 'A hard rule says no',
  Check: 'Checking',
  Running: 'Signal on the board',
  Standby: 'Waiting for input',
  Error: 'Couldn’t check',
  Ordered: 'Sent to Valio Aimo',
  Approved: 'Approved · ordered',
  'Part ordered': 'In-stock part only',
  Declined: 'Not ordered',
  Expired: 'Nobody answered',
};

/** A column of the readout module: an engraved caption over its contents, a hairline between columns. */
const Cell = ({ n, label, right, children, ...props }: { n: string; label: string; right?: ReactNode; children: ReactNode } & FlexProps) => (
  <Flex direction="column" paddingX={6} paddingTop={4} paddingBottom={5} minWidth={0} {...props}>
    <Flex align="center" gap={3} marginBottom={3} minHeight="16px">
      <Caption n={n}>{label}</Caption>
      <Box flex={1} />
      {right}
    </Flex>
    {children}
  </Flex>
);

export const OrderTop = ({ folio, sentence, onSentence, said, busy, aside, link, actions, verdict, children }: TopProps) => (
  <Box paddingX={5} paddingTop={4} paddingBottom={4} bg="bg" borderBottomWidth="1px" borderColor="border" flexShrink={0}>
    <Flex position="relative" align="stretch" borderWidth="1px" borderColor="border.strong" borderRadius="l3" bg="bg.panel">
      <Corners />
      <Cell
        n="01"
        label="Request"
        right={
          <Text textStyle="label" color="fg.subtle" truncate>
            {folio}
          </Text>
        }
        flex={1}
      >
        <Sentence text={sentence} onSubmit={onSentence} />
        <Flex align="center" gap={2.5} marginTop={3} minHeight="24px">
          {busy ? (
            <>
              <Spinner size="xs" color="brand.accent" />
              <Text fontSize="14.5px" color="fg.muted">
                {busy}
              </Text>
            </>
          ) : said ? (
            <>
              <Dot tone={said.tone} size={8} steady />
              <Text fontSize="14.5px" color="fg" lineClamp={2} className="tnum">
                {said.text}
              </Text>
            </>
          ) : null}
          {link}
        </Flex>
        {aside}
        <Box flex={1} minHeight={4} />
        <Flex gap={2.5} align="center" wrap="wrap" paddingBottom="2px">
          {actions}
        </Flex>
      </Cell>
      {verdict ? (
        <Cell n="02" label="Verdict" width={{ base: '210px', xl: '250px' }} flexShrink={0} borderLeftWidth="1px" borderColor="border">
          <Flex direction="column" justify="center" flex={1} gap={3}>
            <Readout
              key={verdict.label}
              size={Math.min(46, Math.floor(160 / (verdict.label.length * 0.62)))}
              color={verdict.tone === 'idle' ? 'fg.subtle' : toneColor[verdict.tone]}
              css={{ animation: 'readout-on 0.35s var(--chakra-easings-out) both' }}
            >
              {verdict.label}
            </Readout>
            {hints[verdict.label] ? (
              <Flex align="center" gap={2} textStyle="label" color="fg.muted">
                <Dot tone={verdict.tone} size={7} steady={verdict.tone !== 'pending'} />
                {hints[verdict.label]}
              </Flex>
            ) : null}
          </Flex>
        </Cell>
      ) : null}
      {children ? (
        <Cell n={verdict ? '03' : '02'} label="Lines" width={{ base: '400px', xl: '460px' }} flexShrink={0} borderLeftWidth="1px" borderColor="border">
          {children}
        </Cell>
      ) : null}
    </Flex>
  </Box>
);

/** The request in the person's words, large; click to change them, Enter to read them again. */
const Sentence = ({ text, onSubmit }: { text: string; onSubmit: (t: string) => void }) => {
  const [editing, setEditing] = useState(!text.trim());
  const [value, setValue] = useState(text);
  const submit = () => {
    const t = value.trim();
    if (!t) return;
    setEditing(false);
    if (t !== text.trim()) onSubmit(t);
  };
  const type = { fontSize: { base: '28px', xl: '32px' }, fontWeight: '500', letterSpacing: '-0.035em', lineHeight: '1.12' } as const;
  if (!editing)
    return (
      <Text
        as="button"
        textAlign="left"
        {...type}
        cursor="text"
        maxWidth="900px"
        lineClamp={2}
        textDecoration="underline"
        textDecorationColor="transparent"
        textDecorationThickness="1px"
        textUnderlineOffset="6px"
        transition="text-decoration-color 0.2s"
        _hover={{ textDecorationColor: 'brand.accent' }}
        title="Click to change"
        onClick={() => {
          setValue(text);
          setEditing(true);
        }}
      >
        {text}
      </Text>
    );
  return (
    <Textarea
      value={value}
      autoFocus
      rows={1}
      autoresize
      placeholder="What do you need? e.g. 1,000 l lactose-free milk for Monday"
      {...type}
      paddingX={0}
      paddingY={1}
      minHeight="0"
      maxWidth="900px"
      borderRadius={0}
      borderWidth={0}
      borderBottomWidth="1px"
      borderColor="brand.accent"
      bg="transparent"
      _placeholder={{ color: 'fg.subtle' }}
      _focusVisible={{ borderColor: 'brand.accent', boxShadow: '0 1px 0 0 var(--chakra-colors-brand-accent)', outline: 'none' }}
      resize="none"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => (text.trim() ? setEditing(false) : undefined)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape' && text.trim()) setEditing(false);
      }}
    />
  );
};

// --- Products --------------------------------------------------------------------------

/** One receipt line: the name (wrapping to two lines, its note under it), then quantity and price. */
const Row = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Flex
    align="baseline"
    gap={3}
    paddingY={2.5}
    fontSize="13.5px"
    color={muted ? 'fg.subtle' : 'fg'}
    borderBottomWidth="1px"
    borderColor="border.muted"
  >
    {children}
  </Flex>
);

/** The name and, under it, a quiet note ("check", "substitute"). */
const Name = ({ children, note }: { children: ReactNode; note?: ReactNode }) => (
  <Box flex={1} minWidth={0}>
    {children}
    {note ? (
      <Flex gap={3} marginTop={1}>
        {note}
      </Flex>
    ) : null}
  </Box>
);

const Qty = ({ children }: { children: ReactNode }) => (
  <Text width="72px" textAlign="right" color="fg.muted" flexShrink={0} fontFamily="mono" fontSize="12px" whiteSpace="nowrap">
    {children}
  </Text>
);

const Price = ({ children }: { children: ReactNode }) => (
  <Text width="84px" textAlign="right" flexShrink={0} fontFamily="mono" fontSize="12.5px" fontWeight="500" whiteSpace="nowrap">
    {children}
  </Text>
);

/** The total as a dot-matrix readout under a dark hairline, and the delivery date. */
const Foot = ({ total, children }: { total: number | null; children?: ReactNode }) => (
  <Box marginTop={2} paddingTop={3} borderTopWidth="1px" borderColor="border.strong">
    <Flex align="center" gap={3}>
      <Flex flex={1} align="center" gap={2} fontSize="13px" color="fg.muted" minHeight="28px">
        {children}
      </Flex>
      <Text textStyle="label" color="fg.subtle">
        Total
      </Text>
      <Readout size={26} letterSpacing="0">
        {total != null ? eur(total) : '—'}
      </Readout>
    </Flex>
  </Box>
);

const Tag = ({ tone, children }: { tone: 'pending' | 'blocked' | 'idle'; children: ReactNode }) => (
  <Stamp tone={tone}>{children}</Stamp>
);

/**
 * Before placing: what we understood, one row per product (an unsure match says "check"
 * — click a name to swap it, change the amount or remove it), and the delivery date.
 */
export const ProductRows = ({
  lines,
  onLines,
  prices,
  stopped,
  date,
  onDate,
  loading,
}: {
  lines: BuilderLine[];
  onLines: (fn: (ls: BuilderLine[]) => BuilderLine[]) => void;
  /** From the dry run, once in: the line's price. */
  prices: OrderLine[];
  /** Products a rule keeps out. */
  stopped: string[];
  date: string;
  onDate: (d: string) => void;
  loading: boolean;
}) => {
  const update = (key: string, patch: Partial<BuilderLine>) => onLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (p: Product) =>
    onLines((ls) => [
      ...ls,
      {
        key: newKey(),
        code: p.code,
        name: p.name,
        quantity: unitFor(p) === 'pcs' ? 10 : 100,
        unit: unitFor(p),
        salesUnit: p.salesUnit.unit,
        options: [],
      },
    ]);
  if (loading)
    return (
      <Text fontFamily="mono" fontSize="12.5px" color="fg.subtle" paddingY={3}>
        Reading it…
      </Text>
    );
  const priced = lines.map((l) => [
    prices.find((x) => x.code === l.code && x.role === 'requested'),
    prices.find((x) => x.role === 'substitute' && x.substituteFor === l.code),
  ]);
  const total = prices.length ? priced.reduce((a, [p, sub]) => a + (sub?.total ?? p?.total ?? 0), 0) : null;
  return (
    <Box>
      <Box maxHeight="184px" overflowY="auto" marginRight={-2} paddingRight={2} marginTop={-2}>
        {lines.map((l, i) => {
          const [price, sub] = priced[i];
          return (
            <Box key={l.key}>
              <Row>
                <Name
                  note={
                    l.unsure || stopped.includes(l.code) ? (
                      <>
                        {l.unsure ? <Tag tone="pending">Check the match</Tag> : null}
                        {stopped.includes(l.code) ? <Tag tone="blocked">Not allowed</Tag> : null}
                      </>
                    ) : null
                  }
                >
                  <LinePopover
                    line={l}
                    exclude={lines.map((x) => x.code)}
                    onChange={(p) => update(l.key, p)}
                    onRemove={() => onLines((ls) => ls.filter((x) => x.key !== l.key))}
                  />
                </Name>
                <Qty>
                  {num(l.quantity)} {l.unit}
                </Qty>
                <Price>{price ? eur(price.total) : '—'}</Price>
              </Row>
              {sub ? (
                <Row muted>
                  <Name>
                    <Text minWidth={0} lineClamp={2} paddingLeft={3}>
                      ↳ {shortName(sub.name)} instead
                    </Text>
                  </Name>
                  <Qty>
                    {num(sub.quantity)} {sub.unit}
                  </Qty>
                  <Price>{eur(sub.total)}</Price>
                </Row>
              ) : null}
            </Box>
          );
        })}
      </Box>
      <AddProduct onPick={add} exclude={lines.map((l) => l.code)} />
      <DateControl date={date} onDate={onDate} />
      <Foot total={total} />
    </Box>
  );
};

/** A product's name; click → swap it, change the amount, or remove it. */
const LinePopover = ({
  line,
  exclude,
  onChange,
  onRemove,
}: {
  line: BuilderLine;
  exclude: string[];
  onChange: (p: Partial<BuilderLine>) => void;
  onRemove: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const others = line.options.filter((o) => o.code !== line.code);
  const pick = (patch: Partial<BuilderLine>) => {
    onChange({ unsure: false, ...patch });
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} positioning={{ placement: 'bottom-start' }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <Text
          as="button"
          minWidth={0}
          textAlign="left"
          lineClamp={2}
          cursor="pointer"
          _hover={{ color: 'brand.fg', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          title="Swap, change the amount or remove"
        >
          {shortName(line.name)}
        </Text>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="380px" borderRadius="l3">
            <Popover.Body padding={4}>
              <Stack gap={3}>
                <Flex align="center" gap={2}>
                  <Input
                    size="sm"
                    type="number"
                    min={0}
                    width="90px"
                    borderRadius="l2"
                    textAlign="right"
                    aria-label="Quantity"
                    value={Number.isFinite(line.quantity) ? line.quantity : ''}
                    onChange={(e) => onChange({ quantity: Number(e.target.value) })}
                  />
                  <NativeSelect.Root size="sm" width="70px">
                    <NativeSelect.Field
                      value={line.unit}
                      borderRadius="l2"
                      aria-label="Unit"
                      onChange={(e) => onChange({ unit: e.target.value as Unit })}
                    >
                      <option value="l">l</option>
                      <option value="kg">kg</option>
                      <option value="pcs">pcs</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Box flex={1} />
                  <Button size="xs" variant="ghost" color="fg.muted" onClick={onRemove}>
                    <LuX /> Remove
                  </Button>
                </Flex>
                {others.length ? (
                  <Stack gap={0.5}>
                    <Text fontSize="12px" color="fg.subtle">
                      Or did you mean
                    </Text>
                    {others.slice(0, 4).map((o) => (
                      <Text
                        as="button"
                        key={o.code}
                        textAlign="left"
                        fontSize="13px"
                        paddingY={1}
                        cursor="pointer"
                        _hover={{ color: 'brand.fg' }}
                        onClick={() => pick({ code: o.code, name: o.name })}
                      >
                        {shortName(o.name)}
                      </Text>
                    ))}
                  </Stack>
                ) : null}
                <ProductSearch
                  onPick={(p) => pick({ code: p.code, name: p.name, salesUnit: p.salesUnit.unit, unit: unitFor(p) })}
                  exclude={exclude}
                  placeholder="Search another product"
                />
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

const AddProduct = ({ onPick, exclude }: { onPick: (p: Product) => void; exclude: string[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} positioning={{ placement: 'bottom-start' }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <Button size="xs" variant="ghost" color="brand.fg" marginLeft={-2} marginTop={1}>
          <LuPlus /> Add a product
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="380px" borderRadius="l3">
            <Popover.Body padding={3}>
              <ProductSearch
                onPick={(p) => {
                  onPick(p);
                  setOpen(false);
                }}
                exclude={exclude}
                placeholder="Search the Valio catalog"
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next `n` weekdays from tomorrow, as YYYY-MM-DD. */
const nextWeekdays = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(isoOf(d));
  }
  return out;
};

/** The delivery day, picked in one click: the next five weekdays as keys, or any other date from the calendar. */
const DateControl = ({ date, onDate }: { date: string; onDate: (d: string) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  const days = nextWeekdays(5);
  const other = !!date && !days.includes(date);
  const key = (on: boolean) => ({
    size: 'xs' as const,
    height: '30px',
    paddingX: 2.5,
    fontSize: '12.5px',
    variant: on ? ('solid' as const) : ('outline' as const),
    bg: on ? 'brand.solid' : undefined,
    color: on ? 'brand.contrast' : 'fg',
    borderColor: on ? 'brand.solid' : 'border.strong',
  });
  return (
    <Box marginTop={3} paddingTop={3} borderTopWidth="1px" borderColor="border">
      <Flex align="baseline" justify="space-between" marginBottom={2}>
        <Text textStyle="label" color={date ? 'fg.subtle' : 'status.pending'}>
          {date ? 'Delivery day' : 'Pick a delivery day'}
        </Text>
        {date ? (
          <Text fontSize="12.5px" fontWeight="600">
            {fmtDay(date)}
          </Text>
        ) : null}
      </Flex>
      <Flex gap={1.5} wrap="wrap" position="relative">
        {days.map((d) => (
          <Button key={d} {...key(d === date)} onClick={() => onDate(d)} aria-pressed={d === date}>
            {fmtDay(d)}
          </Button>
        ))}
        <Button {...key(other)} onClick={() => input.current?.showPicker?.()} aria-pressed={other}>
          <LuCalendar /> {other ? fmtDay(date) : 'Other'}
        </Button>
        <input
          ref={input}
          type="date"
          value={date}
          min={days[0]}
          onChange={(e) => e.target.value && onDate(e.target.value)}
          aria-label="Delivery date"
          style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      </Flex>
    </Box>
  );
};

/** After placing: what was ordered (or proposed, or not), the price, and the delivery date. */
export const OrderedRows = ({ detail }: { detail: OrderDetail }) => {
  const { order } = detail;
  const shown = order.status === 'pending_approval' ? (detail.approval?.proposal?.lines ?? order.lines) : order.lines;
  const word: Partial<Record<OrderLine['status'], string>> = { not_ordered: 'Not ordered', blocked: 'Not allowed', open: 'Open' };
  const total = order.status === 'pending_approval' ? (detail.approval?.proposal?.total ?? order.total) : order.committedTotal || order.total;
  return (
    <Box>
      <Box maxHeight="184px" overflowY="auto" marginRight={-2} paddingRight={2} marginTop={-2}>
        {shown.map((l) => (
          <Row key={`${l.code}-${l.role}`} muted={l.status === 'not_ordered' || l.status === 'blocked'}>
            <Name
              note={
                l.role === 'substitute' || word[l.status] ? (
                  <>
                    {l.role === 'substitute' ? <Tag tone="idle">Substitute</Tag> : null}
                    {word[l.status] ? <Tag tone={l.status === 'blocked' ? 'blocked' : 'idle'}>{word[l.status]}</Tag> : null}
                  </>
                ) : null
              }
            >
              <Text minWidth={0} lineClamp={2}>
                {shortName(l.name)}
              </Text>
            </Name>
            <Qty>
              {num(l.quantity)} {l.unit}
            </Qty>
            <Price>{eur(l.total)}</Price>
          </Row>
        ))}
        {order.open.map((l) => (
          <Row key={`open-${l.code}`} muted>
            <Name note={<Tag tone="idle">Not ordered</Tag>}>
              <Text minWidth={0} lineClamp={2}>
                {shortName(l.name)}
              </Text>
            </Name>
            <Qty>
              {num(l.quantity)} {l.unit}
            </Qty>
            <Price>—</Price>
          </Row>
        ))}
      </Box>
      <Foot total={total}>
        <Text textStyle="label" color="fg.subtle">
          Delivery
        </Text>
        <Text fontFamily="mono" fontSize="12.5px" fontWeight="500" color="fg">
          {fmtDay(order.deliveryDate)}
        </Text>
      </Foot>
    </Box>
  );
};
