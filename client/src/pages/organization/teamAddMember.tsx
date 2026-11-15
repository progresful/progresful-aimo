import { Combobox } from '@/components/Combobox';
import { authClient } from '@/lib/auth-client';
import { Member } from '@/providers/session';
import { Button, Dialog, DialogOpenChangeDetails, Field, Portal, Stack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TeamMember } from 'better-auth/plugins/organization';
import { useState } from 'react';
import { LuUserPlus } from 'react-icons/lu';

export const TeamAddMember = ({
  teamId,
  teamName,
  allMembers,
  teamMembers,
}: {
  teamId: string;
  teamName: string;
  allMembers: Member[];
  teamMembers: TeamMember[];
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const handleOpenChange = (details: DialogOpenChangeDetails) => {
    setOpen(details.open);
    if (!details.open) {
      setError('');
      setTeamMemberIds([]);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: { teamId: string; userId: string }) => authClient.organization.addTeamMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams'] });
      queryClient.invalidateQueries({ queryKey: [`organization-team-members-${teamId}`] });
      setOpen(false);
      setTeamMemberIds([]);
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const handleAddTeamMember = async () => {
    if (teamMemberIds.length === 0) {
      setError('User ID is required');
      return;
    }
    for (const userId of teamMemberIds) {
      mutation.mutate({ teamId, userId });
    }
  };

  const items =
    allMembers
      ?.filter((member) => !teamMembers?.some((teamMember) => teamMember.userId === member.user.id))
      .map((member) => ({
        label: member.user.name ?? member.user.id,
        value: member.user.id,
        searchKey: member.user.name ?? member.user.id,
      })) ?? [];

  return (
    <Dialog.Root lazyMount open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="outline" colorPalette="blue">
          <LuUserPlus />
          Add team member
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Add team member to {teamName}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="4">
              <Stack gap="4">
                <Field.Root>
                  <Combobox items={items} label="Users" value={teamMemberIds} onChange={setTeamMemberIds} />
                  {error && <Field.ErrorText>{error}</Field.ErrorText>}
                </Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  Close
                </Button>
              </Dialog.ActionTrigger>
              <Button onClick={handleAddTeamMember} colorPalette="green" disabled={mutation.isPending}>
                Add
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
