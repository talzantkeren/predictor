// Unicode Bidi_Control characters can override or embed surrounding RTL/LTR
// text without being visible. Normal Hebrew, Arabic and Latin letters remain
// valid; only the formatting controls themselves are rejected.
const dangerousBidiControlCharactersPattern =
  /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function containsDangerousBidiControl(value: string) {
  return dangerousBidiControlCharactersPattern.test(value);
}
