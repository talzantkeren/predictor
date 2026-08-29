export function containsUnexpectedWebServerError(output: string) {
  return output
    .split(/\r?\n/u)
    .some((line) => /^\[WebServer\].*\bError:/u.test(line));
}
