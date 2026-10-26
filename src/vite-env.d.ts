/// <reference types="vite/client" />

declare module '*.css?inline' {
  const css: string
  export default css
}

declare module '*manifest.json' {
  const manifest: chrome.runtime.ManifestV3
  export default manifest
}
