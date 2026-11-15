import { Box, Button, Flex, NativeSelect, Spinner, Text } from '@chakra-ui/react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { LuCheck, LuTriangleAlert } from 'react-icons/lu';
import { Product, ProductFilters, useHealth, useProductPages } from '@/api/gateway';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader, PageIntro } from '@/components/kit';
import { AllergenData, LactoseFree, PriceCell } from './cells';
import { PRODUCT_FILE, categoryLabel, salesUnitText } from './format';
import { ProductDetail } from './ProductDetail';
import { RuledSearch } from './RuledSearch';

type Toggle = 'lactoseFree' | 'missingAllergens' | 'hasSubstitute';

const toggles: { id: Toggle; label: string }[] = [
  { id: 'lactoseFree', label: 'Lactose-free' },
  { id: 'missingAllergens', label: 'Allergen data missing' },
  { id: 'hasSubstitute', label: 'Has Valio substitute' },
];

// The register: code · product · category · lactose-free · allergen data · price.
const COLUMNS = '64px minmax(0, 1fr) 150px 92px 92px 104px';
const COLUMNS_COMPACT = '64px minmax(0, 1fr) 92px 92px';

export const CatalogPage = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState<Set<Toggle>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  // ~17,500 products: search on the server, shortly after typing stops.
  const q = useDebounced(query.trim(), 250);

  const filters: ProductFilters = {
    q: q || undefined,
    category: category ?? undefined,
    ...(active.has('lactoseFree') ? { lactoseFree: true } : {}),
    ...(active.has('missingAllergens') ? { missingAllergens: true } : {}),
    ...(active.has('hasSubstitute') ? { hasSubstitute: true } : {}),
  };
  const anyFilter = q !== '' || category !== null || active.size > 0;
  const pages = useProductPages(filters, PAGE_SIZE);
  // Unfiltered first page: the catalog size and the category list (when the server sends no facets).
  const base = useProductPages({}, PAGE_SIZE);
  const health = useHealth();

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (pages.data?.pages ?? []).flatMap((pg) => pg.products).filter((p) => (seen.has(p.code) ? false : (seen.add(p.code), true)));
  }, [pages.data]);
  const first = pages.data?.pages[0];
  const baseFirst = base.data?.pages[0];
  const catalogTotal = baseFirst?.total ?? health.data?.catalog.products ?? null;
  const matchTotal = first?.total ?? null;

  const categories = useMemo(() => {
    const facets = baseFirst?.categories;
    if (facets?.length)
      return facets
        .map((c) =>
          typeof c === 'string'
            ? { value: c, label: categoryLabel(c), count: undefined }
            : { value: c.code ?? c.name ?? c.label ?? '', label: c.label ?? c.name ?? categoryLabel(c.code ?? ''), count: c.count }
        )
        .filter((c) => c.value);
    const seen = new Map<string, string>();
    for (const p of baseFirst?.products ?? []) if (!seen.has(p.category)) seen.set(p.category, p.category);
    return [...seen.keys()].sort().map((c) => ({ value: c, label: c, count: undefined as number | undefined }));
  }, [baseFirst]);

  const compact = selected !== null;
  const sample = health.data?.catalog.source === 'sample';
  const simulatedPrices = rows.length > 0 && rows.every((p) => p.listPrice.simulated);
  const livePrices = rows.some((p) => p.listPrice.source === 'live');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flip = (id: Toggle) =>
    setActive((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clear = () => {
    setQuery('');
    setCategory(null);
    setActive(new Set());
  };

  const loading = pages.isLoading;
  const error = pages.error;
  const typing = query.trim() !== q;
  const countText = loading
    ? ''
    : anyFilter
      ? matchTotal !== null
        ? `${matchTotal.toLocaleString('en-US')} ${matchTotal === 1 ? 'match' : 'matches'}`
        : `${rows.length.toLocaleString('en-US')}${pages.hasNextPage ? '+' : ''} shown`
      : catalogTotal !== null
        ? `${catalogTotal.toLocaleString('en-US')} products`
        : `${rows.length} products`;

  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <PageHeader trail={['Gateway', 'Catalog']} />
      <Flex flex={1} minHeight={0}>
        <Box flex={1} minWidth={0} overflowY="auto">
          <Box maxWidth="1080px" marginX="auto" paddingX={8} paddingTop={10} paddingBottom={12}>
            <PageIntro title="Catalog" description="What agents see when they search Valio's products." />

            <Text fontSize="13px" color="fg.muted" marginTop={-2} marginBottom={6} maxWidth="720px" lineHeight="1.6">
              {sample
                ? `The gateway serves a ${catalogTotal ?? rows.length}-product sample of Valio's ${PRODUCT_FILE.total.toLocaleString('en-US')}-product file. In the full file, `
                : `Valio Aimo's real product file — ${(catalogTotal ?? PRODUCT_FILE.total).toLocaleString('en-US')} products, prices asked from Valio live. `}
              {Math.round(PRODUCT_FILE.withoutAllergens * 100)} % have no allergen data — an agent can never auto-select those.
            </Text>

            <RuledSearch
              value={query}
              onChange={setQuery}
              placeholder="Butter, cream, coffee… or a code"
              busy={pages.isFetching && (typing || anyFilter)}
              width={compact ? '100%' : '520px'}
              autoFocus
            />
            <Flex gap={5} align="center" marginTop={4} marginBottom={7} wrap="wrap" minHeight="32px">
              {toggles.map((t) => (
                <Toggle key={t.id} active={active.has(t.id)} onClick={() => flip(t.id)}>
                  {t.label}
                </Toggle>
              ))}
              {compact || !categories.length ? null : (
                <NativeSelect.Root size="sm" width="auto" variant="plain">
                  <NativeSelect.Field
                    value={category ?? ''}
                    onChange={(e) => setCategory(e.target.value || null)}
                    fontSize="13px"
                    paddingLeft={0}
                    borderRadius="0"
                    borderBottomWidth="1px"
                    borderColor="border.emphasized"
                    color={category ? 'fg' : 'fg.muted'}
                    aria-label="Category"
                    maxWidth="220px"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                        {c.count !== undefined ? ` (${c.count.toLocaleString('en-US')})` : ''}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              )}
              <Box flex={1} />
              <Text fontSize="12px" color="fg.subtle" className="tnum" whiteSpace="nowrap">
                {countText}
              </Text>
            </Flex>

            {loading ? (
              <Flex justify="center" paddingY={12} color="fg.subtle">
                <Spinner size="sm" />
              </Flex>
            ) : error ? (
              <Flex align="center" gap={2} paddingY={6} color="status.blocked" fontSize="13px">
                <LuTriangleAlert />
                <Text>Could not load products — {error.message}</Text>
              </Flex>
            ) : (
              <>
                <Box opacity={pages.isPlaceholderData ? 0.55 : 1} transition="opacity 0.15s">
                  <ProductList rows={rows} compact={compact} selected={selected} onSelect={(c) => setSelected(c === selected ? null : c)} />
                </Box>
                {rows.length === 0 ? (
                  <Flex direction="column" align="center" gap={3} paddingY={12} color="fg.subtle">
                    <Text fontWeight="550" letterSpacing="-0.02em" fontSize="18px">
                      {q ? `Nothing in the catalog matches “${q}”.` : 'No products match these filters.'}
                    </Text>
                    {anyFilter ? (
                      <Button size="xs" variant="outline" borderRadius="l2" onClick={clear}>
                        Clear filters
                      </Button>
                    ) : null}
                  </Flex>
                ) : (
                  <Flex align="center" justify="space-between" gap={4} marginTop={5}>
                    <Text fontSize="12px" color="fg.subtle">
                      {simulatedPrices
                        ? 'List prices are simulated. '
                        : livePrices
                          ? 'Prices are Valio’s live list prices, asked when the products come on screen. '
                          : ''}
                      {rows.some((p) => p.sample) ? 'Codes in grey are illustrative sample rows, not real Valio codes.' : ''}
                    </Text>
                    {pages.hasNextPage ? (
                      <Button
                        size="xs"
                        variant="outline"
                        borderRadius="l2"
                        loading={pages.isFetchingNextPage}
                        loadingText="Loading…"
                        onClick={() => void pages.fetchNextPage()}
                      >
                        Show {PAGE_SIZE} more
                      </Button>
                    ) : null}
                  </Flex>
                )}
              </>
            )}
          </Box>
        </Box>

        {selected ? (
          <Box width="440px" flexShrink={0} borderLeftWidth="1px" borderColor="border" bg="bg.panel" overflowY="auto" key={selected}>
            <ProductDetail code={selected} catalog={rows} onClose={() => setSelected(null)} onSelect={setSelected} />
          </Box>
        ) : null}
      </Flex>
    </Flex>
  );
};

const PAGE_SIZE = 50;

const ProductList = ({
  rows,
  compact,
  selected,
  onSelect,
}: {
  rows: Product[];
  compact: boolean;
  selected: string | null;
  onSelect: (code: string) => void;
}) => {
  const template = compact ? COLUMNS_COMPACT : COLUMNS;
  return (
    <Box>
      <Box
        display="grid"
        gridTemplateColumns={template}
        columnGap={4}
        paddingX={2}
        paddingBottom={2}
        textStyle="caps"
        color="fg.subtle"
        borderBottomWidth="1px"
        borderColor="border.strong"
      >
        <Text>Code</Text>
        <Text>Product</Text>
        {compact ? null : <Text>Category</Text>}
        <Text>Lactose-free</Text>
        <Text>Allergens</Text>
        {compact ? null : <Text textAlign="right">Price</Text>}
      </Box>
      {rows.map((p) => {
        const isSel = p.code === selected;
        return (
          <Box
            key={p.code}
            data-product-row
            display="grid"
            gridTemplateColumns={template}
            columnGap={4}
            paddingX={2}
            minHeight="50px"
            alignItems="center"
            fontSize="13.5px"
            borderBottomWidth="1px"
            borderColor="border"
            cursor="pointer"
            bg={isSel ? 'brand.subtle' : undefined}
            boxShadow={isSel ? 'inset 2px 0 0 var(--chakra-colors-brand-accent)' : undefined}
            transition="background 0.2s"
            _hover={{ bg: isSel ? 'brand.subtle' : 'bg.hover' }}
            onClick={() => onSelect(p.code)}
          >
            <Text
              fontFamily="mono"
              fontSize="12px"
              className="tnum"
              color={p.sample ? 'fg.subtle' : 'fg.muted'}
              title={p.sample ? 'Illustrative sample row' : 'Valio product code'}
            >
              {p.code}
            </Text>
            <Box minWidth={0}>
              <Text truncate title={p.name}>
                {p.name}
              </Text>
              <Text fontSize="12px" color="fg.subtle" truncate>
                {compact ? `${categoryLabel(p.category)} · ` : ''}
                {salesUnitText(p)}
              </Text>
            </Box>
            {compact ? null : (
              <Text textStyle="caps" fontSize="12px" color="fg.subtle" truncate title={categoryLabel(p.category)}>
                {categoryLabel(p.category)}
              </Text>
            )}
            <LactoseFree product={p} />
            <AllergenData product={p} />
            {compact ? null : <PriceCell product={p} />}
          </Box>
        );
      })}
    </Box>
  );
};

/** A filter as a box you tick on a form: a square that fills with ink, and the words. */
const Toggle = ({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) => (
  <Flex
    as="button"
    align="center"
    gap={2}
    height="32px"
    fontSize="13px"
    cursor="pointer"
    color={active ? 'fg' : 'fg.muted'}
    transition="color 0.2s"
    _hover={{ color: 'fg', '& .tick': { borderColor: 'fg' } }}
    aria-pressed={active}
    onClick={onClick}
  >
    <Flex
      className="tick"
      align="center"
      justify="center"
      width="14px"
      height="14px"
      borderRadius="l1"
      borderWidth="1px"
      borderColor={active ? 'brand.accent' : 'border.strong'}
      bg={active ? 'brand.solid' : 'transparent'}
      color="brand.contrast"
      fontSize="10px"
      transition="background 0.2s, border-color 0.2s"
    >
      {active ? <LuCheck strokeWidth={3} /> : null}
    </Flex>
    {children}
  </Flex>
);
