import { ReactNode } from 'react';
import { Box, Separator, SimpleGrid, Stack, Text } from '@chakra-ui/react';

type SettingsRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
  showDivider?: boolean;
  tone?: 'default' | 'danger';
};

export const SettingsRow = ({ title, description, children, showDivider = true, tone = 'default' }: SettingsRowProps) => {
  return (
    <Stack gap={0}>
      {showDivider && <Separator marginBottom={6} />}
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 3, md: 8 }} alignItems="flex-start">
        <Box gridColumn={{ md: 'span 1' }}>
          <Text fontSize="md" fontWeight="semibold" color={tone === 'danger' ? 'fg.error' : undefined}>
            {title}
          </Text>
          {description && (
            <Text fontSize="sm" color="fg.muted" marginTop={1}>
              {description}
            </Text>
          )}
        </Box>
        <Box gridColumn={{ md: 'span 2' }}>{children}</Box>
      </SimpleGrid>
    </Stack>
  );
};
