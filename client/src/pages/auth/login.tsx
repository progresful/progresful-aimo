import { useEffect, useState } from 'react';
import { Button, Text } from '@chakra-ui/react';
import { LuArrowRight } from 'react-icons/lu';
import { useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/components/AuthLayout';
import { authClient } from '@/lib/auth-client';

/** The demo's one account: the Junction judge sandbox (seeded; Reset in the app gives a clean start). */
const JUDGE = { email: 'judge@mandate.dev', password: 'hackjunction' };

/** Sign-in for the demo: one button, straight into the judge sandbox. */
export const Login = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = searchParams.get('redirect');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: session } = authClient.useSession();
  useEffect(() => {
    if (session?.user) navigate(redirect ?? '/app', { replace: true });
  }, [session, navigate, redirect]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn.email({
        ...JUDGE,
        callbackURL: `${window.location.origin}${redirect ? decodeURIComponent(redirect) : '/app'}`,
      });
    } catch (err) {
      setError((err as Error).message || 'Couldn’t sign in');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Junction 2026 · Valio Aimo"
      title="Try AI-MO"
      subtitle="Your own test kitchen: write an order, shape the rules, approve what needs a person."
      footer={<Text>Messed it up? Reset the sandbox from the top bar any time.</Text>}
    >
      <Button w="100%" size="lg" height="46px" borderRadius="l2" loading={busy} loadingText="Signing in…" onClick={() => void signIn()}>
        Log in as judge <LuArrowRight />
      </Button>
      {error ? (
        <Text marginTop={3} fontSize="13px" color="status.blocked">
          {error}
        </Text>
      ) : null}
    </AuthLayout>
  );
};
