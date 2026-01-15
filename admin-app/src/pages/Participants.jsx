import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ModalForm } from "../components/ModalForm";
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

function normalizeName(input = "") {
  return input.trim().toLowerCase().replace(/[^a-z0-9\s]+/g, "").replace(/\s+/g, " ");
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

function useFilePreview(file) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    if (!file || !preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [file, preview]);

  return preview;
}

export default function Participants() {
  const [tab, setTab] = useState("leaders"); // leaders | companies | depots | platoons
  const [status, setStatus] = useState({ type: "", msg: "" });
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingTab, setPendingTab] = useState("");
  const [panelMinHeight, setPanelMinHeight] = useState(null);

  const animationTimerRef = useRef(null);
  const panelRef = useRef(null);

  const [agents, setAgents] = useState([]);
  const [depots, setDepots] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [platoons, setPlatoons] = useState([]);

  const [leaderPhotoFile, setLeaderPhotoFile] = useState(null);
  const [simplePhotoFile, setSimplePhotoFile] = useState(null);
  const [platoonPhotoFile, setPlatoonPhotoFile] = useState(null);

  const [leaderPhotoMode, setLeaderPhotoMode] = useState("upload");
  const [simplePhotoMode, setSimplePhotoMode] = useState("upload");
  const [platoonPhotoMode, setPlatoonPhotoMode] = useState("upload");

  const [leaderPhotoUrlInput, setLeaderPhotoUrlInput] = useState("");
  const [simplePhotoUrlInput, setSimplePhotoUrlInput] = useState("");
  const [platoonPhotoUrlInput, setPlatoonPhotoUrlInput] = useState("");

  const [leaderPhotoError, setLeaderPhotoError] = useState("");
  const [simplePhotoError, setSimplePhotoError] = useState("");
  const [platoonPhotoError, setPlatoonPhotoError] = useState("");

  const [leaderFileKey, setLeaderFileKey] = useState(0);
  const [simpleFileKey, setSimpleFileKey] = useState(0);
  const [platoonFileKey, setPlatoonFileKey] = useState(0);

  const [leaderUploading, setLeaderUploading] = useState(false);
  const [simpleUploading, setSimpleUploading] = useState(false);
  const [platoonUploading, setPlatoonUploading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAddCommanderOpen, setIsAddCommanderOpen] = useState(false);
  const [isAddDepotOpen, setIsAddDepotOpen] = useState(false);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);

  const leaderFilePreview = useFilePreview(leaderPhotoFile);
  const simpleFilePreview = useFilePreview(simplePhotoFile);
  const platoonFilePreview = useFilePreview(platoonPhotoFile);

  // --- forms
  const [leaderForm, setLeaderForm] = useState({
    id: "",
    name: "",
    depotId: "",
    companyId: "",
    platoonId: "",
    uplineId: "",
    role: "platoon",
    photoURL: "",
  });
  const [leaderOriginalId, setLeaderOriginalId] = useState("");

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
  const agentById = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);

  function ok(msg) { setStatus({ type: "ok", msg }); }
  function err(msg) { setStatus({ type: "error", msg }); }

  // ---- Leaders (agents)
  const leaderBaseSlug = useMemo(
    () => slugId(leaderForm.name),
    [leaderForm.name]
  );
  const leaderNameNormalized = useMemo(
    () => normalizeName(leaderForm.name),
    [leaderForm.name]
  );
  const isEditingLeader = !!leaderOriginalId;

  const leaderSuggestedId = useMemo(() => {
    if (isEditingLeader) return leaderOriginalId || leaderBaseSlug;
    if (!leaderBaseSlug) return "";
    if (!agents.some(a => a.id === leaderBaseSlug)) return leaderBaseSlug;
    let suffix = 2;
    while (agents.some(a => a.id === `${leaderBaseSlug}-${suffix}`)) {
      suffix += 1;
    }
    return `${leaderBaseSlug}-${suffix}`;
  }, [agents, isEditingLeader, leaderBaseSlug, leaderOriginalId]);

  const leaderIdConflict = useMemo(
    () => !isEditingLeader && !!leaderSuggestedId && agents.some(a => a.id === leaderSuggestedId),
    [agents, isEditingLeader, leaderSuggestedId]
  );

  const leaderNameConflict = useMemo(
    () => !!leaderNameNormalized && agents.some(a => {
      if (normalizeName(a.name) !== leaderNameNormalized) return false;
      if (isEditingLeader && a.id === leaderOriginalId) return false;
      return a.id !== leaderSuggestedId;
    }),
    [agents, isEditingLeader, leaderNameNormalized, leaderOriginalId, leaderSuggestedId]
  );

  const selfIdForUpline = leaderOriginalId || leaderSuggestedId;

  const availableUplineLeaders = useMemo(() => {
    // In edit mode, allow selecting the current leader as their own upline.
    // In add mode, keep self filtered out since the agent does not exist yet.
    if (isEditingLeader) return agents;
    return agents.filter(a => a.id !== selfIdForUpline);
  }, [agents, isEditingLeader, selfIdForUpline]);

  function handleLeaderModeChange(mode) {
    setLeaderPhotoMode(mode);
    setLeaderPhotoError("");

    if (mode === "upload") {
      setLeaderPhotoUrlInput("");
      setLeaderForm(s => ({ ...s, photoURL: "" }));
    }
    if (mode === "url") {
      setLeaderPhotoFile(null);
      setLeaderFileKey(k => k + 1);
    }
    if (mode === "none") {
      setLeaderPhotoFile(null);
      setLeaderFileKey(k => k + 1);
      setLeaderPhotoUrlInput("");
      setLeaderForm(s => ({ ...s, photoURL: "" }));
    }
  }

  function handleDepotChange(nextDepotId) {
    setLeaderForm(s => ({ ...s, depotId: nextDepotId }));
  }

  function clearLeader() {
    setLeaderForm({
      id: "",
      name: "",
      depotId: "",
      companyId: "",
      platoonId: "",
      uplineId: "",
      role: "platoon",
      photoURL: "",
    });
    setLeaderOriginalId("");
    setLeaderPhotoFile(null);
    setLeaderFileKey(k => k + 1);
    setLeaderPhotoMode("upload");
    setLeaderPhotoUrlInput("");
    setLeaderPhotoError("");
    setStatus({ type: "", msg: "" });
  }

  function handleLeaderClear() {
    clearLeader();
    setIsFormOpen(false);
  }

  async function saveLeader(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });
    setLeaderPhotoError("");

    const name = leaderForm.name.trim();
    if (!name) return err("Leader name required.");
    if (!leaderForm.depotId) return err("Select a depot.");
    if (!leaderForm.companyId) return err("Select a commander.");
    if (!leaderForm.platoonId) return err("Select a company.");

    const urlInput = leaderPhotoUrlInput.trim();
    if (leaderPhotoFile && urlInput) {
      const message = "Choose either an upload or a photo URL, not both.";
      setLeaderPhotoError(message);
      return err(message);
    }

    const id = isEditingLeader ? leaderOriginalId : leaderSuggestedId;
    if (!id) return err("Agent ID is required. Change the name or add a unique suffix.");
    if (leaderIdConflict) return err("Agent ID already exists. Change the name or add a unique suffix.");
    if (!isEditingLeader && leaderForm.uplineId && leaderForm.uplineId === id) {
      return err("Leader cannot be their own upline.");
    }
    const fileError = validateFile(leaderPhotoFile);
    if (fileError) {
      setLeaderPhotoError(fileError);
      return err(fileError);
    }

    let photoURL = leaderForm.photoURL.trim();
    if (leaderPhotoMode === "none") {
      photoURL = "";
    }
    setLeaderUploading(leaderPhotoMode === "upload" && !!leaderPhotoFile);

    try {
      if (leaderPhotoMode === "upload" && leaderPhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType: "agents", entityId: id, file: leaderPhotoFile });
          photoURL = `${upload.publicUrl}?v=${Date.now()}`;
        } catch (uploadErr) {
          console.error(uploadErr);
          setLeaderUploading(false);
          const message = `${uploadErr?.message || "Upload failed."} Check Supabase auth/RLS permissions.`;
          setLeaderPhotoError(message);
          return err(message);
        }
      } else if (leaderPhotoMode === "url") {
        photoURL = urlInput;
      }

      await upsertAgent({
        id,
        name,
        depotId: leaderForm.depotId,
        companyId: leaderForm.companyId,
        platoonId: leaderForm.platoonId,
        uplineAgentId: leaderForm.uplineId || null,
        role: leaderForm.role || "platoon",
        photoURL,
      });
      await fetchAgents();
      ok(isEditingLeader ? "Leader updated." : "Leader added.");
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
      uplineId: a.uplineAgentId || "",
      role: a.role || "platoon",
      photoURL: a.photoURL || "",
    });
    setLeaderOriginalId(a.id);
    setLeaderPhotoFile(null);
    setLeaderFileKey(k => k + 1);
    setLeaderPhotoMode(a.photoURL ? "url" : "upload");
    setLeaderPhotoUrlInput(a.photoURL || "");
    setLeaderPhotoError("");
    setStatus({ type: "", msg: "" });
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Depots / Companies shared
  const simpleIdPreview = useMemo(
    () => simpleForm.id || slugId(simpleForm.name),
    [simpleForm.id, simpleForm.name]
  );

  function handleSimpleModeChange(mode) {
    setSimplePhotoMode(mode);
    setSimplePhotoError("");

    if (mode === "upload") {
      setSimplePhotoUrlInput("");
      setSimpleForm(s => ({ ...s, photoURL: "" }));
    }
    if (mode === "url") {
      setSimplePhotoFile(null);
      setSimpleFileKey(k => k + 1);
    }
    if (mode === "none") {
      setSimplePhotoFile(null);
      setSimpleFileKey(k => k + 1);
      setSimplePhotoUrlInput("");
      setSimpleForm(s => ({ ...s, photoURL: "" }));
    }
  }

  function clearSimple() {
    setSimpleForm({ id: "", name: "", photoURL: "" });
    setSimplePhotoFile(null);
    setSimpleFileKey(k => k + 1);
    setSimplePhotoMode("upload");
    setSimplePhotoUrlInput("");
    setSimplePhotoError("");
    setStatus({ type: "", msg: "" });
  }

  function handleCommanderClear() {
    clearSimple();
    setIsAddCommanderOpen(false);
  }

  function handleDepotClear() {
    clearSimple();
    setIsAddDepotOpen(false);
  }

  async function saveSimple(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });
    setSimplePhotoError("");

    const name = simpleForm.name.trim();
    if (!name) return err("Name required.");

    const urlInput = simplePhotoUrlInput.trim();
    if (simplePhotoFile && urlInput) {
      const message = "Choose either an upload or a photo URL, not both.";
      setSimplePhotoError(message);
      return err(message);
    }

    const id = simpleForm.id || slugId(name);
    const payload = { name, photoURL: (simpleForm.photoURL || "").trim() };
    const fileError = validateFile(simplePhotoFile);
    if (fileError) {
      setSimplePhotoError(fileError);
      return err(fileError);
    }

    const entityType = tab === "depots" ? "depots" : "companies";
    if (simplePhotoMode === "none") {
      payload.photoURL = "";
    }
    setSimpleUploading(simplePhotoMode === "upload" && !!simplePhotoFile);

    try {
      if (simplePhotoMode === "upload" && simplePhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType, entityId: id, file: simplePhotoFile });
          payload.photoURL = `${upload.publicUrl}?v=${Date.now()}`;
        } catch (uploadErr) {
          console.error(uploadErr);
          setSimpleUploading(false);
          const message = `${uploadErr?.message || "Upload failed."} Check Supabase auth/RLS permissions.`;
          setSimplePhotoError(message);
          return err(message);
        }
      } else if (simplePhotoMode === "url") {
        payload.photoURL = urlInput;
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
    setSimplePhotoMode(row.photoURL ? "url" : "upload");
    setSimplePhotoUrlInput(row.photoURL || "");
    setSimplePhotoError("");
    setStatus({ type: "", msg: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Platoons
  const platoonIdPreview = useMemo(
    () => platoonForm.id || slugId(platoonForm.name),
    [platoonForm.id, platoonForm.name]
  );

  function handlePlatoonModeChange(mode) {
    setPlatoonPhotoMode(mode);
    setPlatoonPhotoError("");

    if (mode === "upload") {
      setPlatoonPhotoUrlInput("");
      setPlatoonForm(s => ({ ...s, photoURL: "" }));
    }
    if (mode === "url") {
      setPlatoonPhotoFile(null);
      setPlatoonFileKey(k => k + 1);
    }
    if (mode === "none") {
      setPlatoonPhotoFile(null);
      setPlatoonFileKey(k => k + 1);
      setPlatoonPhotoUrlInput("");
      setPlatoonForm(s => ({ ...s, photoURL: "" }));
    }
  }

  function clearPlatoon() {
    setPlatoonForm({ id: "", name: "", photoURL: "" });
    setPlatoonPhotoFile(null);
    setPlatoonFileKey(k => k + 1);
    setPlatoonPhotoMode("upload");
    setPlatoonPhotoUrlInput("");
    setPlatoonPhotoError("");
    setStatus({ type: "", msg: "" });
  }

  function handleCompanyClear() {
    clearPlatoon();
    setIsAddCompanyOpen(false);
  }

  async function savePlatoon(e) {
    e.preventDefault();
    setStatus({ type: "", msg: "" });
    setPlatoonPhotoError("");

    const name = platoonForm.name.trim();
    if (!name) return err("Company name required.");

    const urlInput = platoonPhotoUrlInput.trim();
    if (platoonPhotoFile && urlInput) {
      const message = "Choose either an upload or a photo URL, not both.";
      setPlatoonPhotoError(message);
      return err(message);
    }

    const id = platoonForm.id || slugId(name);
    const payload = { name, photoURL: (platoonForm.photoURL || "").trim() };
    const fileError = validateFile(platoonPhotoFile);
    if (fileError) {
      setPlatoonPhotoError(fileError);
      return err(fileError);
    }
    if (platoonPhotoMode === "none") {
      payload.photoURL = "";
    }
    setPlatoonUploading(platoonPhotoMode === "upload" && !!platoonPhotoFile);

    try {
      if (platoonPhotoMode === "upload" && platoonPhotoFile) {
        try {
          const upload = await uploadAvatar({ entityType: "platoons", entityId: id, file: platoonPhotoFile });
          payload.photoURL = `${upload.publicUrl}?v=${Date.now()}`;
        } catch (uploadErr) {
          console.error(uploadErr);
          setPlatoonUploading(false);
          const message = `${uploadErr?.message || "Upload failed."} Check Supabase auth/RLS permissions.`;
          setPlatoonPhotoError(message);
          return err(message);
        }
      } else if (platoonPhotoMode === "url") {
        payload.photoURL = urlInput;
      }

      await upsertPlatoon(id, payload);
      await fetchPlatoons();
      ok(platoonForm.id ? "Company updated." : "Company added.");
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
    setPlatoonPhotoMode(row.photoURL ? "url" : "upload");
    setPlatoonPhotoUrlInput(row.photoURL || "");
    setPlatoonPhotoError("");
    setStatus({ type: "", msg: "" });
    setIsAddCompanyOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const leaderPhotoPreviewUrl = leaderFilePreview || leaderPhotoUrlInput.trim() || leaderForm.photoURL.trim();
  const simplePhotoPreviewUrl = simpleFilePreview || simplePhotoUrlInput.trim() || simpleForm.photoURL.trim();
  const platoonPhotoPreviewUrl = platoonFilePreview || platoonPhotoUrlInput.trim() || platoonForm.photoURL.trim();
  const activeModal = isFormOpen
    ? "leader"
    : isAddCommanderOpen
      ? "commander"
      : isAddDepotOpen
        ? "depot"
        : isAddCompanyOpen
          ? "company"
          : "";
  const isModalOpen = !!activeModal;
  const simpleModalType = activeModal === "commander" ? "companies" : activeModal === "depot" ? "depots" : "";
  const simpleModalTitle = simpleModalType
    ? simpleForm.id
      ? `Edit ${simpleModalType === "companies" ? "Commander" : "Depot"}`
      : `Add ${simpleModalType === "companies" ? "Commander" : "Depot"}`
    : "";

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (isAnimating) return;
    const panelEl = panelRef.current;
    if (!panelEl) return;
    setPanelMinHeight(panelEl.offsetHeight);
  }, [tab, isAnimating]);

  function handleTabChange(nextTab) {
    if (nextTab === tab && !pendingTab) return;
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);

    const panelEl = panelRef.current;
    if (panelEl) setPanelMinHeight(panelEl.offsetHeight);

    setPendingTab(nextTab);
    setIsAnimating(true);

    animationTimerRef.current = setTimeout(() => {
      setTab(nextTab);
      setIsAnimating(false);
      setPendingTab("");
      if (nextTab !== "leaders") setIsFormOpen(false);
      if (nextTab !== "companies") setIsAddCommanderOpen(false);
      if (nextTab !== "depots") setIsAddDepotOpen(false);
      if (nextTab !== "platoons") setIsAddCompanyOpen(false);
    }, 100);
  }

  function handleModalOverlayClose(e) {
    if (e.target === e.currentTarget) closeAllModals();
  }

  function closeAllModals() {
    setIsFormOpen(false);
    setIsAddCommanderOpen(false);
    setIsAddDepotOpen(false);
    setIsAddCompanyOpen(false);
  }

  const isAnyModalOpen = isFormOpen || isAddCommanderOpen || isAddDepotOpen || isAddCompanyOpen;

  useEffect(() => {
    if (!isAnyModalOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeAllModals();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAnyModalOpen]);

  useEffect(() => {
    return undefined;
  }, []);

  // ---- UI
  return (
    <div className="p-page">
      <div className="p-head">
        <div className="tabs">
          <button
            className={`tab-button${tab === "leaders" ? " active" : ""}`}
            onClick={() => { handleTabChange("leaders"); setStatus({type:"",msg:""}); }}
          >
            Leaders
          </button>
          <button
            className={`tab-button${tab === "companies" ? " active" : ""}`}
            onClick={() => { handleTabChange("companies"); clearSimple(); }}
          >
            Commanders
          </button>
          <button
            className={`tab-button${tab === "depots" ? " active" : ""}`}
            onClick={() => { handleTabChange("depots"); clearSimple(); }}
          >
            Depots
          </button>
          <button
            className={`tab-button${tab === "platoons" ? " active" : ""}`}
            onClick={() => { handleTabChange("platoons"); clearPlatoon(); }}
          >
            Companies
          </button>
        </div>

        <div className="p-title-row">
          <h2 className="p-title">Participants</h2>
          <button
            className="btn-primary"
            onClick={() => {
              if (tab === "leaders") {
                clearLeader();
                setIsFormOpen(true);
                return;
              }
              if (tab === "companies") {
                clearSimple();
                setIsAddCommanderOpen(true);
                return;
              }
              if (tab === "depots") {
                clearSimple();
                setIsAddDepotOpen(true);
                return;
              }
              if (tab === "platoons") {
                clearPlatoon();
                setIsAddCompanyOpen(true);
              }
            }}
          >
            Add +
          </button>
        </div>

        {status.msg && (
          <div className={`p-status ${status.type === "ok" ? "ok" : status.type === "warn" ? "warn" : "error"}`}>
            {status.msg}
          </div>
        )}
      </div>

      <div
        className="tab-panel"
        data-state={isAnimating ? "out" : "in"}
        ref={panelRef}
        style={panelMinHeight ? { minHeight: panelMinHeight } : undefined}
      >
      {/* FORM AREA */}
      <ModalForm
        isOpen={isModalOpen}
        onOverlayClose={handleModalOverlayClose}
        onSubmit={
          activeModal === "leader"
            ? saveLeader
            : activeModal === "company"
              ? savePlatoon
              : saveSimple
        }
        title={
          activeModal === "leader"
            ? (leaderForm.id ? "Edit Leader" : "Add Leader")
            : activeModal === "company"
              ? (platoonForm.id ? "Edit Company" : "Add Company")
              : simpleModalTitle
        }
        onClose={closeAllModals}
        footer={
          activeModal === "leader" ? (
            <>
              <button className="btn-primary" type="submit" disabled={leaderUploading || leaderIdConflict}>{isEditingLeader ? "Save Changes" : "Save"}</button>
              <button className="btn" type="button" onClick={handleLeaderClear}>Clear</button>
            </>
          ) : activeModal === "company" ? (
            <>
              <button className="btn-primary" type="submit" disabled={platoonUploading}>{platoonForm.id ? "Save Changes" : "Save"}</button>
              <button className="btn" type="button" onClick={handleCompanyClear}>Clear</button>
            </>
          ) : (
            <>
              <button className="btn-primary" type="submit" disabled={simpleUploading}>{simpleForm.id ? "Save Changes" : "Save"}</button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  if (simpleModalType === "companies") handleCommanderClear();
                  if (simpleModalType === "depots") handleDepotClear();
                }}
              >
                Clear
              </button>
            </>
          )
        }
      >
        {activeModal === "leader" && (
          <>
            <div className="grid">
              <div className="field">
                <label>Leader Name</label>
                <input value={leaderForm.name} onChange={(e) => setLeaderForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field">
                <label>Agent ID</label>
                <input
                  value={leaderSuggestedId}
                  className={leaderIdConflict ? "input-error" : ""}
                  placeholder="Auto from name. Add suffix for uniqueness (e.g., juan-dela-cruz-2)."
                  readOnly
                />
              </div>

              <div className="field">
                <label>Depot</label>
                <select value={leaderForm.depotId} onChange={(e) => handleDepotChange(e.target.value)}>
                  <option value="">Select depot</option>
                  {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Commander</label>
                <select value={leaderForm.companyId} onChange={(e) => setLeaderForm(s => ({ ...s, companyId: e.target.value }))}>
                  <option value="">Select commander</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Company</label>
                <select value={leaderForm.platoonId} onChange={(e) => setLeaderForm(s => ({ ...s, platoonId: e.target.value }))}>
                  <option value="">Select company</option>
                  {platoons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Upline (optional)</label>
                <select
                  value={leaderForm.uplineId}
                  onChange={(e) => setLeaderForm(s => ({ ...s, uplineId: e.target.value }))}
                  disabled={availableUplineLeaders.length === 0}
                >
                  <option value="">
                    {availableUplineLeaders.length === 0 ? "No leaders available" : "Select upline"}
                  </option>
                  {availableUplineLeaders.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Role</label>
                <select value={leaderForm.role || "platoon"} onChange={(e) => setLeaderForm(s => ({ ...s, role: e.target.value }))}>
                  <option value="platoon">Platoon Leader</option>
                  <option value="squad">Squad Leader</option>
                  <option value="team">Team Leader</option>
                </select>
              </div>

              <div className="field photo-section">
                <label>Photo (optional)</label>
                <div className="photo-mode-toggle">
                  <button
                    type="button"
                    className={`photo-mode-pill ${leaderPhotoMode === "upload" ? "active" : ""}`}
                    onClick={() => handleLeaderModeChange("upload")}
                  >
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    className={`photo-mode-pill ${leaderPhotoMode === "url" ? "active" : ""}`}
                    onClick={() => handleLeaderModeChange("url")}
                  >
                    Use Photo URL
                  </button>
                </div>

                <div className="photo-input-row">
                  <div className="photo-preview">
                    {leaderPhotoPreviewUrl ? (
                      <img src={leaderPhotoPreviewUrl} alt={leaderForm.name || "Preview"} />
                    ) : (
                      <span className="initials">{getInitials(leaderForm.name)}</span>
                    )}
                  </div>

                  {leaderPhotoMode === "upload" && (
                    <input
                      key={leaderFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setLeaderPhotoFile(file || null);
                        setLeaderPhotoError("");
                        if (file) {
                          setLeaderPhotoUrlInput("");
                          setLeaderForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  )}

                  {leaderPhotoMode === "url" && (
                    <input
                      value={leaderPhotoUrlInput}
                      placeholder="https://..."
                      onChange={(e) => {
                        setLeaderPhotoUrlInput(e.target.value);
                        setLeaderPhotoError("");
                      }}
                    />
                  )}
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setLeaderPhotoFile(null);
                      setLeaderFileKey(k => k + 1);
                      setLeaderPhotoUrlInput("");
                      setLeaderPhotoError("");
                      setLeaderPhotoMode("upload");
                      setLeaderForm(s => ({ ...s, photoURL: "" }));
                    }}
                  >
                    Clear Photo
                  </button>
                </div>

                <div className="photo-hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                {leaderPhotoError && <div className="photo-error">{leaderPhotoError}</div>}
                {leaderUploading && <div className="hint">Uploading...</div>}
              </div>
            </div>

            {leaderIdConflict ? (
              <div className="p-status warn">Agent ID already exists. Change the name or add a unique suffix.</div>
            ) : leaderNameConflict ? (
              <div className="p-status warn">Another leader with the same name exists. Use agent_id in uploads to avoid ambiguity.</div>
            ) : null}
          </>
        )}

        {(activeModal === "commander" || activeModal === "depot") && (
          <>
            <div className="grid">
              <div className="field">
                <label>Name</label>
                <input value={simpleForm.name} onChange={(e) => setSimpleForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field photo-section">
                <label>Photo (optional)</label>
                <div className="photo-mode-toggle">
                  <button
                    type="button"
                    className={`photo-mode-pill ${simplePhotoMode === "upload" ? "active" : ""}`}
                    onClick={() => handleSimpleModeChange("upload")}
                  >
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    className={`photo-mode-pill ${simplePhotoMode === "url" ? "active" : ""}`}
                    onClick={() => handleSimpleModeChange("url")}
                  >
                    Use Photo URL
                  </button>
                </div>

                <div className="photo-input-row">
                  <div className="photo-preview">
                    {simplePhotoPreviewUrl ? (
                      <img src={simplePhotoPreviewUrl} alt={simpleForm.name || "Preview"} />
                    ) : (
                      <span className="initials">{getInitials(simpleForm.name)}</span>
                    )}
                  </div>

                  {simplePhotoMode === "upload" && (
                    <input
                      key={simpleFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setSimplePhotoFile(file || null);
                        setSimplePhotoError("");
                        if (file) {
                          setSimplePhotoUrlInput("");
                          setSimpleForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  )}

                  {simplePhotoMode === "url" && (
                    <input
                      value={simplePhotoUrlInput}
                      placeholder="https://..."
                      onChange={(e) => {
                        setSimplePhotoUrlInput(e.target.value);
                        setSimplePhotoError("");
                      }}
                    />
                  )}
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setSimplePhotoFile(null);
                      setSimpleFileKey(k => k + 1);
                      setSimplePhotoUrlInput("");
                      setSimplePhotoError("");
                      setSimplePhotoMode("upload");
                      setSimpleForm(s => ({ ...s, photoURL: "" }));
                    }}
                  >
                    Clear Photo
                  </button>
                </div>

                <div className="photo-hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                {simplePhotoError && <div className="photo-error">{simplePhotoError}</div>}
                {simpleUploading && <div className="hint">Uploading...</div>}
              </div>
            </div>

            <div className="hint">ID: <b>{simpleIdPreview || "(auto)"}</b></div>
          </>
        )}

        {activeModal === "company" && (
          <>
            <div className="grid">
              <div className="field">
                <label>Name</label>
                <input value={platoonForm.name} onChange={(e) => setPlatoonForm(s => ({ ...s, name: e.target.value }))} />
              </div>

              <div className="field photo-section">
                <label>Photo (optional)</label>
                <div className="photo-mode-toggle">
                  <button
                    type="button"
                    className={`photo-mode-pill ${platoonPhotoMode === "upload" ? "active" : ""}`}
                    onClick={() => handlePlatoonModeChange("upload")}
                  >
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    className={`photo-mode-pill ${platoonPhotoMode === "url" ? "active" : ""}`}
                    onClick={() => handlePlatoonModeChange("url")}
                  >
                    Use Photo URL
                  </button>
                </div>

                <div className="photo-input-row">
                  <div className="photo-preview">
                    {platoonPhotoPreviewUrl ? (
                      <img src={platoonPhotoPreviewUrl} alt={platoonForm.name || "Preview"} />
                    ) : (
                      <span className="initials">{getInitials(platoonForm.name)}</span>
                    )}
                  </div>

                  {platoonPhotoMode === "upload" && (
                    <input
                      key={platoonFileKey}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setPlatoonPhotoFile(file || null);
                        setPlatoonPhotoError("");
                        if (file) {
                          setPlatoonPhotoUrlInput("");
                          setPlatoonForm(s => ({ ...s, photoURL: "" }));
                        }
                      }}
                    />
                  )}

                  {platoonPhotoMode === "url" && (
                    <input
                      value={platoonPhotoUrlInput}
                      placeholder="https://..."
                      onChange={(e) => {
                        setPlatoonPhotoUrlInput(e.target.value);
                        setPlatoonPhotoError("");
                      }}
                    />
                  )}
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setPlatoonPhotoFile(null);
                      setPlatoonFileKey(k => k + 1);
                      setPlatoonPhotoUrlInput("");
                      setPlatoonPhotoError("");
                      setPlatoonPhotoMode("upload");
                      setPlatoonForm(s => ({ ...s, photoURL: "" }));
                    }}
                  >
                    Clear Photo
                  </button>
                </div>

                <div className="photo-hint">PNG, JPG, or WEBP up to 2MB. Upload OR URL, not both.</div>
                {platoonPhotoError && <div className="photo-error">{platoonPhotoError}</div>}
                {platoonUploading && <div className="hint">Uploading...</div>}
              </div>
            </div>

            <div className="hint">ID: <b>{platoonIdPreview || "(auto)"}</b></div>
          </>
        )}
      </ModalForm>
      {/* LIST AREA */}
      {tab === "leaders" && (
        <div className="card">
          <div className="card-title">Leaders List</div>
          <div className="table-scroll-y">
            <div className="table">
              <div className="t-head">
                <div>Leader</div><div>Depot</div><div>Commander</div><div>Company</div><div>Upline</div><div className="t-right">Actions</div>
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
                  <div>{a.uplineAgentId ? (agentById[a.uplineAgentId]?.name || a.uplineAgentId) : "-"}</div>
                  <div className="t-right">
                    <button className="btn-link" onClick={() => editLeader(a)}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
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
                  <button className="btn-link" onClick={() => { setTab("depots"); editSimple(d); setIsAddDepotOpen(true); }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "companies" && (
        <div className="card">
          <div className="card-title">Commanders List</div>
          <div className="table">
            <div className="t-head">
              <div>Commander</div><div>Photo</div><div></div><div></div><div className="t-right">Actions</div>
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
                  <button className="btn-link" onClick={() => { setTab("companies"); editSimple(c); setIsAddCommanderOpen(true); }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "platoons" && (
        <div className="card">
          <div className="card-title">Companies List</div>
          <div className="table">
            <div className="t-head">
              <div>Company</div><div></div><div></div><div></div><div className="t-right">Actions</div>
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
    </div>
  );
}






