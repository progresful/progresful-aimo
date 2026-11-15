import { ReactNode } from 'react';
import { Field, Input } from '@chakra-ui/react';

import { PasswordInput } from './password-input';

type TextInputFieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  validationMessage?: ReactNode;
  description?: string;
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
};

export const TextInputField = ({
  label,
  name,
  type = 'text',
  required = false,
  validationMessage,
  description,
  value,
  onChange,
  defaultValue,
}: TextInputFieldProps) => {
  const Component = type === 'password' ? PasswordInput : Input;
  return (
    <Field.Root invalid={!!validationMessage} required={required} mb={4}>
      <Field.Label htmlFor={name}>
        {label}
        <Field.RequiredIndicator />
      </Field.Label>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      <Component id={name} name={name} type={type} required={required} value={value} onChange={(e) => onChange?.(e.target.value)} defaultValue={defaultValue} />
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
