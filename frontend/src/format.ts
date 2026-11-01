// Small helpers that turn API values into text people can read.

import type { Platform, Role } from "./types";

export function formatMemory(memoryMb: number): string {
  if (memoryMb === 0 || memoryMb >= 1024) {
    return Math.round((memoryMb / 1024) * 10) / 10 + " GB";
  }
  return memoryMb + " MB";
}

export function formatPlatform(platform: Platform): string {
  return platform === "PROXMOX" ? "Proxmox" : "AWS";
}

export function formatRole(role: Role): string {
  if (role === "ADMIN") {
    return "Admin";
  }
  return role === "APPROVER" ? "Approver" : "Requester";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// "Priya (Developer)" -> "PD"
export function initials(name: string): string {
  const words = name.replace(/[()]/g, "").split(" ").filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// True when the date is less than three days away.
export function expiresSoon(iso: string): boolean {
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() - Date.now() < threeDays;
}
