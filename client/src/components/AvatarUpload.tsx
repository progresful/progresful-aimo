import { ChangeEvent, ReactNode, useState } from 'react';
import { Avatar, Button, FileUpload, Flex } from '@chakra-ui/react';

type AvatarUploadProps = {
  imageSrc?: string;
  colorPalette?: string;
  buttonLabel?: ReactNode;
  onUpload?: (base64: string, file: File) => void;
  accept?: string;
};

const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const AvatarUpload = ({
  imageSrc,
  colorPalette,
  buttonLabel = 'Upload photo',
  onUpload,
  accept = 'image/*',
}: AvatarUploadProps) => {
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(imageSrc);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);
    if (!file) return;
    setPreviewSrc(URL.createObjectURL(file));
    const base64 = await readAsBase64(file);
    onUpload?.(base64, file);
  };

  return (
    <FileUpload.Root accept={accept}>
      <Flex alignItems="center" gap={4}>
        <Avatar.Root colorPalette={colorPalette}>
          <Avatar.Fallback />
          {previewSrc ? <Avatar.Image src={previewSrc} /> : null}
        </Avatar.Root>
        <FileUpload.HiddenInput onChange={handleFileChange} />
        <FileUpload.Trigger asChild>
          <Button variant="outline" size="sm">
            {buttonLabel}
          </Button>
        </FileUpload.Trigger>
      </Flex>
    </FileUpload.Root>
  );
};
