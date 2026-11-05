// Identidad institucional de CARMO. Fuente: datos del protocolo y del dictamen comunicados por el IP
// en el encargo de desarrollo (05/11/2026). Los documentos originales NO se publican en este
// repositorio (público). Ver docs/CARMO_REGULATORY_GAPS.md para las discrepancias pendientes:
//   · el dictamen menciona una versión documental distinta de la v3.0 del protocolo (RG-01);
//   · el protocolo prevé REDCap como eCRD (RG-02);
//   · cambio de coordinación no aprobado formalmente (RG-03).
// No completar con datos no verificados.

export const PROJECT_IDENTITY = {
  name: 'CARMO',
  subtitle: 'Modelo CMO en pacientes con riesgo cardiovascular',
} as const;

export const PROJECT_INSTITUTIONAL_REFERENCE: {
  projectTitle: string;
  protocolCode: string;
  sponsor: string;
  /** Referencia de coordinación científica de la herramienta (no sustituye la figura aprobada en el dictamen). */
  toolScientificCoordination: string;
  ethicsCommittee: string;
  ethicsApprovalCode: string;
  ethicsApprovalDate: string | null;
  ethicsDecision: string;
  protocolVersion: string;
  approvedDocumentVersionNote: string;
  informedConsentVersion: string | null;
} = {
  projectTitle:
    'CARMO: Evaluación de la experiencia del paciente con riesgo cardiovascular en el seguimiento con el Modelo de Atención Farmacéutica CMO',
  protocolCode: 'FEF-CARMO-2025',
  sponsor: 'Fundación Española de Farmacia Hospitalaria',
  toolScientificCoordination: 'Ramón Alejandro Morillo Verdugo',
  ethicsCommittee: 'CEIm de Galicia',
  ethicsApprovalCode: '2025/330',
  ethicsApprovalDate: null,
  ethicsDecision: 'Dictamen favorable',
  protocolVersion: 'Protocolo versión 3.0, 12/09/2025',
  approvedDocumentVersionNote:
    'El dictamen identifica una versión documental distinta de la v3.0: pendiente de conciliar con promotor y CEIm.',
  informedConsentVersion: null,
};

export const PENDING_LABEL = 'Pendiente de verificar';

/** Compatibilidad con componentes heredados: «CEIm de Galicia · nº 2025/330». */
export function getEthicsApprovalText(): string | null {
  const { ethicsCommittee, ethicsApprovalCode } = PROJECT_INSTITUTIONAL_REFERENCE;
  return `${ethicsCommittee} · nº ${ethicsApprovalCode}`;
}

export function getEthicsApprovalDateLabel(): string | null {
  const iso = PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalDate;
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const PROJECT_SHORT_FOOTER = [
  `${PROJECT_IDENTITY.name} · ${PROJECT_INSTITUTIONAL_REFERENCE.protocolCode} · Promotor: ${PROJECT_INSTITUTIONAL_REFERENCE.sponsor}`,
  `${PROJECT_INSTITUTIONAL_REFERENCE.ethicsDecision} · ${getEthicsApprovalText()}`,
  'Herramienta en fase de validación: no apta para datos reales',
].join(' · ');
