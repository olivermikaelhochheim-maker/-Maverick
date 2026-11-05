import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { sha256 } from "../util/crypto";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";
import { parseBankCsv, parseAmount, type ParsedRow } from "./csv";

export { parseBankCsv, parseAmount, parseDate } from "./csv";

/**
 * Personal finance from data Oliver provides (manual entries and bank CSV
 * exports). There is no bank connection, nothing is ever paid or moved, and
 * every figure shown is computed from rows in this table.
 */

export const FINANCE_CATEGORIES = [
  "income",
  "housing",
  "groceries",
  "dining",
  "transport",
  "subscriptions",
  "shopping",
  "health",
  "travel",
  "education",
  "transfers",
  "savings",
  "other",
] as const;
export type Category = (typeof FINANCE_CATEGORIES)[number];

export const FINANCE_CATEGORY_LABELS: Record<Category, string> = {
  income: "Income",
  housing: "Housing & utilities",
  groceries: "Groceries",
  dining: "Eating out",
  transport: "Transport & fuel",
  subscriptions: "Subscriptions",
  shopping: "Shopping",
  health: "Health & fitness",
  travel: "Travel",
  education: "Education",
  transfers: "Transfers",
  savings: "Savings & investing",
  other: "Other",
};

const KEYWORDS: [Category, string[]][] = [
  ["groceries", ["rema", "kiwi", "coop", "meny", "extra", "bunnpris", "joker", " spar ", " obs ", "prix", "oda.com", "matkroken", "lidl", "biedronka"]],
  ["dining", ["restaurant", "cafe", "café", "kafe", "mcdonald", "burger king", "max burger", "foodora", "wolt", "starbucks", "espresso house", "peppes", "dominos", "pizza", "sushi", "kebab", " bar ", " pub "]],
  ["transport", ["ruter", "kolumbus", " vy ", "flytoget", "uber", "bolt", "circle k", "esso", "shell", " yx ", "uno-x", "st1", "bompenger", "autopass", "parkering", "easypark", "onepark", "apcoa", "tesla"]],
  ["subscriptions", ["spotify", "netflix", "apple.com", "itunes", "google *", "google one", "hbo", "max.com", "viaplay", "disney", "youtube", "icloud", "openai", "chatgpt", "anthropic", "claude.ai", "adobe", "microsoft", "tv 2 play", "storytel", "audible"]],
  ["housing", ["husleie", " rent ", "strøm", "fjordkraft", "tibber", "elvia", "lyse", "telenor", "telia", " ice ", "altibox", "kommunale avgifter", "forsikring", "gjensidige", "if skade", "tryg", "fremtind"]],
  ["health", ["sats", " evo ", "fresh fitness", " 3t ", "apotek", "vitus", "boots", "legesenter", " lege ", "tannlege", "fysio", "gym"]],
  ["shopping", ["amazon", "zalando", "elkjøp", "elkjop", " power ", "komplett", "xxl", "clas ohlson", "h&m", "ikea", "jysk", " normal ", "europris", "nille", "boozt", "temu", "zara", "vinmonopolet"]],
  ["travel", ["norwegian air", " sas ", "widerøe", "wideroe", "hotel", "hotell", "airbnb", "booking.com", "flyr", "ryanair", "wizz", "lufthansa", "klm", "expedia", "avinor"]],
  ["education", [" bi ", "handelshøyskolen", "lånekassen", "lanekassen", "akademika", "kurs", "udemy", "coursera", "flight school", "flyskole", "pilot"]],
  ["savings", ["nordnet", "dnb aksjer", " kron ", "firi", "aksjesparekonto", " fond ", "bsu", "sparing"]],
  ["transfers", ["overføring", "overforing", "vipps", "transfer", "mobilepay", "egen konto"]],
];
const INCOME_KEYWORDS = ["lønn", "lonn", "salary", "payroll", "feriepenger", " nav ", "skatt tilbake", "refusjon", "honorar", "faktura"];

/** Normalised key used for rules and recurring detection: lowercase words, no digits or card refs. */
export function merchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/\*+\d+|\d{2,}[./-]\d{2,}([./-]\d{2,4})?|kurs:?\s*[\d.,]+|\b\d+\b|nok|kr\b/g, " ")
    .replace(/[^a-zæøåäöüß&.\s-]/g, " ")
    .replace(/\b(varekjøp|varekjop|visa|vare|betaling|kortkjøp|kortkjop|reservasjon|bankaxept|giro|efaktura|avtalegiro|til|fra)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

export function categorize(description: string, amountMinor: number, rules: { key: string; category: Category }[] = []): Category {
  const key = merchantKey(description);
  const rule = rules.find((r) => key && (key === r.key || key.startsWith(r.key + " ")));
  if (rule) return rule.category;
  const d = ` ${description.toLowerCase()} `;
  if (amountMinor > 0 && INCOME_KEYWORDS.some((k) => d.includes(k))) return "income";
  for (const [cat, words] of KEYWORDS) if (words.some((w) => d.includes(w))) return cat;
  return amountMinor > 0 ? "income" : "other";
}

export interface Transaction {
  id: string;
  date: string;
  amountMinor: number;
  currency: string;
  description: string;
  category: Category;
  source: "manual" | "csv";
}

type TxRow = { id: string; booked_on: Date | string; amount_minor: string | number; currency: string; description_enc: string; category: string; source: "manual" | "csv" };
const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));

export interface MonthSummary {
  month: string; // YYYY-MM
  incomeMinor: number;
  spendMinor: number; // positive number
  netMinor: number;
  byCategory: { category: Category; spendMinor: number; count: number }[];
  transactions: number;
}

export interface FinanceIntel {
  hasData: boolean;
  firstDate: string | null;
  lastDate: string | null;
  months: MonthSummary[]; // oldest → newest, up to 6
  current: MonthSummary | null;
  previous: MonthSummary | null;
  budgets: { category: Category; limitMinor: number; spentMinor: number; pace: number; projectedMinor: number }[];
  recurring: { key: string; label: string; category: Category; typicalMinor: number; months: number; lastDate: string }[];
  anomalies: { id: string; date: string; description: string; amountMinor: number; typicalMinor: number; reason: string }[];
  insights: { kind: "warning" | "win" | "tip"; text: string }[];
}

export function formatNok(minor: number, opts: { sign?: boolean } = {}): string {
  const v = Math.round(minor / 100);
  const s = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.abs(v)).replace(/ /g, " ");
  return `${v < 0 ? "−" : opts.sign && v > 0 ? "+" : ""}${s} kr`;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export class FinanceStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private toTx(r: TxRow): Transaction {
    return {
      id: r.id,
      date: day(r.booked_on),
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      description: this.cipher.decrypt(r.description_enc),
      category: (FINANCE_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as Category) : "other",
      source: r.source,
    };
  }

  async rules(userId: string): Promise<{ key: string; category: Category }[]> {
    const { rows } = await this.db.query<{ pattern_key: string; category: Category }>("SELECT pattern_key, category FROM finance_rules WHERE user_id = $1", [userId]);
    return rows.map((r) => ({ key: r.pattern_key, category: r.category }));
  }

  async list(userId: string, opts: { month?: string; limit?: number } = {}): Promise<Transaction[]> {
    const params: unknown[] = [userId, opts.limit ?? 500];
    let where = "user_id = $1";
    if (opts.month) {
      if (!/^\d{4}-\d{2}$/.test(opts.month)) throw new UserFacingError("Month must look like 2026-11.", "bad_input");
      params.push(`${opts.month}-01`);
      where += " AND booked_on >= $3::date AND booked_on < ($3::date + interval '1 month')";
    }
    const { rows } = await this.db.query<TxRow>(`SELECT * FROM finance_transactions WHERE ${where} ORDER BY booked_on DESC, created_at DESC LIMIT $2`, params);
    return rows.map((r) => this.toTx(r));
  }

  async count(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>("SELECT count(*) AS n FROM finance_transactions WHERE user_id = $1", [userId]);
    return Number(rows[0]?.n ?? 0);
  }

  async add(userId: string, input: { date: unknown; amount: unknown; description: unknown; category?: unknown }): Promise<Transaction> {
    const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
    if (!date) throw new UserFacingError("Date must look like 2026-11-05.", "bad_input");
    const amount = typeof input.amount === "number" ? Math.round(input.amount * 100) : typeof input.amount === "string" ? parseAmount(input.amount) : null;
    if (amount === null || amount === 0 || Math.abs(amount) > 1e11) throw new UserFacingError("Amount must be a number like -249,90 (negative = money out).", "bad_input");
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
    if (!description) throw new UserFacingError("Description is required.", "bad_input");
    const category = this.checkCategory(input.category) ?? categorize(description, amount, await this.rules(userId));
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO finance_transactions (id, user_id, booked_on, amount_minor, description_enc, category, source) VALUES ($1,$2,$3,$4,$5,$6,'manual')",
      [id, userId, date, amount, this.cipher.encrypt(description), category],
    );
    await audit(this.db, { userId, actor: "user", action: "finance.transaction_added", target: id });
    return (await this.list(userId, { limit: 1 })).find((t) => t.id === id) ?? { id, date, amountMinor: amount, currency: "NOK", description, category, source: "manual" };
  }

  /** Import bank CSV text. Re-importing the same export adds nothing (rows are fingerprinted). */
  async importCsv(userId: string, text: string): Promise<{ added: number; duplicates: number; skipped: { line: number; reason: string }[]; columns: Record<string, string>; from: string | null; to: string | null }> {
    const parsed = parseBankCsv(text);
    const rules = await this.rules(userId);
    let added = 0;
    let duplicates = 0;
    const seen = new Map<string, number>();
    await this.db.transaction(async (tx) => {
      for (const r of parsed.rows) {
        const base = `${r.date}|${r.amountMinor}|${r.description.toLowerCase()}`;
        const n = (seen.get(base) ?? 0) + 1; // identical rows in one file are distinct purchases
        seen.set(base, n);
        const hash = sha256(`${userId}|${base}|${n}`);
        const res = await tx.query(
          `INSERT INTO finance_transactions (id, user_id, booked_on, amount_minor, description_enc, category, source, import_hash)
           VALUES ($1,$2,$3,$4,$5,$6,'csv',$7) ON CONFLICT (user_id, import_hash) WHERE import_hash IS NOT NULL DO NOTHING RETURNING id`,
          [randomUUID(), userId, r.date, r.amountMinor, this.cipher.encrypt(r.description), categorize(r.description, r.amountMinor, rules), hash],
        );
        if (res.rows.length) added++;
        else duplicates++;
      }
    });
    const dates = parsed.rows.map((r: ParsedRow) => r.date).sort();
    await audit(this.db, { userId, actor: "user", action: "finance.csv_imported", details: { added, duplicates, skipped: parsed.skipped.length } });
    return { added, duplicates, skipped: parsed.skipped.slice(0, 20), columns: parsed.columns, from: dates[0] ?? null, to: dates.at(-1) ?? null };
  }

  private checkCategory(v: unknown): Category | null {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !(FINANCE_CATEGORIES as readonly string[]).includes(v)) throw new UserFacingError("Unknown category.", "bad_input");
    return v as Category;
  }

  /** Change a category; optionally learn it for every transaction from the same merchant. */
  async recategorize(userId: string, id: string, category: unknown, learn = true): Promise<{ updated: number }> {
    const cat = this.checkCategory(category);
    if (!cat) throw new UserFacingError("Category is required.", "bad_input");
    const { rows } = await this.db.query<TxRow>("SELECT * FROM finance_transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!rows[0]) throw new UserFacingError("Transaction not found.", "not_found", 404);
    const tx = this.toTx(rows[0]);
    let updated = 0;
    const key = merchantKey(tx.description);
    if (learn && key.length >= 3) {
      await this.db.query(
        `INSERT INTO finance_rules (user_id, pattern_enc, pattern_key, category) VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, pattern_key) DO UPDATE SET category = EXCLUDED.category`,
        [userId, this.cipher.encrypt(key), key, cat],
      );
      for (const t of await this.list(userId, { limit: 100_000 })) {
        if (merchantKey(t.description) === key && t.category !== cat) {
          await this.db.query("UPDATE finance_transactions SET category = $1 WHERE id = $2", [cat, t.id]);
          updated++;
        }
      }
    } else {
      await this.db.query("UPDATE finance_transactions SET category = $1 WHERE id = $2 AND user_id = $3", [cat, id, userId]);
      updated = 1;
    }
    return { updated };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM finance_transactions WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Transaction not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "finance.transaction_deleted", target: id });
  }

  async budgets(userId: string): Promise<{ category: Category; limitMinor: number }[]> {
    const { rows } = await this.db.query<{ category: Category; monthly_minor: string }>("SELECT category, monthly_minor FROM finance_budgets WHERE user_id = $1 ORDER BY category", [userId]);
    return rows.map((r) => ({ category: r.category, limitMinor: Number(r.monthly_minor) }));
  }

  async setBudget(userId: string, category: unknown, monthlyNok: unknown): Promise<void> {
    const cat = this.checkCategory(category);
    if (!cat || cat === "income") throw new UserFacingError("Pick a spending category.", "bad_input");
    if (monthlyNok === null || monthlyNok === 0 || monthlyNok === "") {
      await this.db.query("DELETE FROM finance_budgets WHERE user_id = $1 AND category = $2", [userId, cat]);
      return;
    }
    const v = Number(monthlyNok);
    if (!Number.isFinite(v) || v <= 0 || v > 10_000_000) throw new UserFacingError("Budget must be a positive amount in NOK.", "bad_input");
    await this.db.query(
      `INSERT INTO finance_budgets (user_id, category, monthly_minor) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, category) DO UPDATE SET monthly_minor = EXCLUDED.monthly_minor`,
      [userId, cat, Math.round(v * 100)],
    );
    await audit(this.db, { userId, actor: "user", action: "finance.budget_set", details: { category: cat } });
  }

  /** Everything the Finance screen and the Finance agent say, computed from stored rows. */
  async intelligence(userId: string, today: string): Promise<FinanceIntel> {
    const all = await this.list(userId, { limit: 100_000 });
    const empty: FinanceIntel = { hasData: false, firstDate: null, lastDate: null, months: [], current: null, previous: null, budgets: [], recurring: [], anomalies: [], insights: [] };
    if (!all.length) return empty;
    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const curMonth = today.slice(0, 7);
    const monthKeys: string[] = [];
    {
      const [y, m] = curMonth.split("-").map(Number);
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
        monthKeys.push(d.toISOString().slice(0, 7));
      }
    }
    const spendCats = (t: Transaction) => t.amountMinor < 0 && t.category !== "transfers" && t.category !== "savings";
    const summarize = (month: string): MonthSummary => {
      const txs = all.filter((t) => t.date.startsWith(month));
      const by = new Map<Category, { spendMinor: number; count: number }>();
      let income = 0;
      let spend = 0;
      for (const t of txs) {
        if (t.amountMinor > 0 && t.category !== "transfers") income += t.amountMinor;
        if (spendCats(t)) {
          spend += -t.amountMinor;
          const e = by.get(t.category) ?? { spendMinor: 0, count: 0 };
          e.spendMinor += -t.amountMinor;
          e.count++;
          by.set(t.category, e);
        }
      }
      return {
        month,
        incomeMinor: income,
        spendMinor: spend,
        netMinor: income - spend,
        byCategory: [...by.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.spendMinor - a.spendMinor),
        transactions: txs.length,
      };
    };
    const firstMonth = sorted[0]!.date.slice(0, 7);
    const months = monthKeys.filter((m) => m >= firstMonth).map(summarize);
    const current = months.find((m) => m.month === curMonth) ?? null;
    const previous = months.find((m) => m.month === monthKeys[4]) ?? null;

    // Budgets: spend so far this month and straight-line projection.
    const [cy, cm, cd] = today.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(cy!, cm!, 0)).getUTCDate();
    const elapsed = Math.max(1, cd!);
    const budgets = (await this.budgets(userId)).map((b) => {
      const spent = current?.byCategory.find((c) => c.category === b.category)?.spendMinor ?? 0;
      const projected = Math.round((spent / elapsed) * daysInMonth);
      return { category: b.category, limitMinor: b.limitMinor, spentMinor: spent, pace: b.limitMinor ? spent / b.limitMinor : 0, projectedMinor: projected };
    });

    // Recurring: the same merchant charged in 3+ different months with similar amounts (±15% of median).
    const groups = new Map<string, Transaction[]>();
    for (const t of all) {
      if (t.amountMinor >= 0) continue;
      const k = merchantKey(t.description);
      if (k.length < 3) continue;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
    }
    const recurring: FinanceIntel["recurring"] = [];
    for (const [key, txs] of groups) {
      const monthsSeen = new Set(txs.map((t) => t.date.slice(0, 7)));
      if (monthsSeen.size < 3) continue;
      const amts = txs.map((t) => -t.amountMinor);
      const med = median(amts);
      const similar = amts.filter((a) => Math.abs(a - med) <= med * 0.15).length;
      if (similar / amts.length < 0.6) continue;
      const last = txs.reduce((a, b) => (a.date > b.date ? a : b));
      recurring.push({ key, label: last.description, category: last.category, typicalMinor: Math.round(med), months: monthsSeen.size, lastDate: last.date });
    }
    recurring.sort((a, b) => b.typicalMinor - a.typicalMinor);

    // Anomalies (last 45 days): 3x the merchant's usual amount (≥4 earlier charges), or a category's largest-ever charge.
    const cutoff = new Date(Date.parse(today) - 45 * 86400000).toISOString().slice(0, 10);
    const anomalies: FinanceIntel["anomalies"] = [];
    for (const t of all) {
      if (t.amountMinor >= 0 || t.date < cutoff || !spendCats(t)) continue;
      const k = merchantKey(t.description);
      const earlier = (groups.get(k) ?? []).filter((x) => x.id !== t.id && x.date <= t.date).map((x) => -x.amountMinor);
      if (earlier.length >= 4) {
        const med = median(earlier);
        if (-t.amountMinor >= med * 3 && -t.amountMinor - med >= 20000) {
          anomalies.push({ id: t.id, date: t.date, description: t.description, amountMinor: t.amountMinor, typicalMinor: Math.round(med), reason: `${Math.round(-t.amountMinor / med)}× the usual amount here` });
        }
      }
    }
    anomalies.sort((a, b) => a.amountMinor - b.amountMinor);

    const insights: FinanceIntel["insights"] = [];
    for (const b of budgets) {
      if (b.spentMinor > b.limitMinor) insights.push({ kind: "warning", text: `${FINANCE_CATEGORY_LABELS[b.category]} is over budget: ${formatNok(b.spentMinor)} of ${formatNok(b.limitMinor)}.` });
      else if (b.projectedMinor > b.limitMinor * 1.05 && elapsed >= 5)
        insights.push({ kind: "warning", text: `${FINANCE_CATEGORY_LABELS[b.category]} is on pace for ${formatNok(b.projectedMinor)} this month (budget ${formatNok(b.limitMinor)}).` });
    }
    if (current && previous && previous.spendMinor > 0) {
      // Compare like with like: spend in the first N days of each month.
      const prevSameDays = all
        .filter((t) => t.date.startsWith(previous.month) && Number(t.date.slice(8, 10)) <= elapsed && spendCats(t))
        .reduce((s, t) => s - t.amountMinor, 0);
      if (prevSameDays > 0) {
        const delta = (current.spendMinor - prevSameDays) / prevSameDays;
        if (Math.abs(delta) >= 0.15)
          insights.push({
            kind: delta > 0 ? "warning" : "win",
            text: `Spending is ${delta > 0 ? "up" : "down"} ${Math.round(Math.abs(delta) * 100)}% versus the same ${elapsed} days last month (${formatNok(current.spendMinor)} vs ${formatNok(prevSameDays)}).`,
          });
      }
    }
    const subs = recurring.filter((r) => r.category === "subscriptions");
    if (subs.length >= 3) insights.push({ kind: "tip", text: `${subs.length} recurring subscriptions total about ${formatNok(subs.reduce((s, r) => s + r.typicalMinor, 0))}/month. Worth a review.` });
    for (const a of anomalies.slice(0, 2)) insights.push({ kind: "warning", text: `Unusual charge: ${a.description} ${formatNok(a.amountMinor)} on ${a.date} (${a.reason}).` });
    const lastDate = sorted.at(-1)!.date;
    if (Date.parse(today) - Date.parse(lastDate) > 21 * 86400000) insights.push({ kind: "tip", text: `The newest transaction is from ${lastDate}. Import a fresh bank export to keep this current.` });

    return { hasData: true, firstDate: sorted[0]!.date, lastDate, months, current, previous, budgets, recurring: recurring.slice(0, 12), anomalies: anomalies.slice(0, 8), insights };
  }
}
