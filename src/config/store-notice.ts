/**
 * Site-wide store notice configuration.
 *
 * Displayed strategically at the top of the front pages so visitors see an
 * immediate, bright, compact status ribbon. The owner administrator can edit
 * the badge, message, or visibility in Owner administration or on the Email
 * Centre dashboard, and the update persists in `admin_settings` (`store_notice`).
 */

export interface StoreNotice {
  enabled: boolean;
  badge: string;
  message: string;
}

export const STORE_NOTICE_SETTING_KEY = "store_notice";
export const STORE_NOTICE_MAX_BADGE_LENGTH = 40;
export const STORE_NOTICE_MAX_MESSAGE_LENGTH = 280;

export const DEFAULT_STORE_NOTICE: StoreNotice = {
  enabled: true,
  badge: "Store Notice",
  message:
    "Scenering Studio is open for preview and testing — we are putting the final launch touches in place and full store checkout will be live soon.",
};

export function sanitizeStoreNotice(
  input: unknown,
): { notice: StoreNotice } | { error: string } {
  const body = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const enabled =
    typeof body.enabled === "boolean"
      ? body.enabled
      : DEFAULT_STORE_NOTICE.enabled;
  const rawBadge =
    body.badge === undefined
      ? DEFAULT_STORE_NOTICE.badge
      : String(body.badge ?? "").trim();
  const badge = rawBadge || DEFAULT_STORE_NOTICE.badge;
  if (badge.length > STORE_NOTICE_MAX_BADGE_LENGTH) {
    return {
      error: `The notice badge is too long (${STORE_NOTICE_MAX_BADGE_LENGTH} characters maximum).`,
    };
  }
  const message =
    body.message === undefined
      ? DEFAULT_STORE_NOTICE.message
      : String(body.message ?? "").trim();
  if (enabled && !message) {
    return {
      error:
        "Enter a notice message, or untick Show store notice on front pages to hide the banner.",
    };
  }
  if (message.length > STORE_NOTICE_MAX_MESSAGE_LENGTH) {
    return {
      error: `The notice message is too long (${STORE_NOTICE_MAX_MESSAGE_LENGTH} characters maximum).`,
    };
  }
  return {
    notice: {
      enabled,
      badge,
      message,
    },
  };
}

export function parseStoredStoreNotice(raw: string | null | undefined): StoreNotice {
  if (!raw) return { ...DEFAULT_STORE_NOTICE };
  try {
    const parsed = JSON.parse(raw) as Partial<StoreNotice>;
    const enabled =
      typeof parsed.enabled === "boolean"
        ? parsed.enabled
        : DEFAULT_STORE_NOTICE.enabled;
    const badge =
      typeof parsed.badge === "string" && parsed.badge.trim()
        ? parsed.badge.trim().slice(0, STORE_NOTICE_MAX_BADGE_LENGTH)
        : DEFAULT_STORE_NOTICE.badge;
    const message =
      typeof parsed.message === "string"
        ? parsed.message.trim().slice(0, STORE_NOTICE_MAX_MESSAGE_LENGTH)
        : DEFAULT_STORE_NOTICE.message;
    return { enabled, badge, message };
  } catch {
    return { ...DEFAULT_STORE_NOTICE };
  }
}
