import { Box, Button, Flex, NativeSelect, Skeleton, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuChevronDown, LuDownload, LuRefreshCw, LuShieldCheck } from 'react-icons/lu';
import { Caption, Corners, Dot, EmptyHint, PageHeader, PageIntro, Readout, Stamp, Tone, toneColor } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import {
  type AuditEntry,
  type ChainVerification,
  type Order,
  type OrderStatus,
  useAuditPages,
  useHealth,
  useOrders,
  useSandbox,
  useVerifyChain,
  afterReset,
} from '@/api/gateway';
import { actorLabel, steps } from '@/pages/playbook/graph';
import { statusMeta } from '@/pages/playbook/visuals';
import { EntryDetail } from './EntryDetail';
import { EntryCheck, GENESIS_HASH, checkEntries, shortHash } from './chain';
import { RuledSearch } from '@/pages/catalog/RuledSearch';
import { HashState, day, localDay, tick, time } from './format';

type Verify = {
  phase: 'idle' | 'running' | 'done';
  /** Entries revealed so far, in `order` (newest first). */
  checked: number;
  order: number[];
  results: Map<number, EntryCheck>;
  server: ChainVerification | null;
  serverError: string | null;
  /** The order filter the run was made under. */
  scope: string;
};

const IDLE: Verify = { phase: 'idle', checked: 0, order: [], results: new Map(), server: null, serverError: null, scope: '' };
const GATEWAY = '__gateway';

// No. · time · step · message · hash ← prev
const COLUMNS = '40px 64px 158px minmax(0, 1fr) 150px';
const COLUMNS_COMPACT = '40px 64px 150px minmax(0, 1fr) 88px';
const stepTitle = (id: string) => steps.find((s) => s.id === id)?.title ?? id;

const orderStatus: Record<OrderStatus, { tone: Tone; label: string }> = {
  executed: { tone: 'auto', label: 'Ordered' },
  pending_approval: { tone: 'pending', label: 'Waiting for approval' },
  partial: { tone: 'pending', label: 'Partly ordered' },
  declined: { tone: 'blocked', label: 'Declined' },
  blocked: { tone: 'blocked', label: 'Blocked' },
  expired: { tone: 'idle', label: 'Expired' },
};

export const AuditPage = () => {
  const [query, setQuery] = useState('');
  // Deep link from Orders: /app/audit?order=VA-20481 loads the log of that order only.
  const [selected, setSelected] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const order = searchParams.get('order') || 'all';
  const setOrder = (value: string) => {
    setSelected(null);
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === 'all') next.delete('order');
        else next.set('order', value);
        return next;
      },
      { replace: true }
    );
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [verifyState, setVerify] = useState<Verify>(IDLE);
  const timer = useRef<number | null>(null);

  const pages = useAuditPages({ orderId: order === 'all' ? undefined : order });
  const ordersQ = useOrders({ limit: 500 });
  const health = useHealth();
  const verifyChain = useVerifyChain();
  // Sandbox: the chain is shared and never rewritten, so a reset only hides what came before it.
  const sandbox = useSandbox();
  const resetAt = sandbox.data?.sandbox ? sandbox.data.resetAt : null;
  const [showEarlier, setShowEarlier] = useState(false);

  useEffect(() => () => void (timer.current && window.clearInterval(timer.current)), []);
  // A verification run belongs to the slice of the log it checked; switching order hides it.
  const verify = verifyState.scope === order ? verifyState : IDLE;

  /** Every loaded entry, newest first. */
  const raw = useMemo(() => {
    const seen = new Set<number>();
    const out: AuditEntry[] = [];
    for (const p of pages.data?.pages ?? [])
      for (const e of p.entries)
        if (!seen.has(e.seq)) {
          seen.add(e.seq);
          out.push(e);
        }
    out.sort((a, b) => b.seq - a.seq);
    return out;
  }, [pages.data]);
  // Everything loaded reaches back past the reset: older pages would all be hidden.
  const reachedReset =
    !!resetAt && !showEarlier && raw.length > 0 && new Date(raw[raw.length - 1].at).getTime() < new Date(resetAt).getTime();
  const entries = useMemo(() => (showEarlier ? raw : afterReset(raw, resetAt)), [raw, resetAt, showEarlier]);

  const orderById = useMemo(() => new Map((ordersQ.data ?? []).map((o) => [o.id, o])), [ordersQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const o = e.orderId ? orderById.get(e.orderId) : undefined;
      return [
        e.message,
        e.orderId ?? 'gateway',
        e.hash,
        stepTitle(e.step),
        actorLabel[e.actor] ?? e.actor,
        String(e.seq),
        o?.title ?? '',
      ].some((s) => s.toLowerCase().includes(q));
    });
  }, [entries, query, orderById]);

  // One group per order (system entries without an order go under "Gateway"), most recent activity first.
  const groups = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const key = e.orderId ?? GATEWAY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].map(([key, list]) => ({ key, entries: list }));
  }, [filtered]);

  const visible = useMemo(() => groups.flatMap((g) => (collapsed[g.key] ? [] : g.entries)), [groups, collapsed]);
  const selectedEntry = entries.find((e) => e.seq === selected) ?? null;

  const step = useCallback(
    (dir: -1 | 1) => {
      if (!visible.length) return;
      const i = visible.findIndex((e) => e.seq === selected);
      const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + dir))];
      setSelected(next.seq);
      document.getElementById(`audit-row-${next.seq}`)?.scrollIntoView({ block: 'nearest' });
    },
    [visible, selected]
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'SELECT') return;
      if (ev.key === 'Escape') setSelected(null);
      if (selected === null) return;
      const dir = ev.key === 'ArrowDown' || ev.key === 'j' ? 1 : ev.key === 'ArrowUp' || ev.key === 'k' ? -1 : 0;
      if (dir) {
        ev.preventDefault();
        step(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, selected]);

  // --- Verify: the server re-walks the whole chain (authoritative); this browser
  // recomputes every loaded hash with WebCrypto and ticks the rows one by one.
  const runVerify = async () => {
    if (timer.current) window.clearInterval(timer.current);
    const snapshot = entries;
    setCollapsed({});
    setVerify({ ...IDLE, phase: 'running', order: snapshot.map((e) => e.seq), scope: order });

    const [serverResult, results] = await Promise.all([
      verifyChain.mutateAsync().then(
        (r) => ({ ok: true as const, r }),
        (err: Error) => ({ ok: false as const, err })
      ),
      checkEntries(snapshot),
    ]);
    const server = serverResult.ok ? serverResult.r : null;
    const serverError = serverResult.ok ? null : serverResult.err.message;
    setVerify((v) => ({ ...v, results, server, serverError }));

    const n = snapshot.length;
    const per = Math.max(1, Math.ceil(n / 70)); // ~2 s however long the loaded log is
    let i = 0;
    if (!n) {
      setVerify((v) => ({ ...v, phase: 'done' }));
      return;
    }
    timer.current = window.setInterval(() => {
      i = Math.min(n, i + per);
      const done = i >= n;
      setVerify((v) => ({ ...v, checked: i, phase: done ? 'done' : 'running' }));
      document.getElementById(`audit-row-${snapshot[i - 1].seq}`)?.scrollIntoView({ block: 'nearest' });
      if (done) {
        window.clearInterval(timer.current!);
        timer.current = null;
        // The verdict is stamped on the certificate at the top: bring it back into view.
        window.setTimeout(() => document.getElementById('chain-line')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
      }
    }, 30);
  };

  const revealIndex = useMemo(() => new Map(verify.order.map((seq, i) => [seq, i])), [verify.order]);
  const hashState = (e: AuditEntry): HashState => {
    if (verify.phase === 'idle') return 'idle';
    const i = revealIndex.get(e.seq);
    if (i === undefined) return 'idle';
    if (i < verify.checked) {
      const r = verify.results.get(e.seq);
      return r ? (r.ok ? 'ok' : 'bad') : 'idle';
    }
    if (verify.phase === 'running' && i === verify.checked) return 'checking';
    return 'idle';
  };
  const revealedResult = (e: AuditEntry) => (hashState(e) === 'ok' || hashState(e) === 'bad' ? verify.results.get(e.seq) : undefined);

  const head = verify.server?.head ?? health.data?.audit.head ?? (order === 'all' ? entries[0]?.hash : undefined) ?? null;

  const exportJson = () => {
    const now = new Date();
    const doc = {
      schema: 'mandate.audit/v1',
      head,
      exportedAt: now.toISOString(),
      chain: {
        algorithm: 'sha256(canonicalJson({seq, at, orderId, step, status, actor, message, payload}) + prevHash)',
        genesis: GENESIS_HASH,
      },
      filter: order === 'all' ? null : { orderId: order },
      verification: verify.server,
      count: entries.length,
      entries: [...entries].sort((a, b) => a.seq - b.seq),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mandate-audit-${order === 'all' ? 'all' : order}-${localDay(now.getTime())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toaster.create({ title: `Exported ${entries.length} entries`, description: a.download, type: 'success' });
  };

  const oldest = entries[entries.length - 1];
  const orderOptions = useMemo(() => {
    const list = (ordersQ.data ?? []).map((o) => ({ id: o.id, title: o.title }));
    if (order !== 'all' && !list.some((o) => o.id === order)) list.unshift({ id: order, title: '' });
    return list;
  }, [ordersQ.data, order]);

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <PageHeader trail={['Gateway', 'Audit log']} />

      <Flex flex={1} minHeight={0}>
        <Box flex={1} minWidth={0} overflowY="auto">
          <Box maxWidth="1080px" marginX="auto" paddingX={6} paddingY={6}>
            <PageIntro
              title="Audit log"
              description="Every request, quote, decision and approval — append-only and hash-chained, shared with Valio."
              actions={
                <Flex gap={2} flexShrink={0}>
                  <Button size="sm" variant="outline" borderRadius="l2" onClick={exportJson} disabled={!entries.length}>
                    <LuDownload /> Export JSON
                  </Button>
                  <Button
                    size="sm"
                    borderRadius="l2"
                    onClick={() => void runVerify()}
                    loading={verify.phase === 'running'}
                    loadingText="Verifying…"
                    disabled={!entries.length}
                  >
                    <LuShieldCheck /> Verify chain
                  </Button>
                </Flex>
              }
            />

            <ChainLine verify={verify} head={head} loaded={entries.length} />
            {resetAt ? (
              <Text fontSize="12.5px" color="fg.subtle" marginTop={2}>
                {showEarlier
                  ? 'Showing the whole chain, from before your last sandbox reset too. '
                  : `Showing entries since your sandbox reset, ${new Date(resetAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Helsinki' })}. `}
                <Text
                  as="button"
                  color="fg.muted"
                  textDecoration="underline"
                  textDecorationColor="border.emphasized"
                  textUnderlineOffset="3px"
                  cursor="pointer"
                  _hover={{ color: 'fg' }}
                  onClick={() => setShowEarlier((v) => !v)}
                >
                  {showEarlier ? 'Only since the reset' : 'Show earlier entries'}
                </Text>
              </Text>
            ) : null}

            <Flex align="end" gap={6} marginTop={8} marginBottom={6} wrap="wrap">
              <RuledSearch value={query} onChange={setQuery} placeholder="Search messages, steps, hashes" width="300px" />
              <NativeSelect.Root size="sm" width="260px" variant="plain">
                <NativeSelect.Field
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  borderRadius="0"
                  borderBottomWidth="1px"
                  borderColor="border.emphasized"
                  paddingLeft={0}
                  height="38px"
                  fontSize="14px"
                  fontFamily={order === 'all' ? undefined : 'mono'}
                  aria-label="Order"
                >
                  <option value="all">All orders</option>
                  {orderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id}
                      {o.title ? ` · ${o.title}` : ''}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Box flex={1} />
              <Text fontSize="12px" color="fg.subtle" className="tnum" paddingBottom={2}>
                {query ? `${filtered.length} of ${entries.length} entries` : `${entries.length} entries loaded`}
              </Text>
            </Flex>

            {pages.isPending ? (
              Array.from({ length: 10 }, (_, i) => (
                <Flex key={i} paddingX={3} height="40px" align="center" borderBottomWidth="1px" borderColor="border.muted">
                  <Skeleton height="12px" width={`${55 + ((i * 11) % 40)}%`} borderRadius="l2" />
                </Flex>
              ))
            ) : pages.isError ? (
              <Flex paddingY={4} align="center" gap={3}>
                <Text fontSize="13px" color="status.blocked" flex={1}>
                  Couldn’t load the audit log: {pages.error.message}
                </Text>
                <Button size="xs" variant="outline" onClick={() => void pages.refetch()}>
                  <LuRefreshCw /> Retry
                </Button>
              </Flex>
            ) : groups.length === 0 ? (
              <EmptyHint>
                {entries.length
                  ? 'No entries match this search. The log itself is unchanged — entries can never be edited or removed.'
                  : order !== 'all'
                    ? `No audit entries for ${order}.`
                    : 'The audit log is empty.'}
              </EmptyHint>
            ) : (
              <>
                <ColumnHeads compact={!!selectedEntry} />
                {groups.map((g) => (
                  <Box key={g.key} marginBottom={2}>
                    <GroupHeader
                      id={g.key}
                      order={orderById.get(g.key)}
                      entries={g.entries}
                      collapsed={!!collapsed[g.key]}
                      onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    />
                    {collapsed[g.key]
                      ? null
                      : g.entries.map((e, i) => (
                          <EntryRow
                            key={e.seq}
                            compact={!!selectedEntry}
                            first={i === 0}
                            last={i === g.entries.length - 1}
                            entry={e}
                            active={selected === e.seq}
                            hash={hashState(e)}
                            onClick={() => setSelected(selected === e.seq ? null : e.seq)}
                          />
                        ))}
                  </Box>
                ))}
              </>
            )}

            {entries.length ? (
              <Flex
                align="center"
                justify="center"
                gap={3}
                marginTop={6}
                fontFamily="mono"
                fontSize="12px"
                color="fg.subtle"
              >
                {reachedReset ? (
                  <Text>Start of this sandbox session — entry #{oldest.seq}.</Text>
                ) : pages.hasNextPage ? (
                  <>
                    <Text>Oldest loaded: entry #{oldest.seq}</Text>
                    <Button
                      size="xs"
                      variant="outline"
                      borderRadius="l2"
                      fontFamily="body"
                      fontStyle="normal"
                      loading={pages.isFetchingNextPage}
                      onClick={() => void pages.fetchNextPage()}
                    >
                      Load older
                    </Button>
                  </>
                ) : oldest.prevHash === GENESIS_HASH ? (
                  <Text>Start of the chain — entry #{oldest.seq} links to genesis.</Text>
                ) : (
                  <Text>
                    Oldest entry for {order}: #{oldest.seq}, linked to{' '}
                    <Text as="span" fontFamily="mono" fontStyle="normal" fontSize="13px">
                      {shortHash(oldest.prevHash)}
                    </Text>
                  </Text>
                )}
              </Flex>
            ) : null}
          </Box>
        </Box>

        {selectedEntry ? (
          <EntryDetail
            entry={selectedEntry}
            order={selectedEntry.orderId ? orderById.get(selectedEntry.orderId) : undefined}
            check={revealedResult(selectedEntry)}
            onClose={() => setSelected(null)}
            onStep={step}
          />
        ) : null}
      </Flex>
    </Flex>
  );
};

/**
 * The chain's certificate under the title: head hash, how much is loaded, the one result
 * sentence, and — once a run finishes — the verdict plate.
 */
const ChainLine = ({ verify, head, loaded }: { verify: Verify; head: string | null; loaded: number }) => {
  const total = verify.order.length;
  const bad = verify.phase === 'done' ? verify.order.filter((seq) => !verify.results.get(seq)?.ok) : [];
  const server = verify.server;
  let tone: Tone = 'idle';
  let text: string;
  let verdict: string | null = null;
  if (verify.phase === 'idle') {
    text = 'Not verified yet. Verify re-walks the chain on the gateway and recomputes every loaded hash in this browser.';
  } else if (verify.phase === 'running') {
    tone = 'running';
    text = `Verifying… ${verify.checked} of ${total} loaded hashes recomputed in this browser`;
  } else if (server && !server.ok) {
    tone = 'blocked';
    verdict = 'Broken';
    text = `Chain broken at entry #${server.brokenAt} — the gateway could not link it back to genesis.`;
  } else if (bad.length) {
    const first = verify.results.get(bad[bad.length - 1]);
    tone = 'blocked';
    verdict = 'Broken';
    text = `Hash mismatch in ${bad.length} of ${total} loaded entries — first at #${bad[bad.length - 1]}: ${first?.reason ?? 'mismatch'}.`;
  } else if (server) {
    tone = 'auto';
    verdict = 'Chain intact';
    text = `${server.entries} entries re-walked by the gateway, ${total} loaded hashes recomputed in this browser.`;
  } else {
    tone = 'pending';
    verdict = 'Unconfirmed';
    text = `${total} loaded hashes match in this browser, but the server check failed: ${verify.serverError ?? 'unknown error'}`;
  }
  const shownHead = server ? (server.headShort ?? shortHash(server.head)) : head ? shortHash(head) : '—';
  return (
    <Flex
      id="chain-line"
      position="relative"
      align="center"
      gap={8}
      paddingX={6}
      paddingY={5}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="l3"
      scrollMarginTop="16px"
      minHeight="96px"
    >
      <Corners />
      <Box flexShrink={0}>
        <Caption n="01">Chain head</Caption>
        <Readout size={26} marginTop={2} textTransform="none" title={server?.head ?? head ?? undefined}>
          {shownHead}
        </Readout>
      </Box>
      <Box flexShrink={0}>
        <Caption n="02">Entries loaded</Caption>
        <Readout size={26} marginTop={2}>
          {loaded.toLocaleString('en-US')}
        </Readout>
      </Box>
      <Box flex={1} minWidth={0} paddingLeft={8} borderLeftWidth="1px" borderColor="border">
        <Flex align="center" gap={2} textStyle="label" color={toneColor[tone]}>
          <Dot tone={tone} />
          {verify.phase === 'idle' ? 'Not verified' : verify.phase === 'running' ? 'Verifying' : 'Verified'}
        </Flex>
        <Text fontSize="13px" color="fg.muted" marginTop={1} lineHeight="1.5">
          {text}
        </Text>
      </Box>
      <Box width="170px" flexShrink={0} display="flex" justifyContent="center">
        {verdict ? (
          <Stamp key={verdict} tone={tone} size="lg">
            {verdict}
          </Stamp>
        ) : null}
      </Box>
    </Flex>
  );
};

/** One order's slice of the ledger: its id as the heading, in mono, with the order's own status. */
const GroupHeader = ({
  id,
  order,
  entries,
  collapsed,
  onToggle,
}: {
  id: string;
  order: Order | undefined;
  entries: AuditEntry[];
  collapsed: boolean;
  onToggle: () => void;
}) => {
  const first = entries[entries.length - 1];
  const isGateway = id === GATEWAY;
  const status = order ? orderStatus[order.status] : null;
  return (
    <Flex
      as="button"
      width="100%"
      textAlign="left"
      align="center"
      gap={3}
      paddingTop={6}
      paddingBottom={2.5}
      paddingX={1}
      borderBottomWidth="1px"
      borderColor="border.emphasized"
      cursor="pointer"
      userSelect="none"
      onClick={onToggle}
      aria-expanded={!collapsed}
      _hover={{ '& .group-id': { color: 'brand.fg' } }}
    >
      <Box color="fg.subtle" transform={collapsed ? 'rotate(-90deg)' : undefined} transition="transform 0.2s">
        <LuChevronDown />
      </Box>
      <Text className="group-id" fontFamily="mono" fontSize="13.5px" fontWeight="600" whiteSpace="nowrap" transition="color 0.2s">
        {isGateway ? 'Gateway' : id}
      </Text>
      <Text color="fg.muted" fontSize="14px" truncate minWidth={0}>
        {isGateway ? 'System entries' : (order?.title ?? '')}
      </Text>
      {status ? <Stamp tone={status.tone}>{status.label}</Stamp> : null}
      <Box flex={1} />
      <Text fontFamily="mono" fontSize="11.5px" color="fg.subtle" whiteSpace="nowrap">
        {day(first.at)} · {time(first.at).slice(0, 5)}
      </Text>
      <Text textStyle="label" color="fg.subtle" whiteSpace="nowrap" minWidth="72px" textAlign="right">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </Text>
    </Flex>
  );
};

/** The ledger's column heads, once, over the dark hairline. */
const ColumnHeads = ({ compact }: { compact: boolean }) => (
  <Box
    display="grid"
    gridTemplateColumns={compact ? COLUMNS_COMPACT : COLUMNS}
    gap={4}
    paddingX={1}
    paddingBottom={2}
    textStyle="label"
    color="fg.subtle"
    borderBottomWidth="1px"
    borderColor="border.strong"
  >
    <Text textAlign="right">No.</Text>
    <Text>Time</Text>
    <Text>Step</Text>
    <Text>Entry</Text>
    <Text paddingLeft="18px">{compact ? 'Hash' : 'Hash ← prev'}</Text>
  </Box>
);

const EntryRow = ({
  entry: e,
  active,
  hash,
  compact,
  first,
  last,
  onClick,
}: {
  entry: AuditEntry;
  active: boolean;
  hash: HashState;
  compact: boolean;
  first: boolean;
  last: boolean;
  onClick: () => void;
}) => {
  const meta = statusMeta[e.status] ?? statusMeta.idle;
  const skipped = e.status === 'skipped';
  return (
    <Box
      id={`audit-row-${e.seq}`}
      data-entry-row
      display="grid"
      gridTemplateColumns={compact ? COLUMNS_COMPACT : COLUMNS}
      gap={4}
      paddingX={1}
      minHeight="40px"
      alignItems="center"
      fontSize="13px"
      borderBottomWidth="1px"
      borderColor="border"
      cursor="pointer"
      bg={active ? 'brand.subtle' : hash === 'bad' ? 'status.blocked/6' : undefined}
      boxShadow={active ? 'inset 2px 0 0 var(--chakra-colors-brand-accent)' : undefined}
      _hover={{ bg: active ? 'brand.subtle' : 'bg.hover' }}
      transition="background 0.2s"
      onClick={onClick}
    >
      <Text fontFamily="mono" fontSize="11.5px" color="fg.subtle" textAlign="right">
        {String(e.seq).padStart(4, '0')}
      </Text>
      <Text fontFamily="mono" fontSize="11.5px" color="fg.muted" title={time(e.at)}>
        {time(e.at).slice(0, 8)}
      </Text>
      <Flex align="center" gap={2} minWidth={0} title={meta.label}>
        <Dot tone={e.status === 'auto' || e.status === 'pending' || e.status === 'blocked' ? e.status : 'idle'} size={6} steady />
        <Text textStyle="caps" truncate color={skipped ? 'fg.subtle' : 'fg'}>
          {stepTitle(e.step)}
        </Text>
      </Flex>
      <Text color={skipped ? 'fg.subtle' : 'fg.muted'} truncate title={e.message}>
        {e.message}
      </Text>
      <HashLink entry={e} state={hash} compact={compact} first={first} last={last} />
    </Box>
  );
};

/**
 * The hash column: the chain drawn as blocks on a wire — each entry is a block holding its
 * hash, linked back to the one before it. Verification lights the blocks green, row by row.
 */
const HashLink = ({
  entry: e,
  state,
  compact,
  first,
  last,
}: {
  entry: AuditEntry;
  state: HashState;
  compact: boolean;
  first: boolean;
  last: boolean;
}) => {
  const ink = state === 'ok' ? 'status.auto' : state === 'bad' ? 'status.blocked' : state === 'checking' ? 'status.running' : undefined;
  return (
    <Flex alignSelf="stretch" align="center" gap={2.5} position="relative" minWidth={0} title={`hash ${e.hash}\nprev ${e.prevHash}`}>
      <Box
        position="absolute"
        left="4px"
        width="2px"
        top={first ? '50%' : '-1px'}
        bottom={last ? '50%' : '-1px'}
        bg={state === 'ok' ? 'status.auto' : 'border.emphasized'}
        transition="background 0.3s"
      />
      <Box
        position="relative"
        width="10px"
        height="10px"
        flexShrink={0}
        borderRadius="2px"
        borderWidth="1.5px"
        borderColor={ink ?? 'fg.subtle'}
        bg={state === 'ok' || state === 'bad' ? ink : 'bg.panel'}
        transition="background 0.2s, border-color 0.2s"
        css={state === 'ok' ? { animation: `${tick} 0.35s ease-out` } : undefined}
      />
      <Text fontFamily="mono" fontSize="11.5px" color={state === 'bad' ? 'status.blocked' : 'fg'} whiteSpace="nowrap">
        {shortHash(e.hash)}
      </Text>
      {compact ? null : (
        <Text fontFamily="mono" fontSize="11px" color="fg.subtle" whiteSpace="nowrap">
          ← {e.prevHash === GENESIS_HASH ? 'genesis' : e.prevHash.slice(0, 4)}
        </Text>
      )}
    </Flex>
  );
};
