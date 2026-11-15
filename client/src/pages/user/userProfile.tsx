import { ConfirmPopover } from '@/components/ConfirmPopover';
import { SettingsRow } from '@/components/SettingsRow';
import { toaster } from '@/components/ui/toaster';
import { TextInputField } from '@/components/ui/text-input-field';
import { authClient, updateUser } from '@/lib/auth-client';
import { useUser } from '@/providers/session';
import { Avatar, Button, Card, FileUpload, Flex, Stack, Text } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { ChangeEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

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

export const UserProfile = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [avatarSrc, setAvatarSrc] = useState(user?.image ?? undefined);

  useEffect(() => {
    setName(user?.name ?? '');
    setAvatarSrc(user?.image ?? undefined);
  }, [user?.name, user?.image]);

  const updateNameMutation = useMutation({
    mutationFn: (data: { name?: string; image?: string }) => updateUser(data),
    onSuccess: () => {
      toaster.create({ title: 'Profile updated', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Update failed', description: err.message, type: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => authClient.deleteUser(),
    onSuccess: (result) => {
      const message = (result as { message?: string } | undefined)?.message;
      if (message) {
        toaster.create({ title: 'Check your email', description: message, type: 'info' });
      } else {
        toaster.create({ title: 'Account deleted', type: 'success' });
        navigate('/login');
      }
    },
    onError: (err) => {
      toaster.create({ title: 'Failed to delete account', description: err.message, type: 'error' });
    },
  });

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateNameMutation.mutate({ name });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAvatarSrc(previewUrl);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      updateNameMutation.mutate({ image: reader.result as string });
    };
  };

  const nameChanged = name !== (user?.name ?? '');

  return (
    <Card.Root>
      <Card.Body>
        <Stack gap={6}>
          <SettingsRow title="Profile picture" description="PNG or JPG, up to 1 MB." showDivider={false}>
            <FileUpload.Root>
              <Flex alignItems="center" gap={4}>
                <Avatar.Root size="lg">
                  <Avatar.Fallback name={user?.name ?? user?.email ?? ''}>{getInitials(user?.name, user?.email)}</Avatar.Fallback>
                  {avatarSrc ? <Avatar.Image src={avatarSrc} /> : null}
                </Avatar.Root>
                <FileUpload.HiddenInput accept="image/*" onChange={handleFileChange} />
                <FileUpload.Trigger asChild>
                  <Button variant="outline" size="sm">
                    Upload photo
                  </Button>
                </FileUpload.Trigger>
              </Flex>
            </FileUpload.Root>
          </SettingsRow>

          <SettingsRow title="Email" description="The email you sign in with.">
            <Text>{user?.email}</Text>
          </SettingsRow>

          <SettingsRow title="Name" description="Shown across the app.">
            <form onSubmit={handleFormSubmit}>
              <Stack gap={3} maxWidth="sm" alignItems="flex-start">
                <TextInputField label="" name="name" value={name} onChange={setName} />
                <Button
                  colorPalette="blue"
                  type="submit"
                  disabled={!nameChanged || updateNameMutation.isPending}
                  loading={updateNameMutation.isPending}
                >
                  Save
                </Button>
              </Stack>
            </form>
          </SettingsRow>

          <SettingsRow
            title="Delete account"
            description="Once you delete your account, there is no going back. All of your information will be lost."
            tone="danger"
          >
            <ConfirmPopover
              title="Delete account"
              description="Are you sure you want to delete your account? This cannot be undone."
              onConfirm={() => deleteMutation.mutate()}
              confirmColor="red"
            >
              <Button colorPalette="red" variant="outline" loading={deleteMutation.isPending}>
                Delete account
              </Button>
            </ConfirmPopover>
          </SettingsRow>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
};
