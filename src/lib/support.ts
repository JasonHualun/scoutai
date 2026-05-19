export const SUPPORT_QQ = "491666856";
export const SUPPORT_HOURS = "09:00 - 18:00";
export const SUPPORT_RESPONSE = "通常 30 分钟内处理";

export function supportMessage(email?: string) {
  return email
    ? `我的 ScoutAI 注册邮箱是 ${email}，收不到验证邮件，请帮我人工验证账号。`
    : "我的 ScoutAI 账号收不到验证邮件，请帮我人工验证账号。";
}
