import Card from "../ui/Card";

function StatCard({ accentClass, detail, icon: Icon, title, value }) {
  return (
    <Card hoverable className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">
            {value}
          </p>
          <p className="mt-2 text-xs font-medium text-[var(--color-text-subtle)]">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${accentClass}`} aria-hidden="true">
          <Icon size={19} />
        </span>
      </div>
    </Card>
  );
}

export default StatCard;
