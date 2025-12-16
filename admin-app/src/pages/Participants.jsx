import React, { useEffect, useMemo, useState } from "react";
import { listAgents, upsertAgent } from "../services/agents.service";
import { listDepots, upsertDepot } from "../services/depots.service";
import { listCompanies, upsertCompany } from "../services/companies.service";
import { listPlatoons, upsertPlatoon } from "../services/platoons.service";
import { uploadAvatar } from "../services/storage.service";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function slugId(input = "") {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function validateFile(file) {
  if (!file) return "";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Unsupported file type. Use PNG, JPG, or WEBP.";
  if (file.size > MAX_FILE_SIZE) return "File too large. Max size is 2MB.";
  return "";
}

export default function Participants() {
  const [tab, setTab] = useState("leaders"); // leaders | companies | depots | platoons
  const [status, setStatus] = useState({ type: "", msg: "" });

  const [agents, setAgents] = useState([]);
  const [depots, setDepots] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [platoons, setPlatoons] = useState([]);

  const [leaderPhotoFile, setLeaderPhotoFile] = useState(null);
  const [simplePhotoFile, setSimplePhotoFile] = useState(null);
  const [platoonPhotoFile, setPlatoonPhotoFile] = useState(null);

  const [leaderFileKey, setLeaderFileKey] = useState(0);
  const [simpleFileKey, setSimpleFileKey] = useState(0);
  const [platoonFileKey, setPlatoonFileKey] = useState(0);

  const [leaderUploading, setLeaderUploading] = useState(false);
  const [simpleUploading, setSimpleUploading] = useState(false);
  const [platoonUploading, setPlatoonUploading] = useState(false);

  // --- forms
  const [leaderForm, setLeaderForm] = useState({
    id: "",
    name: "",
    depotId: "",
    companyId: "",
    platoonId: "",
    photoURL: "",
  });

  const [simpleForm, setSimpleForm] = useState({
    id: "",
    name: "",
    photoURL: "",
  });

  const [platoonForm, setPlatoonForm] = useState({
    id: "",
    name: "",
    photoURL: "",
  });

  async function fetchAgents() {
    try {
      const rows = await listAgents();
      setAgents(rows);
    } catch (e) {
      console.error("Failed to load agents", e);
    }
  }

  async function fetchDepots() {
    try {
      const rows = await listDepots();
      setDepots(rows);
    } catch (e) {
      console.error("Failed to load depots", e);
    }
  }

  async function fetchCompanies() {
    try {
      const rows = await listCompanies();
      setCompanies(rows);
    } catch (e) {
      console.error("Failed to load companies", e);
    }
  }

  async function fetchPlatoons() {
    try {
      const rows = await listPlatoons();
      setPlatoons(rows);
    } catch (e) {
      console.error("Failed to load platoons", e);
    }
  }

  // --- load collections
  useEffect(() => {
    fetchAgents();
    fetchDepots();
    fetchCompanies();
    fetchPlatoons();
  }, []);

  const depotById = useMemo(() => Object.fromEntries(depots.map(d => [d.id, d])), [depots]);
  const companyById = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);
  const platoonById = useMemo(() => Object.fromEntries(platoons.map(p => [p.id, p])), [platoons]);

  function ok(msg) { setStatus({ type: "ok", msg }); }
  function err(msg) { setStatus({ type: "error", msg }); }

  // ---- Leaders (agents)
  const leaderIdPreview = useMemo(
    () => leaderForm.id || slugId(leaderForm.name),
    [leaderForm.id, leaderForm.name]
  );

  function clearLeader() {
    setLeaderForm({ id: "", name: "", depotId: "", companyId: "", platoonId: "", photoURL: "" });
    setLeaderPhotoFile(null);
    setLeaderFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
  }

  async function saveLeader(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });

    const name = leaderForm.name.trim();
    if (!name) return err("Leader name required.");
    if (!leaderForm.depotId) return err("Select a depot.");
    if (!leaderForm.companyId) return err("Select a company.");
    if (!leaderForm.platoonId) return err("Select a platoon.");

    if (leaderPhotoFile && leaderForm.photoURL.trim()) {
      return err("Choose either an upload or a photo URL, not both.");
    }

    const id = leaderForm.id || slugId(name);
    const fileError = validateFile(leaderPhotoFile);
    if (fileError) return err(fileError);

    let photoURL = leaderForm.photoURL.trim();
    setLeaderUploading(!!leaderPhotoFile);

    try {
      if (leaderPhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType: "agents", entityId: id, file: leaderPhotoFile });
          photoURL = upload.publicUrl;
        } catch (uploadErr) {
          console.error(uploadErr);
          setLeaderUploading(false);
          return err("Upload failed. Please try again.");
        }
      }

      await upsertAgent({
        id,
        name,
        depotId: leaderForm.depotId,
        companyId: leaderForm.companyId,
        platoonId: leaderForm.platoonId,
        photoURL,
      });
      await fetchAgents();
      ok(leaderForm.id ? "Leader updated." : "Leader added.");
      clearLeader();
    } catch (e2) {
      console.error(e2);
      err("Save failed. Check permissions/rules.");
    } finally {
      setLeaderUploading(false);
    }
  }

  function editLeader(a) {
    setTab("leaders");
    setLeaderForm({
      id: a.id,
      name: a.name || "",
      depotId: a.depotId || "",
      companyId: a.companyId || "",
      platoonId: a.platoonId || "",
      photoURL: a.photoURL || "",
    });
    setLeaderPhotoFile(null);
    setLeaderFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Depots / Companies shared
  const simpleIdPreview = useMemo(
    () => simpleForm.id || slugId(simpleForm.name),
    [simpleForm.id, simpleForm.name]
  );

  function clearSimple() {
    setSimpleForm({ id: "", name: "", photoURL: "" });
    setSimplePhotoFile(null);
    setSimpleFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
  }

  async function saveSimple(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });

    const name = simpleForm.name.trim();
    if (!name) return err("Name required.");

    if (simplePhotoFile && simpleForm.photoURL.trim()) {
      return err("Choose either an upload or a photo URL, not both.");
    }

    const id = simpleForm.id || slugId(name);
    const payload = { name, photoURL: (simpleForm.photoURL || "").trim() };
    const fileError = validateFile(simplePhotoFile);
    if (fileError) return err(fileError);

    const entityType = tab === "depots" ? "depots" : "companies";
    setSimpleUploading(!!simplePhotoFile);

    try {
      if (simplePhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType, entityId: id, file: simplePhotoFile });
          payload.photoURL = upload.publicUrl;
        } catch (uploadErr) {
          console.error(uploadErr);
          setSimpleUploading(false);
          return err("Upload failed. Please try again.");
        }
      }

      if (tab === "depots") {
        await upsertDepot(id, payload);
        await fetchDepots();
      }
      if (tab === "companies") {
        await upsertCompany(id, payload);
        await fetchCompanies();
      }
      ok(simpleForm.id ? "Updated." : "Added.");
      clearSimple();
    } catch (e2) {
      console.error(e2);
      err("Save failed. Check permissions/rules.");
    } finally {
      setSimpleUploading(false);
    }
  }

  function editSimple(row) {
    setSimpleForm({ id: row.id, name: row.name || "", photoURL: row.photoURL || "" });
    setSimplePhotoFile(null);
    setSimpleFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Platoons
  const platoonIdPreview = useMemo(
    () => platoonForm.id || slugId(platoonForm.name),
    [platoonForm.id, platoonForm.name]
  );

  function clearPlatoon() {
    setPlatoonForm({ id: "", name: "", photoURL: "" });
    setPlatoonPhotoFile(null);
    setPlatoonFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
  }

  async function savePlatoon(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });

    const name = platoonForm.name.trim();
    if (!name) return err("Platoon name required.");

    if (platoonPhotoFile && platoonForm.photoURL.trim()) {
      return err("Choose either an upload or a photo URL, not both.");
    }

    const id = platoonForm.id || slugId(name);
    const payload = { name, photoURL: (platoonForm.photoURL || "").trim() };
    const fileError = validateFile(platoonPhotoFile);
    if (fileError) return err(fileError);
    setPlatoonUploading(!!platoonPhotoFile);

    try {
      if (platoonPhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType: "platoons", entityId: id, file: platoonPhotoFile });
          payload.photoURL = upload.publicUrl;
        } catch (uploadErr) {
          console.error(uploadErr);
          setPlatoonUploading(false);
          return err("Upload failed. Please try again.");
        }
      }

      await upsertPlatoon(id, payload);
      await fetchPlatoons();
      ok(platoonForm.id ? "Platoon updated." : "Platoon added.");
      clearPlatoon();
    } catch (e2) {
      console.error(e2);
      err("Save failed. Check permissions/rules.");
    } finally {
      setPlatoonUploading(false);
    }
  }

  function editPlatoon(row) {
    setPlatoonForm({ id: row.id, name: row.name || "", photoURL: row.photoURL || "" });
    setPlatoonPhotoFile(null);
    setPlatoonFileKey(k => k + 1);
    setStatus({ type: "", msg: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- UI
  return (
    <div className="p-page">
      <div className="p-head">
        <div className="p-tabs">
          <button className={`p-tab ${tab === "leaders" ? "active" : ""}`} onClick={() => { setTab("leaders"); setStatus({type:"",msg:""}); }}>
            Leaders
          </button>
          <button className={`p-tab ${tab === "companies" ? "active" : ""}`} onClick={() => { setTab("companies"); clearSimple(); }}>
            Companies
          </button>
          <button className={`p-tab ${tab === "depots" ? "active" : ""}`} onClick={() => { setTab("depots"); clearSimple(); }}>
            Depots
          </button>
          <button className={`p-tab ${tab === "platoons" ? "active" : ""}`} onClick={() => { setTab("platoons"); clearPlatoon(); }}>
            Platoons
          </button>
        </div>

        <div className="p-title-row">
          <h2 className="p-title">Participants</h2>
          <button
            className="btn-primary"
            onClick={() => {
              if (tab === "leaders") clearLeader();
              if (tab === "companies" || tab === "depots") clearSimple();
              if (tab === "platoons") clearPlatoon();
            }}
          >
            Add +
          </button>
        </div>

        {status.msg && <div className={`p-status ${status.type === "ok" ? "ok" : "error"}`}>{status.msg}</div>}
      </div>

      {/* FORM AREA */}
      {tab === "leaders" && (
        <div className="card">
          <div className="card-title">{leaderForm.id ? "Edit Leader" : "Add Leader"}</div>

          <form className="form" onSubmit={saveLeader}>
            <div className="grid">
              <div className="field">
                <label>Leader Name</label>
                <input value={leaderForm.name} onChange={(e) => setLeaderForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field">
                <label>Depot</label>
                <select value={leaderForm.depotId} onChange={(e) => setLeaderForm(s => ({ ...s, depotId: e.target.value }))}>
                  <option value="">Select depot…</option>
                  {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Company</label>
                <select value={leaderForm.companyId} onChange={(e) => setLeaderForm(s => ({ ...s, companyId: e.target.value }))}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Platoon</label>
                <select value={leaderForm.platoonId} onChange={(e) => setLeaderForm(s => ({ ...s, platoonId: e.target.value }))}>
                  <option value="">Select platoon…</option>
                  {platoons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Photo (optional)</label>
                <div className="photo-options">
                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!!leaderPhotoFile}
                        onChange={() => {
                          setLeaderPhotoFile(null);
                          setLeaderFileKey(k => k + 1);
                        }}
                        disabled={!!leaderForm.photoURL}
                      />
                      Upload Photo
                    </label>
                    <input
                      key={leaderFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      disabled={!!leaderForm.photoURL}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setLeaderPhotoFile(file || null);
                        if (file) {
                          setLeaderForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  </div>

                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!leaderPhotoFile && !!leaderForm.photoURL}
                        onChange={() => {
                          if (leaderForm.photoURL) {
                            setLeaderForm(s => ({ ...s, photoURL: "" }));
                          }
                        }}
                        disabled={!!leaderPhotoFile}
                      />
                      Use Photo URL
                    </label>
                    <input
                      value={leaderForm.photoURL}
                      placeholder="https://..."
                      disabled={!!leaderPhotoFile}
                      onChange={(e) => {
                        setLeaderPhotoFile(null);
                        setLeaderFileKey(k => k + 1);
                        setLeaderForm(s => ({ ...s, photoURL: e.target.value }));
                      }}
                    />
                  </div>

                  <div className="actions" style={{ padding: 0 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setLeaderPhotoFile(null);
                        setLeaderFileKey(k => k + 1);
                        setLeaderForm(s => ({ ...s, photoURL: "" }));
                      }}
                    >
                      Clear Photo
                    </button>
                  </div>

                  <div className="hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                  {leaderUploading && <div className="hint">Uploading…</div>}
                </div>
              </div>
            </div>

            <div className="hint">Agent ID: <b>{leaderIdPreview || "(auto)"}</b></div>

            <div className="actions">
              <button className="btn-primary" type="submit" disabled={leaderUploading}>{leaderForm.id ? "Save Changes" : "Save"}</button>
              <button className="btn" type="button" onClick={clearLeader}>Clear</button>
            </div>
          </form>
        </div>
      )}

      {(tab === "companies" || tab === "depots") && (
        <div className="card">
          <div className="card-title">{simpleForm.id ? `Edit ${tab === "companies" ? "Company" : "Depot"}` : `Add ${tab === "companies" ? "Company" : "Depot"}`}</div>

          <form className="form" onSubmit={saveSimple}>
            <div className="grid">
              <div className="field">
                <label>Name</label>
                <input value={simpleForm.name} onChange={(e) => setSimpleForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field">
                <label>Photo (optional)</label>
                <div className="photo-options">
                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!!simplePhotoFile}
                        onChange={() => {
                          setSimplePhotoFile(null);
                          setSimpleFileKey(k => k + 1);
                        }}
                        disabled={!!simpleForm.photoURL}
                      />
                      Upload Photo
                    </label>
                    <input
                      key={simpleFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      disabled={!!simpleForm.photoURL}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setSimplePhotoFile(file || null);
                        if (file) {
                          setSimpleForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  </div>

                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!simplePhotoFile && !!simpleForm.photoURL}
                        onChange={() => {
                          if (simpleForm.photoURL) {
                            setSimpleForm(s => ({ ...s, photoURL: "" }));
                          }
                        }}
                        disabled={!!simplePhotoFile}
                      />
                      Use Photo URL
                    </label>
                    <input
                      value={simpleForm.photoURL}
                      placeholder="https://..."
                      disabled={!!simplePhotoFile}
                      onChange={(e) => {
                        setSimplePhotoFile(null);
                        setSimpleFileKey(k => k + 1);
                        setSimpleForm(s => ({ ...s, photoURL: e.target.value }));
                      }}
                    />
                  </div>

                  <div className="actions" style={{ padding: 0 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSimplePhotoFile(null);
                        setSimpleFileKey(k => k + 1);
                        setSimpleForm(s => ({ ...s, photoURL: "" }));
                      }}
                    >
                      Clear Photo
                    </button>
                  </div>

                  <div className="hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                  {simpleUploading && <div className="hint">Uploading…</div>}
                </div>
              </div>
            </div>

            <div className="hint">ID: <b>{simpleIdPreview || "(auto)"}</b></div>

            <div className="actions">
              <button className="btn-primary" type="submit" disabled={simpleUploading}>{simpleForm.id ? "Save Changes" : "Save"}</button>
              <button className="btn" type="button" onClick={clearSimple}>Clear</button>
            </div>
          </form>
        </div>
      )}

      {tab === "platoons" && (
        <div className="card">
          <div className="card-title">{platoonForm.id ? "Edit Platoon" : "Add Platoon"}</div>

          <form className="form" onSubmit={savePlatoon}>
            <div className="grid">
              <div className="field">
                <label>Name</label>
                <input value={platoonForm.name} onChange={(e) => setPlatoonForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Photo (optional)</label>
                <div className="photo-options">
                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!!platoonPhotoFile}
                        onChange={() => {
                          setPlatoonPhotoFile(null);
                          setPlatoonFileKey(k => k + 1);
                        }}
                        disabled={!!platoonForm.photoURL}
                      />
                      Upload Photo
                    </label>
                    <input
                      key={platoonFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      disabled={!!platoonForm.photoURL}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setPlatoonPhotoFile(file || null);
                        if (file) {
                          setPlatoonForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  </div>

                  <div className="field" style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={!platoonPhotoFile && !!platoonForm.photoURL}
                        onChange={() => {
                          if (platoonForm.photoURL) {
                            setPlatoonForm(s => ({ ...s, photoURL: "" }));
                          }
                        }}
                        disabled={!!platoonPhotoFile}
                      />
                      Use Photo URL
                    </label>
                    <input
                      value={platoonForm.photoURL}
                      placeholder="https://..."
                      disabled={!!platoonPhotoFile}
                      onChange={(e) => {
                        setPlatoonPhotoFile(null);
                        setPlatoonFileKey(k => k + 1);
                        setPlatoonForm(s => ({ ...s, photoURL: e.target.value }));
                      }}
                    />
                  </div>

                  <div className="actions" style={{ padding: 0 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setPlatoonPhotoFile(null);
                        setPlatoonFileKey(k => k + 1);
                        setPlatoonForm(s => ({ ...s, photoURL: "" }));
                      }}
                    >
                      Clear Photo
                    </button>
                  </div>

                  <div className="hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                  {platoonUploading && <div className="hint">Uploading…</div>}
                </div>
              </div>
            </div>

            <div className="hint">ID: <b>{platoonIdPreview || "(auto)"}</b></div>

            <div className="actions">
              <button className="btn-primary" type="submit" disabled={platoonUploading}>{platoonForm.id ? "Save Changes" : "Save"}</button>
              <button className="btn" type="button" onClick={clearPlatoon}>Clear</button>
            </div>
          </form>
        </div>
      )}

      {/* LIST AREA */}
      {tab === "leaders" && (
        <div className="card">
          <div className="card-title">Leaders List</div>
          <div className="table">
            <div className="t-head">
              <div>Leader</div><div>Depot</div><div>Company</div><div>Platoon</div><div className="t-right">Actions</div>
            </div>

            {agents.map(a => (
              <div className="t-row" key={a.id}>
                <div className="t-leader">
                  <div className="avatar">
                    {a.photoURL ? <img src={a.photoURL} alt={a.name} /> : <span className="initials">{getInitials(a.name)}</span>}
                  </div>
                  <div className="t-name">{a.name}</div>
                </div>
                <div>{depotById[a.depotId]?.name || a.depotId || "-"}</div>
                <div>{companyById[a.companyId]?.name || a.companyId || "-"}</div>
                <div>{platoonById[a.platoonId]?.name || a.platoonId || "-"}</div>
                <div className="t-right">
                  <button className="btn-link" onClick={() => editLeader(a)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "depots" && (
        <div className="card">
          <div className="card-title">Depots List</div>
          <div className="table">
            <div className="t-head">
              <div>Depot</div><div>Photo</div><div></div><div></div><div className="t-right">Actions</div>
            </div>

            {depots.map(d => (
              <div className="t-row" key={d.id}>
                <div className="t-leader">
                  <div className="avatar">
                    {d.photoURL ? <img src={d.photoURL} alt={d.name} /> : <span className="initials">{getInitials(d.name)}</span>}
                  </div>
                  <div className="t-name">{d.name}</div>
                </div>
                <div className="muted">{d.photoURL ? "Has photoURL" : "-"}</div>
                <div></div><div></div>
                <div className="t-right">
                  <button className="btn-link" onClick={() => { setTab("depots"); editSimple(d); }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "companies" && (
        <div className="card">
          <div className="card-title">Companies List</div>
          <div className="table">
            <div className="t-head">
              <div>Company</div><div>Photo</div><div></div><div></div><div className="t-right">Actions</div>
            </div>

            {companies.map(c => (
              <div className="t-row" key={c.id}>
                <div className="t-leader">
                  <div className="avatar">
                    {c.photoURL ? <img src={c.photoURL} alt={c.name} /> : <span className="initials">{getInitials(c.name)}</span>}
                  </div>
                  <div className="t-name">{c.name}</div>
                </div>
                <div className="muted">{c.photoURL ? "Has photoURL" : "-"}</div>
                <div></div><div></div>
                <div className="t-right">
                  <button className="btn-link" onClick={() => { setTab("companies"); editSimple(c); }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "platoons" && (
        <div className="card">
          <div className="card-title">Platoons List</div>
          <div className="table">
            <div className="t-head">
              <div>Platoon</div><div></div><div></div><div></div><div className="t-right">Actions</div>
            </div>

            {platoons.map(p => (
              <div className="t-row" key={p.id}>
                <div className="t-leader">
                  <div className="avatar">
                    {p.photoURL ? <img src={p.photoURL} alt={p.name} /> : <span className="initials">{getInitials(p.name)}</span>}
                  </div>
                  <div className="t-name">{p.name}</div>
                </div>
                <div></div><div></div><div></div>
                <div className="t-right">
                  <button className="btn-link" onClick={() => editPlatoon(p)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
