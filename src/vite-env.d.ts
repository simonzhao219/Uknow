/// <reference types="vite/client" />

// Figma 匯出資產的模組宣告（vite.config.ts 有對應的 alias）
declare module 'figma:asset/*' {
  const src: string;
  export default src;
}
