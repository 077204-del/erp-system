import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  defaultLocale,
  messages,
  resolvePath,
} from "../i18n/messages";

const STORAGE_KEY = "erp-locale";

const LocaleContext = createContext(null);

function applyDocumentLocale(locale) {
  const loc = locale === "fr" || locale === "en" ? locale : "ar";
  const dir = loc === "ar" ? "rtl" : "ltr";
  document.documentElement.setAttribute("lang", loc === "ar" ? "ar" : loc);
  document.documentElement.setAttribute("dir", dir);
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    /* ignore */
  }
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "fr" || s === "en" || s === "ar") return s;
    } catch {
      /* ignore */
    }
    return defaultLocale;
  });

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (next === "fr" || next === "en" || next === "ar") {
      setLocaleState(next);
    }
  }, []);

  const table = messages[locale] || messages.ar;

  const t = useCallback(
    (path, fallback = "") => {
      const v = resolvePath(table, path);
      if (typeof v === "string" && v.length) return v;
      const en = resolvePath(messages.en, path);
      if (typeof en === "string" && en.length) return en;
      return fallback || path;
    },
    [table]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      isRtl: locale === "ar",
    }),
    [locale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
