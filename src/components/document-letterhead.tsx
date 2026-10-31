import Image from "next/image";
import {
  companyDisplayName,
  companyLocation,
  useCompanyProfile,
} from "@/components/company-profile";

export function DocumentLetterhead() {
  const { profile } = useCompanyProfile();
  const companyName = companyDisplayName(profile);
  const sector = profile?.sector?.trim() || "Cabinet comptable";
  const location = companyLocation(profile);
  const isDefaultBrand = /transparency/i.test(companyName);

  return (
    <header className="document-letterhead">
      {isDefaultBrand ? (
        <Image
          src="/branding/ctrs-logo.jpg"
          alt={`${companyName} — ${sector}`}
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
      <div className="document-letterhead-meta">
        <p className="document-letterhead-name">{sector}</p>
        <p>{location}</p>
      </div>
    </header>
  );
}

export function DocumentFooter() {
  const { profile } = useCompanyProfile();
  const legalName = profile?.legalName || companyDisplayName(profile);
  const identifiers = [
    profile?.rccm && `RCCM ${profile.rccm}`,
    profile?.nif && `NIF ${profile.nif}`,
    profile?.nin && `ID NAT ${profile.nin}`,
  ].filter(Boolean);
  const address = [
    profile?.address,
    profile?.commune,
    profile?.city,
    profile?.province,
  ].filter(Boolean);
  const contacts = [profile?.phone, profile?.email].filter(Boolean);

  return (
    <footer className="document-footer">
      <p className="document-footer-legal">
        {legalName}
        {identifiers.length > 0 && (
          <>
            <span> · </span>
            {identifiers.join(" · ")}
          </>
        )}
      </p>
      {address.length > 0 && <p>{address.join(" · ")}</p>}
      {contacts.length > 0 && <p>{contacts.join(" · ")}</p>}
    </footer>
  );
}
