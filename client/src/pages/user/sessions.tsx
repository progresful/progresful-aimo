import { LuSearch } from 'react-icons/lu';
import { Badge, Bleed, Button, Flex, Input, InputGroup, Table, Text } from '@chakra-ui/react';
import { useUserSessions } from '@/hooks/useUserSessions';
import { useUser } from '@/providers/session';
import { ConfirmPopover } from '@/components/ConfirmPopover';

export const UserSessions = () => {
  const { userSessions, revokeUserSession, revokeOtherUserSessions } = useUserSessions();
  const { session } = useUser();

  return (
    <Bleed maxWidth="4xl" justifySelf="center" width="100%">
      <Text marginBottom={2} color="fg.muted">
        Manage your sessions here
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
            <Table.ColumnHeader>Created At</Table.ColumnHeader>
            <Table.ColumnHeader>Expires At</Table.ColumnHeader>
            <Table.ColumnHeader>IP Address</Table.ColumnHeader>
            <Table.ColumnHeader>User Agent</Table.ColumnHeader>
            <Table.ColumnHeader>Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {userSessions?.map((userSession) => (
            <Table.Row key={userSession.id}>
              <Table.Cell>
                <Flex gap={2} alignItems="center">
                  {userSession.createdAt.toLocaleString()}
                </Flex>
              </Table.Cell>
              <Table.Cell>{userSession.expiresAt.toLocaleString()}</Table.Cell>
              <Table.Cell>
                <Flex gap={2} alignItems="center">
                  {userSession.ipAddress}
                  {userSession.id === session?.id && (
                    <Badge colorPalette="green" size="xs">
                      Current
                    </Badge>
                  )}
                </Flex>
              </Table.Cell>
              <Table.Cell>{userSession.userAgent}</Table.Cell>
              <Table.Cell>
                <Flex gap={0.5} alignItems="center">
                  <ConfirmPopover
                    title="Revoke session"
                    description="Are you sure you want to revoke this session?"
                    onConfirm={() => revokeUserSession(userSession.token)}
                    confirmColor="red"
                  >
                    <Button colorPalette="red" size="xs" variant="outline">
                      Revoke
                    </Button>
                  </ConfirmPopover>
                  {userSession.id === session?.id && (
                    <ConfirmPopover
                      title="Revoke all other sessions"
                      description="Are you sure you want to revoke all other sessions?"
                      onConfirm={() => revokeOtherUserSessions()}
                      confirmColor="blue"
                    >
                      <Button colorPalette="blue" size="xs" variant="outline">
                        Revoke all other
                      </Button>
                    </ConfirmPopover>
                  )}
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      </Table.ScrollArea>
    </Bleed>
  );
};
