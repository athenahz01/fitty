import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Profile Studio | Admira",
  description: "Set the shared profile that powers every Admira route.",
};

export default function StartPage() {
  return <AdmiraApp view="start" />;
}
