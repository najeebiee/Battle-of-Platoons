// src/services/leaderboardService.js
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";

const SCORE_WEIGHTS = { leads: 1, payins: 2, sales: 1.5 / 1000 };

function computePoints({ leads, payins, sales }) {
  return (
    (leads || 0) * SCORE_WEIGHTS.leads +
    (payins || 0) * SCORE_WEIGHTS.payins +
    (sales || 0) * SCORE_WEIGHTS.sales
  );
}

/**
 * weekRange: { start: Date, end: Date } | null
 * view: "leaders" | "depots" | "companies"
 */
export async function getLeaderboard(weekRange, view = "leaders") {
  // 1) base query
  let base = collection(db, "raw_data");
  if (weekRange?.start && weekRange?.end) {
    base = query(
      base,
      where("date", ">=", weekRange.start),
      where("date", "<=", weekRange.end)
    );
  }

  const [rawSnap, agentsSnap] = await Promise.all([
    getDocs(base),
    getDocs(collection(db, "agents")),
  ]);

  // 2) build agents map
  const agents = new Map();
  agentsSnap.forEach((d) => {
    agents.set(d.id, d.data());
  });

  const groups = new Map();

  const getKey = (agentId) => {
    const meta = agents.get(agentId) || {};
    if (view === "leaders") return agentId;
    if (view === "depots") return meta.depot || "Unknown Depot";
    if (view === "companies") return meta.company || "Unknown Company";
    return agentId;
  };

  rawSnap.forEach((doc) => {
    const data = doc.data();
    const agentId = data.agentId;
    const key = getKey(agentId);
    if (!key) return;

    if (!groups.has(key)) {
      const meta =
        agents.get(agentId) ||
        // fallback: match by name if your older data used names as IDs
        Array.from(agents.entries()).find(
          ([, v]) => v.name === agentId
        )?.[1] ||
        {};

      groups.set(key, {
        key,
        name:
          view === "leaders"
            ? meta.name || agentId
            : view === "depots"
            ? key
            : key,
        avatarUrl: view === "leaders" ? meta.photoURL || "" : "",
        depot: meta.depot || "",
        company: meta.company || "",
        platoon: meta.platoon || "",
        leads: 0,
        payins: 0,
        sales: 0,
      });
    }

    const g = groups.get(key);
    g.leads += data.leads || 0;
    g.payins += data.payins || 0;
    g.sales += data.sales || 0;
  });

  const rows = Array.from(groups.values()).map((g) => ({
    ...g,
    points: computePoints(g),
  }));

  rows.sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);

  return {
    view,
    metrics: {
      entitiesCount: rows.length,
      totalLeads,
      totalSales,
    },
    rows,
  };
}
