declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { size: number };
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
