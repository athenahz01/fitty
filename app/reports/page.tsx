import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Reports",
  description: "Package your school reads and plan into a report you can share.",
};

export default function ReportsPage() {
  return <AdmiraApp view="reports" />;
}
