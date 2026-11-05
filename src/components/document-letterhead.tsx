import Image from "next/image";
import {
  companyDisplayName,
  useCompanyProfile,
} from "@/components/company-profile";

const defaultLegalName = "CABINET TRANSPARENCY SARL";
const defaultRccm = "CD/KNG/RCCM/21-B-00920";
const defaultNationalId = "01-M6901-N77891M";
const defaultNif = "01-M6901-N77891M";
const defaultAddress =
  "Av. Boulevard du 30 juin, Immeuble MAYUMBE, niveau 3, appartement 18";
const defaultCommune = "Gombe";
const defaultPhone = "+243 98 00 69 950";
const defaultEmail = "contact@ctrs.cd";

function isDefaultBrand(name: string, hasProfile: boolean) {
  return (
    !hasProfile ||
    /transparency/i.test(name) ||
    /^factura rdc$/i.test(name)
  );
}

export function DocumentLetterhead() {
  const { profile } = useCompanyProfile();
  const companyName = companyDisplayName(profile);
  const usesDefaultBrand = isDefaultBrand(companyName, Boolean(profile));

  return (
    <header className="document-letterhead">
      {usesDefaultBrand ? (
        <Image
          src="/branding/ctrs-logo.jpg"
          alt="Cabinet Transparency"
          width={373}
          height={94}
          priority
          className="document-letterhead-logo"
        />
      ) : (
        <div className="document-letterhead-logo flex items-center text-2xl font-bold text-slate-900">
          {companyName}
        </div>
      )}
    </header>
  );
}

export function DocumentFooter() {
  const { profile } = useCompanyProfile();
  const companyName = companyDisplayName(profile);
  const usesDefaultBrand = isDefaultBrand(companyName, Boolean(profile));
  const legalName =
    usesDefaultBrand
      ? defaultLegalName
      : profile?.legalName?.trim() || companyName;
  const identifiers = [
    (usesDefaultBrand ? defaultRccm : profile?.rccm) &&
      `RCCM ${usesDefaultBrand ? defaultRccm : profile?.rccm}`,
    (profile?.nin?.trim() || (usesDefaultBrand ? defaultNationalId : "")) &&
      `ID NAT ${profile?.nin?.trim() || defaultNationalId}`,
    (usesDefaultBrand ? defaultNif : profile?.nif) &&
      `NIF ${usesDefaultBrand ? defaultNif : profile?.nif}`,
  ].filter(Boolean);
  const address = [
    usesDefaultBrand ? defaultAddress : profile?.address?.trim(),
    usesDefaultBrand ? defaultCommune : profile?.commune?.trim(),
    usesDefaultBrand ? "Kinshasa" : profile?.city?.trim(),
    usesDefaultBrand
      ? "République Démocratique du Congo"
      : profile?.province?.trim(),
  ].filter(Boolean);
  const contacts = [
    usesDefaultBrand ? defaultPhone : profile?.phone?.trim(),
    usesDefaultBrand ? defaultEmail : profile?.email?.trim(),
    usesDefaultBrand && "www.ctrs.cd",
  ].filter(Boolean);

  return (
    <footer className="document-footer">
      <div className="document-footer-content">
        <div className="document-footer-identity">
          <p className="document-footer-legal">{legalName}</p>
          {identifiers.length > 0 && (
            <p className="document-footer-identifiers">
              {identifiers.join(" · ")}
            </p>
          )}
        </div>
        <div className="document-footer-contact">
          {address.length > 0 && <p>{address.join(" · ")}</p>}
          {contacts.length > 0 && <p>{contacts.join(" · ")}</p>}
        </div>
      </div>
    </footer>
  );
}

export function DocumentSignature() {
  const { profile } = useCompanyProfile();
  const companyName = companyDisplayName(profile);
  const usesDefaultBrand = isDefaultBrand(companyName, Boolean(profile));
  const signatureName =
    profile?.signatureName?.trim() ||
    (usesDefaultBrand ? "SAMY LIGBAKELO" : "");
  const signatureTitle =
    profile?.signatureTitle?.trim() ||
    (usesDefaultBrand ? "Associé Gérant" : "");
  const signatureDataUrl = profile?.signatureDataUrl;

  return (
    <section className="document-signature" aria-label="Signature du cabinet">
      <p className="document-signature-label">Pour le cabinet</p>
      {signatureDataUrl ? (
        <Image
          src={signatureDataUrl}
          alt={`Signature de ${signatureName || "la personne autorisée"}`}
          width={220}
          height={90}
          unoptimized
          className="document-signature-image"
        />
      ) : (
        <div className="document-signature-space" />
      )}
      <p className="document-signature-name">
        {signatureName || "Nom du représentant autorisé"}
      </p>
      <p className="document-signature-title">
        {signatureTitle || "Signature du cabinet"}
      </p>
    </section>
  );
}
