import { Button, Menu as ChakraMenu, Portal } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { LuCheck } from 'react-icons/lu';

export type MenuItem = { value: string; label: string } | { isSeparator: true };

type MenuPlacement = 'top-end' | 'bottom-end' | 'top-start' | 'bottom-start';

type MenuProps = {
  title: ReactNode;
  items: MenuItem[];
  onChange(value: { value: string }): void;
  selected?: string;
  placement?: MenuPlacement;
};

export const Menu = ({ title, items, onChange, selected, placement = 'top-end' }: MenuProps) => {
  return (
    <ChakraMenu.Root positioning={{ placement }} onSelect={onChange}>
      <ChakraMenu.Trigger asChild>
        <Button justifyContent="flex-start" variant="ghost" width="100%" height="36px" paddingX={2} borderRadius="l2" textOverflow="ellipsis" overflow="hidden" _hover={{ bg: 'bg.hover' }}>
          {title}
        </Button>
      </ChakraMenu.Trigger>
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content minWidth={200}>
            {items.map((item, i) =>
              'isSeparator' in item ? (
                <ChakraMenu.Separator key={`sep-${i}`} />
              ) : (
                <ChakraMenu.Item key={item.value} value={item.value}>
                  {item.label}
                  {selected && selected === item.value ? (
                    <ChakraMenu.ItemCommand>
                      <LuCheck />
                    </ChakraMenu.ItemCommand>
                  ) : null}
                </ChakraMenu.Item>
              )
            )}
          </ChakraMenu.Content>
        </ChakraMenu.Positioner>
      </Portal>
    </ChakraMenu.Root>
  );
};
