// Polyfills para compatibilidad de pdfjs-dist v6 en navegadores móviles y desktop

if (typeof Uint8Array !== 'undefined') {
  const proto = Uint8Array.prototype as any;
  if (!proto.toHex) {
    proto.toHex = function () {
      return Array.from(this as Uint8Array)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
    };
  }

  const uint8Any = Uint8Array as any;
  if (!uint8Any.fromBase64) {
    uint8Any.fromBase64 = function (base64: string) {
      const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };
  }
}

if (typeof Promise !== 'undefined') {
  const promiseAny = Promise as any;
  if (!promiseAny.withResolvers) {
    promiseAny.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}
