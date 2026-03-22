'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, signOut } from "@/lib/supabase";

type RiskLevel = "conservative" | "balanced" | "aggressive";
type Currency = "USD" | "CNY" | "HKD";

type Preferences = {
  risk_level: RiskLevel | null;
  capital: number;
  currency: Currency;
  preferred_models: string[];
  bet_type: string[];
  preferred_markets: string[];
  favorite_leagues: string[];
};

type Notifications = {
  goal: boolean;
  cards: boolean;
  corners: boolean;
  odds_shift: boolean;
  upset: boolean;
  ai_update: boolean;
};

const defaultPreferences: Preferences = {
  risk_level: "balanced",
  capital: 0,
  currency: "CNY",
  preferred_models: [],
  bet_type: [],
  preferred_markets: [],
  favorite_leagues: [],
};

const defaultNotifications: Notifications = {
  goal: true,
  cards: true,
  corners: false,
  odds_shift: false,
  upset: false,
  ai_update: false,
};

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

const ALL_LEAGUES = [
  { group: "五大联赛", items: [
    { id: 39, name: "英超" }, { id: 140, name: "西甲" }, { id: 78, name: "德甲" },
    { id: 61, name: "法甲" }, { id: 135, name: "意甲" },
  ]},
  { group: "欧洲杯赛", items: [
    { id: 2, name: "欧冠" }, { id: 3, name: "欧联杯" }, { id: 848, name: "欧会杯" },
  ]},
  { group: "国际赛事", items: [
    { id: 1, name: "世界杯" }, { id: 4, name: "欧洲杯" },
    { id: 5, name: "亚洲杯" }, { id: 9, name: "美洲杯" },
  ]},
  { group: "亚洲联赛", items: [
    { id: 17, name: "亚冠" }, { id: 169, name: "中超" }, { id: 98, name: "日职联" },
    { id: 292, name: "韩K联赛" }, { id: 188, name: "澳超" },
  ]},
  { group: "其他联赛", items: [
    { id: 253, name: "MLS" }, { id: 203, name: "土超" }, { id: 88, name: "荷甲" },
    { id: 94, name: "葡超" }, { id: 113, name: "苏超" },
  ]},
];

const LEAGUE_ID_MAP: Record<string, number> = Object.fromEntries(
  ALL_LEAGUES.flatMap((g) => g.items.map((l) => [l.name, l.id]))
);

const DEFAULT_LEAGUE_IDS = [39, 140, 78, 135, 61, 2, 3];

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [notifications, setNotifications] =
    useState<Notifications>(defaultNotifications);
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>(DEFAULT_LEAGUE_IDS);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingLeagues, setSavingLeagues] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        if (!supabase) {
          setPreferences(defaultPreferences);
          setNotifications(defaultNotifications);
          setEmail("demo@scoutai.app");
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setEmail(null);
          setPreferences(defaultPreferences);
          setNotifications(defaultNotifications);
          return;
        }
        setEmail(user.email ?? null);

        const { data, error: prefError } = await supabase
          .from("user_preferences")
          .select(
            "risk_level, capital, currency, preferred_models, bet_type, preferred_markets, favorite_leagues"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!prefError && data) {
          setPreferences({
            risk_level: (data.risk_level as RiskLevel | null) ?? "balanced",
            capital: data.capital ?? 0,
            currency: (data.currency as Currency) ?? "CNY",
            preferred_models: data.preferred_models ?? [],
            bet_type: data.bet_type ?? [],
            preferred_markets: data.preferred_markets ?? [],
            favorite_leagues: data.favorite_leagues ?? [],
          });
        }

        try {
          const raw = window.localStorage.getItem("scoutai_selected_leagues");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) setSelectedLeagueIds(parsed);
          }
        } catch {
          // 忽略
        }
      } catch (err: any) {
        setError(err.message ?? "加载设置失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleListField(field: keyof Preferences, value: string) {
    setPreferences((prev) => {
      const list = (prev[field] as string[]) ?? [];
      const exists = list.includes(value);
      return {
        ...prev,
        [field]: exists ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  }

  async function savePreferences() {
    setError(null);
    if (!supabase) return;
    setSavingPrefs(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("请先登录后再修改设置。");

      const { error: upsertError } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            risk_level: preferences.risk_level,
            capital: preferences.capital,
            currency: preferences.currency,
            preferred_models: preferences.preferred_models,
            bet_type: preferences.bet_type,
            preferred_markets: preferences.preferred_markets,
            favorite_leagues: preferences.favorite_leagues,
          },
          { onConflict: "user_id" }
        );
      if (upsertError) throw upsertError;
    } catch (err: any) {
      setError(err.message ?? "保存投资偏好失败，请稍后重试。");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function saveLeagues() {
    setError(null);
    setSavingLeagues(true);
    try {
      // 保存到 localStorage
      if (typeof window !== "undefined") {
        window.localStorage.setItem("scoutai_selected_leagues", JSON.stringify(selectedLeagueIds));
      }

      // 同步到 Supabase（转换 ID 为联赛名存储）
      if (supabase) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (!userError && user) {
          const leagueNames = ALL_LEAGUES.flatMap((g) => g.items)
            .filter((l) => selectedLeagueIds.includes(l.id))
            .map((l) => l.name);
          await supabase
            .from("user_preferences")
            .upsert({ user_id: user.id, favorite_leagues: leagueNames }, { onConflict: "user_id" });
        }
      }

      // 刷新服务端缓存，再跳回首页
      router.refresh();
      router.push("/");
    } catch (err: any) {
      setError(err.message ?? "保存关注联赛失败，请稍后重试。");
      setSavingLeagues(false);
    }
  }

  function renderMembership() {
    const isPro = false;
    if (!isPro) {
      return (
        <div className="space-y-1">
          <p className="text-sm text-white">
            会员状态：<span className="text-[color:var(--accent)]">免费版</span>
          </p>
          <p className="text-xs font-light text-[#888888]">
            升级高级会员可解锁赔率异动提醒、爆冷预警和高级模型。
          </p>
        </div>
      );
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
      <p className="text-sm font-light text-[#888888]">
        配置你的账户信息、投资偏好、通知方式和关注联赛，ScoutAI 将基于这些信息为你定制推荐。
      </p>

      {error && (
        <p className="text-xs text-red-400">
          {error}
        </p>
      )}

      {/* 区块1：账户信息 */}
      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <h2 className="text-sm font-semibold">账户信息</h2>
        <div className="mt-3 grid gap-4 text-xs text-white/80 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-[11px] text-[#888888]">登录邮箱</div>
            <div className="rounded-lg bg-black/40 px-3 py-2 font-mono text-xs">
              {email ?? "未登录"}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] text-[#888888]">会员状态</div>
            {renderMembership()}
            <button className="mt-1 inline-flex items-center rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_24px_rgba(0,255,135,0.7)] hover:bg-emerald-300">
              升级为高级会员
            </button>
          </div>
        </div>
      </section>

      {/* 区块2：投资偏好 */}
      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">投资偏好</h2>
          <span className="text-[11px] font-light text-[#888888]">
            这些设置会同步到推荐策略与投注建议中。
          </span>
        </div>
        <div className="mt-3 grid gap-4 text-xs md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[11px] text-[#888888]">风险偏好</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "conservative", label: "保守型" },
                { id: "balanced", label: "稳健型" },
                { id: "aggressive", label: "激进型" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setPreferences((p) => ({
                      ...p,
                      risk_level: opt.id as RiskLevel,
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs ${
                    preferences.risk_level === opt.id
                      ? "bg-[color:var(--accent)]/20 text-[color:var(--accent)] border border-[color:var(--accent)]/60"
                      : "border border-[#333333] bg-black/40 text-white/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] text-[#888888]">总资金金额</div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={preferences.capital}
                onChange={(e) =>
                  setPreferences((p) => ({
                    ...p,
                    capital: Number(e.target.value || 0),
                  }))
                }
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/40"
                placeholder="例如 10000"
              />
              <select
                value={preferences.currency}
                onChange={(e) =>
                  setPreferences((p) => ({
                    ...p,
                    currency: e.target.value as Currency,
                  }))
                }
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs text-white outline-none focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/40"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="HKD">HKD</option>
              </select>
            </div>
            <p className="text-[11px] font-light text-[#888888]">
              AI 将根据此金额和风险档位评估每场建议投入。
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 text-xs md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[11px] text-[#888888]">预测模型</div>
            {[
              "Bayesian Dynamic Update",
              "Poisson + Elo + XGBoost",
              "Kelly Criterion",
              "Odds Value Arbitrage",
              "Upset Probability Detection",
            ].map((id) => (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={preferences.preferred_models.includes(id)}
                  onChange={() =>
                    toggleListField("preferred_models", id)
                  }
                />
                <span>{translateModel(id)}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] text-[#888888]">
              投注类型 & 偏好市场
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-[11px] text-white/70">投注类型</div>
              <div className="mt-1 space-y-1">
                {[
                  "Single",
                  "Accumulator/Parlay",
                  "Low Odds",
                  "High Odds",
                  "Upset Hunter",
                ].map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={preferences.bet_type.includes(id)}
                      onChange={() =>
                        toggleListField("bet_type", id)
                      }
                    />
                    <span>{translateBetType(id)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-[11px] text-white/70">偏好市场</div>
              <div className="mt-1 space-y-1">
                {[
                  "1X2",
                  "Asian Handicap",
                  "Over/Under",
                  "Corners",
                  "BTTS",
                  "HT/FT",
                  "Exact Score",
                  "Other",
                ].map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={preferences.preferred_markets.includes(id)}
                      onChange={() =>
                        toggleListField("preferred_markets", id)
                      }
                    />
                    <span>{translateMarket(id)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={savingPrefs}
            onClick={savePreferences}
            className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.8)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingPrefs ? "保存中..." : "保存投资偏好"}
          </button>
        </div>
      </section>

      {/* 区块3：通知设置 */}
      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <h2 className="text-sm font-semibold">通知设置</h2>
        <p className="mt-1 text-[11px] font-light text-[#888888]">
          控制哪些事件会触发提醒。部分高级功能需要升级会员后才能启用。
        </p>
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-black/30 px-3 py-2">
            <span className="text-white/80">进球提醒</span>
            <input
              type="checkbox"
              checked={notifications.goal}
              onChange={(e) =>
                setNotifications((n) => ({
                  ...n,
                  goal: e.target.checked,
                }))
              }
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-black/30 px-3 py-2">
            <span className="text-white/80">黄红牌提醒</span>
            <input
              type="checkbox"
              checked={notifications.cards}
              onChange={(e) =>
                setNotifications((n) => ({
                  ...n,
                  cards: e.target.checked,
                }))
              }
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-black/30 px-3 py-2">
            <span className="text-white/80">角球提醒</span>
            <input
              type="checkbox"
              checked={notifications.corners}
              onChange={(e) =>
                setNotifications((n) => ({
                  ...n,
                  corners: e.target.checked,
                }))
              }
            />
          </label>
          {[
            {
              key: "odds_shift" as const,
              label: "赔率异动提醒",
            },
            {
              key: "upset" as const,
              label: "爆冷预警",
            },
            {
              key: "ai_update" as const,
              label: "AI 分析更新",
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex cursor-not-allowed items-center justify-between rounded-xl bg-black/30 px-3 py-2 opacity-70"
            >
              <span className="text-white/80">
                {item.label}
                <span className="ml-1 text-[11px] text-[#888888]">
                  （付费功能）
                </span>
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[#888888]">已锁定</span>
                <span className="text-sm">🔒</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* 区块4：关注联赛管理 */}
      <section className="rounded-2xl border border-white/8 bg-[color:var(--card)]/90 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">关注联赛管理</h2>
          <span className="text-[11px] font-light text-[#888888]">
            首页只显示已勾选联赛的比赛。
          </span>
        </div>
        <div className="mt-2 mb-3 flex flex-wrap gap-1.5">
          {selectedLeagueIds.length === 0 ? (
            <span className="text-xs text-white/40">未选择任何联赛</span>
          ) : (
            ALL_LEAGUES.flatMap((g) => g.items)
              .filter((l) => selectedLeagueIds.includes(l.id))
              .map((l) => (
                <span
                  key={l.id}
                  className="rounded-full bg-[color:var(--accent)]/15 px-2.5 py-0.5 text-[11px] text-[color:var(--accent)]"
                >
                  {l.name}
                </span>
              ))
          )}
        </div>
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
          {ALL_LEAGUES.map((group) => (
            <div key={group.group} className="space-y-1.5 rounded-xl bg-black/30 p-3">
              <div className="text-[11px] font-semibold text-white/70">{group.group}</div>
              {group.items.map((league) => {
                const checked = selectedLeagueIds.includes(league.id);
                return (
                  <label key={league.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-white/30 bg-black/60 accent-[color:var(--accent)]"
                      checked={checked}
                      onChange={() =>
                        setSelectedLeagueIds((prev) =>
                          checked ? prev.filter((id) => id !== league.id) : [...prev, league.id]
                        )
                      }
                    />
                    <span className={checked ? "text-white" : "text-white/60"}>{league.name}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            已选 {selectedLeagueIds.length} 个联赛
          </span>
          <button
            type="button"
            disabled={savingLeagues}
            onClick={saveLeagues}
            className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_30px_rgba(0,255,135,0.8)] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingLeagues ? "保存中..." : "保存关注联赛"}
          </button>
        </div>
      </section>

      {/* 底部：登出 & 版本号 */}
      <footer className="mt-2 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-[#888888]">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
          className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] text-white/75 hover:border-red-400/60 hover:text-red-300"
        >
          登出当前账号
        </button>
        <span>ScoutAI v0.1.0</span>
      </footer>
    </div>
  );
}

