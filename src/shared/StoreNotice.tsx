import { useEffect, useState, type CSSProperties } from "react";
import {
  DEFAULT_STORE_NOTICE,
  STORE_NOTICE_MAX_BADGE_LENGTH,
  STORE_NOTICE_MAX_MESSAGE_LENGTH,
  type StoreNotice,
} from "../config/store-notice";

export {
  DEFAULT_STORE_NOTICE,
  STORE_NOTICE_MAX_BADGE_LENGTH,
  STORE_NOTICE_MAX_MESSAGE_LENGTH,
  type StoreNotice,
};

let cachedNotice: StoreNotice | null = null;
let inflightNotice: Promise<StoreNotice> | null = null;
const listeners = new Set<(notice: StoreNotice) => void>();

function fetchStoreNotice(force = false): Promise<StoreNotice> {
  if (typeof window === "undefined") {
    return Promise.resolve(cachedNotice ?? DEFAULT_STORE_NOTICE);
  }
  if (cachedNotice && !force) return Promise.resolve(cachedNotice);
  if (inflightNotice && !force) return inflightNotice;
  inflightNotice = fetch("/api/store-notice", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const next: StoreNotice = {
        enabled:
          typeof data?.notice?.enabled === "boolean"
            ? data.notice.enabled
            : DEFAULT_STORE_NOTICE.enabled,
        badge:
          typeof data?.notice?.badge === "string" && data.notice.badge.trim()
            ? data.notice.badge.trim()
            : DEFAULT_STORE_NOTICE.badge,
        message:
          typeof data?.notice?.message === "string"
            ? data.notice.message.trim()
            : DEFAULT_STORE_NOTICE.message,
      };
      cachedNotice = next;
      inflightNotice = null;
      listeners.forEach((fn) => fn(next));
      return next;
    })
    .catch(() => {
      inflightNotice = null;
      return cachedNotice ?? DEFAULT_STORE_NOTICE;
    });
  return inflightNotice;
}

/** Call after the administrator saves a new store notice so every open view updates immediately. */
export function invalidateStoreNotice(next?: StoreNotice) {
  if (next) {
    cachedNotice = next;
    listeners.forEach((fn) => fn(next));
  } else {
    cachedNotice = null;
  }
  void fetchStoreNotice(true);
}

export function useStoreNotice(): StoreNotice {
  const [notice, setNotice] = useState<StoreNotice>(
    cachedNotice ?? DEFAULT_STORE_NOTICE,
  );
  useEffect(() => {
    listeners.add(setNotice);
    void fetchStoreNotice().then(setNotice);
    const onShow = () => {
      if (document.visibilityState === "visible") {
        void fetchStoreNotice(true);
      }
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      listeners.delete(setNotice);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
  return notice;
}

const bannerBarStyle: CSSProperties = {
  position: "relative",
  zIndex: 35,
  width: "100%",
  background: "linear-gradient(90deg, #ffba18 0%, #ffd452 50%, #ffba18 100%)",
  borderBottom: "1px solid #d99600",
  boxShadow:
    "0 2px 10px rgba(217, 150, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.55)",
  color: "#1e1604",
  padding: "8px 16px",
};

const bannerInnerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: "6px 12px",
  textAlign: "center",
};

const badgePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  background: "#142242",
  color: "#ffe484",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.3,
  flexShrink: 0,
  boxShadow: "0 1px 3px rgba(10, 23, 51, 0.28)",
};

const dotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "#ffcf33",
  boxShadow: "0 0 0 3px rgba(255, 207, 51, 0.28)",
  flexShrink: 0,
};

const messageStyle: CSSProperties = {
  margin: 0,
  color: "#1e1604",
  fontSize: 13.5,
  fontWeight: 650,
  lineHeight: 1.4,
  letterSpacing: "0.005em",
};

export default function StoreNoticeBanner({
  previewNotice,
  className = "",
  style,
}: {
  previewNotice?: StoreNotice;
  className?: string;
  style?: CSSProperties;
}) {
  const liveNotice = useStoreNotice();
  const notice = previewNotice ?? liveNotice;
  if (!notice.enabled || !notice.message.trim()) return null;

  return (
    <div
      className={`sc-store-notice ${className}`.trim()}
      role="region"
      aria-label="Store notice"
      style={{ ...bannerBarStyle, ...style }}
    >
      <div className="sc-store-notice-inner" style={bannerInnerStyle}>
        <span className="sc-store-notice-badge" style={badgePillStyle}>
          <span
            className="sc-store-notice-dot"
            style={dotStyle}
            aria-hidden="true"
          />
          {notice.badge.trim() || DEFAULT_STORE_NOTICE.badge}
        </span>
        <p className="sc-store-notice-text" style={messageStyle}>
          {notice.message}
        </p>
      </div>
    </div>
  );
}
