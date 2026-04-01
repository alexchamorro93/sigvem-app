/**
 * Utilidad para manejar PDFs de Parte Relevo
 * Permite cargar, editar y generar PDFs con datos personalizados
 * 
 * Nota: PDFLib requiere compilación nativa que en este entorno no está disponible.
 * Este archivo se mantiene como referencia para futuras mejoras.
 */

// import { PDFDocument, rgb, StandardFonts } from 'pdflib';

export interface ParteReleloData {
  // Encabezado
  matricula?: string;
  numero_parte?: string;
  fecha?: string;

  // Herramientas (checkboxes)
  herramientas?: { [key: string]: boolean };
  
  // Observaciones
  novedades_entrega?: string;
  novedades_exteriores?: string;
  novedades_varias?: string;
  
  // Entregas/Recepciones
  entregas?: Array<{
    unidad?: string;
    empleo_cargo?: string;
    firma?: string;
    nombre_apellidos?: string;
    fecha?: string;
  }>;

  // Otros campos opcionales
  exterior?: { [key: string]: boolean };
  interior?: { [key: string]: boolean };
  documentacion?: { [key: string]: boolean };
  afuste?: { [key: string]: boolean };
  kit_recuperacion?: { [key: string]: boolean };
}

/**
 * Convierte el PDF base64 a un Data URL para poder cargarlo en el navegador
 */
export const base64ToDataUrl = (base64: string): string => {
  return `data:application/pdf;base64,${base64}`;
};

/**
 * Carga un PDF desde base64
 * Nota: Esta función requiere pdflib que no está disponible en este entorno
 */
export const loadPdfFromBase64 = async (base64: string) => {
  console.warn('loadPdfFromBase64 no está disponible en este entorno');
  return null;
};

/**
 * Genera un PDF rellenado con los datos del parte relevo
 * Nota: Esta función requiere pdflib que no está disponible en este entorno
 */
export const generateParteRelevoPdf = async (
  pdfDoc: any,
  data: ParteReleloData
): Promise<Uint8Array> => {
  console.warn('generateParteRelevoPdf no está disponible en este entorno');
  return new Uint8Array();
};

/**
 * Descarga un PDF en el navegador
 */
// export const downloadPdf = (pdfBytes: Uint8Array, filename: string) => {
//   const blob = new Blob([pdfBytes], { type: 'application/pdf' });
//   const url = URL.createObjectURL(blob);
//   const link = document.createElement('a');
//   link.href = url;
//   link.download = filename;
//   document.body.appendChild(link);
//   link.click();
//   document.body.removeChild(link);
//   URL.revokeObjectURL(url);
// };
