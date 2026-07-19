import { clsx, type ClassValue } from "clsx";

/**
 * Utility for conditionally joining class names together.
 * Wraps clsx for use across the Rezel UI codebase.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
