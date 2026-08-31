const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(input: string): string {
  return input.replace(REGEX_SPECIAL_CHARS, '\\$&');
}
