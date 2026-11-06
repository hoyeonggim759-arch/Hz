import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { PrismaService } from "./prisma.service";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
import { encryptSensitive, decryptSensitive } from "./crypto";

const digest = (code: string) => createHmac("sha256", process.env.LICENSE_PEPPER || process.env.SESSION_SECRET!).update(code.trim().toUpperCase()).digest("hex");
@Controller("licenses") @UseGuards(AuthGuard)
export class LicenseController {
  constructor(private readonly prisma: PrismaService) {}
  @Post("redeem") async redeem(@CurrentUser() auth: AuthUser, @Body() body: { code?: string }) {
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8}){2,4}$/.test(code)) throw new BadRequestException("卡密格式不正确");
    const license = await this.prisma.licenseKey.findUnique({ where: { codeHash: digest(code) } });
    if (!license || license.status !== "UNUSED") throw new BadRequestException("卡密无效或已使用");
    const now = new Date();
    try {
      const result = await this.prisma.$transaction(async tx => {
        const claimed = await tx.licenseKey.updateMany({ where: { id: license.id, status: "UNUSED" }, data: { status: "REDEEMED", redeemedAt: now } });
        if (claimed.count !== 1) throw new Error("LICENSE_ALREADY_USED");
        const user = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } });
        const base = user.membershipEndsAt && user.membershipEndsAt > now ? user.membershipEndsAt : now;
        const membershipEndsAt = new Date(base.getTime() + license.durationSeconds * 1000);
        await tx.licenseRedemption.create({ data: { userId: auth.sub, licenseId: license.id } });
        await tx.user.update({ where: { id: auth.sub }, data: { membershipEndsAt } });
        return { membershipEndsAt };
      });
      return { ok: true, ...result };
    } catch (e: any) { if (e?.message === "LICENSE_ALREADY_USED") throw new BadRequestException("卡密已被兑换"); throw e; }
  }
}
@Controller("support") @UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}
  @Post("messages") async send(@CurrentUser() auth: AuthUser, @Body() body: { message?: string; threadId?: string }) {
    const message = String(body.message || "").trim(); if (!message || message.length > 4000) throw new BadRequestException("消息需为 1-4000 个字符");
    let threadId = body.threadId;
    if (threadId) {
      const owned = await this.prisma.supportThread.findFirst({ where: { id: threadId, userId: auth.sub } });
      if (!owned) throw new BadRequestException("会话不存在");
    } else {
      const thread = await this.prisma.supportThread.create({ data: { userId: auth.sub, subject: "用户咨询" } }); threadId = thread.id;
    }
    const created = await this.prisma.supportMessage.create({ data: { threadId, senderId: auth.sub, body: encryptSensitive(message) } });
    await this.prisma.supportThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return { threadId, message: { ...created, body: message } };
  }
  @Post("list") async list(@CurrentUser() auth: AuthUser) {
    const threads = await this.prisma.supportThread.findMany({ where: { userId: auth.sub }, orderBy: { updatedAt: "desc" }, take: 30, include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } } });
    return { threads: threads.map(thread => ({ ...thread, messages: thread.messages.map(message => ({ ...message, body: message.body ? decryptSensitive(message.body) : null })) })) };
  }
}
