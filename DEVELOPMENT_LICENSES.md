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

## Implementation note

The current Scenering implementation uses its existing browser canvas/Web Audio/WebCodecs render path. It does not add external visualiser dependencies and does not send customer audio to any external visualiser API.
