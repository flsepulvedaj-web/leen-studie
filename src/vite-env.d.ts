/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_ACCESS_CODE: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
