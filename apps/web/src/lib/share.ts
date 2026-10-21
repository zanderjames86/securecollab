/** WhatsApp and clipboard helpers. Messages carry links only, never content. */

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function inviteMessage(teamName: string, link: string, label?: string): string {
  const who = label ? `${label}, you're` : "You're";
  return (
    `${who} invited to join *${teamName}* on SecureCollab (end-to-end encrypted).\n\n` +
    `Open this link to join. It works once and expires in 7 days:\n${link}`
  );
}

export function documentMessage(title: string, link: string): string {
  return `📄 *${title}* is ready on SecureCollab:\n${link}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A stable, readable colour for a person, derived from their id. */
export function personColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 42%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
