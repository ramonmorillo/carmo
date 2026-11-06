// Búsqueda de medicamentos en CIMA (AEMPS) a través de la Edge Function carmo-search-cima (solo cuentas
// CARMO). El navegador no llama a CIMA directamente (CORS). Devuelve el error tal cual, sin maquillarlo.
import { supabase } from '../lib/supabase';
import type { CimaDto } from '../domain/medication';

export async function searchCima(query: string): Promise<CimaDto[]> {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const q = query.trim();
  if (q.length < 3) return [];
  const { data, error } = await supabase.functions.invoke('carmo-search-cima', { body: { query: q, limit: 25 } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let detail = error.message;
    try { const body = ctx ? await ctx.json() as { error?: string } : null; if (body?.error) detail = body.error; } catch { /* sin cuerpo */ }
    throw new Error(detail || 'No se pudo consultar CIMA.');
  }
  const items = (data as { items?: CimaDto[] } | null)?.items;
  if (!Array.isArray(items)) throw new Error('Respuesta de CIMA no válida.');
  return items;
}
