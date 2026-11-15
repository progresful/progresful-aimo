import { Box, Button, Flex, IconButton, Input, NativeSelect, Stack, Switch, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuArrowDown, LuArrowUp, LuCheck, LuPlus, LuTrash2 } from 'react-icons/lu';
import type { Check, PolicyRule } from '@/api/gateway';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  ATTRIBUTES,
  CATEGORY_OPTIONS,
  COUNTRIES,
  DAY_NAMES,
  NUTRIENTS,
  attributeMeta,
  describeRule,
  ruleSentence,
} from '@/pages/policies/visuals';
import { Details } from '../quiet';
import { CheckRow, SheetHead } from '../Inspector';
import { StatusText } from '../quiet';
import { kindLabel } from '../visuals';
import { Num, Section } from '@/components/kit';
import { EditorGraph, rekeyNutrition, ruleNodeId, rulesOfStep } from './model';

type Props = {
  stepId: string;
  graph: EditorGraph;
  rules: PolicyRule[];
  /** The rules before the latest change (or the edit being made), for "Before this change". */
  signedRules: PolicyRule[] | null;
  problems: Record<string, string>;
  /** Checks from the test run, to show what this rule did to the test order. */
  checks: Check[] | null;
  /** New rules; `select` moves the selection when a rule's key changed (nutrition keys follow the nutrient). */
  onRules: (rules: PolicyRule[], select?: string) => void;
  onClose: () => void;
};

const FIXED_NOTE: Record<string, string> = {
  request:
    'Where every order starts. The agent sends what the kitchen needs; limits always come from the signed policy, never from the agent.',
  lookup: 'Fixed list prices from Valio Aimo, as a signed quote. Not part of the policy — it is how the gateway works.',
  stock:
    'Checks every line against the delivery date. A shortfall goes to Substitutes. The policy can also say which days deliveries may come.',
  order: 'Places the order at the quoted prices once everything above passes, or once a person approves.',
  audit: 'Every step is written to a log shared with Valio. Always on.',
};

/** Side panel in edit mode: the form for one step's rule(s). */
export const RulePanel = ({ stepId, graph, rules, signedRules, problems, checks, onRules, onClose }: Props) => {
  const step = graph.steps.find((s) => s.id === stepId);
  if (!step) return null;
  const own = step.ruleKey ? rules.filter((r) => r.key === step.ruleKey) : rulesOfStep(rules, stepId);

  const put = (next: PolicyRule) => onRules(rules.map((r) => (r.key === next.key ? next : r)));
  const replace = (before: PolicyRule, next: PolicyRule) => {
    const keyed = rekeyNutrition(
      next,
      rules.filter((r) => r !== before)
    );
    onRules(
      rules.map((r) => (r === before ? keyed : r)),
      keyed.key !== before.key ? ruleNodeId(keyed.key) : undefined
    );
  };
  const remove = (key: string) => onRules(rules.filter((r) => r.key !== key));
  const add = (r: PolicyRule) => onRules([...rules, r]);

  let form: ReactNode = null;
  if (step.ruleKey && own[0]) form = <ProductRuleForm rule={own[0]} onChange={(n) => replace(own[0], n)} />;
  else if (stepId === 'policy') form = <LimitsForm rules={rules} put={put} add={add} remove={remove} />;
  else if (stepId === 'stock') form = <DeliveryDaysForm rules={rules} put={put} add={add} remove={remove} />;
  else if (stepId === 'substitutes') form = <SubstitutesForm rules={rules} put={put} add={add} />;
  else if (stepId === 'approval') form = <ApprovalForm rules={rules} put={put} add={add} />;

  const ownChecks = (checks ?? []).filter((c) => own.some((r) => r.key === c.rule));
  const before = own.map((r) => ({ now: r, was: signedRules?.find((b) => b.key === r.key) ?? null }));
  const changed = signedRules ? before.filter(({ now, was }) => !was || ruleSentence(was) !== ruleSentence(now)) : [];
  const removed = signedRules && stepId !== 'substitutes' && !step.ruleKey ? rulesOfStepRemoved(signedRules, rules, stepId) : [];

  return (
    <Stack gap={5} padding={5}>
      <SheetHead
        eyebrow={
          step.ruleKey ? (
            'Rule of the mandate'
          ) : (
            <>
              Step <Num>{step.no}</Num> · {form ? 'settings from the policy' : `${kindLabel[step.kind]} · fixed`}
            </>
          )
        }
        clause={step.ruleKey ? step.no : undefined}
        title={step.title}
        onClose={onClose}
      />

      {form ? (
        <>
          {FIXED_NOTE[stepId] && !step.ruleKey ? (
            <Text color="fg.muted" fontSize="13px" lineHeight="1.6">
              {FIXED_NOTE[stepId]}
            </Text>
          ) : null}
          <Stack gap={1.5}>
            {own.map((r) => (
              <Text key={r.key} fontSize="15px" lineHeight="1.5">
                {ruleSentence(r)}
              </Text>
            ))}
            {own.map((r) =>
              problems[r.key] ? (
                <StatusText key={`p-${r.key}`} tone="blocked" size="12.5px">
                  {problems[r.key]}
                </StatusText>
              ) : null
            )}
          </Stack>
          <Box borderTopWidth="1px" borderColor="border" paddingTop={4}>
            {form}
          </Box>
        </>
      ) : (
        <Text color="fg.muted" fontSize="13px" lineHeight="1.6">
          {FIXED_NOTE[stepId] ?? step.description}
        </Text>
      )}

      {changed.length || removed.length ? (
        <Section title="Before this change">
          <Stack gap={1}>
            {changed.map(({ now, was }) => (
              <Text key={now.key} fontSize="12.5px" color="fg.subtle">
                {was ? ruleSentence(was) : 'Not there — this rule is new.'}
              </Text>
            ))}
            {removed.map((r) => (
              <Text key={r.key} fontSize="12.5px" color="fg.subtle" textDecoration="line-through">
                {ruleSentence(r)}
              </Text>
            ))}
          </Stack>
        </Section>
      ) : null}

      {ownChecks.length ? (
        <Section title="With the test order, it says">
          <Stack gap={2}>
            {ownChecks.map((c) => (
              <CheckRow key={c.rule} check={c} />
            ))}
          </Stack>
        </Section>
      ) : null}

      {step.deletable && step.ruleKey ? (
        <Box>
          <Button size="xs" variant="ghost" color="status.blocked" marginLeft={-2} onClick={() => remove(step.ruleKey!)}>
            <LuTrash2 /> Delete this rule
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
};

/** One rule's own fields, without the step around it (the order page's "Change" on a rule node). */
export const RuleForm = ({ rule, rules, onRules }: { rule: PolicyRule; rules: PolicyRule[]; onRules: (rules: PolicyRule[]) => void }) => {
  const put = (next: PolicyRule) => onRules(rules.map((r) => (r.key === next.key ? next : r)));
  const remove = (key: string) => onRules(rules.filter((r) => r.key !== key));
  const add = (r: PolicyRule) => onRules([...rules, r]);
  switch (rule.type) {
    case 'limit.perOrder':
    case 'limit.perWeek':
      return (
        <Stack gap={3}>
          <Field label={rule.type === 'limit.perOrder' ? 'Up to, each order' : 'Up to, each week'}>
            <Money label="Limit" value={Number(rule.max)} onChange={(n) => put({ ...rule, max: n })} />
          </Field>
          <Field label="When over">
            <Segmented
              label="When over"
              value={String(rule.over ?? 'needs_approval')}
              options={OVER_OPTIONS}
              onChange={(v) => put({ ...rule, over: v })}
            />
          </Field>
        </Stack>
      );
    case 'limit.perLine':
      return <PerLineBlock rule={rule} put={put} remove={remove} />;
    case 'delivery.days':
      return <DeliveryDaysForm rules={[rule]} put={put} add={add} remove={remove} />;
    case 'substitution':
    case 'substitution.rank':
      return <SubstitutesForm rules={rules} put={put} add={add} />;
    case 'approval':
      return <ApprovalForm rules={[rule]} put={put} add={add} />;
    default:
      return (
        <ProductRuleForm
          rule={rule}
          onChange={(n) =>
            onRules(
              rules.map((r) =>
                r === rule
                  ? rekeyNutrition(
                      n,
                      rules.filter((x) => x !== rule)
                    )
                  : r
              )
            )
          }
        />
      );
  }
};

const rulesOfStepRemoved = (signed: PolicyRule[], rules: PolicyRule[], stepId: string) =>
  rulesOfStep(signed, stepId).filter((s) => !rules.some((r) => r.key === s.key));

// --- Building blocks -----------------------------------------------------------------

const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <Box>
    <Text textStyle="caps" color="fg.subtle" marginBottom={2}>
      {label}
    </Text>
    {children}
    {hint ? (
      <Text fontSize="12px" color="fg.subtle" lineHeight="1.45" marginTop={1.5}>
        {hint}
      </Text>
    ) : null}
  </Box>
);

/** Two or three choices side by side; the chosen one is filled. */
export const Segmented = <T extends string | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <Flex
    role="radiogroup"
    aria-label={label}
    width="100%"
    maxWidth="360px"
    borderRadius="l2"
    borderWidth="1px"
    borderColor="border.emphasized"
    bg="bg.panel"
    overflow="hidden"
  >
    {options.map((o, i) => {
      const on = o.value === value;
      return (
        <Box
          as="button"
          key={String(o.value)}
          role="radio"
          aria-checked={on}
          flex={1}
          minWidth={0}
          paddingX={2}
          paddingY="6px"
          borderLeftWidth={i ? '1px' : 0}
          borderColor="border.emphasized"
          fontSize="12.5px"
          fontWeight={on ? '600' : '500'}
          lineHeight="1.3"
          textAlign="center"
          // The chosen one is inked in.
          bg={on ? 'bg.inverted' : 'transparent'}
          color={on ? 'fg.inverted' : 'fg.muted'}
          cursor="pointer"
          transition="background 0.2s, color 0.2s"
          _hover={on ? undefined : { color: 'fg', bg: 'bg.hover' }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Box>
      );
    })}
  </Flex>
);

/** A toggle chip for multi-selects (categories, allergens, fields). */
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <Box
    as="button"
    role="checkbox"
    aria-checked={on}
    onClick={onClick}
    display="inline-flex"
    alignItems="center"
    gap={1}
    paddingX={2}
    height="26px"
    borderRadius="l1"
    fontSize="12.5px"
    fontWeight={on ? '500' : '400'}
    borderWidth="1px"
    borderColor={on ? 'brand.accent' : 'border'}
    bg={on ? 'brand.subtle' : 'bg.panel'}
    color={on ? 'brand.fg' : 'fg.muted'}
    cursor="pointer"
    transition="border-color 0.2s, background 0.2s"
    _hover={{ borderColor: on ? 'brand.accent' : 'fg.subtle', color: on ? undefined : 'fg' }}
  >
    {on ? <LuCheck strokeWidth={3} size="11px" /> : null}
    {children}
  </Box>
);

const Money = ({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) => (
  <Flex align="center" gap={1.5}>
    <Text fontSize="13px" color="fg.subtle">
      €
    </Text>
    <Input
      size="sm"
      type="number"
      min={0}
      step={50}
      width="120px"
      borderRadius="l2"
      fontFamily="mono"
      fontSize="13px"
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  </Flex>
);

const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

const HARD_OPTIONS = [
  { value: true, label: 'Always enforced' },
  { value: false, label: 'Ask a person' },
];

// --- Product rules -----------------------------------------------------------------------

const ProductRuleForm = ({ rule: r, onChange }: { rule: PolicyRule; onChange: (r: PolicyRule) => void }) => {
  const f = r as Record<string, unknown>;
  switch (r.type) {
    case 'allergen.exclude': {
      const codes = arr(f.allergens);
      const shown = [...ALLERGEN_CODES, ...codes.filter((c) => !ALLERGEN_CODES.includes(c))];
      return (
        <Stack gap={5}>
          <Field
            label="Keep out products containing"
            hint="Read from the allergen codes Valio reports. A product with unknown allergens goes to a person."
          >
            <Flex gap={1.5} wrap="wrap">
              {shown.map((c) => (
                <Chip key={c} on={codes.includes(c)} onClick={() => onChange({ ...r, allergens: toggle(codes, c) })}>
                  {ALLERGEN_LABELS[c] ?? c}{' '}
                  <Text as="span" fontFamily="mono" fontSize="11px" opacity={0.7}>
                    {c}
                  </Text>
                </Chip>
              ))}
            </Flex>
          </Field>
          <Field label="When a product has one">
            <Segmented
              label="Enforcement"
              value={r.hard !== false}
              options={[
                { value: true, label: 'Block it' },
                { value: false, label: 'Ask a person' },
              ]}
              onChange={(v) => onChange({ ...r, hard: v })}
            />
          </Field>
        </Stack>
      );
    }
    case 'nutrition': {
      const nutrient = String(f.nutrient ?? 'LACS');
      const options = Object.keys(NUTRIENTS).includes(nutrient) ? Object.keys(NUTRIENTS) : [nutrient, ...Object.keys(NUTRIENTS)];
      return (
        <Stack gap={5}>
          <Field
            label="Every product must have"
            hint={
              nutrient === 'LACS'
                ? 'Read from the LACS nutrition value — lactose-free milk is still tagged with the milk allergen.'
                : 'Read from the product’s nutrition data per 100 g.'
            }
          >
            <Flex gap={2} align="center" wrap="wrap">
              <NativeSelect.Root size="sm" width="150px">
                <NativeSelect.Field
                  value={nutrient}
                  borderRadius="l2"
                  fontSize="13px"
                  aria-label="Nutrient"
                  onChange={(e) => onChange({ ...r, nutrient: e.target.value })}
                >
                  {options.map((n) => (
                    <option key={n} value={n}>
                      {NUTRIENTS[n] ?? n}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <NativeSelect.Root size="sm" width="72px">
                <NativeSelect.Field
                  value={String(f.operator ?? '=')}
                  borderRadius="l2"
                  fontSize="13px"
                  aria-label="Comparison"
                  onChange={(e) => onChange({ ...r, operator: e.target.value })}
                >
                  {['=', '<', '<=', '>', '>='].map((o) => (
                    <option key={o} value={o}>
                      {o === '<=' ? '≤' : o === '>=' ? '≥' : o}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Input
                size="sm"
                type="number"
                min={0}
                step={0.1}
                width="80px"
                borderRadius="l2"
                fontSize="13px"
                aria-label="Value"
                value={Number.isFinite(Number(f.value)) ? Number(f.value) : ''}
                onChange={(e) => onChange({ ...r, value: e.target.value === '' ? NaN : Number(e.target.value) })}
              />
              <NativeSelect.Root size="sm" width="104px">
                <NativeSelect.Field
                  value={String(f.unit ?? 'g/100g')}
                  borderRadius="l2"
                  fontSize="13px"
                  aria-label="Unit"
                  onChange={(e) => onChange({ ...r, unit: e.target.value })}
                >
                  {['g/100g', 'mg/kg', '%vol'].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Flex>
          </Field>
          <Field label="When a product fails it">
            <Segmented label="Enforcement" value={r.hard !== false} options={HARD_OPTIONS} onChange={(v) => onChange({ ...r, hard: v })} />
          </Field>
        </Stack>
      );
    }
    case 'category.allow': {
      const allow = arr(f.allow);
      const known = CATEGORY_OPTIONS.map(([c]) => c);
      const extra = allow.filter((c) => !known.includes(c));
      return (
        <Stack gap={5}>
          <Field label="The agent may buy">
            <Flex gap={1.5} wrap="wrap">
              {[...CATEGORY_OPTIONS, ...extra.map((c) => [c, c] as [string, string])].map(([code, label]) => (
                <Chip key={code} on={allow.includes(code)} onClick={() => onChange({ ...r, allow: toggle(allow, code) })}>
                  {label}
                </Chip>
              ))}
            </Flex>
          </Field>
          <Field label="Anything else">
            <Segmented
              label="Outside the categories"
              value={f.over === 'needs_approval' ? 'needs_approval' : 'block'}
              options={[
                { value: 'block', label: 'Rejected' },
                { value: 'needs_approval', label: 'Ask a person' },
              ]}
              onChange={(v) => {
                const next = { ...r } as Record<string, unknown>;
                if (v === 'block') delete next.over;
                else next.over = 'needs_approval';
                onChange(next as PolicyRule);
              }}
            />
          </Field>
        </Stack>
      );
    }
    case 'data.missing': {
      const fields = arr(f.fields);
      const options: [string, string][] = [
        ['nutrition.LACS', 'Lactose content'],
        ['allergens', 'Allergens'],
        ['nutrition.GLUTEN', 'Gluten content'],
      ];
      fields.filter((x) => !options.some(([k]) => k === x)).forEach((x) => options.push([x, x]));
      return (
        <Stack gap={5}>
          <Field label="If a product doesn’t report" hint="The gateway never guesses. Nutrients a rule reads are always required.">
            <Flex gap={1.5} wrap="wrap">
              {options.map(([k, label]) => (
                <Chip key={k} on={fields.includes(k)} onClick={() => onChange({ ...r, fields: toggle(fields, k) })}>
                  {label}
                </Chip>
              ))}
            </Flex>
          </Field>
          <Field label="Then">
            <Segmented
              label="On missing data"
              value={f.onMissing === 'block' ? 'block' : 'needs_approval'}
              options={[
                { value: 'needs_approval', label: 'Ask a person' },
                { value: 'block', label: 'Block it' },
              ]}
              onChange={(v) => onChange({ ...r, onMissing: v })}
            />
          </Field>
        </Stack>
      );
    }
    case 'product.attribute':
      return <AttributeForm rule={r} onChange={onChange} />;
    default:
      return (
        <Stack gap={3}>
          <Text fontSize="13px" color="fg.muted" lineHeight="1.6">
            This kind of rule can’t be edited here yet. It stays in the policy as it is; the gateway sends anything it can’t check to a
            person.
          </Text>
          <Details>
            <Text fontSize="12px" color="fg.subtle" fontFamily="mono" whiteSpace="pre-wrap" wordBreak="break-word">
              {describeRule(r).detail}
              {'\n\n'}
              {JSON.stringify(r, null, 2)}
            </Text>
          </Details>
        </Stack>
      );
  }
};

// --- Product attribute ------------------------------------------------------------------

const LIST_OPS = [
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is none of' },
];
const NUMBER_OPS = ['<=', '<', '=', '>=', '>'];
const opLabel = (o: string) => ({ '<=': 'at most', '<': 'under', '=': 'exactly', '>=': 'at least', '>': 'over', '!=': 'not' })[o] ?? o;

const ATTRIBUTE_OPTIONS: [string, string][] = [
  ...Object.entries(ATTRIBUTES).map(([k, m]) => [k, m.label] as [string, string]),
  ...Object.entries(NUTRIENTS).map(([k, label]) => [`nutrition.${k}`, `${label} (per 100 g)`] as [string, string]),
];

/** Known values to pick from, per attribute; others are typed. */
const VALUE_CHOICES: Record<string, [string, string][]> = {
  origin: Object.entries(COUNTRIES),
  temperatureClass: [
    ['chilled', 'Chilled'],
    ['ambient', 'Ambient'],
    ['frozen', 'Frozen'],
  ],
  categoryCode: CATEGORY_OPTIONS,
};

const listOf = (v: unknown) => (Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)]);

const AttributeForm = ({ rule: r, onChange }: { rule: PolicyRule; onChange: (r: PolicyRule) => void }) => {
  const f = r as Record<string, unknown>;
  const attribute = String(f.attribute ?? 'origin');
  const meta = attributeMeta(attribute);
  const numeric = meta.numeric;
  const op = String(f.operator ?? (numeric ? '<=' : 'in'));
  const listOp = op === '!=' || op === 'not_in' ? 'not_in' : 'in';
  const values = listOf(f.value);
  const choices = VALUE_CHOICES[attribute];
  const scope = (f.scope ?? {}) as { categories?: string[]; codes?: string[] };
  const options = ATTRIBUTE_OPTIONS.some(([k]) => k === attribute)
    ? ATTRIBUTE_OPTIONS
    : [[attribute, attribute] as [string, string], ...ATTRIBUTE_OPTIONS];

  const setAttribute = (next: string) => {
    const nextNumeric = attributeMeta(next).numeric;
    if (nextNumeric === numeric) return onChange({ ...r, attribute: next, ...(nextNumeric ? {} : { value: [] }) });
    onChange({
      ...r,
      attribute: next,
      operator: nextNumeric ? '<=' : 'in',
      value: nextNumeric ? (next === 'deliveryReliability' ? 0.9 : 1) : [],
    });
  };
  const setScope = (categories: string[]) => {
    const next = { ...r } as Record<string, unknown>;
    const s = { ...scope, categories };
    if (!s.categories.length) delete (s as { categories?: string[] }).categories;
    if (Object.keys(s).length) next.scope = s;
    else delete next.scope;
    onChange(next as PolicyRule);
  };
  const shownScope = [
    ...CATEGORY_OPTIONS,
    ...(scope.categories ?? []).filter((c) => !CATEGORY_OPTIONS.some(([k]) => k === c)).map((c) => [c, c] as [string, string]),
  ];

  return (
    <Stack gap={5}>
      <Field label="Check">
        <NativeSelect.Root size="sm" width="100%">
          <NativeSelect.Field
            value={attribute}
            borderRadius="l2"
            fontSize="13px"
            aria-label="Attribute"
            onChange={(e) => setAttribute(e.target.value)}
          >
            {options.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field>

      {numeric ? (
        <Field
          label="Must be"
          hint={
            attribute === 'deliveryReliability'
              ? 'Share of deliveries Valio makes on time, 0–1 (0.9 = 90 %).'
              : attribute === 'pricePerBase'
                ? 'The list price per litre or kilo, in euros.'
                : undefined
          }
        >
          <Flex gap={2} align="center">
            <NativeSelect.Root size="sm" width="110px">
              <NativeSelect.Field
                value={op}
                borderRadius="l2"
                fontSize="13px"
                aria-label="Comparison"
                onChange={(e) => onChange({ ...r, operator: e.target.value })}
              >
                {NUMBER_OPS.map((o) => (
                  <option key={o} value={o}>
                    {opLabel(o)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Input
              size="sm"
              type="number"
              step={attribute === 'deliveryReliability' ? 0.01 : 0.1}
              width="96px"
              borderRadius="l2"
              fontSize="13px"
              aria-label="Value"
              value={Number.isFinite(Number(f.value)) && f.value !== '' && !Array.isArray(f.value) ? Number(f.value) : ''}
              onChange={(e) => onChange({ ...r, value: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
            <Text fontSize="12.5px" color="fg.subtle">
              {attribute === 'deliveryReliability' ? '' : (meta.unit ?? '')}
            </Text>
          </Flex>
        </Field>
      ) : (
        <Field label="Allowed" hint={choices ? undefined : 'Separate several values with commas, as Valio writes them.'}>
          <Stack gap={2.5}>
            <Segmented
              label="Allowed or not"
              value={listOp}
              options={LIST_OPS}
              onChange={(v) => onChange({ ...r, operator: v, value: values })}
            />
            {choices ? (
              <Flex gap={1.5} wrap="wrap">
                {[...choices, ...values.filter((v) => !choices.some(([k]) => k === v)).map((v) => [v, v] as [string, string])].map(
                  ([code, label]) => (
                    <Chip
                      key={code}
                      on={values.includes(code)}
                      onClick={() => onChange({ ...r, operator: listOp, value: toggle(values, code) })}
                    >
                      {label}
                    </Chip>
                  )
                )}
              </Flex>
            ) : (
              <Input
                size="sm"
                borderRadius="l2"
                fontSize="13px"
                aria-label="Values"
                placeholder={attribute === 'vendor' ? 'e.g. Valio Oy' : 'e.g. milk.drink'}
                defaultValue={values.join(', ')}
                onChange={(e) =>
                  onChange({
                    ...r,
                    operator: listOp,
                    value: e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            )}
          </Stack>
        </Field>
      )}

      <Field label="Applies to" hint={(scope.categories ?? []).length ? undefined : 'All products. Pick categories to narrow it.'}>
        <Flex gap={1.5} wrap="wrap">
          {shownScope.map(([code, label]) => (
            <Chip key={code} on={(scope.categories ?? []).includes(code)} onClick={() => setScope(toggle(scope.categories ?? [], code))}>
              {label}
            </Chip>
          ))}
        </Flex>
        {scope.codes?.length ? (
          <Text fontSize="11.5px" color="fg.subtle" marginTop={1.5}>
            Also only for products {scope.codes.join(', ')}.
          </Text>
        ) : null}
      </Field>

      <Field label="When a product fails it">
        <Segmented label="Enforcement" value={r.hard !== false} options={HARD_OPTIONS} onChange={(v) => onChange({ ...r, hard: v })} />
      </Field>
      <Field label="If Valio doesn’t report it">
        <Segmented
          label="On missing data"
          value={f.onMissing === 'block' ? 'block' : f.onMissing === 'ignore' ? 'ignore' : 'needs_approval'}
          options={[
            { value: 'needs_approval', label: 'Ask a person' },
            { value: 'block', label: 'Block it' },
            { value: 'ignore', label: 'Let it through' },
          ]}
          onChange={(v) => onChange({ ...r, onMissing: v })}
        />
      </Field>
      <Field label="Name on the graph" hint="Optional.">
        <Input
          size="sm"
          borderRadius="l2"
          fontSize="13px"
          placeholder={meta.label}
          value={String(f.label ?? '')}
          onChange={(e) => onChange({ ...r, label: e.target.value || undefined })}
        />
      </Field>
    </Stack>
  );
};

// --- Fixed steps -------------------------------------------------------------------------

const OVER_OPTIONS = [
  { value: 'needs_approval', label: 'Ask a person' },
  { value: 'block', label: 'Block' },
];

const LimitsForm = ({
  rules,
  put,
  add,
  remove,
}: {
  rules: PolicyRule[];
  put: (r: PolicyRule) => void;
  add: (r: PolicyRule) => void;
  remove: (key: string) => void;
}) => {
  const per = rules.find((r) => r.type === 'limit.perOrder');
  const week = rules.find((r) => r.type === 'limit.perWeek');
  const lines = rules.filter((r) => r.type === 'limit.perLine');
  const block = (r: PolicyRule, label: string, unit: string) => (
    <Box key={r.key}>
      <Flex align="center" justify="space-between" marginBottom={2}>
        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="18px" lineHeight="1.2">
          {label}
        </Text>
        <Button size="2xs" variant="ghost" color="fg.subtle" onClick={() => remove(r.key)}>
          Remove
        </Button>
      </Flex>
      <Stack gap={3}>
        <Field label={`Up to, ${unit}`}>
          <Money label={label} value={Number(r.max)} onChange={(n) => put({ ...r, max: n })} />
        </Field>
        <Field label="When over">
          <Segmented
            label={`${label} when over`}
            value={String(r.over ?? 'needs_approval')}
            options={OVER_OPTIONS}
            onChange={(v) => put({ ...r, over: v })}
          />
        </Field>
      </Stack>
    </Box>
  );
  return (
    <Stack gap={5}>
      {per ? (
        block(per, 'Per order', 'each order')
      ) : (
        <Button
          size="xs"
          variant="outline"
          borderStyle="dashed"
          borderRadius="l2"
          color="brand.fg"
          alignSelf="start"
          onClick={() => add({ key: 'limit.perOrder', type: 'limit.perOrder', max: 1000, currency: 'EUR', over: 'needs_approval' })}
        >
          <LuPlus /> Add a per-order limit
        </Button>
      )}
      <Box borderTopWidth="1px" borderColor="border" />
      {week ? (
        block(week, 'Per week', 'Monday–Sunday, all agents together')
      ) : (
        <Button
          size="xs"
          variant="outline"
          borderStyle="dashed"
          borderRadius="l2"
          color="brand.fg"
          alignSelf="start"
          onClick={() =>
            add({ key: 'limit.perWeek', type: 'limit.perWeek', max: 5000, currency: 'EUR', window: 'iso_week', over: 'needs_approval' })
          }
        >
          <LuPlus /> Add a weekly limit
        </Button>
      )}
      <Box borderTopWidth="1px" borderColor="border" />
      {lines.map((l) => (
        <PerLineBlock key={l.key} rule={l} put={put} remove={remove} />
      ))}
      <Button
        size="xs"
        variant="outline"
        borderStyle="dashed"
        borderRadius="l2"
        color="brand.fg"
        alignSelf="start"
        onClick={() => {
          let key = 'limit.perLine';
          for (let i = 2; rules.some((r) => r.key === key); i++) key = `limit.perLine.${i}`;
          add({ key, type: 'limit.perLine', max: 200, unit: 'l', over: 'needs_approval' });
        }}
      >
        <LuPlus /> Add a per-line limit
      </Button>
    </Stack>
  );
};

const LINE_UNITS = [
  { value: 'l', label: 'litres' },
  { value: 'kg', label: 'kg' },
  { value: 'pcs', label: 'pieces' },
  { value: 'EUR', label: '€' },
];

const PerLineBlock = ({ rule: r, put, remove }: { rule: PolicyRule; put: (r: PolicyRule) => void; remove: (key: string) => void }) => {
  const scope = (r.scope ?? {}) as { categories?: string[]; codes?: string[] };
  const cats = scope.categories ?? [];
  const setCats = (categories: string[]) => {
    const next = { ...r } as Record<string, unknown>;
    const s = { ...scope, categories };
    if (!categories.length) delete (s as { categories?: string[] }).categories;
    if (Object.keys(s).length) next.scope = s;
    else delete next.scope;
    put(next as PolicyRule);
  };
  return (
    <Box>
      <Flex align="center" justify="space-between" marginBottom={2}>
        <Text fontWeight="550" letterSpacing="-0.02em" fontSize="18px" lineHeight="1.2">
          Per line
        </Text>
        <Button size="2xs" variant="ghost" color="fg.subtle" onClick={() => remove(r.key)}>
          Remove
        </Button>
      </Flex>
      <Stack gap={3}>
        <Field label="Up to, in one order line">
          <Flex gap={2} align="center">
            <Input
              size="sm"
              type="number"
              min={0}
              width="100px"
              borderRadius="l2"
              fontSize="13px"
              aria-label="Per-line maximum"
              value={Number.isFinite(Number(r.max)) ? Number(r.max) : ''}
              onChange={(e) => put({ ...r, max: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
            <NativeSelect.Root size="sm" width="100px">
              <NativeSelect.Field
                value={String(r.unit ?? 'l')}
                borderRadius="l2"
                fontSize="13px"
                aria-label="Unit"
                onChange={(e) => put({ ...r, unit: e.target.value })}
              >
                {LINE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Flex>
        </Field>
        <Field label="For" hint={cats.length ? undefined : 'Every line. Pick categories to narrow it.'}>
          <Flex gap={1.5} wrap="wrap">
            {CATEGORY_OPTIONS.map(([code, label]) => (
              <Chip key={code} on={cats.includes(code)} onClick={() => setCats(toggle(cats, code))}>
                {label}
              </Chip>
            ))}
          </Flex>
        </Field>
        <Field label="When over">
          <Segmented
            label="Per line when over"
            value={String(r.over ?? 'needs_approval')}
            options={OVER_OPTIONS}
            onChange={(v) => put({ ...r, over: v })}
          />
        </Field>
      </Stack>
    </Box>
  );
};

const DeliveryDaysForm = ({
  rules,
  put,
  add,
  remove,
}: {
  rules: PolicyRule[];
  put: (r: PolicyRule) => void;
  add: (r: PolicyRule) => void;
  remove: (key: string) => void;
}) => {
  const rule = rules.find((r) => r.type === 'delivery.days');
  if (!rule)
    return (
      <Button
        size="xs"
        variant="outline"
        borderStyle="dashed"
        borderRadius="l2"
        color="brand.fg"
        alignSelf="start"
        onClick={() => add({ key: 'delivery.days', type: 'delivery.days', days: [1, 2, 3, 4, 5], over: 'needs_approval' })}
      >
        <LuPlus /> Limit delivery days
      </Button>
    );
  const days = (Array.isArray(rule.days) ? rule.days : []).map(Number);
  const toggleDay = (d: number) => put({ ...rule, days: (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort() });
  return (
    <Stack gap={5}>
      <Box>
        <Flex align="center" justify="space-between" marginBottom={2}>
          <Text fontWeight="550" letterSpacing="-0.02em" fontSize="18px" lineHeight="1.2">
            Delivery days
          </Text>
          <Button size="2xs" variant="ghost" color="fg.subtle" onClick={() => remove(rule.key)}>
            Remove
          </Button>
        </Flex>
        <Field label="Deliveries may come on">
          <Flex gap={1.5} wrap="wrap">
            {DAY_NAMES.map((name, i) => (
              <Chip key={name} on={days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>
                {name.slice(0, 3)}
              </Chip>
            ))}
          </Flex>
        </Field>
      </Box>
      <Field label="An order for another day">
        <Segmented
          label="Another day"
          value={String(rule.over ?? 'needs_approval')}
          options={OVER_OPTIONS}
          onChange={(v) => put({ ...rule, over: v })}
        />
      </Field>
    </Stack>
  );
};

const RANK_WORDS: Record<string, string> = {
  valio_substitute: 'Valio’s own suggestions',
  delivery_reliability: 'Delivery reliability',
  unit_price: 'Price',
};

const SubstitutesForm = ({ rules, put, add }: { rules: PolicyRule[]; put: (r: PolicyRule) => void; add: (r: PolicyRule) => void }) => {
  const sub = rules.find((r) => r.type === 'substitution');
  const rank = rules.find((r) => r.type === 'substitution.rank');
  const order = rank ? arr(rank.order) : ['valio_substitute', 'delivery_reliability', 'unit_price'];
  const setApproval = (v: boolean) =>
    sub ? put({ ...sub, requiresApproval: v }) : add({ key: 'substitution.requiresApproval', type: 'substitution', requiresApproval: v });
  const setRank = (next: Partial<PolicyRule>) =>
    rank
      ? put({ ...rank, ...next })
      : add({ key: 'substitution.rank', type: 'substitution.rank', order, mustMeetDeliveryDate: true, ...next });
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRank({ order: next });
  };
  return (
    <Stack gap={5}>
      <Field
        label="When stock is short, a substitute"
        hint="Substitutes still have to pass every product rule. Whether to look for them at all is up to the order request."
      >
        <Segmented
          label="Substitutes"
          value={!!sub?.requiresApproval}
          options={[
            { value: false, label: 'Goes through' },
            { value: true, label: 'Needs approval' },
          ]}
          onChange={setApproval}
        />
      </Field>
      <Field label="Pick the best one by">
        <Stack gap={0} borderWidth="1px" borderColor="border" borderRadius="l2" overflow="hidden">
          {order.map((o, i) => (
            <Flex
              key={o}
              align="center"
              gap={2}
              paddingX={3}
              paddingY={1.5}
              borderTopWidth={i ? '1px' : 0}
              borderColor="border.muted"
              bg="bg.panel"
            >
              <Text fontSize="11px" color="fg.subtle" width="16px" className="tnum">
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text fontSize="13px" flex={1}>
                {RANK_WORDS[o] ?? o}
              </Text>
              <IconButton
                aria-label={`Move ${RANK_WORDS[o] ?? o} up`}
                size="2xs"
                variant="ghost"
                color="fg.muted"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <LuArrowUp />
              </IconButton>
              <IconButton
                aria-label={`Move ${RANK_WORDS[o] ?? o} down`}
                size="2xs"
                variant="ghost"
                color="fg.muted"
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <LuArrowDown />
              </IconButton>
            </Flex>
          ))}
        </Stack>
      </Field>
      <Switch.Root
        size="sm"
        checked={rank ? rank.mustMeetDeliveryDate !== false : true}
        onCheckedChange={(e) => setRank({ mustMeetDeliveryDate: e.checked })}
      >
        <Switch.HiddenInput />
        <Switch.Control />
        <Switch.Label fontSize="12.5px" color="fg.muted" fontWeight="500">
          Must still arrive by the delivery date
        </Switch.Label>
      </Switch.Root>
    </Stack>
  );
};

const ApprovalForm = ({ rules, put, add }: { rules: PolicyRule[]; put: (r: PolicyRule) => void; add: (r: PolicyRule) => void }) => {
  const route = rules.find((r) => r.type === 'approval');
  if (!route)
    return (
      <Button
        size="xs"
        variant="outline"
        borderStyle="dashed"
        borderRadius="l2"
        color="brand.fg"
        alignSelf="start"
        onClick={() =>
          add({
            key: 'approval.route',
            type: 'approval',
            approver: { name: '', role: 'Head chef' },
            windowMinutes: 30,
            fallback: 'order only what the policy allows',
            onTimeout: 'order_policy_allowed_part',
          })
        }
      >
        <LuPlus /> Name an approver
      </Button>
    );
  const a = (route.approver ?? {}) as { name?: string; role?: string };
  const setApprover = (patch: { name?: string; role?: string }) => put({ ...route, approver: { ...a, ...patch } });
  return (
    <Stack gap={4}>
      <Flex gap={3}>
        <Box flex={1}>
          <Field label="Name">
            <Input
              size="sm"
              borderRadius="l2"
              fontSize="13px"
              value={a.name ?? ''}
              onChange={(e) => setApprover({ name: e.target.value })}
            />
          </Field>
        </Box>
        <Box flex={1}>
          <Field label="Role">
            <Input
              size="sm"
              borderRadius="l2"
              fontSize="13px"
              value={a.role ?? ''}
              onChange={(e) => setApprover({ role: e.target.value })}
            />
          </Field>
        </Box>
      </Flex>
      <Field label="Time to answer">
        <Flex align="center" gap={2}>
          <Input
            size="sm"
            type="number"
            min={1}
            width="90px"
            borderRadius="l2"
            fontSize="13px"
            aria-label="Minutes to answer"
            value={Number.isFinite(Number(route.windowMinutes)) ? Number(route.windowMinutes) : ''}
            onChange={(e) => put({ ...route, windowMinutes: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
          <Text fontSize="13px" color="fg.muted">
            minutes
          </Text>
        </Flex>
      </Field>
      <Field label="With no answer in time" hint="The gateway then orders only the part the policy allows on its own.">
        <Input
          size="sm"
          borderRadius="l2"
          fontSize="13px"
          value={String(route.fallback ?? '')}
          onChange={(e) => put({ ...route, fallback: e.target.value })}
        />
      </Field>
    </Stack>
  );
};
