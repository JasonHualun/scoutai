import type { User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase";

export async function findAuthUserByEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  const maxPages = 100;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error("用户数量过多，请改用服务端 email 索引表查询");
}
