'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
}

export default function NewInventoryCountPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchWarehouses = useCallback(async () => {
    const res = await fetch('/api/proxy/warehouses');
    if (res.ok) {
      const data = await res.json();
      setWarehouses(data);
      if (data.length > 0) setWarehouseId(data[0].id);
    }
  }, []);

  useEffect(() => { document.title = 'Nuevo Conteo | Trinity ERP'; }, []);
  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/inventory-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, notes: notes || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/inventory/count/${data.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear conteo');
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
          onClick={() => router.push('/inventory/count')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
        >
          <ArrowLeft size={16} /> Volver a conteos
        </button>
        <h1 className="text-2xl font-bold text-white">Nueva Sesion de Conteo</h1>
        <p className="text-slate-400 text-sm mt-1">Selecciona el almacen y crea el conteo. Luego podras agregar productos.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      <div className="card p-6 max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field !py-2.5 text-sm"
              placeholder="Opcional: descripcion del conteo..."
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
            <button
              type="button"
              onClick={() => router.push('/inventory/count')}
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
              Crear conteo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
