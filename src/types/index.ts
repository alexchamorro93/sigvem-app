// Roles de usuario
export type UserRole =
  | 'super_admin'
  | 'encargado_cia'
  | 'encargado_scc'
  | 'encargado_seccion'
  | 'conductor'
  | 'observador';

// Estado del vehículo
export type VehicleStatus =
  | 'OPERATIVO'
  | 'OPERATIVO_CONDICIONAL'
  | 'INOPERATIVO';

// Severidad de logs
export type LogSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

// Estado de mantenimiento
export type MaintenanceStatus = 'BIEN' | 'BAJO' | 'none';

// Estados de vista (UI) - v2
export type ViewState = 'login' | 'register' | 'units' | 'companies-menu' | 'companies-list' | 'company-detail' | 'sections-menu' | 'section-detail' | 'vehicles-list' | 'vehicle-detail' | 'users-management' | 'audit-log' | 'dashboard' | 'reports' | 'settings' | 'parte-relevo-form' | 'security-guide' | 'cleanup-test-data' | 'audit-report' | 'list' | 'detail' | 'admin-dashboard' | 'operators' | 'add' | 'info' | 'doc-section' | 'maintenance' | 'incidencias' | 'material-vehiculo' | 'movimientos' | 'material-actual-menu' | 'material-category-detail' | 'material-sigle' | 'archive' | 'parte-relevo';

// =========================
// Interfaces
// =========================

export interface SystemLog {
  id: string;
  timestamp: string | Date;
  user: string;
  action: string;
  details: string;
  severity: LogSeverity;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  data: string; // Base64
  date: string | Date;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  observations: string;
  quantity: number;
}

export interface DocItem {
  id: string;
  title: string;
  notes: string;
  attachments: Attachment[];
  checked?: boolean;
  checklist?: ChecklistItem[];
}

export interface MaintenanceLevel {
  id: string;
  label: string;
  status: MaintenanceStatus;
  lastChecked: string | Date | null;
}

export interface Incidencia {
  id: string;
  text: string;
  timestamp: string | Date;
  attachments: Attachment[];
}

export interface Movimiento {
  id: string;
  kmIniciales: string;
  kmFinales: string;
  horasTrabajo: string;
  fechaInicio: string | Date;
  fechaFin: string | Date;
  timestamp: string | Date;
}

export interface VehicleInfo {
  peso: string;
  medidas: string;
  potencia: string;
  capacidadDeposito: string;
  combustible: string;
  anioFabricacion: string;
  cilindrada: string;
  observaciones: string;
}

export interface Vehicle {
  id: string;
  company?: string;
  section?: string;
  plate?: string;
  brand?: string;
  model?: string;
  isArchived?: boolean;
  status: VehicleStatus;
  statusObservation?: string;
  info?: VehicleInfo;
  documentation?: Record<string, DocItem>;
  maintenance?: Record<string, MaintenanceLevel>;
  materialSingle?: DocItem;
  materialActual?: Record<string, DocItem>;
  incidencias?: Incidencia[];
  movimientos?: Movimiento[];
}

export interface Section {
  id: string;
  company: string;
  name: string;
  password: string;
}

export interface User {
  id: string;
  company: string;
  companyCode: string;
  section?: string;
  username: string;
  password: string;
  role: UserRole;
  securityQuestion: string;
  securityAnswer: string;
}
