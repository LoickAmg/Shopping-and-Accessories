import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Lecture et écriture de classeurs Excel (.xlsx) sans dépendance lourde : un
 * .xlsx est une archive zip de fichiers XML. On n'écrit que du texte et des
 * nombres, avec une ligne d'en-tête mise en forme ; on ne lit que des valeurs
 * (pas de formules ni de mise en forme). Un export CSV d'Excel est aussi lu.
 */

export type Cell = string | number | null | undefined;

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Largeur de chaque colonne, en caractères. */
  widths?: number[];
  /** Première ligne en gras sur fond coloré, figée, avec filtres. */
  header?: boolean;
  /** Retour à la ligne automatique dans toutes les cellules (feuilles de texte). */
  wrap?: boolean;
  /** Lignes (index à partir de 0) à mettre en gras : titres de section. */
  boldRows?: number[];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caractères de contrôle interdits en XML (sauf tabulation et retours à la ligne).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** « A », « B »… « Z », « AA »… */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

// Styles : 0 normal, 1 en-tête (gras, fond rose pâle, bordure), 2 texte à la ligne, 3 gras.
const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8E6EF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFB81070"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

function sheetXml(sheet: SheetSpec): string {
  const bold = new Set(sheet.boldRows ?? []);
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const style = sheet.header && rowIndex === 0 ? 1 : bold.has(rowIndex) ? 3 : sheet.wrap ? 2 : 0;
      const cells = row
        .map((value, colIndex) => {
          if (value == null || value === "") return "";
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          const s = style ? ` s="${style}"` : "";
          if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const lastColumn = columnName(Math.max(0, ...sheet.rows.map((row) => row.length - 1)));
  const freeze = sheet.header
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter = sheet.header && sheet.rows.length > 0 ? `<autoFilter ref="A1:${lastColumn}${Math.max(1, sheet.rows.length)}"/>` : "";
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}</worksheet>`;
}

/** Fabrique un classeur .xlsx (une feuille par entrée). */
export function writeXlsx(sheets: SheetSpec[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const overrides = sheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  files["[Content_Types].xml"] = strToU8(
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  // Noms de feuille : 31 caractères au plus, sans : \ / ? * [ ].
  const names = sheets.map((sheet) => escapeXml(sheet.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31)));
  files["xl/workbook.xml"] = strToU8(
    `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  files["xl/styles.xml"] = strToU8(STYLES);
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Texte d'un élément `<si>` ou `<is>` : `<t>` simple ou suite de `<r><t>` (texte enrichi). */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((match) => match[1] ?? "");
  return decodeXml(parts.join(""));
}

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetError";
  }
}

/** Nombre stocké par Excel → texte lisible (« 45000 », « 12.5 »), sans les imprécisions binaires. */
function numberText(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return String(Math.round(value * 1e6) / 1e6);
}

const MAX_ENTRY_BYTES = 30 * 1024 * 1024;

/**
 * Lit une feuille d'un classeur .xlsx : celle nommée `preferred` si elle
 * existe, sinon la première. Renvoie les valeurs en texte, ligne par ligne.
 */
export function readXlsx(bytes: Uint8Array, preferred?: string): { sheet: string; rows: string[][] } {
  let entries: Record<string, Uint8Array>;
  try {
    let total = 0;
    entries = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        // Protection contre une archive piégée qui se décompresse en gigaoctets.
        if (file.originalSize > MAX_ENTRY_BYTES || total > MAX_ENTRY_BYTES * 2) throw new SpreadsheetError("Fichier trop volumineux.");
        return file.name.startsWith("xl/") || file.name === "[Content_Types].xml";
      },
    });
  } catch (error) {
    if (error instanceof SpreadsheetError) throw error;
    throw new SpreadsheetError("Ce fichier n'est pas un classeur Excel (.xlsx) lisible.");
  }
  const text = (path: string) => (entries[path] ? strFromU8(entries[path]) : "");
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new SpreadsheetError("Ce fichier n'est pas un classeur Excel (.xlsx) lisible.");

  const sheets = [...workbook.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)].map((match) => ({ name: decodeXml(match[1]), rid: match[2] }));
  const rels = Object.fromEntries(
    [...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*?Id="([^"]*)"[^>]*?Target="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
  const wanted = sheets.find((sheet) => preferred && sheet.name.trim().toLowerCase() === preferred.toLowerCase()) ?? sheets[0];
  if (!wanted) throw new SpreadsheetError("Le classeur ne contient aucune feuille.");
  const target = (rels[wanted.rid] ?? "worksheets/sheet1.xml").replace(/^\/?xl\//, "").replace(/^\//, "");
  const sheetXmlText = text(`xl/${target}`);
  if (!sheetXmlText) throw new SpreadsheetError(`La feuille « ${wanted.name} » est illisible.`);

  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]));

  const rows: string[][] = [];
  for (const rowMatch of sheetXmlText.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1] ?? rowMatch[3] ?? "")?.[1] ?? rows.length + 1);
    const row: string[] = [];
    let position = 0;
    for (const cell of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1];
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+)\d*"/.exec(attributes)?.[1];
      const index = ref ? columnIndex(ref) : position;
      position = index + 1;
      const type = /\bt="([^"]*)"/.exec(attributes)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "str" || type === "e") value = decodeXml(raw ?? "");
      else if (type === "b") value = raw === "1" ? "Oui" : "Non";
      else value = raw == null ? "" : numberText(decodeXml(raw));
      row[index] = value;
    }
    rows[rowNumber - 1] = Array.from(row, (value) => value ?? "");
  }
  return { sheet: wanted.name, rows: Array.from(rows, (row) => row ?? []) };
}

/** Lit un fichier CSV (séparateur « ; » d'Excel en français, ou « , »), guillemets et BOM compris. */
export function readCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Lit un fichier envoyé : .xlsx (de préférence) ou .csv. */
export function readSpreadsheet(bytes: Uint8Array, preferredSheet?: string): string[][] {
  // Un .xlsx commence par la signature zip « PK ».
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes, preferredSheet).rows;
  if (bytes.includes(0)) throw new SpreadsheetError("Format non reconnu : enregistrez le fichier au format Excel (.xlsx).");
  return readCsv(new TextDecoder("utf-8").decode(bytes));
}
