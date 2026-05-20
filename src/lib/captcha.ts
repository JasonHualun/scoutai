import { createHmac, randomInt, timingSafeEqual } from "crypto";

export const CAPTCHA_COOKIE = "scoutai_captcha";
export const CAPTCHA_MAX_AGE_SECONDS = 10 * 60;

function captchaSecret() {
  return (
    process.env.CAPTCHA_SECRET ||
    process.env.ADMIN_ACCESS_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "scoutai-local-captcha"
  );
}

function normalize(value: string) {
  return value.trim().replace(/\s/g, "").toUpperCase();
}

function sign(payload: string) {
  return createHmac("sha256", captchaSecret()).update(payload).digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCaptchaCode() {
  return String(randomInt(1000, 10000));
}

export function createCaptchaToken(code: string, issuedAt = Date.now()) {
  const payload = `${normalize(code)}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyCaptchaToken(token: string | undefined, input: string | undefined) {
  if (!token || !input) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [code, issuedAtRaw, signature] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;

  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > CAPTCHA_MAX_AGE_SECONDS * 1000) return false;

  const payload = `${code}.${issuedAtRaw}`;
  if (!safeCompare(signature, sign(payload))) return false;

  return normalize(input) === code;
}
