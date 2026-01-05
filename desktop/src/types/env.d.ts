/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MODEL_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
