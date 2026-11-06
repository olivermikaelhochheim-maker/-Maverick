import type { LibraryTask } from "./types";

/**
 * Oliver's task library: 232 tasks researched on 5 Nov 2026 ("Maverick task
 * library and independence plan"). Generated from that document; each task has
 * a machine-readable trigger. Edit the document and regenerate rather than
 * hand-editing large parts of this file.
 */
export const LIBRARY: LibraryTask[] = [
 {
  "id": "E1",
  "domain": "degree",
  "title": "Get the syllabus, the allowed aids and every past paper you can find",
  "why": "Know exactly what's tested",
  "when": "Today",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -15,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E2",
  "domain": "degree",
  "title": "Do one past paper as a diagnostic; list your 5 weakest topics",
  "why": "Study where the points are",
  "when": "Day 1–2",
  "effort": "L",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -14,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E3",
  "domain": "degree",
  "title": "Start an error log: every mistake, why, the correct method",
  "why": "Turns mistakes into retrieval practice",
  "when": "From day 2",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -13,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E4",
  "domain": "degree",
  "title": "One 60–90 min block of mixed problems daily (20–30 min on shift days)",
  "why": "Interleaving and spacing are the top techniques",
  "when": "Days 4–12",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -11,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E5",
  "domain": "degree",
  "title": "Revisit each weak topic 2–3 days after first practising it",
  "why": "A gap of 1–6 days makes retrieval stronger",
  "when": "Days 4–12",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -11,
   "to": -1
  }
 },
 {
  "id": "E6",
  "domain": "degree",
  "title": "Make a one-page formula sheet from memory, then check it",
  "why": "Self-testing, not copying",
  "when": "Day 8",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -7,
   "to": -1
  }
 },
 {
  "id": "E7",
  "domain": "degree",
  "title": "Explain one hard concept (e.g. a hypothesis test) out loud as if teaching it",
  "why": "Finds gaps fast",
  "when": "Days 6–12",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -9,
   "to": -1
  }
 },
 {
  "id": "E8",
  "domain": "degree",
  "title": "Full timed past paper under exam conditions",
  "why": "Exam stamina and timing",
  "when": "Day 13",
  "effort": "L",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -2,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E9",
  "domain": "degree",
  "title": "Review every error from the timed paper",
  "why": "The last big learning step",
  "when": "Day 13–14",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -2,
   "to": 0
  }
 },
 {
  "id": "E10",
  "domain": "degree",
  "title": "Second timed paper, if one exists",
  "why": "Confirms the fixes held",
  "when": "Day 14",
  "effort": "L",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -1,
   "to": 0
  }
 },
 {
  "id": "E11",
  "domain": "degree",
  "title": "Light review only; pack ID, calculator and aids; sleep 8 hours",
  "why": "Sleep protects recall",
  "when": "19 Nov",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -1,
   "to": 0
  },
  "priority": 1
 },
 {
  "id": "E12",
  "domain": "degree",
  "title": "Book exam-week shifts off or swap them, if possible",
  "why": "Protects the study blocks",
  "when": "Today",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -15,
   "to": -3
  },
  "priority": 1
 },
 {
  "id": "E13",
  "domain": "degree",
  "title": "Register for the second remaining exam and put its date in Maverick",
  "why": "The degree finishes with both",
  "when": "After 20 Nov",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": 1,
   "to": 30
  }
 },
 {
  "id": "E14",
  "domain": "degree",
  "title": "Start the second exam's plan 6 weeks out, using the same method",
  "why": "Spacing needs weeks, not days",
  "when": "6 weeks before",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "exam2",
   "from": -42,
   "to": -1
  },
  "priority": 1
 },
 {
  "id": "E15",
  "domain": "degree",
  "title": "Order the diploma and save it as PDF in Files",
  "why": "Flight schools and employers ask for it",
  "when": "When results are in",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": 21,
   "to": 60
  }
 },
 {
  "id": "A1",
  "domain": "pilot",
  "title": "Read the Lånekassen pilot-funding consultation and note what changes for you",
  "why": "Decides your budget and which schools are possible",
  "when": "Before 23 Nov 2026",
  "effort": "M",
  "trigger": {
   "type": "window",
   "from": "2026-11-01",
   "to": "2026-11-23"
  },
  "priority": 1
 },
 {
  "id": "A2",
  "domain": "pilot",
  "title": "Optional: send a short consultation response as a future student",
  "why": "Your view counts; takes 30 minutes",
  "when": "Before 23 Nov 2026",
  "effort": "M",
  "trigger": {
   "type": "window",
   "from": "2026-11-01",
   "to": "2026-11-23"
  }
 },
 {
  "id": "A3",
  "domain": "pilot",
  "title": "Set a reminder to check the final Lånekassen decision",
  "why": "The rules may change on 1 Jan 2027",
  "when": "15 Jan 2027",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2027-01-15",
   "to": "2027-02-28"
  },
  "priority": 1
 },
 {
  "id": "A4",
  "domain": "pilot",
  "title": "Shortlist 3 schools: OSM plus 2 EEA schools that would qualify under the new rules",
  "why": "Keeps options if rules change",
  "when": "After A3",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A3"
  ]
 },
 {
  "id": "A5",
  "domain": "pilot",
  "title": "Read the OSM programme page: price, what's included, both 2027 start dates",
  "why": "Prices quoted vary (NOK 1.185M–1.22M); confirm",
  "when": "This month",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "A6",
  "domain": "pilot",
  "title": "Ask OSM in writing: total cost incl. housing, exams and licence fees; what happens to your money if the school fails",
  "why": "The Torp bankruptcy shows the risk",
  "when": "Before applying",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A5"
  ]
 },
 {
  "id": "A7",
  "domain": "pilot",
  "title": "Check your maths and physics against OSM's requirements",
  "why": "Missing physics can be covered by a 2-week distance course",
  "when": "This month",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "A8",
  "domain": "pilot",
  "title": "If physics is missing: book the 2-week physics course",
  "why": "Removes the blocker early",
  "when": "3+ months before applying",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A7"
  ]
 },
 {
  "id": "A9",
  "domain": "pilot",
  "title": "Practise for the aptitude test: mental maths, spatial reasoning, multitasking apps",
  "why": "The test is about 2 h, costs NOK 400; a fail means waiting 12 months",
  "when": "3 times a week for 8 weeks",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -300,
   "to": -180
  }
 },
 {
  "id": "A10",
  "domain": "pilot",
  "title": "Take OSM's admission test (online, ~2 h)",
  "why": "A pass is valid for one year",
  "when": "Spring 2027, after 8 weeks of practice",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -180,
   "to": -90
  }
 },
 {
  "id": "A11",
  "domain": "pilot",
  "title": "Book the first Class 1 medical in Oslo (Flymedisinsk institutt or Norges Flymedisinske Senter)",
  "why": "The first exam can only be done in Oslo; local doctors only renew",
  "when": "9–12 months before the start date",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -365,
   "to": -240
  },
  "priority": 1
 },
 {
  "id": "A12",
  "domain": "pilot",
  "title": "Before the medical: optician eye test and a colour-vision check",
  "why": "Find surprises while there's time to act",
  "when": "2 months before A11",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -425,
   "to": -365
  }
 },
 {
  "id": "A13",
  "domain": "pilot",
  "title": "Gather medical history: medications, past conditions, glasses prescription",
  "why": "Saves time and repeat visits",
  "when": "Before A11",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -400,
   "to": -365
  }
 },
 {
  "id": "A14",
  "domain": "pilot",
  "title": "Book the FAA Class 1 medical too, if training in the US",
  "why": "OSM requires both by the deadline",
  "when": "Before the contract deadline",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -120,
   "to": -60
  }
 },
 {
  "id": "A15",
  "domain": "pilot",
  "title": "Book a trial flight at a flying club near Stavanger (Sola)",
  "why": "Confirms the dream before a NOK 1.2M commitment",
  "when": "This winter",
  "effort": "M",
  "trigger": {
   "type": "window",
   "from": "2026-12-01",
   "to": "2027-03-31"
  }
 },
 {
  "id": "A16",
  "domain": "pilot",
  "title": "Talk to two Widerøe pilots about their path and the job",
  "why": "You have insider access; use it",
  "when": "Next 2 months",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "A17",
  "domain": "pilot",
  "title": "Ask Widerøe HR about any pathway or support for employees",
  "why": "No formal route was found; asking costs nothing",
  "when": "Next 2 months",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "A18",
  "domain": "pilot",
  "title": "Read Widerøe's and Norwegian's pilot vacancy requirements",
  "why": "Widerøe needs Scandinavian language and an EASA licence issued in Scandinavia",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "A19",
  "domain": "pilot",
  "title": "Build a pilot-school budget: tuition, living costs, Lånekassen, own savings",
  "why": "Know the gap you must fund",
  "when": "After A5–A6",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A5"
  ]
 },
 {
  "id": "A20",
  "domain": "pilot",
  "title": "Savings target for the school buffer, put into Maverick's Finance",
  "why": "Turns the dream into a monthly number",
  "when": "After A19",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A19"
  ]
 },
 {
  "id": "A21",
  "domain": "pilot",
  "title": "Apply to Lånekassen for the 2027–28 school year",
  "why": "Deadline for autumn/full year",
  "when": "As soon as you have the school place (summer 2027); final deadline 15 Nov 2027",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -70,
   "to": 83
  },
  "priority": 1
 },
 {
  "id": "A22",
  "domain": "pilot",
  "title": "Sign the OSM contract and pay the fee for the August 2027 start",
  "why": "About two months before start",
  "when": "By ~24 Jun 2027",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -75,
   "to": -60
  },
  "priority": 1
 },
 {
  "id": "A23",
  "domain": "pilot",
  "title": "Start ATPL theory early with a ground-school app (e.g. 15 min a day)",
  "why": "Eases the theory phase",
  "when": "Spring 2027",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -150,
   "to": -1
  }
 },
 {
  "id": "A24",
  "domain": "pilot",
  "title": "Learn the ICAO phonetic alphabet and basic radio phrases",
  "why": "Small, motivating, useful on day one",
  "when": "Next month",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2026-12-01",
   "to": "2027-06-30"
  }
 },
 {
  "id": "A25",
  "domain": "pilot",
  "title": "Plan your Widerøe exit or leave of absence around the start date",
  "why": "Clean handover, keeps the door open",
  "when": "6 months before start",
  "effort": "M",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -180,
   "to": -120
  }
 },
 {
  "id": "A26",
  "domain": "pilot",
  "title": "Follow the hiring outlook: one aviation news check a month",
  "why": "Boeing sees 153,000 pilots needed in Europe over 20 years, but hiring slowed in 2026",
  "when": "Monthly",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 1
  }
 },
 {
  "id": "A27",
  "domain": "pilot",
  "title": "Decide: OSM's US base (Fort Lauderdale) or Västerås",
  "why": "Affects cost, medicals and living",
  "when": "Before signing",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -120,
   "to": -75
  }
 },
 {
  "id": "A28",
  "domain": "pilot",
  "title": "Health baseline before the medical: blood pressure, weight, sleep",
  "why": "Links to Part 4",
  "when": "6 months before A11",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -545,
   "to": -365
  }
 },
 {
  "id": "A29",
  "domain": "pilot",
  "title": "Keep a one-page \"Why I want to fly\" note for interviews",
  "why": "Motivation questions come up",
  "when": "Before the admission test",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -210,
   "to": -180
  }
 },
 {
  "id": "Z1",
  "domain": "zorza",
  "title": "Read your Widerøe contract on side jobs and conflicts of interest",
  "why": "Duty of loyalty to the employer applies",
  "when": "Before registering",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z2",
  "domain": "zorza",
  "title": "Register Zorza Marketing as an ENK at Brønnøysundregistrene (Altinn)",
  "why": "No share capital needed; AS needs NOK 30,000 plus a NOK 6,825 fee",
  "when": "After Z1",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z1"
  ]
 },
 {
  "id": "Z3",
  "domain": "zorza",
  "title": "Open a separate business bank account",
  "why": "Clean books from day one",
  "when": "After Z2",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "Z4",
  "domain": "zorza",
  "title": "Set up Fiken (about NOK 229/month) for invoices and bookkeeping",
  "why": "Every business must keep books",
  "when": "After Z3",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z3"
  ]
 },
 {
  "id": "Z5",
  "domain": "zorza",
  "title": "Register for MVA when sales approach NOK 50,000 in any 12 months",
  "why": "Required at NOK 50,000; usually by the second retainer client",
  "when": "Finance shows NOK 40,000 in rolling sales",
  "effort": "M",
  "trigger": {
   "type": "after",
   "id": "Z14",
   "days": 30
  }
 },
 {
  "id": "Z6",
  "domain": "zorza",
  "title": "Set aside 40% of every payment for tax on a separate account",
  "why": "Skatteetaten's rule of thumb for side businesses",
  "when": "Each payment received",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "Z4"
  ]
 },
 {
  "id": "Z7",
  "domain": "zorza",
  "title": "Update your tax card to include expected Zorza profit",
  "why": "Avoids a big bill later",
  "when": "After the first client",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "Z14",
   "days": 30
  }
 },
 {
  "id": "Z8",
  "domain": "zorza",
  "title": "Get quotes for professional liability insurance",
  "why": "A wrong campaign or claim can be costly",
  "when": "Before the first contract",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "Z9",
  "domain": "zorza",
  "title": "Write a one-page standard contract: scope, price, notice, payment terms",
  "why": "Prevents scope creep and late payment",
  "when": "Before the first client",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "Z10",
  "domain": "zorza",
  "title": "Choose the first niche: write 3 reasons and test with 5 conversations",
  "why": "Specialists win against generalists",
  "when": "This month",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z11",
  "domain": "zorza",
  "title": "Write the offer ladder above into your own prices and one-liners",
  "why": "Clear offers sell",
  "when": "After Z10",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z10"
  ]
 },
 {
  "id": "Z12",
  "domain": "zorza",
  "title": "Rebuild zorza homepage around one niche and one offer",
  "why": "The site should sell the first offer",
  "when": "After Z11",
  "effort": "L",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z11"
  ]
 },
 {
  "id": "Z13",
  "domain": "zorza",
  "title": "Set up Zorza's own Google Business Profile",
  "why": "Practise what you sell",
  "when": "After Z12",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z12"
  ]
 },
 {
  "id": "Z14",
  "domain": "zorza",
  "title": "Do 3 free or cheap pilot projects in exchange for testimonials and data",
  "why": "Case studies drive referrals",
  "when": "Month 1–2",
  "effort": "L",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z11"
  ]
 },
 {
  "id": "Z15",
  "domain": "zorza",
  "title": "Write a case study for each pilot: problem, what you did, result in numbers",
  "why": "Proof beats promises",
  "when": "Each pilot finished",
  "effort": "M",
  "trigger": {
   "type": "after",
   "id": "Z14",
   "days": 21
  }
 },
 {
  "id": "Z16",
  "domain": "zorza",
  "title": "List 50 target businesses in your niche (spreadsheet or Maverick memories)",
  "why": "Outreach needs a list",
  "when": "After Z10",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z10"
  ]
 },
 {
  "id": "Z17",
  "domain": "zorza",
  "title": "Run a free 15-minute AI-visibility audit for each target (Google, reviews, AI search)",
  "why": "A free audit is the best outreach hook",
  "when": "5 per week",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 1
  },
  "requires": [
   "Z16"
  ]
 },
 {
  "id": "Z18",
  "domain": "zorza",
  "title": "Send 10 personalised outreach messages a week, each with one specific finding",
  "why": "Generic cold email gets 0.5–4% replies; specific gets more",
  "when": "Weekly",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 2
  },
  "requires": [
   "Z17"
  ]
 },
 {
  "id": "Z19",
  "domain": "zorza",
  "title": "Follow up every outreach after 5 days",
  "why": "Most replies come after the follow-up",
  "when": "5 days after sending",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "Z18"
  ]
 },
 {
  "id": "Z20",
  "domain": "zorza",
  "title": "Ask every happy client for one referral",
  "why": "66% of agencies say referrals bring the most clients",
  "when": "30 days into each client",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 15
  },
  "requires": [
   "Z14"
  ]
 },
 {
  "id": "Z21",
  "domain": "zorza",
  "title": "Post one short video or carousel a week on LinkedIn about local marketing",
  "why": "Visibility where buyers are",
  "when": "Weekly",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 4
  },
  "requires": [
   "Z12"
  ]
 },
 {
  "id": "Z22",
  "domain": "zorza",
  "title": "Join one local business network (e.g. Stavanger chamber, BNI-style group)",
  "why": "Trust is local",
  "when": "This quarter",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z23",
  "domain": "zorza",
  "title": "Reach out to the Polish business community in Rogaland (associations, Facebook groups)",
  "why": "Your strongest, least crowded niche",
  "when": "This month",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z10"
  ]
 },
 {
  "id": "Z24",
  "domain": "zorza",
  "title": "Make a Polish-language version of the offer and site page",
  "why": "Speaks to them in their language",
  "when": "After Z23",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z23"
  ]
 },
 {
  "id": "Z25",
  "domain": "zorza",
  "title": "Approach 3 energy or offshore suppliers with a multilingual B2B content offer",
  "why": "They pay for English/German content",
  "when": "This quarter",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z11"
  ]
 },
 {
  "id": "Z26",
  "domain": "zorza",
  "title": "Learn GEO/AEO: how businesses get cited by ChatGPT and Google AI answers",
  "why": "Fast-growing service; few local agencies offer it yet",
  "when": "Next 2 weeks",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z27",
  "domain": "zorza",
  "title": "Package GEO/AEO into the visibility audit",
  "why": "Differentiates the entry offer",
  "when": "After Z26",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z26"
  ]
 },
 {
  "id": "Z28",
  "domain": "zorza",
  "title": "Build a short-form video workflow: shoot day, AI edit, captions, 12 clips",
  "why": "Short-form video is reported as the top-ROI format",
  "when": "Before the first video client",
  "effort": "L",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z14"
  ]
 },
 {
  "id": "Z29",
  "domain": "zorza",
  "title": "Build a monthly client report template (traffic, calls, reviews, leads)",
  "why": "Reports keep retainers renewing",
  "when": "Before the first retainer",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z14"
  ]
 },
 {
  "id": "Z30",
  "domain": "zorza",
  "title": "Set up a simple CRM: lead, contacted, call, proposal, won/lost",
  "why": "Stops leads slipping",
  "when": "This month",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z31",
  "domain": "zorza",
  "title": "Track weekly numbers: outreach sent, calls, proposals, won, MRR",
  "why": "What you measure grows",
  "when": "Sunday review",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  },
  "requires": [
   "Z30"
  ]
 },
 {
  "id": "Z32",
  "domain": "zorza",
  "title": "Review pricing after 3 clients; raise the entry price if all said yes",
  "why": "Instant yeses mean you're too cheap",
  "when": "After the 3rd client",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "Z14",
   "days": 90
  }
 },
 {
  "id": "Z33",
  "domain": "zorza",
  "title": "Write standard operating procedures for each service",
  "why": "Needed before anyone can help you",
  "when": "After delivering each twice",
  "effort": "M",
  "trigger": {
   "type": "after",
   "id": "Z14",
   "days": 60
  }
 },
 {
  "id": "Z34",
  "domain": "zorza",
  "title": "Test one freelancer (e.g. a Polish video editor) on a small paid job",
  "why": "Your time is the bottleneck",
  "when": "Revenue above NOK 30,000/month",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z33"
  ]
 },
 {
  "id": "Z35",
  "domain": "zorza",
  "title": "Decide: ENK or AS, once profit passes ~NOK 300,000/year",
  "why": "Limited liability and tax planning; ask an accountant",
  "when": "Yearly review",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 12,
   "day": 1
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "Z36",
  "domain": "zorza",
  "title": "Find an accountant for year-end and the first tax return",
  "why": "Mistakes cost more than the fee",
  "when": "Before the first year-end",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "Z37",
  "domain": "zorza",
  "title": "Calculate the hours Zorza takes per month vs your shift roster",
  "why": "Burnout ends businesses",
  "when": "Monthly",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 1
  },
  "requires": [
   "Z14"
  ]
 },
 {
  "id": "Z38",
  "domain": "zorza",
  "title": "Plan how Zorza runs while you're at pilot school from August 2027",
  "why": "A partner, freelancers or a smaller client list",
  "when": "Before Feb 2027",
  "effort": "L",
  "trigger": {
   "type": "window",
   "from": "2026-11-06",
   "to": "2027-02-01"
  }
 },
 {
  "id": "Z39",
  "domain": "zorza",
  "title": "Learn the basics of markedsføringsloven for B2B outreach and AI content",
  "why": "Unclear rules; check before mass emailing",
  "when": "Before outreach starts",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z16"
  ]
 },
 {
  "id": "Z40",
  "domain": "zorza",
  "title": "Create 3 reusable AI prompts for client content in your brand voice",
  "why": "Faster delivery, higher margin",
  "when": "This month",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z41",
  "domain": "zorza",
  "title": "Keep tool costs in check: list every subscription and its cost",
  "why": "A lean stack costs NOK 1,500–4,000/month",
  "when": "Monthly",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "last"
  }
 },
 {
  "id": "Z42",
  "domain": "zorza",
  "title": "Set a 2027 Zorza target per quarter: clients, MRR, hours",
  "why": "Breaks 100k into steps",
  "when": "Before New Year",
  "effort": "M",
  "trigger": {
   "type": "window",
   "from": "2026-11-15",
   "to": "2026-12-31"
  }
 },
 {
  "id": "Z43",
  "domain": "zorza",
  "title": "Monthly P&L: revenue, costs, profit, hours, NOK per hour",
  "why": "Shows whether the business is worth your time",
  "when": "1st of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 1
  },
  "requires": [
   "Z4"
  ]
 },
 {
  "id": "Z44",
  "domain": "zorza",
  "title": "Ask each lost proposal why; log the reason",
  "why": "Objections shape the offer",
  "when": "Lost deal",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "Z18"
  ]
 },
 {
  "id": "Z45",
  "domain": "zorza",
  "title": "Collect Google reviews from every client for Zorza",
  "why": "Social proof for the next sale",
  "when": "After a good result",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "Z14"
  ]
 },
 {
  "id": "Z46",
  "domain": "zorza",
  "title": "Build a portfolio page with before/after numbers",
  "why": "Makes sales calls easier",
  "when": "After 3 case studies",
  "effort": "M",
  "trigger": {
   "type": "after",
   "id": "Z15",
   "days": 60
  }
 },
 {
  "id": "Z47",
  "domain": "zorza",
  "title": "Write the 60-second Zorza pitch in Norwegian, Polish and English",
  "why": "Use your languages as an edge",
  "when": "This month",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "Z48",
  "domain": "zorza",
  "title": "Quarterly reality check: on track for 100k? If not, change the lever (price, niche, helper)",
  "why": "Adjust before it's too late",
  "when": "End of each quarter",
  "effort": "M",
  "trigger": {
   "type": "quarterly",
   "at": "end"
  }
 },
 {
  "id": "M1",
  "domain": "money",
  "title": "Import the last 3 months of bank transactions into Maverick (Finance)",
  "why": "Real numbers before decisions",
  "when": "Now",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "M2",
  "domain": "money",
  "title": "Set monthly budgets for the 3 biggest spending categories",
  "why": "Maverick warns you on pace",
  "when": "After M1",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "M1"
  ]
 },
 {
  "id": "M3",
  "domain": "money",
  "title": "Build an emergency buffer of 1–2 months' salary in a savings account",
  "why": "Before locking money away",
  "when": "Until reached",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "M4",
  "domain": "money",
  "title": "Open a BSU and deposit up to 27,500 NOK this year",
  "why": "10% back as tax deduction (up to 2,750 NOK)",
  "when": "Before 31 Dec 2026",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2026-11-06",
   "to": "2026-12-31"
  },
  "priority": 1
 },
 {
  "id": "M5",
  "domain": "money",
  "title": "Top up the BSU with June holiday pay",
  "why": "Uses money that feels like a bonus",
  "when": "June",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 6,
   "day": 1
  }
 },
 {
  "id": "M6",
  "domain": "money",
  "title": "Open an aksjesparekonto (ASK) at Nordnet or your bank",
  "why": "Tax-deferred switching between funds",
  "when": "After the buffer",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "M3",
   "days": 30
  }
 },
 {
  "id": "M7",
  "domain": "money",
  "title": "Set a monthly auto-transfer into a global index fund (fee ≤ 0.25%)",
  "why": "KLP AksjeGlobal Indeks costs ~0.10–0.25% a year",
  "when": "Payday",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "M6"
  ]
 },
 {
  "id": "M8",
  "domain": "money",
  "title": "Choose your savings rate: start at 15% of take-home, raise 1% each quarter",
  "why": "Gradual increases stick",
  "when": "Payday",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "M2"
  ]
 },
 {
  "id": "M9",
  "domain": "money",
  "title": "Decide on IPS (up to 25,000 NOK deduction) vs keeping money free for pilot school",
  "why": "IPS money is locked until retirement",
  "when": "Once, before 31 Dec",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2026-11-06",
   "to": "2026-12-31"
  }
 },
 {
  "id": "M10",
  "domain": "money",
  "title": "Set a pilot-school savings target and a separate account for it",
  "why": "Ring-fenced money gets saved",
  "when": "After A19 in Part 1",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "A19"
  ]
 },
 {
  "id": "M11",
  "domain": "money",
  "title": "Check your tax card: income estimate and deductions (union dues up to 8,700 NOK)",
  "why": "Correct tax all year",
  "when": "Before 15 Dec",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 11,
   "day": 15
  }
 },
 {
  "id": "M12",
  "domain": "money",
  "title": "Claim the travel deduction if your commute qualifies (1.90 NOK/km above 12,000 NOK)",
  "why": "Shift workers often qualify",
  "when": "Tax return",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 10
  }
 },
 {
  "id": "M13",
  "domain": "money",
  "title": "File the skattemelding: check every number",
  "why": "Missed deductions are lost money",
  "when": "When it opens in March; deadline 30 Apr (31 May with a business)",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 10
  },
  "priority": 1
 },
 {
  "id": "M14",
  "domain": "money",
  "title": "Add Zorza income and costs to the skattemelding",
  "why": "ENK profit is added to your salary income",
  "when": "Tax return season",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 10
  },
  "requires": [
   "Z2"
  ]
 },
 {
  "id": "M15",
  "domain": "money",
  "title": "Monthly money review: income, spending, savings rate, net worth",
  "why": "Tracked and shared goals do better",
  "when": "1st of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 1
  }
 },
 {
  "id": "M16",
  "domain": "money",
  "title": "Net-worth snapshot: savings, funds, debts",
  "why": "The real scoreboard for \"money\" in 2027",
  "when": "Quarterly",
  "effort": "S",
  "trigger": {
   "type": "quarterly",
   "at": "start"
  }
 },
 {
  "id": "M17",
  "domain": "money",
  "title": "Cancel one subscription you don't use",
  "why": "Instant monthly saving",
  "when": "Finance shows 3+ recurring subscriptions",
  "effort": "S",
  "trigger": {
   "type": "condition",
   "check": "subscriptions"
  }
 },
 {
  "id": "M18",
  "domain": "money",
  "title": "Don't buy individual stocks on tips; write down the rule",
  "why": "Index funds beat most stock pickers",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "M19",
  "domain": "money",
  "title": "Crypto: if you hold any, export the history for tax (22% on gains, wealth at 31 Dec value)",
  "why": "New reporting rules from 2026",
  "when": "Before the tax return",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 2,
   "day": 15
  }
 },
 {
  "id": "M20",
  "domain": "money",
  "title": "Read Norges Bank's rate decision and what it means for savings and loans",
  "why": "Rates moved 4.0% → 4.5% in 2026",
  "when": "After each decision (next: December)",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 45
  }
 },
 {
  "id": "M21",
  "domain": "money",
  "title": "Calculate your own borrowing room: 5× gross income minus pilot debt",
  "why": "Shows when property becomes possible",
  "when": "Once, and after big changes",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "M22",
  "domain": "money",
  "title": "Ask your bank what a mortgage pre-approval would look like today and after pilot school",
  "why": "Real numbers, not guesses",
  "when": "Once, in 2027",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2027-01-15",
   "to": "2027-12-31"
  }
 },
 {
  "id": "M23",
  "domain": "money",
  "title": "Read about Lånekassen repayment and interest (4.62% floating in 2026)",
  "why": "Know the debt you're taking on",
  "when": "Before signing the school contract",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "pilotStart",
   "from": -120,
   "to": -75
  }
 },
 {
  "id": "R1",
  "domain": "money",
  "title": "Property: pick 2 Polish cities to watch (e.g. Wrocław 5.9%, Gdańsk 5.7% gross yield)",
  "why": "Yields differ by city; Kraków is lowest",
  "when": "This quarter",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "R2",
  "domain": "money",
  "title": "Track price per m² and rents in those cities quarterly (Otodom)",
  "why": "Polish prices fell slightly in Q4 2025, then held flat",
  "when": "Quarterly",
  "effort": "S",
  "trigger": {
   "type": "quarterly",
   "at": "start"
  },
  "requires": [
   "R1"
  ]
 },
 {
  "id": "R3",
  "domain": "money",
  "title": "Learn Poland's buying costs: 2% PCC on resale, notary fees, agency",
  "why": "Adds several percent to the price",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R1"
  ]
 },
 {
  "id": "R4",
  "domain": "money",
  "title": "Learn Polish rental tax: 8.5% of gross rent (12.5% above PLN 100k), no deductions",
  "why": "Part of the real return",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R1"
  ]
 },
 {
  "id": "R5",
  "domain": "money",
  "title": "Learn how Norway taxes it: 22% on net rent, with credit for Polish tax (choose \"credit deduction\" in the skattemelding)",
  "why": "Norway's tax usually decides the real cost",
  "when": "Once",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R4"
  ]
 },
 {
  "id": "R6",
  "domain": "money",
  "title": "Note the new short-term rental register in Poland (from May 2026) and local bans from 2028",
  "why": "Fines up to ~EUR 11,500",
  "when": "Before planning Airbnb",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R1"
  ]
 },
 {
  "id": "R7",
  "domain": "money",
  "title": "Ask 2 Polish banks whether they lend in NOK to Norway residents",
  "why": "Loans must match your income currency",
  "when": "Once, in 2027",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2027-01-15",
   "to": "2027-12-31"
  }
 },
 {
  "id": "R8",
  "domain": "money",
  "title": "Build a Poland property spreadsheet: price, costs, rent, both taxes, net yield",
  "why": "Know your real return before you visit",
  "when": "After R3–R5",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R3",
   "R5"
  ]
 },
 {
  "id": "R9",
  "domain": "money",
  "title": "Visit one target city and see 5 apartments with family",
  "why": "Family and language are your edge",
  "when": "Next trip to Poland",
  "effort": "L",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R8"
  ]
 },
 {
  "id": "R10",
  "domain": "money",
  "title": "Find a Polish property lawyer through family contacts",
  "why": "Checks title and land register (księga wieczysta)",
  "when": "Before any offer",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R9"
  ]
 },
 {
  "id": "R11",
  "domain": "money",
  "title": "Set a property savings target: deposit 20–40% + costs",
  "why": "Foreign buyers usually need 20–40% down",
  "when": "After R8",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R8"
  ]
 },
 {
  "id": "R12",
  "domain": "money",
  "title": "Southern Europe: write down the dream (country, town, use, budget)",
  "why": "A clear target is easier to save for",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "R13",
  "domain": "money",
  "title": "Spain: learn the yearly non-resident tax even when the house is empty (19% on 1.1–2% of cadastral value)",
  "why": "A hidden yearly cost",
  "when": "Before shortlisting Spain",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R12"
  ]
 },
 {
  "id": "R14",
  "domain": "money",
  "title": "Compare Spain, Portugal and Croatia on price trend, yearly taxes and flights from Stavanger",
  "why": "Prices are rising fast (Spain +13%, Portugal +18%)",
  "when": "Once a year",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 1,
   "day": 20
  }
 },
 {
  "id": "R15",
  "domain": "money",
  "title": "Check whether DNB would lend against a property in Spain",
  "why": "DNB is one of few banks that lend against Spanish property",
  "when": "When saving is on track",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "R11",
   "days": 180
  }
 },
 {
  "id": "R16",
  "domain": "money",
  "title": "Watch NOK/EUR and NOK/PLN monthly; buy currency in tranches",
  "why": "Currency risk can move prices 10%",
  "when": "When saving for a foreign deposit",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 5
  },
  "requires": [
   "R11"
  ]
 },
 {
  "id": "R17",
  "domain": "money",
  "title": "Write down 5 classic mistakes of first-time foreign buyers and how you'll avoid them",
  "why": "Buying blind, no lawyer, ignoring taxes",
  "when": "Before any offer",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "R9"
  ]
 },
 {
  "id": "P1",
  "domain": "physique",
  "title": "Choose a 5-day split: Upper / Lower / Push / Pull / Legs",
  "why": "Hits each muscle twice a week, which beats once",
  "when": "Now, once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "P2",
  "domain": "physique",
  "title": "Write the programme into Maverick: exercises, sets, rep ranges (6–12)",
  "why": "A written plan replaces deciding at the gym",
  "when": "After P1",
  "effort": "M",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "P1"
  ]
 },
 {
  "id": "P3",
  "domain": "physique",
  "title": "Log every set (weight × reps) and add reps before adding weight",
  "why": "Progressive overload; recorded tracking improves results",
  "when": "Every session",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "P2"
  ]
 },
 {
  "id": "P4",
  "domain": "physique",
  "title": "Start at about 10 sets per muscle per week; add 2 sets to shoulders, back and arms after 4 weeks",
  "why": "More sets bring more growth; V-taper muscles first",
  "when": "Week 1, then week 5",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "P2",
   "days": 28
  }
 },
 {
  "id": "P5",
  "domain": "physique",
  "title": "Easier deload week: half the sets",
  "why": "Recovery keeps progress going",
  "when": "Every 6–8 weeks, or a heavy roster week",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 49
  },
  "requires": [
   "P2"
  ]
 },
 {
  "id": "P6",
  "domain": "physique",
  "title": "Take photos and a waist measurement under the same light",
  "why": "The scale alone misleads during recomposition",
  "when": "First Sunday of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "first-sun"
  }
 },
 {
  "id": "P7",
  "domain": "physique",
  "title": "Weigh in 3 mornings a week; watch the weekly average",
  "why": "Daily weight swings hide the trend",
  "when": "Mon/Wed/Fri",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P8",
  "domain": "physique",
  "title": "Decide bulk, cut or recomposition based on the photos and waist",
  "why": "Lean: ~200–300 kcal surplus; carrying fat: ~300–500 kcal deficit (rules of thumb)",
  "when": "After the first month of data",
  "effort": "S",
  "trigger": {
   "type": "after",
   "id": "P6",
   "days": 30
  }
 },
 {
  "id": "P9",
  "domain": "physique",
  "title": "Work out your protein target: body weight × 1.6–2.2 g",
  "why": "At 75 kg that's 120–165 g a day",
  "when": "Once; update when weight changes 3 kg",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "P10",
  "domain": "physique",
  "title": "Plan 4 protein meals of 30–40 g a day",
  "why": "Spreads protein through the day",
  "when": "Weekly meal plan",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  },
  "requires": [
   "P9"
  ]
 },
 {
  "id": "P11",
  "domain": "physique",
  "title": "Pack a protein-forward lunch and snack the night before a shift",
  "why": "Removes canteen and kiosk temptation",
  "when": "Evening before a shift",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P12",
  "domain": "physique",
  "title": "Batch-cook two protein meals on the day off",
  "why": "Shift weeks run on prepared food",
  "when": "Day off",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 6
  }
 },
 {
  "id": "P13",
  "domain": "physique",
  "title": "Take creatine monohydrate 3–5 g daily, next to the morning coffee",
  "why": "Best-supported, safe supplement for lean mass",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P14",
  "domain": "physique",
  "title": "Zone 2 cardio 30–45 min (talking pace), 2–3 times a week",
  "why": "Heart health without blunting muscle gain",
  "when": "Non-lifting days, or 3+ h apart from lifting",
  "effort": "M",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P15",
  "domain": "physique",
  "title": "Reach 150–300 active minutes a week in total (walks count)",
  "why": "Norwegian health guideline",
  "when": "Weekly check",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "P16",
  "domain": "physique",
  "title": "Daily walk of 30 min; take the dogs",
  "why": "Steps, sleep pressure and a happy Luna and Grace",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P17",
  "domain": "physique",
  "title": "Temptation bundle: a favourite podcast or series only while training",
  "why": "Raised gym visits 51% at first; the effect fades, so rotate",
  "when": "Each session; rotate monthly",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P18",
  "domain": "physique",
  "title": "If-then plan for shift days: \"If I finish an early shift, then I nap 20 min and train at 15:00\"",
  "why": "If-then plans have the strongest evidence for follow-through",
  "when": "Each new roster",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 25
  }
 },
 {
  "id": "P19",
  "domain": "physique",
  "title": "Pack the gym bag the night before a training day",
  "why": "Environment design: no decision in the morning",
  "when": "Evening before",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P20",
  "domain": "physique",
  "title": "Set a fixed bedtime for early shifts: lights out ~20:30–21:00 for a 04:00 wake-up",
  "why": "7+ hours of sleep",
  "when": "Each early shift",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P21",
  "domain": "physique",
  "title": "Phone off and dim lights 60 min before bed",
  "why": "Also cuts evening scrolling",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P22",
  "domain": "physique",
  "title": "Last coffee before ~12:00–13:00 on early-shift days",
  "why": "Caffeine costs ~45 min of sleep; allow ~9 h before bed",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P23",
  "domain": "physique",
  "title": "No pre-workout after late morning",
  "why": "~200 mg caffeine needs ~13 h to clear",
  "when": "Training days",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P24",
  "domain": "physique",
  "title": "Nap 20–30 min after an early shift, never after ~16:00",
  "why": "Short naps restore without grogginess",
  "when": "Post-shift afternoons",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P25",
  "domain": "physique",
  "title": "Bright light first thing: daylight lamp or bright room light (Nov–Feb)",
  "why": "Light in the morning sets the body clock",
  "when": "Early mornings in winter",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 11,
   "day": 1
  }
 },
 {
  "id": "P26",
  "domain": "physique",
  "title": "Make the bedroom dark and quiet: blackout blind, eye mask, earplugs",
  "why": "Early bedtimes clash with light evenings",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "P27",
  "domain": "physique",
  "title": "Weekly sleep score: average hours from the Health log",
  "why": "What gets measured improves",
  "when": "Sunday review",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "P28",
  "domain": "physique",
  "title": "Log energy (1–5) each morning",
  "why": "Links sleep and training to how you feel",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P29",
  "domain": "physique",
  "title": "Talk to a GP if you're sleepy despite 7+ hours, or snore",
  "why": "Could be shift-work disorder or apnoea; not something to guess",
  "when": "3 weeks of energy ≤ 2",
  "effort": "S",
  "trigger": {
   "type": "condition",
   "check": "low_energy"
  }
 },
 {
  "id": "P30",
  "domain": "physique",
  "title": "Retest your main lifts (e.g. bench, squat, pull-ups)",
  "why": "Shows progress beyond the mirror",
  "when": "Every 8 weeks",
  "effort": "M",
  "trigger": {
   "type": "every",
   "days": 56
  },
  "requires": [
   "P2"
  ]
 },
 {
  "id": "P31",
  "domain": "physique",
  "title": "Set a 2027 physique target in numbers (waist, weight, key lifts)",
  "why": "A measurable goal beats \"look athletic\"",
  "when": "Once, before New Year",
  "effort": "S",
  "trigger": {
   "type": "window",
   "from": "2026-11-15",
   "to": "2026-12-31"
  }
 },
 {
  "id": "P32",
  "domain": "physique",
  "title": "Mobility 10 min after lower-body days",
  "why": "Fewer niggles, longer training career",
  "when": "Leg days",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P33",
  "domain": "physique",
  "title": "Check protein, fruit and vegetables in the week's shopping",
  "why": "Nutrition is decided in the shop",
  "when": "Before shopping",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P34",
  "domain": "physique",
  "title": "Drink 0.5 l water on waking and carry a bottle on shift",
  "why": "Simple energy and focus win",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "P35",
  "domain": "physique",
  "title": "Book a session with a qualified trainer to check your technique",
  "why": "Prevents injuries that cost months",
  "when": "Once, then yearly",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "P36",
  "domain": "physique",
  "title": "Alcohol-free weeks during exam and heavy training blocks",
  "why": "Sleep and recovery both suffer from alcohol",
  "when": "Before a block",
  "effort": "S",
  "trigger": {
   "type": "anchor",
   "anchor": "exam",
   "from": -16,
   "to": -10
  }
 },
 {
  "id": "D1",
  "domain": "discipline",
  "title": "Set Instagram and Snapchat limits to 10 min each per day (Screen Time)",
  "why": "A 3-week trial of this cut loneliness and low mood",
  "when": "Now, once",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "priority": 1
 },
 {
  "id": "D2",
  "domain": "discipline",
  "title": "Move social apps off the home screen; log out of Instagram on weekdays",
  "why": "Friction beats willpower",
  "when": "Now, once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "D3",
  "domain": "discipline",
  "title": "Phone charges outside the bedroom",
  "why": "Protects sleep and the first hour of the day",
  "when": "Nightly",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D4",
  "domain": "discipline",
  "title": "Write 3 if-then plans for the week, tied to your shifts",
  "why": "Explicit if-then plans work best, and better when rehearsed",
  "when": "Sunday review",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "D5",
  "domain": "discipline",
  "title": "First 25 minutes of the day off work: the hardest task, before opening any app",
  "why": "Starting is the hard part of procrastination",
  "when": "Days off",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D6",
  "domain": "discipline",
  "title": "When stuck: write the first 5-minute step of the task and do only that",
  "why": "Breaking tasks down is part of the best-supported programmes",
  "when": "Task overdue 2+ days",
  "effort": "S",
  "trigger": {
   "type": "condition",
   "check": "overdue_2d"
  }
 },
 {
  "id": "D7",
  "domain": "discipline",
  "title": "Focus session of 25 or 50 minutes with Maverick's timer",
  "why": "Gives procrastination a container",
  "when": "Daily target: 1 on shift days, 3 on days off",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D8",
  "domain": "discipline",
  "title": "Weekly review (20 min): score the week, one win, one obstacle, next week's plans",
  "why": "Built from proven parts: tracking, re-planning, self-forgiveness",
  "when": "Sunday 18:00",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "D9",
  "domain": "discipline",
  "title": "Send your weekly scorecard to an accountability partner",
  "why": "Shared tracking has bigger effects than private tracking",
  "when": "After the weekly review",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  },
  "requires": [
   "D10"
  ]
 },
 {
  "id": "D10",
  "domain": "discipline",
  "title": "Choose an accountability partner (friend, colleague or Veronika)",
  "why": "Needed for D9",
  "when": "Once",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "D11",
  "domain": "discipline",
  "title": "After a missed day, say \"missed it, restart next shift\" and plan the next attempt",
  "why": "Self-forgiveness reduced later procrastination",
  "when": "Streak broken",
  "effort": "S",
  "trigger": {
   "type": "condition",
   "check": "no_activity_2d"
  }
 },
 {
  "id": "D12",
  "domain": "discipline",
  "title": "One new habit per month, checked at day 66",
  "why": "Realistic time to automaticity",
  "when": "1st of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 1
  }
 },
 {
  "id": "D13",
  "domain": "discipline",
  "title": "Define the 3 \"non-negotiables\" for every day (e.g. train, protein, 25 min of focus)",
  "why": "Discipline is a few rules kept, not many",
  "when": "Once, review monthly",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "D14",
  "domain": "discipline",
  "title": "Read 10 pages a day (business, investing, aviation)",
  "why": "Compounding knowledge",
  "when": "Evening, before phone-off",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D15",
  "domain": "discipline",
  "title": "Monthly book pick from a list Maverick keeps per goal",
  "why": "Removes choosing as a barrier",
  "when": "Last day of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "last"
  }
 },
 {
  "id": "D16",
  "domain": "discipline",
  "title": "Summarise each finished book in 5 lines into the Memory Vault",
  "why": "Saying it in your own words is retrieval practice",
  "when": "Book finished",
  "effort": "S",
  "trigger": {
   "type": "habit"
  },
  "requires": [
   "D14"
  ]
 },
 {
  "id": "D17",
  "domain": "discipline",
  "title": "Learn one new AI tool feature a week and use it on a real Zorza task",
  "why": "Your agency edge",
  "when": "Weekly",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 3
  }
 },
 {
  "id": "D18",
  "domain": "discipline",
  "title": "Polish: read one Polish business article a week",
  "why": "Keeps your professional Polish strong for clients and property",
  "when": "Weekly",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 5
  }
 },
 {
  "id": "D19",
  "domain": "discipline",
  "title": "German: 15 min a day of Duolingo/Babbel, or one German podcast a week",
  "why": "Third client language; useful in aviation",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D20",
  "domain": "discipline",
  "title": "Norwegian/English: write one LinkedIn post a week about marketing or aviation",
  "why": "Writing practice and visibility at once",
  "when": "Weekly",
  "effort": "M",
  "trigger": {
   "type": "weekly",
   "weekday": 2
  },
  "requires": [
   "Z12"
  ]
 },
 {
  "id": "D21",
  "domain": "discipline",
  "title": "90-day goal sprint: pick 1 outcome per 2027 goal",
  "why": "Short horizons beat yearly resolutions",
  "when": "1 Jan, 1 Apr, 1 Jul, 1 Oct",
  "effort": "M",
  "trigger": {
   "type": "quarterly",
   "at": "start"
  }
 },
 {
  "id": "D22",
  "domain": "discipline",
  "title": "Monthly \"stop doing\" list: one thing to drop",
  "why": "Focus is saying no",
  "when": "Monthly review",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "last"
  }
 },
 {
  "id": "D23",
  "domain": "discipline",
  "title": "Mental rehearsal: imagine the obstacle and your if-then response",
  "why": "Rehearsing plans makes them work better",
  "when": "Before a hard week",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D24",
  "domain": "discipline",
  "title": "Batch admin (email, bills, forms) into one 30-minute block",
  "why": "Stops small tasks leaking into the day",
  "when": "Weekly, day off",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 6
  }
 },
 {
  "id": "D25",
  "domain": "discipline",
  "title": "Two-minute rule: anything under 2 minutes, do now",
  "why": "Clears the small backlog",
  "when": "When it comes up",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D26",
  "domain": "discipline",
  "title": "Cold-shower or other morning anchor after waking (optional)",
  "why": "A fixed cue to start the routine",
  "when": "Morning",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D27",
  "domain": "discipline",
  "title": "Screen-time check: compare this week's social minutes with last week's",
  "why": "Recorded tracking",
  "when": "Sunday review",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "D28",
  "domain": "discipline",
  "title": "Temptation bundle: allowed scrolling only after the focus session",
  "why": "Turns a distraction into a reward",
  "when": "Daily",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "D29",
  "domain": "discipline",
  "title": "Monthly reflection: \"What would 2027 Oliver thank me for this month?\"",
  "why": "Links daily effort to the 2027 goals",
  "when": "Last Sunday of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "last-sun"
  }
 },
 {
  "id": "D30",
  "domain": "discipline",
  "title": "Learn the 10 Excel/Sheets skills agencies use (pivot tables, lookups)",
  "why": "Reporting is half of client work",
  "when": "Next free weekend",
  "effort": "L",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "D31",
  "domain": "discipline",
  "title": "Finish a free course on Google Ads or Meta ads basics",
  "why": "Paid ads are a core agency service",
  "when": "Before the first Zorza client",
  "effort": "L",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z10"
  ]
 },
 {
  "id": "D32",
  "domain": "discipline",
  "title": "Practise a 60-second pitch for Zorza out loud",
  "why": "Confidence in conversations",
  "when": "Weekly until it's natural",
  "effort": "S",
  "trigger": {
   "type": "now"
  },
  "requires": [
   "Z11"
  ]
 },
 {
  "id": "D33",
  "domain": "discipline",
  "title": "Book a quiet library or café block for deep work",
  "why": "A change of place helps start",
  "when": "Days off with no plan",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "D34",
  "domain": "discipline",
  "title": "Quarterly digital declutter: unfollow accounts that don't serve your goals",
  "why": "The feed shapes the mind",
  "when": "Quarterly",
  "effort": "S",
  "trigger": {
   "type": "quarterly",
   "at": "start"
  }
 },
 {
  "id": "F1",
  "domain": "life",
  "title": "Plan Dad's birthday (21 Jan): gift idea, call or visit",
  "why": "Relationships don't run on autopilot",
  "when": "7 Jan",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 1,
   "day": 7
  }
 },
 {
  "id": "F2",
  "domain": "life",
  "title": "Order Dad's gift so it arrives on time",
  "why": "Shipping to/from Poland takes days",
  "when": "12 Jan",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 1,
   "day": 12
  }
 },
 {
  "id": "F3",
  "domain": "life",
  "title": "Plan Mom's birthday (3 Mar)",
  "why": "Same",
  "when": "17 Feb",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 2,
   "day": 17
  }
 },
 {
  "id": "F4",
  "domain": "life",
  "title": "Order Mom's gift",
  "why": "Same",
  "when": "22 Feb",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 2,
   "day": 22
  }
 },
 {
  "id": "F5",
  "domain": "life",
  "title": "Plan Veronika's birthday (8 Apr)",
  "why": "Same",
  "when": "25 Mar",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 25
  }
 },
 {
  "id": "F6",
  "domain": "life",
  "title": "Order Veronika's gift",
  "why": "Same",
  "when": "29 Mar",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 29
  }
 },
 {
  "id": "F7",
  "domain": "life",
  "title": "Call a parent you haven't spoken to in 10+ days",
  "why": "Small, regular contact beats big gestures",
  "when": "No call logged for 10 days",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 10
  }
 },
 {
  "id": "F8",
  "domain": "life",
  "title": "Book the next visit home or a family weekend",
  "why": "Something to look forward to",
  "when": "No family plan in the next 60 days",
  "effort": "M",
  "trigger": {
   "type": "every",
   "days": 60
  }
 },
 {
  "id": "F9",
  "domain": "life",
  "title": "Speak only Polish on one family call this week",
  "why": "Keeps the language strong for Poland plans",
  "when": "Weekly, Sunday",
  "effort": "S",
  "trigger": {
   "type": "weekly",
   "weekday": 0
  }
 },
 {
  "id": "F10",
  "domain": "life",
  "title": "Send a voice note or photo to Veronika",
  "why": "Low effort, high warmth",
  "when": "Every 2 weeks",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 14
  }
 },
 {
  "id": "F11",
  "domain": "life",
  "title": "Write down 3 things your parents taught you; tell one of them",
  "why": "Gratitude, said out loud",
  "when": "Once a quarter",
  "effort": "S",
  "trigger": {
   "type": "quarterly",
   "at": "start"
  }
 },
 {
  "id": "F12",
  "domain": "life",
  "title": "Plan one evening with friends with no phones at the table",
  "why": "Social health counters shift-work isolation",
  "when": "No social plan in 14 days",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 14
  }
 },
 {
  "id": "F13",
  "domain": "life",
  "title": "Reconnect with one old friend or colleague",
  "why": "Your network becomes Zorza's first clients",
  "when": "Monthly",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": 10
  }
 },
 {
  "id": "F14",
  "domain": "life",
  "title": "Luna and Grace: book the yearly vet check and vaccinations",
  "why": "Prevention costs less than treatment",
  "when": "30 days before the due date (log it once)",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "F15",
  "domain": "life",
  "title": "Order dog food and flea/tick protection before it runs out",
  "why": "No last-minute runs",
  "when": "Every 6 weeks, or before March for ticks",
  "effort": "S",
  "trigger": {
   "type": "every",
   "days": 42
  }
 },
 {
  "id": "F16",
  "domain": "life",
  "title": "Long walk with Luna and Grace instead of a scroll break",
  "why": "Counts as zone 2 cardio; good for all three of you",
  "when": "Evening, when no workout is logged that day",
  "effort": "S",
  "trigger": {
   "type": "habit"
  }
 },
 {
  "id": "F17",
  "domain": "life",
  "title": "Arrange dog care for shift weeks and trips",
  "why": "Avoid stressful scrambles",
  "when": "When a trip or long shift block appears in the calendar",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "F18",
  "domain": "life",
  "title": "Check dog insurance cover and price",
  "why": "Often a quick saving",
  "when": "Once a year",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 10,
   "day": 1
  }
 },
 {
  "id": "F19",
  "domain": "life",
  "title": "Review your phone, internet and electricity agreements",
  "why": "Norwegian price comparisons save hundreds per year",
  "when": "Every 6 months",
  "effort": "M",
  "trigger": {
   "type": "every",
   "days": 182
  }
 },
 {
  "id": "F20",
  "domain": "life",
  "title": "Cancel subscriptions you didn't use last month",
  "why": "Money back every month",
  "when": "Finance shows 3+ recurring subscriptions",
  "effort": "S",
  "trigger": {
   "type": "condition",
   "check": "subscriptions"
  }
 },
 {
  "id": "F21",
  "domain": "life",
  "title": "Back up the phone and Maverick (Settings, Export)",
  "why": "Your data is your memory",
  "when": "First Sunday of the month",
  "effort": "S",
  "trigger": {
   "type": "monthly",
   "day": "first-sun"
  }
 },
 {
  "id": "F22",
  "domain": "life",
  "title": "Renew the passport before it has under 12 months left",
  "why": "Flight school and travel need it",
  "when": "15 months before expiry",
  "effort": "M",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "F23",
  "domain": "life",
  "title": "Check your driving licence and EU health insurance card (EHIC) are valid",
  "why": "Needed when travelling to Poland or southern Europe",
  "when": "Once a year",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 5,
   "day": 1
  }
 },
 {
  "id": "F24",
  "domain": "life",
  "title": "Fill in your tax return (skattemelding)",
  "why": "Deductions are only yours if you claim them",
  "when": "When it opens in March (see Part 3)",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 3,
   "day": 12
  }
 },
 {
  "id": "F25",
  "domain": "life",
  "title": "Update your will-style note: who gets access to what (passwords, accounts, dogs)",
  "why": "Responsible, takes an hour",
  "when": "Once a year",
  "effort": "M",
  "trigger": {
   "type": "yearly",
   "month": 12,
   "day": 1
  }
 },
 {
  "id": "F26",
  "domain": "life",
  "title": "Deep-clean and declutter one room",
  "why": "Environment design helps discipline",
  "when": "Monthly, a free weekend afternoon",
  "effort": "M",
  "trigger": {
   "type": "monthly",
   "day": 20
  }
 },
 {
  "id": "F27",
  "domain": "life",
  "title": "Plan next month's shifts, workouts and study blocks on one page",
  "why": "One planning session beats daily guessing",
  "when": "Last Sunday of the month",
  "effort": "M",
  "trigger": {
   "type": "monthly",
   "day": "last-sun"
  }
 },
 {
  "id": "F28",
  "domain": "life",
  "title": "Book a dentist check",
  "why": "Easy to postpone, costly to skip",
  "when": "12 months after the last visit",
  "effort": "S",
  "trigger": {
   "type": "now"
  }
 },
 {
  "id": "F29",
  "domain": "life",
  "title": "Book a GP check-up and blood test (vitamin D, iron, lipids)",
  "why": "Baseline for training and the class 1 medical",
  "when": "Once a year, in autumn",
  "effort": "S",
  "trigger": {
   "type": "yearly",
   "month": 10,
   "day": 1
  }
 },
 {
  "id": "F30",
  "domain": "life",
  "title": "Plan one real holiday with no study or work",
  "why": "Rest is part of performance",
  "when": "Every 6 months",
  "effort": "M",
  "trigger": {
   "type": "every",
   "days": 182
  }
 }
];
