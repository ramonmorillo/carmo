import { useMemo, useState } from 'react';

import { createSaveGuard, type DbResponse, type SaveOutcome } from '../domain/saveGuard';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | SaveOutcome<unknown>;

/** Guardado explícito con estado visible: «Guardado» solo tras confirmación del servidor. */
export function useSave() {
  const guard = useMemo(() => createSaveGuard(), []);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  async function run<T>(op: () => Promise<DbResponse<T>>, onSaved?: (data: T) => void | Promise<void>): Promise<boolean> {
    setState({ kind: 'saving' });
    const outcome = await guard(op);
    if (outcome.kind === 'busy') return false;
    setState(outcome);
    if (outcome.kind === 'saved') { await onSaved?.(outcome.data); return true; }
    return false;
  }
  return { state, run, saving: state.kind === 'saving', reset: () => setState({ kind: 'idle' }) };
}
