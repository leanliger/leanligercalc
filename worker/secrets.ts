/**
 * Read a secret's value, tolerating how dashboards hand them out.
 *
 * Whop's "copy" button for an app's environment variables copies the whole
 * .env block — `WHOP_API_KEY=…` plus `NEXT_PUBLIC_WHOP_APP_ID=…` on separate
 * lines — and that's easy to paste in as the secret. So if the stored value
 * contains a `NAME=value` line for this secret, that value is used; otherwise
 * the whole value, trimmed, with any surrounding quotes removed.
 */
export function secretValue(raw: string | undefined, name: string): string {
  if (!raw) return "";
  const text = raw.trim();
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^export\s+/, ""))
    .find((l) => l.startsWith(`${name}=`));
  const value = line ? line.slice(name.length + 1) : text;
  return value.trim().replace(/^(["'])(.*)\1$/, "$2");
}
