// Screen/tab recording of the box-select-to-reveal moment, so a pull can be
// shared as an actual clip. Uses getDisplayMedia + MediaRecorder — the only
// way to capture a mix of the WebGL box viewer and the CSS-animated reveal
// FX as video without rewriting those effects onto a canvas. Two hard
// platform limits, not implementation choices: the browser requires a
// fresh permission prompt to start capture (can't be silently pre-approved
// for later), and clips live only in memory for this tab session — there's
// no backend and no practical way to persist video blobs in localStorage,
// so they're gone on refresh or tab close.

const CLIPS_CAP = 10;

let activeStream = null;
let recorder = null;
let chunks = [];
let clips = []; // most-recent-first: {id, blob, url, name, image, price, tierKey, ts}
let clipIdCounter = 0;

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
}

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function ensureStream() {
  if (activeStream && activeStream.getVideoTracks()[0]?.readyState === "live") return activeStream;
  // preferCurrentTab/selfBrowserSurface are Chrome-only hints that bias the
  // picker toward "this tab" — ignored harmlessly elsewhere.
  activeStream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  });
  return activeStream;
}

// Starts recording for one pull. Resolves true if recording began, false if
// the user declined the share prompt or the browser doesn't support it —
// callers must treat false as "no clip this round," never as an error.
export async function startRecording() {
  if (!isSupported()) return false;
  try {
    const stream = await ensureStream();
    chunks = [];
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start();
    return true;
  } catch {
    activeStream = null;
    return false;
  }
}

// Stops the current recording and files it as a clip for `prize`. Resolves
// to the clip, or null if nothing was recording.
export function stopRecording(prize, tierKey) {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") {
      resolve(null);
      return;
    }
    const finishedRecorder = recorder;
    finishedRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: finishedRecorder.mimeType || "video/webm" });
      chunks = [];
      const clip = {
        id: `clip${++clipIdCounter}`,
        blob,
        url: URL.createObjectURL(blob),
        name: prize?.name ?? "Pull",
        image: prize?.image ?? "",
        price: prize?.price ?? 0,
        tierKey,
        ts: Date.now(),
      };
      clips.unshift(clip);
      const dropped = clips.slice(CLIPS_CAP);
      clips = clips.slice(0, CLIPS_CAP);
      dropped.forEach((c) => URL.revokeObjectURL(c.url));
      resolve(clip);
    };
    finishedRecorder.stop();
  });
}

export function getClips() {
  return clips;
}

export function getClip(id) {
  return clips.find((c) => c.id === id) ?? null;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pull";
}

export function downloadClip(clip) {
  const a = document.createElement("a");
  a.href = clip.url;
  a.download = `${slug(clip.name)}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Tries the native share sheet first (great on mobile); falls back to a
// plain download if unsupported or the user backs out of the share sheet.
export async function shareClip(clip) {
  try {
    const file = new File([clip.blob], `${slug(clip.name)}.webm`, { type: clip.blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: clip.name, text: `I just pulled ${clip.name}!` });
      return true;
    }
  } catch {
    // unsupported, or the user cancelled the share sheet — fall through
  }
  downloadClip(clip);
  return false;
}
