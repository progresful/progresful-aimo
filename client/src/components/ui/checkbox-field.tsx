import { ReactNode } from 'react';
import { Checkbox, Field } from '@chakra-ui/react';

type CheckboxFieldProps = {
  label: ReactNode;
  name: string;
  required?: boolean;
  validationMessage?: ReactNode;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
  disabled?: boolean;
};

export const CheckboxField = ({
  label,
  name,
  required = false,
  validationMessage,
  description,
  checked,
  onChange,
  defaultChecked,
  disabled,
}: CheckboxFieldProps) => {
  return (
    <Field.Root invalid={!!validationMessage} mb={4} disabled={disabled}>
      <Checkbox.Root
        id={name}
        name={name}
        required={required}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(details) => onChange?.(details.checked === true)}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </Checkbox.Label>
      </Checkbox.Root>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
