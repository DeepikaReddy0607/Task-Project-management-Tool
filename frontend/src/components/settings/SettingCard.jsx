import Card from "../ui/Card";

function SettingCard({ icon: Icon, title, description, children, action = null, className = "" }) {
  return (
    <Card className={`p-5 sm:p-6 mb-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-sage)] text-[var(--color-brand)]">
              <Icon size={20} />
            </span>
          )}
          <div>
            <h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="divide-y divide-[var(--color-border)]">{children}</div>
    </Card>
  );
}

export default SettingCard;
