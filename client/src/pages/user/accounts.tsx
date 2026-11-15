import { LuSearch } from 'react-icons/lu';
import { Bleed, Flex, Input, InputGroup, Table, Text } from '@chakra-ui/react';
import { useAccounts } from '@/hooks/useAccounts';

const providerMapping = {
  credential: 'Credentials',
  google: 'Google',
  github: 'GitHub',
};

export const UserAccounts = () => {
  const { accounts } = useAccounts();

  return (
    <Bleed maxWidth="4xl" justifySelf="center" width="100%">
      <Text marginBottom={2} color="fg.muted">
        Manage your accounts here
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
            <Table.ColumnHeader>Provider</Table.ColumnHeader>
            <Table.ColumnHeader>Scopes</Table.ColumnHeader>
            <Table.ColumnHeader>Created At</Table.ColumnHeader>
            <Table.ColumnHeader>Updated At</Table.ColumnHeader>
            {/* <Table.ColumnHeader>Actions</Table.ColumnHeader> */}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {accounts?.map((account) => (
            <Table.Row key={account.id}>
              <Table.Cell>
                <Flex gap={2} alignItems="center">
                  {providerMapping[account.providerId as keyof typeof providerMapping] ?? account.providerId}
                </Flex>
              </Table.Cell>
              <Table.Cell>{account.scopes.join(', ')}</Table.Cell>
              <Table.Cell>{account.createdAt.toLocaleDateString()}</Table.Cell>
              <Table.Cell>{account.updatedAt.toLocaleDateString()}</Table.Cell>
              {/* <Table.Cell>
                <Button>Delete</Button>
              </Table.Cell> */}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      </Table.ScrollArea>
    </Bleed>
  );
};
