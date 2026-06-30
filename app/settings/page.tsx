import type { Metadata } from "next";

import { AdmiraApp } from "../admira-app";

export const metadata: Metadata = {
  title: "Account",
  description: "Sign in, share optional outcomes, and manage your data. Only you can see it.",
};

export default function SettingsPage() {
  return <AdmiraApp view="settings" />;
}
