import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '羽球場次管理',
  description: '羽球場次出席、請假、候補管理系統',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
