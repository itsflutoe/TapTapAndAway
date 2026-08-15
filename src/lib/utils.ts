import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatStamps(n: number): string {
  return n === 1 ? '1 Stamp' : `${n} Stamps`;
}
