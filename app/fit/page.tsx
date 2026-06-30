import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Fit Finder",
  description: "Find schools that fit what you're looking for, then check your chances.",
};

export default function FitPage() {
  return <AdmiraApp view="fit" />;
}
