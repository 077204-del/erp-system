import { PaymentsView } from "./WorkspaceViews";

/** Cashier payments — shows current client debt before amount entry. */
export default function CashierPaymentsView(props) {
  return <PaymentsView {...props} showClientDebtBalance />;
}
