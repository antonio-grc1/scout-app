import { buildOfficialPdf, type OfficialPdfBuilderOptions } from './officialPdfBuilder';

export interface PdfWorkerRequest {
  id: number;
  rawRespuestas: Record<string, unknown>;
  options: OfficialPdfBuilderOptions;
}

export interface PdfWorkerResponse {
  id: number;
  ok: boolean;
  bytes?: Uint8Array;
  error?: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PdfWorkerRequest>) => void) | null;
  postMessage: (message: PdfWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const { id, rawRespuestas, options } = event.data;
  try {
    const bytes = await buildOfficialPdf(rawRespuestas, options);
    const buffer = bytes.buffer instanceof ArrayBuffer ? bytes.buffer : undefined;
    if (buffer) {
      workerScope.postMessage({ id, ok: true, bytes }, [buffer]);
    } else {
      workerScope.postMessage({ id, ok: true, bytes });
    }
  } catch (err) {
    workerScope.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Error generando el PDF en Worker',
    });
  }
};
