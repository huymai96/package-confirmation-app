import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Package Receipt Confirmation',
  description: 'Confirm receipt of incoming packages and orders',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

