// Builds a branded, shareable PNG of a prize's image — a black frame with
// rounded inner edges around the photo, "CHOSEN.WIN" top-left and the
// wordmark logo bottom-right, baked directly into the exported pixels (not
// a CSS overlay) so it survives being downloaded or shared as a file.

const LOGO_URL = "assets/brand/chosenlogo.png";
const CANVAS_SIZE = 1200;
const BORDER = 90;
const RADIUS = 32;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function buildShareCard(item) {
  const [prizeImg, logoImg] = await Promise.all([loadImage(item.image), loadImage(LOGO_URL).catch(() => null)]);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const innerX = BORDER;
  const innerY = BORDER;
  const innerSize = CANVAS_SIZE - BORDER * 2;

  ctx.save();
  roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, RADIUS);
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.fillRect(innerX, innerY, innerSize, innerSize);

  // object-fit: contain — full photo, letterboxed on black, never cropped.
  const scale = Math.min(innerSize / prizeImg.width, innerSize / prizeImg.height);
  const drawW = prizeImg.width * scale;
  const drawH = prizeImg.height * scale;
  ctx.drawImage(prizeImg, innerX + (innerSize - drawW) / 2, innerY + (innerSize - drawH) / 2, drawW, drawH);
  ctx.restore();

  roundedRectPath(ctx, innerX, innerY, innerSize, innerSize, RADIUS);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "700 32px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("CHOSEN.WIN", BORDER, BORDER / 2);

  if (logoImg) {
    const logoH = BORDER * 0.5;
    const logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, CANVAS_SIZE - BORDER - logoW, CANVAS_SIZE - BORDER / 2 - logoH / 2, logoW, logoH);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "chosen";
}

export function downloadShareCard(blob, item) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(item.name)}-chosen.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Tries the native share sheet first (great on mobile); falls back to a
// plain download if unsupported or the user backs out of the share sheet.
export async function shareCard(blob, item) {
  try {
    const file = new File([blob], `${slug(item.name)}-chosen.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: item.name, text: `Check out my ${item.name} on Chosen` });
      return true;
    }
  } catch {
    // unsupported, or the user cancelled the share sheet — fall through
  }
  downloadShareCard(blob, item);
  return false;
}
