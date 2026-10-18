import { useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import { DirectoryEntry } from '../types';
import {
  X,
  Folder,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export function AddProjectModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan and form state
  const [plan, setPlan] = useState<any>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDialect, setProjectDialect] = useState('postgres');
  const [installSkill, setInstallSkill] = useState(true);

  // Step 4 state
  const [bootstrapPrompt, setBootstrapPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState('');
  const [adopted, setAdopted] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(true);
  const [conflict, setConflict] = useState<{ id: string; existingPath: string } | null>(null);

  // Load directories
  const loadDirectory = async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.browseFs(path);
      setCurrentPath(res.current);
      setParentPath(res.parent);
      setDirectories(res.directories);
      setSelectedPath(res.current);
      setManualPath(res.current);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, []);

  const handleGoToManualPath = async () => {
    const target = manualPath.trim();
    if (!target) return;
    await loadDirectory(target);
  };

  const handleUseManualPath = () => {
    const target = manualPath.trim();
    if (!target) return;
    setSelectedPath(target);
    setError(null);
  };

  const handleNextToPlan = async () => {
    if (!selectedPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.planProject(selectedPath);
      setPlan(res.plan);
      setProjectName(res.plan.defaultName);
      // Same id already registered for another path: ask before registering.
      setConflict(
        res.plan.mode === 'adopt' && res.plan.registry?.conflict
          ? {
              id: res.plan.registry.conflict.id,
              existingPath: res.plan.registry.conflict.path,
            }
          : null
      );
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (resolveConflict?: 'replace' | 'new') => {
    setLoading(true);
    setError(null);
    try {
      const isAdopt = plan?.mode === 'adopt';
      const res = await api.addProject({
        path: selectedPath,
        // Adopt keeps the repo's own name/dialect; never send form defaults.
        ...(isAdopt
          ? {}
          : {
              name: projectName.trim(),
              dialect: projectDialect,
              installProjectSkill: installSkill,
            }),
        ...(resolveConflict ? { resolveConflict } : {}),
      });

      setAdopted(res.adopted);
      setNeedsBootstrap(res.needsBootstrap);
      if (res.needsBootstrap) {
        const promptRes = await api.getBootstrapPrompt(res.project.id);
        setBootstrapPrompt(promptRes.prompt);
      }
      setCreatedProjectId(res.project.id);
      setConflict(null);
      setStep(4);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.body?.code === 'PROJECT_CONFLICT') {
        setConflict({ id: err.body.id, existingPath: err.body.existingPath });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(bootstrapPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 580,
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Añadir Proyecto</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Paso {step} de 4
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
          {error && (
            <div
              style={{
                backgroundColor: 'var(--danger-bg)',
                color: 'var(--danger)',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                gap: 8,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Select Folder */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Navega y selecciona la carpeta del proyecto o repositorio de tu cliente:
              </p>

              {/* Path bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto',
                }}
              >
                <FolderOpen size={14} color="var(--accent)" />
                <span>{currentPath}</span>
              </div>

              {/* Manual path input */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGoToManualPath();
                  }}
                  placeholder="Pega una ruta y pulsa Ir (ej: E:\dev\mi-proyecto o /Users/tu-usuario/proyecto)"
                  style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleGoToManualPath}
                  disabled={loading || !manualPath.trim()}
                >
                  Ir
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleUseManualPath}
                  disabled={!manualPath.trim()}
                  title="Selecciona esta ruta aunque no se pueda explorar"
                >
                  Usar ruta
                </button>
              </div>

              {selectedPath && selectedPath !== currentPath && (
                <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  Ruta seleccionada: {selectedPath}
                </p>
              )}

              {/* Directory list */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  height: 240,
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                {parentPath && (
                  <div
                    onClick={() => loadDirectory(parentPath)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 13,
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>.. (subir al directorio padre)</span>
                  </div>
                )}
                {loading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Cargando carpetas...
                  </div>
                ) : (
                  directories.map((d) => (
                    <div
                      key={d.path}
                      onClick={() => setSelectedPath(d.path)}
                      onDoubleClick={() => loadDirectory(d.path)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        fontSize: 13,
                        backgroundColor:
                          selectedPath === d.path
                            ? 'var(--accent-light)'
                            : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Folder size={14} color={selectedPath === d.path ? 'var(--accent)' : 'var(--text-muted)'} />
                        <span>{d.name}</span>
                        {d.isGitRepo && <span className="badge badge-gray">git</span>}
                        {d.hasSchemaMemory && <span className="badge badge-green">schema-memory</span>}
                      </div>
                      <ChevronRight size={14} color="var(--text-muted)" onClick={(e) => { e.stopPropagation(); loadDirectory(d.path); }} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STEP 2 (adopt): repo already configured */}
          {step === 2 && plan?.mode === 'adopt' && plan.existing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: 14,
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--accent)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={18} color="var(--success)" />
                  <strong>Proyecto detectado: {plan.existing.name}</strong>
                  {plan.registry.registered && (
                    <span className="badge badge-green">ya registrado</span>
                  )}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  ID: <code>{plan.existing.id}</code> · Dialecto: <strong>{plan.existing.dialect}</strong>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {plan.existing.tablesCount} tablas · {plan.existing.adrCount} ADRs · creado{' '}
                  {new Date(plan.existing.createdAt).toLocaleDateString()}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  Este repositorio ya está configurado. Solo se registrará en esta
                  máquina; <code>.schema-memory/</code> no se sobrescribe.
                </p>
              </div>

              {plan.actions.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Cambio menor: {plan.actions.map((a: any) => a.file).join(', ')} (bloque gestionado de reglas).
                </div>
              )}

              {conflict && (
                <div
                  style={{
                    padding: 14,
                    border: '1px solid var(--warning)',
                    borderRadius: 8,
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ color: 'var(--warning)', fontWeight: 600 }}>
                    ⚠️ Ya existe un proyecto <code>{conflict.id}</code> registrado en otra ruta:
                  </div>
                  <code style={{ fontFamily: 'var(--font-mono)' }}>{conflict.existingPath}</code>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => handleApply('replace')}
                    >
                      Reemplazar la ruta anterior
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={() => handleApply('new')}
                    >
                      Registrar como nuevo (ID distinto)
                    </button>
                    <button className="btn btn-secondary" onClick={() => setConflict(null)}>
                      Cancelar
                    </button>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    "Como nuevo" actualiza el <code>id</code> en <code>.schema-memory/config.json</code> de este repo.
                  </span>
                </div>
              )}

              {plan.warnings.length > 0 && (
                <div style={{ color: 'var(--warning)', fontSize: 12 }}>
                  {plan.warnings.map((w: string, i: number) => (
                    <div key={i}>⚠️ {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Dry Run Plan */}
          {step === 2 && plan && plan.mode !== 'adopt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Vista Previa de Cambios (Dry Run)</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Stack detectado: <strong>{plan.stack.join(', ') || 'genérico'}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.actions.map((a: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{a.file}</span>
                      <span className="badge badge-blue">{a.op.toUpperCase()}</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>{a.preview}</p>
                    {a.diff && (
                      <pre
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 11,
                          marginTop: 6,
                          overflowX: 'auto',
                        }}
                      >
                        {a.diff}
                      </pre>
                    )}
                  </div>
                ))}
              </div>

              {plan.warnings.length > 0 && (
                <div style={{ color: 'var(--warning)', fontSize: 12 }}>
                  {plan.warnings.map((w: string, i: number) => (
                    <div key={i}>⚠️ {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Project Settings */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Nombre del Proyecto
                </label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="Mi Tienda Online"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Dialecto de Base de Datos
                </label>
                <select
                  value={projectDialect}
                  onChange={(e) => setProjectDialect(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="sqlite">SQLite</option>
                  <option value="mssql">SQL Server</option>
                  <option value="oracle">Oracle</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={installSkill}
                    onChange={(e) => setInstallSkill(e.target.checked)}
                  />
                  <span>Instalar Skill de Proyecto en <code>.agents/skills/schema-memory-project/</code></span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: Success & Bootstrap Prompt */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <CheckCircle size={44} color="var(--success)" />
              </div>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 700 }}>
                  {adopted ? '¡Proyecto registrado!' : '¡Proyecto Acoplado con Éxito!'}
                </h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {adopted
                    ? 'Se reutilizó la configuración existente del repositorio (sin modificarla).'
                    : 'Se han configurado los archivos en el repositorio.'}
                </p>
              </div>

              {needsBootstrap && (
                <div
                  style={{
                    textAlign: 'left',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--accent)',
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    <Sparkles size={16} />
                    <span>Prompt de arranque inicial para tu Agente IA</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Envía este mensaje a tu agente en tu terminal o IDE para que inspeccione el código y genere el esquema canónico inicial:
                  </p>
                  <pre
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {bootstrapPrompt}
                  </pre>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: 10 }}
                    onClick={handleCopyPrompt}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado al portapapeles' : 'Copiar Prompt para la IA'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          {step > 1 && step < 4 ? (
            <button className="btn btn-secondary" onClick={() => setStep((s) => (s - 1) as any)}>
              <ArrowLeft size={14} /> Atrás
            </button>
          ) : <div />}

          {step === 1 && (
            <button className="btn btn-primary" onClick={handleNextToPlan} disabled={loading || !selectedPath}>
              Continuar <ArrowRight size={14} />
            </button>
          )}

          {step === 2 && plan?.mode === 'adopt' && (
            <button
              className="btn btn-primary"
              onClick={() => handleApply()}
              disabled={loading || !!conflict}
            >
              Registrar proyecto
            </button>
          )}

          {step === 2 && plan?.mode !== 'adopt' && (
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              Configurar <ArrowRight size={14} />
            </button>
          )}

          {step === 3 && (
            <button className="btn btn-primary" onClick={() => handleApply()} disabled={loading || !projectName.trim()}>
              Confirmar y Acoplar Proyecto
            </button>
          )}

          {step === 4 && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onAdded(createdProjectId);
                onClose();
              }}
            >
              Abrir Esquema en Canvas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
