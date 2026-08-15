/** ขอบยาวสูงสุดหลังย่อ — สอดคล้อง Ai Cluster / backend sharp */
export const PREPARED_IMAGE_MAX_DIMENSION = 1600;
/** ขนาดไฟล์เป้าหมายหลังบีบ JPEG */
export const PREPARED_IMAGE_MAX_BYTES = 1.85 * 1024 * 1024;

function isJpegType(type: string | undefined): boolean {
  return Boolean(type && /^image\/(jpeg|jpg|pjpeg)$/i.test(type));
}

/**
 * ย่อ/บีบเป็น JPEG ก่อนอัปโหลด (มาตรฐานเดียวกับ Ai Cluster)
 */
export async function prepareImageFileForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && file.type !== "") return file;
  try {
    const bmp = await createImageBitmap(file);
    try {
      const needsResize = bmp.width > PREPARED_IMAGE_MAX_DIMENSION || bmp.height > PREPARED_IMAGE_MAX_DIMENSION;
      const needsReencode =
        needsResize || file.size > PREPARED_IMAGE_MAX_BYTES || !isJpegType(file.type);

      if (!needsReencode) return file;

      let w = bmp.width;
      let h = bmp.height;
      if (needsResize) {
        const s = PREPARED_IMAGE_MAX_DIMENSION / Math.max(w, h);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, w, h);

      let quality = 0.85;
      let blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
      while (blob && blob.size > PREPARED_IMAGE_MAX_BYTES && quality > 0.45) {
        quality -= 0.1;
        blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
      }
      if (!blob || blob.size === 0) return file;
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      bmp.close();
    }
  } catch {
    return file;
  }
}

/** เตรียมหลายไฟล์ — รูปจะถูกย่อ ไฟล์อื่นคงเดิม */
export async function prepareFilesForUpload(files: FileList | File[]): Promise<File[]> {
  const list = Array.from(files);
  const out: File[] = [];
  for (const f of list) {
    if (f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(f.name)) {
      out.push(await prepareImageFileForUpload(f));
    } else {
      out.push(f);
    }
  }
  return out;
}
