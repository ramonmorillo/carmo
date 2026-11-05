// Definición de interfaz y puntuación de los cuestionarios CARMO. Reglas idénticas a
// carmo_private.questionnaire_scores (migración 04). Sin enunciados literales de los instrumentos
// (repositorio público): se registran los códigos de respuesta del instrumento autorizado.
import { scoreIexpac } from './iexpac';

export type InstrumentCode = 'IEXPAC' | 'EQ5D3L' | 'EVASAF' | 'MORISKY_GREEN';
export type InstrumentUi = {
  code: InstrumentCode;
  title: string;
  description: string;
  items: Array<{ key: string; label: string }>;
  options: Array<{ value: number; label: string }>;
  vas: boolean;
  modes: Array<'self' | 'interviewer' | 'assisted'>;
};

const numbered = (n: number, prefix = 'Ítem') => Array.from({ length: n }, (_, i) => ({ key: String(i + 1), label: `${prefix} ${i + 1}` }));

export const INSTRUMENT_UI: Record<InstrumentCode, InstrumentUi> = {
  IEXPAC: {
    code: 'IEXPAC', title: 'IEXPAC', vas: false, modes: ['self', 'interviewer', 'assisted'],
    description: 'Variable principal. Puntuación global 0-10 = 10 × (Σ11 − 11) / 44, solo con los 11 ítems.',
    items: numbered(11),
    options: [{ value: 1, label: 'Nunca' }, { value: 2, label: 'Casi nunca' }, { value: 3, label: 'A veces' }, { value: 4, label: 'Casi siempre' }, { value: 5, label: 'Siempre' }],
  },
  EQ5D3L: {
    code: 'EQ5D3L', title: 'EQ-5D-3L', vas: true, modes: ['self', 'interviewer'],
    description: 'Perfil de 5 dimensiones (niveles 1-3) y EVA 0-100. Sin índice de utilidad. La modalidad fija la versión (v2.0 autoadministrada / v1.0 entrevista).',
    items: [
      { key: '1', label: 'Movilidad' }, { key: '2', label: 'Cuidado personal' }, { key: '3', label: 'Actividades cotidianas' },
      { key: '4', label: 'Dolor / malestar' }, { key: '5', label: 'Ansiedad / depresión' },
    ],
    options: [{ value: 1, label: 'Nivel 1 · sin problemas' }, { value: 2, label: 'Nivel 2 · algunos problemas / moderado' }, { value: 3, label: 'Nivel 3 · problemas graves / extremo' }],
  },
  EVASAF: {
    code: 'EVASAF', title: 'EVASAF', vas: false, modes: ['self', 'interviewer', 'assisted'],
    description: 'Satisfacción con la atención farmacéutica: 10 ítems de 1 (muy deficiente) a 5 (excelente). Resultado por ítem; sin total definido.',
    items: numbered(10),
    options: [{ value: 1, label: '1 · muy deficiente' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5 · excelente' }],
  },
  MORISKY_GREEN: {
    code: 'MORISKY_GREEN', title: 'Morisky-Green', vas: false, modes: ['self', 'interviewer', 'assisted'],
    description: 'Adherencia autorreferida (4 ítems sí/no). Adherente solo con No · Sí · No · No. Compruebe que el formulario sigue este orden.',
    items: [
      { key: '1', label: 'P1 · olvido de tomas' }, { key: '2', label: 'P2 · toma a las horas indicadas' },
      { key: '3', label: 'P3 · deja de tomarla si se encuentra bien' }, { key: '4', label: 'P4 · deja de tomarla si le sienta mal' },
    ],
    options: [{ value: 1, label: 'Sí' }, { value: 0, label: 'No' }],
  },
};

export type Scores =
  | { kind: 'iexpac'; valid: boolean; global: number | null; sum: number | null; itemsAnswered: number }
  | { kind: 'eq5d'; valid: boolean; profile: string | null; vas: number | null; itemsAnswered: number }
  | { kind: 'evasaf'; complete: boolean; itemsAnswered: number }
  | { kind: 'morisky'; valid: boolean; adherent: boolean | null; itemsAnswered: number };

export function scoreQuestionnaire(code: InstrumentCode, responses: Record<string, number>, vas: number | null): Scores {
  switch (code) {
    case 'IEXPAC': {
      const r = scoreIexpac(responses);
      return { kind: 'iexpac', valid: r.valid, global: r.global, sum: r.sum, itemsAnswered: r.itemsAnswered };
    }
    case 'EQ5D3L': {
      const keys = ['1', '2', '3', '4', '5'].filter((k) => typeof responses[k] === 'number');
      return { kind: 'eq5d', valid: keys.length === 5, profile: keys.length === 5 ? keys.map((k) => responses[k]).join('') : null, vas, itemsAnswered: keys.length };
    }
    case 'EVASAF': {
      const n = Object.keys(responses).length;
      return { kind: 'evasaf', complete: n === 10, itemsAnswered: n };
    }
    case 'MORISKY_GREEN': {
      const n = Object.keys(responses).length;
      if (n < 4) return { kind: 'morisky', valid: false, adherent: null, itemsAnswered: n };
      return { kind: 'morisky', valid: true, itemsAnswered: 4, adherent: responses['1'] === 0 && responses['2'] === 1 && responses['3'] === 0 && responses['4'] === 0 };
    }
  }
}

export function scoreSummary(s: Scores): string {
  switch (s.kind) {
    case 'iexpac': return s.valid ? `Global ${s.global} (suma ${s.sum})` : `Sin puntuación (${s.itemsAnswered}/11 ítems)`;
    case 'eq5d': return `${s.valid ? `Perfil ${s.profile}` : `Perfil incompleto (${s.itemsAnswered}/5)`} · EVA ${s.vas ?? '—'}`;
    case 'evasaf': return `${s.itemsAnswered}/10 ítems${s.complete ? '' : ' (incompleto)'}`;
    case 'morisky': return s.valid ? (s.adherent ? 'Adherente' : 'No adherente') : `Sin resultado (${s.itemsAnswered}/4)`;
  }
}

/** Etiqueta del resultado almacenado por la BD (columna scores). */
export function storedScoreLabel(code: string, scores: { global?: number | null; valid?: boolean; profile?: string | null; vas?: number | null; adherent?: boolean | null; complete?: boolean; items_answered?: number } | null): string {
  if (!scores) return '—';
  switch (code) {
    case 'IEXPAC': return scores.valid ? String(scores.global) : 'sin puntuación (incompleto)';
    case 'EQ5D3L': return `${scores.profile ?? 'perfil incompleto'} · EVA ${scores.vas ?? '—'}`;
    case 'EVASAF': return scores.complete ? '10/10 ítems' : `${scores.items_answered ?? 0}/10 ítems`;
    case 'MORISKY_GREEN': return scores.adherent === true ? 'adherente' : scores.adherent === false ? 'no adherente' : 'sin resultado';
    default: return '—';
  }
}
