export const SUPPORT_QQ = "491666856";
export const SUPPORT_QQ_LINK = `tencent://message/?uin=${SUPPORT_QQ}&Site=ScoutAI&Menu=yes`;
export const SUPPORT_HOURS = "09:00 - 18:00";
export const SUPPORT_RESPONSE = "通常 30 分钟内处理";

export function supportMessage(email?: string) {
  return email
    ? `我的 ScoutAI 注册邮箱是 ${email}，订单编号是 ____，付款时间是 ____，请帮我核对开通。`
    : "我的 ScoutAI 注册邮箱是 ____，订单编号是 ____，付款时间是 ____，请帮我核对开通。";
}
