import { Box, Stack } from '@chakra-ui/react';
import { Attention } from './Attention';
import { Composer } from './Composer';
import { RecentOrders } from './RecentOrders';

/** /app — what do you need, what's waiting for you, and the latest orders. Everything else is one link away. */
export const HomePage = () => (
  <Box height="100%" overflowY="auto">
    <Stack gap={8} maxWidth="880px" marginX="auto" paddingX={8} paddingTop={16} paddingBottom={20}>
      <Composer />
      <Attention />
      <RecentOrders />
    </Stack>
  </Box>
);
