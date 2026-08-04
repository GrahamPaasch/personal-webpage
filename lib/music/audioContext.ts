/**
 * Shared Web Audio helpers for the music tools under app/tools/*.
 *
 * These were previously copy-pasted verbatim into eight tool components
 * (metronome, tempo-ramp, practice-timer, drone, tuner, ear-trainer,
 * chord-looper, rhythm-trainer).
 */

/**
 * Creates an AudioContext, tolerating both the standard constructor and
 * Safari's `webkitAudioContext`. Returns null during SSR, or on a browser with
 * no Web Audio support at all, so callers can degrade instead of throwing.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AnyWindow = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = AnyWindow.AudioContext || AnyWindow.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Resumes a suspended context, swallowing the rejection browsers produce when
 * resume() is called outside a user gesture. Autoplay policy means a context
 * often starts suspended, and a failed resume is not worth surfacing — the next
 * user interaction will retry.
 */
export async function safeResume(ctx: AudioContext): Promise<void> {
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    // Blocked by autoplay policy; the next gesture will try again.
  }
}
