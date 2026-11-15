'use client';

import { ChakraProvider } from '@chakra-ui/react';
// The type: Space Grotesk (interface), Geist Mono (labels, codes, money columns), Doto (dot-matrix readouts).
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/doto';
import { system } from '@/theme/system';
import { ColorModeProvider, type ColorModeProviderProps } from './color-mode';

// Light by default; the user's choice is persisted by next-themes under localStorage `theme`.
export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider defaultTheme="light" enableSystem={false} {...props} />
    </ChakraProvider>
  );
}
