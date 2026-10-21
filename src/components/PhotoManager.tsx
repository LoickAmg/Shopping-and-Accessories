"use client";

import { useEffect, useRef, useState } from "react";

/** Une photo principale et jusqu'à huit photos supplémentaires. */
export const MAX_PHOTOS = 9;
/** Plus grand côté d'une photo envoyée : assez pour un zoom net, sans alourdir le site. */
const MAX_SIDE = 2000;

interface Props {
  initial: string[];
  /** Messages d'erreur du serveur sur `imageUrl` ou `gallery`. */
  error?: string;
  /** Prévient le formulaire qu'un envoi est en cours (pour ne pas enregistrer sans les photos). */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Réduit une photo dans le navigateur avant l'envoi : une photo de téléphone
 * (5 à 10 Mo) devient un fichier de quelques centaines de Ko, plus rapide à
 * envoyer et à afficher.
 */
async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`« ${file.name} » n'est pas une image lisible (JPEG, PNG ou WebP).`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Votre navigateur ne peut pas préparer la photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  // WebP si le navigateur sait l'écrire (sinon il renvoie du PNG), JPEG à défaut.
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("La photo n'a pas pu être préparée.");
  return jpeg;
}

async function upload(file: File): Promise<string> {
  const blob = await shrink(file);
  const body = new FormData();
  body.append("photo", blob, blob.type === "image/webp" ? "photo.webp" : "photo.jpg");
  const response = await fetch("/api/admin/photos", { method: "POST", body });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? "La photo n'a pas pu être envoyée.");
  return data.url;
}

export function PhotoManager({ initial, error, onBusyChange }: Props) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const room = MAX_PHOTOS - photos.length - busy;
  useEffect(() => onBusyChange?.(busy > 0), [busy, onBusyChange]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage(null);
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length < files.length) setMessage(`${MAX_PHOTOS} photos au maximum : les dernières n'ont pas été ajoutées.`);
    setBusy((count) => count + chosen.length);
    // Une à une, dans l'ordre choisi : l'ordre des photos est celui de la sélection.
    for (const file of chosen) {
      try {
        const url = await upload(file);
        setPhotos((current) => [...current, url]);
      } catch (failure) {
        setMessage(failure instanceof Error ? failure.message : "La photo n'a pas pu être envoyée.");
      } finally {
        setBusy((count) => count - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (index: number, offset: number) =>
    setPhotos((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const remove = (index: number) => setPhotos((current) => current.filter((_, i) => i !== index));
  const addLink = () => {
    const value = link.trim();
    if (!value) return;
    if (!value.startsWith("/") && !value.startsWith("https://")) {
      setMessage("L'adresse doit commencer par https:// ou être un chemin du site (/assets/…).");
      return;
    }
    if (photos.length >= MAX_PHOTOS) return;
    setPhotos((current) => [...current, value]);
    setLink("");
    setMessage(null);
  };

  return (
    <div className="photo-manager" aria-describedby={error ? "photos-error" : "photos-hint"}>
      {/* Le serveur reçoit les mêmes champs qu'avant : photo principale + galerie, une adresse par ligne. */}
      <input type="hidden" name="imageUrl" value={photos[0] ?? ""} />
      <input type="hidden" name="gallery" value={photos.slice(1).join("\n")} />

      <p className="field-hint" id="photos-hint">
        La première photo est la photo principale. Ajoutez dos, détails, porté et défauts éventuels : {MAX_PHOTOS} photos au maximum. Sur fond blanc, le
        vêtement paraît détouré.
      </p>

      {photos.length > 0 && (
        <ol className="photo-grid">
          {photos.map((url, index) => (
            <li key={`${url}-${index}`} className="photo-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${index + 1}`} loading="lazy" />
              {index === 0 && <span className="photo-badge">Principale</span>}
              <div className="photo-tools">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Avancer la photo ${index + 1}`}>
                  ←
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === photos.length - 1} aria-label={`Reculer la photo ${index + 1}`}>
                  →
                </button>
                <button type="button" onClick={() => remove(index)} aria-label={`Retirer la photo ${index + 1}`}>
                  Retirer
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: busy }, (_, index) => (
            <li key={`busy-${index}`} className="photo-item photo-pending" aria-live="polite">
              Envoi…
            </li>
          ))}
        </ol>
      )}
      {photos.length === 0 && busy > 0 && (
        <p className="muted" aria-live="polite">
          Envoi de {busy} photo{busy > 1 ? "s" : ""}…
        </p>
      )}

      <div className="photo-actions">
        <label className={`button button-quiet button-small${room <= 0 ? " is-disabled" : ""}`}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            className="sr-only"
            disabled={room <= 0}
            onChange={(event) => void onFiles(event.target.files)}
          />
          + Ajouter des photos
        </label>
        <div className="photo-link">
          <input
            type="text"
            inputMode="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
            }}
            placeholder="ou une adresse https://…"
            aria-label="Ajouter une photo par son adresse"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" className="button button-quiet button-small" onClick={addLink} disabled={!link.trim() || photos.length >= MAX_PHOTOS}>
            Ajouter
          </button>
        </div>
      </div>

      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      {error && (
        <p id="photos-error" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
