import { ConfirmPopover } from '@/components/ConfirmPopover';
import { toaster } from '@/components/ui/toaster';
import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Box, Button, EmptyState, Flex, Stack, Table, Text, VStack } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuUsers } from 'react-icons/lu';
import { Link } from 'react-router';
import { TeamAdd } from './teamAdd';

export const OrganizationTeams = () => {
  const { teams, activeOrganizationId } = useOrganization();
  const queryClient = useQueryClient();

  const handleDeleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => authClient.organization.removeTeam({ teamId, organizationId: activeOrganizationId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-teams'] });
      toaster.create({ title: 'Team deleted', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Failed to delete team', description: err.message, type: 'error' });
    },
  });

  const teamList = teams.data ?? [];
  const pendingDeleteId = handleDeleteTeamMutation.variables;

  return (
    <Stack gap={6} marginTop={4}>
      <Flex justifyContent="space-between" alignItems="center" gap={4}>
        <Box>
          <Text color="fg.muted">Manage your organization teams here.</Text>
        </Box>
        <TeamAdd />
      </Flex>

      {teamList.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuUsers />
            </EmptyState.Indicator>
            <VStack textAlign="center">
              <EmptyState.Title>No teams yet</EmptyState.Title>
              <EmptyState.Description>Create a team to group members by project or department.</EmptyState.Description>
            </VStack>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Table.ScrollArea>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Name</Table.ColumnHeader>
                <Table.ColumnHeader>Members</Table.ColumnHeader>
                <Table.ColumnHeader>Created</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {teamList.map((team) => {
                const isDeleting = handleDeleteTeamMutation.isPending && pendingDeleteId === team.id;
                return (
                  <Table.Row key={team.id}>
                    <Table.Cell>
                      <Link to={`/app/organization/teams/${team.id}`}>
                        <Text _hover={{ textDecoration: 'underline' }}>{team.name}</Text>
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <TeamMembersCell teamId={team.id} />
                    </Table.Cell>
                    <Table.Cell>{team.createdAt.toLocaleDateString()}</Table.Cell>
                    <Table.Cell textAlign="end">
                      <ConfirmPopover
                        title="Delete team"
                        description={`Are you sure you want to delete "${team.name}"?`}
                        onConfirm={() => handleDeleteTeamMutation.mutate(team.id)}
                        confirmColor="red"
                      >
                        <Button variant="outline" colorPalette="red" size="xs" loading={isDeleting}>
                          Delete
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

const TeamMembersCell = ({ teamId }: { teamId: string }) => {
  const { data, isPending } = useQuery({
    queryKey: [`organization-team-members-${teamId}`],
    queryFn: () => authClient.organization.listTeamMembers({ query: { teamId } }),
    retry: false,
  });
  return <Text>{isPending ? '…' : data?.length ?? 0}</Text>;
};
