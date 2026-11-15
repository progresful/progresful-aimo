import { Flex } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';

export const PublicLayout = () => (
  <Flex direction="column" minHeight="100%" bg="bg">
    <PublicHeader />
    <Flex as="main" direction="column" flex={1}>
      <Outlet />
    </Flex>
  </Flex>
);
