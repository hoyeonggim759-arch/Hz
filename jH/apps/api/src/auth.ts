import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, createParamDecorator } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { Request } from "express";
import { PrismaService } from "./prisma.service";
export type AuthUser = { sub: string; role: "USER" | "SUPPORT" | "ADMIN"; loginId: string; ver: number };
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-jinqsms_session" : "nova_session";
export type AuthedRequest = Request & { user?: AuthUser; cookies?: Record<string, string> };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>(); const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException("请先登录");
    let claims: AuthUser;
    try { claims = jwt.verify(token, process.env.SESSION_SECRET!, { issuer: "nova-api", algorithms: ["HS256"] }) as AuthUser; }
    catch { throw new UnauthorizedException("登录已过期，请重新登录"); }
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, loginId: true, role: true, status: true, sessionVersion: true } });
    if (!user || user.status !== "ACTIVE" || claims.ver !== user.sessionVersion) throw new UnauthorizedException("账户不可用或登录会话已失效");
    req.user = { sub: user.id, loginId: user.loginId, role: user.role, ver: user.sessionVersion }; return true;
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== "ADMIN") throw new ForbiddenException("需要管理员权限");
    return true;
  }
}
export const CurrentUser = createParamDecorator((_data, ctx) => ctx.switchToHttp().getRequest<AuthedRequest>().user);
