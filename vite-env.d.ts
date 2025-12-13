// Removed reference to vite/client as it was reported missing
// /// <reference types="vite/client" />

// Extend the existing NodeJS namespace to include API_KEY in ProcessEnv.
// This avoids redeclaring the global 'process' variable which causes "Cannot redeclare block-scoped variable" errors.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    [key: string]: string | undefined;
  }
}