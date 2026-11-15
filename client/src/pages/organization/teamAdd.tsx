import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Button, Dialog, DialogOpenChangeDetails, Field, Input, Portal, Stack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LuGroup } from 'react-icons/lu';

interface Errors {
  name: string;
}

export const TeamAdd = () => {
  const { activeOrganizationId, userIsAdminInOrganization, userIsOwnerInOrganization } = useOrganization();
  const canAddTeam = userIsAdminInOrganization || userIsOwnerInOrganization;
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({
    name: '',
  });
  const [name, setName] = useState<string>('');
  const queryClient = useQueryClient();
  const handleOpenChange = (details: DialogOpenChangeDetails) => {
    setOpen(details.open);
    if (!details.open) {
      setErrors({
        name: '',
      });
      setName('');
    }
  };

  const mutation = useMutation({
    mutationFn: (data: { name: string; organizationId: string }) => authClient.organization.createTeam(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams'] });
      setOpen(false);
      setName('');
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
        <Button variant="outline" colorPalette="blue">
          <LuGroup />
          Add team
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Add team</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="4">
              <Stack gap="4">
                <Field.Root>
                  <Field.Label>
                    Name
                    <Field.RequiredIndicator />
                  </Field.Label>
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                  {errors.name && <Field.ErrorText>{errors.name}</Field.ErrorText>}
                </Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  Close
                </Button>
              </Dialog.ActionTrigger>
              <Button
                onClick={() => mutation.mutate({ name, organizationId: activeOrganizationId! })}
                colorPalette="green"
                disabled={mutation.isPending}
              >
                Add
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
