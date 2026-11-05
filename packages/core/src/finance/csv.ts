import { UserFacingError } from "../util/errors";

/**
 * Bank statement CSV parsing, tuned for Norwegian banks (DNB, SpareBank 1,
 * Sbanken, Nordea, Bulder, Handelsbanken) and generic English exports.
 *
 * Handles: ";" "," or tab delimiters, quoted fields, a UTF-8 BOM, preamble
 * lines before the header, comma decimals ("1 234,56"), dates as
 * dd.mm.yyyy / dd.mm.yy / yyyy-mm-dd / dd/mm/yyyy, and either one signed
 * amount column or separate "Inn" / "Ut" columns.
 */

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  /** Minor units (øre). Negative = money out. */
  amountMinor: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: { line: number; reason: string }[];
  columns: { date: string; description: string; amount?: string; inflow?: string; outflow?: string };
  delimiter: string;
}

const DATE_COLS = ["dato", "bokføringsdato", "bokforingsdato", "bokført", "bokfort", "transaksjonsdato", "date", "booking date", "transaction date", "posted"];
const DESC_COLS = ["forklaring", "beskrivelse", "tekst", "teskt", "tittel", "melding", "description", "text", "details", "merchant", "payee", "narrative"];
const AMOUNT_COLS = ["beløp", "belop", "beløp nok", "amount", "sum", "value", "beløp i nok"];
const IN_COLS = ["inn på konto", "inn pa konto", "inn", "innskudd", "inngående", "kredit", "credit", "money in", "paid in"];
const OUT_COLS = ["ut fra konto", "ut", "uttak", "utgående", "debet", "debit", "money out", "paid out"];

export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_ROWS = 5000;

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[."']/g, "").trim();

function findCol(headers: string[], names: string[]): number {
  // Exact match first, then "starts with" (e.g. "Beløp (NOK)").
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = headers.findIndex((h) => h.startsWith(n + " ") || h.startsWith(n + "("));
    if (i >= 0) return i;
  }
  return -1;
}

/** "1 234,56" · "-1.234,56" · "1,234.56" · "1234.56" · "kr 99,-" → minor units. Null if not a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/ /g, " ").replace(/kr|nok|,-$/gi, "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s/g, "");
  if (s.startsWith("-") || s.startsWith("−")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // comma is the decimal separator; dots are thousands
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma >= 0) {
    s = s.replace(/,/g, "");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" = thousands
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(Number(s) * 100);
  return neg ? -v : v;
}

/** Returns YYYY-MM-DD or null. Day-first for slashed dates (European). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s))) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += 2000;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseBankCsv(text: string): ParseResult {
  if (text.length > MAX_CSV_BYTES) throw new UserFacingError("That file is too large (max 2 MB). Export a shorter period.", "too_large");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  // Find the header: the first of the first 15 lines that has a date column and a description column.
  let headerIdx = -1;
  let delim = ";";
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    for (const d of [";", "\t", ","]) {
      const h = splitLine(line, d).map(norm);
      if (h.length < 2) continue;
      if (findCol(h, DATE_COLS) >= 0 && findCol(h, DESC_COLS) >= 0) {
        headerIdx = i;
        delim = d;
        headers = h;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) {
    throw new UserFacingError(
      "I couldn't find the column headers. The file needs a date column (e.g. \"Dato\") and a description column (e.g. \"Forklaring\" or \"Beskrivelse\").",
      "bad_csv",
    );
  }
  const di = findCol(headers, DATE_COLS);
  const ti = findCol(headers, DESC_COLS);
  const ai = findCol(headers, AMOUNT_COLS);
  const ii = findCol(headers, IN_COLS);
  const oi = findCol(headers, OUT_COLS);
  if (ai < 0 && ii < 0 && oi < 0) {
    throw new UserFacingError("I couldn't find an amount column (e.g. \"Beløp\", or \"Inn\" and \"Ut\").", "bad_csv");
  }
  const rows: ParsedRow[] = [];
  const skipped: ParseResult["skipped"] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (rows.length >= MAX_CSV_ROWS) throw new UserFacingError(`Too many rows (max ${MAX_CSV_ROWS}). Export a shorter period.`, "too_large");
    const f = splitLine(line, delim);
    const date = parseDate(f[di] ?? "");
    if (!date) {
      skipped.push({ line: i + 1, reason: "no valid date" });
      continue;
    }
    const description = (f[ti] ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    let amount: number | null = null;
    if (ai >= 0) amount = parseAmount(f[ai] ?? "");
    if (amount === null && (ii >= 0 || oi >= 0)) {
      const inn = ii >= 0 ? parseAmount(f[ii] ?? "") : null;
      const ut = oi >= 0 ? parseAmount(f[oi] ?? "") : null;
      // Banks show "Ut" as either a positive or a negative number; it's always money out.
      if (inn !== null && inn !== 0) amount = Math.abs(inn);
      else if (ut !== null && ut !== 0) amount = -Math.abs(ut);
      else if (inn === 0 || ut === 0) amount = 0;
    }
    if (amount === null) {
      skipped.push({ line: i + 1, reason: "no amount" });
      continue;
    }
    if (amount === 0) {
      skipped.push({ line: i + 1, reason: "zero amount" });
      continue;
    }
    rows.push({ date, description: description || "(no description)", amountMinor: amount });
  }
  return {
    rows,
    skipped,
    delimiter: delim === "\t" ? "tab" : delim,
    columns: {
      date: headers[di]!,
      description: headers[ti]!,
      ...(ai >= 0 ? { amount: headers[ai]! } : {}),
      ...(ii >= 0 ? { inflow: headers[ii]! } : {}),
      ...(oi >= 0 ? { outflow: headers[oi]! } : {}),
    },
  };
}
