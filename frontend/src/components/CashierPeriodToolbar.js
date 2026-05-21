import { useLocale } from "../context/LocaleContext";

/**
 * Cashier-only period controls: Today + This Week (Sat → today).
 * No date inputs, apply/reset, or custom range UI.
 */
export default function CashierPeriodToolbar({
  onToday,
  onWeek,
  activePreset = "week",
  loading = false,
}) {
  const { t } = useLocale();
  const todayActive = activePreset === "today";
  const weekActive = activePreset === "week";

  return (
    <div className="erp-cashier-period-btns" role="group" aria-label={t("dashboard.period")}>
      <button
        type="button"
        className={todayActive ? "erp-cashier-period-btns__btn--active" : ""}
        onClick={onToday}
        disabled={loading}
        aria-pressed={todayActive}
      >
        {t("dashboard.presetToday")}
      </button>
      <button
        type="button"
        className={weekActive ? "erp-cashier-period-btns__btn--active" : ""}
        onClick={onWeek}
        disabled={loading}
        aria-pressed={weekActive}
      >
        {t("dashboard.presetWeek")}
      </button>
    </div>
  );
}
