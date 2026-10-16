import { getOnwr } from "../src/routes/waterOnwr.js";

async function main() {
  const o = await getOnwr();
  const want = ["ม่วง", "บางศาลา", "คลองหวะ", "คลองหละ", "อู่ตะเภา", "สะเดา", "หาดใหญ่ใน"];
  const hits = o.levels.filter((l) => want.some((w) => (l.name || "").includes(w)));
  for (const l of hits) {
    console.log(
      JSON.stringify({
        name: l.name,
        code: (l as { code?: string }).code,
        msl: l.msl,
        pct: l.pct,
        q: l.q,
        bank: l.bank,
        ground: l.ground,
        minBank: l.minBank,
        time: l.time,
      }),
    );
  }
  console.log("total hits", hits.length, "levels", o.levels.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
