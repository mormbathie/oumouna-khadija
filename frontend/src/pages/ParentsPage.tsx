import { t } from "../i18n/index";
import React, { useEffect, useState } from 'react';
import {
  UserCheck,
  UserPlus,
  Search,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  GraduationCap,
  X,
  Plus
} from 'lucide-react';
import { parentsApi } from '../services/api';

export const ParentsPage: React.FC = () => {
  const [parents, setParents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: 'Dakar',
    profession: '',
    relation: 'Father',
  });

  const loadParents = async () => {
    try {
      setLoading(true);
      const res = await parentsApi.getAll(search);
      setParents(res);
    } catch (err) {
      console.error('Failed to load parents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParents();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadParents();
  };

  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await parentsApi.create(formData);
      setShowAddModal(false);
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        address: 'Dakar',
        profession: '',
        relation: 'Father',
      });
      loadParents();
    } catch (err: any) {
      alert(t("Error: {0}", [err.message || 'Unable to create the parent']));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t("Parents d'Students & Guardians")}</h2>
          <p className="text-xs text-slate-500">
            {t("Directory of guardians and their children")}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-md transition"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t("Add a Parent")}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
          <input
            type="text"
            placeholder={t("Search by name, phone, or email…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </form>
        <span className="text-xs text-slate-500 font-medium">
          {t("Total :")}<span className="text-slate-800 font-bold">{parents.length}</span> {t("parents registered")}</span>
      </div>

      {/* Parents Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">{t("Loading parents…")}</div>
      ) : parents.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">{t("No parents found.")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {parents.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm">
                      {p.firstName[0]}
                      {p.lastName[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800">
                        {p.firstName} {p.lastName}
                      </h3>
                      <span className="text-[11px] bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full inline-block">
                        {t(p.relation || 'Parent')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-medium text-slate-800">{p.phone}</span>
                  </div>
                  {p.email && (
                    <div className="flex items-center space-x-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </div>
                  )}
                  {p.profession && (
                    <div className="flex items-center space-x-2">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{p.profession}</span>
                    </div>
                  )}
                  {p.address && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{p.address}</span>
                    </div>
                  )}
                </div>

                {/* Enfants rattachés */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                    {t("Enfants inscrits (")}{p.students?.length || 0})
                  </span>
                  <div className="space-y-1.5">
                    {p.students?.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">{t("No students linked")}</span>
                    ) : (
                      p.students?.map((s: any) => {
                        const className = s.enrollments?.[0]?.classroom?.name || 'CI';
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-slate-50 p-2 rounded-lg text-xs"
                          >
                            <span className="font-semibold text-slate-700">
                              {s.firstName} {s.lastName}
                            </span>
                            <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-medium">
                              {className}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Nouveau Parent */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800">{t("Add a Parent / Guardian")}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParent} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("First name *")}</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Last name *")}</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Phone *")}</label>
                <input
                  type="text"
                  required
                  placeholder="+221 77 000 00 00"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Email")}</label>
                <input
                  type="email"
                  placeholder="parent@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Relationship")}</label>
                  <select
                    value={formData.relation}
                    onChange={(e) => setFormData({ ...formData, relation: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="Father">{t("Father")}</option>
                    <option value="Mother">{t("Mother")}</option>
                    <option value="Guardian">{t("Guardian / Tutrice")}</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">{t("Profession")}</label>
                  <input
                    type="text"
                    placeholder={t("Ex: Enseignant")}
                    value={formData.profession}
                    onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">{t("Adresse")}</label>
                <input
                  type="text"
                  placeholder="Quartier, Ville"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  {t("Cancel")}</button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-md"
                >
                  {t("Save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
