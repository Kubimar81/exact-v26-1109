export async function compressScreenshot(file: File): Promise<{
  mime: "image/jpeg";
  data: string;
  preview: string;
  name: string;
}> {
  const bitmap = await createImageBitmap(file);
  const max = 960;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nie można przetworzyć obrazu.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Kompresja nie powiodła się."))), "image/jpeg", 0.62);
  });
  const preview = await blobToDataUrl(blob);
  const data = preview.split(",")[1] ?? "";
  if (data.length > 900_000) throw new Error("Screen jest za duży — wytnij kadr meczu i spróbuj ponownie.");
  return { mime: "image/jpeg", data, preview, name: file.name || "screen.jpg" };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    reader.readAsDataURL(blob);
  });
}

export function toDatetimeLocal(raw: string): string {
  if (!raw.trim()) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const fromDate = (d: Date) => {
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const iso = fromDate(new Date(raw));
  if (iso) return iso;
  const isoLike = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}T${isoLike[4]}:${isoLike[5]}`;
  const euro = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (euro) {
    return `${euro[3]}-${pad(Number(euro[2]))}-${pad(Number(euro[1]))}T${pad(Number(euro[4] ?? 0))}:${pad(Number(euro[5] ?? 0))}`;
  }
  return "";
}
