export function openMembershipPlans() {
  window.dispatchEvent(new CustomEvent("scenering-open-account", { detail: { focus: "plans", source: "vip-feature" } }));
}

export default function VipFeatureBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`vip-flame${compact ? " is-compact" : ""}`}
      title="VIP creative feature — available with SceneFlow and SceneForge"
      aria-label="VIP paid feature"
    >
      <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
    </span>
  );
}
