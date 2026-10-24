import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <h1>Not found</h1>
        <p className="muted">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
        <Link href="/" className="btn">Back to Command Center</Link>
      </div>
    </div>
  );
}
