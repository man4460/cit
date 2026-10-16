import { getOnwr } from "../src/routes/waterOnwr.js";

async function main() {
  const o = await getOnwr();
  for (const code of ["X.173A", "X.90", "X.174"]) {
    const l = o.levels.find((x) => x.code === code);
    if (!l) continue;
    const s = l.qPct == null ? -1 : l.qPct > 100 ? 3 : l.qPct > 70 ? 2 : l.qPct > 30 ? 1 : 0;
    console.log(
      JSON.stringify({
        code,
        name: l.name,
        msl: l.msl,
        q: l.q,
        qmax: l.qmax,
        qPct: l.qPct,
        storagePct: l.pct,
        botColor: ["เขียว", "เหลือง", "ส้ม", "แดง"][s],
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
