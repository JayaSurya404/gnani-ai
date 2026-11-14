import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function cleanLeadName(name?: string | null): string {
  if (!name) return "Customer";
  return name.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim() || "Customer";
}

export function cleanLeadNotes(notes?: string | null): string {
  if (!notes) return "";
  return notes
    .replace(/\[TEST_CONTACT\]\s*/gi, "")
    .replace(/TEST_CONTACT\s*/gi, "")
    .replace(/SAMPLE_LEAD\s*/gi, "")
    .trim();
}

export function formatLeadSource(source?: string | null): string {
  if (!source) return "Website";
  if (source === "SAMPLE_LEAD") return "Direct Consultation";
  return source
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

