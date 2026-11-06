"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AccentPicker } from "../../components/accent-picker";
export default function Redeem(){
 const [code,setCode]=useState(""); const [error,setError]=useState(""); const [ok,setOk]=useState(""); const [busy,setBusy]=useState(false); const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setError("");setOk("");setBusy(true);try{const r=await api<{membershipEndsAt:string}>("/licenses/redeem",{method:"POST",body:JSON.stringify({code})});setOk(`兑换成功，会员到期时间：${new Date(r.membershipEndsAt).toLocaleString()}`);setCode("");}catch(e){setError(e instanceof Error?e.message:"兑换失败");}finally{setBusy(false);}}
 return <main className="auth-bg min-h-screen flex items-center justify-center p-5"><div className="panel w-full max-w-md p-8 sm:p-10"><div className="flex items-center justify-between"><a href="/dashboard" className="text-sm text-indigo-600">← 返回工作台</a><AccentPicker/></div><div className="mt-8 text-xs font-bold tracking-widest text-indigo-600">MEMBERSHIP</div><h1 className="mt-2 text-3xl font-bold">兑换会员卡密</h1><p className="mt-2 text-sm text-slate-500">兑换成功后，会员有效期会在当前有效期基础上顺延。</p><form className="mt-8 space-y-4" onSubmit={submit}><label className="block text-sm">卡密代码<input className="field mt-2" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX" required autoComplete="off"/></label>{error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}{ok&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p>}<button disabled={busy||!code.trim()} className="btn-primary w-full disabled:opacity-40">{busy?"正在验证…":"验证并兑换"}</button></form><p className="mt-5 text-xs leading-5 text-slate-400">卡密为一次性使用。请勿向他人泄露你的卡密。</p></div></main>
}
