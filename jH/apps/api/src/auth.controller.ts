import { BadRequestException, Body, Controller, Get, Post, Res, UseGuards, UnauthorizedException, ConflictException } from "@nestjs/common";
import { createHmac } from "crypto";
import { Response } from "express";
import * as argon2 from "argon2";
import * as jwt from "jsonwebtoken";
import { PrismaService } from "./prisma.service";
import { AuthGuard, AuthUser, CurrentUser, SESSION_COOKIE } from "./auth";

const licenseDigest = (code: string) => createHmac("sha256", process.env.LICENSE_PEPPER!).update(code.trim().toUpperCase()).digest("hex");
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}
  private issueCookie(user: { id: string; loginId: string; role: "USER" | "SUPPORT" | "ADMIN"; sessionVersion: number }, res: Response) {
    const payload: AuthUser = { sub: user.id, loginId: user.loginId, role: user.role, ver: user.sessionVersion };
    res.cookie(SESSION_COOKIE, jwt.sign(payload, process.env.SESSION_SECRET!, { expiresIn: "7d", issuer: "nova-api", algorithm: "HS256" }), cookieOptions());
  }
  @Post("register")
  async register(@Body() body: { loginId?: string; password?: string; licenseCode?: string }, @Res({ passthrough: true }) res: Response) {
    const loginId = String(body.loginId ?? "").trim();
    const password = String(body.password ?? "");
    const licenseCode = String(body.licenseCode ?? "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9_-]{4,32}$/.test(loginId)) throw new BadRequestException("用户 ID 需为 4-32 位字母、数字、下划线或短横线");
    if (password.length < 10 || password.length > 128) throw new BadRequestException("密码长度需为 10-128 位");
    if (!/^[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8}){2,4}$/.test(licenseCode)) throw new BadRequestException("卡密格式不正确");

    // Hash the password before opening the DB transaction to keep locks short.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    try {
      const result = await this.prisma.$transaction(async tx => {
        const license = await tx.licenseKey.findUnique({ where: { codeHash: licenseDigest(licenseCode) } });
        if (!license || license.status !== "UNUSED" || license.durationSeconds < 1 || (license.expiresAt && license.expiresAt <= now)) {
          throw new BadRequestException("卡密无效、已使用或已过期");
        }
        const claimed = await tx.licenseKey.updateMany({
          where: { id: license.id, status: "UNUSED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          data: { status: "REDEEMED", redeemedAt: now },
        });
        if (claimed.count !== 1) throw new BadRequestException("卡密无效、已使用或已过期");

        const membershipEndsAt = new Date(now.getTime() + license.durationSeconds * 1000);
        const user = await tx.user.create({ data: { loginId, passwordHash, membershipEndsAt } });
        await tx.licenseRedemption.create({ data: { userId: user.id, licenseId: license.id } });
        await tx.auditEvent.create({ data: { actorId: user.id, action: "ACCOUNT_REGISTERED_WITH_LICENSE", targetType: "User", targetId: user.id } });
        return { user };
      }, { isolationLevel: "Serializable" });

      this.issueCookie(result.user, res);
      return { user: { id: result.user.id, loginId: result.user.loginId, role: result.user.role, membershipEndsAt: result.user.membershipEndsAt } };
    } catch (e: any) {
      if (e?.code === "P2002") throw new ConflictException("该用户 ID 已被使用，或卡密已被兑换");
      if (e?.code === "P2034") throw new ConflictException("注册请求发生冲突，请重新提交");
      throw e;
    }
  }
  @Post("login")
  async login(@Body() body: { loginId?: string; password?: string }, @Res({ passthrough: true }) res: Response) {
    const loginId = String(body.loginId ?? "").trim(); const password = String(body.password ?? "");
    const user = await this.prisma.user.findUnique({ where: { loginId } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException("用户 ID 或密码错误");
    if (user.status !== "ACTIVE") throw new UnauthorizedException("账号当前不可用");
    this.issueCookie(user, res); return { user: { id: user.id, loginId: user.loginId, role: user.role, membershipEndsAt: user.membershipEndsAt } };
  }
  @UseGuards(AuthGuard) @Get("me")
  async me(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.sub }, select: { id: true, loginId: true, role: true, status: true, membershipEndsAt: true, createdAt: true } });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("账户不可用"); return { user };
  }
  @UseGuards(AuthGuard)
  @Post("logout") async logout(@CurrentUser() auth: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.prisma.user.update({ where: { id: auth.sub }, data: { sessionVersion: { increment: 1 } } });
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }); return { ok: true };
  }
}
