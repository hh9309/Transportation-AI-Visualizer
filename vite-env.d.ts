// Extend the existing NodeJS namespace to include API_KEY in ProcessEnv.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    [key: string]: string | undefined;
  }
}
