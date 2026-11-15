// "Describe a rule": one sentence in → one proposed rule out (POST /policies/:id/rules/draft,
// writes nothing). The person reviews it — sentence, how it shows on the graph, always
// enforced or ask a person — and only then adds it (in effect at once, signed by them).
import { Box, Button, Flex, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { DraftRuleResult, PolicyRule, useDraftRule } from '@/api/gateway';
import { ApiError } from '@/lib/api';
import { errorText } from '@/pages/home/format';
import { ADDABLE, AddableType, isEnforced, withEnforced } from '@/pages/playbook/editor/model';
import { Segmented } from '@/pages/playbook/editor/RulePanel';
import { Details, StatusText } from '@/pages/playbook/quiet';
import { describeRule, ruleSentence } from './visuals';

const RULE_EXAMPLES = [
  'Nothing from outside Finland',
  'No single line over 200 litres without Mikko',
  'Deliveries Monday to Friday only',
  'Never products with soy',
  'Ask me if a product costs more than €4 per litre',
];

/** Rule types the client knows how to word itself; for others the server's sentence is used. */
const KNOWN = new Set([
  'limit.perOrder',
  'limit.perWeek',
  'limit.perLine',
  'schedule.frequency',
  'category.allow',
  'allergen.exclude',
  'nutrition',
  'data.missing',
  'substitution',
  'substitution.rank',
  'approval',
  'product.attribute',
  'delivery.days',
]);

type Props = {
  policyKey: string;
  /** Adds the reviewed rule; the caller decides what "the draft" is (local rules or a PATCH). */
  onAdd: (rule: PolicyRule, sentence: string | null) => void | Promise<unknown>;
  /** When a sentence can't become a rule: offer the hand-made rule types instead. */
  onManual?: (type: AddableType) => void;
  adding?: boolean;
  /** Smaller heading for use inside a page section. */
  compact?: boolean;
  /** Prefills the sentence (e.g. from a "Try it yourself" link); the person still presses Read it. */
  initialText?: string;
};

export const DescribeRule = ({ policyKey, onAdd, onManual, adding, compact, initialText }: Props) => {
  const [text, setText] = useState(initialText ?? '');
  const draft = useDraftRule();
  const [result, setResult] = useState<DraftRuleResult | null>(null);
  const [rule, setRule] = useState<PolicyRule | null>(null);

  const ask = (t: string) => {
    const words = t.trim();
    if (!words) return;
    setText(words);
    setResult(null);
    setRule(null);
    draft.mutate(
      { id: policyKey, text: words },
      {
        onSuccess: (r) => {
          setResult(r);
          setRule(r.rule);
        },
      }
    );
  };

  const reset = () => {
    setResult(null);
    setRule(null);
    draft.reset();
  };

  const add = async () => {
    if (!rule || !result) return;
    try {
      await onAdd(rule, KNOWN.has(rule.type) ? null : result.sentence);
    } catch {
      return; // the caller showed the error; keep the proposal so it can be tried again
    }
    setText('');
    reset();
  };

  const missing = draft.error instanceof ApiError && draft.error.status === 404;
  const supported = !!result && result.supported && !!rule;
  const sentence = rule ? (KNOWN.has(rule.type) || !result?.sentence ? ruleSentence(rule) : result.sentence) : null;

  return (
    <Stack gap={4}>
      <Box>
        {compact ? (
          <Text textStyle="caps" color="fg.subtle">
            Describe a rule
          </Text>
        ) : (
          <>
            <Text textStyle="caps" color="fg.subtle">
              A new clause
            </Text>
            <Text textStyle="title" fontSize="24px" marginTop={2}>
              Describe a rule
            </Text>
          </>
        )}
        <Text fontSize="12.5px" color="fg.subtle" marginTop={1}>
          In your own words. You see the rule before it takes effect.
        </Text>
      </Box>

      <Flex gap={2}>
        <Input
          size="sm"
          borderRadius="l2"
          fontSize="13.5px"
          placeholder="e.g. Nothing from outside Finland"
          value={text}
          autoFocus={!compact}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(text)}
          aria-label="Describe a rule"
        />
        <Button
          size="sm"
          borderRadius="l2"
          variant={supported ? 'outline' : 'solid'}
          {...(supported ? {} : { bg: 'brand.solid', color: 'brand.contrast' })}
          flexShrink={0}
          loading={draft.isPending}
          loadingText="Reading…"
          disabled={!text.trim()}
          onClick={() => ask(text)}
        >
          Read it
        </Button>
      </Flex>

      {!result && !draft.isPending ? (
        <Flex gap={1.5} wrap="wrap">
          {RULE_EXAMPLES.map((ex) => (
            <Box
              as="button"
              key={ex}
              paddingX={2}
              height="24px"
              borderRadius="l1"
              fontSize="12px"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border.emphasized"
              color="fg.muted"
              bg="bg.panel"
              cursor="pointer"
              transition="border-color 0.2s, color 0.2s"
              _hover={{ borderColor: 'brand.accent', borderStyle: 'solid', color: 'brand.fg' }}
              onClick={() => ask(ex)}
            >
              {ex}
            </Box>
          ))}
        </Flex>
      ) : null}

      {draft.isPending ? (
        <Flex align="center" gap={2} fontSize="12.5px" color="fg.subtle">
          <Spinner size="xs" /> Turning it into a rule…
        </Flex>
      ) : draft.error ? (
        <StatusText tone="blocked" size="12.5px">
          {missing
            ? 'Describing rules isn’t available on this gateway yet — add one by hand below.'
            : `Couldn’t draft the rule — ${errorText(draft.error)}`}
        </StatusText>
      ) : null}

      {result && !supported ? (
        <Stack gap={2}>
          <StatusText tone="pending" size="13px">
            <Text as="span" color="fg">
              The gateway can’t enforce this one.
            </Text>
          </StatusText>
          {[...(result.notes ?? []).filter((n) => !n.startsWith('Not expressible')), ...(result.warnings ?? [])].map((n, i) => (
            <Text key={i} fontSize="13px" color="fg.muted" lineHeight="1.55">
              {n}
            </Text>
          ))}
          {(result.notes ?? [])
            .filter((n) => n.startsWith('Not expressible'))
            .map((n, i) => (
              <Details key={i} label="What rules can check">
                <Text fontSize="12.5px" color="fg.subtle" lineHeight="1.55">
                  {n.replace(/^Not expressible as a rule\.\s*/, '')}
                </Text>
              </Details>
            ))}
          {result.sentence ? (
            <Text fontSize="12.5px" color="fg.subtle">
              Read as: {result.sentence}
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {supported && rule ? <Proposed rule={rule} sentence={sentence} result={result!} onRule={setRule} /> : null}

      {supported ? (
        <Flex gap={2}>
          <Button size="sm" borderRadius="l2" loading={adding} onClick={add}>
            Add rule
          </Button>
          <Button size="sm" variant="ghost" color="fg.muted" onClick={reset} disabled={adding}>
            Discard
          </Button>
        </Flex>
      ) : null}

      {onManual && ((result && !supported) || missing) ? (
        <Box>
          <Text textStyle="caps" color="fg.subtle" marginBottom={2}>
            Or add one by hand
          </Text>
          <Stack gap={0} borderWidth="1px" borderColor="border" borderRadius="l2" overflow="hidden">
            {ADDABLE.map((a, i) => (
              <Flex
                as="button"
                key={a.type}
                align="start"
                gap={2.5}
                paddingX={3}
                paddingY={2}
                textAlign="left"
                borderTopWidth={i ? '1px' : 0}
                borderColor="border.muted"
                bg="bg.panel"
                cursor="pointer"
                _hover={{ bg: 'bg.hover' }}
                onClick={() => onManual(a.type)}
              >
                <Box color="kind.rule" fontSize="14px" marginTop="2px">
                  <a.icon />
                </Box>
                <Box>
                  <Text fontSize="13px" fontWeight="500">
                    {a.label}
                  </Text>
                  <Text fontSize="12px" color="fg.subtle">
                    {a.hint}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
};

/** The proposed rule as it will look on the graph, its sentence, and the enforce switch. */
const Proposed = ({
  rule,
  sentence,
  result,
  onRule,
}: {
  rule: PolicyRule;
  sentence: string | null;
  result: DraftRuleResult;
  onRule: (r: PolicyRule) => void;
}) => {
  const d = describeRule(rule);
  const Icon = d.icon;
  return (
    <Stack gap={3.5}>
      {/* How it will read on the mandate: a rule pencilled in, not yet numbered. */}
      <Flex
        align="start"
        gap={3}
        borderRadius="l2"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="status.pending/60"
        bg="bg.panel"
        paddingX={3}
        paddingY={3}
      >
        <Text fontFamily="mono" fontSize="12px" lineHeight="1.6" color="status.pending" flexShrink={0}>
          R··
        </Text>
        <Box flex={1} minWidth={0}>
          <Flex align="center" gap={2}>
            <Box color="kind.rule" fontSize="13px" flexShrink={0}>
              <Icon />
            </Box>
            <Text fontWeight="600" fontSize="13.5px" truncate flex={1}>
              {d.title}
            </Text>
            <Text textStyle="caps" fontSize="12px" color="status.pending" flexShrink={0}>
              New
            </Text>
          </Flex>
          <Text fontSize="14.5px" lineHeight="1.5" marginTop={1}>
            {sentence}
          </Text>
        </Box>
      </Flex>
      <Segmented
        label="Enforcement"
        value={isEnforced(rule)}
        options={[
          { value: true, label: 'Always enforced' },
          { value: false, label: 'Ask a person' },
        ]}
        onChange={(v) => onRule(withEnforced(rule, v))}
      />
      {result.warnings?.length ? (
        <Stack gap={1}>
          {result.warnings.map((w, i) => (
            <StatusText key={i} tone="pending" size="12.5px">
              {w}
            </StatusText>
          ))}
        </Stack>
      ) : null}
      {result.notes?.length ? (
        <Stack gap={1}>
          {result.notes.map((n, i) => (
            <Text key={i} fontSize="12.5px" color="fg.subtle" lineHeight="1.5">
              {n}
            </Text>
          ))}
        </Stack>
      ) : null}
      <Details>
        <Text fontSize="12px" color="fg.subtle" marginBottom={1}>
          Drafted by {result.compiler === 'gemini' ? 'Gemini' : result.compiler === 'rules' ? 'the built-in rule reader' : result.compiler}
        </Text>
        <Text fontSize="12px" color="fg.subtle" fontFamily="mono" whiteSpace="pre-wrap" wordBreak="break-word">
          {JSON.stringify(rule, null, 2)}
        </Text>
      </Details>
    </Stack>
  );
};
