import { query } from "../db/postgres";
import { EncryptionService } from "./encryption.service";

interface ApiCredentialRow {
  provider: string;
  encrypted_key: string;
  encrypted_secret: string | null;
  encrypted_passphrase: string | null;
}

export class CredentialsService {
  constructor(private readonly encryptionService: EncryptionService) {}

  async upsertCredential(
    userId: string,
    input: { provider: string; apiKey: string; apiSecret?: string; passphrase?: string }
  ) {
    await query(
      `INSERT INTO api_credentials (user_id, provider, encrypted_key, encrypted_secret, encrypted_passphrase)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET
         encrypted_key = EXCLUDED.encrypted_key,
         encrypted_secret = EXCLUDED.encrypted_secret,
         encrypted_passphrase = EXCLUDED.encrypted_passphrase,
         updated_at = NOW()`,
      [
        userId,
        input.provider,
        this.encryptionService.encrypt(input.apiKey),
        input.apiSecret ? this.encryptionService.encrypt(input.apiSecret) : null,
        input.passphrase ? this.encryptionService.encrypt(input.passphrase) : null
      ]
    );

    return { success: true };
  }

  async getCredential(userId: string, provider: string) {
    const [credential] = await query<ApiCredentialRow>(
      "SELECT provider, encrypted_key, encrypted_secret, encrypted_passphrase FROM api_credentials WHERE user_id = $1 AND provider = $2",
      [userId, provider]
    );

    if (!credential) {
      return null;
    }

    return {
      provider: credential.provider,
      apiKey: this.encryptionService.decrypt(credential.encrypted_key),
      apiSecret: credential.encrypted_secret
        ? this.encryptionService.decrypt(credential.encrypted_secret)
        : undefined,
      passphrase: credential.encrypted_passphrase
        ? this.encryptionService.decrypt(credential.encrypted_passphrase)
        : undefined
    };
  }
}
