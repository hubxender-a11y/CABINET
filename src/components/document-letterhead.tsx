import Image from "next/image";

export function DocumentLetterhead() {
  return (
    <header className="document-letterhead">
      <Image
        src="/branding/ctrs-logo.jpg"
        alt="Cabinet Transparency — Audit, Conseil, Recrutement"
        width={373}
        height={94}
        priority
        className="document-letterhead-logo"
      />
      <div className="document-letterhead-meta">
        <p className="document-letterhead-name">Audit · Conseil · Recrutement</p>
        <p>Kinshasa, République Démocratique du Congo</p>
      </div>
    </header>
  );
}

export function DocumentFooter() {
  return (
    <footer className="document-footer">
      <p className="document-footer-legal">
        CABINET TRANSPARENCY SARL <span>·</span> ID NAT 01-S9502-N659Z98
      </p>
      <p>
        Av. Boulevard du 30 juin, Immeuble MAYUMBE, niveau 3, appartement 18
        {" · "}KIN/GOMBE, Kinshasa, République Démocratique du Congo
      </p>
      <p>
        Tél. +243 98 00 69 950 <span>·</span> service@ctrs.cd
        <span> · </span>www.ctrs.cd
      </p>
    </footer>
  );
}
