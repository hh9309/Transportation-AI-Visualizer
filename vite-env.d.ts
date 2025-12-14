/// <reference types="vite/client" />

declare var process: {
  env: {
    [key: string]: string | undefined;
    API_KEY: string;
  }
}
