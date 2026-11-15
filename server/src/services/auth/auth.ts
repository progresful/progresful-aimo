import { ulid } from 'ulid';
import { betterAuth } from 'better-auth';
import { admin, apiKey, organization, lastLoginMethod } from 'better-auth/plugins';
import { featureFlagsPlugin } from '@emplv/better-auth-feature-flags';

import { OrganizationTier } from '../../../prisma/generated/prisma/index.js';
import { hashPassword, verifyPassword } from '../../domains/auth/password.utils.ts';
import logger from '../logger.ts';
import emailService from '../emailService.ts';
import { databaseAdapter } from './databaseAdapter.ts';

import '../../domains/auth/account/account.commands.ts';
import '../../domains/auth/apikey/apikey.commands.ts';
import '../../domains/auth/feature/feature.commands.ts';
import '../../domains/auth/featureFlag/featureFlag.commands.ts';
import '../../domains/auth/invitation/invitation.commands.ts';
import '../../domains/auth/member/member.commands.ts';
import '../../domains/auth/organization/organization.commands.ts';
import '../../domains/auth/team/team.commands.ts';
import '../../domains/auth/teamMember/teamMember.commands.ts';
import '../../domains/auth/user/users.commands.ts';
import '../../domains/auth/verification/verification.commands.ts';
import '../../domains/gateway/gateway.commands.ts';

const isEmailsEnabled = process.env.BETTER_AUTH_EMAILS === 'true';
const publicURL = process.env.PUBLIC_FRONTEND_URL;

export const auth = betterAuth({
  //
  trustedOrigins: (() => {
    const origins = new Set<string>(['http://localhost:3000', 'http://localhost:5173']);
    if (publicURL) origins.add(publicURL);
    if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL);
    // Extra dev origins, e.g. a second Vite server: TRUSTED_ORIGINS=http://localhost:5180
    for (const o of (process.env.TRUSTED_ORIGINS ?? '').split(',')) if (o.trim()) origins.add(o.trim());
    return [...origins];
  })(),
  database: databaseAdapter,
  advanced: {
    database: {
      generateId: () => ulid(),
    },
  },
  logger: {
    log: (level, message, ...args) => {
      logger[level](`BetterAuth: ${message}`, ...args);
    },
  },
  //
  emailAndPassword: {
    enabled: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    sendResetPassword: isEmailsEnabled
      ? async ({ user, url, token }, request) => {
          logger.info(`[Auth] Sending reset password email to ${user.email}`);
          await emailService.sendTemplateEmail(
            { email: user.email, name: user.name },
            'Reset your password',
            'reset-password',
            new Map([
              ['url', url],
              ['token', token],
              ['name', user.name],
            ])
          );
        }
      : undefined,
    onPasswordReset: isEmailsEnabled
      ? async ({ user }, request) => {
          logger.info(`[Auth] Password for user ${user.email} has been reset.`);
        }
      : undefined,
  },
  emailVerification: {
    sendOnSignUp: isEmailsEnabled,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      logger.info(`[Auth] Sending verification email to ${user.email}`);
      await emailService.sendTemplateEmail(
        { email: user.email, name: user.name },
        'Verify your email',
        'verify-email',
        new Map([
          ['url', url],
          ['token', token],
          ['name', user.name],
        ])
      );
    },
    async afterEmailVerification(user, request) {
      logger.info(`[Auth] ${user.email} has been successfully verified!`);
    },
  },
  user: {
    changeEmail: {
      enabled: isEmailsEnabled,
      sendChangeEmailVerification: async ({ user, newEmail, url, token }, request) => {
        logger.info(`[Auth] Sending change email verification to ${user.email}`);
        await emailService.sendTemplateEmail(
          { email: user.email, name: user.name },
          'Approve email change',
          'approve-email-change',
          new Map([
            ['url', url],
            ['token', token],
            ['newEmail', newEmail],
          ])
        );
      },
    },
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: isEmailsEnabled
        ? async ({ user, url, token }, request) => {
            logger.info(`[Auth] Sending delete account verification to ${user.email}`);
            await emailService.sendTemplateEmail(
              { email: user.email, name: user.name },
              'Verify your account deletion',
              'verify-account-deletion',
              new Map([
                ['url', url],
                ['token', token],
              ])
            );
          }
        : undefined,
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      callbackURL: publicURL,
    },
  },
  //
  plugins: [
    admin(),
    apiKey({
      // Store "mk_live_7Hq2" so agent keys are recognisable in the UI.
      startingCharactersConfig: { shouldStore: true, charactersLength: 12 },
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60, // 1 minute
        maxRequests: 120, // requests per minute
      },
    }),
    organization({
      teams: {
        enabled: true,
        maximumTeams: 10, // Optional: limit teams per organization
        allowRemovingAllTeams: false, // Optional: prevent removing the last team
      },
      schema: {
        organization: {
          additionalFields: {
            tier: {
              type: 'string',
              defaultValue: 'free',
            },
          },
        },
      },
      async sendInvitationEmail(data) {
        const inviteLink = `${publicURL}/accept-invitation/${data.id}?email=${encodeURIComponent(data.email)}`;
        console.log('inviteLink', inviteLink);
        // sendOrganizationInvitation({
        //   email: data.email,
        //   invitedByUsername: data.inviter.user.name,
        //   invitedByEmail: data.inviter.user.email,
        //   teamName: data.organization.name,
        //   inviteLink,
        // });
      },
      organizationHooks: {
        beforeAddMember: async ({ organization }) => {
          // check if organization has paid tier
          console.log('organization', organization);
          // if (organization.tier !== OrganizationTier.paid) {
          //   throw new Error('Please upgrade to a paid tier to add members.');
          // }
        },
      },
    }),
    lastLoginMethod(),
    featureFlagsPlugin({
      allowOrganizationSpecificFeatureFlags: true,
    }),
  ],
});
