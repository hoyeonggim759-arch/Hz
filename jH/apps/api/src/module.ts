import { Module, Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AuthController } from "./auth.controller";
import { TasksController } from "./tasks.controller";
import { LicenseController, SupportController } from "./license.controller";
import { AdminController } from "./admin.controller";
import { AuthGuard, AdminGuard } from "./auth";
@Controller("health") class HealthController { @Get() health() { return { status: "ok", service: "secure-saas-api" }; } }
@Module({ controllers: [HealthController, AuthController, TasksController, LicenseController, SupportController, AdminController], providers: [PrismaService, AuthGuard, AdminGuard] })
export class AppModule {}
