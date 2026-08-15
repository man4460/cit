import { prisma } from "./prisma.js";

const OS_PARENT_CI = "5031116000";

const DEFAULT_GROUPS: { code: string; name: string; groupNo: number; sortOrder: number }[] = [
  { code: "G1", name: "กลุ่ม 1", groupNo: 1, sortOrder: 1 },
  { code: "G2", name: "กลุ่ม 2", groupNo: 2, sortOrder: 2 },
  { code: "G3", name: "กลุ่ม 3", groupNo: 3, sortOrder: 3 },
  { code: "G4", name: "กลุ่ม 4", groupNo: 4, sortOrder: 4 },
  { code: "G5", name: "กลุ่ม 5", groupNo: 5, sortOrder: 5 },
];

/** หาบัญชีย่อย «กลุ่ม N» ใต้ CI 5031116000 */
async function findGroupBudgetAccountId(groupNo: number): Promise<string | null> {
  const parent = await prisma.budgetAccount.findFirst({
    where: { ciCode: OS_PARENT_CI },
    select: { id: true },
  });
  if (!parent) return null;

  const children = await prisma.budgetAccount.findMany({
    where: { parentId: parent.id },
    select: { id: true, name: true },
  });

  const patterns = [
    new RegExp(`^${groupNo}\\.\\s*กลุ่ม\\s*${groupNo}\\b`, "i"),
    new RegExp(`^กลุ่ม\\s*${groupNo}\\b`, "i"),
    new RegExp(`กลุ่ม\\s*${groupNo}\\b`, "i"),
  ];

  for (const pat of patterns) {
    const hit = children.find((c) => pat.test(c.name.trim()));
    if (hit) return hit.id;
  }
  return null;
}

/** สร้าง/อัปเดต 5 กลุ่มพื้นที่งานจ้าง OS และผูกบัญชีงบถ้าพบ */
export async function seedOsAreaGroups(): Promise<void> {
  let created = 0;
  let linked = 0;

  for (const row of DEFAULT_GROUPS) {
    const budgetAccountId = await findGroupBudgetAccountId(row.groupNo);
    const existing = await prisma.osAreaGroup.findUnique({ where: { code: row.code } });

    if (!existing) {
      await prisma.osAreaGroup.create({
        data: {
          code: row.code,
          name: row.name,
          sortOrder: row.sortOrder,
          budgetAccountId,
        },
      });
      created += 1;
      if (budgetAccountId) linked += 1;
      continue;
    }

    const data: { name?: string; sortOrder?: number; budgetAccountId?: string | null } = {};
    if (existing.name !== row.name) data.name = row.name;
    if (existing.sortOrder !== row.sortOrder) data.sortOrder = row.sortOrder;
    // เติมลิงก์บัญชีเฉพาะตอนยังว่าง
    if (!existing.budgetAccountId && budgetAccountId) {
      data.budgetAccountId = budgetAccountId;
      linked += 1;
    }
    if (Object.keys(data).length) {
      await prisma.osAreaGroup.update({ where: { id: existing.id }, data });
    }
  }

  if (created > 0) console.log(`[seed] os area groups: +${created}`);
  if (linked > 0) console.log(`[seed] os area groups linked to budget: ${linked}`);
}
