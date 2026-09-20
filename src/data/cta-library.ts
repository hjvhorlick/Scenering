/**
 * Call-to-Action Library
 * ======================
 * Every social-media / platform call-to-action badge the Video Studio can place.
 * Each entry carries the brand colours, the mark drawn on the badge, the default
 * wording and the sound it triggers — so a badge is fully configured the moment
 * it is dropped on the timeline and can then be re-worded, re-coloured, resized
 * and dragged around the video preview.
 */

export type CtaShape = "pill" | "round" | "square" | "banner";
export type CtaStyle = "solid" | "gradient" | "outline" | "glass";
export type CtaGroup = "video" | "social" | "messaging" | "audio" | "support" | "business";

/** How the brand mark is painted on the badge */
export type CtaMarkKind =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "spotify"
  | "whatsapp"
  | "telegram"
  | "snapchat"
  | "discord"
  | "twitch"
  | "pinterest"
  | "x"
  | "facebook"
  | "linkedin"
  | "reddit"
  | "messenger"
  | "mic"
  | "note"
  | "cloud"
  | "cup"
  | "globe"
  | "link"
  | "bag"
  | "download"
  | "envelope"
  | "calendar"
  | "gift"
  | "monogram";

export interface CtaPlatform {
  id: string;
  name: string;
  /** Grouping used by the Platform tab */
  group: CtaGroup;
  /** Action verb shown under the name, e.g. "Subscribe" */
  action: string;
  /** Default button text */
  primaryText: string;
  /** Default subtext under the button text */
  secondaryText: string;
  /** Brand gradient / solid */
  primaryColor: string;
  secondaryColor: string;
  /** Icon-only emoji used in studio cards */
  icon: string;
  /** Mark painted on the badge */
  mark: CtaMarkKind;
  /** Fallback monogram when mark === "monogram" */
  monogram: string;
  /** Dark text for bright brands (Snapchat yellow, Ko-fi yellow...) */
  darkText?: boolean;
  /** Default badge shape */
  shape?: CtaShape;
  /** Default render style */
  style?: CtaStyle;
  /** Default sound effect */
  soundUrl?: string;
}

export const CTA_GROUPS: { id: CtaGroup; name: string; icon: string }[] = [
  { id: "video", name: "Video Platforms", icon: "📺" },
  { id: "social", name: "Social & Community", icon: "📱" },
  { id: "messaging", name: "Messaging & Chat", icon: "💬" },
  { id: "audio", name: "Music & Podcasts", icon: "🎧" },
  { id: "support", name: "Support & Donations", icon: "❤️" },
  { id: "business", name: "Website, Shop & Contact", icon: "🔗" },
];

export const CTA_PLATFORMS: CtaPlatform[] = [
  // ---------------- Video platforms ----------------
  {
    id: "youtube_subscribe",
    name: "YouTube — Subscribe",
    group: "video",
    action: "Subscribe",
    primaryText: "SUBSCRIBE",
    secondaryText: "New videos every week",
    primaryColor: "#FF0000",
    secondaryColor: "#B00000",
    icon: "🔔",
    mark: "youtube",
    monogram: "▶",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "youtube_watch",
    name: "YouTube — Watch Now",
    group: "video",
    action: "Watch",
    primaryText: "WATCH NOW",
    secondaryText: "Full video linked below",
    primaryColor: "#FF0000",
    secondaryColor: "#8B0000",
    icon: "▶️",
    mark: "youtube",
    monogram: "▶",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "youtube_like",
    name: "YouTube — Like",
    group: "video",
    action: "Like",
    primaryText: "LIKE THIS VIDEO",
    secondaryText: "It helps the channel grow",
    primaryColor: "#FF0000",
    secondaryColor: "#B00000",
    icon: "👍",
    mark: "youtube",
    monogram: "▶",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "youtube_bell",
    name: "YouTube — Notifications",
    group: "video",
    action: "Turn on bell",
    primaryText: "HIT THE BELL",
    secondaryText: "Never miss an upload",
    primaryColor: "#FF0000",
    secondaryColor: "#7F1D1D",
    icon: "🔔",
    mark: "youtube",
    monogram: "▶",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "youtube_comment",
    name: "YouTube — Comment",
    group: "video",
    action: "Comment",
    primaryText: "COMMENT BELOW",
    secondaryText: "What do you think?",
    primaryColor: "#EF4444",
    secondaryColor: "#991B1B",
    icon: "💬",
    mark: "youtube",
    monogram: "▶",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "twitch_follow",
    name: "Twitch — Follow",
    group: "video",
    action: "Follow",
    primaryText: "FOLLOW ON TWITCH",
    secondaryText: "Live every week",
    primaryColor: "#9146FF",
    secondaryColor: "#6441A5",
    icon: "🎮",
    mark: "twitch",
    monogram: "T",
    soundUrl: "/sounds/jump_pop.wav",
  },

  // ---------------- Social & community ----------------
  {
    id: "instagram_follow",
    name: "Instagram — Follow",
    group: "social",
    action: "Follow",
    primaryText: "FOLLOW ON INSTAGRAM",
    secondaryText: "@yourhandle",
    primaryColor: "#F58529",
    secondaryColor: "#8134AF",
    icon: "📸",
    mark: "instagram",
    monogram: "◎",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "instagram_dm",
    name: "Instagram — Send DM",
    group: "social",
    action: "Message",
    primaryText: "DM US",
    secondaryText: "We reply within 24 hours",
    primaryColor: "#DD2A7B",
    secondaryColor: "#8134AF",
    icon: "✉️",
    mark: "instagram",
    monogram: "◎",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "tiktok_follow",
    name: "TikTok — Follow",
    group: "social",
    action: "Follow",
    primaryText: "FOLLOW ON TIKTOK",
    secondaryText: "@yourhandle",
    primaryColor: "#25F4EE",
    secondaryColor: "#FE2C55",
    icon: "🎵",
    mark: "tiktok",
    monogram: "♪",
    darkText: true,
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "facebook_like",
    name: "Facebook — Like Page",
    group: "social",
    action: "Like",
    primaryText: "LIKE OUR PAGE",
    secondaryText: "facebook.com/yourpage",
    primaryColor: "#1877F2",
    secondaryColor: "#0B5FCC",
    icon: "👍",
    mark: "facebook",
    monogram: "f",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "x_follow",
    name: "X (Twitter) — Follow",
    group: "social",
    action: "Follow",
    primaryText: "FOLLOW ON X",
    secondaryText: "@yourhandle",
    primaryColor: "#111827",
    secondaryColor: "#000000",
    icon: "✖️",
    mark: "x",
    monogram: "X",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "threads_follow",
    name: "Threads — Follow",
    group: "social",
    action: "Follow",
    primaryText: "FOLLOW ON THREADS",
    secondaryText: "@yourhandle",
    primaryColor: "#18181B",
    secondaryColor: "#000000",
    icon: "🧵",
    mark: "monogram",
    monogram: "@",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "linkedin_follow",
    name: "LinkedIn — Connect",
    group: "social",
    action: "Connect",
    primaryText: "CONNECT ON LINKEDIN",
    secondaryText: "Let's work together",
    primaryColor: "#0A66C2",
    secondaryColor: "#044B8F",
    icon: "💼",
    mark: "linkedin",
    monogram: "in",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "reddit_join",
    name: "Reddit — Join",
    group: "social",
    action: "Join",
    primaryText: "JOIN THE SUBREDDIT",
    secondaryText: "r/yourcommunity",
    primaryColor: "#FF4500",
    secondaryColor: "#C0341D",
    icon: "👽",
    mark: "reddit",
    monogram: "r/",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "snapchat_add",
    name: "Snapchat — Add Us",
    group: "social",
    action: "Add",
    primaryText: "ADD US ON SNAPCHAT",
    secondaryText: "@yourhandle",
    primaryColor: "#FFFC00",
    secondaryColor: "#F2E600",
    icon: "👻",
    mark: "snapchat",
    monogram: "👻",
    darkText: true,
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "pinterest_save",
    name: "Pinterest — Save Pin",
    group: "social",
    action: "Save",
    primaryText: "SAVE THIS PIN",
    secondaryText: "pinterest.com/yourboard",
    primaryColor: "#E60023",
    secondaryColor: "#AD081B",
    icon: "📌",
    mark: "pinterest",
    monogram: "P",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "discord_join",
    name: "Discord — Join Server",
    group: "social",
    action: "Join",
    primaryText: "JOIN OUR DISCORD",
    secondaryText: "Free community access",
    primaryColor: "#5865F2",
    secondaryColor: "#3B45C9",
    icon: "🎧",
    mark: "discord",
    monogram: "D",
    soundUrl: "/sounds/jump_pop.wav",
  },

  // ---------------- Messaging ----------------
  {
    id: "whatsapp_chat",
    name: "WhatsApp — Chat",
    group: "messaging",
    action: "Chat",
    primaryText: "CHAT ON WHATSAPP",
    secondaryText: "Tap to message us",
    primaryColor: "#25D366",
    secondaryColor: "#128C7E",
    icon: "💬",
    mark: "whatsapp",
    monogram: "✆",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "whatsapp_channel",
    name: "WhatsApp — Join Channel",
    group: "messaging",
    action: "Join",
    primaryText: "JOIN OUR CHANNEL",
    secondaryText: "Daily updates",
    primaryColor: "#25D366",
    secondaryColor: "#075E54",
    icon: "📢",
    mark: "whatsapp",
    monogram: "✆",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "telegram_join",
    name: "Telegram — Join",
    group: "messaging",
    action: "Join",
    primaryText: "JOIN ON TELEGRAM",
    secondaryText: "t.me/yourchannel",
    primaryColor: "#229ED9",
    secondaryColor: "#1273A5",
    icon: "✈️",
    mark: "telegram",
    monogram: "➤",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "messenger_chat",
    name: "Messenger — Chat",
    group: "messaging",
    action: "Chat",
    primaryText: "MESSAGE US",
    secondaryText: "We're online now",
    primaryColor: "#00B2FF",
    secondaryColor: "#006AFF",
    icon: "💬",
    mark: "messenger",
    monogram: "✉",
    soundUrl: "/sounds/jump_pop.wav",
  },

  // ---------------- Music & podcasts ----------------
  {
    id: "spotify_listen",
    name: "Spotify — Listen",
    group: "audio",
    action: "Listen",
    primaryText: "LISTEN ON SPOTIFY",
    secondaryText: "Full episode streaming now",
    primaryColor: "#1DB954",
    secondaryColor: "#14833B",
    icon: "🎧",
    mark: "spotify",
    monogram: "♫",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "podcast_listen",
    name: "Podcast — Listen",
    group: "audio",
    action: "Listen",
    primaryText: "LISTEN TO THE PODCAST",
    secondaryText: "Available on all platforms",
    primaryColor: "#9933CC",
    secondaryColor: "#6A1B9A",
    icon: "🎙️",
    mark: "mic",
    monogram: "🎙",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "applemusic_listen",
    name: "Apple Music — Listen",
    group: "audio",
    action: "Listen",
    primaryText: "LISTEN ON APPLE MUSIC",
    secondaryText: "Stream the full track",
    primaryColor: "#FA243C",
    secondaryColor: "#B3122A",
    icon: "🎵",
    mark: "note",
    monogram: "♫",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "soundcloud_follow",
    name: "SoundCloud — Follow",
    group: "audio",
    action: "Follow",
    primaryText: "FOLLOW ON SOUNDCLOUD",
    secondaryText: "soundcloud.com/you",
    primaryColor: "#FF5500",
    secondaryColor: "#C24000",
    icon: "🔊",
    mark: "cloud",
    monogram: "☁",
    soundUrl: "/sounds/jump_pop.wav",
  },

  // ---------------- Support & donations ----------------
  {
    id: "patreon_support",
    name: "Patreon — Support",
    group: "support",
    action: "Support",
    primaryText: "SUPPORT ON PATREON",
    secondaryText: "Exclusive rewards for members",
    primaryColor: "#FF424D",
    secondaryColor: "#C42D36",
    icon: "❤️",
    mark: "monogram",
    monogram: "P",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "kofi_coffee",
    name: "Ko-fi — Buy a Coffee",
    group: "support",
    action: "Support",
    primaryText: "BUY ME A COFFEE",
    secondaryText: "Every tip keeps us creating",
    primaryColor: "#FFDD00",
    secondaryColor: "#E5C500",
    icon: "☕",
    mark: "cup",
    monogram: "☕",
    darkText: true,
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "paypal_donate",
    name: "PayPal — Donate",
    group: "support",
    action: "Donate",
    primaryText: "DONATE VIA PAYPAL",
    secondaryText: "Secure one-time gift",
    primaryColor: "#003087",
    secondaryColor: "#001C56",
    icon: "💳",
    mark: "monogram",
    monogram: "$",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "buymeacoffee_support",
    name: "Buy Me a Coffee — Support",
    group: "support",
    action: "Support",
    primaryText: "SUPPORT THE CHANNEL",
    secondaryText: "Tip jar is always open",
    primaryColor: "#FF813F",
    secondaryColor: "#D95E1F",
    icon: "🧡",
    mark: "cup",
    monogram: "☕",
    soundUrl: "/sounds/ting.ogg",
  },

  // ---------------- Website, shop & contact ----------------
  {
    id: "website_visit",
    name: "Website — Visit",
    group: "business",
    action: "Visit",
    primaryText: "VISIT OUR WEBSITE",
    secondaryText: "www.yourdomain.com",
    primaryColor: "#38BDF8",
    secondaryColor: "#0284C7",
    icon: "🔗",
    mark: "globe",
    monogram: "⌘",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "linktree_links",
    name: "Link in Bio — All Links",
    group: "business",
    action: "Open",
    primaryText: "ALL LINKS IN BIO",
    secondaryText: "Everything in one place",
    primaryColor: "#43E660",
    secondaryColor: "#2BB847",
    icon: "🌳",
    mark: "link",
    monogram: "🔗",
    darkText: true,
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "shop_now",
    name: "Shop — Buy Now",
    group: "business",
    action: "Shop",
    primaryText: "SHOP NOW — 20% OFF",
    secondaryText: "Limited time offer",
    primaryColor: "#10B981",
    secondaryColor: "#047857",
    icon: "🛍️",
    mark: "bag",
    monogram: "🛍",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "app_download",
    name: "Mobile App — Download",
    group: "business",
    action: "Download",
    primaryText: "DOWNLOAD THE APP",
    secondaryText: "Free on iOS & Android",
    primaryColor: "#8B5CF6",
    secondaryColor: "#5B21B6",
    icon: "📱",
    mark: "download",
    monogram: "⤓",
    soundUrl: "/sounds/jump_pop.wav",
  },
  {
    id: "email_subscribe",
    name: "Email — Get the Newsletter",
    group: "business",
    action: "Subscribe",
    primaryText: "GET THE FREE GUIDE",
    secondaryText: "Enter your email below",
    primaryColor: "#EA4335",
    secondaryColor: "#B7291C",
    icon: "✉️",
    mark: "envelope",
    monogram: "✉",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "book_call",
    name: "Book a Call",
    group: "business",
    action: "Book",
    primaryText: "BOOK A FREE CALL",
    secondaryText: "Limited slots this month",
    primaryColor: "#006BFF",
    secondaryColor: "#0047AB",
    icon: "📅",
    mark: "calendar",
    monogram: "📅",
    soundUrl: "/sounds/ting.ogg",
  },
  {
    id: "lead_magnet",
    name: "Free Download / Lead Magnet",
    group: "business",
    action: "Download",
    primaryText: "DOWNLOAD THE CHECKLIST",
    secondaryText: "Link in the description",
    primaryColor: "#F59E0B",
    secondaryColor: "#B45309",
    icon: "🎁",
    mark: "gift",
    monogram: "🎁",
    soundUrl: "/sounds/jump_pop.wav",
  },
];

export function getCtaPlatform(idOrUrl?: string): CtaPlatform | undefined {
  if (!idOrUrl) return undefined;
  return (
    CTA_PLATFORMS.find((p) => p.id === idOrUrl) ||
    CTA_PLATFORMS.find((p) => p.name.toLowerCase() === idOrUrl.toLowerCase())
  );
}

export const CTA_PLATFORM_BY_TYPE_PREFIX = "cta_";

/** Timeline insert type for a platform, e.g. cta_youtube_subscribe */
export const ctaTypeFor = (platformId: string) => `${CTA_PLATFORM_BY_TYPE_PREFIX}${platformId}`;

/** Resolve a platform from a timeline insert (type first, then visual options) */
export function resolveCtaPlatform(insertType?: string, platformId?: string): CtaPlatform | undefined {
  if (platformId) {
    const byId = getCtaPlatform(platformId);
    if (byId) return byId;
  }
  if (insertType && insertType.startsWith(CTA_PLATFORM_BY_TYPE_PREFIX)) {
    return getCtaPlatform(insertType.slice(CTA_PLATFORM_BY_TYPE_PREFIX.length));
  }
  return undefined;
}
