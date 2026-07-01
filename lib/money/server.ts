import "server-only";

export function moneyEnabled() {
  return process.env.ADMIRA_MONEY_ENABLED === "true";
}
