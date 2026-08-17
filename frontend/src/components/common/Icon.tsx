import MdiIcon from '@mdi/react';
import type { ComponentProps } from 'react';

// Handles default and named export interop across ESM bundlers
const ResolvedIcon =
  (MdiIcon as unknown as { default?: typeof MdiIcon }).default || MdiIcon;

export function Icon(props: ComponentProps<typeof MdiIcon>) {
  return <ResolvedIcon {...props} />;
}

export default Icon;
