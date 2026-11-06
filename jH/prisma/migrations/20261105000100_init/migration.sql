CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPPORT', 'ADMIN');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "LicenseStatus" AS ENUM ('UNUSED', 'REDEEMED', 'REVOKED', 'EXPIRED');
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'STOP_REQUESTED', 'STOPPED', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMING', 'PAID', 'EXPIRED', 'REVIEW');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "loginId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "membershipEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LicenseKey" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "status" "LicenseStatus" NOT NULL DEFAULT 'UNUSED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "LicenseKey_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LicenseRedemption" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseRedemption_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "requestedMinutes" INTEGER NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "stopRequestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskLog" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportThread" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" TEXT,
  "attachmentKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "network" TEXT NOT NULL,
  "receivingAddress" TEXT NOT NULL,
  "transactionId" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IpBlock" (
  "id" TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IpBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
CREATE UNIQUE INDEX "LicenseKey_codeHash_key" ON "LicenseKey"("codeHash");
CREATE UNIQUE INDEX "LicenseRedemption_licenseId_key" ON "LicenseRedemption"("licenseId");
CREATE INDEX "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");
CREATE INDEX "TaskLog_taskId_createdAt_idx" ON "TaskLog"("taskId", "createdAt");
CREATE INDEX "TaskLog_userId_createdAt_idx" ON "TaskLog"("userId", "createdAt");
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE UNIQUE INDEX "IpBlock_ipAddress_key" ON "IpBlock"("ipAddress");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

ALTER TABLE "LicenseRedemption" ADD CONSTRAINT "LicenseRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LicenseRedemption" ADD CONSTRAINT "LicenseRedemption_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "LicenseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
