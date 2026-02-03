import React from "react";

function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0 0-1.4Z"
      />
    </svg>
  );
}

export function ModalForm({ isOpen, onOverlayClose, onSubmit, title, onClose, children, footer }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onMouseDown={onOverlayClose}>
      <form className="modal-form form" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <div className="actions">{footer}</div>
        </div>  
      </form>
    </div>
  );
}
