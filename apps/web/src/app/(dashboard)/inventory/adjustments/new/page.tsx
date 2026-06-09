'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface Warehouse { id: string; name: string; }
interface Person { id: string; name: string; }

export default function NewInventoryAdjustmentPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [suppliers, setSuppliers] = useState<Person[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [recipientType, setRecipientType] = useState<'' | 'customer' | 'supplier'>('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const [whRes, custRes, suppRes] = await Promise.all([
      fetch('/api/proxy/warehouses'),
      fetch('/api/proxy/customers?limit=500'),
      fetch('/api/proxy/suppliers'),
    ]);
    if (whRes.ok) {
      const data = await whRes.json();
      setWarehouses(data);
      if (data.length > 0) setWarehouseId(data[0].id);
    }
    if (custRes.ok) {
      const data = await custRes.json();
      setCustomers(Array.isArray(data) ? data : data.data || []);
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
        description: description || undefined,
      };
      if (recipientType === 'customer' && customerId) {
        body.customerId = customerId;
      }
      if (recipientType === 'supplier' && supplierId) {
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
              onChange={(e) => setType(e.target.value as 'IN' | 'OUT')}
              className="input-field !py-2.5 text-sm"
              required
            >
              <option value="IN">Entrada (agrega stock)</option>
              <option value="OUT">Salida (resta stock)</option>
            </select>
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
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Destinatario</label>
            <select
              value={recipientType}
              onChange={(e) => {
                setRecipientType(e.target.value as '' | 'customer' | 'supplier');
                setCustomerId('');
                setSupplierId('');
              }}
              className="input-field !py-2.5 text-sm"
            >
              <option value="">Sin destinatario</option>
              <option value="customer">Cliente</option>
              <option value="supplier">Proveedor</option>
            </select>
          </div>
          {recipientType === 'customer' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Cliente *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="input-field !py-2.5 text-sm"
                required
              >
                <option value="">Seleccionar cliente...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {recipientType === 'supplier' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="input-field !py-2.5 text-sm"
                required
              >
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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
