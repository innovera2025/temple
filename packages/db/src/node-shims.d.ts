declare module "node:child_process" {
  export interface ExecFileOptions {
    maxBuffer?: number;
  }

  export function execFile(
    file: string,
    args: string[],
    options: ExecFileOptions,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
}

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

declare const console: {
  error(message?: unknown, ...optionalParams: unknown[]): void;
  log(message?: unknown, ...optionalParams: unknown[]): void;
  table(tabularData?: unknown, properties?: string[]): void;
};
