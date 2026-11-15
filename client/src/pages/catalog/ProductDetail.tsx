import { Box, Flex, IconButton, Spinner, Stack, Text } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';
import { LuChevronRight, LuTriangleAlert, LuX } from 'react-icons/lu';
import { useQueries } from '@tanstack/react-query';
import { Product, productQuery, useProduct } from '@/api/gateway';
import { Code, Leader, Mono, Num, Stamp, Tone } from '@/components/kit';
import { CopyButton } from '../agents/CopyButton';
import { DotLabel } from './cells';
import { PRODUCT_FILE, unitWord, categoryLabel, eur, fmt, lacsOf, priceOf, salesUnitText } from './format';

const NUTRIENTS: [string, string, string, number][] = [
  ['energyKj', 'Energy', 'kJ', 0],
  ['fat', 'Fat', 'g', 1],
  ['carbs', 'Carbs', 'g', 1],
  ['sugars', 'Sugars', 'g', 1],
  ['protein', 'Protein', 'g', 1],
  ['salt', 'Salt', 'g', 1],
];

const temperature: Record<string, string> = { chilled: 'Chilled', frozen: 'Frozen', ambient: 'Ambient' };

export const ProductDetail = ({
  code,
  catalog,
  onClose,
  onSelect,
}: {
  code: string;
  catalog: Product[];
  onClose: () => void;
  onSelect: (code: string) => void;
}) => {
  const q = useProduct(code);
  if (!q.data)
    return (
      <Stack padding={5} gap={3}>
        <Flex justify="flex-end">
          <IconButton aria-label="Close" variant="ghost" size="xs" color="fg.muted" onClick={onClose}>
            <LuX />
          </IconButton>
        </Flex>
        {q.error ? (
          <Flex gap={2} color="status.blocked" fontSize="13px">
            <LuTriangleAlert />
            <Text>
              Could not load {code} — {q.error.message}
            </Text>
          </Flex>
        ) : (
          <Flex justify="center" paddingY={10} color="fg.subtle">
            <Spinner size="sm" />
          </Flex>
        )}
      </Stack>
    );
  return <Detail product={q.data} catalog={catalog} onClose={onClose} onSelect={onSelect} />;
};

const Detail = ({
  product: p,
  catalog,
  onClose,
  onSelect,
}: {
  product: Product;
  catalog: Product[];
  onClose: () => void;
  onSelect: (code: string) => void;
}) => {
  const [details, setDetails] = useState(false);
  const lacs = lacsOf(p);
  // Substitutes may be outside the loaded page of the catalog: fetch their names.
  const subQueries = useQueries({ queries: p.valioSubstitutes.map((c) => productQuery(c)) });
  const subs = p.valioSubstitutes.map((c, i) => catalog.find((x) => x.code === c) ?? subQueries[i]?.data ?? c);
  const subFor = catalog.filter((x) => x.valioSubstitutes.includes(p.code));
  const missing = [p.allergens === null ? 'allergen data' : null, lacs === null ? 'a lactose value' : null].filter(Boolean).join(' and ');
  const price = priceOf(p);
  const allergens = allergenGroups(p);

  return (
    <Box>
      <Box
        paddingX={6}
        paddingTop={5}
        paddingBottom={4}
        position="sticky"
        top={0}
        bg="bg.panel"
        zIndex={1}
        borderBottomWidth="1px"
        borderColor="border.strong"
      >
        <Flex align="center" gap={2}>
          <Text textStyle="caps" color="fg.subtle">
            Specification
          </Text>
          <Text fontFamily="mono" fontSize="11.5px" color="fg" className="tnum">
            No. {p.code}
          </Text>
          {p.sample ? (
            <Text textStyle="caps" color="fg.subtle">
              · sample row
            </Text>
          ) : null}
          <Box flex={1} />
          <IconButton aria-label="Close" variant="ghost" size="xs" color="fg.muted" marginRight={-1.5} onClick={onClose}>
            <LuX />
          </IconButton>
        </Flex>
        <Text textStyle="title" marginTop={1.5}>
          {p.name}
        </Text>
        {p.names?.fi && p.names.fi !== p.name ? (
          <Text fontSize="13.5px" color="fg.subtle" marginTop={0.5} lang="fi">
            {p.names.fi}
          </Text>
        ) : null}
        <Text textStyle="caps" color="fg.subtle" marginTop={2}>
          {[categoryLabel(p.category), temperature[p.temperatureClass] ?? p.temperatureClass].filter(Boolean).join(' · ')}
        </Text>
      </Box>

      <Box paddingX={6} paddingTop={5}>
        <Flex align="center" gap={3}>
          {p.flags.autoSelectable ? (
            <>
              <Stamp tone="auto">
                Agent may pick
              </Stamp>
              <Text fontSize="12.5px" color="fg.muted">
                An agent may pick this product on its own.
              </Text>
            </>
          ) : (
            <>
              <Stamp tone="pending">
                Needs a person
              </Stamp>
              <Text fontSize="12.5px" color="fg.muted">
                No {missing || 'complete data'} — a person must approve it.
              </Text>
            </>
          )}
        </Flex>
        <KeyFigures product={p} lacs={lacs} />
      </Box>

      <Box paddingX={6} paddingBottom={6}>
        <Box>
          <Fact label="Sales unit">
            {salesUnitText(p)}
            {p.salesUnit?.variableWeight ? <Sub>Variable weight — invoiced by actual kg</Sub> : null}
            {p.flags.measure ? <Sub>No litre or kg content in the file — ordered in pieces</Sub> : null}
            {p.packaging && (p.packaging.perCase > 1 || p.packaging.perPallet) ? (
              <Sub>
                {[
                  p.packaging.perCase > 1 ? `${fmt(p.packaging.perCase)} per case` : null,
                  p.packaging.perPallet ? `${fmt(p.packaging.perPallet)} per pallet` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Sub>
            ) : null}
          </Fact>
          <Fact label="Price">
            {price.amount === null ? (
              <>
                <Text as="span" color="fg.muted">
                  Price on quote
                </Text>
                <Sub>
                  {price.source === 'not-fetched' ? 'Valio gives no list price yet.' : 'Valio prices this product when it’s quoted.'}
                </Sub>
              </>
            ) : (
              <>
                <Num>{eur(price.amount)}</Num> per {price.per}
                <Sub>
                  {[
                    price.perBase !== null && p.salesUnit ? `${eur(price.perBase)}/${p.salesUnit.baseUnit}` : null,
                    price.source === 'live' ? 'price from Valio, live' : price.source === 'simulated' ? 'simulated' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Sub>
              </>
            )}
          </Fact>
          <Fact label="Lactose">
            {lacs === null ? (
              <Text as="span" color="status.pending">
                Unknown — no LACS value
              </Text>
            ) : (
              <>
                {lacs === 0 ? 'Lactose-free' : 'Contains lactose'}
                <Sub>
                  LACS <Num>{lacs.toFixed(1)}</Num> g/100 g — the lactose rule reads this, not allergen codes
                </Sub>
              </>
            )}
          </Fact>
          <Fact label="Allergens">
            {p.allergens === null && !allergens.contains.length && !allergens.mayContain.length ? (
              <Text as="span" color="status.pending">
                Missing from the product file
              </Text>
            ) : (
              <Stack gap={2.5}>
                <Box>
                  <Sub>Contains</Sub>
                  {allergens.contains.length ? <AllergenStamps list={allergens.contains} tone="running" /> : 'None declared'}
                </Box>
                {allergens.mayContain.length ? (
                  <Box>
                    <Sub>May contain (traces)</Sub>
                    <AllergenStamps list={allergens.mayContain} tone="idle" />
                  </Box>
                ) : null}
              </Stack>
            )}
          </Fact>
          <Fact label="Origin">
            {p.origin ? (
              countryName(p.origin)
            ) : (
              <Text as="span" color="fg.subtle">
                Unknown
              </Text>
            )}
          </Fact>
          <Fact label="Vendor">
            {[p.vendor, p.brand && p.brand !== p.vendor ? `brand ${p.brand}` : null].filter(Boolean).join(' · ') || (
              <Text as="span" color="fg.subtle">
                Unknown
              </Text>
            )}
          </Fact>
          <Fact label="Substitutes">
            {subs.length ? (
              <Stack gap={1}>
                {subs.map((s) => (
                  <ProductLink
                    key={typeof s === 'string' ? s : s.code}
                    product={s}
                    onClick={() => onSelect(typeof s === 'string' ? s : s.code)}
                  />
                ))}
              </Stack>
            ) : (
              <Text as="span" color="fg.subtle">
                None defined by Valio
              </Text>
            )}
            {subFor.length ? (
              <Box marginTop={2}>
                <Sub>Substitute for</Sub>
                <Stack gap={1} marginTop={1}>
                  {subFor.map((s) => (
                    <ProductLink key={s.code} product={s} onClick={() => onSelect(s.code)} />
                  ))}
                </Stack>
              </Box>
            ) : null}
          </Fact>
          <Fact label="Delivery">
            {p.deliveryReliability !== null && p.deliveryReliability !== undefined ? (
              <>
                <Num>{Math.round(p.deliveryReliability * 100)} %</Num> delivered in full and on time
              </>
            ) : (
              <Text as="span" color="fg.subtle">
                No delivery history
              </Text>
            )}
          </Fact>
          <Fact label="Carbon">
            {p.co2eKgPerKg !== null && p.co2eKgPerKg !== undefined ? (
              <>
                <Num>{p.co2eKgPerKg.toFixed(1)}</Num> kg CO₂e/kg
                <Sub>Product-group figure</Sub>
              </>
            ) : (
              <Text as="span" color="fg.subtle">
                No figure
              </Text>
            )}
          </Fact>
        </Box>

        <Flex
          as="button"
          align="center"
          gap={1.5}
          marginTop={6}
          textStyle="caps"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: 'fg' }}
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
        >
          <Box transform={details ? 'rotate(90deg)' : undefined} transition="transform 0.15s">
            <LuChevronRight />
          </Box>
          Details
        </Flex>
        {details ? <MoreDetails product={p} /> : null}
      </Box>
    </Box>
  );
};

/** Secondary facts: nutrition, unit conversion, carbon, data completeness and the raw JSON the agent receives. */
const MoreDetails = ({ product: p }: { product: Product }) => {
  const json = JSON.stringify(p, null, 2);
  const lacs = lacsOf(p);
  const nutrition = p.nutritionPer100g;
  const other = nutrition ? NUTRIENTS.filter(([k]) => typeof nutrition[k] === 'number') : [];
  const checks: [string, boolean][] = [
    ['LACS value', lacs !== null],
    ['Allergen codes', p.allergens !== null],
    ['Nutrition values', other.length > 0],
    ['Unit conversions', !!p.salesUnit && p.salesUnit.contains > 0],
    ['Delivery reliability', p.deliveryReliability !== null],
  ];
  return (
    <Stack gap={5} marginTop={4}>
      <Block title="Nutrition per 100 g">
        {nutrition && other.length ? (
          <Stack gap={1.5}>
            {lacs !== null ? <Leader label="Lactose (LACS)" value={`${fmt(lacs, 1)} g`} /> : null}
            {other.map(([k, label, unit, d]) => (
              <Leader key={k} label={label} value={`${fmt(nutrition[k], d)} ${unit}`} />
            ))}
          </Stack>
        ) : (
          <Text fontSize="13px" color="fg.subtle">
            Not in the product file.
          </Text>
        )}
        {lacs === 0 && p.allergens?.includes('AM') ? (
          <Text fontSize="12.5px" color="fg.subtle" marginTop={1}>
            Still tagged AM (milk) — lactose-free isn’t an allergen code; the rule reads LACS = 0.
          </Text>
        ) : null}
      </Block>
      <Block title="Unit conversion">
        <Conversion product={p} />
      </Block>
      <Block title="Data completeness">
        <Stack gap={1}>
          {checks.map(([label, ok]) => (
            <DotLabel key={label} color={ok ? 'status.auto' : 'status.pending'} muted={ok}>
              {label} {ok ? 'present' : 'missing — fails closed'}
            </DotLabel>
          ))}
        </Stack>
        {p.allergens === null ? (
          <Text fontSize="12.5px" color="fg.subtle" marginTop={2}>
            Like {Math.round(PRODUCT_FILE.withoutAllergens * 100)} % of the Valio product file.
          </Text>
        ) : null}
      </Block>
      <Block title="What the agent receives" action={<CopyButton value={json} label="Product JSON copied" />}>
        <Text fontSize="12.5px" color="fg.subtle" marginBottom={2}>
          <Mono>get_product</Mono> and <Mono>search_products</Mono> return exactly this — missing fields stay <Mono>null</Mono>, never
          guessed.
        </Text>
        <Box css={{ '& pre': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}>
          <Code maxHeight="420px">{json}</Code>
        </Box>
      </Block>
    </Stack>
  );
};

/** How a typical request ("1,000 l", "100 kg") becomes whole sales units — the gateway always rounds up. */
const Conversion = ({ product: p }: { product: Product }) => {
  if (!p.salesUnit || !(p.salesUnit.contains > 0))
    return (
      <Text fontSize="13px" color="fg.subtle">
        The product file doesn’t say how much one {p.salesUnit?.unit ?? 'unit'} holds — orders go in whole sales units.
      </Text>
    );
  const base = p.salesUnit.baseUnit;
  const want = base === 'l' ? 1000 : base === 'kg' ? 100 : 100;
  const units = Math.ceil(want / p.salesUnit.contains - 1e-9);
  const delivered = Math.round(units * p.salesUnit.contains * 1000) / 1000;
  const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? '' : w.endsWith('x') ? 'es' : 's'}`;
  const amount = priceOf(p).amount;
  return (
    <Text fontSize="13px" color="fg.muted" lineHeight="1.6">
      An order for {fmt(want)} {base} becomes {plural(units, unitWord(p.salesUnit.unit))}
      {delivered === want ? ' — exact.' : ` (${fmt(delivered, delivered % 1 ? 1 : 0)} ${base}, rounded up).`}
      {amount !== null ? ` At list price ${eur(units * amount)}.` : ''}
    </Text>
  );
};

/** CONTAINS vs MAY_CONTAIN, from whichever shape the server sends. */
const allergenGroups = (p: Product) => {
  const contains: string[] = [];
  const mayContain: string[] = [];
  if (p.allergenDetails?.length) {
    for (const a of p.allergenDetails) {
      const label = a.label ? `${a.label} (${a.code})` : a.code;
      if (/may/i.test(a.level)) mayContain.push(label);
      else if (/contain/i.test(a.level)) contains.push(label);
    }
    return { contains, mayContain };
  }
  (p.allergens ?? []).forEach((c, i) => contains.push(p.allergenLabels?.[i] ? `${p.allergenLabels[i]} (${c})` : c));
  (p.mayContain ?? []).forEach((c, i) => mayContain.push(p.mayContainLabels?.[i] ? `${p.mayContainLabels[i]} (${c})` : c));
  return { contains, mayContain };
};

const COUNTRIES: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  DK: 'Denmark',
  NO: 'Norway',
  EE: 'Estonia',
  DE: 'Germany',
  NL: 'Netherlands',
  IT: 'Italy',
  FR: 'France',
  ES: 'Spain',
  PL: 'Poland',
  LT: 'Lithuania',
  LV: 'Latvia',
  BE: 'Belgium',
  AT: 'Austria',
  GR: 'Greece',
  IE: 'Ireland',
  GB: 'United Kingdom',
  US: 'United States',
};
const countryName = (code: string) => (COUNTRIES[code.toUpperCase()] ? `${COUNTRIES[code.toUpperCase()]} (${code.toUpperCase()})` : code);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <Flex gap={4} paddingY={3} borderBottomWidth="1px" borderColor="border" fontSize="13.5px">
    <Text width="96px" flexShrink={0} textStyle="caps" color="fg.subtle" paddingTop="3px">
      {label}
    </Text>
    <Box flex={1} minWidth={0}>
      {children}
    </Box>
  </Flex>
);

const Sub = ({ children }: { children: ReactNode }) => (
  <Text fontSize="12px" color="fg.subtle" marginTop="1px">
    {children}
  </Text>
);

/** A section of the sheet: caps rubric with a hairline running right. */
const Block = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <Box>
    <Flex align="center" gap={3} marginBottom={2.5} minHeight="24px">
      <Text textStyle="caps" color="fg.subtle" flexShrink={0}>
        {title}
      </Text>
      <Box flex={1} height="1px" bg="border" />
      {action}
    </Flex>
    {children}
  </Box>
);

/** The three numbers a buyer reads first, as dot-matrix readouts: price, LACS, delivery. */
const KeyFigures = ({ product: p, lacs }: { product: Product; lacs: number | null }) => {
  const price = priceOf(p);
  const rel = p.deliveryReliability;
  const cells: [string, string, string, string?][] = [
    ['List price', price.amount === null ? '—' : eur(price.amount), price.amount === null ? 'on quote' : `per ${price.per}`],
    [
      'LACS',
      lacs === null ? '?' : fmt(lacs, 1),
      lacs === null ? 'unknown' : 'g / 100 g',
      lacs === null ? 'status.pending' : lacs === 0 ? 'status.auto' : undefined,
    ],
    ['Delivery', rel === null || rel === undefined ? '—' : `${Math.round(rel * 100)}%`, 'in full, on time'],
  ];
  return (
    <Box
      display="grid"
      gridTemplateColumns="repeat(3, minmax(0, 1fr))"
      marginTop={5}
      marginBottom={2}
      borderTopWidth="1px"
      borderBottomWidth="1px"
      borderColor="border"
    >
      {cells.map(([label, value, unit, color], i) => (
        <Box key={label} paddingY={3} paddingLeft={i ? 4 : 0} borderLeftWidth={i ? '1px' : 0} borderColor="border.muted" minWidth={0}>
          <Text textStyle="caps" color="fg.subtle">
            {label}
          </Text>
          <Text fontFamily="dot" fontWeight="800" fontSize="30px" letterSpacing="0" lineHeight="1.1" marginTop={1} color={color} className="tnum" truncate>
            {value}
          </Text>
          <Text fontSize="11.5px" color="fg.subtle" truncate>
            {unit}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

/** Allergens as small rubber stamps: ink for "contains", grey for traces. */
const AllergenStamps = ({ list, tone }: { list: string[]; tone: Tone }) => (
  <Flex gap={1.5} wrap="wrap" marginTop={1}>
    {list.map((a) => (
      <Stamp key={a} tone={tone}>
        {a}
      </Stamp>
    ))}
  </Flex>
);

const ProductLink = ({ product: s, onClick }: { product: Product | string; onClick: () => void }) => (
  <Box
    as="button"
    textAlign="left"
    cursor="pointer"
    color="brand.fg"
    _hover={{ textDecoration: 'underline' }}
    onClick={onClick}
    display="block"
  >
    {typeof s === 'string' ? (
      <Mono>{s}</Mono>
    ) : (
      <>
        {s.name}{' '}
        <Text as="span" fontFamily="mono" fontSize="12px" color="fg.subtle">
          {s.code}
        </Text>
      </>
    )}
  </Box>
);
