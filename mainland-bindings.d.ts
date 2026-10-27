interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; command?: string; [key: string]: unknown };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}

interface R2Object { size: number; key?: string }
interface R2ObjectBody extends R2Object { arrayBuffer(): Promise<ArrayBuffer> }
interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob, options?: Record<string, unknown>): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

// TypeScript requires `var` for a real global declaration.
// eslint-disable-next-line no-var
declare var __SURVEYING_RUNTIME_ENV__: {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  DEPLOYMENT_TARGET?: string;
} | undefined;
