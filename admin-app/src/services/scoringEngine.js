export function computeMetricScore(actual, divisor, maxPoints) {
  if (divisor <= 0) return 0;

  const score = (actual / divisor) * maxPoints;
  return Math.min(score, maxPoints);
}

export function computeTotalScore(battleType, totals = {}, config = {}) {
  const metrics = Array.isArray(config?.metrics) ? config.metrics : [];
  const normalizedTotals = {
    leads: totals?.leads ?? 0,
    payins: totals?.payins ?? 0,
    sales: totals?.sales ?? 0,
  };

  const isDepot = String(battleType || "").toLowerCase() === "depot" ||
    String(battleType || "").toLowerCase() === "depots";

  return metrics.reduce((sum, metric) => {
    const metricKey = metric?.key ?? metric?.name ?? metric?.metric;
    if (!metricKey) return sum;

    if (isDepot && metricKey === "payins") return sum;

    const divisor = metric?.divisor ?? metric?.division ?? 0;
    const maxPoints = metric?.maxPoints ?? metric?.max_points ?? metric?.points ?? 0;
    const actual = normalizedTotals[metricKey] ?? 0;

    return sum + computeMetricScore(actual, divisor, maxPoints);
  }, 0);
}
