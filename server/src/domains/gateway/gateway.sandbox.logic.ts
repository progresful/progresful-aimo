import type { Approver } from './policy.compiler.ts';
import { buildDocument } from './policy.compiler.ts';
import type { PolicyDocument, PolicyRule } from './policy.engine.ts';

// Pure parts of the judge sandbox (constants, org metadata, the policy copy) —
// no database, so node --test can import them. See gateway.sandbox.ts.

export const SANDBOX_ORG_ID = '01KA0000000000000000000011';
export const SANDBOX_ORG = { id: SANDBOX_ORG_ID, name: 'Judge sandbox · Test kitchen', slug: 'judge-sandbox' };
export const JUDGE_USER_ID = '01KA0000000000000000000010';
export const JUDGE = { email: 'judge@mandate.dev', name: 'Junction judge', role: 'Head chef' };
// The key stays as it was so existing agents, keys and links keep working.
export const SANDBOX_POLICY_KEY = 'pol_sandbox-dairy';
export const SANDBOX_POLICY_NAME = 'Test kitchen';
export const SANDBOX_PLAIN_LANGUAGE = 'No rules yet — the rules come from what you ask for (e.g. “local only”, “lactose-free”, “under €300”) or are added by hand.';

export const SANDBOX_AGENTS = [
  { id: 'agt_sandbox-gemini', name: 'Gemini buyer agent', vendor: 'Google', model: 'Gemini', host: 'Google Cloud · europe-north1', transport: 'mcp' },
  { id: 'agt_sandbox-nemotron', name: 'Nemotron buyer agent', vendor: 'NVIDIA', model: 'Nemotron 3.5 Super VL (open weights)', host: 'Verda · Helsinki, Finland', transport: 'openapi' },
];

// --- Pure helpers ------------------------------------------------------------------

export type SandboxMeta = { sandbox?: boolean; resetAt?: string | null; [k: string]: unknown };

/** Organization.metadata is a JSON string (Better Auth); anything unparsable counts as empty. */
export const parseOrgMetadata = (metadata: string | null | undefined): SandboxMeta => {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const isSandboxMetadata = (metadata: string | null | undefined) => parseOrgMetadata(metadata).sandbox === true;

export const withResetAt = (metadata: string | null | undefined, resetAt: Date) => JSON.stringify({ ...parseOrgMetadata(metadata), sandbox: true, resetAt: resetAt.toISOString() });

/** The judge approves exceptions: the one route the engine needs, and nothing else. */
export const SANDBOX_APPROVER: Approver = { name: JUDGE.name, role: JUDGE.role, windowMinutes: 30, fallback: 'order only what the policy allows' };

/** The sandbox starts empty: no product rules, no spend limits — only who approves exceptions. */
export const sandboxRules = (): PolicyRule[] => [
  { key: 'approval.route', type: 'approval', approver: { name: SANDBOX_APPROVER.name, role: SANDBOX_APPROVER.role }, windowMinutes: SANDBOX_APPROVER.windowMinutes, onTimeout: 'order_policy_allowed_part', fallback: SANDBOX_APPROVER.fallback },
];

export const sandboxDocument = (version = 1): PolicyDocument => {
  const built = buildDocument({ key: SANDBOX_POLICY_KEY, name: SANDBOX_POLICY_NAME, version, plainLanguage: SANDBOX_PLAIN_LANGUAGE, rules: sandboxRules(), approver: SANDBOX_APPROVER, unit: 'Test kitchen' });
  return { ...built, buyer: { org: 'Judge sandbox', unit: 'Test kitchen' } } as PolicyDocument;
};
