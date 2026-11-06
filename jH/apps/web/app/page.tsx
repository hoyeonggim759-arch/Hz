"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { AccentPicker } from "../components/accent-picker";

export default function Login() {
  const [show, setShow] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ loginId: loginId.trim(), password }) });
      router.replace("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "登录失败，请稍后重试"); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-bg flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-700/60 bg-[#0d1523] shadow-2xl shadow-black/40 md:min-h-[650px] md:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-700/60 bg-[radial-gradient(ellipse_at_15%_15%,rgba(108,140,255,.22),transparent_40%),linear-gradient(145deg,#111d31,#0a111e)] p-10 text-white md:flex lg:p-14">
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full border border-white/5" />
          <div className="pointer-events-none absolute -bottom-12 -right-4 h-56 w-56 rounded-full border border-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-strong)] text-lg font-black shadow-lg shadow-blue-950/30">J</div>
            <div><div className="text-lg font-bold tracking-[.12em]">JinqSMS</div><div className="mt-0.5 text-[10px] tracking-[.24em] text-slate-400">SECURE WORKSPACE</div></div>
          </div>
          <div className="relative max-w-md py-12">
            <p className="text-xs font-bold tracking-[.28em] text-[var(--accent)]">PRIVATE · RELIABLE · CONTROLLED</p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.2] tracking-tight lg:text-5xl">让每项任务，<br/>清晰而有序。</h1>
            <p className="mt-6 max-w-sm text-sm leading-7 text-slate-400">在一个安全、安静的工作空间中，管理账户、会员状态与任务记录。</p>
            <div className="mt-10 grid grid-cols-3 gap-3 text-xs text-slate-400">
              <div className="rounded-xl border border-white/10 bg-white/[.035] p-3"><div className="mb-2 h-1.5 w-1.5 rounded-full bg-emerald-400"/>安全会话</div>
              <div className="rounded-xl border border-white/10 bg-white/[.035] p-3"><div className="mb-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"/>卡密验证</div>
              <div className="rounded-xl border border-white/10 bg-white/[.035] p-3"><div className="mb-2 h-1.5 w-1.5 rounded-full bg-amber-400"/>任务记录</div>
            </div>
          </div>
          <div className="relative flex items-center justify-between text-[11px] text-slate-500"><span>© 2026 JinqSMS</span><span>SECURE BY DESIGN</span></div>
        </section>

        <section className="flex flex-col justify-center bg-[#101a2a] p-7 sm:p-10 lg:p-14">
          <div className="mb-10 flex items-center justify-between md:mb-12">
            <div className="md:hidden"><div className="font-bold tracking-[.12em]">JinqSMS</div><div className="mt-1 text-[10px] tracking-[.2em] text-slate-500">SECURE WORKSPACE</div></div>
            <span className="hidden text-xs font-semibold tracking-[.2em] text-slate-500 md:inline">ACCOUNT ACCESS</span>
            <AccentPicker />
          </div>
          <div className="max-w-md">
            <p className="text-sm font-semibold text-[var(--accent)]">欢迎回来</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">登录 JinqSMS</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">使用注册时创建的用户 ID 和密码继续。</p>
            <form className="mt-9 space-y-5" onSubmit={submit}>
              <label className="block text-sm font-medium text-slate-200">用户 ID
                <input className="field mt-2" placeholder="请输入用户 ID" autoComplete="username" value={loginId} onChange={e => setLoginId(e.target.value)} required minLength={4} maxLength={32}/>
              </label>
              <label className="block text-sm font-medium text-slate-200">登录密码
                <div className="relative mt-2">
                  <input className="field pr-16" type={show ? "text" : "password"} placeholder="请输入密码" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128}/>
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-3.5 text-xs text-slate-400 hover:text-white">{show ? "隐藏" : "显示"}</button>
                </div>
              </label>
              {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
              <button disabled={busy || !loginId.trim() || !password} className="btn-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "正在登录…" : "登录工作台"}<span aria-hidden>→</span></button>
            </form>
            <div className="mt-6 flex items-center justify-between text-sm"><a className="text-slate-400 hover:text-white" href="/forgot">忘记账号 / 密码？</a><a className="font-semibold text-[var(--accent)] hover:opacity-80" href="/register">创建新账户</a></div>
            <div className="mt-8 rounded-2xl border border-slate-700/70 bg-[#0b1320] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><span className="h-2 w-2 rounded-full bg-emerald-400"/>卡密注册验证</div><p className="mt-2 text-xs leading-5 text-slate-500">新用户需要在注册时同时提供有效卡密、用户 ID 和密码。已有账户登录时不需要再次输入卡密。</p></div>
            <p className="mt-8 text-center text-[11px] text-slate-600">登录即表示你同意平台服务条款与隐私政策。</p>
          </div>
        </section>
      </div>
    </main>
  );
}
