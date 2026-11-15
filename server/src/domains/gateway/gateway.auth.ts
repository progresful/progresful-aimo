import type { NextFunction, Request, Response } from 'express';
import type { Agent } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { auth } from '../../services/auth/auth.ts';
import { getAuthorizedSession } from '../../middleware/session.ts';
import { AppError } from '../../utils/AppError.ts';
import { ROLE_DIRECTORY } from './policy.compiler.ts';

// Who is calling: an agent with an API key (org + bound policy come from the
// key's agent row — never from the request), or a signed-in user of the web UI.

export type Caller = {
  organizationId: string;
  via: 'api-key' | 'session' | 'automation'; // automation = the gateway's own scheduler
  agent: Agent | null; // always set for api-key callers
  user: { id: string; name: string; role: string } | null; // set for session callers
  authorId: string; // event-store author
};

export const API_KEY_HEADER = 'x-api-key';

const callerFromKey = async (key: string): Promise<Caller> => {
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) throw new AppError(result.error?.message ?? 'Invalid API key', 401);
  const agent = await prisma.agent.findFirst({ where: { apiKeyId: result.key.id } });
  if (!agent) throw new AppError('This API key is not bound to an agent', 403);
  return { organizationId: agent.organizationId, via: 'api-key', agent, user: null, authorId: agent.id };
};

/** The person's role in the purchasing process, for audit and signatures. */
export const roleOf = (name: string, memberRole: string) => ROLE_DIRECTORY_BY_NAME[name] ?? memberRole.charAt(0).toUpperCase() + memberRole.slice(1);
const ROLE_DIRECTORY_BY_NAME = Object.fromEntries(Object.entries(ROLE_DIRECTORY).map(([role, name]) => [name, role.charAt(0).toUpperCase() + role.slice(1)]));

const callerFromSession = async (req: Request): Promise<Caller | null> => {
  const session = await getAuthorizedSession(req);
  if (!session) return null;
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id, ...(session.session.activeOrganizationId ? { organizationId: session.session.activeOrganizationId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (!member) throw new AppError('You are not a member of any organization', 403);
  return {
    organizationId: member.organizationId,
    via: 'session',
    agent: null,
    user: { id: session.user.id, name: session.user.name, role: roleOf(session.user.name, member.role) },
    authorId: session.user.id,
  };
};

export const resolveCaller = async (req: Request): Promise<Caller | null> => {
  const key = req.header(API_KEY_HEADER);
  if (key) return callerFromKey(key);
  return callerFromSession(req);
};

export const callerOf = (res: Response) => res.locals.caller as Caller;

/** Agent key or signed-in user. */
export const requireCaller = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caller = await resolveCaller(req);
    if (!caller) return next(new AppError('Unauthorized — send an agent key in x-api-key or sign in', 401));
    res.locals.caller = caller;
    next();
  } catch (err) {
    next(err);
  }
};

/** Signed-in people only (approvals, signing, keys). Agents can't approve their own orders. */
export const requireUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.header(API_KEY_HEADER)) return next(new AppError('This action needs a signed-in person, not an agent key', 403));
    const caller = await callerFromSession(req);
    if (!caller) return next(new AppError('Unauthorized. Please log in.', 401));
    res.locals.caller = caller;
    next();
  } catch (err) {
    next(err);
  }
};

/** The agent acting for this request: the key's agent, or (web UI) `agentId` — default the org's first agent. */
export const actingAgent = async (caller: Caller, agentId?: string) => {
  if (caller.agent) return caller.agent;
  const agent = agentId
    ? await prisma.agent.findFirst({ where: { id: agentId, organizationId: caller.organizationId } })
    : await prisma.agent.findFirst({ where: { organizationId: caller.organizationId }, orderBy: { createdAt: 'asc' } });
  if (!agent) throw new AppError(agentId ? 'Agent not found in this organization' : 'No agents configured for this organization', 404, { agentId });
  return agent;
};
