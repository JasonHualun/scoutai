"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/authStore";
import {
  Membership,
  PREDICTION_CREDITS_KEY,
  PREDICTION_CREDITS_UPDATED_EVENT,
  freeMembership,
} from "@/lib/membership";
import {
  Currency,
  RiskLevel,
  betTypeOptions,
  defaultLeagueIds,
  defaultPreferenceValues,
  leagueGroups,
  leagueOptions,
  marketOptions,
  modelOptions,
  normalizeOptionIds,
  riskProfileList,
  riskProfiles,
  toggleString,
} from "@/lib/preference-options";
import { signOut, supabase } from "@/lib/supabase";
import { ProPurchaseDialog } from "@/components/ProPurchaseDialog";

type Preferences = {
  risk_level: RiskLevel;
  capital: number;
  currency: Currency;
  preferred_models: string[];
  bet_type: string[];
  preferred_markets: string[];
  favorite_leagues: string[];
};

const defaultPreferences: Preferences = {
  ...defaultPreferenceValues,
};

const LOCAL_PREFERENCES_KEY = "scoutai_preferences";

const allowedLeagueIds = new Set(
  leagueGroups.flatMap((group) => group.items.map((item) => item.id))
);

function readPredictionCredits() {
  try {
    const raw = window.localStorage.getItem(PREDICTION_CREDITS_KEY);
    const parsed = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  } catch {
    return 0;
  }
}

function writePredictionCredits(value: number) {
  const credits = Math.max(0, Math.round(value));
  window.localStorage.setItem(PREDICTION_CREDITS_KEY, String(credits));
  window.dispatchEvent(new Event(PREDICTION_CREDITS_UPDATED_EVENT));
  return credits;
}

function optionSelectedClass(active: boolean) {
  return active
    ? "border-[color:var(--accent)]/70 bg-[color:var(--accent)]/10 text-white"
    : "border-white/10 bg-black/25 text-white/70 hover:border-white/25 hover:bg-white/[0.03]";
}

function leagueNamesFromIds(ids: number[]) {
  return leagueGroups
    .flatMap((group) => group.items)
    .filter((league) => ids.includes(league.id))
    .map((league) => league.name);
}

function sanitizeLeagueIds(ids: unknown[]) {
  return ids.filter((id): id is number => typeof id === "number" && allowedLeagueIds.has(id));
}

function readLocalPreferences(): Preferences | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const riskLevel =
      parsed.risk_level === "conservative" ||
      parsed.risk_level === "balanced" ||
      parsed.risk_level === "aggressive"
        ? parsed.risk_level
        : defaultPreferences.risk_level;
    const profile = riskProfiles[riskLevel] ?? riskProfiles.balanced;
    const currency: Currency =
      parsed.currency === "USD" || parsed.currency === "HKD" ? parsed.currency : "CNY";

    return {
      risk_level: profile.id,
      capital:
        typeof parsed.capital === "number" && Number.isFinite(parsed.capital)
          ? parsed.capital
          : defaultPreferences.capital,
      currency,
      preferred_models: normalizeOptionIds(parsed.preferred_models, modelOptions, profile.models),
      bet_type: normalizeOptionIds(parsed.bet_type, betTypeOptions, profile.betTypes),
      preferred_markets: normalizeOptionIds(parsed.preferred_markets, marketOptions, profile.markets),
      favorite_leagues: Array.isArray(parsed.favorite_leagues)
        ? parsed.favorite_leagues.filter((item): item is string => typeof item === "string")
        : defaultPreferences.favorite_leagues,
    };
  } catch {
    return null;
  }
}

function sameList<T>(left: T[], right: T[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function samePreferences(left: Preferences, right: Preferences) {
  return (
    left.risk_level === right.risk_level &&
    left.capital === right.capital &&
    left.currency === right.currency &&
    sameList(left.preferred_models, right.preferred_models) &&
    sameList(left.bet_type, right.bet_type) &&
    sameList(left.preferred_markets, right.preferred_markets) &&
    sameList(left.favorite_leagues, right.favorite_leagues)
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);
  const authSession = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [email, setEmail] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(defaultPreferences);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>(defaultLeagueIds);
  const [savedLeagueIds, setSavedLeagueIds] = useState<number[]>(defaultLeagueIds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership>(() => freeMembership());
  const [saveFlash, setSaveFlash] = useState(false);
  const [predictionCredits, setPredictionCredits] = useState(0);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  useEffect(() => {
    async function load() {
      if (authLoading) return;

      try {
        setEmail(authUser?.email ?? null);

        if (authUser) {
          if (authSession) {
            const membershipRes = await fetch("/api/membership", {
              headers: { Authorization: `Bearer ${authSession.access_token}` },
            });
            const membershipJson = (await membershipRes.json()) as {
              membership?: Membership;
            };
            const nextMembership = membershipJson.membership ?? freeMembership(authUser.email);
            setMembership(nextMembership);
            if (typeof nextMembership.predictionCredits === "number") {
              setPredictionCredits(writePredictionCredits(nextMembership.predictionCredits));
            }
          }

          const { data } = await supabase
            .from("user_preferences")
            .select(
              "risk_level, capital, currency, preferred_models, bet_type, preferred_markets, favorite_leagues"
            )
            .eq("user_id", authUser.id)
            .maybeSingle();

          if (data) {
            const riskLevel = (data.risk_level as RiskLevel) ?? defaultPreferences.risk_level;
            const profile = riskProfiles[riskLevel] ?? riskProfiles.balanced;

            const nextCapital = data.capital ?? defaultPreferences.capital;

            const nextPreferences = {
              risk_level: profile.id,
              capital: nextCapital,
              currency: (data.currency as Currency) ?? defaultPreferences.currency,
              preferred_models: normalizeOptionIds(
                data.preferred_models,
                modelOptions,
                profile.models
              ),
              bet_type: normalizeOptionIds(data.bet_type, betTypeOptions, profile.betTypes),
              preferred_markets: normalizeOptionIds(
                data.preferred_markets,
                marketOptions,
                profile.markets
              ),
              favorite_leagues: data.favorite_leagues ?? defaultPreferences.favorite_leagues,
            };

            setPreferences(nextPreferences);
            setSavedPreferences(nextPreferences);
          } else {
            const localPreferences = readLocalPreferences();
            if (localPreferences) {
              setPreferences(localPreferences);
              setSavedPreferences(localPreferences);
            }
          }
        } else {
          setMembership(freeMembership());
          const localPreferences = readLocalPreferences();
          if (localPreferences) {
            setPreferences(localPreferences);
            setSavedPreferences(localPreferences);
          }
        }

        const raw = window.localStorage.getItem("scoutai_selected_leagues");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const supported = sanitizeLeagueIds(parsed);
            const nextLeagueIds = supported.length > 0 ? supported : defaultLeagueIds;
            setSelectedLeagueIds(nextLeagueIds);
            setSavedLeagueIds(nextLeagueIds);
          }
        }
      } catch {
        setError("设置加载失败，请稍后刷新。");
      }
    }

    load();
  }, [authLoading, authSession, authUser]);

  useEffect(() => {
    const refreshCredits = () => setPredictionCredits(readPredictionCredits());
    const timer = window.setTimeout(refreshCredits, 0);
    window.addEventListener("storage", refreshCredits);
    window.addEventListener("focus", refreshCredits);
    window.addEventListener(PREDICTION_CREDITS_UPDATED_EVENT, refreshCredits);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", refreshCredits);
      window.removeEventListener("focus", refreshCredits);
      window.removeEventListener(PREDICTION_CREDITS_UPDATED_EVENT, refreshCredits);
    };
  }, []);

  function applyRiskLevel(nextRisk: RiskLevel) {
    const profile = riskProfiles[nextRisk];
    setPreferences((prev) => ({
      ...prev,
      risk_level: nextRisk,
      preferred_models: [...profile.models],
      preferred_markets: [...profile.markets],
      bet_type: [...profile.betTypes],
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const favoriteLeagues = leagueNamesFromIds(selectedLeagueIds);
      const nextPreferences = { ...preferences, favorite_leagues: favoriteLeagues };
      setPreferences(nextPreferences);
      window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(nextPreferences));
      window.localStorage.setItem("scoutai_selected_leagues", JSON.stringify(selectedLeagueIds));

      if (!authUser) {
        setMessage("已保存到本机。登录后可同步到云端。");
        setSavedPreferences(nextPreferences);
        setSavedLeagueIds(selectedLeagueIds);
        setSaveFlash(true);
        return;
      }

      const { error: upsertError } = await supabase
        .from("user_preferences")
        .upsert({ user_id: authUser.id, ...nextPreferences }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;
      setMessage("设置已保存并同步。");
      setSavedPreferences(nextPreferences);
      setSavedLeagueIds(selectedLeagueIds);
      setSaveFlash(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const activeProfile = riskProfiles[preferences.risk_level];
  const isPro = membership.plan === "pro" && membership.status === "active";
  const settingsDirty =
    !samePreferences(preferences, savedPreferences) || !sameList(selectedLeagueIds, savedLeagueIds);
  const saveDockVisible = settingsDirty || saving || saveFlash;

  useEffect(() => {
    if (settingsDirty) setSaveFlash(false);
  }, [settingsDirty]);

  useEffect(() => {
    if (!saveFlash) return;
    const timer = window.setTimeout(() => setSaveFlash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [saveFlash]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="mt-2 text-sm text-white/60">
          设置风险偏好、关注联赛和模型市场，ScoutAI 会据此调整首页推荐、单场预测推荐和 AI 风控建议。
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {message && <p className="text-xs text-[color:var(--accent)]">{message}</p>}

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <h2 className="text-sm font-semibold">账户</h2>
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
          <div className="rounded-xl bg-black/30 p-3">
            <div className="text-white/45">当前邮箱</div>
            <div className="mt-1 font-mono text-white/80">{email ?? "未登录"}</div>
          </div>
          <div className="rounded-xl bg-black/30 p-3">
            <div className="text-white/45">会员状态</div>
            <div className="mt-1 text-[color:var(--accent)]">
              {membership.plan === "pro"
                ? `Pro 高级版 · 有效至 ${new Date(
                    membership.proUntil ?? ""
                  ).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                : "免费版 · 基础预测"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 p-3">
            <div className="text-[color:var(--accent)]/70">预测积分</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-xl font-semibold text-[color:var(--accent)]">
                {predictionCredits}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!authUser) {
                    router.push("/login");
                    return;
                  }
                  setPurchaseOpen(true);
                }}
                className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_18px_rgba(0,255,135,0.35)] hover:bg-emerald-300"
              >
                {isPro ? "购买积分" : "升级会员"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">风险偏好</h2>
            <p className="mt-1 text-xs text-white/50">
              风险偏好会自动调整下面的模型、市场和策略模式；单场预测推荐会直接按每场给出建议占比。
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {riskProfileList.map((profile) => {
            const active = preferences.risk_level === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => applyRiskLevel(profile.id)}
                className={`rounded-xl border p-4 text-left transition ${optionSelectedClass(active)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{profile.label}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] ${
                      active
                        ? "bg-[color:var(--accent)] text-black"
                        : "bg-white/10 text-white/45"
                    }`}
                  >
                    {profile.tone}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-white/58">{profile.summary}</p>
                <p className="mt-2 text-[11px] leading-5 text-white/40">
                  {profile.recommended}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">模型与市场</h2>
            <p className="mt-1 text-xs text-white/50">
              当前按“{activeProfile.label}”推荐。模型负责判断比赛，市场决定你主要关注哪些方向。
            </p>
          </div>
          <div className="rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1.5 text-[11px] text-[color:var(--accent)]">
            {preferences.preferred_models.length} 个模型 · {preferences.preferred_markets.length} 个市场
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.3fr]">
          <div>
            <div className="mb-2 text-[11px] text-white/45">模型说明</div>
            <div className="grid gap-2">
              {modelOptions.map((option) => {
                const checked = preferences.preferred_models.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-xl border p-3 transition ${optionSelectedClass(checked)}`}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            preferred_models: toggleString(
                              prev.preferred_models,
                              option.id
                            ),
                          }))
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="flex items-center gap-2 text-xs font-semibold text-white">
                          {option.label}
                          {option.badge && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/55">
                              {option.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-[11px] leading-5 text-white/45">
                          {option.description}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] text-white/45">关注市场</div>
            <div className="grid gap-2 md:grid-cols-2">
              {marketOptions.map((option) => {
                const checked = preferences.preferred_markets.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-xl border p-3 transition ${optionSelectedClass(checked)}`}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            preferred_markets: toggleString(
                              prev.preferred_markets,
                              option.id
                            ),
                          }))
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="flex items-center gap-2 text-xs font-semibold text-white">
                          {option.label}
                          {option.badge && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/55">
                              {option.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-[11px] leading-5 text-white/45">
                          {option.description}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] text-white/45">策略模式</div>
          <div className="grid gap-2 md:grid-cols-3">
            {betTypeOptions.map((option) => {
              const checked = preferences.bet_type.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`cursor-pointer rounded-xl border p-3 transition ${optionSelectedClass(checked)}`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          bet_type: toggleString(prev.bet_type, option.id),
                        }))
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className="text-xs font-semibold text-white">{option.label}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-white/45">
                        {option.description}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--accent)]/25 bg-[linear-gradient(180deg,rgba(0,255,135,0.08),rgba(26,26,26,0.92))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.55)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--accent)]">
              首页优先展示
            </div>
            <h2 className="text-xl font-semibold tracking-tight">关注联赛</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              这里会直接影响首页推荐、热门排序和赛前筛选。先选你最常看的赛事，目前只开放五大联赛和世界杯。
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs font-semibold text-white/75">
            已选 {selectedLeagueIds.length} / {leagueOptions.length}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {leagueGroups.map((group) => (
            <div key={group.group}>
              <div className="mb-3 text-xs font-semibold text-white/65">{group.group}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((league) => {
                  const checked = selectedLeagueIds.includes(league.id);
                  return (
                    <label
                      key={league.id}
                      className={`min-h-24 cursor-pointer rounded-2xl border p-4 transition ${
                        checked
                          ? "border-[color:var(--accent)] bg-[color:var(--accent)]/12 shadow-[0_0_28px_rgba(0,255,135,0.18)]"
                          : "border-white/10 bg-black/28 hover:border-white/25 hover:bg-white/[0.03]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedLeagueIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== league.id)
                              : [...prev, league.id]
                          )
                        }
                        className="sr-only"
                      />
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block text-lg font-semibold text-white">{league.name}</span>
                          <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)]/70">
                            {league.short}
                          </span>
                          <span className="mt-3 block text-xs leading-5 text-white/50">
                            {league.description}
                          </span>
                        </span>
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
                            checked
                              ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-black"
                              : "border-white/15 bg-black/35 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 border-t border-white/8 pt-4">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
          className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs text-white/65 hover:border-red-400/60 hover:text-red-300"
        >
          退出当前账号
        </button>
      </div>

      <div
        className={`sticky bottom-4 z-30 mt-4 rounded-2xl border p-3 backdrop-blur transition-all duration-300 md:flex md:items-center md:justify-between md:gap-4 ${
          saveDockVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-6 opacity-0"
        } ${
          settingsDirty || saving
            ? "border-amber-300/35 bg-[#151309]/95 shadow-[0_16px_70px_rgba(245,158,11,0.18),0_20px_80px_rgba(0,0,0,0.65)]"
            : "border-[color:var(--accent)]/28 bg-[#07130d]/92 shadow-[0_16px_60px_rgba(0,255,136,0.12),0_20px_80px_rgba(0,0,0,0.55)]"
        }`}
        aria-hidden={!saveDockVisible}
      >
        <div>
          <div
            className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
              settingsDirty || saving
                ? "bg-amber-300/12 text-amber-200"
                : "bg-[color:var(--accent)]/12 text-[color:var(--accent)]"
            }`}
          >
            {saving ? "正在保存" : settingsDirty ? "有修改未保存" : "已保存"}
          </div>
          <p className="mt-2 text-xs text-white/52">
            {settingsDirty
              ? "保存后会同步到账号，并更新单场预测推荐的模型和市场偏好。"
              : "设置已同步，提示会自动收起。"}
          </p>
        </div>
        <button
          type="button"
          disabled={saving || !settingsDirty}
          onClick={saveSettings}
          className={`mt-3 min-h-12 rounded-2xl px-8 text-base font-black transition disabled:cursor-not-allowed disabled:opacity-75 md:mt-0 ${
            settingsDirty || saving
              ? "bg-amber-300 text-black shadow-[0_0_28px_rgba(252,211,77,0.48)] hover:bg-amber-200 hover:shadow-[0_0_38px_rgba(252,211,77,0.62)]"
              : "border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
          }`}
        >
          {saving ? "正在保存..." : settingsDirty ? "保存全部设置" : "已保存"}
        </button>
      </div>

      <ProPurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        email={authUser?.email ?? email}
        accessToken={authSession?.access_token}
        defaultPlanId={isPro ? "renewal" : "trial"}
        heading={isPro ? "购买 Pro 预测积分" : "开通 Pro 预测积分"}
      />
    </div>
  );
}
