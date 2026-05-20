import { createClient as _createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 客户端单例（向后兼容现有代码）
export const supabase = _createClient(supabaseUrl, supabaseAnonKey);

// 用于客户端组件
export function createClient() {
  return _createClient(supabaseUrl, supabaseAnonKey);
}

// 用于服务端（Server Components / Route Handlers）
export function createServerClient() {
  return _createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 未配置");
  }

  return _createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function verifyLoginCaptcha(captcha: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captcha }),
  });

  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "验证码错误，请重新输入");
}

export async function signUpWithEmail(email: string, password: string, captcha: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, captcha }),
  });

  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "注册失败，请稍后重试");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string, captcha: string) {
  await verifyLoginCaptcha(captcha);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
