import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/theme-provider";

export const metadata: Metadata = {
  title: "JinqSMS · Secure Workspace",
  description: "JinqSMS 安全任务与会员管理工作台",
  applicationName: "JinqSMS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
