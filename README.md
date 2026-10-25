# BoloForm - Voice-Powered Form Filling

A Chrome extension that lets you fill web forms by speaking naturally, in any
order, using [Wispr Flow](https://wisprflow.ai) as the voice input.

Built for **No Hands: The Wispr Flow Challenge** (WeMakeDevs x Wispr Flow).

## The problem

Dictation types into the one field you have focused. Real forms have many
fields. When an address - house, street, PIN - is dictated into a shopping
site's address form, the whole address lands in the House field while Street
and Pincode stay empty. You end up cutting and pasting by hand, which defeats
the point of speaking.

## What BoloForm does

1. Click the extension's toolbar icon. A small panel opens with a capture box.
2. Dictate into that box with Wispr Flow (Fn on Mac, Ctrl+Win on Windows) -
   or just type. Speak any way you like:
   - Free narration: "mera naam Rahul Sharma hai, janm tithi 21/11/2001"
   - Directed commands: "name field me Rahul Sharma bhar do"
   - Address in one breath: "house 5A Extension Road, behind park, street
     Angel Road, pincode 110034"
   - Corrections: "naam badal do Rahul Verma"
   Hindi, Hinglish and English all work.
3. Press **Form bharo**. BoloForm reads the open page's fields, maps each
   spoken detail to the right one, and shows a **preview of the mapping** -
   which detail goes into which field, including any value a fill would
   replace. Nothing is written yet.
4. Press **Sahi hai, bharo** to apply the mapping (or Cancel to change the
   transcript). Filled fields are highlighted; replaced fields show their
   previous value in the panel.
5. If something is incomplete or ambiguous (a 2-digit PIN, a 2-digit phone
   number), the panel asks instead of guessing. Locked/readonly fields (like
   City/State that a site computes from the PIN) are reported as skipped and
   never overwritten. If two spoken details map to the same field, or one
   detail arrives with two different values in one message, the panel asks
   instead of overwriting. And for anything BoloForm cannot place
   confidently, a **Field chuno** button lets you click the exact page field
   yourself - only that field gets filled.
6. BoloForm never submits anything. You review the highlighted fields and
   submit yourself.

The panel header always shows the running version (e.g. `v0.2.3`) so a
screenshot proves which build is loaded.
![One spoken sentence fills six fields, each highlighted](docs/vfh-panel-filled.png)

![Locked fields are skipped; an incomplete PIN is asked about, not guessed](docs/vfh-panel-ask.png)

## Get Wispr Flow

BoloForm uses [Wispr Flow](https://wisprflow.ai) for voice input. If you do
not have it yet, you can download it through the author's referral link:
<https://wisprflow.ai/r?AVIRAL283>

## Install (local, unpacked)

1. Clone or download this repo (Code > Download ZIP) and unzip it.
2. Open `chrome://extensions`, switch **Developer mode** on (top right).
3. Click **Load unpacked** and select the repo folder (the one containing
   `manifest.json`).
4. Pin the extension from the puzzle icon in the toolbar.
5. To try the included demo form: in the extension's Details page enable
   **Allow access to file URLs**, then open `demo-form.html` in Chrome.

## Try it

Open `demo-form.html` (a dummy income-certificate form with the address
pattern above), click the toolbar icon, dictate or type one of the example
sentences into the panel, and press **Form bharo**. The demo form's phone
field is prefilled with a dummy number on purpose: BoloForm will not touch it
unless you actually dictate a phone number. City/State are readonly and will
be reported as locked.

## Permissions and privacy

- `activeTab` + `scripting` only. The extension activates solely on the tab
  where you click its icon; it has no standing access to any website.
- No network calls, no storage, no accounts. Nothing leaves your browser.
- The demo form and all examples use dummy data only. Never use real Aadhaar,
  PAN, phone numbers or addresses when testing.

## Test status (honest)

Verified:

- 63 parser unit tests (`node tests/parser.test.js`) covering narration,
  directed commands, corrections, address splitting, incomplete values,
  Devanagari input, dates, emails, phone/PIN validation, plus regressions
  from real-site tests: Wispr bullet-style transcripts ("- Key: value" and
  directed "field me value bharo" lines), PIN digits embedded in address
  clauses, alphanumeric house numbers, values containing connector words
  like "ka" ("Shanti ka Colony" stays whole), house/flat IDs keeping their
  separators exactly as dictated ("2A/45", "2A-45"), composite or
  disfluent dictated labels ("house flat number/apartment number: 2A-45")
  leaving only the identifier in the value.
- `tests/snitch-replica.html`: 30 headless-Chrome checks against a replica
  of a real shopping site's add-address DOM (label collision "Name" vs
  "House / Flat No / Apartment Name", a phone input with no label - only a
  `+91` chip and a numeric placeholder, readonly City/State, conflicting
  duplicate values, a phone chip shared across a flat form's fields,
  preview-then-confirm flow through the real panel code, and the manual
  "Field chuno" pick). This is a locally served replica with
  dummy data, not the live site.
- End-to-end fill pipeline in headless Chrome against the demo form,
  including locked-field skips and ask-instead-of-guess behavior
  (screenshots above).

Not yet verified:

- Real Wispr Flow dictation into the panel - the capture box is a normal
  focused text field, which is exactly what Wispr types into, but the
  end-to-end voice test is pending on a local machine.
- The current fixes on the live shopping site whose failure they address;
  a retest there with the reloaded extension is the next step.
- Arbitrary websites. Field matching is rule-based (labels, placeholders,
  input names); unfamiliar label wording may need new aliases in
  `parser.js` (`FIELDS`). This prototype does not claim every site or every
  language.

## Project structure

```
manifest.json    MV3 manifest (activeTab + scripting only)
background.js    Toolbar click -> inject panel into that tab only
content.js       Floating capture panel (shadow DOM), fill + review UI
parser.js        Transcript -> field/value pairs (Hindi/Hinglish/English rules)
matcher.js       Finds page fields, fills, highlights, reports locked/missing
demo-form.html   Dummy demo form (income certificate + address pattern)
tests/           Parser unit tests (node tests/parser.test.js)
docs/            Verified UI screenshots
```

## Why Wispr Flow

Wispr Flow's desktop dictation types wherever your cursor is, in 100+
languages. BoloForm treats that as its voice engine: Wispr handles hearing
and transcribing; BoloForm handles understanding which field each detail
belongs to. No developer API or enterprise approval is needed.
