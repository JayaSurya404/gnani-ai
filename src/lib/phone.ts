/**
 * VoiceNexus AI — Phone Normalization & Validation Utilities
 * Powered by libphonenumber-js for strict E.164 compliance and multi-format matching.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface PhoneValidationResult {
  isValid: boolean;
  e164: string | null;
  formattedNational?: string;
  formattedInternational?: string;
  country?: string;
  countryCallingCode?: string;
  error?: string;
}

/**
 * Validates and normalizes any telephone number into standard E.164 format.
 * Resolves duplicate country codes (e.g. "+91 +91" or "9191"), missing '+', and messy separators.
 */
export function validateAndNormalizePhone(raw: string, defaultCountry: "IN" | "US" | "GB" = "IN"): PhoneValidationResult {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { isValid: false, e164: null, error: "Phone number is empty" };
  }

  let cleaned = raw.trim();

  // Deduplicate repeated country code prefix if user entered "+91 91..." or "+91 +91..."
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 12 && digitsOnly.startsWith("9191")) {
    cleaned = "+91" + digitsOnly.slice(4);
  } else if (digitsOnly.length === 14 && digitsOnly.startsWith("9191")) {
    cleaned = "+91" + digitsOnly.slice(4);
  }

  // First try parsing directly
  let parsed = parsePhoneNumberFromString(cleaned, defaultCountry);

  // If not valid, try explicit prefix handling for Indian 10-digit or 12-digit without '+'
  if (!parsed || !parsed.isValid()) {
    if (!cleaned.startsWith("+") && cleaned.startsWith("91") && digitsOnly.length === 12) {
      parsed = parsePhoneNumberFromString("+" + cleaned, defaultCountry);
    } else if (!cleaned.startsWith("+") && digitsOnly.length === 10) {
      parsed = parsePhoneNumberFromString("+91" + digitsOnly, defaultCountry);
    }
  }

  if (parsed && parsed.isValid()) {
    return {
      isValid: true,
      e164: parsed.number, // Always valid E.164: e.g. "+916382868845"
      formattedNational: parsed.formatNational(),
      formattedInternational: parsed.formatInternational(),
      country: parsed.country,
      countryCallingCode: parsed.countryCallingCode,
    };
  }

  return {
    isValid: false,
    e164: null,
    error: "Invalid or incomplete phone number",
  };
}

/**
 * Normalizes phone number to strict E.164 format or returns cleaned digits with +91 default.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const result = validateAndNormalizePhone(raw);
  if (result.isValid && result.e164) {
    return result.e164;
  }
  // Safe fallback if libphonenumber fails: strip non-digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+91" + digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  return raw.trim();
}

/**
 * Generates all search variants for a phone number for comprehensive DNC and active-call lookup.
 */
export function getPhoneVariants(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([trimmed]);

  const validated = validateAndNormalizePhone(raw);
  if (validated.isValid && validated.e164) {
    variants.add(validated.e164);
  }

  if (digits) {
    variants.add(digits);
    if (digits.length === 10) {
      variants.add("+91" + digits);
      variants.add("+91 " + digits.slice(0, 5) + " " + digits.slice(5));
      variants.add("0" + digits);
      variants.add("91" + digits);
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

