import { ensureSessionOrThrow, supabase } from "./supabase";

function normalizeUnitName(name = "") {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeUnitType(unitType = "") {
  const value = unitType.toString().trim().toLowerCase();
  return value === "city" ? "city" : value === "depot" ? "depot" : "";
}

function normalizeProductCenterUnit(unit = {}) {
  return {
    id: unit.id,
    name: unit.name ?? "",
    unit_type: normalizeUnitType(unit.unit_type),
    code: unit.code ?? "",
    is_active: Boolean(unit.is_active ?? unit.isActive ?? true),
    created_at: unit.created_at ?? unit.createdAt ?? null,
    updated_at: unit.updated_at ?? unit.updatedAt ?? null,
  };
}

export async function listProductCenterUnits({ onlyActive = false, unitType = "" } = {}) {
  let query = supabase
    .from("product_center_units")
    .select("*")
    .order("unit_type", { ascending: true })
    .order("name", { ascending: true });

  const normalizedType = normalizeUnitType(unitType);
  if (onlyActive) query = query.eq("is_active", true);
  if (normalizedType) query = query.eq("unit_type", normalizedType);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalizeProductCenterUnit);
}

export async function listActiveProductCenterUnits(options = {}) {
  return listProductCenterUnits({ ...options, onlyActive: true });
}

export function buildProductCenterUnitMaps(units = []) {
  const byId = new Map();
  const byTypeAndName = new Map();
  const byNameOnly = new Map();

  (units ?? []).forEach((unit) => {
    if (!unit) return;
    const normalized = normalizeProductCenterUnit(unit);
    const id = normalized.id ? String(normalized.id) : "";
    const unitType = normalizeUnitType(normalized.unit_type);
    const normalizedName = normalizeUnitName(normalized.name);

    if (id) byId.set(id, normalized);

    if (normalizedName) {
      if (!byNameOnly.has(normalizedName)) byNameOnly.set(normalizedName, []);
      byNameOnly.get(normalizedName).push(normalized);
    }

    if (unitType && normalizedName) {
      const key = `${unitType}::${normalizedName}`;
      if (!byTypeAndName.has(key)) byTypeAndName.set(key, []);
      byTypeAndName.get(key).push(normalized);
    }
  });

  return { byId, byTypeAndName, byNameOnly };
}

export function resolveProductCenterUnitId(input, maps = {}, options = {}) {
  const rawInput = input?.toString() ?? "";
  const trimmed = rawInput.trim();
  const normalizedType = normalizeUnitType(options?.unitType);
  const byId = maps.byId ?? new Map();
  const byTypeAndName = maps.byTypeAndName ?? new Map();
  const byNameOnly = maps.byNameOnly ?? new Map();

  if (!trimmed) {
    return { product_center_unit_id: null, error: null };
  }

  if (byId.has(trimmed)) {
    const unit = byId.get(trimmed);
    if (normalizedType && normalizeUnitType(unit?.unit_type) !== normalizedType) {
      return { product_center_unit_id: null, error: `Selected unit is not a ${normalizedType}` };
    }
    return { product_center_unit_id: trimmed, error: null };
  }

  const normalizedName = normalizeUnitName(trimmed);
  const typedMatches = normalizedType
    ? byTypeAndName.get(`${normalizedType}::${normalizedName}`) ?? []
    : [];
  const matches = normalizedType ? typedMatches : byNameOnly.get(normalizedName) ?? [];

  if (!matches.length) {
    return {
      product_center_unit_id: null,
      error: normalizedType
        ? `${normalizedType[0].toUpperCase()}${normalizedType.slice(1)} not found`
        : "Product center unit not found",
    };
  }

  if (matches.length > 1) {
    return {
      product_center_unit_id: null,
      error: normalizedType
        ? `${normalizedType[0].toUpperCase()}${normalizedType.slice(1)} name is not unique`
        : "Product center unit name is not unique",
    };
  }

  return {
    product_center_unit_id: matches[0]?.id ?? null,
    error: null,
  };
}

export async function upsertProductCenterUnit(id, data = {}) {
  await ensureSessionOrThrow(120);

  const unitType = normalizeUnitType(data?.unit_type ?? data?.unitType);
  if (!unitType) throw new Error("unit_type must be either 'depot' or 'city'");

  const payload = {
    id: id ?? data?.id ?? undefined,
    name: data?.name?.toString().trim() ?? "",
    unit_type: unitType,
    code: data?.code?.toString().trim() || null,
    is_active: Boolean(data?.is_active ?? data?.isActive ?? true),
  };

  if (!payload.name) throw new Error("Product center unit name is required");

  const { data: upserted, error } = await supabase
    .from("product_center_units")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeProductCenterUnit(upserted);
}

