import { ReactNode } from 'react';
import { Bleed, Center, Heading, HeadingProps } from '@chakra-ui/react';

type PageContainerProps = {
  title?: ReactNode;
  headingSize?: HeadingProps['size'];
  maxWidth?: string | number;
  padding?: number | string | { base?: number | string; md?: number | string };
  children: ReactNode;
};

export const PageContainer = ({
  title,
  headingSize = '2xl',
  maxWidth = '4xl',
  padding = { base: 3, md: 4 },
  children,
}: PageContainerProps) => {
  return (
    <Center alignItems="baseline" width="100%">
      <Bleed padding={padding} width="100%" maxWidth={maxWidth}>
        {title ? (
          <Heading size={headingSize} fontWeight="550" letterSpacing="-0.03em" marginTop={8} marginBottom={6}>
            {title}
          </Heading>
        ) : null}
        {children}
      </Bleed>
    </Center>
  );
};
