import { Button, Flex, Popover, Portal, Text } from '@chakra-ui/react';

export const ConfirmPopover = ({
  children,
  title,
  description,
  onConfirm,
  confirmColor = 'green',
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmColor?: string;
}) => {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.Body>
              <Popover.Title fontWeight="medium">{title}</Popover.Title>
              <Text my="4">{description}</Text>
              <Flex gap={2} justifyContent="flex-end" alignItems="center">
                <Popover.CloseTrigger asChild>
                  <Button variant="outline">Cancel</Button>
                </Popover.CloseTrigger>
                <Button onClick={onConfirm} colorPalette={confirmColor} variant="outline">
                  Confirm
                </Button>
              </Flex>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};
