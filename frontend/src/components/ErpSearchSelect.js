import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Searchable single-select (replaces native <select> for product/client pickers).
 */
export default function ErpSearchSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = "—",
  disabled = false,
  getOptionValue = (o) => String(o.value ?? o._id ?? ""),
  getOptionLabel = (o) => String(o.label ?? o.name ?? "—"),
  emptyMessage = "No matches",
  "aria-label": ariaLabel,
}) {
  const reactId = useId();
  const inputId = id || `erp-sel-${reactId}`;
  const listId = `${inputId}-listbox`;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState(null);

  const selected = useMemo(
    () =>
      options.find((o) => getOptionValue(o) === String(value ?? "")) || null,
    [options, value, getOptionValue]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      getOptionLabel(o).toLowerCase().includes(q)
    );
  }, [options, query, getOptionLabel]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        close();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !inputRef.current) {
      setMenuPos(null);
      return;
    }
    const sync = () => {
      const r = inputRef.current.getBoundingClientRect();
      setMenuPos({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        maxHeight: Math.min(280, window.innerHeight - r.bottom - 16),
      });
    };
    sync();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [open, query]);

  const pick = (opt) => {
    onChange(getOptionValue(opt));
    close();
    inputRef.current?.blur();
  };

  const onInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && open && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
      return;
    }
    if (e.key === "Escape") {
      close();
    }
  };

  const displayValue = open
    ? query
    : selected
      ? getOptionLabel(selected)
      : "";

  const dropdown =
    open && !disabled && menuPos
      ? createPortal(
          <ul
            id={listId}
            className="erp-search-select__menu"
            role="listbox"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: 10050,
            }}
          >
            {filtered.length === 0 ? (
              <li className="erp-search-select__empty" role="presentation">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((opt, i) => {
                const val = getOptionValue(opt);
                const active = i === highlight;
                const sel = String(value) === val;
                return (
                  <li
                    key={val || `opt-${i}`}
                    role="option"
                    aria-selected={sel}
                    className={
                      "erp-search-select__option" +
                      (active ? " erp-search-select__option--active" : "") +
                      (sel ? " erp-search-select__option--selected" : "")
                    }
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      pick(opt);
                    }}
                  >
                    {getOptionLabel(opt)}
                  </li>
                );
              })
            )}
          </ul>,
          document.body
        )
      : null;

  return (
    <div className="erp-search-select" ref={rootRef}>
      <div className="erp-search-select__control">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="erp-search-select__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          onKeyDown={onInputKeyDown}
        />
        <span className="erp-search-select__chev" aria-hidden />
      </div>
      {dropdown}
    </div>
  );
}
