// "Test with an order": one sample request dry-run against the rules in effect
// (POST /orders/preview with policyId), in words. A change is in effect — and re-tested — at once.
import { Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OrderPreview, PolicyPreviewBody, Unit, usePreviewPolicyOrder, useProduct } from '@/api/gateway';
import { errorText, shortName } from '@/pages/home/format';
import { BuilderLine, headline, newKey } from '@/pages/workspace/request';
import { fmtDay, num } from '../graph';
import { StatusText } from '../quiet';

/** Monday after today (Helsinki), as YYYY-MM-DD. */
export const nextMonday = () => {
  const today = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' }) + 'T12:00:00Z');
  const add = (8 - today.getUTCDay()) % 7 || 7;
  return new Date(today.getTime() + add * 864e5).toISOString().slice(0, 10);
};

export type TestRequest = { lines: BuilderLine[]; date: string; agentId: string | null; allowSubstitutes: boolean };

export const defaultTestRequest = (): TestRequest => ({
  lines: [{ key: newKey(), code: '464398', name: '464398', quantity: 1000, unit: 'l', options: [] }],
  date: nextMonday(),
  agentId: null,
  allowSubstitutes: true,
});

/** Fills in product names the default request only knows by code. */
export const useNamedLines = (lines: BuilderLine[]) => {
  const first = lines.find((l) => l.name === l.code)?.code;
  const product = useProduct(first);
  return useMemo(
    () =>
      lines.map((l) =>
        product.data && l.code === product.data.code && l.name === l.code
          ? { ...l, name: product.data.name, salesUnit: product.data.salesUnit.unit }
          : l
      ),
    [lines, product.data]
  );
};

export type TestResults = {
  signed: OrderPreview | null;
  checking: boolean;
  error: string | null;
  /** The request is complete enough to run. */
  ready: boolean;
};

/**
 * Runs the test request against the version in effect (`signedId` — a new id per signed version,
 * so a change re-runs it), debounced, with a stale-response guard (same pattern as the order
 * workspace). Previews never invalidate other queries.
 */
export const useTestRuns = (req: TestRequest, agentId: string | null, signedId: string | null): TestResults => {
  const { mutateAsync: preview } = usePreviewPolicyOrder();
  const valid = req.lines.filter((l) => l.code && Number.isFinite(l.quantity) && l.quantity > 0);
  const body = useMemo<Omit<PolicyPreviewBody, 'policyId'> | null>(
    () =>
      agentId && valid.length && /^\d{4}-\d{2}-\d{2}$/.test(req.date)
        ? {
            agentId,
            lines: valid.map((l) => ({ code: l.code, quantity: l.quantity, unit: l.unit as Unit })),
            requestedDate: req.date,
            allowSubstitutes: req.allowSubstitutes,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, JSON.stringify(valid.map((l) => [l.code, l.quantity, l.unit])), req.date, req.allowSubstitutes]
  );
  const key = body && signedId ? JSON.stringify([body, signedId]) : null;
  const [result, setResult] = useState<{ key: string; signed: OrderPreview } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!body || !key || !signedId) {
      seq.current++;
      return;
    }
    const t = setTimeout(() => {
      const mine = ++seq.current;
      preview({ ...body, policyId: signedId })
        .then((signed) => mine === seq.current && setResult({ key, signed }))
        .catch((err) => mine === seq.current && setError({ key, message: errorText(err) }));
    }, 600);
    return () => clearTimeout(t);
  }, [body, key, signedId, preview]);

  const current = result && result.key === key ? result : null;
  // Keep showing the last answer while a new one is on its way.
  const shown = body ? (current ?? result) : null;
  return {
    signed: shown?.signed ?? null,
    checking: !!key && !current && error?.key !== key,
    error: key && error?.key === key ? error.message : null,
    ready: !!body,
  };
};

/** "Would need Mikko — over €1,200 per order" style words for one preview. */
const outcome = (p: OrderPreview) => headline(p);

type CardProps = {
  req: TestRequest;
  results: TestResults;
  /** The version in effect. */
  version: number | null;
  /** A change is being applied (or typed and about to be). */
  applying: boolean;
  /** The edit on screen can't be applied as it stands. */
  invalid: boolean;
  onChange: () => void;
  changing: boolean;
};

/** Floating card on the canvas: the sample order and what the rules in effect do with it. */
export const TestCard = ({ req, results, version, applying, invalid, onChange, changing }: CardProps) => {
  const { signed, checking, error, ready } = results;
  const what = req.lines
    .filter((l) => l.code)
    .map((l) => `${num(l.quantity)} ${l.unit} ${shortName(l.name)}`)
    .join(' + ');

  return (
    <Box
      position="absolute"
      bottom={4}
      left="60px"
      zIndex={5}
      width="460px"
      bg="bg.panel"
      borderWidth="1px"
      borderTopWidth="2px"
      borderColor={changing ? 'brand.accent' : 'border'}
      borderTopColor={changing ? 'brand.accent' : 'border.strong'}
      borderRadius="l2"
      boxShadow="float"
      paddingX={4}
      paddingTop={2.5}
      paddingBottom={3}
    >
      <Flex align="center" gap={2}>
        <Text textStyle="caps" color="fg.subtle">
          Test with an order
        </Text>
        {checking ? <Spinner size="xs" color="fg.subtle" /> : null}
        <Box flex={1} />
        <Button size="2xs" variant="ghost" color="brand.fg" marginRight={-2} onClick={onChange}>
          {changing ? 'Done' : 'Change order'}
        </Button>
      </Flex>
      <Text fontWeight="550" letterSpacing="-0.02em" fontSize="18px" lineHeight="1.25" marginTop={0.5} truncate title={what}>
        {what || 'No products'}
        {req.date ? ` · ${fmtDay(req.date)}` : ''}
      </Text>

      <Stack gap={1.5} marginTop={2.5} paddingTop={2.5} borderTopWidth="1px" borderColor="border">
        {!ready ? (
          <Text fontSize="12.5px" color="fg.subtle">
            Add a product and a delivery date to test.
          </Text>
        ) : error ? (
          <StatusText tone="blocked" size="12.5px">
            Couldn’t test — {error}
          </StatusText>
        ) : (
          <>
            {version !== null ? <ResultRow label={`in effect v${version}`} preview={signed} /> : null}
            {invalid ? (
              <Text fontSize="12px" color="status.blocked">
                Fix the rule marked in red — it applies once it’s valid.
              </Text>
            ) : applying ? (
              <Text fontSize="12px" color="fg.subtle">
                Applying your change…
              </Text>
            ) : (
              <Text fontSize="12px" color="fg.subtle">
                Change a rule: it takes effect at once, signed by you, and this order is checked again.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};

const ResultRow = ({ label, preview }: { label: string; preview: OrderPreview | null }) => {
  const h = preview ? outcome(preview) : null;
  return (
    <Flex align="start" gap={3}>
      <Text fontSize="11.5px" color="fg.muted" width="72px" flexShrink={0} marginTop="1px" className="tnum">
        {label}
      </Text>
      {h ? (
        <Box minWidth={0} flex={1} title={`${h.label} — ${h.detail}`}>
          <StatusText tone={h.tone} size="12.5px">
            <Text as="span" lineClamp={2}>
              <Text as="span" color="fg" fontWeight="500">
                {short(h.label)}
              </Text>
              {h.tone === 'auto' ? ' · ' : ' — '}
              {h.detail}
            </Text>
          </StatusText>
        </Box>
      ) : (
        <Text fontSize="12.5px" color="fg.subtle">
          Checking…
        </Text>
      )}
    </Flex>
  );
};

/** "Would need Mikko’s approval" → "Needs Mikko"; "Would go through on its own" → "Goes through on its own". */
const short = (label: string) =>
  label
    .replace(/^Would need (.+)’s approval$/, 'Needs $1')
    .replace(/^Would need approval$/, 'Needs approval')
    .replace(/^Would go through/, 'Goes through')
    .replace(/^Would be blocked$/, 'Blocked');
