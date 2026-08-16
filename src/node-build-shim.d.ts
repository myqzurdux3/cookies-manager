// @types/node is not part of the allowed dependency set for this project.
// vite.config.ts uses `node:path` and `__dirname` (Node's build-time
// tooling context, never shipped to the extension), so this minimal ambient
// shim lets `tsc --noEmit` type-check it without pulling in @types/node.
declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare const __dirname: string;
