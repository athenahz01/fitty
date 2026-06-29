import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Dashboard | Admira",
  description: "Admira's shared-profile dashboard for schools, lists, and planning.",
};

export default function DashboardPage() {
  return <AdmiraApp view="dashboard" />;
}
