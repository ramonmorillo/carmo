import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Debe evaluarse antes que el router: captura y limpia los tokens de invitación/recuperación de la URL.
import './authLinks';

export type SupabaseEnvStatus = {
  isConfigured: boolean;
  missingVars: Array<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'>;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const missingVars: SupabaseEnvStatus['missingVars'] = [];
if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL');
if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');

export const supabaseEnvStatus: SupabaseEnvStatus = {
  isConfigured: missingVars.length === 0,
  missingVars,
};

/**
 * Clave propia para guardar la sesión en el navegador. CARMO y DERMAPEX comparten proyecto Supabase
 * y se publican en el mismo origen (ramonmorillo.github.io): sin esta clave, ambas apps leerían y
 * sobrescribirían la misma sesión. Evita colisiones accidentales; NO es una barrera de seguridad
 * (la autorización la decide la base de datos: acceso 'carmo' + perfil CARMO).
 */
export const CARMO_AUTH_STORAGE_KEY = 'carmo-auth';

export const supabase: SupabaseClient | null = supabaseEnvStatus.isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storageKey: CARMO_AUTH_STORAGE_KEY,
        // Los enlaces de invitación/recuperación se procesan de forma explícita en authLinks.ts.
        detectSessionInUrl: false,
      },
    })
  : null;
