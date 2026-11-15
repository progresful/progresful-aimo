import { authClient } from '@/lib/auth-client';
import { Flex, Text } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

export const AcceptInvitation = ({ anonymous }: { anonymous?: boolean }) => {
  const { inviteId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [error, setError] = useState<string | null>(null);

  console.log('email', email, inviteId, anonymous, searchParams, window.location.search);

  const acceptInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const userInvites = await authClient.organization.listUserInvitations();
      const invite = userInvites.find((invite) => invite.id === invitationId);
      if (!invite) {
        return Promise.reject(new Error('Invitation not found'));
      }
      switch (invite.status) {
        case 'pending':
          return authClient.organization.acceptInvitation({ invitationId });
        case 'accepted':
          return Promise.reject(new Error('Invitation already accepted'));
        case 'rejected':
          return Promise.reject(new Error('Invitation has been rejected'));
        case 'canceled':
          return Promise.reject(new Error('Invitation has been canceled'));
        default:
          return Promise.reject(new Error('Invalid invitation'));
      }
    },
    onSuccess: async (data) => {
      const orgId = data?.member?.organizationId;
      if (anonymous) {
        navigate('/login');
      } else {
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
        if (orgId) {
          await authClient.organization.setActive({ organizationId: orgId });
        }
        navigate('/app');
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  useEffect(() => {
    if (inviteId && !anonymous) {
      acceptInvitationMutation.mutate(inviteId);
    } else if (anonymous) {
      navigate(`/signup?redirect=${encodeURIComponent(`/accept-invitation/${inviteId}`)}&email=${encodeURIComponent(email ?? '')}`);
    }
  }, [inviteId, anonymous, email]);

  return (
    <Flex flex={1} direction="column" align="center" justify="center" gap={2} padding={8} textAlign="center">
      <Text fontWeight="550" letterSpacing="-0.02em" fontSize="26px" color="fg.muted">
        Accepting invitation…
      </Text>
      {error && <Text color="status.blocked">{error}</Text>}
    </Flex>
  );
};
