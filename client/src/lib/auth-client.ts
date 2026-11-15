import { createAuthClient } from 'better-auth/react';
import { adminClient, apiKeyClient, organizationClient, lastLoginMethodClient } from 'better-auth/client/plugins';
import { featureFlagsClientPlugin } from '@emplv/better-auth-feature-flags/client';

export const authClient = createAuthClient({
  fetchOptions: {
    throw: true,
  },
  plugins: [
    adminClient(),
    apiKeyClient(),
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
    lastLoginMethodClient(),
    featureFlagsClientPlugin(),
  ],
});
export const { signIn, signUp, useSession, updateUser } = authClient;
