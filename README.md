# CARMO

Plataforma de investigación (eCRD) del estudio **CARMO** (FEF-CARMO-2025): *Evaluación de la experiencia del paciente con riesgo cardiovascular en el seguimiento con el Modelo de Atención Farmacéutica CMO*. Estudio observacional, prospectivo, multicéntrico, antes-después, con 12 meses de seguimiento. Promotor: Fundación Española de Farmacia Hospitalaria.

> **Estado: en validación. No apta para datos reales de pacientes.** Ver [`docs/CARMO_GO_LIVE_CHECKLIST.md`](docs/CARMO_GO_LIVE_CHECKLIST.md) y [`docs/CARMO_REGULATORY_GAPS.md`](docs/CARMO_REGULATORY_GAPS.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/CARMO_ARCHITECTURE.md`](docs/CARMO_ARCHITECTURE.md) | Auditoría de DERMAPEX/COAMO y de Supabase, matriz de reutilización, aislamiento, roles, integridad, protección de datos, estado por fases |
| [`docs/CARMO_DATA_DICTIONARY.md`](docs/CARMO_DATA_DICTIONARY.md) | Diccionario de datos versionado (provisional) |
| [`docs/CARMO_PROTOCOL_TRACEABILITY.md`](docs/CARMO_PROTOCOL_TRACEABILITY.md) | Trazabilidad de requisito → pantalla → tabla → validación → exportación → prueba |
| [`docs/CARMO_REGULATORY_GAPS.md`](docs/CARMO_REGULATORY_GAPS.md) | Discrepancias regulatorias y decisiones pendientes (RG-xx) |
| [`docs/CARMO_GO_LIVE_CHECKLIST.md`](docs/CARMO_GO_LIVE_CHECKLIST.md) | Verificaciones previas a producción, alta de usuarios y reversión |

## Arquitectura

React 18 + TypeScript + Vite (SPA en GitHub Pages) sobre el **proyecto Supabase compartido** con DERMAPEX y COAMO: tablas `public.carmo_*` y esquema `carmo_private`, aislados por RLS y por autorización de aplicación (`app_access = 'carmo'`). Las migraciones de `supabase/migrations/` se aplicaron en producción el 05/11/2026 con la aprobación del IP; los cambios futuros irán en migraciones nuevas. Nunca se aplican automáticamente.

## Desarrollo

```bash
npm ci
cp .env.example .env
npm run dev
```

```bash
npx tsc -b && npm test && npm run build
```

Pruebas de base de datos: requieren PostgreSQL local vacío y el repositorio `ramonmorillo/dermapex` como historial canónico. El script se niega a ejecutarse contra Supabase.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carmo_test CANONICAL_DIR=../dermapex scripts/test-db.sh
```

## Seguridad

- Solo la clave pública en el frontend; nunca la service-role.
- No versionar el protocolo, el dictamen ni los textos de los instrumentos: este repositorio es público.
- No introducir identificadores directos de pacientes en ningún campo.
