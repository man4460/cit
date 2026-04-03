import { prisma } from "./prisma.js";

const DEFAULT_TYPES = ["หนังสือ", "คำสั่ง", "ระเบียบ"];

export async function seedDocumentMasterData(): Promise<void> {
  const count = await prisma.documentType.count();
  if (count === 0) {
    let order = 0;
    for (const name of DEFAULT_TYPES) {
      await prisma.documentType.create({ data: { name, sortOrder: order++ } });
    }
    console.log("[seed] document types created");
  }
}
