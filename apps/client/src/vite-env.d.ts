/// <reference types="vite/client" />

declare module '*.png?url' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '@pixelmon/shared/assets/*' {
  const src: string;
  export default src;
}
