import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Reports | Admira",
  description: "Generate and export Admira reports from computed module outputs.",
};

export default function ReportsPage() {
  return <AdmiraApp view="reports" />;
}
