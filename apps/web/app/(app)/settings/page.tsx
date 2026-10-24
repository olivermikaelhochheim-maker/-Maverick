import { getSettings } from "@maverick/core";
import { LogoutButton } from "@/components/AuthForms";
import { PasswordForm, SettingsForm } from "@/components/SettingsForm";
import { getMaverick, requireUser } from "@/lib/server";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const { welcome } = await searchParams;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Signed in as {user.email}</p>
        </div>
        <LogoutButton />
      </div>
      {welcome && (
        <div className="alert alert-ok">
          Account created. Set your time zone and check the &quot;About me&quot; notes below, then head to Conversation.
        </div>
      )}
      <SettingsForm initial={settings} />
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Password</h2>
        <PasswordForm />
      </section>
      <section className="card">
        <h2>Voice</h2>
        <p className="empty">Not available yet. Push-to-talk with a licensed British voice arrives in Phase 2, after you pick a voice from samples.</p>
      </section>
    </div>
  );
}
