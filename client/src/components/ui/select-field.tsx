import { ReactNode, useMemo } from 'react';
import { createListCollection, Field, Portal, Select } from '@chakra-ui/react';

export type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  label: string;
  name: string;
  options: SelectFieldOption[];
  required?: boolean;
  validationMessage?: ReactNode;
  description?: string;
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
  disabled?: boolean;
};

export const SelectField = ({
  label,
  name,
  options,
  required = false,
  validationMessage,
  description,
  placeholder = 'Select an option',
  value,
  onChange,
  defaultValue,
  disabled,
}: SelectFieldProps) => {
  const collection = useMemo(
    () =>
      createListCollection({
        items: options,
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
        isItemDisabled: (item) => item.disabled ?? false,
      }),
    [options]
  );

  return (
    <Field.Root invalid={!!validationMessage} mb={4} disabled={disabled}>
      <Field.Label htmlFor={name}>
        {label}
        {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
      </Field.Label>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      <Select.Root
        collection={collection}
        name={name}
        required={required}
        value={value !== undefined ? [value] : undefined}
        defaultValue={defaultValue !== undefined ? [defaultValue] : undefined}
        onValueChange={(details) => onChange?.(details.value[0] ?? '')}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger id={name}>
            <Select.ValueText placeholder={placeholder} />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
