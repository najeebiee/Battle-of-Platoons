import React from "react";

export default function Dashboard() {
  return (
<<<<<<< HEAD
    <div className="card">
      <div className="card-title">Dashboard</div>
      <div className="muted">
        Next: KPIs + toggle (Leaders/Commanders/Depots) + preview podium/table using leaderboard.service.js.
=======
    <div className="dashboard-page" data-mode={activeView}>
      <div className="dashboard-kpis">
        <div className={`dashboard-kpi-strip${loading ? " is-loading" : ""}`}>
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-label">Leaders</div>
            <div className="dashboard-kpi-value">
              {loading ? <span className="dashboard-kpi-skeleton" /> : formatNumber(kpis.leadersCount)}
            </div>
          </div>
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-label">Companies</div>
            <div className="dashboard-kpi-value">
              {loading ? <span className="dashboard-kpi-skeleton" /> : formatNumber(kpis.companiesCount)}
            </div>
          </div>
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-label">Depots</div>
            <div className="dashboard-kpi-value">
              {loading ? <span className="dashboard-kpi-skeleton" /> : formatNumber(kpis.depotsCount)}
            </div>
          </div>
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-label">Total Leads</div>
            <div className="dashboard-kpi-value">
              {loading ? <span className="dashboard-kpi-skeleton" /> : formatNumber(kpis.totalLeads)}
            </div>
          </div>
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-label">Total Sales</div>
            <div className="dashboard-kpi-value">
              {loading ? <span className="dashboard-kpi-skeleton" /> : formatCurrency(kpis.totalSales)}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-tabs">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`dashboard-pill${activeView === tab.key ? " active" : ""}`}
            onClick={() => handleViewChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="tab-panel"
        data-state={isAnimating ? "out" : "in"}
        ref={panelRef}
        style={panelMinHeight ? { minHeight: panelMinHeight } : undefined}
      >
        <div className="dashboard-section-title">{sectionTitle}</div>

        {error ? <div className="dashboard-error">{error}</div> : null}

        {loading ? (
          <div className="dashboard-podium dashboard-podium--loading">
            <div className="dashboard-podium-card" />
            <div className="dashboard-podium-card" />
            <div className="dashboard-podium-card" />
          </div>
        ) : (
          <div className="dashboard-podium">
            {podiumRows.map(item => (
              <div key={item.key || item.id} className={`dashboard-podium-card rank-${item.rank}`}>
                <div className="dashboard-podium-rank">{item.rank}</div>
                <div className="dashboard-podium-avatar">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} />
                  ) : (
                    <span>{getInitials(item.name)}</span>
                  )}
                </div>
                <div className="dashboard-podium-name">{item.name}</div>
                <div className="dashboard-podium-points">{Number(item.points || 0).toFixed(1)}</div>
                <div className="dashboard-podium-label">points</div>
                <div className="dashboard-podium-stats">
                  <div>
                    <span className="dashboard-stat-value">{formatNumber(item.leads || 0)}</span>
                    <span className="dashboard-stat-label">leads</span>
                  </div>
                  {showPayins && (
                    <div>
                      <span className="dashboard-stat-value">{formatNumber(item.payins || 0)}</span>
                      <span className="dashboard-stat-label">payins</span>
                    </div>
                  )}
                  <div>
                    <span className="dashboard-stat-value">{formatCurrency(item.sales || 0)}</span>
                    <span className="dashboard-stat-label">sales</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dashboard-table">
          <div className="dashboard-table-head">
            <div>Rank</div>
            <div>{labelHeader}</div>
            <div>Leads</div>
            {showPayins && <div>Payins</div>}
            <div>Sales</div>
            <div>Points</div>
          </div>
          <div className="dashboard-table-body">
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="dashboard-table-row dashboard-table-row--loading">
                  <span className="dashboard-skeleton" />
                  <span className="dashboard-skeleton" />
                  <span className="dashboard-skeleton" />
                  {showPayins && <span className="dashboard-skeleton" />}
                  <span className="dashboard-skeleton" />
                  <span className="dashboard-skeleton" />
                </div>
              ))
            ) : tableRows.length ? (
              tableRows.map(row => (
                <div key={`${row.rank}-${row.key}`} className="dashboard-table-row">
                  <div className="dashboard-rank">{row.rank}</div>
                  <div className="dashboard-name-cell">
                    <div className="dashboard-row-avatar">
                      {row.photoUrl ? (
                        <img src={row.photoUrl} alt={row.name} />
                      ) : (
                        <span>{getInitials(row.name)}</span>
                      )}
                    </div>
                    <span>{row.name}</span>
                  </div>
                  <div>{formatNumber(row.leads || 0)}</div>
                  {showPayins && <div>{formatNumber(row.payins || 0)}</div>}
                  <div>{formatCurrency(row.sales || 0)}</div>
                  <div>{Number(row.points || 0).toFixed(1)}</div>
                </div>
              ))
            ) : (
              <div className="dashboard-empty">No rankings available.</div>
            )}
          </div>
        </div>
        {DEBUG && (
          <div style={{ marginTop: 16, padding: 12, background: "#fff", borderRadius: 8, fontSize: 12 }}>
            <div><b>mode:</b> {activeView}</div>
            <div><b>rows:</b> {sortedRows?.length ?? 0}</div>
            <div><b>podium names:</b> {(sortedRows ?? []).slice(0, 3).map(r => r?.name).join(", ")}</div>
            <div><b>table names:</b> {(tableRows ?? []).slice(0, 5).map(r => r?.name).join(", ")}</div>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify({ sampleRows: (sortedRows ?? []).slice(0, 3) }, null, 2)}
            </pre>
          </div>
        )}
>>>>>>> 3bebdb31 (undo dashboard depo)
      </div>
    </div>
  );
}
