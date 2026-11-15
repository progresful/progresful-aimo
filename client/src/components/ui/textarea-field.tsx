import { ReactNode } from 'react';
import { Field, Textarea } from '@chakra-ui/react';

type TextareaFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  validationMessage?: ReactNode;
  description?: string;
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
};

export const TextareaField = ({
  label,
  name,
  required = false,
  validationMessage,
  description,
  value,
  onChange,
  defaultValue,
  rows,
  placeholder,
}: TextareaFieldProps) => {
  return (
    <Field.Root invalid={!!validationMessage} mb={4}>
      <Field.Label htmlFor={name}>
        {label}
        {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
      </Field.Label>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      <Textarea
        id={name}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
      />
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
