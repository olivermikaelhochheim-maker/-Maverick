"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PREFS, canListen, canSpeak, getVoices, loadPrefs, savePrefs, speakOnce, unlockSpeech, type VoicePrefs } from "@/lib/voice";
import { pickBritishMale } from "@/lib/speech-text";

const LANGS = [
  { id: "en-GB", label: "English (UK)" },
  { id: "en-US", label: "English (US)" },
  { id: "nb-NO", label: "Norsk" },
  { id: "pl-PL", label: "Polski" },
  { id: "de-DE", label: "Deutsch" },
];

const PREVIEW = "Good evening, Oliver. Everything is running smoothly. Shall we look at what matters most tomorrow?";

/** Voice settings for this device. Stored on the device, because each device has different voices. */
export function VoicePanel() {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_PREFS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [support, setSupport] = useState<{ speak: boolean; listen: boolean } | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
    setSupport({ speak: canSpeak(), listen: canListen() });
    void getVoices().then(setVoices);
  }, []);

  const update = (patch: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  if (!support) return <p className="muted small">Checking this device…</p>;
  if (!support.speak) return <p className="muted small">This browser can&apos;t speak. Try Safari on your Mac or iPhone.</p>;

  const english = voices.filter((v) => /^en/i.test(v.lang));
  const sorted = [...english].sort((a, b) => Number(/GB/i.test(b.lang)) - Number(/GB/i.test(a.lang)) || a.name.localeCompare(b.name));
  const auto = pickBritishMale(voices);
  const current = prefs.voiceURI ?? auto?.voiceURI ?? "";

  return (
    <div>
      <label className="check field">
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Use voice on this device
      </label>
      {!support.listen && prefs.enabled && (
        <p className="small" style={{ color: "var(--warn)" }}>This browser can speak but can&apos;t listen. Use Safari (Mac/iPhone) or Chrome to talk to Maverick.</p>
      )}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="v-voice">Maverick&apos;s voice</label>
          <select id="v-voice" value={current} onChange={(e) => update({ voiceURI: e.target.value || null })}>
            {sorted.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.voiceURI === auto?.voiceURI ? " – recommended" : ""}
              </option>
            ))}
            {sorted.length === 0 && <option value="">Default voice</option>}
          </select>
          <p className="hint">British male voices are listed first. See below for how to get the high-quality versions.</p>
        </div>
        <div className="field">
          <label htmlFor="v-lang">I speak in</label>
          <select id="v-lang" value={prefs.lang} onChange={(e) => update({ lang: e.target.value })}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <p className="hint">Maverick answers in the language you use.</p>
        </div>
        <div className="field">
          <label htmlFor="v-rate">Speed: {prefs.rate.toFixed(2)}×</label>
          <input id="v-rate" type="range" min={0.7} max={1.4} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="v-pitch">Pitch: {prefs.pitch.toFixed(2)}</label>
          <input id="v-pitch" type="range" min={0.7} max={1.3} step={0.05} value={prefs.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="v-speak">Read replies aloud</label>
          <select id="v-speak" value={prefs.speak} onChange={(e) => update({ speak: e.target.value as VoicePrefs["speak"] })}>
            <option value="voice">When I spoke to Maverick</option>
            <option value="always">Always</option>
            <option value="never">Never</option>
          </select>
        </div>
        <label className="check field" style={{ alignSelf: "end" }}>
          <input type="checkbox" checked={prefs.autoSend} onChange={(e) => update({ autoSend: e.target.checked })} />
          Send automatically when I stop talking
        </label>
      </div>

      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          unlockSpeech();
          speechSynthesis.cancel();
          await speakOnce(PREVIEW, { ...prefs, voiceURI: current || null });
        }}
      >
        ▶ Preview voice
      </button>

      <details className="small muted" style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer" }}>Get a better British voice (free, 2 minutes)</summary>
        <p style={{ marginTop: "0.5rem" }}>
          <strong>Mac:</strong> System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → English (United Kingdom) → download <em>Daniel (Enhanced)</em> or <em>Arthur (Premium)</em> if listed. Then reload Maverick and pick it above.
        </p>
        <p>
          <strong>iPhone:</strong> Settings → Accessibility → Spoken Content → Voices → English → English (UK) → download <em>Daniel (Enhanced)</em> or <em>Arthur (Enhanced)</em>.
        </p>
      </details>
      <details className="small muted" style={{ marginTop: "0.4rem" }}>
        <summary style={{ cursor: "pointer" }}>Privacy</summary>
        <p style={{ marginTop: "0.5rem" }}>
          The microphone is only on while the red &quot;Listening…&quot; bar shows, after you tap the mic. Nothing listens in the background. Your speech is turned into text by your browser&apos;s provider
          (Apple for Safari, Google for Chrome); only the text reaches Maverick. Speaking uses your device&apos;s built-in voices, so replies aren&apos;t sent anywhere extra to be spoken.
        </p>
      </details>
    </div>
  );
}
