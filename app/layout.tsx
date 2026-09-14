import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auto Cards — учёт авто",
  description: "Учёт закупки, продажи и прибыли по б/у автомобилям",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
            <Link href="/" className="font-semibold tracking-tight text-slate-900">
              🚗 Auto Cards
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-slate-600 hover:text-slate-900 transition-colors">
                Дашборд
              </Link>
              <Link href="/cars" className="text-slate-600 hover:text-slate-900 transition-colors">
                Машины
              </Link>
              <Link href="/expenses" className="text-slate-600 hover:text-slate-900 transition-colors">
                Расходы
              </Link>
              <Link href="/services" className="text-slate-600 hover:text-slate-900 transition-colors">
                Услуги
              </Link>
              <Link href="/report" className="text-slate-600 hover:text-slate-900 transition-colors">
                Отчёт
              </Link>
              <Link href="/dop-uslugi" className="text-slate-600 hover:text-slate-900 transition-colors">
                Доп. услуги
              </Link>
              <Link href="/import" className="text-slate-600 hover:text-slate-900 transition-colors">
                Импорт
              </Link>
              <Link href="/audit" className="text-slate-600 hover:text-slate-900 transition-colors">
                Аудит
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
