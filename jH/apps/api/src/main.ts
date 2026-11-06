
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./module";

async function bootstrap() {
  // =========================
  // 1. Security Environment Validation
  // =========================

  if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.startsWith("CHANGE_ME")
  ) {
    throw new Error(
      "SESSION_SECRET must be a unique random value of at least 32 characters"
    );
  }

  if (
    !process.env.LICENSE_PEPPER ||
    process.env.LICENSE_PEPPER.length < 32 ||
    process.env.LICENSE_PEPPER === process.env.SESSION_SECRET ||
    process.env.LICENSE_PEPPER.startsWith("CHANGE_ME")
  ) {
    throw new Error(
      "LICENSE_PEPPER must be a different random value of at least 32 characters"
    );
  }

  const dataKeyRaw = process.env.APP_DATA_KEY ?? "";

  const dataKeyHex = /^[a-fA-F0-9]{64}$/.test(dataKeyRaw);

  const dataKeyBase64 = (() => {
    const decoded = Buffer.from(dataKeyRaw, "base64");
    return (
      decoded.length === 32 &&
      decoded.toString("base64") === dataKeyRaw
    );
  })();

  if (!dataKeyHex && !dataKeyBase64) {
    throw new Error(
      "APP_DATA_KEY must be a separate 32-byte key encoded as 64 hex characters or canonical base64"
    );
  }

  // =========================
  // 2. Initialize NestJS
  // =========================

  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.setGlobalPrefix("api");

  app.getHttpAdapter().getInstance().disable("x-powered-by");

  if (process.env.TRUST_PROXY === "1") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.use(cookieParser());

  // =========================
  // 3. Request Rate Limiting
  // =========================

  const buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  app.use(
    (req: any, res: any, next: (error?: any) => void) => {
      const now = Date.now();
      const path = String(req.path || "");
      const ip = req.ip || req.socket?.remoteAddress || "unknown";

      const sensitiveAuth =
        req.method === "POST" &&
        [
          "/api/auth/login",
          "/api/auth/register",
        ].includes(path);

      const licenseRedeem =
        req.method === "POST" &&
        path === "/api/licenses/redeem";

      const taskCreate =
        req.method === "POST" &&
        path === "/api/tasks";

      const bucketName = sensitiveAuth
        ? `auth:${path}`
        : licenseRedeem
          ? "license-redeem"
          : taskCreate
            ? "task-create"
            : "api";

      const limit = sensitiveAuth
        ? 8
        : licenseRedeem
          ? 8
          : taskCreate
            ? 10
            : 180;

      const key = `${ip}:${bucketName}`;

      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        bucket = {
          count: 0,
          resetAt: now + 60_000,
        };

        buckets.set(key, bucket);
      }

      bucket.count++;

      if (bucket.count > limit) {
        res.status(429).json({
          statusCode: 429,
          message: "请求过于频繁，请稍后重试",
        });

        return;
      }

      if (buckets.size > 10000) {
        for (const [k, v] of buckets) {
          if (v.resetAt <= now) {
            buckets.delete(k);
          }
        }
      }

      // =========================
      // 4. Security Response Headers
      // =========================

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
      res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
      );
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
      );
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

      if (process.env.NODE_ENV === "production") {
        res.setHeader(
          "Strict-Transport-Security",
          "max-age=31536000; includeSubDomains"
        );
      }

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");

      next();
    }
  );

  // =========================
  // 5. CORS Configuration
  // =========================

  const origins = (
    process.env.APP_ORIGIN ?? "http://localhost:3000"
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  app.use(
    (req: any, res: any, next: (error?: any) => void) => {
      const origin = req.headers.origin;

      if (origin && !origins.includes(origin)) {
        res.status(403).json({
          statusCode: 403,
          message: "来源不被允许",
        });

        return;
      }

      next();
    }
  );

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Content-Type"],
  });

  // =========================
  // 6. Global Validation
  // =========================

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  // =========================
  // 7. Render Health Check
  // =========================

  app.getHttpAdapter().getInstance().get(
    "/healthz",
    (_req: any, res: any) => {
      res.status(200).json({
        status: "ok",
      });
    }
  );

  // =========================
  // 8. Graceful Shutdown
  // =========================

  app.enableShutdownHooks();

  // =========================
  // 9. Start Server
  // =========================

  const port = Number(
    process.env.PORT ??
    process.env.API_PORT ??
    4000
  );

  await app.listen(port, "0.0.0.0");

  console.log(`JinqSMS API started on port ${port}`);
}

bootstrap();
