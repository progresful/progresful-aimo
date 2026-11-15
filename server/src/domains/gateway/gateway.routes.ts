import type { NextFunction, Request, Response, Router } from 'express';

import { catchAsync } from '../../utils/catchAsync.ts';
import { requireCaller, requireUser } from './gateway.auth.ts';
import * as gw from './gateway.controller.ts';
import { mcpHandler } from './gateway.mcp.ts';
import { openApiDocument } from './openapi.ts';

// External agents call these from other origins: open CORS, no cookies.
export const gatewayCors = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-key, mcp-session-id, mcp-protocol-version, last-event-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

export function gatewayRoutes(router: Router) {
  router.use(['/api/gw', '/api/openapi.json', '/mcp'], gatewayCors);

  // Open interface
  router.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument());
  });
  router.all('/mcp', catchAsync(mcpHandler));

  // Public
  router.get('/api/gw/health', catchAsync(gw.health));
  router.get('/api/gw/keys', catchAsync(gw.keys));
  router.post('/api/gw/quotes/verify', catchAsync(gw.verifyQuote));

  // Agent key or signed-in user
  router.get('/api/gw/products', requireCaller, catchAsync(gw.listProducts));
  router.post('/api/gw/products/search', requireCaller, catchAsync(gw.searchProducts));
  router.get('/api/gw/products/:code', requireCaller, catchAsync(gw.getProduct));
  router.post('/api/gw/quotes', requireCaller, catchAsync(gw.createQuote));
  router.get('/api/gw/quotes/:id', requireCaller, catchAsync(gw.getQuote));
  router.post('/api/gw/substitutes/rank', requireCaller, catchAsync(gw.rankSubstitutes));
  router.post('/api/gw/orders/preview', requireCaller, catchAsync(gw.previewOrder));
  router.post('/api/gw/orders', requireCaller, catchAsync(gw.placeOrder));
  router.get('/api/gw/orders', requireCaller, catchAsync(gw.listOrders));
  router.get('/api/gw/orders/:id', requireCaller, catchAsync(gw.getOrder));
  router.get('/api/gw/stats', requireCaller, catchAsync(gw.stats));
  router.get('/api/gw/approvals', requireCaller, catchAsync(gw.listApprovalsHandler));
  router.get('/api/gw/audit', requireCaller, catchAsync(gw.audit));
  router.get('/api/gw/audit/verify', requireCaller, catchAsync(gw.auditVerify));
  router.get('/api/gw/policy', requireCaller, catchAsync(gw.boundPolicy));
  router.get('/api/gw/policies', requireCaller, catchAsync(gw.policies));
  router.get('/api/gw/policies/:id', requireCaller, catchAsync(gw.policy));
  router.get('/api/gw/agents', requireCaller, catchAsync(gw.agents));
  router.get('/api/gw/automations', requireCaller, catchAsync(gw.automations));
  router.get('/api/gw/automations/:id', requireCaller, catchAsync(gw.automation));
  router.post('/api/gw/automations/:id/run', requireCaller, catchAsync(gw.runAutomation));
  router.post('/api/gw/requests/parse', requireCaller, catchAsync(gw.parseRequest));
  router.post('/api/gw/demo/run', requireCaller, catchAsync(gw.demoRun));

  // People only
  router.post('/api/gw/approvals/:id/decide', requireUser, catchAsync(gw.decide));
  router.post('/api/gw/approvals/:id/expire', requireUser, catchAsync(gw.expire));
  router.post('/api/gw/policies', requireUser, catchAsync(gw.createPolicy));
  router.patch('/api/gw/policies/:id', requireUser, catchAsync(gw.updatePolicy));
  router.post('/api/gw/policies/:id/compile', requireUser, catchAsync(gw.compile));
  router.post('/api/gw/policies/:id/rules/draft', requireUser, catchAsync(gw.draftRule));
  router.post('/api/gw/policies/:id/sign', requireUser, catchAsync(gw.sign));
  router.delete('/api/gw/policies/:id/draft', requireUser, catchAsync(gw.discardDraft));
  router.post('/api/gw/agents/:id/keys', requireUser, catchAsync(gw.createKey));
  router.post('/api/gw/automations', requireUser, catchAsync(gw.createAutomationHandler));
  router.patch('/api/gw/automations/:id', requireUser, catchAsync(gw.updateAutomationHandler));
  router.delete('/api/gw/automations/:id', requireUser, catchAsync(gw.deleteAutomationHandler));
  router.delete('/api/gw/agents/:id/keys/:keyId', requireUser, catchAsync(gw.deleteKey));

  // Judge sandbox (people in a sandbox org)
  router.get('/api/gw/sandbox', requireUser, catchAsync(gw.sandbox));
  router.post('/api/gw/sandbox/key', requireUser, catchAsync(gw.sandboxKey));
  router.post('/api/gw/sandbox/reset', requireUser, catchAsync(gw.sandboxReset));
}
