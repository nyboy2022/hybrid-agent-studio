import "./style.css";
export const metadata = {
  title: "Hybrid Agent Studio",
  description: "开源、本地优先的 Bot 协作工作区",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
