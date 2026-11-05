import type { SaveState } from '../../lib/useSave';
import { Notice } from './Notice';

export function SaveStatus({ state }: { state: SaveState }) {
  switch (state.kind) {
    case 'saving': return <p className="carmo-hint" role="status">Guardando…</p>;
    case 'saved': return <Notice tone="success">Guardado y confirmado por el servidor.</Notice>;
    case 'rejected': return <Notice tone="danger" title="No guardado">{state.message}</Notice>;
    case 'network_error': return <Notice tone="danger" title="No guardado · error de conexión">{state.message}</Notice>;
    default: return null;
  }
}
