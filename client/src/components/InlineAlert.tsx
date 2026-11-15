import { Alert } from '@chakra-ui/react';

type Props = {
  status: Alert.RootProps['status'];
  title: string;
};

export const InlineAlert = ({ status, title }: Props) => {
  return (
    <Alert.Root status={status}>
      <Alert.Indicator />
      <Alert.Title>{title}</Alert.Title>
    </Alert.Root>
  );
};
