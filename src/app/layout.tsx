import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Lora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeInitializer } from "@/components/ThemeInitializer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InfraMind-SentinelX — Production-Ready Autonomous SecOps + AIOps Platform",
  description: "Enterprise autonomous security + infrastructure operations platform with RBAC, Audit Trail, AI Gateway, OCSF, NIST CSF, and more.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeBootstrap = `(function(){try{var r=localStorage.getItem('inframind-sentinelx-prefs');if(r){var p=JSON.parse(r).state;var m=p.theme||'dark';var a=p.accentColor||'#10b981';var root=document.documentElement;if(m==='system'){root.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches)}else{root.classList.toggle('dark',m==='dark')}var x=a.match(/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i);var rgb=x?(parseInt(x[1],16)+', '+parseInt(x[2],16)+', '+parseInt(x[3],16)):'16, 185, 129';root.style.setProperty('--app-accent',a);root.style.setProperty('--app-accent-rgb',rgb);root.style.setProperty('--app-accent-bg','rgba('+rgb+', 0.15)');root.style.setProperty('--app-accent-border','rgba('+rgb+', 0.3)');root.style.setProperty('--app-accent-text',a);var fonts={sans:"'Inter', system-ui, sans-serif",serif:"'Lora', Georgia, serif",mono:"'Geist Mono', monospace"};root.style.setProperty('--app-font-family',fonts[p.fontFamily]||fonts.sans);var sizes={sm:'13px',base:'14px',lg:'15px',xl:'16px'};root.style.setProperty('--app-font-size',sizes[p.fontSize]||sizes.base);var d={compact:{p:'0.5rem',g:'0.5rem',c:'0.625rem'},comfortable:{p:'0.75rem',g:'0.75rem',c:'1rem'},spacious:{p:'1rem',g:'1rem',c:'1.25rem'}};var dv=d[p.density]||d.comfortable;root.style.setProperty('--app-density-padding',dv.p);root.style.setProperty('--app-density-gap',dv.g);root.style.setProperty('--app-density-card',dv.c)}}catch(e){}})();`;
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${lora.variable} ${jetbrains.variable} antialiased min-h-screen`}>
        <ThemeInitializer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}