'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileJson, Copy, Check, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Package, Layers, Tag, Truck
} from 'lucide-react';

type PageState = 'idle' | 'validating' | 'validated' | 'importing' | 'imported';

interface ValidationResult {
  categories: { create: number; exists: number; errors: string[] };
  brands: { create: number; exists: number; errors: string[] };
  suppliers: { create: number; exists: number; errors: string[] };
  products: { create: number; skip: number; errors: string[] };
}

interface ImportResult {
  categories: { created: number; skipped: number; errors: string[] };
  brands: { created: number; skipped: number; errors: string[] };
  suppliers: { created: number; skipped: number; errors: string[] };
  products: { created: number; skipped: number; errors: string[] };
}

const EXAMPLE_JSON = `{
  "categories": [
    { "name": "Herramientas", "code": "HER", "subcategories": ["Manuales", "Electricas"] }
  ],
  "brands": [
    { "name": "Stanley" }
  ],
  "suppliers": [
    { "name": "Distribuidora ABC", "rif": "J-12345678-9" }
  ],
  "products": [
    {
      "name": "Martillo 16oz Stanley",
      "category": "Herramientas",
      "subcategory": "Manuales",
      "brand": "Stanley",
      "supplier": "Distribuidora ABC",
      "costUsd": 8.50,
      "gananciaPct": 35,
      "gananciaMayorPct": 25,
      "ivaType": "GENERAL",
      "minStock": 5
    }
  ]
}`;

export default function ImportPage() {
  const [state, setState] = useState<PageState>('idle');
  const [jsonText, setJsonText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(EXAMPLE_JSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  function handleFileRead(file: File) {
    if (!file.name.endsWith('.json')) {
      setError('Solo se aceptan archivos .json');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonText(text);
      setFileName(file.name);
      setError(null);
      setValidation(null);
      setState('idle');
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }

  async function handleValidate() {
    if (!jsonText.trim()) {
      setError('Pega o carga un archivo JSON primero');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('El JSON no es valido. Revisa la sintaxis.');
      return;
    }

    setState('validating');
    setError(null);
    setValidation(null);

    try {
      const res = await fetch('/api/proxy/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (res.ok) {
        setValidation(data);
        setState('validated');
      } else {
        setError(data.message || 'Error al validar');
        setState('idle');
      }
    } catch {
      setError('Error de conexion al validar');
      setState('idle');
    }
  }

  async function handleImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('El JSON no es valido');
      return;
    }

    setState('importing');
    setError(null);

    try {
      const res = await fetch('/api/proxy/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (res.ok) {
        setImportResult(data);
        setState('imported');
      } else {
        setError(data.message || 'Error al importar');
        setState('validated');
      }
    } catch {
      setError('Error de conexion al importar');
      setState('validated');
    }
  }

  function handleReset() {
    setState('idle');
    setJsonText('');
    setFileName(null);
    setValidation(null);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const allErrors = validation
    ? [
        ...validation.categories.errors,
        ...validation.brands.errors,
        ...validation.suppliers.errors,
        ...validation.products.errors,
      ]
    : [];

  const hasValidationErrors = allErrors.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Upload className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Importacion Masiva</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Carga tu catalogo completo desde un archivo JSON
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="space-y-6 max-w-4xl">
        {/* Accordion: JSON format */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowFormat(!showFormat)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileJson size={18} className="text-green-400" />
              <span className="text-sm font-semibold text-white">Ver formato del JSON</span>
            </div>
            {showFormat ? (
              <ChevronUp size={18} className="text-slate-400" />
            ) : (
              <ChevronDown size={18} className="text-slate-400" />
            )}
          </button>

          {showFormat && (
            <div className="border-t border-slate-700/50 px-5 py-4">
              <div className="relative">
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 hover:text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-green-400" />
                      <span className="text-green-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copiar
                    </>
                  )}
                </button>
                <pre className="bg-slate-900/80 rounded-lg p-4 pr-24 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed">
                  {EXAMPLE_JSON}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Input area (hidden after import) */}
        {state !== 'imported' && (
          <div className="card p-5 space-y-4">
            {/* Drag & drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? 'border-green-500 bg-green-500/5'
                  : 'border-slate-600 hover:border-slate-500 bg-slate-900/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileInput}
                className="hidden"
              />
              <Upload
                size={32}
                className={`mx-auto mb-3 ${dragOver ? 'text-green-400' : 'text-slate-500'}`}
              />
              <p className="text-sm text-slate-300 font-medium">
                Arrastra un archivo .json aqui o haz clic para seleccionar
              </p>
              <p className="text-xs text-slate-500 mt-1">Solo archivos .json</p>
            </div>

            {/* File name indicator */}
            {fileName && (
              <div className="flex items-center gap-2 text-sm">
                <FileJson size={16} className="text-green-400" />
                <span className="text-slate-300">{fileName}</span>
                <button
                  onClick={() => {
                    setFileName(null);
                    setJsonText('');
                    setValidation(null);
                    setState('idle');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-slate-500 hover:text-slate-300 text-xs ml-2"
                >
                  Quitar
                </button>
              </div>
            )}

            {/* Textarea */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                O pega el JSON directamente
              </label>
              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setFileName(null);
                  setValidation(null);
                  setState('idle');
                }}
                placeholder='{"categories": [...], "brands": [...], "suppliers": [...], "products": [...]}'
                rows={8}
                className="input-field font-mono text-xs resize-y"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleValidate}
                disabled={state === 'validating' || !jsonText.trim()}
                className="btn-secondary flex items-center gap-2"
              >
                {state === 'validating' ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Check size={18} />
                )}
                {state === 'validating' ? 'Validando...' : 'Validar'}
              </button>

              <button
                onClick={handleImport}
                disabled={state !== 'validated' || hasValidationErrors}
                className="btn-primary flex items-center gap-2"
              >
                {state === 'importing' ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Upload size={18} />
                )}
                {state === 'importing' ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        )}

        {/* Validation preview */}
        {validation && state !== 'imported' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Vista previa de validacion</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Categories */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={18} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">Categorias</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crear</span>
                    <span className="text-green-400 font-mono">{validation.categories.create}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Existentes</span>
                    <span className="text-slate-300 font-mono">{validation.categories.exists}</span>
                  </div>
                  {validation.categories.errors.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Errores</span>
                      <span className="text-amber-400 font-mono">{validation.categories.errors.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Brands */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={18} className="text-blue-400" />
                  <span className="text-sm font-semibold text-white">Marcas</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crear</span>
                    <span className="text-green-400 font-mono">{validation.brands.create}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Existentes</span>
                    <span className="text-slate-300 font-mono">{validation.brands.exists}</span>
                  </div>
                  {validation.brands.errors.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Errores</span>
                      <span className="text-amber-400 font-mono">{validation.brands.errors.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Suppliers */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Truck size={18} className="text-purple-400" />
                  <span className="text-sm font-semibold text-white">Proveedores</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crear</span>
                    <span className="text-green-400 font-mono">{validation.suppliers.create}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Existentes</span>
                    <span className="text-slate-300 font-mono">{validation.suppliers.exists}</span>
                  </div>
                  {validation.suppliers.errors.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Errores</span>
                      <span className="text-amber-400 font-mono">{validation.suppliers.errors.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Products */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package size={18} className="text-green-400" />
                  <span className="text-sm font-semibold text-white">Productos</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crear</span>
                    <span className="text-green-400 font-mono">{validation.products.create}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Omitir</span>
                    <span className="text-slate-300 font-mono">{validation.products.skip}</span>
                  </div>
                  {validation.products.errors.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Errores</span>
                      <span className="text-amber-400 font-mono">{validation.products.errors.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Errors list */}
            {allErrors.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">
                    Errores encontrados ({allErrors.length})
                  </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allErrors.map((err, i) => (
                    <div
                      key={i}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs"
                    >
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import result */}
        {state === 'imported' && importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Check size={22} className="text-green-400" />
              <h2 className="text-lg font-semibold text-white">Importacion completada</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Categories result */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={18} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">Categorias</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Creadas</span>
                    <span className="text-green-400 font-mono">{importResult.categories.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Omitidas</span>
                    <span className="text-slate-300 font-mono">{importResult.categories.skipped}</span>
                  </div>
                </div>
              </div>

              {/* Brands result */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={18} className="text-blue-400" />
                  <span className="text-sm font-semibold text-white">Marcas</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Creadas</span>
                    <span className="text-green-400 font-mono">{importResult.brands.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Omitidas</span>
                    <span className="text-slate-300 font-mono">{importResult.brands.skipped}</span>
                  </div>
                </div>
              </div>

              {/* Suppliers result */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Truck size={18} className="text-purple-400" />
                  <span className="text-sm font-semibold text-white">Proveedores</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Creados</span>
                    <span className="text-green-400 font-mono">{importResult.suppliers.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Omitidos</span>
                    <span className="text-slate-300 font-mono">{importResult.suppliers.skipped}</span>
                  </div>
                </div>
              </div>

              {/* Products result */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package size={18} className="text-green-400" />
                  <span className="text-sm font-semibold text-white">Productos</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Creados</span>
                    <span className="text-green-400 font-mono">{importResult.products.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Omitidos</span>
                    <span className="text-slate-300 font-mono">{importResult.products.skipped}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Import errors */}
            {(() => {
              const importErrors = [
                ...importResult.categories.errors,
                ...importResult.brands.errors,
                ...importResult.suppliers.errors,
                ...importResult.products.errors,
              ];
              if (importErrors.length === 0) return null;
              return (
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} className="text-amber-400" />
                    <span className="text-sm font-semibold text-white">
                      Errores durante importacion ({importErrors.length})
                    </span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs"
                      >
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Reset button */}
            <div className="pt-2">
              <button onClick={handleReset} className="btn-primary flex items-center gap-2">
                <Upload size={18} />
                Nueva importacion
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
