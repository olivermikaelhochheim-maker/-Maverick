import { redirect } from "next/navigation";
import { userCount } from "@maverick/core";
import { LoginForm } from "@/components/AuthForms";
import { Orb } from "@/components/Orb";
import { getCurrentUser, getMaverick } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { db } = await getMaverick();
  if ((await userCount(db)) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Orb size={72} />
        <h1>Maverick</h1>
        <p className="sub">Sign in to continue.</p>
        <LoginForm />
      </div>
    </div>
  );
}
