declare module 'node:test' {
  export const test: any;
  const testDefault: any;
  export default testDefault;
}

declare module 'node:assert/strict' {
  const assert: any;
  export default assert;
}
