import type { NextFunction, Request, Response } from 'express';
import { auth } from '../services/auth/auth.ts';

/**
 * Build a minimal Fetch Headers from an Express request for Better Auth's
 * `getSession`. We avoid `fromNodeHeaders` (better-auth/node) because
 * across versions it can produce Headers objects that lose the `cookie`
 * value, causing getSession to return null even when the session is valid.
 */
function headersForAuth(req: any): Headers {
  const h = new Headers();
  if (req.headers?.cookie) h.set('cookie', req.headers.cookie);
  if (req.headers?.host) h.set('host', req.headers.host);
  if (req.headers?.origin) h.set('origin', req.headers.origin);
  if (req.headers?.['x-forwarded-for']) h.set('x-forwarded-for', req.headers['x-forwarded-for']);
  if (req.headers?.['x-forwarded-proto']) h.set('x-forwarded-proto', req.headers['x-forwarded-proto']);
  if (req.headers?.authorization) h.set('authorization', req.headers.authorization);
  return h;
}

export async function getAuthorizedSession(req: any) {
  const session = await auth.api.getSession({ headers: headersForAuth(req) });
  return session;
}

export type AuthorizedSession = Awaited<ReturnType<typeof getAuthorizedSession>>;

export async function userIsAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (await getAuthorizedSession(req)) {
    next(); // User is authenticated, proceed to the next middleware/route
  } else {
    res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }
}

export async function userIsAdmin(req: Request, res: Response, next: NextFunction) {
  const authSession = await getAuthorizedSession(req);
  const roles = (authSession?.user.role ?? '').split(',').map((r: string) => r.trim());
  if (!roles.includes('admin')) {
    res.status(403).json({ message: 'Only users with admin role can access this resource.' });
    return;
  }
  next();
}

export async function userIsAdminOrSelf(req: Request, res: Response, next: NextFunction) {
  const authSession = await getAuthorizedSession(req);
  const roles = (authSession?.user.role ?? '').split(',').map((r: string) => r.trim());
  if (!roles.includes('admin') && authSession?.user.id !== req.params.userId) {
    res.status(403).json({ message: 'Only users with admin role or self can access this resource.' });
    return;
  }
  next();
}

export async function getAuthOrganizationId(req: Request): Promise<string | null> {
  const authSession = await getAuthorizedSession(req);
  return authSession?.session.activeOrganizationId;
}
