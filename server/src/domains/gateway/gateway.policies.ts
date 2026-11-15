import { ulid } from 'ulid';
import type { Policy } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import type { PrismaClientOrTx } from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import { AppError } from '../../utils/AppError.ts';
import { createPolicyCommand, discardPolicyDraftCommand, updatePolicyCommand } from './gateway.commands.ts';
import type { PolicyDocument, PolicyRule } from './policy.engine.ts';
import { approverOf, buildDocument, compilePlainLanguage } from './policy.compiler.ts';
import { keyId, shortSignature, sign, verify } from './gateway.signing.ts';
import { draftRuleFromText, validateRuleList } from './policy.rules.ts';

// Policies are versioned rows sharing a `key`. At most one version per key is
// `signed` (the one agents run on); older signed versions become `superseded`;
// edits happen on a `draft` version above it.

const signedPayload = (p: Pick<Policy, 'document' | 'signedBy' | 'signedRole' | 'signedAt'>) => ({
  document: p.document,
  signedBy: p.signedBy,
  signedRole: p.signedRole,
  signedAt: p.signedAt?.toISOString(),
});

export const signPolicyPayload = (p: Pick<Policy, 'document' | 'signedBy' | 'signedRole' | 'signedAt'>) => sign(signedPayload(p));

export const policyView = (p: Policy) => {
  const doc = p.document as unknown as PolicyDocument;
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    version: p.version,
    status: p.status,
    plainLanguage: p.plainLanguage,
    summary: p.summary,
    rules: doc.rules,
    approver: doc.rules.length ? approverOf(doc) : null,
    document: doc,
    signature: p.signature
      ? {
          algorithm: 'ed25519',
          kid: keyId(),
          signedBy: p.signedBy,
          role: p.signedRole,
          signedAt: p.signedAt?.toISOString() ?? null,
          value: p.signature,
          short: shortSignature(p.signature),
          valid: verify(signedPayload(p), p.signature),
        }
      : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
};

const versionsOf = (organizationId: string, key: string) => prisma.policy.findMany({ where: { organizationId, key }, orderBy: { version: 'desc' } });

/** Accepts a policy key (pol_…) or a version row id. */
export const resolveKey = async (organizationId: string, idOrKey: string) => {
  if (await prisma.policy.findFirst({ where: { organizationId, key: idOrKey }, select: { id: true } })) return idOrKey;
  const row = await prisma.policy.findFirst({ where: { organizationId, id: idOrKey }, select: { key: true } });
  if (!row) throw new AppError('Policy not found', 404, { id: idOrKey });
  return row.key;
};

export const activePolicy = async (organizationId: string, key: string) => {
  const p = await prisma.policy.findFirst({ where: { organizationId, key, status: 'signed' }, orderBy: { version: 'desc' } });
  if (!p) throw new AppError(`Policy ${key} has no signed version — nothing can be ordered under it`, 409, { key });
  return p;
};

export const listPolicies = async (organizationId: string) => {
  const rows = await prisma.policy.findMany({ where: { organizationId }, orderBy: [{ key: 'asc' }, { version: 'desc' }] });
  const agents = await prisma.agent.findMany({ where: { organizationId }, select: { id: true, name: true, policyId: true } });
  const latest = new Map<string, Policy>();
  const active = new Map<string, Policy>();
  for (const r of rows) {
    if (!latest.has(r.key)) latest.set(r.key, r);
    if (r.status === 'signed' && !active.has(r.key)) active.set(r.key, r);
  }
  return [...latest.values()].map((p) => ({
    ...policyView(p),
    activeVersion: active.get(p.key)?.version ?? null,
    hasDraft: p.status === 'draft',
    agents: agents.filter((a) => a.policyId === p.key).map((a) => ({ id: a.id, name: a.name })),
  }));
};

/** Throws away the unsigned draft of a policy; agents keep using the signed version. */
export const discardDraft = async (organizationId: string, idOrKey: string, authorId: string) => {
  const key = await resolveKey(organizationId, idOrKey);
  const [latest] = await versionsOf(organizationId, key);
  if (!latest || latest.status !== 'draft') throw new AppError('No unsigned draft to discard', 409, { key });
  const { event } = await discardPolicyDraftCommand(prisma, { id: latest.id }, { authorId });
  await eventStore.log(event!);
  const remaining = await versionsOf(organizationId, key);
  return remaining.length ? getPolicy(organizationId, key) : { discarded: true, key, deleted: true };
};

export const getPolicy = async (organizationId: string, idOrKey: string) => {
  const key = await resolveKey(organizationId, idOrKey);
  const versions = await versionsOf(organizationId, key);
  const active = versions.find((v) => v.status === 'signed') ?? null;
  const agents = await prisma.agent.findMany({ where: { organizationId, policyId: key }, select: { id: true, name: true } });
  return { ...policyView(versions[0]), activeVersion: active?.version ?? null, hasDraft: versions[0].status === 'draft', agents, versions: versions.map(policyView) };
};

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

export const createPolicy = async (
  db: PrismaClientOrTx,
  organizationId: string,
  input: { name: string; plainLanguage: string; key?: string; rules?: PolicyRule[]; version?: number; summary?: string; at?: Date },
  authorId: string
) => {
  const key = input.key ?? `pol_${slug(input.name)}`;
  if (await db.policy.findFirst({ where: { organizationId, key }, select: { id: true } })) throw new AppError(`Policy ${key} already exists`, 409, { key });
  const version = input.version ?? 1;
  const document = buildDocument({
    key,
    name: input.name,
    version,
    plainLanguage: input.plainLanguage,
    rules: input.rules ?? [],
    approver: { name: 'Head chef', role: 'Head chef', windowMinutes: 30, fallback: 'order only what the policy allows' },
  });
  const { response, event } = await createPolicyCommand(
    db,
    {
      id: ulid(),
      organizationId,
      key,
      name: input.name,
      version,
      status: 'draft',
      plainLanguage: input.plainLanguage,
      document: document as object,
      summary: input.summary ?? null,
      ...(input.at ? { createdAt: input.at, updatedAt: input.at } : {}),
    },
    { authorId }
  );
  await eventStore.log(event!);
  return response;
};

/** The editable draft for `key`: the latest version if it's a draft, otherwise a new version copied from it. */
const ensureDraft = async (organizationId: string, key: string, authorId: string) => {
  const [latest] = await versionsOf(organizationId, key);
  if (latest.status === 'draft') return latest;
  const doc = { ...(latest.document as unknown as PolicyDocument), version: latest.version + 1 };
  const { response, event } = await createPolicyCommand(
    prisma,
    {
      id: ulid(),
      organizationId,
      key,
      name: latest.name,
      version: latest.version + 1,
      status: 'draft',
      plainLanguage: latest.plainLanguage,
      document: doc as object,
      summary: null,
    },
    { authorId }
  );
  await eventStore.log(event!);
  return response;
};

const saveDraft = async (draft: Policy, changes: Partial<Pick<Policy, 'name' | 'plainLanguage' | 'summary'>> & { document?: PolicyDocument }, authorId: string) => {
  const { response, event } = await updatePolicyCommand(
    prisma,
    {
      id: draft.id,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.plainLanguage !== undefined ? { plainLanguage: changes.plainLanguage } : {}),
      ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
      ...(changes.document ? { document: changes.document as object } : {}),
    },
    { authorId }
  );
  await eventStore.log(event!);
  return response;
};

export const updatePolicy = async (
  organizationId: string,
  idOrKey: string,
  input: { name?: string; plainLanguage?: string; summary?: string; rules?: PolicyRule[] },
  authorId: string
) => {
  const key = await resolveKey(organizationId, idOrKey);
  if (input.rules) {
    const problems = validateRuleList(input.rules);
    if (problems.length) throw new AppError(`Invalid rules: ${problems.join(' · ')}`, 422, { problems });
  }
  const draft = await ensureDraft(organizationId, key, authorId);
  const doc = draft.document as unknown as PolicyDocument;
  const document: PolicyDocument = {
    ...doc,
    name: input.name ?? doc.name,
    plain_language: input.plainLanguage ?? doc.plain_language,
    rules: input.rules ?? doc.rules,
  };
  await saveDraft(draft, { name: input.name, plainLanguage: input.plainLanguage, summary: input.summary, document }, authorId);
  return getPolicy(organizationId, key);
};

/** One sentence → one validated rule for this policy (not saved; the client inserts it and PATCHes). */
export const draftRule = async (organizationId: string, idOrKey: string, input: { text: string; rules?: PolicyRule[] }) => {
  const key = await resolveKey(organizationId, idOrKey);
  const [latest] = await versionsOf(organizationId, key);
  const doc = latest.document as unknown as PolicyDocument;
  const existing = [...(doc.rules ?? []), ...((input.rules ?? []) as PolicyRule[])];
  const approver = doc.rules?.length ? approverOf(doc) : null;
  return draftRuleFromText(input.text, existing, { approver: approver ? (approver.name !== approver.role ? `${approver.name} (${approver.role})` : approver.name) : undefined });
};

export const compilePolicy = async (organizationId: string, idOrKey: string, authorId: string) => {
  const key = await resolveKey(organizationId, idOrKey);
  const draft = await ensureDraft(organizationId, key, authorId);
  const doc = draft.document as unknown as PolicyDocument;
  const previous = doc.rules.length ? approverOf(doc) : null;
  const compiled = await compilePlainLanguage(draft.plainLanguage, previous);
  const document = buildDocument({ key, name: draft.name, version: draft.version, plainLanguage: draft.plainLanguage, rules: compiled.rules, approver: compiled.approver, unit: doc.buyer?.unit });
  await saveDraft(draft, { document }, authorId);
  return { policy: await getPolicy(organizationId, key), compiler: compiled.compiler, intent: compiled.intent, ...(compiled.note ? { note: compiled.note } : {}) };
};

export const signPolicy = async (
  db: PrismaClientOrTx,
  organizationId: string,
  idOrKey: string,
  signer: { name: string; role: string; summary?: string; at?: Date },
  authorId: string
) => {
  const key = await resolveKey(organizationId, idOrKey);
  const [draft, ...older] = await db.policy.findMany({ where: { organizationId, key }, orderBy: { version: 'desc' } });
  if (draft.status !== 'draft') throw new AppError(`Version ${draft.version} is already signed — edit the policy to create a new draft`, 409);
  const doc = draft.document as unknown as PolicyDocument;
  if (!doc.rules.length) throw new AppError('Compile the policy before signing — it has no rules', 422);
  const signedAt = signer.at ?? new Date();
  // A marker an older version of the app left on drafts (`adapted`) is not part of the mandate.
  const { adapted: _adapted, ...signedDoc } = doc as PolicyDocument & { adapted?: unknown };
  const fields = { document: { ...signedDoc, version: draft.version } as object, signedBy: signer.name, signedRole: signer.role, signedAt };
  const { response, event } = await updatePolicyCommand(
    db,
    { id: draft.id, status: 'signed', ...fields, signature: signPolicyPayload(fields), ...(signer.summary ? { summary: signer.summary } : {}), updatedAt: signedAt },
    { authorId }
  );
  await eventStore.log(event!);
  for (const old of older.filter((o) => o.status === 'signed')) {
    const { event: e } = await updatePolicyCommand(db, { id: old.id, status: 'superseded' }, { authorId });
    await eventStore.log(e!);
  }
  return response;
};
