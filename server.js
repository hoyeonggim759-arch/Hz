
'use strict';

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const { decodeKey, hmac } = require('./lib/crypto');
const apiConfigStore = require('./lib/api-config-store');

const app = express();

const PORT = Number(process.env.PORT || 3000);

// =========================
// 1. PUBLIC ORIGIN
// =========================

const rawPublicOrigin =
  process.env.PUBLIC_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  '';

let PUBLIC_ORIGIN = '';

try {
  const parsedPublicOrigin = new URL(
    String(rawPublicOrigin).trim()
  );

  if (parsedPublicOrigin.protocol === 'https:') {
    PUBLIC_ORIGIN = parsedPublicOrigin.origin;
  }
} catch {
  // Invalid or missing URL is rejected below.
}

const COOKIE_SECURE =
  String(process.env.COOKIE_SECURE || 'true') === 'true';

const DATA_DIR = process.env.DATA_DIR || '/data';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// =========================
// 2. SECURITY ENVIRONMENT
// =========================

if (!PUBLIC_ORIGIN || !/^https:\/\//.test(PUBLIC_ORIGIN)) {
  console.error(
    '[CONFIG] Set RENDER_EXTERNAL_URL (Render) or PUBLIC_ORIGIN to a valid https:// URL.'
  );

  process.exit(1);
}

for (const name of [
  'SESSION_SECRET',
  'LICENSE_PEPPER',
  'APP_DATA_KEY',
  'API_CONFIG_KEY',
]) {
  if (!process.env[name]) {
    console.error(`[CONFIG] Missing ${name}.`);
    process.exit(1);
  }
}

if (
  process.env.SESSION_SECRET.length < 32 ||
  process.env.LICENSE_PEPPER.length < 32
) {
  console.error(
    '[CONFIG] SESSION_SECRET and LICENSE_PEPPER must be at least 32 characters.'
  );

  process.exit(1);
}

try {
  decodeKey('APP_DATA_KEY');
  decodeKey('API_CONFIG_KEY');
} catch (err) {
  console.error('[CONFIG]', err.message);
  process.exit(1);
}

// =========================
// 3. EXPRESS SECURITY
// =========================

app.disable('x-powered-by');

app.set(
  'trust proxy',
  Number(process.env.TRUST_PROXY_HOPS || 1)
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    index: false,
    maxAge: '1h',
  })
);

// =========================
// 4. RATE LIMITING
// =========================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  },
});

const taskLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: '작업 요청이 너무 많습니다.',
  },
});

// =========================
// 5. COMMON FUNCTIONS
// =========================

function uuid() {
  return crypto.randomUUID();
}

function clientIp(req) {
  const value = String(
    req.ip || req.socket.remoteAddress || ''
  ).replace(/^::ffff:/, '');

  return value.slice(0, 64) || 'unknown';
}

function hashSession(token) {
  return crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(token)
    .digest('hex');
}

function licenseHash(code) {
  return hmac(
    String(code).trim().toUpperCase(),
    'LICENSE_PEPPER'
  );
}

function phoneHash(phone) {
  return hmac(phone, 'LICENSE_PEPPER');
}

function maskPhone(phone) {
  return phone.length >= 7
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : '****';
}

function maskCode(code) {
  return code.length > 8
    ? `${code.slice(0, 4)}••••${code.slice(-4)}`
    : '••••';
}

function asyncRoute(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

// =========================
// 6. ORIGIN VALIDATION
// =========================

function validateOrigin(req, res, next) {
  const origin = req.get('origin');

  if (origin && origin !== PUBLIC_ORIGIN) {
    return sendError(
      res,
      403,
      '허용되지 않은 요청 출처입니다.'
    );
  }

  next();
}

app.use('/api', validateOrigin);

// =========================
// 7. AUDIT LOG
// =========================

async function audit(
  actorId,
  action,
  targetType,
  targetId,
  ip,
  details = {}
) {
  await pool.query(
    `INSERT INTO audit_logs
      (id, actor_id, action, target_type, target_id, ip, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      uuid(),
      actorId || null,
      action,
      targetType || null,
      targetId || null,
      ip || null,
      JSON.stringify(details),
    ]
  );
}

// =========================
// 8. AUTHENTICATION
// =========================

async function loadUser(req) {
  const token = req.cookies.krsms_session;

  if (!token || token.length < 32) {
    return null;
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.role,
       u.status,
       u.registration_ip,
       u.last_login_ip,
       u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()`,
    [hashSession(token)]
  );

  return result.rows[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const user = await loadUser(req);

    if (!user) {
      return sendError(res, 401, '로그인이 필요합니다.');
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, '정지된 계정입니다.');
    }

    const blocked = await pool.query(
      'SELECT 1 FROM blocked_ips WHERE ip=$1',
      [clientIp(req)]
    );

    if (blocked.rowCount) {
      return sendError(res, 403, '접근이 차단된 IP입니다.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return sendError(res, 403, '관리자 권한이 필요합니다.');
  }

  next();
}

function issueSession(res, token) {
  res.cookie('krsms_session', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

// =========================
// 9. PUBLIC PAGES
// =========================

app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'KRSMS',
  });
});

app.get('/admin', (_req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'admin.html')
  );
});

app.get('/', (_req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );
});

// =========================
// 10. REGISTER
// =========================

app.post(
  '/api/auth/register',
  authLimiter,
  asyncRoute(async (req, res) => {
    const schema = z.object({
      username: z
        .string()
        .trim()
        .min(4)
        .max(32)
        .regex(/^[a-zA-Z0-9_-]+$/),

      password: z.string().min(12).max(128),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '아이디는 4~32자, 비밀번호는 12자 이상이어야 합니다.'
      );
    }

    const ip = clientIp(req);

    const blocked = await pool.query(
      'SELECT 1 FROM blocked_ips WHERE ip=$1',
      [ip]
    );

    if (blocked.rowCount) {
      return sendError(res, 403, '접근이 차단된 IP입니다.');
    }

    const passwordHash = await bcrypt.hash(
      parsed.data.password,
      12
    );

    try {
      const result = await pool.query(
        `INSERT INTO users
          (id, username, password_hash, role, registration_ip)
         VALUES ($1,$2,$3,'USER',$4)
         RETURNING id, username, role, status, created_at`,
        [
          uuid(),
          parsed.data.username,
          passwordHash,
          ip,
        ]
      );

      await audit(
        result.rows[0].id,
        'USER_REGISTERED',
        'USER',
        result.rows[0].id,
        ip
      );

      res.status(201).json({
        user: result.rows[0],
        message: '회원가입이 완료되었습니다.',
      });
    } catch (err) {
      if (err.code === '23505') {
        return sendError(
          res,
          409,
          '이미 사용 중인 아이디입니다.'
        );
      }

      throw err;
    }
  })
);

// =========================
// 11. LOGIN
// =========================

app.post(
  '/api/auth/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      username: z.string().trim().min(1).max(32),
      password: z.string().min(1).max(128),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '아이디와 비밀번호를 입력해 주세요.'
      );
    }

    const ip = clientIp(req);

    const blocked = await pool.query(
      'SELECT 1 FROM blocked_ips WHERE ip=$1',
      [ip]
    );

    if (blocked.rowCount) {
      return sendError(res, 403, '접근이 차단된 IP입니다.');
    }

    const found = await pool.query(
      'SELECT * FROM users WHERE username=$1',
      [parsed.data.username]
    );

    const user = found.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        parsed.data.password,
        user.password_hash
      ))
    ) {
      return sendError(
        res,
        401,
        '아이디 또는 비밀번호가 올바르지 않습니다.'
      );
    }

    if (user.status !== 'ACTIVE') {
      return sendError(res, 403, '정지된 계정입니다.');
    }

    const token = crypto
      .randomBytes(32)
      .toString('base64url');

    const expiresAt = new Date(
      Date.now() + 8 * 60 * 60 * 1000
    );

    await pool.query(
      `INSERT INTO sessions
        (id,user_id,token_hash,ip,user_agent,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        uuid(),
        user.id,
        hashSession(token),
        ip,
        String(req.get('user-agent') || '').slice(0, 255),
        expiresAt,
      ]
    );

    await pool.query(
      'UPDATE users SET last_login_ip=$1, updated_at=NOW() WHERE id=$2',
      [ip, user.id]
    );

    await audit(
      user.id,
      'USER_LOGIN',
      'USER',
      user.id,
      ip
    );

    issueSession(res, token);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      message: '로그인되었습니다.',
    });
  })
);

// =========================
// 12. LOGOUT
// =========================

app.post(
  '/api/auth/logout',
  requireAuth,
  asyncRoute(async (req, res) => {
    const token = req.cookies.krsms_session;

    await pool.query(
      'DELETE FROM sessions WHERE token_hash=$1',
      [hashSession(token)]
    );

    res.clearCookie('krsms_session', {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });

    res.json({
      message: '로그아웃되었습니다.',
    });
  })
);

// =========================
// 13. CURRENT USER
// =========================

app.get(
  '/api/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const license = await pool.query(
      `SELECT
         id,
         code_hint,
         duration_days,
         starts_at,
         expires_at,
         status
       FROM license_keys
       WHERE redeemed_by=$1
       ORDER BY
         CASE
           WHEN status='REDEEMED'
             AND expires_at > NOW()
           THEN 0 ELSE 1
         END,
         redeemed_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER
           (WHERE status='COMPLETED')::int AS completed,
         COUNT(*) FILTER
           (WHERE status='RUNNING')::int AS running
       FROM tasks
       WHERE user_id=$1`,
      [req.user.id]
    );

    res.json({
      user: req.user,
      license: license.rows[0] || null,
      stats: stats.rows[0],
    });
  })
);

// =========================
// 14. ANNOUNCEMENTS
// =========================

app.get(
  '/api/announcements',
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT id,title,body,created_at
       FROM announcements
       WHERE active=true
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json({
      announcements: result.rows,
    });
  })
);

// =========================
// 15. LICENSE REDEMPTION
// =========================

app.post(
  '/api/licenses/redeem',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      code: z.string().trim().min(8).max(80),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '라이선스 코드를 확인해 주세요.'
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const found = await client.query(
        `SELECT *
         FROM license_keys
         WHERE code_hash=$1
         FOR UPDATE`,
        [licenseHash(parsed.data.code)]
      );

      if (
        !found.rowCount ||
        found.rows[0].status !== 'AVAILABLE'
      ) {
        await client.query('ROLLBACK');

        return sendError(
          res,
          400,
          '사용할 수 없는 라이선스입니다.'
        );
      }

      const key = found.rows[0];

      const previous = await client.query(
        `SELECT MAX(expires_at) AS expiry
         FROM license_keys
         WHERE redeemed_by=$1
           AND status='REDEEMED'
           AND expires_at>NOW()`,
        [req.user.id]
      );

      const starts = previous.rows[0].expiry
        ? new Date(
            Math.max(
              Date.now(),
              new Date(previous.rows[0].expiry).getTime()
            )
          )
        : new Date();

      const expires = new Date(
        starts.getTime() +
        key.duration_days * 86400000
      );

      await client.query(
        `UPDATE license_keys
         SET status='REDEEMED',
             redeemed_by=$1,
             redeemed_at=NOW(),
             starts_at=$2,
             expires_at=$3
         WHERE id=$4`,
        [
          req.user.id,
          starts,
          expires,
          key.id,
        ]
      );

      await client.query('COMMIT');

      await audit(
        req.user.id,
        'LICENSE_REDEEMED',
        'LICENSE',
        key.id,
        clientIp(req)
      );

      res.json({
        message: '라이선스가 등록되었습니다.',
        expiresAt: expires,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// =========================
// 16. TASK LIST
// =========================

app.get(
  '/api/tasks',
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT
         id,
         phone_ciphertext,
         duration_minutes,
         status,
         created_at,
         ends_at
       FROM tasks
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    res.json({
      tasks: result.rows.map(t => ({
        ...t,
        phone: safeDecryptPhone(t.phone_ciphertext),
      })),
    });
  })
);

function safeDecryptPhone(value) {
  try {
    const { decryptText } = require('./lib/crypto');
    return maskPhone(decryptText(value));
  } catch {
    return '번호 보호됨';
  }
}

// =========================
// 17. TASK CREATION
// =========================

app.post(
  '/api/tasks',
  requireAuth,
  taskLimiter,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      phone: z.string().trim().regex(/^01[016789]\d{7,8}$/),
      durationMinutes: z.number().int().min(1).max(120),
      consent: z.literal(true),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '본인 인증용 휴대전화 번호, 시간 및 동의 여부를 확인해 주세요.'
      );
    }

    const activeLicense = await pool.query(
      `SELECT 1
       FROM license_keys
       WHERE redeemed_by=$1
         AND status='REDEEMED'
         AND expires_at>NOW()
       LIMIT 1`,
      [req.user.id]
    );

    if (!activeLicense.rowCount) {
      return sendError(
        res,
        403,
        '유효한 라이선스가 필요합니다.'
      );
    }

    const phone = parsed.data.phone;

    const recent = await pool.query(
      `SELECT 1
       FROM tasks
       WHERE user_id=$1
         AND phone_hash=$2
         AND created_at>NOW()-INTERVAL '10 minutes'
       LIMIT 1`,
      [
        req.user.id,
        phoneHash(phone),
      ]
    );

    if (recent.rowCount) {
      return sendError(
        res,
        429,
        '동일한 번호는 10분 후 다시 요청할 수 있습니다.'
      );
    }

    const { encryptText } = require('./lib/crypto');

    const id = uuid();

    const endsAt = new Date(
      Date.now() +
      parsed.data.durationMinutes * 60000
    );

    // Safe default:
    // Record and monitor the authorized task only.
    // No external SMS requests are executed by default.

    const result = await pool.query(
      `INSERT INTO tasks
        (id,user_id,phone_ciphertext,phone_hash,
         duration_minutes,status,ends_at)
       VALUES ($1,$2,$3,$4,$5,'NOT_CONFIGURED',$6)
       RETURNING id,duration_minutes,status,created_at,ends_at`,
      [
        id,
        req.user.id,
        encryptText(phone),
        phoneHash(phone),
        parsed.data.durationMinutes,
        endsAt,
      ]
    );

    await audit(
      req.user.id,
      'TASK_CREATED',
      'TASK',
      id,
      clientIp(req),
      {
        durationMinutes: parsed.data.durationMinutes,
      }
    );

    res.status(201).json({
      task: result.rows[0],
      message:
        '작업이 등록되었습니다. 현재 기본 구성은 기록/시간 관리만 수행하며 외부 요청은 실행하지 않습니다.',
    });
  })
);

// =========================
// 18. STOP TASK
// =========================

app.post(
  '/api/tasks/:id/stop',
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `UPDATE tasks
       SET status='STOPPED',
           stopped_at=NOW()
       WHERE id=$1
         AND user_id=$2
         AND status IN
           ('NOT_CONFIGURED','PENDING','RUNNING')
       RETURNING id`,
      [
        req.params.id,
        req.user.id,
      ]
    );

    if (!result.rowCount) {
      return sendError(
        res,
        404,
        '중지할 작업을 찾을 수 없습니다.'
      );
    }

    await audit(
      req.user.id,
      'TASK_STOPPED',
      'TASK',
      req.params.id,
      clientIp(req)
    );

    res.json({
      message: '작업이 중지되었습니다.',
    });
  })
);

// =========================
// 19. CUSTOMER SUPPORT
// =========================

app.post(
  '/api/support/messages',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      message: z.string().trim().min(1).max(2000),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '메시지를 입력해 주세요.'
      );
    }

    let thread = await pool.query(
      `SELECT id
       FROM support_threads
       WHERE user_id=$1
         AND status='OPEN'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    let threadId = thread.rows[0]?.id;

    if (!threadId) {
      threadId = uuid();

      await pool.query(
        'INSERT INTO support_threads (id,user_id) VALUES ($1,$2)',
        [
          threadId,
          req.user.id,
        ]
      );
    }

    await pool.query(
      `INSERT INTO support_messages
        (id,thread_id,sender_role,message)
       VALUES ($1,$2,'USER',$3)`,
      [
        uuid(),
        threadId,
        parsed.data.message,
      ]
    );

    await pool.query(
      'UPDATE support_threads SET updated_at=NOW() WHERE id=$1',
      [threadId]
    );

    res.status(201).json({
      message: '메시지가 전송되었습니다.',
    });
  })
);

app.get(
  '/api/support/messages',
  requireAuth,
  asyncRoute(async (req, res) => {
    const thread = await pool.query(
      `SELECT id
       FROM support_threads
       WHERE user_id=$1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (!thread.rowCount) {
      return res.json({ messages: [] });
    }

    const result = await pool.query(
      `SELECT id,sender_role,message,created_at
       FROM support_messages
       WHERE thread_id=$1
       ORDER BY created_at ASC
       LIMIT 200`,
      [thread.rows[0].id]
    );

    res.json({
      messages: result.rows,
    });
  })
);

// =========================
// 20. ADMIN OVERVIEW
// =========================

app.get(
  '/api/admin/overview',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int
         FROM users WHERE role='USER') AS users,

        (SELECT COUNT(*)::int
         FROM license_keys) AS licenses,

        (SELECT COUNT(*)::int
         FROM tasks) AS tasks,

        (SELECT COUNT(*)::int
         FROM tasks WHERE status='RUNNING')
         AS running_tasks,

        (SELECT COUNT(*)::int
         FROM support_threads WHERE status='OPEN')
         AS open_threads`
    );

    res.json(r.rows[0]);
  })
);

// =========================
// 21. ADMIN USERS
// =========================

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT
        u.id,
        u.username,
        u.role,
        u.status,
        u.registration_ip,
        u.last_login_ip,
        u.created_at,
        (
          SELECT MAX(l.expires_at)
          FROM license_keys l
          WHERE l.redeemed_by=u.id
            AND l.status='REDEEMED'
        ) AS license_expires_at
       FROM users u
       ORDER BY u.created_at DESC
       LIMIT 500`
    );

    res.json({
      users: r.rows,
    });
  })
);

app.get(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const u = await pool.query(
      `SELECT
        id,username,role,status,
        registration_ip,last_login_ip,created_at
       FROM users
       WHERE id=$1`,
      [req.params.id]
    );

    if (!u.rowCount) {
      return sendError(
        res,
        404,
        '회원을 찾을 수 없습니다.'
      );
    }

    const licenses = await pool.query(
      `SELECT
        id,code_hint,duration_days,status,
        redeemed_at,starts_at,expires_at
       FROM license_keys
       WHERE redeemed_by=$1
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    const auditRows = await pool.query(
      `SELECT action,ip,created_at
       FROM audit_logs
       WHERE actor_id=$1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.params.id]
    );

    res.json({
      user: u.rows[0],
      licenses: licenses.rows,
      audit: auditRows.rows,
    });
  })
);

// =========================
// 22. ADMIN USER STATUS
// =========================

app.patch(
  '/api/admin/users/:id/status',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      status: z.enum(['ACTIVE', 'SUSPENDED']),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '상태 값이 올바르지 않습니다.'
      );
    }

    const r = await pool.query(
      `UPDATE users
       SET status=$1,updated_at=NOW()
       WHERE id=$2 AND role<>'ADMIN'
       RETURNING id`,
      [
        parsed.data.status,
        req.params.id,
      ]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        '변경할 회원을 찾을 수 없습니다.'
      );
    }

    if (parsed.data.status === 'SUSPENDED') {
      await pool.query(
        'DELETE FROM sessions WHERE user_id=$1',
        [req.params.id]
      );
    }

    await audit(
      req.user.id,
      'USER_STATUS_CHANGED',
      'USER',
      req.params.id,
      clientIp(req),
      {
        status: parsed.data.status,
      }
    );

    res.json({
      message: '회원 상태가 변경되었습니다.',
    });
  })
);

// =========================
// 23. ADMIN CREATE LICENSE
// =========================

app.post(
  '/api/admin/licenses',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      durationDays: z.number().int().min(1).max(3650),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '유효 기간은 1~3650일이어야 합니다.'
      );
    }

    const code =
      `KRSMS-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const id = uuid();

    await pool.query(
      `INSERT INTO license_keys
        (id,code_hash,code_hint,duration_days,created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        id,
        licenseHash(code),
        maskCode(code),
        parsed.data.durationDays,
        req.user.id,
      ]
    );

    await audit(
      req.user.id,
      'LICENSE_CREATED',
      'LICENSE',
      id,
      clientIp(req),
      {
        durationDays: parsed.data.durationDays,
      }
    );

    res.status(201).json({
      id,
      code,
      durationDays: parsed.data.durationDays,
      warning:
        '전체 코드는 이번 응답에서만 표시됩니다. 안전하게 보관하세요.',
    });
  })
);

// =========================
// 24. ADMIN LICENSE LIST
// =========================

app.get(
  '/api/admin/licenses',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT
        l.id,
        l.code_hint,
        l.duration_days,
        l.status,
        l.redeemed_at,
        l.expires_at,
        u.username
       FROM license_keys l
       LEFT JOIN users u ON u.id=l.redeemed_by
       ORDER BY l.created_at DESC
       LIMIT 500`
    );

    res.json({
      licenses: r.rows,
    });
  })
);

// =========================
// 25. REVOKE LICENSE
// =========================

app.post(
  '/api/admin/licenses/:id/revoke',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      `UPDATE license_keys
       SET status='REVOKED'
       WHERE id=$1 AND status<>'REVOKED'
       RETURNING id`,
      [req.params.id]
    );

    if (!r.rowCount) {
      return sendError(
        res,
        404,
        '취소할 라이선스를 찾을 수 없습니다.'
      );
    }

    await audit(
      req.user.id,
      'LICENSE_REVOKED',
      'LICENSE',
      req.params.id,
      clientIp(req)
    );

    res.json({
      message: '라이선스가 취소되었습니다.',
    });
  })
);

// =========================
// 26. BLOCK IP
// =========================

app.post(
  '/api/admin/ip-blocks',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      ip: z.string().trim().min(3).max(64),
      reason: z.string().trim().max(240).optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        'IP 주소를 확인해 주세요.'
      );
    }

    const net = require('node:net');

    if (!net.isIP(parsed.data.ip)) {
      return sendError(
        res,
        400,
        '올바른 IP 주소가 아닙니다.'
      );
    }

    if (parsed.data.ip === clientIp(req)) {
      return sendError(
        res,
        400,
        '현재 접속 중인 관리자 IP는 차단할 수 없습니다.'
      );
    }

    await pool.query(
      `INSERT INTO blocked_ips (ip,reason,created_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (ip)
       DO UPDATE SET
         reason=EXCLUDED.reason,
         created_by=EXCLUDED.created_by`,
      [
        parsed.data.ip,
        parsed.data.reason || '관리자 차단',
        req.user.id,
      ]
    );

    await audit(
      req.user.id,
      'IP_BLOCKED',
      'IP',
      parsed.data.ip,
      clientIp(req)
    );

    res.json({
      message: 'IP가 차단되었습니다.',
    });
  })
);

// =========================
// 27. IP BLOCK LIST
// =========================

app.get(
  '/api/admin/ip-blocks',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT ip,reason,created_at
       FROM blocked_ips
       ORDER BY created_at DESC`
    );

    res.json({
      blocks: r.rows,
    });
  })
);

// =========================
// 28. UNBLOCK IP
// =========================

app.delete(
  '/api/admin/ip-blocks/:ip',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    await pool.query(
      'DELETE FROM blocked_ips WHERE ip=$1',
      [req.params.ip]
    );

    await audit(
      req.user.id,
      'IP_UNBLOCKED',
      'IP',
      req.params.ip,
      clientIp(req)
    );

    res.json({
      message: 'IP 차단이 해제되었습니다.',
    });
  })
);

// =========================
// 29. CREATE ANNOUNCEMENT
// =========================

app.post(
  '/api/admin/announcements',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(2000),
      active: z.boolean().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '공지 내용을 확인해 주세요.'
      );
    }

    const id = uuid();

    await pool.query(
      `INSERT INTO announcements
        (id,title,body,active,created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        id,
        parsed.data.title,
        parsed.data.body,
        parsed.data.active !== false,
        req.user.id,
      ]
    );

    await audit(
      req.user.id,
      'ANNOUNCEMENT_CREATED',
      'ANNOUNCEMENT',
      id,
      clientIp(req)
    );

    res.status(201).json({
      id,
      message: '공지가 등록되었습니다.',
    });
  })
);

// =========================
// 30. ANNOUNCEMENT ADMIN LIST
// =========================

app.get(
  '/api/admin/announcements',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT id,title,body,active,created_at
       FROM announcements
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({
      announcements: r.rows,
    });
  })
);

// =========================
// 31. DELETE ANNOUNCEMENT
// =========================

app.delete(
  '/api/admin/announcements/:id',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    await pool.query(
      'DELETE FROM announcements WHERE id=$1',
      [req.params.id]
    );

    res.json({
      message: '공지가 삭제되었습니다.',
    });
  })
);

// =========================
// 32. ADMIN SUPPORT THREADS
// =========================

app.get(
  '/api/admin/support/threads',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT
        t.id,
        t.status,
        t.updated_at,
        u.username,
        (
          SELECT message
          FROM support_messages m
          WHERE m.thread_id=t.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message
       FROM support_threads t
       JOIN users u ON u.id=t.user_id
       ORDER BY t.updated_at DESC
       LIMIT 200`
    );

    res.json({
      threads: r.rows,
    });
  })
);

// =========================
// 33. ADMIN SUPPORT MESSAGES
// =========================

app.get(
  '/api/admin/support/:id/messages',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      `SELECT id,sender_role,message,created_at
       FROM support_messages
       WHERE thread_id=$1
       ORDER BY created_at ASC
       LIMIT 300`,
      [req.params.id]
    );

    res.json({
      messages: r.rows,
    });
  })
);

// =========================
// 34. ADMIN REPLY
// =========================

app.post(
  '/api/admin/support/:id/reply',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      message: z.string().trim().min(1).max(2000),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        '답변을 입력해 주세요.'
      );
    }

    const exists = await pool.query(
      'SELECT id FROM support_threads WHERE id=$1',
      [req.params.id]
    );

    if (!exists.rowCount) {
      return sendError(
        res,
        404,
        '상담을 찾을 수 없습니다.'
      );
    }

    await pool.query(
      `INSERT INTO support_messages
        (id,thread_id,sender_role,message)
       VALUES ($1,$2,'ADMIN',$3)`,
      [
        uuid(),
        req.params.id,
        parsed.data.message,
      ]
    );

    await pool.query(
      'UPDATE support_threads SET updated_at=NOW() WHERE id=$1',
      [req.params.id]
    );

    res.status(201).json({
      message: '답변이 전송되었습니다.',
    });
  })
);

// =========================
// 35. ADMIN AUDIT LOG
// =========================

app.get(
  '/api/admin/audit',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const r = await pool.query(
      `SELECT
        a.id,
        a.action,
        a.target_type,
        a.target_id,
        a.ip,
        a.details,
        a.created_at,
        u.username
       FROM audit_logs a
       LEFT JOIN users u ON u.id=a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 300`
    );

    res.json({
      logs: r.rows,
    });
  })
);

// =========================
// 36. API CONFIG LIST
// =========================

app.get(
  '/api/admin/api-config',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const items = await apiConfigStore.readAll();

    res.json({
      items: items.map(apiConfigStore.publicSummary),
    });
  })
);

// =========================
// 37. CREATE API CONFIG
// =========================

app.post(
  '/api/admin/api-config',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(1).max(80),

      url: z.string()
        .url()
        .refine(
          v => v.startsWith('https://'),
          'HTTPS 주소만 허용됩니다.'
        ),

      method: z.enum(['GET', 'POST']).default('POST'),

      headers: z.record(z.string()).default({}),

      enabled: z.boolean().default(false),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        'API 설정을 확인해 주세요.'
      );
    }

    const items = await apiConfigStore.readAll();

    const item = {
      id: uuid(),
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    items.push(item);

    await apiConfigStore.writeAll(items);

    await audit(
      req.user.id,
      'API_CONFIG_CREATED',
      'API_CONFIG',
      item.id,
      clientIp(req)
    );

    res.status(201).json({
      item: apiConfigStore.publicSummary(item),
      message: 'API 설정이 암호화되어 저장되었습니다.',
    });
  })
);

// =========================
// 38. UPDATE API CONFIG
// =========================

app.put(
  '/api/admin/api-config/:id',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const items = await apiConfigStore.readAll();

    const idx = items.findIndex(
      x => x.id === req.params.id
    );

    if (idx < 0) {
      return sendError(
        res,
        404,
        'API 설정을 찾을 수 없습니다.'
      );
    }

    const parsed = z.object({
      name: z.string().trim().min(1).max(80),

      url: z.string()
        .url()
        .refine(v => v.startsWith('https://')),

      method: z.enum(['GET', 'POST']),

      headers: z.record(z.string()).default({}),

      enabled: z.boolean(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        'API 설정을 확인해 주세요.'
      );
    }

    items[idx] = {
      ...items[idx],
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    await apiConfigStore.writeAll(items);

    await audit(
      req.user.id,
      'API_CONFIG_UPDATED',
      'API_CONFIG',
      req.params.id,
      clientIp(req)
    );

    res.json({
      item: apiConfigStore.publicSummary(items[idx]),
    });
  })
);

// =========================
// 39. DELETE API CONFIG
// =========================

app.delete(
  '/api/admin/api-config/:id',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const items = await apiConfigStore.readAll();

    const next = items.filter(
      x => x.id !== req.params.id
    );

    if (next.length === items.length) {
      return sendError(
        res,
        404,
        'API 설정을 찾을 수 없습니다.'
      );
    }

    await apiConfigStore.writeAll(next);

    await audit(
      req.user.id,
      'API_CONFIG_DELETED',
      'API_CONFIG',
      req.params.id,
      clientIp(req)
    );

    res.json({
      message: 'API 설정이 삭제되었습니다.',
    });
  })
);

// =========================
// 40. TASK EXPIRATION
// =========================

// This only expires task monitoring windows.
// It does not send SMS or make external API requests.

setInterval(() => {
  pool.query(
    `UPDATE tasks
     SET status='EXPIRED',
         completed_at=NOW()
     WHERE status IN ('NOT_CONFIGURED','PENDING')
       AND ends_at <= NOW()`
  ).catch(err => {
    console.error('[TASK EXPIRY]', err.message);
  });
}, 30_000).unref();

// =========================
// 41. API NOT FOUND
// =========================

app.use(
  '/api',
  (_req, res) => sendError(
    res,
    404,
    '요청한 API를 찾을 수 없습니다.'
  )
);

// =========================
// 42. ERROR HANDLER
// =========================

app.use((err, _req, res, _next) => {
  console.error(
    '[ERROR]',
    err && err.stack ? err.stack : err
  );

  if (res.headersSent) return;

  res.status(500).json({
    message: '서버 내부 오류가 발생했습니다.',
  });
});

// =========================
// 43. START SERVER
// =========================

async function start() {
  await fs.mkdir(DATA_DIR, {
    recursive: true,
    mode: 0o700,
  });

  await pool.query('SELECT 1');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[KRSMS] Listening on ${PORT}; origin=${PUBLIC_ORIGIN}`
    );
  });
}

start().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
