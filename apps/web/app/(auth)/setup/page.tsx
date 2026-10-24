import { redirect } from "next/navigation";
import { userCount } from "@maverick/core";
import { SetupForm } from "@/components/AuthForms";
import { Orb } from "@/components/Orb";
import { getMaverick } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { db } = await getMaverick();
  if ((await userCount(db)) > 0) redirect("/login");
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Orb size={72} />
        <h1>Welcome to Maverick</h1>
        <p className="sub">One-time setup. Create the only account on this installation.</p>
        <SetupForm />
      </div>
    </div>
  );
}
