declare type NullOrString = null | string;

interface peg$SyntaxError {
  (message: any, expected: any, found: any, location: any): void;
  buildMessage: (expected: any, found: any) => string;
}
declare module "XPathParser" {
  export const parse: (xpath: string, opts?: any) => NullOrString[][];
  export const SyntaxError: peg$SyntaxError;
}
