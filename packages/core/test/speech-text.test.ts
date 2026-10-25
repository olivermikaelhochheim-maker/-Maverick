import { describe, expect, it } from "vitest";
import { SentenceChunker, pickBritishMale, toSpeakable } from "../../../apps/web/lib/speech-text";

describe("speech text (browser voice helpers)", () => {
  it("strips markdown, links, code and emoji before speaking", () => {
    expect(toSpeakable("**Suggestion:** book the *medical* first. See [the CAA](https://caa.no/x) ✈️")).toBe("Suggestion: book the medical first. See the CAA");
    expect(toSpeakable("## Today\n- Call Nordlys\n2. Gym at `17:30`")).toBe("Today. Call Nordlys Gym at 17:30");
    expect(toSpeakable("Run this:\n```\nrm -rf /\n```\nDone.")).toBe("Run this: (code omitted) Done.");
    expect(toSpeakable("Visit https://example.com now")).toBe("Visit the link now");
  });

  it("emits complete sentences as text streams in, without splitting decimals or abbreviations", () => {
    const c = new SentenceChunker();
    expect(c.push("Good morning, Oliver. You have 3.5 hours of deep")).toEqual(["Good morning, Oliver."]);
    expect(c.push(" work, e.g. the proposal. Then the ")).toEqual(["You have 3.5 hours of deep work, e.g. the proposal."]);
    expect(c.push("gym!")).toEqual([]);
    expect(c.flush()).toEqual(["Then the gym!"]);
  });

  it("cleans emphasis that a sentence break cut in half", () => {
    const c = new SentenceChunker();
    const out = [...c.push("Done. _(Mock mode: no model yet. Add a key to talk.)_ "), ...c.flush()];
    expect(out).toEqual(["Done.", "(Mock mode: no model yet.", "Add a key to talk.)"]);
    expect(toSpeakable("keep snake_case words")).toBe("keep snake_case words");
  });

  it("splits list items and paragraphs into separate spoken chunks", () => {
    const c = new SentenceChunker();
    const out = c.push("Your priorities:\n\n1. Send the proposal.\n2. Book the medical.\n\n");
    expect(out).toEqual(["Your priorities:", "Send the proposal.", "Book the medical."]);
  });

  it("prefers a British male voice", () => {
    const voices = [
      { name: "Samantha", lang: "en-US", voiceURI: "s" },
      { name: "Serena", lang: "en-GB", voiceURI: "se" },
      { name: "Daniel", lang: "en-GB", voiceURI: "d" },
      { name: "Daniel (Enhanced)", lang: "en-GB", voiceURI: "de" },
    ];
    expect(pickBritishMale(voices)?.voiceURI).toBe("de");
    expect(pickBritishMale([{ name: "Google UK English Male", lang: "en-GB", voiceURI: "g" }, { name: "Google UK English Female", lang: "en-GB", voiceURI: "f" }])?.voiceURI).toBe("g");
    expect(pickBritishMale([{ name: "Samantha", lang: "en-US", voiceURI: "s" }])).toBeUndefined();
  });
});
