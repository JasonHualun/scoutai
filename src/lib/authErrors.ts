const errorMap: Record<string, string> = {
  "Already registered": "该邮箱已被注册",
  "User already registered": "该邮箱已被注册",
  "Email not confirmed": "邮箱未验证，请查收验证邮件",
  "Email rate limit exceeded": "邮件发送过于频繁，请1小时后再试",
  "Password should be at least 6 characters": "密码至少需要6个字符",
  "Unable to validate email address": "邮箱格式不正确",
  "Signup requires a valid password": "请输入有效的密码",
  "User not found": "用户不存在",
  "Invalid login credentials": "邮箱或密码错误",
  "Email link is invalid or has expired": "验证链接已失效或过期",
  "Too many requests": "请求过于频繁，请稍后再试",
  "Network request failed": "网络连接失败，请检查网络",
  "Failed to fetch": "网络连接失败，请检查网络",
};

export function translateAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  for (const [eng, chn] of Object.entries(errorMap)) {
    if (message.includes(eng)) return chn;
  }
  return "操作失败，请稍后重试";
}
