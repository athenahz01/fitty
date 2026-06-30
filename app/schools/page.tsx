import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Find schools",
  description: "Search any school to see your chances and how you fit.",
};

export default function SchoolsPage() {
  return <AdmiraApp view="schools" />;
}
