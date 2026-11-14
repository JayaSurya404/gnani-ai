import { parsePhoneNumberFromString } from "libphonenumber-js";

function normalizePhoneNumber(raw, defaultCountry = "IN") {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Handle accidental duplicated +91 or double country code like "+91 916382868845" or "+91 +91"
  // If starts with +91 and then another 91 before a 10-digit number (total 12 digits after first 91):
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 12 && digitsOnly.startsWith("9191")) {
    cleaned = "+91" + digitsOnly.slice(4); // was 91 + 91 + 8 digits? wait, Indian mobile is 10 digits
  } else if (digitsOnly.length === 14 && digitsOnly.startsWith("9191")) {
    // 91 + 91 + 10 digits
    cleaned = "+91" + digitsOnly.slice(4);
  }

  // Try parsing with libphonenumber-js
  let parsed = parsePhoneNumberFromString(cleaned, defaultCountry);

  if (!parsed || !parsed.isValid()) {
    // If it started with 91 without +, try with +
    if (!cleaned.startsWith("+") && cleaned.startsWith("91") && digitsOnly.length === 12) {
      parsed = parsePhoneNumberFromString("+" + cleaned, defaultCountry);
    } else if (!cleaned.startsWith("+") && digitsOnly.length === 10) {
      parsed = parsePhoneNumberFromString("+91" + digitsOnly, defaultCountry);
    }
  }

  if (parsed && parsed.isValid()) {
    return {
      isValid: true,
      e164: parsed.number, // e.g. "+916382868845"
      national: parsed.formatNational(), // e.g. "063828 68845" or "63828 68845"
      international: parsed.formatInternational(), // e.g. "+91 63828 68845"
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

const testCases = [
  "+916382868845",
  "916382868845",
  "6382868845",
  "+91 (638) 286-8845",
  "+91 63828 68845",
  "+91 91 6382868845", // duplicate 91 with 10 digits
  "12345", // invalid
  "+1 (737) 232-4091", // US international
];

for (const tc of testCases) {
  console.log(`Input: "${tc}" ->`, normalizePhoneNumber(tc));
}
