const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

(async () => {
  const loginId = String(process.env.ADMIN_LOGIN_ID || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(loginId)) {
    throw new Error("ADMIN_LOGIN_ID must be 4-32 letters, numbers, underscores, or hyphens");
  }
  if (password.length < 14 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD must be 14-128 characters");
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { loginId }, select: { id: true, role: true } });
    if (existing) {
      if (existing.role !== "ADMIN") {
        throw new Error("ADMIN_LOGIN_ID is already used by a non-admin account. Choose a different ID or promote it manually.");
      }
      console.log(`Bootstrap admin already exists: ${loginId}`);
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { loginId, passwordHash, role: "ADMIN", status: "ACTIVE" },
    });
    console.log(`Initial administrator created: ${loginId}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(`Admin bootstrap failed: ${error.message}`);
  process.exit(1);
});
