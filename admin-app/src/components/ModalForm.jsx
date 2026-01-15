import React from "react";

export function ModalForm({ isOpen, onOverlayClose, onSubmit, title, onClose, children, footer }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onMouseDown={onOverlayClose}>
      <form className="modal-form form" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <div className="actions">{footer}</div>
        </div>
      </form>
    </div>
  );
}
