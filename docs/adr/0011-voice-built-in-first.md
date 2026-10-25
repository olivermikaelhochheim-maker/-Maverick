# ADR 0011: Voice with the device's built-in speech engines first; premium voice later

Status: Accepted (2026-10-25)

## Decision
- **Listening:** the browser's SpeechRecognition (Safari → Apple, Chrome → Google). Push-to-talk only: listening starts on a tap, a red "Listening…" bar shows the whole time, and it stops on a second tap, a pause, or Cancel/Esc. No wake word, no background listening.
- **Speaking:** the browser's speechSynthesis with the device's voices. Default is a British male voice (Apple "Daniel"/"Arthur", Enhanced/Premium when installed; "Google UK English Male" in Chrome).
- **Streaming:** the reply is spoken sentence by sentence as it streams in (`SentenceChunker`), so speech starts after the first sentence, not the whole reply. Markdown, links, code and emoji are removed before speaking.
- **Barge-in:** tapping the mic, sending, Stop or Esc cancels speech immediately.
- **Spoken style:** messages sent by voice add an instruction for short, list-free, spoken-style replies.
- **Latency:** each spoken reply records the time from Oliver finishing speaking to Maverick's first spoken word ("spoke after 1.8s").
- Preferences are per device (localStorage), since each device has different voices.
- `Permissions-Policy` changes from `microphone=()` to `microphone=(self)`: Maverick's own pages only.

## Why built-in first
Free, no vendor account, works today on Mac and iPhone, and nothing extra leaves the device for speaking. The quality is decent (Enhanced/Premium Apple voices), though clearly synthetic next to premium neural voices.

## Next: premium voice (needs Oliver's choice)
Add a server-side TTS provider interface (`/api/tts`, streaming audio) with one vendor behind it, chosen after Oliver listens to samples. Typical monthly use (~20 spoken replies a day, ~400 characters each, about 240k characters) puts the options roughly at: Azure neural ~$4, OpenAI gpt-4o-mini-tts ~$4, ElevenLabs Flash ~$10–12, ElevenLabs Multilingual ~$24–41. These are third-party price estimates from October 2026 to verify. JARVIS's actual voice (a real actor) can't be cloned or imitated; we choose an original refined British voice.
