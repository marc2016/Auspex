import React from 'react';
import MdiIcon from '@mdi/react';

interface IconProps {
  path: string;
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({
  path,
  size = 0.8,
  color = 'currentColor',
  className,
  style,
}) => {
  return (
    <MdiIcon
      path={path}
      size={size}
      color={color}
      className={className}
      style={{ verticalAlign: 'middle', display: 'inline-block', ...style }}
    />
  );
};
