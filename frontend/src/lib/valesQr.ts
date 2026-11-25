interface ValeBase {
  id: number;
  tokenQr: string;
  estado: 'ACTIVO' | 'UTILIZADO' | 'CANCELADO';
  cantidad: number;
  item?: { nombre: string } | null;
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
    items: grupo.map((t) => ({ nombre: t.item?.nombre || 'Producto', cantidad: t.cantidad })),
  }));
}
