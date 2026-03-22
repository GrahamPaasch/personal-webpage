declare module '@novnc/novnc/lib/rfb.js' {
  export default class RFB {
    constructor(target: HTMLElement, urlOrChannel: string, options?: any);
    scaleViewport: boolean;
    resizeSession: boolean;
    addEventListener(type: string, listener: (e: any) => void): void;
    disconnect(): void;
  }
}
