import type { MaintenanceLevel } from '../types';

// =========================
// Documentación
// =========================

export const DOC_SECTIONS = [
  { id: 'doc_vehiculo', title: 'Documentación Vehículo' },
  { id: 'itv', title: 'ITV' },
  { id: 'f2404', title: '2404' },
  { id: 'seguro', title: 'Seguro' },
  { id: 'manuales', title: 'Manuales' },
  { id: 'jefe_vehiculo', title: 'Jefe Vehículo' },
  { id: 'jefe_convoy', title: 'Jefe Convoy' },
  { id: 'peajes', title: 'Procedimiento Peajes' },
  { id: 'recuperacion', title: 'Normas de Recuperación' }
] as const;

// Tipo automático desde el array
export type DocSectionId = typeof DOC_SECTIONS[number]['id'];

// =========================
// Mantenimiento
// =========================

export const MAINT_SECTIONS = [
  { id: 'aceite_motor', label: 'Aceite Motor' },
  { id: 'aceite_caja', label: 'Aceite Caja de Cambios' },
  { id: 'liquido_frenos', label: 'Líquido Frenos' },
  { id: 'liquido_direccion', label: 'Líquido Dirección' },
  { id: 'liquido_parabrisas', label: 'Líquido Parabrisas' }
] as const;

export type MaintenanceSectionId = typeof MAINT_SECTIONS[number]['id'];

// =========================
// Material actual
// =========================

export const MATERIAL_ACTUAL_SECTIONS = [
  { id: 'herramientas', title: 'Herramientas Comunes' },
  { id: 'interior', title: 'Interior Vehículo' },
  { id: 'exterior', title: 'Exterior Vehículo' },
  { id: 'afuste', title: 'Afuste' },
  { id: 'documentacion', title: 'Documentación' },
  { id: 'transmisiones', title: 'Transmisiones' }
] as const;

export type MaterialActualSectionId =
  typeof MATERIAL_ACTUAL_SECTIONS[number]['id'];
