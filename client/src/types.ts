import { Organization as _Organization, Team as _Team, Invitation as _Invitation } from 'better-auth/plugins/organization';

export enum UserRole {
  user = 'user',
  admin = 'admin',
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string; // Date as string
  updatedAt: string; // Date as string
}

export interface UserWithRole extends User {
  role?: string;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}

export interface Session {
  id: string;
  expiresAt: string; // Date as string
  token: string;
  createdAt: string; // Date as string
  updatedAt: string; // Date as string
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
  ///
  activeOrganizationId: string | null;
  activeTeamId: string | null;
}

export interface SessionWithImpersonatedBy extends Session {
  impersonatedBy?: string;
}

export enum OrganizationTier {
  free = 'free',
  paid = 'paid',
}

export interface Organization extends _Organization {
  tier: OrganizationTier;
}

export interface MyMessage {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fromUserId: string;
  fromType: string;
  organizationId: string | null;
  teamId: string | null;
  isRead: boolean;
  readAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Team extends _Team {}

export interface Account {
  id: string;
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
  accountId: string;
  scopes: string[];
}

export interface UserSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null | undefined | undefined;
  userAgent?: string | null | undefined | undefined;
}

export interface Apikey {
  permissions: {
    [key: string]: string[];
  } | null;
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  userId: string;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: Date | null;
  enabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: number;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | null;
}

export interface Invitation extends _Invitation {
  organizationName: string;
}
