import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  IconButton,
  Input,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPlus, LuSearch, LuX } from 'react-icons/lu';
import { useDebounced } from '@/hooks/useDebounced';
import { unitWord } from '@/pages/catalog/format';
import {
  Automation,
  AutomationInput,
  Product,
  Unit,
  useAgents,
  useCreateAutomation,
  useProducts,
  useUpdateAutomation,
} from '@/api/gateway';
import { toaster } from '@/components/ui/toaster';
import { Details } from '@/pages/playbook/quiet';
import { DAYS, defaultAgent, errorText, shortName, unitFor } from './format';

type Line = { code: string; name: string; quantity: number; unit: Unit };

/** Starting values for a new automation (e.g. "Make this a standing order" from a finished run). */
export type AutomationPrefill = {
  name?: string;
  lines: Line[];
  agentId?: string | null;
  allowSubstitutes?: boolean;
  days?: number[];
  leadDays?: number;
};

type Props = { open: boolean; onClose: () => void; automation?: Automation | null; prefill?: AutomationPrefill | null };

/** Create or edit a scheduled order. The dialog body remounts per open so state starts fresh. */
export const AutomationDialog = ({ open, onClose, automation, prefill }: Props) => (
  <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="lg" placement="center" lazyMount unmountOnExit>
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content borderRadius="l3" bg="bg.panel" boxShadow="float" borderWidth="1px" borderColor="border.strong">
          <AutomationForm key={automation?.id ?? 'new'} automation={automation ?? null} prefill={prefill ?? null} onClose={onClose} />
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

const AutomationForm = ({
  automation,
  prefill,
  onClose,
}: {
  automation: Automation | null;
  prefill: AutomationPrefill | null;
  onClose: () => void;
}) => {
  const agents = useAgents();
  const navigate = useNavigate();
  const create = useCreateAutomation();
  const update = useUpdateAutomation();
  const [name, setName] = useState(automation?.name ?? prefill?.name ?? '');
  const [lines, setLines] = useState<Line[]>(
    automation?.lines.map(({ code, name, quantity, unit }) => ({ code, name, quantity, unit })) ?? prefill?.lines ?? []
  );
  const [days, setDays] = useState<number[]>(automation?.schedule.days ?? prefill?.days ?? [1, 4]);
  const [time, setTime] = useState(automation?.schedule.time ?? '06:00');
  const [leadDays, setLeadDays] = useState(automation?.schedule.leadDays ?? prefill?.leadDays ?? 1);
  const [agentId, setAgentId] = useState<string | null>(automation?.agent.id ?? prefill?.agentId ?? null);
  const [allowSubstitutes, setAllowSubstitutes] = useState(automation?.allowSubstitutes ?? prefill?.allowSubstitutes ?? true);
  const agent = agents.data?.find((a) => a.id === agentId) ?? defaultAgent(agents.data);

  const valid = name.trim() && lines.length && lines.every((l) => l.quantity > 0) && days.length && /^\d{2}:\d{2}$/.test(time);
  const saving = create.isPending || update.isPending;

  const save = () => {
    if (!valid) return;
    const body: AutomationInput = {
      name: name.trim(),
      schedule: { days: [...days].sort(), time, leadDays },
      lines: lines.map(({ code, quantity, unit }) => ({ code, quantity, unit })),
      agentId: agent?.id,
      allowSubstitutes,
    };
    const opts = {
      onSuccess: () => {
        toaster.create({ type: 'success', title: automation ? 'Automation saved' : 'Automation created', description: body.name });
        onClose();
      },
      onError: (err: unknown) => toaster.create({ type: 'error', title: 'Couldn’t save the automation', description: errorText(err) }),
    };
    if (automation) update.mutate({ id: automation.id, ...body }, opts);
    else create.mutate({ ...body, enabled: true }, opts);
  };

  const addProduct = (p: Product) =>
    setLines((ls) =>
      ls.some((l) => l.code === p.code)
        ? ls
        : [...ls, { code: p.code, name: p.name, quantity: unitFor(p) === 'pcs' ? 10 : 100, unit: unitFor(p) }]
    );

  return (
    <>
      <Dialog.Header paddingBottom={4}>
        <Box width="100%" paddingBottom={4} borderBottomWidth="1px" borderColor="border.strong">
          <Dialog.Title textStyle="title">{automation ? 'Edit automation' : 'New automation'}</Dialog.Title>
          <Text fontSize="13px" color="fg.muted" marginTop={1}>
            An agent places this order on schedule. Every run is checked against the signed policy.
          </Text>
        </Box>
      </Dialog.Header>
      <Dialog.CloseTrigger asChild>
        <CloseButton size="sm" />
      </Dialog.CloseTrigger>

      <Dialog.Body>
        <Stack gap={5}>
          <Field label="Name">
            <Input
              size="sm"
              borderRadius="l2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly milk for Ward 4"
              autoFocus={!automation}
            />
          </Field>

          <Field label="Products">
            <Stack gap={2}>
              {lines.length ? (
                <Box>
                  {lines.map((l) => (
                    <Flex key={l.code} align="center" gap={3} paddingY={2} borderBottomWidth="1px" borderColor="border">
                      <Box flex={1} minWidth={0}>
                        <Text fontSize="13px" fontWeight="500" truncate title={l.code}>
                          {shortName(l.name)}
                        </Text>
                      </Box>
                      <Input
                        size="xs"
                        type="number"
                        min={0}
                        width="90px"
                        borderRadius="l2"
                        className="tnum"
                        textAlign="right"
                        value={Number.isFinite(l.quantity) ? l.quantity : ''}
                        onChange={(e) =>
                          setLines((ls) => ls.map((x) => (x.code === l.code ? { ...x, quantity: Number(e.target.value) } : x)))
                        }
                      />
                      <NativeSelect.Root size="xs" width="70px">
                        <NativeSelect.Field
                          value={l.unit}
                          borderRadius="l2"
                          onChange={(e) =>
                            setLines((ls) => ls.map((x) => (x.code === l.code ? { ...x, unit: e.target.value as Unit } : x)))
                          }
                        >
                          <option value="l">l</option>
                          <option value="kg">kg</option>
                          <option value="pcs">pcs</option>
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      <IconButton
                        aria-label="Remove"
                        size="2xs"
                        variant="ghost"
                        color="fg.subtle"
                        onClick={() => setLines((ls) => ls.filter((x) => x.code !== l.code))}
                      >
                        <LuX />
                      </IconButton>
                    </Flex>
                  ))}
                </Box>
              ) : null}
              <ProductSearch onPick={addProduct} exclude={lines.map((l) => l.code)} />
            </Stack>
          </Field>

          <Field label="Runs on" hint="Helsinki time">
            <Flex gap={1.5} align="center" flexWrap="wrap">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = days.includes(n);
                return (
                  // A run day is inked in solid, like a filled box on a printed form.
                  <Button
                    key={d}
                    size="xs"
                    width="44px"
                    borderRadius="l1"
                    variant="outline"
                    className="tnum"
                    fontSize="11px"
                    fontWeight={on ? '600' : '400'}
                    bg={on ? 'fg' : 'transparent'}
                    color={on ? 'bg' : 'fg.muted'}
                    borderColor={on ? 'fg' : 'border.emphasized'}
                    _hover={{ bg: on ? 'fg' : 'bg.hover', opacity: on ? 0.88 : 1 }}
                    aria-pressed={on}
                    onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== n) : [...ds, n]))}
                  >
                    {d}
                  </Button>
                );
              })}
              <Text fontSize="12.5px" color="fg.subtle" marginX={1}>
                at
              </Text>
              <Input
                size="xs"
                type="time"
                width="96px"
                borderRadius="l2"
                className="tnum"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Flex>
          </Field>

          <Field label="Delivery">
            <NativeSelect.Root size="sm" width="200px">
              <NativeSelect.Field value={leadDays} borderRadius="l2" onChange={(e) => setLeadDays(Number(e.target.value))}>
                {[0, 1, 2, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Same day' : n === 1 ? 'Next day' : `${n} days later`}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field>

          <Details label="More options">
            <Flex gap={5} align="end" flexWrap="wrap">
              <Field label="Placed by">
                <NativeSelect.Root size="sm" width="220px" disabled={agents.isLoading}>
                  <NativeSelect.Field value={agent?.id ?? ''} borderRadius="l2" onChange={(e) => setAgentId(e.target.value)}>
                    {agents.data?.map((a) => (
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
                onCheckedChange={(e) => setAllowSubstitutes(e.checked)}
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
          </Details>
        </Stack>
      </Dialog.Body>

      <Dialog.Footer marginTop={2} borderTopWidth="1px" borderColor="border" paddingTop={4}>
        {automation ? (
          <Button
            size="sm"
            variant="ghost"
            color="fg.muted"
            marginRight="auto"
            onClick={() => navigate(`/app/new?automation=${automation.id}`)}
          >
            Open as an order
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" color="fg.muted" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          borderRadius="l2"
          disabled={!valid}
          loading={saving}
          onClick={save}
        >
          {automation ? 'Save changes' : 'Create automation'}
        </Button>
      </Dialog.Footer>
    </>
  );
};

export const ProductSearch = ({
  onPick,
  exclude,
  placeholder = 'Add a product — search the Valio catalog',
}: {
  onPick: (p: Product) => void;
  exclude: string[];
  placeholder?: string;
}) => {
  const [q, setQ] = useState('');
  // The real catalog has ~17,500 products: search on the server, a moment after typing stops.
  const term = useDebounced(q.trim(), 250);
  const products = useProducts({ q: term, limit: 12 }, { enabled: term.length >= 2 });
  const results =
    q.trim().length >= 2 && term.length >= 2 ? (products.data ?? []).filter((p) => !exclude.includes(p.code)).slice(0, 6) : [];
  return (
    <Box position="relative">
      <Flex
        align="center"
        gap={2}
        borderWidth="1px"
        borderColor="border"
        borderRadius="l2"
        paddingX={2.5}
        _focusWithin={{ borderColor: 'brand.accent' }}
      >
        <Box color="fg.subtle">{products.isFetching && q ? <Spinner size="xs" /> : <LuSearch />}</Box>
        <Input
          size="sm"
          border="none"
          paddingX={0}
          _focusVisible={{ outline: 'none' }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
      </Flex>
      {results.length ? (
        <Box marginTop={1} borderWidth="1px" borderColor="border.strong" borderRadius="l3" bg="bg.panel" boxShadow="panel" overflow="hidden">
          {results.map((p) => (
            <Flex
              key={p.code}
              as="button"
              width="100%"
              textAlign="left"
              align="center"
              gap={3}
              paddingX={3}
              paddingY={2}
              cursor="pointer"
              _hover={{ bg: 'bg.hover' }}
              onClick={() => {
                onPick(p);
                setQ('');
              }}
            >
              <Box color="fg.subtle">
                <LuPlus />
              </Box>
              <Text flex={1} fontSize="13px" truncate>
                {shortName(p.name)}
              </Text>
              <Text fontSize="12px" color="fg.subtle" flexShrink={0}>
                {unitWord(p.salesUnit.unit)} ·{' '}
                <Text as="span" fontFamily="mono" fontSize="11.5px">
                  {p.code}
                </Text>
              </Text>
            </Flex>
          ))}
        </Box>
      ) : q.trim().length >= 2 && term === q.trim() && !products.isFetching ? (
        <Text fontSize="12px" color="fg.subtle" marginTop={1.5} paddingX={1}>
          No products match “{q}”.
        </Text>
      ) : null}
    </Box>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <Box>
    <Flex gap={2} align="baseline" marginBottom={2}>
      <Text textStyle="caps" color="fg.muted">
        {label}
      </Text>
      {hint ? (
        <Text fontSize="11.5px" color="fg.subtle">
          {hint}
        </Text>
      ) : null}
    </Flex>
    {children}
  </Box>
);
