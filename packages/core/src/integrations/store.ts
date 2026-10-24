import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
}

export interface Integration {
  id: string;
  provider: "google";
  scopes: string[];
  accountEmail: string | null;
  status: "active" | "needs_reauth";
  lastError: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  provider: "google";
  scopes: string;
  account_email_enc: string | null;
  tokens_enc: string;
  status: "active" | "needs_reauth";
  last_error: string | null;
  created_at: Date | string;
};

/** Connected accounts. OAuth tokens are encrypted at rest and never leave the server. */
export class IntegrationStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private toIntegration(r: Row): Integration {
    return {
      id: r.id,
      provider: r.provider,
      scopes: r.scopes.split(" ").filter(Boolean),
      accountEmail: r.account_email_enc ? this.cipher.decrypt(r.account_email_enc) : null,
      status: r.status,
      lastError: r.last_error,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async get(userId: string, provider: "google"): Promise<Integration | null> {
    const { rows } = await this.db.query<Row>("SELECT * FROM integrations WHERE user_id = $1 AND provider = $2", [userId, provider]);
    return rows[0] ? this.toIntegration(rows[0]) : null;
  }

  async list(userId: string): Promise<Integration[]> {
    const { rows } = await this.db.query<Row>("SELECT * FROM integrations WHERE user_id = $1", [userId]);
    return rows.map((r) => this.toIntegration(r));
  }

  async tokens(userId: string, provider: "google"): Promise<OAuthTokens | null> {
    const { rows } = await this.db.query<Row>("SELECT tokens_enc FROM integrations WHERE user_id = $1 AND provider = $2", [userId, provider]);
    return rows[0] ? (JSON.parse(this.cipher.decrypt(rows[0].tokens_enc)) as OAuthTokens) : null;
  }

  async save(userId: string, provider: "google", data: { tokens: OAuthTokens; scopes: string[]; accountEmail: string | null }): Promise<void> {
    await this.db.query(
      `INSERT INTO integrations (id, user_id, provider, scopes, account_email_enc, tokens_enc)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, provider) DO UPDATE SET scopes = EXCLUDED.scopes, account_email_enc = EXCLUDED.account_email_enc,
         tokens_enc = EXCLUDED.tokens_enc, status = 'active', last_error = NULL, updated_at = now()`,
      [
        randomUUID(),
        userId,
        provider,
        data.scopes.join(" "),
        data.accountEmail ? this.cipher.encrypt(data.accountEmail) : null,
        this.cipher.encrypt(JSON.stringify(data.tokens)),
      ],
    );
    await audit(this.db, { userId, actor: "user", action: "integration.connected", target: provider, details: { scopes: data.scopes } });
  }

  async updateTokens(userId: string, provider: "google", tokens: OAuthTokens): Promise<void> {
    await this.db.query("UPDATE integrations SET tokens_enc = $1, status = 'active', last_error = NULL, updated_at = now() WHERE user_id = $2 AND provider = $3", [
      this.cipher.encrypt(JSON.stringify(tokens)),
      userId,
      provider,
    ]);
  }

  async markNeedsReauth(userId: string, provider: "google", error: string): Promise<void> {
    await this.db.query("UPDATE integrations SET status = 'needs_reauth', last_error = $1, updated_at = now() WHERE user_id = $2 AND provider = $3", [
      error.slice(0, 300),
      userId,
      provider,
    ]);
    await audit(this.db, { userId, actor: "system", action: "integration.needs_reauth", target: provider });
  }

  async remove(userId: string, provider: "google"): Promise<void> {
    await this.db.query("DELETE FROM integrations WHERE user_id = $1 AND provider = $2", [userId, provider]);
    await audit(this.db, { userId, actor: "user", action: "integration.disconnected", target: provider });
  }
}
