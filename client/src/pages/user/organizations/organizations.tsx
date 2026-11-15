import { LuSearch } from 'react-icons/lu';
import { Bleed, Flex, Input, InputGroup, Table, Text } from '@chakra-ui/react';
import { useOrganization, useUser } from '@/providers/session';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Invitation, Organization } from '@/types';
import { OrganizationRow } from './organizationRow';
import { InvitationOrganizationRow } from './invitationOrganizationRow';

export const UserOrganizations = () => {
  const { organizations } = useOrganization();
  const { user } = useUser();

  const invitations = useQuery<Invitation[]>({
    queryKey: ['user-invitations'],
    queryFn: () => authClient.organization.listUserInvitations() as Promise<Invitation[]>,
  });

  return (
    <Bleed maxWidth="4xl" justifySelf="center" width="100%">
      <Text marginBottom={2} color="fg.muted">
        Manage your organizations here
      </Text>
      <Flex marginTop={4} marginBottom={2} justifyContent="flex-start" gap={4}>
        <InputGroup startElement={<LuSearch />}>
          <Input placeholder="Search" />
        </InputGroup>
      </Flex>
      <Table.ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Organization</Table.ColumnHeader>
            <Table.ColumnHeader>Role</Table.ColumnHeader>
            <Table.ColumnHeader>Tier</Table.ColumnHeader>
            <Table.ColumnHeader>Joined at</Table.ColumnHeader>
            <Table.ColumnHeader>Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {organizations.data?.map((organization) => (
            <OrganizationRow key={organization.id} organization={organization as Organization} userId={user!.id} />
          ))}
        </Table.Body>
      </Table.Root>
      </Table.ScrollArea>

      {invitations.data && invitations.data.length > 0 && (
        <>
          <Text marginTop={8} marginBottom={2} color="fg.muted">
            Invitations
          </Text>
          <Table.ScrollArea>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Organization</Table.ColumnHeader>
                <Table.ColumnHeader>Role</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
                <Table.ColumnHeader>Expires at</Table.ColumnHeader>
                <Table.ColumnHeader>Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invitations.data?.map((invitation) => (
                <InvitationOrganizationRow key={invitation.id} invitation={invitation} />
              ))}
            </Table.Body>
          </Table.Root>
          </Table.ScrollArea>
        </>
      )}
    </Bleed>
  );
};
