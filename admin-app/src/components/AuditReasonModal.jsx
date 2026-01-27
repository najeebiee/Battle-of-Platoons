import React from "react";
import { ModalForm } from "./ModalForm";

export function AuditReasonModal({
  isOpen,
  title,
  description,
  reason,
  onReasonChange,
  confirmLabel,
  onCancel,
  onConfirm,
  error,
  submitting,
  progressText,
  placeholder = "Incorrect entry, pending verification from depot.",
}) {
  const trimmed = reason?.trim() ?? "";

  return (
    <ModalForm
      isOpen={isOpen}
      onOverlayClose={onCancel}
      onClose={onCancel}
      onSubmit={event => {
        event.preventDefault();
        if (submitting || !trimmed) return;
        onConfirm();
      }}
      title={title}
      footer={(
        <>
          <button type="button" className="button secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={submitting || !trimmed}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        {description}
      </p>
      {progressText ? (
        <div className="muted" style={{ marginBottom: 12 }}>
          {progressText}
        </div>
      ) : null}
      <label className="form-label" htmlFor="audit-reason">
        Reason
      </label>
      <textarea
        id="audit-reason"
        value={reason}
        onChange={e => onReasonChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight: 120 }}
        required
      />
      {error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </ModalForm>
  );
}
