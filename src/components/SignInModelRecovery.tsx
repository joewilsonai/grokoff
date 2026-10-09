import { Loader2, RefreshCw } from "lucide-react";
import { useStore, type InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** Lives outside a conditional sign-in card: an inventory probe may confirm
 * login and remove that card before model discovery settles. */
export function SignInModelRecovery({ instance, className }: { instance: InstanceInfo; className?: string }) {
  const { signInModelDiscovery, refreshSignInModels } = useStore();
  const phase = signInModelDiscovery?.[instance.instanceId];
  if (phase !== "checking" && phase !== "failed") return null;
  const checking = phase === "checking";
  return <div data-sign-in-model-recovery={instance.instanceId} className={cn("space-y-2", className)}>
    {checking
      ? <p role="status" className="text-[12px] text-ink-secondary">{instance.displayName} · {t("common.checking")}</p>
      : <p role="alert" className="text-[12px] text-danger">{t("engineSetup.signInRefreshFailed", { name: instance.displayName })}</p>}
    <button type="button" disabled={checking} onClick={() => void refreshSignInModels(instance.instanceId)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-control px-3 py-2 text-[12px] font-medium text-ink disabled:opacity-50">
      {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {checking ? t("common.checking") : t("common.checkAgain")}
    </button>
  </div>;
}

/** A first-run gate or a closed Settings panel can disappear while discovery
 * is pending. Keep recovery reachable in the application shell as well. */
export function SignInModelRecoveries() {
  const { state, signInModelDiscovery } = useStore();
  const instances = state.instances.filter((instance) => {
    const phase = signInModelDiscovery?.[instance.instanceId];
    return phase === "checking" || phase === "failed";
  });
  if (!instances.length) return null;
  return <div className="shrink-0 space-y-3 border-b border-hairline/40 bg-card p-3" data-sign-in-model-recoveries>
    {instances.map((instance) => <SignInModelRecovery key={instance.instanceId} instance={instance} />)}
  </div>;
}
