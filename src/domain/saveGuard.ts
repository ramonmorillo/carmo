// Guardado explícito y seguro: impide el doble envío, distingue fallo de red de rechazo de la base de
// datos y NUNCA informa «guardado» si no hay confirmación del servidor (garantía G7).

export type SaveOutcome<T> =
  | { kind: 'saved'; data: T }
  | { kind: 'rejected'; message: string }
  | { kind: 'network_error'; message: string }
  | { kind: 'busy' };

export type DbResponse<T> = { data: T | null; error: { message: string; code?: string } | null };

const NETWORK_PATTERNS = [/fetch/i, /network/i, /failed to fetch/i, /timeout/i, /load failed/i, /ECONN/i];

export function isNetworkError(message: string): boolean {
  return NETWORK_PATTERNS.some((p) => p.test(message));
}

export function createSaveGuard() {
  let inFlight = false;
  return async function save<T>(operation: () => Promise<DbResponse<T>>): Promise<SaveOutcome<T>> {
    if (inFlight) return { kind: 'busy' };
    inFlight = true;
    try {
      const response = await operation();
      if (response.error) {
        return isNetworkError(response.error.message)
          ? { kind: 'network_error', message: 'Sin conexión con el servidor: los datos NO se han guardado. Compruebe la conexión y vuelva a intentarlo.' }
          : { kind: 'rejected', message: response.error.message };
      }
      if (response.data === null || (Array.isArray(response.data) && response.data.length === 0)) {
        return { kind: 'rejected', message: 'El servidor no confirmó el guardado (0 filas afectadas: sin permiso o el registro cambió). Recargue la página.' };
      }
      return { kind: 'saved', data: response.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'network_error', message: `Sin conexión con el servidor: los datos NO se han guardado (${message}).` };
    } finally {
      inFlight = false;
    }
  };
}
