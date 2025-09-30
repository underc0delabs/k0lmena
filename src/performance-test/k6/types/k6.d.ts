// Stubs mínimos para compilar con TS (no son los tipos oficiales)

declare module 'k6' {
  export function sleep(seconds: number): void;
  export function check<T = any>(value: T, checks: Record<string, (val: T) => boolean>): boolean;
}

declare module 'k6/http' {
  export type ResponseType = any;
  export type RefinedResponse<T = any> = {
    status: number;
    body?: any;
    headers?: Record<string, string>;
    json<T2 = any>(): T2;
  } & T;

  const http: {
    get(url: string, params?: { headers?: Record<string, string> }): RefinedResponse<ResponseType>;
    post(url: string, body?: any, params?: { headers?: Record<string, string> }): RefinedResponse<ResponseType>;
    put(url: string, body?: any, params?: { headers?: Record<string, string> }): RefinedResponse<ResponseType>;
    del(url: string, params?: { headers?: Record<string, string> }): RefinedResponse<ResponseType>;
  };

  export default http;
}

declare module 'k6/experimental/browser' {
  export const browser: {
    newPage(): any;
  };
}
