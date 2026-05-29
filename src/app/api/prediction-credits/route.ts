import { NextResponse } from "next/server";

const message =
  "预测积分只能通过 /api/prediction-orders 的服务端事务扣减，旧扣分接口已关闭。";

export async function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: message }, { status: 410 });
}

