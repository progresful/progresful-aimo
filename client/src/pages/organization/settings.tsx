import { ConfirmPopover } from '@/components/ConfirmPopover';
import { SettingsRow } from '@/components/SettingsRow';
import { toaster } from '@/components/ui/toaster';
import { TextInputField } from '@/components/ui/text-input-field';
import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Avatar, Button, Card, FileUpload, Flex, Stack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

const getOrgInitials = (name?: string | null) => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export const OrganizationSettings = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [name, setName] = useState(activeOrganization?.name ?? '');
  const [avatarSrc, setAvatarSrc] = useState(activeOrganization?.logo ?? undefined);

  useEffect(() => {
    setName(activeOrganization?.name ?? '');
    setAvatarSrc(activeOrganization?.logo ?? undefined);
  }, [activeOrganization?.name, activeOrganization?.logo]);

  const updateOrganizationMutation = useMutation({
    mutationFn: (data: { name?: string; logo?: string }) =>
      authClient.organization.update({ organizationId: activeOrganization?.id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toaster.create({ title: 'Organization updated', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Update failed', description: err.message, type: 'error' });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: () => authClient.organization.delete({ organizationId: activeOrganization!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toaster.create({ title: 'Organization deleted', type: 'success' });
      navigate('/app');
    },
    onError: (err) => {
      toaster.create({ title: 'Delete failed', description: err.message, type: 'error' });
    },
  });

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateOrganizationMutation.mutate({ name });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAvatarSrc(previewUrl);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      updateOrganizationMutation.mutate({ logo: reader.result as string });
    };
  };

  const nameChanged = name !== (activeOrganization?.name ?? '');

  return (
    <Card.Root>
      <Card.Body>
        <Stack gap={6}>
          <SettingsRow title="Logo" description="PNG or JPG, up to 1 MB." showDivider={false}>
            <FileUpload.Root>
              <Flex alignItems="center" gap={4}>
                <Avatar.Root size="lg" colorPalette="purple">
                  <Avatar.Fallback name={activeOrganization?.name ?? ''}>{getOrgInitials(activeOrganization?.name)}</Avatar.Fallback>
                  {avatarSrc ? <Avatar.Image src={avatarSrc} /> : null}
                </Avatar.Root>
                <FileUpload.HiddenInput accept="image/*" onChange={handleFileChange} />
                <FileUpload.Trigger asChild>
                  <Button variant="outline" size="sm">
                    Upload logo
                  </Button>
                </FileUpload.Trigger>
              </Flex>
            </FileUpload.Root>
          </SettingsRow>

          <SettingsRow title="Name" description="Shown to all members of the organization.">
            <form onSubmit={handleFormSubmit}>
              <Stack gap={3} maxWidth="sm" alignItems="flex-start">
                <TextInputField label="" name="name" value={name} onChange={setName} />
                <Button
                  colorPalette="blue"
                  type="submit"
                  disabled={!nameChanged || updateOrganizationMutation.isPending}
                  loading={updateOrganizationMutation.isPending}
                >
                  Save
                </Button>
              </Stack>
            </form>
          </SettingsRow>

          <SettingsRow
            title="Delete organization"
            description="Once you delete the organization, there is no going back. All of its data will be permanently lost."
            tone="danger"
          >
            <ConfirmPopover
              title="Delete organization"
              description={`Are you sure you want to delete "${activeOrganization?.name}"? This cannot be undone.`}
              onConfirm={() => deleteOrganizationMutation.mutate()}
              confirmColor="red"
            >
              <Button colorPalette="red" variant="outline" loading={deleteOrganizationMutation.isPending}>
                Delete organization
              </Button>
            </ConfirmPopover>
          </SettingsRow>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};
