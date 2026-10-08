// Original GrokOff artwork. This mark does not use the upstream mascot art.
import type { MausAvatarProps } from "./Avatar";

export function GrokOffMark({ size = 40, label = "GrokOff" }: Partial<MausAvatarProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label={label} className="shrink-0">
      <rect x="32" y="32" width="960" height="960" rx="224" fill="#171a23" />
      <path d="M453 362a178 178 0 1 0 0 300V527H328" fill="none" stroke="#ff9d5c" strokeWidth="70" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="563" y="334" width="222" height="356" rx="111" fill="none" stroke="#f5f2ea" strokeWidth="70" />
    </svg>
  );
}
