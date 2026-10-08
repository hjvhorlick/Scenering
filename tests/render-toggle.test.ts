import { readFileSync } from "node:fs";
import { createHarness } from "./harness";

const h = createHarness();
const source = readFileSync("src/components/RenderView.tsx", "utf8");
const cancelBody = source.match(/const cancelRender = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
const cleanupStart = source.indexOf("    } finally {", source.indexOf("const handleStartRender"));
const cleanupEnd = source.indexOf("\n    }\n  };", cleanupStart);
const cleanupBody = source.slice(cleanupStart, cleanupEnd);

h.ok(source.includes("const [isCancelling, setIsCancelling] = useState(false)"), "cancellation has an explicit in-progress state");
h.ok(source.includes("const [isPreparingRender, setIsPreparingRender] = useState(false)"), "async export authorization has a visible preparing state");
h.ok(source.includes("const renderStartPendingRef = useRef(false)"), "a synchronous lock blocks duplicate starts during async preflight");
h.ok(source.includes('isPreparingRender ? "Preparing Render…"'), "the toggle visibly changes while authorization is in progress");
h.ok(cancelBody.includes("setIsCancelling(true)"), "cancel requests keep the action in a cancelling state");
h.ok(!cancelBody.includes("setIsRendering(false)"), "a new render cannot start before the old render unwinds");
h.ok(cleanupBody.includes("renderAudioContext.close()"), "the render awaits audio-context cleanup");
h.ok(cleanupBody.lastIndexOf("setIsRendering(false)") > cleanupBody.indexOf("renderAudioContext.close()"), "the cancel toggle stays active through asynchronous cleanup");
h.ok(cleanupBody.lastIndexOf("renderStartPendingRef.current = false") > cleanupBody.indexOf("renderAudioContext.close()"), "the start lock is released only after cleanup");
h.ok(source.includes('reportStage("Stopping render…")'), "the shared render status reports a cancellation request");
h.ok(source.includes('stage: "Render cancelled"'), "a completed cancellation is reported as cancellation, not render failure");
h.ok(source.includes("const toggleRender = () =>"), "render start and cancel share one toggle handler");
h.ok((source.match(/onClick=\{toggleRender\}/g) || []).length >= 2, "both initial render and rerender controls become cancel controls while active");
h.ok(source.includes('isCancelling ? "Cancelling Render…" : "Cancel Render"'), "the main toggle changes its wording while running/cancelling");
h.ok(source.includes('"bg-rose-700 hover:bg-rose-600"'), "the render toggle changes to a red cancel state");
h.ok(!/onClick=\{cancelRender\}[\s\S]{0,200}Cancel Render/.test(source), "there is no second overlapping cancel button in the progress panel");

h.done("render toggle");
