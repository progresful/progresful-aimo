import { Box, Flex } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { Masthead } from './Masthead';

export const AppShell = () => (
  <Flex direction="column" height="100%" minHeight={0} overflow="hidden" bg="bg">
    <Masthead />
    <Box flex={1} minWidth={0} minHeight={0} overflowY="auto">
      <Outlet />
    </Box>
  </Flex>
);
