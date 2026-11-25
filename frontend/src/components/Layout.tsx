import { ProfileAvatar } from './AccountDossier';
import { navigationVisuals, navigationCategories } from './navigation';
import api from '../services/api';
import { school } from '../config/school';
import { t } from "../i18n/index";
import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Shield, Menu, X, Search } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { useFeatures } from '../auth/FeaturesContext';
import { useAuth } from '../auth/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import { roleLabel } from '../i18n';

const roleNames = ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE', 'SURVEILLANT_INTERNAT'];

export const Layout: React.FC = () => {
  const { user, logout, hasRole } = useAuth();
  const { isEnabled } = useFeatures();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const content = useRef<HTMLElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('school_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed(value => {
    try { localStorage.setItem('school_sidebar_collapsed', String(!value)); } catch { /* Preference is optional. */ }
    return !value;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [yearName, setYearName] = useState(school.year.replace('/', ' - '));
  useEffect(() => { let active = true; const loadYear = () => { api.get('/classes/current-year').then(r => { if (active && r.data?.name) setYearName(r.data.name); }).catch(() => {}); }; loadYear(); window.addEventListener('academic-year-changed', loadYear); return () => { active = false; window.removeEventListener('academic-year-changed', loadYear); }; }, []);
  const activeRole = user?.roles?.find((role) => roleNames.includes(role.toUpperCase()))?.toUpperCase();
  const visibleRole = roleLabel(activeRole || 'User');
  const navItems = [
    { to: '/', label: t("Dashboard"), icon: navigationVisuals['/'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/students', label: t("Enrollment & Students"), icon: navigationVisuals['/students'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT'] },
    { to: '/quran-circles', feature: 'quranCircles', label: t("Quran circles"), icon: navigationVisuals['/quran-circles'].icon, roles: ['ADMIN', 'DIRECTEUR'] },
    { to: '/boarding', feature: 'boarding', label: t("Boarding"), icon: navigationVisuals['/boarding'].icon, roles: ['ADMIN', 'DIRECTEUR', 'SURVEILLANT_INTERNAT'] },
    { to: '/notifications', feature: 'whatsapp', label: t("WhatsApp messages"), icon: navigationVisuals['/notifications'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/parent-portal', feature: 'parentPortal', label: 'Espace parents', icon: navigationVisuals['/parent-portal'].icon, roles: ['PARENT'] },
    { to: '/academic-transition', label: 'Passage d’année', icon: navigationVisuals['/academic-transition'].icon, roles: ['ADMIN', 'DIRECTEUR'] },
    { to: '/parents', label: t("Parents & Guardians"), icon: navigationVisuals['/parents'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/kimono', feature: 'activities', label: t('Kimono sales'), icon: navigationVisuals['/kimono'].icon, roles: ['ADMIN','DIRECTEUR','COMPTABLE'] },
    { to: '/karate', feature: 'activities', label: t('Monthly karate payments'), icon: navigationVisuals['/karate'].icon, roles: ['ADMIN','DIRECTEUR','COMPTABLE'] },
    { to: '/refunds', label: t('Départs et remboursements'), icon: navigationVisuals['/refunds'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/finance-control', label: 'Contrôle financier', icon: navigationVisuals['/finance-control'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/registration-report', label: t('Synthèse des inscriptions'), icon: navigationVisuals['/registration-report'].icon, roles: ['ADMIN','DIRECTEUR','COMPTABLE'] },
    { to: '/teacher-badge', feature: 'staffAttendance', label: t('Mon pointage'), icon: navigationVisuals['/teacher-badge'].icon, roles: ['ENSEIGNANT'] },
    { to: '/finances', label: t("Invoices & Payments"), icon: navigationVisuals['/finances'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'] },
    { to: '/grades', feature: 'grades', label: t("Grades & Report Cards"), icon: navigationVisuals['/grades'].icon, roles: ['ADMIN', 'DIRECTEUR', 'ENSEIGNANT'] },
    { to: '/attendance', feature: 'attendance', label: t("Attendance & Absences"), icon: navigationVisuals['/attendance'].icon, roles: ['ADMIN', 'DIRECTEUR', 'ENSEIGNANT'] },
    { to: '/attendance/scan', feature: 'attendance', label: t("Scan Student QR Codes"), icon: navigationVisuals['/attendance/scan'].icon, roles: ['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE'] },
    { to: '/classes', label: t("Classes & Subjects"), icon: navigationVisuals['/classes'].icon, roles: ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT'] },
    { to: '/users', label: t("User Management"), icon: navigationVisuals['/users'].icon, roles: ['ADMIN'] },
    { to: '/features', label: 'Modules et fonctionnalités', icon: navigationVisuals['/features'].icon, roles: ['ADMIN'] },
    { to: '/fee-settings', label: 'Paramètres des tarifs', icon: navigationVisuals['/fee-settings'].icon, roles: ['ADMIN'] },
    { to: '/staff-attendance', feature: 'staffAttendance', label: t("Teacher Attendance"), icon: navigationVisuals['/staff-attendance'].icon, roles: ['ADMIN', 'DIRECTEUR', 'CONTROLEUR_PRESENCE'] },
    { to: '/data-transfer', feature: 'dataTransfer', label: t("Import / Export"), icon: navigationVisuals['/data-transfer'].icon, roles: ['ADMIN'] },
    { to: '/school-information', label: t('School information and fees'), icon: navigationVisuals['/school-information'].icon, roles: roleNames },
    { to: '/profile', label: t("My Profile"), icon: navigationVisuals['/profile'].icon, roles: roleNames },
  ].filter((item) => hasRole(item.roles) && (!(item as { feature?: string }).feature || isEnabled((item as { feature?: string }).feature!)));

  const groups = navigationCategories.map(category => ({ ...category, items: category.routes.map(route => navItems.find(item => item.to === route)).filter((item): item is typeof navItems[number] => Boolean(item)) })).filter(category => category.items.length);

  const mobileShortNames: Record<string, string> = { '/': 'Accueil', '/parent-portal': 'Mes enfants', '/students': 'Élèves', '/finances': 'Paiements', '/attendance/scan': 'Scanner', '/attendance': 'Présences', '/grades': 'Notes', '/profile': 'Profil', '/teacher-badge': 'Badger' };
  const mobilePriority = activeRole === 'PARENT' ? ['/parent-portal', '/students', '/profile'] : activeRole === 'ENSEIGNANT' ? ['/teacher-badge', '/students', '/grades', '/profile'] : activeRole === 'CONTROLEUR_PRESENCE' ? ['/attendance/scan', '/attendance', '/profile'] : activeRole === 'SURVEILLANT_INTERNAT' ? ['/boarding', '/profile'] : ['/', '/students', '/finances', '/attendance/scan', '/attendance', '/profile'];
  const mobileTabs = mobilePriority
    .map(to => navItems.find(item => item.to === to)).filter((item): item is typeof navItems[number] => Boolean(item)).slice(0, 4);
  const currentPage = navItems.find(item => item.to === pathname);
  const currentGroup = groups.find(group => group.items.some(item => item.to === pathname));
  const paletteItems = groups.flatMap(group => group.items.map(item => ({ to: item.to, label: item.label, group: t(group.label), icon: item.icon })));
  useEffect(() => {
    setMobileMenuOpen(false);
    if (window.matchMedia('(max-width: 1023px)').matches) content.current?.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(open => !open); }
    };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mobile-app flex h-dvh min-h-0 overflow-hidden bg-[#f5f1e7] text-stone-800">
      <aside id="desktop-sidebar" aria-label={t('Menu principal')} data-collapsed={sidebarCollapsed} className={`hidden lg:flex lg:shrink-0 lg:flex-col border-e border-[#b3973f]/30 bg-[#30331f] text-white shadow-2xl transition-[width] duration-200 motion-reduce:transition-none ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}`}>
        <div className={`flex min-h-20 shrink-0 items-center gap-3 border-b border-white/10 bg-[#282b1a] ${sidebarCollapsed ? 'justify-center px-2' : 'px-5'}`}>
          <img src={school.logo} alt={sidebarCollapsed ? school.shortName : ''} title={school.name} className="h-12 w-12 shrink-0 rounded-full border-2 border-[#b3973f] bg-white object-contain shadow-lg" />
          {!sidebarCollapsed && <div className="min-w-0"><h1 className="text-base font-black leading-tight tracking-wide">{school.shortName}</h1><p className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-amber-300">{school.tagline}</p></div>}
        </div>
        <nav aria-label={t('Navigation principale')} className={`hide-scrollbar min-h-0 flex-1 overflow-y-auto py-2 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {groups.map((group, index) => <section key={group.id} aria-labelledby={`desktop-category-${group.id}`} className={index ? 'mt-2 border-t border-white/5 pt-2' : ''}>
            <h2 id={`desktop-category-${group.id}`} className={sidebarCollapsed ? 'sr-only' : 'mb-1 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-stone-400/80'}>{t(group.label)}</h2>
            <div className="space-y-0.5">{group.items.map(item => { const Icon = item.icon; const visual = navigationVisuals[item.to as keyof typeof navigationVisuals]; return <NavLink key={item.to} to={item.to} end={item.to === '/'} title={sidebarCollapsed ? item.label : undefined} aria-label={item.label} className={({isActive})=>`group relative flex min-h-10 items-center gap-3 rounded-xl text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${sidebarCollapsed ? 'justify-center px-1' : 'px-2.5'} ${isActive ? 'bg-[#b3973f] text-white shadow-md shadow-black/20' : 'text-stone-300 hover:bg-white/[.07] hover:text-white'}`}>
              {({isActive})=><><span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${isActive ? 'border-white/20 bg-white/15 text-white' : visual.color}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span><span className={sidebarCollapsed ? 'sr-only' : 'min-w-0 flex-1 leading-snug'}>{item.label}</span>{!sidebarCollapsed && isActive && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/80" />}</>}
            </NavLink>; })}</div>
          </section>)}
        </nav>
        <div className={`shrink-0 border-t border-slate-800 bg-slate-950/50 ${sidebarCollapsed ? 'flex flex-col items-center gap-2 px-2 py-3' : 'p-4'}`}>
          {!sidebarCollapsed && <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Shield className="h-3.5 w-3.5 text-amber-400" />{t('Your session')}</div>}
          <div className={`flex min-w-0 items-center gap-2 ${sidebarCollapsed ? 'flex-col' : 'justify-between'}`}><button onClick={()=>navigate('/profile')} title={t('My Profile')} aria-label={t('My Profile')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-xs font-bold uppercase text-amber-300"><ProfileAvatar fallback={user?.firstName?.[0] || user?.username?.[0] || 'U'} /></button>{!sidebarCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.username}</p><p className="truncate text-[10px] text-slate-400">{visibleRole}</p></div>}<button onClick={handleLogout} title={t('Sign out')} aria-label={t('Sign out')} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-rose-400"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 hidden min-h-16 items-center justify-between gap-4 border-b border-[#e4dcc5] bg-[#fffdf8]/90 px-6 backdrop-blur lg:flex">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={toggleSidebar} aria-controls="desktop-sidebar" aria-expanded={!sidebarCollapsed} title={t(sidebarCollapsed ? 'Développer le menu' : 'Réduire le menu')} aria-label={t(sidebarCollapsed ? 'Développer le menu' : 'Réduire le menu')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-stone-500">{currentGroup ? t(currentGroup.label) : school.shortName} · {t('School year {0}', [yearName])}</p>
              <h1 className="truncate text-base font-bold text-stone-900">{currentPage?.label || school.name}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Rechercher un module" title="Rechercher un module (Ctrl+K)" className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:border-amber-300 xl:hidden"><Search className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPaletteOpen(true)} className="hidden h-10 w-72 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-500 hover:border-amber-300 xl:flex"><Search className="h-4 w-4" /><span className="flex-1 text-left">Rechercher un module…</span><kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 text-[10px] font-semibold text-stone-500">Ctrl K</kbd></button>
            <LanguageSelector />
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{visibleRole}</span>
          </div>
        </header>
        <header className="mobile-topbar z-20 flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5"><img src={school.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-amber-100 object-contain" /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{school.shortName}</p><p className="truncate text-xs text-slate-500">{mobileMenuOpen ? t('Tous les modules') : currentPage?.label || school.shortName}</p></div></div>
          <div className="flex shrink-0 items-center gap-2"><LanguageSelector /><button onClick={() => navigate('/profile')} aria-label={t('My Profile')} className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 font-bold uppercase text-amber-800"><ProfileAvatar fallback={user?.firstName?.[0] || user?.username?.[0] || 'U'} /></button></div>
        </header>
        <main ref={content} className="mobile-content oumouna-canvas min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-7"><div key={pathname} className="page-enter"><Outlet /></div></main>
        <CommandPalette items={paletteItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        {mobileMenuOpen && <section aria-label={t('Tous les modules')} className="mobile-modules absolute inset-x-0 z-40 overflow-y-auto bg-slate-50 p-4 lg:hidden">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-900">{t('Tous les modules')}</h2><p className="text-sm text-slate-500">{visibleRole} · {yearName}</p></div><button onClick={() => setMobileMenuOpen(false)} aria-label={t('Close menu')} className="rounded-xl border bg-white p-3"><X className="h-5 w-5" /></button></div>
          <nav aria-label={t('Tous les modules')} className="space-y-6">{groups.map(group=><section key={group.id} aria-labelledby={`mobile-category-${group.id}`}><h3 id={`mobile-category-${group.id}`} className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t(group.label)}</h3><div className="grid grid-cols-2 gap-3">{group.items.map(item=>{const Icon=item.icon; const visual=navigationVisuals[item.to as keyof typeof navigationVisuals]; return <NavLink key={item.to} to={item.to} end={item.to==='/'} onClick={()=>setMobileMenuOpen(false)} className={({isActive})=>`flex min-h-28 flex-col items-start justify-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${isActive?'border-amber-600 bg-amber-50 text-amber-900':'border-slate-200 bg-white text-slate-700'}`}><span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${visual.light}`}><Icon className="h-6 w-6" strokeWidth={1.8}/></span><span>{item.label}</span></NavLink>;})}</div></section>)}</nav>
          <button onClick={handleLogout} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white text-sm font-semibold text-rose-700"><LogOut className="h-5 w-5" />{t('Sign out')}</button>
        </section>}
        <nav aria-label={t('Navigation mobile')} className="mobile-bottom-nav z-30 flex shrink-0 border-t border-slate-200 bg-white px-1 lg:hidden">
          {mobileTabs.map(item => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold ${isActive && !mobileMenuOpen ? 'text-amber-700' : 'text-slate-500'}`}><Icon className="h-5 w-5" /><span>{t(mobileShortNames[item.to] || item.label)}</span></NavLink>; })}
          <button onClick={() => setMobileMenuOpen(value => !value)} aria-expanded={mobileMenuOpen} className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold ${mobileMenuOpen ? 'text-amber-700' : 'text-slate-500'}`}><Menu className="h-5 w-5" /><span>{t('Menu')}</span></button>
        </nav>
      </div>
    </div>
  );
};
