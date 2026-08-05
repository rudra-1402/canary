import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Every shadcn-registry component imports this; twMerge resolves Tailwind class
// conflicts so a caller's className reliably overrides the component's defaults.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
