import { type ElementType, forwardRef, type ReactNode } from 'react';

export interface LoadErrorCalloutProps {
  title: ReactNode;
  description?: ReactNode;
  onRetry: () => void;
  retryLabel?: string;
  titleAs?: ElementType;
  className?: string;
}

export const LoadErrorCallout = forwardRef<HTMLDivElement, LoadErrorCalloutProps>(() => null);
