// Small text helpers for dates and sizes.

// "3 min ago", "2 days ago". Falls back to the date for old items.
export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.round(hours / 24);
  if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
  return new Date(iso).toLocaleDateString();
}

export function formatMemory(mb: number): string {
  return mb >= 1024 ? mb / 1024 + " GB" : mb + " MB";
}
