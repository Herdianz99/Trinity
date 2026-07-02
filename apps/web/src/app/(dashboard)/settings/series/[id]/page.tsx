'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Layers, Save, Loader2, LogOut, ToggleLeft, ToggleRight, Info,
  CheckCircle2, Printer, Terminal, Send, AlertTriangle,
} from 'lucide-react';
import {
  readPrinterStatus, sendRawFiscalCommand, sendMultipleFiscalCommands, isFiscalPrinterSupported,
  readLastZReport,
  type FiscalStatusResult, type PrinterModelInfo, type ZReportRawResult,
} from '@/lib/fiscal-printer';
import { FISCAL_PAYMENT_POSITIONS } from '@/lib/fiscal-payment-codes';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Serie {
  id: string;
  name: string;
  prefix: string;
  type: 'SALES' | 'PURCHASES';
  isFiscal: boolean;
  isVatExempt: boolean;
  lastNumber: number;
  isActive: boolean;
  comPort: string | null;
  fiscalMachineSerial: string | null;
  cashRegister: { id: string; code: string; name: string } | null;
  createdAt: string;
}

export default function SerieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [serie, setSerie] = useState<Serie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', prefix: '', type: 'SALES' as 'SALES' | 'PURCHASES', isFiscal: false, isVatExempt: false, comPort: '', fiscalMachineSerial: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fiscal tools state
  const [checking, setChecking] = useState(false);
  const [printerInfo, setPrinterInfo] = useState<{ model: PrinterModelInfo; status: FiscalStatusResult } | null>(null);
  const [checkError, setCheckError] = useState('');
  const [printingConfig, setPrintingConfig] = useState(false);
  const [printConfigMsg, setPrintConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [manualCmd, setManualCmd] = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);
  const [cmdResult, setCmdResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [programmingPayments, setProgrammingPayments] = useState(false);
  const [programProgress, setProgramProgress] = useState('');
  const [programResult, setProgramResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [configuringContrib, setConfiguringContrib] = useState(false);
  const [contribResult, setContribResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resettingFlags, setResettingFlags] = useState(false);
  const [resetFlagsProgress, setResetFlagsProgress] = useState('');
  const [resetFlagsResult, setResetFlagsResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [readingZ, setReadingZ] = useState(false);
  const [zRawResult, setZRawResult] = useState<ZReportRawResult | null>(null);
  const [zRawError, setZRawError] = useState('');

  const fetchSerie = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/series/${id}`);
      if (!res.ok) throw new Error('Serie no encontrada');
      const data = await res.json();
      setSerie(data);
      setForm({
        name: data.name,
        prefix: data.prefix,
        type: data.type || 'SALES',
        isFiscal: data.isFiscal,
        isVatExempt: data.isVatExempt,
        comPort: data.comPort || '',
        fiscalMachineSerial: data.fiscalMachineSerial || '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSerie();
  }, [fetchSerie]);

  useEffect(() => {
    if (serie) document.title = `${serie.name} | Trinity ERP`;
  }, [serie]);

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: any = {
        name: form.name,
        prefix: form.prefix.toUpperCase(),
        type: form.type,
        isFiscal: form.isFiscal,
        isVatExempt: form.isVatExempt,
      };
      if (form.isFiscal) {
        body.comPort = form.comPort.trim() || null;
        body.fiscalMachineSerial = form.fiscalMachineSerial.trim() || null;
      } else {
        body.comPort = null;
        body.fiscalMachineSerial = null;
      }
      const res = await fetch(`/api/proxy/series/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Serie actualizada correctamente' });
        fetchSerie();
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err.message) ? err.message[0] : err.message;
        throw new Error(msg || 'Error al guardar');
      }
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndExit() {
    const ok = await handleSave();
    if (ok) router.push('/settings/series');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  if (error || !serie) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error || 'Serie no encontrada'}</p>
        <button
          onClick={() => router.push('/settings/series')}
          className="btn-secondary"
        >
          Volver a series
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/settings/series')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <Layers className="text-indigo-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{serie.name}</h1>
          <p className="text-slate-400 text-sm font-mono">{serie.prefix}</p>
        </div>
      </div>

      {/* Save message */}
      {saveMsg && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            saveMsg.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          {serie.isFiscal && <TabsTrigger value="fiscal">Maquina Fiscal</TabsTrigger>}
        </TabsList>

        {/* TAB: Info General */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Prefijo *
                </label>
                <input
                  type="text"
                  value={form.prefix}
                  onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                  className="input-field !py-2 text-sm font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Tipo
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'SALES' | 'PURCHASES' }))}
                  className="input-field !py-2 text-sm"
                >
                  <option value="SALES">Ventas</option>
                  <option value="PURCHASES">Compras</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-300">Fiscal:</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isFiscal: !f.isFiscal }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.isFiscal
                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                  }`}
                >
                  {form.isFiscal ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {form.isFiscal ? 'Si' : 'No'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-300">Exenta de IVA:</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isVatExempt: !f.isVatExempt }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.isVatExempt
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                  }`}
                >
                  {form.isVatExempt ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {form.isVatExempt ? 'Si' : 'No'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndExit}
                className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
                Guardar y salir
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary !py-2.5 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </TabsContent>

        {/* TAB: Maquina Fiscal */}
        {serie.isFiscal && (
        <TabsContent value="fiscal">
          <div className="card p-6 space-y-6">
                {/* Configuracion de maquina fiscal */}
                <div className="p-3 rounded-lg bg-slate-700/30 border border-slate-600/30 space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configuracion de maquina fiscal</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Puerto COM</label>
                      <input
                        type="text"
                        value={form.comPort}
                        onChange={(e) => setForm((f) => ({ ...f, comPort: e.target.value }))}
                        placeholder="Ej: COM3"
                        className="input-field !py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Serial de maquina fiscal</label>
                      <input
                        type="text"
                        value={form.fiscalMachineSerial}
                        onChange={(e) => setForm((f) => ({ ...f, fiscalMachineSerial: e.target.value }))}
                        placeholder="Ej: ABC12345678"
                        className="input-field !py-2 text-sm font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">Se detecta automaticamente al comprobar la impresora</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave()}
                      className="btn-primary !py-2 text-sm flex items-center gap-2"
                    >
                      {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      Guardar
                    </button>
                  </div>
                </div>

                {/* Comprobar impresora */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-blue-400" />
                    Comprobar impresora
                  </h3>
                  <button
                    type="button"
                    disabled={checking}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setCheckError(support.reason || 'Web Serial API no disponible.');
                        return;
                      }
                      setChecking(true);
                      setCheckError('');
                      setPrinterInfo(null);
                      try {
                        const result = await readPrinterStatus();
                        setPrinterInfo(result);
                        // Save serial to serie if different
                        if (result.status.machineSerial && result.status.machineSerial !== serie.fiscalMachineSerial) {
                          await fetch(`/api/proxy/series/${serie.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              fiscalMachineSerial: result.status.machineSerial,
                            }),
                          });
                          fetchSerie();
                        }
                      } catch (err: any) {
                        setCheckError(err.message);
                      } finally {
                        setChecking(false);
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {checking ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                    Comprobar
                  </button>

                  {checkError && (
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      {checkError}
                    </div>
                  )}

                  {printerInfo && (
                    <div className="mt-3 p-4 rounded-lg bg-slate-700/30 border border-slate-600/30 space-y-2">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        <span className="text-slate-400">Modelo:</span>
                        <span className="text-white font-mono">{printerInfo.model.modelName} ({printerInfo.model.modelCode})</span>
                        <span className="text-slate-400">Familia:</span>
                        <span className="text-white">{printerInfo.model.family}</span>
                        <span className="text-slate-400">Serial:</span>
                        <span className="text-white font-mono">{printerInfo.status.machineSerial}</span>
                        <span className="text-slate-400">RIF:</span>
                        <span className="text-white font-mono">{printerInfo.status.rif}</span>
                        <span className="text-slate-400">Ultima factura:</span>
                        <span className="text-white font-mono">{printerInfo.status.invoiceFiscalNumber || '—'}</span>
                        <span className="text-slate-400">Ultima NC:</span>
                        <span className="text-white font-mono">{printerInfo.status.creditNoteFiscalNumber || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Imprimir configuracion */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Printer size={16} className="text-purple-400" />
                    Imprimir configuracion
                  </h3>
                  <button
                    type="button"
                    disabled={printingConfig}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setPrintConfigMsg({ type: 'error', text: support.reason || 'Web Serial API no disponible.' });
                        return;
                      }
                      setPrintingConfig(true);
                      setPrintConfigMsg(null);
                      try {
                        const result = await sendRawFiscalCommand('D');
                        if (result.success) {
                          setPrintConfigMsg({ type: 'success', text: 'Configuracion enviada a la impresora' });
                        } else {
                          setPrintConfigMsg({ type: 'error', text: result.error || 'Error desconocido' });
                        }
                      } catch (err: any) {
                        setPrintConfigMsg({ type: 'error', text: err.message });
                      } finally {
                        setPrintingConfig(false);
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {printingConfig ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                    Imprimir Configuracion
                  </button>

                  {printConfigMsg && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                      printConfigMsg.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {printConfigMsg.type === 'success'
                        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      {printConfigMsg.text}
                    </div>
                  )}
                </div>

                {/* Configurar como contribuyente */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-blue-400" />
                    Configurar como contribuyente
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    Configura los flags fiscales: Flag 50 = 01 (contribuyente) y Flag 63 = 16 (IGTF 16%).
                  </p>
                  <button
                    type="button"
                    disabled={configuringContrib}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setContribResult({ type: 'error', text: support.reason || 'Web Serial API no disponible.' });
                        return;
                      }
                      setConfiguringContrib(true);
                      setContribResult(null);
                      try {
                        const result = await sendMultipleFiscalCommands(['PJ5001', 'PJ6316']);
                        if (result.success) {
                          setContribResult({ type: 'success', text: 'Flags configurados correctamente (50=01, 63=16)' });
                        } else {
                          setContribResult({ type: 'error', text: result.error || 'Error desconocido' });
                        }
                      } catch (err: any) {
                        setContribResult({ type: 'error', text: err.message });
                      } finally {
                        setConfiguringContrib(false);
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {configuringContrib ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Configurar contribuyente
                  </button>

                  {contribResult && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                      contribResult.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {contribResult.type === 'success'
                        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      {contribResult.text}
                    </div>
                  )}
                </div>

                {/* Resetear todos los flags a 00 */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-400" />
                    Resetear todos los flags a 00
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    Envia los 63 comandos PJ para colocar todos los flags en 00. Util para limpiar configuraciones
                    previas de otros sistemas. Formato del comando: <span className="font-mono text-slate-400">PJ</span> + flag (2 digitos) + valor (2 digitos),
                    ej: <span className="font-mono text-slate-400">PJ5001</span> = Flag 50, valor 01.
                    Luego usar &quot;Configurar contribuyente&quot; para activar solo los flags necesarios (50 y 63).
                  </p>
                  <button
                    type="button"
                    disabled={resettingFlags}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setResetFlagsResult({ type: 'error', text: support.reason || 'Web Serial API no disponible.' });
                        return;
                      }
                      setResettingFlags(true);
                      setResetFlagsResult(null);
                      setResetFlagsProgress('Conectando...');
                      try {
                        const commands: string[] = [];
                        for (let i = 1; i <= 63; i++) {
                          commands.push(`PJ${String(i).padStart(2, '0')}00`);
                        }
                        const result = await sendMultipleFiscalCommands(commands, (sent, total) => {
                          setResetFlagsProgress(`${sent}/${total} enviados`);
                        });
                        if (result.success) {
                          setResetFlagsResult({ type: 'success', text: `${result.sent} flags reseteados a 00 correctamente` });
                        } else {
                          setResetFlagsResult({ type: 'error', text: result.error || 'Error desconocido' });
                        }
                      } catch (err: any) {
                        setResetFlagsResult({ type: 'error', text: err.message });
                      } finally {
                        setResettingFlags(false);
                        setResetFlagsProgress('');
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {resettingFlags ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    {resettingFlags ? resetFlagsProgress : 'Resetear todos los flags a 00'}
                  </button>

                  {resetFlagsResult && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                      resetFlagsResult.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {resetFlagsResult.type === 'success'
                        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      {resetFlagsResult.text}
                    </div>
                  )}
                </div>

                {/* Programar formas de pago */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <Terminal size={16} className="text-green-400" />
                    Programar formas de pago
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    Envia los comandos PE a la impresora para programar las {FISCAL_PAYMENT_POSITIONS.length} posiciones
                    de formas de pago estandar del sistema.
                  </p>
                  <div className="mb-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                      {FISCAL_PAYMENT_POSITIONS.map(pos => (
                        <div key={pos.code} className="flex gap-2">
                          <span className="font-mono text-slate-400">{pos.code}</span>
                          <span className="text-slate-300">{pos.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={programmingPayments}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setProgramResult({ type: 'error', text: support.reason || 'Web Serial API no disponible.' });
                        return;
                      }
                      setProgrammingPayments(true);
                      setProgramResult(null);
                      setProgramProgress('Conectando...');
                      try {
                        const commands = FISCAL_PAYMENT_POSITIONS.map(pos => `PE${pos.code}${pos.name}`);
                        const result = await sendMultipleFiscalCommands(commands, (sent, total) => {
                          setProgramProgress(`${sent}/${total} enviados`);
                        });
                        if (result.success) {
                          setProgramResult({ type: 'success', text: `${result.sent} formas de pago programadas correctamente` });
                        } else {
                          setProgramResult({ type: 'error', text: result.error || 'Error desconocido' });
                        }
                      } catch (err: any) {
                        setProgramResult({ type: 'error', text: err.message });
                      } finally {
                        setProgrammingPayments(false);
                        setProgramProgress('');
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {programmingPayments ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    {programmingPayments ? programProgress : 'Programar formas de pago'}
                  </button>

                  {programResult && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                      programResult.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {programResult.type === 'success'
                        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      {programResult.text}
                    </div>
                  )}
                </div>

                {/* Enviar comando manual */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Terminal size={16} className="text-amber-400" />
                    Enviar comando manual
                  </h3>
                  <div className="flex items-center gap-2 max-w-md">
                    <input
                      type="text"
                      value={manualCmd}
                      onChange={(e) => setManualCmd(e.target.value)}
                      className="input-field !py-2 text-sm font-mono"
                      placeholder="Ej: D, 7, I0X, I0Z"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && manualCmd.trim() && !sendingCmd) {
                          e.preventDefault();
                          document.getElementById('btn-send-cmd')?.click();
                        }
                      }}
                    />
                    <button
                      id="btn-send-cmd"
                      type="button"
                      disabled={sendingCmd || !manualCmd.trim()}
                      onClick={async () => {
                        const support = isFiscalPrinterSupported();
                        if (!support.supported) {
                          setCmdResult({ type: 'error', text: support.reason || 'Web Serial API no disponible.' });
                          return;
                        }
                        setSendingCmd(true);
                        setCmdResult(null);
                        try {
                          const result = await sendRawFiscalCommand(manualCmd.trim());
                          if (result.success) {
                            setCmdResult({ type: 'success', text: `Comando "${manualCmd.trim()}" enviado correctamente` });
                          } else {
                            setCmdResult({ type: 'error', text: result.error || 'Error desconocido' });
                          }
                        } catch (err: any) {
                          setCmdResult({ type: 'error', text: err.message });
                        } finally {
                          setSendingCmd(false);
                        }
                      }}
                      className="btn-primary !py-2 text-sm flex items-center gap-2 shrink-0"
                    >
                      {sendingCmd ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      Enviar
                    </button>
                  </div>

                  {cmdResult && (
                    <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                      cmdResult.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {cmdResult.type === 'success'
                        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      {cmdResult.text}
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                    Comandos comunes: <span className="font-mono text-slate-400">7</span>=Anular documento,{' '}
                    <span className="font-mono text-slate-400">D</span>=Imprimir config,{' '}
                    <span className="font-mono text-slate-400">I0X</span>=Reporte X,{' '}
                    <span className="font-mono text-slate-400">I0Z</span>=Cierre Z
                  </p>
                </div>

                {/* Leer ultimo Reporte Z (solo lectura — U0Z) */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                    <Terminal size={16} className="text-blue-400" />
                    Leer último Reporte Z (solo lectura)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed max-w-xl">
                    Envía <span className="font-mono text-slate-400">U0Z</span> y lee el
                    <b> último Z ya cerrado</b> de la memoria de la impresora.
                    <b> No imprime ni cierra nada</b> — es solo lectura para calibrar las posiciones.
                    Copia el resultado y envíamelo para validar el mapeo del manual (Tabla 65).
                  </p>
                  <button
                    type="button"
                    disabled={readingZ}
                    onClick={async () => {
                      const support = isFiscalPrinterSupported();
                      if (!support.supported) {
                        setZRawError(support.reason || 'Web Serial API no disponible.');
                        return;
                      }
                      setReadingZ(true);
                      setZRawError('');
                      setZRawResult(null);
                      try {
                        const result = await readLastZReport();
                        setZRawResult(result);
                      } catch (err: any) {
                        setZRawError(err.message || 'Error desconocido');
                      } finally {
                        setReadingZ(false);
                      }
                    }}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {readingZ ? <Loader2 className="animate-spin" size={16} /> : <Terminal size={16} />}
                    {readingZ ? 'Leyendo U0Z...' : 'Leer último Z (U0Z)'}
                  </button>

                  {zRawError && (
                    <div className="mt-3 p-3 rounded-lg border text-sm flex items-start gap-2 bg-red-500/10 border-red-500/20 text-red-400">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      {zRawError}
                    </div>
                  )}

                  {zRawResult && (
                    <div className="mt-3 space-y-3">
                      <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-sm text-slate-300 flex flex-wrap gap-x-6 gap-y-1">
                        <span>Impresora: <b className="text-white">{zRawResult.modelName}</b> ({zRawResult.modelCode}) · Familia {zRawResult.family}</span>
                        <span>Serial: <b className="text-white font-mono">{zRawResult.machineSerial || '—'}</b></span>
                        <span>Largo respuesta: <b className="text-white font-mono">{zRawResult.rawLength}</b> chars</span>
                        <span>Campos por \n: <b className="text-white font-mono">{zRawResult.fieldsByNewline.length}</b></span>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1 font-semibold">Interpretación por posiciones del manual (Tabla 65 · Protocolo Directo):</p>
                        <div className="max-h-64 overflow-auto rounded-lg border border-slate-700/50">
                          <table className="w-full text-xs font-mono">
                            <thead className="sticky top-0 bg-slate-800 text-slate-400">
                              <tr>
                                <th className="text-left px-2 py-1">Campo</th>
                                <th className="text-right px-2 py-1">Pos</th>
                                <th className="text-left px-2 py-1">Crudo</th>
                                <th className="text-right px-2 py-1">Entero</th>
                                <th className="text-right px-2 py-1">Monto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {zRawResult.slicedFields.map((f) => (
                                <tr key={f.label} className="border-t border-slate-700/30 text-slate-300">
                                  <td className="px-2 py-0.5">{f.label}</td>
                                  <td className="px-2 py-0.5 text-right text-slate-500">{f.from}:{f.len}</td>
                                  <td className="px-2 py-0.5 text-amber-300">{f.raw || '∅'}</td>
                                  <td className="px-2 py-0.5 text-right">{f.asInt}</td>
                                  <td className="px-2 py-0.5 text-right">{f.asMoney}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400 mb-1 font-semibold">Respuesta cruda completa (copiar y enviar para calibrar):</p>
                        <textarea
                          readOnly
                          value={JSON.stringify(
                            {
                              modelCode: zRawResult.modelCode,
                              modelName: zRawResult.modelName,
                              family: zRawResult.family,
                              machineSerial: zRawResult.machineSerial,
                              rawLength: zRawResult.rawLength,
                              rawEscaped: zRawResult.rawEscaped,
                              fieldsByNewline: zRawResult.fieldsByNewline,
                            },
                            null,
                            2,
                          )}
                          onFocus={(e) => e.currentTarget.select()}
                          className="input-field !py-2 text-xs font-mono w-full h-40"
                        />
                      </div>
                    </div>
                  )}
                </div>
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
