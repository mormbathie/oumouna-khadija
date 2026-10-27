import { RegistrationFees } from '../components/RegistrationFees';
import { SchoolOptions } from '../components/SchoolOptions';
import { programFor, ageWarning, effectiveFees, money, supportsFullDay } from '../config/school';
import { printStudentInformation } from '../utils/schoolDocuments';
import { t, locale, roleLabel } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertTriangle, CheckCircle2, Download, Eye, FilePlus2, FileText, Pencil, Phone,
  Search, ShieldCheck, Trash2, UserPlus, Users, X, Save, QrCode,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { classesApi, parentsApi, studentsApi } from '../services/api';

const studentDocuments: { value: string; label: string; accept: string }[] = [
  { value: 'BIRTH_CERTIFICATE', label: 'Extrait de naissance', accept: '.pdf,.jpg,.jpeg,.png,.webp' },
  { value: 'STUDENT_PHOTO', label: t("Identity photo"), accept: '.jpg,.jpeg,.png,.webp' },
  { value: 'VACCINATION_BOOK', label: 'Carnet de vaccination', accept: '.pdf,.jpg,.jpeg,.png,.webp' },
  { value: 'MEDICAL_CERTIFICATE', label: t("Medical certificate"), accept: '.pdf,.jpg,.jpeg,.png,.webp' },
  { value: 'PREVIOUS_REPORT', label: t("Previous report card"), accept: '.pdf,.jpg,.jpeg,.png,.webp' },
];
const parentDocuments: { value: string; label: string; accept: string }[] = [
  { value: 'NATIONAL_ID_CARD', label: t("National identity card"), accept: '.pdf,.jpg,.jpeg,.png,.webp' },
  { value: 'PASSPORT', label: 'Passeport', accept: '.pdf,.jpg,.jpeg,.png,.webp' },
];

const formatError = (error: any) => {
  const message = error?.response?.data?.message || error?.message || 'Une erreur est survenue.';
  return Array.isArray(message) ? message.join(', ') : message;
};
const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';
const emptyGuardian = (relation = 'Mother') => ({ firstName: '', lastName: '', phone: '', email: '', address: '', profession: '', relation });

export const StudentsPage: React.FC = () => {
  const { user } = useAuth();
  const roles = (user?.roles || []).map((role) => role.toUpperCase());
  const manager = roles.includes('ADMIN') || roles.includes('DIRECTEUR');
  const isDirector = roles.includes('DIRECTEUR');
  const isAccountant = roles.includes('COMPTABLE');
  const canRegister = manager || roles.includes('COMPTABLE');
  const canSeeFinances = manager || (!roles.includes('ENSEIGNANT') && (roles.includes('COMPTABLE') || roles.includes('PARENT')));
  const parentPortal = roles.includes('PARENT') && !roles.some((role) => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT'].includes(role));

  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const attendanceSummary = selectedStudent?.attendanceSummary || { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'overview' | 'documents'>('overview');
  const [editingDetails, setEditingDetails] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [studentPhoto, setStudentPhoto] = useState('');
  const [photoReloadKey, setPhotoReloadKey] = useState(0);
  const [studentQrCode, setStudentQrCode] = useState('');
  const [discountInvoice, setDiscountInvoice] = useState<any>(null);
  const [discountForm, setDiscountForm] = useState({ amount: '', type: 'DISCOUNT', reason: '' });
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [refundInvoice, setRefundInvoice] = useState<any>(null);
  const [refundForm, setRefundForm] = useState({ refundedOn: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH', recipient: '' });
  const [savingRefund, setSavingRefund] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', gender: 'MALE', dateOfBirth: '2019-01-01',
    placeOfBirth: '', bloodGroup: '', address: '', classroomId: '', schoolMatricule: '', originClass: '', quranLevel: '',
    parentChoice: 'new', parentId: '', parentFirstName: '', parentLastName: '',
    parentPhone: '', parentEmail: '', parentAddress: '', parentProfession: '',
    parentRelation: 'Father', generateInvoice: true,
    additionalGuardians: [] as ReturnType<typeof emptyGuardian>[],
    supplies: false, fullDay: false, transportZone: null as number|null, karate:false, eveningClasses:false, hairCare:false, pharmacyKit:false, emergencyContactName:'', emergencyContactPhone:'', healthNotes:'', schoolItemsProvided:'',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsRes, classesRes, parentsRes] = await Promise.all([
        studentsApi.getAll({ search, classId: selectedClass || undefined }),
        parentPortal ? Promise.resolve([]) : classesApi.getAll(),
        canRegister ? parentsApi.getAll() : Promise.resolve([]),
      ]);
      setStudents(studentsRes);
      setClasses(classesRes);
      setParents(parentsRes);
      if (classesRes.length > 0 && !formData.classroomId) {
        setFormData((prev) => ({ ...prev, classroomId: classesRes[0].id }));
      }
    } catch (error) {
      console.error(t("Unable to load student records:"), error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [selectedClass]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (showDetailsModal && selectedStudent?.id) {
      studentsApi.getPhoto(selectedStudent.id)
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setStudentPhoto(objectUrl);
        })
        .catch(() => { if (active) setStudentPhoto(''); });
    } else setStudentPhoto('');
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [showDetailsModal, selectedStudent?.id, photoReloadKey]);

  useEffect(() => {
    let active = true;
    setStudentQrCode('');
    if (showDetailsModal && selectedStudent?.id) {
      QRCode.toDataURL('OKATT1:' + selectedStudent.id, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 240,
      }).then((dataUrl) => { if (active) setStudentQrCode(dataUrl); });
    }
    return () => { active = false; };
  }, [showDetailsModal, selectedStudent?.id]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void loadData();
  };

  const handleOpenDetails = async (studentId: string, tab: 'overview' | 'documents' = 'overview') => {
    try {
      const details = await studentsApi.getOne(studentId);
      setSelectedStudent(details);
      setDetailsTab(tab);
      setEditingDetails(false);
      setDocumentError('');
      setShowDetailsModal(true);
    } catch (error) {
      alert(t("Unable to open the record: {0}", [formatError(error)]));
    }
  };

  const beginEdit = () => {
    if (!selectedStudent) return;
    const parent = selectedStudent.parent || {};
    setEditData({
      firstName: selectedStudent.firstName || '',
      lastName: selectedStudent.lastName || '',
      gender: selectedStudent.gender || 'MALE',
      dateOfBirth: selectedStudent.dateOfBirth ? new Date(selectedStudent.dateOfBirth).toISOString().slice(0, 10) : '',
      placeOfBirth: selectedStudent.placeOfBirth || '',
      bloodGroup: selectedStudent.bloodGroup || '',
      address: selectedStudent.address || '',
      schoolMatricule: selectedStudent.schoolMatricule || '',
      originClass: selectedStudent.originClass || '',
      quranLevel: selectedStudent.quranLevel || '',
      classroomId: selectedStudent.enrollments?.[0]?.classroomId || '',
      supplies: selectedStudent.supplies || false, fullDay: selectedStudent.fullDay || false, transportZone: selectedStudent.transportZone || null, karate: selectedStudent.karate || false, eveningClasses: selectedStudent.eveningClasses || false, hairCare: selectedStudent.hairCare || false, pharmacyKit: selectedStudent.pharmacyKit || false, emergencyContactName: selectedStudent.emergencyContactName || '', emergencyContactPhone: selectedStudent.emergencyContactPhone || '', healthNotes: selectedStudent.healthNotes || '', schoolItemsProvided: selectedStudent.schoolItemsProvided || '',
      parentData: {
        firstName: parent.firstName || '', lastName: parent.lastName || '',
        phone: parent.phone || '', email: parent.email || '', address: parent.address || '',
        profession: parent.profession || '', relation: parent.relation || 'Guardian',
      },
      additionalGuardians: (selectedStudent.guardians || []).filter((item:any) => item.parentId !== parent.id).map((item:any) => ({
        firstName: item.parent.firstName || '', lastName: item.parent.lastName || '', phone: item.parent.phone || '', email: item.parent.email || '', address: item.parent.address || '', profession: item.parent.profession || '', relation: item.relation || item.parent.relation || 'Guardian',
      })),
    });
    setEditingDetails(true);
    setDetailsTab('overview');
  };

  const handleSaveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !editData) return;
    setSavingDetails(true);
    try {
      const payload = { ...editData, guardians: (editData.additionalGuardians || []).filter((guardian:any) => guardian.firstName.trim() && guardian.phone.trim()).map((guardian:any) => ({ relation: guardian.relation, data: { ...guardian, email: guardian.email.trim() || undefined } })) };
      delete (payload as any).additionalGuardians;
      const updated = await studentsApi.update(selectedStudent.id, payload);
      setSelectedStudent(updated);
      setEditingDetails(false);
      await loadData();
    } catch (error) {
      alert(t("Unable to update the record: {0}", [formatError(error)]));
    } finally {
      setSavingDetails(false);
    }
  };

  const openDiscount = (invoice: any) => {
    setDiscountInvoice(invoice);
    setDiscountForm({ amount: String(invoice.discountAmount || ''), type: invoice.discountType || 'DISCOUNT', reason: invoice.discountReason || '' });
  };

  const saveDiscount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !discountInvoice) return;
    setSavingDiscount(true);
    try {
      const updated = await studentsApi.applyRegistrationDiscount(selectedStudent.id, { invoiceId: discountInvoice.id, amount: Number(discountForm.amount || 0), type: discountForm.type, reason: discountForm.reason.trim() });
      setSelectedStudent(updated);
      setDiscountInvoice(null);
      await loadData();
    } catch (error) {
      alert(formatError(error));
    } finally {
      setSavingDiscount(false);
    }
  };

  const openDiscountRefund = (invoice: any) => {
    const parent = selectedStudent?.parent;
    setRefundInvoice(invoice);
    setRefundForm({ refundedOn: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH', recipient: parent ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim() : '' });
  };

  const saveDiscountRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !refundInvoice) return;
    if (!window.confirm('Confirmez-vous que ce montant a réellement été remis au parent ? Cette opération sera enregistrée dans la caisse.')) return;
    setSavingRefund(true);
    try {
      const updated = await studentsApi.refundRegistrationDiscount(selectedStudent.id, { ...refundForm, invoiceId: refundInvoice.id, requestKey: crypto.randomUUID() });
      setSelectedStudent(updated);
      setRefundInvoice(null);
      await loadData();
    } catch (error) {
      alert(formatError(error));
    } finally {
      setSavingRefund(false);
    }
  };



  const handleSubmitNewStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload: any = {
        firstName: formData.firstName.trim(), lastName: formData.lastName.trim(),
        gender: formData.gender, dateOfBirth: formData.dateOfBirth,
        placeOfBirth: formData.placeOfBirth, bloodGroup: formData.bloodGroup,
        address: formData.address, classroomId: formData.classroomId,
        schoolMatricule: formData.schoolMatricule.trim() || undefined,
        originClass: formData.originClass.trim() || undefined,
        quranLevel: formData.quranLevel.trim() || undefined,
        generateInvoice: formData.generateInvoice,
        supplies: formData.supplies, fullDay: formData.fullDay, transportZone: formData.transportZone, karate: formData.karate, eveningClasses: formData.eveningClasses, hairCare: formData.hairCare, pharmacyKit: formData.pharmacyKit, emergencyContactName: formData.emergencyContactName, emergencyContactPhone: formData.emergencyContactPhone, healthNotes: formData.healthNotes, schoolItemsProvided: formData.schoolItemsProvided,
      };
      if (formData.parentChoice === 'existing' && formData.parentId) {
        payload.parentId = formData.parentId;
      } else if (formData.parentFirstName.trim() && formData.parentPhone.trim()) {
        payload.parentData = {
          firstName: formData.parentFirstName.trim(),
          lastName: formData.parentLastName.trim() || formData.lastName.trim(),
          phone: formData.parentPhone.trim(), email: formData.parentEmail.trim() || undefined,
          profession: formData.parentProfession.trim() || undefined,
          relation: formData.parentRelation,
          address: formData.parentAddress.trim() || undefined,
        };
      }
      payload.guardians = formData.additionalGuardians
        .filter((guardian) => guardian.firstName.trim() && guardian.phone.trim())
        .map((guardian) => ({ relation: guardian.relation, data: { ...guardian, firstName: guardian.firstName.trim(), lastName: guardian.lastName.trim() || formData.lastName.trim(), phone: guardian.phone.trim(), email: guardian.email.trim() || undefined } }));
      let created;
      try {
        created = await studentsApi.create(payload);
      } catch (error: any) {
        const duplicates = error.response?.data?.duplicates;
        if (error.response?.status !== 409 || !Array.isArray(duplicates)) throw error;
        const list = duplicates.map((row: any) => `${row.firstName} ${row.lastName} — ${row.matricule}`).join('\n');
        const reason = window.prompt(`Un dossier similaire existe déjà :\n${list}\n\nVérifiez ce dossier. S'il s'agit bien d'un autre enfant, indiquez le motif de dérogation (10 caractères minimum). Annulez sinon.`);
        if (!reason) return;
        if (reason.trim().length < 10 || reason.trim().length > 1000) {
          alert('Le motif doit contenir entre 10 et 1 000 caractères.');
          return;
        }
        created = await studentsApi.create({ ...payload, duplicateOverrideReason: reason.trim() });
      }
      setShowAddModal(false);
      setFormData((previous) => ({ ...previous, firstName: '', lastName: '', schoolMatricule: '', originClass: '', quranLevel: '', parentFirstName: '', parentLastName: '', parentPhone: '', parentEmail: '', parentAddress: '', parentProfession: '', additionalGuardians: [], supplies: false, fullDay: false, transportZone: null, karate: false, eveningClasses: false, hairCare: false, pharmacyKit: false, emergencyContactName: '', emergencyContactPhone: '', healthNotes: '', schoolItemsProvided: '', placeOfBirth: '', address: '', bloodGroup: '' }));
      await loadData();
      await handleOpenDetails(created.id, manager ? 'documents' : 'overview');
    } catch (error: any) {
      const message = error.response?.status === 401
        ? t("Your session has expired. Sign in again to continue.")
        : formatError(error);
      alert(t("Erreur d’inscription : {0}", [message]));
    }
  };

  const uploadDocument = async (owner: 'student' | 'parent', ownerId: string, category: string, file?: File) => {
    if (!file || !selectedStudent) return;
    setUploadingCategory(`${owner}-${category}`);
    setDocumentError('');
    try {
      if (owner === 'student') {
        await studentsApi.uploadDocument(ownerId, category, file);
        if (category === 'STUDENT_PHOTO') setPhotoReloadKey((current) => current + 1);
      } else await parentsApi.uploadDocument(ownerId, category, file);
      await handleOpenDetails(selectedStudent.id, 'documents');
    } catch (error) {
      setDocumentError(formatError(error));
    } finally {
      setUploadingCategory('');
    }
  };

  const downloadDocument = async (owner: 'student' | 'parent', ownerId: string, document: any) => {
    try {
      const blob = owner === 'student'
        ? await studentsApi.downloadDocument(ownerId, document.id)
        : await parentsApi.downloadDocument(ownerId, document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.originalName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDocumentError(formatError(error));
    }
  };

  const deleteDocument = async (owner: 'student' | 'parent', ownerId: string, document: any) => {
    if (!window.confirm(t("Delete the document “{0} » ?", [document.originalName]))) return;
    try {
      if (owner === 'student') await studentsApi.deleteDocument(ownerId, document.id);
      else await parentsApi.deleteDocument(ownerId, document.id);
      await handleOpenDetails(selectedStudent.id, 'documents');
    } catch (error) {
      setDocumentError(formatError(error));
    }
  };

  const renderDocumentSection = (owner: 'student' | 'parent', ownerId: string, definitions: { value: string; label: string; accept: string }[], documents: any[] = []) => (
    <div className="space-y-3">
      {definitions.map((definition) => {
        const existing = documents.filter((document) => document.category === definition.value);
        const key = `${owner}-${definition.value}`;
        return (
          <div key={key} className="rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-800">{definition.label}</p>
                {existing.length === 0 && <p className="mt-1 text-xs text-slate-400">{t("No files added")}</p>}
              </div>
              {manager && (
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                  <FilePlus2 className="h-4 w-4" />
                  {uploadingCategory === key ? t("Uploading…") : t("Add a file")}
                  <input type="file" accept={definition.accept} className="sr-only" disabled={uploadingCategory === key}
                    onChange={(event) => { void uploadDocument(owner, ownerId, definition.value, event.target.files?.[0]); event.target.value = ''; }} />
                </label>
              )}
            </div>
            {existing.map((document) => (
              <div key={document.id} className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                  <FileText className="h-4 w-4 shrink-0 text-amber-700" />
                  <span className="truncate">{document.originalName}</span>
                  <span className="shrink-0 text-slate-400">{(document.size / 1024 / 1024).toFixed(1)} {t("Mo")}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => void downloadDocument(owner, ownerId, document)} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-white" title={t("Download")} aria-label={t("Download document")}><Download className="h-4 w-4" /></button>
                  {manager && <button type="button" onClick={() => void deleteDocument(owner, ownerId, document)} className="rounded-md border border-rose-200 p-2 text-rose-600 hover:bg-rose-50" title={t("Delete")} aria-label={t("Delete document")}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("Enrollment & Student Records")}</h2>
          <p className="text-xs text-slate-500">{t("Individual records and documents")}</p>
        </div>
        {canRegister && <button onClick={() => setShowAddModal(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:bg-amber-700"><UserPlus className="h-4 w-4" /><span>{t("New enrollment")}</span></button>}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:max-w-sm">
          <input type="search" placeholder={t("Search by name or student ID…")} value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </form>
        {classes.length > 0 && (
          <label className="flex w-full items-center gap-2 text-xs text-slate-500 sm:w-auto">
            <span className="shrink-0">{t("Class:")}</span>
            <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:flex-none">
              <option value="">{t("All classes")}</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <section aria-label={t('Élèves sur mobile')} className="space-y-3 md:hidden">
        {loading ? <p className="py-8 text-center text-slate-500">{t('Loading records…')}</p> : students.length === 0 ? <p className="py-8 text-center text-slate-500">{t('No students found.')}</p> : students.map(student => {
          const classroom = student.enrollments?.[0]?.classroom;
          const balance = student.invoices?.reduce((sum: number, inv: any) => sum + inv.balance, 0) || 0;
          return <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 font-bold text-amber-800">{student.firstName?.[0]}{student.lastName?.[0]}</div><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-slate-900">{student.firstName} {student.lastName}{student.departure && <span className="ml-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{t("A quitté l’établissement")}</span>}</h3><p className="mt-1 break-all font-mono text-xs text-amber-700">{student.matricule}</p><p className="mt-1 text-xs text-slate-500">{classroom?.name || t('Unassigned')} · {t(student.gender === 'MALE' ? 'Boy' : 'Girl')}</p></div></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t('Parent / guardian')}</p><p className="mt-1 text-sm font-medium text-slate-800">{student.parent ? `${student.parent.firstName} ${student.parent.lastName}` : t('Not provided')}</p>{student.parent?.phone && <a href={`tel:${student.parent.phone.replace(/[^+0-9]/g, '')}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-700">{student.parent.phone}</a>}</div>
            <div className="mt-3 flex items-center justify-between gap-2">{canSeeFinances ? <span className={`rounded-full px-2.5 py-1.5 text-xs font-medium ${balance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-amber-50 text-amber-800'}`}>{balance > 0 ? `${t('Balance:')} ${balance.toLocaleString()} ${t('F')}` : t('Paid up')}</span> : <span />}<button onClick={() => void handleOpenDetails(student.id)} className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white"><Eye className="h-4 w-4" />{t('Dossier')}</button></div>
          </article>;
        })}
      </section>

      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wider text-slate-600"><tr>
              <th className="px-5 py-3.5">{t("Student ID & name")}</th><th className="px-4 py-3.5">{t("Class")}</th><th className="px-4 py-3.5">{t("Gender")}</th><th className="px-4 py-3.5">{t("Parent / guardian")}</th>{canSeeFinances && <th className="px-4 py-3.5">{t("Financial status")}</th>}<th className="px-5 py-3.5 text-right">{t("Actions")}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={canSeeFinances ? 6 : 5} className="p-8 text-center text-slate-400">{t("Loading records…")}</td></tr>
                : students.length === 0 ? <tr><td colSpan={canSeeFinances ? 6 : 5} className="p-8 text-center text-slate-400">{t("No students found.")}</td></tr>
                  : students.map((student) => {
                    const classroom = student.enrollments?.[0]?.classroom;
                    const balance = student.invoices?.reduce((total: number, invoice: any) => total + invoice.balance, 0) || 0;
                    return <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{student.firstName?.[0]}{student.lastName?.[0]}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{student.firstName} {student.lastName}{student.departure && <span className="ml-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{t("A quitté l’établissement")}</span>}</p><span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-700">{student.matricule}</span></div></div></td>
                      <td className="px-4 py-3.5"><span className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{classroom?.name || t("Unassigned")}</span></td>
                      <td className="px-4 py-3.5 text-slate-600">{student.gender === 'MALE' ? t("Boy") : t("Girl")}</td>
                      <td className="px-4 py-3.5">{student.parent ? <><p className="font-medium text-slate-700">{student.parent.firstName} {student.parent.lastName}</p><p className="text-[11px] text-slate-400">{student.parent.phone}</p></> : <span className="italic text-slate-400">{t("Not provided")}</span>}</td>
                      {canSeeFinances && <td className="px-4 py-3.5">{balance === 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800"><CheckCircle2 className="h-3 w-3" />{t("Paid up")}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800"><AlertTriangle className="h-3 w-3" />{t("Balance:")}{balance.toLocaleString()} {t("F")}</span>}</td>}
                      <td className="px-5 py-3.5 text-right"><button onClick={() => void handleOpenDetails(student.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"><Eye className="h-3.5 w-3.5" /><span>{t("Dossier")}</span></button></td>
                    </tr>;
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && canRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-4 sm:p-6"><div><h3 className="font-bold text-lg text-slate-800">{t("New enrollment")}</h3><p className="text-xs text-slate-500">{t("Documents can be added after enrollment.")}</p></div><button onClick={() => setShowAddModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label={t("Close")}><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleSubmitNewStudent} className="space-y-6 p-4 sm:p-6">
              <section><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-700">{t("1. Student details")}</h4><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-700">{t("First name(s) *")}<input required value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Last name *")}<input required value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Gender")}<select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value, hairCare: e.target.value === 'FEMALE' ? formData.hairCare : false })} className={inputClass}><option value="MALE">{t("Boy")}</option><option value="FEMALE">{t("Girl")}</option></select></label>
                <label className="text-xs font-medium text-slate-700">{t("Date of birth")}<input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Place of birth")}<input value={formData.placeOfBirth} onChange={(e) => setFormData({ ...formData, placeOfBirth: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Blood type")}<select value={formData.bloodGroup} onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })} className={inputClass}><option value="">{t("Not provided")}</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">Matricule historique de l’école (facultatif)<input value={formData.schoolMatricule} onChange={(e) => setFormData({ ...formData, schoolMatricule: e.target.value })} maxLength={100} className={inputClass} /><span className="mt-1 block text-[11px] font-normal text-slate-500">Différent du matricule interne, qui sera généré automatiquement.</span></label>
                <label className="text-xs font-medium text-slate-700">Classe d’origine<input value={formData.originClass} onChange={(e) => setFormData({ ...formData, originClass: e.target.value })} maxLength={400} placeholder="Ancienne classe ou établissement" className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">Niveau du Coran<input value={formData.quranLevel} onChange={(e) => setFormData({ ...formData, quranLevel: e.target.value })} maxLength={400} placeholder="Ex. Sourate, hizb ou niveau" className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">{t("Student address")}<input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">{t("Assigned class *")}<select required value={formData.classroomId} onChange={(e) => setFormData({ ...formData, classroomId: e.target.value, karate: ['TPS','PS'].includes(classes.find(c=>c.id===e.target.value)?.level) ? false : formData.karate, supplies: ['CI','CP','CE1','CE2','CM1','CM2'].includes(classes.find(c=>c.id===e.target.value)?.level) ? formData.supplies : false, fullDay: supportsFullDay(classes.find(c=>c.id===e.target.value)) ? formData.fullDay : false })} disabled={!classes.length} className={inputClass}><option value="">{classes.length ? t("Choose a class…") : t("No classes created")}</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} {t("— initial amount")}{(classroom.effectiveRegistrationFee ?? classroom.registrationFee)?.toLocaleString()} {t("F")}</option>)}</select>{!classes.length && <span className="mt-1 block text-amber-700">{t("Create a class in")}<Link className="underline" to="/classes">{t("Classes & Subjects")}</Link>.</span>}</label>
              </div></section>

              <section className="border-t border-slate-100 pt-5"><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-700">{t("2. Parent / legal guardian")}</h4><div className="mb-4 flex flex-wrap gap-4 text-xs">
                {ageWarning(formData.dateOfBirth, classes.find(c=>c.id===formData.classroomId)) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('Below the recommended minimum age; enrolment is permitted.')}</p>}<RegistrationFees value={formData} classroomId={formData.classroomId}/><SchoolOptions level={classes.find(c=>c.id===formData.classroomId)?.level} allowFullDay={supportsFullDay(classes.find(c=>c.id===formData.classroomId))} value={formData} program={programFor(classes.find(c=>c.id===formData.classroomId))} onChange={v=>setFormData(prev=>({...prev,...v, emergencyContactName:v.emergencyContactName || '',emergencyContactPhone:v.emergencyContactPhone || '',healthNotes:v.healthNotes || '',schoolItemsProvided:v.schoolItemsProvided || ''}))}/>
              <label className="flex items-center gap-2"><input type="radio" name="parentChoice" checked={formData.parentChoice === 'new'} onChange={() => setFormData({ ...formData, parentChoice: 'new' })} />{t("Nouveau parent")}</label>
                <label className="flex items-center gap-2"><input type="radio" name="parentChoice" checked={formData.parentChoice === 'existing'} onChange={() => setFormData({ ...formData, parentChoice: 'existing' })} />{t("Existing parent")}</label>
              </div>
              {formData.parentChoice === 'existing' ? <label className="text-xs font-medium text-slate-700">{t("Choose a parent")}<select value={formData.parentId} onChange={(e) => setFormData({ ...formData, parentId: e.target.value })} className={inputClass}><option value="">{t("Select…")}</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.firstName} {parent.lastName} — {parent.phone}</option>)}</select></label> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-700">{t("Parent’s first name *")}<input required value={formData.parentFirstName} onChange={(e) => setFormData({ ...formData, parentFirstName: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Parent’s last name")}<input value={formData.parentLastName} onChange={(e) => setFormData({ ...formData, parentLastName: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Phone *")}<input required value={formData.parentPhone} onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Parent’s email")}<input type="email" value={formData.parentEmail} onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700">{t("Relationship")}<select value={formData.parentRelation} onChange={(e) => setFormData({ ...formData, parentRelation: e.target.value })} className={inputClass}><option value="Father">{t("Father")}</option><option value="Mother">{t("Mother")}</option><option value="Guardian">{t("Guardian")}</option></select></label>
                <label className="text-xs font-medium text-slate-700">{t("Profession")}<input value={formData.parentProfession} onChange={(e) => setFormData({ ...formData, parentProfession: e.target.value })} className={inputClass} /></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">{t("Parent’s address")}<input value={formData.parentAddress} onChange={(e) => setFormData({ ...formData, parentAddress: e.target.value })} className={inputClass} /></label>
              </div>}
              <div className="mt-4 space-y-3">
                {formData.additionalGuardians.map((guardian, index) => <div key={index} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"><div className="mb-2 flex items-center justify-between"><b className="text-xs text-amber-800">Responsable supplémentaire {index + 1}</b><button type="button" onClick={() => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.filter((_, itemIndex) => itemIndex !== index) })} className="text-xs font-semibold text-rose-700">Retirer</button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">Lien<select value={guardian.relation} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, relation: e.target.value } : item) })} className={inputClass}><option value="Father">{t("Father")}</option><option value="Mother">{t("Mother")}</option><option value="Guardian">{t("Guardian")}</option></select></label>
                  <label className="text-xs font-medium text-slate-700">Prénom<input required value={guardian.firstName} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, firstName: e.target.value } : item) })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">Nom<input value={guardian.lastName} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, lastName: e.target.value } : item) })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">Téléphone<input required value={guardian.phone} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, phone: e.target.value } : item) })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">E-mail<input type="email" value={guardian.email} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, email: e.target.value } : item) })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">Profession<input value={guardian.profession} onChange={(e) => setFormData({ ...formData, additionalGuardians: formData.additionalGuardians.map((item, itemIndex) => itemIndex === index ? { ...item, profession: e.target.value } : item) })} className={inputClass} /></label>
                </div></div>)}
                {formData.additionalGuardians.length < 2 && <button type="button" onClick={() => setFormData({ ...formData, additionalGuardians: [...formData.additionalGuardians, emptyGuardian(formData.parentRelation === 'Father' ? 'Mother' : 'Father')] })} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">+ Ajouter la mère, le père ou un autre tuteur</button>}
                <p className="text-[11px] text-slate-500">Un seul responsable est obligatoire. Les autres sont facultatifs.</p>
              </div></section>

              <label className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs text-slate-700"><input type="checkbox" checked={formData.generateInvoice} onChange={(e) => setFormData({ ...formData, generateInvoice: e.target.checked })} className="mt-0.5 rounded text-amber-600" />{t("Automatically create the enrollment fee invoice")}</label>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600">{t("Cancel")}</button><button type="submit" disabled={!classes.length} className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{t("Confirm enrollment")}</button></div>
            </form>
          </div>
        </div>
      )}

      {showDetailsModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="max-h-[95dvh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 font-bold text-white">{selectedStudent.firstName?.[0]}{selectedStudent.lastName?.[0]}</div><div className="min-w-0"><h3 className="truncate font-bold text-slate-800">{selectedStudent.firstName} {selectedStudent.lastName}</h3><p className="font-mono text-xs text-amber-700">{t("Matricule :")}{selectedStudent.matricule}</p></div></div>
              <div className="flex items-center justify-end gap-2">{manager && <><button disabled={Boolean(selectedStudent.departure)} onClick={beginEdit} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />{t("Edit")}</button><Link to={`/refunds?studentId=${selectedStudent.id}`} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">{t("Départ / remboursement")}</Link></>}<button onClick={() => setShowDetailsModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label={t("Close record")}><X className="h-5 w-5" /></button></div>
            </div>
            <div className="border-b border-slate-100 px-4 sm:px-6"><div className="flex gap-5"><button onClick={() => { setDetailsTab('overview'); setEditingDetails(false); }} className={`border-b-2 py-3 text-xs font-semibold ${detailsTab === 'overview' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500'}`}>{t("Informations")}</button>{manager && <button onClick={() => { setDetailsTab('documents'); setEditingDetails(false); }} className={`border-b-2 py-3 text-xs font-semibold ${detailsTab === 'documents' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500'}`}>{t("Documents")}</button>}</div></div>

            {detailsTab === 'overview' && <div className="space-y-5 p-4 sm:p-6">{ageWarning(editingDetails ? editData?.dateOfBirth : selectedStudent.dateOfBirth,editingDetails ? classes.find(c=>c.id===editData?.classroomId) || selectedStudent.enrollments?.[0]?.classroom : selectedStudent.enrollments?.[0]?.classroom) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('Below the recommended minimum age; enrolment is permitted.')}</p>}
              {editingDetails && editData ? <form onSubmit={handleSaveDetails} className="space-y-5">
                <section><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-700">{t("Student information")}</h4><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">{t("First name(s)")}<input required value={editData.firstName} onChange={(e) => setEditData({ ...editData, firstName: e.target.value })} className={inputClass} /></label><label className="text-xs font-medium text-slate-700">{t("Last name")}<input required value={editData.lastName} onChange={(e) => setEditData({ ...editData, lastName: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">{t("Gender")}<select value={editData.gender} onChange={(e) => setEditData({ ...editData, gender: e.target.value, hairCare: e.target.value === 'FEMALE' ? editData.hairCare : false })} className={inputClass}><option value="MALE">{t("Boy")}</option><option value="FEMALE">{t("Girl")}</option></select></label><label className="text-xs font-medium text-slate-700">{t("Date of birth")}<input type="date" value={editData.dateOfBirth} onChange={(e) => setEditData({ ...editData, dateOfBirth: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">{t("Place of birth")}<input value={editData.placeOfBirth} onChange={(e) => setEditData({ ...editData, placeOfBirth: e.target.value })} className={inputClass} /></label><label className="text-xs font-medium text-slate-700">{t("Blood type")}<select value={editData.bloodGroup} onChange={(e) => setEditData({ ...editData, bloodGroup: e.target.value })} className={inputClass}><option value="">{t("Not provided")}</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select></label>
                  <label className="text-xs font-medium text-slate-700 sm:col-span-2">Matricule historique de l’école<input value={editData.schoolMatricule} onChange={(e) => setEditData({ ...editData, schoolMatricule: e.target.value })} maxLength={100} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">Classe d’origine<input value={editData.originClass} onChange={(e) => setEditData({ ...editData, originClass: e.target.value })} maxLength={400} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700">Niveau du Coran<input value={editData.quranLevel} onChange={(e) => setEditData({ ...editData, quranLevel: e.target.value })} maxLength={400} className={inputClass} /></label>
                  <label className="text-xs font-medium text-slate-700 sm:col-span-2">{t("Adresse")}<input value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className={inputClass} /></label><label className="text-xs font-medium text-slate-700 sm:col-span-2">{t("Current class")}<select value={editData.classroomId} onChange={(e) => setEditData({ ...editData, classroomId: e.target.value, karate: ['TPS','PS'].includes(classes.find(c=>c.id===e.target.value)?.level) ? false : editData.karate, supplies: ['CI','CP','CE1','CE2','CM1','CM2'].includes(classes.find(c=>c.id===e.target.value)?.level) ? editData.supplies : false, fullDay: supportsFullDay(classes.find(c=>c.id===e.target.value)) ? editData.fullDay : false })} className={inputClass}><option value="">{t("Keep unchanged")}</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
                </div></section>
                <section className="border-t border-slate-100 pt-4"><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-700">{t("Parent / guardian")}</h4><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['firstName', 'lastName', 'phone', 'email', 'relation', 'profession', 'address'] as const).map((field) => <label key={field} className="text-xs font-medium capitalize text-slate-700">{{firstName:t("First name"),lastName:t("Last name"),phone:t("Phone"),email:'E-mail',relation:t('Relationship'),profession:t("Profession"),address:t("Adresse")}[field]}<input type={field === 'email' ? 'email' : 'text'} value={field === 'relation' ? t(editData.parentData[field]) : editData.parentData[field]} onChange={(e) => setEditData({ ...editData, parentData: { ...editData.parentData, [field]: e.target.value } })} required={['firstName', 'lastName', 'phone'].includes(field)} className={inputClass} /></label>)}
                </div><div className="mt-4 space-y-3">{(editData.additionalGuardians || []).map((guardian:any,index:number) => <div key={index} className="rounded-xl border border-amber-100 p-3"><div className="mb-2 flex justify-between"><b className="text-xs text-amber-800">Responsable supplémentaire {index + 1}</b><button type="button" onClick={() => setEditData({ ...editData, additionalGuardians: editData.additionalGuardians.filter((_:any,itemIndex:number)=>itemIndex!==index) })} className="text-xs text-rose-700">Retirer</button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs">Lien<select value={guardian.relation} onChange={e=>setEditData({...editData,additionalGuardians:editData.additionalGuardians.map((item:any,itemIndex:number)=>itemIndex===index?{...item,relation:e.target.value}:item)})} className={inputClass}><option value="Father">{t('Father')}</option><option value="Mother">{t('Mother')}</option><option value="Guardian">{t('Guardian')}</option></select></label>{(['firstName','lastName','phone','email'] as const).map(field=><label key={field} className="text-xs">{{firstName:'Prénom',lastName:'Nom',phone:'Téléphone',email:'E-mail'}[field]}<input type={field==='email'?'email':'text'} required={field==='firstName'||field==='phone'} value={guardian[field]} onChange={e=>setEditData({...editData,additionalGuardians:editData.additionalGuardians.map((item:any,itemIndex:number)=>itemIndex===index?{...item,[field]:e.target.value}:item)})} className={inputClass}/></label>)}</div></div>)}{(editData.additionalGuardians || []).length<2&&<button type="button" onClick={()=>setEditData({...editData,additionalGuardians:[...(editData.additionalGuardians||[]),emptyGuardian('Guardian')]})} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">+ Ajouter un autre responsable</button>}</div></section>
                <RegistrationFees studentId={selectedStudent.id} value={editData} classroomId={editData.classroomId || selectedStudent.enrollments?.[0]?.classroomId}/><SchoolOptions level={(classes.find(c=>c.id===editData.classroomId) || selectedStudent.enrollments?.[0]?.classroom)?.level} allowFullDay={supportsFullDay(classes.find(c=>c.id===editData.classroomId) || selectedStudent.enrollments?.[0]?.classroom)} value={editData} program={programFor(classes.find(c=>c.id===editData.classroomId) || selectedStudent.enrollments?.[0]?.classroom)} onChange={v=>setEditData((prev:any)=>({...prev,...v}))}/><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingDetails(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600">{t("Cancel")}</button><button type="submit" disabled={savingDetails} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{savingDetails ? t("Saving…") : t("Save changes")}</button></div>
              </form> : <>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-4"><div><span className="block text-slate-400">{t("Born")}</span><b className="text-slate-800">{new Date(selectedStudent.dateOfBirth).toLocaleDateString(locale())}</b></div><div><span className="block text-slate-400">{t("Place")}</span><b className="text-slate-800">{selectedStudent.placeOfBirth || t("Not provided")}</b></div><div><span className="block text-slate-400">{t("Class")}</span><b className="text-amber-700">{selectedStudent.enrollments?.[0]?.classroom?.name || t("Unassigned")}</b></div><div><span className="block text-slate-400">{t("Blood type")}</span><b className="text-slate-800">{selectedStudent.bloodGroup || t("Not provided")}</b></div></div>
                {manager && <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><p>{t("Created by:")}<strong>{selectedStudent.createdByName || t("History unavailable")}</strong>{selectedStudent.createdByRole ? ` · ${roleLabel(selectedStudent.createdByRole)}` : ''}</p><p className="mt-1">{t("Class assigned by:")}<strong>{selectedStudent.enrollments?.[0]?.registeredByName || t("History unavailable")}</strong></p>{selectedStudent.updatedByName && <p className="mt-1">{t("Last updated by:")}<strong>{selectedStudent.updatedByName}</strong></p>}</div>}
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs"><div><span className="block text-slate-400">Matricule interne</span><b>{selectedStudent.matricule}</b></div><div><span className="block text-slate-400">Matricule historique école</span><b>{selectedStudent.schoolMatricule || 'Non renseigné'}</b></div><div><span className="block text-slate-400">Classe d’origine</span><b>{selectedStudent.originClass || 'Non renseignée'}</b></div><div><span className="block text-slate-400">Niveau du Coran</span><b>{selectedStudent.quranLevel || 'Non renseigné'}</b></div></div>
                {(selectedStudent.guardians?.length ? selectedStudent.guardians.map((item:any) => ({ ...item.parent, relation: item.relation })) : selectedStudent.parent ? [selectedStudent.parent] : []).map((parent:any, index:number) => <div key={parent.id || index} className="rounded-xl border border-slate-200 p-4"><h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Responsable {index + 1} · {t(parent.relation || 'Parent')}</h4><div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-800">{parent.firstName} {parent.lastName}</p><p className="text-slate-500">{parent.profession || t("Occupation not provided")}</p><p className="text-slate-500">{parent.email || ''}</p></div><span className="inline-flex items-center gap-1 text-slate-600"><Phone className="h-3.5 w-3.5 text-amber-600" />{parent.phone}</span></div></div>)}
              </>}
              <button type="button" onClick={()=>printStudentInformation(selectedStudent)} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white">{t('Print student information sheet')}</button>
              {!editingDetails && <SchoolOptions level={selectedStudent.enrollments?.[0]?.classroom?.level} allowFullDay={supportsFullDay(selectedStudent.enrollments?.[0]?.classroom)} value={selectedStudent} disabled program={programFor(selectedStudent.enrollments?.[0]?.classroom)} onChange={()=>{}}/>}
              <section className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_190px]">
                <div className="flex min-w-0 items-center gap-4">
                  {studentPhoto ? <img src={studentPhoto} alt={"Photo de " + selectedStudent.firstName + ' ' + selectedStudent.lastName} className="h-28 w-24 shrink-0 rounded-xl border border-slate-200 object-cover" /> : <div className="grid h-28 w-24 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><Users className="h-9 w-9" /></div>}
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800">{t("Student card")}</h4>
                    <p className="mt-1 text-xs text-slate-500">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                    <p className="font-mono text-xs text-amber-700">{selectedStudent.matricule}</p>
                    <p className="mt-2 text-[11px] text-slate-500">{selectedStudent.enrollments?.[0]?.classroom?.name || t("No class assigned")}</p>
                    {!studentPhoto && manager && <button type="button" onClick={() => setDetailsTab('documents')} className="mt-2 text-xs font-semibold text-amber-700 hover:underline">{t("Add an identity photo")}</button>}
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 p-3 text-center">
                  {studentQrCode ? <img src={studentQrCode} alt={"QR code de " + selectedStudent.matricule} className="h-32 w-32 mix-blend-multiply" /> : <div className="grid h-32 w-32 place-items-center text-slate-300"><QrCode className="h-14 w-14" /></div>}
                  <p className="mt-1 text-[10px] font-semibold text-slate-600">{t("Attendance QR code")}</p>
                  {studentQrCode && <a href={studentQrCode} download={"QR-" + selectedStudent.matricule + '.png'} className="mt-1 text-[11px] font-semibold text-amber-700 hover:underline">{t("Download QR code")}</a>}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">{t("Attendance summary —")}{attendanceSummary.total} {t("days")}</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-amber-50 p-3 text-center"><span className="block text-[10px] font-bold uppercase text-amber-700">{t("Present")}</span><b className="text-lg text-amber-800">{attendanceSummary.present}</b></div>
                  <div className="rounded-lg bg-rose-50 p-3 text-center"><span className="block text-[10px] font-bold uppercase text-rose-700">{t("Absences")}</span><b className="text-lg text-rose-800">{attendanceSummary.absent}</b></div>
                  <div className="rounded-lg bg-amber-50 p-3 text-center"><span className="block text-[10px] font-bold uppercase text-amber-700">{t("Lates")}</span><b className="text-lg text-amber-800">{attendanceSummary.late}</b></div>
                  <div className="rounded-lg bg-sky-50 p-3 text-center"><span className="block text-[10px] font-bold uppercase text-sky-700">{t("Excused")}</span><b className="text-lg text-sky-800">{attendanceSummary.excused}</b></div>
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">{t("Notes & bulletins")}</h4>
                {selectedStudent.reportCards?.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{selectedStudent.reportCards.map((card: any) => <span key={card.id} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">{card.term.replace('_', ' ')} {t("· moyenne")}<b>{Number(card.overallAverage).toFixed(2)}/20</b>{card.rank ? ' · rang ' + card.rank : ''}</span>)}</div>}
                {!selectedStudent.grades?.length ? <p className="text-xs text-slate-400">{t("No grades recorded")}</p> : <div className="max-h-56 space-y-2 overflow-auto">{selectedStudent.grades.map((grade: any) => <div key={grade.id} className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-800">{grade.subject?.name || t("Subject")}</p><p className="text-[11px] text-slate-500">{grade.term.replace('_', ' ')} · {grade.examType} · {new Date(grade.date).toLocaleDateString(locale())}</p></div><b className="text-amber-700">{Number(grade.score).toFixed(2)} / {Number(grade.maxScore).toFixed(2)}</b></div>)}</div>}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">{t("Attendance history")}</h4>
                {!selectedStudent.attendances?.length ? <p className="text-xs text-slate-400">{t("No attendance recorded")}</p> : <div className="max-h-56 space-y-2 overflow-auto">{selectedStudent.attendances.map((attendance: any) => <div key={attendance.id} className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><b className="text-slate-800">{new Date(attendance.date).toLocaleDateString(locale())}</b><span className="ml-2 text-slate-500">{attendance.classroom?.name || ''}</span>{attendance.reason && <p className="text-[11px] text-slate-500">{attendance.reason}{attendance.justified ? t(" · excused") : ''}</p>}</div><span className="font-semibold text-slate-700">{attendance.status === 'PRESENT' ? t("Present") : attendance.status === 'ABSENT' ? 'Absent' : attendance.status === 'LATE' ? t("Late") : t("Excused")}{attendance.checkInAt ? t(" · arrived at ") + new Date(attendance.checkInAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>)}</div>}
              </section>

              {canSeeFinances && <section><h4 className="mb-2 text-xs font-bold uppercase text-slate-500">{t("Financial history & invoices")}</h4><div className="space-y-2">{!selectedStudent.invoices?.length ? <p className="text-xs text-slate-400">{t("No invoices recorded")}</p> : selectedStudent.invoices.map((invoice: any) => {
                const refundRemaining = Number(invoice.discountRefundDue || 0) - Number(invoice.discountRefundedAmount || 0);
                return <div key={invoice.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-800">{invoice.title}</p><p className="text-[11px] text-slate-400">{invoice.invoiceNumber} {t("· Due:")}{new Date(invoice.dueDate).toLocaleDateString(locale())}</p>{invoice.discountAmount > 0 && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900"><b>{invoice.discountType === 'SOCIAL_CASE' ? 'Cas social' : 'Réduction accordée'} : −{invoice.discountAmount.toLocaleString()} FCFA</b><p>Montant normal : {Number(invoice.grossAmount || invoice.amount + invoice.discountAmount).toLocaleString()} FCFA</p><p>{invoice.discountReason}</p><p className="mt-1 text-[10px]">Validée par {invoice.discountApprovedByName || 'la direction'}{invoice.discountApprovedAt ? ` le ${new Date(invoice.discountApprovedAt).toLocaleDateString(locale())}` : ''}</p>{refundRemaining > 0 && <p className="mt-2 rounded bg-rose-100 p-2 font-bold text-rose-800">Trop-perçu à rendre au parent : {refundRemaining.toLocaleString()} FCFA</p>}{Number(invoice.discountRefundedAmount || 0) > 0 && <p className="mt-2 rounded bg-emerald-100 p-2 font-bold text-emerald-800">Remboursé au parent : {Number(invoice.discountRefundedAmount).toLocaleString()} FCFA{invoice.discountRefundedAt ? ` le ${new Date(invoice.discountRefundedAt).toLocaleDateString(locale())}` : ''}</p>}</div>}</div><div className="sm:text-right"><p className="font-bold text-slate-800">{invoice.amount.toLocaleString()} {t("FCFA")}</p><span className="inline-block rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">{invoice.cancelledAt ? 'Annulée' : invoice.status === 'PAID' ? t("Paid") : invoice.status === 'PARTIAL' ? t("Balance: {0} F", [invoice.balance.toLocaleString()]) : t("Unpaid")}</span>{isDirector && invoice.type === 'REGISTRATION' && !invoice.cancelledAt && Number(invoice.discountRefundedAmount || 0) === 0 && <button type="button" onClick={() => openDiscount(invoice)} className="mt-2 block rounded-lg border border-amber-300 px-3 py-2 font-semibold text-amber-900">{invoice.discountAmount > 0 ? 'Modifier la réduction' : 'Accorder une réduction'}</button>}{isAccountant && refundRemaining > 0 && <button type="button" onClick={() => openDiscountRefund(invoice)} className="mt-2 block rounded-lg bg-rose-700 px-3 py-2 font-semibold text-white">Rembourser le parent</button>}</div></div>;
              })}</div></section>}
            </div>}

            {detailsTab === 'documents' && manager && <div className="space-y-6 p-4 sm:p-6">
              <div><h4 className="mb-3 text-sm font-bold text-slate-800">{t("Student documents")}</h4>{renderDocumentSection('student', selectedStudent.id, studentDocuments, selectedStudent.documents || [])}</div>
              {selectedStudent.parent && <div className="border-t border-slate-100 pt-5"><h4 className="mb-3 text-sm font-bold text-slate-800">{t("Parent documents —")}{selectedStudent.parent.firstName} {selectedStudent.parent.lastName}</h4>{renderDocumentSection('parent', selectedStudent.parent.id, parentDocuments, selectedStudent.parent.documents || [])}</div>}
              {documentError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{documentError}</div>}
              <p className="text-xs text-slate-400">{t("Formats: PDF, JPG, PNG, WEBP · 10 MB maximum per file. Files are stored in the application’s private storage.")}</p>
            </div>}
          </div>
        </div>
      )}
      {refundInvoice && selectedStudent && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={saveDiscountRefund} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">Rembourser le trop-perçu</h3><p className="text-xs text-slate-500">{selectedStudent.firstName} {selectedStudent.lastName} · {refundInvoice.invoiceNumber}</p></div><button type="button" onClick={() => setRefundInvoice(null)} aria-label="Fermer"><X className="h-5 w-5" /></button></div><div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p>Montant à remettre au parent</p><b className="text-lg">{(Number(refundInvoice.discountRefundDue || 0) - Number(refundInvoice.discountRefundedAmount || 0)).toLocaleString()} FCFA</b><p className="mt-1 text-xs">Validez seulement après avoir réellement remis ce montant. L’opération diminuera la caisse du jour.</p></div><label className="block text-sm font-medium">Date du remboursement<input required type="date" max={new Date().toISOString().slice(0, 10)} value={refundForm.refundedOn} onChange={e => setRefundForm({ ...refundForm, refundedOn: e.target.value })} className={inputClass}/></label><label className="block text-sm font-medium">Mode de remboursement<select value={refundForm.paymentMethod} onChange={e => setRefundForm({ ...refundForm, paymentMethod: e.target.value })} className={inputClass}><option value="CASH">Espèces</option><option value="WAVE">Wave</option><option value="ORANGE_MONEY">Orange Money</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHECK">Chèque</option></select></label><label className="block text-sm font-medium">Bénéficiaire<input required minLength={2} maxLength={150} value={refundForm.recipient} onChange={e => setRefundForm({ ...refundForm, recipient: e.target.value })} placeholder="Nom du parent ou tuteur" className={inputClass}/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setRefundInvoice(null)} className="rounded-lg border px-4 py-2">Annuler</button><button disabled={savingRefund} className="rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{savingRefund ? 'Enregistrement…' : 'Confirmer le remboursement'}</button></div></form></div>}
      {discountInvoice && selectedStudent && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={saveDiscount} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">Réduction sur l’inscription</h3><p className="text-xs text-slate-500">{selectedStudent.firstName} {selectedStudent.lastName} · {discountInvoice.invoiceNumber}</p></div><button type="button" onClick={() => setDiscountInvoice(null)} aria-label="Fermer"><X className="h-5 w-5" /></button></div><div className="rounded-lg bg-slate-50 p-3 text-sm"><p>Montant normal : <b>{Number(discountInvoice.grossAmount || discountInvoice.amount + (discountInvoice.discountAmount || 0)).toLocaleString()} FCFA</b></p><p>Déjà encaissé : <b>{Number(discountInvoice.paidAmount || 0).toLocaleString()} FCFA</b></p></div><label className="block text-sm font-medium">Type<select value={discountForm.type} onChange={e => setDiscountForm({ ...discountForm, type: e.target.value })} className={inputClass}><option value="DISCOUNT">Réduction accordée</option><option value="SOCIAL_CASE">Cas social</option></select></label><label className="block text-sm font-medium">Montant de la réduction (FCFA)<input required type="number" min="0" step="1" max={Number(discountInvoice.grossAmount || discountInvoice.amount + (discountInvoice.discountAmount || 0))} value={discountForm.amount} onChange={e => setDiscountForm({ ...discountForm, amount: e.target.value })} className={inputClass}/></label><label className="block text-sm font-medium">Justification<textarea required={Number(discountForm.amount) > 0} minLength={Number(discountForm.amount) > 0 ? 10 : undefined} maxLength={1000} value={discountForm.reason} onChange={e => setDiscountForm({ ...discountForm, reason: e.target.value })} placeholder="Expliquez la décision de la direction…" className={inputClass}/></label><p className="text-xs text-slate-500">Saisissez 0 pour retirer une réduction existante. Toutes les décisions sont conservées dans le journal d’audit.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setDiscountInvoice(null)} className="rounded-lg border px-4 py-2">Annuler</button><button disabled={savingDiscount} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{savingDiscount ? 'Enregistrement…' : 'Valider par la direction'}</button></div></form></div>}
    </div>
  );
};
