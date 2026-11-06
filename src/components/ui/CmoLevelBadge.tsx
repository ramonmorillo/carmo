// Distintivo de prioridad CMO (misma composición que DERMAPEX): tres barras, tantas activas como
// complejidad (P1 = 3, P3 = 1). Escala de intensidad, nunca semafórica: P3 no es «mejor».
// Puntos de corte del modelo CMO cardiovascular validado (docs/CARMO_CMO_MODEL.md).
export const PRIORITY_META: Record<1 | 2 | 3, { label: string; short: string; complexity: string; criterion: string }> = {
  1: { label: 'Prioridad 1 (mayor complejidad)', short: 'P1', complexity: 'Mayor complejidad', criterion: '≥ 23 puntos o embarazo' },
  2: { label: 'Prioridad 2 (complejidad intermedia)', short: 'P2', complexity: 'Complejidad intermedia', criterion: '17-22 puntos' },
  3: { label: 'Prioridad 3 (menor complejidad)', short: 'P3', complexity: 'Menor complejidad', criterion: '< 17 puntos' },
};

export function toPriority(value: unknown): 1 | 2 | 3 | null {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && (n === 1 || n === 2 || n === 3) ? n : null;
}

export function CmoLevelBadge({ level, score, variant = 'full', pending = false }: { level: unknown; score?: number | null; variant?: 'full' | 'short'; pending?: boolean }) {
  const value = toPriority(level);
  if (!value) return <span className="text-muted">—</span>;
  const meta = PRIORITY_META[value];
  return (
    <span className={`cmo-badge cmo-badge-${value}`} title={`${meta.label} · ${meta.criterion}${pending ? ' · pendiente de validación' : ''}`}>
      <span className="cmo-badge-bars" aria-hidden="true">
        {[1, 2, 3].map((bar) => <span key={bar} className={bar <= 4 - value ? 'is-on' : undefined} />)}
      </span>
      <span>{variant === 'short' ? meta.short : meta.label}{pending ? ' *' : ''}</span>
      {typeof score === 'number' ? <span className="cmo-badge-score">{score} pts</span> : null}
    </span>
  );
}
