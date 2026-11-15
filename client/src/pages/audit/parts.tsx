import { Text } from '@chakra-ui/react';
import { ReactNode } from 'react';

export const Kbd = ({ children }: { children: ReactNode }) => (
  <Text
    as="span"
    fontFamily="mono"
    fontSize="10.5px"
    color="fg.subtle"
    borderWidth="1px"
    borderColor="border"
    borderBottomWidth="2px"
    borderRadius="l2"
    paddingX="5px"
    lineHeight="16px"
  >
    {children}
  </Text>
);
