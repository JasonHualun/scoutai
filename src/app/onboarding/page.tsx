"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/authStore";
import {
  DEFAULT_SIMULATED_POINTS,
  RiskLevel,
  betTypeOptions,
  defaultLeagueIds,
  leagueOptions,
  marketOptions,
  modelOptions,
  riskProfileList,
  riskProfiles,
  toggleString,
} from "@/lib/preference-options";
import { supabase } from "@/lib/supabase";

function optionSelectedClass(active: boolean) {
  return active
    ? "border-[color:var(--accent)]/70 bg-[color:var(--accent)]/10 text-white"
    : "border-white/10 bg-black/25 text-white/70 hover:border-white/25 hover:bg-white/[0.03]";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("balanced");
  const [simulatedPoints, setSimulatedPoints] = useState(DEFAULT_SIMULATED_POINTS);
  const [preferredModels, setPreferredModels] = useState<string[]>([
    ...riskProfiles.balanced.models,
  ]);
  const [preferredMarkets, setPreferredMarkets] = useState<string[]>([
    ...riskProfiles.balanced.markets,
  ]);
  const [betTypes, setBetTypes] = useState<string[]>([...riskProfiles.balanced.betTypes]);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>(defaultLeagueIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  function applyRiskLevel(nextRisk: RiskLevel) {
    const profile = riskProfiles[nextRisk];
    setRiskLevel(nextRisk);
    setPreferredModels([...profile.models]);
    setPreferredMarkets([...profile.markets]);
    setBetTypes([...profile.betTypes]);
  }

  async function handleFinish() {
    if (!user) {
      router.push("/login");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const favoriteLeagues = leagueOptions
        .filter((league) => selectedLeagueIds.includes(league.id))
        .map((league) => league.name);

      const { error: upsertError } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            risk_level: riskLevel,
            capital: simulatedPoints,
            currency: "CNY",
            preferred_models: preferredModels,
            bet_type: betTypes,
            preferred_markets: preferredMarkets,
            favorite_leagues: favoriteLeagues,
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upsertError) throw upsertError;

      window.localStorage.setItem(
        "scoutai_selected_leagues",
        JSON.stringify(selectedLeagueIds)
      );

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  const activeProfile = riskProfiles[riskLevel];

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center py-8">
      <div className="w-full max-w-5xl rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]/80">
            Setup
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">完成个性化设置</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            先选择风险偏好，ScoutAI 会自动推荐模型、关注市场和策略模式。看不懂模型也没关系，直接用推荐即可，之后可以在设置页随时修改。
          </p>
        </div>

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        <div className="mt-6 grid gap-5">
          <section className="rounded-xl bg-black/25 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">风险偏好与模拟积分</h2>
                <p className="mt-1 text-xs text-white/50">
                  模拟积分只用于 AI 计算单场风险上限，不代表真实支付。
                </p>
              </div>
              <label className="w-full md:w-56">
                <span className="mb-2 block text-[11px] text-white/45">模拟积分</span>
                <input
                  type="number"
                  min={0}
                  value={simulatedPoints}
                  onChange={(event) =>
                    setSimulatedPoints(Number(event.target.value || 0))
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {riskProfileList.map((profile) => {
                const active = riskLevel === profile.id;
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

          <section className="rounded-xl bg-black/25 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">模型与市场</h2>
                <p className="mt-1 text-xs text-white/50">
                  当前按“{activeProfile.label}”自动推荐，你也可以手动微调。
                </p>
              </div>
              <div className="rounded-full border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1.5 text-[11px] text-[color:var(--accent)]">
                已推荐 {preferredModels.length} 个模型 · {preferredMarkets.length} 个市场
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.3fr]">
              <div>
                <div className="mb-2 text-[11px] text-white/45">启用模型</div>
                <div className="grid gap-2">
                  {modelOptions.map((option) => {
                    const checked = preferredModels.includes(option.id);
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
                              setPreferredModels(toggleString(preferredModels, option.id))
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
                    const checked = preferredMarkets.includes(option.id);
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
                              setPreferredMarkets(toggleString(preferredMarkets, option.id))
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
                  const checked = betTypes.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`cursor-pointer rounded-xl border p-3 transition ${optionSelectedClass(checked)}`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setBetTypes(toggleString(betTypes, option.id))}
                          className="mt-1"
                        />
                        <span>
                          <span className="text-xs font-semibold text-white">
                            {option.label}
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
          </section>

          <section className="rounded-xl bg-black/25 p-4">
            <h2 className="text-sm font-semibold">关注联赛</h2>
            <p className="mt-1 text-xs text-white/50">
              首页会优先展示你关注的赛事，目前只开放五大联赛和世界杯。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/75 md:grid-cols-6">
              {leagueOptions.map((league) => {
                const checked = selectedLeagueIds.includes(league.id);
                return (
                  <label key={league.id} className="flex cursor-pointer items-center gap-2">
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
                    />
                    <span>{league.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleFinish}
            className="rounded-full bg-[color:var(--accent)] px-5 py-2 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.75)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : "开始使用 ScoutAI"}
          </button>
        </div>
      </div>
    </div>
  );
}
