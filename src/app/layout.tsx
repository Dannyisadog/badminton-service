import type { Metadata } from 'next'
import './globals.css'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://badminton-service.dannyisadog.com'

export const metadata: Metadata = {
  title: '羽球場次管理',
  description: '羽球場次出席、請假、候補管理系統',
  openGraph: {
    title: '羽球場次管理',
    description: '羽球場次出席、請假、候補管理系統',
    url: APP_URL,
    siteName: '羽球場次管理',
    images: [
      {
        url: `${APP_URL}/badminton.png`,
        width: 1200,
        height: 630,
        alt: '羽球場次管理',
      },
    ],
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '羽球場次管理',
    description: '羽球場次出席、請假、候補管理系統',
    images: [`${APP_URL}/badminton.png`],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
