import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Button, Dialog, DialogOpenChangeDetails, Field, Input, Portal, Stack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LuUserPlus } from 'react-icons/lu';

interface Errors {
  email: string;
  role: string;
}

export const InviteMember = ({ disabled }: { disabled: boolean }) => {
  const { activeOrganizationId, userIsAdminInOrganization, userIsOwnerInOrganization } = useOrganization();
  const canAddTeam = userIsAdminInOrganization || userIsOwnerInOrganization;
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({
    email: '',
    role: '',
  });
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<string>('member');
  const queryClient = useQueryClient();
  const handleOpenChange = (details: DialogOpenChangeDetails) => {
    setOpen(details.open);
    if (!details.open) {
      setErrors({
        email: '',
        role: '',
      });
      setEmail('');
      setRole('member');
    }
  };

  const mutation = useMutation({
    mutationFn: (data: { email: string; role: string; resend?: boolean; teamId?: string }) =>
      authClient.organization.inviteMember({
        email: data.email,
        role: data.role as 'admin' | 'member' | 'owner',
        organizationId: activeOrganizationId!,
        resend: data.resend,
        teamId: data.teamId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations'] });
      setOpen(false);
      setEmail('');
      setRole('member');
    },
    onError: (error) => {
      console.error(error);
    },
  });

  if (!canAddTeam || !activeOrganizationId) {
    return null;
  }

  return (
    <Dialog.Root lazyMount open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="outline" colorPalette="blue" disabled={disabled}>
          <LuUserPlus />
          Invite organization member
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Invite organization member</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="4">
              <Stack gap="4">
                <Field.Root>
                  <Field.Label>
                    Email
                    <Field.RequiredIndicator />
                  </Field.Label>
                  <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  {errors.email && <Field.ErrorText>{errors.email}</Field.ErrorText>}
                </Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={mutation.isPending || disabled}>
                  Close
                </Button>
              </Dialog.ActionTrigger>
              <Button onClick={() => mutation.mutate({ email, role })} colorPalette="green" disabled={mutation.isPending || disabled}>
                Invite
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
