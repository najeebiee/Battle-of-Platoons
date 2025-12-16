import { supabase } from "./supabase";

const AVATARS_BUCKET = "avatars";

function getExtension(file) {
  const nameExt = file?.name?.split?.(".").pop?.();
  if (nameExt && nameExt !== file.name) return nameExt.toLowerCase();
  if (file?.type) {
    const map = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    if (map[file.type]) return map[file.type];
  }
  return "bin";
}

export function getPublicUrl(path) {
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? "";
}

export async function uploadAvatar({ entityType, entityId, file }) {
  const ext = getExtension(file);
  const timestamp = Date.now();
  const path = `${entityType}/${entityId}/${timestamp}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file?.type });

  if (error) throw error;

  return { path, publicUrl: getPublicUrl(path) };
}
