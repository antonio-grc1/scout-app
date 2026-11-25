interface ValeBase {
  id: number;
  tokenQr: string;
  estado: 'ACTIVO' | 'UTILIZADO' | 'CANCELADO';
  cantidad: number;
  /** Unidades ya entregadas (retiro parcial) */
  cantidadRetirada?: number | null;
  item?: { nombre: string } | null;
}

/** Un vale cuenta como retirado si se entregó alguna de sus unidades (retiro parcial incluido). */
export function tieneRetiro(t: { estado: string; cantidadRetirada?: number | null }): boolean {
  return t.estado === 'UTILIZADO' || (t.cantidadRetirada ?? 0) > 0;
}

/**
 * Agrupa los vales de un pedido por su QR. Los pedidos nuevos comparten un único QR para toda
 * la compra; los anteriores tienen un QR por producto y siguen viéndose por separado.
 */
export function agruparValesPorQr<T extends ValeBase>(tickets: T[] | null | undefined) {
  const grupos = new Map<string, T[]>();
  for (const t of tickets ?? []) {
    const grupo = grupos.get(t.tokenQr);
    if (grupo) grupo.push(t);
    else grupos.set(t.tokenQr, [t]);
  }
  return [...grupos.values()].map((grupo) => ({
    ...grupo[0],
    // Sigue canjeable mientras quede algún producto activo
    estado: grupo.some((t) => t.estado === 'ACTIVO') ? ('ACTIVO' as const) : grupo[0].estado,
    items: grupo.map((t) => ({
      nombre: t.item?.nombre || 'Producto',
      cantidad: t.cantidad,
      retirada: t.estado === 'UTILIZADO' ? t.cantidad : (t.cantidadRetirada ?? 0),
    })),
  }));
}
