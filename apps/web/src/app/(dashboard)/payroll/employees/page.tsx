'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Plus, Pencil, X, Search, Loader2, UserCog, FileSpreadsheet, FileText,
} from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface EmployeeCustomer {
  id: string;
  name: string;
  documentType: string | null;
  rif: string | null;
  phone: string | null;
}

interface MasterRef {
  id: string;
  name: string;
}

interface PositionOption {
  id: string;
  name: string;
  defaultSalaryUsd: number;
  defaultBonusUsd: number;
}

interface Employee {
  id: string;
  code: string | null;
  departmentId: string | null;
  positionId: string | null;
  department: MasterRef | null;
  position: MasterRef | null;
  bank: string | null;
  salaryBaseUsd: number;
  bonusUsd: number;
  frequency: string;
  isActive: boolean;
  status: string;
  statusFrom: string | null;
  statusTo: string | null;
  statusNote: string | null;
  customer: EmployeeCustomer;
}

// Mismo orden y regla que apps/api/src/modules/payroll/employee-status.ts (inPayroll = entra en nómina).
const STATUSES: { key: string; label: string; inPayroll: boolean; cls: string; dot: string }[] = [
  { key: 'ACTIVE', label: 'Activo', inPayroll: true, cls: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400' },
  { key: 'VACATION', label: 'Vacaciones', inPayroll: true, cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30', dot: 'bg-sky-400' },
  { key: 'MEDICAL_LEAVE', label: 'Reposo', inPayroll: true, cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
  { key: 'SPECIAL_LEAVE', label: 'Permiso especial', inPayroll: true, cls: 'bg-violet-500/15 text-violet-400 border-violet-500/30', dot: 'bg-violet-400' },
  { key: 'INACTIVE', label: 'Inactivo', inPayroll: false, cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
  { key: 'VOLUNTARY_RESIGNATION', label: 'Retiro voluntario', inPayroll: false, cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' },
  { key: 'JUSTIFIED_DISMISSAL', label: 'Despido justificado', inPayroll: false, cls: 'bg-rose-700/20 text-rose-400 border-rose-600/30', dot: 'bg-rose-500' },
];
const STATUS_BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

// statusFrom/statusTo son fechas-calendario a medianoche UTC → leer la parte YYYY-MM-DD sin convertir.
const ymd = (d: string | null) => (d ? d.slice(0, 10) : '');
const fmtYmd = (d: string | null) => { const s = ymd(d); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ''; };

interface CustomerOption {
  id: string;
  name: string;
  documentType: string | null;
  rif: string | null;
}

const FREQ_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' = todos

  // Modal de cambio de estado
  const [statusEmp, setStatusEmp] = useState<Employee | null>(null);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusFrom, setStatusFrom] = useState('');
  const [statusTo, setStatusTo] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);

  // Masters (cargados una vez)
  const [departments, setDepartments] = useState<MasterRef[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);

  // Form (shared)
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [bank, setBank] = useState('');
  const [salaryBaseUsd, setSalaryBaseUsd] = useState(0);
  const [bonusUsd, setBonusUsd] = useState(0);
  const [frequency, setFrequency] = useState('WEEKLY');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Create-only: modo de ficha (nueva vs existente)
  const [customerMode, setCustomerMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState('');
  const [newDocType, setNewDocType] = useState('V');
  const [newRif, setNewRif] = useState('');
  const [newPhone, setNewPhone] = useState('');
  // combobox cliente existente
  const [comboQuery, setComboQuery] = useState('');
  const [comboResults, setComboResults] = useState<CustomerOption[]>([]);
  const [comboOpen, setComboOpen] = useState(false);
  const [comboLoading, setComboLoading] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<CustomerOption | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEmployees = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      const res = await fetch(`/api/proxy/employees?${params}`);
      if (res.ok) setEmployees(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'Empleados | Trinity ERP'; }, []);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // Cargar maestros de departamentos y cargos (solo activos)
  const fetchMasters = useCallback(async () => {
    try {
      const [dRes, pRes] = await Promise.all([
        fetch('/api/proxy/departments'),
        fetch('/api/proxy/positions'),
      ]);
      if (dRes.ok) setDepartments((await dRes.json()).filter((d: any) => d.isActive));
      if (pRes.ok) setPositions((await pRes.json()).filter((p: any) => p.isActive));
    } catch { /* empty */ }
  }, []);
  useEffect(() => { fetchMasters(); }, [fetchMasters]);

  // Debounced list search
  useEffect(() => {
    const t = setTimeout(() => fetchEmployees(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, fetchEmployees]);

  // Debounced customer combobox
  useEffect(() => {
    if (customerMode !== 'existing' || comboQuery.length < 2) {
      setComboResults([]); setComboOpen(false); return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setComboLoading(true);
      try {
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(comboQuery)}&limit=15`);
        const json = await res.json();
        setComboResults(json.data || []);
        setComboOpen(true);
      } catch { /* empty */ }
      setComboLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [comboQuery, customerMode]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function resetForm() {
    setDepartmentId(''); setPositionId(''); setBank(''); setSalaryBaseUsd(0); setBonusUsd(0); setFrequency('WEEKLY');
    setCustomerMode('new'); setNewName(''); setNewDocType('V'); setNewRif(''); setNewPhone('');
    setComboQuery(''); setComboResults([]); setPickedCustomer(null); setFormError('');
  }

  function openCreate() { resetForm(); setShowCreate(true); }

  function openEdit(emp: Employee) {
    setSelected(emp);
    setDepartmentId(emp.departmentId || '');
    setPositionId(emp.positionId || '');
    setBank(emp.bank || '');
    setSalaryBaseUsd(emp.salaryBaseUsd);
    setBonusUsd(emp.bonusUsd);
    setFrequency(emp.frequency);
    setFormError('');
    setShowEdit(true);
  }

  // Autollenado al elegir cargo: sueldo y bonificación toman el default del cargo (editables).
  function onSelectPosition(id: string) {
    setPositionId(id);
    const pos = positions.find((p) => p.id === id);
    if (pos) {
      setSalaryBaseUsd(pos.defaultSalaryUsd);
      setBonusUsd(pos.defaultBonusUsd);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (customerMode === 'existing' && !pickedCustomer) {
      setFormError('Seleccione un cliente existente o cambie a "Nuevo".');
      return;
    }
    setFormLoading(true);
    try {
      const body: any = {
        departmentId: departmentId || undefined, positionId: positionId || undefined,
        bank: bank || undefined, salaryBaseUsd, bonusUsd, frequency,
      };
      if (customerMode === 'existing') {
        body.customerId = pickedCustomer!.id;
      } else {
        body.newCustomer = { name: newName, documentType: newDocType, rif: newRif || undefined, phone: newPhone || undefined };
      }
      const res = await fetch('/api/proxy/employees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setShowCreate(false);
      fetchEmployees(search);
    } catch (err: any) { setFormError(err.message); }
    finally { setFormLoading(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setFormError('');
    setFormLoading(true);
    try {
      const res = await fetch(`/api/proxy/employees/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId: departmentId || undefined, positionId: positionId || undefined, bank: bank || undefined, salaryBaseUsd, bonusUsd, frequency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setShowEdit(false);
      fetchEmployees(search);
    } catch (err: any) { setFormError(err.message); }
    finally { setFormLoading(false); }
  }

  function openStatus(emp: Employee) {
    setStatusEmp(emp);
    setNewStatus(emp.status || (emp.isActive ? 'ACTIVE' : 'INACTIVE'));
    setStatusFrom(ymd(emp.statusFrom));
    setStatusTo(ymd(emp.statusTo));
    setStatusNote(emp.statusNote || '');
    setStatusError('');
  }

  async function handleStatusSave(e: React.FormEvent) {
    e.preventDefault();
    if (!statusEmp) return;
    if (statusFrom && statusTo && statusTo < statusFrom) { setStatusError('La fecha "hasta" no puede ser anterior a "desde".'); return; }
    setStatusSaving(true); setStatusError('');
    try {
      const detail = newStatus !== 'ACTIVE';
      const res = await fetch(`/api/proxy/employees/${statusEmp.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          statusFrom: detail && statusFrom ? statusFrom : undefined,
          statusTo: detail && statusTo ? statusTo : undefined,
          statusNote: detail && statusNote.trim() ? statusNote.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setStatusEmp(null);
      fetchEmployees(search);
    } catch (err: any) { setStatusError(err.message || 'Error al guardar'); }
    finally { setStatusSaving(false); }
  }

  // Filtro por estado en el navegador (la lista es corta); los reportes usan el mismo filtro en el servidor.
  const counts = employees.reduce<Record<string, number>>((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});
  const visible = statusFilter ? employees.filter((e) => e.status === statusFilter) : employees;

  function openReport(kind: 'pdf' | 'xlsx') {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    window.open(`/api/proxy/employees/report/${kind}?${params}`, '_blank');
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
            <h1 className="text-2xl font-bold text-white">Empleados</h1>
            <p className="text-sm text-slate-400">Fichas de nómina (reusan la ficha de cliente)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openReport('xlsx')} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-2" title="Reporte en Excel con los filtros actuales">
            <FileSpreadsheet size={16} className="text-emerald-400" /> Excel
          </button>
          <button onClick={() => openReport('pdf')} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-2" title="Reporte en PDF con los filtros actuales">
            <FileText size={16} className="text-red-400" /> PDF
          </button>
          <button
            onClick={openCreate}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo empleado
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código, cargo o RIF..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
        />
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')} label="Todos" count={employees.length} />
        {STATUSES.map((s) => (
          <FilterChip key={s.key} active={statusFilter === s.key} onClick={() => setStatusFilter(s.key)} label={s.label} count={counts[s.key] || 0} dot={s.dot} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                <Th>Código</Th>
                <Th>Empleado</Th>
                <Th>Departamento</Th>
                <Th>Cargo</Th>
                <Th>Frecuencia</Th>
                <Th className="text-right">Sueldo base USD</Th>
                <Th className="text-right">Bono USD</Th>
                <Th className="text-center">Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-500">Cargando...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-500">{statusFilter ? `No hay empleados en estado "${STATUS_BY_KEY[statusFilter]?.label}"` : 'No hay empleados registrados'}</td></tr>
              ) : visible.map((emp) => (
                <tr key={emp.id} onClick={() => openEdit(emp)} className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-sm text-slate-300 font-mono">{emp.code || '--'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-slate-200">{emp.customer.name}</span>
                    {(emp.customer.rif || emp.customer.documentType) && (
                      <span className="block text-xs text-slate-500">
                        {emp.customer.documentType || ''}{emp.customer.rif ? `-${emp.customer.rif}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{emp.department?.name || <span className="text-slate-600">--</span>}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{emp.position?.name || <span className="text-slate-600">--</span>}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{FREQ_LABEL[emp.frequency] || emp.frequency}</td>
                  <td className="px-4 py-3 text-sm text-slate-200 text-right font-mono">${emp.salaryBaseUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm text-slate-200 text-right font-mono">${(emp.bonusUsd ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); openStatus(emp); }}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap hover:brightness-125 ${STATUS_BY_KEY[emp.status]?.cls || STATUS_BY_KEY.INACTIVE.cls}`}
                      title="Cambiar estado"
                    >{STATUS_BY_KEY[emp.status]?.label || emp.status}</button>
                    {(emp.statusFrom || emp.statusTo) && (
                      <span className="block text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                        {emp.statusFrom ? fmtYmd(emp.statusFrom) : '…'}{emp.statusTo ? ` al ${fmtYmd(emp.statusTo)}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Editar"><Pencil size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); openStatus(emp); }} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" title="Cambiar estado">
                        <UserCog size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nuevo empleado">
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}

            {/* Ficha del empleado */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Ficha del empleado</label>
              <div className="flex gap-1 p-1 bg-slate-800/70 rounded-lg w-fit mb-3">
                <TabBtn active={customerMode === 'new'} onClick={() => setCustomerMode('new')}>Cliente nuevo</TabBtn>
                <TabBtn active={customerMode === 'existing'} onClick={() => setCustomerMode('existing')}>Cliente existente</TabBtn>
              </div>

              {customerMode === 'new' ? (
                <div className="space-y-3">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Nombre completo" className={inputCls} />
                  <div className="grid grid-cols-3 gap-2">
                    <select value={newDocType} onChange={(e) => setNewDocType(e.target.value)} className={inputCls}>
                      {['V', 'E', 'J', 'G', 'C', 'P'].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input value={newRif} onChange={(e) => setNewRif(e.target.value)} placeholder="Cédula / RIF" className={`${inputCls} col-span-2`} />
                  </div>
                  <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Teléfono (opcional)" className={inputCls} />
                </div>
              ) : (
                <div ref={comboRef} className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={pickedCustomer ? pickedCustomer.name : comboQuery}
                    onChange={(e) => { setPickedCustomer(null); setComboQuery(e.target.value); }}
                    placeholder="Buscar cliente por nombre o RIF..."
                    className={`${inputCls} pl-9 pr-9 ${pickedCustomer ? 'border-green-500/50 bg-green-500/5' : ''}`}
                    readOnly={!!pickedCustomer}
                  />
                  {pickedCustomer ? (
                    <button type="button" onClick={() => { setPickedCustomer(null); setComboQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"><X size={15} /></button>
                  ) : comboLoading ? (
                    <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
                  ) : null}
                  {comboOpen && comboResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {comboResults.map((c) => (
                        <button key={c.id} type="button" onClick={() => { setPickedCustomer(c); setComboOpen(false); }}
                          className="w-full flex flex-col text-left px-3 py-2 hover:bg-slate-700/60 border-b border-slate-700/30 last:border-0">
                          <span className="text-sm text-white truncate">{c.name}</span>
                          <span className="text-xs text-slate-400">{c.documentType || ''}{c.rif ? `-${c.rif}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <EmployeeFields
              departments={departments} positions={positions}
              departmentId={departmentId} setDepartmentId={setDepartmentId}
              positionId={positionId} onSelectPosition={onSelectPosition}
              bank={bank} setBank={setBank}
              salaryBaseUsd={salaryBaseUsd} setSalaryBaseUsd={setSalaryBaseUsd}
              bonusUsd={bonusUsd} setBonusUsd={setBonusUsd}
              frequency={frequency} setFrequency={setFrequency}
            />

            <FormActions loading={formLoading} onCancel={() => setShowCreate(false)} label="Guardar" />
          </form>
        </Modal>
      )}

      {/* Modal: Edit */}
      {showEdit && selected && (
        <Modal onClose={() => setShowEdit(false)} title={`Editar empleado — ${selected.customer.name}`}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}
            <p className="text-xs text-slate-500">
              Código <span className="font-mono text-slate-400">{selected.code || '--'}</span>. Los datos de identidad (nombre, RIF) se editan en la ficha del cliente.
            </p>
            <EmployeeFields
              departments={departments} positions={positions}
              departmentId={departmentId} setDepartmentId={setDepartmentId}
              positionId={positionId} onSelectPosition={onSelectPosition}
              bank={bank} setBank={setBank}
              salaryBaseUsd={salaryBaseUsd} setSalaryBaseUsd={setSalaryBaseUsd}
              bonusUsd={bonusUsd} setBonusUsd={setBonusUsd}
              frequency={frequency} setFrequency={setFrequency}
            />
            <FormActions loading={formLoading} onCancel={() => setShowEdit(false)} label="Guardar cambios" />
          </form>
        </Modal>
      )}

      {/* Modal: Cambiar estado */}
      {statusEmp && (
        <Modal onClose={() => setStatusEmp(null)} title={`Estado — ${statusEmp.customer.name}`}>
          <form onSubmit={handleStatusSave} className="space-y-4">
            {statusError && <ErrorBanner message={statusError} />}
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.key} type="button" onClick={() => setNewStatus(s.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${newStatus === s.key ? 'border-green-500/60 bg-green-500/10 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />{s.label}
                </button>
              ))}
            </div>
            <p className={`text-xs ${STATUS_BY_KEY[newStatus]?.inPayroll && newStatus !== 'VACATION' ? 'text-green-400/80' : 'text-amber-400/90'}`}>
              {newStatus === 'VACATION'
                ? 'Sigue como empleado activo, pero no entrará en las corridas de nómina mientras esté de vacaciones.'
                : STATUS_BY_KEY[newStatus]?.inPayroll
                  ? 'Sigue entrando en la nómina.'
                  : 'No entrará en las próximas nóminas.'}
            </p>
            {newStatus !== 'ACTIVE' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Desde</label>
                    <input type="date" value={statusFrom} onChange={(e) => setStatusFrom(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Hasta <span className="text-slate-500 font-normal">(opcional)</span></label>
                    <input type="date" value={statusTo} min={statusFrom || undefined} onChange={(e) => setStatusTo(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Observación <span className="text-slate-500 font-normal">(opcional)</span></label>
                  <textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} rows={2} maxLength={500} placeholder="Ej. reposo médico por 15 días" className={inputCls} />
                </div>
              </>
            )}
            <FormActions loading={statusSaving} onCancel={() => setStatusEmp(null)} label="Guardar estado" />
          </form>
        </Modal>
      )}
    </div>
  );
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500';

function EmployeeFields(props: {
  departments: MasterRef[]; positions: PositionOption[];
  departmentId: string; setDepartmentId: (v: string) => void;
  positionId: string; onSelectPosition: (v: string) => void;
  bank: string; setBank: (v: string) => void;
  salaryBaseUsd: number; setSalaryBaseUsd: (v: number) => void;
  bonusUsd: number; setBonusUsd: (v: number) => void;
  frequency: string; setFrequency: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Departamento</label>
          <select value={props.departmentId} onChange={(e) => props.setDepartmentId(e.target.value)} required className={inputCls}>
            <option value="">Seleccionar...</option>
            {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Cargo</label>
          <select value={props.positionId} onChange={(e) => props.onSelectPosition(e.target.value)} className={inputCls}>
            <option value="">Sin cargo</option>
            {props.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Sueldo base (USD)</label>
          <MoneyInput value={props.salaryBaseUsd} onValueChange={props.setSalaryBaseUsd} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Bonificaciones (USD)</label>
          <MoneyInput value={props.bonusUsd} onValueChange={props.setBonusUsd} className={`${inputCls} font-mono`} />
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-1">El sueldo y las bonificaciones se autollenan del cargo, pero puedes editarlos.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Frecuencia</label>
          <select value={props.frequency} onChange={(e) => props.setFrequency(e.target.value)} className={inputCls}>
            <option value="WEEKLY">Semanal</option>
            <option value="BIWEEKLY">Quincenal</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Banco</label>
          <input value={props.bank} onChange={(e) => props.setBank(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>
    </>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 ${className}`}>{children}</th>;
}

function FilterChip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-green-500/15 text-green-300 border-green-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
      <span className={`tabular-nums ${active ? 'text-green-200' : 'text-slate-500'}`}>{count}</span>
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
      {children}
    </button>
  );
}

function FormActions({ loading, onCancel, label }: { loading: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">Cancelar</button>
      <button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">{loading ? 'Guardando...' : label}</button>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{message}</div>;
}
