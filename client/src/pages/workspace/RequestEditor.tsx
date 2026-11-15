import { Box, Button, Flex, IconButton, Input, NativeSelect, Stack, Switch, Text, Textarea } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuBot, LuX } from 'react-icons/lu';
import type { Agent, ParsedRequest, Product, Unit } from '@/api/gateway';
import { ProductSearch } from '@/pages/home/AutomationDialog';
import { shortName, unitFor } from '@/pages/home/format';
import { fmtDay } from '@/pages/playbook/graph';
import { StatusText } from '@/pages/playbook/quiet';
import { BuilderLine, newKey } from './request';
import { unitWord } from '@/pages/catalog/format';

type Props = {
  text: string;
  onText: (t: string) => void;
  onParse: () => void;
  parsing: boolean;
  parseError: string | null;
  parsed: ParsedRequest | null;
  lines: BuilderLine[];
  onLines: (fn: (ls: BuilderLine[]) => BuilderLine[]) => void;
  date: string;
  onDate: (d: string) => void;
  /** Valio can't deliver on `date`; this is the earliest day it can. */
  suggestedDate: string | null;
  agents: Agent[];
  agentId: string | null;
  onAgent: (id: string) => void;
  allowSubstitutes: boolean;
  onAllowSubstitutes: (on: boolean) => void;
  source?: string;
  /** Hide the free-text box (e.g. when reused to edit a sample order in the playbook test). */
  hideDescribe?: boolean;
  /** Panel heading; defaults to "Order request". */
  title?: string;
};

/** The request step, editable: this is how an order is created and changed. */
export const RequestEditor = (props: Props) => {
  const {
    text,
    onText,
    onParse,
    parsing,
    parseError,
    parsed,
    lines,
    onLines,
    date,
    onDate,
    suggestedDate,
    agents,
    agentId,
    onAgent,
    allowSubstitutes,
    onAllowSubstitutes,
    source,
    hideDescribe,
    title,
  } = props;
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

  return (
    <Stack gap={6} padding={5}>
      <Flex align="start" gap={3}>
        <Box color="fg.muted" fontSize="18px" marginTop="2px">
          <LuBot />
        </Box>
        <Box flex={1} minWidth={0}>
          <Text fontWeight="600" fontSize="15px">
            {title ?? 'Order request'}
          </Text>
          <Text fontSize="12.5px" color="fg.subtle" marginTop={0.5}>
            {source ?? 'Change anything — the graph shows what the gateway would do.'}
          </Text>
        </Box>
      </Flex>

      {hideDescribe ? null : (
        <Field label="Describe it">
          <Box
            borderWidth="1px"
            borderColor="border.emphasized"
            borderRadius="l3"
            padding={1.5}
            transition="border-color 0.15s, box-shadow 0.15s"
            _focusWithin={{ borderColor: 'brand.accent', boxShadow: '0 0 0 3px var(--chakra-colors-brand-subtle)' }}
          >
            <Textarea
              value={text}
              onChange={(e) => onText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) onParse();
                }
              }}
              placeholder="e.g. 1,000 l lactose-free milk for Monday"
              rows={2}
              resize="none"
              border="none"
              outline="none"
              _focusVisible={{ outline: 'none', boxShadow: 'none' }}
              fontSize="13.5px"
              paddingX={1.5}
              paddingY={1}
              bg="transparent"
            />
            <Flex justify="space-between" align="center" paddingLeft={1.5}>
              <Text fontSize="11.5px" color="fg.subtle">
                {parsed ? `Read by ${parsed.parser === 'gemini' ? 'Gemini' : 'the rule parser'}` : 'Fills in the lines below'}
              </Text>
              <Button
                size="xs"
                variant="outline"
                borderRadius="l2"
                disabled={!text.trim()}
                loading={parsing}
                loadingText="Reading…"
                onClick={onParse}
              >
                Parse
              </Button>
            </Flex>
          </Box>
          {parseError ? (
            <Text fontSize="12.5px" color="status.blocked" marginTop={1.5}>
              Couldn’t read that — {parseError}
            </Text>
          ) : null}
          {parsed?.unmatched.length || parsed?.notes.length ? (
            <Stack gap={1} marginTop={2}>
              {parsed.unmatched.map((u) => (
                <StatusText key={u} tone="pending" size="12.5px">
                  Didn’t match “{u}” to a product
                </StatusText>
              ))}
              {parsed.notes.map((n) => (
                <Text key={n} fontSize="12.5px" color="fg.subtle">
                  {n}
                </Text>
              ))}
            </Stack>
          ) : null}
        </Field>
      )}

      <Field label="Products">
        {lines.length ? (
          <Box borderTopWidth="1px" borderColor="border.muted" marginBottom={2}>
            {lines.map((l) => (
              <LineRow
                key={l.key}
                line={l}
                onChange={(p) => update(l.key, p)}
                onRemove={() => onLines((ls) => ls.filter((x) => x.key !== l.key))}
              />
            ))}
          </Box>
        ) : (
          <Text fontSize="12.5px" color="fg.subtle" marginBottom={2}>
            No products yet. Describe the order above, or add products from the catalog.
          </Text>
        )}
        <ProductSearch onPick={add} exclude={lines.map((l) => l.code)} placeholder="Add a product" />
      </Field>

      <Field label="Delivery date" hint={parsed?.dateText ? `from “${parsed.dateText}”` : undefined}>
        <Input
          type="date"
          size="sm"
          width="180px"
          borderRadius="l2"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          fontSize="13px"
        />
        {!date ? (
          <Text fontSize="12px" color="fg.subtle" marginTop={1.5}>
            Pick a date to see what would happen.
          </Text>
        ) : suggestedDate && suggestedDate !== date ? (
          <Flex align="center" gap={2} marginTop={2} fontSize="12.5px">
            <StatusText tone="blocked" size="12.5px">
              Valio can’t deliver on {fmtDay(date)}
            </StatusText>
            <Button size="2xs" variant="outline" onClick={() => onDate(suggestedDate)}>
              Use {fmtDay(suggestedDate)}
            </Button>
          </Flex>
        ) : null}
      </Field>

      <Flex gap={5} align="end" flexWrap="wrap">
        <Field label="Placed by">
          <NativeSelect.Root size="sm" width="200px" disabled={!agents.length}>
            <NativeSelect.Field value={agentId ?? ''} onChange={(e) => onAgent(e.target.value)} borderRadius="l2" fontSize="13px">
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field>
        <Switch.Root
          size="sm"
          checked={allowSubstitutes}
          onCheckedChange={(e) => onAllowSubstitutes(e.checked)}
          height="32px"
          alignItems="center"
        >
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label fontSize="12.5px" color="fg.muted" fontWeight="500">
            Allow substitutes
          </Switch.Label>
        </Switch.Root>
      </Flex>
    </Stack>
  );
};

const LineRow = ({
  line,
  onChange,
  onRemove,
}: {
  line: BuilderLine;
  onChange: (p: Partial<BuilderLine>) => void;
  onRemove: () => void;
}) => (
  <Box paddingY={2.5} borderBottomWidth="1px" borderColor="border.muted">
    <Flex align="start" gap={2}>
      <Box flex={1} minWidth={0}>
        {line.options.length > 1 ? (
          <NativeSelect.Root size="xs">
            <NativeSelect.Field
              value={line.code}
              onChange={(e) =>
                onChange({
                  code: e.target.value,
                  name: line.options.find((o) => o.code === e.target.value)?.name ?? line.name,
                  unsure: false,
                })
              }
              borderRadius="l2"
              fontSize="13px"
              fontWeight="500"
              borderColor="transparent"
              paddingLeft={1.5}
              marginLeft={-1.5}
              _hover={{ borderColor: 'border' }}
              title={line.name}
            >
              {line.options.map((o) => (
                <option key={o.code} value={o.code}>
                  {shortName(o.name)}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        ) : (
          <Text fontSize="13px" fontWeight="500" lineClamp={2} title={line.code}>
            {shortName(line.name)}
          </Text>
        )}
      </Box>
      <IconButton aria-label="Remove line" size="2xs" variant="ghost" color="fg.subtle" onClick={onRemove}>
        <LuX />
      </IconButton>
    </Flex>
    <Flex align="center" gap={2} marginTop={1.5}>
      <Input
        size="xs"
        type="number"
        min={0}
        width="88px"
        borderRadius="l2"
        fontSize="13px"
        textAlign="right"
        aria-label="Quantity"
        value={Number.isFinite(line.quantity) ? line.quantity : ''}
        onChange={(e) => onChange({ quantity: Number(e.target.value) })}
      />
      <NativeSelect.Root size="xs" width="64px">
        <NativeSelect.Field
          value={line.unit}
          borderRadius="l2"
          fontSize="12.5px"
          aria-label="Unit"
          onChange={(e) => onChange({ unit: e.target.value as Unit })}
        >
          <option value="l">l</option>
          <option value="kg">kg</option>
          <option value="pcs">pcs</option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      {line.unsure ? (
        <StatusText tone="pending" size="11.5px">
          Unsure match — check it
        </StatusText>
      ) : line.salesUnit ? (
        <Text fontSize="11.5px" color="fg.subtle" truncate>
          {unitWord(line.salesUnit)}
        </Text>
      ) : null}
    </Flex>
  </Box>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <Box>
    <Flex gap={1.5} align="baseline" marginBottom={1.5}>
      <Text fontSize="12px" fontWeight="500" color="fg.muted">
        {label}
      </Text>
      {hint ? (
        <Text fontSize="11px" color="fg.subtle">
          {hint}
        </Text>
      ) : null}
    </Flex>
    {children}
  </Box>
);
