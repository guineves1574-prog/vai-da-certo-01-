import crypto from "crypto";
import { env } from "../config/env";

const key = crypto.createHash("sha256").update(env.ENCRYPTION_SECRET).digest();

export class EncryptionService {
  encrypt(value: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, encryptedHex] = payload.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  }
}
