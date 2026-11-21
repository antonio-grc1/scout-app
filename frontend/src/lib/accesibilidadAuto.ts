/**
 * Red de seguridad de accesibilidad para formularios armados a mano.
 *
 * Muchos formularios usan `<label>` sin `htmlFor`, campos con solo `placeholder` y botones de
 * solo ícono. Migrarlos todos a los primitivos `Input`/`Select`/`Button` es la solución de
 * fondo; mientras tanto este módulo, de forma idempotente y sin tocar el estado de React:
 *  1. asocia cada `<label>` huérfano con el control que le sigue (htmlFor + id);
 *  2. usa el `placeholder` como `aria-label` en campos que siguen sin nombre;
 *  3. da nombre a botones de solo ícono (desde `title` o según el ícono: cerrar, eliminar…).
 *
 * Los controles que ya tienen nombre propio no se modifican.
 */

const SELECTOR_CONTROL = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea';
const SELECTOR_CONTROL_ANY = `${SELECTOR_CONTROL},input[type="checkbox"],input[type="radio"]`;

// Nombre accesible según el ícono lucide, para botones sin texto ni title.
const NOMBRE_POR_ICONO: Array<[RegExp, string]> = [
  [/lucide-x\b|lucide-circle-x\b/, 'Cerrar'],
  [/lucide-trash/, 'Eliminar'],
  [/lucide-pencil|lucide-edit|lucide-square-pen|lucide-pen\b/, 'Editar'],
  [/lucide-search/, 'Buscar'],
  [/lucide-eye-off/, 'Ocultar'],
  [/lucide-eye\b/, 'Mostrar'],
  [/lucide-plus/, 'Agregar'],
  [/lucide-minus/, 'Quitar'],
  [/lucide-refresh|lucide-rotate/, 'Actualizar'],
  [/lucide-copy/, 'Copiar'],
  [/lucide-download/, 'Descargar'],
  [/lucide-maximize|lucide-minimize/, 'Pantalla completa'],
];

let contador = 0;

function tieneNombre(el: HTMLElement): boolean {
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
  if (el.closest('label')) return true;
  if (el.id) {
    try {
      if (document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    } catch {
      /* id inválido para selector */
    }
  }
  return false;
}

function asociarEtiquetas(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLLabelElement>('label:not([for])').forEach((label) => {
    if (label.querySelector(SELECTOR_CONTROL_ANY)) return; // control anidado: ya está asociado

    // El control es el siguiente hermano (o vive dentro de él), sin saltar otra etiqueta.
    let control: HTMLElement | null = null;
    let hermano = label.nextElementSibling;
    while (hermano && !control) {
      if (hermano.matches('label')) break;
      control = hermano.matches(SELECTOR_CONTROL_ANY)
        ? (hermano as HTMLElement)
        : hermano.querySelector<HTMLElement>(SELECTOR_CONTROL_ANY);
      hermano = hermano.nextElementSibling;
    }
    if (!control || tieneNombre(control)) return;

    if (!control.id) control.id = `auto-campo-${++contador}`;
    label.htmlFor = control.id;
  });
}

function nombrarCamposPorPlaceholder(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLInputElement>('input[placeholder],textarea[placeholder]').forEach((el) => {
    if (el.type === 'hidden' || tieneNombre(el)) return;
    const ph = el.getAttribute('placeholder')?.trim();
    if (ph) el.setAttribute('aria-label', ph);
  });
}

function nombrarBotonesDeIcono(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLElement>('button:not([aria-label]):not([aria-labelledby]),a[href]:not([aria-label]):not([aria-labelledby])').forEach((el) => {
    if ((el.textContent || '').trim().length > 0) return;
    const titulo = el.getAttribute('title')?.trim();
    if (titulo) {
      el.setAttribute('aria-label', titulo);
      return;
    }
    const icono = el.querySelector('svg');
    const clases = icono?.getAttribute('class') ?? '';
    const par = NOMBRE_POR_ICONO.find(([re]) => re.test(clases));
    if (par) el.setAttribute('aria-label', par[1]);
  });
}

export function aplicarAccesibilidadAutomatica(raiz: ParentNode = document): void {
  asociarEtiquetas(raiz);
  nombrarCamposPorPlaceholder(raiz);
  nombrarBotonesDeIcono(raiz);
}

/** Observa el DOM y aplica las correcciones (con debounce) a medida que aparecen vistas y modales. */
export function iniciarAccesibilidadAutomatica(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  let timer: number | undefined;
  const programar = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      aplicarAccesibilidadAutomatica();
    }, 120);
  };
  const observer = new MutationObserver(programar);
  observer.observe(document.body, { childList: true, subtree: true });
  programar();
  return () => {
    observer.disconnect();
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
