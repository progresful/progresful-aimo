import { Box, Flex, Input, Spinner } from '@chakra-ui/react';
import { LuSearch, LuX } from 'react-icons/lu';

/** A search field drawn as a ruled line on the page (like a form to fill in), not a boxed input. Shared by catalog and audit. */
export const RuledSearch = ({
  value,
  onChange,
  placeholder,
  busy,
  width = '320px',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  busy?: boolean;
  width?: string;
  autoFocus?: boolean;
}) => (
  <Flex
    align="center"
    gap={2.5}
    width={width}
    height="38px"
    borderBottomWidth="1px"
    borderColor="border.strong"
    color="fg.subtle"
    transition="box-shadow 0.2s, border-color 0.2s"
    _focusWithin={{ borderColor: 'brand.accent', boxShadow: '0 1px 0 0 var(--chakra-colors-brand-accent)', color: 'brand.fg' }}
  >
    <Box flexShrink={0} display="flex">
      {busy ? <Spinner size="xs" /> : <LuSearch />}
    </Box>
    <Input
      unstyled
      flex={1}
      minWidth={0}
      height="100%"
      fontSize="15px"
      color="fg"
      bg="transparent"
      outline="none"
      _placeholder={{ color: 'fg.subtle' }}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
    />
    {value ? (
      <Box
        as="button"
        display="flex"
        color="fg.subtle"
        cursor="pointer"
        _hover={{ color: 'fg' }}
        onClick={() => onChange('')}
        aria-label="Clear search"
      >
        <LuX />
      </Box>
    ) : null}
  </Flex>
);
