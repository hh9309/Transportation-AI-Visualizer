
// Removed reference to vite/client due to missing type definitions
declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string | undefined;
    [key: string]: string | undefined;
  }
}
