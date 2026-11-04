import { LifeTabs } from "@/components/life/shared";

export default function LifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Life</h1>
          <p>Habits, journal and how the week is going. Maverick uses this in your briefings.</p>
        </div>
      </div>
      <LifeTabs />
      {children}
    </div>
  );
}
