import type { Metadata } from 'next'
import './globals.css'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://badminton-service.dannyisadog.com'

export const metadata: Metadata = {
  title: '濱江國中羽球團',
  description: '濱江國中羽球團',
  openGraph: {
    title: '濱江國中羽球團',
    description: '濱江國中羽球團',
    url: APP_URL,
    siteName: '濱江國中羽球團',
    images: [
      {
        url: `${APP_URL}/badminton.png`,
        width: 512,
        height: 512,
        alt: '濱江國中羽球團',
      },
    ],
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '濱江國中羽球團',
    description: '濱江國中羽球團',
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
