import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Build your profile",
  description: "Set up your profile once. Every school read, list, and plan uses it.",
};

export default function StartPage() {
  return <AdmiraApp view="start" />;
}
