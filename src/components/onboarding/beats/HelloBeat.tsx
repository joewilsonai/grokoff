// GrokOff modification: an optional local profile name; no mailing list
// or email identity collection. "Maybe later" skips this local profile.
//
// A hosted team workspace asks for neither: its profile is shared by
// everyone who signs in there, and the email field is a mailing-list offer
// for people installing the app. It only says what the workspace is.
import { useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api, useStore } from "@/state/store";
import { inputClass, PrimaryButton, QuietButton, staggerIndex, type BeatProps } from "./shared";

export function HelloBeat({ onNext, onSkip, hosted = false }: BeatProps & { hosted?: boolean }) {
  const { dispatch } = useStore();
  const [name, setName] = useState("");
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const saveProfile = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    // persisted server-side (~/.grokoff/config.json); the response is
    // the fresh config status, folded straight into the store
    try {
      const config = await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({ profile: { name: name.trim() } }),
        signal: AbortSignal.timeout(10_000),
      });
      dispatch({ type: "configStatus", config });
      onNext();
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  if (hosted) {
    return (
      <div className="stagger flex flex-col items-center">
        <p className="animate-rise mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary" style={staggerIndex(0)}>
          {t("onboarding.hosted.intro")}
        </p>
        <PrimaryButton onClick={onNext} className="animate-rise mt-5" style={staggerIndex(1)}>
          {t("onboarding.continue")}
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="stagger flex flex-col items-center">
      <p className="animate-rise mt-1.5 text-center text-[14px] leading-relaxed text-ink-secondary" style={staggerIndex(0)}>
        {t("onboarding.intro")}
      </p>
      <input
        autoFocus
        type="text"
        aria-label={t("onboarding.name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("onboarding.name")}
        className={`animate-rise mt-5 ${inputClass}`}
        style={staggerIndex(1)}
      />
      {failed && <p role="alert" className="mt-3 text-[13px] text-danger">{t("onboarding.profile.error")}</p>}
      <PrimaryButton onClick={() => void saveProfile()} disabled={saving} className="animate-rise mt-3" style={staggerIndex(3)}>
        {t("onboarding.continue")}
      </PrimaryButton>
      <QuietButton
        onClick={() => {
          track("email_skipped");
          onSkip();
        }}
        className="animate-rise mt-3"
        style={staggerIndex(4)}
      >
        {t("onboarding.maybeLater")}
      </QuietButton>
    </div>
  );
}
