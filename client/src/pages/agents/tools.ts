// The seven MCP tools, mirrored from server/src/domains/gateway/gateway.mcp.ts
// (names, descriptions, inputs and read-only hints). The MCP server is the source
// of truth — keep this list in step with it.

export type McpTool = { name: string; description: string; input: string; readOnly: boolean };

export const mcpTools: McpTool[] = [
  {
    name: 'search_products',
    description:
      'Search the Valio Aimo catalog by text, category or lactose / allergen data. Returns units, LACS (lactose g/100 g), allergens, Valio substitutes and delivery reliability.',
    input: '{ query?, category?, lactoseFree?, missingAllergens?, hasSubstitute?, limit? }',
    readOnly: true,
  },
  { name: 'get_product', description: 'One product by Valio product code.', input: '{ code }', readOnly: true },
  {
    name: 'get_quote',
    description:
      'Fixed prices and dated availability for a delivery date, as a quote signed by the gateway (ed25519) and valid 15 minutes. Quantity is in sales units, or l / kg / pcs when unit is given.',
    input: '{ products: [{ code, quantity?, unit? }], requestedDate }',
    readOnly: true,
  },
  {
    name: 'rank_substitutes',
    description:
      'Rank replacements for a product under your policy: Valio-defined substitutes first, then delivery reliability, then price. Hard rules (e.g. LACS = 0) and the delivery date apply; missing data is never auto-selected.',
    input: '{ code, quantity, unit, requestedDate }',
    readOnly: true,
  },
  {
    name: 'place_order',
    description:
      'Place an order. The gateway applies your signed policy: inside the rules it executes; outside them it returns pending_approval with the reasons and waits for the named approver; hard rules block. Limits come from the policy, never from this call.',
    input: '{ lines: [{ code, quantity, unit }], requestedDate, allowSubstitutes?, note?, idempotencyKey? }',
    readOnly: false,
  },
  {
    name: 'get_order',
    description: 'Order status, approval decision and the audit entries behind it.',
    input: '{ orderId }',
    readOnly: true,
  },
  {
    name: 'get_policy',
    description: 'The signed policy your key is bound to (read-only), so you can plan within it.',
    input: '{}',
    readOnly: true,
  },
];
