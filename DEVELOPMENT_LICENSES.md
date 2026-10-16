# Development Licenses and External References

Scenering's advanced audio visualiser work was implemented as native Scenering code. No third-party source files, assets, presets, images, audio, shaders, or application code were copied into this repository.

The repositories below were inspected as technical references only.

| Reference | Repository | License observed | Commercial-code status | What was used |
|---|---|---|---|---|
| Cymatic | https://github.com/coreyepstein/cymatic | MIT License | Permissive, compatible with commercial use when notices are preserved | Architectural ideas only: deterministic live/offline rendering, preset/parameter separation, optional post-processing. No code copied. |
| WaveForge | https://github.com/godfengliang/waveforge | README states MIT; GitHub license detection returned no license file | Treat as reference-only until a canonical LICENSE file is present | High-level ideas only: Web Audio analyser use, 3D ring/bar concepts, bass pulse. No code copied. |
| IUSV | https://github.com/IUSmusic/IUSV | I/US Source-Available License 1.0 | Not suitable for incorporation into Scenering commercial code without written permission | High-level product/UI ideas only: circular centre-media layout, bloom controls, layer ordering. No code copied. |
| Sonica | https://github.com/rath/sonica | MIT License | Permissive, compatible with commercial use when notices are preserved | Architectural ideas only: deterministic audio-to-video flow, circular spectrum template concept, post-processing chain. No Rust/WGSL/code copied. |
| SoundVisualizer | https://github.com/CaYatur/SoundVisualizer | MIT License | Permissive, compatible with commercial use when notices are preserved | Technical ideas only: logarithmic/musical frequency mapping, dB-style shaping, attack/release ballistics, spectral tilt, performance-oriented metering. No code copied. |

## Vendored third-party files

One set of third-party files *is* copied into this repository, deliberately and
with its notice preserved. They are instructions for AI agents, not application
code: nothing in `src/` or `server/` imports them, and they never reach a build.

| Files | Source | Licence | Why they are here |
|---|---|---|---|
| `.agents/skills/`, `.claude/skills/` (11 Paddle agent skills, unmodified) | https://github.com/paddlehq/paddle-agent-skills at commit `70cb70d` | Apache-2.0, © Paddle | Paddle's own integration guidance — webhook delivery semantics, subscription status meanings, checkout and portal patterns — so an agent working in this repository reads current vendor documentation rather than guessing from training data. The full upstream licence text is kept beside the files as `LICENSE.paddle-agent-skills`, and `.agents/skills/README.md` records the provenance and how to refresh them. |

Apache-2.0 permits this use provided the licence and notices travel with the
files, which they do. If Paddle's skills are removed from this repository, the
licence files should go with them.

## Implementation note

The current Scenering implementation uses its existing browser canvas/Web Audio/WebCodecs render path. It does not add external visualiser dependencies and does not send customer audio to any external visualiser API.
