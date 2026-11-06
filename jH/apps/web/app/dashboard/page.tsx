"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AccentPicker } from "../../components/accent-picker";

type User = { loginId: string; role: string; membershipEndsAt: string | null };
type Task = { id: string; phoneNumber: string; requestedMinutes: number; status: string; createdAt: string; logs: { message: string; createdAt: string }[] };

const activeStatuses = ["QUEUED", "RUNNING", "STOP_REQUESTED"];
const statusLabels: Record<string, string> = { QUEUED: "排队中", RUNNING: "执行中", STOP_REQUESTED: "停止待处理", STOPPED: "已停止", SUCCEEDED: "已完成", FAILED: "失败" };

function formatDate(value: string | null) {
  if (!value) return "尚未激活";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const [phone, setPhone] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const validPhone = /^010\d{8}$/.test(phone);

  const refresh = useCallback(async () => {
    const [me, result] = await Promise.all([api<{ user: User }>("/auth/me"), api<{ tasks: Task[] }>("/tasks")]);
    setUser(me.user);
    setTasks(result.tasks);
  }, []);

  useEffect(() => { refresh().catch(() => router.replace("/")); }, [refresh, router]);

  const activeTask = useMemo(() => tasks.find(task => activeStatuses.includes(task.status)), [tasks]);
  const expiryTime = user?.membershipEndsAt ? new Date(user.membershipEndsAt).getTime() : 0;
  const remainingDays = expiryTime > Date.now() ? Math.ceil((expiryTime - Date.now()) / 86400000) : 0;
  const membershipActive = remainingDays > 0;
  const quotaLabel = activeTask ? "0 / 1" : "1 / 1";

  async function startTask(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const result = await api<{ notice?: string }>("/tasks", { method: "POST", body: JSON.stringify({ phoneNumber: phone, minutes: Number(minutes) }) });
      setNotice(result.notice || "任务记录已提交。"); setPhone(""); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "提交失败"); }
    finally { setBusy(false); }
  }

  async function stopTask(id: string) {
    setError(""); setNotice("");
    try { const result = await api<{ notice?: string }>(`/tasks/${id}/stop`, { method: "POST" }); setNotice(result.notice || "停止请求已记录。"); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "停止失败"); }
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } finally { router.replace("/"); }
  }

  return (
    <main className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1480px] gap-5 p-3 sm:p-5 lg:gap-7 lg:p-7">
        <aside className="hidden w-[228px] shrink-0 flex-col rounded-[22px] border border-slate-700/60 bg-[#0d1523] p-4 lg:flex">
          <a href="/dashboard" className="flex items-center gap-3 px-2 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-strong)] text-lg font-black text-white shadow-lg shadow-black/20">J</span><span><b className="tracking-[.1em]">JinqSMS</b><small className="mt-1 block text-[9px] tracking-[.2em] text-slate-500">SECURE WORKSPACE</small></span></a>
          <div className="mt-8 px-3 text-[10px] font-bold tracking-[.2em] text-slate-600">WORKSPACE</div>
          <nav className="mt-3 space-y-1.5">
            <a className="sidebar-link active" href="/dashboard"><span className="w-5 text-center">▦</span><span>工作台</span></a>
            <a className="sidebar-link" href="/redeem"><span className="w-5 text-center">◇</span><span>卡密兑换</span></a>
            <a className="sidebar-link" href="/plans"><span className="w-5 text-center">▤</span><span>会员方案</span></a>
            <a className="sidebar-link" href="/support"><span className="w-5 text-center">◌</span><span>在线客服</span></a>
            {user?.role === "ADMIN" && <a className="sidebar-link" href="/admin"><span className="w-5 text-center">⌘</span><span>管理后台</span></a>}
          </nav>
          <div className="mt-auto rounded-2xl border border-slate-700/70 bg-[#111d2d] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/>安全连接</div><p className="mt-2 text-[11px] leading-5 text-slate-500">你的任务与会员数据由服务端账户权限保护。</p></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/50 bg-[#0d1523]/90 px-4 py-3.5 sm:px-5">
            <div><div className="text-[10px] font-bold tracking-[.22em] text-[var(--accent)]">JINQSMS / WORKSPACE</div><h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">工作台</h1></div>
            <div className="flex flex-wrap items-center gap-2"><span className="hidden rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-400 sm:inline">账户：{user?.loginId || "加载中…"}</span><AccentPicker/><a href="/support" className="btn-outline text-xs sm:text-sm">帮助</a><button onClick={logout} className="btn-outline text-xs sm:text-sm">退出登录</button></div>
          </header>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="工作台导航">
            <a className="sidebar-link active shrink-0" href="/dashboard">▦ 工作台</a>
            <a className="sidebar-link shrink-0" href="/redeem">◇ 卡密兑换</a>
            <a className="sidebar-link shrink-0" href="/plans">▤ 会员方案</a>
            <a className="sidebar-link shrink-0" href="/support">◌ 在线客服</a>
            {user?.role === "ADMIN" && <a className="sidebar-link shrink-0" href="/admin">⌘ 管理后台</a>}
          </nav>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="panel p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">会员剩余时间</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgba(var(--accent-rgb),.14)] text-[var(--accent)]">◷</span></div><div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight">{membershipActive ? remainingDays : 0}</strong><span className="text-sm text-slate-400">天</span></div><p className="mt-2 text-[11px] text-slate-500">{membershipActive ? "会员服务有效" : "请使用有效卡密激活"}</p></article>
            <article className="panel p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">已提交任务</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">✓</span></div><div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight">{tasks.length}</strong><span className="text-sm text-slate-400">条</span></div><p className="mt-2 text-[11px] text-slate-500">仅统计当前账户</p></article>
            <article className="panel p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">当前活动任务</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/10 text-amber-300">◌</span></div><div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight">{activeTask ? 1 : 0}</strong><span className="text-sm text-slate-400">项</span></div><p className="mt-2 text-[11px] text-slate-500">同一时间最多一个活动任务</p></article>
            <article className="panel p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">可用任务名额</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-400/10 text-sky-300">▣</span></div><div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight">{quotaLabel}</strong></div><p className="mt-2 text-[11px] text-slate-500">单账户并发限制</p></article>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]">
            <section className="panel p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-bold tracking-[.2em] text-[var(--accent)]">TASK CENTER</div><h2 className="mt-2 text-lg font-semibold">提交手机号任务</h2><p className="mt-1 text-xs text-slate-400">填写任务参数，提交后可在下方查看服务端记录。</p></div><span className="tag tag-blue">单次最长 300 分钟</span></div>
              <form onSubmit={startTask} className="mt-7 grid gap-4 md:grid-cols-[1.2fr_.8fr_auto] md:items-end">
                <label className="text-sm font-medium text-slate-200">韩国手机号（010）<input className="field mt-2" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="01012345678" inputMode="numeric" autoComplete="tel-national"/><span className="mt-1.5 block text-[11px] font-normal text-slate-500">请输入 010 开头的 11 位号码</span></label>
                <label className="text-sm font-medium text-slate-200">任务时长<select className="field mt-2" value={minutes} onChange={e => setMinutes(e.target.value)}>{[1,5,10,15,30,60,120,180,240,300].map(n => <option key={n} value={n}>{n} 分钟</option>)}</select></label>
                <button type="submit" disabled={!validPhone || !!activeTask || busy || !membershipActive} className="btn-primary min-h-[46px] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "提交中…" : "提交任务 →"}</button>
              </form>
              {activeTask && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-3 text-sm"><span className="text-amber-200">当前有一项活动任务：{statusLabels[activeTask.status] || activeTask.status}</span><button onClick={() => stopTask(activeTask.id)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-300/10">请求停止</button></div>}
              {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
              {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
              <div className="mt-6 rounded-xl border border-slate-700/70 bg-[#0b1320] p-4"><p className="text-xs leading-6 text-slate-500">说明：当前版本会安全保存任务记录与状态。真实手机号执行 Worker 尚未接入，因此“提交成功”只表示服务器已创建记录，不代表外部操作已经执行。</p></div>
            </section>

            <aside className="panel p-5 sm:p-6">
              <div className="text-[10px] font-bold tracking-[.2em] text-[var(--accent)]">MEMBERSHIP</div><h2 className="mt-2 text-lg font-semibold">会员状态</h2>
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-700/60 bg-[#0c1522] p-4"><span className={`grid h-10 w-10 place-items-center rounded-full ${membershipActive ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{membershipActive ? "✓" : "!"}</span><div><div className="text-sm font-semibold">{membershipActive ? "有效会员" : "未激活 / 已到期"}</div><div className="mt-1 text-[11px] text-slate-500">{membershipActive ? `还可使用 ${remainingDays} 天` : "兑换会员卡密后启用任务"}</div></div></div>
              <dl className="mt-5 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">账户 ID</dt><dd className="max-w-[60%] truncate font-medium text-slate-200">{user?.loginId || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">账户角色</dt><dd className="font-medium text-slate-200">{user?.role || "USER"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">到期时间</dt><dd className="text-right font-medium text-slate-200">{formatDate(user?.membershipEndsAt || null)}</dd></div></dl>
              <a href="/redeem" className="btn-primary mt-6 w-full">输入卡密 / 续费</a>
            </aside>
          </div>

          <section className="panel mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6"><div><div className="text-[10px] font-bold tracking-[.2em] text-[var(--accent)]">ACTIVITY</div><h2 className="mt-1 font-semibold">最近任务记录</h2><p className="mt-1 text-[11px] text-slate-500">展示当前账户的任务状态与创建时间</p></div><button onClick={() => refresh().catch(err => setError(err.message))} className="btn-outline text-xs">刷新记录</button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[#0c1522] text-[11px] text-slate-500"><tr><th className="px-5 py-3 font-medium">手机号</th><th className="px-5 py-3 font-medium">时长</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">提交时间</th><th className="px-5 py-3 font-medium">最新日志</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id} className="border-t border-slate-800/80"><td className="px-5 py-4 font-medium text-slate-200">{task.phoneNumber}</td><td className="px-5 py-4 text-slate-400">{task.requestedMinutes} 分钟</td><td className="px-5 py-4"><span className={`tag ${task.status === "SUCCEEDED" ? "tag-green" : task.status === "FAILED" ? "tag-orange" : "tag-blue"}`}>{statusLabels[task.status] || task.status}</span></td><td className="px-5 py-4 text-xs text-slate-400">{formatDate(task.createdAt)}</td><td className="max-w-[260px] truncate px-5 py-4 text-xs text-slate-500">{task.logs?.[0]?.message || "暂无日志"}</td></tr>)}</tbody></table>{!tasks.length && <div className="px-5 py-14 text-center text-sm text-slate-500">还没有任务记录</div>}</div>
          </section>
          <footer className="px-2 py-5 text-center text-[10px] tracking-wide text-slate-600">JinqSMS · PRIVATE WORKSPACE · PROTECTED BY SERVER-SIDE AUTHORIZATION</footer>
        </section>
      </div>
    </main>
  );
}
