/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** AdSense publisher id (ca-pub-…). Optional — see src/shared/ads.ts. */
  readonly VITE_ADSENSE_CLIENT_ID?: string;
  readonly VITE_ADSENSE_SLOT_WEB?: string;
  readonly VITE_ADSENSE_SLOT_STUDIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
