"use client";

import { SentenceChunker, pickBritishMale, toSpeakable } from "./speech-text";

/**
 * Voice on this device, using the browser's built-in speech engines:
 *  - speaking:  speechSynthesis (on Mac/iPhone: Apple's voices, e.g. "Daniel", British male)
 *  - listening: SpeechRecognition (Safari sends audio to Apple, Chrome to Google, for transcription)
 * Settings are per device because each device has different voices installed.
 * Listening only ever starts when Oliver taps the microphone; nothing listens in the background.
 */

export interface VoicePrefs {
  enabled: boolean;
  voiceURI: string | null;
  rate: number;
  pitch: number;
  /** When to read replies aloud */
  speak: "voice" | "always" | "never";
  /** Send automatically when Oliver stops talking */
  autoSend: boolean;
  /** Language Oliver speaks in */
  lang: string;
}

export const DEFAULT_PREFS: VoicePrefs = { enabled: false, voiceURI: null, rate: 1, pitch: 1, speak: "voice", autoSend: true, lang: "en-GB" };
const KEY = "mvk_voice";

export function loadPrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: preference just won't persist */
  }
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;

/** Voices load asynchronously in some browsers. */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export async function resolveVoice(prefs: VoicePrefs): Promise<SpeechSynthesisVoice | undefined> {
  const voices = await getVoices();
  return voices.find((v) => v.voiceURI === prefs.voiceURI) ?? pickBritishMale(voices);
}

/**
 * Speaks a reply as it streams in, sentence by sentence.
 * cancel() stops immediately (barge-in: Oliver taps the mic, presses Stop, or sends again).
 */
export class Speaker {
  private chunker = new SentenceChunker();
  private queued = 0;
  private cancelled = false;
  private started = false;
  onStart?: () => void;
  onIdle?: () => void;

  constructor(
    private readonly voice: SpeechSynthesisVoice | undefined,
    private readonly prefs: VoicePrefs,
  ) {}

  push(text: string) {
    for (const s of this.chunker.push(text)) this.say(s);
  }

  finish() {
    for (const s of this.chunker.flush()) this.say(s);
    if (this.queued === 0) this.onIdle?.();
  }

  cancel() {
    this.cancelled = true;
    if (canSpeak()) speechSynthesis.cancel();
    this.queued = 0;
    this.onIdle?.();
  }

  private say(text: string) {
    if (this.cancelled || !canSpeak()) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? "en-GB";
    u.rate = this.prefs.rate;
    u.pitch = this.prefs.pitch;
    u.onstart = () => {
      if (!this.started) {
        this.started = true;
        this.onStart?.();
      }
    };
    const done = () => {
      this.queued = Math.max(0, this.queued - 1);
      if (this.queued === 0 && !this.cancelled) this.onIdle?.();
    };
    u.onend = done;
    u.onerror = done;
    this.queued++;
    speechSynthesis.speak(u);
  }
}

/** Speak a fixed piece of text (voice preview in Settings). */
export async function speakOnce(text: string, prefs: VoicePrefs) {
  const s = new Speaker(await resolveVoice(prefs), prefs);
  s.push(toSpeakable(text));
  s.finish();
  return s;
}

/**
 * iOS only allows speech that starts from a tap. Speaking an empty utterance
 * inside the tap handler unlocks speech for the rest of the page's life.
 */
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !canSpeak()) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

/**
 * One push-to-talk session. Starts on tap, ends on silence or a second tap.
 * Reports interim text as Oliver speaks, then the final transcript.
 */
export class Listener {
  private rec: SpeechRecognitionLike | null = null;
  private finalText = "";
  private interim = "";

  constructor(
    private readonly lang: string,
    private readonly handlers: {
      onText: (text: string, final: boolean) => void;
      onEnd: (finalText: string) => void;
      onError: (message: string) => void;
    },
  ) {}

  start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return this.handlers.onError("This browser can't transcribe speech. Use Safari or Chrome.");
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = this.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) this.finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      this.interim = interim;
      this.handlers.onText((this.finalText + interim).trim(), false);
    };
    rec.onerror = (e) => {
      const msg: Record<string, string> = {
        "not-allowed": "Microphone access was blocked. Allow it for Maverick in the browser settings.",
        "service-not-allowed": "Speech recognition isn't allowed here. On iPhone, check Settings → Screen Time and Siri & Dictation.",
        "no-speech": "",
        aborted: "",
        network: "Speech recognition needs an internet connection.",
      };
      const text = msg[e.error] ?? `Speech recognition error: ${e.error}`;
      if (text) this.handlers.onError(text);
    };
    rec.onend = () => {
      const text = (this.finalText || this.interim).trim();
      this.rec = null;
      this.handlers.onEnd(text);
    };
    try {
      rec.start();
    } catch {
      this.handlers.onError("Couldn't start the microphone.");
    }
  }

  /** Stop listening and use what was heard. */
  stop() {
    this.rec?.stop();
  }

  /** Stop listening and discard. */
  cancel() {
    this.finalText = "";
    this.interim = "";
    this.rec?.abort();
  }
}
