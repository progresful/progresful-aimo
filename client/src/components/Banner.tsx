import styled from '@emotion/styled';
import { LuBell } from 'react-icons/lu';

const BannerContainer = styled.div<{ $type: BannerType }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
  gap: 16px;
  background-color: ${({ $type }) =>
    $type === 'warning' ? 'color-mix(in srgb, var(--chakra-colors-status-pending) 8%, transparent)' : 'var(--chakra-colors-bg-inset)'};
  border: 1px solid
    ${({ $type }) => ($type === 'warning' ? 'color-mix(in srgb, var(--chakra-colors-status-pending) 22%, transparent)' : 'var(--chakra-colors-border)')};
  border-radius: 10px;
  padding: 24px;
  color: ${({ $type }) => ($type === 'warning' ? 'var(--chakra-colors-status-pending)' : 'inherit')};

  --banner-icon-color: ${({ $type }) => ($type === 'warning' ? 'var(--chakra-colors-status-pending)' : 'inherit')};
`;

const BannerTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
`;

const BannerContent = styled.div`
  font-size: 14px;
  line-height: 1.5;
`;

export type BannerType = 'warning';
export const Banner: React.FC<React.PropsWithChildren<{ type: BannerType; title: string }>> = ({ type, title, children }) => {
  return (
    <BannerContainer $type={type}>
      <BannerTitle>
        <LuBell size={20} strokeWidth={1} color="var(--banner-icon-color)" />
        {title}
      </BannerTitle>
      <BannerContent>{children}</BannerContent>
    </BannerContainer>
  );
};
