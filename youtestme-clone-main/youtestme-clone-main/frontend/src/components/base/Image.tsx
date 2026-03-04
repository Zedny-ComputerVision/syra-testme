import { Box } from '@mui/material';
import type { SxProps } from '@mui/material';
import type { ImgHTMLAttributes } from 'react';

interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    src?: string;
    alt?: string;
    sx?: SxProps;
}

const Image = ({ src, alt, sx, ...rest }: ImageProps) => (
    <Box component="img" src={src} alt={alt} sx={sx} {...rest} />
);

export default Image;
