import React from "react";

function ExcelIcon({ size = 16 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v4h2V4h7v4a2 2 0 0 0 2 2h4v10a2 2 0 0 1-2 2h-7v-2h7V12h-3a2 2 0 0 1-2-2V2zm2 6h4l-4-4v4zM3 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm6.6 9 1.4-2.2L9 15l2-2h-2.2l-1.2 1.6L6.4 13H4.2l2 2-2 2h2.2l1.2-1.6L8.8 17H11l-1.9 2z" />
    </svg>
  );
}

export default function ExportButton({
  onClick,
  loading,
  label = "Export CSV",
  loadingLabel = "Exporting...",
  disabled = false,
  className = "",
}) {
  return (
    <button
      type="button"
      className={`button secondary export-button ${className}`.trim()}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <ExcelIcon size={16} />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
}
