// Decisión de acceso a CARMO a partir de la lectura del propio perfil CARMO (lógica pura, probada en
// tests/accessDecision.test.ts).
//
// El proyecto Supabase lo comparten CARMO, CARMO y DERMAPEX con un único Auth: una cuenta puede iniciar
// sesión aquí aunque no esté autorizada en CARMO. En ese caso la RLS no le devuelve su perfil CARMO.

export type ProfileLookup =
  | { error: true }
  | { error: false; profile: null }
  | { error: false; profile: { must_change_password: boolean | null; is_active: boolean | null } };

export type AccessDecision = 'error' | 'no_access' | 'inactive' | 'must_change_password' | 'ok';

export function decideAccess(lookup: ProfileLookup): AccessDecision {
  if (lookup.error) return 'error';
  if (!lookup.profile) return 'no_access';
  if (lookup.profile.is_active === false) return 'inactive';
  // Ante cualquier duda (valor nulo), se exige cambiar la contraseña temporal.
  if (lookup.profile.must_change_password !== false) return 'must_change_password';
  return 'ok';
}
