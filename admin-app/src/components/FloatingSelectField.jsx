import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/components/floating-select.css";

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
    >
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

export function FloatingSelectField({
  label,
  required = false,
  placeholder = "Select",
  searchPlaceholder = "Search",
  valueText = "",
  searchValue = "",
  onSearchChange,
  options = [],
  selectedId = "",
  onSelect,
  emptyText = "No options found.",
  className = "",
  isOpen,
  onOpenChange,
  disabled = false,
  hasError = false,
  showId = true,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const controlled = typeof isOpen === "boolean";
  const open = controlled ? isOpen : internalOpen;

  function setOpen(next) {
    if (disabled) {
      if (!next) onOpenChange?.(false);
      return;
    }
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  const resolvedLabel = useMemo(() => valueText || placeholder, [placeholder, valueText]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [open, searchValue, options.length]);

  useEffect(() => {
    if (!open) return;
    const handleViewportChange = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelStyle({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    const handleOutside = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className={`field ${className}`.trim()}>
      {label ? <label>{label} {required ? <span className="req">*</span> : null}</label> : null}
      <div ref={triggerRef} className={`floating-select${open ? " is-open" : ""}${hasError ? " has-error" : ""}${disabled ? " is-disabled" : ""}`}>
        <button
          type="button"
          className="floating-select__trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          disabled={disabled}
        >
          <span>{resolvedLabel}</span>
          <ChevronIcon open={open} />
        </button>
      </div>
      {open
        ? createPortal(
          <div
            ref={panelRef}
            className="floating-select-panel"
            style={{ top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
          >
            <input
              type="text"
              value={searchValue}
              onChange={e => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
            />
            <div className="floating-select-panel__list">
              {options.length ? (
                options.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={`floating-select-panel__item${selectedId === option.id ? " is-active" : ""}`}
                    onClick={() => {
                      onSelect?.(option);
                      setOpen(false);
                    }}
                  >
                    <span className="floating-select-panel__name">{option.name}</span>
                    {showId ? <span className="floating-select-panel__id">{option.id}</span> : null}
                  </button>
                ))
              ) : (
                <div className="floating-select-panel__empty">{emptyText}</div>
              )}
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
