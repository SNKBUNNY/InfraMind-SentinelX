'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUserPreferences } from '@/lib/preferences';
import { api, postJSON } from '@/lib/api-client';
import {
  LayoutDashboard, Activity, Server, AlertTriangle, Shield, Bug, Siren,
  MessageSquare, BookOpen, Bot, Code2, DatabaseBackup, FileText, Settings,
  GitBranch, Network, Gauge, TrendingUp, FlaskConical, Crosshair,
  BarChart3, ShieldAlert, CircleDot, ChevronRight, ChevronLeft,
  Search, Play, RefreshCw, ScrollText, Lock, Cpu, Cloud, Wifi,
  Send, Check, X, Zap, Plus, Filter, Eye, Download, FileSpreadsheet,
  FileJson, FileCode, Table, AlertCircle, CheckCircle, XCircle,
  Bot as BotIcon, Clock, Palette, HardDrive, Container, Radio,
  Brain, Mail, Save, RotateCw, Database, PieChart,
} from 'lucide-react';
import { CommandDialog, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from '@/components/ui/command';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart, CartesianGrid, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

type NavId = string;

interface NavItem { id: NavId; label: string; icon: any; group: string; badge?: string; }

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Overview' },
  { id: 'live', label: 'Live Monitor', icon: Activity, group: 'Overview' },
  { id: 'infrastructure', label: 'Infrastructure', icon: Server, group: 'Infrastructure' },
  { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle, group: 'Infrastructure' },
  { id: 'security', label: 'Security Events', icon: Shield, group: 'Security' },
  { id: 'threats', label: 'Threat Detection', icon: Bug, group: 'Security' },
  { id: 'incidents', label: 'Incidents', icon: Siren, group: 'Security' },
  { id: 'attack-paths', label: 'Attack Paths', icon: GitBranch, group: 'Security' },
  { id: 'audit-trail', label: 'Audit Trail', icon: ScrollText, group: 'Security', badge: 'PROD' },
  { id: 'ai-gateway', label: 'AI Gateway', icon: Lock, group: 'Security', badge: 'PROD' },
  { id: 'ocsf-events', label: 'OCSF Events', icon: Cloud, group: 'Security', badge: 'PROD' },
  { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Network, group: 'Intelligence' },
  { id: 'risk-hierarchy', label: 'Risk Hierarchy', icon: Gauge, group: 'Intelligence' },
  { id: 'predictive-security', label: 'Predictive Security', icon: TrendingUp, group: 'Intelligence' },
  { id: 'what-if', label: 'What-If Simulator', icon: FlaskConical, group: 'Intelligence' },
  { id: 'threat-hunt', label: 'Threat Hunting', icon: Crosshair, group: 'Intelligence' },
  { id: 'assets', label: 'Assets & Vulns', icon: Cpu, group: 'Intelligence', badge: 'PROD' },
  { id: 'nist-csf', label: 'NIST CSF Posture', icon: ShieldAlert, group: 'Intelligence', badge: 'PROD' },
  { id: 'ai-chat', label: 'AI ChatOps', icon: MessageSquare, group: 'AI & Knowledge' },
  { id: 'rag', label: 'RAG Knowledge', icon: BookOpen, group: 'AI & Knowledge' },
  { id: 'agents', label: 'Agentic AI', icon: Bot, group: 'AI & Knowledge' },
  { id: 'ai-evaluation', label: 'AI Evaluation', icon: BarChart3, group: 'AI & Knowledge' },
  { id: 'adversarial-tests', label: 'Adversarial AI', icon: ShieldAlert, group: 'AI & Knowledge' },
  { id: 'platform-health', label: 'Platform Health', icon: Activity, group: 'Operations', badge: 'PROD' },
  { id: 'integrations', label: 'Integrations', icon: Wifi, group: 'Operations', badge: 'PROD' },
  { id: 'rbac', label: 'Users & RBAC', icon: Shield, group: 'Operations', badge: 'PROD' },
  { id: 'policy', label: 'Policy Compiler', icon: Code2, group: 'Operations' },
  { id: 'recovery', label: 'Backup & Recovery', icon: DatabaseBackup, group: 'Operations' },
  { id: 'reports', label: 'Reports', icon: FileText, group: 'Operations' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Operations' },
];

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState<NavId>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cycling, setCycling] = useState(false);
  const [platformStartTime] = useState(Date.now());
  const [uptime, setUptime] = useState('0m 0s');
  const prefs = useUserPreferences();
  const collapsed = prefs.sidebarCollapsed;

  useEffect(() => {
    (async () => {
      try {
        const ov = await api('/api/v1/overview'); setOverview(ov);
        const st = await api('/api/v1/status'); setStatus(st);
        if (ov.stats?.hosts === 0) { await postJSON('/api/v1/cron', {}); setOverview(await api('/api/v1/overview')); }
        await postJSON('/api/v1/cron', { action: 'auto-start', intervalMs: 60000 });
      } catch (e) { console.error('Bootstrap failed:', e); } finally { setLoading(false); }
    })();
    const t1 = setInterval(async () => { try { setOverview(await api('/api/v1/overview')); } catch {} }, 15000);
    const t2 = setInterval(async () => { try { setStatus(await api('/api/v1/status')); } catch {} }, 20000);
    const t3 = setInterval(() => {
      const elapsed = Math.floor((Date.now() - platformStartTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setUptime(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }, 1000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await api('/api/v1/live');
        setLiveSnapshot(data); setConnected(true);
        setHistory((prev) => [...prev, { ts: Date.now(), cpu: data.system?.cpuPercent || 0, memory: data.system?.memoryPercent || 0, disk: data.system?.diskPercent || 0 }].slice(-60));
      } catch { setConnected(false); }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, []);

  // Command palette shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(o => !o); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { setOverview(await api('/api/v1/overview')); setStatus(await api('/api/v1/status')); } catch {}
    finally { setTimeout(() => setRefreshing(false), 500); }
  }, []);
  const handleRunCycle = useCallback(async () => {
    setCycling(true);
    try { await postJSON('/api/v1/cron', {}); await handleRefresh(); } catch {}
    finally { setTimeout(() => setCycling(false), 500); }
  }, [handleRefresh]);

  const groupedNav: Record<string, NavItem[]> = {};
  for (const item of NAV_ITEMS) { if (!groupedNav[item.group]) groupedNav[item.group] = []; groupedNav[item.group].push(item); }

  return (
    <div className="min-h-screen flex app-shell">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} app-sidebar flex flex-col transition-all h-screen sticky top-0 overflow-hidden`}>
        <div className={`p-4 border-b border-slate-800 flex items-center ${collapsed ? 'justify-center' : 'gap-2'} flex-shrink-0`}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${prefs.accentColor}, ${prefs.accentColor}88)` }}>
            <Shield className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (<div className="flex-1 min-w-0"><div className="font-bold text-sm leading-tight text-slate-100">InfraMind</div><div className="text-[10px] text-slate-400 leading-tight">+ SentinelX</div></div>)}
          <button onClick={() => prefs.setSidebarCollapsed(!collapsed)} className="text-slate-400 hover:text-slate-200 p-1 rounded">{collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-3 custom-scroll">
          {Object.entries(groupedNav).map(([group, items]) => (
            <div key={group}>
              {!collapsed && <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{group}</div>}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = activeNav === item.id;
                  return (
                    <button key={item.id} onClick={() => setActiveNav(item.id)} title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors border ${active ? 'app-active' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'} ${collapsed ? 'justify-center' : ''}`}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && (<><span className="flex-1 text-left truncate">{item.label}</span>{item.badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--app-accent-bg)', color: 'var(--app-accent-text)' }}>{item.badge}</span>}{active && <ChevronRight className="h-3 w-3" />}</>)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 text-[10px] text-slate-500 space-y-1 flex-shrink-0">
          <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse' : ''}`} style={{ background: connected ? prefs.accentColor : '#f59e0b' }} />{!collapsed && <span className="text-slate-400">{connected ? 'Live' : 'Off'}</span>}</div>
          {!collapsed && status?.hostname && <div className="truncate text-slate-400">{status.hostname}</div>}
          {!collapsed && status?.cycleStatus?.autoCycleEnabled && <div style={{ color: prefs.accentColor }}>Cycle #{status.cycleStatus.autoCycleCount}</div>}
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 app-header flex items-center justify-between px-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate text-slate-100">{NAV_ITEMS.find((n) => n.id === activeNav)?.label}</h1>
            <p className="text-[11px] text-slate-500 truncate">Production-Ready Autonomous SecOps + AIOps Platform</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 transition-colors"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
              title="Open command palette (Cmd+K)"
            >
              <Search className="h-3 w-3" />
              <span>Search modules...</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--app-code-bg)', border: '1px solid var(--app-border)' }}>⌘K</kbd>
            </button>
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing} className="gap-1 text-xs">
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button size="sm" onClick={handleRunCycle} disabled={cycling} className="gap-1 text-xs" style={{ background: prefs.accentColor, opacity: cycling ? 0.7 : 1 }}>
              <Play className={`h-3 w-3 ${cycling ? 'animate-pulse' : ''}`} /> {cycling ? 'Running...' : 'Run Cycle'}
            </Button>
            <ThemeToggle />
            {overview && (<><Stat label="Hosts" value={overview.stats?.hosts || 0} /><Stat label="Incidents" value={overview.stats?.openIncidents || 0} tone="amber" /><Stat label="Threats" value={overview.stats?.criticalThreats || 0} tone="red" /></>)}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 app-content custom-scroll">
          {loading && !overview ? (
            <div className="flex items-center justify-center h-full"><div className="text-center space-y-3"><div className="inline-flex items-center gap-2 text-sm text-slate-400"><Activity className="h-4 w-4 animate-pulse" /><span>Initializing platform...</span></div><div className="h-1 w-48 mx-auto rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}><div className="h-full animate-pulse" style={{ width: '60%', background: prefs.accentColor }} /></div></div></div>
          ) : (
            <ModuleRouter activeNav={activeNav} overview={overview} liveSnapshot={liveSnapshot} connected={connected} history={history} onRefresh={handleRefresh} onRunCycle={handleRunCycle} status={status} prefs={prefs} uptime={uptime} />
          )}
        </div>
      </main>

      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Search modules or jump to any feature..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => { setCmdOpen(false); handleRunCycle(); }}><Play className="mr-2 h-4 w-4" /><span>Run Cycle Now</span></CommandItem>
            <CommandItem onSelect={() => { setCmdOpen(false); handleRefresh(); }}><RefreshCw className="mr-2 h-4 w-4" /><span>Refresh Dashboard</span></CommandItem>
          </CommandGroup>
          <CommandGroup heading="Navigate to Module">
            {NAV_ITEMS.map((item) => (
              <CommandItem key={item.id} onSelect={() => { setCmdOpen(false); setActiveNav(item.id); }}>
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: string }) {
  const c: Record<string, string> = { slate: 'text-slate-300', amber: 'text-amber-400', red: 'text-red-400', emerald: 'text-emerald-400' };
  return (<div className="flex flex-col items-end text-right"><span className={`text-base font-bold leading-none ${c[tone]}`}>{value}</span><span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span></div>);
}

function ModuleRouter({ activeNav, overview, liveSnapshot, connected, history, onRefresh, onRunCycle, status, prefs, uptime }: any) {
  const props = { overview, liveSnapshot, connected, history, onRefresh, onRunCycle, status, prefs, uptime };
  switch (activeNav) {
    case 'overview': return <OverviewView {...props} />;
    case 'live': return <LiveView snapshot={liveSnapshot} connected={connected} history={history} />;
    case 'infrastructure': return <InfrastructureView overview={overview} />;
    case 'anomalies': return <AnomaliesView />;
    case 'security': return <SecurityEventsView />;
    case 'threats': return <ThreatsView />;
    case 'incidents': return <IncidentsView />;
    case 'attack-paths': return <AttackPathsView />;
    case 'audit-trail': return <AuditTrailView />;
    case 'ai-gateway': return <AIGatewayView />;
    case 'ocsf-events': return <OCSFEventsView />;
    case 'knowledge-graph': return <KnowledgeGraphView />;
    case 'risk-hierarchy': return <RiskHierarchyView />;
    case 'predictive-security': return <PredictiveSecurityView />;
    case 'what-if': return <WhatIfView />;
    case 'threat-hunt': return <ThreatHuntView />;
    case 'assets': return <AssetsView />;
    case 'nist-csf': return <NistCsfView />;
    case 'ai-chat': return <AIChatView />;
    case 'rag': return <RAGView />;
    case 'agents': return <AgentsView />;
    case 'ai-evaluation': return <AIEvaluationView />;
    case 'adversarial-tests': return <AdversarialTestsView />;
    case 'platform-health': return <PlatformHealthView />;
    case 'integrations': return <IntegrationsView />;
    case 'rbac': return <RBACView />;
    case 'policy': return <PolicyCompilerView />;
    case 'recovery': return <BackupRecoveryView />;
    case 'reports': return <ReportsView />;
    case 'settings': return <SettingsView status={status} />;
    default: return <OverviewView {...props} />;
  }
}

// === OVERVIEW === (matches uploaded InfraMind design: KPIs + Inject Load panel + semicircular gauges)
function OverviewView({ overview, liveSnapshot, connected, history, onRefresh, onRunCycle, status, prefs, uptime }: any) {
  const stats = overview?.stats || {}; const cycle = overview?.cycleStatus || {};
  const sources = status?.sources || {};
  const [injecting, setInjecting] = useState<string | null>(null);
  const [injectToast, setInjectToast] = useState<string | null>(null);
  const [autoCycle, setAutoCycle] = useState(cycle.autoCycleEnabled);

  // Trigger a load injection — calls /api/v1/load with type + duration, then auto-runs a cycle 8s later
  const triggerLoad = async (type: 'cpu' | 'memory' | 'disk' | 'network', durationMin: string) => {
    const mins = Number(durationMin);
    setInjecting(type);
    setInjectToast(`Injecting ${type.toUpperCase()} load for ${mins} min...`);
    try {
      const r = await postJSON('/api/v1/load', { type, host: 'localhost', intensity: 0.85, durationMin: mins });
      setInjectToast(`${type.toUpperCase()} load active: ${r.description}. ${r.expectedImpact}`);
      setTimeout(() => { onRunCycle(); }, 8000);
    } catch (e: any) {
      setInjectToast(`Load injection failed: ${e.message}`);
    } finally {
      setTimeout(() => setInjectToast(null), 6000);
      setInjecting(null);
    }
  };

  // Auto-cycle toggle
  const toggleAutoCycle = async () => {
    const action = autoCycle ? 'auto-stop' : 'auto-start';
    await postJSON('/api/v1/cron', { action, intervalMs: 60000 });
    setAutoCycle(!autoCycle);
  };

  const sys = liveSnapshot?.system || {};
  const healthScore = stats.hosts ? Math.max(20, 100 - (stats.openIncidents * 5) - (stats.activeAnomalies * 2)) : 95;

  return (<div className="space-y-6">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div><h2 className="text-xl font-bold">Platform Overview</h2><p className="text-sm text-slate-400">Real-time infrastructure health, security posture, and AI operations.</p></div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={connected ? 'default' : 'secondary'} className="gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
          {connected ? 'LIVE /proc' : 'POLLING'}
        </Badge>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        <Button size="sm" onClick={onRunCycle} className="gap-2" style={{ background: prefs.accentColor }}><Play className="h-3.5 w-3.5" /> Run SRE Cycle</Button>
        <Button size="sm" variant={autoCycle ? 'default' : 'outline'} onClick={toggleAutoCycle} className="gap-2">
          <Zap className="h-3.5 w-3.5" /> {autoCycle ? 'Stop Auto-Cycle' : 'Start Auto-Cycle (60s)'}
        </Button>
      </div>
    </div>

    {/* Top KPI cards row (matches uploaded photo) */}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard icon={Server} label="Hosts" value={stats.hosts || 1} tone="emerald" />
      <StatCard icon={Container} label="Containers" value={stats.containers || 0} tone="cyan" subValue={`${stats.containers || 0} healthy`} />
      <StatCard icon={Siren} label="Open Incidents" value={stats.openIncidents || 0} tone="amber" subValue={`0 critical`} />
      <StatCard icon={AlertTriangle} label="Active Anomalies" value={stats.activeAnomalies || 0} tone="purple" subValue={`${stats.memoryLeaks || 0} leaks`} />
      <StatCard icon={Bug} label="Recommendations" value={stats.recommendations || 0} tone="orange" />
      <StatCard icon={TrendingUp} label="Forecast Points" value={stats.forecastPoints || 0} tone="cyan" />
    </div>

    {/* Inject Load panel (matches uploaded photo) */}
    <Card className="bg-slate-900/60 border-slate-800 border-amber-500/20">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Inject Load</CardTitle>
        <p className="text-[11px] text-slate-500">Spawns real worker processes — generates incidents & anomalies visible in the gauges below.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <LoadInjector label="CPU" color="orange" onInject={(dur) => triggerLoad('cpu', dur)} disabled={!!injecting} />
          <LoadInjector label="Memory" color="emerald" onInject={(dur) => triggerLoad('memory', dur)} disabled={!!injecting} />
          <LoadInjector label="Disk" color="purple" onInject={(dur) => triggerLoad('disk', dur)} disabled={!!injecting} />
          <LoadInjector label="Network" color="cyan" onInject={(dur) => triggerLoad('network', dur)} disabled={!!injecting} />
        </div>
        {injectToast && <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">{injectToast}</div>}
        {injecting && <div className="mt-2 text-[10px] text-slate-500">Currently injecting: <span className="text-amber-400 font-medium">{injecting.toUpperCase()}</span> — watch the gauges react.</div>}
      </CardContent>
    </Card>

    {/* Semi-circular gauges row (matches uploaded photo) */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SemiGauge label="Avg CPU" value={sys.cpuPercent ?? 0} unit="%" color="#f97316" max={100} />
      <SemiGauge label="Avg Disk" value={sys.diskPercent ?? 0} unit="%" color="#a855f7" max={100} />
      <SemiGauge label="Health Score" value={healthScore} unit="/100" color="#10b981" max={100} />
    </div>

    {/* Secondary metrics: memory + network */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <GaugeCard icon={Cpu} title="CPU" value={sys.cpuPercent ?? 0} unit="%" tone="orange" history={history.map((h: any) => h.cpu)} />
      <GaugeCard icon={Server} title="Memory" value={sys.memoryPercent ?? 0} unit="%" tone="emerald" history={history.map((h: any) => h.memory)} />
      <GaugeCard icon={DatabaseBackup} title="Disk IO" value={(sys.diskReadMBps ?? 0) + (sys.diskWriteMBps ?? 0)} unit="MB/s" tone="purple" history={history.map((h: any) => h.disk)} />
      <GaugeCard icon={Wifi} title="Net RX+TX" value={(sys.netRxMbps ?? 0) + (sys.netTxMbps ?? 0)} unit="Mbps" tone="cyan" history={history.map((h: any) => h.cpu)} />
    </div>

    {/* Recent incidents + Platform status */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Siren className="h-4 w-4 text-amber-400" /> Recent Incidents</CardTitle></CardHeader><CardContent>{overview?.recentIncidents?.length === 0 ? <p className="text-sm text-slate-500 py-4 text-center">No open incidents — all systems nominal.</p> : <div className="space-y-2 max-h-72 overflow-y-auto custom-scroll">{overview?.recentIncidents?.slice(0, 8).map((inc: any) => (<div key={inc.id} className="flex items-start gap-3 p-2 rounded-md bg-slate-800/40 border border-slate-800"><Badge variant={inc.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">{inc.severity}</Badge><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{inc.affected}</div><div className="text-[11px] text-slate-500 truncate">{inc.reason}</div></div><Badge variant="outline" className="text-[10px]">{inc.type}</Badge></div>))}</div>}</CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-400" /> Platform Status</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
        <div className="flex items-center justify-between p-2 rounded-md" style={{ background: 'var(--app-active)', border: '1px solid var(--app-active-border)' }}>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4" style={{ color: prefs.accentColor }} /><span className="text-slate-300">Platform Uptime</span></div>
          <span className="font-mono font-bold" style={{ color: prefs.accentColor }}>{uptime}</span>
        </div>
        <Row label="Hostname" value={status?.hostname || '—'} />
        <Row label="Platform" value={`${status?.platform || '—'} (${status?.arch || '—'})`} />
        <Row label="Auto-Cycle" value={<Badge variant={autoCycle ? 'default' : 'secondary'} className="text-[10px]">{autoCycle ? `ON · ${Math.round((cycle.autoCycleIntervalMs || 60000) / 1000)}s` : 'OFF'}</Badge>} />
        <Row label="Cycles Run" value={cycle.autoCycleCount || 0} />
        <Row label="Last Cycle" value={cycle.lastRun ? new Date(cycle.lastRun).toLocaleTimeString() : '—'} />
        <div className="pt-2 border-t border-slate-800 space-y-1.5">
          <div className="text-[10px] uppercase text-slate-500 tracking-wider">Data Sources</div>
          <div className="grid grid-cols-2 gap-1.5">
            <ConnectionStatus label="System (/proc)" active={sources.system} icon={Cpu} />
            <ConnectionStatus label="Docker" active={sources.docker} icon={Container} />
            <ConnectionStatus label="Kubernetes" active={sources.kubernetes} icon={Cloud} />
            <ConnectionStatus label="Logs" active={sources.logs} icon={FileText} />
            <ConnectionStatus label="Processes" active={sources.processes} icon={Activity} />
            <ConnectionStatus label="Live Stream" active={connected} icon={Radio} />
          </div>
        </div>
      </CardContent></Card>
    </div>
  </div>);
}

// LoadInjector component (matches uploaded photo: label + dropdown + Inject button)
function LoadInjector({ label, color, onInject, disabled }: { label: string; color: string; onInject: (dur: string) => void; disabled: boolean }) {
  const [dur, setDur] = useState('2');
  const colorMap: Record<string, { bg: string; border: string; text: string; btn: string }> = {
    orange:  { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', btn: 'bg-orange-600 hover:bg-orange-500' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500' },
    purple:  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', btn: 'bg-purple-600 hover:bg-purple-500' },
    cyan:    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', btn: 'bg-cyan-600 hover:bg-cyan-500' },
  };
  const c = colorMap[color] || colorMap.orange;
  return (
    <div className={`rounded-md border p-3 ${c.bg} ${c.border}`}>
      <div className={`text-sm font-semibold mb-2 ${c.text}`}>{label}</div>
      <div className="flex items-center gap-2">
        <Select value={dur} onValueChange={setDur}>
          <SelectTrigger className="h-8 text-xs flex-1 bg-slate-950 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 min</SelectItem>
            <SelectItem value="2">2 min</SelectItem>
            <SelectItem value="5">5 min</SelectItem>
            <SelectItem value="10">10 min</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className={`h-8 text-xs text-white ${c.btn}`} onClick={() => onInject(dur)} disabled={disabled}>
          <Zap className="h-3 w-3 mr-1" /> Inject
        </Button>
      </div>
    </div>
  );
}

// SemiGauge component (matches uploaded photo: semicircular arc + value in center)
function SemiGauge({ label, value, unit, color, max = 100 }: { label: string; value: number; unit: string; color: string; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = 80;
  const circumference = Math.PI * radius; // semi-circle
  const offset = circumference - (pct / 100) * circumference;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardContent className="p-4 flex flex-col items-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{label}</div>
        <svg viewBox="0 0 200 110" className="w-full max-w-[260px]">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          {/* Value text */}
          <text
            x="100"
            y="95"
            textAnchor="middle"
            className="text-3xl font-bold"
            fill={color}
            style={{ fontSize: '28px', fontWeight: 700 }}
          >
            {typeof value === 'number' ? value.toFixed(1) : value}
          </text>
          <text
            x="100"
            y="112"
            textAnchor="middle"
            fill="#64748b"
            style={{ fontSize: '10px' }}
          >
            {label.replace('Avg ', '').replace(' Score', '')}
          </text>
        </svg>
        <div className="text-[10px] text-slate-500 mt-1">{unit}</div>
      </CardContent>
    </Card>
  );
}

function ConnectionStatus({ label, active, icon: Icon }: any) {
  const accentColor = '#10b981'; // fallback - the accent is applied via CSS variables elsewhere
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded" style={{ background: active ? 'rgba(16,185,129,0.05)' : 'rgba(100,116,139,0.05)' }}>
      <Icon className="h-3 w-3" style={{ color: active ? accentColor : '#64748b' }} />
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`ml-auto h-1.5 w-1.5 rounded-full ${active ? 'animate-pulse' : ''}`} style={{ background: active ? '#10b981' : '#64748b' }} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, subValue }: any) {
  const c: Record<string, string> = { emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20', purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20', red: 'text-red-400 bg-red-500/10 border-red-500/20', orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
  return (<div className={`rounded-lg border p-3 ${c[tone] || c.emerald}`}><div className="flex items-center justify-between"><Icon className="h-4 w-4" /><CircleDot className="h-2 w-2 opacity-50" /></div><div className="mt-2"><div className="text-2xl font-bold leading-none">{value}</div>{subValue && <div className="text-[10px] text-slate-400 mt-0.5">{subValue}</div>}<div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{label}</div></div></div>);
}

function GaugeCard({ icon: Icon, title, value, unit, tone, history }: any) {
  const pct = unit === '%' ? Math.min(100, value) : Math.min(100, value / 5);
  const colors: Record<string, string> = { orange: '#f97316', emerald: '#10b981', purple: '#a855f7', cyan: '#06b6d4' };
  const precision = unit === 'Mbps' || unit === 'MB/s' ? 2 : 1;
  return (<Card className="bg-slate-900/60 border-slate-800"><CardContent className="p-4"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-slate-400" /><span className="text-sm font-medium">{title}</span></div><div className="text-right"><span className="text-xl font-bold">{typeof value === 'number' ? value.toFixed(precision) : value}</span><span className="text-[10px] text-slate-500 ml-1">{unit}</span></div></div><Progress value={pct} className="h-1.5 mb-2" /><div className="h-12">{history?.length > 1 && (<ResponsiveContainer width="100%" height="100%"><AreaChart data={history.map((v: any, i: number) => ({ i, v }))}><defs><linearGradient id={`g-${title}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[tone]} stopOpacity={0.6} /><stop offset="100%" stopColor={colors[tone]} stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="v" stroke={colors[tone]} strokeWidth={1.5} fill={`url(#g-${title})`} /></AreaChart></ResponsiveContainer>)}</div></CardContent></Card>);
}

function Row({ label, value }: { label: string; value: any }) { return (<div className="flex items-center justify-between"><span className="text-slate-400">{label}</span><span className="text-slate-200 font-medium">{value}</span></div>); }

// === LIVE MONITOR ===
function LiveView({ snapshot, connected, history }: any) {
  if (!snapshot) return <div className="flex items-center justify-center h-64 text-slate-500"><Activity className="h-5 w-5 animate-pulse mr-2" /> Waiting for data...</div>;
  const sys = snapshot.system || {};
  return (<div className="space-y-6">
    <div className="flex items-center gap-2"><Activity className={`h-4 w-4 ${connected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} /><span className="text-sm font-medium">{connected ? 'Connected' : 'Disconnected'}</span><Badge variant="outline" className="text-[10px]">Polling 3s</Badge><span className="text-xs text-slate-500 ml-auto">{snapshot.ts ? new Date(snapshot.ts).toLocaleTimeString() : '—'} · {snapshot.host}</span></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><GaugeCard icon={Cpu} title="CPU" value={sys.cpuPercent} unit="%" tone="orange" history={history.map((h: any) => h.cpu)} /><GaugeCard icon={Server} title="Memory" value={sys.memoryPercent} unit="%" tone="emerald" history={history.map((h: any) => h.memory)} /><GaugeCard icon={DatabaseBackup} title="Disk" value={sys.diskPercent} unit="%" tone="purple" history={history.map((h: any) => h.disk)} /><GaugeCard icon={Wifi} title="Net RX" value={sys.netRxMbps} unit="Mbps" tone="cyan" history={history.map((h: any) => h.cpu)} /></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Top Processes (by CPU)</CardTitle></CardHeader><CardContent>{(snapshot.processes || []).length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No processes available.</p> : <table className="w-full text-xs"><thead><tr className="text-slate-400 border-b border-slate-800"><th className="text-left py-2 px-2">PID</th><th className="text-left py-2 px-2">Name</th><th className="text-right py-2 px-2">CPU %</th><th className="text-right py-2 px-2">Memory (MB)</th></tr></thead><tbody>{(snapshot.processes || []).map((p: any, i: number) => (<tr key={i} className="border-b border-slate-800/60"><td className="py-2 px-2 text-slate-300">{p.pid}</td><td className="py-2 px-2 font-mono">{p.name}</td><td className="py-2 px-2 text-right"><span className={p.cpuPercent > 50 ? 'text-amber-400' : 'text-slate-300'}>{p.cpuPercent?.toFixed(1)}%</span></td><td className="py-2 px-2 text-right text-slate-300">{p.memoryMB}</td></tr>))}</tbody></table>}</CardContent></Card>
  </div>);
}

// === INFRASTRUCTURE ===
function InfrastructureView({ overview }: any) {
  const [health, setHealth] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [host, setHost] = useState('');
  const [metric, setMetric] = useState('cpu');
  const [range, setRange] = useState('1h');
  useEffect(() => {
    api('/api/v1/health').then(setHealth).catch(() => {});
    const t = setInterval(() => api('/api/v1/health').then(setHealth).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (overview?.hosts?.length > 0 && !host) setHost(overview.hosts[0]);
  }, [overview]);
  useEffect(() => {
    if (!host) return;
    api('/api/v1/metrics?host=' + encodeURIComponent(host) + '&metric=' + metric + '&range=' + range + '&limit=500').then(d => setMetrics(d.points || [])).catch(() => {});
    const t = setInterval(() => api('/api/v1/metrics?host=' + encodeURIComponent(host) + '&metric=' + metric + '&range=' + range + '&limit=500').then(d => setMetrics(d.points || [])), 10000);
    return () => clearInterval(t);
  }, [host, metric, range]);
  const chartData = metrics.map((p: any) => ({ ts: new Date(p.ts).toLocaleTimeString(), value: p.value }));
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold">Infrastructure Health</h2><p className="text-sm text-slate-400">Host health scores, risk predictions, capacity forecasts, and real-time metrics.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {health?.hosts?.length === 0 ? <Card className="bg-slate-900/60 border-slate-800 md:col-span-3"><CardContent className="p-4 text-center text-slate-500 text-sm">No host health data yet. Run a cycle to compute.</CardContent></Card> :
        health?.hosts?.map((h: any) => (<Card key={h.host} className="bg-slate-900/60 border-slate-800"><CardContent className="p-3"><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium truncate">{h.host}</span><Badge variant={h.health?.score > 70 ? 'default' : h.health?.score > 50 ? 'secondary' : 'destructive'} className="text-[10px]">{h.health?.score?.toFixed(0) || '—'}/100</Badge></div><Progress value={h.health?.score || 0} className="h-1.5 mb-2" /><div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500"><span>CPU {h.health?.cpu?.toFixed(0) || '—'}</span><span>MEM {h.health?.memory?.toFixed(0) || '—'}</span><span>DISK {h.health?.disk?.toFixed(0) || '—'}</span></div><div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]"><span className="text-slate-500">Risk:</span><div className="flex items-center gap-1"><span className="font-mono text-slate-400">{h.risk ? (h.risk.probability * 100).toFixed(1) + '%' : '—'}</span>{h.risk && <Badge variant={h.risk.level === 'high' ? 'destructive' : h.risk.level === 'medium' ? 'default' : 'secondary'} className="text-[9px]">{h.risk.level}</Badge>}</div></div></CardContent></Card>))
      }
    </div>
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader><CardTitle className="text-sm">Time Series Explorer</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select value={host} onValueChange={setHost}><SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Select host" /></SelectTrigger><SelectContent>{(overview?.hosts || []).map((h: string) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select>
          <Select value={metric} onValueChange={setMetric}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['cpu', 'memory', 'memory_percent', 'disk', 'disk_io', 'network_rx', 'network_tx', 'load1'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          <Select value={range} onValueChange={setRange}><SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['15m', '1h', '6h', '24h', '7d'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        </div>
        {chartData.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">No data. Run a cycle to collect metrics.</p> :
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="ts" stroke="#475569" fontSize={10} tickLine={false} interval="preserveStartEnd" /><YAxis stroke="#475569" fontSize={10} tickLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px' }} /><Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#metricGrad)" /></AreaChart></ResponsiveContainer></div>
        }
      </CardContent>
    </Card>
  </div>);
}

// === ANOMALIES ===
function AnomaliesView() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [remediating, setRemediating] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<string, any>>({});
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [executingStep, setExecutingStep] = useState<string | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, any>>({});
  const fetch = async () => { try { const d = await api('/api/v1/anomalies?resolved=false&limit=100'); setAnomalies(d.anomalies || []); } catch {} finally { setLoading(false); } };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, []);
  const handleRemediate = async (id: string) => {
    setRemediating(id); setExpandedPlan(id);
    try {
      const r = await postJSON(`/api/v1/anomalies/remediate`, { anomalyId: id });
      if (r.ok) {
        setPlans(prev => ({ ...prev, [id]: r.plan }));
      }
    } catch (e: any) {
      setPlans(prev => ({ ...prev, [id]: { summary: 'Failed to generate plan', rootCauseAnalysis: e.message, steps: [], error: true } }));
    } finally { setRemediating(null); }
  };
  const handleExecuteStep = async (anomalyId: string, stepNum: number) => {
    const stepKey = `${anomalyId}-${stepNum}`;
    setExecutingStep(stepKey);
    try {
      const r = await postJSON(`/api/v1/anomalies/remediate`, { anomalyId, executeStep: stepNum });
      setStepResults(prev => ({ ...prev, [stepKey]: r }));
    } catch (e: any) {
      setStepResults(prev => ({ ...prev, [stepKey]: { ok: false, error: e.message } }));
    } finally { setExecutingStep(null); }
  };
  const byAlgo = anomalies.reduce((a: any, an) => { a[an.algorithm] = (a[an.algorithm] || 0) + 1; return a; }, {});
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" /> Anomalies <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Brain className="h-3 w-3" /> AI Remediation</Badge></h2><p className="text-sm text-slate-400">LLM-powered remediation plans with executable steps via AI Gateway.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><StatCard icon={AlertTriangle} label="Active" value={anomalies.length} tone="amber" /><StatCard icon={AlertCircle} label="Critical" value={anomalies.filter(a => a.severity === 'critical').length} tone="red" /><StatCard icon={Activity} label="IF" value={byAlgo['isolation_forest'] || 0} tone="cyan" /><StatCard icon={Activity} label="DBSCAN" value={byAlgo['dbscan'] || 0} tone="purple" /><StatCard icon={Activity} label="Mem Leak" value={byAlgo['memory_leak'] || 0} tone="red" /></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Active Anomalies ({anomalies.length}) — click "AI Remediate" for a real LLM-generated plan</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : anomalies.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No active anomalies — all systems nominal.</p> : <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scroll">{anomalies.map(a => (<div key={a.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{a.severity}</Badge><Badge variant="outline" className="text-[10px]">{a.algorithm}</Badge><span className="text-xs font-medium">{a.host}/{a.metric}</span><span className="text-[10px] text-slate-500 ml-auto">{new Date(a.ts).toLocaleString()}</span></div><div className="text-xs text-slate-400">value <span className="text-slate-200 font-mono">{a.value.toFixed(2)}</span> vs expected <span className="text-slate-200 font-mono">{a.expected?.toFixed(2) || '?'}</span></div><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleRemediate(a.id)} disabled={remediating === a.id}><Brain className="h-3 w-3" />{remediating === a.id ? 'Generating...' : 'AI Remediate'}</Button>{plans[a.id] && <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setExpandedPlan(expandedPlan === a.id ? null : a.id)}>{expandedPlan === a.id ? 'Hide' : 'Show'} Plan</Button>}</div>{expandedPlan === a.id && plans[a.id] && (<div className="mt-3 space-y-3"><div className="p-2 rounded bg-slate-900/40 border border-slate-700"><div className="text-[10px] uppercase text-slate-500 mb-1">Summary</div><div className="text-xs text-slate-200">{plans[a.id].summary}</div></div><div className="p-2 rounded bg-slate-900/40 border border-slate-700"><div className="text-[10px] uppercase text-slate-500 mb-1">Root Cause Analysis</div><div className="text-xs text-slate-300">{plans[a.id].rootCauseAnalysis}</div>{plans[a.id].llmFallback && <Badge variant="outline" className="text-[9px] text-amber-400 mt-1">fallback plan</Badge>}</div>{plans[a.id].steps?.length > 0 && <div className="space-y-2">{plans[a.id].steps.map((s: any, i: number) => { const stepKey = `${a.id}-${s.step}`; const stepResult = stepResults[stepKey]; return (<div key={i} className="p-2 rounded bg-slate-900/40 border border-slate-700"><div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[9px]">Step {s.step}</Badge><Badge variant={s.risk === 'high' ? 'destructive' : s.risk === 'medium' ? 'default' : 'secondary'} className="text-[9px]">{s.risk} risk</Badge>{s.automated && <Badge variant="outline" className="text-[9px] text-emerald-400">automated</Badge>}{s.tool && <Badge variant="outline" className="text-[9px] text-cyan-400">tool: {s.tool}</Badge>}{stepResult && <Badge variant={stepResult.ok ? 'default' : 'destructive'} className={`text-[9px] ml-auto ${stepResult.ok ? 'bg-emerald-600' : ''}`}>{stepResult.ok ? '✓ executed' : '✗ failed'}</Badge>}</div><div className="text-xs text-slate-200">{s.action}</div>{s.command && <div className="text-[11px] text-amber-400 font-mono mt-1 p-1 rounded bg-slate-950">❯ {s.command}</div>}{s.tool && <Button size="sm" variant="outline" className="mt-2 h-6 text-[10px] gap-1" onClick={() => handleExecuteStep(a.id, s.step)} disabled={executingStep === stepKey || !s.automated}><Play className="h-3 w-3" />{executingStep === stepKey ? 'Executing...' : 'Execute via AI Gateway'}</Button>}{stepResult && stepResult.result && <div className="mt-1 text-[11px] text-slate-400">Result: {stepResult.result.message || JSON.stringify(stepResult.result.result || '').substring(0, 100)}</div>}</div>);})}</div>}{plans[a.id].knowledgeContext?.length > 0 && <div className="p-2 rounded bg-slate-900/40 border border-slate-700"><div className="text-[10px] uppercase text-slate-500 mb-1">Knowledge Context (RAG)</div>{plans[a.id].knowledgeContext.map((k: any, i: number) => <div key={i} className="text-[11px] text-slate-400">• {k.title} <span className="text-slate-600">[{k.source}] score: {k.score.toFixed(3)}</span></div>)}</div>}</div>)}</div>))}</div>}</CardContent></Card>
  </div>);
}

// === SECURITY EVENTS ===
function SecurityEventsView() {
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [createdIncidents, setCreatedIncidents] = useState<Record<string, boolean>>({});
  const fetch = async () => { try { const d = await api(`/api/v1/events?limit=100${filter !== 'all' ? '&classification=' + filter : ''}`); setEvents(d.events || []); } catch {} finally { setLoading(false); } };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, [filter]);
  const handleCreateIncident = async (e: any) => { await postJSON('/api/v1/incidents', { action: 'create_from_event', eventId: e.id, severity: e.threatScore >= 80 ? 'critical' : 'major', affected: `${e.host} (${e.eventType})`, reason: `Manual incident from event ${e.id.substring(0, 8)}`, recommendation: 'Investigate and apply containment' }); setCreatedIncidents(prev => ({ ...prev, [e.id]: true })); };

  // Chart data: events per hour (last 24h)
  const eventsPerHour = Array.from({ length: 24 }, (_, i) => {
    const hourStart = new Date(Date.now() - (23 - i) * 3600000);
    const hourEnd = new Date(hourStart.getTime() + 3600000);
    const count = events.filter(e => { const t = new Date(e.timestamp); return t >= hourStart && t < hourEnd; }).length;
    return { hour: `${hourStart.getHours()}:00`, count };
  });
  // Chart data: classification distribution
  const classData = ['ransomware', 'malicious', 'suspicious', 'benign'].map(c => ({ name: c, count: events.filter(e => e.classification === c).length }));
  // Chart data: severity distribution
  const sevData = [
    { name: '0-25', count: events.filter(e => e.threatScore < 25).length },
    { name: '25-50', count: events.filter(e => e.threatScore >= 25 && e.threatScore < 50).length },
    { name: '50-75', count: events.filter(e => e.threatScore >= 50 && e.threatScore < 75).length },
    { name: '75-100', count: events.filter(e => e.threatScore >= 75).length },
  ];

  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Shield className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Security Events</h2><p className="text-sm text-slate-400">Real endpoint telemetry processed through threat engine + policy compiler.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={Shield} label="Total" value={events.length} tone="cyan" />
      <StatCard icon={AlertCircle} label="Ransomware" value={events.filter(e => e.classification === 'ransomware').length} tone="red" />
      <StatCard icon={AlertTriangle} label="Suspicious" value={events.filter(e => e.classification === 'suspicious').length} tone="amber" />
      <StatCard icon={CheckCircle} label="Avg Score" value={events.length ? Math.round(events.reduce((a: number, e: any) => a + e.threatScore, 0) / events.length) : 0} tone="purple" />
    </div>
    <div className="flex gap-2 flex-wrap"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-48 h-8 text-xs"><Filter className="h-3 w-3" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Classifications</SelectItem><SelectItem value="ransomware">🔴 Ransomware</SelectItem><SelectItem value="malicious">🟠 Malicious</SelectItem><SelectItem value="suspicious">🟡 Suspicious</SelectItem><SelectItem value="benign">🟢 Benign</SelectItem></SelectContent></Select></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Events ({events.length})</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : events.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No events matching filter.</p> : <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scroll">{events.map(e => { let d: any = {}; try { d = JSON.parse(e.rawData); } catch {} return (<div key={e.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant={e.classification === 'ransomware' || e.classification === 'malicious' ? 'destructive' : e.classification === 'suspicious' ? 'default' : 'secondary'} className="text-[10px]">{e.classification}</Badge><span className="text-xs font-medium">{e.eventType}</span><span className="text-[10px] text-slate-500 ml-auto">score: {e.threatScore} · {new Date(e.timestamp).toLocaleString()}</span></div><div className="text-[11px] text-slate-400 font-mono">{d.name || d.file_path || d.dst_ip || d.key || 'event'}</div>{e.policyMatch && <Badge variant="outline" className="mt-1 text-[10px] text-emerald-400 border-emerald-500/30">{e.policyAction}</Badge>}{(e.classification === 'suspicious' || e.classification === 'malicious' || e.classification === 'ransomware') && !createdIncidents[e.id] && <Button size="sm" variant="outline" className="mt-2 h-7 text-[10px] gap-1" onClick={() => handleCreateIncident(e)}><Plus className="h-3 w-3" /> Create Incident</Button>}{createdIncidents[e.id] && <Badge variant="default" className="mt-2 text-[10px] bg-emerald-600">✓ Incident Created</Badge>}</div>); })}</div>}</CardContent></Card>
    {/* === Charts at the bottom === */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-400" /> Events per Hour (last 24h)</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={eventsPerHour}><CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 9 }} interval={2} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} /><Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} /><Bar dataKey="count" fill="#06b6d4" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><PieChart className="h-4 w-4 text-amber-400" /> Classification Distribution</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={classData} layout="vertical"><CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} /><Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} /><Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-purple-400" /> Threat Score Distribution</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={sevData}><CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} /><Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} /><Bar dataKey="count" fill="#a855f7" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
    </div>
  </div>);
}

// === THREATS ===
function ThreatsView() {
  const [threats, setThreats] = useState<any[]>([]);
  const [responded, setResponded] = useState<Record<string, any>>({});
  const [triggering, setTriggering] = useState<string | null>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  const [runningSingleTest, setRunningSingleTest] = useState<string | null>(null);
  const fetch = async () => { try { const d = await api('/api/v1/threats?limit=100'); setThreats(d.threats || []); } catch {} };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, []);
  useEffect(() => { api('/api/v1/threats/tests').then(d => setTests(d.tests || [])).catch(() => {}); }, []);
  const handleResponse = async (t: any) => { setTriggering(t.id); try { const action = t.severity === 'critical' || t.threatType === 'ransomware' ? 'isolate' : 'quarantine'; const r = await postJSON('/api/v1/response', { action, target: t.event?.host || 'unknown', threatId: t.id }); setResponded(prev => ({ ...prev, [t.id]: r })); await fetch(); } finally { setTriggering(null); } };
  const handleRunAllTests = async () => { setRunningTests(true); try { const r = await postJSON('/api/v1/threats/tests', {}); setTestResults(r.results || []); await fetch(); } finally { setRunningTests(false); } };
  const handleRunSingleTest = async (testId: string) => { setRunningSingleTest(testId); try { const r = await postJSON('/api/v1/threats/tests', { testId }); setTestResults(prev => { const filtered = prev.filter(t => t.id !== testId); return [r.results[0], ...filtered]; }); await fetch(); } finally { setRunningSingleTest(null); } };
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Bug className="h-5 w-5 text-red-400" /> Threat Detection <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Activity className="h-3 w-3" /> Live evaluation</Badge></h2><p className="text-sm text-slate-400">Real-time threat evaluation tests + active threats mapped to MITRE ATT&CK.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={Bug} label="Total" value={threats.length} tone="red" /><StatCard icon={AlertCircle} label="Critical" value={threats.filter(t => t.severity === 'critical').length} tone="red" /><StatCard icon={AlertTriangle} label="High" value={threats.filter(t => t.severity === 'high').length} tone="amber" /><StatCard icon={Shield} label="Contained" value={threats.filter(t => t.status === 'contained').length} tone="emerald" /></div>
    <Card className="bg-slate-900/60 border-slate-800 border-amber-500/30"><CardHeader><CardTitle className="text-sm flex items-center justify-between"><span className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-amber-400" /> Threat Evaluation Tests ({tests.length})</span><Button size="sm" onClick={handleRunAllTests} disabled={runningTests} className="gap-1" style={{ background: 'var(--app-accent)' }}><Zap className="h-3.5 w-3.5" />{runningTests ? 'Evaluating...' : 'Run All Tests'}</Button></CardTitle></CardHeader><CardContent>{testResults.length > 0 && <div className="grid grid-cols-4 gap-2 mb-3"><div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-center"><div className="text-xl font-bold text-red-400">{testResults.filter(r => r.status === 'active').length}</div><div className="text-[10px] text-slate-400 uppercase">Active</div></div><div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-center"><div className="text-xl font-bold text-amber-400">{testResults.filter(r => r.status === 'contained').length}</div><div className="text-[10px] text-slate-400 uppercase">Contained</div></div><div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-center"><div className="text-xl font-bold text-emerald-400">{testResults.filter(r => r.status === 'not_found').length}</div><div className="text-[10px] text-slate-400 uppercase">Clean</div></div><div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-center"><div className="text-xl font-bold text-cyan-400">{testResults.length}</div><div className="text-[10px] text-slate-400 uppercase">Total</div></div></div>}{testResults.length > 0 ? <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scroll">{testResults.map(r => (<div key={r.id} className={`p-3 rounded-md border ${r.status === 'active' ? 'bg-red-500/10 border-red-500/30' : r.status === 'contained' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/40 border-slate-800'}`}><div className="flex items-center gap-2 mb-1 flex-wrap"><Badge variant={r.status === 'active' ? 'destructive' : r.status === 'contained' ? 'default' : 'secondary'} className="text-[9px] uppercase">{r.status}</Badge><Badge variant="outline" className="text-[9px]">{r.category}</Badge>{r.mitreAttackId && <Badge variant="outline" className="text-[9px] text-cyan-400">{r.mitreAttackId}</Badge>}<span className="text-xs font-medium flex-1">{r.testName}</span><Button size="sm" variant="outline" className="h-6 text-[9px] gap-1" onClick={() => handleRunSingleTest(r.id)} disabled={runningSingleTest === r.id}><RefreshCw className="h-2.5 w-2.5" />{runningSingleTest === r.id ? '...' : 'Re-check'}</Button></div>{r.detected && <div className="text-[11px] text-slate-400 mb-1"><span className="text-slate-500">Evidence:</span> {r.evidence.join(', ').substring(0, 150)}</div>}<div className="text-[11px] text-emerald-400">→ {r.recommendedAction}</div></div>))}</div> : <div className="space-y-2">{tests.map(t => (<div key={t.id} className="p-2 rounded-md bg-slate-800/40 border border-slate-800 flex items-center gap-2"><Badge variant="outline" className="text-[9px]">{t.category}</Badge>{t.mitre && <Badge variant="outline" className="text-[9px] text-cyan-400">{t.mitre}</Badge>}<span className="text-xs flex-1">{t.testName}</span><Badge variant="outline" className="text-[9px]">{t.severity}</Badge><Button size="sm" variant="outline" className="h-6 text-[9px] gap-1" onClick={() => handleRunSingleTest(t.id)} disabled={runningSingleTest === t.id}><Play className="h-2.5 w-2.5" />{runningSingleTest === t.id ? '...' : 'Run'}</Button></div>))}</div>}</CardContent></Card>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Active Threats ({threats.length})</CardTitle></CardHeader><CardContent>{threats.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No active threats detected.</p> : <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scroll">{threats.map(t => (<div key={t.id} className="p-3 rounded-md bg-red-500/5 border border-red-500/20"><div className="flex items-center gap-2 mb-1"><Badge variant={t.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{t.severity}</Badge><span className="text-xs font-medium">{t.threatType}</span>{t.mitreAttackId && <Badge variant="outline" className="text-[10px]">{t.mitreAttackId}</Badge>}{t.status && <Badge variant={t.status === 'contained' ? 'default' : 'secondary'} className="text-[9px]">{t.status}</Badge>}<span className="text-[10px] text-slate-500 ml-auto">{(t.confidence * 100).toFixed(0)}%</span></div><p className="text-[11px] text-slate-400 mb-1">{t.description}</p><p className="text-[11px] text-emerald-400">→ {t.recommendedAction}</p>{responded[t.id] ? (<div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300"><CheckCircle className="h-3 w-3 inline mr-1" /> Response Executed: {responded[t.id].message?.substring(0, 100)}</div>) : (<Button size="sm" className="mt-2 h-7 text-[10px] gap-1" onClick={() => handleResponse(t)} disabled={triggering === t.id} style={{ background: 'var(--app-accent)' }}><Zap className="h-3 w-3" />{triggering === t.id ? 'Executing...' : 'Trigger Response'}</Button>)}</div>))}</div>}</CardContent></Card>
  </div>);
}

// === INCIDENTS ===
function IncidentsView() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('active');
  const fetch = async () => { try { const d = await api('/api/v1/incidents?limit=100'); setIncidents(d.incidents || []); } catch {} };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, []);
  const filtered = filter === 'all' ? incidents : filter === 'active' ? incidents.filter(i => i.status !== 'resolved') : incidents.filter(i => i.status === 'resolved');
  const handleAck = async (id: string) => { await postJSON('/api/v1/incidents', { action: 'acknowledge', id, author: 'soc-analyst' }); await fetch(); const u = await api('/api/v1/incidents?limit=100'); setSelected(u.incidents.find((i: any) => i.id === id) || null); };
  const handleResolve = async (id: string) => { await postJSON('/api/v1/incidents', { action: 'resolve', id, resolution: 'Resolved by SOC analyst' }); setSelected(null); await fetch(); };
  const handleAddNote = async (id: string) => { const note = (noteInputs[id] || '').trim(); if (!note) return; await postJSON('/api/v1/incidents', { action: 'addNote', id, author: 'soc-analyst', note }); setNoteInputs(prev => ({ ...prev, [id]: '' })); await fetch(); const u = await api('/api/v1/incidents?limit=100'); setSelected(u.incidents.find((i: any) => i.id === id) || null); };
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><Siren className="h-4 w-4 text-amber-400" /> Incidents</h2><p className="text-sm text-slate-400">Infrastructure + security incident management.</p></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-40 h-8 text-xs"><Filter className="h-3 w-3" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active Only</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="all">All</SelectItem></SelectContent></Select></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Incidents ({filtered.length})</CardTitle></CardHeader><CardContent>{filtered.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No incidents.</p> : <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scroll">{filtered.map(inc => (<button key={inc.id} onClick={() => setSelected(inc)} className={`w-full text-left p-3 rounded-md border ${selected?.id === inc.id ? 'bg-slate-800/80 border-emerald-500/40' : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/60'}`}><div className="flex items-center gap-2 mb-1"><Badge variant={inc.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{inc.severity}</Badge><Badge variant="outline" className="text-[10px]">{inc.status}</Badge><span className="text-[10px] text-slate-500 ml-auto">{new Date(inc.createdAt).toLocaleString()}</span></div><div className="text-xs font-medium truncate">{inc.affected}</div><div className="text-[11px] text-slate-400 line-clamp-1">{inc.reason}</div></button>))}</div>}</CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Incident Detail</CardTitle></CardHeader><CardContent>{!selected ? <p className="text-sm text-slate-500 text-center py-4">Select an incident.</p> : (<div className="space-y-3 text-xs"><div><div className="text-slate-500 uppercase text-[10px] mb-1">Affected</div><div className="font-medium">{selected.affected}</div></div><div><div className="text-slate-500 uppercase text-[10px] mb-1">Reason</div><div className="text-slate-300">{selected.reason}</div></div><div><div className="text-slate-500 uppercase text-[10px] mb-1">Work Notes</div><div className="space-y-1 max-h-24 overflow-y-auto custom-scroll">{(() => { try { const notes = JSON.parse(selected.workNotes || '[]'); return notes.length === 0 ? <div className="text-slate-500">No notes</div> : notes.map((n: any, i: number) => <div key={i} className="p-1.5 rounded bg-slate-800/40 text-[11px]"><div className="text-slate-300">{n.note}</div><div className="text-[10px] text-slate-500">{n.author} · {new Date(n.ts).toLocaleString()}</div></div>); } catch { return <div className="text-slate-500">No notes</div>; } })()}</div><Textarea key={selected.id} value={noteInputs[selected.id] || ''} onChange={(e) => setNoteInputs(prev => ({ ...prev, [selected.id]: e.target.value }))} placeholder="Add a work note..." className="mt-2 text-xs h-16" /><Button size="sm" variant="outline" className="w-full mt-1 text-xs" onClick={() => handleAddNote(selected.id)} disabled={!(noteInputs[selected.id] || '').trim()}>Add Note</Button></div><div className="flex gap-2 pt-2">{selected.status !== 'resolved' && <><Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleAck(selected.id)}><Check className="h-3 w-3" /> Ack</Button><Button size="sm" className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-500" onClick={() => handleResolve(selected.id)}><Check className="h-3 w-3" /> Resolve</Button><Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => handleResolve(selected.id)}><X className="h-3 w-3" /> Close</Button></>}</div></div>)}</CardContent></Card>
    </div>
  </div>);
}

// === ATTACK PATHS ===
function AttackPathsView() {
  const [paths, setPaths] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/api/v1/attack-paths').then(d => { setPaths(d.paths || []); setSelected(d.paths?.[0] || null); }).catch(() => {}).finally(() => setLoading(false));
    const t = setInterval(() => api('/api/v1/attack-paths').then(d => setPaths(d.paths || [])), 15000);
    return () => clearInterval(t);
  }, []);
  const KILL_CHAIN = [
    { name: 'Initial Access', icon: '🚪', tactic: 'initial_access' },
    { name: 'Execution', icon: '⚡', tactic: 'execution' },
    { name: 'Persistence', icon: '📌', tactic: 'persistence' },
    { name: 'Privilege Esc', icon: '⬆️', tactic: 'privilege_escalation' },
    { name: 'Lateral Movement', icon: '↔️', tactic: 'lateral_movement' },
    { name: 'Collection', icon: '📦', tactic: 'collection' },
    { name: 'Impact', icon: '💥', tactic: 'impact' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2"><GitBranch className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Attack Path Analysis</h2>
        <p className="text-sm text-slate-400">MITRE ATT&CK kill chain reconstruction from observed security events.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard icon={GitBranch} label="Total Paths" value={paths.length} tone="cyan" />
        <StatCard icon={AlertCircle} label="Critical" value={paths.filter(p => p.severity === 'critical').length} tone="red" />
        <StatCard icon={Shield} label="Contained" value={paths.filter(p => p.status === 'contained').length} tone="emerald" />
        <StatCard icon={Activity} label="Avg Confidence" value={paths.length > 0 ? Math.round(paths.reduce((a, p) => a + p.confidence, 0) / paths.length * 100) : 0} tone="purple" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 bg-slate-900/60 border-slate-800">
          <CardHeader><CardTitle className="text-sm">Attack Paths ({paths.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : paths.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No attack paths detected.</p> :
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">
                {paths.map(p => (
                  <button key={p.id} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-md border transition-colors ${selected?.id === p.id ? 'bg-slate-800/80 border-emerald-500/40' : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/60'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={p.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{p.severity}</Badge>
                      <span className="text-xs font-medium truncate">{p.host}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{p.evidenceCount}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-500">→ {p.killChainProgress} · {(p.confidence * 100).toFixed(0)}%</div>
                  </button>
                ))}
              </div>
            }
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 bg-slate-900/60 border-slate-800">
          <CardHeader><CardTitle className="text-sm">Kill Chain Progress</CardTitle></CardHeader>
          <CardContent>
            {!selected ? <p className="text-sm text-slate-500 text-center py-8">Select an attack path to view details.</p> : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={selected.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{selected.severity}</Badge>
                  <span className="text-sm font-medium">{selected.host}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">Confidence: {(selected.confidence * 100).toFixed(0)}% · {selected.evidenceCount} evidence points</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-2 custom-scroll">
                  {KILL_CHAIN.map((kc, i) => {
                    const reached = selected.techniques?.some((t: any) => t.tactic === kc.tactic) || i === 0;
                    const isCurrent = selected.killChainProgress === kc.tactic;
                    return (
                      <div key={i} className="flex items-center gap-1">
                        <div className={`p-2 rounded-md border min-w-[100px] text-center ${reached ? 'border-red-500/50 bg-red-500/10' : 'border-slate-800 bg-slate-800/40'} ${isCurrent ? 'ring-2 ring-amber-400' : ''}`}>
                          <div className="text-lg mb-1">{kc.icon}</div>
                          <div className="text-[10px] text-slate-400">{kc.name}</div>
                          {reached && <Badge variant="destructive" className="text-[9px] mt-1">DETECTED</Badge>}
                          {isCurrent && !reached && <Badge variant="outline" className="text-[9px] mt-1 text-amber-400 border-amber-500/30">CURRENT</Badge>}
                        </div>
                        {i < KILL_CHAIN.length - 1 && <div className={`h-0.5 w-3 ${reached ? 'bg-red-500' : 'bg-slate-700'}`} />}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] uppercase text-slate-500 tracking-wider">Techniques Detected</div>
                  {selected.techniques?.slice(0, 10).map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/40 border border-slate-800">
                      <Badge variant="outline" className="text-[10px]">{t.tactic}</Badge>
                      <span className="text-[11px] text-slate-300">{t.technique}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">{new Date(t.ts).toLocaleString()}</span>
                    </div>
                  )) || <div className="text-xs text-slate-500">No techniques data available.</div>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// === AUDIT TRAIL ===
function AuditTrailView() {
  const [events, setEvents] = useState<any[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const fetch = async () => { try { const d = await api('/api/v1/audit-trail?limit=100'); setEvents(d.events || []); setLastUpdate(new Date()); } catch {} finally { setLoading(false); } };
  useEffect(() => { fetch(); const t = setInterval(fetch, 5000); return () => clearInterval(t); }, []);  // 5s polling for real-time
  const handleVerify = async () => { setVerifying(true); try { const d = await api('/api/v1/audit-trail?action=verify'); setVerification(d); } finally { setVerifying(false); } };
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><ScrollText className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Immutable Audit Trail <Badge variant="outline" className="text-[10px] gap-1 ml-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Real-time</Badge></h2><p className="text-sm text-slate-400">Hash-chained audit events — tamper-evident record of all security operations. Updates every 5 seconds.</p></div><div className="flex items-center gap-2">{lastUpdate && <span className="text-[10px] text-slate-500">Updated {lastUpdate.toLocaleTimeString()}</span>}<Button size="sm" variant="outline" onClick={handleVerify} disabled={verifying} className="gap-1">{verifying ? 'Verifying...' : 'Verify Chain'}</Button></div></div>
    {verification && <Card className={`bg-slate-900/60 border-slate-800 ${verification.valid ? 'border-emerald-500/30' : 'border-red-500/30'}`}><CardContent className="p-4"><div className="flex items-center gap-2"><Badge variant={verification.valid ? 'default' : 'destructive'} className="text-[10px]">{verification.valid ? 'CHAIN INTACT' : 'CHAIN BROKEN'}</Badge><span className="text-sm">{verification.details}</span></div></CardContent></Card>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Audit Events ({events.length})</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : events.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No audit events yet. Execute a tool via AI Gateway or run a cycle.</p> : <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scroll">{events.map(e => (<div key={e.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[9px] font-mono">#{e.sequence}</Badge><Badge variant={e.result === 'SUCCESS' ? 'default' : e.result === 'FAILURE' ? 'destructive' : 'secondary'} className="text-[10px]">{e.result}</Badge><span className="text-xs font-medium">{e.action}</span><span className="text-[10px] text-slate-500 ml-auto">{new Date(e.ts).toLocaleString()}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]"><div><span className="text-slate-500">Actor:</span> <span className="text-slate-300 font-mono">{e.actor}</span></div><div><span className="text-slate-500">Target:</span> <span className="text-slate-300 font-mono">{e.target}</span></div>{e.threatScore !== null && <div><span className="text-slate-500">Threat:</span> <span className="text-amber-400">{e.threatScore}</span></div>}{e.autonomyLevel !== null && <div><span className="text-slate-500">Autonomy:</span> <span className="text-purple-400">L{e.autonomyLevel}</span></div>}</div><div className="flex items-center gap-3 mt-1 pt-1 border-t border-slate-800/60 text-[10px] text-slate-500"><span>prev: <span className="font-mono text-slate-600">{e.prevHash || 'genesis'}</span></span><span>hash: <span className="font-mono text-slate-400">{e.hash}</span></span></div></div>))}</div>}</CardContent></Card>
  </div>);
}

// === AI GATEWAY ===
function AIGatewayView() {
  const [tools, setTools] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const fetch = async () => { try { const [t, a] = await Promise.all([api('/api/v1/ai-gateway/tools'), api('/api/v1/ai-gateway/tools?view=approvals')]); setTools(t.tools || []); setApprovals(a.approvals || []); } catch {} finally { setLoading(false); } };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, []);
  const handleExecute = async (name: string) => { setExecuting(name); try { const r = await postJSON('/api/v1/ai-gateway/execute', { toolName: name, parameters: { target: 'demo-host' } }); setResult(r); await fetch(); } finally { setExecuting(null); } };
  const handleApprove = async (id: string, approved: boolean) => { await postJSON('/api/v1/ai-gateway/tools', { action: 'approve', executionId: id, approved, approver: 'soc-analyst' }); await fetch(); };
  const byCat = tools.reduce((a: any, t) => { if (!a[t.category]) a[t.category] = []; a[t.category].push(t); return a; }, {});
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Lock className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> AI Gateway + Tool Registry</h2><p className="text-sm text-slate-400">Controlled execution of AI-requested actions with permission checks, policy validation, and autonomy enforcement.</p></div>
    {approvals.length > 0 && <Card className="bg-amber-500/5 border-amber-500/30"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-400" /> Pending Approvals ({approvals.length})</CardTitle></CardHeader><CardContent><div className="space-y-2">{approvals.map(a => (<div key={a.id} className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20"><div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{a.toolName}</Badge><span className="text-xs">{a.agentName}</span><div className="ml-auto flex gap-2"><Button size="sm" className="h-7 text-[10px] bg-emerald-600" onClick={() => handleApprove(a.id, true)}>Approve</Button><Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => handleApprove(a.id, false)}>Reject</Button></div></div></div>))}</div></CardContent></Card>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Tool Registry ({tools.length} tools)</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : <div className="space-y-4">{Object.entries(byCat).map(([cat, tools]: any) => (<div key={cat}><div className="text-[10px] uppercase text-slate-500 mb-2">{cat}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{tools.map((t: any) => (<div key={t.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-medium">{t.name}</span>{t.requiresApproval && <Badge variant="outline" className="text-[9px] text-amber-400">approval</Badge>}<Badge variant="outline" className="text-[9px]">L{t.minAutonomyLevel}+</Badge><Button size="sm" variant="ghost" className="h-6 text-[10px] ml-auto" onClick={() => handleExecute(t.name)} disabled={executing === t.name}>{executing === t.name ? '...' : 'Run'}</Button></div><p className="text-[11px] text-slate-400">{t.description}</p><div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500"><span>Executions: {t.executions}</span></div></div>))}</div></div>))}</div>}</CardContent></Card>
    {result && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardContent className="p-4"><div className="text-xs font-medium mb-2">Execution Result</div><pre className="text-[11px] p-2 rounded bg-slate-950/60 border border-slate-800 overflow-x-auto">{JSON.stringify(result, null, 2).substring(0, 500)}</pre></CardContent></Card>}
  </div>);
}

// === OCSF EVENTS ===
function OCSFEventsView() {
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const fetch = async () => { try { const [e, s] = await Promise.all([api(`/api/v1/ocsf/events?limit=100${filter !== 'all' ? '&category=' + filter : ''}`), api('/api/v1/ocsf/events?stats=true')]); setEvents(e.events || []); setStats(s); } catch {} finally { setLoading(false); } };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, [filter]);
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Cloud className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> OCSF Unified Event Model</h2><p className="text-sm text-slate-400">All telemetry normalized to Open Cybersecurity Schema Framework.</p></div>
    {stats && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={Cloud} label="Total" value={stats.total} tone="cyan" /><StatCard icon={AlertCircle} label="Unprocessed" value={stats.unprocessed} tone="amber" /><StatCard icon={Activity} label="Categories" value={stats.byCategory?.length || 0} tone="emerald" /><StatCard icon={Wifi} label="Sources" value={stats.bySource?.length || 0} tone="purple" /></div>}
    <div className="flex gap-2 flex-wrap">{['all', 'process', 'network', 'file', 'authentication'].map(c => <Button key={c} size="sm" variant={filter === c ? 'default' : 'outline'} className="text-xs" onClick={() => setFilter(c)}>{c}</Button>)}</div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Normalized Events ({events.length})</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading...</p> : events.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No events. Run a cycle.</p> : <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scroll">{events.map(e => (<div key={e.id} className="p-2 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant={e.severity === 'critical' ? 'destructive' : e.severity === 'high' ? 'default' : 'secondary'} className="text-[10px]">{e.severity}</Badge><Badge variant="outline" className="text-[10px]">{e.category}</Badge><span className="text-xs font-mono">{e.activity}</span><span className="text-[10px] text-slate-500 ml-auto">{new Date(e.timestamp).toLocaleString()}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-[11px]">{e.deviceName && <div><span className="text-slate-500">Device:</span> <span className="text-slate-300">{e.deviceName}</span></div>}{e.processName && <div><span className="text-slate-500">Process:</span> <span className="text-slate-300">{e.processName}</span></div>}{e.dstIp && <div><span className="text-slate-500">Dst:</span> <span className="text-slate-300">{e.dstIp}:{e.dstPort}</span></div>}<div><span className="text-slate-500">Source:</span> <span className="text-cyan-400">{e.sourceType}</span></div></div></div>))}</div>}</CardContent></Card>
  </div>);
}

// === KNOWLEDGE GRAPH ===
function KnowledgeGraphView() {
  const [graph, setGraph] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/api/v1/graph').then(setGraph).catch(() => {}).finally(() => setLoading(false)); const t = setInterval(() => api('/api/v1/graph').then(setGraph), 15000); return () => clearInterval(t); }, []);
  const NODE_COLORS: Record<string, string> = { organization: '#fbbf24', host: '#06b6d4', process: '#10b981', file: '#a855f7', user: '#ec4899', network_endpoint: '#f97316', policy: '#84cc16', backup: '#22c55e' };
  const nodes = graph?.nodes || [];
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Network className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Knowledge Graph</h2><p className="text-sm text-slate-400">Real-time entity graph: hosts, processes, files, network, containers, controls.</p></div>
    {graph?.summary && <div className="grid grid-cols-4 gap-3"><StatCard icon={Network} label="Nodes" value={graph.summary.totalNodes} tone="cyan" /><StatCard icon={GitBranch} label="Edges" value={graph.summary.totalEdges} tone="emerald" /><StatCard icon={AlertCircle} label="High-Risk" value={graph.summary.highRisk} tone="red" /><StatCard icon={Activity} label="Types" value={Object.keys(graph.summary.byType || {}).length} tone="purple" /></div>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Graph Nodes ({nodes.length})</CardTitle></CardHeader><CardContent>{loading ? <p className="text-slate-500 text-center py-4">Loading graph...</p> : nodes.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No graph data. Run a cycle to build the graph.</p> : <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scroll">{nodes.map((n: any) => { const nodeColor = NODE_COLORS[n.nodeType] || '#94a3b8'; return (<div key={n.id} className="p-2 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: nodeColor }} /><Badge variant="outline" className="text-[10px]">{n.nodeType}</Badge><span className="text-xs font-medium truncate">{n.name}</span>{n.riskScore > 60 && <Badge variant="destructive" className="text-[9px] ml-auto">risk: {n.riskScore.toFixed(0)}</Badge>}</div>{n.host && <div className="text-[10px] text-slate-500 mt-0.5">host: {n.host}</div>}</div>); })}</div>}</CardContent></Card>
    <div className="grid grid-cols-4 gap-2">{Object.entries(NODE_COLORS).map(([type, c]) => <div key={type} className="flex items-center gap-1.5 text-[10px]"><span className="h-2 w-2 rounded-full" style={{ background: c }} /><span className="text-slate-400">{type}</span></div>)}</div>
  </div>);
}

// === RISK HIERARCHY ===
function RiskHierarchyView() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api('/api/v1/risk-hierarchy').then(setData).catch(() => {}); const t = setInterval(() => api('/api/v1/risk-hierarchy').then(setData), 15000); return () => clearInterval(t); }, []);
  if (!data) return <div className="text-slate-500 text-center py-12"><RefreshCw className="h-5 w-5 animate-pulse mx-auto mb-2" /> Loading risk hierarchy...</div>;
  const color = (l: string) => l === 'critical' ? '#ef4444' : l === 'high' ? '#f59e0b' : l === 'medium' ? '#eab308' : '#10b981';
  const items = [data.organization, data.security, data.infrastructure, data.recovery].filter(Boolean);
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Gauge className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Risk Hierarchy</h2><p className="text-sm text-slate-400">Multi-level risk scoring: organization → security → infrastructure → recovery.</p></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardContent className="p-4"><div className="text-center"><div className="text-6xl font-bold" style={{ color: color(data.organization.level) }}>{data.organization.score.toFixed(0)}<span className="text-2xl text-slate-500">/100</span></div><div className="text-sm text-slate-400 mt-2">Organization Risk</div></div><div className="mt-4 grid grid-cols-3 gap-3">{items.slice(1).map(r => <div key={r.scope} className="text-center p-3 rounded border" style={{ borderColor: `${color(r.level)}55`, background: `${color(r.level)}10` }}><div className="text-[10px] uppercase text-slate-500">{r.scope}</div><div className="text-2xl font-bold" style={{ color: color(r.level) }}>{r.score.toFixed(0)}</div><div className="text-[10px]" style={{ color: color(r.level) }}>{r.level}</div></div>)}</div></CardContent></Card>
  </div>);
}

// === PREDICTIVE SECURITY ===
function PredictiveSecurityView() {
  const [predictions, setPredictions] = useState<any[]>([]);
  useEffect(() => { api('/api/v1/predictive-security').then(d => setPredictions(d.predictions || [])).catch(() => {}); const t = setInterval(() => api('/api/v1/predictive-security').then(d => setPredictions(d.predictions || [])), 15000); return () => clearInterval(t); }, []);
  const META: Record<string, any> = { ransomware: { icon: AlertCircle, color: '#ef4444', label: 'Ransomware' }, infrastructure_failure: { icon: Activity, color: '#f59e0b', label: 'Infra Failure' }, backup_failure: { icon: DatabaseBackup, color: '#84cc16', label: 'Backup Failure' } };
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Predictive Security</h2><p className="text-sm text-slate-400">Probability forecasts for security incidents using logistic regression.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{predictions.map((p, i) => { const m = META[p.predictionType] || { icon: AlertCircle, color: '#94a3b8', label: p.predictionType }; const pct = Math.round(p.probability * 100); return (<Card key={i} className="bg-slate-900/60 border-slate-800"><CardContent className="p-4"><div className="flex items-center justify-between mb-3"><m.icon className="h-5 w-5" style={{ color: m.color }} /><div className="text-right"><div className="text-2xl font-bold" style={{ color: m.color }}>{pct}%</div><div className="text-[10px] text-slate-500">probability</div></div></div><Progress value={pct} className="h-1.5 mb-2" /><div className="flex items-center gap-2 text-[10px] text-slate-500"><Badge variant="outline">horizon: {p.horizon}</Badge><Badge variant="outline">confidence: {(p.confidence * 100).toFixed(0)}%</Badge></div><div className="mt-2 p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">{p.rationale}</div></CardContent></Card>); })}</div>
  </div>);
}

// === WHAT-IF SIMULATOR ===
function WhatIfView() {
  const [result, setResult] = useState<any>(null);
  const [simType, setSimType] = useState('isolate_host');
  const [target, setTarget] = useState('demo-host');
  const [running, setRunning] = useState(false);
  const handleRun = async () => { setRunning(true); try { const r = await postJSON('/api/v1/simulate', { simulationType: simType, targetName: target }); setResult(r.result); } finally { setRunning(false); } };
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><FlaskConical className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> What-If Simulator</h2><p className="text-sm text-slate-400">Simulate the impact of isolation, shutdown, blocking, or scaling actions.</p></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Configure Simulation</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-end gap-3"><div className="flex-1 min-w-[200px]"><label className="text-[10px] uppercase text-slate-500">Target</label><Input value={target} onChange={e => setTarget(e.target.value)} className="mt-1" /></div><div className="w-48"><label className="text-[10px] uppercase text-slate-500">Action</label><Select value={simType} onValueChange={setSimType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="isolate_host">Isolate Host</SelectItem><SelectItem value="shut_down_node">Shut Down Node</SelectItem><SelectItem value="block_process">Block Process</SelectItem><SelectItem value="quarantine_file">Quarantine File</SelectItem></SelectContent></Select></div><Button onClick={handleRun} disabled={running} className="gap-1" style={{ background: 'var(--app-accent)' }}><Zap className="h-3.5 w-3.5" />{running ? 'Simulating...' : 'Simulate'}</Button></div></CardContent></Card>
    {result && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardHeader><CardTitle className="text-sm">Simulation Result</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><div className="text-[10px] text-slate-500 uppercase">Affected</div><div className="text-2xl font-bold text-amber-400">{result.affectedCount}</div></div><div><div className="text-[10px] text-slate-500 uppercase">Risk Reduction</div><div className="text-2xl font-bold text-emerald-400">{(result.riskReduction * 100).toFixed(0)}%</div></div><div><div className="text-[10px] text-slate-500 uppercase">Business Impact</div><div className="text-2xl font-bold" style={{ color: result.businessImpact === 'critical' ? '#ef4444' : result.businessImpact === 'high' ? '#f59e0b' : '#10b981' }}>{result.businessImpact.toUpperCase()}</div></div><div><div className="text-[10px] text-slate-500 uppercase">Recovery Required</div><div className="text-2xl font-bold">{result.recoveryRequired ? 'YES' : 'NO'}</div></div></div><div className="mt-3 p-3 rounded text-sm" style={{ background: result.recommendation.startsWith('PROCEED') ? 'rgba(16,185,129,0.1)' : result.recommendation.startsWith('CONDITIONAL') ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: result.recommendation.startsWith('PROCEED') ? '#10b981' : result.recommendation.startsWith('CONDITIONAL') ? '#f59e0b' : '#ef4444' }}>{result.recommendation}</div></CardContent></Card>}
  </div>);
}

// === THREAT HUNT ===
function ThreatHuntView() {
  const [data, setData] = useState<any>(null);
  const [hunting, setHunting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [iocQuery, setIocQuery] = useState('');
  const [iocResults, setIocResults] = useState<any[]>([]);
  const [searchingIOC, setSearchingIOC] = useState(false);
  const fetch = async () => { try { const d = await api('/api/v1/threat-hunt'); setData(d); } catch {} };
  useEffect(() => { fetch(); const t = setInterval(fetch, 10000); return () => clearInterval(t); }, []);
  const handleHunt = async () => { setHunting(true); try { const r = await postJSON('/api/v1/threat-hunt', {}); setData(r); } finally { setHunting(false); } };
  const handleRunHypothesis = async (id: string) => { setRunningId(id); try { const r = await postJSON('/api/v1/threat-hunt', { hypothesisId: id }); setData((prev: any) => ({ ...prev, hypotheses: prev?.hypotheses?.map((h: any) => h.id === id ? r.hypothesis : h) })); } finally { setRunningId(null); } };
  const handleSearchIOC = async () => { if (!iocQuery.trim()) return; setSearchingIOC(true); try { const r = await api(`/api/v1/threat-hunt?action=ioc&type=ip&value=${encodeURIComponent(iocQuery)}`); setIocResults(r.evidence || []); } finally { setSearchingIOC(false); } };
  const lastHunt = data?.lastHunt;
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><Crosshair className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Threat Hunting <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Activity className="h-3 w-3" /> Real-time</Badge></h2><p className="text-sm text-slate-400">Proactive hypothesis-driven threat hunting with real DB queries + IOC extraction.</p></div><Button size="sm" onClick={handleHunt} disabled={hunting} className="gap-1" style={{ background: 'var(--app-accent)' }}><Zap className="h-3.5 w-3.5" />{hunting ? 'Hunting...' : 'Run Full Hunt'}</Button></div>
    {lastHunt && <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><StatCard icon={Crosshair} label="Status" value={lastHunt.status} tone={lastHunt.status === 'confirmed' ? 'red' : lastHunt.status === 'investigating' ? 'amber' : 'emerald'} /><StatCard icon={Activity} label="Confidence" value={`${(lastHunt.confidence * 100).toFixed(0)}%`} tone="cyan" /><StatCard icon={AlertCircle} label="Suspicious Events" value={lastHunt.suspiciousEvents} tone="red" /><StatCard icon={CheckCircle} label="Confirmed Threats" value={lastHunt.confirmedThreats || 0} tone="emerald" /><StatCard icon={ShieldAlert} label="IOCs Found" value={(lastHunt.iocsSummary?.totalIPs || 0) + (lastHunt.iocsSummary?.totalProcesses || 0) + (lastHunt.iocsSummary?.totalFiles || 0)} tone="purple" /></div>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center justify-between">Hypothesis Library <Badge variant="outline" className="text-[10px]">{data?.hypotheses?.length || 0} active</Badge></CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{data?.hypotheses?.map((h: any, i: number) => (<div key={h.id || i} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-start justify-between gap-2 mb-2"><div className="flex-1"><Badge variant={h.status === 'confirmed' ? 'destructive' : h.status === 'investigating' ? 'default' : 'secondary'} className="text-[10px] mb-1">{h.status || 'pending'}</Badge><Badge variant="outline" className="text-[10px] ml-1">{h.mitreTactic}</Badge><div className="text-xs font-medium mt-1">{h.hypothesis}</div><div className="text-[11px] text-slate-400 mt-1">{h.rationale}</div></div><Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 shrink-0" onClick={() => handleRunHypothesis(h.id)} disabled={runningId === h.id}><Play className="h-3 w-3" />{runningId === h.id ? '...' : 'Run'}</Button></div>{h.evidence && h.evidence.length > 0 && <div className="mt-2 pt-2 border-t border-slate-800"><div className="text-[10px] uppercase text-slate-500 mb-1">Evidence ({h.evidence.length})</div><div className="space-y-1 max-h-32 overflow-y-auto custom-scroll">{h.evidence.slice(0, 5).map((ev: any, j: number) => (<div key={j} className="text-[10px] text-slate-400 flex items-center gap-1"><Badge variant="outline" className="text-[9px]">{ev.mitre || 'N/A'}</Badge><span className="truncate">{ev.description.substring(0, 80)}</span></div>))}</div></div>}{h.iocs && (h.iocs.ips.length > 0 || h.iocs.processes.length > 0) && <div className="mt-2 flex flex-wrap gap-1">{h.iocs.ips.slice(0, 3).map((ip: string, j: number) => <Badge key={j} variant="destructive" className="text-[9px]">{ip}</Badge>)}{h.iocs.processes.slice(0, 3).map((p: string, j: number) => <Badge key={j} variant="outline" className="text-[9px]">{p}</Badge>)}</div>}</div>))}</div></CardContent></Card>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">IOC Search</CardTitle></CardHeader><CardContent><div className="flex gap-2"><Input value={iocQuery} onChange={e => setIocQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchIOC()} placeholder="Search by IP, process name, or file path..." /><Button onClick={handleSearchIOC} disabled={searchingIOC || !iocQuery.trim()} className="gap-1" size="sm" style={{ background: 'var(--app-accent)' }}><Search className="h-3.5 w-3.5" />{searchingIOC ? 'Searching...' : 'Search'}</Button></div>{iocResults.length > 0 && <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scroll">{iocResults.map((ev, i) => (<div key={i} className="p-2 rounded-md bg-slate-800/40 border border-slate-800 text-xs"><div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[9px]">{ev.mitre || 'N/A'}</Badge><span className="text-slate-300">{ev.host}</span><Badge variant={ev.classification === 'ransomware' ? 'destructive' : 'default'} className="text-[9px] ml-auto">{ev.classification}</Badge></div><div className="text-[11px] text-slate-400">{ev.description.substring(0, 120)}</div></div>))}</div>}</CardContent></Card>
    {lastHunt?.preventiveMeasures && lastHunt.preventiveMeasures.length > 0 && <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Preventive Recommendations ({lastHunt.preventiveMeasures.length})</CardTitle></CardHeader><CardContent><div className="p-2 rounded bg-purple-500/10 border border-purple-500/30"><ul className="space-y-1">{lastHunt.preventiveMeasures.map((m: string, i: number) => <li key={i} className="text-[11px] text-purple-200">• {m}</li>)}</ul></div></CardContent></Card>}
  </div>);
}

// === AI CHAT ===
function AIChatView() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { api('/api/v1/chat-history').then(d => { if (d.messages?.length) setMessages(d.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content }))); }).catch(() => {}); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  const send = async (text?: string) => { const msg = (text || input).trim(); if (!msg || sending) return; setInput(''); setSending(true); setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: msg }]); try { const r = await postJSON('/api/v1/ai/chat', { message: msg, history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })) }); setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: r.reply }]); } catch (e: any) { setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `Error: ${e.message}` }]); } finally { setSending(false); } };
  return (<div className="space-y-4">
    <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] gap-1"><Bot className="h-3 w-3 text-emerald-400" /> RAG-grounded</Badge><Badge variant="outline" className="text-[10px]">z-ai-web-dev-sdk</Badge></div>
    <Card className="bg-slate-900/60 border-slate-800 h-[calc(100vh-280px)] flex flex-col"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-emerald-400" /> InfraMind-SentinelX AI Assistant</CardTitle></CardHeader><CardContent className="flex-1 flex flex-col gap-3 overflow-hidden"><div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scroll">{messages.length === 0 ? <div className="text-center py-8 space-y-3"><Bot className="h-10 w-10 text-emerald-400 mx-auto opacity-50" /><p className="text-sm text-slate-400">Ask about infrastructure, threats, or security.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">{['What is the current platform status?', 'Show me active threats', 'Are there memory leaks?', 'Explain the ransomware playbook'].map(p => <button key={p} onClick={() => send(p)} className="text-left text-xs p-2 rounded-md bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 text-slate-300">{p}</button>)}</div></div> : messages.map(m => (<div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}><div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-cyan-500/20' : 'bg-emerald-500/20'}`}>{m.role === 'user' ? <Search className="h-3.5 w-3.5 text-cyan-400" /> : <Bot className="h-3.5 w-3.5 text-emerald-400" />}</div><div className={`inline-block text-left p-3 rounded-lg max-w-[80%] ${m.role === 'user' ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-slate-800/60 border border-slate-800'}`}><div className="text-sm whitespace-pre-wrap">{m.content}</div></div></div>))}{sending && <div className="flex gap-3"><div className="h-7 w-7 rounded-md bg-emerald-500/20 flex items-center justify-center"><RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin" /></div><div className="p-3 rounded-lg bg-slate-800/60 border border-slate-800"><span className="text-sm text-slate-400">Analyzing...</span></div></div>}</div><div className="flex gap-2"><Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about infrastructure, threats, incidents..." className="flex-1 text-sm resize-none" rows={2} disabled={sending} /><Button onClick={() => send()} disabled={sending || !input.trim()} style={{ background: 'var(--app-accent)' }}><Send className="h-4 w-4" /></Button></div></CardContent></Card>
  </div>);
}

// === RAG ===
function RAGView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ source: '', title: '', content: '' });
  const [ingesting, setIngesting] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answer, setAnswer] = useState('');
  const [generatingAnswer, setGeneratingAnswer] = useState(false);
  const fetchSources = async () => { try { const [s, d] = await Promise.all([api('/api/v1/rag/sources'), api('/api/v1/rag/ingest')]); setSources(s.sources || []); setDocs(d.documents || []); } catch {} };
  useEffect(() => { fetchSources(); }, []);
  const handleSearch = async () => { if (!query.trim()) return; setLoading(true); try { const r = await postJSON('/api/v1/rag/search', { query, topK: 5 }); setResults(r.results || []); } finally { setLoading(false); } };
  const handleSeed = async () => { setSeeding(true); try { await postJSON('/api/v1/rag/ingest', { action: 'seed' }); await fetchSources(); } finally { setSeeding(false); } };
  const handleIngest = async () => { if (!newDoc.title || !newDoc.content) return; setIngesting(true); try { await postJSON('/api/v1/rag/ingest', newDoc); setNewDoc({ source: '', title: '', content: '' }); setIngestOpen(false); await fetchSources(); } finally { setIngesting(false); } };
  const handleGenerateAnswer = async () => { if (!query.trim() || results.length === 0) return; setGeneratingAnswer(true); try { const r = await postJSON('/api/v1/ai/chat', { message: query, history: [] }); setAnswer(r.reply); setShowAnswer(true); } catch (e: any) { setAnswer(`Error: ${e.message}`); setShowAnswer(true); } finally { setGeneratingAnswer(false); } };
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> RAG Knowledge Base <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Brain className="h-3 w-3" /> Semantic + LLM rerank</Badge></h2><p className="text-sm text-slate-400">TF-IDF + stop-words + Porter stemmer + LLM semantic rerank over MITRE ATT&CK, ransomware playbooks, IR procedures.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setIngestOpen(!ingestOpen)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Ingest Doc</Button><Button size="sm" variant="outline" onClick={handleSeed} disabled={seeding} className="gap-1"><DatabaseBackup className="h-3.5 w-3.5" />{seeding ? 'Seeding...' : 'Seed KB'}</Button></div></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={BookOpen} label="Documents" value={docs.length} tone="cyan" /><StatCard icon={FileText} label="Total Chunks" value={docs.reduce((s: number, d: any) => s + (d.chunkCount || 0), 0)} tone="emerald" /><StatCard icon={Database} label="Sources" value={sources.length} tone="purple" /><StatCard icon={CheckCircle} label="Embedded" value={docs.filter((d: any) => d.embedded).length} tone="emerald" /></div>
    {sources.length > 0 && <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Sources</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{sources.map(s => <div key={s.source} className="p-2 rounded bg-slate-800/40 border border-slate-800"><div className="text-[10px] text-slate-500 uppercase truncate">{s.source}</div><div className="text-xl font-bold text-cyan-400">{s._count}</div></div>)}</div></CardContent></Card>}
    {ingestOpen && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardHeader><CardTitle className="text-sm">Ingest New Document</CardTitle></CardHeader><CardContent><div className="space-y-2"><Input value={newDoc.source} onChange={e => setNewDoc({ ...newDoc, source: e.target.value })} placeholder="Source (e.g. internal-runbook)" /><Input value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="Title" /><Textarea value={newDoc.content} onChange={e => setNewDoc({ ...newDoc, content: e.target.value })} placeholder="Document content..." rows={5} /><Button size="sm" onClick={handleIngest} disabled={ingesting || !newDoc.title || !newDoc.content} className="gap-1" style={{ background: 'var(--app-accent)' }}><Save className="h-3.5 w-3.5" />{ingesting ? 'Ingesting...' : 'Ingest + Rebuild Index'}</Button></div></CardContent></Card>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4 text-cyan-400" /> Knowledge Search <Badge variant="outline" className="text-[10px] ml-auto">TF-IDF + semantic + LLM rerank</Badge></CardTitle></CardHeader><CardContent><div className="flex gap-2"><Input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search: ransomware, MITRE T1486, hardening, incident response..." /><Button onClick={handleSearch} disabled={loading || !query.trim()} className="gap-1" style={{ background: 'var(--app-accent)' }}><Search className="h-4 w-4" />{loading ? 'Searching...' : 'Search'}</Button>{results.length > 0 && <Button onClick={handleGenerateAnswer} disabled={generatingAnswer} variant="outline" className="gap-1"><Bot className="h-4 w-4" />{generatingAnswer ? 'Generating...' : 'Ask AI'}</Button>}</div>{results.length > 0 && results[0].expandedTerms && <div className="mt-2 flex flex-wrap gap-1 items-center"><span className="text-[10px] text-slate-500">Expanded:</span>{results[0].expandedTerms.map((t: string, i: number) => <Badge key={i} variant="outline" className="text-[9px] text-cyan-400">{t}</Badge>)}</div>}</CardContent></Card>
    {showAnswer && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-emerald-400" /> AI Answer (grounded in retrieved docs)</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{answer}</p></CardContent></Card>}
    {results.length > 0 && <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Retrieved Chunks ({results.length})</CardTitle></CardHeader><CardContent><div className="space-y-3 max-h-[500px] overflow-y-auto custom-scroll">{results.map((r, i) => (<div key={i} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-2"><Badge variant="outline" className="text-[10px]">{i + 1}</Badge><span className="text-sm font-medium">{r.title}</span><Badge variant="outline" className="text-[10px] ml-auto">final: {r.score.toFixed(3)}</Badge></div><div className="flex items-center gap-2 text-[10px] text-slate-500 mb-2"><span>[{r.source}]</span><span>tfidf: {r.tfidfScore?.toFixed(3) || 'N/A'}</span><span>semantic: {r.semanticScore?.toFixed(3) || 'N/A'}</span></div><p className="text-xs text-slate-300 leading-relaxed">{r.content.substring(0, 500)}...</p></div>))}</div></CardContent></Card>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">All Documents ({docs.length})</CardTitle></CardHeader><CardContent>{docs.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No documents. Click "Seed KB" to load default docs.</p> : <div className="space-y-1 max-h-64 overflow-y-auto custom-scroll">{docs.map((d: any) => (<div key={d.id} className="p-2 rounded bg-slate-800/40 border border-slate-800 flex items-center gap-2"><Badge variant="outline" className="text-[9px]">{d.source}</Badge><span className="text-xs flex-1 truncate">{d.title}</span><span className="text-[10px] text-slate-500">{d.chunkCount} chunks</span>{d.embedded && <Badge variant="outline" className="text-[9px] text-emerald-400">embedded</Badge>}</div>))}</div>}</CardContent></Card>
  </div>);
}

// === AGENTS ===
function AgentsView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Record<string, any>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [runningTasks, setRunningTasks] = useState<any[]>([]);
  const [pollingTaskIds, setPollingTaskIds] = useState<Set<string>>(new Set());
  const fetch = async () => { try { const [a, r] = await Promise.all([api('/api/v1/agents-status'), api('/api/v1/agents-status/task?running=true')]); setAgents(a.agents || []); setRunningTasks(r.running || []); } catch {} };
  useEffect(() => { fetch(); const t = setInterval(fetch, 5000); return () => clearInterval(t); }, []);
  // Poll a task until it completes
  const pollTask = async (taskId: string, agentType: string) => {
    setPollingTaskIds(prev => new Set(prev).add(taskId));
    const maxAttempts = 60; // 5 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await api(`/api/v1/agents-status/task?taskId=${taskId}`);
        setTasks(prev => ({ ...prev, [agentType]: status }));
        if (status.status === 'completed' || status.status === 'failed') {
          setPollingTaskIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
          await fetch();
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 3000));
    }
    setPollingTaskIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
  };
  const handleRun = async (type: string) => {
    setRunning(type);
    try {
      const r = await postJSON('/api/v1/agents-status/start', { agentType: type, input: {}, triggeredBy: 'dashboard' });
      if (r.ok && r.taskId) {
        // Start polling for progress
        pollTask(r.taskId, type);
      } else {
        // Agent is already running or failed to start — show error
        setTasks(prev => ({ ...prev, [type]: { status: 'failed', error: r.message } }));
      }
    } catch (e: any) {
      setTasks(prev => ({ ...prev, [type]: { status: 'failed', error: e.message } }));
    } finally {
      setRunning(null);
    }
  };
  const TYPES = [{ type: 'investigation', label: 'Investigation Agent', icon: '🔍', desc: 'Forensic timeline reconstruction' }, { type: 'threat', label: 'Threat Agent', icon: '🛡️', desc: 'MITRE mapping + containment' }, { type: 'infrastructure', label: 'Infrastructure Agent', icon: '⚙️', desc: 'Anomaly + remediation advice' }, { type: 'recovery', label: 'Recovery Agent', icon: '💾', desc: 'Backups + restore operations' }];
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><Bot className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Agentic AI Control Center <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Activity className="h-3 w-3" /> Background workflows</Badge></h2><p className="text-sm text-slate-400">4 specialized agents running real background tasks via AI Gateway + LLM.</p></div></div>
    {runningTasks.length > 0 && <Card className="bg-slate-900/60 border-slate-800 border-amber-500/30"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" /> Active Workflows ({runningTasks.length})</CardTitle></CardHeader><CardContent><div className="space-y-2">{runningTasks.map(t => (<div key={t.taskId} className="text-xs flex items-center gap-2"><Badge variant="outline" className="text-[9px]">{t.agentId.substring(0, 8)}</Badge><span className="text-slate-400">Running for {(t.durationMs / 1000).toFixed(1)}s</span></div>))}</div></CardContent></Card>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{TYPES.map(cfg => { const agent = agents.find(a => a.type === cfg.type); const task = tasks[cfg.type]; const isPolling = pollingTaskIds.has(task?.id || ''); return (<Card key={cfg.type} className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><span className="text-lg">{cfg.icon}</span>{cfg.label}{agent && <Badge variant={agent.status === 'running' ? 'default' : 'secondary'} className="text-[10px]">{agent.status}</Badge>}<Button size="sm" variant="outline" className="ml-auto text-xs gap-1" onClick={() => handleRun(cfg.type)} disabled={running === cfg.type || agent?.status === 'running'}><Play className="h-3 w-3" />{running === cfg.type ? 'Starting...' : agent?.status === 'running' ? 'Running' : 'Start Task'}</Button></CardTitle></CardHeader><CardContent><p className="text-xs text-slate-400 mb-2">{cfg.desc}</p>{agent && <div className="flex flex-wrap gap-1">{agent.capabilities.map((c: string) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}</div>}{task && <div className="mt-2 pt-2 border-t border-slate-800 space-y-2"><div className="flex items-center gap-2">{task.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : task.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-400" /> : <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />}<span className="text-xs font-medium">{task.status}</span>{task.toolsUsed && <Badge variant="outline" className="text-[10px]">{task.toolsUsed.length} tools</Badge>}{task.steps && <Badge variant="outline" className="text-[10px]">{task.steps.length} steps</Badge>}{task.duration && <Badge variant="outline" className="text-[10px]">{(task.duration / 1000).toFixed(1)}s</Badge>}</div>{task.steps && task.steps.length > 0 && <div className="space-y-1 max-h-32 overflow-y-auto custom-scroll">{task.steps.slice(-5).map((s: any, i: number) => (<div key={i} className="text-[10px] text-slate-400 p-1.5 rounded bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-1"><Badge variant="outline" className="text-[9px]">#{s.step}</Badge><span className="text-slate-300">{s.name}</span></div><div className="text-[9px] text-slate-500 mt-0.5">{s.thought}</div></div>))}</div>}{task.reasoning && <div className="p-2 rounded bg-slate-800/40 border border-slate-800"><div className="text-[10px] uppercase text-slate-500 mb-1">LLM Reasoning</div><p className="text-[11px] text-slate-300">{task.reasoning.substring(0, 300)}</p></div>}</div>}</CardContent></Card>); })}</div>
  </div>);
}

// === AI EVALUATION ===
function AIEvaluationView() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api('/api/v1/ai-evaluation').then(setData).catch(() => {}); const t = setInterval(() => api('/api/v1/ai-evaluation').then(setData), 15000); return () => clearInterval(t); }, []);
  if (!data) return <div className="text-slate-500 text-center py-12"><RefreshCw className="h-5 w-5 animate-pulse mx-auto mb-2" /> Loading AI evaluation...</div>;
  const radarData = [{ metric: 'Precision', value: data.detection.precision }, { metric: 'Recall', value: data.detection.recall }, { metric: 'F1', value: data.detection.f1 }, { metric: 'Groundedness', value: data.rag.groundedness }, { metric: 'Agent Success', value: data.agent.successRate }, { metric: 'Response Acc', value: data.response.accuracy }];
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> AI Evaluation</h2><p className="text-sm text-slate-400">Precision, recall, F1, groundedness, hallucination rate — measured against live data.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={BarChart3} label="Detection F1" value={data.detection.f1} tone="emerald" /><StatCard icon={BookOpen} label="Groundedness" value={data.rag.groundedness} tone="cyan" /><StatCard icon={Bot} label="Agent Success" value={data.agent.successRate} tone="purple" /><StatCard icon={AlertCircle} label="Hallucination" value={data.response.hallucinationRate} tone="red" /></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Performance Radar</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData}><PolarGrid stroke="#1e293b" /><PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} /><Radar dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} /></RadarChart></ResponsiveContainer></div></CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Detailed Metrics</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Row label="Precision" value={`${data.detection.precision.toFixed(1)}%`} /><Row label="Recall" value={`${data.detection.recall.toFixed(1)}%`} /><Row label="F1 Score" value={`${data.detection.f1.toFixed(1)}%`} /><Row label="False Positive Rate" value={`${data.detection.falsePositiveRate.toFixed(1)}%`} /><Row label="Retrieval Precision" value={`${data.rag.retrievalPrecision.toFixed(1)}%`} /><Row label="Agent Success Rate" value={`${data.agent.successRate.toFixed(1)}%`} /><Row label="Response Accuracy" value={`${data.response.accuracy.toFixed(1)}%`} /><Row label="Hallucination Rate" value={`${data.response.hallucinationRate.toFixed(1)}%`} /><Row label="Mean Latency" value={`${data.response.latencyMs} ms`} /></CardContent></Card>
    </div>
  </div>);
}

// === ADVERSARIAL TESTS ===
function AdversarialTestsView() {
  const [tests, setTests] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const fetch = async () => { try { const d = await api('/api/v1/adversarial-tests'); setTests(d.tests || []); setRecentResults(d.recentResults || []); } catch {} };
  useEffect(() => { fetch(); }, []);
  const handleRunAll = async () => { setRunning(true); setResult(null); try { const r = await postJSON('/api/v1/adversarial-tests', {}); setResult(r); await fetch(); } finally { setRunning(false); } };
  const handleRunSingle = async (testId: string) => { setRunningTestId(testId); try { const r = await postJSON('/api/v1/adversarial-tests', { testId }); if (r.ok) { await fetch(); } } finally { setRunningTestId(null); } };
  const passed = result?.passed ?? recentResults.filter(r => r.blocked).length;
  const failed = result?.failed ?? recentResults.length - passed;
  const passRate = result ? Math.round((result.passed / result.total) * 100) : (recentResults.length > 0 ? Math.round((passed / recentResults.length) * 100) : 0);
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><ShieldAlert className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Adversarial AI Tests <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Brain className="h-3 w-3" /> Real LLM probing</Badge></h2><p className="text-sm text-slate-400">Actually invokes the LLM with malicious prompts + checks if it was compromised.</p></div><Button size="sm" onClick={handleRunAll} disabled={running} className="gap-1" style={{ background: 'var(--app-accent)' }}><Zap className="h-3.5 w-3.5" />{running ? 'Probing LLM...' : 'Run All Tests'}</Button></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={ShieldAlert} label="Total" value={result?.total ?? tests.length} tone="cyan" /><StatCard icon={CheckCircle} label="Blocked" value={passed} tone="emerald" /><StatCard icon={XCircle} label="Compromised" value={failed} tone="red" /><StatCard icon={Activity} label="Pass Rate" value={`${passRate}%`} tone={passRate === 100 ? 'emerald' : passRate >= 50 ? 'amber' : 'red'} /></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Test Catalog ({tests.length}) — click any test to run individually</CardTitle></CardHeader><CardContent>{tests.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No tests loaded.</p> : <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scroll">{tests.map(t => { const latestResult = recentResults.find(r => r.testType === t.testType); return (<div key={t.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-2"><Badge variant={t.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{t.severity}</Badge><span className="text-xs font-medium">{t.testType}</span><Badge variant="outline" className="text-[10px]">{t.target}</Badge>{latestResult && <Badge variant={latestResult.blocked ? 'default' : 'destructive'} className={`text-[9px] ${latestResult.blocked ? 'bg-emerald-600' : ''}`}>{latestResult.blocked ? 'BLOCKED' : 'COMPROMISED'}</Badge>}<Button size="sm" variant="outline" className="ml-auto h-7 text-[10px] gap-1" onClick={() => handleRunSingle(t.id)} disabled={runningTestId === t.id}><Play className="h-3 w-3" />{runningTestId === t.id ? 'Probing...' : 'Run'}</Button></div><div className="text-[11px] text-slate-400 mb-2"><span className="text-slate-500">Input:</span> <code className="text-amber-400">{t.input.substring(0, 120)}{t.input.length > 120 ? '...' : ''}</code></div><div className="text-[10px] text-slate-500 mb-1">Expected: {t.expectedBehavior}</div>{latestResult && latestResult.actualBehavior && <div className={`p-2 rounded text-[11px] mt-2 ${latestResult.blocked ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>{latestResult.blocked ? '🛡️ ' : '⚠️ '}{latestResult.actualBehavior}</div>}<div className="p-2 rounded bg-slate-900/40 border border-slate-700 text-[11px] text-slate-400 mt-1"><span className="text-slate-500">Mitigation:</span> {t.mitigation}</div></div>); })}</div>}</CardContent></Card>
    {result && result.results && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardHeader><CardTitle className="text-sm">Last Run Results</CardTitle></CardHeader><CardContent><div className="space-y-2">{result.results.results?.map((r: any, i: number) => (<div key={i} className="p-2 rounded bg-slate-800/40 border border-slate-800 text-xs flex items-center gap-2"><Badge variant={r.blocked ? 'default' : 'destructive'} className="text-[9px]">{r.blocked ? 'BLOCKED' : 'COMPROMISED'}</Badge><span className="flex-1 truncate">{r.testType}</span>{r.compromiseType && <Badge variant="outline" className="text-[9px] text-red-400">{r.compromiseType}</Badge>}<span className="text-[10px] text-slate-500">{r.durationMs}ms</span></div>))}</div></CardContent></Card>}
  </div>);
}

// === ASSETS === (already implemented above, reuse)
function AssetsView() {
  const [inventory, setInventory] = useState<any>(null);
  const [vulns, setVulns] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const fetch = async () => { try { const [inv, v] = await Promise.all([api('/api/v1/assets'), api('/api/v1/vulnerabilities')]); setInventory(inv); setVulns(v.vulnerabilities || []); } catch {} };
  useEffect(() => { fetch(); }, []);
  const handleScan = async () => { setScanning(true); try { await postJSON('/api/v1/assets/scan', {}); await fetch(); } finally { setScanning(false); } };
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><Cpu className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Assets & Vulnerabilities</h2><p className="text-sm text-slate-400">Real asset inventory with CVE vulnerability scanning.</p></div><Button size="sm" onClick={handleScan} disabled={scanning} className="gap-1" style={{ background: 'var(--app-accent)' }}>{scanning ? 'Scanning...' : 'Scan Now'}</Button></div>
    {inventory && <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><StatCard icon={Cpu} label="Assets" value={inventory.total} tone="cyan" /><StatCard icon={Wifi} label="Internet-Facing" value={inventory.internetFacing} tone="amber" /><StatCard icon={AlertCircle} label="Critical Vulns" value={inventory.criticalVulnerabilities} tone="red" /><StatCard icon={AlertTriangle} label="High-Risk" value={inventory.highRiskAssets} tone="orange" /><StatCard icon={Activity} label="Exposed Ports" value={inventory.exposedPortsCount} tone="purple" /></div>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Asset Inventory</CardTitle></CardHeader><CardContent>{!inventory?.assets?.length ? <p className="text-sm text-slate-500 text-center py-4">No assets. Click "Scan Now".</p> : <div className="space-y-2">{inventory.assets.map((a: any) => (<div key={a.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[10px]">{a.assetType}</Badge><span className="text-sm font-medium">{a.name}</span>{a.internetFacing && <Badge variant="destructive" className="text-[9px]">internet-facing</Badge>}<Badge variant={a.riskScore > 60 ? 'destructive' : 'outline'} className="text-[10px] ml-auto">risk: {a.riskScore.toFixed(0)}</Badge></div><div className="text-[11px] text-slate-400">OS: {a.os} {a.osVersion} · Vulns: {a.vulnerabilityCount} ({a.criticalVulnCount} critical)</div></div>))}</div>}</CardContent></Card>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Vulnerabilities ({vulns.length})</CardTitle></CardHeader><CardContent>{vulns.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No vulnerabilities found.</p> : <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">{vulns.map(v => (<div key={v.id} className="p-2 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant={v.severity === 'critical' ? 'destructive' : 'default'} className="text-[10px]">{v.severity}</Badge><span className="text-xs font-mono">{v.cveId}</span><span className="text-xs">{v.title}</span><span className="text-[10px] text-slate-500 ml-auto">CVSS: {v.cvssScore}</span></div></div>))}</div>}</CardContent></Card>
  </div>);
}

// === NIST CSF ===
function NistCsfView() {
  const [posture, setPosture] = useState<any>(null);
  useEffect(() => { api('/api/v1/nist-csf').then(setPosture).catch(() => {}); const t = setInterval(() => api('/api/v1/nist-csf').then(setPosture), 15000); return () => clearInterval(t); }, []);
  if (!posture) return <div className="text-slate-500 text-center py-12"><RefreshCw className="h-5 w-5 animate-pulse mx-auto mb-2" /> Loading NIST CSF...</div>;
  const color = (s: number) => s >= 90 ? '#10b981' : s >= 70 ? '#06b6d4' : s >= 50 ? '#f59e0b' : '#ef4444';
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><ShieldAlert className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> NIST CSF Posture</h2><p className="text-sm text-slate-400">Security posture across 6 NIST Cybersecurity Framework functions.</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-slate-900/60 border-slate-800"><CardContent className="p-4"><div className="text-center"><div className="text-6xl font-bold" style={{ color: color(posture.overall) }}>{posture.overall}<span className="text-2xl text-slate-500">/100</span></div></div><div className="mt-4 space-y-2">{posture.functions.map((f: any) => (<div key={f.function}><div className="flex items-center justify-between text-xs mb-1"><span className="capitalize text-slate-300">{f.function}</span><span className="font-bold" style={{ color: color(f.score) }}>{f.score.toFixed(0)}%</span></div><Progress value={f.score} className="h-2" /></div>))}</div></CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardContent className="p-4"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><RadarChart data={posture.functions.map((f: any) => ({ function: f.function, score: f.score }))}><PolarGrid stroke="#1e293b" /><PolarAngleAxis dataKey="function" tick={{ fill: '#94a3b8', fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} /><Radar dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} /></RadarChart></ResponsiveContainer></div></CardContent></Card>
    </div>
  </div>);
}

// === PLATFORM HEALTH ===
function PlatformHealthView() {
  const [health, setHealth] = useState<any>(null);
  useEffect(() => { api('/api/v1/platform-health').then(setHealth).catch(() => {}); const t = setInterval(() => api('/api/v1/platform-health').then(setHealth), 10000); return () => clearInterval(t); }, []);
  if (!health) return <div className="text-slate-500 text-center py-12"><RefreshCw className="h-5 w-5 animate-pulse mx-auto mb-2" /> Loading...</div>;
  const color = (s: string) => s === 'meeting' ? '#10b981' : s === 'at_risk' ? '#f59e0b' : '#ef4444';
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Activity className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Platform Health + SLOs</h2><p className="text-sm text-slate-400">Monitoring the security platform itself.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={Activity} label="SLO Compliance" value={health.overallSloCompliance.toFixed(1)} tone="emerald" /><StatCard icon={AlertCircle} label="Error Rate" value={health.errorRate.toFixed(2)} tone="red" /><StatCard icon={Wifi} label="Throughput" value={health.throughput} tone="cyan" /><StatCard icon={CheckCircle} label="SLOs Meeting" value={`${health.slos.filter((s: any) => s.status === 'meeting').length}/${health.slos.length}`} tone="purple" /></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Service Level Objectives</CardTitle></CardHeader><CardContent><div className="space-y-2">{health.slos.map((s: any) => (<div key={s.name} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium">{s.name}</span><Badge variant="outline" className="text-[10px]" style={{ color: color(s.status) }}>{s.status}</Badge><span className="text-[10px] text-slate-500 ml-auto">target: {s.target} {s.unit}</span></div><div className="flex items-center gap-2"><Progress value={s.unit === '%' ? s.current : (s.target / s.current) * 100} className="h-1.5" /><span className="text-xs font-mono" style={{ color: color(s.status) }}>{s.current.toFixed(2)} {s.unit}</span></div></div>))}</div></CardContent></Card>
  </div>);
}

// === INTEGRATIONS ===
function IntegrationsView() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<any>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fetch = async () => { try { const d = await api('/api/v1/integrations'); setIntegrations(d.integrations || []); } catch {} };
  useEffect(() => { fetch(); }, []);
  const handleToggle = async (id: string, enabled: boolean) => { await postJSON('/api/v1/integrations', { action: 'update', id, enabled: !enabled }); await fetch(); };
  const handleSendTest = async () => { setTesting('all'); try { const r = await postJSON('/api/v1/integrations', { action: 'send', event: { eventType: 'test', severity: 'medium', title: 'Test Alert', description: `Test sent from dashboard at ${new Date().toLocaleString()}`, data: {} } }); setToast(`Sent: ${r.sent || 0}, Failed: ${r.failed || 0}`); setTimeout(() => setToast(null), 4000); await fetch(); } finally { setTesting(null); } };
  const handleConfigure = (type: string, integration: any) => { setConfiguringId(type); setConfigForm(integration.config || {}); };
  const handleSaveConfig = async () => {
    try {
      let action = '';
      if (configuringId === 'email') action = 'configure_email';
      else if (configuringId === 'jira') action = 'configure_jira';
      else if (configuringId === 'slack') action = 'configure_slack';
      else action = 'update';
      const body: any = { action, config: configForm };
      if (action === 'update') body.id = configuringId;
      await postJSON('/api/v1/integrations', body);
      await fetch();
      setConfiguringId(null);
      setToast(`${configuringId} integration configured`);
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) { setToast(`Error: ${e.message}`); }
  };
  const handleTestSingle = async (id: string) => { setTesting(id); try { const r = await postJSON('/api/v1/integrations', { action: 'test', id }); setToast(r.ok ? `Test sent to ${id}` : `Test failed: ${r.error}`); setTimeout(() => setToast(null), 4000); await fetch(); } finally { setTesting(null); } };
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h2 className="text-lg font-bold flex items-center gap-2"><Wifi className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Integrations <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Mail className="h-3 w-3" /> Email + Jira + Slack</Badge></h2><p className="text-sm text-slate-400">Real SMTP email, Jira tickets, Slack alerts, generic webhooks.</p></div><Button size="sm" variant="outline" onClick={handleSendTest} disabled={testing === 'all'} className="gap-1"><Send className="h-3.5 w-3.5" />{testing === 'all' ? 'Sending...' : 'Send Test Alert'}</Button></div>
    {toast && <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/30 text-sm text-cyan-200">{toast}</div>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{integrations.map(i => (<Card key={i.id} className={`bg-slate-900/60 border-slate-800 ${i.enabled ? 'border-emerald-500/30' : ''}`}><CardContent className="p-3"><div className="flex items-center justify-between mb-2"><div className="flex-1"><div className="text-sm font-medium flex items-center gap-2">{i.name}{i.type === 'email' && <Mail className="h-3 w-3 text-cyan-400" />}{i.type === 'jira' && <FileText className="h-3 w-3 text-purple-400" />}{i.type === 'slack' && <MessageSquare className="h-3 w-3 text-emerald-400" />}</div><div className="text-[10px] text-slate-500 uppercase">{i.type} · {i.category}</div></div><div className="flex gap-1">{(i.type === 'email' || i.type === 'jira' || i.type === 'slack') && <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleConfigure(i.type, i)}><Settings className="h-3 w-3" />Configure</Button>}<Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleTestSingle(i.id)} disabled={testing === i.id || !i.enabled}>{testing === i.id ? 'Testing...' : 'Test'}</Button><Button size="sm" variant={i.enabled ? 'default' : 'outline'} className="h-7 text-[10px]" onClick={() => handleToggle(i.id, i.enabled)}>{i.enabled ? 'ON' : 'OFF'}</Button></div></div><div className="grid grid-cols-3 gap-2 text-[11px]"><div><span className="text-slate-500">Sent:</span> <span className="text-emerald-400">{i.eventsSent}</span></div><div><span className="text-slate-500">Failed:</span> <span className="text-red-400">{i.eventsFailed}</span></div><div><span className="text-slate-500">Last:</span> <span className="text-slate-400">{i.lastSentAt ? new Date(i.lastSentAt).toLocaleDateString() : 'never'}</span></div></div></CardContent></Card>))}</div>
    {configuringId && <Card className="bg-slate-900/60 border-slate-800 border-emerald-500/30"><CardHeader><CardTitle className="text-sm">Configure {configuringId.toUpperCase()}</CardTitle></CardHeader><CardContent>{configuringId === 'email' && <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-slate-500 uppercase">SMTP Host</label><Input value={configForm.host || ''} onChange={e => setConfigForm({ ...configForm, host: e.target.value })} placeholder="smtp.gmail.com" /></div><div><label className="text-[10px] text-slate-500 uppercase">Port</label><Input type="number" value={configForm.port || 587} onChange={e => setConfigForm({ ...configForm, port: Number(e.target.value) })} /></div></div><Input value={configForm.user || ''} onChange={e => setConfigForm({ ...configForm, user: e.target.value })} placeholder="SMTP username" /><Input type="password" value={configForm.pass || ''} onChange={e => setConfigForm({ ...configForm, pass: e.target.value })} placeholder="SMTP password / app password" /><Input value={configForm.from || ''} onChange={e => setConfigForm({ ...configForm, from: e.target.value })} placeholder="from@yourdomain.com" /><Input value={(configForm.to || []).join(', ')} onChange={e => setConfigForm({ ...configForm, to: e.target.value.split(',').map((s: string) => s.trim()) })} placeholder="recipient1@x.com, recipient2@y.com" /></div>}{configuringId === 'jira' && <div className="space-y-2"><Input value={configForm.baseUrl || ''} onChange={e => setConfigForm({ ...configForm, baseUrl: e.target.value })} placeholder="https://your-domain.atlassian.net" /><Input value={configForm.email || ''} onChange={e => setConfigForm({ ...configForm, email: e.target.value })} placeholder="your-email@company.com" /><Input type="password" value={configForm.apiToken || ''} onChange={e => setConfigForm({ ...configForm, apiToken: e.target.value })} placeholder="API token from https://id.atlassian.com/manage-profile/security/api-tokens" /><div className="grid grid-cols-2 gap-2"><Input value={configForm.projectKey || ''} onChange={e => setConfigForm({ ...configForm, projectKey: e.target.value })} placeholder="Project key (e.g. SEC)" /><Input value={configForm.issueType || ''} onChange={e => setConfigForm({ ...configForm, issueType: e.target.value })} placeholder="Issue type (e.g. Incident)" /></div></div>}{configuringId === 'slack' && <div className="space-y-2"><Input value={configForm.webhookUrl || ''} onChange={e => setConfigForm({ ...configForm, webhookUrl: e.target.value })} placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX" /></div>}<div className="flex gap-2 mt-3"><Button size="sm" onClick={handleSaveConfig} className="gap-1" style={{ background: 'var(--app-accent)' }}><Save className="h-3.5 w-3.5" /> Save Configuration</Button><Button size="sm" variant="outline" onClick={() => setConfiguringId(null)}>Cancel</Button></div></CardContent></Card>}
  </div>);
}

// === RBAC ===
function RBACView() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api('/api/v1/rbac/users').then(setData).catch(() => {}); }, []);
  if (!data) return <div className="text-slate-500 text-center py-12">Loading...</div>;
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Shield className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Users & RBAC</h2><p className="text-sm text-slate-400">Multi-tenant RBAC with role-based permissions.</p></div>
    {data.organizations?.length > 0 && <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Organizations ({data.organizations.length})</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{data.organizations.map((o: any) => <div key={o.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800"><span className="text-sm font-medium">{o.name}</span><Badge variant="outline" className="ml-2 text-[10px]">{o.plan}</Badge></div>)}</div></CardContent></Card>}
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Users ({data.users?.length || 0})</CardTitle></CardHeader><CardContent>{!data.users?.length ? <p className="text-sm text-slate-500 text-center py-4">No users.</p> : <table className="w-full text-xs"><thead><tr className="text-slate-400 border-b border-slate-800"><th className="text-left py-2 px-2">Email</th><th className="text-left py-2 px-2">Name</th><th className="text-left py-2 px-2">Role</th><th className="text-left py-2 px-2">Status</th></tr></thead><tbody>{data.users.map((u: any) => <tr key={u.id} className="border-b border-slate-800/60"><td className="py-2 px-2 text-slate-300">{u.email}</td><td className="py-2 px-2">{u.name}</td><td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{u.role}</Badge></td><td className="py-2 px-2"><Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{u.status}</Badge></td></tr>)}</tbody></table>}</CardContent></Card>
  </div>);
}

// === POLICY COMPILER ===
function PolicyCompilerView() {
  const [source, setSource] = useState(`POLICY DetectRansomware {
  IF process.name IN ["vssadmin.exe", "wbadmin.exe"] AND process.cmdline IN ["delete", "shadows"] THEN ACTION create_incident
}`);
  const [result, setResult] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [compiling, setCompiling] = useState(false);
  useEffect(() => { api('/api/v1/policy/compile').then(d => setPolicies(d.policies || [])).catch(() => {}); }, []);
  const handleCompile = async () => { setCompiling(true); try { const r = await postJSON('/api/v1/policy/compile', { source }); setResult(r); } finally { setCompiling(false); } };
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Code2 className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Policy Compiler</h2><p className="text-sm text-slate-400">.psec DSL: lexical → syntax → AST → semantic → optimizer → runtime.</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Code2 className="h-4 w-4 text-cyan-400" /> Policy Source</CardTitle></CardHeader><CardContent><Textarea value={source} onChange={e => setSource(e.target.value)} className="font-mono text-xs h-64 resize-none bg-slate-950" /><Button size="sm" onClick={handleCompile} disabled={compiling} className="mt-2 gap-1 w-full" style={{ background: 'var(--app-accent)' }}><Play className="h-3 w-3" />{compiling ? 'Compiling...' : 'Compile'}</Button></CardContent></Card>
      <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileCode className="h-4 w-4 text-emerald-400" /> Result {result && <Badge variant={result.status === 'success' ? 'default' : 'destructive'} className="text-[10px] ml-auto">{result.status}</Badge>}</CardTitle></CardHeader><CardContent>{!result ? <p className="text-sm text-slate-500 text-center py-8">Click "Compile" to see result.</p> : <div className="space-y-3">{result.tokens && <div><div className="text-[10px] uppercase text-slate-500 mb-1">Tokens ({result.tokens.length})</div><div className="flex flex-wrap gap-1 p-2 rounded bg-slate-950 border border-slate-800">{result.tokens.map((t: any, i: number) => <Badge key={i} variant="outline" className="text-[9px] font-mono">{t.type}:{typeof t.value === 'string' ? `"${t.value}"` : t.value}</Badge>)}</div></div>}{result.ast && <div><div className="text-[10px] uppercase text-slate-500 mb-1">AST</div><pre className="text-[11px] p-2 rounded bg-slate-950 border border-slate-800 overflow-x-auto max-h-32">{JSON.stringify(result.ast, null, 2)}</pre></div>}{result.semantic && <div><div className="text-[10px] uppercase text-slate-500 mb-1">Semantic</div><div className="flex items-center gap-2">{result.semantic.valid ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}<span className="text-xs">{result.semantic.valid ? 'Valid' : 'Invalid'}</span></div></div>}</div>}</CardContent></Card>
    </div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Saved Policies ({policies.length})</CardTitle></CardHeader><CardContent><div className="space-y-2 max-h-64 overflow-y-auto custom-scroll">{policies.map(p => <div key={p.id} className="p-2 rounded-md bg-slate-800/40 border border-slate-800"><div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-[10px]">{p.category}</Badge><span className="text-xs font-medium">{p.name}</span><Badge variant="outline" className="text-[10px] ml-auto">{p.action}</Badge></div><pre className="text-[10px] text-slate-400 font-mono">{p.source.substring(0, 100)}</pre></div>)}</div></CardContent></Card>
  </div>);
}

// === BACKUP & RECOVERY ===
function BackupRecoveryView() {
  const [data, setData] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [sourcePath, setSourcePath] = useState('/tmp');
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restoreDialog, setRestoreDialog] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState('');
  const fetch = async () => { try { const d = await api('/api/v1/backup'); setData(d); } catch {} };
  useEffect(() => { fetch(); const t = setInterval(fetch, 5000); return () => clearInterval(t); }, []);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 5000); };
  const handleCreate = async () => { setCreating(true); try { const r = await postJSON('/api/v1/backup', { sourcePath }); showToast(r.ok ? `Backup created: ${r.backup?.fileCount || 0} files, ${((r.backup?.sizeBytes || 0) / 1024).toFixed(1)}KB encrypted` : `Failed: ${r.error}`); await fetch(); } finally { setCreating(false); } };
  const handleVerify = async (id: string) => { setActioning(`verify-${id}`); try { const r = await postJSON('/api/v1/backup', { action: 'verify', backupId: id }); showToast(r.verified ? `Verified ✓ — hash matches` : `Verification FAILED — hash mismatch!`); await fetch(); } finally { setActioning(null); } };
  const handleRestore = async () => { if (!restoreDialog || !restorePath) return; setActioning(`restore-${restoreDialog}`); try { const r = await postJSON('/api/v1/backup', { action: 'restore', backupId: restoreDialog, restorePath }); showToast(r.ok ? `Restored ${r.fileCount} files to ${r.restoredPath}` : `Restore failed: ${r.error}`); await fetch(); } finally { setActioning(null); setRestoreDialog(null); setRestorePath(''); } };
  const handleDelete = async (id: string) => { if (!confirm('Delete this backup? This cannot be undone (unless marked immutable).')) return; setActioning(`delete-${id}`); try { const r = await postJSON('/api/v1/backup', { action: 'delete', backupId: id }); showToast(r.ok ? 'Backup deleted' : `Delete failed: ${r.error}`); await fetch(); } finally { setActioning(null); } };
  const backups = data?.backups || [];
  const st = data?.status;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><DatabaseBackup className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Backup and Recovery <Badge variant="outline" className="text-[10px] gap-1 ml-1"><Lock className="h-3 w-3" /> AES-256-GCM</Badge></h2>
          <p className="text-sm text-slate-400">Real tar.gz + AES-256-GCM encrypted backups with SHA-256 integrity verification.</p>
        </div>
      </div>
      {toast && <div className={`p-3 rounded border text-sm ${toast.startsWith('Failed') || toast.startsWith('Restore failed') || toast.startsWith('Delete failed') || toast.startsWith('Verification FAILED') ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>{toast}</div>}
      {st && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={DatabaseBackup} label="Total" value={st.totalBackups} tone="cyan" />
          <StatCard icon={CheckCircle} label="Completed" value={st.completedBackups} tone="emerald" />
          <StatCard icon={Lock} label="Immutable" value={st.immutableBackups} tone="purple" />
          <StatCard icon={Shield} label="Verified" value={st.verifiedBackups} tone="emerald" />
          <StatCard icon={Activity} label="RPO/RTO" value={`${st.rpoMinutes}m/${st.rtoMinutes}m`} tone="amber" />
        </div>
      )}
      <Card className="bg-slate-900/60 border-slate-800 border-cyan-500/30">
        <CardHeader><CardTitle className="text-sm">Create New Encrypted Backup</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder="Source path to back up (e.g. /tmp, /home/user/docs)" />
            <Button onClick={handleCreate} disabled={creating || !sourcePath.trim()} className="gap-1" style={{ background: 'var(--app-accent)' }}>
              <Plus className="h-3.5 w-3.5" />{creating ? 'Creating...' : 'Create Backup'}
            </Button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Files are archived via tar, then encrypted with AES-256-GCM (12-byte nonce + 16-byte auth tag), then stored as .enc. SHA-256 integrity hash is computed and stored.</p>
        </CardContent>
      </Card>
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader><CardTitle className="text-sm">Backup History ({backups.length})</CardTitle></CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No backups yet. Enter a source path above and click "Create Backup".</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scroll">
              {backups.map((b: any) => {
                const sizeKB = Math.round((b.sizeBytes / 1024) * 10) / 10;
                return (
                  <div key={b.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={b.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">{b.status}</Badge>
                      {b.immutable && <Badge variant="outline" className="text-[10px] text-purple-400">immutable</Badge>}
                      {b.verified && <Badge variant="outline" className="text-[10px] text-emerald-400">verified</Badge>}
                      <Badge variant="outline" className="text-[10px]">{b.encryptionAlgo}</Badge>
                      <span className="text-[10px] text-slate-500 ml-auto">{new Date(b.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono truncate mb-1">{b.sourcePath}</div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                      <span>{b.fileCount} files</span>
                      <span>{sizeKB} KB</span>
                      <span>RPO: {b.rpoMinutes}min</span>
                      <span>RTO: {b.rtoMinutes}min</span>
                      <span className="text-slate-400 truncate">hash: {b.integrityHash?.substring(0, 16)}...</span>
                    </div>
                    {b.backupFilePath && <div className="text-[10px] text-slate-500 font-mono truncate mb-2">📁 {b.backupFilePath}</div>}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleVerify(b.id)} disabled={actioning === `verify-${b.id}` || b.status !== 'completed'}><Shield className="h-3 w-3" />{actioning === `verify-${b.id}` ? 'Verifying...' : 'Verify'}</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => { setRestoreDialog(b.id); setRestorePath(`/tmp/restore-${b.id.substring(0, 8)}`); }} disabled={b.status !== 'completed'}><RotateCw className="h-3 w-3" />Restore</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-red-400" onClick={() => handleDelete(b.id)} disabled={actioning === `delete-${b.id}` || b.immutable}>{actioning === `delete-${b.id}` ? 'Deleting...' : 'Delete'}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {restoreDialog && (
        <Card className="bg-slate-900/60 border-slate-800 border-amber-500/30">
          <CardHeader><CardTitle className="text-sm">Restore Backup</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400 mb-2">Restoring backup <code className="text-amber-400">{restoreDialog.substring(0, 16)}...</code> to:</p>
            <Input value={restorePath} onChange={e => setRestorePath(e.target.value)} placeholder="/tmp/restore" />
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={handleRestore} disabled={!restorePath.trim() || actioning === `restore-${restoreDialog}`} className="gap-1" style={{ background: 'var(--app-accent)' }}>
                <RotateCw className="h-3.5 w-3.5" />{actioning === `restore-${restoreDialog}` ? 'Restoring...' : 'Restore Now'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRestoreDialog(null)}>Cancel</Button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">This will decrypt the .enc file with AES-256-GCM, extract the tar.gz, and write files to the destination path.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// === REPORTS ===
function ReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any>(null);
  const [viewContent, setViewContent] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const fetch = async () => { try { const d = await api('/api/v1/reports'); setReports(d.reports || []); } catch {} };
  useEffect(() => { fetch(); }, []);
  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      const titles: Record<string, string> = { security: 'Security Report', incident: 'Incident Report', infrastructure: 'Infrastructure Report', executive: 'Executive Summary' };
      await postJSON('/api/v1/reports', { type, title: titles[type] || type });
      await fetch();
    } finally { setGenerating(null); }
  };
  const handleDownload = (id: string, format: string) => {
    const a = document.createElement('a');
    a.href = '/api/v1/reports/download?id=' + id + '&format=' + format;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const handleView = async (id: string) => {
    try {
      const r = await api('/api/v1/reports/' + id);
      setViewing(r.report);
      setViewContent(r.report.content || JSON.stringify(r.report.data, null, 2).substring(0, 2000));
    } catch {}
  };
  const TYPES = [
    { type: 'security', label: 'Security', icon: Shield },
    { type: 'incident', label: 'Incident', icon: Siren },
    { type: 'infrastructure', label: 'Infrastructure', icon: Server },
    { type: 'executive', label: 'Executive', icon: Cpu },
  ];
  const FORMATS = [
    { value: 'md', icon: FileCode },
    { value: 'pdf', icon: FileText },
    { value: 'docx', icon: FileCode },
    { value: 'xlsx', icon: FileSpreadsheet },
    { value: 'json', icon: FileJson },
    { value: 'csv', icon: Table },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Reports
        </h2>
        <p className="text-sm text-slate-400">Generate downloadable reports in 6 formats.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TYPES.map(({ type, label, icon: Icon }) => (
          <Card key={type} className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-4">
              <Icon className="h-5 w-5 text-emerald-400 mb-2" />
              <div className="text-sm font-medium">{label}</div>
              <Button size="sm" variant="outline" className="w-full mt-2 text-xs gap-1" onClick={() => handleGenerate(type)} disabled={generating === type}>
                <Plus className="h-3 w-3" />{generating === type ? 'Generating...' : 'Generate'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader><CardTitle className="text-sm">Generated Reports ({reports.length})</CardTitle></CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No reports generated yet.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r: any) => (
                <div key={r.id} className="p-3 rounded-md bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                    <span className="text-xs font-medium">{r.title}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  {r.summary && <p className="text-xs text-slate-400 mb-2">{r.summary}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleView(r.id)}>
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    {FORMATS.map((f: any) => {
                      const FmtIcon = f.icon;
                      return (
                        <Button key={f.value} size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => handleDownload(r.id, f.value)}>
                          <FmtIcon className="h-3 w-3" />{f.value.toUpperCase()}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {viewing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <Card className="bg-slate-900 border-slate-700 max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={(e: any) => e.stopPropagation()}>
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-emerald-400" />{viewing.title}
                <Badge variant="outline" className="ml-auto text-[10px]">{viewing.type}</Badge>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setViewing(null)}>X</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto p-4 custom-scroll">
              <pre className="text-xs whitespace-pre-wrap font-mono text-slate-300">{viewContent}</pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// === SETTINGS ===
function SettingsView({ status }: any) {
  const prefs = useUserPreferences();
  const ACCENT_COLORS = [{ name: 'emerald', value: '#10b981' }, { name: 'cyan', value: '#06b6d4' }, { name: 'blue', value: '#3b82f6' }, { name: 'purple', value: '#a855f7' }, { name: 'pink', value: '#ec4899' }, { name: 'orange', value: '#f97316' }, { name: 'red', value: '#ef4444' }];
  return (<div className="space-y-4">
    <div><h2 className="text-lg font-bold flex items-center gap-2"><Settings className="h-5 w-5" style={{ color: 'var(--app-accent)' }} /> Settings</h2><p className="text-sm text-slate-400">Theme, fonts, density, and platform configuration.</p></div>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label className="text-xs text-slate-400">Theme Mode</label><Select value={prefs.theme} onValueChange={prefs.setTheme}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dark">Dark</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="system">System</SelectItem></SelectContent></Select></div>
      <div><label className="text-xs text-slate-400">Font Family</label><Select value={prefs.fontFamily} onValueChange={prefs.setFontFamily}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sans">Sans-serif</SelectItem><SelectItem value="serif">Serif</SelectItem><SelectItem value="mono">Monospace</SelectItem></SelectContent></Select></div>
      <div><label className="text-xs text-slate-400">Font Size</label><Select value={prefs.fontSize} onValueChange={prefs.setFontSize}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sm">Small (13px)</SelectItem><SelectItem value="base">Default (14px)</SelectItem><SelectItem value="lg">Large (15px)</SelectItem><SelectItem value="xl">Extra Large (16px)</SelectItem></SelectContent></Select></div>
      <div><label className="text-xs text-slate-400">Density</label><Select value={prefs.density} onValueChange={prefs.setDensity}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="compact">Compact</SelectItem><SelectItem value="comfortable">Comfortable</SelectItem><SelectItem value="spacious">Spacious</SelectItem></SelectContent></Select></div>
      <div className="md:col-span-2"><label className="text-xs text-slate-400">Accent Color</label><div className="flex flex-wrap gap-2 mt-2">{ACCENT_COLORS.map(c => <button key={c.value} onClick={() => prefs.setAccentColor(c.value)} className="h-8 w-8 rounded-full border-2 flex items-center justify-center" style={{ background: c.value, borderColor: prefs.accentColor === c.value ? '#fff' : 'transparent' }}>{prefs.accentColor === c.value && <Check className="h-3.5 w-3.5 text-white" />}</button>)}</div></div>
    </CardContent></Card>
    <Card className="bg-slate-900/60 border-slate-800"><CardHeader><CardTitle className="text-sm">Platform Info</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><Row label="Hostname" value={status?.hostname || '—'} /><Row label="Platform" value={`${status?.platform || '—'} (${status?.arch || '—'})`} /><Row label="Auto-Cycle" value={status?.cycleStatus?.autoCycleEnabled ? 'Running' : 'Stopped'} /><Row label="Cycles Run" value={status?.cycleStatus?.autoCycleCount || 0} /></CardContent></Card>
  </div>);
}