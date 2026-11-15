import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Field,
  Flex,
  IconButton,
  Input,
  Menu,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowRight, LuEllipsis } from 'react-icons/lu';
import { Policy, PolicyRule, PolicyVersion, useCompilePolicy, useCreatePolicy, usePolicies, usePolicy, useUpdatePolicy } from '@/api/gateway';
import { Code, EmptyHint, Mono, Num, Page, PageHeader, Panel, Section, Stamp } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { BOUND_POLICY_KEY } from '@/pages/playbook/graph';
import { Details, Facts, StatusText } from '@/pages/playbook/quiet';
import { insertRule } from '@/pages/playbook/editor/model';
import { DescribeRule } from './DescribeRule';
import { RulesList } from './Rules';
import { Applied, changeSummary, signedVersionOf, useApplyRules, useDropLeftoverDraft } from './apply';
import { Versions } from './Versions';
import { PolicyState, errorMessage, policyState, rememberSentence, ruleSentence, shortDate } from './visuals';

/**
 * /app/policy — the signed purchasing policy as a readable page: the text, the
 * rules in plain sentences, who signed it, which agents use it. "Edit policy" changes
 * the text or adds a rule — each change takes effect at once, signed by you (Undo in the
 * toast); any earlier version can be restored the same way. Versions and JSON below.
 */
export const PoliciesPage = () => {
  const policies = usePolicies();
  // Select by policy key: editing a signed policy creates a new version row (new id), the key stays.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const key = selectedKey ?? policies.data?.[0]?.key ?? null;
  const detail = usePolicy(key);
  const p = detail.data;
  const list = policies.data ?? [];

  return (
    <Page
      maxWidth="900px"
      header={
        <PageHeader
          trail={['Rules']}
          actions={
            <Flex align="center" gap={2}>
              {list.length > 1 ? (
                <NativeSelect.Root size="xs" width="280px">
                  <NativeSelect.Field
                    value={key ?? ''}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    borderColor="transparent"
                    paddingLeft={1.5}
                    marginLeft={-1.5}
                    color="fg.muted"
                    fontSize="13px"
                    _hover={{ borderColor: 'border' }}
                    aria-label="Choose a policy"
                  >
                    {list.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.name}
                        {policyState(x) === 'draft' ? ' (not in effect)' : ''}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              ) : null}
              <Menu.Root positioning={{ placement: 'bottom-end' }} onSelect={({ value }) => value === 'new' && setCreating(true)}>
                <Menu.Trigger asChild>
                  <IconButton aria-label="More" size="xs" variant="ghost" color="fg.muted">
                    <LuEllipsis />
                  </IconButton>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content minWidth="170px">
                      <Menu.Item value="new">New policy</Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            </Flex>
          }
        />
      }
    >
      <Box paddingBottom={6}>
        {policies.error ? (
          <Text color="status.blocked" fontSize="13px">
            {errorMessage(policies.error)}
          </Text>
        ) : p ? (
          <PolicyView key={p.key} policy={p} />
        ) : detail.error ? (
          <Text color="status.blocked" fontSize="13px">
            {errorMessage(detail.error)}
          </Text>
        ) : key || policies.isLoading ? (
          <Flex justify="center" paddingY={20} color="fg.subtle">
            <Spinner size="sm" />
          </Flex>
        ) : (
          <EmptyHint>No policies yet. Create one from the … menu.</EmptyHint>
        )}
      </Box>
      <NewPolicyDialog open={creating} onClose={() => setCreating(false)} onCreated={(k) => setSelectedKey(k)} />
    </Page>
  );
};

const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const day = (iso: string | null | undefined) => shortDate(iso).split(',')[0];

const PolicyView = ({ policy: latest }: { policy: Policy }) => {
  // The rules in effect; a draft row above them only exists for the moment a change is being signed.
  const p: Policy = useMemo(() => {
    const signed = signedVersionOf(latest);
    return signed && signed !== latest ? { ...latest, ...signed, hasDraft: false } : latest;
  }, [latest]);
  useDropLeftoverDraft(latest);
  const state: Exclude<PolicyState, 'changed'> = p.status === 'signed' ? 'signed' : 'draft';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.plainLanguage);
  const [animate, setAnimate] = useState(false);
  const [last, setLast] = useState<Applied | null>(null);
  const update = useUpdatePolicy();
  const compile = useCompilePolicy();
  const { apply, applyWith, restore, applying } = useApplyRules();
  const dirty = text !== p.plainLanguage;
  const drafting = compile.isPending;
  const sig = p.signature ?? null;
  const agents = p.agents.map((a) => a.name ?? a.id);
  const unit = (p.document as { buyer?: { org?: string; unit?: string } }).buyer;
  // The latest change's marks, while it's the version in effect.
  const previous = last && last.version === p.version ? last.before : null;
  const done = (a: Applied | null) => {
    setLast(a);
    return a;
  };

  // The words → rules, in effect at once.
  const rewrite = async () => {
    const applied = await applyWith(
      p.key,
      async () => {
        if (dirty) await update.mutateAsync({ id: p.key, plainLanguage: text });
        const result = await compile.mutateAsync(p.key);
        if (result.note) toaster.create({ title: 'Read with care', description: result.note, type: 'warning' });
      },
      state === 'signed' ? 'Rules rewritten from the kitchen’s words' : 'First version',
      { onUndone: done }
    );
    if (!applied) return;
    done(applied);
    setText(applied.policy.plainLanguage);
    setAnimate(true);
    setEditing(false);
  };

  // A never-signed policy that already has rules: one click puts it in effect.
  const putInEffect = () => void applyWith(p.key, async () => undefined, 'First version', { undo: false }).then(done);

  // One rule described in words, in effect at once (the text above is left as it is).
  const addRule = async (drafted: PolicyRule, sentence: string | null) => {
    const { rules, rule } = insertRule(p.rules, drafted);
    rememberSentence(rule.key, sentence);
    const applied = await apply(p.key, rules, changeSummary('Added', ruleSentence(rule)), { onUndone: done });
    if (!applied) throw new Error('Not added');
    setAnimate(false);
    done(applied);
  };

  const restoreVersion = (v: PolicyVersion) => void restore(p.key, v, { onUndone: done }).then((a) => {
    if (!a) return;
    done(a);
    setText(a.policy.plainLanguage);
  });

  const cancelEdit = () => {
    setText(p.plainLanguage);
    setEditing(false);
  };

  return (
    <Stack gap={12}>
      <Box>
        {/* Above the sheet: where it stands, and what you can do with it. */}
        <Flex align="center" justify="space-between" gap={4} marginBottom={4} minHeight="32px">
          {state === 'signed' ? (
            <StatusText tone="auto">
              In effect{sig ? ` · v${p.version} signed by ${sig.signedBy}` : ''}
            </StatusText>
          ) : (
            <StatusText tone="idle">Not in effect yet — write what the agents may do, then apply it</StatusText>
          )}
          {editing ? null : (
            <Flex gap={2} flexShrink={0}>
              {p.key === BOUND_POLICY_KEY ? (
                <Link to="/app/policy/graph">
                  <Button as="span" size="sm" variant="ghost" color="fg.muted">
                    See it as a graph <LuArrowRight />
                  </Button>
                </Link>
              ) : null}
              {state === 'draft' && p.rules.length ? (
                <Button size="sm" borderRadius="l2" loading={applying} onClick={putInEffect}>
                  Put in effect
                </Button>
              ) : null}
              <Button size="sm" borderRadius="l2" variant="outline" onClick={() => setEditing(true)}>
                Edit policy
              </Button>
            </Flex>
          )}
        </Flex>

        {/* The sheet: the mandate, typeset. */}
        <Panel position="relative" paddingX={{ base: 7, md: 14 }} paddingTop={{ base: 8, md: 12 }} paddingBottom={{ base: 8, md: 12 }}>
          {state === 'draft' ? (
            <Box position="absolute" top={{ base: 4, md: 8 }} right={{ base: 4, md: 10 }} pointerEvents="none">
              <Stamp tone="pending" size="lg">
                Not in effect
              </Stamp>
            </Box>
          ) : null}
          <Text textStyle="caps" color="fg.subtle">
            Purchasing mandate · version <Num>v{p.version}</Num>
          </Text>
          <Text as="h1" textStyle="display" marginTop={3} maxWidth={state === 'draft' ? 'calc(100% - 220px)' : undefined}>
            {p.name}
          </Text>
          <Text fontSize="15px" color="fg.muted" marginTop={3} lineHeight="1.6">
            {agents.length ? (
              <>
                Binding on{' '}
                <Text as="span" color="fg">
                  {listWords(agents)}
                </Text>
              </>
            ) : (
              'Not yet binding on any agent — an agent is bound to a policy through its API key'
            )}
            {unit?.unit ? <> when buying for {unit.unit}</> : null}.
          </Text>

          <Box marginTop={8} paddingTop={6} borderTopWidth="1px" borderColor="border.strong">
            {editing ? (
              <Box>
                <Text textStyle="caps" color="fg.subtle" marginBottom={3}>
                  In the kitchen’s words
                </Text>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoresize
                  minHeight="120px"
                  borderRadius="l2"
                  borderColor="border.emphasized"
                  bg="bg.subtle"
                  padding={4}
                  fontSize="17px"
                  lineHeight="1.5"
                  autoFocus
                  placeholder="Describe what the agent may buy, the limits, and who decides when it's outside them."
                />
                <Flex align="center" gap={3} marginTop={3}>
                  <Text fontSize="12.5px" color="fg.subtle" flex={1}>
                    Write it the way you’d brief a new colleague. Applies at once, signed by you.
                  </Text>
                  <Button size="sm" variant="ghost" color="fg.muted" onClick={cancelEdit} disabled={applying}>
                    {dirty ? 'Cancel' : 'Done'}
                  </Button>
                  <Button
                    size="sm"
                    borderRadius="l2"
                    loading={drafting}
                    loadingText="Applying…"
                    disabled={!text.trim() || applying}
                    onClick={() => void rewrite()}
                  >
                    Apply
                  </Button>
                </Flex>
                <Box marginTop={8} paddingTop={6} borderTopWidth="1px" borderColor="border">
                  <DescribeRule compact policyKey={p.key} onAdd={addRule} adding={applying && !drafting} />
                </Box>
              </Box>
            ) : (
              <Box>
                <Text textStyle="caps" color="fg.subtle" marginBottom={2.5}>
                  In the kitchen’s words
                </Text>
                <Text as="blockquote" fontWeight="450" letterSpacing="-0.015em" fontSize="19px" lineHeight="1.5" color="fg" borderLeftWidth="2px" borderColor="brand.accent" paddingLeft={4}>
                  “{p.plainLanguage}”
                </Text>
              </Box>
            )}
          </Box>

          <Box marginTop={10}>
            <Flex align="baseline" justify="space-between" marginBottom={2.5}>
              <Text textStyle="caps" color="fg.subtle">
                Rules
              </Text>
              {p.rules.length ? (
                <Text textStyle="caps" color="fg.subtle" className="tnum">
                  {p.rules.length} {p.rules.length === 1 ? 'rule' : 'rules'}
                </Text>
              ) : null}
            </Flex>
            <RulesList
              rules={p.rules}
              previous={!drafting ? previous : null}
              drafting={drafting}
              animate={animate}
            />
          </Box>

          <SignatureBlock sig={state === 'signed' ? sig : null} />
        </Panel>
      </Box>

      <Section title="Versions">
        <Versions policy={latest} inEffect={p.version} restoring={applying} onRestore={restoreVersion} />
      </Section>

      <Details label="Technical details">
        <Stack gap={6}>
          {sig ? (
            <Box>
              <Text textStyle="caps" color="fg.subtle" marginBottom={1}>
                Signature
              </Text>
              <Facts
                rows={[
                  ['Policy key', <Mono key="k">{p.key}</Mono>],
                  ['Version', <Num key="v">v{p.version}</Num>],
                  ['Signature', <Mono key="s">{sig.short ?? sig.value.slice(0, 20)}</Mono>],
                  ...(sig.kid ? [['Key', <Mono key="kid">{sig.kid}</Mono>] as [string, ReactNode]] : []),
                  [
                    'Verifies',
                    sig.valid === false ? (
                      <Text as="span" color="status.blocked" key="ok">
                        No — tampered
                      </Text>
                    ) : (
                      <Text as="span" key="ok">
                        Yes · {sig.algorithm ?? 'ed25519'}
                      </Text>
                    ),
                  ],
                ]}
              />
            </Box>
          ) : null}
          <Box>
            <Text textStyle="caps" color="fg.subtle" marginBottom={1}>
              Policy document
            </Text>
            <Text fontSize="12.5px" color="fg.subtle" marginBottom={2}>
              Format <Mono>mandate.policy/v1</Mono> · v{p.version}
              {p.status === 'draft' ? ' (not signed yet)' : ''} — exactly what the gateway stores and signs.
            </Text>
            <Code maxHeight="420px">{JSON.stringify(p.document, null, 2)}</Code>
          </Box>
        </Stack>
      </Details>

    </Stack>
  );
};

/**
 * The foot of the mandate: a real signature line. Signed — the signer's name as a
 * dot-matrix readout over a ruled line, "Signed · date" and the key underneath, and the gateway's
 * seal beside it. Not yet in effect — an empty line waiting for a signature.
 */
const SignatureBlock = ({ sig }: { sig: Policy['signature'] }) => (
  <Box marginTop={14} position="relative">
    <Flex gap={{ base: 8, md: 12 }} wrap="wrap" align="end" maxWidth={{ base: '100%', md: 'calc(100% - 190px)' }}>
      <Box flex="1 1 240px" maxWidth="320px">
        <Flex height="52px" align="end" paddingX={1} paddingBottom={1}>
          {sig ? (
            <Text fontFamily="dot" fontWeight="800" fontSize="32px" lineHeight="1" color="brand.fg" truncate>
              {sig.signedBy}
            </Text>
          ) : (
            <Text fontSize="13.5px" color="fg.subtle">
              ×
            </Text>
          )}
        </Flex>
        <Box borderTopWidth="1px" borderColor="border.strong" />
        <Text textStyle="caps" color="fg.subtle" marginTop={2}>
          {sig ? (
            <>
              Signed · {day(sig.signedAt)}
              {sig.role ? ` · ${sig.role}` : ''}
            </>
          ) : (
            'Signature of the person responsible'
          )}
        </Text>
      </Box>
      <Box flex="1 1 180px" maxWidth="240px">
        <Flex height="52px" align="end" paddingX={1} paddingBottom={1.5}>
          {sig ? (
            <Text fontFamily="mono" fontSize="12px" color="fg.muted" truncate title={sig.value}>
              {sig.kid ?? sig.short ?? sig.value.slice(0, 20)}
            </Text>
          ) : null}
        </Flex>
        <Box borderTopWidth="1px" borderColor="border.strong" />
        <Text textStyle="caps" color="fg.subtle" marginTop={2}>
          {sig ? `Sealed by the gateway · ${sig.algorithm ?? 'ed25519'}` : 'Gateway seal · ed25519'}
        </Text>
        {sig ? (
          <Text fontFamily="mono" fontSize="11px" color="fg.subtle" marginTop={0.5} truncate>
            {sig.short ?? sig.value.slice(0, 20)}
          </Text>
        ) : null}
      </Box>
    </Flex>
    {/* The stamp, pressed beside the signatures. */}
    <Box position={{ base: 'static', md: 'absolute' }} right={0} bottom="22px" marginTop={{ base: 6, md: 0 }} pointerEvents="none">
      {sig ? (
        sig.valid === false ? (
          <Stamp tone="blocked" size="lg">
            Does not verify
          </Stamp>
        ) : (
          <Stamp tone="auto" size="lg">
            In effect
          </Stamp>
        )
      ) : null}
    </Box>
  </Box>
);

const NewPolicyDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (key: string) => void }) => {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const create = useCreatePolicy();

  const close = () => {
    setName('');
    setText('');
    create.reset();
    onClose();
  };

  const submit = () =>
    create.mutate(
      { name: name.trim(), plainLanguage: text.trim() },
      {
        onSuccess: (p) => {
          toaster.create({ title: `Created ${p.name}`, description: 'Edit it, then apply — it takes effect signed by you.', type: 'success' });
          onCreated(p.key);
          close();
        },
      }
    );

  return (
    <Dialog.Root open={open} onOpenChange={(e) => (e.open ? null : close())} placement="center">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            bg="bg.panel"
            borderWidth="1px"
            borderTopWidth="2px"
            borderColor="border.strong"
            borderTopColor="border.strong"
            borderRadius="l3"
            boxShadow="float"
            maxWidth="560px"
          >
            <Dialog.Header>
              <Box>
                <Text textStyle="caps" color="fg.subtle" marginBottom={1.5}>
                  Purchasing mandate
                </Text>
                <Dialog.Title textStyle="title" fontWeight="400">
                  New policy
                </Dialog.Title>
                <Text fontSize="13px" color="fg.muted" marginTop={1}>
                  One policy per use. Nothing can be ordered under it until its rules are applied.
                </Text>
              </Box>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild top={4} right={4}>
              <CloseButton size="sm" color="fg.muted" />
            </Dialog.CloseTrigger>
            <Dialog.Body>
              <Stack gap={4}>
                <Field.Root>
                  <Field.Label textStyle="caps" color="fg.subtle">
                    Name
                  </Field.Label>
                  <Input
                    size="sm"
                    borderRadius="l2"
                    placeholder="e.g. Ward 7 kitchen — dairy"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label textStyle="caps" color="fg.subtle">
                    In plain language
                  </Field.Label>
                  <Textarea
                    size="sm"
                    borderRadius="l2"
                    rows={4}
                    placeholder="What may the agent buy, up to what amounts, and who decides when it's outside that?"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field.Root>
                {create.error ? (
                  <Text fontSize="13px" color="status.blocked">
                    {errorMessage(create.error)}
                  </Text>
                ) : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button size="sm" variant="ghost" color="fg.muted" onClick={close}>
                Cancel
              </Button>
              <Button
                size="sm"
                borderRadius="l2"
                disabled={!name.trim() || !text.trim()}
                loading={create.isPending}
                onClick={submit}
              >
                Create
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
