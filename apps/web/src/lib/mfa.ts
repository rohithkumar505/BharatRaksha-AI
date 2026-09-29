import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1 };

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function verifyMfaToken(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}

export async function generateMfaQrDataUrl(
  email: string,
  secret: string
): Promise<string> {
  const otpauth = authenticator.keyuri(email, "Bharat Raksha AI", secret);
  return QRCode.toDataURL(otpauth);
}
