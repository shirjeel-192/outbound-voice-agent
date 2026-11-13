// Did a real, live human speak on this call?
//
// A realtime voice model will happily hold a "conversation" with a voicemail greeting or a phone
// menu, and the post-call analysis model will then report it as a booking or a callback request.
// The fix is not a smarter model. The server must never act on a warm outcome on the model's word.
//
// Layered, strongest signal first.
//   1. endedReason. Deterministic and model-independent. A voicemail is a voicemail.
//   2. The analysis model's explicit yes/no answer to "did a live human speak?".
//   3. Transcript language. Phrasing only a recording or a phone menu produces.
//
// It still ALLOWS the menu-then-human case. The agent presses 1, a receptionist picks up. Menu
// language is in the transcript, but the model affirms a human, so we proceed. That path is the
// reason the agent can send keypad tones at all.

/** End reasons (normalised from the voice platform's own codes) that mean nobody human was on the line. */
export const MACHINE_ENDED_REASONS = new Set([
  "voicemail",
  "silence-timeout",
  "max-duration",
  "no-answer",
  "busy",
  "failed-to-connect",
]);

/** Phrasing that only a recording, voicemail greeting or phone menu produces. */
export const MACHINE_LANGUAGE =
  /(press\s*[0-9]|leave a (brief |short )?message|voice ?mail (of|box)|you'?ve reached|our (office|business) hours|we are currently closed|currently closed|dial\s*9\s*1\s*1|your party'?s extension|after hours|return your call|thank you for calling)/i;

export interface CallSignals {
  endedReason?: string | null;
  transcript?: string | null;
  /** The analysis model's answer. Booleans sometimes arrive as strings. */
  modelSaysHuman?: unknown;
}

/** True only with positive reason to believe a live human spoke. Fails closed. */
export function reachedLiveHuman({ endedReason, transcript, modelSaysHuman }: CallSignals): boolean {
  if (endedReason && MACHINE_ENDED_REASONS.has(endedReason)) return false;
  const said = String(modelSaysHuman);
  if (said === "false") return false;
  if (transcript && MACHINE_LANGUAGE.test(transcript) && said !== "true") return false;
  return true;
}
