# The Atelier
**A private studio in every Rosewood suite.**
*Hospitality 2030 hackathon · Rosewood Sand Hill*

> A personalized in-suite studio where guests converse naturally about whatever is on their mind, with specialist agents that help execute tasks on the spot and an operator dashboard that lets staff see every moment land as a claimable plan and respond in real time.

— · —

## What this is

The Atelier is a voice-first thinking space prepared inside a Rosewood suite. The guest says *"Atelier,"* and the room answers — not as a chatbot, but as a host who dispatches the right **specialist** (The Strategist, The Convener, The Physician, The Steward…) and lets that specialist take the thread.

Rosewood already runs the world's finest human personalization machine — butlers, head concierges, sommeliers, GMs who remember. The constraint has always been human bandwidth. The Atelier extends that machine in two directions at once:

- **To the guest** — a private studio of specialists they can think aloud with at any hour, on the deal closing Friday, the proposal on the terrace, the eulogy they cannot put down.
- **To the staff** — an architectural aerial of the property where every guest's suite is color-coded by state, every plan in motion lives in a firehose, and every team member is briefed like the property's best concierge.

This repo is the **working prototype**: two browser windows, no backend, real Claude inference, real ElevenLabs voice, real-time staff↔guest seam over `BroadcastChannel`.

— · —

## How it works

### Two windows, one origin, live seam

- **`index.html`** — the **guest** experience. Voice-first. Three modes: *The Studio · Your Thinking · The Constellation.* No staff surface visible.
- **`operator.html`** — the **staff** experience. An **architectural aerial** of the property. Every guest's suite is color-coded by state (idle · gold · dashed-stroke for in-confidence). Tap any suite for the brief. A plans firehose runs alongside.

The two windows talk over `BroadcastChannel('atelier')`. When a plan is created in the studio, the operator pulses the affected suite within milliseconds. When the operator taps *"I will handle it,"* the originating specialist acknowledges back to the guest — spoken aloud — in the studio window.

> ⚠ `BroadcastChannel` only works across windows of the **same origin**. Open both via `./serve.sh` (or both from `file://` in the same folder), not one from each.

### What's actually running

| Capability | How |
|---|---|
| **Reply content** | Anthropic Messages API · `claude-sonnet-4-5-20250929` (falls back to `claude-3-5-sonnet-20241022`). Each specialist's system prompt is composed at call time from their persona + the property's local context + the property's Atelier persona + any thread brief. |
| **Voice (specialists)** | ElevenLabs streaming TTS. Six voices mapped to twelve specialists by register — Strategist ≠ Counsel; Sage at Phuket ≠ Maestro at the Carlyle. |
| **Voice (host)** | The Atelier itself has a distinct host voice — used for welcomes, navigation acknowledgments, and the cross-thread interrupt offer. |
| **Wake word + follow-up** | Web Speech API listens for *"Atelier"* / *"hey atelier"*. Once a specialist finishes speaking, the mic re-opens automatically (3.5s pause). 30s of silence drops back to ambient. Mic is muted while TTS is on the speakers so the recognizer doesn't pick up its own playback. |
| **Privacy** | Enforced at **two layers**: (1) rendering — private threads + their plans never reach the operator window; (2) prompt — specialists in private threads are *told* the conversation is held in confidence and instructed not to generate staff-actionable cards. |
| **Staff seam** | `BroadcastChannel` posts plans and actions both ways. The "I will handle it" tap injects a `[STAFF UPDATE]` system message back into the originating thread; Claude writes a brief, warm acknowledgment; ElevenLabs voices it. The seam between agent and human is invisible — by design. |
| **State** | In-memory + `localStorage` (API keys, preferences). No backend. No database. |

### Failure modes are designed in

- **Wake word misses** → push-to-talk via **Cmd+Space**.
- **Claude key fails / rate-limited** → polished canned replies keyed by specialist. Demo continues.
- **ElevenLabs quota exhausted** → browser SpeechSynthesis fallback. Demo continues.
- **Anything weird** → **Cmd+9** forces presenter safe mode (canned content end-to-end).

— · —

## Capabilities

What the studio actually does, distinct from "an LLM in a hotel app":

1. **Reads the guest before it recommends.** Every specialist gets the body state (HRV, sleep, readiness), the calendar, the timezone delta, and what brought the guest here. The Curator suggesting a restaurant for a fatigued guest with an early board call quietly steers closer + earlier — without explaining itself.
2. **Generates candidates, picks with conviction, commits.** No twenty questions. Two or three real candidates with reasoning, one recommendation, one structured `PLAN`.
3. **Plans are first-class objects.** A `PLAN` is not chat text — it's `{ kind, title, when, where, attendees, detail, status, activity }`. It surfaces inline, on the Thinking dashboard, and on the staff firehose. Updates propagate to all three.
4. **One-tap staff actions.** Every plan carries 1–3 suggested staff next-steps (*"Book the car · 20:00 from entrance · The Concierge"*). Staff tap; the originating specialist acknowledges back to the guest in their own voice.
5. **Privacy is operational, not performative.** *"Atelier, make this private"* changes what the staff console can see *and* what the specialist is willing to do. The staff are told *what they cannot see* — without seeing it.
6. **Cross-property memory.** Switching the property pill to Kona Village is not a re-login. The Atelier opens with: *"It is good to see you again — your last stay was at Sand Hill in March."*
7. **Cross-thread interrupt.** If you're in conversation with The Strategist and the operator handles a Convener action, the Atelier host voice offers: *"The Convener has word — Henri has the Madera private room arranged. Shall I bring you over?"* You say *"yes"* or *"later."*

— · —

## The specialists

This demo features 12 specialists across 3 properties. Three are **universal** — they appear at every property: The Concierge, The Sommelier, The Historian. The rest are **shaped by place** — each property's roster reflects what its guests come there for. Crillon does not staff a Strategist; Sand Hill does not staff a Mariner.

### Sand Hill — performance studio

*Deal-making, hard moments, recovery.*

- **The Strategist** — deals · structure · negotiation *(unique to Sand Hill)*
- **The Convener** — business hosting · gatherings *(unique to Sand Hill)*
- **The Physician** — wellness · recovery · longevity *(unique to Sand Hill)*
- **The Steward** — private counsel, threads default to private *(unique to Sand Hill)*
- The Concierge · The Sommelier · The Historian

### Crillon — palace studio

*Paris art world, ceremony, the city as the room.*

- **The Aesthete** — fine art · auctions · galleries *(unique to Crillon)*
- **The Curator** — experiences · plans · routes *(unique to Crillon)*
- **The Celebrant** — weddings · proposals · milestones *(shared with Kona)*
- The Concierge · The Sommelier · The Historian

### Kona Village — ocean studio

*Water, land, ceremony with cultural depth.*

- **The Mariner** — ocean · sailing · the water *(unique to Kona)*
- **The Naturalist** — land · creatures · the wild *(unique to Kona)*
- **The Celebrant** — ceremonies · milestones with Hawaiian tradition *(shared with Crillon)*
- The Concierge · The Sommelier · The Historian

— · —

## File map

```
~/Desktop/Atelier/
├── index.html              ← guest experience (studio · thinking · constellation)
├── operator.html           ← staff experience (architectural aerial + firehose)
├── atelier-tokens.css      ← shared design tokens (per-property palettes)
├── atelier-orb.js          ← <atelier-orb> web component
├── atelier-data.js         ← PROPERTIES, SPECIALISTS, MOCK_GUESTS, CANNED replies
├── atelier-app.js          ← guest logic (voice · Claude · ElevenLabs · seam)
├── operator-app.js         ← operator logic (aerial · firehose · staff actions)
├── .local-keys.js          ← API keys (gitignored)
└── serve.sh                ← localhost server (so Chrome remembers mic permission)
```

— · —

## Running it

```bash
# 1. Drop your keys into .local-keys.js (already gitignored)
#    window.__local_keys = { anthropic: 'sk-ant-...', elevenlabs: 'sk_...' };

# 2. Start the local server (so Chrome persists mic permission across reloads)
./serve.sh

# 3. Open both windows from the same origin
#    http://localhost:8765/index.html       ← guest
#    http://localhost:8765/operator.html    ← staff
```

First time, Chrome will prompt for microphone — choose **Allow** (persists for `localhost`).

### Keyboard map (guest window)

| Shortcut | What |
|---|---|
| **Cmd+0** | Reload (fresh state) |
| **Cmd+1** | Enter studio · welcome plays |
| **Cmd+2** | Run the seam moment — Strategist + Convener + plan |
| **Cmd+3** | The Constellation |
| **Cmd+4** | Your Thinking |
| **Cmd+L** | Toggle privacy on the active thread |
| **Cmd+Space** | Open the mic (push-to-talk) |
| **Cmd+9** | Toggle presenter safe mode |

In the operator window: **tap any suite** to open the brief. **Esc** closes.

— · —

## The partner story (one line each)

- **Anthropic.** Every specialist's voice is Claude — `claude-sonnet-4-5` with a per-property + per-specialist system prompt that carries the literary register, the property atmosphere, and the guest's body state. Privacy is enforced at the prompt layer.
- **ElevenLabs.** Each specialist has a distinct voice through streaming TTS. Six voices mapped to twelve specialists by register. The Atelier itself has a host voice for welcomes, cross-thread offers, and navigation.
- **Greycroft.** The bet: the next ten years of hospitality are intelligence layered onto place. Apex pricing supports it; cross-property memory creates switching costs; the operator surface makes every team member as good as the property's best one.

— · —

## What this is not

- **Not a chatbot.** The specialists default to action over advice — candidates, a recommendation, a committed plan, suggested staff next-steps.
- **Not a final product.** This is the operational logic and aesthetic language of what the Atelier becomes when deployed across a Rosewood property. The prose register, the discretion of the orb, the way decisions arrive as a tray, the way the studio reshapes itself property to property — these are what a Rosewood guest will recognize at every property they visit thereafter.
- **Not generalized.** Every line is written for Rosewood. Crillon ≠ Sand Hill ≠ Kona Village. The Steward at the Carlyle does not sound like the Strategist at Sand Hill. The studio is reshaped property to property, not deployed identically.

