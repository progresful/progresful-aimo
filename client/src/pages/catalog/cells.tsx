// Small list/detail pieces for the catalog page.
import { Box, Flex, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Product } from '@/api/gateway';
import { eur, lacsOf, priceOf } from './format';

/** A small square of stamp ink + plain words. */
export const DotLabel = ({ color, children, muted }: { color: string; children: ReactNode; muted?: boolean }) => (
  <Flex align="center" gap={2} fontSize="13px" color={muted ? 'fg.subtle' : 'fg.muted'} minWidth={0}>
    <Box width="7px" height="7px" borderRadius="full" bg={color} flexShrink={0} />
    <Text truncate>{children}</Text>
  </Flex>
);

/** Lactose-free by LACS: yes (0 g/100 g), no, or unknown when the file has no value. */
export const LactoseFree = ({ product }: { product: Product }) => {
  const lacs = lacsOf(product);
  if (lacs === null)
    return (
      <Text fontSize="13px" color="fg.subtle" title="No LACS value in the product file">
        Unknown
      </Text>
    );
  return lacs === 0 ? (
    <DotLabel color="status.auto">Yes</DotLabel>
  ) : (
    <Text fontSize="13px" color="fg.subtle" title={`LACS ${lacs.toFixed(1)} g/100 g`}>
      No
    </Text>
  );
};

/** Allergen data present or missing (missing = a person must decide). */
export const AllergenData = ({ product }: { product: Product }) =>
  product.allergens === null ? (
    <DotLabel color="status.pending">Missing</DotLabel>
  ) : (
    <Text fontSize="13px" color="fg.subtle" truncate title={product.allergenLabels?.join(', ') || 'None declared'}>
      Present
    </Text>
  );

/** Price column: "€1.15 / carton" + "from Valio" when live; "on quote" when Valio gives no list price. */
export const PriceCell = ({ product }: { product: Product }) => {
  const pr = priceOf(product);
  if (pr.source === 'not-fetched')
    return (
      <Text className="tnum" fontSize="12.5px" color="fg.subtle" textAlign="right" title="Asked from Valio live when you open the product">
        —
      </Text>
    );
  if (pr.amount === null)
    return (
      <Text fontSize="12.5px" color="fg.subtle" textAlign="right" title="Valio gives this product's price when it's quoted">
        Price on quote
      </Text>
    );
  return (
    <Box textAlign="right" title={`per ${pr.per}`}>
      <Text fontSize="13px" fontWeight="500" className="tnum">
        {eur(pr.amount)}
      </Text>
      <Text fontSize="10.5px" color="fg.subtle">
        {pr.source === 'live' ? 'price from Valio' : pr.source === 'simulated' ? 'simulated' : `per ${pr.per}`}
      </Text>
    </Box>
  );
};
