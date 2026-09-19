import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ stk?: string; ex?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.stk) params.set("stk", query.stk);
  if (query.ex) params.set("ex", query.ex);
  const qs = params.toString();
  redirect(qs ? `/trade?${qs}` : "/trade");
}
