'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Plus,
  Pencil,
  Link2,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';

interface Seller {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  userId: string | null;
  user?: { id: string; name: string; email: string } | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLinkUser, setShowLinkUser] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Link user states
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const fetchSellers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/sellers');
      if (res.ok) {
        const data = await res.json();
        setSellers(data);
      }
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/proxy/users');
      if (res.ok) {
        const data: UserOption[] = await res.json();
        setUsers(data.filter((u) => u.isActive));
      }
    } catch {
      /* empty */
    } finally {
      setUsersLoading(false);
    }
  }

  // Get user IDs that are already assigned to a seller (excluding the currently selected seller)
  function getAssignedUserIds(): Set<string> {
    const ids = new Set<string>();
    for (const s of sellers) {
      if (s.userId && s.id !== selectedSeller?.id) {
        ids.add(s.userId);
      }
    }
    return ids;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const res = await fetch('/api/proxy/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, phone: formPhone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg);
      }
      setShowCreate(false);
      fetchSellers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeller) return;
    setFormError('');
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/sellers/${selectedSeller.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, phone: formPhone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg);
      }
      setShowEdit(false);
      fetchSellers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleActive(seller: Seller) {
    try {
      const res = await fetch(`/api/proxy/sellers/${seller.id}/toggle-active`, {
        method: 'PATCH',
      });
      if (res.ok) fetchSellers();
    } catch {
      /* empty */
    }
  }

  async function handleAssignUser() {
    if (!selectedSeller) return;
    setFormError('');
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/sellers/${selectedSeller.id}/assign-user`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg);
      }
      setShowLinkUser(false);
      fetchSellers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  function openCreate() {
    setFormName('');
    setFormPhone('');
    setFormError('');
    setShowCreate(true);
  }

  function openEdit(seller: Seller) {
    setSelectedSeller(seller);
    setFormName(seller.name);
    setFormPhone(seller.phone || '');
    setFormError('');
    setShowEdit(true);
  }

  function openLinkUser(seller: Seller) {
    setSelectedSeller(seller);
    setSelectedUserId(seller.userId || '');
    setFormError('');
    setShowLinkUser(true);
    fetchUsers();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <UserCheck size={22} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Vendedores</h1>
            <p className="text-sm text-slate-400">Gestionar vendedores del sistema</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          Nuevo vendedor
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Codigo
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Nombre
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Telefono
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Usuario vinculado
                </th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Estado
                </th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : sellers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No hay vendedores registrados
                  </td>
                </tr>
              ) : (
                sellers.map((seller) => (
                  <tr
                    key={seller.id}
                    className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                      {seller.code}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-200">
                        {seller.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {seller.phone || <span className="text-slate-600">--</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {seller.user ? (
                        <span className="text-slate-200">{seller.user.name}</span>
                      ) : (
                        <span className="text-slate-600">Sin usuario</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          seller.isActive
                            ? 'bg-green-500/15 text-green-400 border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                        }`}
                      >
                        {seller.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(seller)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => openLinkUser(seller)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                          title="Vincular usuario"
                        >
                          <Link2 size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(seller)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            seller.isActive
                              ? 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10'
                              : 'text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                          }`}
                          title={seller.isActive ? 'Desactivar' : 'Activar'}
                        >
                          {seller.isActive ? (
                            <ToggleRight size={16} />
                          ) : (
                            <ToggleLeft size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Seller */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nuevo vendedor">
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Nombre
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Nombre del vendedor"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Telefono
              </label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Numero de telefono"
              />
            </div>
            <p className="text-xs text-slate-500">
              El codigo del vendedor se genera automaticamente.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Seller */}
      {showEdit && selectedSeller && (
        <Modal onClose={() => setShowEdit(false)} title="Editar vendedor">
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Codigo
              </label>
              <input
                type="text"
                value={selectedSeller.code}
                disabled
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Nombre
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Nombre del vendedor"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Telefono
              </label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Numero de telefono"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Link User */}
      {showLinkUser && selectedSeller && (
        <Modal onClose={() => setShowLinkUser(false)} title="Vincular usuario">
          <div className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <p className="text-sm text-slate-400">
              Vincular un usuario del sistema al vendedor{' '}
              <strong className="text-white">{selectedSeller.name}</strong>.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Usuario
              </label>
              {usersLoading ? (
                <p className="text-sm text-slate-500">Cargando usuarios...</p>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
                >
                  <option value="">Sin usuario</option>
                  {users
                    .filter((u) => !getAssignedUserIds().has(u.id) || u.id === selectedSeller.userId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLinkUser(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignUser}
                disabled={formLoading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
      {message}
    </div>
  );
}
