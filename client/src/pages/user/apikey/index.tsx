import { LuSearch } from 'react-icons/lu';
import { Badge, Bleed, Button, Flex, Input, InputGroup, Table, Text } from '@chakra-ui/react';
import { useApikeys } from '@/hooks/useApikeys';
import { CreateApikey } from './createApikey';
import { ConfirmPopover } from '@/components/ConfirmPopover';

export const UserApikeys = () => {
  const { apikeys, refreshApiKeys, deleteApiKey } = useApikeys();

  return (
    <Bleed maxWidth="4xl" justifySelf="center" width="100%">
      <Text marginBottom={2} color="fg.muted">
        Manage your API keys here
      </Text>
      <Flex marginTop={4} marginBottom={2} justifyContent="flex-start" gap={4}>
        <InputGroup startElement={<LuSearch />}>
          <Input placeholder="Search" />
        </InputGroup>
        <CreateApikey refreshApiKeys={refreshApiKeys} />
      </Flex>
      <Table.ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader>Key</Table.ColumnHeader>
            <Table.ColumnHeader>Created At</Table.ColumnHeader>
            <Table.ColumnHeader>Expires At</Table.ColumnHeader>
            <Table.ColumnHeader>Last Used At</Table.ColumnHeader>
            <Table.ColumnHeader>Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {apikeys?.map((apikey) => (
            <Table.Row key={apikey.id}>
              <Table.Cell>
                <Flex gap={2} alignItems="center">
                  <Badge colorPalette={apikey.enabled ? 'green' : 'red'} size="xs">
                    {apikey.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  {apikey.name}
                </Flex>
              </Table.Cell>
              <Table.Cell>{apikey.start}...</Table.Cell>
              <Table.Cell>{apikey.createdAt.toLocaleString()}</Table.Cell>
              <Table.Cell>{apikey.expiresAt?.toLocaleString()}</Table.Cell>
              <Table.Cell>{apikey.lastRequest?.toLocaleString()}</Table.Cell>
              <Table.Cell>
                <Flex gap={0.5} alignItems="center">
                  <ConfirmPopover
                    title="Delete API key"
                    description="Are you sure you want to delete this API key?"
                    onConfirm={() => deleteApiKey(apikey.id)}
                    confirmColor="red"
                  >
                    <Button colorPalette="red" size="xs">
                      Delete
                    </Button>
                  </ConfirmPopover>
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
