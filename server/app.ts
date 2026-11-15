import path from 'path';
import type { Response, Request } from 'express';
import express from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';

// services
import logger, { httpLogger } from './src/services/logger.ts';
import { setupWebSocketServer } from './src/services/websocket/websocket.server.ts';
import { auth } from './src/services/auth/auth.ts';

// middleware
import { errorHandler } from './src/middleware/errorHandling.ts';

// routes
import { messageRoutes } from './src/domains/message/message.routes.ts';
import { gatewayRoutes } from './src/domains/gateway/gateway.routes.ts';
import { startApprovalSweeper } from './src/domains/gateway/gateway.approvals.ts';
import { startAutomationSweeper } from './src/domains/gateway/gateway.automations.ts';
import { warmCatalog } from './src/domains/gateway/gateway.products.ts';
import { calibrateCatalog } from './src/domains/gateway/gateway.prices.ts';

import __dirname from './src/utils/dirname.ts';

const app = express();

app.use(
  helmet({
    // Relax defaults so CDN-loaded scripts/styles (maps, fonts, analytics)
    // work without per-project CSP tuning.
    contentSecurityPolicy: false,
    // Allow referrer so external resources (tiles, CDNs) get a Referer header.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 1000,
    standardHeaders: 'draft-7', // Use RFC 6585 status code
    legacyHeaders: false,
  })
);

app.use(httpLogger);
app.all('/api/auth/{*splat}', toNodeHandler(auth));
app.use(bodyParser.json());

// Static files — served from the Vite build output.
// __dirname = server/src/utils → climb to repo root, then into client/dist.
const CLIENT_DIST = path.resolve(__dirname, '..', '..', '..', 'client', 'dist');
app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets')));
app.use('/img', express.static(path.join(CLIENT_DIST, 'img')));

// API
messageRoutes(app);
gatewayRoutes(app);
warmCatalog(); // Valio's product file (VALIO_PRODUCTS_FILE) is parsed once, here, not on the first request
void calibrateCatalog(); // live mode: price the catalog once, check litres / kg per sales unit against Valio
startApprovalSweeper();
startAutomationSweeper();

// SPA fallback — any non-/api GET that didn't match an asset serves
// index.html so react-router deep links (e.g. /login, /profile) work
// after a refresh. Must come AFTER all API routes.
app.get(/^(?!\/api\/).*/, async (_req: Request, res: Response) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

// Error handling
app.use(errorHandler);

// Initiate server for WebSocket

const PORT = process.env.PORT ?? 3000;
const server = app.listen(PORT, () => {
  logger.info(`App is running on :${PORT}`);
});

// WebSocket
setupWebSocketServer(server);

export default server;
