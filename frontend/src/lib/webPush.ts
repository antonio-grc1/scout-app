export function soportaWebPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function esIosSinInstalar(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const navWithStandalone = navigator as Navigator & { standalone?: boolean };
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean(navWithStandalone.standalone);
  return !standalone;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function obtenerSuscripcionPushActual(): Promise<PushSubscription | null> {
  if (!soportaWebPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.pushManager) return null;
  return reg.pushManager.getSubscription();
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface SuscripcionPushSerializada {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function serializarSuscripcion(subscription: PushSubscription): SuscripcionPushSerializada {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey('p256dh'));
  const auth = json.keys?.auth || arrayBufferToBase64Url(subscription.getKey('auth'));

  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('No se pudo obtener una suscripción push válida del navegador.');
  }

  return {
    endpoint: subscription.endpoint,
    keys: { p256dh, auth },
  };
}

/** Suscripción que este dispositivo ya tiene (sin pedir permiso), lista para enviar al servidor. */
export async function leerSuscripcionPushActual(): Promise<SuscripcionPushSerializada | null> {
  const sub = await obtenerSuscripcionPushActual();
  return sub ? serializarSuscripcion(sub) : null;
}

export async function activarPushEnDispositivo(
  vapidPublicKey: string,
): Promise<SuscripcionPushSerializada> {
  if (!soportaWebPush()) {
    throw new Error('Este navegador no soporta notificaciones push.');
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error('No se otorgó permiso para mostrar notificaciones.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  return serializarSuscripcion(subscription);
}

export async function desactivarPushEnDispositivo(): Promise<string | null> {
  const sub = await obtenerSuscripcionPushActual();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
