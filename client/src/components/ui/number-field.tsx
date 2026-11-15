import { ReactNode } from 'react';
import { Field, NumberInput } from '@chakra-ui/react';

type NumberFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  validationMessage?: ReactNode;
  description?: string;
  value?: number | string;
  onChange?: (val: string, valueAsNumber: number) => void;
  defaultValue?: number | string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
};

const toStringValue = (val: number | string | undefined) => {
  if (val === undefined) return undefined;
  return typeof val === 'number' ? String(val) : val;
};

export const NumberField = ({
  label,
  name,
  required = false,
  validationMessage,
  description,
  value,
  onChange,
  defaultValue,
  min,
  max,
  step,
  placeholder,
  disabled,
}: NumberFieldProps) => {
  return (
    <Field.Root invalid={!!validationMessage} mb={4} disabled={disabled}>
      <Field.Label htmlFor={name}>
        {label}
        {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
      </Field.Label>
      {description && <Field.HelperText>{description}</Field.HelperText>}
      <NumberInput.Root
        name={name}
        required={required}
        value={toStringValue(value)}
        defaultValue={toStringValue(defaultValue)}
        min={min}
        max={max}
        step={step}
        onValueChange={(details) => onChange?.(details.value, details.valueAsNumber)}
      >
        <NumberInput.Control>
          <NumberInput.IncrementTrigger />
          <NumberInput.DecrementTrigger />
        </NumberInput.Control>
        <NumberInput.Input id={name} placeholder={placeholder} />
      </NumberInput.Root>
      {validationMessage && <Field.ErrorText>{validationMessage}</Field.ErrorText>}
    </Field.Root>
  );
};
