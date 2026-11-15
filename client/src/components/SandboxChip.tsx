import { Button, Dialog, Flex, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useResetSandbox, useSandbox } from '@/api/gateway';
import { toaster } from '@/components/ui/toaster';
import { Dot } from './kit';
import { errorText } from '@/pages/home/format';
import { resetProgress } from '@/pages/tryit/progress';

/** "● Sandbox / Try it / Reset" in the masthead's status strip, for sandbox (judge) organisations. Renders nothing elsewhere. */
export const SandboxChip = () => {
  const sandbox = useSandbox();
  const reset = useResetSandbox();
  const [confirm, setConfirm] = useState(false);
  if (!sandbox.data?.sandbox) return null;

  const doReset = () =>
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirm(false);
        resetProgress();
        toaster.create({
          type: 'success',
          title: 'Sandbox reset',
          description: 'A clean kitchen: no orders, no approvals, the rules as signed.',
        });
      },
      onError: (err) => toaster.create({ type: 'error', title: 'Couldn’t reset the sandbox', description: errorText(err) }),
    });

  const link = { color: 'fg.subtle', cursor: 'pointer', _hover: { color: 'brand.fg' } } as const;
  return (
    <Flex
      align="center"
      gap={2}
      textStyle="label"
      whiteSpace="nowrap"
      title="Your own test kitchen — nothing here touches real orders"
    >
      <Flex align="center" gap={1.5} color="fg.muted">
        <Dot tone="pending" size={6} steady />
        Sandbox
      </Flex>
      <Text color="border.emphasized">/</Text>
      <Link to="/app/try">
        <Text {...link}>Try it</Text>
      </Link>
      <Text color="border.emphasized">/</Text>
      <Text as="button" textStyle="label" {...link} onClick={() => setConfirm(true)}>
        Reset
      </Text>

      <Dialog.Root open={confirm} onOpenChange={(e) => setConfirm(e.open)} placement="center" size="sm">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content bg="bg.panel" borderWidth="1px" borderColor="border.strong" borderRadius="l3" boxShadow="float">
              <Dialog.Header>
                <Dialog.Title textStyle="title">
                  Reset the sandbox?
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text fontSize="13px" color="fg.muted" lineHeight="1.6">
                  Your test orders, approvals and rule changes go away and the challenge ticks start over. The audit log keeps its history
                  — only what happens after the reset is shown.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button size="sm" variant="ghost" color="fg.muted" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={reset.isPending}
                  loadingText="Resetting…"
                  onClick={doReset}
                >
                  Reset sandbox
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Flex>
  );
};
