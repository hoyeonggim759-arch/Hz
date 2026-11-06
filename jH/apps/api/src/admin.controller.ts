
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { randomBytes, createHmac } from "crypto";
import { PrismaService } from "./prisma.service";
import { AdminGuard, AuthGuard, AuthUser, CurrentUser } from "./auth";
import { decryptSensitive, encryptSensitive } from "./crypto";

const hashCode = (code: string) =>
  createHmac("sha256", process.env.LICENSE_PEPPER || process.env.SESSION_SECRET!)
    .update(code)
    .digest("hex");

@Controller("admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("overview")
  async overview() {
    const [users, activeMembers, unusedLicenses, tasks, openThreads] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            membershipEndsAt: { gt: new Date() },
            status: "ACTIVE",
          },
        }),
        this.prisma.licenseKey.count({
          where: { status: "UNUSED" },
        }),
        this.prisma.task.count(),
        this.prisma.supportThread.count({
          where: { messages: { some: {} } },
        }),
      ]);

    return {
      users,
      activeMembers,
      unusedLicenses,
      tasks,
      openThreads,
    };
  }

  @Get("users")
  async users() {
    return {
      users: await this.prisma.user.findMany({
        select: {
          id: true,
          loginId: true,
          role: true,
          status: true,
          membershipEndsAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    };
  }

  @Patch("users/:id/status")
  async setStatus(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() body: { status?: string },
  ) {
    if (
      !(["ACTIVE", "SUSPENDED", "DISABLED"] as string[]).includes(
        String(body.status),
      )
    ) {
      throw new BadRequestException("状态值不正确");
    }

    if (actor.sub === id) {
      throw new BadRequestException("不能修改自己的账号状态");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: body.status as any,
        sessionVersion: { increment: 1 },
      },
      select: {
        id: true,
        loginId: true,
        status: true,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.sub,
        action: "USER_STATUS_CHANGED",
        targetType: "User",
        targetId: id,
        metadata: { status: body.status },
      },
    });

    return { user };
  }

  @Post("licenses")
  async createLicenses(
    @CurrentUser() actor: AuthUser,
    @Body() body: { days?: number; quantity?: number },
  ) {
    const days = Number(body.days);
    const quantity = Number(body.quantity);

    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days > 3650 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      throw new BadRequestException(
        "天数范围 1-3650，数量范围 1-100",
      );
    }

    const codes = Array.from({ length: quantity }, () =>
      randomBytes(12)
        .toString("hex")
        .toUpperCase()
        .match(/.{1,6}/g)!
        .join("-"),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.licenseKey.createMany({
        data: codes.map((code) => ({
          codeHash: hashCode(code),
          durationSeconds: days * 86400,
        })),
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor.sub,
          action: "LICENSES_CREATED",
          targetType: "LicenseKey",
          targetId: "batch",
          metadata: { days, quantity },
        },
      });
    });

    return {
      codes,
      days,
      quantity,
      warning: "卡密只在本次响应中显示，请立即保存。",
    };
  }

  @Get("support")
  async support() {
    const threads = await this.prisma.supportThread.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        user: {
          select: { loginId: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });

    return {
      threads: threads.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) => ({
          ...message,
          body: message.body
            ? decryptSensitive(message.body)
            : null,
        })),
      })),
    };
  }

  @Post("support/:id/reply")
  async reply(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() body: { message?: string },
  ) {
    const message = String(body.message || "").trim();

    if (!message || message.length > 4000) {
      throw new BadRequestException("回复需为 1-4000 个字符");
    }

    const thread = await this.prisma.supportThread.findUnique({
      where: { id },
    });

    if (!thread) {
      throw new BadRequestException("会话不存在");
    }

    const created = await this.prisma.supportMessage.create({
      data: {
        threadId: id,
        senderId: actor.sub,
        body: encryptSensitive(message),
      },
    });

    await this.prisma.supportThread.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.sub,
        action: "SUPPORT_REPLIED",
        targetType: "SupportThread",
        targetId: id,
      },
    });

    return {
      message: {
        ...created,
        body: message,
      },
    };
  }

  @Get("tasks")
  async tasks() {
    const tasks = await this.prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        phoneNumber: true,
        requestedMinutes: true,
        status: true,
        createdAt: true,
        user: {
          select: { loginId: true },
        },
      },
    });

    return {
      tasks: tasks.map((task) => ({
        ...task,
        phoneNumber: decryptSensitive(task.phoneNumber),
      })),
    };
  }

  @Get("audit")
  async audit() {
    return {
      events: await this.prisma.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          actor: {
            select: { loginId: true },
          },
        },
      }),
    };
  }
}
