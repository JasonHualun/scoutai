"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/authStore";

const LEAGUE_ID_MAP: Record<string, number> = {
  英超: 39, 西甲: 140, 德甲: 78, 法甲: 61, 意甲: 135,
  欧冠: 2, 欧联杯: 3, 欧会杯: 848,
  世界杯: 1, 欧洲杯: 4, 亚洲杯: 5, 美洲杯: 9,
  亚冠: 17, 中超: 169, 日职联: 98, "韩K联赛": 292, 澳超: 188,
  MLS: 253, 土超: 203, 荷甲: 88, 葡超: 94, 苏超: 113,
};

type RiskLevel = "conservative" | "balanced" | "aggressive";
type Currency = "USD" | "CNY" | "HKD";

const steps = [
  "风险偏好",
  "资金设置",
  "预测模型",
  "投注偏好",
  "关注联赛",
  "完成",
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [step, setStep] = useState<number>(1);
  const [riskLevel, setRiskLevel] = useState<RiskLevel | null>(null);
  const [capital, setCapital] = useState<string>("0");
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [preferredModels, setPreferredModels] = useState<string[]>([]);
  const [betType, setBetType] = useState<string[]>([]);
  const [preferredMarkets, setPreferredMarkets] = useState<string[]>([]);
  const [favoriteLeagues, setFavoriteLeagues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = steps.length;

  // 登录守卫：auth 加载完成后若无用户，跳转登录页
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  function toggleInList(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  function getSummaryText() {
    const isUpsetHunter = betType.includes("Upset Hunter");
    const likesHighOdds = betType.includes("High Odds");
    const likesLowOdds = betType.includes("Low Odds");
    const isSingle = betType.includes("Single");

    if (riskLevel === "aggressive" && (isUpsetHunter || likesHighOdds)) {
      return [
        "你是一位敢于逆势而为的冷门猎手 🎯",
        "你不满足于平庸的赔率，你在寻找被市场低估的机会。",
        "ScoutAI 将为你优先推送爆冷预警和高价值赔率信号。",
        "让我们一起开启你的冷门猎手之路。",
      ].join("\n");
    }

    if (riskLevel === "conservative" && isSingle && likesLowOdds) {
      return [
        "你是一位稳健的价值投资者 🛡️",
        "你相信长期正收益胜过一夜暴富。",
        "ScoutAI 将为你筛选高确定性、低风险的价值机会。",
        "让我们一起开启你的稳健增值之路。",
      ].join("\n");
    }

    if (riskLevel === "balanced") {
      return [
        "你是一位理性的数据驱动者 ⚖️",
        "你用逻辑和概率做决策，不被情绪左右。",
        "ScoutAI 将为你提供多模型融合的综合分析。",
        "让我们一起开启你的智慧投注之路。",
      ].join("\n");
    }

    // 通用默认文案
    return [
      "你是一位重视长期回报的理性玩家 📊",
      "你希望在控制风险的前提下持续提升胜率。",
      "ScoutAI 将根据你的偏好为你定制推荐策略。",
      "让我们一起开启你的专属数据之旅。",
    ].join("\n");
  }

  function translateModel(id: string) {
    const map: Record<string, string> = {
      "Bayesian Dynamic Update": "贝叶斯动态更新",
      "Poisson + Elo + XGBoost": "多模型融合",
      "Kelly Criterion": "凯利公式",
      "Odds Value Arbitrage": "赔率偏差套利",
      "Upset Probability Detection": "爆冷概率检测",
    };
    return map[id] ?? id;
  }

  function getInvestmentStyleLabel() {
    const base =
      riskLevel === "conservative"
        ? "保守型"
        : riskLevel === "balanced"
          ? "稳健型"
          : "激进型";

    let suffix = "";
    if (betType.includes("Upset Hunter")) {
      suffix = "冷门猎手";
    } else if (betType.includes("High Odds")) {
      suffix = "偏好高赔率";
    } else if (betType.includes("Low Odds")) {
      suffix = "稳健价值";
    } else if (betType.includes("Accumulator/Parlay")) {
      suffix = "串关博取高回报";
    } else if (betType.includes("Single")) {
      suffix = "专注单场判断";
    }

    return suffix ? `${base} · ${suffix}` : base;
  }

  function translateBetType(id: string) {
    const map: Record<string, string> = {
      Single: "单场",
      "Accumulator/Parlay": "串关",
      "Low Odds": "低赔率",
      "High Odds": "高赔率",
      "Upset Hunter": "搏冷门",
    };
    return map[id] ?? id;
  }

  function translateMarket(id: string) {
    const map: Record<string, string> = {
      "1X2": "胜负平",
      "Asian Handicap": "让球",
      "Over/Under": "大小球",
      Corners: "角球",
      BTTS: "两队都进球",
      "HT/FT": "半场/全场",
      "Exact Score": "进球数",
      Other: "其他",
    };
    return map[id] ?? id;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    // 让 input/select/textarea 的原生行为正常（如 textarea 换行）
    if (
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLInputElement && e.target.type === "number")
    ) return;
    e.preventDefault();
    if (step < totalSteps) {
      if (!canGoNext()) {
        setError("请至少选择一项后再继续");
        return;
      }
      setError(null);
      setStep((s) => Math.min(totalSteps, s + 1));
    } else {
      handleFinish();
    }
  }

  function canGoNext() {
    if (step === 1) return riskLevel !== null;
    if (step === 2) return capital.trim() !== "";
    if (step === 3) return preferredModels.length > 0;
    if (step === 4)
      return betType.length > 0 && preferredMarkets.length > 0;
    if (step === 5) return favoriteLeagues.length > 0;
    return true;
  }

  async function handleFinish() {
    setError(null);

    if (authLoading) {
      setError("正在验证登录状态，请稍候...");
      return;
    }

    if (!user) {
      setError("未获取到登录用户，请先登录。");
      router.push("/login");
      return;
    }

    setSaving(true);
    try {

      const numericCapital = parseFloat(capital || "0") || 0;

      const { error: insertError } = await supabase
        .from("user_preferences")
        .insert({
          user_id: user.id,
          risk_level: riskLevel,
          capital: numericCapital,
          currency,
          preferred_models: preferredModels,
          bet_type: betType,
          preferred_markets: preferredMarkets,
          favorite_leagues: favoriteLeagues,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      const selectedIds = favoriteLeagues
        .map((l) => LEAGUE_ID_MAP[l])
        .filter((id): id is number => id !== undefined);
      if (typeof window !== "undefined" && selectedIds.length > 0) {
        window.localStorage.setItem("scoutai_selected_leagues", JSON.stringify(selectedIds));
      }

      router.push("/");
    } catch (err: any) {
      setError(
        err.message ?? "保存个性化设置失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              选择你的风险偏好
            </h1>
            <div className="mt-3 grid gap-3">
              <button
                type="button"
                onClick={() => setRiskLevel("conservative")}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                  riskLevel === "conservative"
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5"
                    : "border-[#333333] bg-black/30 hover:border-[color:var(--accent)]/60"
                }`}
              >
                <span className="text-lg">🛡️</span>
                <div className="text-sm font-semibold">保守型</div>
              </button>
              {riskLevel === "conservative" && (
                <p className="text-xs font-light text-[#888888]">
                  更看重资金安全与稳定回报。
                </p>
              )}
              <button
                type="button"
                onClick={() => setRiskLevel("balanced")}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                  riskLevel === "balanced"
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5"
                    : "border-[#333333] bg-black/30 hover:border-[color:var(--accent)]/60"
                }`}
              >
                <span className="text-lg">⚖️</span>
                <div className="text-sm font-semibold">稳健型</div>
              </button>
              {riskLevel === "balanced" && (
                <p className="text-xs font-light text-[#888888]">
                  在收益与风险之间寻找平衡点。
                </p>
              )}
              <button
                type="button"
                onClick={() => setRiskLevel("aggressive")}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                  riskLevel === "aggressive"
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5"
                    : "border-[#333333] bg-black/30 hover:border-[color:var(--accent)]/60"
                }`}
              >
                <span className="text-lg">🚀</span>
                <div className="text-sm font-semibold">激进型</div>
              </button>
              {riskLevel === "aggressive" && (
                <p className="text-xs font-light text-[#888888]">
                  追求高收益，愿意承受较大波动。
                </p>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              设置总资金金额
            </h1>
            <p className="text-sm text-white/65">
              AI 将根据此金额用凯利公式计算每场建议投入。若填 0，则只看分析不输出投资建议。
            </p>
            <div className="mt-3 space-y-3">
              <div className="space-y-1 text-sm">
                <label className="text-xs text-white/70">
                  总资金金额
                </label>
                <input
                  type="number"
                  min="0"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[color:var(--accent)]/40 placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2"
                  placeholder="例如 10000"
                />
              </div>
              <div className="space-y-1 text-sm">
                <label className="text-xs text-white/70">
                  货币
                </label>
                <select
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as Currency)
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/40"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="HKD">HKD</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              选择希望使用的预测模型
            </h1>
            <p className="text-sm text-white/65">
              你可以多选。不同模型会在后台融合，给出综合判断。
            </p>
            <div className="mt-3 space-y-3 text-sm">
              {[
                {
                  id: "Bayesian Dynamic Update",
                  label: "贝叶斯动态更新 (Bayesian Dynamic Update)",
                  desc: "随比赛进行实时修正概率，适合喜欢追踪赛中变化的用户。",
                  suited: "适合：重视实时数据、喜欢赛中投注。",
                },
                {
                  id: "Poisson + Elo + XGBoost",
                  label: "多模型融合 (Poisson + Elo + XGBoost)",
                  desc: "三套模型加权投票，对冲单一模型的缺陷，提升整体稳定性。",
                  suited: "适合：追求长期稳定胜率的用户。",
                },
                {
                  id: "Kelly Criterion",
                  label: "凯利公式 (Kelly Criterion)",
                  desc: "根据胜率自动计算最优投入金额，避免过度下注。",
                  suited: "适合：有资金管理意识、希望控制风险的用户。",
                },
                {
                  id: "Odds Value Arbitrage",
                  label: "赔率偏差套利 (Odds Value Arbitrage)",
                  desc: "对比模型胜率与赔率隐含胜率，只在有价值时出手。",
                  suited: "适合：追求正期望值、不追求每场都投的用户。",
                },
                {
                  id: "Upset Probability Detection",
                  label: "爆冷概率检测 (Upset Probability Detection)",
                  desc: "识别被低估的弱队，捕捉高赔率冷门机会。",
                  suited: "适合：喜欢搏冷门、追求高赔率回报的用户。",
                },
              ].map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-xs hover:border-[color:var(--accent)]/60"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)] accent-[color:var(--accent)]"
                    checked={preferredModels.includes(m.id)}
                    onChange={() =>
                      setPreferredModels(
                        toggleInList(preferredModels, m.id)
                      )
                    }
                  />
                  <div className="space-y-1">
                    <div className="text-[13px] text-white">{m.label}</div>
                    <p className="text-[11px] text-white/70">{m.desc}</p>
                    <p className="text-[11px] text-[color:var(--accent)]/80">
                      {m.suited}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-white/55">
              高级模型需要付费会员解锁，现在选好，升级后将立即生效。
            </p>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              设置你的投注偏好
            </h1>
            <p className="text-sm text-white/65">
              我们会优先推荐符合你偏好的投注市场与玩法。
            </p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-black/30 p-3">
                <div className="text-xs font-semibold text-white/70">
                  投注类型
                </div>
                {[
                  { id: "Single", label: "单场 (Single) - 专注单场判断" },
                  {
                    id: "Accumulator/Parlay",
                    label: "串关 (Accumulator/Parlay) - 多场组合放大收益",
                  },
                  {
                    id: "Low Odds",
                    label: "低赔率 (Low Odds) - 稳定小收益",
                  },
                  {
                    id: "High Odds",
                    label: "高赔率 (High Odds) - 高风险高回报",
                  },
                  {
                    id: "Upset Hunter",
                    label: "搏冷门 (Upset Hunter) - 专注爆冷机会",
                  },
                ].map((b) => (
                  <label
                    key={b.id}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)] accent-[color:var(--accent)]"
                      checked={betType.includes(b.id)}
                      onChange={() =>
                        setBetType(toggleInList(betType, b.id))
                      }
                    />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2 rounded-xl bg-black/30 p-3">
                <div className="text-xs font-semibold text-white/70">
                  偏好市场
                </div>
                {[
                  { id: "1X2", label: "胜负平 (1X2)" },
                  {
                    id: "Asian Handicap",
                    label: "让球 (Asian Handicap)",
                  },
                  { id: "Over/Under", label: "大小球 (Over/Under)" },
                  { id: "Corners", label: "角球 (Corners)" },
                  { id: "BTTS", label: "两队都进球 (BTTS)" },
                  { id: "HT/FT", label: "半场/全场 (HT/FT)" },
                  { id: "Exact Score", label: "进球数 (Exact Score)" },
                  { id: "Other", label: "其他 (Other)" },
                ].map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)] accent-[color:var(--accent)]"
                      checked={preferredMarkets.includes(m.id)}
                      onChange={() =>
                        setPreferredMarkets(
                          toggleInList(preferredMarkets, m.id)
                        )
                      }
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              选择你重点关注的联赛
            </h1>
            <p className="text-sm text-white/65">
              我们会优先加载和展示这些赛事的分析与提醒。
            </p>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
              <div className="space-y-1 rounded-xl bg-black/30 p-3">
                <div className="text-[11px] font-semibold text-white/70">
                  五大联赛
                </div>
                {[
                  "英超",
                  "西甲",
                  "德甲",
                  "法甲",
                  "意甲",
                ].map((l) => (
                  <label
                    key={l}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)]"
                      checked={favoriteLeagues.includes(l)}
                      onChange={() =>
                        setFavoriteLeagues(
                          toggleInList(favoriteLeagues, l)
                        )
                      }
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1 rounded-xl bg-black/30 p-3">
                <div className="text-[11px] font-semibold text-white/70">
                  欧洲杯赛
                </div>
                {["欧冠", "欧联杯", "欧会杯"].map((l) => (
                  <label
                    key={l}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)]"
                      checked={favoriteLeagues.includes(l)}
                      onChange={() =>
                        setFavoriteLeagues(
                          toggleInList(favoriteLeagues, l)
                        )
                      }
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1 rounded-xl bg-black/30 p-3">
                <div className="text-[11px] font-semibold text-white/70">
                  国际赛事
                </div>
                {["世界杯", "欧洲杯", "亚洲杯", "美洲杯"].map(
                  (l) => (
                    <label
                      key={l}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)]"
                        checked={favoriteLeagues.includes(l)}
                        onChange={() =>
                          setFavoriteLeagues(
                            toggleInList(favoriteLeagues, l)
                          )
                        }
                      />
                      <span>{l}</span>
                    </label>
                  )
                )}
              </div>
              <div className="space-y-1 rounded-xl bg-black/30 p-3">
                <div className="text-[11px] font-semibold text-white/70">
                  亚洲联赛
                </div>
                {[
                  "亚冠",
                  "中超",
                  "日职联",
                  "韩K联赛",
                  "澳超",
                ].map((l) => (
                  <label
                    key={l}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)]"
                      checked={favoriteLeagues.includes(l)}
                      onChange={() =>
                        setFavoriteLeagues(
                          toggleInList(favoriteLeagues, l)
                        )
                      }
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1 rounded-xl bg-black/30 p-3 md:col-span-2">
                <div className="text-[11px] font-semibold text-white/70">
                  其他联赛
                </div>
                {["MLS", "土超", "荷甲", "葡超", "苏超"].map((l) => (
                  <label
                    key={l}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 text-[color:var(--accent)]"
                      checked={favoriteLeagues.includes(l)}
                      onChange={() =>
                        setFavoriteLeagues(
                          toggleInList(favoriteLeagues, l)
                        )
                      }
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">
              确认你的个性化设置
            </h1>
            <div className="rounded-xl border border-[color:var(--accent)]/40 bg-black/40 p-3 text-sm text-white/80">
              <p className="whitespace-pre-line leading-relaxed">
                {getSummaryText()}
              </p>
            </div>
            <div className="mt-1 text-xs text-white/60">
              下面是你的详细偏好摘要，点击下方按钮即可开始使用 ScoutAI。
            </div>
            <div className="mt-2 space-y-3 rounded-xl bg-black/30 p-3 text-xs text-white/75">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-[11px] text-white/60">
                    投资风格
                  </div>
                  <div className="mt-1">
                    {getInvestmentStyleLabel()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/60">
                    总资金金额
                  </div>
                  <div className="mt-1">
                    {capital} {currency}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/60">
                    预测模型
                  </div>
                  <div className="mt-1">
                    {preferredModels.map(translateModel).join("，")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/60">
                    投注类型
                  </div>
                  <div className="mt-1">
                    {betType.map(translateBetType).join("，")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/60">
                    偏好市场
                  </div>
                  <div className="mt-1">
                    {preferredMarkets.map(translateMarket).join("，")}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-white/60">
                  重点联赛
                </div>
                <div className="mt-1">
                  {favoriteLeagues.join("，")}
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center">
      <div className="w-full max-w-2xl rounded-2xl border border-white/8 bg-[color:var(--card)]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.9)]" onKeyDown={handleKeyDown}>
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>个性化设置</span>
            <span>
              步骤 {step} / {totalSteps}
            </span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-[color:var(--accent)] shadow-[0_0_20px_rgba(0,255,135,0.8)] transition-all"
              style={{
                width: `${(step / totalSteps) * 100}%`,
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-white/50">
            {steps.map((label, index) => (
              <span
                key={label}
                className={`rounded-full px-2 py-0.5 ${
                  index + 1 === step
                    ? "bg-[color:var(--accent)]/20 text-[color:var(--accent)]"
                    : "bg-black/40"
                }`}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>
        </div>

        {renderStep()}

        {error && (
          <p className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-xs text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一步
          </button>
          <div className="flex gap-2">
            {step < totalSteps && (
              <button
                type="button"
                disabled={!canGoNext()}
                onClick={() =>
                  setStep((s) => Math.min(totalSteps, s + 1))
                }
                className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.8)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一步
              </button>
            )}
            {step === totalSteps && (
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.8)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "保存中..." : "开启我的旅程 🚀"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

