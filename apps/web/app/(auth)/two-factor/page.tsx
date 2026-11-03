import { redirect } from "next/navigation";
import { requireTwoFactor } from "@maverick/core";
import { LogoutButton } from "@/components/AuthForms";
import { Orb } from "@/components/Orb";
import { TwoFactorSetup } from "@/components/TwoFactor";
import { getCurrentUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.totpEnabled) redirect("/security");
  const required = requireTwoFactor();
  const { welcome } = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 480 }}>
        <Orb size={56} />
        <h1>Two-step login</h1>
        {welcome && <div className="alert alert-ok">Account created.</div>}
        <TwoFactorSetup required={required} />
        {!required && (
          <p className="small" style={{ marginTop: "1rem", textAlign: "center" }}>
            <a href={welcome ? "/settings?welcome=1" : "/"}>Skip for now</a>
          </p>
        )}
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
