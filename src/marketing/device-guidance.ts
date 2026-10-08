/**
 * Plain-language device guidance shared by the public site, FAQ and manual.
 *
 * The Celeron result is a successful real-world low-spec run, not a promise
 * that every project will have the same speed or compatibility on that class
 * of device. Keep the reassurance and the limitation together wherever this
 * guidance is shown.
 */
export const DEVICE_PERFORMANCE = {
  testedSystem: "Scenering has been successfully run on a 2-core Celeron with 4 GB RAM.",
  lowerSpecExpectation:
    "That configuration can run Scenering, though lower-spec hardware may struggle with demanding projects and final renders can take longer.",
  persistentRender:
    "Scenering’s persistent render engine is designed to help lower-spec machines work through an active render by keeping the job alive while you move around the studio.",
  recommendation:
    "For the smoothest workflow and shorter render times, a faster modern PC is recommended.",
  modestMachineTips:
    "On a modest machine, keep the browser open during export, use only the output resolution your destination needs, and begin with a simpler timeline before adding more media or effects.",
} as const;
