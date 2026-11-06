"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AccentPicker } from "../../components/accent-picker";

export default function Register() {
  const [licenseCode, setLicenseCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginId, setLoginId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (password !== confirmPassword) { setError("两次输入的密码不一致"); return; }
    setBusy(true);
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify({ licenseCode: licenseCode.trim().toUpperCase(), loginId: loginId.trim(), password }) });
      router.replace("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "注册失败"); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-bg flex min-h-screen items-center justify-center p-4 sm:p-6">
      <section className="panel w-full max-w-xl p-7 sm:p-10">
        <div className="flex items-center justify-between"><a href="/" className="text-sm text-[var(--accent)] hover:opacity-80">← 返回登录</a><AccentPicker/></div>
        <div className="mt-9 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-strong)] text-lg font-black text-white">J</div><div><div className="font-bold tracking-[.12em]">JinqSMS</div><div className="text-[10px] tracking-[.2em] text-slate-500">NEW ACCOUNT</div></div></div>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">创建账户</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">注册时验证卡密并创建账号。卡密验证与账号创建会在服务器端一次性完成。</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-200">会员卡密
            <input className="field mt-2 font-mono tracking-wide" placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX" autoComplete="off" required minLength={14} maxLength={44} value={licenseCode} onChange={e => setLicenseCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}/>
            <span className="mt-1.5 block text-xs font-normal text-slate-500">需要未使用且未过期的有效卡密；服务端只保存卡密的 HMAC 摘要，不保存明文。</span>
          </label>
          <label className="block text-sm font-medium text-slate-200">用户 ID
            <input className="field mt-2" placeholder="4-32 位字母、数字、_ 或 -" autoComplete="username" required minLength={4} maxLength={32} value={loginId} onChange={e => setLoginId(e.target.value.replace(/\s/g, ""))}/>
          </label>
          <label className="block text-sm font-medium text-slate-200">登录密码
            <div className="relative mt-2"><input className="field pr-16" type={showPassword ? "text" : "password"} placeholder="至少 10 位，建议使用独立强密码" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" className="absolute right-3 top-3.5 text-xs text-slate-400 hover:text-white" onClick={() => setShowPassword(v => !v)}>{showPassword ? "隐藏" : "显示"}</button></div>
          </label>
          <label className="block text-sm font-medium text-slate-200">确认密码
            <input className="field mt-2" type="password" placeholder="再次输入密码" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/>
          </label>
          {confirmPassword && password !== confirmPassword && <p className="text-xs text-rose-300">两次输入的密码不一致</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          <button disabled={!licenseCode.trim() || !loginId.trim() || password.length < 10 || password !== confirmPassword || busy} className="btn-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "正在验证卡密并创建…" : "验证卡密并注册账户"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">已有账户？ <a href="/" className="font-semibold text-[var(--accent)]">立即登录</a></p>
      </section>
    </main>
  );
}
