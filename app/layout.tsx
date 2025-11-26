import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Promos Ink Supply Chain - Inbound & Outbound Shipment Lookup',
  description: 'Track inbound and outbound shipments for Promos Ink',
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

