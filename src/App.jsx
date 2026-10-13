import { useEffect, useMemo, useRef, useState } from 'react';
import { analyses, analysisTypes, findings, infrastructure as initialInfrastructure, initialSources, remediations } from './data';

const tabs = ['Dashboard', 'Findings', 'Remediations', 'Analyses', 'Sources', 'Settings'];
const IMPROVED_TABS = ['Dashboard', 'Findings', 'Remediations', 'Analyses', 'Skills Library', 'Sources', 'Settings'];
const IMPROVED_NAV_ITEMS = [
  ['Dashboard', 'improved-dashboard', 'grid'],
  ["What's new", 'improved-whats-new', 'spark'],
  ['Documentation', 'improved-documentation', 'book'],
  ['Blog posts', 'improved-blog-posts', 'blog'],
  ['Success stories', 'improved-success-stories', 'success']
];

const MODE_LABEL = { 'aws-managed': 'AWS-managed (remote)', ec2: 'Customer EC2 (remote)', batch: 'Customer Batch (remote)', 'non-interactive': 'Non-interactive (local)', interactive: 'Interactive (local)' };

// Poll the shared job bus the CLI writes to. Progress is derived from each job's
// startedAt + durationSec, so a task launched in the terminal keeps advancing here
// even after the terminal is closed. Served from public/atx-jobs.json.
function useAtxJobs() {
  const [jobs, setJobs] = useState([]);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/atx-jobs.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => { if (alive && Array.isArray(data)) setJobs(data); })
      .catch(() => {});
    load();
    const id = window.setInterval(() => { load(); tick((value) => value + 1); }, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  return jobs.map((job) => {
    const elapsed = (Date.now() - job.startedAt) / 1000;
    const progress = Math.max(0, Math.min(100, Math.round((elapsed / job.durationSec) * 100)));
    return { ...job, progress };
  });
}

// Cross-screen store for auto-drafted custom Transformation Definitions. A "no managed
// remediation" initiative triggers one; the Remediations screen renders a live card for it.
// Persisted so it survives navigating between mockup screens.
const CUSTOM_TD_KEY = 'atx-custom-tds';
const customTdListeners = new Set();
function readCustomTds() { try { return JSON.parse(window.localStorage.getItem(CUSTOM_TD_KEY) || '[]'); } catch { return []; } }
function writeCustomTds(list) { window.localStorage.setItem(CUSTOM_TD_KEY, JSON.stringify(list)); customTdListeners.forEach((fn) => fn()); }
function triggerCustomTd(subject) {
  const list = readCustomTds();
  if (list.some((item) => item.id === subject.id)) { writeCustomTds([{ ...subject, startedAt: Date.now() }, ...list.filter((item) => item.id !== subject.id)]); return; }
  writeCustomTds([{ ...subject, startedAt: Date.now() }, ...list]);
}
function resetCustomTd(id) { writeCustomTds(readCustomTds().map((item) => (item.id === id ? { ...item, startedAt: Date.now() } : item))); }
function removeCustomTd(id) { writeCustomTds(readCustomTds().filter((item) => item.id !== id)); }
function useCustomTds() {
  const [list, setList] = useState(readCustomTds);
  useEffect(() => {
    const sync = () => setList(readCustomTds());
    customTdListeners.add(sync);
    window.addEventListener('storage', sync);
    return () => { customTdListeners.delete(sync); window.removeEventListener('storage', sync); };
  }, []);
  return list;
}

// Remediations created by applying a specialized plan — persisted so they show up on the
// Remediations screen and flip the finding's state on Priorities.
const APPLIED_KEY = 'atx-applied-remediations';
function readApplied() { try { return JSON.parse(window.localStorage.getItem(APPLIED_KEY) || '[]'); } catch { return []; } }
function applyRemediation(record) {
  const list = readApplied().filter((item) => item.id !== record.id);
  window.localStorage.setItem(APPLIED_KEY, JSON.stringify([{ ...record, appliedAt: Date.now() }, ...list]));
  customTdListeners.forEach((fn) => fn());
}
function useApplied() {
  const [list, setList] = useState(readApplied);
  useEffect(() => {
    const sync = () => setList(readApplied());
    customTdListeners.add(sync);
    window.addEventListener('storage', sync);
    const id = window.setInterval(sync, 2000); // advance derived status over time
    return () => { customTdListeners.delete(sync); window.removeEventListener('storage', sync); window.clearInterval(id); };
  }, []);
  return list;
}

// Skills Library — reusable transformation skills (Transformation Definitions). Managed
// skills ship with AWS; custom skills are published from specialized plans you review.
const MANAGED_SKILLS = [
  { id: 'md-angular-react', name: 'AngularJS → React 18 + TypeScript', kind: 'managed', status: 'managed', owner: 'AWS Transform', description: 'Migrates AngularJS 1.x SPAs to React 18 + TypeScript, preserving routing and state behavior.', usedIn: ['payments-ui', 'customer-portal', 'admin-console'], accounts: ['Org-managed — all accounts'], applyCount: 1243, merges: 1180, runs: 1243, version: 'v6', confidence: 'High', updated: 'Aug 2026' },
  { id: 'md-node-upgrade', name: 'Node.js runtime upgrade', kind: 'managed', status: 'managed', owner: 'AWS Transform', description: 'Upgrades the Node.js runtime (16 → 20) with dependency, lockfile, and CI updates.', usedIn: ['LegacyNodeJSOrderingSystem', 'notification-worker'], accounts: ['Org-managed — all accounts'], applyCount: 5602, merges: 5410, runs: 5602, version: 'v11', confidence: 'High', updated: 'Aug 2026' },
  { id: 'md-sdk-v3', name: 'AWS SDK v2 → v3 (JavaScript)', kind: 'managed', status: 'managed', owner: 'AWS Transform', description: 'Migrates AWS SDK for JavaScript v2 clients to the modular v3 packages, including mocks and tests.', usedIn: ['LegacyNodeJSOrderingSystem'], accounts: ['Org-managed — all accounts'], applyCount: 3260, merges: 3120, runs: 3260, version: 'v8', confidence: 'High', updated: 'Jul 2026' },
  { id: 'md-vite', name: 'Webpack 4 → Vite + Node 20', kind: 'managed', status: 'managed', owner: 'AWS Transform', description: 'Modernizes the build toolchain from Webpack 4 to Vite on Node 20.', usedIn: ['payments-ui'], accounts: ['Org-managed — all accounts'], applyCount: 1187, merges: 1104, runs: 1187, version: 'v4', confidence: 'High', updated: 'Jul 2026' }
];
// Seeded custom skills. Drafts are scoped to one account; published ones are shared across
// accounts. A draft applied repeatedly is a publishing candidate. Ids match what Apply saves.
const SEED_CUSTOM_SKILLS = [
  { id: 'custom-angularjs-react-migration-plan', name: 'AngularJS → React (payments-ui specialized)', kind: 'custom', status: 'published', owner: 'nkmoorth', description: 'Repo-specialized AngularJS→React migration: routing kept behind an adapter, 14 payment business rules pinned to tests, analytics event schema preserved.', usedIn: ['payments-ui', 'customer-portal', 'admin-console'], accounts: ['nkmoorth', 'jdoe', 'asmith', 'mlunt', 'rpatel'], applyCount: 6, merges: 4, runs: 6, version: 'v2', confidence: 'High — validated across accounts', updated: 'Aug 28, 2026' },
  { id: 'custom-establish-test-coverage', name: 'Test coverage bootstrap (MyLearning specialized)', kind: 'custom', status: 'draft', owner: 'nkmoorth', description: 'Stands up a Jest + React Testing Library harness and seeds coverage for critical paths in a repo that had none, wiring it into CI.', usedIn: ['MyLearning'], accounts: ['nkmoorth'], applyCount: 5, merges: 3, runs: 5, version: 'v1', confidence: 'Draft — applied to this account', updated: 'Aug 26, 2026' },
  { id: 'custom-expo-sdk-38-51', name: 'Expo SDK 38 → 51 (MKPMobile specialized)', kind: 'custom', status: 'draft', owner: 'nkmoorth', description: 'Staged Expo SDK upgrade (38 → 44 → 51) with native-module compatibility shims and a device-matrix smoke run.', usedIn: ['MKPMobile'], accounts: ['nkmoorth'], applyCount: 1, merges: 0, runs: 1, version: 'v1', confidence: 'Draft — applied to this account', updated: 'Aug 30, 2026' },
  { id: 'custom-spring-boot-2-3', name: 'Spring Boot 2 → 3 (order-orchestrator specialized)', kind: 'custom', status: 'published', owner: 'tchen', description: 'Upgrades Spring Boot 2 → 3 with Jakarta namespace migration, config-property updates, and dependency alignment; validated against integration tests.', usedIn: ['order-orchestrator', 'fulfillment-api'], accounts: ['nkmoorth', 'tchen', 'bramirez', 'order-svc-ci'], applyCount: 9, merges: 7, runs: 9, version: 'v3', confidence: 'High — validated across accounts', updated: 'Aug 24, 2026' },
  { id: 'custom-log4j-upgrade', name: 'Log4j upgrade + unsafe API removal (catalog-service specialized)', kind: 'custom', status: 'published', owner: 'sec-platform', description: 'Upgrades Log4j and removes vulnerable/deprecated logging APIs; drops JNDI lookups and pins safe configuration across services.', usedIn: ['catalog-service', 'search-indexer', 'pricing-service'], accounts: ['nkmoorth', 'asmith', 'dwilson', 'sec-platform', 'catalog-ci'], applyCount: 14, merges: 12, runs: 14, version: 'v5', confidence: 'High — validated across accounts', updated: 'Aug 20, 2026' }
];
function resetDemoData() {
  ['atx-applied-remediations', 'atx-skills', 'atx-custom-tds', 'atx-active-custom-td'].forEach((key) => window.localStorage.removeItem(key));
  customTdListeners.forEach((fn) => fn());
}
const SKILLS_KEY = 'atx-skills';
function readSkills() { try { return JSON.parse(window.localStorage.getItem(SKILLS_KEY) || '[]'); } catch { return []; } }
function publishSkill(record) {
  const list = readSkills().filter((item) => item.id !== record.id);
  window.localStorage.setItem(SKILLS_KEY, JSON.stringify([{ ...record, createdAt: Date.now() }, ...list]));
  customTdListeners.forEach((fn) => fn());
}
function useSkills() {
  const [list, setList] = useState(readSkills);
  useEffect(() => {
    const sync = () => setList(readSkills());
    customTdListeners.add(sync);
    window.addEventListener('storage', sync);
    return () => { customTdListeners.delete(sync); window.removeEventListener('storage', sync); };
  }, []);
  return list;
}

// Which finding's custom-TD page is currently open.
const ACTIVE_TD_KEY = 'atx-active-custom-td';
function writeActiveCustomTd(id) { window.localStorage.setItem(ACTIVE_TD_KEY, id ?? ''); customTdListeners.forEach((fn) => fn()); }
function useActiveCustomTd() {
  const [id, setId] = useState(() => window.localStorage.getItem(ACTIVE_TD_KEY) || null);
  useEffect(() => {
    const sync = () => setId(window.localStorage.getItem(ACTIVE_TD_KEY) || null);
    customTdListeners.add(sync);
    window.addEventListener('storage', sync);
    return () => { customTdListeners.delete(sync); window.removeEventListener('storage', sync); };
  }, []);
  return id;
}

const mockupScreens = [
  ['landing', '01', 'AWS Transform landing'],
  ['iam', '02', 'Service management'],
  ['chat', '03', 'Chat interface'],
  ['chat-nav', '04', 'Chat with navigation'],
  ['dashboard', '05', 'CM dashboard'],
  ['findings', '06', 'Findings'],
  ['remediations', '07', 'Remediations'],
  ['analyses', '08', 'Analyses'],
  ['sources', '09', 'Sources'],
  ['source-connect', '10', 'Connect new source'],
  ['settings', '11', 'Settings'],
  ['analysis-start', '12', 'New analysis'],
  ['analysis-type', '13', 'Analysis type menu'],
  ['analysis-source', '14', 'Connect source in analysis'],
  ['improved-landing', 'A1', 'Improved CM landing'],
  ['guided-onboarding', 'A2', 'Guided onboarding'],
  ['improved-dashboard', 'A3', 'Lifecycle dashboard'],
  ['improved-priorities', 'A4', 'Prioritization workspace'],
  ['improved-analysis', 'A5', 'Analysis operations'],
  ['improved-remediation', 'A6', 'Remediation & validation'],
  ['improved-sources', 'A7', 'GitHub App connection'],
  ['improved-skills', 'A8', 'Skills Library'],
  ['improved-findings', 'A9', 'Findings'],
  ['improved-rail-remediations', 'A10', 'Remediations'],
  ['improved-rail-remediation', 'A11', 'Remediation detail'],
  ['improved-rail-analyses', 'A12', 'Analyses'],
  ['improved-rail-run-analysis', 'A13', 'Run new analysis'],
];

// AWS Transform brand mark — used for the chat bot / assistant.
function BrandMark({ size = 22 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <defs><linearGradient id="brandMarkGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9a49f5" /><stop offset="1" stopColor="#5f1fc7" /></linearGradient></defs>
        <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#brandMarkGradient)" />
        <path d="M16 7.5 L23.5 11.75 L23.5 20.25 L16 24.5 L8.5 20.25 L8.5 11.75 Z" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M12.5 13 H19.5 L12.5 19 H19.5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Icon({ name, size = 16 }) {
  const icons = {
    menu: '☰', close: '×', minimize: '−', search: '⌕', chevron: '⌄', plus: '+', check: '✓', warning: '△', info: 'ⓘ', copy: '▣', external: '↗', refresh: '↻', send: '➤', spark: '✧', thumbs: '♧', paperclip: '▱', user: 'N', note: '✎', dots: '•••', back: '‹', forward: '›', bot: '◇', report: '▤', download: '⇩', book: '▧', terminal: '>_', workspaces: '▦', blog: '▥', demo: '▷', success: '●', schedule: '◷', github: '◉', delete: '×', edit: '✎', settings: '⚙', moon: '◐', globe: '◎', bell: '♢', help: '?', grid: '⠿'
  };
  return <span className={`icon icon-${name}`} style={{ fontSize: size }} aria-hidden="true">{icons[name] || '•'}</span>;
}

function Button({ children, variant = 'primary', onClick, disabled = false, icon, type = 'button', className = '' }) {
  return <button type={type} className={`button ${variant} ${className}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} />}{children}</button>;
}

function MockupSwitcher({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  return <div className={`mockup-switcher ${open ? 'open' : ''}`}>
    {open && <button className="mockup-switcher-scrim" onClick={() => setOpen(false)} aria-label="Close mockup picker" />}
    {open && <section className="mockup-switcher-panel" aria-label="Render a mockup screen">
      <div className="mockup-switcher-heading"><div><strong>Render mockup</strong><span>Select any reference screen</span></div><button onClick={() => setOpen(false)} aria-label="Close mockup picker"><Icon name="close" size={20} /></button></div>
      <div className="mockup-screen-list">{mockupScreens.map(([id, number, label]) => <button key={id} className={current === id ? 'active' : ''} onClick={() => { onSelect(id); setOpen(false); }}><span>{number}</span><strong>{label}</strong>{current === id && <Icon name="check" />}</button>)}</div>
    </section>}
    <button className="mockup-switcher-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Render another mockup" title="Render another mockup"><Icon name="grid" size={22} /><span>Mockups</span></button>
  </div>;
}

function ConsoleChrome({ children, onHome }) {
  return <div className="console-screen">
    <header className="console-topbar">
      <button className="console-logo" onClick={onHome} aria-label="AWS Console home">aws<span>⌣</span></button>
      <span className="console-product-mark"><Icon name="spark" size={19} /></span>
      <button className="console-grid-button" aria-label="Open services"><Icon name="grid" size={22} /></button>
      <label className="console-search"><Icon name="search" size={20} /><input placeholder="Search" /><span>[Option+S]</span></label>
      <div className="console-actions"><Icon name="terminal" /><Icon name="bell" /><Icon name="help" /><Icon name="settings" /><span className="console-region">United States (N. Virginia)⌄</span><span className="console-user">Admin/nkmoorth-Isengard</span></div>
    </header>
    {children}
  </div>;
}

function RegionNotice() {
  return <div className="region-notice"><Icon name="info" size={18} /><span>AWS Transform may securely transmit data across AWS Regions within your geography for processing. For more information, access <a href="#documentation">AWS Transform documentation <Icon name="external" /></a>.</span></div>;
}

function LandingPage({ onManageUsers, onEnterApp }) {
  const capabilities = [
    ['Assess Infrastructure', 'Evaluate on-premises infrastructure for cloud migration. Get TCO analysis and migration planning recommendations.'],
    ['Migrate Workloads', 'Assess, plan, and migrate virtual and physical servers to AWS with automated landing zone creation, network migration, and optimized EC2 instance launch.'],
    ['Transform Custom Applications', 'Use agentic workflows to modernize applications, APIs, frameworks, and versions at scale.'],
    ['Continuous Modernization', 'Continuously assess your application portfolio, prioritize findings, and create remediations.'],
  ];
  return <ConsoleChrome>
    <div className="console-service-strip"><Icon name="menu" /><Icon name="spark" /></div>
    <RegionNotice />
    <section className="landing-hero"><div className="landing-content"><div className="landing-copy"><p>Migration &amp; Modernization</p><h1>AWS Transform</h1><h2>Agentic modernization of mainframe, VMware,<br />Windows, and custom applications.</h2><strong>AWS Transform is a collaborative enterprise IT transformation workbench powered by expert agents, agentic AI systems, and continuous learning that accelerates cloud migration, legacy app modernization, and tech debt reduction. It offers purpose-built transformations for mainframe, VMware, and Windows workloads. It also helps modernize any legacy code: from updating frameworks, APIs, or versions to any custom transformations.</strong></div><aside className="use-transform-card"><h2>Use AWS Transform</h2><p>Manage users and groups to use the AWS Transform web application, or download AWS Transform CLI for custom code modernization.</p><button onClick={onManageUsers}>Manage web application users</button><button>Download AWS Transform CLI <Icon name="external" /></button></aside></div></section>
    <section className="landing-lower"><div className="capability-area"><h2>With AWS Transform you can</h2><div className="capability-grid">{capabilities.map(([title, description]) => <button key={title} className="capability-card" onClick={title === 'Continuous Modernization' ? onEnterApp : undefined}><h3>{title}</h3><p>{description}</p></button>)}</div></div><aside className="pricing-card"><h2>Pricing</h2><p>Currently, AWS Transform offers migration and modernization of enterprise workloads, such as Windows, server migration (including VMware), and mainframe, at no cost, and offers custom transformations for code, APIs, frameworks, and more as a paid feature. You pay for AWS resources you create to run your application. You only pay for what you use, as you use it; there are no minimum fees and no upfront commitments.</p><a href="#pricing">Learn more <Icon name="external" /></a></aside></section>
    <footer className="console-footer"><span>© 2026, Amazon Web Services, Inc. or its affiliates.</span><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#cookies">Cookie preferences</a></footer>
  </ConsoleChrome>;
}

function ServiceManagementPage({ onHome, onEnterApp }) {
  return <ConsoleChrome onHome={onHome}>
    <div className="console-breadcrumbs"><button className="console-menu-round"><Icon name="menu" /></button><button onClick={onHome}>AWS Transform</button><Icon name="forward" /><strong>Service management</strong><Icon name="spark" /></div>
    <div className="service-layout"><aside className="service-sidebar"><div className="sidebar-title"><h2>AWS Transform</h2><Icon name="back" /></div><nav><button className="active">Service management</button><button>Partner agents</button><button>Connectors</button></nav><hr /><a href="#documentation">Documentation <Icon name="external" /></a></aside>
      <main className="service-main"><RegionNotice /><h1>Service management</h1><section className="service-card"><div className="service-card-title"><h2>Your AWS Transform service</h2><Button variant="outline">Delete</Button></div><div className="service-details"><div><strong>Web application URL (with IAM)</strong><button className="copy-value" onClick={onEnterApp}><Icon name="copy" /><span>https://7223601f9a2dccc7c.transform.us-east-1.on.aws/signin/</span></button><strong>Service profile ARN</strong><span><Icon name="copy" /> arn:aws:transform:us-east-1:522403652850:profile/EMRQHCRY44Y4</span></div><div><strong>CLI install command &nbsp;<a href="#install">View install instruction <Icon name="external" /></a></strong><span><Icon name="copy" /> curl -fsSL https://transform-cli.awstatic.com/install.sh | bash</span><strong>Tenant ID</strong><span><Icon name="copy" /> 7223601f9a2dccc7c</span></div></div></section><div className="service-tabs"><button className="active">Users</button><button>Settings</button></div><section className="service-card access-card"><h2>User access</h2><div className="access-details"><div><strong>Access model</strong><span>IAM-only access</span></div><div><strong>IAM access</strong><span className="enabled"><Icon name="check" /> Enabled</span></div></div></section></main>
    </div><button className="console-assistant-fab" onClick={onEnterApp} aria-label="Open AWS Transform"><Icon name="spark" size={28} /></button>
  </ConsoleChrome>;
}

function ImprovedGlobalNav({ onNavigate, active = 'Dashboard' }) {
  const items = [
    ['Dashboard', 'improved-dashboard'],
    ["What's new", 'improved-whats-new'],
    ['Documentation', 'improved-documentation'],
    ['Blog posts', 'improved-blog-posts'],
    ['Success stories', 'improved-success-stories'],
  ];
  return <nav className="improved-global-nav" aria-label="AWS Transform navigation"><div className="improved-nav-context"><Icon name="spark" size={18} /><div className="improved-nav-brand"><strong>AWS Transform Continuous Modernization</strong><span>Continuously understand, improve, and validate your application portfolio.</span></div></div><div className="improved-nav-links">{items.map(([label, target], index) => <button key={label} className={`${active === label ? 'active' : ''} ${index === 0 ? 'dashboard-link' : ''}`} onClick={() => onNavigate(target)}>{label}</button>)}</div></nav>;
}

function ImprovedAssistantControl({ context, onNavigate }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="assistant-fab improved-assistant-launcher" onClick={() => setOpen(true)} aria-label="Open AWS Transform assistant"><BrandMark size={24} /><span>AWS Transform</span></button>;
  return <GuidedWalkthrough initial="general" context={context} onNavigate={onNavigate} onClose={() => setOpen(false)} />;
}

function ImprovedResourcePage({ page, onNavigate }) {
  const content = {
    "What's new": { eyebrow: 'Product updates', title: "What's new in Continuous Modernization", subtitle: 'Recent capabilities, workflow improvements, and service announcements.', cards: [['Aug 27, 2026', 'GitHub App organization connections', 'Connect repositories with durable, organization-owned authorization and scoped access.'], ['Aug 20, 2026', 'Remediation approval queue', 'Review branches, applied changes, validation, and approval state from one focused queue.'], ['Aug 12, 2026', 'Phase-level analysis progress', 'Track repository heartbeats, active phases, failures, and estimated completion time.']] },
    Documentation: { eyebrow: 'Documentation', title: 'Continuous Modernization documentation', subtitle: 'Guidance organized around the modernization lifecycle.', cards: [['Get started', 'Set up your first portfolio', 'Prepare infrastructure, install the GitHub App, select repositories, and run a baseline.'], ['Understand', 'Analyze and prioritize findings', 'Learn how analysis types, findings, scoring, and initiatives fit together.'], ['Remediate', 'Create and validate changes', 'Review transformation scope, GitHub branches, validation checks, approvals, and merge state.']] },
    'Blog posts': { eyebrow: 'From the AWS Transform team', title: 'Continuous Modernization blog', subtitle: 'Practical guidance for continuously improving enterprise software estates.', cards: [['8 min read', 'From findings to validated resolution', 'Design a repeatable lifecycle that connects technical-debt discovery to safe, approved changes.'], ['6 min read', 'Why organization-owned source access matters', 'Use GitHub Apps to improve governance, auditability, and credential lifecycle management.'], ['10 min read', 'Building trust in long-running analysis', 'Give teams phase-level status, repository heartbeats, errors, and actionable recovery.']] },
    'Success stories': { eyebrow: 'Customer outcomes', title: 'Continuous Modernization success stories', subtitle: 'How teams reduce technical debt while keeping developers in control.', cards: [['Financial services', '42% faster runtime modernization', 'A platform team prioritized 180 repositories and validated upgrade branches before owner approval.'], ['Digital commerce', '12,000 findings organized into 340 initiatives', 'Related findings were grouped into actionable work with transparent impact and effort scoring.'], ['Media and entertainment', '90% less credential maintenance', 'GitHub App connections replaced employee-owned tokens across 23 organizations.']] },
  }[page];
  return <RailShell active={page} onNavigate={onNavigate}><main className="resource-main"><span className="eyebrow">{content.eyebrow}</span><h1>{content.title}</h1><p className="resource-subtitle">{content.subtitle}</p><div className="resource-card-grid">{content.cards.map(([meta, title, description]) => <article className="card" key={title}><span>{meta}</span><h2>{title}</h2><p>{description}</p><button className="link-button">Read more <Icon name="forward" /></button></article>)}</div><section className="resource-help-card"><div><h2>Looking for something specific?</h2><p>Search lifecycle guidance, troubleshooting, source authorization, and remediation workflows.</p></div><SearchBox value="" onChange={() => {}} placeholder="Search Continuous Modernization" /></section></main></RailShell>;
}

function ImprovedLanding({ onStart, onOpen, onNavigate }) {
  const lifecycle = [
    ['Connect', 'Bring in organization-owned source access'], ['Understand', 'Build a current portfolio baseline'], ['Prioritize', 'Focus teams on the highest-value work'],
    ['Remediate', 'Execute governed transformations'], ['Validate', 'Prove every change before merge'], ['Reassess', 'Keep the portfolio continuously current'],
  ];
  return <ConsoleChrome>
    <RegionNotice />
    <section className="improved-landing-hero"><div className="improved-landing-copy"><span className="eyebrow">AWS Transform · Continuous Modernization</span><h1>Keep every application ready for what’s next.</h1><p>Understand your software estate, prioritize the work that matters, and continuously move findings through validated resolution—with one durable modernization history.</p><div className="hero-actions"><Button onClick={onStart}>Set up Continuous Modernization</Button><Button variant="outline" onClick={onOpen}>Open existing portfolio</Button></div><div className="hero-proof"><span><Icon name="check" /> Organization-owned access</span><span><Icon name="check" /> Validated remediations</span><span><Icon name="check" /> Persistent portfolio context</span></div></div><aside className="next-step-card"><span className="eyebrow">Your next step</span><h2>Start with a guided baseline</h2><p>We’ll verify infrastructure, connect your source organization, and run an initial analysis. You stay in control at every step.</p><ul><li>About 10 minutes to configure</li><li>Read-only until you approve a remediation</li><li>Resume setup at any time</li></ul><Button onClick={onStart}>Begin guided setup <Icon name="forward" /></Button></aside></section>
    <section className="improved-landing-body"><div className="section-intro"><span className="eyebrow">One continuous lifecycle</span><h2>From connection to validated resolution</h2><p>Every screen shows what AWS Transform understands, what is happening now, and the clearest next action.</p></div><div className="lifecycle-cards">{lifecycle.map(([title, description], index) => <article key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div><div className="outcome-strip"><div><strong>29</strong><span>portfolio findings understood</span></div><div><strong>4</strong><span>ready for automated remediation</span></div><div><strong>100%</strong><span>changes validated before merge</span></div></div></section>
  </ConsoleChrome>;
}

function LifecycleRail({ active }) {
  const stages = ['Connect', 'Understand', 'Prioritize', 'Remediate', 'Validate', 'Reassess'];
  const activeIndex = stages.indexOf(active);
  return <div className="lifecycle-rail">{stages.map((stage, index) => <div key={stage} className={`${index < activeIndex ? 'complete' : ''} ${stage === active ? 'active' : ''}`}><span>{index < activeIndex ? <Icon name="check" /> : index + 1}</span><strong>{stage}</strong>{index < stages.length - 1 && <i />}</div>)}</div>;
}

function ImprovedProductShell({ activeTab, stage, title, subtitle, actions, onNavigate, children, showLifecycle = false }) {
  return <RailShell active={activeTab} onNavigate={onNavigate}>{showLifecycle && <LifecycleRail active={stage} />}<div className="dash-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="dash-title-actions">{actions}</div>}</div>{children}</RailShell>;
}

function GuidedOnboarding({ onContinue, onBack, onConnectSource, onNavigate }) {
  const [method, setMethod] = useState('GitHub App');
  const METHODS = ['GitHub App', 'GitHub PAT', 'GitLab', 'Bitbucket'];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRoutes = { 'Continuous modernization': 'improved-dashboard', "What's new": 'improved-whats-new', Documentation: 'improved-documentation', 'Blog posts': 'improved-blog-posts', 'Success stories': 'improved-success-stories' };
  return <div className="onboarding-screen"><header className="topbar improved-brandbar"><div className="brand-wrap"><button className="icon-button" onClick={onBack} aria-label="Back"><Icon name="back" size={20} /></button><button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button><span className="brandbar-mark"><Icon name="spark" size={18} /></span><div className="brandbar-text"><strong>AWS Transform Continuous Modernization</strong><span>Continuously understand, improve, and validate your application portfolio.</span></div><span className="concept-chip">Guided setup</span></div><div className="top-actions"><button className="text-button">Save and exit</button><span className="divider" /><span>N. Virginia (us-east-1)</span><button className="avatar">N</button></div></header><GlobalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={(label) => { if (drawerRoutes[label]) onNavigate(drawerRoutes[label]); }} /><div className="onboarding-wrap"><div className="onboarding-title"><span className="eyebrow">Continuous Modernization setup</span><h1>Build your first portfolio baseline</h1><p>We’ll verify each prerequisite before analysis begins. Nothing changes in your repositories during setup.</p></div><div className="onboarding-progress"><div className="active"><span>1</span><strong>Prepare account</strong></div><i /><div><span>2</span><strong>Connect source</strong></div><i /><div><span>3</span><strong>Select repositories</strong></div><i /><div><span>4</span><strong>Run baseline</strong></div></div><div className="onboarding-grid"><section className="setup-checklist card"><div className="setup-check complete"><span><Icon name="check" /></span><div><h3>Account readiness</h3><p>Required service role and regional infrastructure are ready.</p><small>Verified just now · us-east-1</small></div><Button variant="outline">View details</Button></div><div className="setup-check current"><span>2</span><div><h3>Connect your source organization</h3><p>Choose how AWS Transform accesses your repositories — the GitHub App gives organization-owned, least-privilege access (recommended).</p><div className="segmented onboarding-methods">{METHODS.map((m) => <button key={m} type="button" className={method === m ? 'active' : ''} onClick={() => setMethod(m)}>{m === 'GitHub App' ? 'GitHub App · recommended' : m}</button>)}</div><div className="permission-pills"><span>Read metadata</span><span>Read code</span><span>Check status</span></div></div><Button onClick={onConnectSource}>{method === 'GitHub App' ? 'Install GitHub App' : `Connect with ${method}`} <Icon name="external" /></Button></div><div className="setup-check"><span>3</span><div><h3>Choose the first repositories</h3><p>We’ll recommend related repositories after the connection is verified.</p></div><span className="waiting-label">Waiting</span></div><div className="setup-check"><span>4</span><div><h3>Run baseline analysis</h3><p>Review scope, expected duration, and outputs before launching.</p></div><span className="waiting-label">Waiting</span></div></section><aside className="setup-summary card"><span className="eyebrow">Setup outcome</span><h2>A trusted starting point</h2><ul><li><Icon name="check" /> Durable organization connection</li><li><Icon name="check" /> Repository inventory and health</li><li><Icon name="check" /> Initial technical-debt baseline</li><li><Icon name="check" /> Prioritized next actions</li></ul><div className="security-note"><Icon name="info" /><p><strong>Your access model</strong><br />The GitHub App replaces employee-owned personal access tokens. Permissions can be reviewed or revoked by an organization administrator.</p></div><Button onClick={onContinue}>Preview completed setup</Button></aside></div></div></div>;
}

// Source providers for the connection flow. OAuth providers open a mocked consent window; the PAT is pasted in.
const SOURCE_PROVIDERS = {
  'GitHub App': { mark: 'github', brand: 'GitHub', host: 'github.com', oauth: true, accountWord: 'organization', accounts: ['AWS-Transform-Demo', 'acme-payments'], defaultAccount: 'AWS-Transform-Demo',
    title: 'Connect a GitHub organization', subtitle: 'Use the AWS Transform GitHub App for durable, organization-owned repository access.', steps: ['Install GitHub App', 'Repository access', 'Review permissions', 'Connection ready'],
    heading: 'Install AWS Transform for GitHub', blurb: 'Authorize the app once at the organization level. No employee personal access token is stored or reused.', cta: 'Install and continue',
    benefits: [['Organization owned', 'Administrators control installation and repository scope.'], ['Least privilege', 'Read-only access until a remediation branch is explicitly approved.'], ['Auditable and revocable', 'Review access and revoke the installation from GitHub at any time.']],
    scopes: [['Repository metadata', 'Read organization and repository details', 'read'], ['Repository contents', 'Read code for analysis', 'read'], ['Checks and statuses', 'Read validation results', 'read']], writeScopes: [['Branches and pull requests', 'Create changes after explicit approval']],
    authUrl: 'github.com/apps/aws-transform/installations/new', credential: 'GitHub App installation token · short lived', owner: 'GitHub organization administrators', revoke: 'GitHub organization settings', authLabel: 'GitHub App' },
  'GitHub PAT': { mark: 'github', brand: 'GitHub', host: 'github.com', oauth: false, accountWord: 'organization', accounts: ['AWS-Transform-Demo'], defaultAccount: 'AWS-Transform-Demo',
    title: 'Connect GitHub with a personal access token', subtitle: 'Use a fine-grained token when you can’t install the GitHub App. The token belongs to the person who creates it.', steps: ['Add token', 'Repository access', 'Review permissions', 'Connection ready'],
    heading: 'Add a GitHub personal access token', blurb: 'Create a fine-grained token in GitHub → Settings → Developer settings, then paste it here. AWS Transform stores it in AWS Secrets Manager.', cta: 'Validate token',
    scopes: [['Metadata', 'Read-only · required by GitHub', 'read'], ['Contents', 'Read-only · read code for analysis', 'read'], ['Commit statuses', 'Read-only · read validation results', 'read']], writeScopes: [['Contents and pull requests', 'Read and write · only if you’ll approve remediations']],
    credential: 'Fine-grained PAT · stored in AWS Secrets Manager', owner: 'The token’s creator', revoke: 'GitHub developer settings', authLabel: 'Personal access token' },
  GitLab: { mark: 'gitlab', brand: 'GitLab', host: 'gitlab.com', oauth: true, accountWord: 'group', accounts: ['aws-transform-demo', 'acme/payments'], defaultAccount: 'aws-transform-demo', selfManaged: true,
    title: 'Connect a GitLab group', subtitle: 'Authorize AWS Transform with GitLab OAuth. Works with GitLab.com and self-managed GitLab 15.0+.', steps: ['Authorize GitLab', 'Project access', 'Review permissions', 'Connection ready'],
    heading: 'Authorize AWS Transform for GitLab', blurb: 'Sign in to GitLab and approve access for one group. Tokens refresh automatically and can be revoked in GitLab.', cta: 'Authorize with GitLab',
    benefits: [['Group scoped', 'Access is limited to the group and projects you choose next.'], ['Refreshing tokens', 'Short-lived OAuth tokens rotate automatically; nothing to renew.'], ['Revocable', 'Remove AWS Transform from GitLab → Preferences → Applications at any time.']],
    scopes: [['read_api', 'Read groups, projects and merge request metadata', 'read'], ['read_repository', 'Read code for analysis', 'read']], writeScopes: [['write_repository · api', 'Push branches and open merge requests after explicit approval']],
    authUrl: 'gitlab.com/oauth/authorize?client_id=aws-transform&scope=read_api+read_repository', credential: 'GitLab OAuth token · refreshes every 2 hours', owner: 'GitLab group owners', revoke: 'GitLab application settings', authLabel: 'GitLab OAuth' },
  Bitbucket: { mark: 'bitbucket', brand: 'Bitbucket', host: 'bitbucket.org', oauth: true, accountWord: 'workspace', accounts: ['aws-transform-demo', 'acme-payments'], defaultAccount: 'aws-transform-demo',
    title: 'Connect a Bitbucket workspace', subtitle: 'Authorize AWS Transform with Bitbucket Cloud OAuth 2.0 for workspace-level repository access.', steps: ['Authorize Bitbucket', 'Repository access', 'Review permissions', 'Connection ready'],
    heading: 'Authorize AWS Transform for Bitbucket', blurb: 'Sign in with your Atlassian account and grant access to one workspace. Workspace admins can revoke it at any time.', cta: 'Authorize with Bitbucket',
    benefits: [['Workspace scoped', 'Access covers one workspace and the repositories you choose.'], ['Least privilege', 'Read-only until you approve a remediation pull request.'], ['Revocable', 'Workspace admins can remove the app from Bitbucket settings.']],
    scopes: [['account', 'Read your workspace membership', 'read'], ['repository', 'Read code for analysis', 'read'], ['pipeline', 'Read build and validation results', 'read']], writeScopes: [['repository:write · pullrequest:write', 'Push branches and open pull requests after explicit approval']],
    authUrl: 'bitbucket.org/site/oauth2/authorize?client_id=aws-transform&response_type=code', credential: 'Bitbucket OAuth token · refreshes hourly', owner: 'Bitbucket workspace admins', revoke: 'Bitbucket workspace settings', authLabel: 'Bitbucket OAuth' },
  'Azure DevOps': { mark: 'azure', brand: 'Microsoft', host: 'login.microsoftonline.com', oauth: true, accountWord: 'organization', accounts: ['aws-transform-demo', 'acme-engineering'], defaultAccount: 'aws-transform-demo',
    title: 'Connect an Azure DevOps organization', subtitle: 'Sign in with Microsoft Entra ID to give AWS Transform access to Azure Repos.', steps: ['Sign in with Microsoft', 'Repository access', 'Review permissions', 'Connection ready'],
    heading: 'Authorize AWS Transform for Azure DevOps', blurb: 'Sign in with your Microsoft work account and consent for one Azure DevOps organization.', cta: 'Sign in with Microsoft',
    benefits: [['Entra ID governed', 'Conditional access and admin consent policies apply.'], ['Least privilege', 'Read-only until a remediation pull request is approved.'], ['Revocable', 'Revoke from Azure DevOps → User settings → Authorizations.']],
    scopes: [['vso.code', 'Read code, commits and branches', 'read'], ['vso.build', 'Read pipeline and validation results', 'read']], writeScopes: [['vso.code_write', 'Push branches and open pull requests after explicit approval']],
    authUrl: 'login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=aws-transform', credential: 'Entra ID OAuth token · refreshes hourly', owner: 'Azure DevOps organization admins', revoke: 'Azure DevOps authorizations', authLabel: 'Microsoft Entra OAuth' },
};
const SOURCE_METHODS = Object.keys(SOURCE_PROVIDERS);
const SOURCE_REPOS = [['LegacyNodeJSOrderingSystem', 'Node.js · Updated 3 days ago', true], ['MKPMobile', 'JavaScript · Updated 8 days ago', true], ['MyLearning', 'TypeScript · Updated 2 weeks ago', true], ['orders-infrastructure', 'CDK · Updated yesterday', false], ['payments-service', 'Java · Updated 4 days ago', false], ['payments-ui', 'AngularJS · Updated 1 week ago', false], ['spring-petclinic', 'Java · Updated 3 weeks ago', false]];

function ProviderMark({ name, size = 26 }) {
  if (name === 'gitlab') return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#e24329" d="m12 21.4 3.7-11.3H8.3Z" /><path fill="#fc6d26" d="M12 21.4 8.3 10.1H3.1Z" /><path fill="#fca326" d="M3.1 10.1 2 13.6a.8.8 0 0 0 .3.9L12 21.4Z" /><path fill="#e24329" d="M3.1 10.1h5.2L6.1 3.2a.4.4 0 0 0-.7 0Z" /><path fill="#fc6d26" d="m12 21.4 3.7-11.3h5.2Z" /><path fill="#fca326" d="m20.9 10.1 1.1 3.5a.8.8 0 0 1-.3.9L12 21.4Z" /><path fill="#e24329" d="M20.9 10.1h-5.2l2.2-6.9a.4.4 0 0 1 .7 0Z" /></svg>;
  if (name === 'bitbucket') return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#2684ff" d="M2.7 3a.7.7 0 0 0-.7.8l2.9 17.5c.1.4.4.7.9.7h12.5c.3 0 .6-.2.7-.6L21.9 3.8a.7.7 0 0 0-.7-.8Zm11.8 12.6h-5l-1.3-7h7.6Z" /></svg>;
  if (name === 'azure') return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#0078d4" d="M22 6.2v11.3l-4.6 3.8-7.2-2.6v2.6L6.1 16l11.9.9V6.7Zm-4 .5L11.3 2.6v2.7L5.2 7.1 3 9.9v6.4l2.6 1.1V9.1Z" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" /></svg>;
}

// A mocked provider consent window: sign in → consent → redirect back to the console with an auth code.
function OAuthWindow({ provider, method, account, setAccount, instance, onCancel, onDone }) {
  const [stage, setStage] = useState('signin');
  const host = provider.selfManaged && instance !== 'gitlab.com' ? instance.replace(/^https?:\/\//, '') : provider.host;
  const state = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  const url = stage === 'redirect' ? `us-east-1.console.aws.amazon.com/transform/oauth/callback?code=${state}x7Kq&state=${state}` : stage === 'signin' ? `${host}/login?return_to=${encodeURIComponent(provider.authUrl.replace(provider.host, ''))}` : provider.authUrl.replace(provider.host, host);
  useEffect(() => {
    if (stage !== 'redirect') return undefined;
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [stage, onDone]);
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && stage !== 'redirect' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, onCancel]);
  const isGitHub = provider.mark === 'github';
  return <div className="oauth-layer" role="dialog" aria-modal="true" aria-label={`${provider.brand} authorization`}>
    <div className="oauth-window">
      <div className="oauth-chrome"><span className="oauth-dots"><i /><i /><i /></span><span className="oauth-url"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>https://{url}</span>{stage !== 'redirect' && <button type="button" onClick={onCancel} aria-label="Close window">×</button>}</div>
      <div className={`oauth-body oauth-${provider.mark}`}>
        {stage === 'signin' && <div className="oauth-panel">
          <span className="oauth-logo"><ProviderMark name={provider.mark} size={40} /></span>
          <h2>Sign in to {provider.brand === 'Microsoft' ? 'your Microsoft account' : provider.brand}</h2>
          <p>to continue to <strong>AWS Transform</strong></p>
          <label><span>{provider.brand === 'Microsoft' ? 'Work email' : provider.brand === 'Bitbucket' ? 'Atlassian email' : 'Username or email address'}</span><input defaultValue={provider.brand === 'GitHub' || provider.brand === 'GitLab' ? 'nkmoorth' : 'nkmoorth@example.com'} /></label>
          <label><span>Password</span><input type="password" defaultValue="prototype-password" /></label>
          <button type="button" className="oauth-primary" onClick={() => setStage('consent')}>Sign in</button>
          <small>Single sign-on and passkeys work here too. AWS Transform never sees your password.</small>
        </div>}
        {stage === 'consent' && <div className="oauth-panel wide">
          <div className="oauth-pair"><span className="oauth-aws"><BrandMark size={26} /></span><i /><span className="oauth-logo"><ProviderMark name={provider.mark} size={30} /></span></div>
          <h2>{isGitHub ? `Install & authorize AWS Transform` : `Authorize AWS Transform`}</h2>
          <p><strong>AWS Transform</strong> by Amazon Web Services wants to access your {provider.brand === 'Microsoft' ? 'Azure DevOps' : provider.brand} {provider.accountWord}.</p>
          <label><span>{isGitHub ? 'Install on' : `${provider.accountWord.charAt(0).toUpperCase()}${provider.accountWord.slice(1)}`}</span><select value={account} onChange={(event) => setAccount(event.target.value)}>{provider.accounts.map((name) => <option key={name}>{name}</option>)}</select></label>
          <ul className="oauth-scopes">{provider.scopes.map(([name, detail]) => <li key={name}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg><span><strong>{name}</strong><small>{detail}</small></span></li>)}</ul>
          <p className="oauth-note">Write access ({provider.writeScopes.map(([name]) => name).join(', ')}) is requested later, only when you approve a remediation.</p>
          <div className="oauth-actions"><button type="button" className="oauth-secondary" onClick={onCancel}>Cancel</button><button type="button" className="oauth-primary" onClick={() => setStage('redirect')}>{isGitHub ? 'Install & Authorize' : provider.brand === 'Microsoft' ? 'Accept' : 'Authorize'}</button></div>
          <small>Authorizing redirects you to <span className="mono">console.aws.amazon.com</span>. You can revoke access in {provider.revoke}.</small>
        </div>}
        {stage === 'redirect' && <div className="oauth-panel oauth-redirect"><span className="oauth-spinner" aria-hidden="true" /><h2>Returning to AWS Transform…</h2><p>Exchanging the authorization code and verifying access to <strong>{account}</strong>.</p></div>}
      </div>
    </div>
  </div>;
}

function ImprovedSourceConnection({ onNavigate }) {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState('GitHub App');
  const provider = SOURCE_PROVIDERS[method];
  const [account, setAccount] = useState(provider.defaultAccount);
  const [instance, setInstance] = useState('gitlab.com');
  const [customHost, setCustomHost] = useState('https://gitlab.acme.internal');
  const [oauthOpen, setOauthOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [token, setToken] = useState('');
  const [tokenState, setTokenState] = useState('idle');
  const [scope, setScope] = useState('selected');
  const [picked, setPicked] = useState(() => new Set(SOURCE_REPOS.filter((repo) => repo[2]).map(([name]) => name)));
  const [repoQuery, setRepoQuery] = useState('');
  const chooseMethod = (next) => { setMethod(next); setAccount(SOURCE_PROVIDERS[next].defaultAccount); setNotice(null); setTokenState('idle'); setToken(''); };
  const host = provider.selfManaged && instance === 'self' ? customHost : provider.host;
  const validateToken = () => {
    if (!/^(github_pat_|ghp_)\w{20,}/.test(token.trim())) { setTokenState('invalid'); return; }
    setTokenState('checking');
    window.setTimeout(() => setTokenState('valid'), 1100);
  };
  const repoCount = scope === 'all' ? 116 : picked.size;
  const repoText = scope === 'all' ? `All repositories in ${account}` : `${picked.size} selected ${picked.size === 1 ? 'repository' : 'repositories'}`;
  const togglePick = (name) => setPicked((set) => { const next = new Set(set); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  const reposShown = SOURCE_REPOS.filter(([name]) => !repoQuery || name.toLowerCase().includes(repoQuery.toLowerCase()));
  const projectWord = method === 'GitLab' ? 'project' : 'repository';
  return <ImprovedProductShell activeTab="Sources" stage="Connect" title={provider.title} subtitle={provider.subtitle} actions={step < 4 && method.startsWith('GitHub') && <button className="link-button" onClick={() => chooseMethod('GitHub App')}>Why GitHub App?</button>} onNavigate={onNavigate}>
    <div className="github-flow-steps">{provider.steps.map((label, index) => <div key={label} className={`${index + 1 < step ? 'complete' : ''} ${index + 1 === step ? 'active' : ''}`}><span>{index + 1 < step ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong>{index < provider.steps.length - 1 && <i />}</div>)}</div>
    {step === 1 && <div className="access-method"><span className="eyebrow">Access method</span><div className="segmented">{SOURCE_METHODS.map((m) => <button key={m} type="button" className={method === m ? 'active' : ''} onClick={() => chooseMethod(m)}>{m === 'GitHub App' ? 'GitHub App · recommended' : m}</button>)}</div></div>}
    {step === 1 && notice && <div className="oauth-notice" role="status"><Icon name="info" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
    {step === 1 && <div className="github-flow-grid"><section className="card github-install-card">
      <div className="github-app-heading"><span className={`github-app-mark mark-${provider.mark}`}><ProviderMark name={provider.mark} size={28} /></span><div><span className="eyebrow">Step 1 of 4</span><h2>{provider.heading}</h2><p>{provider.blurb}</p></div></div>
      {provider.oauth ? <>
        <div className="github-benefits">{provider.benefits.map(([title, detail]) => <div key={title}><Icon name="check" /><span><strong>{title}</strong><small>{detail}</small></span></div>)}</div>
        {provider.selfManaged && <div className="source-instance"><strong>GitLab instance</strong><label><input type="radio" name="gl-instance" checked={instance === 'gitlab.com'} onChange={() => setInstance('gitlab.com')} />GitLab.com</label><label><input type="radio" name="gl-instance" checked={instance === 'self'} onChange={() => setInstance('self')} />Self-managed</label>{instance === 'self' && <input className="source-host" value={customHost} onChange={(event) => setCustomHost(event.target.value)} aria-label="GitLab instance URL" />}</div>}
        <div className="github-org-picker"><label><strong>{method === 'GitHub App' ? 'GitHub account' : `${provider.brand === 'Microsoft' ? 'Azure DevOps' : provider.brand} ${provider.accountWord}`}</strong><select value={account} onChange={(event) => setAccount(event.target.value)}>{provider.accounts.map((name) => <option key={name}>{name}</option>)}<option disabled>Choose another in the {provider.brand} window…</option></select></label><Button onClick={() => { setNotice(null); setOauthOpen(true); }}>{provider.cta} <Icon name="external" /></Button></div>
        <p className="source-redirect-note">Opens {host.replace(/^https?:\/\//, '')} in a new window. You’ll come back here after you approve.</p>
      </> : <>
        <div className="pat-warning"><Icon name="warning" /><div><strong>Tokens are tied to one person</strong><p>If they leave or the token expires, analyses and remediations stop. GitHub App access is organization owned and doesn’t expire. <button type="button" className="dash-link" onClick={() => chooseMethod('GitHub App')}>Use the GitHub App instead</button></p></div></div>
        <ol className="pat-steps"><li>In GitHub, open <span className="mono">Settings → Developer settings → Fine-grained tokens</span> and choose <strong>Generate new token</strong>.</li><li>Set <strong>Resource owner</strong> to <strong>{account}</strong> and pick the repositories to analyze.</li><li>Grant the permissions listed on the right, set an expiry of 90 days or less, then copy the token.</li></ol>
        <label className="pat-field"><strong>Personal access token</strong><input type="password" value={token} onChange={(event) => { setToken(event.target.value); setTokenState('idle'); }} placeholder="github_pat_…" autoComplete="off" spellCheck={false} aria-invalid={tokenState === 'invalid'} /></label>
        {tokenState === 'invalid' && <p className="pat-error">That doesn’t look like a GitHub token. Fine-grained tokens start with <span className="mono">github_pat_</span>.</p>}
        {tokenState === 'idle' && !token && <button type="button" className="dash-link pat-sample" onClick={() => setToken(`github_pat_11AXDEMO${Math.random().toString(36).slice(2, 12)}PrototypeToken`)}>Paste a sample token</button>}
        {tokenState === 'checking' && <p className="pat-checking"><span className="oauth-spinner small" aria-hidden="true" />Checking the token with GitHub…</p>}
        {tokenState === 'valid' && <dl className="pat-result"><div><dt>Token owner</dt><dd>nkmoorth</dd></div><div><dt>Resource owner</dt><dd>{account}</dd></div><div><dt>Permissions</dt><dd><Icon name="check" /> Metadata, Contents, Commit statuses (read)</dd></div><div><dt>Expires</dt><dd className="pat-expiry">Jan 11, 2027 · in 90 days</dd></div></dl>}
        <div className="github-flow-actions">{tokenState === 'valid' ? <Button onClick={() => setStep(2)}>Continue</Button> : <Button onClick={validateToken} disabled={!token || tokenState === 'checking'}>{tokenState === 'checking' ? 'Validating…' : 'Validate token'}</Button>}</div>
      </>}
    </section>
    <aside className="card permission-preview"><span className="eyebrow">{provider.oauth ? 'Permission preview' : 'Required token permissions'}</span><h3>Requested now</h3><ul>{provider.scopes.map(([name, detail]) => <li key={name}><Icon name="check" /><span><strong className={provider.oauth && method !== 'GitHub App' ? 'mono' : ''}>{name}</strong><small>{detail}</small></span></li>)}</ul><h3>Requested only for remediation</h3><ul>{provider.writeScopes.map(([name, detail]) => <li key={name}><Icon name="info" /><span><strong>{name}</strong><small>{detail}</small></span></li>)}</ul><a href="#permissions">View complete permission reference <Icon name="external" /></a></aside></div>}
    {step === 2 && <section className="card github-scope-card"><div className="github-step-title"><span className="eyebrow">Step 2 of 4</span><h2>Choose {projectWord} access</h2><p>Connected to <strong>{account}</strong> with {provider.authLabel}. You can change this scope later.</p></div>
      <label className={`scope-option ${scope === 'all' ? 'selected' : ''}`}><input type="radio" name="repo-scope" checked={scope === 'all'} onChange={() => setScope('all')} /><span><strong>All {projectWord === 'project' ? 'projects' : 'repositories'}</strong><small>Automatically include current and future {projectWord === 'project' ? 'projects' : 'repositories'} in {account}.</small></span></label>
      <label className={`scope-option ${scope === 'selected' ? 'selected' : ''}`}><input type="radio" name="repo-scope" checked={scope === 'selected'} onChange={() => setScope('selected')} /><span><strong>Only selected {projectWord === 'project' ? 'projects' : 'repositories'}</strong><small>Start with a focused portfolio and expand access when needed.</small></span></label>
      {scope === 'selected' && <div className="repo-selector"><SearchBox value={repoQuery} onChange={setRepoQuery} placeholder={`Find ${projectWord === 'project' ? 'projects' : 'repositories'}`} /><div className="selected-repos">{reposShown.map(([name, detail]) => <label key={name}><input type="checkbox" checked={picked.has(name)} onChange={() => togglePick(name)} /><span><strong>{name}</strong><small>{detail}</small></span></label>)}</div><span className="selection-count">{picked.size} of 116 {projectWord === 'project' ? 'projects' : 'repositories'} selected</span></div>}
      <div className="github-flow-actions"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)} disabled={scope === 'selected' && picked.size === 0}>Review permissions</Button></div></section>}
    {step === 3 && <div className="github-review-grid"><section className="card github-review-card"><div className="github-step-title"><span className="eyebrow">Step 3 of 4</span><h2>Review the connection</h2><p>AWS Transform will create one durable source connection for {account}.</p></div>
      <dl><div><dt>{provider.accountWord.charAt(0).toUpperCase() + provider.accountWord.slice(1)}</dt><dd><ProviderMark name={provider.mark} size={15} /> {account}{provider.selfManaged && instance === 'self' ? ` · ${customHost.replace(/^https?:\/\//, '')}` : ''}</dd></div><div><dt>{projectWord === 'project' ? 'Project' : 'Repository'} access</dt><dd>{repoText}</dd></div><div><dt>Owner</dt><dd>{provider.owner}</dd></div><div><dt>Credential storage</dt><dd>{provider.credential}</dd></div></dl>
      <div className="reviewed-permissions"><h3>Granted permissions</h3>{provider.scopes.map(([name, detail]) => <span key={name}><Icon name="check" /> {name} · {detail.toLowerCase()}</span>)}<span><Icon name="info" /> Write access requested only when you approve remediation</span></div>
      {!provider.oauth && <div className="pat-warning compact"><Icon name="warning" /><p>The token expires on <strong>Jan 11, 2027</strong>. AWS Transform emails you 14 days before, and analyses pause if it lapses.</p></div>}
      <div className="github-flow-actions"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={() => setStep(4)}>Connect {provider.accountWord}</Button></div></section>
      <aside className="card connection-impact"><Icon name="info" size={24} /><h3>What happens next</h3><ol><li>AWS Transform verifies {projectWord} access.</li><li>{projectWord === 'project' ? 'Project' : 'Repository'} technologies and relationships are inventoried.</li><li>You review the recommended baseline-analysis scope.</li></ol><p>No {projectWord} changes occur during connection or analysis.</p></aside></div>}
    {step === 4 && <section className="card github-success-card"><span className="success-ring"><Icon name="check" size={30} /></span><span className="eyebrow">Step 4 of 4</span><h2>{account} is connected</h2><p>The {provider.authLabel} connection is healthy, and {scope === 'all' ? 'all 116' : `all ${repoCount}`} {scope === 'all' || repoCount !== 1 ? (projectWord === 'project' ? 'projects' : 'repositories') : projectWord} {scope === 'all' || repoCount !== 1 ? 'are' : 'is'} ready for analysis.</p>
      <div className="connection-result"><div><span>Connection</span><strong><Icon name="check" /> Healthy</strong></div><div><span>{projectWord === 'project' ? 'Projects' : 'Repositories'}</span><strong>{scope === 'all' ? 'All (116)' : `${repoCount} selected`}</strong></div><div><span>Authorization</span><strong>{provider.authLabel}</strong></div><div><span>{provider.oauth ? 'Last verified' : 'Token expires'}</span><strong>{provider.oauth ? 'Just now' : 'Jan 11, 2027'}</strong></div></div><div className="rd-actions"><Button onClick={() => onNavigate('improved-rail-sources')}>View sources</Button><button className="link-button" onClick={() => onNavigate('improved-dashboard')}>Return to dashboard</button></div></section>}
    {oauthOpen && <OAuthWindow provider={provider} method={method} account={account} setAccount={setAccount} instance={host} onCancel={() => { setOauthOpen(false); setNotice(`Authorization canceled in ${provider.brand}. Nothing was connected.`); }} onDone={() => { setOauthOpen(false); setStep(2); }} />}
  </ImprovedProductShell>;
}

const RAIL_ICON_PATHS = {
  dashboard: <><rect x="9.5" y="3.5" width="5" height="4" rx="0.8" /><rect x="3.5" y="16.5" width="5" height="4" rx="0.8" /><rect x="15.5" y="16.5" width="5" height="4" rx="0.8" /><path d="M12 7.5V12M6 16.5V12h12v4.5" /></>,
  findings: <><path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 16.8v.2" /></>,
  remediations: <><path d="M9.2 14.8 6.8 12.4l6-6C15.3 3.9 18.9 3.4 20.6 3.4c0 1.7-.5 5.3-3 7.8l-6 6Z" /><circle cx="15.6" cy="8.4" r="1.4" /><path d="M6.8 12.4 3.6 11.8l2.6-2.7h3.6M11.6 17.2l.6 3.2 2.7-2.6v-3.6M6 15.4c-1.3.3-2.2 1.6-2.4 4.6 3-.2 4.3-1.1 4.6-2.4" /></>,
  analyses: <><path d="m3 13 4.5-6 3.5 4 4-6.5 2.5 3.5" /><circle cx="14.5" cy="15" r="3.3" /><path d="m17 17.5 3.5 3.5" /></>,
  skills: <path d="M3.5 6.5h4.5a2.4 2.4 0 1 1 4.8 0h4.5V11a2.4 2.4 0 1 1 0 4.8v4.5h-4.5a2.4 2.4 0 1 0-4.8 0H3.5v-4.5a2.4 2.4 0 1 0 0-4.8Z" />,
  sources: <><circle cx="6.5" cy="5.5" r="2" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="17.5" cy="8.5" r="2" /><path d="M6.5 7.5v9M17.5 10.5c0 4-11 2.5-11 6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  docs: <><path d="M6.5 3.5h7.5l4 4v13h-11.5Z" /><path d="M9.5 12h5M9.5 15.5h5" /></>,
  spark: <path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5Z" />,
};
function RailIcon({ name }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{RAIL_ICON_PATHS[name]}</svg>;
}
const DASH_RAIL = [
  [['Dashboard', 'dashboard', false, 'improved-dashboard'], ['Analyses', 'analyses', false, 'improved-rail-analyses'], ['Findings', 'findings', () => ESTATE_FINDINGS.length, 'improved-findings'], ['Remediations', 'remediations', true, 'improved-rail-remediations'], ['Skills Library', 'skills']],
  [['Sources', 'sources'], ['Settings', 'settings']],
];
function DashboardRail({ active, onNavigate }) {
  const item = ([label, icon, dot, target = label]) => <button key={label} type="button" className={`dash-rail-item ${label === active ? 'active' : ''}`} aria-current={label === active ? 'page' : undefined} onClick={() => label !== active && onNavigate(target)}><span className="dash-rail-tile"><RailIcon name={icon} />{typeof dot === 'function' ? <b className="dash-rail-count" aria-label={`${dot()} open`}>{dot()}</b> : dot && <i className="dash-rail-dot" />}</span><span className="dash-rail-label">{label}</span></button>;
  return <nav className="dash-rail" aria-label="Continuous modernization">
    {DASH_RAIL.map((group, index) => <div key={index} className="dash-rail-group">{group.map(item)}</div>)}
    <div className="dash-rail-group dash-rail-bottom">
      {[["What's new", 'spark', false, 'improved-whats-new']].map(item)}
    </div>
  </nav>;
}

function DashboardTrend() {
  // Jul 1 → Sep 30 on x; 0–100 open findings on y. Today is Aug 26.
  // Drawn at the container's pixel width (not scaled), so text stays the same size on any screen.
  const boxRef = useRef(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const H = 230, L = 40, R = 16, T = 30, B = 28;
  const x = (day) => L + (day / 91) * (W - L - R);
  const y = (value) => T + (1 - value / 100) * (H - T - B);
  const actual = [[0, 92], [12, 88], [24, 83], [36, 76], [48, 70], [60, 63], [72, 57], [87, 49]].map(([d, v]) => [d * 57 / 87, v]);
  const today = actual[actual.length - 1];
  const line = actual.map(([d, v]) => `${x(d)},${y(v)}`).join(' ');
  const area = `${x(0)},${y(0)} ${line} ${x(today[0])},${y(0)}`;
  return <div ref={boxRef} className="dash-trend-box"><svg className="dash-trend" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Open findings fell from 92 to 49 this quarter; forecast about 31 by the Sep 30 Node 16 deadline">
    {[0, 25, 50, 75, 100].map((v) => <line key={v} x1={x(0)} x2={x(91)} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />)}
    {[0, 50, 100].map((v) => <text key={v} x={L - 12} y={y(v) + 4} textAnchor="end" className="tick">{v}</text>)}
    {[['Jul', 0], ['Aug', 31], ['Sep', 62]].map(([label, d]) => <text key={label} x={x(d)} y={H - 8} className="tick">{label}</text>)}
    <polygon points={area} className="area" />
    <polyline points={line} className="actual" />
    <line x1={x(today[0])} y1={y(today[1])} x2={x(91)} y2={y(31)} className="forecast" />
    <circle cx={x(today[0])} cy={y(today[1])} r="4.5" className="today-dot" />
    <text x={x(today[0]) + 12} y={y(today[1]) - 10} className="today-label">49 today</text>
    <line x1={x(91)} x2={x(91)} y1={T - 8} y2={y(0)} className="deadline" />
    <text x={x(91)} y={T - 16} textAnchor="end" className="deadline-label">Node 16 deadline · Sep 30</text>
    <text x={x(91) - 8} y={y(31) + 26} textAnchor="end" className="tick">Forecast ~31</text>
  </svg></div>;
}

const BREAKDOWN_COLORS = ['#688ae8', '#c33d69', '#2ea597', '#8456ce', '#e07941', '#3759ce'];
const ANALYSIS_BREAKDOWN = {
  'Agentic readiness': { repos: 1, tech: [['Unknown', 1]], categories: [['API design', 8], ['Authentication', 7], ['State management', 7], ['Data management', 7], ['Eng', 5], ['Obs', 3], ['Discoverability', 3], ['Hitl', 3]],
    top: [['API-Q1: Documented API Interface', 'API design', 'High', 1, null], ['AUTH-Q2: Scoped service credentials', 'Authentication', 'High', 1, null], ['STATE-Q1: Idempotent operations', 'State management', 'Medium', 1, null], ['DATA-Q3: Data access boundaries', 'Data management', 'Medium', 1, null]] },
  Manual: { repos: 2, tech: [['JavaScript', 1], ['TypeScript', 1]], categories: [['Configuration', 4], ['Documentation', 3], ['Testing', 2]],
    top: [['Hard-coded environment endpoints', 'Configuration', 'High', 2, null], ['Missing runbook for order replay', 'Documentation', 'Medium', 1, null], ['No contract tests for payments client', 'Testing', 'Medium', 1, null]] },
  'Modernization readiness': { repos: 4, tech: [['Node.js', 2], ['Java', 1], ['TypeScript', 1]], categories: [['Infrastructure', 9], ['Data', 6], ['Architecture', 6], ['Operations', 4], ['Security', 3]],
    top: [['INF-Q4: Containerized deployment', 'Infrastructure', 'High', 3, null], ['ARCH-Q2: Service boundaries defined', 'Architecture', 'High', 2, null], ['DATA-Q1: Schema migrations versioned', 'Data', 'Medium', 3, null], ['OPS-Q3: Centralized logging', 'Operations', 'Medium', 2, null]] },
  Security: { repos: 6, tech: [['Java', 2], ['Node.js', 1], ['React', 1], ['React Native', 1], ['AngularJS', 1]], categories: [['Vulnerable dependencies', 11], ['Secrets', 3], ['Access control', 2], ['Input validation', 2]],
    top: [['Hard-coded credentials in configuration', 'Secrets', 'Critical', 1, null], ['AWS access key committed to repository history', 'Secrets', 'Critical', 1, null], ['OpenSSL 1.1.1 vulnerabilities in container image', 'Container images', 'High', 1, 'Amazon Linux 2023 base image'], ['jsonwebtoken v8 known CVEs', 'Vulnerable dependencies', 'High', 1, 'Upgrade npm packages'], ['S3 bucket allows public read', 'Access control', 'High', 1, null]] },
  'Tech debt (comprehensive)': { repos: 5, tech: [['Node.js', 2], ['Java', 2], ['TypeScript', 1]], categories: [['Runtime upgrades', 12], ['SDK migrations', 10], ['Framework upgrades', 6], ['Code quality', 5], ['Testing', 3]],
    top: [['Node.js 16 runtime is end of life', 'Runtime upgrades', 'High', 2, 'Node.js 16 → 20'], ['AWS SDK for JavaScript v2', 'SDK migrations', 'High', 3, 'AWS SDK v2 → v3'], ['Java 11 end of support', 'Runtime upgrades', 'Medium', 2, 'Java 11 → 21'], ['Spring Boot 2.7 end of support', 'Framework upgrades', 'Medium', 1, 'Spring Boot 2 → 3']] },
  'Tech debt (quick)': { repos: 6, tech: [['Java', 2], ['Node.js', 1], ['React', 1], ['React Native', 1], ['AngularJS', 1]], categories: [['Runtime upgrades', 8], ['SDK migrations', 6], ['Dependencies', 4]],
    top: [['Node.js 16 runtime is end of life', 'Runtime upgrades', 'High', 2, 'Node.js 16 → 20'], ['AWS SDK for JavaScript v2', 'SDK migrations', 'High', 3, 'AWS SDK v2 → v3'], ['Outdated lodash 4.17.15', 'Dependencies', 'Low', 2, null]] },
};

function BreakdownDonut({ tech, repos }) {
  const total = tech.reduce((sum, [, n]) => sum + n, 0);
  const r = 70, c = 2 * Math.PI * r;
  let offset = 0;
  return <div className="breakdown-donut">
    <svg viewBox="0 0 200 200" role="img" aria-label={`${repos} repositories analyzed: ${tech.map(([name, n]) => `${name} ${n}`).join(', ')}`}>
      {tech.map(([name, n], index) => { const length = (n / total) * c; const gap = tech.length > 1 ? 3 : 0; const arc = <circle key={name} cx="100" cy="100" r={r} fill="none" stroke={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} strokeWidth="22" strokeDasharray={`${Math.max(length - gap, 0)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />; offset += length; return arc; })}
      <text x="100" y="98" textAnchor="middle" className="donut-value">{repos}</text>
      <text x="100" y="120" textAnchor="middle" className="donut-label">Repos analyzed</text>
    </svg>
    <ul className="breakdown-legend">{tech.map(([name, n], index) => <li key={name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} />{name}<span>{n}</span></li>)}</ul>
  </div>;
}

function BreakdownBars({ categories }) {
  const max = Math.max(...categories.map(([, n]) => n));
  const step = max <= 8 ? 1 : max <= 16 ? 2 : 5;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);
  return <div className="breakdown-bars" style={{ '--rows': categories.length }}>
    <div className="breakdown-bars-plot">
      <div className="breakdown-grid">{ticks.map((tick) => <i key={tick} style={{ left: `${(tick / top) * 100}%` }} />)}</div>
      {categories.map(([name, n]) => <div key={name} className="breakdown-bar-row"><span>{name}</span><div><i style={{ width: `${(n / top) * 100}%` }} title={`${name}: ${n} findings`} /></div></div>)}
      <div className="breakdown-axis"><span />{<div>{ticks.map((tick) => <small key={tick} style={{ left: `${(tick / top) * 100}%` }}>{tick}</small>)}</div>}</div>
    </div>
    <strong className="breakdown-axis-title">Findings</strong>
  </div>;
}

function AnalysisBreakdown({ onNavigate }) {
  const types = Object.keys(ANALYSIS_BREAKDOWN);
  const [active, setActive] = useState(types[0]);
  const data = ANALYSIS_BREAKDOWN[active];
  const total = data.categories.reduce((sum, [, n]) => sum + n, 0);
  return <section className="dash-card dash-breakdown">
    <header><h2>Analysis breakdown</h2></header>
    <div className="breakdown-tabs" role="tablist">{types.map((type) => <button key={type} type="button" role="tab" aria-selected={type === active} className={type === active ? 'active' : ''} onClick={() => setActive(type)}>{type}</button>)}</div>
    <div className="dash-card-body">
      <div className="breakdown-summary"><strong>{data.repos} {data.repos === 1 ? 'repository' : 'repositories'} analyzed · {total} findings</strong><Button variant="outline">Generate report</Button></div>
      <div className="breakdown-charts">
        <div><h3>Technology distribution</h3><BreakdownDonut tech={data.tech} repos={data.repos} /></div>
        <div><h3>Findings by category</h3><BreakdownBars categories={data.categories} /></div>
      </div>
      <h3>Top findings by severity</h3>
      <table className="breakdown-table"><thead><tr><th>Finding</th><th>Category</th><th>Severity</th><th>Affected repos</th><th>Transformation</th></tr></thead>
        <tbody>{data.top.map(([name, category, severity, repos, transform]) => <tr key={name}><td><button className="dash-table-link" onClick={() => openFindings(onNavigate, { title: name })}>{name}</button></td><td>{category}</td><td><span className={`breakdown-severity ${severity.toLowerCase()}`}>{severity}</span></td><td>{repos}</td><td>{transform ? <button className="dash-table-link" onClick={() => onNavigate('improved-rail-remediations')}>{transform}</button> : <span className="dash-muted">No remediation available</span>}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}

// Initiatives group findings that should change together (A9). Order is AWS Transform's recommended order.
const INITIATIVES = [
  { id: 'secrets', about: 'Exposed credentials', detectedBy: 'Secret scanning', dueTone: 'risk', stage: 'next', title: 'Remove exposed secrets', summary: 'Move credentials to AWS Secrets Manager and rotate them in each repository', kind: 'Campaign', plan: '1 skill · 3 repositories', due: 'Aug 31', effort: '1–2 days', readiness: 'skill' },
  { id: 'base-images', about: 'Vulnerable base images', detectedBy: 'Container image scan', dueTone: '', stage: 'next', title: 'Update container base images', summary: 'amazonlinux:2 → Amazon Linux 2023, which clears the OpenSSL, glibc and curl CVEs and removes Python 2.7', kind: 'Campaign', plan: '1 custom TD · 3 repositories', due: 'Sep 8', effort: '1–2 days', readiness: 'custom' },
  { id: 'mylearning', detectedBy: 'Static analysis', dueTone: '', stage: 'next', title: 'MyLearning: add tests, then upgrade React', summary: 'Test coverage first, so the React 18 upgrade can be verified', kind: 'Bundle', plan: '2 fixes · Tests, then React · 1 pull request', effort: '1 week', readiness: 'skill' },
  { id: 'java', about: 'End-of-life runtime and framework', detectedBy: 'Dependency analysis', dueTone: '', stage: 'next', title: 'Modernize the Java services', summary: 'Java 11 → 21 first, because Spring Boot 3 requires it; then AWS SDK for Java v2 and SLF4J', kind: 'Migration', plan: 'Java 21 first · Spring Boot 3 builds on it', pathNote: '2 managed TDs · run in order', due: 'Nov 30', effort: '1–2 weeks', readiness: 'managed', recommended: true },
  { id: 'access', detectedBy: 'Static analysis', dueTone: '', stage: 'next', title: 'Harden access and data protection', summary: 'IAM scope, session expiry, PII redaction and encryption in payments-service', kind: 'Campaign', plan: '3 fixes · 1 pull request', due: 'Oct 12', effort: '1–2 weeks', readiness: 'skill' },
  { id: 'n-plus-one', detectedBy: 'Code analysis', stage: 'next', title: 'N+1 queries in order history', kind: 'Standalone', effort: '3–5 days', readiness: 'skill' },
  { id: 'cicd', about: 'Manual builds and deploys', detectedBy: 'Static analysis', stage: 'next', title: 'Add CI/CD pipelines', summary: 'A pipeline that builds, tests and deploys on merge, in each repository', kind: 'Campaign', plan: '1 skill · 2 repositories', effort: '1 week', readiness: 'skill' },
  { id: 'payment-coupling', detectedBy: 'Code analysis', stage: 'next', title: 'Payment module tightly coupled to the database', kind: 'Standalone', effort: '2–4 weeks', readiness: 'skill' },
  { id: 'tls', detectedBy: 'Static analysis', stage: 'next', title: 'TLS 1.0 allowed on internal load balancer', kind: 'Standalone', effort: 'Under 1 day', readiness: 'custom' },
  { id: 'verbose-errors', detectedBy: 'Static analysis', stage: 'next', title: 'Verbose error messages returned to clients', kind: 'Standalone', effort: 'Under 1 day', readiness: 'custom' },
  { id: 'health-check', detectedBy: 'Code analysis', stage: 'next', title: 'No health check endpoint', kind: 'Standalone', effort: 'Under 1 day', readiness: 'skill' },
  { id: 'console-logging', detectedBy: 'Code analysis', stage: 'next', title: 'Console logging left in production build', kind: 'Standalone', effort: 'Under 1 day', readiness: 'custom' },
  { id: 'sync-reads', detectedBy: 'Code analysis', stage: 'next', title: 'Synchronous file reads at startup', kind: 'Standalone', effort: '1–2 days', readiness: 'skill' },
  { id: 'expo', detectedBy: 'Dependency analysis', dueTone: 'risk', stage: 'progress', title: 'Upgrade MKPMobile to Expo SDK 51', summary: 'Expo SDK, deprecated modules and native iOS APIs', kind: 'Bundle', plan: '1 fix · 3 findings · 1 pull request', due: 'Aug 31', effort: '2–3 weeks', readiness: 'approval', verified: '0 of 3 verified' },
  { id: 'node', about: 'End-of-life runtime · SDK and packages', detectedBy: 'Dependency analysis', dueTone: 'risk', stage: 'progress', title: 'Modernize the Node.js services', summary: 'Node.js 20, then AWS SDK v3 and patched npm packages', kind: 'Migration', plan: '3 fixes · Node.js 20 first · SDK and packages build on it', due: 'Sep 30', effort: '1 week', readiness: 'blocked', verified: '17 of 28 verified' },
  { id: 'angular', detectedBy: 'Dependency analysis', dueTone: '', stage: 'progress', title: 'Migrate payments-ui from AngularJS to React', summary: 'Includes the test gap, so each phase can be verified', kind: 'Bundle', plan: '2 fixes · Phase 3 of 5', effort: '2–3 weeks', readiness: 'applying', verified: '0 of 3 verified' },
];
const isStandalone = (item) => item.kind === 'Standalone';
const READINESS = {
  managed: ['Managed TD available', 'ok', 'Review managed TD', 'td'], custom: ['Custom TD available', 'ok', 'Review custom TD', 'td'], skill: ['Specialized skill ready', 'skill', 'Review specialized skill', 'spark'],
  approval: ['In progress', 'approval', 'View remediation', 'arrow'], blocked: ['Failed', 'blocked', 'View remediation', 'arrow'], applying: ['In progress', 'approval', 'View remediation', 'arrow'],
};

// One entry per issue; it becomes one finding per affected repository (49 open: 3 critical, 14 high, 22 medium, 10 low).
const R = { node: 'LegacyNodeJSOrderingSystem', mobile: 'MKPMobile', learning: 'MyLearning', ui: 'payments-ui', payments: 'payments-service', catalog: 'spring-petclinic' };
const FINDING_ISSUES = [
  // Modernize the Java services
  ['Java 11 end of support', 'High', 'Tech debt (comprehensive)', 'Runtime upgrades', [R.payments, R.catalog], 'Java 11 → 21', 'Aug 24, 2026', 'The build targets Java 11, which leaves commercial support on Dec 31.', 'Upgrade to Java 21 LTS.', ['pom.xml'], 'java'],
  ['Spring Boot 2.7 end of support', 'High', 'Tech debt (comprehensive)', 'Framework upgrades', [R.catalog], 'Spring Boot 2 → 3', 'Aug 24, 2026', 'Spring Boot 2.7 open-source support has ended. Spring Boot 3 requires Java 17+, so this waits on the Java upgrade.', 'Upgrade to Spring Boot 3.3 and move to jakarta.* namespaces.', ['pom.xml'], 'java'],
  ['AWS SDK for Java v1 end of support', 'High', 'Tech debt (comprehensive)', 'SDK migrations', [R.payments], 'AWS SDK for Java v1 → v2', 'Aug 24, 2026', 'The service uses the AWS SDK for Java 1.x, which reaches end of support on Dec 31.', 'Migrate clients to software.amazon.awssdk v2.', ['pom.xml', 'src/main/java/com/example/payments/aws'], 'java'],
  ['Log4j 1.x in use', 'High', 'Security', 'Vulnerable dependencies', [R.payments], 'Log4j → SLF4J', 'Aug 25, 2026', 'log4j 1.2.17 is end of life and affected by CVE-2019-17571 and CVE-2022-23305.', 'Move logging to SLF4J with Logback.', ['pom.xml', 'src/main/resources/log4j.properties'], 'java'],
  ['Dockerfile pinned to Java 11', 'Medium', 'Tech debt (quick)', 'Container images', [R.payments], 'Java 11 → 21', 'Aug 25, 2026', 'The runtime image is pinned to eclipse-temurin:11-jre.', 'Move to eclipse-temurin:21-jre with the Java upgrade.', ['Dockerfile'], 'java'],
  ['Logging calls bound to the Log4j API', 'Medium', 'Tech debt (comprehensive)', 'Code quality', [R.payments], 'Log4j → SLF4J', 'Aug 24, 2026', '38 classes import org.apache.log4j.Logger directly.', 'Rewrite logging calls to the SLF4J API.', ['src/main/java/com/example/payments'], 'java'],
  // Update container base images
  ['OpenSSL 1.1.1 vulnerabilities in container image', 'High', 'Security', 'Container images', [R.payments], 'Amazon Linux 2023 base image', 'Aug 25, 2026', 'The amazonlinux:2 base image ships OpenSSL 1.1.1, which is end of life and has 4 known CVEs.', 'Rebuild on Amazon Linux 2023.', ['Dockerfile'], 'base-images'],
  ['glibc vulnerability in container image', 'High', 'Security', 'Container images', [R.payments], 'Amazon Linux 2023 base image', 'Aug 25, 2026', 'glibc in the base image is affected by CVE-2023-4911 (Looney Tunables).', 'Rebuild on Amazon Linux 2023.', ['Dockerfile'], 'base-images'],
  ['curl vulnerability in container image', 'High', 'Security', 'Container images', [R.node], 'Amazon Linux 2023 base image', 'Aug 25, 2026', 'curl in the base image is affected by CVE-2023-38545 (SOCKS5 heap overflow).', 'Rebuild on Amazon Linux 2023.', ['Dockerfile'], 'base-images'],
  ['Python 2.7 present in container image', 'Medium', 'Tech debt (quick)', 'Container images', [R.catalog], 'Amazon Linux 2023 base image', 'Aug 25, 2026', 'The amazonlinux:2 base image includes Python 2.7, which has been end of life since 2020.', 'Rebuild on Amazon Linux 2023, which ships Python 3 only.', ['Dockerfile'], 'base-images'],
  // Remove exposed secrets
  ['Hard-coded credentials in configuration', 'Critical', 'Security', 'Secrets', [R.node], null, 'Aug 25, 2026', 'The production database password and a payment-provider token are stored in plain text in config/default.json.', 'Load them from AWS Secrets Manager at startup and rotate both.', ['config/default.json'], 'secrets'],
  ['AWS access key committed to repository history', 'Critical', 'Security', 'Secrets', [R.payments], null, 'Aug 25, 2026', 'An AWS access key ID and secret were found in a past commit of src/main/resources/aws.properties.', 'Rotate the key, remove it from history, and use an IAM role instead.', ['src/main/resources/aws.properties'], 'secrets'],
  ['API key in mobile bundle', 'Medium', 'Security', 'Secrets', [R.mobile], null, 'Aug 25, 2026', 'A maps API key is embedded in the JavaScript bundle shipped with the app.', 'Restrict the key to the app’s bundle ID and proxy sensitive calls through the backend.', ['app.config.js'], 'secrets'],
  // MyLearning: add tests, then upgrade React
  ['No test framework or test files', 'Medium', 'Tech debt (comprehensive)', 'Testing', [R.learning], null, 'Aug 24, 2026', 'No test runner or test files were found, so upgrades can’t be verified.', 'Add a test framework and baseline tests before upgrading React.', ['package.json'], 'mylearning'],
  ['React 16 end of support', 'High', 'Tech debt (comprehensive)', 'Framework upgrades', [R.learning], 'React 16 → 18', 'Aug 24, 2026', 'The app uses React 16.14, which no longer receives fixes.', 'Upgrade to React 18 once tests are in place.', ['package.json', 'src/index.js'], 'mylearning'],
  ['Deprecated ESLint configuration', 'Low', 'Tech debt (quick)', 'Code quality', [R.learning], null, 'Aug 25, 2026', 'The project uses .eslintrc, which ESLint 9 no longer reads by default.', 'Migrate to eslint.config.js.', ['.eslintrc'], 'mylearning'],
  ['Console logging in production code', 'Low', 'Tech debt (quick)', 'Code quality', [R.learning], null, 'Aug 25, 2026', '23 console.log calls ship in production bundles.', 'Replace them with the shared logger.', ['src/'], 'mylearning'],
  // Harden access and data protection (payments-service)
  ['S3 bucket allows public read', 'High', 'Security', 'Access control', [R.payments], null, 'Aug 25, 2026', 'The payment-exports bucket grants s3:GetObject to "*" through its bucket policy.', 'Block public access and grant read access to specific roles only.', ['infra/storage.yml'], 'access'],
  ['IAM policies with wildcard actions', 'Medium', 'Security', 'Access control', [R.payments], null, 'Aug 25, 2026', '2 IAM policies grant "Action": "*".', 'Scope actions to what each role needs.', ['infra/iam.yml'], 'access'],
  ['Session tokens never expire', 'Medium', 'Security', 'Authentication', [R.payments], null, 'Aug 25, 2026', 'Issued session tokens have no expiry.', 'Set a 1-hour expiry with refresh.', ['src/main/java/com/example/payments/auth/TokenService.java'], 'access'],
  ['PII written to application logs', 'Medium', 'Security', 'Data protection', [R.payments], null, 'Aug 25, 2026', 'Customer.toString() includes name and address, and is logged on every payment.', 'Redact PII in toString() and log identifiers only.', ['src/main/java/com/example/payments/model/Customer.java'], 'access'],
  ['Customer PII stored unencrypted', 'Medium', 'Security', 'Data protection', [R.payments], null, 'Aug 25, 2026', 'The customers table stores names and addresses without encryption at rest.', 'Enable encryption at rest and encrypt sensitive columns.', ['db/schema.sql'], 'access'],
  // Add CI/CD pipelines
  ['No CI/CD pipeline', 'Medium', 'Modernization readiness', 'Operations', [R.node, R.mobile], null, 'Aug 22, 2026', 'Builds and deployments are run by hand from a developer machine.', 'Add a pipeline that builds, tests and deploys on merge.', ['README.md'], 'cicd'],
  // Standalone fixes
  ['N+1 queries in order history', 'Medium', 'Tech debt (comprehensive)', 'Performance', [R.node], null, 'Aug 24, 2026', 'GET /orders/history loads each order’s line items with a separate query — 1 + N queries per page.', 'Load line items with a single join or batched query.', ['src/routes/orders.js', 'src/db/orders.js'], 'n-plus-one'],
  ['Payment module tightly coupled to the database', 'Medium', 'Modernization readiness', 'Architecture', [R.payments], null, 'Aug 22, 2026', 'Payment logic queries billing and order tables directly, so the schema can’t change without touching payments.', 'Put a repository interface between payment logic and the database.', ['src/main/java/com/example/payments/PaymentService.java'], 'payment-coupling'],
  ['TLS 1.0 allowed on internal load balancer', 'Low', 'Security', 'Transport security', [R.catalog], 'TLS 1.2 minimum policy', 'Aug 25, 2026', 'The internal load balancer’s listener policy still accepts TLS 1.0 and 1.1.', 'Switch to ELBSecurityPolicy-TLS13-1-2-2021-06.', ['infra/load-balancer.yml'], 'tls'],
  ['Verbose error messages returned to clients', 'Low', 'Security', 'Information disclosure', [R.payments], 'Generic error responses', 'Aug 25, 2026', 'Unhandled exceptions return stack traces and SQL fragments in API responses.', 'Return a generic error body and log the details server-side.', ['src/main/java/com/example/payments/api/ErrorHandler.java'], 'verbose-errors'],
  ['No health check endpoint', 'Low', 'Modernization readiness', 'Operations', [R.catalog], null, 'Aug 22, 2026', 'The service has no health endpoint, so the load balancer checks / and marks it healthy during startup.', 'Enable Spring Boot Actuator /actuator/health and point the target group at it.', ['pom.xml', 'src/main/resources/application.properties'], 'health-check'],
  ['Console logging left in production build', 'Low', 'Tech debt (quick)', 'Code quality', [R.ui], 'Strip console calls', 'Aug 25, 2026', '31 console.log calls ship in the production bundle.', 'Strip console calls in the production build.', ['webpack.config.js'], 'console-logging'],
  ['Synchronous file reads at startup', 'Low', 'Modernization readiness', 'Operations', [R.node], null, 'Aug 22, 2026', 'Startup reads 40 config files with fs.readFileSync, adding ~4 s to every cold start.', 'Load configuration once, asynchronously.', ['src/config.js'], 'sync-reads'],
  // Upgrade MKPMobile to Expo SDK 51
  ['End-of-life Expo SDK 38', 'High', 'Tech debt (comprehensive)', 'Framework upgrades', [R.mobile], 'Expo SDK 38 → 51', 'Aug 24, 2026', 'Expo SDK 38 is no longer supported and blocks builds that target current Android and iOS SDKs.', 'Upgrade to Expo SDK 51 and update native configuration.', ['app.json', 'package.json'], 'expo'],
  ['Google Play target API level below 34', 'Medium', 'Tech debt (comprehensive)', 'Platform requirements', [R.mobile], 'Expo SDK 38 → 51', 'Aug 24, 2026', 'Google Play requires new releases to target API level 34 after Aug 31. The app targets API level 29.', 'Raise targetSdkVersion to 34 as part of the Expo upgrade.', ['app.json'], 'expo'],
  ['Deprecated native iOS APIs', 'Medium', 'Tech debt (comprehensive)', 'Platform requirements', [R.mobile], 'Expo SDK 38 → 51', 'Aug 24, 2026', 'UIWebView and other deprecated iOS APIs are still linked.', 'Remove them as part of the Expo upgrade.', ['ios/Podfile'], 'expo'],
  // Modernize the Node.js services
  ['Node.js 16 runtime is end of life', 'High', 'Tech debt (comprehensive)', 'Runtime upgrades', [R.node], 'Node.js 16 → 20', 'Aug 10, 2026', 'Node.js 16 reached end of life and no longer receives security fixes. AWS Lambda blocks updates to functions on this runtime after Sep 30.', 'Upgrade to Node.js 20 and update CI images and engines fields.', ['package.json', '.nvmrc', '.github/workflows/ci.yml'], 'node'],
  ['AWS SDK for JavaScript v2', 'High', 'Tech debt (comprehensive)', 'SDK migrations', [R.node], 'AWS SDK v2 → v3', 'Aug 10, 2026', 'The repository uses aws-sdk v2, which is in maintenance mode and reaches end of support on Oct 15.', 'Migrate to modular @aws-sdk/* v3 clients and update mocks.', ['package.json', 'src/aws/clients.js'], 'node'],
  ['jsonwebtoken v8 known CVEs', 'High', 'Security', 'Vulnerable dependencies', [R.node], 'Upgrade npm packages', 'Aug 10, 2026', 'jsonwebtoken 8.5.1 is affected by CVE-2022-23529 and related signature-validation issues.', 'Upgrade to jsonwebtoken 9 and require explicit algorithms on verify().', ['package.json', 'src/auth/token.js'], 'node'],
  ['CVE-2024-29041 in express 4.17.1', 'Medium', 'Security', 'Vulnerable dependencies', [R.node], 'Upgrade npm packages', 'Aug 25, 2026', 'express 4.17.1 is affected by an open redirect (CVE-2024-29041). Malformed URLs passed to res.location() or res.redirect() can send users to an attacker-controlled site.', 'Upgrade express to 4.19.2 or later.', ['package.json', 'src/server.js'], 'node'],
  ['Deprecated and unmaintained packages', 'Medium', 'Tech debt (comprehensive)', 'Dependencies', [R.node], 'Upgrade npm packages', 'Aug 24, 2026', '7 dependencies are deprecated or have had no release in 3+ years.', 'Replace them with maintained alternatives.', ['package.json'], 'node'],
  ['Outdated lodash 4.17.15', 'Low', 'Tech debt (quick)', 'Dependencies', [R.learning], 'Upgrade npm packages', 'Aug 25, 2026', 'lodash 4.17.15 is affected by prototype pollution (CVE-2020-8203).', 'Upgrade to lodash 4.17.21.', ['package.json'], 'node'],
  ['Moment.js in maintenance mode', 'Low', 'Tech debt (comprehensive)', 'Dependencies', [R.mobile], 'Upgrade npm packages', 'Aug 24, 2026', 'moment is in maintenance mode and adds ~290 KB to bundles.', 'Replace it with date-fns or Intl APIs.', ['package.json'], 'node'],
  ['Unused dependencies', 'Low', 'Tech debt (quick)', 'Dependencies', [R.node], 'Upgrade npm packages', 'Aug 25, 2026', '5 declared dependencies are never imported.', 'Remove unused packages.', ['package.json'], 'node'],
  ['Deprecated request library', 'Medium', 'Tech debt (quick)', 'Dependencies', [R.node], 'Upgrade npm packages', 'Aug 25, 2026', 'request has been deprecated since 2020.', 'Move HTTP calls to fetch.', ['src/services/http.js'], 'node'],
  ['node-fetch v2 in use', 'Medium', 'Tech debt (quick)', 'Dependencies', [R.node], 'Upgrade npm packages', 'Aug 25, 2026', 'node-fetch v2 is unnecessary on Node.js 18+.', 'Use the built-in fetch after the Node.js 20 upgrade.', ['package.json'], 'node'],
  ['npm lockfile v1', 'Medium', 'Tech debt (quick)', 'Dependencies', [R.node], 'Upgrade npm packages', 'Aug 25, 2026', 'package-lock.json uses lockfileVersion 1.', 'Regenerate it with npm 9+.', ['package-lock.json'], 'node'],
  // Migrate payments-ui from AngularJS to React
  ['AngularJS 1.x end of life', 'Critical', 'Modernization readiness', 'Framework upgrades', [R.ui], 'AngularJS → React', 'Aug 22, 2026', 'AngularJS reached end of life in 2022 and no longer receives security fixes.', 'Migrate screen by screen to React.', ['src/app.module.js'], 'angular'],
  ['jQuery 2 known CVEs', 'Medium', 'Security', 'Vulnerable dependencies', [R.ui], 'AngularJS → React', 'Aug 25, 2026', 'jQuery 2.2.4 is affected by CVE-2020-11022 and CVE-2020-11023.', 'Remove jQuery as part of the React migration.', ['package.json'], 'angular'],
  ['No unit tests for UI components', 'Medium', 'Tech debt (comprehensive)', 'Testing', [R.ui], 'AngularJS → React', 'Aug 24, 2026', 'No component tests exist, so migrated screens can’t be verified.', 'Add tests alongside each migrated screen.', ['src/'], 'angular'],
];
const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];
const ESTATE_FINDINGS = FINDING_ISSUES.flatMap(([title, severity, analysis, category, repos, remediation, detected, description, recommendation, files, initiative], issue) => repos.map((repo, index) => ({
  id: `${issue}-${repo}`, order: issue * 10 + index, title, severity, analysis, category, repo, remediation, detected, description, recommendation, files, initiative,
  status: INITIATIVES.find((item) => item.id === initiative)?.stage === 'progress' ? 'In remediation' : 'Open',
}))).sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.title.localeCompare(b.title) || a.repo.localeCompare(b.repo));

// The dashboard hands the findings page a starting filter (a severity or a finding title).
let pendingFindingsFocus = null;
function openFindings(onNavigate, focus) {
  pendingFindingsFocus = focus?.title && !ESTATE_FINDINGS.some((item) => item.title === focus.title) ? { all: true } : focus;
  onNavigate('improved-findings');
}

function FindingDetail({ finding, onClose, onNavigate }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const initiative = INITIATIVES.find((item) => item.id === finding.initiative);
  return <div className="finding-detail-layer">
    <button type="button" className="finding-detail-scrim" onClick={onClose} aria-label="Close finding details" />
    <aside className="finding-detail" role="dialog" aria-modal="true" aria-label={finding.title}>
      <header><div><span className={`breakdown-severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span><h2>{finding.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" size={22} /></button></header>
      <dl className="finding-facts"><div><dt>Repository</dt><dd>{finding.repo}</dd></div><div><dt>Analysis</dt><dd>{finding.analysis}</dd></div><div><dt>Category</dt><dd>{finding.category}</dd></div><div><dt>Detected</dt><dd>{finding.detected}</dd></div><div><dt>Status</dt><dd>{finding.status}</dd></div></dl>
      <section><h3>What was found</h3><p>{finding.description}</p></section>
      <section><h3>Recommendation</h3><p>{finding.recommendation}</p></section>
      <section><h3>Affected files</h3><ul className="finding-files">{finding.files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></section>
      {initiative && !isStandalone(initiative) && <section><h3>Initiative</h3><p><strong>{initiative.title}</strong> · {initiative.kind.toLowerCase()} · {ESTATE_FINDINGS.filter((item) => item.initiative === initiative.id).length} findings</p></section>}
      <section><h3>Remediation</h3>{finding.remediation ? <p>AWS Transform can fix this with <strong>{finding.remediation}</strong>.</p> : <p>No managed transformation matches this finding. AWS Transform drafted a specialized skill for it — review it before it runs.</p>}</section>
      <footer>{finding.status === 'In remediation' ? <Button onClick={() => onNavigate('improved-rail-remediations')}>View remediation</Button> : finding.remediation ? <Button onClick={() => openAuthorize(onNavigate, finding.initiative)}>Start remediation</Button> : <Button onClick={() => reviewSkill(initiative, onNavigate)}>Review skill</Button>}<Button variant="outline" onClick={onClose}>Close</Button></footer>
    </aside>
  </div>;
}

function initiativeRepos(initiative) {
  const counts = new Map();
  ESTATE_FINDINGS.filter((item) => item.initiative === initiative.id).forEach((item) => counts.set(item.repo, (counts.get(item.repo) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || (b[0] === initiative.lead) - (a[0] === initiative.lead) || a[0].localeCompare(b[0])).map(([repo]) => repo);
}
const askRailChat = (prompt) => window.dispatchEvent(new CustomEvent('rail-chat-ask', { detail: prompt }));

// A select whose options can be filtered by typing (Cloudscape "select with filtering").
function SearchableSelect({ label, value, options, onChange, allLabel = 'All', placeholder = 'Find', className = '' }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useMemo(() => `ss-${Math.random().toString(36).slice(2, 8)}`, []);
  const all = [{ value: 'All', label: allLabel }, ...options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))];
  const shown = all.filter((option) => !filter || option.label.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    inputRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { setActive(0); }, [filter]);
  const choose = (option) => { onChange(option.value); setOpen(false); setFilter(''); };
  const onKey = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setFilter(''); }
  };
  const current = all.find((option) => option.value === value) || all[0];
  const highlight = (text) => {
    if (!filter) return text;
    const at = text.toLowerCase().indexOf(filter.toLowerCase());
    return at < 0 ? text : <>{text.slice(0, at)}<mark>{text.slice(at, at + filter.length)}</mark>{text.slice(at + filter.length)}</>;
  };
  return <div className={`searchable-select ${open ? 'open' : ''} ${className}`} ref={rootRef}>
    <button type="button" className="searchable-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span>{label}: {current.label}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    {open && <div className="searchable-select-panel">
      <label className="searchable-select-filter"><Icon name="search" /><input ref={inputRef} value={filter} onChange={(event) => setFilter(event.target.value)} onKeyDown={onKey} placeholder={placeholder} role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined} aria-label={`Filter ${label.toLowerCase()}`} />{filter && <button type="button" onClick={() => { setFilter(''); inputRef.current?.focus(); }} aria-label="Clear filter">×</button>}</label>
      <ul id={listId} role="listbox" aria-label={label}>{shown.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value} className={`${index === active ? 'active' : ''} ${option.value === value ? 'selected' : ''}`} onMouseEnter={() => setActive(index)} onMouseDown={(event) => { event.preventDefault(); choose(option); }}>
        <span>{highlight(option.label)}</span>{option.count !== undefined && <small>{option.count}</small>}{option.value === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
      </li>)}{shown.length === 0 && <li className="empty" role="option" aria-disabled="true" aria-selected="false">No matches</li>}</ul>
    </div>}
  </div>;
}

const TD_CATALOG = {
  'Java 11 → 21': ['AWS/java-version-upgrade', 'managed'], 'Spring Boot 2 → 3': ['AWS/spring-boot-3-upgrade', 'managed'],
  'AWS SDK for Java v1 → v2': ['AWS/java-aws-sdk-v1-to-v2', 'managed'], 'Log4j → SLF4J': ['AWS/log4j-to-slf4j', 'managed'],
  'Node.js 16 → 20': ['AWS/nodejs-version-upgrade', 'managed'], 'AWS SDK v2 → v3': ['AWS/nodejs-aws-sdk-v2-to-v3', 'managed'],
  'Upgrade npm packages': ['AWS/npm-dependency-upgrade', 'managed'], 'AngularJS → React': ['AWS/angularjs-to-react', 'managed'],
  'Amazon Linux 2023 base image': ['Custom/container-base-image-refresh', 'custom'], 'React 16 → 18': ['AWS/react-18-upgrade', 'managed'], 'Expo SDK 38 → 51': ['Custom/expo-sdk-upgrade', 'custom'],
  'TLS 1.2 minimum policy': ['Custom/enforce-tls-1-2', 'custom'], 'Generic error responses': ['Custom/generic-error-responses', 'custom'], 'Strip console calls': ['Custom/strip-console-logging', 'custom'],
};
// Other ways to remediate an item. The customer can switch to any of these, or fix manually / accept the risk.
const PATH_ALTERNATIVES = {
  secrets: ['AWS/secrets-manager-migration'], access: ['AWS/iam-least-privilege'],
  cicd: ['AWS/github-actions-pipeline'], tls: ['AWS/elb-tls-policy-upgrade'], 'console-logging': ['AWS/strip-debug-logging'],
  'base-images': ['AWS/amazon-linux-2023-upgrade'], java: ['Custom/acme-jdk-baseline'],
};
const pathOverrides = {};
// Every transformation definition a customer can pick instead of the recommended path. `fits` lists the
// items it's recommended for and how many of that item's findings it covers (null = all of them).
const TD_LIBRARY = [
  ['AWS/secrets-manager-migration', 'Moves hard-coded credentials to AWS Secrets Manager and loads them at startup', { secrets: 2 }],
  ['Custom/acme-secrets-hygiene-v2', 'Config-file credentials and vault references · Security team', { secrets: null }],
  ['AWS/git-history-secret-purge', 'Removes committed secrets from repository history after rotation', { secrets: 1 }],
  ['AWS/iam-least-privilege', 'Scopes IAM policies to the actions each role uses', { access: 2 }],
  ['AWS/s3-block-public-access', 'Turns on S3 Block Public Access and replaces public bucket policies', { access: 1 }],
  ['AWS/rds-encryption-at-rest', 'Enables encryption at rest for RDS and Aurora tables', { access: 1 }],
  ['AWS/github-actions-pipeline', 'Adds a GitHub Actions pipeline that builds, tests and deploys on merge', { cicd: null }],
  ['AWS/codepipeline-starter', 'Adds an AWS CodePipeline with build, test and deploy stages', { cicd: null }],
  ['AWS/jest-test-bootstrap', 'Adds Jest and React Testing Library with baseline tests', { mylearning: 1 }],
  ['AWS/react-18-upgrade', 'Upgrades React 16/17 to React 18', { mylearning: 1 }],
  ['AWS/elb-tls-policy-upgrade', 'Sets a TLS 1.2+ security policy on load balancer listeners', { tls: null }],
  ['AWS/strip-debug-logging', 'Removes console and debug logging from production builds', { 'console-logging': null }],
  ['AWS/spring-boot-actuator-health', 'Enables Spring Boot Actuator health and wires it to the target group', { 'health-check': null }],
  ['AWS/async-config-loading', 'Replaces synchronous file reads at startup with one async load', { 'sync-reads': null }],
  ['AWS/orm-batch-loading', 'Rewrites N+1 query patterns as joins or batched loads', { 'n-plus-one': null }],
  ['AWS/repository-pattern-extraction', 'Puts a repository interface between business logic and the database', { 'payment-coupling': null }],
  ['AWS/safe-error-responses', 'Returns generic error bodies and logs details server-side', { 'verbose-errors': null }],
  ['AWS/amazon-linux-2023-upgrade', 'Rebuilds container images on Amazon Linux 2023', { 'base-images': null }],
  ['AWS/java-version-upgrade', 'Upgrades Java 8/11/17 to Java 21', { java: 2 }],
  ['AWS/spring-boot-3-upgrade', 'Upgrades Spring Boot 2.x to 3.x and moves to jakarta.* namespaces', { java: 1 }],
  ['AWS/java-aws-sdk-v1-to-v2', 'Migrates AWS SDK for Java v1 clients to v2', { java: 1 }],
  ['AWS/log4j-to-slf4j', 'Moves Log4j 1.x logging to SLF4J with Logback', { java: 2 }],
  ['AWS/nodejs-version-upgrade', 'Upgrades the Node.js runtime with lockfile and CI image changes', {}],
  ['AWS/nodejs-aws-sdk-v2-to-v3', 'Migrates AWS SDK for JavaScript v2 to the modular v3 clients', {}],
  ['AWS/npm-dependency-upgrade', 'Upgrades vulnerable and deprecated npm packages', {}],
  ['AWS/angularjs-to-react', 'Migrates AngularJS 1.x screens to React 18', {}],
  ['Custom/acme-logging-standard-v2', 'Log format and field rules · Platform team', {}],
  ['Custom/acme-httpclient-migration-v1', 'HttpClient 3.x to the internal client · Platform team', {}],
  ['Custom/flagkit-to-openfeature-v1', 'Replaces the Flagkit SDK · Drafted by CM', {}],
  ['Custom/acme-jdk-baseline-v3', 'Org JVM flags and base images · Platform team', { java: null }],
  ['Custom/acme-observability-baseline-v1', 'OpenTelemetry tracing and log correlation · Platform team', {}],
].map(([id, description, fits]) => ({ id, description, fits, kind: id.startsWith('AWS/') ? 'managed' : 'custom' }));
const itemTds = (item) => [...new Set(findingsOfInitiative(item).map((finding) => finding.remediation).filter(Boolean))].map((label) => [label, ...(TD_CATALOG[label] || [label, 'managed'])]);
const REPO_CONTEXT = {
  [R.node]: { service: 'Order management', platform: 'Payments Platform', prodCritical: true, internetFacing: true },
  [R.payments]: { service: 'Payments', platform: 'Payments Platform', prodCritical: true, internetFacing: false },
  [R.ui]: { service: 'Payments', platform: 'Payments Platform', prodCritical: false, internetFacing: true },
  [R.mobile]: { service: 'Mobile app', platform: 'Mobile Experience', prodCritical: false, internetFacing: true },
  [R.catalog]: { service: 'Clinic scheduling', platform: 'Developer Experience', prodCritical: false, internetFacing: false },
  [R.learning]: { service: 'Learning portal', platform: 'Learning Platform', prodCritical: false, internetFacing: false },
};
const REPO_SOURCE = { [R.node]: 'github-demo', [R.mobile]: 'github-demo', [R.learning]: 'github-my-learning', [R.ui]: 'angularjs-app', [R.payments]: 'payments-platform', [R.catalog]: 'payments-platform' };
// Within an initiative, findings keep the order AWS Transform will fix them in, most severe first.
const findingsOfInitiative = (initiative) => ESTATE_FINDINGS.filter((item) => item.initiative === initiative.id).sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.order - b.order);
const SEVERITY_DOT = { Critical: '#870303', High: '#d63f1f', Medium: '#f89256', Low: '#f2cd54' };

const ACTION_ICONS = {
  spark: <path d="M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" />,
  td: <><path d="m12 4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
};
function ActionIcon({ name }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ACTION_ICONS[name]}</svg>;
}
const itemSeverity = (item) => SEVERITY_ORDER.find((level) => findingsOfInitiative(item).some((finding) => finding.severity === level));
const effortRank = (text) => ['Under 1 day', '1–2 days', '3–5 days', '1 week', '1–2 weeks', '2–3 weeks', '2–4 weeks'].indexOf(text);
const byPriority = (a, b) => SEVERITY_ORDER.indexOf(itemSeverity(a)) - SEVERITY_ORDER.indexOf(itemSeverity(b)) || effortRank(a.effort) - effortRank(b.effort);

function ItemIcon({ name }) {
  return name === 'repo'
    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /></svg>
    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></svg>;
}
function exposureOf(repos) {
  const prod = repos.filter((name) => REPO_CONTEXT[name]?.prodCritical).length;
  const internet = repos.filter((name) => REPO_CONTEXT[name]?.internetFacing).length;
  if (repos.length === 1) return [prod && 'Prod-critical', internet && 'Internet-facing'].filter(Boolean).join(' · ');
  return [prod && `${prod} prod-critical`, internet && `${internet} internet-facing`].filter(Boolean).join(' · ');
}
const itemNeedsSkill = (item) => findingsOfInitiative(item).some((finding) => !finding.remediation);
const itemStatus = (item) => (item.stage === 'progress' ? READINESS[item.readiness] : itemNeedsSkill(item) ? ['Proposed', 'proposed'] : ['Ready', 'ready']);
const exposureTags = (repos) => [repos.some((name) => REPO_CONTEXT[name]?.prodCritical) && 'Prod-critical', repos.some((name) => REPO_CONTEXT[name]?.internetFacing) && 'Internet-facing'].filter(Boolean);
const tdKind = (tds) => (tds.every(([, , kind]) => kind === 'custom') ? 'custom' : 'managed');
// Which remediation filter an item falls under, honoring a path the customer picked.
function pathType(item, override) {
  if (override) return override.kind === 'skill' ? 'Specialized skill' : override.kind === 'td' ? (override.id.startsWith('AWS/') ? 'Managed TD' : 'Custom TD') : 'Other';
  return itemNeedsSkill(item) ? 'Specialized skill' : tdKind(itemTds(item)) === 'custom' ? 'Custom TD' : 'Managed TD';
}

function recommendedPath(item, repos) {
  const tds = itemTds(item);
  if (item.stage === 'progress') return ['View remediation', 'arrow', '', tds.length > 1 ? `${tds.length} TDs · run in order` : tds[0]?.[1] || ''];
  // A specialized skill covers every finding in the item, including any a TD could fix.
  if (itemNeedsSkill(item) || !tds.length) return ['Review specialized skill', 'spark', 'skill', `1 skill · ${repos.length} repo${repos.length === 1 ? '' : 's'}`];
  const kind = tdKind(tds);
  return [`Review ${kind} TD`, 'td', '', item.pathNote || (tds.length === 1 ? tds[0][1].replace(/^\w+\//, '') : `${tds.length} ${kind} TDs · run in order`)];
}
function overridePath(override, repos) {
  if (override.kind === 'skill') return ['Review specialized skill', 'spark', 'skill', 'Changed by you · 1 skill'];
  if (override.kind === 'manual') return ['Fix manually', 'arrow', 'muted', 'Changed by you · tracked in backlog'];
  if (override.kind === 'accept') return ['Risk accepted', 'arrow', 'muted', `Changed by you · ${override.reason || 'until re-detected'}`];
  const kind = override.id.startsWith('AWS/') ? 'managed' : 'custom';
  return [`Review ${kind} TD`, 'td', '', `Changed by you · ${override.id}${repos.length > 1 ? ` · ${repos.length} repos` : ''}`];
}

function PathMenu({ item, override, onChoose, onClose, anchor }) {
  const ref = useRef(null);
  // Fixed to the viewport so the table's scroll container can't clip it.
  const rect = anchor?.getBoundingClientRect();
  const height = 420;
  const style = rect ? { top: rect.bottom + height + 12 > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 338, rect.right - 330)) } : {};
  useEffect(() => {
    const onDown = (event) => { if (!ref.current?.contains(event.target) && !event.target.closest?.('.path-change-button')) onClose(); };
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    ref.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const repos = initiativeRepos(item);
  const [label, , , note] = recommendedPath(item, repos);
  const registry = CUSTOM_TDS.filter((row) => row[4]).slice(0, 3).map(([, title, version]) => [`Custom/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, `${title} ${version}`]);
  const same = (value) => (value === null ? !override : Boolean(override) && override.kind === value.kind && override.id === value.id);
  const option = (key, title, sub, value) => <button key={key} type="button" role="menuitemradio" aria-checked={same(value)} className={same(value) ? 'selected' : ''} onClick={() => onChoose(value)}><span><strong>{title}</strong>{sub && <small>{sub}</small>}</span>{same(value) && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}</button>;
  const alternatives = PATH_ALTERNATIVES[item.id] || [];
  return <div className="path-menu" ref={ref} style={style} role="menu" aria-label={`Remediation path for ${item.title}`} onClick={(event) => event.stopPropagation()}>
    <p className="path-menu-head">Remediation path</p>
    {option('rec', `Recommended · ${label.replace('Review ', '')}`, note, null)}
    {alternatives.length > 0 && <p className="path-menu-group">Other transformation definitions</p>}
    {alternatives.map((id) => option(id, id, id.startsWith('AWS/') ? 'AWS-managed TD' : 'Custom TD in your registry', { kind: 'td', id }))}
    <p className="path-menu-group">Your custom TDs</p>
    {registry.map(([id, title]) => option(id, title, id, { kind: 'td', id }))}
    <p className="path-menu-group">Other options</p>
    {label !== 'Review specialized skill' && option('skill', 'Generate a specialized skill', 'CM drafts a skill from these findings for you to review', { kind: 'skill' })}
    {option('manual', 'Fix manually', 'Track it in your backlog; CM re-checks on the next analysis', { kind: 'manual' })}
    {option('accept', 'Accept the risk', 'Hide until it’s detected again', { kind: 'accept', reason: 'until re-detected' })}
  </div>;
}

function InitiativeRow({ initiative, expanded, onExpand, onNavigate, onOpenFinding, override, onOverride, repoFilter }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const changeRef = useRef(null);
  const rows = findingsOfInitiative(initiative);
  const repos = initiativeRepos(initiative);
  const severity = itemSeverity(initiative);
  const standalone = isStandalone(initiative);
  const detailsId = `item-${initiative.id}-details`;
  const [picked, setPicked] = useState(() => new Set(rows.map((item) => item.id)));
  const toggle = (id) => setPicked((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const act = () => {
    if (initiative.stage === 'progress') return onNavigate('improved-rail-remediations');
    if (override?.kind === 'manual' || override?.kind === 'accept') return undefined;
    const usesSkill = override ? override.kind === 'skill' : findingsOfInitiative(initiative).some((finding) => !finding.remediation);
    return usesSkill ? reviewSkill(initiative, onNavigate, picked.size || rows.length) : openAuthorize(onNavigate, initiative.id);
  };
  const plan = initiative.plan?.replace(/^\d+ fix(es)? · /, '');
  const single = repos.length === 1;
  const meta = [standalone ? 'Standalone' : 'Initiative', !standalone && initiative.kind, single && REPO_CONTEXT[repos[0]]?.platform].filter(Boolean).join(' · ');
  // With a repository filter on, a multi-repo item is described by the filtered repository only.
  const focusRepo = repoFilter && repos.includes(repoFilter) ? repoFilter : null;
  const tags = exposureTags(focusRepo ? [focusRepo] : repos);
  const [pathLabel, pathIcon, pathTone, pathNote] = override ? overridePath(override, repos) : recommendedPath(initiative, repos);
  const [statusLabel, statusTone] = override?.kind === 'manual' ? ['Manual fix', 'muted'] : override?.kind === 'accept' ? ['Risk accepted', 'muted'] : override?.kind === 'td' ? ['Ready', 'ready'] : override?.kind === 'skill' ? ['Proposed', 'proposed'] : itemStatus(initiative);
  return <>
    <tr className={`item-row ${expanded ? 'expanded' : ''}`} onClick={onExpand}>
      <td className="item-toggle"><button type="button" tabIndex={-1} aria-hidden="true" onClick={(event) => { event.stopPropagation(); onExpand(); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></button></td>
      <td className="item-name">
        <button type="button" className="item-title" aria-expanded={expanded} aria-controls={detailsId} onClick={(event) => { event.stopPropagation(); onExpand(); }}>{initiative.title}</button>{initiative.recommended && <span className="item-next">Next</span>}
        <small>{meta}</small>
      </td>
      <td><span className="item-scope" title={repos.join(', ')}>{focusRepo ? (single ? 'Only this repository' : `This + ${repos.length - 1} more ${repos.length === 2 ? 'repository' : 'repositories'}`) : single ? repos[0] : `${repos.length} repositories`}</span>{tags.length > 0 && <span className="item-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</span>}</td>
      <td>{initiative.detectedBy}</td>
      <td><span className={`item-status ${statusTone}`}><i aria-hidden="true" />{statusLabel}</span>{initiative.verified && <small className="item-verified">{initiative.verified}</small>}</td>
      <td className="item-action"><div className="item-path-line">{override?.kind === 'manual' || override?.kind === 'accept' ? <span className="item-action-link muted">{pathLabel}</span> : <button type="button" className={`item-action-link ${pathTone}`} onClick={(event) => { event.stopPropagation(); act(); }}><ActionIcon name={pathIcon} />{pathLabel}</button>}
        {initiative.stage === 'next' && <span className="path-change"><button type="button" ref={changeRef} className="path-change-button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Change remediation path for ${initiative.title}`} title="Change remediation path" onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen); }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
          {menuOpen && <PathMenu anchor={changeRef.current} item={initiative} override={override} onChoose={(value) => { onOverride(value); setMenuOpen(false); }} onClose={() => setMenuOpen(false)} />}</span>}
        {override && <button type="button" className="path-reset" onClick={(event) => { event.stopPropagation(); onOverride(null); }} aria-label={`Reset ${initiative.title} to the recommended path`}>Reset</button>}</div>
        <small className={`item-path-note ${override ? 'overridden' : ''}`} title={pathNote}>{pathNote}</small></td>
    </tr>
    {expanded && <>
      {standalone ? <tr className="item-details standalone" id={detailsId}><td /><td colSpan={5}>
        <div className="item-panel">
          <div className="item-panel-main">
            <h4>What was found</h4><p>{rows[0].description}</p>
            <h4>Recommendation</h4><p>{rows[0].recommendation}</p>
          </div>
          <dl className="item-panel-facts">
            <div><dt>Analysis</dt><dd>{rows[0].analysis}</dd></div>
            <div><dt>Category</dt><dd>{rows[0].category}</dd></div>
            <div><dt>Detected</dt><dd>{rows[0].detected}</dd></div>
            <div><dt>Files</dt><dd className="mono">{(rows[0].files || []).join(', ')}</dd></div>
            <div><dt>Fix</dt><dd>{rows[0].remediation ? <span className="mono">{TD_CATALOG[rows[0].remediation]?.[0] || rows[0].remediation}</span> : 'Specialized skill'}</dd></div>
          </dl>
          <div className="item-panel-actions"><button type="button" className="rem-small-button" onClick={() => onOpenFinding(rows[0])}>Open finding</button></div>
        </div>
      </td></tr>
      : <tr className="item-details" id={detailsId}><td /><td colSpan={5}><p className="item-summary">{initiative.summary}.{plan && ` ${plan.charAt(0).toUpperCase()}${plan.slice(1)}.`}</p></td></tr>}
      {!standalone && rows.map((item, index) => <tr key={item.id} className={`item-sub ${index === rows.length - 1 ? 'last' : ''}`}>
        <td />
        <td><div className="item-sub-name">
          {initiative.stage === 'next' && !standalone && <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Include ${item.title} in ${item.repo}`} />}
          <i style={{ background: SEVERITY_DOT[item.severity] }} title={item.severity} aria-label={item.severity} />
          <button type="button" onClick={() => onOpenFinding(item)}>{item.title}</button>
        </div></td>
        <td className="item-repos" title={item.repo}>{item.repo}</td>
        <td className="item-muted">{item.analysis}</td>
        <td />
        <td className="item-sub-td" title={item.remediation ? TD_CATALOG[item.remediation]?.[0] : 'Specialized skill'}>{item.remediation ? <span className="mono">{(TD_CATALOG[item.remediation]?.[0] || item.remediation).replace(/^\w+\//, '')}</span> : <span className="item-muted">Specialized skill</span>}</td>
      </tr>)}
    </>}
  </>;
}
function AssistantSpark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" /></svg>;
}

const NOT_STARTED = INITIATIVES.filter((item) => item.stage === 'next');
const FINDINGS_TABS = [
  ['priority', 'Priority', (item) => item.stage === 'next'],
  ['initiatives', 'Initiatives', (item) => item.stage === 'next' && !isStandalone(item)],
  ['standalone', 'Standalone', (item) => item.stage === 'next' && isStandalone(item)],
  ['progress', 'In progress', (item) => item.stage === 'progress'],
  ['all', 'All findings', null],
];
const tabCount = ([id, , filter]) => (id === 'all' ? ESTATE_FINDINGS.length : INITIATIVES.filter(filter).length);

function InitiativesTable({ tab, onNavigate, onOpenFinding }) {
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState('All');
  const [type, setType] = useState('All');
  const [fixType, setFixType] = useState('All');
  const [groupBy, setGroupBy] = useState('Severity');
  const [quickWins, setQuickWins] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [overrides, setOverrides] = useState(() => ({ ...pathOverrides }));
  const setOverride = (id, value) => setOverrides((current) => { const next = { ...current }; if (value) next[id] = value; else delete next[id]; Object.keys(pathOverrides).forEach((key) => delete pathOverrides[key]); Object.assign(pathOverrides, next); return next; });
  const inTab = FINDINGS_TABS.find(([id]) => id === tab)[2];
  const matches = (item) => inTab(item)
    && (repo === 'All' || findingsOfInitiative(item).some((finding) => finding.repo === repo))
    && (type === 'All' || findingsOfInitiative(item).some((finding) => finding.analysis === type))
    && (fixType === 'All' || pathType(item, overrides[item.id]) === fixType)
    && (!quickWins || (item.stage === 'next' && effortRank(item.effort) <= 1))
    && (!query || `${item.title} ${item.summary || ''} ${findingsOfInitiative(item).map((finding) => `${finding.title} ${finding.repo}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const visible = INITIATIVES.filter(matches).sort(byPriority);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const repoNames = [...new Set(ESTATE_FINDINGS.map((item) => item.repo))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const sections = groupBy === 'Repository'
    ? repoNames.map((name) => ({ key: name, label: name, items: visible.filter((item) => initiativeRepos(item).includes(name)), findings: (item) => findingsOfInitiative(item).filter((finding) => finding.repo === name).length }))
    : groupBy === 'None'
      ? [{ key: 'all', items: visible }]
      : SEVERITY_ORDER.map((level) => ({ key: level, label: level, dot: SEVERITY_DOT[level], items: visible.filter((item) => itemSeverity(item) === level) }));
  const findingCount = (section) => section.items.reduce((sum, item) => sum + (section.findings ? section.findings(item) : findingsOfInitiative(item).filter((finding) => repo === 'All' || finding.repo === repo).length), 0);
  const shown = new Set(sections.flatMap((section) => section.items.map((item) => item.id))).size;
  const toggle = (id) => setExpanded((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const clear = () => { setQuery(''); setRepo('All'); setType('All'); setFixType('All'); setQuickWins(false); };
  return <section className="dash-card items-card">
    <div className="items-toolbar">
      <label className="findings-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find initiatives and findings" aria-label="Find initiatives and findings" /></label>
      <SearchableSelect label="Repository" value={repo} onChange={setRepo} placeholder="Find repositories" options={[...new Set(ESTATE_FINDINGS.map((item) => item.repo))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map((name) => ({ value: name, label: name, count: INITIATIVES.filter((item) => inTab(item) && initiativeRepos(item).includes(name)).length }))} />
      <label className="items-select"><span className="sr-only">Finding type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="All">Finding type: All</option>{[...new Set(ESTATE_FINDINGS.map((item) => item.analysis))].sort().map((name) => <option key={name} value={name}>Finding type: {name}</option>)}</select></label>
      <label className="items-select"><span className="sr-only">Remediation</span><select value={fixType} onChange={(event) => setFixType(event.target.value)}><option value="All">Remediation: All</option>{['Managed TD', 'Custom TD', 'Specialized skill'].map((name) => <option key={name} value={name}>Remediation: {name}</option>)}</select></label>
      <button type="button" className={`items-quick ${quickWins ? 'on' : ''}`} aria-pressed={quickWins} onClick={() => setQuickWins(!quickWins)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" /></svg>Quick wins</button>
      <label className="items-select items-group-by"><span className="sr-only">Group by</span><select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>{['Severity', 'Repository', 'None'].map((name) => <option key={name} value={name}>Group by: {name}</option>)}</select></label>
      <span className="items-count">{plural(shown, 'item')}</span>
    </div>
    <div className="estate-findings-table-wrap"><table className="items-table findings-items">
      <colgroup><col style={{ width: 52 }} /><col /><col style={{ width: 230 }} /><col style={{ width: 170 }} /><col style={{ width: 120 }} /><col style={{ width: 250 }} /></colgroup>
      <thead><tr><th><span className="sr-only">Expand</span></th><th>Item</th><th>Scope</th><th>Detected by</th><th>Status</th><th>Remediation path</th></tr></thead>
      <tbody>{sections.filter((section) => section.items.length).map((section) => [
        section.label && <tr key={section.key} className="item-group"><td /><td colSpan={5}>{section.dot && <i style={{ background: section.dot }} aria-hidden="true" />}<strong>{section.label}</strong><span>{section.items.length}{findingCount(section) !== section.items.length && <em> · {plural(findingCount(section), 'finding')}</em>}</span></td></tr>,
        ...section.items.map((item) => <InitiativeRow key={`${section.key}-${item.id}`} initiative={item} expanded={expanded.has(item.id)} onExpand={() => toggle(item.id)} onNavigate={onNavigate} onOpenFinding={onOpenFinding} override={overrides[item.id]} onOverride={(value) => setOverride(item.id, value)} repoFilter={repo === 'All' ? null : repo} />),
      ])}</tbody>
    </table></div>
    {shown === 0 && <div className="findings-empty"><strong>Nothing matches these filters</strong><button type="button" className="dash-link" onClick={clear}>Clear filters</button></div>}
  </section>;
}

function AllFindingsTable({ focus, onOpenFinding }) {
  const [query, setQuery] = useState(focus.title || '');
  const [severity, setSeverity] = useState(focus.severity || 'All');
  const [analysis, setAnalysis] = useState(focus.analysis || 'All');
  const [repo, setRepo] = useState(focus.repo || 'All');
  const [fix, setFix] = useState('All');
  const analysesList = [...new Set(ESTATE_FINDINGS.map((item) => item.analysis))].sort();
  const repos = [...new Set(ESTATE_FINDINGS.map((item) => item.repo))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const matchesExceptSeverity = (item) => (analysis === 'All' || item.analysis === analysis) && (repo === 'All' || item.repo === repo)
    && (fix === 'All' || (fix === 'Available') === Boolean(item.remediation))
    && (!query || `${item.title} ${item.repo} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const base = ESTATE_FINDINGS.filter(matchesExceptSeverity);
  const rows = base.filter((item) => severity === 'All' || item.severity === severity);
  const filtered = query || analysis !== 'All' || repo !== 'All' || fix !== 'All' || severity !== 'All';
  const clear = () => { setQuery(''); setSeverity('All'); setAnalysis('All'); setRepo('All'); setFix('All'); };
  const select = (label, value, onChange, options) => <label className="findings-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
  return <>
    <div className="findings-severity" role="group" aria-label="Filter by severity">{['All', ...SEVERITY_ORDER].map((level) => <button key={level} type="button" aria-pressed={severity === level} className={`dash-card ${severity === level ? 'active' : ''}`} onClick={() => setSeverity(level)}><span>{level === 'All' ? 'All findings' : level}</span><strong className={level.toLowerCase()}>{level === 'All' ? base.length : base.filter((item) => item.severity === level).length}</strong></button>)}</div>
    <section className="dash-card estate-findings-table-card">
      <div className="findings-toolbar">
        <label className="findings-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by finding, repository, or category" aria-label="Search findings" /></label>
        {select('Analysis', analysis, setAnalysis, analysesList)}
        <label className="findings-select"><span>Repository</span><SearchableSelect label="Repository" value={repo} onChange={setRepo} placeholder="Find repositories" className="compact" options={repos.map((name) => ({ value: name, label: name, count: ESTATE_FINDINGS.filter((item) => item.repo === name).length }))} /></label>
        {select('Remediation', fix, setFix, ['Available', 'None'])}
        {filtered && <button type="button" className="dash-link findings-clear" onClick={clear}>Clear filters</button>}
        <span className="findings-count">{rows.length} of {ESTATE_FINDINGS.length}</span>
      </div>
      <div className="estate-findings-table-wrap"><table className="estate-findings-table"><thead><tr><th>Finding</th><th>Repository</th><th>Analysis</th><th>Severity</th><th>Remediation</th><th>Status</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id} onClick={() => onOpenFinding(item)}>
          <td><button type="button" className="dash-table-link" onClick={(event) => { event.stopPropagation(); onOpenFinding(item); }}>{item.title}</button><small>{item.category} · {INITIATIVES.find((initiative) => initiative.id === item.initiative)?.title}</small></td>
          <td>{item.repo}</td><td>{item.analysis}</td>
          <td><span className={`breakdown-severity ${item.severity.toLowerCase()}`}>{item.severity}</span></td>
          <td>{item.remediation || <span className="dash-muted">No remediation available</span>}</td>
          <td><span className={`dash-status ${item.status === 'In remediation' ? 'approval' : 'neutral'}`}>{item.status}</span></td>
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <div className="findings-empty"><strong>No findings match these filters</strong><button type="button" className="dash-link" onClick={clear}>Clear filters</button></div>}
    </section>
  </>;
}

function ImprovedFindings({ onNavigate }) {
  const [focus] = useState(() => { const value = pendingFindingsFocus; pendingFindingsFocus = null; return value || {}; });
  const [tab, setTab] = useState(focus.all || focus.title || focus.severity || focus.analysis || focus.repo ? 'all' : 'priority');
  const [selected, setSelected] = useState(null);
  const [explainer, setExplainer] = useState(false);
  const initiatives = INITIATIVES.filter((item) => !isStandalone(item)).length;
  const standalone = INITIATIVES.filter(isStandalone).length;
  const onTabKey = (event, index) => {
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null;
    if (next === null) return;
    const [id] = FINDINGS_TABS[(next + FINDINGS_TABS.length) % FINDINGS_TABS.length];
    setTab(id); document.getElementById(`findings-tab-${id}`)?.focus();
  };
  return <RailShell active="Findings" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Findings</h1><p>{ESTATE_FINDINGS.length} open findings · {initiatives} initiatives · {standalone} standalone · <button type="button" className="dash-link findings-how" aria-expanded={explainer} onClick={() => setExplainer(!explainer)}>How initiatives work</button></p></div></div>
    {explainer && <section className="initiatives-explainer findings-explainer"><Icon name="info" /><p>AWS Transform groups findings that should change together. A <strong>bundle</strong> fixes several findings in one repository with one pull request. A <strong>migration</strong> runs several TDs in order, because later steps depend on earlier ones. A <strong>campaign</strong> applies the same fix across repositories, with one pull request per repository. A <strong>standalone</strong> fix changes one thing. Progress counts verified fixes only.</p><button type="button" className="icon-button" onClick={() => setExplainer(false)} aria-label="Close"><Icon name="close" /></button></section>}
    <section className="findings-ai">
      <span className="initiatives-ai-mark"><AssistantMark size={16} /></span>
      <p>I grouped {ESTATE_FINDINGS.length} findings into {initiatives} initiatives and {standalone} standalone fixes, ordered by severity, then effort. I’d start with the Java services: the Spring Boot upgrade is blocked on Java 21.</p>
      <button type="button" className="initiative-review" onClick={() => askRailChat('What should I fix first?')}><AssistantSpark />Continue in chat</button>
    </section>
    <div className="findings-tabs" role="tablist" aria-label="Organize findings">{FINDINGS_TABS.map((entry, index) => { const [id, label] = entry; return <button key={id} id={`findings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} onKeyDown={(event) => onTabKey(event, index)}>{label}<span>{tabCount(entry)}</span></button>; })}</div>
    <div role="tabpanel" aria-labelledby={`findings-tab-${tab}`}>
      {tab === 'all' ? <AllFindingsTable focus={focus} onOpenFinding={setSelected} /> : <InitiativesTable key={tab} tab={tab} onNavigate={onNavigate} onOpenFinding={setSelected} />}
    </div>
    {selected && <FindingDetail finding={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} />}
  </RailShell>;
}

// Chat assistant for the rail pages: a docked panel with rich replies, artifacts, and suggested follow-ups.
const CHAT_ICON_PATHS = {
  up: <path d="M7 10.5V20H4.5v-9.5ZM7 10.5l4-7c1.7 0 2.6 1.1 2.2 2.8L12.6 9.5h5.6a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7" />,
  down: <path d="M7 13.5V4H4.5v9.5ZM7 13.5l4 7c1.7 0 2.6-1.1 2.2-2.8l-.6-3.2h5.6a2 2 0 0 0 2-2.4l-1.3-6.5a2 2 0 0 0-2-1.6H7" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M5 15.5V5.5A1.5 1.5 0 0 1 6.5 4h9.5" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  panel: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M13 4v16" /><rect x="14.5" y="5.5" width="4" height="13" fill="currentColor" stroke="none" /></>,
  slash: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="m14 7.5-4 9" /></>,
  at: <><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7" /></>,
  send: <path d="M4 4.5 20.5 12 4 19.5l2.5-7.5Zm2.5 7.5h7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  minimize: <path d="M6 12h12" />,
};
function ChatIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CHAT_ICON_PATHS[name]}</svg>;
}
function AssistantMark({ size = 30 }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d="M16 4 26.4 10v12L16 28 5.6 22V10Z" /><path d="m9 19 5-6 4 4 5-6" /></svg>;
}

const chatTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const artifactId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-artifact`);

function chatReply(prompt, onNavigate) {
  const lower = prompt.toLowerCase();
  const count = (filter) => ESTATE_FINDINGS.filter(filter).length;
  if (lower.includes('portfolio report')) return {
    body: <><p>Here’s the portfolio report across all <strong>6 repositories</strong> and <strong>{ESTATE_FINDINGS.length} open findings</strong>:</p><ul>
      <li><strong>Deadlines drive the order</strong> — Node 16 (Sep 30) is the only exposure at risk; 5 of 12 findings remain and the forecast lands Oct 8.</li>
      <li><strong>Most of the work is automatable</strong> — {count((item) => item.remediation)} findings map to an AWS Transform transformation; the rest need a specialized skill or a manual plan.</li>
      <li><strong>Security is concentrated</strong> — the hard-coded credentials and the committed AWS access key account for 2 of the 3 critical findings.</li></ul>
      <p>The report includes per-repository scores, a deadline timeline, and a recommended P1 → P3 remediation sequence.</p></>,
    artifact: 'portfolio-report.html',
    suggestions: ['Run a security report', 'Show findings for another repo', 'What should I fix first?'],
  };
  if (lower.includes('security')) {
    const security = ESTATE_FINDINGS.filter((item) => item.analysis === 'Security');
    return {
      body: <><p>The security report covers <strong>{security.length} findings</strong> across {new Set(security.map((item) => item.repo)).size} repositories:</p><ul>
        <li><strong>Hard-coded credentials</strong> in LegacyNodeJSOrderingSystem’s configuration — rotate them first; no transformation can do that for you. It’s a standalone fix, due Aug 31.</li>
        <li><strong>An AWS access key committed</strong> to payments-service history — also due Aug 31.</li>
        <li><strong>Container image CVEs</strong> — OpenSSL, glibc and curl in the amazonlinux:2 base image, fixed by moving each repository to Amazon Linux 2023 — under a day each.</li>
        <li><strong>Over-broad access</strong> — a public-read S3 bucket and IAM policies with wildcard actions in payments-service.</li></ul>
        <p>Critical and high CVEs are on a 30-day clock; 2 are due this week.</p></>,
      artifact: 'security-report.html',
      suggestions: ['Open security findings', 'How do I remediate the AUTH findings?', 'Generate the full portfolio report'],
    };
  }
  if (lower.includes('open security findings')) return null;
  if (lower.includes('auth')) return {
    body: <><p>The AUTH findings come from the agentic-readiness analysis of <strong>spring-petclinic</strong>. No AWS-managed transformation covers them, so there are two routes:</p><ul>
      <li><strong>Generate a specialized skill</strong> — AWS Transform drafts a skill from the 7 findings (scoped credentials, token validation, audit logging) and you review the plan before it opens a branch.</li>
      <li><strong>Plan it manually</strong> — export the findings to your backlog; AWS Transform re-checks them on the next analysis.</li></ul>
      <p>Start with <code>AUTH-Q2: Scoped service credentials</code> — the other AUTH gaps depend on it.</p></>,
    suggestions: ['Create a specialized skill', 'Show findings for another repo'],
  };
  if (lower.includes('another repo')) {
    const repos = [...new Set(ESTATE_FINDINGS.map((item) => item.repo))].map((repo) => [repo, count((item) => item.repo === repo)]).sort((a, b) => b[1] - a[1]);
    return {
      body: <><p>Open findings by repository:</p><ul>{repos.map(([repo, n]) => <li key={repo}><strong>{repo}</strong> — {n} findings</li>)}</ul><p>Pick one to open its findings.</p></>,
      suggestions: repos.slice(0, 4).map(([repo]) => `Findings for ${repo}`),
    };
  }
  if (lower.includes('split by team')) return {
    body: <><p>Split by owning team using CODEOWNERS:</p><ul><li><strong>Payments</strong> — payments-service: Java 21 migration, base image, access hardening, and 3 standalone fixes; payments-ui: the AngularJS migration.</li><li><strong>Orders</strong> — LegacyNodeJSOrderingSystem: the Node.js migration and 5 standalone fixes.</li><li><strong>Clinic</strong> — spring-petclinic: Java 21 and Spring Boot 3, plus 3 standalone fixes.</li><li><strong>Mobile &amp; Learning</strong> — MKPMobile and MyLearning.</li></ul><p>Each item stays within one repository, so splitting by team doesn’t change any of them.</p></>,
    suggestions: ['Apply the team split', 'What can I start today?'],
  };
  if (lower.includes('archived')) return {
    body: <p>None of the 6 analyzed repositories are archived, so nothing changes — all 9 initiatives and 49 findings stay. I’ll exclude archived repositories automatically from future groupings.</p>,
    suggestions: ['Split by team', 'What can I start today?'],
  };
  if (lower.includes('apply the team split')) return {
    body: <p>Done — I’ll show the team as a grouping option once owners are confirmed in Settings. Your current initiatives and order are unchanged until then.</p>,
    suggestions: ['What can I start today?'],
  };
  if (lower.includes('fix first') || lower.includes('start today')) return {
    body: <><p>You can start these today without waiting on anyone:</p><ul><li><strong>Modernize payments-service to Java 21</strong> — managed TDs cover every step; recommended next.</li><li><strong>Update the payments-service base image</strong> — one managed TD, under a day.</li><li><strong>4 low-severity standalone fixes</strong> — each under a day.</li></ul><p>The two exposed-secret fixes are the most urgent (critical, due Aug 31) — review their specialized skills first.</p></>,
    suggestions: ['Generate the full portfolio report', 'Run a security report'],
  };
  return {
    body: <p>I can summarize analyses, explain findings, generate reports, or plan remediations across your 6 repositories. Try one of the suggestions below, or ask about a specific repository or finding.</p>,
    suggestions: ['Generate the full portfolio report', 'Run a security report', 'What should I fix first?'],
  };
}

const CHAT_SEED = () => [
  { id: 'u0', role: 'user', text: 'Summarize the agentic readiness analysis for spring-petclinic', time: '9:29 PM' },
  { id: 'a0', role: 'assistant', time: '9:30 PM', artifact: { name: 'agentic-readiness-report.html', id: 'd625d835-ccd9-4cb3-b8ab-ba639050ce34' },
    suggestions: ['Generate the full portfolio report', 'Run a security report', 'How do I remediate the AUTH findings?', 'Show findings for another repo'],
    body: <><p>The agentic-readiness analysis of <strong>spring-petclinic</strong> found <strong>43 findings</strong>. The headline:</p><ul>
      <li><strong>Authentication is entirely absent</strong> — the single biggest theme. All 13 endpoints are public, with no identity, audit logging, or secrets management (6 of 7 AUTH findings are high). Before this service could safely sit behind an agent, this is the foundation you’d have to build first.</li>
      <li><strong>It’s barely agent-consumable today</strong> — 12 of 13 handlers return HTML views; only <code>GET /vets</code> is a true JSON endpoint, and there’s no OpenAPI spec. An agent would be stuck screen-scraping.</li>
      <li><strong>PII risk</strong> — owner PII is stored with no classification, no residency controls, and <code>Owner.toString()</code> can leak it into logs.</li>
      <li><strong>The good news:</strong> test coverage, input validation, and the domain schema are already solid, so the gaps are additive hardening rather than a rewrite.</li></ul>
      <p>The report groups all 43 into a P1 → P3 remediation order so you can see the sequencing: lock down identity/access and the API surface first, then operability (tracing, CI/CD, encryption), then the lower-risk polish.</p>
      <p>One note for context: this is the only completed agentic-readiness analysis in the account, and it covers a single repo — so this report reflects that one scan, not a broader portfolio.</p></> },
];

function ChatArtifact({ artifact }) {
  const html = () => `<!doctype html><title>${artifact.name}</title><body style="font-family:sans-serif;padding:32px"><h1>${artifact.name.replace(/\.html$/, '').replace(/-/g, ' ')}</h1><p>Generated by AWS Transform · Artifact ID ${artifact.id}</p></body>`;
  const url = () => URL.createObjectURL(new Blob([html()], { type: 'text/html' }));
  const download = () => { const link = document.createElement('a'); link.href = url(); link.download = artifact.name; link.click(); };
  return <div className="chat-artifact"><span className="chat-artifact-icon"><ChatIcon name="code" size={30} /></span><div><strong>{artifact.name}</strong><small>Artifact ID: {artifact.id}</small></div>
    <button type="button" className="chat-icon-button blue" onClick={download} aria-label={`Download ${artifact.name}`}><ChatIcon name="download" size={24} /></button>
    <button type="button" className="chat-icon-button" onClick={() => window.open(url(), '_blank', 'noopener')} aria-label={`Open ${artifact.name}`}><ChatIcon name="panel" size={24} /></button>
  </div>;
}

function ChatMessage({ message, latest, onSuggest }) {
  const [vote, setVote] = useState(null);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  if (message.role === 'user') return <div className="chat-user"><p>{message.text}</p></div>;
  if (message.typing) return <div className="chat-assistant"><div className="chat-typing" aria-label="AWS Transform is responding"><i /><i /><i /></div></div>;
  const copy = () => { navigator.clipboard?.writeText(bodyRef.current?.innerText || ''); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <div className="chat-assistant">
    <div className="chat-body" ref={bodyRef}>{message.body}</div>
    <div className="chat-meta">
      <button type="button" className={`chat-icon-button ${vote === 'up' ? 'on' : ''}`} onClick={() => setVote(vote === 'up' ? null : 'up')} aria-label="Helpful" aria-pressed={vote === 'up'}><ChatIcon name="up" /></button>
      <button type="button" className={`chat-icon-button ${vote === 'down' ? 'on' : ''}`} onClick={() => setVote(vote === 'down' ? null : 'down')} aria-label="Not helpful" aria-pressed={vote === 'down'}><ChatIcon name="down" /></button>
      <span className="chat-sep" />
      <button type="button" className="chat-icon-button" onClick={copy} aria-label="Copy response"><ChatIcon name="copy" /></button>
      <span className="chat-sep" />
      <span className="chat-time">{copied ? 'Copied' : message.time}</span>
    </div>
    {message.artifact && <ChatArtifact artifact={message.artifact} />}
    {latest && message.suggestions?.length > 0 && <div className="chat-suggestions">{message.suggestions.map((text) => <button key={text} type="button" onClick={() => onSuggest(text)}>{text}</button>)}</div>}
  </div>;
}

// Kept outside the component so the conversation survives moving between rail pages.
const railChat = { open: false, messages: null };
function RailAssistant({ onNavigate }) {
  const [open, setOpenState] = useState(railChat.open);
  const [messages, setMessagesState] = useState(() => railChat.messages || CHAT_SEED());
  const setOpen = (value) => { railChat.open = value; setOpenState(value); };
  const setMessages = (update) => setMessagesState((list) => { const next = typeof update === 'function' ? update(list) : update; railChat.messages = next; return next; });
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); inputRef.current?.focus(); } }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  const sendRef = useRef(null);
  useEffect(() => {
    const onAsk = (event) => { setOpen(true); window.setTimeout(() => sendRef.current?.(event.detail), 50); };
    window.addEventListener('rail-chat-ask', onAsk);
    return () => window.removeEventListener('rail-chat-ask', onAsk);
  }, []);
  useEffect(() => { document.body.classList.toggle('rail-chat-open', open); return () => document.body.classList.remove('rail-chat-open'); }, [open]);
  const send = (text) => {
    const prompt = text.trim();
    if (!prompt) return;
    // Some suggestions are actions rather than questions.
    if (prompt === 'Open security findings') { openFindings(onNavigate, { analysis: 'Security' }); return; }
    if (prompt.startsWith('Findings for ')) { openFindings(onNavigate, { repo: prompt.replace('Findings for ', '') }); return; }
    if (prompt === 'Create a specialized skill') { triggerCustomTd({ id: 'auth-hardening-spring-petclinic', repo: 'spring-petclinic', title: 'Add authentication to spring-petclinic', scope: '7 related findings', impact: 'High', effort: '3–5 days' }); writeActiveCustomTd('auth-hardening-spring-petclinic'); onNavigate('improved-custom-td'); return; }
    const typingId = `t${Date.now()}`;
    setDraft('');
    setMessages((list) => [...list, { id: `u${Date.now()}`, role: 'user', text: prompt, time: chatTime() }, { id: typingId, role: 'assistant', typing: true }]);
    window.setTimeout(() => {
      const reply = chatReply(prompt, onNavigate);
      setMessages((list) => list.map((item) => (item.id === typingId ? { id: typingId, role: 'assistant', time: chatTime(), ...reply, artifact: reply.artifact ? { name: reply.artifact, id: artifactId() } : null } : item)));
    }, 900);
  };
  sendRef.current = send;
  if (!open) return <button type="button" className="rail-chat-launcher" onClick={() => setOpen(true)} aria-label="Open AWS Transform chat"><AssistantMark /></button>;
  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant')?.id;
  return <aside className="rail-chat" aria-label="AWS Transform chat">
    <header className="rail-chat-header"><span className="rail-chat-mark"><AssistantMark size={20} /></span><strong>AWS Transform</strong>
      <button type="button" className="chat-icon-button" onClick={() => setOpen(false)} aria-label="Minimize chat"><ChatIcon name="minimize" /></button>
      <button type="button" className="chat-icon-button" onClick={() => { setOpen(false); setMessages(CHAT_SEED()); }} aria-label="Close chat"><ChatIcon name="close" /></button>
    </header>
    <div className="rail-chat-messages" ref={listRef}>
      <div className="chat-date"><span>{new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
      {messages.map((message) => <ChatMessage key={message.id} message={message} latest={message.id === lastAssistant} onSuggest={send} />)}
    </div>
    <form className="rail-chat-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
      <div className="chat-input">
        <textarea ref={inputRef} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(draft); } }} placeholder="Enter @ to reference an artifact" aria-label="Message AWS Transform" />
        <div className="chat-input-tools">
          <button type="button" className="chat-icon-button dark" onClick={() => { setDraft('/'); inputRef.current?.focus(); }} aria-label="Commands"><ChatIcon name="slash" /></button>
          <button type="button" className="chat-icon-button dark" onClick={() => { setDraft((value) => `${value}@`); inputRef.current?.focus(); }} aria-label="Reference an artifact"><ChatIcon name="at" /></button>
          <button type="submit" className="chat-icon-button chat-send" disabled={!draft.trim()} aria-label="Send"><ChatIcon name="send" size={22} /></button>
        </div>
      </div>
      <p>AWS Transform uses generative AI. You may need to verify responses.</p>
    </form>
  </aside>;
}

function RailShell({ active, onNavigate, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRoutes = { 'Continuous modernization': 'improved-dashboard', "What's new": 'improved-whats-new', Documentation: 'improved-documentation', 'Blog posts': 'improved-blog-posts', 'Success stories': 'improved-success-stories' };
  return <div className="improved-product-screen dash-screen">
    <header className="topbar improved-brandbar"><div className="brand-wrap"><button className="icon-button dash-menu" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg></button><span className="brandbar-mark"><Icon name="spark" size={18} /></span><div className="brandbar-text"><strong>AWS Transform Continuous Modernization</strong><span>Continuously understand, improve, and validate your application portfolio.</span></div></div><div className="top-actions"><button className="text-button">Provide feedback</button><span className="divider" /><span>N. Virginia (us-east-1)</span><button className="avatar">N</button></div></header>
    <div className="dash-body">
      <DashboardRail active={active} onNavigate={onNavigate} />
      <main className="dash-main">
        {children}
      </main>
    </div>
    <GlobalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={(label) => { if (drawerRoutes[label]) onNavigate(drawerRoutes[label]); }} />
    <RailAssistant onNavigate={onNavigate} />
  </div>;
}

function ImprovedDashboard({ onNavigate }) {
  const stats = [
    ['Open findings', '49', 'Down from 92 this quarter'],
    ['Verified resolved', '58', 'This quarter · 41 by AWS Transform'],
    ['Remediations in progress', '3', '1 failed validation'],
    ['Deadlines at risk', '1', 'Node 16 runtime · Sep 30', 'warning'],
  ];
  const severity = [['Critical', 3, 'critical'], ['High', 14, 'high'], ['Medium', 22, 'medium'], ['Low', 10, 'low']];
  const deadlines = [
    ['Node 16 runtime end of life', 12, 5, 'Sep 30', 'Oct 8', 'risk'],
    ['Google Play target API (MKPMobile)', 3, 3, 'Aug 31', 'Aug 28', 'approval'],
    ['AWS SDK v2 end of support', 10, 4, 'Oct 15', 'Sep 3', 'ok'],
    ['Critical and high CVEs', 18, 7, '30 days per finding', '2 due this week', 'ok'],
    ['Java 11 end of support', 14, 6, 'Dec 31', 'Oct 20', 'ok'],
    ['Spring Boot 2 end of support', 6, 3, 'Nov 30', 'Nov 12', 'ok'],
  ];
  const status = { risk: ['warning', 'At risk'], approval: ['info', 'In progress'], ok: ['check', 'On track'] };
  const maxSeverity = Math.max(...severity.map(([, n]) => n));
  return <RailShell active="Dashboard" onNavigate={onNavigate}>
        <div className="dash-title"><div><h1>Dashboard</h1><p>6 repositories · updated 14 min ago</p></div><Button variant="outline" onClick={() => onNavigate('improved-rail-run-analysis')}>Run new analysis</Button></div>
        <div className="dash-stats">{stats.map(([label, value, detail, tone]) => <section key={label} className={`dash-card dash-stat ${tone || ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></section>)}</div>
        <div className="dash-row">
          <div className="dash-main-col">
          <section className="dash-card dash-trend-card"><header><h2>Open findings this quarter</h2><span>Verified resolutions only</span></header><div className="dash-card-body"><DashboardTrend /></div></section>
          <section className="dash-card dash-needs"><header><h2>Remediations</h2><button type="button" className="dash-link" onClick={() => onNavigate('improved-rail-remediations')}>View all {EFFORTS.length}</button></header>
            <ul>{[...EFFORTS.filter((effort) => effort.state === 'failed'), ...EFFORTS.filter((effort) => effort.state === 'progress')].slice(0, 4).map((effort) => <li key={effort.id}><button type="button" onClick={() => openEffort(onNavigate, effort.id)}>
              <span className="dl-name"><strong>{effort.title}</strong><small>{effort.repo} · {effort.progress.label}</small></span>
              <span className="dash-needs-ask"><span className={effort.state === 'failed' ? 'failed' : 'progress'}>{effort.state === 'failed' ? 'Failed' : 'In progress'}</span><small className={effort.progress.subTone === 'risk' ? 'risk' : ''}>{effort.progress.sub}</small></span>
            </button></li>)}</ul>
          </section>
          </div>
          <div className="dash-side">
          <section className="dash-card dash-severity compact"><header><h2>By severity</h2><span>49 open</span></header><div className="dash-card-body"><dl>{severity.map(([label, n, tone]) => <div key={label} className="dash-severity-row" role="button" tabIndex={0} onClick={() => openFindings(onNavigate, { severity: label })} onKeyDown={(event) => event.key === 'Enter' && openFindings(onNavigate, { severity: label })}><dt>{label}</dt><dd><i className={tone} style={{ width: `${(n / maxSeverity) * 100}%` }} /></dd><strong>{n}</strong></div>)}</dl><button className="dash-link" onClick={() => onNavigate('improved-findings')}>View all findings</button></div></section>
            <section className="dash-card dash-deadlines-compact"><header><h2>Deadlines</h2><span>{deadlines.filter(([, , , , , tone]) => tone !== 'ok').length} need attention</span></header>
              <ul>{deadlines.map(([name, from, to, deadline, forecast, tone]) => <li key={name}><button type="button" onClick={() => onNavigate('improved-rail-remediations')}>
                <span className="dl-name"><strong>{name}</strong><small>{from} → {to} open · forecast <em className={tone === 'risk' ? 'risk' : ''}>{forecast}</em></small></span>
                <span className="dl-when"><span>{deadline}</span><span className={`dash-status ${tone}`}><Icon name={status[tone][0]} /> {status[tone][1]}</span></span>
              </button></li>)}</ul>
            </section>
          </div>
        </div>
        <AnalysisBreakdown onNavigate={onNavigate} />
  </RailShell>;
}

function ImprovedPriorities({ onNavigate }) {
  const [cliPlan, setCliPlan] = useState(null);
  const cliPlanMeta = { 'AngularJS → React migration plan': { id: 'PLAN-2048', repo: 'payments-ui' } }[cliPlan] || { id: 'PLAN-3110', repo: 'MyLearning' };
  const applied = useApplied();
  const tdIdFor = (initiative) => initiative.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const work = [
    ['Upgrade Node.js 16 runtime', 'LegacyNodeJSOrderingSystem', '3 related findings', 'High', '2–3 days', 'Auto-remediation ready'],
    ['Migrate AWS SDK v2 to v3', 'LegacyNodeJSOrderingSystem + 1', '5 related findings', 'High', '3–5 days', 'Auto-remediation ready'],
    ['Resolve vulnerable dependencies', 'MKPMobile', '4 findings', 'Medium', '1–2 days', 'Needs owner decision'],
    ['Establish test coverage', 'MyLearning', '1 finding', 'Medium', '3–5 days', 'Manual plan'],
    ['AngularJS → React migration plan', 'payments-ui', '12 related findings', 'High', '10–15 days', 'Manual plan'],
  ];
  return <ImprovedProductShell activeTab="Findings" stage="Prioritize" title="Prioritized modernization work" subtitle="Related findings are grouped into actionable initiatives and ranked by impact, urgency, effort, and confidence." actions={<><Button variant="outline">Adjust scoring</Button><Button>Plan selected work</Button></>} onNavigate={onNavigate}><section className="priority-summary"><div><span className="eyebrow">Portfolio recommendation</span><h2>Start with runtime and SDK modernization</h2><p>Completing the first two initiatives resolves 8 findings and removes the largest security and supportability risks in the portfolio.</p></div><div className="priority-score"><strong>8</strong><span>findings resolved</span></div><div className="priority-score"><strong>2</strong><span>initiatives</span></div><div className="priority-score"><strong>5–8d</strong><span>estimated effort</span></div></section><section className="card priority-table-card"><div className="priority-controls"><SearchBox value="" onChange={() => {}} placeholder="Find initiatives" /><button className="select-button">Impact: All <Icon name="chevron" /></button><button className="select-button">Readiness: All <Icon name="chevron" /></button><span>5 initiatives</span></div><div className="table-wrap"><table className="priority-table"><thead><tr><th /><th>Initiative</th><th>Repository</th><th>Scope</th><th>Impact</th><th>Effort</th><th>Readiness</th><th /></tr></thead><tbody>{work.map(([initiative, repo, scope, impact, effort, readiness], index) => {
                const manual = readiness === 'Manual plan';
                const tdId = tdIdFor(initiative);
                const isApplied = applied.some((item) => item.id === tdId);
                const readinessLabel = isApplied ? 'Remediation in progress' : manual ? 'Requires review' : readiness;
                const openPlan = () => { triggerCustomTd({ id: tdId, repo, title: initiative, scope, impact, effort }); writeActiveCustomTd(tdId); onNavigate('improved-custom-td'); };
                return <tr key={initiative} className={index === 0 ? 'recommended-row' : ''}><td><input type="checkbox" defaultChecked={index === 0} /></td><td><button className="initiative-link" onClick={manual ? openPlan : () => onNavigate('improved-rail-remediations')}>{initiative}</button>{index === 0 && <span className="recommended-label">Recommended next</span>}</td><td>{repo}</td><td>{scope}</td><td><span className={`impact ${impact.toLowerCase()}`}>{impact}</span></td><td>{effort}</td><td><span className={isApplied ? 'progress-state' : readiness.includes('ready') ? 'ready-state' : 'decision-state'}><Icon name={isApplied ? 'refresh' : readiness.includes('ready') ? 'check' : 'info'} /> {readinessLabel}</span></td><td>{manual ? (isApplied ? <button className="td-draft-button" onClick={() => { window.localStorage.setItem('atx-highlight-rem', tdId); onNavigate('improved-rail-remediations'); }}><Icon name="refresh" /> View remediation</button> : <button className="td-draft-button" onClick={openPlan}><Icon name="report" /> Review specialized skill</button>) : <Icon name="forward" />}</td></tr>;
              })}</tbody></table></div></section><section className="explain-card"><Icon name="info" /><div><strong>Why this order?</strong><p>Recommendations combine severity, affected repositories, end-of-support dates, available transformations, estimated effort, dependency order, and validation confidence. You can adjust scoring at any time.</p></div><button className="link-button">View scoring details</button></section>{cliPlan && <div className="cli-handoff-layer" onMouseDown={() => setCliPlan(null)}><section className="cli-handoff-panel" onMouseDown={(event) => event.stopPropagation()}><div className="cli-handoff-header"><span className="terminal-mark"><Icon name="terminal" size={22} /></span><div><span className="eyebrow">Continue in AWS Transform CLI</span><h2>Pick up where you left off</h2></div><button className="icon-button" onClick={() => setCliPlan(null)}><Icon name="close" size={22} /></button></div><p>The manual plan and repository context will be handed to the CLI so you can continue interactively without starting over.</p><dl><div><dt>Plan</dt><dd>{cliPlan}</dd></div><div><dt>Repository</dt><dd>{cliPlanMeta.repo}</dd></div><div><dt>Saved context</dt><dd>Findings, repository scope, decisions, and recommended next steps</dd></div></dl><label><strong>Resume command</strong><span className="cli-command"><code>{`atx ct plan resume --id ${cliPlanMeta.id}`}</code><button><Icon name="copy" /> Copy</button></span></label><div className="cli-handoff-actions"><Button variant="outline" onClick={() => setCliPlan(null)}>Cancel</Button><Button onClick={() => setCliPlan(null)}><Icon name="terminal" /> Open AWS Transform CLI</Button></div></section></div>}</ImprovedProductShell>;
}

function ImprovedAnalysisProgress({ onNavigate }) {
  const cliRuns = useAtxJobs().filter((job) => job.kind === 'analysis').map((job) => ({
    id: job.id,
    name: `${job.label} · ${job.repo}`,
    type: job.analysisType ? `${job.analysisType} analysis` : 'Analysis',
    scope: job.repo,
    origin: 'CLI',
    started: 'Just now',
    status: job.progress >= 100 ? 'Completed' : job.progress < 3 ? 'Queued' : 'Running',
    tone: job.progress >= 100 ? 'completed' : job.progress < 3 ? 'queued' : 'running',
    progress: job.progress,
    detail: (job.repos && job.repos.length > 1 ? `${job.repos.join(', ')} · ` : '') + (job.progress >= 100 ? `Completed · ${job.findings ?? 0} findings · ${MODE_LABEL[job.mode] ?? job.mode}` : `${MODE_LABEL[job.mode] ?? job.mode} · streaming from CLI`),
    findingsList: job.findingsList ?? []
  }));
  const baseRuns = [
    { id: 'angular', name: 'AngularJS → React migration analysis', type: 'Modernization readiness', scope: 'payments-ui', origin: 'CLI', started: 'Aug 27, 2026 · 10:42 AM', status: 'Running', tone: 'running', progress: 62, detail: 'Analyzing component boundaries · 8 findings so far' },
    { id: 'agentic', name: 'Commerce agentic readiness', type: 'Agentic readiness', scope: '3 repositories', origin: 'CLI', started: 'Aug 27, 2026 · 9:18 AM', status: 'Running', tone: 'running', progress: 38, detail: '2 of 3 repositories active · 4 findings so far' },
    { id: 'baseline', name: 'Weekly portfolio baseline', type: 'Tech debt (comprehensive)', scope: '5 repositories', origin: 'Web', started: 'Aug 27, 2026 · 8:53 AM', status: 'Running', tone: 'running', progress: 74, detail: 'Synthesizing findings · ~4 minutes remaining' },
    { id: 'security', name: 'MKPMobile security review', type: 'Security', scope: 'MKPMobile', origin: 'Web', started: 'Aug 27, 2026 · 11:03 AM', status: 'Queued', tone: 'queued', progress: 0, detail: 'Waiting for an analysis worker' },
    { id: 'inventory', name: 'Legacy repository inventory', type: 'Modernization readiness', scope: '12 repositories', origin: 'CLI', started: 'Aug 26, 2026 · 4:17 PM', status: 'Needs attention', tone: 'attention', progress: 47, detail: 'Repository authentication failed for 2 repositories' },
    { id: 'quick', name: 'Node.js quick assessment', type: 'Tech debt (quick)', scope: 'LegacyNodeJSOrderingSystem', origin: 'CLI', started: 'Aug 25, 2026 · 2:08 PM', status: 'Completed', tone: 'completed', progress: 100, detail: 'Completed in 6m 12s · 10 findings' },
    { id: 'deep', name: 'Deep analysis for mobile portfolio', type: 'Tech debt (comprehensive)', scope: '3 repositories', origin: 'Web', started: 'Aug 24, 2026 · 10:24 AM', status: 'Completed', tone: 'completed', progress: 100, detail: 'Completed in 22m 41s · 17 findings' },
  ];
  const runs = [...cliRuns, ...baseRuns];
  return <ImprovedProductShell activeTab="Analyses" stage="Understand" title="Analyses" subtitle="Monitor analysis work across the web application and AWS Transform CLI." actions={<Button>Run new analysis</Button>} onNavigate={onNavigate}><div className="analysis-operations-overview"><article><span>Running</span><strong>3</strong><small>Across 9 repositories</small></article><article><span>Queued</span><strong>1</strong><small>Waiting for capacity</small></article><article className="attention"><span>Needs attention</span><strong>1</strong><small>Repository access issue</small></article><article className="completed"><span>Completed</span><strong>24</strong><small>7 completed this month</small></article></div><section className="card analysis-operations"><div className="analysis-operations-controls"><SearchBox value="" onChange={() => {}} placeholder="Find analyses" /><button className="select-button">Status: All <Icon name="chevron" /></button><button className="select-button">Started from: All <Icon name="chevron" /></button><button className="select-button">Type: All <Icon name="chevron" /></button><span>29 analyses</span></div><div className="analysis-operations-tabs"><button className="active">All <span>29</span></button><button>In progress <span>4</span></button><button>Needs attention <span>1</span></button><button>Completed <span>24</span></button></div><div className="analysis-run-list">{runs.map((run) => <article key={run.id} className={`analysis-run-row ${run.tone}`}><span className={`analysis-run-icon ${run.tone}`}><Icon name={run.tone === 'completed' ? 'check' : run.tone === 'attention' ? 'warning' : run.tone === 'queued' ? 'schedule' : 'refresh'} /></span><div className="analysis-run-name"><button>{run.name}</button><small>{run.type}</small><span>{run.detail}</span></div><div className="analysis-run-scope"><small>Repository / scope</small><strong>{run.scope}</strong></div><div className="analysis-run-origin"><small>Started from</small><span className={`origin-badge ${run.origin.toLowerCase()}`}><Icon name={run.origin === 'CLI' ? 'terminal' : 'globe'} /> {run.origin}</span><em>{run.started}</em></div><div className="analysis-run-progress"><div><span className={`analysis-status-pill ${run.tone}`}>{run.status}</span><strong>{run.progress}%</strong></div><div className="analysis-progress-track"><i style={{ width: `${run.progress}%` }} /></div></div><div className="analysis-run-action">{run.origin === 'CLI' && run.tone !== 'completed' ? <Button variant="outline"><Icon name="terminal" /> Open in CLI</Button> : run.tone === 'attention' ? <Button variant="outline">Resolve</Button> : <Button variant="outline">View details</Button>}</div></article>)}</div><div className="queue-footer"><span>Showing 7 of 29 analyses</span><button className="link-button">Load more</button></div></section>{cliRuns.some((run) => run.status === 'Completed' && run.findingsList.length > 0) && <section className="card table-card"><div className="card-heading"><div><h3>Findings from CLI analyses</h3><p>Prepopulated from analyses you ran in the AWS Transform CLI.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Finding</th><th>Severity</th><th>Repository</th><th>Analysis</th></tr></thead><tbody>{cliRuns.filter((run) => run.status === 'Completed').flatMap((run) => run.findingsList.map((finding, index) => <tr key={`${run.id}-${index}`}><td>{finding.label}</td><td><span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span></td><td>{finding.repo ?? run.scope}</td><td>{run.type}</td></tr>))}</tbody></table></div></section>}</ImprovedProductShell>;
}

// Analysis done, no managed transformation matched a finding → the system auto-drafts
// a custom Transformation Definition and runs the loop, surfacing only assumptions (not
// questions), at most one real decision, and a final reviewable artifact.
const PLAN_DEFAULTS = [
  {
    key: 'Target',
    summary: 'React 18 + TypeScript · component-per-module · Vite on Node 20',
    value: [
      'Migrate the AngularJS 1.7 SPA to React 18 with TypeScript (strict mode).',
      '• One React component per AngularJS component/controller; colocate styles and tests.',
      '• Replace $scope / two-way binding with hooks + unidirectional state; keep public component contracts stable.',
      '• Preserve all 11 routes, deep links, query params, and URL structure exactly.',
      '• Move the build from Webpack 4 to Vite on Node 20; stay within the current bundle-size budget.',
      '• Keep the supported browser matrix and WCAG 2.1 AA accessibility unchanged.'
    ].join('\n')
  },
  {
    key: 'Approach',
    summary: 'Incremental strangler — routing behind an adapter until parity',
    value: [
      'Incremental “strangler” migration; the app stays shippable after every step.',
      '1. Establish a validation baseline (build, full test suite, functional snapshots).',
      '2. Break the 3 circular routing dependencies before touching feature code.',
      '3. Keep UI-Router behind a framework-neutral routing adapter; migrate shared/leaf components first.',
      '4. Migrate feature components in small, independently reviewable batches (≤ ~8 files each).',
      '5. Swap routing to React Router only after feature components reach parity.',
      '6. Modernize the build toolchain last; remove the adapter once parity holds.'
    ].join('\n')
  },
  {
    key: 'Validation',
    summary: 'Behavior parity: port 38 tests, replay 42 components, re-check 14 business rules',
    value: [
      'Require behavior parity against the pre-migration baseline before any merge.',
      '• Port the 38 existing unit tests; add coverage for every migrated component (≥ 85% statements).',
      '• Production build passes with 0 type errors (tsc --noEmit) and no new lint violations.',
      '• Functional-equivalence replay of recorded interactions across all 42 components.',
      '• Re-validate the 14 payment business rules (validation, retry, fee logic) — must be unchanged.',
      '• Integration / E2E for checkout, payment, and account flows: 0 regressions.',
      '• No new security or dependency advisories introduced.'
    ].join('\n')
  },
  {
    key: 'Guardrails',
    summary: 'Always buildable · small reversible PRs · approval gates · contracts preserved',
    value: [
      '• The app stays buildable and releasable after every step — no long-lived branches.',
      '• Changes land as small, reversible, independently reviewable PRs on a migration branch.',
      '• Human approval checkpoints before the routing swap and the build cutover.',
      '• Preserve external contracts: API calls, analytics event schema, and auth flows unchanged.',
      '• No data migrations and no changes to persisted formats.',
      '• Feature flags gate user-visible changes; an instant rollback path is retained.',
      '• Read-only until a change is approved; least-privilege access; secrets/config untouched.'
    ].join('\n')
  }
];

// Read-only definitions for managed + seeded skills. Published custom skills carry their own
// (edited) definition; anything without one falls back to PLAN_DEFAULTS.
const COMMON_GUARDRAILS = { key: 'Guardrails', summary: 'Always buildable · small reversible PRs · approval gates · contracts preserved', value: ['• App stays buildable/releasable after every step; changes land as small, reversible PRs.', '• Human approval before risky cutovers; an instant rollback path is retained.', '• External contracts (APIs, events, auth), persisted data formats, secrets, and config unchanged.'].join('\n') };
const mkField = (key, summary, lines) => ({ key, summary, value: lines.join('\n') });
const SKILL_DEFINITIONS = {
  'md-angular-react': PLAN_DEFAULTS,
  'custom-angularjs-react-migration-plan': PLAN_DEFAULTS,
  'md-node-upgrade': [
    mkField('Target', 'Node.js 20 LTS runtime + updated deps, images, and CI', ['• Move the runtime 16 → 20 (LTS): update engines, base images, and the CI matrix.', '• Bump dependencies to Node-20-compatible versions; rebuild native modules.', '• Keep public APIs and runtime behavior unchanged.']),
    mkField('Approach', 'Upgrade in place; let the build surface breakages', ['• Update runtime + lockfile, then fix breakages the build/tests reveal.', '• Address deprecations (streams, crypto, url) and native rebuilds.', '• One PR per package/service.']),
    mkField('Validation', 'Build + full suite green on Node 20; hot paths smoked', ['• CI green on Node 20; unit + integration suites pass.', '• Smoke the hot paths; check startup time and memory.', '• No new security advisories.']),
    COMMON_GUARDRAILS
  ],
  'md-sdk-v3': [
    mkField('Target', 'Modular AWS SDK v3 clients + middleware', ['• Replace aws-sdk v2 with @aws-sdk/* v3 clients per service.', '• Convert callbacks to promises; update mocks and pagination.', '• Preserve request behavior and the credentials chain.']),
    mkField('Approach', 'Service-by-service client migration', ['• Migrate one service client at a time behind existing interfaces.', '• Update tests/mocks alongside each client.', '• Remove v2 once no references remain.']),
    mkField('Validation', 'Tests green; recorded API calls match v2', ['• Unit/integration tests pass with v3 mocks.', '• Compare request payloads against v2 for parity.', '• No new advisories.']),
    COMMON_GUARDRAILS
  ],
  'md-vite': [
    mkField('Target', 'Vite build on Node 20 (from Webpack 4)', ['• Replace the Webpack 4 config with Vite; migrate loaders/plugins.', '• Preserve output structure, env handling, and the bundle budget.', '• Keep dev/prod parity.']),
    mkField('Approach', 'Stand up Vite alongside, then cut over', ['• Add Vite config; port entry points and aliases.', '• Verify dev + prod builds match, then remove Webpack.', '• One PR for config, one for cleanup.']),
    mkField('Validation', 'Prod build parity; bundle within budget; app boots', ['• Production build succeeds; bundle size within budget.', '• Smoke the app in dev and prod modes.', '• No missing assets or env regressions.']),
    COMMON_GUARDRAILS
  ],
  'custom-establish-test-coverage': [
    mkField('Target', 'Jest + React Testing Library harness with CI coverage gates', ['• Add Jest + RTL; wire coverage reporting into CI.', '• Seed tests for critical paths and shared utilities.', '• Fail CI below the agreed coverage threshold.']),
    mkField('Approach', 'Characterization tests first, then fill gaps', ['• Write characterization tests around current behavior.', '• Add unit tests for high-risk modules, then broaden.', '• Land in small PRs per area.']),
    mkField('Validation', 'Coverage ≥ target; suite stable in CI', ['• Statements coverage meets the agreed target.', '• No flaky tests; suite runs on every PR.', '• Behavior unchanged.']),
    COMMON_GUARDRAILS
  ],
  'custom-spring-boot-2-3': [
    mkField('Target', 'Spring Boot 3 + Jakarta EE 9 namespaces', ['• Upgrade Spring Boot 2.x → 3.x and Java baseline as required.', '• Migrate javax.* → jakarta.* imports and update config properties.', '• Align starters, security, and data dependencies to the 3.x line.']),
    mkField('Approach', 'Upgrade in place, guided by tests', ['• Bump the parent/BOM, then resolve compile + property breakages.', '• Migrate namespaces module-by-module; update deprecated APIs.', '• One PR per module.']),
    mkField('Validation', 'Integration tests green; no behavior drift', ['• Full unit + integration suite passes on Boot 3.', '• Contract/endpoint checks match the 2.x baseline.', '• No new advisories.']),
    COMMON_GUARDRAILS
  ],
  'custom-log4j-upgrade': [
    mkField('Target', 'Safe Log4j with vulnerable APIs removed', ['• Upgrade Log4j to a patched line; remove JNDI lookups.', '• Replace deprecated/unsafe logging APIs with safe equivalents.', '• Pin logging configuration and disable message lookups.']),
    mkField('Approach', 'Sweep then verify', ['• Bump the dependency, then codemod unsafe call sites.', '• Re-scan for residual vulnerable patterns.', '• One PR per service.']),
    mkField('Validation', 'Scans clean; logging output unchanged', ['• Security scan shows no Log4j advisories.', '• Log output and levels match the baseline.', '• Tests pass.']),
    COMMON_GUARDRAILS
  ],
  'custom-expo-sdk-38-51': [
    mkField('Target', 'Expo SDK 51 with compatible native modules', ['• Upgrade Expo SDK 38 → 44 → 51 in stages.', '• Replace/patch incompatible native modules; update RN + JS deps.', '• Keep app behavior and navigation unchanged.']),
    mkField('Approach', 'Staged SDK bumps behind CI gates', ['• One SDK major at a time; resolve config/plugins each step.', '• Compatibility shims for native modules; verify on a device matrix.', '• A PR per stage.']),
    mkField('Validation', 'Build + smoke on device matrix; 0 regressions', ['• iOS/Android builds pass; smoke run on the device matrix.', '• Existing tests green; key flows verified.', '• No new advisories.']),
    COMMON_GUARDRAILS
  ]
};
const definitionFor = (skill) => skill.definition || SKILL_DEFINITIONS[skill.id] || PLAN_DEFAULTS;

// Detailed transcripts for previously-run chats shown in the sidebar (read-only history).
const CHAT_TRANSCRIPTS = {
  node16: [
    { role: 'agent', lines: ['Here\'s the plan for “Upgrade Node.js 16 runtime” on LegacyNodeJSOrderingSystem:', 'Target — Node.js 20 LTS · updated deps, base images, CI', 'Approach — Upgrade in place; fix breakages guided by the build', 'Validation — Full suite green on Node 20; hot paths smoked'] },
    { role: 'user', text: 'Any breaking changes I should worry about?' },
    { role: 'agent', lines: ['Three: a deprecated url.parse in two modules, a native bcrypt rebuild, and OpenSSL 3 defaults affecting one crypto call. I handle all three and pin the versions.'] },
    { role: 'user', text: 'Is this auto-remediation ready, or does it need a custom skill?' },
    { role: 'agent', lines: ['Auto-remediation ready — it matches the managed Node.js upgrade skill, so it runs with approval checkpoints and opens a PR. No custom skill needed.'] },
    { role: 'note', text: 'Applied · PR #186 opened — behavioral tests flagged 1 regression for you to review.' }
  ],
  expo: [
    { role: 'agent', lines: ['Here\'s the specialized skill for “Expo SDK 38 → 51” on MKPMobile:', 'Target — Expo SDK 51 with compatible native modules', 'Approach — Staged SDK bumps (38 → 44 → 51) behind CI gates', 'Validation — Build + smoke run on the device matrix'] },
    { role: 'user', text: 'Why staged instead of one jump to 51?' },
    { role: 'agent', lines: ['Jumping 38 → 51 in one step breaks native modules and config plugins silently. Staging through 44 lets each step build and smoke-test, so failures are localized and reversible.'] },
    { role: 'user', text: 'What about the two native modules you flagged?' },
    { role: 'agent', lines: ['react-native-camera and a maps SDK are unmaintained on 51. I wrap them behind compat shims and verify on the device matrix; if one can\'t be shimmed I flag a drop-in replacement rather than guess.'] },
    { role: 'note', text: 'Draft ready · pending your review — not yet applied.' }
  ]
};

// "Walk me through it" — runs the process the CLI would run, as a guided chat inside the
// web app (replaces the CLI handoff). Scripted checkpoints; ends by applying the remediation.
function GuidedWalkthrough({ subject, plan, onClose, onNavigate, onUpdatePlan, initial = 'start', context }) {
  subject = subject || { id: 'portfolio', title: 'Continuous Modernization', repo: 'your portfolio' };
  plan = plan || PLAN_DEFAULTS.map((row) => ({ ...row, def: row.value }));
  const summaries = {};
  plan.forEach((row) => { summaries[row.key] = row.summary; });

  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(null);
  const [options, setOptions] = useState(null); // quick-reply options for the current step
  const [input, setInput] = useState('');
  const [done, setDone] = useState(false);
  const timers = useRef([]);
  const stepRef = useRef('start');
  const goRef = useRef(() => {});
  const started = useRef(false);
  const bodyRef = useRef(null);
  const choicesRef = useRef({}); // captured target / approach / validation selections (from-scratch)
  const generalChat = { id: 'general', title: 'New chat', subtitle: 'Analysis & findings', general: true };
  const skillChat = { id: subject.id, title: subject.title, subtitle: subject.repo };
  const [chats, setChats] = useState(() => (initial === 'general'
    ? [generalChat, skillChat, { id: 'node16', title: 'Upgrade Node.js 16 runtime', subtitle: 'LegacyNodeJSOrderingSystem' }, { id: 'expo', title: 'Expo SDK 38 → 51', subtitle: 'MKPMobile' }]
    : [skillChat, { id: 'node16', title: 'Upgrade Node.js 16 runtime', subtitle: 'LegacyNodeJSOrderingSystem' }, { id: 'expo', title: 'Expo SDK 38 → 51', subtitle: 'MKPMobile' }]));
  const [activeChat, setActiveChat] = useState(() => (initial === 'general' ? generalChat : skillChat));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;
  const resetTo = (chat) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    activeChatRef.current = chat;
    setActiveChat(chat); setBusy(null); setInput(''); setDone(false); choicesRef.current = {};
    const transcript = CHAT_TRANSCRIPTS[chat.id];
    if (transcript) {
      setLog(transcript);
      setOptions([{ label: 'Start a new chat', value: '__newchat', tone: 'action' }]);
      stepRef.current = 'history';
    } else {
      setLog([]); setOptions(null);
      goRef.current(chat.general ? 'general' : 'start');
    }
  };
  const newChat = () => { const chat = { id: `new-${Date.now()}`, title: 'New chat', subtitle: 'Analysis & findings', general: true }; setChats((current) => [chat, ...current]); resetTo(chat); };

  // Build the specialized skill's fields from the choices made while building from scratch.
  const buildUpdatedPlan = () => {
    const base = {};
    PLAN_DEFAULTS.forEach((row) => { base[row.key] = { key: row.key, summary: row.summary, value: row.value }; });
    const target = choicesRef.current.target || '';
    if (/angular/i.test(target)) base.Target = { key: 'Target', summary: 'Angular 17+ standalone modules', value: 'Migrate to modern Angular (17+) with standalone modules and the Angular CLI. Preserve routes and behavior; expect a larger DI and template rewrite.' };
    else if (target && !/react/i.test(target)) base.Target = { key: 'Target', summary: `${target} · specialized`, value: `Migrate to ${target}. Preserve public contracts, routes, and behavior; validate in stages.` };
    const approach = choicesRef.current.approach || '';
    if (/bridge/i.test(approach)) base.Approach = { key: 'Approach', summary: 'Bridge — run old & new together, then cut over', value: 'Run the legacy and new implementations side by side behind a bridge, migrate traffic incrementally, then remove the legacy path.' };
    else if (/rewrite/i.test(approach)) base.Approach = { key: 'Approach', summary: 'Full rewrite in a single pass', value: 'Rebuild the module in the target stack in one pass. Fastest, highest risk — requires full re-validation before merge.' };
    const validation = choicesRef.current.validation || '';
    if (/fresh/i.test(validation)) base.Validation = { key: 'Validation', summary: 'Author a fresh test suite for migrated code', value: 'Write new unit/integration tests for migrated components; establish coverage where none existed; gate merge on the new suite.' };
    else if (/visual/i.test(validation)) base.Validation = { key: 'Validation', summary: 'Visual & UX parity vs the baseline', value: 'Compare rendered output and interactions against the pre-migration baseline; snapshot and interaction checks must match.' };
    return [base.Target, base.Approach, base.Validation, base.Guardrails];
  };
  const record = (step, label) => { if (['target', 'approach', 'validation'].includes(step)) choicesRef.current[step] = label; };

  const push = (item) => setLog((current) => [...current, item]);
  const agent = (...lines) => push({ role: 'agent', lines });
  const note = (text) => push({ role: 'note', text });
  const progress = (label, doneText, next) => {
    setOptions(null); setBusy(`${label}…`);
    timers.current.push(setTimeout(() => { setBusy(null); note(doneText); timers.current.push(setTimeout(() => goRef.current(next), 700)); }, 2000));
  };

  // Q&A about the recommended skill (default mode), plus a "build from scratch" hand-off.
  const QA_CHIPS = [
    { label: 'Build from scratch', value: 'scratch', tone: 'action' }
  ];
  // Topic chips shown after an answer, so the user can explore the skill.
  const SKILL_TOPIC_CHIPS = [
    { label: 'What it changes', q: 'change', tone: 'info' },
    { label: 'Approach', q: 'approach', tone: 'info' },
    { label: 'Validation', q: 'validation', tone: 'info' },
    { label: 'Guardrails', q: 'guardrails', tone: 'info' },
    { label: 'Open decisions', q: 'decisions', tone: 'info' },
    { label: 'Risks', q: 'risks', tone: 'info' },
    { label: 'Build from scratch', value: 'scratch', tone: 'action' }
  ];
  const field = (key) => plan.find((row) => row.key === key) || { value: '', summary: '' };
  const answerText = (text) => {
    const t = text.toLowerCase();
    if (/scratch|from scratch|build (it|one|my|from)|start over/.test(t)) { goRef.current('scratch'); return; }
    let lines;
    if (/why|react|angular|target|framework|instead|choose/.test(t)) lines = ['I recommend React 18 + TypeScript: your components and state patterns map cleanly to React, and AngularJS is end-of-life (Jan 2022) — staying is the real risk. Modern Angular is possible but a larger DI/template rewrite for similar risk.'];
    else if (/change|scope|files|affect|what.*(do|will)/.test(t)) lines = ['Here is what it targets:', ...field('Target').value.split('\n')];
    else if (/approach|strangler|steps|sequence|order|how.*run/.test(t)) lines = ['Approach:', ...field('Approach').value.split('\n')];
    else if (/validat|test|parity|verify|prove|regress/.test(t)) lines = ['Validation:', ...field('Validation').value.split('\n')];
    else if (/guard|safe|rollback|merge|contract|protect/.test(t)) lines = ['Guardrails:', ...field('Guardrails').value.split('\n')];
    else if (/decision|input|need.*(me|you)|gap|choose|choice|approv/.test(t)) lines = ['Only one thing may need your input: whether to drop an unmaintained dependency now or defer it (I recommend deferring). Two code gaps — the legacy payment-gateway interceptor and the analytics event contract — I resolve with safe, behavior-preserving defaults.'];
    else if (/effort|time|long|days|estimate/.test(t)) lines = [`Estimated effort: ${subject.effort || 'a few days'} — mostly feature-component migration and validation.`];
    else if (/risk|danger|break|concern/.test(t)) lines = ['Main risks: AngularJS end-of-life; 3 circular routing dependencies (kept behind an adapter until parity); and thin test coverage (I add coverage before relying on it).'];
    else lines = ['I can cover the target, what it changes, the approach, validation, guardrails, the open decisions, effort, or risks — ask about any of those, or say “build from scratch”.'];
    // Take a beat before answering, like the CLI.
    setOptions(null);
    setBusy('Thinking…');
    timers.current.push(setTimeout(() => { setBusy(null); agent(...lines); stepRef.current = 'qa'; setOptions(SKILL_TOPIC_CHIPS); }, 900));
  };
  const answer = (q) => answerText({ 'why-target': 'why this target', change: 'what does it change', approach: 'the approach', validation: 'how is it validated', guardrails: 'the guardrails', decisions: 'what needs my input', effort: 'effort estimate', risks: 'the risks' }[q] || q);

  // General assistant mode (new chat): Q&A about the analysis and findings, not one skill.
  const GENERAL_CHIPS = [
    { label: "What's most urgent?", q: 'urgent', tone: 'info' },
    { label: "What's auto-remediation-ready?", q: 'auto', tone: 'info' },
    { label: 'What needs a specialized skill?', q: 'needs-skill', tone: 'action' }
  ];
  const answerGeneralText = (text) => {
    const t = text.toLowerCase();
    let lines;
    if (/urgent|priorit|most important|first|risk/.test(t)) lines = ['Top risks right now: Node.js 16 end-of-life and AWS SDK v2 on LegacyNodeJSOrderingSystem, and AngularJS end-of-life on payments-ui. Completing the first two initiatives resolves 8 findings and clears the biggest security and supportability risk.'];
    else if (/auto|ready|managed|no.*(skill|custom)/.test(t)) lines = ['Auto-remediation-ready: “Upgrade Node.js 16 runtime” and “Migrate AWS SDK v2 → v3” on LegacyNodeJSOrderingSystem. Both match managed skills, run with approval checkpoints, and open a PR — no custom skill needed.'];
    else if (/specializ|custom|manual|no managed|from scratch/.test(t)) lines = ['These have no managed transformation, so they get a specialized skill: “AngularJS → React” on payments-ui and “Establish test coverage” on MyLearning. MKPMobile\'s Expo SDK 38 → 51 is drafted too. Open any from Findings to review its plan.'];
    else if (/finding|how many|count|total/.test(t)) lines = ['29 open findings across 5 repositories — 12 high severity. The biggest clusters are dependencies (9) and security (5).'];
    else if (/repo|which.*(most|worst)|where/.test(t)) lines = ['LegacyNodeJSOrderingSystem carries the most findings, followed by MKPMobile and payments-ui. MyLearning is lightest (test coverage).'];
    else lines = ["I can cover what's most urgent, what's auto-remediation-ready, what needs a specialized skill, findings by repository, or the overall counts — ask about any of those."];
    setOptions(null);
    setBusy('Thinking…');
    timers.current.push(setTimeout(() => { setBusy(null); agent(...lines); stepRef.current = 'general-qa'; setOptions(GENERAL_CHIPS); }, 900));
  };
  const answerGeneral = (q) => answerGeneralText({ urgent: "what's most urgent", auto: 'auto-remediation ready', 'needs-skill': 'what needs a specialized skill' }[q] || q);

  function go(step) {
    stepRef.current = step;
    switch (step) {
      case 'start': {
        const chat = activeChatRef.current;
        agent(`Here's the specialized skill I recommend for “${chat.title}” on ${chat.subtitle}:`, `Target — ${summaries.Target}`, `Approach — ${summaries.Approach}`, `Validation — ${summaries.Validation}`, `Guardrails — ${summaries.Guardrails}`);
        agent('Ask me anything about it, or we can build one from scratch together.');
        stepRef.current = 'qa';
        setOptions(QA_CHIPS);
        break;
      }
      case 'general':
        agent(context
          ? `New chat. You're on ${context} — ask me anything about your analysis and findings, or act on what you're viewing here.`
          : "New chat — ask me anything about your analysis and findings: what's most urgent, which repos carry the most risk, what's auto-remediation-ready, or what needs a specialized skill.");
        stepRef.current = 'general-qa';
        setOptions(context ? [...GENERAL_CHIPS, { label: `Work on ${context}`, value: '__context', tone: 'action' }] : GENERAL_CHIPS);
        break;
      // ---- build from scratch (mirrors the TUI) ----
      case 'scratch':
        agent(`Okay — let's build a transformation for ${subject.repo} from scratch, the way the CLI walks it.`);
        go('interview-driver');
        break;
      case 'interview-driver':
        agent("Got it. First — what's the main driver behind this?");
        setOptions([{ label: 'Retire end-of-life / security risk', value: 'interview-scope' }, { label: 'Improve developer velocity', value: 'interview-scope' }, { label: 'Improve performance & UX', value: 'interview-scope' }, { label: 'Reduce cost / consolidate', value: 'interview-scope' }]);
        break;
      case 'interview-scope':
        agent('How far should this modernization go?');
        setOptions([{ label: 'Framework only', value: 'interview-constraints' }, { label: 'Framework + build tooling', value: 'interview-constraints' }, { label: '+ tests & CI', value: 'interview-constraints' }, { label: 'Full modernization', value: 'interview-constraints' }]);
        break;
      case 'interview-constraints':
        agent('Anything I should work around?');
        setOptions([{ label: 'No hard constraints', value: 'assess' }, { label: 'A deadline to hit', value: 'assess' }, { label: 'Limited team bandwidth', value: 'assess' }, { label: 'Must stay shippable', value: 'assess' }]);
        break;
      case 'assess':
        agent('I work from your actual code, not assumptions — reading the structure, dependencies, tests, and business rules. Nothing changes while I inspect.');
        progress('Reading the repository — stack, dependencies, tests, and business rules', 'Understood payments-ui: AngularJS 1.7 · Node 16 / Webpack 4 · 42 components · 3 routing cycles · 14 payment rules · thin test coverage.', 'target');
        break;
      case 'target':
        agent('Based on your code, I recommend migrating to React 18 + TypeScript — best fit for your component structure and state, and it removes the AngularJS end-of-life risk.');
        setOptions([{ label: 'Use React 18 + TypeScript (recommended)', value: 'approach' }, { label: 'Modern Angular instead', value: 'approach' }, { label: 'Something else…', value: '__type-target' }]);
        break;
      case 'approach':
        agent('How should the migration run?');
        setOptions([{ label: 'Incremental strangler (recommended)', value: 'validation' }, { label: 'Bridge, then cut over', value: 'validation' }, { label: 'Full rewrite', value: 'validation' }]);
        break;
      case 'validation':
        agent('And how should I validate correctness?');
        setOptions([{ label: 'Behavior parity + existing tests (recommended)', value: 'generate' }, { label: 'Author a fresh test suite', value: 'generate' }, { label: 'Visual & UX parity', value: 'generate' }]);
        break;
      case 'generate':
        agent("Now I'll draft the Transformation Definition from your decisions and the assessment — then check it for gaps and harden it myself. You won't have to resolve anything by hand.");
        progress('Drafting the Transformation Definition from your decisions', 'Draft ready — React 18 + TS · incremental strangler · behavior parity.', 'gap-analysis');
        break;
      case 'gap-analysis':
        progress('Running gap analysis on the draft', 'Found 2 gaps — the legacy payment-gateway interceptor and the analytics event contract.', 'harden');
        break;
      case 'harden':
        agent("I'll resolve both myself, preserving current behavior — no hand-off needed:");
        progress('Resolving the gaps and re-strengthening the skill', 'Gateway wrapped behind a framework-neutral adapter (migrated last); analytics re-emitted from a React hook with the same event schema.', 'reground');
        break;
      case 'reground':
        progress('Re-grounding the skill in repository evidence and re-validating it', 'Skill hardened — confidence High · 0 open gaps · reusable across matching repos.', 'plan');
        break;
      case 'plan':
        progress('Crafting a plan — sequencing for safety before speed', 'Plan ready — 8 steps, routing kept behind an adapter, approval checkpoints before the cutover.', 'plan-approve');
        break;
      case 'plan-approve':
        agent("Here's the plan. You can review it, modify it, or update the specialized skill to match what we built — I'll pause at the checkpoints when we run it.");
        setOptions([{ label: 'Review plan', value: 'review-plan', tone: 'info' }, { label: 'Modify plan', value: '__type-plan', tone: 'info' }, { label: 'Update skill', value: 'update-skill', tone: 'action' }]);
        break;
      case 'review-plan':
        agent('Proposed plan:', '1. Establish a validation baseline', '2. Isolate application boundaries', '3. Migrate shared components', '4. Migrate feature components in small batches', '5. Update routing and state integration', '6. Modernize the build configuration', '7. Validate functional equivalence', '8. Identify remaining modernization debt');
        setOptions([{ label: 'Modify plan', value: '__type-plan', tone: 'info' }, { label: 'Update skill', value: 'update-skill', tone: 'action' }, { label: 'Begin modernization', value: 'execute', tone: 'primary' }]);
        break;
      case 'update-skill':
        if (onUpdatePlan) onUpdatePlan(buildUpdatedPlan());
        agent('Updated the specialized skill — Target, Approach, Validation, and Guardrails now reflect what we built. You can see the changes on the skill card behind this chat.');
        setOptions([{ label: 'Begin modernization', value: 'execute', tone: 'primary' }, { label: 'Close', value: '__close', tone: 'neutral' }]);
        break;
      case 'execute':
        agent('Beginning the migration — small, independently reviewable batches, and the app stays buildable after every step. I\'ll pause when I hit a real decision.');
        progress('Modernizing payments-ui — migrating components in batches', '18 / 42 components migrated · build green.', 'decision');
        break;
      case 'decision':
        agent('A decision that needs your judgment: routing still runs on UI-Router behind the adapter. Preserve it until parity, or migrate routing now?');
        setOptions([{ label: 'Preserve the adapter (recommended)', value: 'finish' }, { label: 'Migrate routing now', value: 'finish' }]);
        break;
      case 'finish':
        agent("Applying your decision. Once the migration finishes, I validate my own work against your pre-migration baseline before handing anything back.");
        progress('Finishing the migration, then validating against the baseline', 'Migration complete — 42/42 components, 127 tests, build green. Validated: 0 regressions.', 'complete');
        break;
      case 'complete':
        applyRemediation({ id: subject.id, repo: subject.repo, title: subject.title });
        agent(`Done — ${subject.repo} is migrated. I opened a pull request; nothing is merged, it's waiting on your review. It now appears under Remediations.`);
        setOptions(null); setDone(true);
        break;
      default:
        break;
    }
  }
  goRef.current = go;
  // StrictMode-safe: run the opening step exactly once for this panel's lifetime.
  useEffect(() => { if (started.current) return; started.current = true; go(initial === 'general' ? 'general' : 'start'); const list = timers.current; return () => list.forEach(clearTimeout); }, []);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; });

  const activate = (value) => {
    setOptions(null);
    if (value === '__newchat') { newChat(); return; }
    if (value === '__close') { onClose(); return; }
    if (value === '__context') { agent(`Focusing on ${context}. I can build a specialized skill from scratch, or you can keep asking about the analysis.`); stepRef.current = 'general-qa'; setOptions([{ label: 'Build from scratch', value: 'scratch', tone: 'action' }, ...GENERAL_CHIPS]); return; }
    if (value === '__type-target') { agent('Sure — type the target framework you have in mind.'); stepRef.current = 'type-target'; return; }
    if (value === '__type-plan') { agent('Tell me what to change — e.g. “move routing earlier” — or say “begin” when ready.'); stepRef.current = 'type-plan'; return; }
    go(value);
  };
  const pick = (option) => { push({ role: 'user', text: option.label }); record(stepRef.current, option.label); if (option.q) { (stepRef.current === 'general-qa' ? answerGeneral : answer)(option.q); return; } activate(option.value); };

  const submit = (raw) => {
    const text = raw.trim();
    if (!text || busy || done) return;
    setInput('');
    push({ role: 'user', text });
    const step = stepRef.current;
    if (step === 'history') { agent('This is a past conversation — start a new chat to take action, or reopen the live one from the sidebar.'); return; }
    if (step === 'general-qa') { answerGeneralText(text); return; } // general questions about the analysis & findings
    if (step === 'qa') { answerText(text); return; } // free-form questions about the recommended skill
    if (options && options.length) {
      const n = Number.parseInt(text, 10);
      const matched = (!Number.isNaN(n) && n >= 1 && n <= options.length) ? options[n - 1] : options.find((o) => o.label.toLowerCase().includes(text.toLowerCase()));
      if (matched) { record(step, matched.label); activate(matched.value); return; }
      agent('Got it — noting that; going with the recommended option.');
      record(step, options[0].label);
      activate(options[0].value);
      return;
    }
    if (step === 'type-target') { choicesRef.current.target = text; agent(`${text} it is — I'll target that.`); go('approach'); return; }
    if (step === 'type-plan') { agent('Got it — folded that into the plan.'); go('plan-approve'); return; }
    agent('Noted. Pick an option above, or keep chatting.');
  };

  const placeholder = done ? 'Walkthrough complete'
    : stepRef.current === 'general-qa' ? 'Ask about your analysis & findings…'
      : stepRef.current === 'history' ? 'Past conversation — start a new chat to act'
    : stepRef.current === 'qa' ? 'Ask about the skill, or say “build from scratch”'
      : stepRef.current === 'type-target' ? 'Type a target framework…'
        : stepRef.current === 'type-plan' ? 'Describe a change, or type “begin”…'
          : options ? 'Reply, pick an option, or type a number' : 'Reply…';

  const chipTone = (option) => option.tone || (/recommended/i.test(option.label) ? 'rec' : 'info');
  return (
    <div className="walkthrough-layer" onMouseDown={onClose}>
      <div className={`walkthrough ${sidebarOpen ? '' : 'wt-narrow'}`} onMouseDown={(event) => event.stopPropagation()}>
        <aside className={`wt-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
          <div className="wt-sidebar-head">
            <button className="wt-collapse" onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? 'Collapse' : 'Expand chats'}><Icon name={sidebarOpen ? 'back' : 'forward'} size={18} /></button>
            {sidebarOpen && <strong>Chats</strong>}
            <button className="wt-newchat" onClick={newChat} title="New chat"><Icon name="plus" size={16} />{sidebarOpen ? ' New' : ''}</button>
          </div>
          <div className="wt-chatlist">
            {chats.map((chat) => <button key={chat.id} className={`wt-chatitem ${chat.id === activeChat.id ? 'active' : ''}`} onClick={() => resetTo(chat)}><span className="wt-chatmark"><BrandMark size={26} /></span><span className="wt-chatmeta"><strong>{chat.title}</strong><small>{chat.subtitle}</small></span></button>)}
          </div>
        </aside>
        <div className="wt-main">
          <div className="walkthrough-head"><BrandMark size={28} /><div><strong>AWS Transform</strong><span>Guided walkthrough · {activeChat.subtitle}</span></div><button className="icon-button" onClick={onClose}><Icon name="close" size={22} /></button></div>
          <div className="walkthrough-body" ref={bodyRef}>
            {log.map((item, index) => item.role === 'user'
              ? <div className="wt-msg user" key={index}>{item.text}</div>
              : item.role === 'note'
                ? <div className="wt-note" key={index}><Icon name="check" /> {item.text}</div>
                : <div className="wt-msg agent" key={index}>{(item.lines || [item.text]).map((line, li) => <p key={li}>{line}</p>)}</div>)}
            {busy && <div className="wt-busy"><span className="wt-spin"><Icon name="refresh" /></span> {busy}</div>}
            {options && !busy && <div className="wt-actions">{options.map((option) => <button key={option.label} className={`wt-chip ${chipTone(option)}`} onClick={() => pick(option)}>{option.label}</button>)}</div>}
            {done && <div className="wt-actions"><button className="wt-chip primary" onClick={() => { onClose(); onNavigate && onNavigate('Remediations'); }}>View in Remediations</button><button className="wt-chip neutral" onClick={onClose}>Close</button></div>}
          </div>
          <form className="wt-composer" onSubmit={(event) => { event.preventDefault(); submit(input); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={placeholder} disabled={done} aria-label="Message AWS Transform" />
            <button type="submit" aria-label="Send" disabled={done}><Icon name="send" /></button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CustomTdCard({ subject, onNavigate }) {
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [choices, setChoices] = useState({}); // decision key -> 'recommended' | 'alt'
  const [openField, setOpenField] = useState(null); // which plan field is expanded for editing
  const [plan, setPlan] = useState(() => PLAN_DEFAULTS.map((row) => ({ ...row, def: row.value })));
  const [applied, setApplied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [walk, setWalk] = useState(false);
  const [mode, setMode] = useState('overview'); // 'overview' | 'skill' | 'generating' | 'plan'
  const [planEditing, setPlanEditing] = useState(false);
  const [planOverride, setPlanOverride] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [revealed, setRevealed] = useState(1); // staged reveal: analysis → skill → plan
  const lineageRef = useRef(null);
  useEffect(() => {
    const el = lineageRef.current;
    if (!el || revealed >= 3) return;
    const timers = [];
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        timers.push(setTimeout(() => setRevealed((r) => Math.max(r, 2)), 900));
        timers.push(setTimeout(() => setRevealed((r) => Math.max(r, 3)), 2000));
      }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, [revealed]);
  const saveSkill = () => {
    const id = `custom-${subject.id}`;
    const existing = readSkills().find((item) => item.id === id) || SEED_CUSTOM_SKILLS.find((item) => item.id === id);
    const applyCount = (existing?.applyCount ?? 0) + 1;
    publishSkill({ id, name: `${subject.title} (${subject.repo} specialized)`, kind: 'custom', status: 'draft', owner: 'nkmoorth', description: `Specialized transformation for ${subject.repo}. Approach: ${plan.find((row) => row.key === 'Approach')?.summary ?? ''}`, usedIn: [subject.repo], accounts: ['nkmoorth'], applyCount, merges: existing?.merges ?? 0, runs: applyCount, version: 'v1', confidence: 'Draft — applied to this account', updated: 'Just now', definition: plan.map(({ key, summary, value }) => ({ key, summary, value })) });
    setSaved(true);
  };

  const decisions = [
    { key: 'sequencing', label: 'Cutover sequencing', recommended: 'Keep the adapter until parity — lowest risk', alt: 'Migrate the risky boundary first' },
    { key: 'dependency', label: 'Unmaintained dependency', recommended: 'Defer removal to a follow-up', alt: 'Remove it now (smaller surface)' }
  ];
  const choiceOf = (key) => choices[key] ?? 'recommended';
  const setField = (key, value) => setPlan((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));

  // The plan is generated from the skill — editing a skill field regenerates it.
  const buildPlan = () => {
    const approach = (plan.find((row) => row.key === 'Approach')?.value || '').toLowerCase();
    const validation = (plan.find((row) => row.key === 'Validation')?.value || '').toLowerCase();
    const validateStep = /fresh|new test|author/.test(validation) ? 'Run the newly authored test suite and gate the merge on it'
      : /visual|ux/.test(validation) ? 'Check visual & UX parity against the baseline'
        : 'Validate functional equivalence against the pre-migration baseline';
    const cutover = choiceOf('sequencing') === 'alt' ? 'Migrate the risky boundary first, then the rest' : 'Keep routing behind an adapter until parity, then swap';
    if (/rewrite/.test(approach)) return ['Establish a validation baseline', 'Rebuild the module in the target stack in one pass', 'Re-wire routing and state', 'Modernize the build configuration', validateStep, 'Cut over behind a feature flag'];
    if (/bridge/.test(approach)) return ['Establish a validation baseline', 'Stand up the new implementation behind a bridge', 'Route a slice of traffic to the new path', 'Migrate the remaining features', validateStep, 'Cut over and remove the bridge'];
    return ['Establish a validation baseline', 'Isolate application boundaries', 'Migrate shared components', 'Migrate feature components in small batches', cutover, 'Modernize the build configuration', validateStep, 'Identify remaining modernization debt'];
  };
  const planSteps = planOverride ?? buildPlan();
  const editStep = (index, value) => setPlanOverride((current) => { const base = current ?? buildPlan(); const next = [...base]; next[index] = value; return next; });
  useEffect(() => { if (mode !== 'generating') return; const timer = setTimeout(() => setMode('plan'), 1900); return () => clearTimeout(timer); }, [mode]);

  if (applied) {
    return (
      <section className="card custom-td-card">
        <div className="td-review"><div className="td-review-status"><Icon name="check" /><span>Applied. I saved the specialized skill as a draft (this account) in your Skills Library, generated a plan for {subject.repo}, and started the remediation. Nothing is merged.</span></div>
        <ol className="applied-chain"><li><Icon name="check" /> Draft skill saved — v1 · this account (nkmoorth)</li><li><Icon name="check" /> Plan generated for {subject.repo}</li><li><Icon name="check" /> Remediation started — branch + PR, awaiting review</li></ol>
        <div className="td-review-actions"><Button onClick={() => onNavigate && onNavigate('Remediations')}>View in Remediations</Button><Button variant="outline" onClick={() => onNavigate && onNavigate('Skills Library')}>View in Skills Library</Button><Button variant="outline" onClick={() => setApplied(false)}>Back to the plan</Button></div></div>
      </section>
    );
  }

  const start = () => { saveSkill(); applyRemediation({ id: subject.id, repo: subject.repo, title: subject.title, plan, choices }); setApplied(true); };
  const analysisLines = [
    `Finding: ${subject.title} · ${subject.scope || '1 finding'} · Impact ${subject.impact ?? '—'}`,
    'Searched AWS-managed transformations — no match for this finding',
    'Repository patterns, gaps, and tests require a tailored approach',
    'Confidence: High — grounded in the codebase analysis'
  ];

  const skillFields = (editable) => (
    <div className="assumptions-block"><div className="assumptions-list">
      {plan.map((row) => { const edited = row.value !== row.def; const open = openField === row.key; return (
        <div className={`assumption-row editable ${open ? 'open' : ''}`} key={row.key}>
          <button className="assumption-toggle" onClick={() => setOpenField(open ? null : row.key)}><Icon name={open ? 'chevron' : 'forward'} /><strong>{row.key}</strong><span className="assumption-value">{row.summary}</span><span className={`default-tag ${edited ? 'edited' : ''}`}>{edited ? 'edited' : 'default'}</span></button>
          {open && <div className="assumption-editor">
            {editable
              ? <><textarea value={row.value} rows={Math.min(10, row.value.split('\n').length + 1)} onChange={(event) => setField(row.key, event.target.value)} aria-label={`Edit ${row.key}`} /><div className="assumption-editor-actions">{edited && <button className="link-button" onClick={() => setField(row.key, row.def)}>Reset to default</button>}<span className="editor-hint">Modifies the skill; the plan is regenerated when you continue</span></div></>
              : <div className="assumption-body">{row.value.split('\n').map((line, index) => <p key={index}>{line}</p>)}</div>}
          </div>}
        </div>
      ); })}
    </div></div>
  );

  // Focused skill editor — only the skill; continuing regenerates the plan.
  if (mode === 'skill') {
    return (
      <section className="card custom-td-card">
        <div className="card-heading"><div><h3>Edit the skill</h3><p>The skill is the only thing in focus here. Adjust any field or decision, then generate a fresh plan from the codebase analysis and your changes.</p></div><span className="concept-chip">Step 1 · Skill</span></div>
        {skillFields(true)}
        <div className="td-decisions-label">Recommended decisions</div>
        <div className="decision-list">{decisions.map((decision) => (
          <div className="decision-item" key={decision.key}>
            <strong>{decision.label}</strong>
            <label className={choiceOf(decision.key) === 'recommended' ? 'selected' : ''}><input type="radio" name={decision.key} checked={choiceOf(decision.key) === 'recommended'} onChange={() => setChoices((c) => ({ ...c, [decision.key]: 'recommended' }))} /><span>{decision.recommended} <em>recommended</em></span></label>
            <label className={choiceOf(decision.key) === 'alt' ? 'selected' : ''}><input type="radio" name={decision.key} checked={choiceOf(decision.key) === 'alt'} onChange={() => setChoices((c) => ({ ...c, [decision.key]: 'alt' }))} /><span>{decision.alt}</span></label>
          </div>
        ))}</div>
        <div className="td-review-actions" style={{ marginTop: 16 }}><Button onClick={() => { setOpenField(null); setMode('generating'); }}>Generate plan →</Button><Button variant="outline" onClick={() => setMode('overview')}>Cancel</Button></div>
      </section>
    );
  }

  // Regenerating the plan from the updated skill + a fresh codebase analysis.
  if (mode === 'generating') {
    return (
      <section className="card custom-td-card">
        <div className="card-heading"><div><h3>Regenerating the plan</h3><p>Analyzing the codebase against your updated skill.</p></div><span className="concept-chip">Step 2 · Plan</span></div>
        <div className="wt-busy" style={{ padding: '18px 4px' }}><span className="wt-spin"><Icon name="refresh" /></span> Analyzing the codebase and regenerating the plan from your updated skill…</div>
      </section>
    );
  }

  // Review the regenerated plan; confirming returns to the overview with updated values.
  if (mode === 'plan') {
    return (
      <section className="card custom-td-card">
        <div className="card-heading"><div><h3>Review the regenerated plan</h3><p>Generated from your updated skill and a fresh analysis of {subject.repo}. Confirm to return to the summary.</p></div><span className="concept-chip">Step 2 · Plan</span></div>
        <h4 className="td-section">Plan · generated from the skill</h4>
        <ol className="td-plan">{planSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <div className="td-review-actions" style={{ marginTop: 16 }}><Button onClick={() => setMode('overview')}>Confirm plan</Button><Button variant="outline" onClick={() => setMode('skill')}>← Back to skill</Button></div>
      </section>
    );
  }

  // Overview — skill + plan shown together (read-only), then confirm to start remediation.
  return (
    <section className="card custom-td-card">
      <div className="card-heading">
        <div><h3>Specialized transformation skill</h3><p>Prepared from your analysis on Aug 25, 2026. Expand any item to review it, edit the skill (which regenerates the plan), have me walk you through it, or confirm to start.</p></div>
        <span className="concept-chip">Ready · requires review</span>
      </div>

      <div className="td-lineage" ref={lineageRef}>
        <div className="td-stage revealed">
          <div className="td-stage-rail"><span className="td-stage-node done"><Icon name="check" size={16} /></span><span className="td-stage-label">Analysis</span></div>
          <section className="td-subcard td-analysis done">
            <div className="td-subcard-head"><h4 className="td-section">Analysis · {subject.repo} <span className="done-chip">Done</span></h4><button className="link-button" onClick={() => setAnalysisOpen((v) => !v)}><Icon name={analysisOpen ? 'chevron' : 'forward'} /> {analysisOpen ? 'Hide' : 'View'} analysis</button></div>
            <p className="td-analysis-summary">Analyzed <strong>{subject.repo}</strong> on Aug 25, 2026. No AWS-managed transformation matched — the specialized skill was derived from it.</p>
            {analysisOpen && <ul className="td-analysis-findings">{analysisLines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
          </section>
        </div>
        <div className={`td-stage ${revealed >= 2 ? 'revealed' : ''}`}>
          <div className="td-stage-rail"><span className="td-stage-node">2</span><span className="td-stage-label">Skill</span></div>
          <section className="td-subcard">
            <div className="td-subcard-head"><h4 className="td-section">Skill · specialized Transformation Definition <span className="rec-tag">Recommended</span></h4><Button variant="outline" onClick={() => { setPlanOverride(null); setMode('skill'); }}><Icon name="edit" /> Edit skill</Button></div>
            {skillFields(false)}
            <div className="td-decisions-label">Recommended decisions</div>
            <ul className="decision-readonly">{decisions.map((decision) => <li key={decision.key}><span>{decision.label}</span><strong>{choiceOf(decision.key) === 'recommended' ? decision.recommended : decision.alt}</strong></li>)}</ul>
          </section>
        </div>
        <div className={`td-stage ${revealed >= 3 ? 'revealed' : ''}`}>
          <div className="td-stage-rail"><span className="td-stage-node">3</span><span className="td-stage-label">Plan</span></div>
          <section className="td-subcard">
            <div className="td-subcard-head"><h4 className="td-section">Plan · generated from the skill</h4>{planEditing ? <Button onClick={() => setPlanEditing(false)}>Confirm plan</Button> : <Button variant="outline" onClick={() => setPlanEditing(true)}><Icon name="edit" /> Edit plan</Button>}</div>
            <ol className="td-plan">{planSteps.map((step, index) => <li key={index}>{planEditing ? <input className="td-step-input" value={step} onChange={(event) => editStep(index, event.target.value)} aria-label={`Edit step ${index + 1}`} /> : step}</li>)}</ol>
          </section>
        </div>
      </div>

      <div className="td-review-actions" style={{ marginTop: 16 }}>
        <Button onClick={start}>Confirm skill &amp; plan — start remediation</Button>
        <Button variant="outline" onClick={() => setWalk(true)}><BrandMark size={16} /> Walk me through it</Button>
      </div>
      {walk && <GuidedWalkthrough subject={subject} plan={plan} onClose={() => setWalk(false)} onNavigate={onNavigate} onUpdatePlan={(rows) => setPlan(rows.map((row) => ({ ...row, def: row.value })))} />}
    </section>
  );
}

// Dedicated page for a single finding that has no managed (or custom) remediation yet.
// Reached from "Draft custom transformation"; hosts the whole drafting → review lifecycle.
function ImprovedCustomTd({ onNavigate }) {
  const list = useCustomTds();
  const activeId = useActiveCustomTd();
  const subject = list.find((item) => item.id === activeId) || list[0];
  return (
    <ImprovedProductShell activeTab="Findings" stage="Remediate" title="Review specialized skill" subtitle="A specialized transformation skill is ready for this finding — review the defaults, walk through it, or apply." onNavigate={onNavigate}>
      <button className="link-button back-link" onClick={() => onNavigate('Findings')}><Icon name="back" /> Back to prioritized work</button>
      {!subject ? (
        <section className="card" style={{ padding: 20 }}><h3>No skill selected</h3><p className="help">Open the prioritization workspace and choose “Review specialized skill” on a finding that requires review.</p></section>
      ) : (
        <>
          <section className="finding-context card">
            <div className="created-callout"><BrandMark size={30} /><div><strong>A specialized transformation skill and its plan are ready</strong><p>Built from an analysis of {subject.repo}. No AWS-managed transformation covers this finding, so a repository-specific skill and plan were generated — review, edit, walk through, or apply them below.</p></div></div>
            <div className="finding-line one-line">
              <span className="fc-eyebrow">Finding · not yet remediated</span>
              <span className="finding-line-title">{subject.title}</span>
              <span className="fc-chip"><Icon name="github" /> {subject.repo}</span>
              <span className={`fc-chip impact-${(subject.impact || '').toLowerCase()}`}>Impact {subject.impact ?? '—'}</span>
              <span className="fc-chip">Effort {subject.effort ?? '—'}</span>
              <span className="fc-chip">{subject.scope || '1 finding'}</span>
              <span className="fc-chip">Managed transformation: none</span>
            </div>
          </section>
          <CustomTdCard subject={subject} onNavigate={onNavigate} />
        </>
      )}
    </ImprovedProductShell>
  );
}

// Skills Library / Skills management — managed + custom transformation skills with usage,
// successful main merges, and where each has been applied.
function ImprovedSkillsLibrary({ onNavigate }) {
  const custom = useSkills();
  const [openId, setOpenId] = useState(null);
  const [defSkill, setDefSkill] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('applied');
  const seededCustom = SEED_CUSTOM_SKILLS.filter((seed) => !custom.some((item) => item.id === seed.id));
  const customList = [...custom, ...seededCustom];
  const skills = [...customList, ...MANAGED_SKILLS];
  const customCount = customList.length;
  const totalMerges = skills.reduce((sum, skill) => sum + (skill.merges || 0), 0);
  const isCandidate = (skill) => skill.kind === 'custom' && skill.status === 'draft' && (skill.applyCount || 0) >= 3;
  const candidates = customList.filter(isCandidate).length;
  const q = query.trim().toLowerCase();
  const dateVal = (u) => (u === 'Just now' ? Date.now() : (Date.parse(u) || 0));
  const shown = skills
    .filter((s) => (statusFilter === 'all' ? true : statusFilter === 'managed' ? s.kind === 'managed' : s.status === statusFilter))
    .filter((s) => !q || `${s.name} ${s.description} ${s.owner || ''}`.toLowerCase().includes(q))
    .sort((a, b) => (sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'updated' ? dateVal(b.updated) - dateVal(a.updated) : sortBy === 'merges' ? (b.merges || 0) - (a.merges || 0) : (b.applyCount || 0) - (a.applyCount || 0)));
  const STATUS_FILTERS = [['all', 'All'], ['draft', 'Drafts'], ['published', 'Published'], ['managed', 'AWS-managed']];
  return (
    <ImprovedProductShell activeTab="Skills Library" stage="Remediate" title="Skills Library" subtitle="Managed and custom transformation skills across your portfolio — drafts, published skills, and candidates to share across accounts." onNavigate={onNavigate}>
      <div className="skills-overview">
        <article><span>Total skills</span><strong>{skills.length}</strong><small>{customCount} custom · {MANAGED_SKILLS.length} AWS-managed</small></article>
        <article><span>Custom drafts</span><strong>{customList.filter((skill) => skill.status === 'draft').length}</strong><small>Scoped to this account</small></article>
        <article className={candidates ? 'attention' : ''}><span>Publish candidates</span><strong>{candidates}</strong><small>Drafts applied ≥ 3× — share across accounts</small></article>
        <article><span>Successful main merges</span><strong>{totalMerges.toLocaleString()}</strong><small>Across all skills</small></article>
      </div>
      <section className="card">
        <div className="card-heading"><div><h3>Skills management</h3><p>Every skill is a reusable Transformation Definition. Expand one to see where it was used and how it performs.</p></div><Button variant="outline" onClick={() => onNavigate('Findings')}>Create from a finding</Button></div>
        <div className="skills-controls">
          <SearchBox value={query} onChange={setQuery} placeholder="Find skills, owners…" />
          <div className="segmented">{STATUS_FILTERS.map(([value, label]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
          <label className="sort-select"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="applied">Most applied</option><option value="merges">Most merges</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label>
          <span className="skills-count">{shown.length} of {skills.length}</span>
        </div>
        <div className="skills-list">
          {shown.length === 0 && <div className="empty-inline">No skills match your filters.</div>}
          {shown.map((skill) => {
            const open = openId === skill.id;
            const rate = skill.runs ? `${Math.round((skill.merges / skill.runs) * 100)}%` : '—';
            const candidate = isCandidate(skill);
            const isDraft = skill.kind === 'custom' && skill.status === 'draft';
            const kindLabel = skill.kind === 'managed' ? 'AWS-managed' : skill.status === 'published' ? 'Published' : 'Draft';
            return (
              <article className={`skill-row ${open ? 'open' : ''}`} key={skill.id}>
                <button className="skill-head" onClick={() => setOpenId(open ? null : skill.id)}>
                  <span className="skill-mark"><BrandMark size={22} /></span>
                  <div className="skill-name"><strong>{skill.name}{candidate && <span className="candidate-badge">Publish candidate</span>}</strong><span>{skill.description}</span><small className="skill-owner">Owner {skill.owner || '—'} · updated {skill.updated}</small></div>
                  <span className={`skill-kind ${skill.status || skill.kind}`}>{kindLabel}</span>
                  <span className="skill-stat">{isDraft ? <><strong>{skill.applyCount || 0}</strong><small>applications</small></> : <><strong>{(skill.merges || 0).toLocaleString()}</strong><small>main merges</small></>}</span>
                  <Icon name={open ? 'chevron' : 'forward'} />
                </button>
                {open && <div className="skill-detail">
                  {candidate && <div className="candidate-callout"><Icon name="info" /><div><strong>Publishing candidate</strong><p>Applied {skill.applyCount}× on one account — publish to share it across accounts.</p></div><Button>Publish &amp; share</Button></div>}
                  <dl className="skill-facts">
                    <div><dt>Status</dt><dd>{skill.kind === 'managed' ? 'AWS-managed' : skill.status === 'published' ? 'Published' : 'Draft'}</dd></div>
                    <div><dt>Owner</dt><dd>{skill.owner || '—'}</dd></div>
                    <div><dt>Version</dt><dd>{skill.version}</dd></div>
                    <div><dt>Applications</dt><dd>{(skill.applyCount || 0).toLocaleString()}</dd></div>
                    <div><dt>Successful main merges</dt><dd>{(skill.merges || 0).toLocaleString()}</dd></div>
                    <div><dt>Merge success rate</dt><dd>{rate}</dd></div>
                    <div><dt>Last updated</dt><dd>{skill.updated}</dd></div>
                  </dl>
                  <div className="skill-usage"><strong>Accounts {isDraft ? '· 1 (this account)' : `· ${(skill.accounts || []).length}`}</strong><div className="repo-chips">{(skill.accounts || []).map((account) => <span key={account} className="repo-chip">{account}</span>)}</div></div>
                  <div className="skill-usage"><strong>Where it&rsquo;s used</strong><div className="repo-chips">{(skill.usedIn || []).length ? skill.usedIn.map((repo) => <span key={repo} className="repo-chip"><Icon name="github" /> {repo}</span>) : <span className="muted">Not applied yet</span>}</div></div>
                  <div className="skill-detail-actions"><Button variant="outline" onClick={() => setDefSkill(skill)}>View definition</Button>{isDraft ? <Button>Publish &amp; share</Button> : <Button variant="outline">Apply to a repository</Button>}</div>
                </div>}
              </article>
            );
          })}
        </div>
      </section>
      {defSkill && <div className="modal-layer" onMouseDown={() => setDefSkill(null)}><div className="modal skill-def-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><h2>Transformation Definition</h2><p className="muted">{defSkill.name} · {defSkill.version} · read-only</p></div><button className="icon-button" onClick={() => setDefSkill(null)}><Icon name="close" size={26} /></button></div>
        <div className="modal-body">{definitionFor(defSkill).map((field) => <div className="skill-def-field" key={field.key}><h3>{field.key}</h3><p className="muted">{field.summary}</p><pre>{field.value}</pre></div>)}</div>
        <div className="modal-footer"><button className="text-button" onClick={() => setDefSkill(null)}>Close</button></div>
      </div></div>}
    </ImprovedProductShell>
  );
}

function ImprovedRemediation({ onNavigate }) {
  const [nudged, setNudged] = useState([]);
  const cliRows = useAtxJobs().filter((job) => job.kind !== 'analysis').map((job) => {
    const done = job.progress >= 100;
    return {
      id: job.id,
      name: job.label,
      repo: job.repo,
      owner: 'Launched from CLI',
      changes: done ? 'Changes applied · awaiting review' : 'Applying changes',
      branch: job.branch ?? 'Pending',
      pr: job.pr ?? '—',
      status: done ? 'Waiting for engineer merge' : 'Applying changes',
      tone: done ? 'engineer' : 'running',
      detail: done ? `${MODE_LABEL[job.mode] ?? job.mode} · checks passing` : `${job.progress}% · ${MODE_LABEL[job.mode] ?? job.mode} · streaming from CLI`,
      origin: 'CLI',
      action: done ? 'nudge' : 'view'
    };
  });
  const baseRows = [
    { id: 'sdk', name: 'Migrate AWS SDK v2 to v3', repo: 'LegacyNodeJSOrderingSystem', changes: '17 files · SDK clients, mocks, and tests', branch: 'atx/aws-sdk-v3', pr: '#184', status: 'Waiting for engineer merge', tone: 'engineer', detail: 'Approved 3 days ago · PR is mergeable', owner: 'Payments Platform', action: 'nudge' },
    { id: 'expo', name: 'Upgrade Expo SDK 38 to 51', repo: 'MKPMobile', changes: '24 files · SDK and native configuration', branch: 'atx/expo-sdk-51', pr: '#92', status: 'Waiting for engineer merge', tone: 'engineer', detail: 'Approved yesterday · No merge activity', owner: 'Mobile Experience', action: 'nudge' },
    { id: 'node', name: 'Upgrade Node.js 16 runtime', repo: 'LegacyNodeJSOrderingSystem', changes: '12 files · Runtime, dependencies, and CI', branch: 'atx/nodejs-20-upgrade', pr: '#186', status: 'Blocked by validation', tone: 'blocked', detail: 'Behavioral tests: 1 regression', owner: 'Payments Platform', action: 'failures' },
    { id: 'spring', name: 'Upgrade Spring Boot 2 to 3', repo: 'order-orchestrator', changes: '31 files · Framework and Jakarta imports', branch: 'atx/spring-boot-3', pr: '#341', status: 'Blocked by validation', tone: 'blocked', detail: 'Integration tests: 3 failures', owner: 'Order Services', action: 'failures' },
    { id: 'deps', name: 'Patch vulnerable dependencies', repo: 'MyLearning', changes: '9 files · Package and lockfile updates', branch: 'atx/dependency-patch', pr: '#57', status: 'Validating', tone: 'validating', detail: '4 of 6 checks passed', owner: 'Learning Platform', action: 'view' },
    { id: 'angular', name: 'AngularJS → React migration plan', repo: 'payments-ui', changes: 'Generating proposed React migration changes', branch: 'atx/angularjs-to-react', pr: '#482', status: 'Applying changes', tone: 'running', detail: 'Started from CLI · plan PLAN-2048 · Transformation phase 3 of 5', owner: 'Payments Platform', origin: 'CLI', action: 'view' },
    { id: 'lambda', name: 'Upgrade Lambda runtime to Node.js 20', repo: 'notification-worker', changes: '8 files · Runtime and deployment config', branch: 'atx/lambda-nodejs-20', pr: '#219', status: 'Merged', tone: 'merged', detail: 'Merged Aug 26 · Reassessment passed', owner: 'Notifications', action: 'open' },
    { id: 'log4j', name: 'Upgrade Log4j and remove vulnerable APIs', repo: 'catalog-service', changes: '14 files · Dependencies and logging calls', branch: 'atx/log4j-upgrade', pr: '#488', status: 'Merged', tone: 'merged', detail: 'Merged Aug 24 · 4 findings resolved', owner: 'Catalog', action: 'open' },
    { id: 'python', name: 'Upgrade Python 3.8 to 3.12', repo: 'reporting-jobs', changes: '19 files · Runtime, libraries, and build image', branch: 'atx/python-3-12', pr: '#76', status: 'Merged', tone: 'merged', detail: 'Merged Aug 21 · Reassessment passed', owner: 'Reporting', action: 'open' },
  ];
  const applied = useApplied();
  const appliedRows = applied.map((rec) => {
    const done = (Date.now() - rec.appliedAt) / 1000 > 8;
    const branch = `atx/${rec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 26)}`;
    return { id: rec.id, name: rec.title, repo: rec.repo, owner: 'Specialized plan', changes: 'Applied from plan review', branch: done ? branch : 'Pending', pr: done ? `#${300 + (rec.id.length % 90)}` : '—', status: done ? 'Waiting for engineer merge' : 'Applying changes', tone: done ? 'engineer' : 'running', detail: done ? 'Validated · ready for review' : 'Applying your reviewed plan…', origin: 'Web', action: done ? 'nudge' : 'view' };
  });
  const rows = [...appliedRows, ...cliRows, ...baseRows];
  const sendNudge = (id) => setNudged((current) => current.includes(id) ? current : [...current, id]);
  // When arriving via "View remediation", flash the row it referred to.
  const [highlight, setHighlight] = useState(() => { try { const h = window.localStorage.getItem('atx-highlight-rem'); if (h) window.localStorage.removeItem('atx-highlight-rem'); return h; } catch { return null; } });
  const highlightRef = useRef(null);
  useEffect(() => { if (!highlight) return; if (highlightRef.current) highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = window.setTimeout(() => setHighlight(null), 2600); return () => window.clearTimeout(t); }, [highlight]);
  return <ImprovedProductShell activeTab="Remediations" stage="Remediate" title="Remediations" subtitle="Track every remediation from applied changes through validation, approval, and merge." actions={<Button>Create remediation</Button>} onNavigate={onNavigate}><div className="remediation-overview"><article><span>In progress</span><strong>6</strong><small>Applying changes or validating</small></article><article className="engineer"><span>Waiting for engineering</span><strong>2</strong><small>Approved but not merged</small></article><article className="blocked"><span>Blocked</span><strong>2</strong><small>Validation needs attention</small></article><article className="merged"><span>Merged</span><strong>24</strong><small>7 merged this month</small></article></div><section className="card remediation-queue"><div className="remediation-queue-controls"><SearchBox value="" onChange={() => {}} placeholder="Find remediations" /><button className="select-button">Status: All <Icon name="chevron" /></button><button className="select-button">Owner: All <Icon name="chevron" /></button><button className="select-button">Repository: All <Icon name="chevron" /></button><span>34 remediations</span></div><div className="remediation-status-tabs"><button className="active">All <span>34</span></button><button>Needs attention <span>4</span></button><button>In progress <span>6</span></button><button>Waiting for merge <span>2</span></button><button>Merged <span>24</span></button></div><div className="remediation-queue-list">{rows.map((item) => <article key={item.id} ref={item.id === highlight ? highlightRef : undefined} className={`remediation-row ${item.tone} ${item.id === highlight ? 'highlighted' : ''}`}><span className={`remediation-row-icon ${item.tone}`}><Icon name={item.tone === 'merged' ? 'check' : item.tone === 'blocked' ? 'warning' : item.tone === 'running' || item.tone === 'validating' ? 'refresh' : 'schedule'} /></span><div className="remediation-row-name"><button>{item.name}</button><small>{item.repo} · {item.owner}{item.origin === 'CLI' ? ' · Started from CLI' : ''}</small><span>{item.changes}</span></div><div className="remediation-row-branch"><small>GitHub branch / pull request</small>{item.branch === 'Pending' ? <strong>Branch pending</strong> : <a href={`#${item.id}`}><Icon name="github" /> {item.branch} · {item.pr} <Icon name="external" /></a>}</div><div className="remediation-row-status"><span className={`remediation-status-pill ${item.tone}`}>{item.status}</span><small>{item.detail}</small></div><div className="remediation-row-action">{item.action === 'nudge' ? <Button variant="outline" onClick={() => sendNudge(item.id)} disabled={nudged.includes(item.id)}>{nudged.includes(item.id) ? 'Nudge sent' : 'Send nudge'}</Button> : item.action === 'failures' ? <Button variant="outline">View failures</Button> : item.action === 'view' ? <Button variant="outline">View progress</Button> : <Button variant="outline">Open merged PR</Button>}</div></article>)}</div><div className="queue-footer"><span>Showing 9 of 34 remediations</span><button className="link-button">Load more</button></div></section></ImprovedProductShell>;
}

function TopBar({ onMenu, assistantOpen, setAssistantOpen }) {
  return <header className="topbar">
    <div className="brand-wrap"><button className="icon-button menu-button" onClick={onMenu} aria-label="Open navigation"><Icon name="menu" size={20} /></button><div className="brand">AWS Transform</div></div>
    <div className="top-actions"><button className="text-button">Provide feedback</button><span className="divider" /><span>N. Virginia (us-east-1)</span><button className="avatar" onClick={() => setAssistantOpen(!assistantOpen)} aria-label="Toggle assistant">N</button></div>
  </header>;
}

function GlobalDrawer({ open, onClose, onNavigate }) {
  if (!open) return null;
  const items = [
    ['spark', 'Continuous modernization', 'New'], ['workspaces', 'Workspaces'], ['download', 'Download AWS Transform CLI'],
    ['spark', "What's new"], ['book', 'Documentation'], ['demo', 'Demos'], ['blog', 'Blog posts'], ['success', 'Success stories']
  ];
  return <div className="drawer-layer" onMouseDown={onClose}>
    <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
      <div className="drawer-head"><div className="brand">AWS Transform</div><button className="icon-button" onClick={onClose}><Icon name="close" size={25} /></button></div>
      <nav>{items.map(([icon, label, badge]) => <button key={label} className={`drawer-item ${label === 'Continuous modernization' ? 'active' : ''}`} onClick={() => { onNavigate(label); onClose(); }}><Icon name={icon} size={18} /><span>{label}</span>{badge && <span className="new-badge">{badge}</span>}{label === 'Demos' && <span className="drawer-caret">›</span>}</button>)}</nav>
      <div className="drawer-bottom"><p>AWS Transform uses generative AI. You may need to verify responses.</p><a href="#responsible-ai">Responsible AI policy ↗</a><p>Cross-region inference is enabled.</p></div>
    </aside>
  </div>;
}

function AssistantPanel({ onClose, visible }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  if (!visible) return <button className="assistant-fab" onClick={() => onClose(false)} aria-label="Open AWS Transform assistant"><Icon name="spark" size={24} /><span>AWS Transform</span></button>;
  const send = (prompt) => {
    const text = prompt || input.trim();
    if (!text) return;
    setMessages((current) => [...current, { role: 'user', text }, { role: 'assistant', text: text.includes('snapshot') ? 'I can prepare a portfolio snapshot covering your connected sources, repositories, open findings, and completed remediations. Choose Generate report from the dashboard to preview it.' : text.includes('repos') ? 'You have 3 connected sources and 5 analyzed repositories. LegacyNodeJSOrderingSystem currently has the highest number of findings.' : 'Re-provisioning starts in Settings: deploy common infrastructure, connect a source, then run a new analysis. Your existing records should be exported before a full reset.' }]);
    setInput('');
  };
  return <aside className="assistant">
    <div className="assistant-toolbar"><span><Icon name="bot" /> AWS Transform</span><button className="icon-button minimize-assistant" onClick={() => onClose(true)} title="Minimize assistant" aria-label="Minimize AWS Transform assistant"><Icon name="minimize" size={24} /></button></div>
    <div className="assistant-scroll">
      <div className="date-rule"><span>August 20, 2026</span></div>
      <div className="assistant-author"><span className="assistant-mark"><Icon name="spark" /></span><strong>AWS Transform</strong></div>
      <div className="assistant-message">
        <p>Resetting the whole continuous modernization infrastructure isn't something I can execute from here — this chat is <strong>read-only for continuous modernization</strong>, so setup and teardown both go through the <strong>ATX CLI</strong> (<code>atx ct</code>). I'll tell you what to expect and where to run it.</p>
        <h3>Before you do this — what a full reset wipes</h3>
        <p>A full infrastructure reset tears down the account-level continuous modernization stack that everything else hangs off of. That means you'd lose:</p>
        <ul><li><strong>All connected sources</strong> (GitHub / GitLab / Bitbucket org connections)</li><li><strong>All tracked repositories</strong></li><li><strong>All analysis history and findings</strong></li><li><strong>All remediation records</strong></li></ul>
        <p>For context, that includes the full findings set on <strong>LegacyNodeJSOrderingSystem</strong> we just walked through. If you want a record first, I can generate a downloadable report of your current portfolio.</p>
        <h3>How to do the reset</h3>
        <ol><li>Make sure you have the <code>atx ct</code> CLI and agent skills installed.</li><li>Run the teardown through <code>atx ct</code>. The exact command and flags live in the CLI reference.</li><li>Re-provision from Settings: deploy infrastructure → connect a source → run an analysis.</li></ol>
        <p>References:</p><ul><li><a href="#developer-tools">Developer tools / CLI + skills</a></li><li><a href="#setup">Setup &amp; usage guide</a></li></ul>
        <p>Want me to generate a snapshot report of your current findings and repos before you reset, so you don't lose the picture?</p>
        <div className="message-meta"><span>♡</span><span>♧</span><span>▣</span><span>9:53 PM</span></div>
      </div>
      {messages.map((message, index) => <div className={`chat-addition ${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'assistant' ? 'AWS Transform' : 'You'}</strong><p>{message.text}</p></div>)}
      <div className="suggestions">
        {['Generate a snapshot report first', 'Show all my repos and sources', 'What does re-provisioning involve?'].map((item) => <Button key={item} variant="outline" onClick={() => send(item)}>{item}</Button>)}
      </div>
    </div>
    <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Enter / for quick actions" aria-label="Message AWS Transform" />
      <div className="composer-actions"><span><Icon name="paperclip" /> &nbsp; @</span><button type="submit" aria-label="Send"><Icon name="send" /></button></div>
    </form>
    <p className="ai-note">AWS Transform uses generative AI. You may need to verify responses.</p>
  </aside>;
}

function DirectChatScreen({ drawerOpen, onMenu, onCloseDrawer, onNavigate, onMinimize }) {
  return <div className="app direct-chat-screen"><TopBar onMenu={onMenu} assistantOpen setAssistantOpen={(open) => { if (!open) onMinimize(); }} /><div className="direct-chat-workspace"><AssistantPanel visible onClose={(minimizing) => { if (minimizing) onMinimize(); }} /></div><GlobalDrawer open={drawerOpen} onClose={onCloseDrawer} onNavigate={onNavigate} /></div>;
}

function ShellHeader({ active, setActive }) {
  return <>
    <section className="product-heading"><h1>Continuous modernization</h1><p>Continuously assess and modernize your application portfolio. Review findings and remediation, and ask AWS Transform about your code.</p></section>
    <nav className="tabs">{tabs.map((tab) => <button key={tab} className={active === tab ? 'active' : ''} onClick={() => setActive(tab)}>{tab}{tab === 'Findings' && <span className="count-badge">12</span>}</button>)}</nav>
  </>;
}

function PageTitle({ title, subtitle, actions }) {
  return <div className="page-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function MetricCard({ tone, title, value, detail, chip }) {
  return <div className={`metric-card ${tone}`}><strong>{title}</strong><div className="metric-value">{value}</div><span>{detail}</span>{chip && <span className="metric-chip">{chip}</span>}</div>;
}

function DistributionBar({ high, medium, low }) {
  const total = high + medium + low;
  return <div className="distribution"><span className="high" style={{ width: `${high / total * 100}%` }} /><span className="medium" style={{ width: `${medium / total * 100}%` }} /><span className="low" style={{ width: `${low / total * 100}%` }} /></div>;
}

function Dashboard({ navigate, toast }) {
  const repos = [
    ['LegacyNodeJSOrderingSystem', 6, 4, 2], ['MKPMobile', 3, 3, 1], ['MyLearning', 1, 2, 3]
  ];
  const categories = [['Dependency', 9], ['Security', 5], ['Maintainability', 4], ['Infrastructure', 4], ['Code-quality', 3], ['Architecture', 2]];
  return <div className="page dashboard-page">
    <PageTitle title="Dashboard" subtitle="Last analyzed: Aug 25, 2026, 9:26 AM · 5 analyzed repositories · 3 sources connected" actions={<Button onClick={() => navigate('run')}>New analysis</Button>} />
    <div className="metric-grid"><MetricCard tone="high" title="High severity findings" value="12" detail="Across 4 repos" chip="3 auto-fixable" /><MetricCard tone="medium" title="Medium severity findings" value="10" detail="Across 4 repos" chip="1 auto-fixable" /><MetricCard tone="low" title="Low severity findings" value="7" detail="Across 4 repos" /><MetricCard tone="total" title="Total findings" value="29" detail="5 repos analyzed" chip="4 auto-fixable (14%)" /></div>
    <section className="card repo-card"><div className="card-heading"><h3>Top 3 repos with findings</h3><Button variant="outline" onClick={() => navigate('Findings')}>View all findings</Button></div>
      <div className="table-wrap"><table><thead><tr><th>Repository</th><th>Distribution</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th></tr></thead><tbody>{repos.map(([name, high, medium, low]) => <tr key={name}><td><a href={`#${name}`}>{name}</a></td><td><DistributionBar high={high} medium={medium} low={low} /></td><td>{high}</td><td>{medium}</td><td>{low}</td><td><strong>{high + medium + low}</strong></td></tr>)}</tbody></table></div>
      <div className="legend"><span><i className="high" />High</span><span><i className="medium" />Medium</span><span><i className="low" />Low</span></div>
    </section>
    <section className="card analysis-card"><div className="card-heading"><h3>Analysis breakdown</h3></div><div className="subtabs"><button className="active">Tech debt (comprehensive)</button><button>Tech debt (quick)</button></div>
      <div className="analysis-summary"><strong>4 repositories analyzed · 27 findings</strong><Button variant="outline" onClick={() => toast('Report generation started')}>Generate report</Button></div>
      <div className="charts"><div><h4>Technology distribution</h4><div className="donut-wrap"><div className="donut"><div><strong>4</strong><span>Repos analyzed</span></div></div><span className="donut-label javascript">JavaScript</span><span className="donut-label unknown">Unknown</span></div><div className="chart-legend"><span><i className="unknown" />Unknown</span><span><i className="javascript" />JavaScript</span></div></div>
        <div className="category-chart"><h4>Findings by category</h4>{categories.map(([name, value]) => <div className="bar-row" key={name}><span>{name}</span><div className="bar-track"><i style={{ width: `${value / 9 * 100}%` }} /></div><strong>{value}</strong></div>)}<div className="axis-label">Findings</div></div>
      </div>
    </section>
  </div>;
}

function SearchBox({ value, onChange, placeholder }) {
  return <label className="search-box"><Icon name="search" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function FindingsPage({ toast, createRemediation }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const visible = findings.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.repository.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAll = () => setSelected(selected.length === visible.length ? [] : visible.map((item) => item.id));
  return <div className="page">
    <PageTitle title={<>Findings <span className="muted">(10+)</span></>} actions={<><Button variant="outline" disabled={!selected.length} onClick={() => { toast(`${selected.length} finding${selected.length > 1 ? 's' : ''} dismissed`); setSelected([]); }}>Dismiss</Button><Button disabled={!selected.some((id) => findings[id].transformation !== 'No remediation available.')} onClick={() => createRemediation(selected)}>Create remediation</Button></>} />
    <div className="filter-row"><SearchBox value={query} onChange={setQuery} placeholder="Find findings" /><button className="select-button">Open <Icon name="chevron" /></button><span className="pagination"><Icon name="back" /> <strong>1</strong> <Icon name="dots" /> <Icon name="forward" /></span></div>
    <div className="table-wrap wide"><table className="data-table findings-table"><thead><tr><th><input type="checkbox" checked={selected.length === visible.length && visible.length > 0} onChange={toggleAll} /></th><th>Finding <Icon name="chevron" /></th><th>Severity <Icon name="chevron" /></th><th>Status <Icon name="chevron" /></th><th>Transformation <Icon name="chevron" /></th><th>Date reported <Icon name="chevron" /></th><th>Analysis type <Icon name="chevron" /></th><th>Repository <Icon name="chevron" /></th><th>Notes</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className={selected.includes(item.id) ? 'selected' : ''}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td><a href={`#finding-${item.id}`}>{item.name}</a></td><td><span className="severity high">High</span></td><td><span className="status warning"><Icon name="warning" /> Open</span></td><td>{item.transformation}</td><td>{item.date}</td><td>{item.analysis}</td><td>{item.repository}</td><td><button className="link-button" onClick={() => toast(`Notes opened for ${item.name}`)}>Add notes</button></td></tr>)}</tbody></table>{!visible.length && <div className="empty-inline">No findings match your search.</div>}</div>
  </div>;
}

function RemediationsPage({ addedRemediation }) {
  const rows = addedRemediation ? [{ ...addedRemediation, origin: addedRemediation.origin || 'Web' }, ...remediations] : remediations;
  return <div className="page"><PageTitle title={<>Remediations <span className="muted">({rows.length})</span></>} />
    <div className="filter-row"><SearchBox value="" onChange={() => {}} placeholder="Find remediations" /><button className="select-button">Status <Icon name="chevron" /></button><button className="select-button">Started from <Icon name="chevron" /></button><span className="pagination"><Icon name="back" /> <strong>1</strong> <Icon name="forward" /></span></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Remediation</th><th>Status</th><th>Started from</th><th>Outcomes</th><th>Transformation</th><th>Repositories</th><th>Findings</th><th>Created</th></tr></thead><tbody>{rows.map((item) => { const complete = item.status === 'Complete'; return <tr key={`${item.name}-${item.date}`}><td><a href={`#${item.name}`}>{item.name}</a>{item.origin === 'CLI' && !complete && <small className="table-subtext">Continue this plan in AWS Transform CLI</small>}</td><td><span className={`status ${complete ? 'success' : 'info'}`}><Icon name={complete ? 'check' : 'refresh'} /> {item.status}</span></td><td><span className={`origin-badge ${item.origin?.toLowerCase() || 'web'}`}><Icon name={item.origin === 'CLI' ? 'terminal' : 'globe'} /> {item.origin || 'Web'}</span></td><td><a href="#outcomes">{item.outcomes}</a></td><td>{item.transformation}</td><td><a href="#repositories">{item.repositories}</a></td><td><a href="#findings">{item.findings}</a></td><td>{item.date}</td></tr>; })}</tbody></table></div>
  </div>;
}

function AnalysesPage({ navigate, addedAnalysis, toast }) {
  const rows = addedAnalysis ? [{ ...addedAnalysis, status: addedAnalysis.status || 'Completed', progress: addedAnalysis.progress ?? 100, origin: addedAnalysis.origin || 'Web', repository: addedAnalysis.repository || 'Selected repositories' }, ...analyses] : analyses;
  return <div className="page"><PageTitle title={<>Analyses <span className="muted">({rows.length})</span></>} subtitle="Monitor analyses started from the web application and AWS Transform CLI." actions={<Button onClick={() => navigate('run')}>Run new analysis</Button>} />
    <section className="card table-card"><div className="card-heading"><h3>Analysis activity</h3><span className="pagination"><Icon name="refresh" /> &nbsp; <Icon name="back" /> 1 <Icon name="forward" /></span></div><div className="table-wrap"><table className="data-table analysis-activity-table"><thead><tr><th>Started</th><th>Analysis name</th><th>Analysis type</th><th>Repository / scope</th><th>Started from</th><th>Status</th><th>Progress</th><th>Findings</th><th>Infrastructure</th></tr></thead><tbody>{rows.map((item, index) => { const completed = item.status === 'Completed'; const progress = item.progress ?? (completed ? 100 : 0); return <tr key={`${item.date}-${index}`}><td>{item.date}</td><td>{item.name}{item.origin === 'CLI' && !completed && <small className="table-subtext">Live CLI session</small>}</td><td><a href="#analysis">{item.type}</a></td><td>{item.repository || item.repos}</td><td><span className={`origin-badge ${(item.origin || 'Web').toLowerCase()}`}><Icon name={item.origin === 'CLI' ? 'terminal' : 'globe'} /> {item.origin || 'Web'}</span></td><td><span className={`status ${completed ? 'success' : 'info'}`}><Icon name={completed ? 'check' : 'refresh'} /> {item.status || 'Completed'}</span></td><td><div className={`progress ${completed ? '' : 'running'}`}><i style={{ width: `${progress}%` }} /><span>{progress}%</span></div></td><td><a href="#findings">{item.findings}</a></td><td>{item.infrastructure}</td></tr>; })}</tbody></table></div></section>
    <section className="card empty-card"><div className="card-heading"><div><h3>Schedules <span className="muted">(0)</span></h3><p>Run recurring analyses to keep your portfolio findings current.</p></div><Button variant="outline" onClick={() => toast('Schedule setup opened')}>Schedule analysis</Button></div><div className="empty-state"><div className="empty-icon"><Icon name="schedule" size={30} /></div><h3>No schedules</h3><p>Create a schedule to run analysis on a recurring basis.</p><Button onClick={() => toast('Schedule setup opened')}>Create schedule</Button></div></section>
  </div>;
}

function SourceForm({ onConnect, compact = false }) {
  const [provider, setProvider] = useState('GitHub App');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [token, setToken] = useState('');
  const providers = [['GitHub App', 'Organization-owned, least-privilege access via the AWS Transform GitHub App (recommended).'], ['GitHub PAT', 'Personal access token for a GitHub organization or user at github.com.'], ['GitLab', 'Repositories in a GitLab group or user at gitlab.com.'], ['Bitbucket', 'Repositories in a Bitbucket Cloud workspace at bitbucket.org.']];
  return <div className={`source-form ${compact ? 'compact' : ''}`}>
    <fieldset><legend>Provider</legend>{providers.map(([item, description]) => <label className="radio-row" key={item}><input type="radio" name={`provider-${compact ? 'compact' : 'modal'}`} checked={provider === item} onChange={() => setProvider(item)} /><span><strong>{item}</strong><small>{description}</small></span></label>)}</fieldset>
    {compact ? <><Field label="Organization" placeholder="my-org" value={org} onChange={setOrg} /><Field label="Personal access token" type="password" placeholder="Paste your personal access token" value={token} onChange={setToken} /><Field label="Source name" placeholder="my-source" value={name} onChange={setName} /></> : <><Field label="Source name" help="A unique name for this source connection." placeholder="my-source" value={name} onChange={setName} /><Field label="Organization / group / workspace (optional)" help="GitHub org, GitLab group/user, or Bitbucket workspace/project to discover repositories from." placeholder="my-org" value={org} onChange={setOrg} /><Field label="Access token" help="A personal access token with read access to your repositories. Stored securely and never shown again." type="password" placeholder="Paste your personal access token" value={token} onChange={setToken} /></>}
    <Button onClick={() => onConnect({ name: name || org || 'my-source', provider, repositories: 0, status: 'Connected' })}>{compact ? 'Connect source' : 'Connect'}</Button>
  </div>;
}

function Field({ label, help, placeholder, value, onChange, type = 'text' }) {
  return <label className="field"><strong>{label}</strong>{help && <small>{help}</small>}<input type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ConnectSourceModal({ onClose, onConnect }) {
  return <div className="modal-layer" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><h2>Connect new source</h2><button className="icon-button" onClick={onClose}><Icon name="close" size={26} /></button></div><div className="modal-body"><div className="warning-box"><Icon name="warning" size={22} /><div><strong>Your access token is stored in AWS Secrets Manager</strong><p>When you connect this source, your personal access token is stored as a secret in AWS Secrets Manager in this AWS account. Any user or role with permission to read that secret can retrieve the token and use the repository access it grants. Use a token with the narrowest repository access you need and revoke it when you no longer use this source.</p></div></div><SourceForm onConnect={onConnect} /></div><div className="modal-footer"><button className="text-button" onClick={onClose}>Cancel</button></div></div></div>;
}

function SourcesPage({ sources, setSources, toast, initialModal = false }) {
  const [modal, setModal] = useState(initialModal);
  const connect = (source) => { setSources((current) => [...current, source]); setModal(false); toast(`${source.name} connected`); };
  return <div className="page"><PageTitle title={<>Sources <span className="muted">({sources.length})</span></>} subtitle="Connect source control providers to discover and analyze repositories." actions={<Button onClick={() => setModal(true)} icon="plus">Connect new source</Button>} />
    <div className="filter-row"><SearchBox value="" onChange={() => {}} placeholder="Find sources" /></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Source name</th><th>Status</th><th>Provider</th><th>Repositories</th><th>Last refreshed</th><th /></tr></thead><tbody>{sources.map((source) => <tr key={source.name}><td><a href={`#${source.name}`}>{source.name}</a></td><td><span className="status success"><Icon name="check" /> {source.status}</span></td><td><Icon name="github" /> {source.provider}</td><td><a href="#repos">{source.repositories}</a></td><td>Aug 25, 2026</td><td><button className="icon-button" aria-label={`Actions for ${source.name}`}><Icon name="dots" /></button></td></tr>)}</tbody></table></div>{modal && <ConnectSourceModal onClose={() => setModal(false)} onConnect={connect} />}
  </div>;
}

function SettingsPage({ infra, setInfra, toast }) {
  const [open, setOpen] = useState(true);
  const deploy = () => { setInfra((current) => current.map((item) => item.name === 'atx-runner' ? { ...item, status: 'Deployed', date: 'Aug 27, 2026' } : item)); toast('Infrastructure deployment completed'); };
  const deployed = infra.filter((item) => item.status === 'Deployed').length;
  return <div className="page settings-page"><section className="card provision-card"><button className="disclosure" onClick={() => setOpen(!open)}><Icon name={open ? 'chevron' : 'forward'} /><h3>How to provision infrastructure</h3></button>{open && <div className="provision-body"><h3>Provision without the web application</h3><p>You can provision the infrastructure for analysis and remediation with the following tools.</p><ul><li><strong>Kiro Power</strong> - <a href="#kiro">Installing Kiro Power ↗</a></li><li><strong>Agentic skill</strong> - <a href="#skill">Adding the AWS Transform skill ↗</a></li><li><strong>AWS Transform CLI</strong> - <a href="#cli">Installing the AWS Transform CLI ↗</a></li></ul><h3>Provision from the web app</h3><p><span className="status warning"><Icon name="warning" /></span> You need administrator access to the target AWS account. Need someone else to deploy? <button className="link-button"><Icon name="copy" /> Copy instructions</button></p><p>The following steps guide you through creating the required CloudFormation infrastructure.</p><div className="provision-columns"><div><h3>Step 1 — Common infrastructure deployed once per account</h3><p className="help">Enter the stack name exactly. One CloudFormation stack per account.</p><SetupItem title="Enable the dispatcher" stack="AtxDispatcherStack" action="Deploy queue infrastructure ↗" disabled /><SetupItem title="Enable scheduled runs" stack="atx-scheduler" action="Deploy scheduling infrastructure ↗" disabled /><SetupItem title="Enable security analysis" stack="AtxSecurityAgentStack-<region>" action="Deploy security infrastructure ↗" disabled /></div><div><h3>Step 2 — Team infrastructure</h3><p className="help">Deploy more than one only if you need different configurations or security access.</p><strong>Enable analysis &amp; remediation</strong><p><strong>Stack name (AWS Batch, recommended)</strong> &nbsp; <Icon name="copy" /> AtxInfrastructureStack-&lt;suffix&gt;</p><p><strong>Stack name (Amazon EC2)</strong> &nbsp; <Icon name="copy" /> atx-runner-&lt;suffix&gt;</p><Button variant="outline" onClick={deploy}>Deploy analysis and remediation infrastructure <Icon name="chevron" /></Button></div></div></div>}</section>
    <section className="card infra-card"><div className="card-heading"><div><h3>Infrastructure <span className="muted">({deployed}/5)</span></h3><p>Deploy infrastructure in your account to run analysis within your VPC. You own and manage these resources.</p></div><div><button className="round-button"><Icon name="refresh" /></button> <Button onClick={deploy}>Deploy infrastructure <Icon name="chevron" /></Button></div></div><SearchBox value="" onChange={() => {}} placeholder="Find infrastructure" /><div className="table-wrap"><table className="data-table"><thead><tr><th>CloudFormation stack name</th><th>Status</th><th>Type</th><th>Deployed at</th></tr></thead><tbody>{infra.map((item) => <tr key={item.name}><td>{item.status === 'Deployed' ? <a href={`#${item.name}`}>{item.name} ↗</a> : item.name}</td><td><span className={`status ${item.status === 'Deployed' ? 'success' : 'info'}`}><Icon name={item.status === 'Deployed' ? 'check' : 'info'} /> {item.status}</span></td><td>{item.type}</td><td>{item.date}</td></tr>)}</tbody></table></div></section>
    <section className="card"><div className="card-heading"><div><h3>Demo data</h3><p>Clear prototype state — applied remediations, published custom skills, and in-progress drafts — to start a fresh demo. Seeded examples remain.</p></div><Button variant="outline" onClick={() => { resetDemoData(); toast('Demo data reset'); }}>Reset demo data</Button></div></section>
  </div>;
}

// ─── Sources (rail): the connected organization and the repositories it shares ───
const SOURCE_EXTRA_REPOS = [
  ['catalog-service', 'Commerce', 'Java', 'Aug 24'], ['notification-worker', 'Notifications', 'Python', 'Aug 24'],
  ['reporting-jobs', 'Data Platform', 'Python', null], ['infra-terraform', 'Platform', 'HCL', null],
];
const REPO_LANGUAGE = { [R.payments]: 'Java', [R.node]: 'JavaScript', [R.mobile]: 'TypeScript', [R.ui]: 'JavaScript', [R.catalog]: 'Java', [R.learning]: 'JavaScript' };
const REPO_ANALYZED = { [R.payments]: '2 hours ago', [R.node]: '2 hours ago', [R.mobile]: 'Yesterday', [R.ui]: 'Yesterday', [R.catalog]: 'Aug 25', [R.learning]: 'Aug 25' };

function RailSources({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [synced, setSynced] = useState('6 min ago');
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connected, setConnected] = useState(true);
  const [queued, setQueued] = useState(() => new Set());
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const onKey = (event) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const repos = useMemo(() => {
    const analyzed = Object.keys(REPO_LANGUAGE).map((name) => {
      const rows = ESTATE_FINDINGS.filter((finding) => finding.repo === name);
      const count = (level) => rows.filter((finding) => finding.severity === level).length;
      return { name, platform: REPO_CONTEXT[name]?.platform, language: REPO_LANGUAGE[name], analyzed: REPO_ANALYZED[name], findings: rows.length, detail: [count('Critical') && `${count('Critical')} critical`, count('High') && `${count('High')} high`].filter(Boolean).join(' · ') };
    }).sort((a, b) => b.findings - a.findings);
    return [...analyzed, ...SOURCE_EXTRA_REPOS.map(([name, platform, language, analyzed]) => ({ name, platform, language, analyzed, findings: analyzed ? 0 : null, detail: '' }))];
  }, []);
  const counts = { all: repos.length, findings: repos.filter((repo) => repo.findings > 0).length, none: repos.filter((repo) => !repo.analyzed).length };
  const shown = repos.filter((repo) => (filter === 'all' || (filter === 'findings' ? repo.findings > 0 : !repo.analyzed)) && (!query || `${repo.name} ${repo.platform} ${repo.language}`.toLowerCase().includes(query.toLowerCase())));
  const openCount = repos.reduce((sum, repo) => sum + (repo.findings || 0), 0);
  const sync = () => { setSyncing(true); window.setTimeout(() => { setSyncing(false); setSynced('just now'); }, 1200); };
  const analyze = (name) => setQueued((set) => new Set(set).add(name));
  const external = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
  return <RailShell active="Sources" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Sources</h1><p>Repositories AWS Transform can analyze and remediate.</p></div><button type="button" className="st-deploy" onClick={() => onNavigate('improved-sources')}>Connect another source</button></div>
    {!connected ? <section className="dash-card st-card src-empty"><h2>No sources connected</h2><p>AWS-Transform-Demo was disconnected. Existing findings stay until the next analysis.</p><button type="button" className="st-deploy" onClick={() => onNavigate('improved-sources')}>Connect a source</button></section>
      : <section className="dash-card st-card">
        <header className="src-head"><span className="src-mark"><ProviderMark name="github" size={22} /></span>
          <div><h2>AWS-Transform-Demo <span className="src-connected"><i aria-hidden="true" />Connected</span></h2><p>GitHub App · installed Aug 3 by Nithin · last synced {syncing ? 'now…' : synced}</p></div>
          <div className="src-actions"><button type="button" className="st-deploy" onClick={sync} disabled={syncing}>{syncing ? <><span className="oauth-spinner small" aria-hidden="true" />Syncing</> : 'Sync now'}</button><a className="st-deploy" href="#github-installation">Manage on GitHub {external}</a>
            <span className="src-more" ref={menuRef}><button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More actions" onClick={() => setMenuOpen(!menuOpen)}>⋯</button>
              {menuOpen && <div className="src-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate('improved-sources'); }}>Change repository access</button><button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>View audit log</button><button type="button" role="menuitem" className="danger" onClick={() => { setMenuOpen(false); setConfirmDisconnect(true); }}>Disconnect</button></div>}</span></div>
        </header>
        {confirmDisconnect && <div className="src-confirm" role="alertdialog" aria-label="Disconnect AWS-Transform-Demo"><Icon name="warning" /><p><strong>Disconnect AWS-Transform-Demo?</strong> Scheduled analyses stop and in-progress remediations pause. The GitHub App stays installed until an org admin removes it.</p><button type="button" className="st-deploy" onClick={() => setConfirmDisconnect(false)}>Cancel</button><button type="button" className="src-danger" onClick={() => setConnected(false)}>Disconnect</button></div>}
        <div className="src-stats"><div><strong>{repos.length}</strong><span>repositories shared</span></div><div><strong>{repos.length - counts.none}</strong><span>analyzed</span></div><div><strong>{openCount}</strong><span>open findings</span></div><div><strong>Read only</strong><span>pull requests after approval</span></div></div>
        <div className="src-toolbar"><label className="findings-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find repositories" aria-label="Find repositories" /></label>
          <div className="src-filter" role="group" aria-label="Filter repositories">{[['all', 'All'], ['findings', 'With findings'], ['none', 'Not analyzed']].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}<small>{counts[key]}</small></button>)}</div>
          <a className="st-link src-github" href="#github-repository-access">Add or remove repositories on GitHub {external}</a></div>
        <div className="st-table-wrap src-table-wrap"><table className="st-table">
          <colgroup><col style={{ width: '33%' }} /><col style={{ width: '17%' }} /><col style={{ width: '19%' }} /><col /><col style={{ width: 120 }} /></colgroup>
          <thead><tr><th>Repository</th><th>Language</th><th>Last analyzed</th><th>Open findings</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{shown.map((repo) => <tr key={repo.name}>
            <td><span className="src-repo">{repo.name}</span><small>{repo.platform}</small></td>
            <td>{repo.language}</td>
            <td>{queued.has(repo.name) ? <span className="st-status busy"><span className="oauth-spinner small" aria-hidden="true" />Analyzing</span> : repo.analyzed || <span className="item-muted">Not analyzed yet</span>}</td>
            <td>{repo.findings > 0 ? <><button type="button" className="src-findings" onClick={() => openFindings(onNavigate, { repo: repo.name })}>{repo.findings} findings</button>{repo.detail && <small>{repo.detail}</small>}</> : repo.findings === 0 ? <span className="item-muted">None</span> : '—'}</td>
            <td className="st-action">{!repo.analyzed && !queued.has(repo.name) && <button type="button" className="st-deploy" onClick={() => analyze(repo.name)}>Analyze</button>}</td>
          </tr>)}</tbody>
        </table>{shown.length === 0 && <p className="src-none">No repositories match. <button type="button" className="dash-link" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></p>}</div>
      </section>}
  </RailShell>;
}

// ─── Settings (rail): CloudFormation infrastructure + prototype data ───
const SETTINGS_STACKS = [
  { group: 'account', name: 'AtxDispatcherStack', kind: 'Queue', enables: 'Dispatches analysis and remediation jobs', required: true, deployed: 'Aug 10, 2026' },
  { group: 'account', name: 'atx-scheduler', kind: 'Scheduler', enables: 'Scheduled and continuous runs', required: true, deployed: 'Aug 10, 2026' },
  { group: 'account', name: 'AtxSecurityAgentStack-us-east-1', kind: 'Security agent', enables: 'Security analysis', required: true, deployed: 'Aug 10, 2026' },
  { group: 'team', name: 'AtxInfrastructureStack', kind: 'AWS Batch · recommended', enables: 'Analysis and remediation', required: true, deployed: 'Aug 10, 2026' },
  { group: 'team', name: 'atx-runner-<suffix>', kind: 'Amazon EC2', enables: 'Analysis and remediation on EC2', note: 'Use instead of Batch when jobs need a long-lived host', required: false, deployed: null },
];
const ADMIN_INSTRUCTIONS = `Deploy AWS Transform Continuous Modernization infrastructure in account 1234-5678-9012 (us-east-1).
Use these exact stack names:
  Account: AtxDispatcherStack, atx-scheduler, AtxSecurityAgentStack-us-east-1
  Team:    AtxInfrastructureStack (AWS Batch, recommended) or atx-runner-<suffix> (Amazon EC2)
Each stack opens a quick-create link in the CloudFormation console; you need administrator access.`;

function ExternalGlyph() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
}

function RailSettings({ onNavigate }) {
  const [stacks, setStacks] = useState(() => SETTINGS_STACKS.map((stack) => ({ ...stack, state: stack.deployed ? 'deployed' : 'none' })));
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const required = stacks.filter((stack) => stack.required);
  const requiredDone = required.filter((stack) => stack.state === 'deployed').length;
  const optionalMissing = stacks.filter((stack) => !stack.required && stack.state !== 'deployed').length;
  const deploy = (name) => {
    setStacks((list) => list.map((stack) => (stack.name === name ? { ...stack, state: 'deploying' } : stack)));
    window.setTimeout(() => setStacks((list) => list.map((stack) => (stack.name === name ? { ...stack, state: 'deployed', deployed: 'Oct 13, 2026' } : stack))), 2600);
  };
  const refresh = () => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); };
  const copy = () => { navigator.clipboard?.writeText(ADMIN_INSTRUCTIONS).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 2000); };
  const summary = `${requiredDone === required.length ? 'All required stacks deployed' : `${requiredDone} of ${required.length} required stacks deployed`}${optionalMissing ? ` · ${optionalMissing} optional not deployed` : ''}`;
  const table = (group) => <div className="st-table-wrap"><table className="st-table">
    <colgroup><col style={{ width: '32%' }} /><col /><col style={{ width: 170 }} /><col style={{ width: 200 }} /></colgroup>
    <thead><tr><th>Stack</th><th>Enables</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>{stacks.filter((stack) => stack.group === group).map((stack) => <tr key={stack.name}>
      <td><span className="mono st-name">{stack.name}</span><small>{stack.kind}</small></td>
      <td>{stack.enables}{stack.note && <small>{stack.note}</small>}</td>
      <td>{stack.state === 'deployed' ? <><span className="st-status ok"><i aria-hidden="true" />Deployed</span><small>{stack.deployed}</small></>
        : stack.state === 'deploying' ? <><span className="st-status busy"><span className="oauth-spinner small" aria-hidden="true" />Deploying</span><small>CREATE_IN_PROGRESS</small></>
          : <><span className="st-status off"><i aria-hidden="true" />Not deployed</span><small>{stack.required ? 'Required' : 'Optional'}</small></>}</td>
      <td className="st-action">{stack.state === 'deployed' ? <a className="st-link" href={`#cloudformation/${stack.name}`}>View in CloudFormation <ExternalGlyph /></a>
        : stack.state === 'deploying' ? <a className="st-link" href={`#cloudformation/${stack.name}`}>View events <ExternalGlyph /></a>
          : <button type="button" className="st-deploy" onClick={() => deploy(stack.name)}>Deploy <ExternalGlyph /></button>}</td>
    </tr>)}</tbody>
  </table></div>;
  return <RailShell active="Settings" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Settings</h1><p>Infrastructure that runs analysis and remediation in your AWS account.</p></div></div>
    <section className="dash-card st-card">
      <header className="st-head"><div><h2>Infrastructure</h2><p>CloudFormation stacks in account 1234-5678-9012 · us-east-1. You own and manage these resources.</p></div>
        <div className="st-health"><span className="st-meter" aria-hidden="true"><i style={{ width: `${(stacks.filter((stack) => stack.state === 'deployed').length / stacks.length) * 100}%` }} /></span><span>{refreshing ? 'Checking stacks…' : summary}</span><button type="button" className="st-refresh" onClick={refresh} disabled={refreshing}>Refresh</button></div></header>
      <div className="st-alert"><Icon name="warning" /><span>Deploying needs administrator access to the target account. <button type="button" className="dash-link" onClick={copy}>{copied ? 'Copied to clipboard' : 'Copy instructions for an admin'}</button></span></div>
      <div className="st-section"><span className="st-num">1</span><div><h3>Account infrastructure</h3><p>Deployed once per AWS account. Use these exact stack names.</p></div></div>
      {table('account')}
      <div className="st-section"><span className="st-num">2</span><div><h3>Team infrastructure</h3><p>One per team. Add more only when teams need different configuration or access.</p></div></div>
      {table('team')}
      <footer className="st-foot"><span>Provision without the web app:</span><a className="st-link" href="#kiro">Kiro Power <ExternalGlyph /></a><a className="st-link" href="#skill">AWS Transform agentic skill <ExternalGlyph /></a><a className="st-link" href="#cli">AWS Transform CLI <ExternalGlyph /></a></footer>
    </section>
    <section className="dash-card st-card st-demo">
      <div><h2>Demo data <span className="st-chip">Prototype</span></h2><p>{resetDone ? 'Demo data reset. Seeded examples are back.' : 'Clears applied remediations, published skills and drafts. Seeded examples stay.'}</p></div>
      <button type="button" className="st-deploy" onClick={() => { resetDemoData(); setResetDone(true); }}>Reset demo data</button>
    </section>
  </RailShell>;
}

function SetupItem({ title, stack, action, disabled }) {
  return <div className="setup-item"><strong>{title}</strong><p><strong>Stack name</strong> &nbsp; <Icon name="copy" /> {stack}</p><Button variant="outline" disabled={disabled}>{action}</Button></div>;
}

function RunAnalysisPage({ sources, setSources, onCancel, onComplete, toast, initialView = 'analysis-start' }) {
  const [type, setType] = useState('');
  const [menuOpen, setMenuOpen] = useState(initialView === 'analysis-type');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [connectMode, setConnectMode] = useState(initialView === 'analysis-source');
  const [error, setError] = useState(true);
  const [review, setReview] = useState(false);
  const connect = (newSource) => { setSources((current) => [...current, newSource]); setSource(newSource.name); setConnectMode(false); toast(`${newSource.name} connected and selected`); };
  const next = () => { if (!type) { setError(true); return; } setError(false); setReview(true); };
  if (review) return <div className="run-page"><Breadcrumb onCancel={onCancel} /><h2>Review analysis</h2><section className="card review-card"><h3>{name || type}</h3><dl><div><dt>Analysis type</dt><dd>{type}</dd></div><div><dt>Connected source</dt><dd>{source || sources[0]?.name}</dd></div><div><dt>Infrastructure</dt><dd>AWS managed</dd></div></dl><div className="review-note"><Icon name="info" /> This prototype will add a completed analysis to the history.</div></section><div className="form-actions"><button className="text-button" onClick={() => setReview(false)}>Back</button><Button onClick={() => onComplete({ date: 'Aug 27, 2026', name: name || 'New portfolio analysis', type, repos: '1 of 1', findings: 0, infrastructure: 'AWS managed' })}>Run analysis</Button></div></div>;
  return <div className="run-page"><Breadcrumb onCancel={onCancel} /><h2>Run new analysis</h2><section className="card run-card"><h3>Analysis details</h3><div className="analysis-form"><label className={`field ${error && !type ? 'error' : ''}`}><strong>Analysis type</strong><button className="input-select" onClick={() => setMenuOpen(!menuOpen)}><em className={type ? 'chosen' : ''}>{type || 'Choose analysis type'}</em><Icon name="chevron" /></button>{error && !type && <span className="error-text">ⓧ Analysis type is required</span>}{menuOpen && <div className="select-menu">{analysisTypes.map(([item, description]) => <button key={item} onClick={() => { setType(item); setMenuOpen(false); setError(false); }}><strong>{item}</strong><small>{description}</small></button>)}</div>}</label><Field label="Analysis name - optional" placeholder="Enter a name for this analysis" value={name} onChange={setName} />
      <div className="connected-source"><strong>Connected source</strong>{connectMode ? <><SourceForm compact onConnect={connect} /><button className="link-button existing-source" onClick={() => setConnectMode(false)}>Use an existing source</button></> : <div className="source-choice"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Choose source</option>{sources.map((item) => <option key={item.name}>{item.name}</option>)}</select><Button variant="outline" icon="plus" onClick={() => setConnectMode(true)}>Connect a new source</Button></div>}</div></div></section><div className="form-actions"><button className="text-button" onClick={onCancel}>Cancel</button><Button onClick={next}>Next</Button></div></div>;
}

function Breadcrumb({ onCancel }) {
  return <div className="breadcrumbs"><button onClick={onCancel}>Continuous modernization</button><Icon name="forward" /><button onClick={onCancel}>Analyses</button><Icon name="forward" /><strong>Run new analysis</strong></div>;
}

function Toast({ text, onClose }) {
  if (!text) return null;
  return <div className="toast"><Icon name="check" /><span>{text}</span><button onClick={onClose}><Icon name="close" /></button></div>;
}

// ───────────────────────── Rail pages: Remediations, remediation detail, Analyses, Run new analysis ─────────────────────────
// Remediation efforts in flight. One initiative can need several efforts (the change itself plus the
// enabling or preparation work it depends on), so efforts outnumber in-progress initiatives.
const EFFORTS = [
  { id: 'expo', state: 'progress', type: 'Direct', title: 'Upgrade MKPMobile to Expo SDK 51', line1: 'Initiative: Upgrade MKPMobile to Expo SDK 51', repo: R.mobile, findings: 3,
    progress: { label: 'PR #412 ready for review', pct: null, sub: 'Due Aug 31 · Google Play target API', subTone: 'risk' },
    attention: { label: 'Waiting on code owner approval · 1 of 2', sub: 'Validation passed · 6 of 6 checks' },
    verification: [['pending', 'Verification pending']], action: 'Details' },
  { id: 'node20', state: 'failed', type: 'Direct', title: 'Node.js 16 → 20 runtime', line1: 'Finding: Node.js 16 runtime is end of life', repo: R.node, findings: 1,
    progress: { label: 'Stopped at validation · 17 of 28 checks', pct: 17 / 28, sub: 'Due Sep 30 · at risk', subTone: 'risk' },
    attention: { label: 'Validation failed · 3 integration tests fail', tone: 'fail', sub: 'Retry after the tests are fixed' },
    verification: [['notargeted', 'Not verified']], action: 'Details' },
  { id: 'tests', state: 'progress', type: 'Preparation', title: 'Add integration test coverage', line1: 'Readiness gap · order checkout flow', repo: R.node, findings: 0,
    progress: { label: '4 of 9 test tasks done', pct: 4 / 9, sub: 'Due Sep 20 · before the Node.js 20 re-validate' },
    attention: { label: 'Writing tests', sub: 'Unblocks Node.js 16 → 20 validation' },
    verification: [['none', 'No verification needed']], action: 'Details' },
  { id: 'packages', state: 'progress', type: 'Direct', title: 'Patched npm packages', line1: 'Initiative: Modernize the Node.js services', repo: R.node, findings: 8,
    progress: { label: 'Step 1 of 2 · 5 of 8 packages updated', pct: 5 / 8, sub: 'Target Oct 4' },
    attention: { label: 'No action needed', sub: 'Step 2 starts after Node.js 20 merges' },
    verification: [['verified', 'Verified · 3 findings'], ['pending', 'Verification pending · 5']], action: 'Details' },
  { id: 'angular', state: 'progress', type: 'Direct', title: 'Migrate payments-ui from AngularJS to React', line1: 'Initiative: Migrate payments-ui from AngularJS to React', repo: R.ui, findings: 3,
    progress: { label: 'Executing · phase 3 of 5', pct: 0.6, sub: 'Target Oct 21' },
    attention: { label: 'No action needed', sub: 'CM opens the PR after validation' },
    verification: [['executing', 'Executing']], action: 'Details' },
  { id: 'fixtures', state: 'progress', type: 'Enabling', title: 'Shared test fixtures for payments-ui', line1: 'Shared library · payments-test-kit', repo: R.ui, findings: 0,
    progress: { label: 'Executing · step 4 of 5', pct: 0.8, sub: 'Target Sep 18' },
    attention: { label: 'No action needed', sub: 'Unlocks AngularJS phases 4–5' },
    verification: [['executing', 'Executing']], action: 'Details' },
  { id: 'ci-gate', state: 'progress', type: 'Preparation', title: 'Add CI validation gate', line1: 'Readiness gap · MKPMobile release pipeline', repo: R.mobile, findings: 0,
    progress: { label: 'Connecting CI and release events', pct: 0.3, sub: 'Target Oct 10' },
    attention: { label: 'No action needed', sub: 'Lets CM verify the Expo upgrade at merge' },
    verification: [['none', 'No verification needed']], action: 'Details' },
  { id: 'sdk-v3', state: 'progress', type: 'Direct', title: 'AWS SDK v2 → v3', line1: 'Finding: AWS SDK for JavaScript v2', repo: R.node, findings: 1,
    progress: { label: 'Queued', pct: null, sub: 'Starts after Node.js 20 merges' },
    attention: { label: 'Waiting on Node.js 16 → 20', sub: 'SDK v3 requires Node.js 18+' },
    verification: [['notstarted', 'Not started']], action: 'Details' },
  { id: 'jquery', state: 'progress', type: 'Direct', title: 'Remove jQuery 2', line1: 'Finding: jQuery 2 known CVEs', repo: R.ui, findings: 1,
    progress: { label: 'Queued · phase 4', pct: null, sub: 'Target Oct 28' },
    attention: { label: 'Waiting on shared test fixtures', sub: 'Needs payments-test-kit 1.0' },
    verification: [['notstarted', 'Not started']], action: 'Details' },
];
const COMPLETED_EFFORTS = [
  { id: 'done-java8', state: 'done', type: 'Direct', title: 'Java 8 → 11 baseline', line1: 'Initiative: Java 11 baseline', repo: R.payments, findings: 4,
    progress: { label: 'Merged · Aug 14', pct: 1, sub: 'PR #1610' }, attention: { label: 'Done', sub: 'Closed by Priya Raman' },
    verification: [['verified', 'Verified · 4 findings']], action: 'Details' },
  { id: 'done-token', state: 'done', type: 'Direct', title: 'Rotate leaked npm token', line1: 'Finding: npm token in .npmrc', repo: R.learning, findings: 1,
    progress: { label: 'Merged · Aug 2', pct: 1, sub: 'PR #77' }, attention: { label: 'Done', sub: 'Token revoked and rotated' },
    verification: [['verified', 'Verified · 1 finding']], action: 'Details' },
  { id: 'done-express', state: 'done', type: 'Direct', title: 'Patch express in MyLearning', line1: 'Finding: CVE-2024-29041 in express 4.17.1', repo: R.learning, findings: 1,
    progress: { label: 'Merged · Jul 28', pct: 1, sub: 'PR #74' }, attention: { label: 'Done', sub: 'Security agent' },
    verification: [['verified', 'Verified · 1 finding']], action: 'Details' },
  { id: 'done-request', state: 'done', type: 'Direct', title: 'Replace request library', line1: 'Finding: Deprecated request library', repo: R.mobile, findings: 1,
    progress: { label: 'Merged · Jul 21', pct: 1, sub: 'PR #398' }, attention: { label: 'Done', sub: 'Gone on a later scan' },
    verification: [['inferred', 'Inferred · not counted'], ['notargeted', 'No targeted check']], action: 'Details' },
  { id: 'done-digests', state: 'done', type: 'Preparation', title: 'Pin base image digests', line1: 'Readiness gap · reproducible builds', repo: R.payments, findings: 0,
    progress: { label: 'Done · Jul 9', pct: 1, sub: '1 repository' }, attention: { label: 'Done', sub: 'Unblocked the base image update' },
    verification: [['none', 'No verification needed']], action: 'Details' },
];
const EFFORT_STATES = [['failed', 'Failed', 'Stopped — retry once the cause is fixed'], ['progress', 'In progress', 'CM is working on these']];
const EFFORT_TYPES = ['Direct', 'Enabling', 'Preparation'];

function VerifyIcon({ name }) {
  const paths = {
    pending: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    validating: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
    executing: <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />,
    none: <path d="M7 12h10" />,
    inferred: <circle cx="12" cy="12" r="8.5" />,
    notargeted: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
    verified: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
    notstarted: <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" />,
  };
  return <svg className={`rem-vicon ${name}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

let pendingEffort = null;
const openEffort = (onNavigate, id) => { pendingEffort = id; onNavigate('improved-rail-remediation'); };

function EffortRow({ effort, expanded, onExpand, onNavigate }) {
  return <>
    <tr className={`rem-row ${expanded ? 'expanded' : ''}`} onClick={() => openEffort(onNavigate, effort.id)}>
      <td className="item-toggle"><button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} details for ${effort.title}`} onClick={(event) => { event.stopPropagation(); onExpand(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button></td>
      <td className="rem-name"><button type="button" className="item-title" onClick={(event) => { event.stopPropagation(); openEffort(onNavigate, effort.id); }}>{effort.title}</button><small>{effort.line1}</small><small className="item-muted">{effort.repo} · {effort.findings ? `${effort.findings} finding${effort.findings === 1 ? '' : 's'}` : '1 repo'}</small></td>
      <td><span className="rem-type">{effort.type}</span></td>
      <td className="rem-progress">{effort.progress.pct !== null && <span className="rem-bar"><i style={{ width: `${Math.round(effort.progress.pct * 100)}%` }} /></span>}<span>{effort.progress.label}</span><small className={effort.progress.subTone || ''}>{effort.progress.sub}</small></td>
      <td><span className={`rem-attention ${effort.attention.tone || ''}`}>{effort.attention.label}</span><small className="item-muted">{effort.attention.sub}</small></td>
      <td className="rem-verify">{effort.verification.map(([icon, label]) => <span key={label}><VerifyIcon name={icon} />{label}</span>)}</td>
      <td className="rem-actions"><button type="button" className="rem-small-button" onClick={(event) => { event.stopPropagation(); openEffort(onNavigate, effort.id); }}>{effort.action}</button></td>
    </tr>
    {expanded && <tr className="rem-expanded"><td /><td colSpan={6}>
      {effortFindings(effort).length ? <ul className="initiative-findings">{effortFindings(effort).map((item) => <li key={item.id}><i style={{ background: SEVERITY_DOT[item.severity] }} aria-label={item.severity} /><span>{item.title}</span><span className="dash-muted">{item.repo}</span></li>)}</ul> : <p className="item-muted">No findings — this effort prepares the ground for another remediation.</p>}
    </td></tr>}
  </>;
}
function effortFindings(effort) {
  const byInitiative = { expo: 'expo', angular: 'angular', packages: 'node' };
  if (byInitiative[effort.id]) return ESTATE_FINDINGS.filter((item) => item.initiative === byInitiative[effort.id]).filter((item) => effort.id !== 'packages' || /package|lodash|moment|request|fetch|lockfile|express|jsonwebtoken|Unused/i.test(item.title));
  const titled = { node20: 'Node.js 16 runtime is end of life', 'sdk-v3': 'AWS SDK for JavaScript v2', jquery: 'jQuery 2 known CVEs' }[effort.id];
  return titled ? ESTATE_FINDINGS.filter((item) => item.title === titled) : [];
}

function RailRemediations({ onNavigate }) {
  const [tab, setTab] = useState('active');
  const [type, setType] = useState('All');
  const [state, setState] = useState('All');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const list = tab === 'active' ? EFFORTS : COMPLETED_EFFORTS;
  const typeCount = (name) => list.filter((item) => name === 'All' || item.type === name).length;
  const stateCount = (name) => EFFORTS.filter((item) => name === 'All' || item.state === name).length;
  const shown = list.filter((item) => (type === 'All' || item.type === type) && (tab !== 'active' || state === 'All' || item.state === state)
    && (!query || `${item.title} ${item.line1} ${item.repo}`.toLowerCase().includes(query.toLowerCase())));
  const toggle = (id) => setExpanded((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const failed = EFFORTS.filter((item) => item.state === 'failed');
  const typesLine = EFFORT_TYPES.map((name) => `${EFFORTS.filter((item) => item.type === name).length} ${name}`).join(' · ');
  const groups = tab === 'active' ? EFFORT_STATES.map(([key, label, note]) => ({ key, label, note, items: shown.filter((item) => item.state === key) })) : [{ key: 'done', label: 'Completed this quarter', note: 'Verified counts only findings CM re-checked at the merge commit', items: shown }];
  const segmented = (label, value, onChange, options) => <div className="rem-filter"><span>{label}</span><div className="rem-segmented" role="group" aria-label={label}>{options.map(([key, text, count]) => <button key={key} type="button" aria-pressed={value === key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{text}{count !== undefined && <small>{count}</small>}</button>)}</div></div>;
  return <RailShell active="Remediations" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Remediations</h1><p>Every remediation effort in flight: what’s stuck, what’s moving and what has been verified at the merge commit.</p></div></div>
    <div className="dash-stats rem-stats">
      <section className="dash-card dash-stat"><span>Active efforts</span><strong>{EFFORTS.length}</strong><small>{typesLine}</small></section>
      <section className="dash-card dash-stat"><span>Failed</span><strong className={failed.length ? 'rem-risk' : ''}>{failed.length} <em>of {EFFORTS.length}</em></strong><small>{failed[0] ? `${failed[0].title} · validation failed` : 'Nothing failed'}</small></section>
      <section className="dash-card dash-stat"><span>Verified at the merge commit · this quarter</span><strong>41 <em>findings</em></strong><small>3 from active efforts · 38 from completed ones</small></section>
      <section className="dash-card dash-stat"><span>Inferred, not counted</span><strong>1</strong><small>Gone on a later scan, no targeted check</small></section>
    </div>
    <div className="rem-tabs" role="tablist">{[['active', 'Active', EFFORTS.length], ['done', 'Completed this quarter', COMPLETED_EFFORTS.length]].map(([key, label, count]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setState('All'); setType('All'); }}>{label}<span>{count}</span></button>)}</div>
    <div className="rem-filters">
      {segmented('Type', type, setType, [['All', 'All', typeCount('All')], ...EFFORT_TYPES.map((name) => [name, name, typeCount(name)])])}
      {tab === 'active' && segmented('State', state, setState, [['All', 'All'], ...EFFORT_STATES.map(([key, label]) => [key, label, stateCount(key)])])}
      <label className="findings-search rem-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search remediations" aria-label="Search remediations" /></label>
    </div>
    <section className="dash-card items-card">
      <div className="estate-findings-table-wrap"><table className="items-table rem-table">
        <colgroup><col style={{ width: 40 }} /><col style={{ width: '27%' }} /><col style={{ width: '9%' }} /><col style={{ width: '19%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /><col style={{ width: 110 }} /></colgroup>
        <thead><tr><th className="item-toggle" /><th>Remediation</th><th>Type</th><th>Progress</th><th>Attention · dependency</th><th>Verification</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{groups.filter((group) => group.items.length).map((group) => [
          <tr key={group.key} className="item-group"><td colSpan={7}><strong>{group.label}</strong><span>{group.items.length} · {group.note}</span></td></tr>,
          ...group.items.map((effort) => <EffortRow key={effort.id} effort={effort} expanded={expanded.has(effort.id)} onExpand={() => toggle(effort.id)} onNavigate={onNavigate} />),
        ])}</tbody>
      </table></div>
      {shown.length === 0 && <div className="findings-empty"><strong>No remediations match</strong><button type="button" className="dash-link" onClick={() => { setType('All'); setState('All'); setQuery(''); }}>Clear filters</button></div>}
    </section>
    <p className="rem-footnote">Verified means CM re-ran the original detection at the merge commit and the finding is gone. A finding that disappears on a later scan without a targeted check is shown as inferred and not counted.</p>
  </RailShell>;
}

// ─── remediation detail ───
const STEPS = ['Detected', 'Change generated', 'Validate', 'Pull request', 'Review', 'Merge', 'Verify'];
function remediationDetail(effort) {
  const service = REPO_CONTEXT[effort.repo]?.service || 'Platform';
  const queued = effort.progress.label.startsWith('Queued');
  const base = {
    pill: effort.state === 'failed' ? ['Failed', 'fail'] : effort.state === 'done' ? ['Verified', 'ok'] : queued ? ['Queued', 'muted'] : ['In progress', 'info'],
    td: effort.type === 'Direct' ? 'Managed TD' : 'Specialized skill', tdId: effort.type === 'Direct' ? 'AWS/nodejs-dependency-upgrade v2' : 'Generated for this repository',
    current: effort.state === 'done' ? 7 : queued ? 0 : 2, failedAt: null,
    stepSubs: ['Aug 24 · estate analysis', queued ? 'Waiting to start' : 'Aug 25 · change ready', 'Running checks', 'Opens after validation', 'Code owners', service, 'At the merge commit'],
    deadline: { by: effort.progress.sub.match(/(?:Due|Target) ([A-Z][a-z]{2} \d+)/)?.[1] || 'Oct 21', tone: effort.progress.subTone === 'risk' ? 'risk' : 'ok', note: 'Org policy: medium findings on prod-critical repos within 60 days', day: 18, of: 60, forecast: 'Forecast on time' },
    card: { tone: 'info', title: queued ? `Waiting on ${effort.attention.label.replace('Waiting on ', '')}` : effort.progress.label, body: `${effort.attention.sub}.` },
    checks: [['Build', 1, 1], ['Unit tests', queued ? 0 : 8, 8], ['Dependency compatibility', queued ? 0 : 2, 3], ['Static analysis', 0, 4, 'not run']],
    changes: null, approver: `${service} code owners`, started: 'Aug 25 by Nithin',
    activity: [['info', effort.progress.label, 'Today'], ['ok', 'Change generated', 'Aug 25'], ['ok', 'Approved by Nithin', 'Aug 25'], ['ok', 'Finding detected', 'Aug 24']],
    evidence: [['Original finding', 'From Portfolio baseline, Aug 24']],
  };
  if (effort.id === 'node20') return { ...base, pill: ['Validation failed', 'fail'], td: 'Managed TD', tdId: 'AWS/nodejs-version-upgrade v3', current: 2, failedAt: 2,
    stepSubs: ['Aug 24 · estate analysis', 'Aug 25 · 12 files', '3 checks failed', 'Opens after validation', 'Code owners', 'Order management', 'At the merge commit'],
    deadline: { by: 'Sep 30', tone: 'risk', note: 'AWS Lambda blocks updates to Node.js 16 functions after Sep 30', day: 21, of: 35, forecast: 'Forecast Oct 8 · 8 days late', late: true },
    card: { tone: 'fail', title: 'Validation failed: 3 integration tests fail on Node.js 20', body: <>The upgrade compiles and 17 of 28 checks pass. The 3 checkout tests mock <code>crypto.createCipher</code>, which was removed in Node.js 18. Fix by Sep 24 to keep the Sep 30 deadline.</>,
      fix: <>Update the 3 mocks to <code>crypto.createCipheriv</code> in <code>test/checkout/*.spec.js</code>. Test files only, no application code.</>,
      tests: [['checkout › encrypts card token before submit', 'test/checkout/payment.spec.js:42', 'TypeError: crypto.createCipher is not a function'], ['checkout › decrypts saved payment method', 'test/checkout/saved-card.spec.js:18', 'TypeError: crypto.createDecipher is not a function'], ['checkout › rotates session key on retry', 'test/checkout/session.spec.js:77', 'Expected mock to be called once, called 0 times']] },
    checks: [['Build', 1, 1], ['Unit tests', 12, 12], ['Integration tests', 1, 4, 'fail'], ['Dependency compatibility', 3, 3], ['Static analysis', 0, 8, 'not run']],
    changes: { branch: 'atx/nodejs-20-upgrade', files: [['package.json', 2, 2], ['Dockerfile', 1, 1], ['src/payments/token.js', 14, 11], ['.nvmrc', 1, 1], ['+ 8 more files', 78, 56]],
      diff: { 'package.json': [[' ', '@@ -14,7 +14,7 @@'], [' ', '  "name": "ordering-system",'], ['-', '  "engines": { "node": "16.x" },'], ['+', '  "engines": { "node": ">=20" },'], [' ', '  "scripts": {']], Dockerfile: [['-', 'FROM node:16-alpine'], ['+', 'FROM node:20-alpine']], 'src/payments/token.js': [['-', "const cipher = crypto.createCipher('aes-256-cbc', key);"], ['+', "const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);"]], '.nvmrc': [['-', '16'], ['+', '20']] } },
    approver: 'Order management code owners', activity: [['fail', '3 integration tests failed', 'Sep 21, 4:12 PM'], ['info', 'Validation started · 28 checks', 'Sep 21, 3:58 PM'], ['ok', 'Change generated · 12 files', 'Aug 25'], ['ok', 'Approved by Nithin', 'Aug 25'], ['ok', 'Finding detected', 'Aug 24']],
    evidence: [['Validation report', 'validation.json · 18 KB'], ['Test output', 'integration.log · 42 KB'], ['Original finding', 'From Node.js quick assessment, Aug 24']] };
  if (effort.id === 'expo') return { ...base, pill: ['In review', 'info'], td: 'Custom TD', tdId: 'Custom/expo-sdk-upgrade v2', current: 4,
    stepSubs: ['Aug 24 · estate analysis', 'Aug 25 · 24 files', '6 of 6 checks passed', 'PR #412', '1 of 2 code owners approved', 'Mobile app', 'At the merge commit'],
    deadline: { by: 'Aug 31', tone: 'risk', note: 'Google Play: new releases must target API level 34 after Aug 31', day: 10, of: 14, forecast: 'Forecast Aug 27 · 4 days early' },
    card: { tone: 'info', title: 'Waiting on code owner approval of PR #412 · 1 of 2', body: 'Validation passed. Marcus Oyelaran approved on Aug 26; Priya Raman hasn’t reviewed yet. CM merges once both required code owners approve.' },
    checks: [['Build', 1, 1], ['Unit tests', 14, 14], ['Expo doctor', 1, 1], ['Android and iOS release builds', 2, 2], ['Static analysis', 6, 6]],
    changes: { branch: 'atx/expo-sdk-51', files: [['package.json', 18, 16], ['app.json', 4, 3], ['ios/Podfile', 9, 12], ['+ 21 more files', 381, 357]],
      diff: { 'package.json': [['-', '  "expo": "~38.0.0",'], ['+', '  "expo": "~51.0.0",']], 'app.json': [['-', '    "targetSdkVersion": 29'], ['+', '    "targetSdkVersion": 34']], 'ios/Podfile': [['-', "platform :ios, '11.0'"], ['+', "platform :ios, '13.4'"]] } },
    approver: 'Mobile code owners (2 required)', activity: [['ok', 'Approved by Marcus Oyelaran', 'Aug 26'], ['info', 'PR #412 opened', 'Aug 26'], ['ok', 'Validation passed · 6 checks', 'Aug 26'], ['ok', 'Change generated · 24 files', 'Aug 25'], ['ok', 'Finding detected', 'Aug 24']],
    evidence: [['Validation report', 'validation.json · 11 KB'], ['Pull request', 'PR #412 · github.com'], ['Original finding', 'From Portfolio baseline, Aug 24']] };
  return base;
}

function RailRemediationDetail({ onNavigate }) {
  const [id] = useState(() => pendingEffort || 'node20');
  const effort = [...EFFORTS, ...COMPLETED_EFFORTS].find((item) => item.id === id) || EFFORTS[0];
  const detail = remediationDetail(effort);
  const [showTests, setShowTests] = useState(true);
  const [fixApplied, setFixApplied] = useState(false);
  const [retried, setRetried] = useState(false);
  const [paused, setPaused] = useState(false);
  const [file, setFile] = useState(detail.changes?.files[0][0]);
  const failed = detail.failedAt !== null && !retried;
  const [pillLabel, pillTone] = paused ? ['Paused', 'muted'] : retried ? ['Re-validating', 'info'] : detail.pill;
  const passed = detail.checks.reduce((sum, [, n]) => sum + n, 0);
  const total = detail.checks.reduce((sum, [, , t]) => sum + t, 0);
  const failedChecks = detail.checks.filter(([, , , state]) => state === 'fail').reduce((sum, [, n, t]) => sum + (t - n), 0);
  const notRun = detail.checks.filter(([, , , state]) => state === 'not run').reduce((sum, [, n, t]) => sum + (t - n), 0);
  const changeTotals = detail.changes?.files.reduce(([a, d], [, plus, minus]) => [a + plus, d + minus], [0, 0]);
  const fileCount = detail.changes ? detail.changes.files.reduce((sum, [name]) => sum + (name.startsWith('+ ') ? Number(name.match(/\d+/)[0]) : 1), 0) : 0;
  const finding = effortFindings(effort)[0];
  return <RailShell active="Remediations" onNavigate={onNavigate}>
    <nav className="rem-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('improved-rail-remediations')}>Remediations</button><span>›</span><span>{effort.title}</span></nav>
    <div className="dash-title"><div><h1 className="an-detail-title">{effort.title} <span className={`rd-pill ${pillTone}`}><i />{pillLabel}</span></h1>
      <p className="rd-meta"><span className="mono">{effort.repo}</span> · {REPO_CONTEXT[effort.repo]?.service || 'Shared'} · {effort.findings ? `${effort.findings} finding${effort.findings === 1 ? '' : 's'}${finding ? `: ${finding.title}` : ''}` : 'No findings'} · {effort.type} · {detail.td} <span className="mono">{detail.tdId.split(' ')[0]}</span></p></div>
      <div className="dash-title-actions"><Button variant="outline" onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</Button></div></div>

    <section className="dash-card rd-track">
      <ol className="rd-steps">{STEPS.map((label, index) => { const status = failed && index === detail.failedAt ? 'fail' : index < detail.current || (retried && index === detail.failedAt) ? 'done' : index === detail.current ? 'current' : 'todo'; return <li key={label} className={status}><span className="rd-dot">{status === 'done' ? '✓' : status === 'fail' ? '!' : index + 1}</span><strong>{label}</strong><small>{retried && index === detail.failedAt ? 'Re-running checks' : detail.stepSubs[index]}</small></li>; })}</ol>
      <div className="rd-deadline">
        <div><strong>Resolve by {detail.deadline.by}</strong>{detail.deadline.tone === 'risk' && <span className="rd-risk">{detail.deadline.late ? 'At risk' : 'Deadline soon'}</span>}<small>{detail.deadline.note}</small></div>
        <div className="rd-bar"><span className={`rd-bar-track ${detail.deadline.late ? 'late' : ''}`}><i style={{ width: `${(detail.deadline.day / detail.deadline.of) * 100}%` }} /><b /></span><span className="rd-bar-labels"><small>Today · day {detail.deadline.day} of {detail.deadline.of}</small><small className={detail.deadline.late ? 'risk' : ''}>{detail.deadline.forecast}</small></span></div>
      </div>
    </section>

    <div className="rem-detail-grid rd-grid">
      <div className="rem-detail-main">
        <section className={`dash-card rd-status ${failed ? 'fail' : 'info'}`}>
          <div className="rd-status-head"><span className="rd-status-icon">{failed ? '!' : 'i'}</span><div><h2>{retried ? 'Validation re-running with the test fix' : detail.card.title}</h2><p>{retried ? 'CM applied the fix to the 3 test files and restarted the 28 checks. This usually takes about 15 minutes.' : detail.card.body}</p></div></div>
          {failed && detail.card.fix && <div className="rd-fix"><AssistantSpark /><div><strong>AWS Transform can fix this</strong><p>{detail.card.fix}</p></div><button type="button" className="initiative-review" disabled={fixApplied} onClick={() => setFixApplied(true)}>{fixApplied ? 'Fix applied' : 'Apply fix'}</button></div>}
          {failed && <div className="rd-actions"><Button onClick={() => setRetried(true)}>Retry validation</Button>{detail.card.tests && <Button variant="outline" onClick={() => setShowTests(!showTests)}>{showTests ? 'Hide failing tests' : 'Show failing tests'}</Button>}</div>}
          {failed && showTests && detail.card.tests && <ul className="rd-tests">{detail.card.tests.map(([name, path, error]) => <li key={name}><span className="rd-x">✕</span><div><strong>{name}</strong><small className="mono">{path}</small><code>{error}</code></div></li>)}</ul>}
        </section>
        <section className="dash-card rd-validation"><header><h2>Validation</h2><span>{passed} of {total} passed{failedChecks ? ` · ${failedChecks} failed` : ''}{notRun ? ` · ${notRun} not run` : ''}</span></header>
          <ul>{detail.checks.map(([label, n, t, state]) => <li key={label} className={retried && state ? 'pending' : state || (n === t ? 'ok' : 'partial')}><span className="rd-check">{state === 'fail' ? '✕' : state === 'not run' ? '–' : n === t ? '✓' : '◌'}</span><span>{label}{state === 'not run' ? ' · not run' : ''}</span><span className="rd-check-bar"><i style={{ width: `${t ? (n / t) * 100 : 0}%` }} /></span><span className="rd-check-n">{n} / {t}</span></li>)}</ul></section>
        {detail.changes && <section className="dash-card rd-changes"><header><h2>Changes</h2><span>{fileCount} files · <b className="add">+{changeTotals[0]}</b> <b className="del">−{changeTotals[1]}</b> · branch <span className="mono">{detail.changes.branch}</span></span></header>
          <div className="rd-files" role="tablist">{detail.changes.files.map(([name, plus, minus]) => <button key={name} type="button" role="tab" aria-selected={file === name} className={file === name ? 'active' : ''} disabled={!detail.changes.diff[name]} onClick={() => setFile(name)}><span className="mono">{name}</span> <b className="add">+{plus}</b> <b className="del">−{minus}</b></button>)}</div>
          <pre className="rd-diff">{(detail.changes.diff[file] || []).map(([sign, line], index) => <span key={index} className={sign === '+' ? 'add' : sign === '-' ? 'del' : ''}>{sign === ' ' ? ' ' : sign} {line}</span>)}</pre></section>}
      </div>
      <aside className="rem-detail-side">
        <section className="dash-card rem-glance rd-details"><h2>Details</h2><dl>{[['Repository', <span className="mono">{effort.repo}</span>], ['Owner', REPO_CONTEXT[effort.repo]?.service || 'Platform'], ['Transformation', <>{detail.td}<small className="mono">{detail.tdId}</small></>], ['Started', detail.started], ['Approver', detail.approver], ['ID', <span className="mono">RM-{effort.id}</span>]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="dash-card rd-activity"><header><h2>Activity</h2><button type="button" className="dash-link">View all</button></header><ol>{(retried ? [['info', 'Validation restarted with the test fix', 'Just now'], ...detail.activity] : detail.activity).map(([tone, text, when]) => <li key={text + when} className={tone}><i /><div><span>{text}</span><small>{when}</small></div></li>)}</ol></section>
        <section className="dash-card rd-evidence"><h2>Evidence</h2><ul>{detail.evidence.map(([title, sub]) => <li key={title}><button type="button" className="dash-link">{title}</button><small>{sub}</small></li>)}</ul></section>
      </aside>
    </div>
  </RailShell>;
}

// ─── Review specialized skill ───
let pendingSkill = null;
function reviewSkill(initiative, onNavigate, selectedCount) { pendingSkill = { id: initiative.id, count: selectedCount }; onNavigate('improved-rail-skill'); }
// A drafted skill per item: what it targets, how it works, and the decisions CM picked.
const SKILL_DRAFTS = {
  mylearning: { name: 'React test coverage bootstrap', target: 'Jest + React Testing Library · coverage reported in CI', approach: 'Characterization tests first: capture how critical paths behave today', validation: 'New suite passes 3 consecutive runs against unchanged code', guardrails: 'Test files and CI config only · no application code changes', decisions: ['Jest', 'Render pages inside MemoryRouter', 'Report only'], alsoCovered: '1 custom TD and 1 managed TD' },
  access: { name: 'Payments access and PII hardening', target: 'IAM scope, session expiry, PII redaction and encryption at rest', approach: 'Narrow IAM first, then session expiry, then redaction and encryption', validation: 'Repository static analysis reports no access-control or data-protection findings', guardrails: 'Infrastructure and config files · no business logic changes', decisions: ['1-hour sessions with refresh', 'Redact in toString()', 'KMS-managed keys'], alsoCovered: '1 managed TD' },
  secrets: { name: 'Exposed secret removal', target: 'Credentials in config, history and the mobile bundle moved out of source', approach: 'Rotate each value first, then move it to AWS Secrets Manager or an IAM role, then clean history', validation: 'Secret scanning reports no credentials in any of the 3 repositories', guardrails: 'History rewrites need repo-owner approval first · rotation is logged for audit', decisions: ['AWS Secrets Manager', 'Rotate before rewrite', 'Fail closed at startup'], alsoCovered: null },
};
const genericDraft = (item, rows) => ({ name: `${item.title} fix`, target: rows[0]?.recommendation || item.summary || item.title, approach: `Change ${rows.length === 1 ? 'the one finding' : `all ${rows.length} findings`} in ${initiativeRepos(item)[0]} in one pull request`, validation: `The original ${item.detectedBy?.toLowerCase() || 'analysis'} rule reports no finding at the merge commit`, guardrails: 'Smallest change that clears the finding · no unrelated refactors', decisions: ['Recommended defaults', 'One pull request', 'Owner approval required'], alsoCovered: null });

function RailSkillReview({ onNavigate }) {
  const [ref] = useState(() => pendingSkill || { id: 'mylearning' });
  const item = INITIATIVES.find((entry) => entry.id === ref.id) || INITIATIVES[0];
  const rows = findingsOfInitiative(item);
  const repo = initiativeRepos(item)[0];
  const draft = SKILL_DRAFTS[item.id] || genericDraft(item, rows);
  const [mode, setMode] = useState('skill');
  const [tdChoice, setTdChoice] = useState(null);
  const [tdQuery, setTdQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [publish, setPublish] = useState('publish');
  const [name, setName] = useState(draft.name);
  const [visibility, setVisibility] = useState('This account');
  const [context, setContext] = useState('');
  const [addingContext, setAddingContext] = useState(false);
  const [started, setStarted] = useState(false);
  const sections = [['Target', draft.target, `Covers ${rows.length} finding${rows.length === 1 ? '' : 's'} in ${repo}. CM re-runs the original rule after merge to confirm the fix.`],
    ['Approach', draft.approach, 'Each step is a separate commit on one branch, so a reviewer can follow the change.'],
    ['Validation', draft.validation, 'Validation runs before the pull request opens; the skill stops if a check fails.'],
    ['Guardrails', draft.guardrails, 'CM stops and asks you if a change would fall outside these bounds.']];
  const detected = rows[0]?.detected || 'Aug 25, 2026';
  const recommendedTds = TD_LIBRARY.filter((td) => item.id in td.fits).sort((a, b) => (b.fits[item.id] ?? rows.length) - (a.fits[item.id] ?? rows.length));
  const tdMatches = tdQuery.trim() ? TD_LIBRARY.filter((td) => `${td.id} ${td.description}`.toLowerCase().includes(tdQuery.trim().toLowerCase())) : [];
  const useTd = () => { pathOverrides[item.id] = { kind: 'td', id: tdChoice }; openAuthorize(onNavigate, item.id); };
  const tdOption = (td) => { const covers = td.fits[item.id] === undefined ? null : td.fits[item.id] ?? rows.length; return <li key={td.id}><label className={tdChoice === td.id ? 'selected' : ''}><input type="radio" name="sk-td" checked={tdChoice === td.id} onChange={() => setTdChoice(td.id)} /><span><strong className="mono">{td.id}</strong><small>{td.kind === 'managed' ? 'AWS-managed TD' : 'Custom TD in your registry'} · {td.description}</small></span>{covers !== null && <em className={covers === rows.length ? 'full' : ''}>Covers {covers} of {rows.length} finding{rows.length === 1 ? '' : 's'}</em>}</label></li>; };
  const start = () => {
    EFFORTS.unshift({ id: `skill-${item.id}`, state: 'progress', type: 'Direct', title: item.title, line1: `Specialized skill · ${name}`, repo, findings: rows.length,
      progress: { label: publish === 'one-off' ? 'Running the skill' : 'Running the skill, then publishing', pct: 0.08, sub: item.due ? `Due ${item.due}` : 'No deadline' },
      attention: { label: 'No action needed', sub: publish === 'draft' ? 'Draft is already in the Skills Library' : 'CM opens the PR after validation' }, verification: [['pending', 'Verification pending']], action: 'Details' });
    item.stage = 'progress'; item.readiness = 'applying'; item.verified = `0 of ${rows.length} verified`;
    rows.forEach((finding) => { finding.status = 'In remediation'; });
    setStarted(true);
  };
  if (started) return <RailShell active="Findings" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Skill started</h1><p>{name} is running on {repo}.{publish === 'publish' ? ' It publishes to the Skills Library once it passes validation.' : publish === 'draft' ? ' A draft is in the Skills Library now, marked “Not yet validated”.' : ' Nothing is shared.'}</p></div></div>
    <section className="dash-card auth-side sk-started"><span className="auth-started-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
      <p>Nothing merges without repo-owner approval. You can pause or cancel from Remediations at any time.</p>
      <div className="rd-actions"><Button onClick={() => openEffort(onNavigate, `skill-${item.id}`)}>View in Remediations</Button><Button variant="outline" onClick={() => onNavigate('improved-findings')}>Back to Findings</Button></div></section>
  </RailShell>;
  return <RailShell active="Findings" onNavigate={onNavigate}>
    <nav className="rem-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('improved-findings')}>Findings</button><span>/</span><span>{item.title}</span><span>/</span><span>Review skill</span></nav>
    <div className="dash-title"><div><h1>Review specialized skill</h1><p>A specialized transformation skill is ready for this finding. Review it, run it, and publish it so other repositories can reuse it.</p></div></div>

    <section className="dash-card sk-intro">
      <div className="sk-intro-banner"><span className="initiatives-ai-mark"><AssistantMark size={16} /></span>
        <div><strong>A specialized transformation skill is ready</strong><p>Built from an analysis of {repo}. No managed TD covers {rows.length === 1 ? 'this finding' : 'these findings'}, so AWS Transform generated a skill for this repository and picked a recommended option for each decision. Use it as is, modify its decisions, or switch to a custom or managed TD.</p></div></div>
      <div className="sk-finding"><span className="sk-eyebrow">Finding · not yet remediated</span><strong>{item.title}</strong>
        <span className="auth-chips"><span className="mono">{repo}</span><span>Impact {itemSeverity(item).toLowerCase()}</span><span>Effort {item.effort}</span><span>{rows.length} finding{rows.length === 1 ? '' : 's'}</span>{draft.alsoCovered && <span>Also covered by {draft.alsoCovered}</span>}</span></div>
    </section>

    <section className="dash-card sk-card">
      <header><div><h2>Specialized transformation skill</h2><p>Prepared from your analysis on {detected}. Review each step, then run it, publish it, or both.</p></div><span className="sk-ready">Ready · requires review</span></header>
      <div className="sk-step"><span className="sk-num done">✓</span><div className="sk-step-body sk-analysis">
        <div className="sk-step-head"><strong>Analysis · {repo}</strong><span className="sk-done">Done</span><button type="button" className="dash-link" onClick={() => onNavigate('improved-rail-analyses')}>View analysis</button></div>
        <p>Analyzed <strong>{repo}</strong> on {detected}. No managed TD matched, so the specialized skill was derived from it.</p></div></div>
      <div className="sk-step"><span className="sk-num">2</span><div className="sk-step-body">
        <div className="sk-step-head"><strong>Transformation</strong><div className="rem-segmented sk-toggle">{[['skill', 'Specialized skill'], ['td', 'Managed or custom TD']].map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{label}</button>)}</div></div>
        {mode === 'skill' ? <>
          <div className="sk-skill-head"><span className="sk-skill-mark"><AssistantSpark /></span><div><strong>{name}</strong><small>Generated for {repo} from your analysis · covers {rows.length} of {rows.length} finding{rows.length === 1 ? '' : 's'} · 4 of 4 validations</small></div><button type="button" className="rem-small-button">Edit skill</button></div>
          <ul className="sk-rows">{sections.map(([label, value, detailText]) => <li key={label} className={open === label ? 'open' : ''}><button type="button" aria-expanded={open === label} onClick={() => setOpen(open === label ? null : label)}><span className="sk-chev">›</span><span className="sk-row-label">{label}</span><span className="sk-row-value">{value}</span><span className="sk-default">Default</span></button>{open === label && <p>{detailText}</p>}</li>)}</ul>
          <div className="sk-kv"><span>Decisions</span><span>{draft.decisions.join(' · ')}</span><em>Recommended</em></div>
          <div className="sk-kv"><span>Context</span><span>{context.trim() ? context : 'None added'}</span><button type="button" className="dash-link" onClick={() => setAddingContext(!addingContext)}>{addingContext ? 'Done' : context.trim() ? 'Edit context' : 'Add context'}</button></div>
          {addingContext && <textarea className="sk-context" rows={2} value={context} maxLength={600} onChange={(event) => setContext(event.target.value)} placeholder="e.g. Keep the existing snapshot tests. Don’t touch the payments module." aria-label="Additional context" />}
        </> : <div className="sk-td"><p>Use an existing transformation definition instead of the generated skill.</p>
          <h3>Recommended for {rows.length === 1 ? 'this finding' : 'these findings'}</h3>
          {recommendedTds.length ? <ul>{recommendedTds.map(tdOption)}</ul> : <p className="item-muted">No transformation definition matches these findings. Search the library below.</p>}
          <h3>Search all transformation definitions</h3>
          <label className="findings-search sk-td-search"><Icon name="search" /><input value={tdQuery} onChange={(event) => setTdQuery(event.target.value)} placeholder="Find by name or what it changes, e.g. logging, Java, IAM" aria-label="Search transformation definitions" />{tdQuery && <button type="button" onClick={() => setTdQuery('')} aria-label="Clear search">×</button>}</label>
          {tdQuery.trim() && (tdMatches.length ? <ul className="sk-td-results">{tdMatches.slice(0, 8).map(tdOption)}</ul> : <p className="item-muted">No transformation definitions match “{tdQuery.trim()}”.</p>)}
          {tdMatches.length > 8 && <p className="item-muted">Showing 8 of {tdMatches.length}. Refine the search to see more.</p>}
          <button type="button" className="dash-link" onClick={() => onNavigate('Skills Library')}>Browse all capabilities</button></div>}
      </div></div>
      {mode === 'td' ? <div className="sk-step"><span className="sk-num">3</span><div className="sk-step-body">
        <div className="sk-step-head"><strong>Review and run</strong></div>
        <p className="item-muted">{tdChoice ? <>Next, review what <span className="mono">{tdChoice}</span> changes in {initiativeRepos(item).length === 1 ? repo : `${initiativeRepos(item).length} repositories`}, then authorize the run.</> : 'Pick a transformation definition above to continue.'}</p>
        <div className="rd-actions"><Button onClick={useTd} disabled={!tdChoice}>Continue with this TD</Button><Button variant="outline" onClick={() => setMode('skill')}>Use the specialized skill</Button></div>
      </div></div> : <div className="sk-step"><span className="sk-num">3</span><div className="sk-step-body">
        <div className="sk-step-head"><strong>Run and publish</strong></div>
        <div className="sk-choices" role="radiogroup" aria-label="Run and publish">{[['publish', 'Run and publish', `Runs on ${repo}, then publishes to the Skills Library once it passes validation.`, 'Recommended'], ['draft', 'Run and publish a draft now', 'Visible in the Skills Library right away, marked “Not yet validated”.'], ['one-off', 'Run one-off', `Runs on ${repo} only. Nothing is shared.`]].map(([key, title, blurb, tag]) => <label key={key} className={`sk-choice ${publish === key ? 'selected' : ''}`}><input type="radio" name="publish" checked={publish === key} onChange={() => setPublish(key)} /><div><strong>{title}{tag && <span className="sk-tag">{tag}</span>}</strong><small>{blurb}</small></div></label>)}</div>
        {publish !== 'one-off' && <div className="sk-publish-fields"><label><span>Skill name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Available to</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}>{['This account', 'This organization', 'Only me'].map((option) => <option key={option}>{option}</option>)}</select></label>
          <p className="item-muted">Publishes the skill definition, your decisions and context as defaults, and validation rules. No code from {repo}.</p></div>}
        <div className="rd-actions"><Button onClick={start}>{publish === 'one-off' ? 'Run skill' : 'Run, then publish'}</Button><Button variant="outline" className="purple-outline" onClick={() => askRailChat(`Walk me through the specialized skill for ${item.title}`)}><AssistantSpark /> Walk me through it</Button></div>
      </div></div>}
    </section>
  </RailShell>;
}

// ─── Authorize a remediation (opened from a finding or item whose path is a TD) ───
let pendingAuthorize = null;
const openAuthorize = (onNavigate, itemId) => { pendingAuthorize = itemId; onNavigate('improved-rail-authorize'); };
// What "now" and "done" look like for each item, in the words the detector uses.
const ITEM_TARGETS = {
  java: ['Java 11, Spring Boot 2.7, AWS SDK for Java v1 and Log4j 1.x detected', 'Java 21, Spring Boot 3, AWS SDK for Java v2 and SLF4J'],
  'base-images': ['amazonlinux:2 base images with known CVEs', 'Amazon Linux 2023 base images with no known OS-package CVEs'],
  tls: ['TLS 1.0 and 1.1 accepted', 'TLS 1.2 minimum on the internal load balancer'],
  'verbose-errors': ['Stack traces returned to clients', 'Generic error responses only'],
  'health-check': ['No health check endpoint', 'Health endpoint wired to the target group'],
  'console-logging': ['console.log calls in the production build', 'No console calls in the production build'],
};
const POLICY_DAYS = { Critical: 30, High: 60, Medium: 90, Low: 180 };
const addDays = (text, days) => { const date = new Date(`${text} 12:00`); date.setDate(date.getDate() + days); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const EFFORT_DAYS = { 'Under 1 day': 1, '1–2 days': 2, '3–5 days': 5, '1 week': 7, '1–2 weeks': 14, '2–3 weeks': 21, '2–4 weeks': 28 };

function RailAuthorize({ onNavigate }) {
  const [itemId] = useState(() => pendingAuthorize || 'base-images');
  const item = INITIATIVES.find((entry) => entry.id === itemId) || INITIATIVES[0];
  const rows = findingsOfInitiative(item);
  const repos = initiativeRepos(item);
  const repo = repos[0];
  const severity = itemSeverity(item);
  const recommended = itemTds(item);
  const [override, setOverride] = useState(() => (pathOverrides[item.id]?.kind === 'td' ? pathOverrides[item.id] : null));
  const [menuOpen, setMenuOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const changeRef = useRef(null);
  const steps = override ? [[override.id, override.id, override.id.startsWith('AWS/') ? 'managed' : 'custom']] : recommended;
  const kindWord = (kind) => (kind === 'managed' ? 'Managed TD' : 'Custom TD');
  const tdName = steps.length === 1 ? steps[0][1] : `${steps.length} TDs, run in order`;
  const [now, done] = ITEM_TARGETS[item.id] || [`${rows[0]?.title} detected`, `No ${rows[0]?.title.charAt(0).toLowerCase()}${rows[0]?.title.slice(1)}`];
  const files = new Set(rows.flatMap((finding) => finding.files || [])).size + rows.length + 1;
  const detected = rows[0]?.detected?.replace(', 2026', '') || 'Aug 25';
  const policyDays = POLICY_DAYS[severity];
  const resolveBy = item.due || addDays(`${detected}, 2026`, policyDays);
  const forecast = addDays('Oct 13, 2026', EFFORT_DAYS[item.effort] || 7);
  const checks = Math.min(6, 3 + steps.length);
  const exposure = exposureOf(repos);
  const kindChip = isStandalone(item) ? 'Direct remediation' : item.kind;
  const choose = (value) => { setOverride(value); setMenuOpen(false); if (value) pathOverrides[item.id] = value; else delete pathOverrides[item.id]; };
  const authorize = () => {
    EFFORTS.unshift({ id: `auth-${item.id}`, state: 'progress', type: 'Direct', title: item.title, line1: isStandalone(item) ? `Finding: ${rows[0]?.title}` : `Initiative: ${item.title}`, repo, findings: rows.length,
      progress: { label: 'Generating the change', pct: 0.05, sub: `Resolve by ${resolveBy}` }, attention: { label: 'No action needed', sub: 'CM opens the PR after validation' }, verification: [['pending', 'Verification pending']], action: 'Details' });
    item.stage = 'progress'; item.readiness = 'applying'; item.verified = `0 of ${rows.length} verified`;
    rows.forEach((finding) => { finding.status = 'In remediation'; });
    setStarted(true);
  };
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => { if (!event.target.closest?.('.auth-td-menu') && !event.target.closest?.('.auth-change')) setMenuOpen(false); };
    const onKey = (event) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const registry = CUSTOM_TDS.filter((row) => row[4]).slice(0, 3).map(([, title, version]) => [`Custom/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, `${title} ${version}`]);
  const option = (key, title, sub, value) => { const selected = value === null ? !override : override?.id === value.id; return <button key={key} type="button" role="menuitemradio" aria-checked={selected} className={selected ? 'selected' : ''} onClick={() => choose(value)}><span><strong>{title}</strong><small>{sub}</small></span>{selected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}</button>; };

  return <RailShell active="Findings" onNavigate={onNavigate}>
    <nav className="rem-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('improved-findings')}>Findings</button><span>/</span><span>{item.title}</span><span>/</span><span>Authorize</span></nav>
    <div className="dash-title auth-title"><div><h1>Remediate <span className="mono">{repo}</span></h1>
      <p>Bring {repo} to <strong>{/^[A-Z][a-z]/.test(done) && !/^(Java|Amazon|TLS|Health|Generic|No) /.test(done) ? done.charAt(0).toLowerCase() + done.slice(1) : done}</strong>, using {tdName}. CM calls this resolved only when the original {item.detectedBy?.toLowerCase() || 'analysis'} rule confirms it at the merge commit.</p>
      <div className="auth-chips"><span>{kindChip}</span><span>{severity}{exposure ? ` · ${exposure}` : ''}</span><span>Repository owner · {REPO_CONTEXT[repo]?.service}</span><span>{steps.length === 1 ? kindWord(steps[0][2]) : 'Managed TDs'}</span></div></div></div>

    <div className="auth-grid">
      <div className="auth-main">
        <section className="dash-card auth-card"><h2>What changes, and what counts as done</h2>
          <div className="auth-states">
            <div><small>Now</small><strong className="auth-now">{now}</strong><span>{rows.length} finding{rows.length === 1 ? '' : 's'} · about {files} files expected to change in {repo}</span></div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
            <div><small>Done when</small><strong className="auth-done">{done}</strong><span>The original {item.detectedBy?.toLowerCase() || 'analysis'} rule confirms it at the merge commit</span></div>
          </div>
          {rows.length > 1 && <ul className="auth-findings">{rows.map((finding) => <li key={finding.id}><i style={{ background: SEVERITY_DOT[finding.severity] }} aria-label={finding.severity} />{finding.title}<span className="item-muted">{finding.severity}</span></li>)}</ul>}
        </section>
        <section className="dash-card auth-card"><header className="auth-card-head"><h2>Transformation</h2>
          <span className="auth-change-wrap"><button ref={changeRef} type="button" className="rem-small-button auth-change" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Change TD</button>
            {menuOpen && <div className="path-menu auth-td-menu" role="menu" aria-label="Choose a transformation definition" style={(() => { const rect = changeRef.current?.getBoundingClientRect(); return rect ? { top: rect.bottom + 6, left: Math.max(8, rect.right - 330) } : {}; })()}>
              <p className="path-menu-head">Transformation definition</p>
              {option('rec', `Recommended · ${recommended.length === 1 ? recommended[0][1] : `${recommended.length} TDs in order`}`, recommended.map(([label]) => label).join(' → '), null)}
              {(PATH_ALTERNATIVES[item.id] || []).length > 0 && <p className="path-menu-group">Other transformation definitions</p>}
              {(PATH_ALTERNATIVES[item.id] || []).map((id) => option(id, id, id.startsWith('AWS/') ? 'AWS-managed TD' : 'Custom TD', { kind: 'td', id }))}
              <p className="path-menu-group">Your custom TDs</p>
              {registry.map(([id, title]) => option(id, title, id, { kind: 'td', id }))}
            </div>}</span></header>
          <ol className="auth-steps">{steps.map(([label, id, kind], index) => <li key={id}>{steps.length > 1 && <span className="auth-step-n">{index + 1}</span>}<div><strong className="mono">{id}</strong><small>{kindWord(kind)} · {kind === 'managed' ? 'AWS-managed, org approved' : 'From your registry'}{label !== id ? ` · ${label}` : ''}</small></div><span className="auth-validations"><strong>{checks} of {checks} validations</strong><small>available for this repo</small></span></li>)}</ol>
          <p className="auth-why"><strong>Why {steps.length > 1 ? 'these TDs' : 'this TD'}:</strong> {override ? `You chose ${override.id} instead of the recommended ${recommended.map(([, id]) => id).join(', ')}.` : steps.length > 1 ? `Each step is an org-approved transformation matched to findings in ${repo}; they run in order because later steps depend on earlier ones.` : `Org-approved transformation matched to ${rows[0]?.title.toLowerCase()} in ${repo}, with ${checks} of ${checks} validations available.`}{override && <> <button type="button" className="dash-link" onClick={() => choose(null)}>Use recommended</button></>}</p>
        </section>
      </div>

      <aside className="dash-card auth-side">
        {started ? <div className="auth-started">
          <span className="auth-started-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
          <h2>Remediation started</h2><p>CM is generating the change for {repo}. It opens a pull request after validation; nothing merges without repo-owner approval.</p>
          <Button onClick={() => openEffort(onNavigate, `auth-${item.id}`)}>View in Remediations</Button><button type="button" className="dash-link" onClick={() => onNavigate('improved-findings')}>Back to Findings</button>
        </div> : <>
          <small className="auth-eyebrow">You are authorizing</small>
          <h2>{done} on {repo}</h2>
          <dl className="auth-kv">{[['Using', tdName], ['Scope', `${repo} · 1 repo · ~${files} files`], ['Next action', 'CM generates and validates the change'], ['Verified by', `Original ${item.detectedBy?.toLowerCase() || 'analysis'} rule, re-run at the merge commit`], ['Starts', 'Now'], ['Resolve by', <><strong>{resolveBy}</strong> · {item.due ? 'deadline on this item' : `org policy: ${severity.toLowerCase()} findings resolved within ${policyDays} days of detection`}</>]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          <h3>Pre-flight</h3>
          <ul className="auth-preflight">{[`Owner known · ${REPO_CONTEXT[repo]?.service}`, `${steps.length === 1 ? kindWord(steps[0][2]) : 'Managed TDs'} available`, `Validation ${checks} / ${checks}`, 'No shared blocker', `Deadline · forecast ${forecast}`].map((label) => <li key={label}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{label}</li>)}</ul>
          <Button className="auth-primary" onClick={authorize}>Authorize and start</Button>
          <p className="auth-note">Nothing merges without repo-owner approval. You can pause or cancel from Remediations at any time.</p>
          <div className="auth-links"><button type="button" className="dash-link" onClick={() => setSaved(true)}>{saved ? 'Draft saved' : 'Save draft'}</button><button type="button" className="dash-link" onClick={() => askRailChat(`Walk me through remediating ${item.title} in ${repo}`)}>Walk me through it</button></div>
        </>}
      </aside>
    </div>
  </RailShell>;
}

// ─── Analyses ───
const RAIL_RUNS = [
  { id: 'rapid-ui', name: 'Rapid tech-debt analysis · payments-ui', type: 'Tech debt (quick)', detail: 'AWS-managed (remote) · {n} · +4 earlier runs today', scope: R.ui, repos: [R.ui], startedFrom: 'CLI', date: 'Just now', status: 'completed', progress: 1, findings: 6, by: 'Nithin', duration: '3m 08s', mode: 'Ad hoc', action: 'View details' },
  { id: 'angular-react', name: 'AngularJS → React migration analysis', type: 'Modernization readiness', detail: 'Analyzing component boundaries · {n} so far', scope: R.ui, repos: [R.ui], startedFrom: 'CLI', date: 'Aug 27, 2026 · 10:42 AM', status: 'running', progress: 0.62, findings: 8, by: 'Nithin', mode: 'Ad hoc', action: 'Open in CLI' },
  { id: 'commerce-agentic', name: 'Commerce agentic readiness', type: 'Agentic readiness', detail: '2 of 3 repositories active · {n} so far', scope: '3 repositories', repos: [R.node, R.payments, R.catalog], startedFrom: 'CLI', date: 'Aug 27, 2026 · 9:18 AM', status: 'running', progress: 0.38, findings: 4, by: 'Marcus Lee', mode: 'Ad hoc', action: 'Open in CLI' },
  { id: 'weekly-baseline', name: 'Weekly portfolio baseline', type: 'Tech debt (comprehensive)', detail: 'Synthesizing findings · {n} so far · about 4 minutes left', scope: '5 repositories', repos: [R.payments, R.node, R.ui, R.catalog, R.learning], startedFrom: 'Web', date: 'Aug 27, 2026 · 8:53 AM', status: 'running', progress: 0.74, findings: 12, by: 'Weekly schedule', mode: 'Continuous · weekly on Mondays', action: 'View details' },
  { id: 'mkp-security', name: 'MKPMobile security review', type: 'Security', detail: 'Waiting for an analysis worker', scope: R.mobile, repos: [R.mobile], startedFrom: 'Web', date: 'Aug 27, 2026 · 11:03 AM', status: 'queued', progress: 0, findings: 0, by: 'Dana Whitfield', mode: 'Ad hoc', action: 'View details' },
  { id: 'legacy-inventory', name: 'Legacy repository inventory', type: 'Modernization readiness', detail: 'Repository authentication failed for 2 repositories · {n} so far', scope: '12 repositories', repos: [R.node, R.payments, R.ui], startedFrom: 'CLI', date: 'Aug 26, 2026 · 4:17 PM', status: 'attention', progress: 0.47, findings: 9, by: 'Priya Raman', mode: 'Ad hoc', action: 'Fix access' },
  { id: 'node-quick', name: 'Node.js quick assessment', type: 'Tech debt (quick)', detail: 'Completed in 6m 12s · {n}', scope: R.node, repos: [R.node], startedFrom: 'CLI', date: 'Aug 25, 2026 · 2:08 PM', status: 'completed', progress: 1, findings: 10, by: 'Nithin', duration: '6m 12s', mode: 'Ad hoc', action: 'View details' },
  { id: 'portfolio-baseline', name: 'Portfolio baseline', type: 'Tech debt (comprehensive)', detail: 'Completed in 18m 42s · {n}', scope: '5 repositories', repos: [R.payments, R.node, R.ui, R.catalog, R.learning], startedFrom: 'Web', date: 'Aug 25, 2026 · 9:26 AM', status: 'completed', progress: 1, findings: 17, by: 'Priya Raman', duration: '18m 42s', mode: 'Continuous · weekly on Mondays', schedule: 'Weekly schedule', action: 'View details' },
];
// What each analysis type reports, so a run's findings are the open findings it would have produced.
const RUN_ANALYSES = { 'Tech debt (comprehensive)': ['Tech debt (comprehensive)', 'Tech debt (quick)'], 'Tech debt (quick)': ['Tech debt (quick)'], Security: ['Security'], 'Modernization readiness': ['Modernization readiness'], 'Agentic readiness': ['Agentic readiness', 'Security'] };
// The CLI quick scan on payments-ui also produced findings that aren't in the estate list yet (see "New findings from CLI analyses").
const RAPID_EXTRA = [['AngularJS 1.7 is end-of-life — unsupported since Jan 2022', 'High', 'Framework upgrades', 'AngularJS → React'], ['Node 16 / Webpack 4 build toolchain is outdated', 'Medium', 'Build tooling', 'Node.js 16 → 20'], ['3 circular dependencies in routing', 'Medium', 'Architecture', null], ['Limited test coverage on critical payment paths', 'Medium', 'Testing', null]]
  .map(([title, severity, category, remediation], index) => ({ id: `rapid-${index}`, title, severity, category, remediation, repo: R.ui, analysis: 'Tech debt (quick)', order: 900 + index }));
function runFindingsOf(run) {
  const types = RUN_ANALYSES[run.type];
  const all = [...ESTATE_FINDINGS.filter((item) => run.repos.includes(item.repo) && (!types || types.includes(item.analysis))), ...(run.id === 'rapid-ui' ? RAPID_EXTRA : [])]
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.order - b.order);
  if (run.status === 'completed') return all;
  if (run.status === 'queued' || run.status === 'scheduled') return [];
  return all.slice(0, Math.ceil(all.length * run.progress));
}
const runDetail = (run) => { const n = runFindingsOf(run).length; return String(run.detail).replace('{n}', `${n} finding${n === 1 ? '' : 's'}`); };
const RUN_STATUS = { running: ['Running', 'running'], queued: ['Queued', 'queued'], attention: ['Needs attention', 'attention'], completed: ['Completed', 'completed'], scheduled: ['Scheduled', 'queued'] };
// The table shows the latest 8; totals include older runs and grouped repeats.
const RUN_TOTALS = { all: 29, progress: 4, attention: 1, completed: 24 };
const RUN_TABS = [['all', 'All'], ['progress', 'In progress'], ['attention', 'Needs attention'], ['completed', 'Completed']];
const railRunStore = { runs: null };
let pendingRun = null;
const openRun = (onNavigate, id) => { pendingRun = id; onNavigate('improved-rail-analysis'); };
const CLI_FINDINGS = [['AngularJS 1.7 is end-of-life — unsupported since Jan 2022', 'High'], ['Node 16 / Webpack 4 build toolchain is outdated', 'Medium'], ['3 circular dependencies in routing', 'Medium'], ['Limited test coverage on critical payment paths', 'Medium']];

function RunStatus({ status }) {
  const [label, tone] = RUN_STATUS[status];
  const icon = { completed: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>, running: <circle cx="12" cy="12" r="8.5" strokeDasharray="2.5 3" />, queued: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, attention: <><path d="M12 4 3 19.5h18Z" /><path d="M12 10v4M12 16.8v.2" /></> }[tone === 'queued' ? 'queued' : tone];
  return <span className={`run-status ${tone}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>{label}</span>;
}

function RailAnalyses({ onNavigate }) {
  const [runs, setRuns] = useState(() => railRunStore.runs || RAIL_RUNS);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('All');
  useEffect(() => { railRunStore.runs = runs; }, [runs]);
  // Running analyses keep advancing so the page reads as live work.
  useEffect(() => {
    const timer = window.setInterval(() => setRuns((list) => list.map((run) => (run.status === 'running' ? { ...run, progress: Math.min(0.99, run.progress + 0.01) } : run))), 4000);
    return () => window.clearInterval(timer);
  }, []);
  const inTab = (run) => tab === 'all' || (tab === 'progress' ? ['running', 'queued'].includes(run.status) : run.status === tab);
  const shown = runs.filter((run) => inTab(run) && (origin === 'All' || run.startedFrom === origin) && (!query || `${run.name} ${run.type} ${run.scope} ${runDetail(run)}`.toLowerCase().includes(query.toLowerCase())));
  const extra = runs.length - RAIL_RUNS.length;
  const totals = { all: RUN_TOTALS.all + extra, progress: RUN_TOTALS.progress + runs.filter((run) => run.id.startsWith('run-new') && ['running', 'queued'].includes(run.status)).length, attention: RUN_TOTALS.attention, completed: RUN_TOTALS.completed };
  const act = (run) => (run.action === 'Open in CLI' ? undefined : openRun(onNavigate, run.id));
  return <RailShell active="Analyses" onNavigate={onNavigate}>
    <div className="dash-title"><div><h1>Analyses</h1><p>Monitor analysis work across the web application and AWS Transform CLI.</p></div><div className="dash-title-actions"><Button variant="outline" onClick={() => onNavigate('improved-rail-run-analysis')}><Icon name="schedule" /> Schedule new analysis</Button><Button onClick={() => onNavigate('improved-rail-run-analysis')}>Run new analysis</Button></div></div>
    <div className="dash-stats an-stats">
      <section className="dash-card dash-stat"><span>Running</span><strong>{runs.filter((run) => run.status === 'running').length}</strong><small>Across 9 repositories</small></section>
      <section className="dash-card dash-stat"><span>Queued</span><strong>{runs.filter((run) => run.status === 'queued').length}</strong><small>Waiting for capacity</small></section>
      <section className="dash-card dash-stat"><span>Needs attention</span><strong>{runs.filter((run) => run.status === 'attention').length}</strong><small>Repository access issue</small></section>
      <section className="dash-card dash-stat"><span>Completed</span><strong>{totals.completed}</strong><small>7 completed this month</small></section>
    </div>
    <section className="dash-card items-card an-card">
      <div className="items-toolbar an-toolbar"><label className="findings-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find analyses" aria-label="Find analyses" /></label>
        <label className="items-select"><span className="sr-only">Started from</span><select value={origin} onChange={(event) => setOrigin(event.target.value)}>{['All', 'CLI', 'Web'].map((value) => <option key={value} value={value}>Started from: {value}</option>)}</select></label>
        <span className="items-count">{shown.length} analyses</span></div>
      <div className="an-tabs" role="tablist">{RUN_TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label} ({totals[key]})</button>)}</div>
      <div className="estate-findings-table-wrap"><table className="items-table an-table">
        <colgroup><col style={{ width: '31%' }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: 150 }} /></colgroup>
        <thead><tr><th>Analysis</th><th>Repository / scope</th><th>Started from</th><th>Status</th><th>Progress</th><th>Action</th></tr></thead>
        <tbody>{shown.map((run) => <tr key={run.id} className="an-row" onClick={() => openRun(onNavigate, run.id)}>
          <td><button type="button" className="an-name" onClick={(event) => { event.stopPropagation(); openRun(onNavigate, run.id); }}>{run.name}</button><small>{run.type} · {runDetail(run)}</small></td>
          <td className="an-scope" title={run.repos.join(', ')}>{run.scope}</td>
          <td><span className={`an-origin ${run.startedFrom.toLowerCase()}`}>{run.startedFrom}</span><small>{run.date}</small></td>
          <td><RunStatus status={run.status} /></td>
          <td><span className="an-progress"><span className="rem-bar"><i style={{ width: `${Math.round(run.progress * 100)}%` }} /></span><span>{Math.round(run.progress * 100)}%</span></span></td>
          <td><button type="button" className="an-action" onClick={(event) => { event.stopPropagation(); act(run); }}>{run.action}</button></td>
        </tr>)}</tbody>
      </table></div>
      {shown.length === 0 && <div className="findings-empty"><strong>No analyses match.</strong></div>}
      <div className="an-foot"><span>Showing {shown.length} of {totals[tab]} analyses · repeat runs of the same analysis are grouped</span><button type="button" className="dash-link">Load more</button></div>
    </section>
    <section className="dash-card an-cli">
      <header><div><h2>New findings from CLI analyses <span className="item-muted">({CLI_FINDINGS.length})</span></h2><p>Grouped automatically: 1 matched a known finding, 2 joined the AngularJS → React migration, and 1 started a new group.</p></div><Button variant="outline" onClick={() => onNavigate('improved-findings')}>View in Findings</Button></header>
      <table className="items-table"><thead><tr><th>Finding</th><th>Severity</th><th>Repository</th><th>Analysis</th></tr></thead>
        <tbody>{CLI_FINDINGS.map(([title, severity]) => <tr key={title}><td>{title}</td><td><span className={`breakdown-severity ${severity.toLowerCase()}`}>{severity}</span></td><td>{R.ui}</td><td>Rapid tech-debt analysis</td></tr>)}</tbody></table>
    </section>
  </RailShell>;
}

// ─── analysis detail ───
const BASELINE_REPOS = [[R.payments, 'cf016f2', [1, 3, 1, 1], '6m 05s'], [R.node, '8a21d4e', [1, 2, 2, 0], '4m 48s'], [R.ui, '41bb0c9', [0, 1, 2, 0], '3m 12s'], [R.catalog, 'e77f3a1', [0, 0, 2, 0], '2m 31s'], [R.learning, '0c9d5be', [0, 0, 0, 1], '2m 06s']];
const RUN_ARTIFACTS = [['HTML', 'Summary report', 'report.html', '84 KB'], ['CSV', 'Findings', 'findings.csv', '12 KB'], ['SARIF', 'Findings for code scanning', 'findings.sarif', '41 KB'], ['JSON', 'Repository inventory', 'inventory.json', '28 KB'], ['JSON', 'Dependency graph', 'dependency-graph.json', '156 KB'], ['LOG', 'Analysis log', 'analysis.log', '9 KB']];
const sevSummary = (counts) => ['critical', 'high', 'medium', 'low'].map((label, index) => counts[index] && `${counts[index]} ${label}`).filter(Boolean);

function RailAnalysisDetail({ onNavigate }) {
  const [tab, setTab] = useState('overview');
  const runs = railRunStore.runs || RAIL_RUNS;
  const run = runs.find((item) => item.id === (pendingRun || 'portfolio-baseline')) || RAIL_RUNS[RAIL_RUNS.length - 1];
  const baseline = run.id === 'portfolio-baseline';
  // One list drives every number on the page.
  const runFindings = runFindingsOf(run);
  const sha = Object.fromEntries(BASELINE_REPOS.map(([repo, commit, , duration]) => [repo, [commit, duration]]));
  const repoRows = run.repos.map((repo, index) => { const rows = runFindings.filter((item) => item.repo === repo); return [repo, sha[repo]?.[0] || ['a41c9e2', '77d0b1f', '3e5f912', 'c08aa4d', '91be3c0'][index % 5], SEVERITY_ORDER.map((level) => rows.filter((item) => item.severity === level).length), run.status === 'completed' ? (baseline && sha[repo]?.[1]) || `${3 + index}m ${10 + index * 7}s` : '—']; });
  const counts = SEVERITY_ORDER.map((level) => runFindings.filter((item) => item.severity === level).length);
  const total = runFindings.length;
  const top = runFindings.slice(0, 5);
  const tdLine = (item) => (item.remediation ? `${TD_CATALOG[item.remediation]?.[1] === 'custom' ? 'Custom TD' : 'Managed TD'} · ${TD_CATALOG[item.remediation]?.[0] || item.remediation}` : 'Specialized skill');
  const done = run.status === 'completed';
  const stages = (index) => (done ? 5 : run.status === 'queued' ? 0 : Math.min(5, Math.max(1, Math.round(run.progress * 5) - (index % 2))));
  const download = ([, , file]) => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`${run.name}\n${file}\n`], { type: 'text/plain' })); link.download = file; link.click(); };
  const activity = [['9:26 AM', `Started by ${run.by}${run.schedule ? ' · weekly schedule' : ''}`], ['9:27 AM', `Inventory discovered ${run.repos.length} repositor${run.repos.length === 1 ? 'y' : 'ies'} · 214k lines of code`], ['9:31 AM', 'Detectors running: dependency analysis, runtime and framework versions'], ['9:41 AM', `${total} findings generated · 3 new since the last run`], ['9:45 AM', done ? 'Completed · results published to Findings' : 'In progress'], ['9:46 AM', 'Findings grouped into initiatives']];
  return <RailShell active="Analyses" onNavigate={onNavigate}>
    <nav className="rem-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('improved-rail-analyses')}>Analyses</button><span>›</span><span>{run.name}</span></nav>
    <div className="dash-title"><div><h1 className="an-detail-title">{run.name} <RunStatus status={run.status} /></h1>
      <p className="an-meta">{run.schedule && <><Icon name="schedule" /> {run.schedule} · </>}{run.type} · {run.repos.length} repositor{run.repos.length === 1 ? 'y' : 'ies'} · {baseline ? 'Aug 25, 9:26 → 9:45 AM' : run.date} · {run.by}</p></div>
      <div className="dash-title-actions"><Button variant="outline" onClick={() => onNavigate('improved-rail-run-analysis')}>Run again</Button><Button disabled={total === 0} onClick={() => onNavigate('improved-findings')}>{total === 0 ? 'No findings yet' : `View ${total} finding${total === 1 ? '' : 's'}`}</Button></div></div>
    <div className="an-detail-tabs" role="tablist">{[['overview', 'Overview'], ['findings', 'Findings', total], ['artifacts', 'Artifacts', RUN_ARTIFACTS.length], ['activity', 'Activity']].map(([key, label, n]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}{n !== undefined && <span>{n}</span>}</button>)}</div>

    {tab === 'overview' && <>
      <section className="dash-card an-strip">
        <div><span>Findings</span><strong>{total}</strong><i className="an-sevbar">{counts.map((n, index) => n > 0 && <b key={index} style={{ flex: n, background: SEVERITY_DOT[SEVERITY_ORDER[index]] }} />)}</i><small>{sevSummary(counts).join(' · ')}</small></div>
        <div><span>New since last run</span><strong>3</strong><small>2 resolved since Aug 18</small></div>
        <div><span>Repositories</span><strong>{run.repos.length}</strong><small>214k lines of code</small></div>
        <div><span>Duration</span><strong>{run.duration || '—'}</strong><small>Typical: 15–20 min</small></div>
      </section>
      <div className="rem-detail-grid an-detail-grid">
        <div className="rem-detail-main">
          <section className="dash-card an-repos"><h2>Repositories</h2>
            <table className="items-table"><thead><tr><th>Repository</th><th>Stages</th><th>Findings</th><th>Duration</th></tr></thead>
              <tbody>{repoRows.map(([repo, sha, c, duration], index) => { const n = c.reduce((a, b) => a + b, 0); const st = stages(index); return <tr key={repo}><td><strong>{repo}</strong><small className="item-muted mono">main @ {sha}</small></td><td><span className={`an-stage ${st === 5 ? 'done' : ''}`}>{st === 5 ? '✓' : '◌'} {st} of 5 stages</span></td><td>{n} finding{n === 1 ? '' : 's'}<small className="item-muted">{sevSummary(c).slice(0, 2).join(' · ') || '—'}</small></td><td>{duration}</td></tr>; })}</tbody></table>
          </section>
          <section className="dash-card an-top"><header><h2>Top findings</h2>{total > 5 && <button type="button" className="dash-link" onClick={() => setTab('findings')}>View all {total}</button>}</header>
            <ul>{top.filter(Boolean).map((item) => <li key={item.id}><i style={{ background: SEVERITY_DOT[item.severity] }} aria-hidden="true" /><div><strong>{item.title}</strong><small>{item.repo} · {tdLine(item)}</small></div><span>{item.severity}</span></li>)}</ul>
          </section>
        </div>
        <aside className="rem-detail-side">
          <section className="dash-card rem-glance an-about"><h2>About this analysis</h2><dl>{[['Analysis type', run.type], ['Engine', <>AWS Transform<small>{run.type.startsWith('Tech debt (comp') ? 'Comprehensive rules' : 'Managed rules'} · v2026.08</small></>], ['Mode', run.mode], ['Provenance', run.startedFrom === 'CLI' ? 'Started from the AWS Transform CLI' : 'Managed (platform-governed)'], ['Analysis ID', <span className="mono">01M47MJ3FTPWPWEG531S07GWRE</span>], ['Run', baseline ? 'Aug 25, 9:26 AM → 9:45 AM' : run.date], ...(run.context ? [['Additional context', run.context]] : [])].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
          <section className="dash-card an-artifacts"><header><h2>Reports and artifacts</h2><button type="button" className="dash-link" onClick={() => setTab('artifacts')}>View all {RUN_ARTIFACTS.length}</button></header>
            <ul>{RUN_ARTIFACTS.slice(0, 3).map((artifact) => <li key={artifact[2]}><button type="button" onClick={() => download(artifact)}><span className="an-filetype">{artifact[0]}</span><span><strong>{artifact[1]}</strong><small>{artifact[2]}</small></span><span className="item-muted">{artifact[3]}</span></button></li>)}</ul></section>
        </aside>
      </div>
    </>}
    {tab === 'findings' && <section className="dash-card items-card"><table className="items-table an-findings"><thead><tr><th>Finding</th><th>Repository</th><th>Severity</th><th>Remediation</th></tr></thead>
      <tbody>{runFindings.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small className="item-muted">{item.category}</small></td><td>{item.repo}</td><td><span className={`breakdown-severity ${item.severity.toLowerCase()}`}>{item.severity}</span></td><td className="item-muted">{tdLine(item)}</td></tr>)}</tbody></table></section>}
    {tab === 'artifacts' && <section className="dash-card an-artifacts full"><ul>{RUN_ARTIFACTS.map((artifact) => <li key={artifact[2]}><button type="button" onClick={() => download(artifact)}><span className="an-filetype">{artifact[0]}</span><span><strong>{artifact[1]}</strong><small>{artifact[2]}</small></span><span className="item-muted">{artifact[3]} · Download</span></button></li>)}</ul></section>}
    {tab === 'activity' && <section className="dash-card an-activity"><ol>{activity.map(([time, text]) => <li key={time + text}><span className="mono">{time}</span><span>{text}</span></li>)}</ol></section>}
  </RailShell>;
}

// ─── Run new analysis ───
const RUN_PROFILES = [
  ['Tech debt (quick)', 'Tech debt (quick scan)', 'Fast AST sweep for framework versions, runtime deprecations and end-of-life packages.', 8],
  ['Tech debt (comprehensive)', 'Tech debt (comprehensive)', 'Coupling graph, transitive divergence and remediation feasibility.', 34],
  ['Agentic readiness', 'Agentic modernization', 'Scores which findings can be fixed by agent-authored PRs behind automated test gates.', 50],
  ['Modernization readiness', 'Modernization & migration', 'Runtime and framework upgrade paths: Java 11 to 21, Node 16 to 20, Spring Boot 3.', 42],
  ['Security', 'Security & compliance', 'Vulnerable dependencies, credential heuristics and policy drift.', 23],
  ['Custom', 'Custom capability', 'Run your own custom TDs or detection rules against the estate.', 26],
];
const CUSTOM_TDS = [
  ['logging', 'Acme Logging Standard', 'v2', 'Log format and field rules · Platform team', true, 6],
  ['httpclient', 'Acme HttpClient Migration', 'v1', 'HttpClient 3.x to the internal client · Platform team', true, 9],
  ['flagkit', 'Flagkit to OpenFeature', 'v1', 'Replaces the Flagkit SDK · Drafted by CM', true, 7],
  ['jdk', 'Acme JDK Baseline', 'v3', 'Org JVM flags and base images · Platform team', true, 5],
  ['secrets', 'Acme Secrets Hygiene', 'v2', 'Config-file credentials and vault references · Security', true, 4],
  ['otel', 'Acme Observability Baseline', 'v1', 'OpenTelemetry tracing and log correlation · Platform team', true, 8],
  ['endpoints', 'Retired Internal Endpoints', 'v4', 'Calls to decommissioned service endpoints', false, 3],
  ['license', 'License Policy Check', 'v2', 'Copyleft and unapproved licenses', false, 4],
];
const RUN_REPOS = [
  [R.node, 'Node.js', 'Today', 'Completed', 17], [R.payments, 'Java', 'Aug 26', 'Completed', 14], [R.catalog, 'Java', 'Today', 'Needs review', 43],
  [R.ui, 'AngularJS', 'Yesterday', 'Failed', null], [R.mobile, 'React Native', 'Aug 26', 'Completed', 6], [R.learning, 'React', 'Aug 24', 'Completed', 5],
  ['orders-infrastructure', 'Terraform', null, null, null], ['legacy-batch-jobs', 'Java', null, null, null],
];

function RailRunAnalysis({ onNavigate }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState('Custom');
  const [tdTab, setTdTab] = useState('td');
  const [td, setTd] = useState('logging');
  const [tdQuery, setTdQuery] = useState('');
  const [picked, setPicked] = useState(() => new Set([R.node, R.payments, R.ui]));
  const [repoQuery, setRepoQuery] = useState('');
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('once');
  const [interval, setInterval_] = useState('weekly');
  const [days, setDays] = useState(() => new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']));
  const [time, setTime] = useState('02:00');
  const [monthDay, setMonthDay] = useState('1');
  const [cron, setCron] = useState('0 2 * * 1-5');
  const [infra, setInfra] = useState('managed');
  const [context, setContext] = useState('');
  const [saved, setSaved] = useState(false);
  const chosen = RUN_PROFILES.find(([key]) => key === profile);
  const tdRow = CUSTOM_TDS.find(([key]) => key === td);
  const minutes = profile === 'Custom' ? tdRow?.[5] ?? chosen[3] : chosen[3];
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayList = WEEK.filter((day) => days.has(day));
  const [hh, mm] = time.split(':');
  const cronExpr = { daily: `${mm} ${hh} * * *`, weekly: `${mm} ${hh} * * ${dayList.map((day) => (WEEK.indexOf(day) + 1) % 7).join(',') || '*'}`, monthly: `${mm} ${hh} ${monthDay} * *`, cron, estate: null }[interval];
  const schedule = { daily: `Every day at ${time} UTC`, weekly: `${dayList.join(', ') || 'No days'} at ${time} UTC`, monthly: `Day ${monthDay} of each month at ${time} UTC`, cron: `Cron ${cron}`, estate: 'On every estate change' }[interval];
  const today = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
  const objective = profile === 'Custom' ? `Custom capability / ${tdRow?.[1]} ${tdRow?.[2]}` : chosen[1];
  const defaultName = `${profile === 'Custom' ? `Custom capability: ${tdRow?.[1]}` : chosen[1]} · ${today}`;
  const infraLabel = infra === 'managed' ? 'AWS-managed' : 'customer-owned';
  const tds = CUSTOM_TDS.filter(([, title, , blurb, remediates]) => (tdTab === 'td' ? remediates : !remediates) && (!tdQuery || `${title} ${blurb}`.toLowerCase().includes(tdQuery.toLowerCase())));
  const repos = RUN_REPOS.filter(([repo]) => !repoQuery || repo.toLowerCase().includes(repoQuery.toLowerCase()));
  const togglePick = (repo) => setPicked((set) => { const next = new Set(set); if (next.has(repo)) next.delete(repo); else next.add(repo); return next; });
  const start = () => {
    const repos = [...picked];
    const run = { id: `run-new-${Date.now()}`, name: name || defaultName, type: profile === 'Custom' ? 'Custom capability' : profile, detail: cadence === 'once' ? `Initializing${context.trim() ? ' · with additional context' : ''}` : `Scheduled · ${schedule}`,
      scope: repos.length === 1 ? repos[0] : `${repos.length} repositories`, repos, startedFrom: 'Web', date: 'Just now', status: cadence === 'once' ? 'running' : 'scheduled', progress: cadence === 'once' ? 0.03 : 0, findings: 0,
      by: 'Nithin', mode: cadence === 'once' ? 'Ad hoc' : `Continuous · ${schedule}`, schedule: cadence === 'once' ? null : 'Recurring schedule', action: 'View details', context: context.trim() || null };
    railRunStore.runs = [run, ...(railRunStore.runs || RAIL_RUNS)];
    onNavigate('improved-rail-analyses');
  };
  const steps = ['Objective', 'Repositories', 'Run configuration'];
  const canContinue = step === 1 ? (profile !== 'Custom' || Boolean(tdRow)) : step === 2 ? picked.size > 0 : true;
  return <RailShell active="Analyses" onNavigate={onNavigate}>
    <nav className="rem-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('improved-rail-analyses')}>Analyses</button><span>/</span><span>New analysis</span></nav>
    <div className="dash-title"><div><h1>{cadence === 'recurring' ? 'Schedule new analysis' : 'Run new analysis'}</h1><p>{['Choose what to look for: an analysis profile or one of your own capabilities.', 'Choose where to look. Last result reflects each repo’s most recent analysis.', 'Name the run and choose where and how often it executes.'][step - 1]}</p></div>
      <ol className="run-steps" aria-label="Analysis setup steps">{steps.map((label, index) => <li key={label} className={index + 1 === step ? 'current' : index + 1 < step ? 'done' : ''}><button type="button" disabled={index + 1 > step} onClick={() => setStep(index + 1)} aria-current={index + 1 === step ? 'step' : undefined}><span>{index + 1 < step ? '✓' : index + 1}</span>{label}</button></li>)}</ol></div>

    {step === 1 && <>
      <h2 className="run-section-title">Analysis profile</h2>
      <div className="run-profiles" role="radiogroup" aria-label="Analysis profile">{RUN_PROFILES.map(([key, title, blurb, mins]) => <label key={key} className={`dash-card run-profile ${profile === key ? 'selected' : ''}`}><input type="radio" name="profile" checked={profile === key} onChange={() => setProfile(key)} /><div><span className="run-profile-head"><strong>{title}</strong><small>~{mins} min</small></span><small>{blurb}</small></div></label>)}</div>
      {profile === 'Custom' && <section className="dash-card run-td">
        <header><div><h2>Choose a custom TD</h2><p>The TD’s detection rule runs as this analysis. Findings route to the TD for remediation, and the same rule verifies the fix after merge.</p></div><label className="findings-search"><Icon name="search" /><input value={tdQuery} onChange={(event) => setTdQuery(event.target.value)} placeholder="Search by name, owner or what it detects" aria-label="Search custom TDs" /></label></header>
        <div className="run-td-tabs"><div className="rem-segmented">{[['td', 'Custom TDs', CUSTOM_TDS.filter((row) => row[4]).length]].map(([key, label, n]) => <button key={key} type="button" aria-pressed={tdTab === key} className={tdTab === key ? 'active' : ''} onClick={() => setTdTab(key)}>{label}<small>{n}</small></button>)}</div><span className="item-muted">{CUSTOM_TDS.filter((row) => row[4]).length} in your registry</span></div>
        <ul className="run-td-list" role="radiogroup" aria-label="Custom TD">{tds.map(([key, title, version, blurb, remediates, mins]) => <li key={key}><label className={td === key ? 'selected' : ''}><input type="radio" name="td" checked={td === key} onChange={() => setTd(key)} /><div><strong>{title} <span className="item-muted">{version}</span></strong><small>{blurb}</small><small className="item-muted">{remediates ? 'Detects · remediates · verifies' : 'Detects only'}</small></div><span className="item-muted">{td === key ? 'Selected · ' : ''}~{mins} min</span></label></li>)}{tds.length === 0 && <li className="item-muted run-empty">No capabilities match.</li>}</ul>
        <div className="run-td-links"><button type="button" className="dash-link" onClick={() => onNavigate('Skills Library')}>Browse all capabilities</button><button type="button" className="dash-link" onClick={() => onNavigate('Skills Library')}>Create a capability</button></div>
      </section>}
      <section className="dash-card run-context">
        <header><div><h2>Additional context <span className="item-muted">optional</span></h2><p>Tell the analysis what matters for this run. It’s passed to the agent alongside {profile === 'Custom' ? tdRow?.[1] : chosen[1]} and saved with the results.</p></div></header>
        <textarea value={context} maxLength={1000} rows={3} onChange={(event) => setContext(event.target.value)} placeholder="e.g. We’re targeting Java 21 by Q1. Ignore the legacy-batch module. Payments services are the priority." aria-label="Additional context" />
        <div className="run-context-foot"><div className="run-context-chips">{[['Target versions', 'Target versions: Java 21, Spring Boot 3.3, Node.js 20.'], ['Exclude paths', 'Ignore generated code and these paths: '], ['Priorities', 'Prioritize prod-critical and internet-facing services.'], ['Known issues', 'Already known and accepted: ']].map(([label, text]) => <button key={label} type="button" onClick={() => setContext((value) => (value ? `${value.trim()} ${text}` : text))}>+ {label}</button>)}</div><span className="item-muted">{context.length} / 1,000</span></div>
      </section>
    </>}

    {step === 2 && <section className="dash-card items-card">
      <div className="items-toolbar"><label className="findings-search"><Icon name="search" /><input value={repoQuery} onChange={(event) => setRepoQuery(event.target.value)} placeholder="Filter repositories" aria-label="Filter repositories" /></label><button type="button" className="items-quick" onClick={() => setPicked(new Set(repos.map(([repo]) => repo)))}>Select visible</button><button type="button" className="items-quick" onClick={() => setPicked(new Set())}>Clear</button><span className="items-count">{picked.size} of {RUN_REPOS.length} selected</span></div>
      <table className="items-table run-repo-table"><thead><tr><th className="item-toggle" /><th>Repository</th><th>Language</th><th>Last analysis</th><th>Last result</th><th>Open findings</th></tr></thead>
        <tbody>{repos.map(([repo, language, last, result, open]) => <tr key={repo} className="rem-row" onClick={() => togglePick(repo)}><td className="item-toggle"><input type="checkbox" checked={picked.has(repo)} onChange={() => togglePick(repo)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${repo}`} /></td><td><strong className="item-title mono">{repo}</strong>{REPO_CONTEXT[repo] && <small className="item-muted">{REPO_CONTEXT[repo].service}</small>}</td><td>{language}</td><td>{last || <span className="item-muted">Never analyzed</span>}</td><td>{result ? <span className={`item-status ${result === 'Failed' ? 'blocked' : result === 'Needs review' ? 'warn' : 'ok'}`}><i aria-hidden="true" />{result}</span> : <span className="item-muted">—</span>}</td><td>{open ?? <span className="item-muted">—</span>}</td></tr>)}</tbody></table>
    </section>}

    {step === 3 && <div className="run-config-v2">
      <label className="run-name"><span><strong>Analysis name</strong><small>Defaults to profile and date</small></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultName} /></label>
      <section><h2 className="run-section-title">Infrastructure</h2>
        <div className="run-choices" role="radiogroup" aria-label="Infrastructure">{[['managed', 'AWS managed', 'Run on infrastructure managed by AWS Transform.'], ['customer', 'Customer owned', 'Run on a deployed stack in your own AWS account.']].map(([key, title, blurb]) => <label key={key} className={`run-choice ${infra === key ? 'selected' : ''}`}><input type="radio" name="infra" checked={infra === key} onChange={() => setInfra(key)} /><div><strong>{title}</strong><small>{blurb}</small></div></label>)}</div></section>
      <section><h2 className="run-section-title">Schedule</h2><p className="run-section-sub">Run once, or keep this analysis running on a cadence.</p>
        <div className="run-choices" role="radiogroup" aria-label="Schedule">{[['once', 'Run once', 'Execute a single run now.'], ['recurring', 'Recurring', 'Re-run automatically on a schedule.']].map(([key, title, blurb]) => <label key={key} className={`run-choice ${cadence === key ? 'selected' : ''}`}><input type="radio" name="cadence" checked={cadence === key} onChange={() => setCadence(key)} /><div><strong>{title}</strong><small>{blurb}</small></div></label>)}</div>
        {cadence === 'recurring' && <div className="dash-card run-cadence">
          <span className="run-label-caps">Cadence interval</span>
          <div className="rem-segmented" role="group" aria-label="Cadence interval">{[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['cron', 'Custom cron'], ['estate', 'On estate change']].map(([key, label]) => <button key={key} type="button" aria-pressed={interval === key} className={interval === key ? 'active' : ''} onClick={() => setInterval_(key)}>{label}{key === 'estate' && <i className="run-live-dot" aria-hidden="true" />}</button>)}</div>
          {interval === 'weekly' && <div className="run-field-row"><span>Run on days</span><div className="run-days">{WEEK.map((day) => <button key={day} type="button" aria-pressed={days.has(day)} className={days.has(day) ? 'on' : ''} onClick={() => setDays((set) => { const next = new Set(set); if (next.has(day)) next.delete(day); else next.add(day); return next; })}>{day}</button>)}</div></div>}
          {interval === 'monthly' && <div className="run-field-row"><span>Day of month</span><select className="run-select" value={monthDay} onChange={(event) => setMonthDay(event.target.value)} aria-label="Day of month">{Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => <option key={day} value={day}>{day}</option>)}</select></div>}
          {interval === 'cron' && <div className="run-field-row"><span>Cron expression</span><input className="run-cron mono" value={cron} onChange={(event) => setCron(event.target.value)} aria-label="Cron expression" /></div>}
          {interval !== 'estate' && interval !== 'cron' && <div className="run-field-row"><span>Execution window</span><div className="run-time"><input type="time" value={time} onChange={(event) => setTime(event.target.value || '02:00')} aria-label="Execution time" /><span>UTC</span><small className="item-muted">Scheduled outside peak commit hours to avoid PR rate-limit exhaustion.</small></div></div>}
          <div className="run-cadence-note"><Icon name="info" /><span>{interval === 'estate' ? 'Runs on every estate code-change event: merges to the default branch and new repositories.' : `Runs ${interval === 'monthly' ? `on day ${monthDay} of each month at ${time} UTC` : schedule.replace(/^Every/, 'every')}.`}</span>{cronExpr && <code className="mono">cron: {cronExpr}</code>}</div>
        </div>}
      </section>
      <section className="dash-card run-ready"><strong>{cadence === 'recurring' ? 'Ready to schedule' : 'Ready to run'}</strong><p>{objective} <span className="item-muted">· {picked.size} repositor{picked.size === 1 ? 'y' : 'ies'} · {infraLabel} · {cadence === 'recurring' ? `recurring · ${schedule}` : 'once, now'}{context.trim() ? ' · with additional context' : ''}</span></p>{context.trim() && <blockquote>{context.trim()}</blockquote>}</section>
    </div>}

    <div className="run-footer">
      <div>{step > 1 ? <button type="button" className="dash-link" onClick={() => setStep(step - 1)}>Back</button> : <button type="button" className="dash-link" onClick={() => onNavigate('improved-rail-analyses')}>Cancel</button>}<button type="button" className="dash-link" onClick={() => setSaved(true)}>{saved ? 'Draft saved' : 'Save draft'}</button></div>
      <div><span className="item-muted">{objective}{step > 1 ? ` · ${picked.size} repositor${picked.size === 1 ? 'y' : 'ies'}` : ` · ~${minutes} min`}{step === 3 ? ` · ${infraLabel}` : ''}</span>
        {step < 3 ? <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>{step === 1 ? 'Continue to repositories' : 'Continue to run configuration'}</Button> : <Button onClick={start}>{cadence === 'once' ? 'Run analysis' : 'Schedule analysis'}</Button>}</div>
    </div>
  </RailShell>;
}

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [route, setRoute] = useState('improved-dashboard');
  const [viewVariant, setViewVariant] = useState('default');
  const [drawer, setDrawer] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [sources, setSources] = useState(initialSources);
  const [infra, setInfra] = useState(initialInfrastructure);
  const [toast, setToast] = useState('');
  const [addedAnalysis, setAddedAnalysis] = useState(null);
  const [addedRemediation, setAddedRemediation] = useState(null);
  const showToast = (text) => { setToast(text); window.clearTimeout(window.__cmToast); window.__cmToast = window.setTimeout(() => setToast(''), 3200); };
  const navigate = (target) => { setDrawer(false); setViewVariant('default'); if (target === 'run') setRoute('run'); else { setActive(target); setRoute('shell'); } };
  const createRemediation = (selected) => { const transformable = selected.map((id) => findings[id]).filter((item) => item.transformation !== 'No remediation available.'); if (!transformable.length) return; setAddedRemediation({ name: 'New remediation', status: 'Complete', outcomes: 1, transformation: transformable[0].transformation, repositories: new Set(transformable.map((item) => item.repository)).size, findings: transformable.length, date: 'Aug 27, 2026' }); setActive('Remediations'); showToast('Remediation created'); };
  const page = useMemo(() => {
    if (active === 'Dashboard') return <Dashboard navigate={navigate} toast={showToast} />;
    if (active === 'Findings') return <FindingsPage toast={showToast} createRemediation={createRemediation} />;
    if (active === 'Remediations') return <RemediationsPage addedRemediation={addedRemediation} />;
    if (active === 'Analyses') return <AnalysesPage navigate={navigate} addedAnalysis={addedAnalysis} toast={showToast} />;
    if (active === 'Sources') return <SourcesPage key={viewVariant} sources={sources} setSources={setSources} toast={showToast} initialModal={viewVariant === 'source-connect'} />;
    return <SettingsPage infra={infra} setInfra={setInfra} toast={showToast} />;
  }, [active, sources, infra, addedAnalysis, addedRemediation, viewVariant]);

  const renderMockup = (target) => {
    setToast('');
    setDrawer(false);
    setViewVariant('default');
    if (target === 'landing' || target === 'iam') { setRoute(target); return; }
    if (target.startsWith('improved-') || target === 'guided-onboarding') { setAssistantOpen(false); setRoute(target); return; }
    if (target === 'chat' || target === 'chat-nav') {
      setRoute(target); setAssistantOpen(true); setDrawer(target === 'chat-nav'); return;
    }
    if (target === 'source-connect') {
      setActive('Sources'); setRoute('shell'); setAssistantOpen(false); setViewVariant(target); return;
    }
    if (target.startsWith('analysis-')) {
      setRoute('run'); setAssistantOpen(false); setViewVariant(target); return;
    }
    const tab = tabs.find((item) => item.toLowerCase() === target);
    if (tab) { setActive(tab); setRoute('shell'); setAssistantOpen(false); }
  };
  const isImprovedRoute = route.startsWith('improved-') || route === 'guided-onboarding';
  const currentMockup = route === 'chat' || route === 'chat-nav' ? route
    : isImprovedRoute ? route
      : route === 'landing' || route === 'iam' ? route
        : route === 'run' ? (viewVariant.startsWith('analysis-') ? viewVariant : 'analysis-start')
          : drawer ? 'chat-nav'
            : active === 'Sources' && viewVariant === 'source-connect' ? 'source-connect'
              : active === 'Dashboard' && assistantOpen ? 'chat' : active.toLowerCase();
  const navigateImproved = (target) => {
    const improvedTabs = { Dashboard: 'improved-dashboard', Findings: 'improved-findings', Remediations: 'improved-rail-remediations', Analyses: 'improved-rail-analyses', 'Skills Library': 'improved-skills', Sources: 'improved-rail-sources', Settings: 'improved-rail-settings' };
    // Earlier-iteration screens are retired; their routes land on the current pages.
    const retired = { 'improved-priorities': 'improved-findings', 'improved-remediation': 'improved-rail-remediations', 'improved-analysis': 'improved-rail-analyses', 'improved-landing': 'improved-dashboard', 'guided-onboarding': 'improved-dashboard', 'improved-documentation': 'improved-dashboard', settings: 'improved-rail-settings' };
    const next = improvedTabs[target] || target;
    renderMockup(retired[next] || next);
  };
  const mockupSwitcher = null;

  if (route === 'landing') return <><LandingPage onManageUsers={() => setRoute('iam')} onEnterApp={() => navigate('Dashboard')} />{mockupSwitcher}</>;
  if (route === 'iam') return <><ServiceManagementPage onHome={() => setRoute('landing')} onEnterApp={() => renderMockup('chat')} />{mockupSwitcher}</>;
  if (route === 'chat' || route === 'chat-nav') return <><DirectChatScreen drawerOpen={drawer} onMenu={() => { setDrawer(true); setRoute('chat-nav'); }} onCloseDrawer={() => { setDrawer(false); setRoute('chat'); }} onNavigate={() => { setDrawer(false); setAssistantOpen(false); setActive('Dashboard'); setRoute('shell'); }} onMinimize={() => { setDrawer(false); setAssistantOpen(false); setActive('Dashboard'); setRoute('shell'); }} />{mockupSwitcher}</>;
  if (route === 'improved-landing') return <><ImprovedLanding onStart={() => setRoute('guided-onboarding')} onOpen={() => setRoute('improved-dashboard')} onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'guided-onboarding') return <><GuidedOnboarding onBack={() => setRoute('improved-landing')} onContinue={() => setRoute('improved-dashboard')} onConnectSource={() => setRoute('improved-sources')} onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-dashboard') return <><ImprovedDashboard onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-findings') return <><ImprovedFindings onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-rail-remediations') return <><RailRemediations onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-rail-remediation') return <><RailRemediationDetail key={pendingEffort || 'node20'} onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-rail-analyses') return <><RailAnalyses onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-rail-settings') return <RailSettings onNavigate={navigateImproved} />;
  if (route === 'improved-rail-sources') return <RailSources onNavigate={navigateImproved} />;
  if (route === 'improved-rail-analysis') return <RailAnalysisDetail key={pendingRun || 'portfolio-baseline'} onNavigate={navigateImproved} />;
  if (route === 'improved-rail-skill') return <RailSkillReview key={pendingSkill?.id || 'skill'} onNavigate={navigateImproved} />;
  if (route === 'improved-rail-authorize') return <RailAuthorize key={pendingAuthorize || 'authorize'} onNavigate={navigateImproved} />;
  if (route === 'improved-rail-run-analysis') return <><RailRunAnalysis onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-priorities') return <><ImprovedPriorities onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-analysis') return <><ImprovedAnalysisProgress onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-remediation') return <><ImprovedRemediation onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-custom-td') return <><ImprovedCustomTd onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-skills') return <><ImprovedSkillsLibrary onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-sources') return <><ImprovedSourceConnection onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-whats-new') return <><ImprovedResourcePage page="What's new" onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-documentation') return <><ImprovedResourcePage page="Documentation" onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-blog-posts') return <><ImprovedResourcePage page="Blog posts" onNavigate={navigateImproved} />{mockupSwitcher}</>;
  if (route === 'improved-success-stories') return <><ImprovedResourcePage page="Success stories" onNavigate={navigateImproved} />{mockupSwitcher}</>;

  return <div className="app"><TopBar onMenu={() => setDrawer(true)} assistantOpen={assistantOpen} setAssistantOpen={setAssistantOpen} /><div className={`workspace ${assistantOpen ? 'with-assistant' : ''}`}><main>{route === 'run' ? <RunAnalysisPage key={viewVariant} initialView={viewVariant.startsWith('analysis-') ? viewVariant : 'analysis-start'} sources={sources} setSources={setSources} onCancel={() => { setRoute('shell'); setActive('Analyses'); setViewVariant('default'); }} onComplete={(item) => { setAddedAnalysis(item); setRoute('shell'); setActive('Analyses'); setViewVariant('default'); showToast('Analysis completed'); }} toast={showToast} /> : <><ShellHeader active={active} setActive={(tab) => navigate(tab)} />{page}</>}</main><AssistantPanel visible={assistantOpen} onClose={(minimizing) => setAssistantOpen(!minimizing)} /></div><GlobalDrawer open={drawer} onClose={() => setDrawer(false)} onNavigate={() => navigate('Dashboard')} /><Toast text={toast} onClose={() => setToast('')} />{mockupSwitcher}</div>;
}
