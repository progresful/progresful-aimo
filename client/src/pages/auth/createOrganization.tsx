import { TextInputField } from '@/components/ui/text-input-field';
import { authClient } from '@/lib/auth-client';
import { Button, Flex, Text } from '@chakra-ui/react';
import { Panel } from '@/components/kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Organization } from 'better-auth/plugins/organization';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export const CreateOrganization = () => {
  const [showError, setShowError] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createOrganizationMutation = useMutation({
    mutationFn: (data: { name: string; slug: string }) => {
      return authClient.organization.create({
        name: data.name,
        slug: data.slug,
        // @ts-expect-error extend better-auth types with additional fields
        tier: 'free',
      });
    },
    onSuccess: (response: Organization) => {
      console.log('data', response);
      authClient.organization.setActive({ organizationId: response.id });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      navigate('/app');
    },
    onError: () => {
      setShowError(true);
    },
  });

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    const data = new FormData(form);
    const formObject = Object.fromEntries(data.entries());

    // do login
    createOrganizationMutation.mutate({ name: formObject.name as string, slug: formObject.slug as string });
  }

  return (
    // A single sheet on the paper: name the company, then into the app.
    <Flex minHeight="100vh" align="center" justify="center" padding={4} bg="bg">
      <Panel width="100%" maxWidth="420px" paddingX={8} paddingY={8}>
        <Text textStyle="caps" color="fg.subtle">
          New workspace
        </Text>
        <Text as="h1" textStyle="title" fontSize="32px" marginTop={2} paddingBottom={4} marginBottom={6} borderBottomWidth="1px" borderColor="border.strong">
          Name your company
        </Text>
        <form onSubmit={handleFormSubmit} onChange={() => setShowError(false)}>
          <TextInputField required name="name" label="Company Name" description="How your clients will see your company" />
          <TextInputField
            required
            validationMessage={showError ? 'Slug already exists' : undefined}
            name="slug"
            label="Slug (short-name)"
            description="Used in links and identification"
          />
          <Button type="submit" width="100%" marginTop={2} borderRadius="l2">
            Create Company
          </Button>
        </form>
      </Panel>
    </Flex>
  );
};
