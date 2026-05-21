import { DailyRegisterContent } from "./DailyRegisterView";

/** Cashier daily register — no calendar input; RegisterToolbar never mounts. */
export default function CashierDailyRegisterView(props) {
  return <DailyRegisterContent toolbarMode="cashier" {...props} />;
}
