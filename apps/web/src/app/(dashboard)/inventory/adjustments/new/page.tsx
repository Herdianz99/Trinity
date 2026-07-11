'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import CustomerSearchSelect from '@/components/customer-search-select';

interface Warehouse { id: string; name: string; }
interface Person { id: string; name: string; }

export default function NewInventoryAdjustmentPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Person[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [costMode, setCostMode] = useState<'COST' | 'BREGA'>('BREGA'); // costo del reporte: Brecha por defecto
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const [whRes, suppRes] = await Promise.all([
      fetch('/api/proxy/warehouses'),
      fetch('/api/proxy/suppliers'),
    ]);
    if (whRes.ok) {
      const data = await whRes.json();
      setWarehouses(data);
      if (data.length > 0) setWarehouseId(data[0].id);
    }
    if (suppRes.ok) {
      const data = await suppRes.json();
      setSuppliers(Array.isArray(data) ? data : data.data || []);
    }
  }, []);

  useEffect(() => { document.title = 'Nuevo Ajuste | Trinity ERP'; }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body: any = {
        warehouseId,
        type,
        costMode,
        description: description || undefined,
      };
      // Entidad dependiente del tipo: Salida -> Cliente (para CxC), Entrada -> Proveedor (para CxP)
      if (type === 'OUT' && customerId) {
        body.customerId = customerId;
      }
      if (type === 'IN' && supplierId) {
        body.supplierId = supplierId;
      }
      const res = await fetch('/api/proxy/inventory-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/inventory/adjustments/${data.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear ajuste');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.push('/inventory/adjustments')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
        >
          <ArrowLeft size={16} /> Volver a ajustes
        </button>
        <h1 className="text-2xl font-bold text-white">Nuevo Ajuste de Inventario</h1>
        <p className="text-slate-400 text-sm mt-1">Configura el ajuste y luego agrega los productos.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      <div className="card p-6 max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de ajuste *</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as 'IN' | 'OUT'); setCustomerId(''); setSupplierId(''); }}
              className="input-field !py-2.5 text-sm"
              required
            >
              <option value="IN">Entrada (agrega stock)</option>
              <option value="OUT">Salida (resta stock)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Costo del reporte *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCostMode('COST')}
                className={`!py-2.5 text-sm rounded-lg border transition-colors ${
                  costMode === 'COST'
                    ? 'border-green-500/50 bg-green-500/10 text-green-300 font-medium'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                Costo
              </button>
              <button
                type="button"
                onClick={() => setCostMode('BREGA')}
                className={`!py-2.5 text-sm rounded-lg border transition-colors ${
                  costMode === 'BREGA'
                    ? 'border-green-500/50 bg-green-500/10 text-green-300 font-medium'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                Brecha
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {costMode === 'BREGA'
                ? 'El reporte usara el costo + brecha (solo productos con brecha).'
                : 'El reporte usara el costo puro, sin brecha.'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Almacen *</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="input-field !py-2.5 text-sm"
              required
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          {/* Entidad dependiente del tipo: Salida -> Cliente (CxC), Entrada -> Proveedor (CxP).
              Opcional aqui; al procesar se puede confirmar/cambiar y decidir si generar la cuenta. */}
          {type === 'OUT' ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Cliente (para CxC)</label>
              <CustomerSearchSelect
                value={customerId}
                onSelect={(c) => setCustomerId(c?.id || '')}
                placeholder="Buscar cliente por nombre o cédula… (opcional)"
              />
              <p className="text-xs text-slate-500 mt-1">Al procesar podrás generar una CxC a este cliente por el costo total.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor (para CxP)</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="input-field !py-2.5 text-sm"
              >
                <option value="">Sin proveedor (elegir al procesar)</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Al procesar podrás generar una CxP a este proveedor por el costo total.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descripcion</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field !py-2.5 text-sm"
              placeholder="Opcional: descripcion del ajuste..."
              rows={3}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
            <button
              type="button"
              onClick={() => router.push('/inventory/adjustments')}
              className="btn-secondary !py-2.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !warehouseId}
              className="btn-primary !py-2.5 text-sm flex items-center gap-2"
            >
              {saving && <Loader2 className="animate-spin" size={16} />}
              Crear ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
