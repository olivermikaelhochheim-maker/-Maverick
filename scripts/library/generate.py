"""Generate packages/core/src/library/tasks.ts from the reviewed doc tables.

Run: python3 scripts/library/generate.py

Trigger DSL (one per task id), optionally followed by modifiers:
  now                       one-off, any time
  habit                     one-off: adopt as a habit
  after:Z1+30               one-off, 30 days after Z1 was accepted
  window:FROM..TO           one-off between two dates (TO = deadline)
  exam:-15..-1 / pilot:-365..-270 / exam2:-42..-1   relative to an anchor date in Settings
  yearly:MM-DD              each year from that day (7-day window)
  monthly:N | monthly:first-sun | monthly:last-sun | monthly:last
  weekly:D                  0 = Sunday
  quarterly:start | quarterly:end
  every:N                   every N days
  cond:NAME                 a data condition
Modifiers: |req:Z1,Z2  (only after those were accepted)   |p1 (priority 1)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# rows.json: [part, id, task, when, effort, why] per table row of the
# "Maverick task library and independence plan" document (exported as Markdown).
rows = json.load(open(os.path.join(HERE, "rows.json")))

T = {
 # Exam
 "E1": "exam:-15..-1|p1", "E2": "exam:-14..-1|p1", "E3": "exam:-13..-1|p1", "E4": "exam:-11..-1|p1", "E5": "exam:-11..-1",
 "E6": "exam:-7..-1", "E7": "exam:-9..-1", "E8": "exam:-2..-1|p1", "E9": "exam:-2..0", "E10": "exam:-1..0", "E11": "exam:-1..0|p1",
 "E12": "exam:-15..-3|p1", "E13": "exam:1..30", "E14": "exam2:-42..-1|p1", "E15": "exam:21..60",
 # Pilot
 "A1": "window:2026-11-01..2026-11-23|p1", "A2": "window:2026-11-01..2026-11-23", "A3": "window:2027-01-15..2027-02-28|p1",
 "A4": "now|req:A3", "A5": "now", "A6": "now|req:A5", "A7": "now", "A8": "now|req:A7", "A9": "pilot:-300..-180",
 "A10": "pilot:-180..-90", "A11": "pilot:-365..-240|p1", "A12": "pilot:-425..-365", "A13": "pilot:-400..-365",
 "A14": "pilot:-120..-60", "A15": "window:2026-12-01..2027-03-31", "A16": "now", "A17": "now", "A18": "now",
 "A19": "now|req:A5", "A20": "now|req:A19", "A21": "pilot:-70..83|p1", "A22": "pilot:-75..-60|p1", "A23": "pilot:-150..-1",
 "A24": "window:2026-12-01..2027-06-30", "A25": "pilot:-180..-120", "A26": "monthly:1", "A27": "pilot:-120..-75",
 "A28": "pilot:-545..-365", "A29": "pilot:-210..-180",
 # Zorza
 "Z1": "now", "Z2": "now|req:Z1", "Z3": "now|req:Z2", "Z4": "now|req:Z3", "Z5": "after:Z14+30", "Z6": "habit|req:Z4",
 "Z7": "after:Z14+30", "Z8": "now|req:Z2", "Z9": "now|req:Z2", "Z10": "now", "Z11": "now|req:Z10", "Z12": "now|req:Z11",
 "Z13": "now|req:Z12", "Z14": "now|req:Z11", "Z15": "after:Z14+21", "Z16": "now|req:Z10", "Z17": "weekly:1|req:Z16",
 "Z18": "weekly:2|req:Z17", "Z19": "habit|req:Z18", "Z20": "monthly:15|req:Z14", "Z21": "weekly:4|req:Z12", "Z22": "now",
 "Z23": "now|req:Z10", "Z24": "now|req:Z23", "Z25": "now|req:Z11", "Z26": "now", "Z27": "now|req:Z26", "Z28": "now|req:Z14",
 "Z29": "now|req:Z14", "Z30": "now", "Z31": "weekly:0|req:Z30", "Z32": "after:Z14+90", "Z33": "after:Z14+60", "Z34": "now|req:Z33",
 "Z35": "yearly:12-01|req:Z2", "Z36": "now|req:Z2", "Z37": "monthly:1|req:Z14", "Z38": "window:2026-11-06..2027-02-01", "Z39": "now|req:Z16",
 "Z40": "now", "Z41": "monthly:last", "Z42": "window:2026-11-15..2026-12-31", "Z43": "monthly:1|req:Z4", "Z44": "habit|req:Z18",
 "Z45": "habit|req:Z14", "Z46": "after:Z15+60", "Z47": "now", "Z48": "quarterly:end",
 # Money
 "M1": "now", "M2": "now|req:M1", "M3": "habit", "M4": "window:2026-11-06..2026-12-31|p1", "M5": "yearly:06-01", "M6": "after:M3+30",
 "M7": "now|req:M6", "M8": "now|req:M2", "M9": "window:2026-11-06..2026-12-31", "M10": "now|req:A19", "M11": "yearly:11-15",
 "M12": "yearly:03-10", "M13": "yearly:03-10|p1", "M14": "yearly:03-10|req:Z2", "M15": "monthly:1", "M16": "quarterly:start",
 "M17": "cond:subscriptions", "M18": "now", "M19": "yearly:02-15", "M20": "every:45", "M21": "now", "M22": "window:2027-01-15..2027-12-31",
 "M23": "pilot:-120..-75",
 # Property
 "R1": "now", "R2": "quarterly:start|req:R1", "R3": "now|req:R1", "R4": "now|req:R1", "R5": "now|req:R4", "R6": "now|req:R1",
 "R7": "window:2027-01-15..2027-12-31", "R8": "now|req:R3,R5", "R9": "now|req:R8", "R10": "now|req:R9", "R11": "now|req:R8",
 "R12": "now", "R13": "now|req:R12", "R14": "yearly:01-20", "R15": "after:R11+180", "R16": "monthly:5|req:R11", "R17": "now|req:R9",
 # Physique
 "P1": "now", "P2": "now|req:P1", "P3": "habit|req:P2", "P4": "after:P2+28", "P5": "every:49|req:P2", "P6": "monthly:first-sun",
 "P7": "habit", "P8": "after:P6+30", "P9": "now", "P10": "weekly:0|req:P9", "P11": "habit", "P12": "weekly:6", "P13": "habit",
 "P14": "habit", "P15": "weekly:0", "P16": "habit", "P17": "habit", "P18": "monthly:25", "P19": "habit", "P20": "habit",
 "P21": "habit", "P22": "habit", "P23": "habit", "P24": "habit", "P25": "yearly:11-01", "P26": "now", "P27": "weekly:0",
 "P28": "habit", "P29": "cond:low_energy", "P30": "every:56|req:P2", "P31": "window:2026-11-15..2026-12-31", "P32": "habit",
 "P33": "habit", "P34": "habit", "P35": "now", "P36": "exam:-16..-10",
 # Discipline
 "D1": "now|p1", "D2": "now", "D3": "habit", "D4": "weekly:0", "D5": "habit", "D6": "cond:overdue_2d", "D7": "habit",
 "D8": "weekly:0", "D9": "weekly:0|req:D10", "D10": "now", "D11": "cond:no_activity_2d", "D12": "monthly:1", "D13": "now",
 "D14": "habit", "D15": "monthly:last", "D16": "habit|req:D14", "D17": "weekly:3", "D18": "weekly:5", "D19": "habit",
 "D20": "weekly:2|req:Z12", "D21": "quarterly:start", "D22": "monthly:last", "D23": "habit", "D24": "weekly:6", "D25": "habit",
 "D26": "habit", "D27": "weekly:0", "D28": "habit", "D29": "monthly:last-sun", "D30": "now", "D31": "now|req:Z10",
 "D32": "now|req:Z11", "D33": "now", "D34": "quarterly:start",
 # Family / life
 "F1": "yearly:01-07", "F2": "yearly:01-12", "F3": "yearly:02-17", "F4": "yearly:02-22", "F5": "yearly:03-25", "F6": "yearly:03-29",
 "F7": "every:10", "F8": "every:60", "F9": "weekly:0", "F10": "every:14", "F11": "quarterly:start", "F12": "every:14",
 "F13": "monthly:10", "F14": "now", "F15": "every:42", "F16": "habit", "F17": "now", "F18": "yearly:10-01", "F19": "every:182",
 "F20": "cond:subscriptions", "F21": "monthly:first-sun", "F22": "now", "F23": "yearly:05-01", "F24": "yearly:03-12",
 "F25": "yearly:12-01", "F26": "monthly:20", "F27": "monthly:last-sun", "F28": "now", "F29": "yearly:10-01", "F30": "every:182",
}

DOMAINS = {1: "pilot", 2: "zorza", 3: "money", 4: "physique", 5: "discipline", 6: "life"}
ids = {r[1] for r in rows}
missing = ids - set(T)
extra = set(T) - ids
if missing or extra:
    sys.exit(f"missing {sorted(missing)} extra {sorted(extra)}")


def unmd(s: str) -> str:
    s = s.replace("\\~", "~").replace("\\*", "*").replace("\\_", "_").replace("\\-", "-").replace("\\|", "|")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    return s.strip()


def parse(spec: str):
    parts = spec.split("|")
    t = parts[0]
    trig = {}
    if t in ("now", "habit"):
        trig = {"type": t}
    elif t.startswith("after:"):
        m = re.match(r"after:([A-Z]\d+)\+(\d+)", t)
        trig = {"type": "after", "id": m.group(1), "days": int(m.group(2))}
    elif t.startswith("window:"):
        a, b = t[7:].split("..")
        trig = {"type": "window", "from": a, "to": b}
    elif re.match(r"(exam|exam2|pilot):", t):
        name, rng = t.split(":")
        a, b = rng.split("..")
        trig = {"type": "anchor", "anchor": {"exam": "exam", "exam2": "exam2", "pilot": "pilotStart"}[name], "from": int(a), "to": int(b)}
    elif t.startswith("yearly:"):
        mm, dd = t[7:].split("-")
        trig = {"type": "yearly", "month": int(mm), "day": int(dd)}
    elif t.startswith("monthly:"):
        v = t[8:]
        trig = {"type": "monthly", "day": int(v) if v.isdigit() else v}
    elif t.startswith("weekly:"):
        trig = {"type": "weekly", "weekday": int(t[7:])}
    elif t.startswith("quarterly:"):
        trig = {"type": "quarterly", "at": t[10:]}
    elif t.startswith("every:"):
        trig = {"type": "every", "days": int(t[6:])}
    elif t.startswith("cond:"):
        trig = {"type": "condition", "check": t[5:]}
    else:
        sys.exit(f"bad spec {spec}")
    req, prio = [], None
    for m in parts[1:]:
        if m.startswith("req:"):
            req = m[4:].split(",")
        elif m == "p1":
            prio = 1
    for r in req:
        if r not in ids:
            sys.exit(f"bad req {r} in {spec}")
    if trig["type"] == "after" and trig["id"] not in ids:
        sys.exit(f"bad after in {spec}")
    return trig, req, prio


out = []
for part, tid, title, when, effort, why in rows:
    trig, req, prio = parse(T[tid])
    item = {"id": tid, "domain": "degree" if tid.startswith("E") else DOMAINS[part], "title": unmd(title), "why": unmd(why), "when": unmd(when), "effort": effort.strip(), "trigger": trig}
    if req:
        item["requires"] = req
    if prio:
        item["priority"] = prio
    out.append(item)

header = '''import type { LibraryTask } from "./types";

/**
 * Oliver's task library: 232 tasks researched on 5 Nov 2026 ("Maverick task
 * library and independence plan"). Generated from that document; each task has
 * a machine-readable trigger. Edit the document and regenerate rather than
 * hand-editing large parts of this file.
 */
export const LIBRARY: LibraryTask[] = '''
body = json.dumps(out, ensure_ascii=False, indent=1)
open(os.path.join(ROOT, "packages", "core", "src", "library", "tasks.ts"), "w").write(header + body + ";\n")
print(len(out), "tasks written")
