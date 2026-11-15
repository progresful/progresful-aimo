import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AppError } from '../../utils/AppError.ts';
import type { Caller } from './gateway.auth.ts';
import { API_KEY_HEADER, resolveCaller } from './gateway.auth.ts';
import * as service from './gateway.service.ts';

// MCP server over Streamable HTTP (stateless: a fresh server per request).
// Authenticated by an agent key in x-api-key; every tool is a thin wrapper
// over the same service functions as the REST API.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Delivery date, YYYY-MM-DD');
const unit = z.enum(['l', 'kg', 'pcs']);

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> });

const safely = (fn: () => Promise<unknown> | unknown) => async () => {
  try {
    return json(await fn());
  } catch (err) {
    const e = err as AppError;
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: e.message, details: e.details ?? null }) }] };
  }
};

export const buildMcpServer = (caller: Caller) => {
  const server = new McpServer({ name: 'ai-mo-gateway', version: '1.0.0' }, { instructions: 'Order from Valio Aimo within your signed purchasing policy. The gateway enforces the policy; you cannot change limits.' });

  server.registerTool(
    'search_products',
    {
      description:
        'Search the Valio Aimo catalog (English / Finnish names, brand or product code; best matches first; 50 per page, use offset for more) by text, category (e.g. dairy.milk) or lactose / allergen data. Returns units (litres or kg per sales unit), live list price, LACS (lactose g/100 g), allergens, Valio substitutes and delivery reliability.',
      inputSchema: { query: z.string().optional(), category: z.string().optional(), lactoseFree: z.boolean().optional(), missingAllergens: z.boolean().optional(), hasSubstitute: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => safely(() => service.findProducts({ ...args, q: args.query }))()
  );

  server.registerTool(
    'get_product',
    { description: 'One product by Valio product code.', inputSchema: { code: z.string() }, annotations: { readOnlyHint: true } },
    ({ code }) => safely(() => service.getProduct(code))()
  );

  server.registerTool(
    'get_quote',
    {
      description: 'Fixed prices and dated availability for a delivery date, as a quote signed by the gateway (ed25519) and valid 15 minutes. Quantity is in sales units, or l / kg / pcs when unit is given.',
      inputSchema: { products: z.array(z.object({ code: z.string(), quantity: z.number().nonnegative().optional(), unit: unit.optional() })).min(1).max(1000), requestedDate: day },
      annotations: { readOnlyHint: true },
    },
    (args) => safely(() => service.quoteFor(caller, args))()
  );

  server.registerTool(
    'rank_substitutes',
    {
      description: 'Rank replacements for a product under your policy: Valio-defined substitutes first, then delivery reliability, then price. Hard rules (e.g. LACS = 0) and the delivery date apply; missing data is never auto-selected.',
      inputSchema: { code: z.string(), quantity: z.number().positive(), unit, requestedDate: day },
      annotations: { readOnlyHint: true },
    },
    (args) => safely(() => service.rankSubstitutesFor(caller, args))()
  );

  server.registerTool(
    'place_order',
    {
      description:
        'Place an order. The gateway applies your signed policy: inside the rules it executes; outside them it returns pending_approval with the reasons and waits for the named approver; hard rules block. Limits come from the policy, never from this call.',
      inputSchema: {
        lines: z.array(z.object({ code: z.string(), quantity: z.number().positive(), unit })).min(1).max(100),
        requestedDate: day,
        allowSubstitutes: z.boolean().optional(),
        note: z.string().max(200).optional(),
        idempotencyKey: z.string().max(100).optional(),
      },
    },
    (args) => safely(() => service.placeOrderFor(caller, args))()
  );

  server.registerTool(
    'preview_order',
    {
      description:
        'Dry run of place_order: the real signed quote and policy checks, and whether the order would execute, need approval (and why) or be blocked — without ordering or logging anything. Use it to adjust lines or the date before placing.',
      inputSchema: {
        lines: z.array(z.object({ code: z.string(), quantity: z.number().positive(), unit })).min(1).max(100),
        requestedDate: day,
        allowSubstitutes: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => safely(() => service.previewOrderFor(caller, args))()
  );

  server.registerTool(
    'parse_request',
    {
      description:
        'Turn a plain-language request ("1,000 l lactose-free milk for Monday") into draft order lines matched against the Valio catalog, plus the delivery date (Europe/Helsinki) and the rules the words state ("local only" → origin FI, "lactose-free", "under €300"; returned, not saved). Never places an order — review the lines, then call get_quote / place_order.',
      inputSchema: { text: z.string().min(1).max(2000) },
      annotations: { readOnlyHint: true },
    },
    ({ text }) => safely(() => service.parseRequestFor(caller, { text }))()
  );

  server.registerTool(
    'get_order',
    { description: 'Order status, approval decision and the audit entries behind it.', inputSchema: { orderId: z.string() }, annotations: { readOnlyHint: true } },
    ({ orderId }) => safely(() => service.getOrderFor(caller, orderId))()
  );

  server.registerTool(
    'get_policy',
    { description: 'The signed policy your key is bound to (read-only), so you can plan within it.', inputSchema: {}, annotations: { readOnlyHint: true } },
    () => safely(() => service.boundPolicyFor(caller))()
  );

  return server;
};

export const mcpHandler = async (req: Request, res: Response) => {
  if (!req.header(API_KEY_HEADER)) throw new AppError('MCP needs an agent key in the x-api-key header', 401);
  const caller = (await resolveCaller(req))!;
  if (req.method !== 'POST') {
    // Stateless server: no standalone SSE stream or session to delete.
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed — POST JSON-RPC to /mcp' }, id: null });
    return;
  }
  const server = buildMcpServer(caller);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
};
