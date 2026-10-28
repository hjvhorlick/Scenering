# Piper voice integration

## Current implementation

Piper is the only generated-speech engine in the application. Speechify API calls, its API-key field, and the standalone Piper audition page have been removed. Existing Scenering profile names, descriptions, sample text, gender split and profile order remain intact. Old saved `speechify_male_*` / `speechify_female_*` profile IDs migrate to provider-independent Scenering IDs when projects load.

Generated speech routes through Piper for voice previews, scene narration, video preview, render preparation, pronunciation-dictionary playback, voice sample WAV downloads, scene downloads and voiceover ZIPs. User-imported and recorded audio remain supported. Script captions remain supported; Piper word timing is duration-weighted estimation, not verified speech alignment.

The root development app has an **Open Piper demo project** CTA. It creates a local sample project and opens Voiceover directly. The demo uses negative IDs and keeps scene edits in browser state/storage rather than requiring a database row. Each voice card has its own sample playback and download controls; Piper only preloads the selected voice. Users do not need to test all profiles before selecting one.

## Performance and failure behavior

- Voice models are fetched only when a profile is used; the app does not download all profiles at startup.
- The Piper runtime itself includes about 30 MB of uncompressed WASM/data assets in the current build, before the selected voice model. Runtime/model assets load on first use and are cached where browser storage allows; browser storage can be cleared or evicted.
- The two most recently used ONNX sessions remain warm in the worker. A stuck request stops after 90 seconds with an actionable error. Choosing another profile cancels a previous stalled preview.
- Model downloads retry and resume with byte ranges when supported.
- WAV output carries timing estimates through the narration cache, captions, preview, render and download paths.

## Voice/model caveat

The 20 Scenering profiles currently map to a smaller provisional set of same-gender Piper models; they are not 20 distinct final voice models. The profile style descriptions are preserved, but model/accent matching and every model and voice-data license/attribution still require a model-by-model audit. The selected model is downloaded from the public Piper model repository; that model's own license and attribution terms apply. Do not treat the provisional mapping as a license certification.

## Validation and deployment

Latest local checks: `npm run typecheck`, `npm run worker:typecheck`, `npm test` (85 suites passed), and `npm run build` all exited successfully. The build emits warnings from the Piper WASM package's `fs`/`path`/`crypto` imports, ONNX Runtime's `eval`, and large app chunks; the build result does not prove those browser paths execute. A local HTTP smoke check returned 200 for the Vite root, but that only confirms a response is served.

No real browser interaction, model download, audible playback, device performance, karaoke alignment or export output has been verified. No deployment or `wrangler deploy --dry-run` has been performed. The live development preview is available for human testing; the model/license audit remains a release gate.
