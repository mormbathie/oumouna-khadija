import { t, locale } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import {
  Users,
  CreditCard,
  CalendarCheck,
  Building,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { dashboardApi } from '../services/api';

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({mode:'today',start:new Date().toISOString().slice(0,10),end:new Date().toISOString().slice(0,10)});
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    dashboardApi
      .getSummary(filter)
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.data?.message || t('Unable to load dashboard'));
        console.error('Failed to load dashboard:', err);
        setLoading(false);
      });
    return () => {active=false;};
  }, [filter.mode,filter.start,filter.end]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  const counts = data?.counts || {};
  const finances = data?.finances || {};
  const attendance = data?.attendance || {};
  const classesDistribution = data?.classesDistribution || [];
  const recentPayments = data?.recentPayments || [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-amber-700 via-stone-700 to-slate-900 rounded-2xl p-4 md:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 bg-amber-500/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-amber-200 mb-3 hidden md:inline-flex border border-amber-400/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{t("Integrated and Secure School Management")}</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            Bienvenue sur le portail de l’Institut Oumouna Khadija</h2>
          <p className="hidden md:block text-amber-100 text-sm mt-1">
            {t("Current school year:")}<span className="font-semibold text-white">{data?.academicYear}</span>{t(". Track enrollment, billing, grades, and attendance in real time.")}</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">{t('Encaissements nets')}</h3><p className="text-xs text-slate-500">{t('Payment dates follow Dakar time. Amounts due are not receipts.')}</p><div className="flex flex-wrap gap-3"><label>{t('Period')}<select className="ml-2 rounded-lg border p-2" value={filter.mode} onChange={e=>setFilter({...filter,mode:e.target.value})}><option value="today">{t('Today')}</option><option value="date">{t('Specific date')}</option><option value="range">{t('Date range')}</option><option value="all">{t('All / global')}</option></select></label>{['date','range'].includes(filter.mode)&&<label>{t('Start date')}<input className="ml-2 rounded-lg border p-2" type="date" value={filter.start} onChange={e=>setFilter({...filter,start:e.target.value})}/></label>}{filter.mode==='range'&&<label>{t('End date')}<input className="ml-2 rounded-lg border p-2" type="date" value={filter.end} onChange={e=>setFilter({...filter,end:e.target.value})}/></label>}</div>{loading&&<p aria-live="polite" className="text-sm">{t('Loading…')}</p>}{error&&<p role="alert" className="text-rose-700">{error}</p>}<div className="flex flex-wrap gap-4 text-sm">{Object.entries(data?.collection?.byCategory || {}).map(([category,total])=><p key={category}><span className="font-semibold">{t(category)}</span> : {Number(total).toLocaleString(locale())} FCFA</p>)}</div><p className="text-xs text-slate-500">{t('Global collected')}: {(finances.totalCollected || 0).toLocaleString(locale())} FCFA · {t('Payments in selected period')}: {data?.collection?.count || 0}</p></section>
      <p className="text-sm text-slate-600">{t('Sur la période sélectionnée')} · {t('Encaissements bruts')} : {(data?.collection?.gross || 0).toLocaleString(locale())} F CFA · {t('Remboursements')} : {(data?.collection?.refunds || 0).toLocaleString(locale())} F CFA</p>
      {/* KPI Cards */}
      <div className="mobile-dashboard-kpis grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        {/* Students */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("Total Students")}</span>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-800">{counts.totalStudents || 0}</div>
            <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
              <span>👦 {counts.maleStudents || 0} {t("Boys")}</span>
              <span>•</span>
              <span>👧 {counts.femaleStudents || 0} {t("Girls")}</span>
            </div>
          </div>
        </div>

        {/* Recouvrement Financier */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("Actual receipts")}</span>
            <div className="w-10 h-10 rounded-lg bg-stone-50 text-stone-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-800">
              {(data?.collection?.total || 0).toLocaleString(locale())} <span className="text-sm font-normal text-slate-400">{t("FCFA")}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-amber-600 font-medium mt-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{t("Taux de recouvrement :")}{finances.recoveryRate || 0}%</span>
            </div>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("Balance due")}</span>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-800">
              {(finances.totalBalance || 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">{t("FCFA")}</span>
            </div>
            <div className="text-xs text-amber-600 font-medium mt-1">
              {finances.unpaidInvoicesCount || 0} {t("invoices with an outstanding balance")}</div>
          </div>
        </div>

        {/* Taux d'assiduité */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("Today's attendance")}</span>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-800">{attendance.rate || 96}%</div>
            <div className="flex items-center space-x-1 text-xs text-slate-500 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
              <span>{t("Today's attendance recorded")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Classes breakdown & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classes & Occupancy */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-800">{t("Students by class")}</h3>
              <p className="text-xs text-slate-400">{t("Class occupancy rates (CI to CM2)")}</p>
            </div>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
              {classesDistribution.length} {t("Classes")}</span>
          </div>

          <div className="space-y-4">
            {classesDistribution.map((c: any) => (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-700 font-semibold">{c.name}</span>
                  <span className="text-slate-500">
                    <span className="text-amber-700 font-bold">{c.studentsCount}</span> / {c.capacity} {t("students (")}{c.occupancyRate}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(c.occupancyRate, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Derniers règlements reçus */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base text-slate-800">{t("Derniers Encaissements")}</h3>
            <span className="text-xs text-slate-400">{t("Recent receipts")}</span>
          </div>

          <div className="flex-1 space-y-3">
            {recentPayments.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">{t("No recent payments")}</div>
            ) : (
              recentPayments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                      {p.paymentMethod?.[0] || 'C'}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {p.invoice?.student ? `${p.invoice.student.firstName} ${p.invoice.student.lastName}` : t("Student")}
                      </p>
                      <p className="text-[11px] text-slate-400">{p.paymentNumber} • {p.paymentMethod}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-amber-600">+{p.amount.toLocaleString()} {t("F")}</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(p.paymentDate).toLocaleDateString(locale())}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
