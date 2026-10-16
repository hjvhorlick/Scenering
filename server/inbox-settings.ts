import { db } from "../src/db.ts";
import { env } from "../src/env.ts";

/**
 * Email settings for the owner's inbox and outgoing mail, kept in
 * admin_settings under one key and edited in the Email Centre.
 *
 * Deliberately a leaf module (database only): server/email.ts reads the
 * Reply-To default from here, and server/inbox-core.ts sends through
 * server/email.ts, so anything heavier would make the imports circular.
 */

/** One more address the owner can answer from, e.g. support@scenering.com. */
export interface InboxAddress {
  address: string;
  /** The name customers see on replies from this address: "Scenering Support". */
  displayName: string;
  /** Added under every reply sent from this address. */
  signature: string;
}

/** An address the owner can send from: the personal one, or one of the others. */
export interface InboxIdentity extends InboxAddress {
  primary: boolean;
}

export interface InboxSettings {
  /** The personal address customers write to and replies come from by default, e.g. vincent@scenering.com. */
  address: string;
  /** The name shown on replies: "Vincent from Scenering". */
  displayName: string;
  /** Added under every reply. */
  signature: string;
  /**
   * More addresses customers can write to and the owner can choose when
   * replying or writing (support@, hello@, billing@). The personal address
   * above stays the default; a reply goes out from the address the
   * conversation is using unless the owner picks another.
   */
  otherAddresses: InboxAddress[];
  /** Email the owner when a new message arrives (a contact-form message, or an email whose copy could not be forwarded). */
  alertsEnabled: boolean;
  alertEmail: string;
  /** Forward an untouched copy of every incoming email (Cloudflare Email Routing; the address must be a verified destination). */
  forwardEnabled: boolean;
  forwardEmail: string;
  /** Use `address` as the Reply-To of every automatic Scenering email. Off until the address has been tested. */
  replyToAllEmails: boolean;
  /**
   * Who campaign emails (and the plans built on them) come from: empty for
   * "Scenering <noreply@scenering.com>", as they always have, or one of the
   * addresses above, e.g. the personal one, so that members who reply
   * reach the Inbox. See campaignFromIdentity.
   */
  campaignFrom: string;
  /** Sender identity printed in every marketing email footer. */
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  updatedAt: string | null;
}

export const INBOX_SETTINGS_KEY = "inbox_settings";
/** The domain Resend sends from; the inbox address must use it so replies can be sent. */
export const SENDING_DOMAIN = "scenering.com";
export const DEFAULT_INBOX_ADDRESS = `vincent@${SENDING_DOMAIN}`;

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
export function isValidEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

/** One line of header-safe text: no line breaks, control characters or angle brackets. */
export function headerSafe(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\x00-\x1F\x7F<>"]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function titleCase(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** How many addresses besides the personal one can be added. */
export const MAX_OTHER_ADDRESSES = 8;

/**
 * The other addresses offered out of the box. Each one still needs its own
 * routing rule in Cloudflare before customers' email to it can arrive;
 * replying from it works as soon as the domain is verified for sending.
 */
export function defaultOtherAddresses(primary: string): InboxAddress[] {
  return [
    { address: `support@${SENDING_DOMAIN}`, displayName: "Scenering Support", signature: `Scenering Support\n${SENDING_DOMAIN}` },
    { address: `hello@${SENDING_DOMAIN}`, displayName: "Scenering", signature: `The Scenering team\n${SENDING_DOMAIN}` },
    { address: `billing@${SENDING_DOMAIN}`, displayName: "Scenering Billing", signature: `Scenering Billing\n${SENDING_DOMAIN}` },
  ].filter((entry) => entry.address !== primary);
}

function cleanSignature(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
}

/**
 * Checks a list of other addresses. Used for edits (strict: the first
 * problem is reported) and for stored values (lenient: bad entries are
 * dropped, so a damaged setting can never stop replies from working).
 */
function parseOtherAddresses(input: unknown, primary: string, mode: "strict" | "lenient"): { addresses: InboxAddress[] } | { error: string } {
  if (!Array.isArray(input)) return mode === "strict" ? { error: "The other addresses must be a list." } : { addresses: [] };
  if (mode === "strict" && input.length > MAX_OTHER_ADDRESSES) return { error: `You can add up to ${MAX_OTHER_ADDRESSES} other addresses.` };
  const addresses: InboxAddress[] = [];
  for (const raw of input.slice(0, MAX_OTHER_ADDRESSES)) {
    const address = String((raw as any)?.address ?? "").trim().toLowerCase();
    const displayName = headerSafe((raw as any)?.displayName, 80);
    let problem = "";
    if (!isValidEmailAddress(address)) problem = address ? `${address} is not a valid email address.` : "One of your other addresses is empty. Fill it in or remove it.";
    else if (!address.endsWith(`@${SENDING_DOMAIN}`)) problem = `${address} must end in @${SENDING_DOMAIN}, the domain Scenering sends from.`;
    else if (address === primary) problem = `${address} is already your personal address.`;
    else if (addresses.some((entry) => entry.address === address)) problem = `${address} is listed twice.`;
    else if (displayName.length < 2) problem = `Enter the name customers should see on replies from ${address}.`;
    if (problem) {
      if (mode === "strict") return { error: problem };
      continue;
    }
    addresses.push({ address, displayName, signature: cleanSignature((raw as any)?.signature) });
  }
  return { addresses };
}

export function defaultInboxSettings(): InboxSettings {
  const owner = String(env().SCENERING_OWNER_EMAIL || "").trim().toLowerCase();
  const configured = String(env().INBOX_ADDRESS || "").trim().toLowerCase();
  const address = isValidEmailAddress(configured) ? configured : DEFAULT_INBOX_ADDRESS;
  const first = titleCase(address.split("@")[0].split(/[._+-]/)[0] || "Scenering");
  return {
    address,
    displayName: `${first} from Scenering`,
    signature: `${first}\nScenering · ${SENDING_DOMAIN}`,
    otherAddresses: defaultOtherAddresses(address),
    alertsEnabled: true,
    alertEmail: isValidEmailAddress(owner) ? owner : "",
    forwardEnabled: true,
    forwardEmail: isValidEmailAddress(owner) ? owner : "",
    replyToAllEmails: false,
    campaignFrom: "",
    businessName: "Scenering (Horlick Group)",
    businessAddress: "",
    businessPhone: "",
    updatedAt: null,
  };
}

let cache: { at: number; value: InboxSettings } | null = null;
const CACHE_MS = 30_000;

/** Current settings: stored values over the defaults. Cached briefly per isolate. */
export async function getInboxSettings(options: { fresh?: boolean } = {}): Promise<InboxSettings> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const defaults = defaultInboxSettings();
  let stored: Partial<InboxSettings> = {};
  try {
    const raw = await db.getSetting(INBOX_SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch {
    stored = {};
  }
  const value: InboxSettings = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof InboxSettings>) {
    if (key === "otherAddresses") continue;
    const candidate = (stored as any)[key];
    if (candidate !== undefined && typeof candidate === typeof (defaults as any)[key]) (value as any)[key] = candidate;
    if (key === "updatedAt" && typeof candidate === "string") value.updatedAt = candidate;
  }
  // Saved before other addresses existed: offer the defaults. Saved since
  // (even as an empty list): exactly what the owner kept.
  if (Array.isArray((stored as any).otherAddresses)) {
    const parsed = parseOtherAddresses((stored as any).otherAddresses, value.address, "lenient");
    value.otherAddresses = "addresses" in parsed ? parsed.addresses : [];
  } else {
    value.otherAddresses = defaultOtherAddresses(value.address);
  }
  cache = { at: Date.now(), value };
  return value;
}

export function clearInboxSettingsCache() {
  cache = null;
}

/** Checks and cleans an edit from the settings form. */
export function validateInboxSettings(input: any, current: InboxSettings): { settings: InboxSettings } | { error: string } {
  const next: InboxSettings = { ...current };
  if (input?.address !== undefined) {
    const address = String(input.address || "").trim().toLowerCase();
    if (!isValidEmailAddress(address)) return { error: "Enter a valid email address for your inbox." };
    if (!address.endsWith(`@${SENDING_DOMAIN}`)) return { error: `Your inbox address must end in @${SENDING_DOMAIN}, the domain Scenering sends from.` };
    next.address = address;
  }
  if (input?.displayName !== undefined) {
    const name = headerSafe(input.displayName, 80);
    if (name.length < 2) return { error: "Enter the name customers should see on your replies." };
    next.displayName = name;
  }
  if (input?.signature !== undefined) next.signature = cleanSignature(input.signature);
  if (input?.otherAddresses !== undefined) {
    const parsed = parseOtherAddresses(input.otherAddresses, next.address, "strict");
    if ("error" in parsed) return { error: parsed.error };
    next.otherAddresses = parsed.addresses;
  } else if (next.otherAddresses.some((entry) => entry.address === next.address)) {
    return { error: `${next.address} is already one of your other addresses. Remove it there first.` };
  }
  for (const flag of ["alertsEnabled", "forwardEnabled", "replyToAllEmails"] as const) {
    if (input?.[flag] !== undefined) next[flag] = Boolean(input[flag]);
  }
  for (const field of ["alertEmail", "forwardEmail"] as const) {
    if (input?.[field] !== undefined) {
      const value = String(input[field] || "").trim().toLowerCase();
      if (value && !isValidEmailAddress(value)) return { error: field === "alertEmail" ? "Enter a valid address for new-message alerts." : "Enter a valid address for copies of incoming email." };
      next[field] = value;
    }
  }
  // Copies and alerts sent to one of the inbox's own addresses would arrive
  // here again and set off another copy or alert.
  const own = (value: string) => value === next.address || next.otherAddresses.some((entry) => entry.address === value);
  if (next.forwardEmail && own(next.forwardEmail)) return { error: "Copies must go to a different address than your inbox, or they would loop back." };
  if (next.alertEmail && own(next.alertEmail)) return { error: "Alerts must go to a different address than your inbox, or they would loop back." };
  if (input?.campaignFrom !== undefined) {
    const wanted = String(input.campaignFrom || "").trim().toLowerCase();
    if (wanted && !own(wanted) && wanted !== current.campaignFrom) return { error: "Campaign emails can come from Scenering's no-reply address or one of your own addresses." };
    next.campaignFrom = wanted && own(wanted) ? wanted : "";
  } else if (next.campaignFrom && !own(next.campaignFrom)) {
    // The address campaigns came from was removed: back to the no-reply sender.
    next.campaignFrom = "";
  }
  if (input?.businessName !== undefined) next.businessName = headerSafe(input.businessName, 120);
  if (input?.businessAddress !== undefined) next.businessAddress = headerSafe(input.businessAddress, 300);
  if (input?.businessPhone !== undefined) next.businessPhone = headerSafe(input.businessPhone, 40);
  return { settings: next };
}

export async function saveInboxSettings(settings: InboxSettings): Promise<InboxSettings> {
  const value = { ...settings, updatedAt: new Date().toISOString() };
  await db.setSetting(INBOX_SETTINGS_KEY, JSON.stringify(value));
  cache = { at: Date.now(), value };
  return value;
}

/** Every address the owner can send from, the personal one first. */
export function inboxIdentities(settings: InboxSettings): InboxIdentity[] {
  return [
    { address: settings.address, displayName: settings.displayName, signature: settings.signature, primary: true },
    ...settings.otherAddresses.map((entry) => ({ ...entry, primary: false })),
  ];
}

/** The identity for an address (any letter case), or null if it is not one of the owner's. */
export function findInboxIdentity(settings: InboxSettings, address: unknown): InboxIdentity | null {
  const wanted = String(address ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return inboxIdentities(settings).find((identity) => identity.address === wanted) || null;
}

export function isInboxAddress(settings: InboxSettings, address: unknown): boolean {
  return findInboxIdentity(settings, address) !== null;
}

/**
 * The address campaign emails come from, or null for the no-reply sender.
 * An address that has since been removed from the settings falls back to
 * the no-reply sender rather than stopping campaigns.
 */
export function campaignFromIdentity(settings: InboxSettings): InboxIdentity | null {
  return settings.campaignFrom ? findInboxIdentity(settings, settings.campaignFrom) : null;
}

/**
 * The Reply-To every automatic email should carry, if the owner switched it
 * on. Never throws: an email must not fail because settings could not load.
 */
export async function automaticReplyTo(): Promise<string | undefined> {
  try {
    const settings = await getInboxSettings();
    return settings.replyToAllEmails && isValidEmailAddress(settings.address) ? settings.address : undefined;
  } catch {
    return undefined;
  }
}
