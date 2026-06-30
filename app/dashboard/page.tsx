import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your top school read, list balance, and next steps in one place.",
};

export default function DashboardPage() {
  return <AdmiraApp view="dashboard" />;
}
