'use client';

import { Combobox as ChakraCombobox, useFilter, useListCollection } from '@chakra-ui/react';
import { ReactNode, useState } from 'react';

export const Combobox = ({
  label,
  value,
  onChange,
  items,
  comboboxProps,
}: {
  label?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  items: { label: ReactNode; value: string; searchKey: string }[];
  comboboxProps?: ChakraCombobox.RootProps;
}) => {
  const [localValue, setLocalValue] = useState<string[]>(value ?? []);

  const { contains } = useFilter({ sensitivity: 'base' });

  const { collection, filter } = useListCollection({
    initialItems: items,
    filter: contains,
  });

  const shouldUseLocalState = onChange == null;
  const valueToUse = shouldUseLocalState ? localValue : value ?? [];

  const onChangHandler = (details: ChakraCombobox.ValueChangeDetails) => {
    if (shouldUseLocalState) {
      setLocalValue(details.value);
    } else {
      onChange(details.value);
    }
  };

  return (
    <ChakraCombobox.Root
      collection={collection}
      onInputValueChange={(e) => filter(e.inputValue)}
      value={valueToUse}
      onValueChange={onChangHandler}
      {...comboboxProps}
    >
      {label != null && <ChakraCombobox.Label>{label}</ChakraCombobox.Label>}
      <ChakraCombobox.Control>
        <ChakraCombobox.Input placeholder="Type to search" />
        <ChakraCombobox.IndicatorGroup>
          <ChakraCombobox.ClearTrigger />
          <ChakraCombobox.Trigger />
        </ChakraCombobox.IndicatorGroup>
      </ChakraCombobox.Control>
      <ChakraCombobox.Positioner>
        <ChakraCombobox.Content>
          <ChakraCombobox.Empty>No items found</ChakraCombobox.Empty>
          {collection.items.map((item) => (
            <ChakraCombobox.Item item={item} key={item.value}>
              {item.label}
              <ChakraCombobox.ItemIndicator />
            </ChakraCombobox.Item>
          ))}
        </ChakraCombobox.Content>
      </ChakraCombobox.Positioner>
    </ChakraCombobox.Root>
  );
};
