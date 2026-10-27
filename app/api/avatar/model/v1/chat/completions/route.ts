export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ error: { message: "大陆第15版不再开放旧版内部模型转接接口。", type: "gone" } }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
