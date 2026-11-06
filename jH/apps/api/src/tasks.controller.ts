import { BadRequestException, Controller, Get, Post, Body, Param, UseGuards, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
import { encryptSensitive, decryptSensitive } from "./crypto";
@Controller("tasks") @UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@CurrentUser() auth: AuthUser) {
    const tasks = await this.prisma.task.findMany({ where: { userId: auth.sub }, orderBy: { createdAt: "desc" }, take: 100, include: { logs: { orderBy: { createdAt: "desc" }, take: 20 } } });
    return { tasks: tasks.map(task => ({ ...task, phoneNumber: decryptSensitive(task.phoneNumber) })) };
  }
  @Post() async create(@CurrentUser() auth: AuthUser, @Body() body: { phoneNumber?: string; minutes?: number }) {
    const phoneNumber = String(body.phoneNumber ?? ""); const minutes = Number(body.minutes);
    if (!/^010\d{8}$/.test(phoneNumber)) throw new BadRequestException("手机号格式不正确");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) throw new BadRequestException("任务时长必须为 1-300 分钟");
    let task;
    try {
      task = await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: auth.sub } });
        if (!user || user.status !== "ACTIVE") throw new ForbiddenException("账号不可用");
        if (!user.membershipEndsAt || user.membershipEndsAt <= new Date()) throw new ForbiddenException("请先激活有效会员");
        const active = await tx.task.findFirst({ where: { userId: auth.sub, status: { in: ["QUEUED", "RUNNING", "STOP_REQUESTED"] } } });
        if (active) throw new BadRequestException("你已有正在处理的任务");
        return tx.task.create({ data: { userId: auth.sub, phoneNumber: encryptSensitive(phoneNumber), requestedMinutes: minutes, status: "QUEUED", logs: { create: { userId: auth.sub, message: "任务已提交，等待你配置的执行器接管" } } } });
      }, { isolationLevel: "Serializable" });
    } catch (e: any) {
      if (e?.code === "P2034") throw new BadRequestException("任务提交冲突，请刷新后重试");
      throw e;
    }
    return { task: { ...task, phoneNumber }, notice: "任务记录已创建。真实执行器由你自行配置接入。" };
  }
  @Post(":id/stop") async stop(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId: auth.sub } });
    if (!task) throw new NotFoundException("任务不存在");
    if (["STOP_REQUESTED", "STOPPED", "SUCCEEDED", "FAILED"].includes(task.status)) return { task: { ...task, phoneNumber: decryptSensitive(task.phoneNumber) } };
    const updated = await this.prisma.task.update({ where: { id }, data: { status: "STOP_REQUESTED", stopRequestedAt: new Date(), logs: { create: { userId: auth.sub, message: "用户请求停止任务" } } } });
    return { task: { ...updated, phoneNumber: decryptSensitive(updated.phoneNumber) }, notice: "停止请求已记录，执行器接入后需轮询此状态。" };
  }
  @Get(":id/logs") async logs(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId: auth.sub }, select: { id: true } });
    if (!task) throw new NotFoundException("任务不存在");
    return { logs: await this.prisma.taskLog.findMany({ where: { taskId: id, userId: auth.sub }, orderBy: { createdAt: "asc" }, take: 500 }) };
  }
}
