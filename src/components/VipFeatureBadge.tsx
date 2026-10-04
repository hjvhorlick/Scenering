export function openMembershipPlans() {
  window.dispatchEvent(new CustomEvent("scenering-open-account", { detail: { focus: "plans", source: "vip-feature" } }));
}

export default function VipFeatureBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-amber-400/60 bg-amber-950/70 font-extrabold uppercase tracking-wider text-amber-200 shadow-sm ${compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]"}`}
      title="VIP creative feature — available with SceneFlow and SceneForge"
      aria-label="VIP paid feature"
    >
      <span aria-hidden="true">✦</span>&nbsp;VIP
    </span>
  );
}
