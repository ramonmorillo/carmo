// Identidad institucional de CARMO. Fuentes: dictamen del CEIm-G (firmado 15/09/2025) y protocolo
// v3.0 (12/09/2025), aportados por el IP. Los documentos originales NO se publican en este repositorio
// (público; el protocolo es confidencial). Discrepancias en docs/CARMO_REGULATORY_GAPS.md:
//   · el dictamen aprueba el protocolo v2.0 y la HIP/CI v1.0, no la v3.0 (RG-01);
//   · el dictamen solo cita 2 centros (RG-31); el protocolo prevé REDCap como eCRD (RG-02);
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
  ethicsCommittee: 'CEIm de Galicia (CEIm-G)',
  ethicsApprovalCode: '2025/330',
  ethicsApprovalDate: '2025-07-24',
  ethicsDecision: 'Informe favorable',
  protocolVersion: 'Protocolo versión 3.0, 12/09/2025',
  approvedDocumentVersionNote:
    'El dictamen (reunión 24/07/2025, firmado 15/09/2025) aprueba el protocolo v2.0 de 18/08/2025 y la HIP/CI v1.0 de 17/06/2025, con los centros C.H.U. de A Coruña y C.H.U. de Santiago. La v3.0 y los demás centros requieren constancia de su aprobación.',
  informedConsentVersion: 'HIP/CI v1.0 de 17/06/2025 (aprobada); v3.0 de 12/09/2025 (protocolo vigente)',
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
