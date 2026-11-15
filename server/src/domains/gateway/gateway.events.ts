import type { EventBase } from '../../services/eventStore.ts';

// One aggregate per gateway model; every write is a *_CREATED or *_UPDATED event.

export const GATEWAY_MODELS = {
  policy: { aggregate: 'gw_policy', created: 'GW_POLICY_CREATED', updated: 'GW_POLICY_UPDATED' },
  quote: { aggregate: 'gw_quote', created: 'GW_QUOTE_CREATED', updated: 'GW_QUOTE_UPDATED' },
  order: { aggregate: 'gw_order', created: 'GW_ORDER_CREATED', updated: 'GW_ORDER_UPDATED' },
  approval: { aggregate: 'gw_approval', created: 'GW_APPROVAL_CREATED', updated: 'GW_APPROVAL_UPDATED' },
  auditEntry: { aggregate: 'gw_audit_entry', created: 'GW_AUDIT_ENTRY_APPENDED', updated: 'GW_AUDIT_ENTRY_UPDATED' },
  agent: { aggregate: 'gw_agent', created: 'GW_AGENT_CREATED', updated: 'GW_AGENT_UPDATED' },
  automation: { aggregate: 'gw_automation', created: 'GW_AUTOMATION_CREATED', updated: 'GW_AUTOMATION_UPDATED' },
} as const;

export type GatewayModel = keyof typeof GATEWAY_MODELS;

export type GatewayEvent = { data: Record<string, any> } & EventBase<(typeof GATEWAY_MODELS)[GatewayModel]['aggregate']>;

export const AUTOMATION_DELETED = 'GW_AUTOMATION_DELETED';
export const AUTOMATION_CLAIMED = 'GW_AUTOMATION_SLOT_CLAIMED';
export const POLICY_DRAFT_DISCARDED = 'GW_POLICY_DRAFT_DISCARDED';
export const SANDBOX_CLEARED = 'GW_SANDBOX_CLEARED';
