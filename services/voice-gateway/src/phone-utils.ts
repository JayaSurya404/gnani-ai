/**
 * VoiceNexus AI — Phone Normalization & Variant Matching Utilities
 * Ensures consistent Do-Not-Call (DNC) matching across varying user input formats.
 */

export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+91" + digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return "+91" + digits.slice(1);
  }
  if (digits.length === 10) {
    return "+91" + digits;
  }
  return raw.trim();
}

export function getPhoneVariants(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([trimmed]);

  if (digits) {
    variants.add(digits);
    if (digits.length === 10) {
      variants.add("+91" + digits);
      variants.add("+91 " + digits.slice(0, 5) + " " + digits.slice(5));
      variants.add("0" + digits);
    } else if (digits.length === 12 && digits.startsWith("91")) {
      const ten = digits.slice(2);
      variants.add(ten);
      variants.add("+91" + ten);
      variants.add("+91 " + ten.slice(0, 5) + " " + ten.slice(5));
      variants.add("0" + ten);
    } else if (digits.length === 11 && digits.startsWith("0")) {
      const ten = digits.slice(1);
      variants.add(ten);
      variants.add("+91" + ten);
      variants.add("+91 " + ten.slice(0, 5) + " " + ten.slice(5));
      variants.add("0" + ten);
    }
  }
  return Array.from(variants);
}

