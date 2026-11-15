import { IconButton } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';
import { toaster } from '@/components/ui/toaster';

/** Small ghost icon button that copies `value` and flips to a check for a moment. */
export const CopyButton = ({
  value,
  label = 'Copied to clipboard',
  size = 'xs',
}: {
  value: string;
  label?: string;
  size?: 'xs' | 'sm';
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <IconButton
      aria-label="Copy"
      size={size}
      variant="ghost"
      color={copied ? 'status.auto' : 'fg.subtle'}
      _hover={{ color: 'fg', bg: 'bg.hover' }}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
        toaster.create({ title: label, type: 'success', duration: 1800 });
      }}
    >
      {copied ? <LuCheck /> : <LuCopy />}
    </IconButton>
  );
};
