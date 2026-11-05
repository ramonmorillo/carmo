import { PROJECT_IDENTITY, getEthicsApprovalText } from '../../constants/institutional';

// Los textos legales (aviso legal, privacidad, cookies) se añadirán cuando estén aprobados para CARMO.
export function PublicFooter() {
  const ethics = getEthicsApprovalText();
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <strong>{PROJECT_IDENTITY.name}</strong>
          <p>{PROJECT_IDENTITY.subtitle}.</p>
          {ethics ? <p className="public-footer-code">Dictamen favorable · {ethics}</p> : null}
        </div>
      </div>
    </footer>
  );
}
