import Link from "next/link";
import { requireUser } from "@/lib/server";
import { MoreLinks } from "@/components/MoreLinks";

export default async function More() {
  await requireUser();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">·· · Everything</span>
          <h1>More</h1>
          <p>Every screen in Maverick.</p>
        </div>
      </div>
      <MoreLinks />
      <p className="small faint" style={{ marginTop: "1rem" }}><Link href="/settings">Settings</Link> · voice, calendar, notifications, budget, password.</p>
    </div>
  );
}
