import { Box, Button, Flex, Text, Textarea } from '@chakra-ui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Caption, Corners, Keycap } from '@/components/kit';

// Real Valio products, so the examples go through on the live API.
const examples = ['1,000 l lactose-free milk for Monday', '120 l Eila 3 % milk for Wednesday'];

/** "What do you need?" — the command module: words in, the order page opens on what it understood. */
export const Composer = () => {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();

  const go = (value = text) => {
    const t = value.trim();
    if (t) navigate(`/app/new?text=${encodeURIComponent(t)}`);
  };
  const empty = !text;

  return (
    <Box>
      <Text as="h1" textStyle="hero" fontSize={{ base: '48px', md: '64px' }}>
        What do you need?
      </Text>
      <Text marginTop={4} fontSize="15px" color="fg.muted">
        Say it in your own words — every order is checked against your signed rules.
      </Text>
      <Box
        position="relative"
        marginTop={8}
        bg="bg.panel"
        borderWidth="1px"
        borderColor={focused ? 'brand.accent' : 'border.strong'}
        borderRadius="l3"
        boxShadow={focused ? '0 0 0 1px var(--chakra-colors-brand-accent)' : 'none'}
        transition="border-color 0.15s, box-shadow 0.15s"
      >
        <Corners />
        <Flex align="center" justify="space-between" paddingX={6} paddingTop={4}>
          <Caption n="01">Input · request</Caption>
          <Text textStyle="label" color="fg.subtle">
            Enter to run · Shift+Enter new line
          </Text>
        </Flex>
        <Flex position="relative" align="start" gap={3} paddingX={6} paddingTop={3}>
          <Text fontFamily="mono" fontSize="22px" lineHeight="1.45" color="brand.fg" flexShrink={0} userSelect="none">
            ›
          </Text>
          <Box position="relative" flex={1} minWidth={0}>
            {/* The instrument's caret: a blinking block while the input waits for words. */}
            {empty ? (
              <Box
                position="absolute"
                top="7px"
                left={0}
                width="11px"
                height="24px"
                bg="brand.accent"
                zIndex={1}
                pointerEvents="none"
                css={{ animation: 'caret 1.05s steps(1) infinite' }}
              />
            ) : null}
            <Textarea
              value={text}
              autoFocus
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  go();
                }
              }}
              placeholder="20 kg butter and 10 l whipping cream for Friday"
              rows={2}
              resize="none"
              border="none"
              borderRadius="0"
              outline="none"
              bg="transparent"
              _focusVisible={{ outline: 'none', boxShadow: 'none' }}
              _placeholder={{ color: 'fg.subtle' }}
              css={{ caretColor: empty ? 'transparent' : 'var(--chakra-colors-brand-accent)', '&::placeholder': { paddingLeft: '18px' } }}
              fontSize="22px"
              fontWeight="500"
              letterSpacing="-0.02em"
              lineHeight="1.45"
              minHeight="76px"
              padding={0}
              aria-label="What do you need?"
            />
          </Box>
        </Flex>
        <Flex
          align="center"
          gap={2}
          marginTop={3}
          paddingX={6}
          paddingY={4}
          borderTopWidth="1px"
          borderColor="border"
          wrap="wrap"
        >
          <Text textStyle="label" color="fg.subtle" marginRight={1}>
            Presets
          </Text>
          {examples.map((ex) => (
            <Keycap key={ex} onClick={() => go(ex)}>
              {ex}
            </Keycap>
          ))}
          <Box flex={1} />
          <Button height="40px" paddingX={4} flexShrink={0} disabled={!text.trim()} onClick={() => go()}>
            <Text as="span" fontFamily="mono" fontSize="15px" lineHeight="1">
              ⏎
            </Text>
            Run
          </Button>
        </Flex>
      </Box>
    </Box>
  );
};
