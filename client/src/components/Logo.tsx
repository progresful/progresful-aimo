import { Flex, Text } from '@chakra-ui/react';

/** The glyph: a signal (orange dot) cleared through a gate, on a dark key. Inline so it follows the theme. */
export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden style={{ flexShrink: 0 }}>
    <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="var(--chakra-colors-fg)" />
    <path d="M6.5 16H13" stroke="var(--chakra-colors-bg-panel)" strokeWidth="2" strokeLinecap="round" />
    <rect x="14.5" y="8" width="3" height="16" rx="1" fill="var(--chakra-colors-bg-panel)" />
    <circle cx="23.5" cy="16" r="3.4" fill="var(--chakra-colors-brand-accent)" />
  </svg>
);

/** The wordmark: glyph + "AI-MO" tracked out, and a quiet "for Valio Aimo" in mono. */
export const Logo = ({ size = 26, sub = true }: { size?: number; sub?: boolean }) => (
  <Flex align="center" gap={2.5}>
    <LogoMark size={size} />
    <Flex align="baseline" gap={2.5}>
      <Text fontSize={`${Math.round(size * 0.6)}px`} fontWeight="700" lineHeight="1" letterSpacing="0.16em" color="fg">
        AI-MO
      </Text>
      {sub ? (
        <Text textStyle="label" fontSize="10px" color="fg.subtle" whiteSpace="nowrap">
          for Valio Aimo
        </Text>
      ) : null}
    </Flex>
  </Flex>
);
