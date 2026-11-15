import { ReactNode } from 'react';
import { Field, Switch } from '@chakra-ui/react';

type SwitchFieldProps = {
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

export const SwitchField = ({
  label,
  name,
  required = false,
  validationMessage,
  description,
  checked,
  onChange,
  defaultChecked,
  disabled,
}: SwitchFieldProps) => {
  return (
    <Field.Root invalid={!!validationMessage} mb={4} disabled={disabled}>
      <Switch.Root
        id={name}
        name={name}
        required={required}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(details) => onChange?.(details.checked === true)}
      >
        <Switch.HiddenInput />
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Label>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </Switch.Label>
      </Switch.Root>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
