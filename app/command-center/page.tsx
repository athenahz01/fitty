import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Plan your applications",
  description: "Turn your school list into requirements, tasks, and deadlines.",
};

export default function CommandCenterPage() {
  return <AdmiraApp view="command-center" />;
}
