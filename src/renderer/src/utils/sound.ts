import { useStore } from '../store/useStore'

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playTone(ctx: AudioContext, freq: number, startAt: number, duration: number, volume: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

function playToneWave(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  volume: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

export type SoundPresetId =
  | 'synth-default'
  | 'ding'
  | 'chime'
  | 'pop'
  | 'bell'
  | 'silent'
  | 'alert-default'

// Clamp volume to safe range, default 1
function v(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  if (volume < 0) return 0
  if (volume > 1) return 1
  return volume
}

/** Play a built-in synthesized preset sound at the given relative volume (0..1). */
export function playPreset(id: string, volume: number = 1): void {
  const vol = v(volume)
  if (id === 'silent' || vol === 0) return
  try {
    const ctx = getCtx()
    const now = ctx.currentTime
    switch (id) {
      case 'synth-default': {
        // Original two-tone "done" chime (660 → 880)
        playTone(ctx, 660, now, 0.35, 0.18 * vol)
        playTone(ctx, 880, now + 0.18, 0.35, 0.14 * vol)
        return
      }
      case 'alert-default': {
        // Original urgent three-tone "confirmation" ping
        playTone(ctx, 1047, now, 0.15, 0.22 * vol)
        playTone(ctx, 1319, now + 0.13, 0.15, 0.22 * vol)
        playTone(ctx, 1047, now + 0.26, 0.20, 0.18 * vol)
        return
      }
      case 'ding': {
        // Crisp single tone with a triangle harmonic layer
        playToneWave(ctx, 1000, now, 0.22, 0.22 * vol, 'sine')
        playToneWave(ctx, 2000, now, 0.18, 0.07 * vol, 'triangle')
        return
      }
      case 'chime': {
        // Soft three-note ascending chime
        playTone(ctx, 523, now, 0.45, 0.14 * vol)
        playTone(ctx, 659, now + 0.18, 0.50, 0.14 * vol)
        playTone(ctx, 784, now + 0.36, 0.60, 0.14 * vol)
        return
      }
      case 'pop': {
        // Short percussive blip
        playToneWave(ctx, 200, now, 0.08, 0.28 * vol, 'sine')
        return
      }
      case 'bell': {
        // Bell: fundamental + 2nd harmonic with long decay
        playToneWave(ctx, 880, now, 0.85, 0.20 * vol, 'sine')
        playToneWave(ctx, 1760, now, 0.75, 0.08 * vol, 'sine')
        return
      }
      default: {
        // Unknown id — fall back to synth default
        playTone(ctx, 660, now, 0.35, 0.18 * vol)
        playTone(ctx, 880, now + 0.18, 0.35, 0.14 * vol)
      }
    }
  } catch {
    // AudioContext may be blocked before user interaction; silently ignore
  }
}

/**
 * Resolve an absolute path (or bare filename) into a `sounds://` URL that the
 * renderer can load via the custom protocol handler registered in the main
 * process. This avoids Chromium's refusal to load `file://` URLs from an
 * `http://` dev origin.
 */
function toSoundsUrl(p: string): string {
  // Accept either a bare filename or a full absolute path; we only need the
  // basename because the main-process protocol handler serves files from
  // userData/sounds by name.
  const normalized = p.replace(/\\/g, '/')
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1)
  return 'sounds://' + encodeURIComponent(filename)
}

/**
 * Play a user-imported custom audio file. Accepts a filename located in
 * userData/sounds — the main process serves it via the `sounds:` protocol.
 * For backwards compatibility we also accept an absolute path and strip it
 * down to the basename.
 */
export function playCustomFile(absolutePathOrName: string, volume: number = 1): void {
  const vol = v(volume)
  if (vol === 0) return
  try {
    const el = new Audio(toSoundsUrl(absolutePathOrName))
    el.volume = vol
    // Don't await — fire and forget
    void el.play().catch(() => { /* ignore autoplay/block errors */ })
  } catch {
    // ignore
  }
}

/**
 * Bundled preset sounds shipped with the app. Drop any audio file into
 * `src/renderer/src/assets/sounds/` and it is auto-registered at build time as
 * a default option with id `bundled:<filename-without-extension>` — no code
 * change needed. Vite rewrites these to hashed asset URLs that resolve in both
 * dev and the packaged build.
 */
const bundledUrls = import.meta.glob('../assets/sounds/*.{mp3,wav,ogg,m4a,MP3,WAV,OGG,M4A}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const BUNDLED_SOUNDS: Array<{ id: string; name: string; url: string }> = Object.entries(bundledUrls)
  .map(([path, url]) => {
    const file = path.slice(path.lastIndexOf('/') + 1)
    return { id: 'bundled:' + file.replace(/\.[^.]+$/, ''), name: file.replace(/\.[^.]+$/, ''), url }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const bundledById = new Map(BUNDLED_SOUNDS.map((s) => [s.id, s.url]))

/** Play a bundled audio file (by its `bundled:` id) at the given volume. */
export function playBundled(id: string, volume: number = 1): void {
  const vol = v(volume)
  if (vol === 0) return
  const url = bundledById.get(id)
  if (!url) return
  try {
    const el = new Audio(url)
    el.volume = vol
    void el.play().catch(() => { /* ignore autoplay/block errors */ })
  } catch { /* ignore */ }
}

/**
 * Play a sound selection. The id may be a synthesized preset (e.g.
 * `synth-default`, `ding`), a bundled file (`bundled:name`), or a user custom
 * sound (`custom:filename.ext`). The caller supplies the userData sounds
 * directory so this module stays renderer-only.
 */
export function playSelection(
  id: string,
  volume: number,
  resolveCustomPath?: (filename: string) => string | null,
): void {
  if (!id) return
  if (id.startsWith('bundled:')) {
    playBundled(id, volume)
    return
  }
  if (id.startsWith('custom:')) {
    const filename = id.slice('custom:'.length)
    const abs = resolveCustomPath?.(filename) ?? null
    if (abs) playCustomFile(abs, volume)
    return
  }
  playPreset(id, volume)
}

// --- Backwards-compatible wrappers ---
// These are retained so existing callers keep working. They read the user's
// notification preferences from the Zustand store directly via getState(),
// which is safe to call from outside React. The `sounds:` protocol handler
// in the main process serves files by name, so we only need the filename.

function readNotifState(): {
  enabled: boolean
  volume: number
  doneSound: string
  confirmSound: string
} {
  const s = useStore.getState()
  return {
    enabled: s.notificationSoundEnabled ?? true,
    volume: typeof s.notificationVolume === 'number' ? s.notificationVolume : 0.7,
    doneSound: s.notificationDoneSound ?? 'bundled:quiet',
    confirmSound: s.notificationConfirmSound ?? 'bundled:clever-touch',
  }
}

/** Soft two-tone chime: used when agent finishes a task (waiting). */
export function playDoneSound(): void {
  const st = readNotifState()
  if (!st.enabled) return
  playSelection(st.doneSound, st.volume, (f) => f)
}

/** Urgent multi-tone ping: used when agent needs confirmation. */
export function playAlertSound(): void {
  const st = readNotifState()
  if (!st.enabled) return
  playSelection(st.confirmSound, st.volume, (f) => f)
}
