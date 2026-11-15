import { authClient } from '@/lib/auth-client';
import {
  Alert,
  Button,
  Clipboard,
  Dialog,
  DialogOpenChangeDetails,
  Field,
  IconButton,
  Input,
  InputGroup,
  NumberInput,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useState } from 'react';

interface NewApikey {
  name: string;
  expiresIn: number;
  prefix: string;
}
interface Errors {
  name: string[];
  expiresIn: string[];
}

const defaultApikey = {
  name: '',
  expiresIn: 30, // 30 days
  prefix: 'vdl_',
};

export const CreateApikey = ({ refreshApiKeys }: { refreshApiKeys: () => Promise<void> }) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({
    name: [],
    expiresIn: [],
  });
  const [apikey, setApikey] = useState<NewApikey>(defaultApikey);
  const [key, setKey] = useState<string | null>(null);

  const handleOpenChange = (details: DialogOpenChangeDetails) => {
    setOpen(details.open);
    if (!details.open) {
      setKey(null);
      setApikey(defaultApikey);
      setErrors({
        name: [],
        expiresIn: [],
      });
    }
  };

  const handleCreateApikey = async () => {
    setIsLoading(true);
    const newErrors: Errors = {
      name: [],
      expiresIn: [],
    };
    if (apikey.name.length === 0) {
      newErrors.name.push('Name is required');
    }
    if (apikey.expiresIn <= 0 || isNaN(apikey.expiresIn)) {
      newErrors.expiresIn.push('Expires In must be greater than 0');
    }
    try {
      if (newErrors.name.length === 0 && newErrors.expiresIn.length === 0) {
        const data = await authClient.apiKey.create({
          name: apikey.name,
          expiresIn: apikey.expiresIn * 24 * 60 * 60,
          prefix: apikey.prefix,
        });
        await refreshApiKeys();
        setKey(data.key);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setErrors(newErrors);
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root lazyMount open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="outline" colorPalette="blue">
          Create new API key
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Create new API key</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="4">
              {key ? (
                <Stack gap="4">
                  <Field.Root>
                    <Clipboard.Root width="100%" value={key}>
                      <Clipboard.Label textStyle="label">API Key</Clipboard.Label>
                      <InputGroup
                        endElement={
                          <Clipboard.Trigger asChild>
                            <IconButton variant="surface" size="xs" me="-2">
                              <Clipboard.Indicator />
                            </IconButton>
                          </Clipboard.Trigger>
                        }
                      >
                        <Clipboard.Input asChild>
                          <Input />
                        </Clipboard.Input>
                      </InputGroup>
                    </Clipboard.Root>
                  </Field.Root>
                  <Alert.Root status="warning" title="Copy your API key now.">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Copy API key now.</Alert.Title>
                      <Alert.Description>
                        <Text>It will not be available after you close this dialog.</Text>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                </Stack>
              ) : (
                <Stack gap="4">
                  <Field.Root>
                    <Field.Label>
                      Name
                      <Field.RequiredIndicator />
                    </Field.Label>
                    <Input placeholder="Name" value={apikey.name} onChange={(e) => setApikey({ ...apikey, name: e.target.value })} />
                    {errors.name && <Field.ErrorText>{errors.name.join('\n ')}</Field.ErrorText>}
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>
                      Expires In (days)
                      <Field.RequiredIndicator />
                    </Field.Label>
                    <NumberInput.Root width="100%">
                      <NumberInput.Control />
                      <NumberInput.Input
                        value={apikey.expiresIn}
                        onChange={(e) => setApikey({ ...apikey, expiresIn: parseInt(e.target.value) })}
                      />
                    </NumberInput.Root>
                    {errors.expiresIn && <Field.ErrorText>{errors.expiresIn.join('\n ')}</Field.ErrorText>}
                  </Field.Root>
                </Stack>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={isLoading}>
                  {key ? 'Close' : 'Cancel'}
                </Button>
              </Dialog.ActionTrigger>
              {!key && (
                <Button onClick={handleCreateApikey} colorPalette="green" disabled={isLoading}>
                  Create
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
