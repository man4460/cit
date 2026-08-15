import { prisma } from "./prisma.js";

/**
 * โหมดส่งอีเมล เลือกด้วย MAIL_PROVIDER
 * - outbox (ค่าเริ่มต้น) : บันทึกลงตาราง MailOutbox อย่างเดียว ไม่ส่งจริง
 * - smtp                 : ส่งผ่าน SMTP ของ Microsoft 365
 * - graph                : ยังไม่รองรับ เว้นไว้ต่อ Microsoft Graph API ภายหลัง
 */
export type MailProvider = "outbox" | "smtp" | "graph";

export type SendMailInput = {
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
  relatedType?: string | null;
  relatedId?: string | null;
};

export function currentMailProvider(): MailProvider {
  const raw = String(process.env.MAIL_PROVIDER ?? "outbox").trim().toLowerCase();
  if (raw === "smtp" || raw === "graph") return raw;
  return "outbox";
}

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}

async function sendViaSmtp(input: SendMailInput) {
  const host = process.env.MAIL_HOST ?? "smtp.office365.com";
  const port = Number(process.env.MAIL_PORT ?? 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) throw new Error("ยังไม่ได้ตั้ง MAIL_USER / MAIL_PASS ใน .env");

  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? user,
    to: input.to,
    cc: input.cc ?? undefined,
    subject: input.subject,
    html: input.body,
  });
}

async function sendViaGraph(_input: SendMailInput): Promise<never> {
  // จุดเสียบ Microsoft Graph ในอนาคต:
  // POST https://graph.microsoft.com/v1.0/users/{MAIL_FROM}/sendMail
  // โดยขอ access token แบบ client_credentials จาก
  // https://login.microsoftonline.com/{GRAPH_TENANT_ID}/oauth2/v2.0/token
  throw new Error("MAIL_PROVIDER=graph ยังไม่รองรับ — ใช้ outbox หรือ smtp ไปก่อน");
}

/**
 * บันทึกอีเมลลง MailOutbox เสมอ แล้วค่อยพยายามส่งตาม provider
 * จึงตรวจสอบย้อนหลังได้แม้ยังไม่ได้ตั้งค่าเมลจริง
 */
export async function sendMail(input: SendMailInput): Promise<{ id: string; status: string }> {
  const provider = currentMailProvider();
  const row = await prisma.mailOutbox.create({
    data: {
      to: input.to,
      cc: input.cc ?? null,
      subject: input.subject,
      body: input.body,
      provider,
      status: "QUEUED",
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
    },
  });

  if (provider === "outbox") return { id: row.id, status: "QUEUED" };

  try {
    if (provider === "smtp") await sendViaSmtp(input);
    else await sendViaGraph(input);
    await prisma.mailOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
    return { id: row.id, status: "SENT" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.mailOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", error: message.slice(0, 1000) },
    });
    console.error("[mailer] ส่งอีเมลไม่สำเร็จ:", message);
    return { id: row.id, status: "FAILED" };
  }
}

export function approvalMailBody(params: {
  caseNumber: string;
  caseTitle: string;
  stageLabel: string;
  approverName: string;
  requesterName?: string | null;
  link: string;
  expiresAt: Date;
}): string {
  const expires = params.expiresAt.toLocaleString("th-TH");
  return [
    `<p>เรียน ${escapeHtml(params.approverName)}</p>`,
    `<p>มีเรื่องเสนอเพื่อพิจารณา: <b>${escapeHtml(params.stageLabel)}</b></p>`,
    "<ul>",
    `<li>เลขคดี: ${escapeHtml(params.caseNumber)}</li>`,
    `<li>เรื่อง: ${escapeHtml(params.caseTitle)}</li>`,
    params.requesterName ? `<li>ผู้เสนอ: ${escapeHtml(params.requesterName)}</li>` : "",
    "</ul>",
    `<p><a href="${params.link}">คลิกเพื่อพิจารณา อนุมัติ หรือให้ความเห็น</a></p>`,
    `<p style="color:#6b7280;font-size:12px">ลิงก์ใช้ได้ถึง ${escapeHtml(expires)}</p>`,
  ].join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
