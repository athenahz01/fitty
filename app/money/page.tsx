import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Money | Admira",
  description: "A deferred Admira money module stub with no predicted figures.",
};

export default function MoneyPage() {
  return <AdmiraApp view="money" />;
}
