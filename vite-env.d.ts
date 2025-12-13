export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly API_KEY: string;
      [key: string]: string | undefined;
    }
  }
}
