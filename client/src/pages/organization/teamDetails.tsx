import { ConfirmPopover } from '@/components/ConfirmPopover';
import { toaster } from '@/components/ui/toaster';
import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Avatar, Box, Button, EmptyState, Flex, Input, Separator, Stack, Table, Text, VStack } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TeamMember } from 'better-auth/plugins/organization';
import { useEffect, useState } from 'react';
import { LuChevronLeft, LuUsers } from 'react-icons/lu';
import { Link, useParams } from 'react-router';
import { TeamAddMember } from './teamAddMember';

const getInitials = (name?: string | null, email?: string | null) => {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email?.[0]?.toUpperCase() ?? '?';
};

export const OrganizationTeamDetails = () => {
  const { teamId } = useParams();
  const queryClient = useQueryClient();
  const { teams, members: allMembers, userIsAdminInOrganization, userIsOwnerInOrganization } = useOrganization();
  const team = teams.data?.find((t) => t.id === teamId);
  const [name, setName] = useState<string>(team?.name ?? '');

  useEffect(() => {
    setName(team?.name ?? '');
  }, [team?.name]);

  const updateNameMutation = useMutation({
    mutationFn: (data: { name: string }) => authClient.organization.updateTeam({ teamId: teamId as string, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams'] });
      toaster.create({ title: 'Team updated', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Failed to update team', description: err.message, type: 'error' });
    },
  });

  const teamMembers = useQuery({
    queryKey: [`organization-team-members-${teamId}`],
    queryFn: () => authClient.organization.listTeamMembers({ query: { teamId: teamId as string } }),
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: (memberId: string) => authClient.organization.removeTeamMember({ teamId: teamId!, userId: memberId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`organization-team-members-${teamId}`] });
      toaster.create({ title: 'Member removed from team', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Failed to remove member', description: err.message, type: 'error' });
    },
  });

  const canAddMember = userIsAdminInOrganization || userIsOwnerInOrganization;
  const teamMemberList = teamMembers.data ?? [];
  const pendingRemoveId = removeTeamMemberMutation.variables;
  const nameChanged = name.trim() !== '' && name !== team?.name;

  return (
    <Stack gap={6} marginTop={4}>
      <Box>
        <Link to="/app/organization/teams">
          <Flex alignItems="center" gap={1} color="fg.muted" _hover={{ color: 'fg' }}>
            <LuChevronLeft />
            <Text fontSize="sm">Back to teams</Text>
          </Flex>
        </Link>
        <Text fontSize="2xl" fontWeight="bold" marginTop={2}>
          {team?.name ?? 'Team'}
        </Text>
      </Box>

      <Stack gap={4}>
        <Flex gap={6} alignItems="center">
          <Text fontSize="sm" color="fg.muted" minWidth="120px">
            Created
          </Text>
          <Text>{team?.createdAt.toLocaleDateString()}</Text>
        </Flex>
        <Flex gap={6} alignItems="center" flexWrap="wrap">
          <Text fontSize="sm" color="fg.muted" minWidth="120px">
            Name
          </Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxWidth="300px" />
          <Button
            variant="outline"
            colorPalette="blue"
            onClick={() => updateNameMutation.mutate({ name })}
            disabled={!nameChanged || updateNameMutation.isPending}
            loading={updateNameMutation.isPending}
          >
            Update
          </Button>
        </Flex>
      </Stack>

      <Separator />

      <Flex justifyContent="space-between" alignItems="center" gap={4}>
        <Box>
          <Text fontWeight="semibold">Team members</Text>
          <Text fontSize="sm" color="fg.muted">
            {teamMemberList.length} {teamMemberList.length === 1 ? 'member' : 'members'}
          </Text>
        </Box>
        {canAddMember && (
          <TeamAddMember
            teamId={teamId as string}
            teamName={team?.name ?? ''}
            allMembers={allMembers.data?.members ?? []}
            teamMembers={(teamMembers.data ?? []) as TeamMember[]}
          />
        )}
      </Flex>

      {teamMemberList.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuUsers />
            </EmptyState.Indicator>
            <VStack textAlign="center">
              <EmptyState.Title>No members in this team</EmptyState.Title>
              <EmptyState.Description>Add organization members to this team to collaborate.</EmptyState.Description>
            </VStack>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Table.ScrollArea>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Name</Table.ColumnHeader>
                <Table.ColumnHeader>Added</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {teamMemberList.map((member) => {
                const orgMember = allMembers.data?.members.find((m) => m.user.id === member.userId);
                if (!orgMember) return null;
                const isRemoving = removeTeamMemberMutation.isPending && pendingRemoveId === member.userId;
                return (
                  <Table.Row key={member.id}>
                    <Table.Cell>
                      <Flex gap={2} alignItems="center">
                        <Avatar.Root size="xs">
                          <Avatar.Fallback name={orgMember.user.name ?? orgMember.user.email}>
                            {getInitials(orgMember.user.name, orgMember.user.email)}
                          </Avatar.Fallback>
                          {orgMember.user.image ? <Avatar.Image src={orgMember.user.image} /> : null}
                        </Avatar.Root>
                        {orgMember.user.name || orgMember.user.email}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>{member.createdAt.toLocaleDateString()}</Table.Cell>
                    <Table.Cell textAlign="end">
                      <ConfirmPopover
                        title="Remove member"
                        description="Are you sure you want to remove this member from the team?"
                        onConfirm={() => removeTeamMemberMutation.mutate(member.userId)}
                        confirmColor="red"
                      >
                        <Button variant="outline" colorPalette="red" size="xs" loading={isRemoving}>
                          Remove
                        </Button>
                      </ConfirmPopover>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      )}
    </Stack>
  );
};
