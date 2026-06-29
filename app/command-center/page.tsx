import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Command Center | Admira",
  description: "Turn the school list into requirements, tasks, and deadlines.",
};

export default function CommandCenterPage() {
  return <AdmiraApp view="command-center" />;
}
