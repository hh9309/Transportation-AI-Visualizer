// Manually declare the global process object for the browser/Vite environment.
// This allows TypeScript to compile 'process.env.API_KEY'.

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    [key: string]: string | undefined;
  }
}
