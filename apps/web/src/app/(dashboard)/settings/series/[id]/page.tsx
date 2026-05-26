'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Layers, Save, Loader2, LogOut, ToggleLeft, ToggleRight, Info,
  CheckCircle2, Printer, Terminal, Send, AlertTriangle,
} from 'lucide-react';
import {
  readPrinterStatus, sendRawFiscalCommand, sendMultipleFiscalCommands, isFiscalPrinterSupported,
  type FiscalStatusResult, type PrinterModelInfo,
} from '@/lib/fiscal-printer';
import { FISCAL_PAYMENT_POSITIONS } from '@/lib/fiscal-payment-codes';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Serie {
  id: string;
  name: string;
  prefix: string;
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

  const [form, setForm] = useState({ name: '', prefix: '', isFiscal: false, isVatExempt: false, comPort: '', fiscalMachineSerial: '' });
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isFiscal}
                  onChange={(e) => setForm((f) => ({ ...f, isFiscal: e.target.checked }))}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-300">Fiscal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isVatExempt}
                  onChange={(e) => setForm((f) => ({ ...f, isVatExempt: e.target.checked }))}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-300">Exenta de IVA</span>
              </label>
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
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
