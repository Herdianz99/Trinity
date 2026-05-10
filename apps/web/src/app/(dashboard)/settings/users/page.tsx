'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Pencil,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Copy,
  Check,
  X,
  Search,
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-500/15 text-red-400 border-red-500/30',
  SUPERVISOR: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CASHIER: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  SELLER: 'bg-green-500/15 text-green-400 border-green-500/30',
  WAREHOUSE: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  BUYER: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  ACCOUNTANT: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const ROLES = ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE', 'BUYER', 'ACCOUNTANT'];

function formatDate(date: string | null) {
  if (!date) return 'Nunca';
  return new Date(date).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('SELLER');
  const [formPassword, setFormPassword] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const body: any = { name: formName, email: formEmail, role: formRole };
      if (formPassword) body.password = formPassword;
      const res = await fetch('/api/proxy/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg);
      }
      setShowCreate(false);
      setTempPassword(data.temporaryPassword);
      setShowPassword(true);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError('');
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          role: formRole,
          isActive: formActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg);
      }
      setShowEdit(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/users/${selectedUser.id}/reset-password`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowReset(false);
      setTempPassword(data.temporaryPassword);
      setShowPassword(true);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleActive(user: User) {
    try {
      const res = await fetch(`/api/proxy/users/${user.id}/toggle-active`, { method: 'PATCH' });
      if (res.ok) fetchUsers();
    } catch {}
  }

  async function handleDelete() {
    if (!selectedUser) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/users/${selectedUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowDeleteConfirm(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  function openCreate() {
    setFormName('');
    setFormEmail('');
    setFormRole('SELLER');
    setFormPassword('');
    setFormError('');
    setShowCreate(true);
  }

  function openEdit(user: User) {
    setSelectedUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormActive(user.isActive);
    setFormError('');
    setShowEdit(true);
  }

  function openReset(user: User) {
    setSelectedUser(user);
    setFormError('');
    setShowReset(true);
  }

  function openDelete(user: User) {
    setSelectedUser(user);
    setFormError('');
    setShowDeleteConfirm(true);
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Users size={22} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Usuarios</h1>
            <p className="text-sm text-slate-400">Gestionar usuarios del sistema</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Nuevo usuario
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nombre, email o rol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Nombre</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Ultimo acceso</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-200">{user.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-400">{user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[user.role] || 'bg-slate-500/15 text-slate-400'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-500">{formatDate(user.lastLoginAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        user.isActive
                          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => openReset(user)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Resetear contrasena"
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.isActive
                              ? 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10'
                              : 'text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                          }`}
                          title={user.isActive ? 'Desactivar' : 'Activar'}
                        >
                          {user.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button
                          onClick={() => openDelete(user)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
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

      {/* Modal: Create User */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nuevo usuario">
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre completo</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Rol</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="input-field"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Contrasena temporal <span className="text-slate-500">(opcional — se genera automaticamente)</span>
              </label>
              <input
                type="text"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="input-field"
                placeholder="Dejar vacio para generar"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={formLoading} className="btn-primary">
                {formLoading ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit User */}
      {showEdit && selectedUser && (
        <Modal onClose={() => setShowEdit(false)} title="Editar usuario">
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre completo</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Rol</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="input-field"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-300">Estado:</label>
              <button
                type="button"
                onClick={() => setFormActive(!formActive)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  formActive
                    ? 'bg-green-500/15 text-green-400 border-green-500/30'
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}
              >
                {formActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {formActive ? 'Activo' : 'Inactivo'}
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowEdit(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={formLoading} className="btn-primary">
                {formLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Reset Password Confirm */}
      {showReset && selectedUser && (
        <Modal onClose={() => setShowReset(false)} title="Resetear contrasena">
          <div className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <p className="text-slate-300">
              ¿Resetear la contrasena de <strong className="text-white">{selectedUser.name}</strong>?
            </p>
            <p className="text-sm text-slate-500">
              Se generara una nueva contrasena temporal y el usuario debera cambiarla al iniciar sesion.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowReset(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={formLoading}
                className="btn-primary bg-amber-600 hover:bg-amber-700 border-amber-700"
              >
                {formLoading ? 'Reseteando...' : 'Resetear contrasena'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Delete Confirm */}
      {showDeleteConfirm && selectedUser && (
        <Modal onClose={() => setShowDeleteConfirm(false)} title="Eliminar usuario">
          <div className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <p className="text-slate-300">
              ¿Eliminar permanentemente a <strong className="text-white">{selectedUser.name}</strong>?
            </p>
            <p className="text-sm text-red-400">
              Esta accion no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={formLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                {formLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Show Generated Password */}
      {showPassword && (
        <Modal onClose={() => { setShowPassword(false); setTempPassword(''); setCopied(false); }} title="Contrasena generada">
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              La contrasena temporal del usuario es:
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 border border-slate-700">
              <code className="flex-1 text-lg font-mono text-green-400 select-all">
                {tempPassword}
              </code>
              <button
                onClick={copyPassword}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                title="Copiar"
              >
                {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-slate-400" />}
              </button>
            </div>
            <p className="text-xs text-amber-400">
              Comunica esta contrasena al usuario. Debera cambiarla al iniciar sesion por primera vez.
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setShowPassword(false); setTempPassword(''); setCopied(false); }}
                className="btn-primary"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
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
