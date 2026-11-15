import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUser } from '@/providers/session';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

/** The public top bar: the wordmark, the event line in mono, and the way in. */
export const PublicHeader = () => {
  const { user } = useUser();
  const location = useLocation();

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={4}
      paddingX={{ base: 4, md: 10 }}
      height="60px"
      position="relative"
      zIndex={2}
      borderBottomWidth="1px"
      borderColor="border.strong"
      bg="bg"
    >
      <NavLink to="/">
        <Logo />
      </NavLink>
      <Text
        textStyle="label"
        color="fg.subtle"
        display={{ base: 'none', lg: 'block' }}
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        whiteSpace="nowrap"
      >
        Junction 2026 · Valio Aimo · Trusted Trade Agents
      </Text>
      <Flex gap={1} alignItems="center">
        <ThemeToggle size="sm" />
        <Box width="1px" height="18px" bg="border" marginX={2} />
        {user ? (
          <NavLink to="/app">
            <Button size="sm" borderRadius="l2">
              Open app
            </Button>
          </NavLink>
        ) : (
          <NavLink to={`/login${location.pathname !== '/' ? `?redirect=${encodeURIComponent(location.pathname + location.search)}` : ''}`}>
            <Button size="sm" borderRadius="l2">
              Log in as judge
            </Button>
          </NavLink>
        )}
      </Flex>
    </Flex>
  );
};
