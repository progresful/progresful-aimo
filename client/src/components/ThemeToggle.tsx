import { IconButton, IconButtonProps } from '@chakra-ui/react';
import { LuMoon, LuSun } from 'react-icons/lu';
import { useColorMode } from './ui/color-mode';

/** Small light/dark switch. Light is the default; the choice persists in localStorage. */
export const ThemeToggle = (props: Omit<IconButtonProps, 'aria-label'>) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const dark = colorMode === 'dark';
  return (
    <IconButton
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      variant="ghost"
      size="xs"
      color="fg.muted"
      _hover={{ bg: 'bg.hover', color: 'fg' }}
      onClick={toggleColorMode}
      {...props}
    >
      {dark ? <LuSun /> : <LuMoon />}
    </IconButton>
  );
};
