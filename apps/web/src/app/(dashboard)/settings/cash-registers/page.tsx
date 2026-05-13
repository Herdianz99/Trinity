'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  X,
  Loader2,
} from 'lucide-react';

interface CashRegisterSession {
  id: string;
  status: string;
}

interface CashRegister {
  id: string;
  name: string;
  code: string;
  isFiscal: boolean;
  isActive: boolean;
  sessions: CashRegisterSession[];
  createdAt: string;
}

export default function CashRegistersPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRegister, setEditingRegister] = useState<CashRegister | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formIsFiscal, setFormIsFiscal] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRegisters = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/cash-registers/admin');
      if (res.ok) {
        const data = await res.json();
        setRegisters(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegisters();
  }, [fetchRegisters]);

  function openCreate() {
    setEditingRegister(null);
    setFormName('');
    setFormCode('');
    setFormIsFiscal(false);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(register: CashRegister) {
    setEditingRegister(register);
    setFormName(register.name);
    setFormCode(register.code);
    setFormIsFiscal(register.isFiscal);
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const body = { name: formName, code: formCode, isFiscal: formIsFiscal };

      const url = editingRegister
        ? `/api/proxy/cash-registers/${editingRegister.id}/update`
        : '/api/proxy/cash-registers';
      const method = editingRegister ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(msg || 'Error al guardar');
      }

      setModalOpen(false);
      fetchRegisters();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(register: CashRegister) {
    try {
      const res = await fetch(`/api/proxy/cash-registers/${register.id}/toggle-active`, {
        method: 'PATCH',
      });
      if (res.ok) fetchRegisters();
    } catch {
      /* ignore */
    }
  }

  function getOpenSessionsCount(register: CashRegister): number {
    if (!register.sessions || !Array.isArray(register.sessions)) return 0;
    return register.sessions.filter((s) => s.status === 'OPEN').length;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Monitor size={22} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cajas registradoras</h1>
            <p className="text-sm text-slate-400">
              {registers.length} caja{registers.length !== 1 ? 's' : ''} registrada{registers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          Nueva caja
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
                  Tipo
                </th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Sesiones activas
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
                  <td colSpan={6} className="text-center py-12">
                    <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                  </td>
                </tr>
              ) : registers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No hay cajas registradoras registradas
                  </td>
                </tr>
              ) : (
                registers.map((register) => {
                  const openSessions = getOpenSessionsCount(register);
                  return (
                    <tr
                      key={register.id}
                      className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                        {register.code}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                        {register.name}
                      </td>
                      <td className="px-4 py-3">
                        {register.isFiscal ? (
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs">
                            Fiscal
                          </span>
                        ) : (
                          <span className="bg-slate-500/15 text-slate-400 border border-slate-500/30 px-2 py-0.5 rounded-full text-xs">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 text-center">
                        {openSessions > 0 ? (
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs">
                            {openSessions}
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {register.isActive ? (
                          <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full text-xs">
                            Activo
                          </span>
                        ) : (
                          <span className="bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-xs">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(register)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(register)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              register.isActive
                                ? 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10'
                                : 'text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                            }`}
                            title={register.isActive ? 'Desactivar' : 'Activar'}
                          >
                            {register.isActive ? (
                              <ToggleRight size={16} />
                            ) : (
                              <ToggleLeft size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create / Edit */}
      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          title={editingRegister ? 'Editar caja' : 'Nueva caja'}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Nombre
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Ej: Caja Principal"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Codigo <span className="text-slate-500">(2 digitos)</span>
              </label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setFormCode(val);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                placeholder="Ej: 01"
                maxLength={2}
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-300">Es fiscal:</label>
              <button
                type="button"
                onClick={() => setFormIsFiscal(!formIsFiscal)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  formIsFiscal
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                }`}
              >
                {formIsFiscal ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {formIsFiscal ? 'Si' : 'No'}
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                {editingRegister ? 'Guardar cambios' : 'Crear caja'}
              </button>
            </div>
          </form>
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
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
