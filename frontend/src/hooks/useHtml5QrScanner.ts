import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export interface UseHtml5QrScannerOptions {
  containerId: string;
  activo: boolean;
  qrboxSize?: number;
  onDecode: (decodedText: string) => void | Promise<void>;
  mensajeErrorCamara?: string;
  onErrorCamara?: () => void;
}

export function useHtml5QrScanner({
  containerId,
  activo,
  qrboxSize = 240,
  onDecode,
  mensajeErrorCamara = 'No se pudo acceder a la cámara.',
  onErrorCamara,
}: UseHtml5QrScannerOptions) {
  const [iniciandoCamara, setIniciandoCamara] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const transicionRef = useRef<Promise<void>>(Promise.resolve());
  const onDecodeRef = useRef(onDecode);
  const onErrorCamaraRef = useRef(onErrorCamara);

  useEffect(() => {
    onDecodeRef.current = onDecode;
    onErrorCamaraRef.current = onErrorCamara;
  }, [onDecode, onErrorCamara]);

  const detenerCamara = useCallback(() => {
    transicionRef.current = transicionRef.current
      .then(async () => {
        const inst = scannerRef.current;
        if (!inst) return;
        try {
          if (inst.isScanning) {
            await inst.stop();
          }
        } catch {
          // Ignorar errores de transición DOM de html5-qrcode
        }
        try {
          inst.clear();
        } catch {
          // Ignorar si el contenedor ya no está visible
        }
        if (scannerRef.current === inst) {
          scannerRef.current = null;
        }
      })
      .catch(() => {});
    return transicionRef.current;
  }, []);

  useEffect(() => {
    if (!activo) {
      void detenerCamara();
      setIniciandoCamara(false);
      return;
    }

    let cancelado = false;
    setErrorCamara(null);
    setIniciandoCamara(true);

    transicionRef.current = transicionRef.current
      .then(async () => {
        // Breve pausa para asegurar que el nodo del lector esté montado en el DOM
        await new Promise((r) => setTimeout(r, 100));
        if (cancelado) return;

        const container = document.getElementById(containerId);
        if (!container || scannerRef.current?.isScanning) {
          return;
        }

        try {
          const html5QrCode = new Html5Qrcode(containerId);
          scannerRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: qrboxSize, height: qrboxSize },
            },
            (decodedText) => {
              void onDecodeRef.current(decodedText);
            },
            () => {
              // Ignorar frames sin QR detectado en stream continuo
            },
          );

          if (cancelado) {
            try {
              if (html5QrCode.isScanning) {
                await html5QrCode.stop();
              }
              html5QrCode.clear();
            } catch {
              // Ignorar al desmontar durante start()
            }
            if (scannerRef.current === html5QrCode) {
              scannerRef.current = null;
            }
          }
        } catch (err) {
          if (cancelado) return;
          console.warn('No se pudo acceder a la cámara:', err);
          scannerRef.current = null;
          setErrorCamara(mensajeErrorCamara);
          onErrorCamaraRef.current?.();
        } finally {
          if (!cancelado) {
            setIniciandoCamara(false);
          }
        }
      })
      .catch(() => {
        if (!cancelado) {
          setIniciandoCamara(false);
        }
      });

    return () => {
      cancelado = true;
      void detenerCamara();
    };
  }, [containerId, activo, qrboxSize, mensajeErrorCamara, detenerCamara]);

  return {
    iniciandoCamara,
    errorCamara,
    setErrorCamara,
    detenerCamara,
  };
}
