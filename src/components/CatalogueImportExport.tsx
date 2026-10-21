"use client";

import { useRef, useState } from "react";

interface LineError {
  line: number;
  message: string;
}

interface Summary {
  created: number;
  updated: number;
  skipped: number;
  errors: LineError[];
}

/**
 * Import/export du catalogue en Excel : un bouton pour télécharger, un pour
 * envoyer un fichier modifié. L'envoi se fait en deux temps — un aperçu, sans
 * rien enregistrer, puis une confirmation — pour qu'une erreur de colonne ne
 * parte pas directement en production.
 */
export function CatalogueImportExport({ exportHref }: { exportHref: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const send = async (chosen: File, dryRun: boolean): Promise<Summary> => {
    const body = new FormData();
    body.append("fichier", chosen);
    const response = await fetch(`/api/admin/catalogue/import${dryRun ? "?apercu=1" : ""}`, { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as Summary & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "L'import a échoué.");
    return data;
  };

  const onPick = async (files: FileList | null) => {
    const chosen = files?.[0];
    if (!chosen) return;
    setError(null);
    setResult(null);
    setFile(chosen);
    setBusy(true);
    try {
      setPreview(await send(chosen, true));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "L'import a échoué.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await send(file, false));
      setPreview(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "L'import a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-export">
      <a href={exportHref} className="button button-quiet button-small">
        Exporter en Excel
      </a>
      <button type="button" className="button button-quiet button-small" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Importer un fichier Excel
      </button>

      {open && (
        <div className="import-panel">
          <p className="field-hint">
            Choisissez le fichier .xlsx exporté puis modifié (prix, stock, textes…), ou un fichier .csv avec les mêmes colonnes. Un aperçu s&apos;affiche
            d&apos;abord : rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => void onPick(event.target.files)}
            disabled={busy}
          />

          {busy && <p className="muted small">Lecture du fichier…</p>}

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          {preview && !result && (
            <div className="notice" role="status">
              <p>
                Aperçu : <strong>{preview.created}</strong> produit{preview.created > 1 ? "s" : ""} à créer, <strong>{preview.updated}</strong> à mettre à
                jour{preview.skipped > 0 ? `, ${preview.skipped} ligne${preview.skipped > 1 ? "s" : ""} ignorée${preview.skipped > 1 ? "s" : ""}` : ""}.
              </p>
              {preview.errors.length > 0 && (
                <ul className="import-errors">
                  {preview.errors.slice(0, 20).map((line, index) => (
                    <li key={index}>
                      Ligne {line.line} : {line.message}
                    </li>
                  ))}
                  {preview.errors.length > 20 && <li>… et {preview.errors.length - 20} autre(s) ligne(s).</li>}
                </ul>
              )}
              <div className="actions">
                <button type="button" className="button button-small" onClick={() => void confirm()} disabled={busy || preview.created + preview.updated === 0}>
                  Confirmer l&apos;import
                </button>
                <button type="button" className="link-button" onClick={reset}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="notice notice-ok" role="status">
              <p>
                Import terminé : <strong>{result.created}</strong> créé{result.created > 1 ? "s" : ""}, <strong>{result.updated}</strong> mis à jour
                {result.skipped > 0 ? `, ${result.skipped} ignoré${result.skipped > 1 ? "s" : ""}` : ""}. Rechargez la page pour voir les produits à jour.
              </p>
              {result.errors.length > 0 && (
                <ul className="import-errors">
                  {result.errors.slice(0, 20).map((line, index) => (
                    <li key={index}>
                      Ligne {line.line} : {line.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="actions">
                <button type="button" className="button button-small" onClick={() => location.reload()}>
                  Recharger la page
                </button>
                <button type="button" className="link-button" onClick={reset}>
                  Importer un autre fichier
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
