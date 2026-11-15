import { Dialog as ChakraDialog, useDialog } from '@chakra-ui/react';
import { forwardRef, ReactNode, useImperativeHandle } from 'react';

export type DialogMethods = {
  close: () => void;
  open: () => void;
};
type Props = {
  footer?: ReactNode;
  title: string;
  trigger?: ReactNode;
  children: ReactNode;
};

export const Dialog = forwardRef<DialogMethods, Props>(({ footer, title, trigger, children }, ref) => {
  const dialog = useDialog();

  useImperativeHandle(ref, () => ({
    close: () => dialog.setOpen(false),
    open: () => dialog.setOpen(true),
  }));
  return (
    <ChakraDialog.RootProvider value={dialog}>
      <ChakraDialog.Root open={dialog.open}>
        {trigger && <ChakraDialog.Trigger asChild>{trigger}</ChakraDialog.Trigger>}
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.CloseTrigger />
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
            </ChakraDialog.Header>
            <ChakraDialog.Body>{children}</ChakraDialog.Body>
            <ChakraDialog.Footer>{footer}</ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </ChakraDialog.Root>
    </ChakraDialog.RootProvider>
  );
});
