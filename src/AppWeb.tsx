/* eslint-disable unicode-bom */
import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, orderBy, limit, setDoc, getDoc, serverTimestamp, documentId
} from 'firebase/firestore';
// initializeApp / deleteApp removed: user creation now uses Firebase Auth REST API
import {
  signInWithEmailAndPassword,
  signOut as signOutAuth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser as deleteAuthUser
} from 'firebase/auth';
import {
  CheckCircleIcon, TrashIcon, Cog6ToothIcon,
  ArrowRightOnRectangleIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, MoonIcon, SunIcon, ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { db, auth, app } from './firebaseConfig';
import { VehicleStatus, ViewState } from './types';
import { useTheme } from './ThemeContext';
import jsPDF from 'jspdf';
import logo from './assets/logo.jpg';
import { ParteRelevoForm } from './components/ParteRelevoForm';
import {
  hashSHA256,
  ClassificationLevel, createSecureSession, generateCSRFToken,
  recordFailedLoginAttempt, clearLoginAttempts, isAccountLocked, isDeviceLocked, getDeviceInfo,
  validateMilitaryPassword, isCommonPassword, createSecurityAuditLog, MILITARY_ROLES
} from './utils/securityUtils';
import { storeSecureSession, clearSecureSession, startSessionMonitoring } from './utils/sessionUtils';
import { SecurityAlert } from './components/SecurityAlert';
import { SecurityGuide } from './components/SecurityGuide';

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  vehicleType?: 'bn1' | 'bn3' | 'portaspike' | 's3' | 'anibal' | 'landtrek';
  sectionId: string;
  status: VehicleStatus;
  isArchived?: boolean;
  nextItvDate?: string; // Formato YYYY-MM-DD
  createdAt?: any;
  siglePdfName?: string;
  siglePdfSize?: number;
  siglePdfUploadDate?: string;
  siglePdfBase64?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: any;
  documentationState?: VehicleDocumentationState;
  nivelesState?: VehicleNivelesState;
  materialsState?: VehicleMaterialsState;
  movementsState?: VehicleMovementsState;
  incidenciasState?: VehicleIncidenciasState;
  avisosState?: VehicleAvisosState;
  novedadesState?: VehicleNovedadesState;
  sectionControlKm?: number | null;
  sectionControlHours?: number | null;
  parteRelevoDraft?: any;
}

interface User {
  id: string;
  username: string;
  password: string;
  email?: string;
  authUid?: string;
  role: 'super_admin' | 'encargado_cia' | 'encargado_seccion' | 'operador' | 'consulta' | 's4' | 'encargado_vehiculos';
  unitId?: string | null;
  companyId?: string | null;
  sectionId?: string | null;
  company?: string;
  companyCode?: string;
  section?: string;
  accessCode?: string;
  createdAt?: any;
}

interface Section {
  id: string;
  name: string;
  companyId: string;
  accessCode: string;
  avisosState?: SectionAvisosState;
  createdAt?: any;
}

interface SystemLog {
  id: string;
  timestamp: any;
  user: string;
  action: string;
  details: string;
}

interface Company {
  id: string;
  name: string;
  createdAt?: any;
}

interface Unit {
  id: string;
  name: string;
  createdAt?: any;
}

interface FeatureProposal {
  id: string;
  text: string;
  createdBy: string;
  createdByRole: User['role'];
  companyId?: string | null;
  sectionId?: string | null;
  status?: 'pending' | 'reviewed' | 'planned' | 'done';
  createdAt?: Date;
}

interface AppAnnouncement {
  id: string;
  title: string;
  message: string;
  active: boolean;
  createdBy?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

interface VehicleTransfer {
  id: string;
  sourceVehicleId: string;
  sourceVehiclePlate: string;
  sourceSectionId: string;
  sourceSectionName: string;
  sourceSectionCode: string;
  sourceCompanyId?: string | null;
  destinationSectionId: string;
  destinationSectionName: string;
  destinationSectionCode: string;
  destinationCompanyId?: string | null;
  copiedVehicleId: string;
  participantSectionIds: string[];
  sourceConfirmed: boolean;
  sourceConfirmedBy?: string;
  sourceConfirmedAt?: Date;
  destinationConfirmed: boolean;
  destinationConfirmedBy?: string;
  destinationConfirmedAt?: Date;
  status: 'pending_confirmation' | 'completed' | 'cancelled';
  createdBy: string;
  createdByRole: User['role'];
  createdAt?: Date;
  completedAt?: Date;
  completedBy?: string;
}

interface AnnouncementFormState {
  title: string;
  message: string;
}

const ANNOUNCEMENT_DURATION_DAYS = 5;
const BIOMETRIC_RECONFIG_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

type VehicleSnapshot = {
  documentation: VehicleDocumentationState;
  niveles: VehicleNivelesState;
  materials: VehicleMaterialsState;
  movements: VehicleMovementsState;
  incidencias: VehicleIncidenciasState;
  avisos: VehicleAvisosState;
  info: { plate: string; brand: string; model: string };
  type: string;
};

type VehicleDocumentationState = { [key: string]: { checked: boolean; notes: string } };
type VehicleNivelesState = { [key: string]: 'BIEN' | 'BAJO' | null };
type VehicleMaterialsState = { [category: string]: Array<{id: string; name: string; checked: boolean; quantity: number; observations: string}> };
type VehicleMovementsState = Array<{id: string; fechaInicio: string; horaInicio: string; fechaFin: string; horaFin: string; kmInicial: number; kmFinal: number; horas: number}>;
type VehicleIncidenciasState = Array<{id: string; titulo: string; notas: string; observaciones: string; fecha: string; comentarios?: Array<{id: string; usuario: string; texto: string; fecha: string}>}>;
type VehicleAvisoModo = 'persistent' | 'scheduled' | 'weekly';
type VehicleAvisosState = Array<{id: string; texto: string; fecha: string; creadoPor?: string; modo?: VehicleAvisoModo; scheduledDate?: string; weeklyDay?: number; weeklyTime?: string; lastCompletedOccurrence?: string}>;
type VehicleNovedadItem = { id: string; texto: string; fecha: string; resuelta: boolean; fechaResuelta?: string; creadoPor?: string };
type VehicleNovedadesState = Array<VehicleNovedadItem>;
type SectionAvisoMode = 'persistent' | 'weekly' | 'scheduled';
type SectionAvisoItem = {
  id: string;
  texto: string;
  fecha: string;
  creadoPor?: string;
  modo?: SectionAvisoMode;
  weeklyDay?: number;
  weeklyTime?: string;
  lastCompletedOccurrence?: string;
  scheduledDate?: string;
};
type SectionAvisosState = Array<SectionAvisoItem>;
type AuditStatusSummary = {
  operativo: number;
  condicional: number;
  inoperativo: number;
};
type AuditVehicleSummary = {
  total: number;
  status: AuditStatusSummary;
  byType: Record<string, number>;
};
type AuditVehicleItem = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  status: string;
  vehicleType: string;
};
type AuditSectionReport = {
  sectionId: string;
  sectionName: string;
  vehicles: AuditVehicleItem[];
  summary: AuditVehicleSummary;
};
type AuditCompanyReport = {
  companyId: string;
  companyName: string;
  sections: AuditSectionReport[];
  summary: AuditVehicleSummary;
};
type AuditUnitReport = {
  unitId: string;
  unitName: string;
  companies: AuditCompanyReport[];
  summary: AuditVehicleSummary;
};
type AppPermission =
  | 'manage_units'
  | 'create_company'
  | 'edit_company'
  | 'delete_company'
  | 'create_section'
  | 'edit_section'
  | 'delete_section'
  | 'create_vehicle'
  | 'update_vehicle'
  | 'delete_vehicle'
  | 'archive_vehicle'
  | 'create_user'
  | 'delete_user'
  | 'read_audit_logs'
  | 'read_audit_report';

const ROLE_PERMISSIONS: Record<User['role'], Record<AppPermission, boolean>> = {
  super_admin: {
    manage_units: true,
    create_company: true,
    edit_company: true,
    delete_company: true,
    create_section: true,
    edit_section: true,
    delete_section: true,
    create_vehicle: true,
    update_vehicle: true,
    delete_vehicle: true,
    archive_vehicle: true,
    create_user: true,
    delete_user: true,
    read_audit_logs: true,
    read_audit_report: true
  },
  encargado_cia: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: true,
    edit_section: true,
    delete_section: true,
    create_vehicle: true,
    update_vehicle: true,
    delete_vehicle: true,
    archive_vehicle: true,
    create_user: true,
    delete_user: true,
    read_audit_logs: false,
    read_audit_report: false
  },
  encargado_seccion: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: false,
    edit_section: false,
    delete_section: false,
    create_vehicle: true,
    update_vehicle: true,
    delete_vehicle: true,
    archive_vehicle: true,
    create_user: false,
    delete_user: false,
    read_audit_logs: false,
    read_audit_report: false
  },
  operador: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: false,
    edit_section: false,
    delete_section: false,
    create_vehicle: true,
    update_vehicle: true,
    delete_vehicle: false,
    archive_vehicle: false,
    create_user: false,
    delete_user: false,
    read_audit_logs: false,
    read_audit_report: false
  },
  consulta: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: false,
    edit_section: false,
    delete_section: false,
    create_vehicle: false,
    update_vehicle: false,
    delete_vehicle: false,
    archive_vehicle: false,
    create_user: false,
    delete_user: false,
    read_audit_logs: false,
    read_audit_report: false
  },
  s4: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: false,
    edit_section: false,
    delete_section: false,
    create_vehicle: false,
    update_vehicle: false,
    delete_vehicle: false,
    archive_vehicle: false,
    create_user: false,
    delete_user: false,
    read_audit_logs: false,
    read_audit_report: false
  },
  encargado_vehiculos: {
    manage_units: false,
    create_company: false,
    edit_company: false,
    delete_company: false,
    create_section: true,
    edit_section: true,
    delete_section: true,
    create_vehicle: true,
    update_vehicle: true,
    delete_vehicle: true,
    archive_vehicle: true,
    create_user: false,
    delete_user: false,
    read_audit_logs: false,
    read_audit_report: false
  }
};

const getDefaultVehicleDocumentation = (): VehicleDocumentationState => ({
  'Documentación Vehículo': { checked: false, notes: '' },
  'ITV': { checked: false, notes: '' },
  '2404': { checked: false, notes: '' },
  'Seguro': { checked: false, notes: '' },
  'Manuales': { checked: false, notes: '' },
  'Jefe Vehículo': { checked: false, notes: '' },
  'Jefe Convoy': { checked: false, notes: '' },
  'Procedimiento Peajes': { checked: false, notes: '' },
  'Normas de Recuperación': { checked: false, notes: '' }
});

const getDefaultVehicleNiveles = (): VehicleNivelesState => ({
  'Aceite Motor': null,
  'Aceite Caja de Cambios': null,
  'Líquido Frenos': null,
  'Líquido Dirección': null,
  'Líquido Parabrisas': null
});

const getDefaultTransmisiones = () => [
  { nombre: 'BASTIDOR SIMPLE', presente: false, cantidad: 0, version: '' },
  { nombre: 'BASTIDOR DOBLE', presente: false, cantidad: 0, version: '' },
  { nombre: 'BASE DE ANTENA', presente: false, cantidad: 0, version: '' },
  { nombre: 'FUENTE DE ALIMENTACION', presente: false, cantidad: 0 },
  { nombre: 'CABLE DE ALIMENTACION', presente: false, cantidad: 0 },
  { nombre: 'CAJA DE 8 PINES', presente: false, cantidad: 0 },
];

const getDefaultVehicleMaterials = (): VehicleMaterialsState => ({
  'Herramientas Comunes': [],
  'Interior Vehículo': [],
  'Exterior Vehículo': [],
  'Afuste': [],
  'Documentación': [],
  'Transmisiones': []
});

const getDefaultVehicleMovements = (): VehicleMovementsState => ([]);

const getDefaultVehicleIncidencias = (): VehicleIncidenciasState => ([]);

const getDefaultVehicleAvisos = (): VehicleAvisosState => ([]);

const getDefaultSectionAvisos = (): SectionAvisosState => ([]);

const createLocalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const WEEK_DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' }
];

const normalizeSectionAviso = (item: any): SectionAvisoItem => {
  let modo: SectionAvisoMode = 'persistent';
  if (item?.modo === 'weekly') modo = 'weekly';
  else if (item?.modo === 'scheduled') modo = 'scheduled';

  const normalized: SectionAvisoItem = {
    id: String(item?.id || Math.random().toString(36).substr(2, 9)),
    texto: String(item?.texto || ''),
    fecha: String(item?.fecha || ''),
    modo
  };

  if (item?.creadoPor) {
    normalized.creadoPor = String(item.creadoPor);
  }

  if (modo === 'weekly') {
    if (Number.isInteger(item?.weeklyDay)) {
      normalized.weeklyDay = Number(item.weeklyDay);
    }
    if (typeof item?.weeklyTime === 'string') {
      normalized.weeklyTime = item.weeklyTime;
    }
    if (typeof item?.lastCompletedOccurrence === 'string') {
      normalized.lastCompletedOccurrence = item.lastCompletedOccurrence;
    }
  }

  if (modo === 'scheduled' && typeof item?.scheduledDate === 'string') {
    normalized.scheduledDate = item.scheduledDate;
  }

  return normalized;
};

const normalizeSectionAvisos = (value: any): SectionAvisosState => {
  if (!Array.isArray(value)) return getDefaultSectionAvisos();
  return value.map((item) => normalizeSectionAviso(item));
};

const getWeeklyOccurrenceStart = (aviso: SectionAvisoItem, now: Date): Date | null => {
  if (aviso.modo !== 'weekly') return null;
  if (!Number.isInteger(aviso.weeklyDay) || !aviso.weeklyTime) return null;
  const [hoursRaw, minutesRaw] = String(aviso.weeklyTime).split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes, 0, 0);
  const dayDiff = Number(aviso.weeklyDay) - now.getDay();
  candidate.setDate(now.getDate() + dayDiff);

  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 7);
  }

  return candidate;
};

const shouldShowSectionAviso = (aviso: SectionAvisoItem, now: Date): boolean => {
  const mode = aviso.modo || 'persistent';

  if (mode === 'scheduled') {
    if (!aviso.scheduledDate) return false;
    return now >= new Date(aviso.scheduledDate);
  }

  if (mode !== 'weekly') return true;

  const occurrenceStart = getWeeklyOccurrenceStart(aviso, now);
  if (!occurrenceStart) return true;
  const occurrenceKey = occurrenceStart.toISOString();
  return aviso.lastCompletedOccurrence !== occurrenceKey;
};

const shouldShowVehicleAviso = (aviso: {modo?: VehicleAvisoModo; scheduledDate?: string; weeklyDay?: number; weeklyTime?: string; lastCompletedOccurrence?: string}, now: Date): boolean => {
  if (!aviso.modo || aviso.modo === 'persistent') return true;
  if (aviso.modo === 'scheduled') {
    if (!aviso.scheduledDate) return false;
    return now >= new Date(aviso.scheduledDate);
  }
  if (aviso.modo === 'weekly') {
    const occurrenceStart = getWeeklyOccurrenceStart(aviso as SectionAvisoItem, now);
    if (!occurrenceStart) return true;
    return aviso.lastCompletedOccurrence !== occurrenceStart.toISOString();
  }
  return true;
};


const AppWeb: React.FC = () => {
  // Hooks deben ser llamados al inicio del componente
  const { isDark, toggleTheme } = useTheme();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitCompanies, setUnitCompanies] = useState<Record<string, string[]>>({});
  const [newUnitName, setNewUnitName] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [draggedCompanyId, setDraggedCompanyId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState<ViewState>('login');
  const [usersManagementBackView, setUsersManagementBackView] = useState<ViewState>('companies-list');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedSectionMenuTab, setSelectedSectionMenuTab] = useState<'vehiculos' | 'avisos' | 'control' | 'itvs' | 'mensajes' | 'parte-carga' | 'novedades'>('vehiculos');
  const [selectedNovedadesVehicleId, setSelectedNovedadesVehicleId] = useState<string>('');
  const [novedadesNewText, setNovedadesNewText] = useState('');
  const [novedadesSaveStatus, setNovedadesSaveStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [showSolventadasNovedades, setShowSolventadasNovedades] = useState(false);
  const [parteCargaItems, setParteCargaItems] = useState<Record<string, {id: string; text: string; qty: number}[]>>({});
  const [parteCargaExtraVehicles, setParteCargaExtraVehicles] = useState<{id: string; label: string}[]>([]);
  const [parteCargaNewExtraLabel, setParteCargaNewExtraLabel] = useState('');
  const [parteCargaVehicleOrder, setParteCargaVehicleOrder] = useState<string[]>([]);
  const [parteCargaDragOverVehicle, setParteCargaDragOverVehicle] = useState<string | null>(null);
  const [parteCargaHiddenVehicles, setParteCargaHiddenVehicles] = useState<string[]>([]);
  const [parteCargaVehicleLabels, setParteCargaVehicleLabels] = useState<Record<string, string>>({});
  const [editingVehicleLabelKey, setEditingVehicleLabelKey] = useState<string | null>(null);
  const [editingVehicleLabelValue, setEditingVehicleLabelValue] = useState('');
  const [parteCargaPool, setParteCargaPool] = useState<{id: string; text: string; qty: number; checked: boolean}[]>([]);
  const [parteCargaPoolNewText, setParteCargaPoolNewText] = useState('');
  const [parteCargaDragOverPool, setParteCargaDragOverPool] = useState(false);
  const [parteCargaSaveStatus, setParteCargaSaveStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [parteCargaManiobras, setParteCargaManiobras] = useState<{id: string; name: string; fechaInicio?: string; fechaFin?: string}[]>([]);
  const [selectedManiobrasId, setSelectedManiobrasId] = useState<string>('');
  const [parteCargaManiobrasNewName, setParteCargaManiobrasNewName] = useState('');
  const [parteCargaManiobrasNewFechaInicio, setParteCargaManiobrasNewFechaInicio] = useState('');
  const [parteCargaManiobrasNewFechaFin, setParteCargaManiobrasNewFechaFin] = useState('');
  const [parteCargaManiobraFechaInicio, setParteCargaManiobraFechaInicio] = useState('');
  const [parteCargaManiobraFechaFin, setParteCargaManiobraFechaFin] = useState('');
  const [itvDraft, setItvDraft] = useState<Record<string, string>>({});
  const [itvSavingId, setItvSavingId] = useState<string | null>(null);
  const [itvMessage, setItvMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatLastSeenMs, setChatLastSeenMs] = useState<number>(0);
  const [chatTargetSectionId, setChatTargetSectionId] = useState<string>('');
  const [chatTargetCompanyId, setChatTargetCompanyId] = useState<string>('');
  const [s4GlobalItvData, setS4GlobalItvData] = useState<any[]>([]);
  const [s4GlobalItvLoading, setS4GlobalItvLoading] = useState(false);
  const [ciaOverviewData, setCiaOverviewData] = useState<{ section: any; vehicles: Vehicle[] }[]>([]);
  const [ciaOverviewLoading, setCiaOverviewLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedVehicleMenuTab, setSelectedVehicleMenuTab] = useState<'transmisiones' | 'movimientos' | 'incidencias' | 'avisos'>('transmisiones');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterPasswordConfirm, setShowRegisterPasswordConfirm] = useState(false);
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [showCreateUserPasswordConfirm, setShowCreateUserPasswordConfirm] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [lastLoginCreds, setLastLoginCreds] = useState<{ username: string; password: string } | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
  const [showSettingsCurrentPassword, setShowSettingsCurrentPassword] = useState(false);
  const [showSettingsNewPassword, setShowSettingsNewPassword] = useState(false);
  const [showSettingsConfirmPassword, setShowSettingsConfirmPassword] = useState(false);
  const [isNativeWebView, setIsNativeWebView] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [vehicleSnapshot, setVehicleSnapshot] = useState<VehicleSnapshot | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const pendingNavRef = React.useRef<null | (() => void)>(null);
  const [parteRelevoDirty, setParteRelevoDirty] = useState(false);
  const [parteRelevoSaveTick, setParteRelevoSaveTick] = useState(0);
  const [parteRelevoDiscardTick, setParteRelevoDiscardTick] = useState(0);
  const [parteRelevoSaveStatus, setParteRelevoSaveStatus] = useState('');
  const parteRelevoDirtyStickyRef = React.useRef(false);
  const lastSelectedVehicleIdRef = React.useRef<string | null>(null);
  const isDirtyRef = React.useRef(false);
  const dragCargaItemRef = React.useRef<{ vehicleKey: string; itemId: string } | null>(null);
  const dragCargaVehicleRef = React.useRef<string | null>(null);
  const dragCargaPoolItemRef = React.useRef<string | null>(null); // poolItemId being dragged from pool
  const dragHandleActiveRef = React.useRef(false); // true only when user presses a drag handle
  const parteCargaAllDataRef = React.useRef<Record<string, any>>({});
  const selectedManiobrasIdRef = React.useRef<string>('');
  // Used by openVehicleDetailInEditMode to signal that loadSelectedVehicleData
  // should enter edit mode instead of resetting it.
  const pendingEditVehicleIdRef = React.useRef<string | null>(null);
  // Ref for vehicles — lets callbacks read latest value without becoming new on each snapshot
  const vehiclesRef = React.useRef<Vehicle[]>([]);
  vehiclesRef.current = vehicles;
  // Hash of the last vehicle data loaded — prevents resetting all states on unrelated vehicle snapshots
  const lastVehicleDataHashRef = React.useRef<string>('');

  const handleParteRelevoDirtyChange = React.useCallback((dirty: boolean) => {
    if (dirty) {
      parteRelevoDirtyStickyRef.current = true;
      setParteRelevoDirty(true);
      setParteRelevoSaveStatus('');
      return;
    }
    if (!parteRelevoDirtyStickyRef.current) {
      setParteRelevoDirty(false);
    }
  }, []);

  const handleParteRelevoSaved = React.useCallback(() => {
    parteRelevoDirtyStickyRef.current = false;
    setParteRelevoDirty(false);
    setError('');
    setParteRelevoSaveStatus('✅ Parte relevo guardado correctamente');
    const next = pendingNavRef.current;
    pendingNavRef.current = null;
    if (next) next();
  }, []);

  const handleParteRelevoSaveError = React.useCallback((message: string) => {
    setError(message);
    setParteRelevoSaveStatus('');
    pendingNavRef.current = null;
  }, []);

  const handleParteRelevoDiscarded = React.useCallback(() => {
    parteRelevoDirtyStickyRef.current = false;
    setParteRelevoDirty(false);
    setParteRelevoSaveStatus('');
  }, []);

  useEffect(() => {
    try {
      const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
      if (rnWebView?.postMessage) {
        rnWebView.postMessage(JSON.stringify({ type: 'view', view }));
      }
    } catch {
      // no-op
    }
  }, [view]);

  // Auto-scroll while dragging near viewport edges (HTML5 DnD doesn't scroll natively)
  useEffect(() => {
    const SCROLL_ZONE = 80;
    const SCROLL_SPEED = 12;
    let rafId: number | null = null;
    let lastY = 0;

    const doScroll = () => {
      const { innerHeight } = window;
      if (lastY < SCROLL_ZONE) {
        window.scrollBy(0, -SCROLL_SPEED);
      } else if (lastY > innerHeight - SCROLL_ZONE) {
        window.scrollBy(0, SCROLL_SPEED);
      }
      rafId = null;
    };

    const onDragOver = (e: DragEvent) => {
      lastY = e.clientY;
      if (rafId === null) {
        rafId = requestAnimationFrame(doScroll);
      }
    };

    document.addEventListener('dragover', onDragOver);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    try {
      const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
      setIsNativeWebView(Boolean(rnWebView?.postMessage));
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('sigvemBiometricsEnabled') : null;
      setBiometricsEnabled(stored === '1');
    } catch {
      setIsNativeWebView(false);
      setBiometricsEnabled(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNativeEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent?.detail as { type?: string; success?: boolean; message?: string } | undefined;
      if (!detail?.type) return;

      if (detail.type === 'biometricEnableResult') {
        if (detail.success) {
          try {
            window.localStorage.setItem('sigvemBiometricsEnabled', '1');
          } catch {
            // no-op
          }
          setBiometricsEnabled(true);
          setSettingsMessage(detail.message || 'Biometría configurada en este dispositivo.');
        } else {
          setBiometricsEnabled(false);
          setSettingsMessage(detail.message || 'No se pudo activar la biometría.');
        }
        return;
      }

      if (detail.type === 'biometricClearResult') {
        if (detail.success) {
          try {
            window.localStorage.setItem('sigvemBiometricsEnabled', '0');
          } catch {
            // no-op
          }
          setBiometricsEnabled(false);
          setLastLoginCreds(null);
        }
        setSettingsMessage(detail.message || 'Biometría actualizada.');
        return;
      }

      if (detail.type === 'biometricLoginResult' && !detail.success) {
        setError(detail.message || 'No se pudo iniciar sesión con biometría.');
      }
    };

    window.addEventListener('sigvemNative', handleNativeEvent as EventListener);
    return () => {
      window.removeEventListener('sigvemNative', handleNativeEvent as EventListener);
    };
  }, []);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    companyId: '',
    sectionId: '',
    accessCode: '',
    role: 'consulta' as 'consulta' | 'operador' | 'encargado_seccion'
  });
  const [newCompanyForm, setNewCompanyForm] = useState({
    companyName: '',
    managerUsername: '',
    managerPassword: '',
    managerPasswordConfirm: '',
    userRole: 'operador' as any,
    sectionId: '',
    companyId: ''
  });
  const [newSectionForm, setNewSectionForm] = useState({
    sectionName: ''
  });
  const [newS4Form, setNewS4Form] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    unitId: ''
  });
  const [newEncVehForm, setNewEncVehForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    companyId: ''
  });
  useEffect(() => {
    if (view === 'login') {
      setLoginUsername('');
      setLoginPassword('');
      setShowPassword(false);
      setNewCompanyForm({
        companyName: '',
        managerUsername: '',
        managerPassword: '',
        managerPasswordConfirm: '',
        userRole: 'operador',
        sectionId: '',
        companyId: ''
      });
    }

    if (view === 'register') {
      setRegisterForm({
        username: '',
        password: '',
        passwordConfirm: '',
        companyId: '',
        sectionId: '',
        accessCode: '',
        role: 'consulta'
      });
      setShowPassword(false);
    }
  }, [view]);

  useEffect(() => {
    if (!currentUser) {
      setLoginUsername('');
      setLoginPassword('');
      setRegisterForm({
        username: '',
        password: '',
        passwordConfirm: '',
        companyId: '',
        sectionId: '',
        accessCode: '',
        role: 'consulta'
      });
      setShowPassword(false);
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (isRegisterMode) {
      setLoginUsername('');
      setLoginPassword('');
    } else {
      setRegisterForm({
        username: '',
        password: '',
        passwordConfirm: '',
        companyId: '',
        sectionId: '',
        accessCode: '',
        role: 'consulta'
      });
    }
    setShowPassword(false);
    setError('');
  }, [isRegisterMode]);

  const handleToggleTheme = () => {
    setError('');
    toggleTheme();
  };
  const [newVehicleForm, setNewVehicleForm] = useState({
    plate: '',
    brand: '',
    model: '',
    vehicleType: 'bn1',
    status: 'OPERATIVO' as VehicleStatus
  });
  const [showNewSectionForm, setShowNewSectionForm] = useState(false);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicleForm, setEditVehicleForm] = useState({
    plate: '',
    brand: '',
    model: ''
  });
  const [editVehicleType, setEditVehicleType] = useState('bn1');
  const [vehicleDocumentation, setVehicleDocumentation] = useState<VehicleDocumentationState>(() => getDefaultVehicleDocumentation());
  const [vehicleNiveles, setVehicleNiveles] = useState<VehicleNivelesState>(() => getDefaultVehicleNiveles());
  const [vehicleTransmisiones, setVehicleTransmisiones] = useState<Array<{nombre: string; presente: boolean; cantidad: number; version?: string}>>(() => getDefaultTransmisiones());
  const [vehicleMaterials, setVehicleMaterials] = useState<VehicleMaterialsState>(() => getDefaultVehicleMaterials());
  const [vehicleMovements, setVehicleMovements] = useState<VehicleMovementsState>(() => getDefaultVehicleMovements());
  const [newMovement, setNewMovement] = useState({
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    kmInicial: '',
    kmFinal: '',
    horas: ''
  });
  const [vehicleIncidencias, setVehicleIncidencias] = useState<VehicleIncidenciasState>(() => getDefaultVehicleIncidencias());
  const [vehicleAvisos, setVehicleAvisos] = useState<VehicleAvisosState>(() => getDefaultVehicleAvisos());
  const [sectionAvisos, setSectionAvisos] = useState<SectionAvisosState>(() => getDefaultSectionAvisos());
  const [sectionControlData, setSectionControlData] = useState<Record<string, { km: string; hours: string }>>({});
  const [sectionControlSavingId, setSectionControlSavingId] = useState<string | null>(null);
  const [sectionControlSavingAll, setSectionControlSavingAll] = useState(false);
  const [sectionControlMessage, setSectionControlMessage] = useState('');
  const [newIncidencia, setNewIncidencia] = useState({
    titulo: '',
    notas: '',
    observaciones: ''
  });
  const [newAviso, setNewAviso] = useState('');
  const [newAvisoMode, setNewAvisoMode] = useState<VehicleAvisoModo>('persistent');
  const [newAvisoScheduledDate, setNewAvisoScheduledDate] = useState('');
  const [newAvisoWeeklyDay, setNewAvisoWeeklyDay] = useState<number>(3);
  const [newAvisoWeeklyTime, setNewAvisoWeeklyTime] = useState<string>('07:00');
  const [showPendingAvisos, setShowPendingAvisos] = useState(false);
  const [newSectionAviso, setNewSectionAviso] = useState('');
  const [newSectionAvisoMode, setNewSectionAvisoMode] = useState<SectionAvisoMode>('persistent');
  const [newSectionAvisoWeeklyDay, setNewSectionAvisoWeeklyDay] = useState<number>(3);
  const [newSectionAvisoWeeklyTime, setNewSectionAvisoWeeklyTime] = useState<string>('07:00');
  const [newSectionAvisoScheduledDate, setNewSectionAvisoScheduledDate] = useState('');
  const [vehicleSaveFeedback, setVehicleSaveFeedback] = useState('');

  // Estados para filtros y búsqueda
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'TODOS'>('TODOS');
  const [showArchived, setShowArchived] = useState(false);
  // Eliminados filtros de fecha no usados para evitar avisos de ESLint

  // Estados para Parte Relevo
  const [selectedVehicleForParteRelevo, setSelectedVehicleForParteRelevo] = useState<Vehicle | null>(null);

  // Estados para auditoría
  const [auditLogs, setAuditLogs] = useState<SystemLog[]>([]);
  const [auditFilterCompany, setAuditFilterCompany] = useState<string>('TODAS');
  const [auditFilterAction, setAuditFilterAction] = useState<string>('TODAS');
  const [auditFilterUser, setAuditFilterUser] = useState<string>('');
  const [featureProposals, setFeatureProposals] = useState<FeatureProposal[]>([]);
  const [proposalText, setProposalText] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalMessage, setProposalMessage] = useState('');
  const [announcements, setAnnouncements] = useState<AppAnnouncement[]>([]);
  const [visibleAnnouncements, setVisibleAnnouncements] = useState<AppAnnouncement[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>({
    title: '',
    message: ''
  });
  const [vehicleTransfers, setVehicleTransfers] = useState<VehicleTransfer[]>([]);
  const [transferPanelTab, setTransferPanelTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [transferVehicleId, setTransferVehicleId] = useState('');
  const [transferDestinationCode, setTransferDestinationCode] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  const [confirmingTransferId, setConfirmingTransferId] = useState<string | null>(null);

  // Estados para alertas
  const [alerts, setAlerts] = useState<Array<{id: string; type: 'warning' | 'error' | 'info'; message: string; vehicleId?: string}>>([]);

  // Estado para comentario nuevo en incidencia
  const [newComment, setNewComment] = useState('');
  const [selectedIncidenciaId, setSelectedIncidenciaId] = useState<string | null>(null);

  // Estados para limpieza de datos de prueba
  const [testCompanies, setTestCompanies] = useState<Array<{id: string; name: string; createdAt: any; sectionsCount: number; vehiclesCount: number}>>([]);
  const [selectedTestCompanies, setSelectedTestCompanies] = useState<Set<string>>(new Set());
  const [testDataLoading, setTestDataLoading] = useState(false);
  const [testDataDeleteProgress, setTestDataDeleteProgress] = useState<{current: number; total: number}>({current: 0, total: 0});

  // Estados para auditoría consolidada
  const [auditReportData, setAuditReportData] = useState<Array<{
    unitId: string;
    unitName: string;
    companies: AuditCompanyReport[];
    summary: AuditVehicleSummary;
  }>>([]);
  const [auditReportLoading, setAuditReportLoading] = useState(false);

  // Estado para editar fecha de ITV
  // Estados de ITV no utilizados eliminados para evitar avisos

  // ========== ESTADOS DE SEGURIDAD OTAN ==========
  const [sessionMonitor, setSessionMonitor] = useState<(() => void) | null>(null);
  const [securityAlerts, setSecurityAlerts] = useState<string[]>([]);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('Aplicación en mantenimiento. Inténtalo más tarde.');
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);

  // Función para generar código de acceso de 10 dígitos
  const generateAccessCode = (): string => {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      const array = new Uint32Array(2);
      crypto.getRandomValues(array);
      const partA = (array[0] % 100000).toString().padStart(5, '0');
      const partB = (array[1] % 100000).toString().padStart(5, '0');
      return `${partA}${partB}`;
    }
    return Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  };

  // Función para validar contraseña fuerte
  const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Mínimo 8 caracteres');
    if (!/[A-Z]/.test(password)) errors.push('Al menos una mayúscula');
    if (!/[a-z]/.test(password)) errors.push('Al menos una minúscula');
    if (!/[0-9]/.test(password)) errors.push('Al menos un número');
    if (!/[!@#$%^&*]/.test(password)) errors.push('Al menos un carácter especial (!@#$%^&*)');
    return { isValid: errors.length === 0, errors };
  };

  // Función para obtener requisitos de contraseña cumplidos
  const getPasswordRequirements = (password: string) => {
    return {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*]/.test(password)
    };
  };

  // Función para crear logs de auditoría
  const createAuditLog = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date(),
        user: currentUser?.username || 'desconocido',
        action,
        details
      });
    } catch (err) {
      console.error('Error creating audit log:', err);
    }
  };

  const submitFeatureProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const text = proposalText.trim();
    if (text.length < 10) {
      setError('La propuesta debe tener al menos 10 caracteres.');
      return;
    }

    setProposalLoading(true);
    setProposalMessage('');
    setError('');
    try {
      await addDoc(collection(db, 'featureProposals'), {
        text,
        createdBy: currentUser.username,
        createdByRole: currentUser.role,
        companyId: currentUser.companyId || null,
        sectionId: currentUser.sectionId || null,
        status: 'pending',
        createdAt: new Date()
      });
      await createAuditLog('CREATE_PROPOSAL', `Propuesta enviada por ${currentUser.username}`);
      setProposalText('');
      setProposalMessage('✅ Propuesta enviada. Gracias por ayudar a mejorar SIGVEM.');
    } catch (err: any) {
      setError(`Error al enviar propuesta: ${err.message}`);
    } finally {
      setProposalLoading(false);
    }
  };

  const updateFeatureProposalStatus = async (
    proposalId: string,
    status: 'pending' | 'reviewed' | 'planned' | 'done'
  ) => {
    if (currentUser?.role !== 'super_admin') return;
    try {
      await updateDoc(doc(db, 'featureProposals', proposalId), {
        status,
        updatedAt: new Date(),
        updatedBy: currentUser.username
      });
      await createAuditLog('UPDATE_PROPOSAL_STATUS', `Propuesta ${proposalId} marcada como ${status}`);
    } catch (err: any) {
      setError(`Error al actualizar estado: ${err.message}`);
    }
  };

  const publishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== 'super_admin') return;

    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    if (!title || !message) {
      setError('La novedad debe incluir título y mensaje.');
      return;
    }

    setAnnouncementLoading(true);
    setAnnouncementMessage('');
    setError('');

    try {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(now.getDate() + ANNOUNCEMENT_DURATION_DAYS);

      await addDoc(collection(db, 'appAnnouncements'), {
        title,
        message,
        active: true,
        createdBy: currentUser.username,
        createdAt: now,
        expiresAt
      });

      await createAuditLog('PUBLISH_ANNOUNCEMENT', `Novedad publicada por ${currentUser.username}: ${title}`);

      setAnnouncementForm({
        title: '',
        message: ''
      });
      setAnnouncementMessage(`✅ Novedad publicada. Expirará automáticamente en ${ANNOUNCEMENT_DURATION_DAYS} días.`);
    } catch (err: any) {
      setError(`Error al publicar novedad: ${err.message}`);
    } finally {
      setAnnouncementLoading(false);
    }
  };

  const setAnnouncementActive = async (announcementId: string, active: boolean) => {
    if (currentUser?.role !== 'super_admin') return;
    setError('');
    try {
      if (active) {
        const targetAnnouncement = announcements.find((item) => item.id === announcementId);
        const isExpired = Boolean(targetAnnouncement?.expiresAt && targetAnnouncement.expiresAt.getTime() <= Date.now());
        if (isExpired) {
          setError('No se puede activar una novedad caducada. Publica una nueva.');
          return;
        }
      }

      await updateDoc(doc(db, 'appAnnouncements', announcementId), { active });
      await createAuditLog('UPDATE_ANNOUNCEMENT_STATUS', `Novedad ${announcementId} ${active ? 'activada' : 'desactivada'}`);
    } catch (err: any) {
      setError(`Error al actualizar novedad: ${err.message}`);
    }
  };

  const deleteAnnouncement = async (announcementId: string) => {
    if (currentUser?.role !== 'super_admin') return;

    const announcement = announcements.find((item) => item.id === announcementId);
    const label = announcement?.title || announcementId;
    const confirmed = window.confirm(`¿Eliminar la novedad "${label}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setError('');
    try {
      await deleteDoc(doc(db, 'appAnnouncements', announcementId));
      await createAuditLog('DELETE_ANNOUNCEMENT', `Novedad eliminada por ${currentUser.username}: ${label}`);

      try {
        window.localStorage.removeItem(`sigvem_seen_announcement_${announcementId}`);
      } catch {
        // no-op
      }
    } catch (err: any) {
      setError(`Error al eliminar novedad: ${err.message}`);
    }
  };

  const getAnnouncementSeenKey = (announcementId: string, user?: User | null): string => {
    const userScope = user?.id || user?.username || 'anonymous';
    return `sigvem_seen_announcement_${userScope}_${announcementId}`;
  };

  useEffect(() => {
    const globalConfigRef = doc(db, 'appConfig', 'global');
    const unsubscribe = onSnapshot(globalConfigRef, (snapshot) => {
      const data = snapshot.data() as any;
      const enabled = Boolean(data?.maintenanceMode);
      const rawMessage = String(data?.maintenanceMessage || '').trim();
      setMaintenanceMode(enabled);
      setMaintenanceMessage(rawMessage || 'Aplicación en mantenimiento. Inténtalo más tarde.');
    }, (err) => {
      console.warn('[maintenance] No se pudo leer configuración global:', err);
    });

    return () => unsubscribe();
  }, []);

  const handleToggleMaintenance = async () => {
    if (currentUser?.role !== 'super_admin') {
      setError('Solo super_admin puede activar o desactivar mantenimiento');
      return;
    }

    if (maintenanceBusy) return;

    const nextMode = !maintenanceMode;
    let nextMessage = maintenanceMessage;

    if (nextMode) {
      const customMessage = window.prompt(
        'Mensaje de mantenimiento para usuarios:',
        maintenanceMessage || 'Aplicación en mantenimiento. Inténtalo más tarde.'
      );
      if (customMessage === null) return;
      nextMessage = customMessage.trim() || 'Aplicación en mantenimiento. Inténtalo más tarde.';
    }

    setMaintenanceBusy(true);
    setError('');

    try {
      await setDoc(doc(db, 'appConfig', 'global'), {
        maintenanceMode: nextMode,
        maintenanceMessage: nextMode ? nextMessage : maintenanceMessage,
        maintenanceUpdatedAt: new Date(),
        maintenanceUpdatedBy: currentUser?.username || 'super_admin'
      }, { merge: true });

      if (nextMode) setMaintenanceMessage(nextMessage);

      await createAuditLog(
        nextMode ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
        nextMode ? `Mantenimiento activado: ${nextMessage}` : 'Mantenimiento desactivado'
      );
    } catch (err: any) {
      console.error('[maintenance] Error actualizando modo mantenimiento:', err);
      setError(err?.message || 'No se pudo actualizar el modo mantenimiento');
    } finally {
      setMaintenanceBusy(false);
    }
  };

  const getCompanyUnitId = (companyId: string) => {
    for (const [unitId, companyIds] of Object.entries(unitCompanies)) {
      if (companyIds.includes(companyId)) return unitId;
    }
    return null;
  };

  const toAuthEmailLegacy = (username: string) => {
    const safeLocalPart = username
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.{2,}/g, '.');

    return `${safeLocalPart || 'usuario'}@sigvem.local`;
  };

  const toAuthEmailV2 = (username: string) => {
    const legacyLocal = toAuthEmailLegacy(username).split('@')[0] || 'usuario';
    const canonical = username.trim().toLowerCase();
    const hash = hashSHA256(canonical).slice(0, 8).toLowerCase();
    return `${legacyLocal}.${hash}@sigvem.local`;
  };

  const toAuthEmailCandidates = (username: string) => {
    const legacy = toAuthEmailLegacy(username);
    const v2 = toAuthEmailV2(username);
    const military = `${legacy.split('@')[0] || 'usuario'}@military.system`;
    return Array.from(new Set([legacy, v2, military]));
  };

  const ensureAuthTokenReady = async (firebaseUser: any) => {
    if (!firebaseUser) return;
    // Fuerza emisión de token y da margen a Firebase Auth para propagar request.auth
    await firebaseUser.getIdToken(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  const waitForAuthSession = async (expectedUid?: string) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const activeUser = auth.currentUser;
      if (activeUser && (!expectedUid || activeUser.uid === expectedUid)) {
        await ensureAuthTokenReady(activeUser);
        return activeUser;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const fallbackUser = auth.currentUser;
    if (fallbackUser) {
      await ensureAuthTokenReady(fallbackUser);
    }
    return fallbackUser;
  };

  const runWithAuthRetry = async <T,>(operation: () => Promise<T>, firebaseUser?: any): Promise<T> => {
    let lastError: any = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        if (err?.code !== 'permission-denied' || attempt === 5) {
          throw err;
        }

        await ensureAuthTokenReady(firebaseUser || auth.currentUser);
        await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 350));
      }
    }

    throw lastError;
  };

  // Creates a Firebase Auth user without affecting the current session.
  // Uses the Firebase Auth REST API (signUp endpoint) for reliability.
  const createAuthUserWithoutSwitchingSession = async (email: string, password: string): Promise<string> => {
    const apiKey = (app.options as any).apiKey as string;
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false })
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      const code = (data?.error?.message as string) || 'UNKNOWN_ERROR';
      const err = new Error(code);
      (err as any).code = 'auth/' + code.toLowerCase().replace(/_/g, '-');
      throw err;
    }
    return data.localId as string;
  };

  const hasPermission = React.useCallback((permission: AppPermission) => {
    const currentRole = currentUser?.role as User['role'] | undefined;
    if (!currentRole) return false;
    return Boolean(ROLE_PERMISSIONS[currentRole]?.[permission]);
  }, [currentUser]);

  const guardPermission = React.useCallback((permission: AppPermission, message: string) => {
    if (hasPermission(permission)) return true;
    setError(message);
    return false;
  }, [hasPermission]);

  const canChangeVehicleStatus = React.useMemo(
    () => Boolean(currentUser) && currentUser.role !== 'consulta' && hasPermission('update_vehicle'),
    [currentUser, hasPermission]
  );
  const canEditVehicleInfo = React.useMemo(
    () => Boolean(currentUser) && hasPermission('update_vehicle'),
    [currentUser, hasPermission]
  );
  const canTransferVehicles = React.useMemo(
    () => Boolean(currentUser) && (
      currentUser.role === 'super_admin' ||
      currentUser.role === 'encargado_seccion' ||
      currentUser.role === 'operador'
    ),
    [currentUser]
  );

  const activeSectionAvisos = React.useMemo(() => {
    const now = new Date();
    return normalizeSectionAvisos(sectionAvisos).filter((item) => shouldShowSectionAviso(item, now));
  }, [sectionAvisos]);

  const effectiveSectionIdForAvisos = React.useMemo(
    () => selectedSectionId || currentUser?.sectionId || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSectionId, currentUser?.sectionId]
  );

  const sectionVehiclesForControl = React.useMemo(() => {
    if (!effectiveSectionIdForAvisos) return [] as Vehicle[];
    return vehicles.filter((vehicle) => vehicle.sectionId === effectiveSectionIdForAvisos && !vehicle.isArchived);
  }, [effectiveSectionIdForAvisos, vehicles]);

  // Vehículos ordenados por próxima ITV — memoizado para no re-ordenar en cada render
  const sortedVehiclesForItv = React.useMemo(() => {
    return [...sectionVehiclesForControl].sort((a, b) => {
      const da = a.nextItvDate ? new Date(a.nextItvDate).getTime() : Infinity;
      const db2 = b.nextItvDate ? new Date(b.nextItvDate).getTime() : Infinity;
      return da - db2;
    });
  }, [sectionVehiclesForControl]);

  const sectionHasUrgentItv = React.useMemo(() => {
    const now = Date.now();
    return sectionVehiclesForControl.some(v => {
      if (!v.nextItvDate) return false;
      const days = Math.ceil((new Date(v.nextItvDate).getTime() - now) / 86400000);
      return days <= 10;
    });
  }, [sectionVehiclesForControl]);

  const currentSectionForControl = React.useMemo(() => {
    if (!effectiveSectionIdForAvisos) return null;
    return sections.find((section) => section.id === effectiveSectionIdForAvisos)
      || allSections.find((section) => section.id === effectiveSectionIdForAvisos)
      || null;
  }, [effectiveSectionIdForAvisos, sections, allSections]);

  const pendingTransfersForSection = React.useMemo(() => {
    if (!currentUser) return [] as VehicleTransfer[];

    if (currentUser.role === 'super_admin') {
      return vehicleTransfers
        .filter((transfer) => transfer.status === 'pending_confirmation')
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    }

    if (!currentUser.sectionId) return [] as VehicleTransfer[];

    return vehicleTransfers
      .filter((transfer) => transfer.status === 'pending_confirmation' && transfer.participantSectionIds.includes(currentUser.sectionId))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }, [currentUser, vehicleTransfers]);

  const transferHistoryForSection = React.useMemo(() => {
    if (!currentUser) return [] as VehicleTransfer[];

    if (currentUser.role === 'super_admin') {
      return [...vehicleTransfers].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    }

    if (!currentUser.sectionId) return [] as VehicleTransfer[];

    return vehicleTransfers
      .filter((transfer) => transfer.participantSectionIds.includes(currentUser.sectionId))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }, [currentUser, vehicleTransfers]);

  // Lista ordenada de vehículos para el parte de carga — memoizada para no recalcular en cada render
  const orderedVehiclesForCarga = React.useMemo(() => {
    const all = [
      ...sectionVehiclesForControl.map(v => ({ key: v.id, label: `${v.plate} - ${v.brand} ${v.model}`, isExtra: false })),
      ...parteCargaExtraVehicles.map(ev => ({ key: ev.id, label: ev.label, isExtra: true }))
    ];
    if (parteCargaVehicleOrder.length === 0) return all;
    return [...all].sort((a, b) => {
      const ai = parteCargaVehicleOrder.indexOf(a.key);
      const bi = parteCargaVehicleOrder.indexOf(b.key);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [sectionVehiclesForControl, parteCargaExtraVehicles, parteCargaVehicleOrder]);

  const showVehicleSaveFeedback = React.useCallback((message: string = '✅ Actualizado correctamente') => {
    setVehicleSaveFeedback(message);
  }, []);

  useEffect(() => {
    if (!vehicleSaveFeedback) return;
    const timer = setTimeout(() => setVehicleSaveFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [vehicleSaveFeedback]);

  useEffect(() => {
    setVehicleSaveFeedback('');
  }, [selectedVehicleId, view]);

  // Keep selectedManiobrasIdRef in sync with state
  useEffect(() => {
    selectedManiobrasIdRef.current = selectedManiobrasId;
  }, [selectedManiobrasId]);

  // Load saved parte de carga data from Firestore - real-time listener so all users see changes instantly
  useEffect(() => {
    if (selectedSectionMenuTab !== 'parte-carga') return;
    const sectionId = effectiveSectionIdForAvisos;
    if (!sectionId) return;
    // Reset all parte-carga state first so previous section's data never bleeds in
    setParteCargaManiobras([]);
    setSelectedManiobrasId('');
    selectedManiobrasIdRef.current = '';
    setParteCargaItems({});
    setParteCargaExtraVehicles([]);
    setParteCargaVehicleOrder([]);
    setParteCargaPool([]);
    setParteCargaHiddenVehicles([]);
    setParteCargaVehicleLabels({});
    setParteCargaManiobraFechaInicio('');
    setParteCargaManiobraFechaFin('');
    parteCargaAllDataRef.current = {};
    const docRef = doc(db, 'parteCarga', sectionId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.maniobras && data.maniobras.length > 0) {
          // New maniobras-based format
          const maniobras: {id: string; name: string; fechaInicio?: string; fechaFin?: string}[] = data.maniobras;
          const maniobrasData: Record<string, any> = data.maniobrasData || {};
          parteCargaAllDataRef.current = maniobrasData;
          setParteCargaManiobras(maniobras);
          const currId = selectedManiobrasIdRef.current;
          const effectiveId = currId && maniobras.some(m => m.id === currId) ? currId : maniobras[0].id;
          if (currId !== effectiveId) {
            setSelectedManiobrasId(effectiveId);
            selectedManiobrasIdRef.current = effectiveId;
          }
          const effectiveManiobra = maniobras.find(m => m.id === effectiveId);
          setParteCargaManiobraFechaInicio(effectiveManiobra?.fechaInicio || '');
          setParteCargaManiobraFechaFin(effectiveManiobra?.fechaFin || '');
          const mData = maniobrasData[effectiveId] || {};
          setParteCargaItems(mData.items || {});
          setParteCargaExtraVehicles(mData.extraVehicles || []);
          setParteCargaVehicleOrder(mData.vehicleOrder || []);
          setParteCargaPool(mData.pool || []);
          setParteCargaHiddenVehicles(mData.hiddenVehicles || []);
          setParteCargaVehicleLabels(mData.vehicleLabels || {});
        } else {
          // Legacy format: items/extraVehicles at root level — wrap in a default maniobra
          const hasLegacy = data.items || data.extraVehicles || data.pool;
          if (hasLegacy) {
            const legacyData = { items: data.items || {}, extraVehicles: data.extraVehicles || [], vehicleOrder: data.vehicleOrder || [], pool: data.pool || [], hiddenVehicles: data.hiddenVehicles || [] };
            parteCargaAllDataRef.current = { default: legacyData };
            setParteCargaManiobras([{ id: 'default', name: 'Maniobra Principal' }]);
            setSelectedManiobrasId('default');
            selectedManiobrasIdRef.current = 'default';
            setParteCargaItems(data.items || {});
            setParteCargaExtraVehicles(data.extraVehicles || []);
            setParteCargaVehicleOrder(data.vehicleOrder || []);
            setParteCargaPool(data.pool || []);
            setParteCargaHiddenVehicles(data.hiddenVehicles || []);
            setParteCargaVehicleLabels({});
          }
          // else: no data yet — user will create the first maniobra
        }
      }
    }, () => {});
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionMenuTab, effectiveSectionIdForAvisos]);

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (currentUser?.role !== 'super_admin') {
      setError('Solo super_admin puede crear unidades');
      return;
    }

    const name = newUnitName.trim();
    if (!name) {
      setError('El nombre de la unidad es obligatorio');
      return;
    }

    setLoading(true);
    try {
      const unitsRef = collection(db, 'units');
      const q = query(unitsRef, where('name', '==', name));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setError('La unidad ya existe');
        setLoading(false);
        return;
      }

      await addDoc(unitsRef, { name, createdAt: new Date() });
      setNewUnitName('');
    } catch (err: any) {
      setError(`Error al crear unidad: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const assignCompanyToUnit = async (unitId: string, companyId: string) => {
    if (currentUser?.role !== 'super_admin') return;

    const currentUnitId = getCompanyUnitId(companyId);
    if (currentUnitId === unitId) return;

    setLoading(true);
    try {
      if (currentUnitId) {
        await deleteDoc(doc(db, 'units', currentUnitId, 'companies', companyId));
      }
      await setDoc(doc(db, 'units', unitId, 'companies', companyId), {
        companyId,
        assignedAt: new Date()
      });
    } catch (err: any) {
      setError(`Error al asignar compañía: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const unassignCompany = async (companyId: string) => {
    if (currentUser?.role !== 'super_admin') return;
    const currentUnitId = getCompanyUnitId(companyId);
    if (!currentUnitId) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'units', currentUnitId, 'companies', companyId));
    } catch (err: any) {
      setError(`Error al quitar compañía: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyDragStart = (companyId: string) => (event: React.DragEvent) => {
    setDraggedCompanyId(companyId);
    event.dataTransfer.setData('text/plain', companyId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDropToUnit = (unitId: string) => async (event: React.DragEvent) => {
    event.preventDefault();
    const companyId = event.dataTransfer.getData('text/plain') || draggedCompanyId;
    if (!companyId) return;
    await assignCompanyToUnit(unitId, companyId);
    setDraggedCompanyId(null);
  };

  const handleDropToUnassigned = async (event: React.DragEvent) => {
    event.preventDefault();
    const companyId = event.dataTransfer.getData('text/plain') || draggedCompanyId;
    if (!companyId) return;
    await unassignCompany(companyId);
    setDraggedCompanyId(null);
  };

  const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const deepEqual = <T,>(a: T, b: T): boolean => {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  };

  const loadSelectedVehicleData = useCallback(() => {
    if (!selectedVehicleId) return;
    const isSameVehicle = selectedVehicleId === lastSelectedVehicleIdRef.current;
    if (isSameVehicle && isDirtyRef.current) {
      return;
    }
    const vehicle = vehiclesRef.current.find(v => v.id === selectedVehicleId);
    // Skip full reload when the same vehicle's relevant data hasn't changed
    if (isSameVehicle && vehicle) {
      const hash = JSON.stringify([
        vehicle.documentationState, vehicle.nivelesState, vehicle.materialsState,
        vehicle.movementsState, vehicle.incidenciasState, vehicle.avisosState,
        vehicle.vehicleType, vehicle.plate, vehicle.brand, vehicle.model,
        vehicle.parteRelevoDraft
      ]);
      if (hash === lastVehicleDataHashRef.current) return;
      lastVehicleDataHashRef.current = hash;
    }
    const defaultDocumentation = getDefaultVehicleDocumentation();
    const defaultNiveles = getDefaultVehicleNiveles();
    const defaultMaterials = getDefaultVehicleMaterials();
    const defaultMovements = getDefaultVehicleMovements();
    const defaultIncidencias = getDefaultVehicleIncidencias();
    const defaultAvisos = getDefaultVehicleAvisos();

    if (!vehicle) {
      setVehicleDocumentation(defaultDocumentation);
      setVehicleNiveles(defaultNiveles);
      setVehicleMaterials(defaultMaterials);
      setVehicleMovements(defaultMovements);
      setVehicleIncidencias(defaultIncidencias);
      setVehicleAvisos(defaultAvisos);
      setEditVehicleType('bn1');
      setEditingVehicleId(null);
      setEditVehicleForm({ plate: '', brand: '', model: '' });
      setNewMovement({ fechaInicio: '', horaInicio: '', fechaFin: '', horaFin: '', kmInicial: '', kmFinal: '', horas: '' });
      setNewIncidencia({ titulo: '', notas: '', observaciones: '' });
      if (!isSameVehicle) {
        setNewAviso('');
        setNewAvisoMode('persistent');
        setNewAvisoScheduledDate('');
        setNewAvisoWeeklyDay(3);
        setNewAvisoWeeklyTime('07:00');
        setShowPendingAvisos(false);
      }
      setSelectedIncidenciaId(null);
      setNewComment('');
      setVehicleSnapshot({
        documentation: deepClone(defaultDocumentation),
        niveles: deepClone(defaultNiveles),
        materials: deepClone(defaultMaterials),
        movements: deepClone(defaultMovements),
        incidencias: deepClone(defaultIncidencias),
        avisos: deepClone(defaultAvisos),
        info: { plate: '', brand: '', model: '' },
        type: 'bn1'
      });
      return;
    }

    const nextDocumentation = vehicle.documentationState ? deepClone(vehicle.documentationState) : defaultDocumentation;
    const nextNiveles = vehicle.nivelesState ? deepClone(vehicle.nivelesState) : defaultNiveles;
    const nextTransmisiones = Array.isArray(vehicle.parteRelevoDraft?.data?.equipo_comunicaciones)
      ? deepClone(vehicle.parteRelevoDraft.data.equipo_comunicaciones)
      : getDefaultTransmisiones();
    const nextMaterials = vehicle.materialsState ? deepClone(vehicle.materialsState) : defaultMaterials;
    const nextMovements = vehicle.movementsState ? deepClone(vehicle.movementsState) : defaultMovements;
    const nextIncidencias = vehicle.incidenciasState ? deepClone(vehicle.incidenciasState) : defaultIncidencias;
    const nextAvisos = vehicle.avisosState ? deepClone(vehicle.avisosState) : defaultAvisos;

    setVehicleDocumentation(nextDocumentation);
    setVehicleNiveles(nextNiveles);
    setVehicleTransmisiones(nextTransmisiones);
    setVehicleMaterials(nextMaterials);
    setVehicleMovements(nextMovements);
    setVehicleIncidencias(nextIncidencias);
    setVehicleAvisos(nextAvisos);
    setEditVehicleType(vehicle.vehicleType || 'bn1');
    // If openVehicleDetailInEditMode requested edit mode for this vehicle, preserve it
    if (pendingEditVehicleIdRef.current === selectedVehicleId) {
      pendingEditVehicleIdRef.current = null;
      setEditingVehicleId(selectedVehicleId);
    } else {
      setEditingVehicleId(null);
    }
    setEditVehicleForm({ plate: vehicle.plate || '', brand: vehicle.brand || '', model: vehicle.model || '' });
    setNewMovement({ fechaInicio: '', horaInicio: '', fechaFin: '', horaFin: '', kmInicial: '', kmFinal: '', horas: '' });
    setNewIncidencia({ titulo: '', notas: '', observaciones: '' });
    if (!isSameVehicle) {
      setNewAviso('');
      setNewAvisoMode('persistent');
      setNewAvisoScheduledDate('');
      setNewAvisoWeeklyDay(3);
      setNewAvisoWeeklyTime('07:00');
      setShowPendingAvisos(false);
    }
    setSelectedIncidenciaId(null);
    setNewComment('');
    setVehicleSnapshot({
      documentation: deepClone(nextDocumentation),
      niveles: deepClone(nextNiveles),
      materials: deepClone(nextMaterials),
      movements: deepClone(nextMovements),
      incidencias: deepClone(nextIncidencias),
      avisos: deepClone(nextAvisos),
      info: {
        plate: vehicle.plate || '',
        brand: vehicle.brand || '',
        model: vehicle.model || ''
      },
      type: vehicle.vehicleType || 'bn1'
    });
    if (vehicle) {
      lastVehicleDataHashRef.current = JSON.stringify([
        vehicle.documentationState, vehicle.nivelesState, vehicle.materialsState,
        vehicle.movementsState, vehicle.incidenciasState, vehicle.avisosState,
        vehicle.vehicleType, vehicle.plate, vehicle.brand, vehicle.model,
        vehicle.parteRelevoDraft
      ]);
    }
    lastSelectedVehicleIdRef.current = selectedVehicleId;
  // vehiclesRef.current always has latest vehicles — no need to list vehicles as dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId]);

  useEffect(() => {
    loadSelectedVehicleData();
  }, [loadSelectedVehicleData]);

  const saveVehicleSection = async (sectionLabel: string, payload: Partial<Vehicle>): Promise<boolean> => {
    if (!selectedVehicleId) return false;
    if (!guardPermission('update_vehicle', 'No tienes permisos para actualizar vehículos')) return false;
    try {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      await updateDoc(doc(db, 'vehicles', selectedVehicleId), {
        ...payload,
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      });
      await createAuditLog('UPDATE_VEHICLE_SECTION', `Actualizado ${sectionLabel} de ${vehicle?.plate || selectedVehicleId}`);
      return true;
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      return false;
    }
  };

  const handleSaveDocumentation = async () => {
    const saved = await saveVehicleSection('documentación', { documentationState: vehicleDocumentation });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, documentation: deepClone(vehicleDocumentation) } : prev);
      showVehicleSaveFeedback('✅ Documentación actualizada');
    }
  };
  const handleSaveNiveles = async () => {
    const saved = await saveVehicleSection('niveles', { nivelesState: vehicleNiveles });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, niveles: deepClone(vehicleNiveles) } : prev);
      showVehicleSaveFeedback('✅ Niveles actualizados');
    }
  };

  const handleSaveTransmisiones = async () => {
    if (!selectedVehicleId) return;
    if (!guardPermission('update_vehicle', 'No tienes permisos para actualizar vehículos')) return;
    try {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      const existingDraft = vehicle?.parteRelevoDraft || {};
      const existingData = existingDraft.data || {};
      await setDoc(doc(db, 'vehicles', selectedVehicleId), {
        parteRelevoDraft: {
          ...existingDraft,
          data: { ...existingData, equipo_comunicaciones: vehicleTransmisiones },
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.username || 'Sistema'
        },
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      }, { merge: true });
      await createAuditLog('UPDATE_VEHICLE_SECTION', `Actualizado transmisiones de ${vehicle?.plate || selectedVehicleId}`);
      showVehicleSaveFeedback('✅ Transmisiones actualizadas');
    } catch (err: any) {
      setError(`Error al guardar transmisiones: ${err?.message || 'desconocido'}`);
    }
  };
  const handleSaveMovimientos = async () => {
    const saved = await saveVehicleSection('movimientos', { movementsState: vehicleMovements });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, movements: deepClone(vehicleMovements) } : prev);
      showVehicleSaveFeedback('✅ Movimientos actualizados');
    }
  };
  const handleSaveMaterials = async () => {
    const saved = await saveVehicleSection('materiales', { materialsState: vehicleMaterials });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, materials: deepClone(vehicleMaterials) } : prev);
      showVehicleSaveFeedback('✅ Material actualizado');
    }
  };
  const handleSaveIncidencias = async () => {
    const saved = await saveVehicleSection('incidencias', { incidenciasState: vehicleIncidencias });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, incidencias: deepClone(vehicleIncidencias) } : prev);
      showVehicleSaveFeedback('✅ Incidencias actualizadas');
    }
  };
  const handleSaveAvisos = async () => {
    const saved = await saveVehicleSection('avisos', { avisosState: vehicleAvisos });
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, avisos: deepClone(vehicleAvisos) } : prev);
      showVehicleSaveFeedback('✅ Avisos actualizados');
    }
  };
  const handleSaveVehicleType = async () => {
    if (!selectedVehicleId) return;
    const saved = await updateVehicleType(selectedVehicleId, editVehicleType);
    if (saved) {
      setVehicleSnapshot(prev => prev ? { ...prev, type: editVehicleType } : prev);
    }
  };

  const generateAlerts = useCallback(() => {
    const newAlerts: Array<{id: string; type: 'warning' | 'error' | 'info'; message: string; vehicleId?: string}> = [];

    if (!selectedVehicleId) {
      setAlerts(newAlerts);
      return;
    }

    const vehicle = vehiclesRef.current.find(v => v.id === selectedVehicleId);
    if (!vehicle) {
      setAlerts(newAlerts);
      return;
    }

    Object.entries(vehicleMaterials).forEach(([category, items]) => {
      items.forEach(item => {
        if (item.quantity === 0) {
          newAlerts.push({
            id: `mat-${item.id}`,
            type: 'error',
            message: `${vehicle.plate}: Falta ${item.name} en ${category}`,
            vehicleId: vehicle.id
          });
        }
      });
    });

    setAlerts(newAlerts);
  // vehiclesRef.current always has latest vehicles — avoids recreating callback on every snapshot
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleMaterials, selectedVehicleId]);

  const getVehicleAvisosCount = (vehicle: Vehicle): number => {
    const avisos = Array.isArray(vehicle.avisosState) ? vehicle.avisosState : [];
    const now = new Date();
    return avisos.filter(a => shouldShowVehicleAviso(a, now)).length;
  };

  const getVehicleIncidenciasCount = (vehicle: Vehicle): number => {
    const incidencias = Array.isArray(vehicle.incidenciasState) ? vehicle.incidenciasState : [];
    return incidencias.length;
  };

  const updateSectionControlDraft = (vehicleId: string, field: 'km' | 'hours', value: string) => {
    if (!/^\d*(\.\d{0,2})?$/.test(value)) return;
    setSectionControlData((prev) => ({
      ...prev,
      [vehicleId]: {
        km: prev[vehicleId]?.km || '',
        hours: prev[vehicleId]?.hours || '',
        [field]: value
      }
    }));
  };

  const saveSectionControlRow = async (vehicle: Vehicle) => {
    const row = sectionControlData[vehicle.id] || { km: '', hours: '' };
    const parsedKm = row.km.trim() === '' ? null : Number(row.km);
    const parsedHours = row.hours.trim() === '' ? null : Number(row.hours);

    if (parsedKm !== null && !Number.isFinite(parsedKm)) {
      setError('Kilómetros inválidos');
      return;
    }
    if (parsedHours !== null && !Number.isFinite(parsedHours)) {
      setError('Horas inválidas');
      return;
    }

    setSectionControlSavingId(vehicle.id);
    setError('');
    try {
      await updateDoc(doc(db, 'vehicles', vehicle.id), {
        sectionControlKm: parsedKm,
        sectionControlHours: parsedHours,
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      });
      setSectionControlMessage(`✅ Datos guardados para ${vehicle.plate}`);
      await createAuditLog('UPDATE_SECTION_CONTROL_ROW', `Actualizado km/horas de ${vehicle.plate}`);
    } catch (err: any) {
      setError(`Error al guardar km/horas: ${err?.message || 'desconocido'}`);
    } finally {
      setSectionControlSavingId(null);
    }
  };

  const saveAllSectionControlRows = async () => {
    if (sectionVehiclesForControl.length === 0) return;

    setSectionControlSavingAll(true);
    setError('');

    try {
      for (const vehicle of sectionVehiclesForControl) {
        const row = sectionControlData[vehicle.id] || { km: '', hours: '' };
        const parsedKm = row.km.trim() === '' ? null : Number(row.km);
        const parsedHours = row.hours.trim() === '' ? null : Number(row.hours);

        if (parsedKm !== null && !Number.isFinite(parsedKm)) {
          throw new Error(`Kilómetros inválidos en ${vehicle.plate}`);
        }
        if (parsedHours !== null && !Number.isFinite(parsedHours)) {
          throw new Error(`Horas inválidas en ${vehicle.plate}`);
        }

        await updateDoc(doc(db, 'vehicles', vehicle.id), {
          sectionControlKm: parsedKm,
          sectionControlHours: parsedHours,
          lastModifiedBy: currentUser?.username || 'Sistema',
          lastModifiedAt: new Date()
        });
      }

      setSectionControlMessage(`✅ Guardados ${sectionVehiclesForControl.length} vehículos`);
      await createAuditLog('UPDATE_SECTION_CONTROL_BULK', `Guardado masivo de km/horas en sección ${effectiveSectionIdForAvisos || 'N/A'}`);
    } catch (err: any) {
      setError(`Error al guardar todo: ${err?.message || 'desconocido'}`);
    } finally {
      setSectionControlSavingAll(false);
    }
  };

  const generateSectionControlPdf = () => {
    if (sectionVehiclesForControl.length === 0) {
      setError('No hay vehículos en la sección para exportar.');
      return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const left = 10;
      const widths = [27, 26, 29, 52, 28, 28];
      const rowH = 6;
      let y = 14;
      const formatVehicleType = (typeRaw?: string) => String(typeRaw || 'sin_tipo').toUpperCase();

      const ensureSpace = (needed: number) => {
        if (y + needed > 286) {
          pdf.addPage();
          y = 14;
          return true;
        }
        return false;
      };

      const drawRow = (cells: string[], header: boolean = false) => {
        ensureSpace(rowH + 1);
        let x = left;
        pdf.setFont('Helvetica', header ? 'bold' : 'normal');
        pdf.setFontSize(8.5);
        pdf.setLineWidth(0.25);
        pdf.setDrawColor(185, 194, 204);
        widths.forEach((w, idx) => {
          if (header) {
            pdf.setFillColor(226, 236, 248);
            pdf.rect(x, y - 4.5, w, rowH, 'FD');
          } else {
            pdf.rect(x, y - 4.5, w, rowH, 'S');
          }
          const raw = String(cells[idx] || '');
          const maxChars = Math.max(5, Math.floor((w - 3) / 1.8));
          const text = raw.length > maxChars ? `${raw.slice(0, maxChars - 3)}...` : raw;
          pdf.text(text, x + 1.2, y - 1);
          x += w;
        });
        y += rowH;
      };

      const sectionName = currentSectionForControl?.name || 'Seccion';
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(15, 55, 120);
      pdf.text('SIGVEM - CONTROL DE KILOMETROS Y HORAS', left, y);
      y += 7;
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(20, 20, 20);
      pdf.setFontSize(10);
      pdf.text(`Seccion: ${sectionName}`, left, y);
      y += 5;
      pdf.text(`Fecha: ${new Date().toLocaleString('es-ES')}`, left, y);
      y += 7;

      drawRow(['Matricula', 'Tipo', 'Estado', 'Modelo', 'Kilometros', 'Horas'], true);

      sectionVehiclesForControl.forEach((vehicle) => {
        const row = sectionControlData[vehicle.id] || { km: '', hours: '' };
        drawRow([
          vehicle.plate,
          formatVehicleType(vehicle.vehicleType),
          vehicle.status,
          `${vehicle.brand} ${vehicle.model}`,
          row.km || '-',
          row.hours || '-'
        ]);
      });

      const safeSectionName = sectionName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'seccion';
      const filename = `CONTROL_SECCION_${safeSectionName}_${new Date().toISOString().split('T')[0]}.pdf`;

      if (isNativeWebView) {
        const dataUri = pdf.output('datauristring');
        const base64 = String(dataUri).split(',')[1] || '';
        const ok = sendToNative({
          type: 'downloadBlob',
          base64,
          mime: 'application/pdf',
          filename
        });
        if (!ok) {
          setError('No se pudo descargar el PDF en la app móvil.');
          return;
        }
      } else {
        pdf.save(filename);
      }

      void createAuditLog('EXPORT_SECTION_CONTROL_PDF', `Exportado control de sección ${sectionName}`);
    } catch (err: any) {
      setError(`Error generando PDF de control: ${err?.message || 'desconocido'}`);
    }
  };

  const generateParteCargaPdf = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = 14;
      const left = 10;
      const sectionName = currentSectionForControl?.name || 'Seccion';
      const allVehiclesForCargaRaw = [
        ...sectionVehiclesForControl.map(v => ({ key: v.id, label: `${v.plate} - ${v.brand} ${v.model}`, status: v.status })),
        ...parteCargaExtraVehicles.map(ev => ({ key: ev.id, label: ev.label, status: '' }))
      ].filter(v => !parteCargaHiddenVehicles.includes(v.key));

      // Apply the same custom order as shown on screen
      const allVehiclesForCarga = parteCargaVehicleOrder.length > 0
        ? [...allVehiclesForCargaRaw].sort((a, b) => {
            const ai = parteCargaVehicleOrder.indexOf(a.key);
            const bi = parteCargaVehicleOrder.indexOf(b.key);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          })
        : allVehiclesForCargaRaw;

      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(15, 55, 120);
      pdf.text('SIGVEM - PARTE DE CARGA', left, y);
      y += 7;
      pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(20, 20, 20);
      pdf.setFontSize(10);
      pdf.text(`Seccion: ${sectionName}`, left, y);
      y += 5;
      const currentManiobra = parteCargaManiobras.find(m => m.id === selectedManiobrasId);
      if (currentManiobra) {
        pdf.text(`Maniobra: ${currentManiobra.name}`, left, y);
        y += 5;
        if (currentManiobra.fechaInicio || currentManiobra.fechaFin) {
          const fi = currentManiobra.fechaInicio ? new Date(currentManiobra.fechaInicio).toLocaleDateString('es-ES') : '—';
          const ff = currentManiobra.fechaFin ? new Date(currentManiobra.fechaFin).toLocaleDateString('es-ES') : '—';
          pdf.text(`Periodo: ${fi}  →  ${ff}`, left, y);
          y += 5;
        }
      }
      pdf.text(`Fecha: ${new Date().toLocaleString('es-ES')}`, left, y);
      y += 10;

      for (const v of allVehiclesForCarga) {
        const items = parteCargaItems[v.key] || [];
        if (y + 22 > 286) { pdf.addPage(); y = 14; }

        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setFillColor(226, 236, 248);
        pdf.setDrawColor(180, 200, 230);
        pdf.setLineWidth(0.3);
        pdf.rect(left, y - 5, 190, 7, 'FD');
        pdf.setTextColor(15, 55, 120);
        const headerLabel = v.status ? `${v.label}  [${v.status}]` : v.label;
        pdf.text(headerLabel, left + 2, y);
        y += 8;

        if (items.length === 0) {
          pdf.setFont('Helvetica', 'italic');
          pdf.setFontSize(9);
          pdf.setTextColor(130, 130, 130);
          pdf.text('Sin elementos de carga registrados', left + 3, y);
          y += 8;
        } else {
          pdf.setFont('Helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.setTextColor(20, 20, 20);
          pdf.setDrawColor(185, 194, 204);
          pdf.setLineWidth(0.25);
          pdf.setFillColor(240, 244, 250);
          pdf.rect(left, y - 4.5, 155, 6, 'FD');
          pdf.rect(left + 155, y - 4.5, 35, 6, 'FD');
          pdf.text('Elemento / Descripcion', left + 1.5, y - 0.5);
          pdf.text('Cantidad', left + 156, y - 0.5);
          y += 6;

          for (const item of items) {
            if (y + 7 > 286) { pdf.addPage(); y = 14; }
            pdf.setFont('Helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(20, 20, 20);
            const txt = item.text || '(sin descripcion)';
            const maxLen = 88;
            const display = txt.length > maxLen ? txt.slice(0, maxLen - 3) + '...' : txt;
            pdf.rect(left, y - 4.5, 155, 6, 'S');
            pdf.rect(left + 155, y - 4.5, 35, 6, 'S');
            pdf.text(display, left + 1.5, y - 0.5);
            pdf.text(String(item.qty), left + 156, y - 0.5);
            y += 6;
          }
        }
        y += 5;
      }

      // ── Lista provisional de material ────────────────────────────────
      if (parteCargaPool.length > 0) {
        if (y + 22 > 286) { pdf.addPage(); y = 14; }

        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setFillColor(255, 243, 205);
        pdf.setDrawColor(200, 160, 40);
        pdf.setLineWidth(0.3);
        pdf.rect(left, y - 5, 190, 7, 'FD');
        pdf.setTextColor(120, 80, 0);
        pdf.text('LISTA PROVISIONAL DE MATERIAL', left + 2, y);
        y += 8;

        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(20, 20, 20);
        pdf.setDrawColor(185, 194, 204);
        pdf.setLineWidth(0.25);
        pdf.setFillColor(255, 250, 230);
        pdf.rect(left, y - 4.5, 10, 6, 'FD');
        pdf.rect(left + 10, y - 4.5, 145, 6, 'FD');
        pdf.rect(left + 155, y - 4.5, 35, 6, 'FD');
        pdf.text('', left + 2, y - 0.5);
        pdf.text('Elemento / Descripcion', left + 11.5, y - 0.5);
        pdf.text('Cantidad', left + 156, y - 0.5);
        y += 6;

        for (const pi of parteCargaPool) {
          if (y + 7 > 286) { pdf.addPage(); y = 14; }
          pdf.setFont('Helvetica', pi.checked ? 'italic' : 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(pi.checked ? 130 : 20, pi.checked ? 130 : 20, pi.checked ? 130 : 20);
          const txt = pi.text || '(sin descripcion)';
          const maxLen = 85;
          const display = txt.length > maxLen ? txt.slice(0, maxLen - 3) + '...' : txt;
          pdf.rect(left, y - 4.5, 10, 6, 'S');
          pdf.rect(left + 10, y - 4.5, 145, 6, 'S');
          pdf.rect(left + 155, y - 4.5, 35, 6, 'S');
          // checkbox mark
          if (pi.checked) {
            pdf.setFont('Helvetica', 'bold');
            pdf.setTextColor(60, 140, 60);
            pdf.text('✓', left + 2.5, y - 0.5);
            pdf.setFont('Helvetica', 'italic');
            pdf.setTextColor(130, 130, 130);
          }
          pdf.text(display, left + 11.5, y - 0.5);
          pdf.setFont('Helvetica', 'normal');
          pdf.setTextColor(20, 20, 20);
          pdf.text(String(pi.qty), left + 156, y - 0.5);
          y += 6;
        }
        y += 5;
      }

      const safeSectionName = sectionName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'seccion';
      const filename = `PARTE_CARGA_${safeSectionName}_${new Date().toISOString().split('T')[0]}.pdf`;

      if (isNativeWebView) {
        const dataUri = pdf.output('datauristring');
        const base64 = String(dataUri).split(',')[1] || '';
        const ok = sendToNative({ type: 'downloadBlob', base64, mime: 'application/pdf', filename });
        if (!ok) { setError('No se pudo descargar el PDF en la app móvil.'); return; }
      } else {
        pdf.save(filename);
      }
    } catch (err: any) {
      setError(`Error generando PDF de carga: ${err?.message || 'desconocido'}`);
    }
  };

  const saveParteCarga = async (
    items: Record<string, {id: string; text: string; qty: number}[]>,
    extraVehicles: {id: string; label: string}[],
    vehicleOrder: string[],
    pool: {id: string; text: string; qty: number; checked: boolean}[],
    hiddenVehicles: string[],
    vehicleLabels: Record<string, string>
  ) => {
    const sectionId = effectiveSectionIdForAvisos;
    if (!sectionId) return;
    const maniobrasId = selectedManiobrasId;
    if (!maniobrasId) return;
    setParteCargaSaveStatus('saving');
    try {
      const updatedManiobrasData = {
        ...parteCargaAllDataRef.current,
        [maniobrasId]: { items, extraVehicles, vehicleOrder, pool, hiddenVehicles, vehicleLabels }
      };
      parteCargaAllDataRef.current = updatedManiobrasData;
      const updatedManiobras = parteCargaManiobras.map(m =>
        m.id === maniobrasId
          ? { ...m, fechaInicio: parteCargaManiobraFechaInicio, fechaFin: parteCargaManiobraFechaFin }
          : m
      );
      await setDoc(doc(db, 'parteCarga', sectionId), {
        maniobras: updatedManiobras,
        maniobrasData: updatedManiobrasData,
        updatedAt: serverTimestamp()
      });
      setParteCargaSaveStatus('saved');
      setTimeout(() => setParteCargaSaveStatus(''), 2500);
    } catch {
      setParteCargaSaveStatus('error');
      setTimeout(() => setParteCargaSaveStatus(''), 3000);
    }
  };

  const createManiobra = async () => {
    const name = parteCargaManiobrasNewName.trim();
    if (!name) return;
    const sectionId = effectiveSectionIdForAvisos;
    if (!sectionId) return;
    const newId = `m_${Date.now()}`;
    const newManiobra = { id: newId, name, fechaInicio: parteCargaManiobrasNewFechaInicio, fechaFin: parteCargaManiobrasNewFechaFin };
    const newManiobras = [...parteCargaManiobras, newManiobra];
    // Empty data for new maniobra
    const newAllData = { ...parteCargaAllDataRef.current, [newId]: { items: {}, extraVehicles: [], vehicleOrder: [], pool: [], hiddenVehicles: [], vehicleLabels: {} } };
    parteCargaAllDataRef.current = newAllData;
    try {
      await setDoc(doc(db, 'parteCarga', sectionId), {
        maniobras: newManiobras,
        maniobrasData: newAllData,
        updatedAt: serverTimestamp()
      });
      setParteCargaManiobrasNewName('');
      setParteCargaManiobrasNewFechaInicio('');
      setParteCargaManiobrasNewFechaFin('');
      // Auto-switch to the newly created maniobra
      setParteCargaManiobras(newManiobras);
      setParteCargaItems({});
      setParteCargaExtraVehicles([]);
      setParteCargaVehicleOrder([]);
      setParteCargaPool([]);
      setParteCargaHiddenVehicles([]);
      setParteCargaVehicleLabels({});
      setParteCargaManiobraFechaInicio(newManiobra.fechaInicio);
      setParteCargaManiobraFechaFin(newManiobra.fechaFin);
      setSelectedManiobrasId(newId);
      selectedManiobrasIdRef.current = newId;
    } catch {
      setError('Error al crear maniobra');
    }
  };

  const deleteManiobra = async (maniobrasId: string) => {
    if (parteCargaManiobras.length <= 1) return;
    const sectionId = effectiveSectionIdForAvisos;
    if (!sectionId) return;
    const maniobraName = parteCargaManiobras.find(m => m.id === maniobrasId)?.name || maniobrasId;
    if (!window.confirm(`¿Eliminar la maniobra "${maniobraName}"? Se perderán todos sus datos.`)) return;
    const newManiobras = parteCargaManiobras.filter(m => m.id !== maniobrasId);
    const newData = { ...parteCargaAllDataRef.current };
    delete newData[maniobrasId];
    parteCargaAllDataRef.current = newData;
    try {
      await setDoc(doc(db, 'parteCarga', sectionId), {
        maniobras: newManiobras,
        maniobrasData: newData,
        updatedAt: serverTimestamp()
      });
    } catch {
      setError('Error al eliminar maniobra');
    }
  };

  const switchManiobra = (id: string) => {
    if (id === selectedManiobrasId) return;
    const data = parteCargaAllDataRef.current[id] || {};
    setParteCargaItems(data.items || {});
    setParteCargaExtraVehicles(data.extraVehicles || []);
    setParteCargaVehicleOrder(data.vehicleOrder || []);
    setParteCargaPool(data.pool || []);
    setParteCargaHiddenVehicles(data.hiddenVehicles || []);
    setParteCargaVehicleLabels(data.vehicleLabels || {});
    const m = parteCargaManiobras.find(mm => mm.id === id);
    setParteCargaManiobraFechaInicio(m?.fechaInicio || '');
    setParteCargaManiobraFechaFin(m?.fechaFin || '');
    setSelectedManiobrasId(id);
    selectedManiobrasIdRef.current = id;
  };

  const formatNovedadFecha = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const renderSectionNovedadesPanel = () => {
    const selectedVehicle = sectionVehiclesForControl.find(v => v.id === selectedNovedadesVehicleId) || null;
    const novedades: VehicleNovedadesState = selectedVehicle?.novedadesState || [];
    const pendientes = novedades.filter(n => !n.resuelta);
    const solventadas = novedades.filter(n => n.resuelta);

    const persistNovedades = async (next: VehicleNovedadesState) => {
      if (!selectedVehicle) return;
      if (!guardPermission('update_vehicle', 'No tienes permisos para modificar novedades')) return;
      setNovedadesSaveStatus('saving');
      try {
        await updateDoc(doc(db, 'vehicles', selectedVehicle.id), { novedadesState: next });
        setNovedadesSaveStatus('saved');
        setTimeout(() => setNovedadesSaveStatus(''), 1200);
      } catch (err) {
        console.error('[Novedades] Error guardando:', err);
        setNovedadesSaveStatus('error');
      }
    };

    const handleAddNovedad = async () => {
      const texto = novedadesNewText.trim();
      if (!texto || !selectedVehicle) return;
      const nueva: VehicleNovedadItem = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        texto,
        fecha: new Date().toISOString(),
        resuelta: false,
        creadoPor: currentUser?.username || ''
      };
      await persistNovedades([...novedades, nueva]);
      setNovedadesNewText('');
    };

    const handleResolveNovedad = (id: string) => persistNovedades(
      novedades.map(n => n.id === id ? { ...n, resuelta: true, fechaResuelta: new Date().toISOString() } : n)
    );
    const handleReopenNovedad = (id: string) => persistNovedades(
      novedades.map(n => n.id === id ? { ...n, resuelta: false, fechaResuelta: undefined } : n)
    );
    const handleDeleteNovedad = (id: string) => persistNovedades(novedades.filter(n => n.id !== id));

    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6 transition-colors max-w-3xl">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📝 Novedades</h2>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Vehículo</label>
          <select
            value={selectedNovedadesVehicleId}
            onChange={(e) => setSelectedNovedadesVehicleId(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <option value="">-- Selecciona un vehículo --</option>
            {sectionVehiclesForControl.map(v => (
              <option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>
            ))}
          </select>
        </div>

        {!selectedVehicle && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Selecciona un vehículo para ver y añadir sus novedades.</p>
        )}

        {selectedVehicle && (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                spellCheck="false"
                placeholder="Escribe una novedad..."
                value={novedadesNewText}
                onChange={(e) => setNovedadesNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddNovedad(); } }}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              <button
                onClick={() => void handleAddNovedad()}
                disabled={!novedadesNewText.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold flex-shrink-0"
              >
                ➕ Añadir
              </button>
            </div>
            {novedadesSaveStatus === 'saving' && <p className="text-xs text-gray-400">Guardando...</p>}
            {novedadesSaveStatus === 'error' && <p className="text-xs text-red-500">Error al guardar. Inténtalo de nuevo.</p>}

            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Pendientes ({pendientes.length})</h3>
              {pendientes.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No hay novedades pendientes.</p>
              ) : (
                <ul className="space-y-2">
                  {pendientes.slice().reverse().map(n => (
                    <li key={n.id} className="flex items-start gap-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
                      <button
                        onClick={() => void handleResolveNovedad(n.id)}
                        title="Marcar como solventada"
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800 flex items-center justify-center font-bold"
                      >
                        ✓
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">{n.texto}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatNovedadFecha(n.fecha)}{n.creadoPor ? ` · ${n.creadoPor}` : ''}</p>
                      </div>
                      <button
                        onClick={() => void handleDeleteNovedad(n.id)}
                        title="Eliminar"
                        className="flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1"
                      >
                        🗑️
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <button
                onClick={() => setShowSolventadasNovedades(v => !v)}
                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showSolventadasNovedades ? '▲' : '▼'} Novedades solventadas ({solventadas.length})
              </button>
              {showSolventadasNovedades && (
                solventadas.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">No hay novedades solventadas.</p>
                ) : (
                  <ul className="space-y-2 mt-2">
                    {solventadas.slice().reverse().map(n => (
                      <li key={n.id} className="flex items-start gap-3 bg-gray-50 dark:bg-slate-700/30 rounded-xl p-3 opacity-75">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">✓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 dark:text-gray-300 line-through whitespace-pre-wrap break-words">{n.texto}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Creada: {formatNovedadFecha(n.fecha)} · Solventada: {n.fechaResuelta ? formatNovedadFecha(n.fechaResuelta) : '-'}
                          </p>
                        </div>
                        <button onClick={() => void handleReopenNovedad(n.id)} title="Reabrir" className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline">Reabrir</button>
                        <button onClick={() => void handleDeleteNovedad(n.id)} title="Eliminar" className="flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1">🗑️</button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderParteCargaPanel = () => {
    // orderedVehiclesForCarga está memoizado a nivel de componente
    const orderedVehicles = orderedVehiclesForCarga;

    const toggleVehicleVisibility = (key: string) => {
      const allKeys = orderedVehicles.map(vv => vv.key);
      if (parteCargaHiddenVehicles.includes(key)) {
        // Show: insert just before the first still-hidden vehicle
        const newHidden = parteCargaHiddenVehicles.filter(k => k !== key);
        setParteCargaHiddenVehicles(newHidden);
        const withoutKey = allKeys.filter(k => k !== key);
        const insertAt = withoutKey.findIndex(k => newHidden.includes(k));
        if (insertAt === -1) {
          setParteCargaVehicleOrder([...withoutKey, key]);
        } else {
          const newOrder = [...withoutKey];
          newOrder.splice(insertAt, 0, key);
          setParteCargaVehicleOrder(newOrder);
        }
      } else {
        // Hide: move to end of list
        setParteCargaHiddenVehicles(prev => [...prev, key]);
        setParteCargaVehicleOrder([...allKeys.filter(k => k !== key), key]);
      }
    };

    const addItem = (vehicleKey: string) => {
      const newItem = { id: `${vehicleKey}_${Date.now()}`, text: '', qty: 1 };
      setParteCargaItems(prev => ({ ...prev, [vehicleKey]: [...(prev[vehicleKey] || []), newItem] }));
    };

    const updateItem = (vehicleKey: string, itemId: string, field: 'text' | 'qty', value: string | number) => {
      setParteCargaItems(prev => ({
        ...prev,
        [vehicleKey]: (prev[vehicleKey] || []).map(item => item.id === itemId ? { ...item, [field]: value } : item)
      }));
    };

    const removeItem = (vehicleKey: string, itemId: string) => {
      setParteCargaItems(prev => ({
        ...prev,
        [vehicleKey]: (prev[vehicleKey] || []).filter(item => item.id !== itemId)
      }));
    };

    const addExtraVehicle = () => {
      const label = parteCargaNewExtraLabel.trim();
      if (!label) return;
      setParteCargaExtraVehicles(prev => [...prev, { id: `extra_${Date.now()}`, label }]);
      setParteCargaNewExtraLabel('');
    };

    const removeExtraVehicle = (id: string) => {
      setParteCargaExtraVehicles(prev => prev.filter(ev => ev.id !== id));
      setParteCargaItems(prev => { const next = { ...prev }; delete next[id]; return next; });
    };

    // ── Drag handlers for items (move between vehicles) ──────────────────
    const handleItemDragStart = (e: React.DragEvent, vehicleKey: string, itemId: string) => {
      if (!dragHandleActiveRef.current) { e.preventDefault(); return; }
      e.stopPropagation();
      dragCargaItemRef.current = { vehicleKey, itemId };
      dragCargaPoolItemRef.current = null;
      dragCargaVehicleRef.current = null;
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleItemDragEnd = () => {
      dragHandleActiveRef.current = false;
      dragCargaItemRef.current = null;
      setParteCargaDragOverVehicle(null);
      setParteCargaDragOverPool(false);
    };

    // ── Drag handlers for pool items ──────────────────────────────────────
    const handlePoolItemDragStart = (e: React.DragEvent, poolItemId: string) => {
      if (!dragHandleActiveRef.current) { e.preventDefault(); return; }
      e.stopPropagation();
      dragCargaPoolItemRef.current = poolItemId;
      dragCargaItemRef.current = null;
      dragCargaVehicleRef.current = null;
      e.dataTransfer.effectAllowed = 'move';
    };

    const handlePoolItemDragEnd = () => {
      dragHandleActiveRef.current = false;
      dragCargaPoolItemRef.current = null;
      setParteCargaDragOverPool(false);
      setParteCargaDragOverVehicle(null);
    };

    // Drop onto the pool (item from vehicle → back to pool)
    const handlePoolDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setParteCargaDragOverPool(false);
      if (!dragCargaItemRef.current) return;
      const { vehicleKey: srcKey, itemId } = dragCargaItemRef.current;
      dragCargaItemRef.current = null;
      setParteCargaItems(prev => {
        const srcItems = prev[srcKey] || [];
        const item = srcItems.find(i => i.id === itemId);
        if (!item) return prev;
        setParteCargaPool(pool => [...pool, { id: `pool_${Date.now()}`, text: item.text, qty: item.qty, checked: false }]);
        return { ...prev, [srcKey]: srcItems.filter(i => i.id !== itemId) };
      });
    };

    // ── Drag handlers for vehicle cards (reorder) ─────────────────────────
    const handleVehicleDragStart = (e: React.DragEvent, vehicleKey: string) => {
      if (!dragHandleActiveRef.current || dragCargaItemRef.current || dragCargaPoolItemRef.current) { e.preventDefault(); return; }
      dragCargaVehicleRef.current = vehicleKey;
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleVehicleDragEnd = () => {
      dragHandleActiveRef.current = false;
      dragCargaVehicleRef.current = null;
      setParteCargaDragOverVehicle(null);
    };

    const handleVehicleDragOver = (e: React.DragEvent, vehicleKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setParteCargaDragOverVehicle(vehicleKey);
    };

    const handleVehicleDragLeave = (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setParteCargaDragOverVehicle(null);
      }
    };

    const handleVehicleDrop = (e: React.DragEvent, targetVehicleKey: string) => {
      e.preventDefault();
      setParteCargaDragOverVehicle(null);

      if (dragCargaPoolItemRef.current) {
        // Move pool item to vehicle
        const poolId = dragCargaPoolItemRef.current;
        dragCargaPoolItemRef.current = null;
        setParteCargaPool(prev => {
          const poolItem = prev.find(i => i.id === poolId);
          if (!poolItem) return prev;
          setParteCargaItems(items => ({
            ...items,
            [targetVehicleKey]: [...(items[targetVehicleKey] || []), { id: `${targetVehicleKey}_${Date.now()}`, text: poolItem.text, qty: poolItem.qty }],
          }));
          return prev.filter(i => i.id !== poolId);
        });
      } else if (dragCargaItemRef.current) {
        // Move item to target vehicle
        const { vehicleKey: srcKey, itemId } = dragCargaItemRef.current;
        dragCargaItemRef.current = null;
        if (srcKey === targetVehicleKey) return;
        setParteCargaItems(prev => {
          const srcItems = prev[srcKey] || [];
          const item = srcItems.find(i => i.id === itemId);
          if (!item) return prev;
          return {
            ...prev,
            [srcKey]: srcItems.filter(i => i.id !== itemId),
            [targetVehicleKey]: [...(prev[targetVehicleKey] || []), item],
          };
        });
      } else if (dragCargaVehicleRef.current && dragCargaVehicleRef.current !== targetVehicleKey) {
        // Reorder vehicles
        const srcKey = dragCargaVehicleRef.current;
        dragCargaVehicleRef.current = null;
        const currentKeys = orderedVehicles.map(v => v.key);
        const srcIdx = currentKeys.indexOf(srcKey);
        const tgtIdx = currentKeys.indexOf(targetVehicleKey);
        if (srcIdx === -1 || tgtIdx === -1) return;
        const newOrder = [...currentKeys];
        newOrder.splice(srcIdx, 1);
        newOrder.splice(tgtIdx, 0, srcKey);
        setParteCargaVehicleOrder(newOrder);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <button
              onClick={() => setSelectedSectionMenuTab('vehiculos')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
            >
              ← Volver a Vehículos
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {parteCargaSaveStatus === 'saved' && (
                <span className="text-green-600 dark:text-green-400 text-sm font-semibold">✅ Guardado</span>
              )}
              {parteCargaSaveStatus === 'saving' && (
                <span className="text-gray-500 dark:text-gray-400 text-sm">Guardando…</span>
              )}
              {parteCargaSaveStatus === 'error' && (
                <span className="text-red-500 text-sm font-semibold">⚠️ Error al guardar</span>
              )}
              <button
                onClick={() => saveParteCarga(parteCargaItems, parteCargaExtraVehicles, parteCargaVehicleOrder, parteCargaPool, parteCargaHiddenVehicles, parteCargaVehicleLabels)}
                disabled={parteCargaSaveStatus === 'saving' || !selectedManiobrasId}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold"
              >
                💾 Guardar
              </button>
              <button
                onClick={generateParteCargaPdf}
                disabled={!selectedManiobrasId || (orderedVehiclesForCarga.length === 0 && parteCargaPool.length === 0)}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold"
              >
                📄 Descargar PDF
              </button>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📦 Parte de Carga</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Registra la carga de cada vehículo. Puedes añadir vehículos adicionales (remolques, etc.) y generar un PDF descargable.
          </p>

          {/* ── Selector de Maniobra ─────────────────────────────────── */}
          <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-700">
            <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-3 uppercase tracking-wide">🎯 Maniobras</p>

            {/* Tabs de maniobras existentes */}
            {parteCargaManiobras.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {parteCargaManiobras.map(m => {
                  const isActive = m.id === selectedManiobrasId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => switchManiobra(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                          : 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-800/40'
                      }`}
                    >
                      {m.name}
                      {(m.fechaInicio || m.fechaFin) && (
                        <span className={`ml-1.5 text-[10px] font-normal ${isActive ? 'text-indigo-200' : 'text-indigo-400 dark:text-indigo-500'}`}>
                          {m.fechaInicio ? new Date(m.fechaInicio).toLocaleDateString('es-ES', {day:'2-digit',month:'2-digit'}) : '?'}
                          {' → '}
                          {m.fechaFin ? new Date(m.fechaFin).toLocaleDateString('es-ES', {day:'2-digit',month:'2-digit'}) : '?'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Datos editables de la maniobra activa */}
            {selectedManiobrasId && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-indigo-200 dark:border-indigo-700 p-3 mb-3 flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Fecha inicio</span>
                  <input
                    type="date"
                    value={parteCargaManiobraFechaInicio}
                    onChange={e => setParteCargaManiobraFechaInicio(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Fecha fin</span>
                  <input
                    type="date"
                    value={parteCargaManiobraFechaFin}
                    onChange={e => setParteCargaManiobraFechaFin(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <p className="text-[11px] text-indigo-500 dark:text-indigo-400 self-end pb-2">Las fechas se guardan al pulsar 💾 Guardar</p>
                {parteCargaManiobras.length > 1 && (
                  <button
                    onClick={() => { void deleteManiobra(selectedManiobrasId); }}
                    className="ml-auto bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors self-end"
                    title="Eliminar maniobra actual"
                  >
                    🗑️ Eliminar maniobra
                  </button>
                )}
              </div>
            )}

            {/* Formulario nueva maniobra */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 select-none list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span> Nueva maniobra
              </summary>
              <div className="mt-2 flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Nombre</span>
                  <input
                    type="text"
                    value={parteCargaManiobrasNewName}
                    onChange={e => setParteCargaManiobrasNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createManiobra(); } }}
                    placeholder="Ej: Maniobra 1..."
                    className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400 w-44"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Fecha inicio</span>
                  <input
                    type="date"
                    value={parteCargaManiobrasNewFechaInicio}
                    onChange={e => setParteCargaManiobrasNewFechaInicio(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Fecha fin</span>
                  <input
                    type="date"
                    value={parteCargaManiobrasNewFechaFin}
                    onChange={e => setParteCargaManiobrasNewFechaFin(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <button
                  onClick={() => { void createManiobra(); }}
                  disabled={!parteCargaManiobrasNewName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors self-end"
                >
                  + Crear
                </button>
              </div>
            </details>
          </div>
        </div>

        {/* ── Contenido del parte (solo si hay maniobra activa) ─────────── */}
        {!selectedManiobrasId ? (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-2xl px-6 py-10 text-center">
            <p className="text-4xl mb-3">🎯</p>
            <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mb-1">Crea una maniobra para empezar</p>
            <p className="text-sm text-indigo-500 dark:text-indigo-400">Cada maniobra tiene su propio parte de carga independiente.<br/>Usa el formulario de arriba para crear la primera.</p>
          </div>
        ) : (
          <>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 transition-colors">
          <h3 className="text-base font-bold text-gray-800 dark:text-white mb-3">➕ Añadir vehículo adicional</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={parteCargaNewExtraLabel}
              onChange={e => setParteCargaNewExtraLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraVehicle(); } }}
              placeholder="Ej: Remolque RMQ-001, Semirremolque..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
            <button
              onClick={addExtraVehicle}
              disabled={!parteCargaNewExtraLabel.trim()}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg font-bold transition-colors"
            >
              Añadir
            </button>
          </div>
        </div>

        {/* ── Lista provisional (pool) ─────────────────────────────────── */}
        <div
          className={`bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-sm border-2 p-5 transition-all ${
            parteCargaDragOverPool
              ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-300 dark:ring-amber-700'
              : 'border-amber-300 dark:border-amber-700'
          }`}
          onDragOver={e => { e.preventDefault(); setParteCargaDragOverPool(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setParteCargaDragOverPool(false); }}
          onDrop={handlePoolDrop}
        >
          <h3 className="text-base font-bold text-amber-800 dark:text-amber-300 mb-1">📋 Lista provisional de material</h3>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            Añade aquí todo el material a cargar. Cuando sepas en qué vehículo va, arrástralo al vehículo correspondiente. También puedes arrastrar ítems de vehículos de vuelta aquí.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={parteCargaPoolNewText}
              onChange={e => setParteCargaPoolNewText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = parteCargaPoolNewText.trim();
                  if (!t) return;
                  setParteCargaPool(prev => [...prev, { id: `pool_${Date.now()}`, text: t, qty: 1, checked: false }]);
                  setParteCargaPoolNewText('');
                }
              }}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text');
                let parts: string[];
                if (/\r?\n/.test(pasted)) {
                  // Texto multilínea (ej: lista de Word con saltos de línea)
                  parts = pasted.split(/\r?\n/);
                } else if (/ [-\u2013\u2014] /.test(pasted)) {
                  // Línea única con guiones como separadores: "A - B - C"
                  parts = pasted.split(/ [-\u2013\u2014] /);
                } else {
                  return; // pegar normal si no hay guiones ni saltos
                }
                const items = parts
                  .map(p => p.replace(/^[\s\-\u2013\u2014\u2022*]+/, '').trim())
                  .filter(p => p.length > 0);
                if (items.length <= 1) return; // dejar que el pegado normal actúe
                e.preventDefault();
                const now = Date.now();
                setParteCargaPool(prev => [
                  ...prev,
                  ...items.map((text, i) => ({ id: `pool_${now}_${i}`, text, qty: 1, checked: false }))
                ]);
                setParteCargaPoolNewText('');
              }}
              placeholder="Descripción del material... (pega lista con guiones para añadir varios a la vez)"
              className="flex-1 px-3 py-1.5 border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
            />
            <button
              onClick={() => {
                const t = parteCargaPoolNewText.trim();
                if (!t) return;
                setParteCargaPool(prev => [...prev, { id: `pool_${Date.now()}`, text: t, qty: 1, checked: false }]);
                setParteCargaPoolNewText('');
              }}
              disabled={!parteCargaPoolNewText.trim()}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors"
            >
              + Añadir
            </button>
          </div>
          {parteCargaPool.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-500 italic">Sin material añadido aún.</p>
          ) : (
            <div className="space-y-1.5">
              {parteCargaPool.map((pi, idx) => (
                <div
                  key={pi.id}
                  draggable
                  onDragStart={e => handlePoolItemDragStart(e, pi.id)}
                  onDragEnd={handlePoolItemDragEnd}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 ${pi.checked ? 'opacity-50' : 'bg-white dark:bg-slate-700/50'} transition-opacity`}
                >
                  <span className="text-amber-400 dark:text-amber-500 cursor-grab active:cursor-grabbing select-none shrink-0" title="Arrastrar al vehículo"
                    onMouseDown={() => { dragHandleActiveRef.current = true; }}
                    onMouseUp={() => { dragHandleActiveRef.current = false; }}
                  >⠿</span>
                  <input
                    type="checkbox"
                    checked={pi.checked}
                    onChange={() => setParteCargaPool(prev => prev.map(i => i.id === pi.id ? { ...i, checked: !i.checked } : i))}
                    className="accent-amber-500 shrink-0"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{idx + 1}.</span>
                  <input
                    type="text"
                    value={pi.text}
                    onChange={e => setParteCargaPool(prev => prev.map(i => i.id === pi.id ? { ...i, text: e.target.value } : i))}
                    className={`flex-1 px-2 py-1 border border-transparent bg-transparent text-gray-900 dark:text-white rounded text-sm outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-700 transition-colors ${pi.checked ? 'line-through text-gray-400' : ''}`}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Cant.</span>
                    <input
                      type="number"
                      min={1}
                      value={pi.qty}
                      onChange={e => setParteCargaPool(prev => prev.map(i => i.id === pi.id ? { ...i, qty: Math.max(1, Number(e.target.value)) } : i))}
                      className="w-14 px-1.5 py-1 border border-transparent bg-transparent text-gray-900 dark:text-white rounded text-sm outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-700 transition-colors text-center"
                    />
                  </div>
                  <button
                    onClick={() => setParteCargaPool(prev => prev.filter(i => i.id !== pi.id))}
                    className="text-red-400 hover:text-red-600 text-sm font-bold shrink-0"
                    title="Eliminar"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {orderedVehicles.length === 0 ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl">
            <p className="font-semibold">ℹ️ No hay vehículos en esta sección.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orderedVehicles.map(v => {
              const items = parteCargaItems[v.key] || [];
              const isDropTarget = parteCargaDragOverVehicle === v.key;
              const isHidden = parteCargaHiddenVehicles.includes(v.key);
              return (
                <div
                  key={v.key}
                  draggable
                  onDragStart={e => handleVehicleDragStart(e, v.key)}
                  onDragEnd={handleVehicleDragEnd}
                  onDragOver={e => handleVehicleDragOver(e, v.key)}
                  onDragLeave={handleVehicleDragLeave}
                  onDrop={e => handleVehicleDrop(e, v.key)}
                  className={`rounded-2xl shadow-sm border-2 p-5 transition-all ${
                    isHidden ? 'opacity-40 bg-gray-100 dark:bg-slate-900' : 'bg-white dark:bg-slate-800'
                  } ${
                    isDropTarget
                      ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-300 dark:ring-blue-700'
                      : isHidden ? 'border-gray-300 dark:border-slate-600 border-dashed' : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing select-none text-xl shrink-0"
                        title="Arrastrar para reordenar vehículo"
                        onMouseDown={() => { dragHandleActiveRef.current = true; }}
                        onMouseUp={() => { dragHandleActiveRef.current = false; }}
                      >
                        ⠿
                      </span>
                      {editingVehicleLabelKey === v.key ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingVehicleLabelValue}
                          onChange={e => setEditingVehicleLabelValue(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingVehicleLabelValue.trim();
                            if (trimmed) setParteCargaVehicleLabels(prev => ({ ...prev, [v.key]: trimmed }));
                            else setParteCargaVehicleLabels(prev => { const next = { ...prev }; delete next[v.key]; return next; });
                            setEditingVehicleLabelKey(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.currentTarget.blur(); }
                            if (e.key === 'Escape') { setEditingVehicleLabelKey(null); }
                          }}
                          className={`text-base font-bold bg-transparent border-b-2 border-blue-500 outline-none flex-1 min-w-0 ${isHidden ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}
                        />
                      ) : (
                        <h3
                          className={`text-base font-bold truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isHidden ? 'line-through text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400' : 'text-gray-900 dark:text-white'}`}
                          onClick={() => { setEditingVehicleLabelKey(v.key); setEditingVehicleLabelValue(parteCargaVehicleLabels[v.key] || v.label); }}
                          title="Clic para editar el nombre"
                        >
                          {parteCargaVehicleLabels[v.key] || v.label}
                        </h3>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleVehicleVisibility(v.key)}
                        className={`text-sm font-bold transition-colors ${isHidden ? 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300' : 'text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300'}`}
                        title={isHidden ? 'Mostrar en PDF' : 'Ocultar del PDF (no irá en la carga)'}
                      >
                        {isHidden ? '🙈 Oculto' : '👁️'}
                      </button>
                      {items.length > 0 && (
                        <button
                          onClick={() => setParteCargaItems(prev => ({ ...prev, [v.key]: [] }))}
                          className="text-orange-500 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-bold transition-colors"
                          title="Vaciar todos los ítems de este vehículo"
                        >
                          🧹 Vaciar
                        </button>
                      )}
                      {v.isExtra && (
                        <button
                          onClick={() => removeExtraVehicle(v.key)}
                          className="text-red-500 hover:text-red-700 text-sm font-bold"
                          title="Eliminar vehículo adicional"
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-3">Sin elementos. Añade el primer ítem de carga.</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {items.map((item, idx) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => handleItemDragStart(e, v.key, item.id)}
                          onDragEnd={handleItemDragEnd}
                          className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-slate-700/40 px-1 py-0.5"
                        >
                          <span
                            className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing select-none shrink-0"
                            title="Arrastrar a otro vehículo"
                            onMouseDown={() => { dragHandleActiveRef.current = true; }}
                            onMouseUp={() => { dragHandleActiveRef.current = false; }}
                          >
                            ⠿
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{idx + 1}.</span>
                          <input
                            type="text"
                            value={item.text}
                            onChange={e => updateItem(v.key, item.id, 'text', e.target.value)}
                            placeholder="Descripción del elemento..."
                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Cant.</span>
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={e => updateItem(v.key, item.id, 'qty', Math.max(1, Number(e.target.value)))}
                              className="w-16 px-2 py-1.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-center"
                            />
                          </div>
                          <button
                            onClick={() => removeItem(v.key, item.id)}
                            className="text-red-500 hover:text-red-700 text-sm font-bold shrink-0"
                            title="Eliminar ítem"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => addItem(v.key)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-bold"
                  >
                    + Añadir ítem de carga
                  </button>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
    );
  };

  const renderSectionControlPanel = () => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-5 transition-colors">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setSelectedSectionMenuTab('vehiculos')}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
        >
          ← Volver a Vehículos
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { void saveAllSectionControlRows(); }}
            disabled={sectionControlSavingAll}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold"
          >
            {sectionControlSavingAll ? 'Guardando todo...' : '💾 Guardar todo'}
          </button>
          <button
            onClick={generateSectionControlPdf}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
          >
            📄 Generar PDF
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📊 Control de Kilómetros y Horas</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Edita los datos por vehículo y guárdalos. Este panel está disponible para usuarios con acceso a la sección.
        </p>
      </div>

      {sectionControlMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm font-semibold">
          {sectionControlMessage}
        </div>
      )}

      {sectionVehiclesForControl.length === 0 ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg">
          ℹ️ No hay vehículos en esta sección.
        </div>
      ) : (
        <div className="space-y-3">
          {sectionVehiclesForControl.map((vehicle) => (
            <div key={vehicle.id} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-900/40">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
                <div className="min-w-[180px]">
                  <p className="font-bold text-gray-900 dark:text-white">{vehicle.plate}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Estado: {vehicle.status}</p>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Kilómetros
                    <input
                      type="text"
                      value={sectionControlData[vehicle.id]?.km || ''}
                      onChange={(e) => updateSectionControlDraft(vehicle.id, 'km', e.target.value)}
                      placeholder="Ej: 12450"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Horas
                    <input
                      type="text"
                      value={sectionControlData[vehicle.id]?.hours || ''}
                      onChange={(e) => updateSectionControlDraft(vehicle.id, 'hours', e.target.value)}
                      placeholder="Ej: 35.5"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>

                <div className="lg:min-w-[140px]">
                  <button
                    onClick={() => { void saveSectionControlRow(vehicle); }}
                    disabled={sectionControlSavingId === vehicle.id}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold"
                  >
                    {sectionControlSavingId === vehicle.id ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSectionMessagesPanel = () => {
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const activeSectionId = chatTargetSectionId || effectiveSectionIdForAvisos || '';
    const activeSectionName = allSections.find(s => s.id === activeSectionId)?.name
      || sections.find(s => s.id === activeSectionId)?.name
      || activeSectionId;

    // For super_admin: build company list from allSections
    const companyIdsInSections = Array.from(new Set(allSections.map(s => s.companyId).filter(Boolean)));
    const availableCompanies = companies.filter(c => companyIdsInSections.includes(c.id));
    const selectedCompany = chatTargetCompanyId || (availableCompanies.length > 0 ? availableCompanies[0].id : '');
    const sectionsForCompany = allSections.filter(s => s.companyId === selectedCompany);

    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-4 transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setSelectedSectionMenuTab('vehiculos')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
          >
            ← Volver a Vehículos
          </button>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">💬 Mensajes de Sección</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Chat interno entre secciones</p>
        </div>

        {isSuperAdmin && availableCompanies.length > 0 && (
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
              Compañía
              <select
                value={selectedCompany}
                onChange={e => {
                  setChatTargetCompanyId(e.target.value);
                  // Reset section to first of new company
                  const firstSection = allSections.find(s => s.companyId === e.target.value);
                  setChatTargetSectionId(firstSection?.id || '');
                }}
                className="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
              Sección
              <select
                value={chatTargetSectionId || (sectionsForCompany[0]?.id || '')}
                onChange={e => setChatTargetSectionId(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                disabled={sectionsForCompany.length === 0}
              >
                {sectionsForCompany.length === 0
                  ? <option value="">Sin secciones</option>
                  : sectionsForCompany.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 self-end pb-2">
              Sala activa: <strong>{activeSectionName}</strong>
            </p>
          </div>
        )}

        {/* Message list */}
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto bg-gray-50 dark:bg-slate-900/40 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
          {chatMessages.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">Sin mensajes todavía. ¡Sé el primero en escribir!</p>
          ) : (
            chatMessages.map((msg: any) => {
              const isMe = msg.fromUserId === currentUser?.id;
              const canDelete = isMe || isSuperAdmin;
              const ts = msg.timestamp?.toDate?.();
              const timeStr = ts ? ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
              const dateStr = ts ? ts.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 px-1">
                      {msg.fromUsername} · {msg.fromRole}
                    </span>
                  )}
                  <div className={`group relative max-w-[80%] px-4 py-2 rounded-2xl text-sm break-words ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-600 rounded-bl-sm shadow-sm'}`}>
                    {msg.text}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('¿Eliminar este mensaje?')) return;
                          try {
                            await deleteDoc(doc(db, 'sectionChats', msg.id));
                          } catch (err: any) {
                            setError(`Error al eliminar: ${err.message}`);
                          }
                        }}
                        className={`absolute -top-2 ${isMe ? '-left-2' : '-right-2'} opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow`}
                        title="Eliminar mensaje"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                    {dateStr} {timeStr}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
            placeholder="Escribe un mensaje... (Enter para enviar)"
            rows={2}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={() => sendChatMessage()}
            disabled={chatSending || !chatInput.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm self-end"
          >
            {chatSending ? '...' : '➤ Enviar'}
          </button>
        </div>
      </div>
    );
  };

  const renderSectionItvsPanel = () => {
    const now = new Date();
    const sortedVehicles = sortedVehiclesForItv;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6 transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setSelectedSectionMenuTab('vehiculos')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
          >
            ← Volver a Vehículos
          </button>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🔧 Próximas ITVs</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Asigna y consulta la fecha de ITV de cada vehículo de la sección.</p>
        </div>

        {itvMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm font-semibold">
            {itvMessage}
          </div>
        )}

        {sortedVehicles.length === 0 ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg">
            ℹ️ No hay vehículos en esta sección.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedVehicles.map((vehicle) => {
              const savedDate = vehicle.nextItvDate || '';
              const draftDate = itvDraft[vehicle.id] ?? savedDate;
              const daysUntil = savedDate
                ? Math.ceil((new Date(savedDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isExpired = daysUntil !== null && daysUntil < 0;
              const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 30;
              const isSoon = daysUntil !== null && daysUntil > 30 && daysUntil <= 90;
              return (
                <div key={vehicle.id} className={`border rounded-xl p-4 ${isExpired ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : isUrgent ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20' : isSoon ? 'border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="min-w-[180px]">
                      <p className="font-bold text-gray-900 dark:text-white">{vehicle.plate}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                      {savedDate && (
                        <p className={`text-xs font-semibold mt-1 ${isExpired ? 'text-red-600 dark:text-red-400' : isUrgent ? 'text-amber-600 dark:text-amber-400' : isSoon ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                          {isExpired
                            ? `⛔ Vencida hace ${Math.abs(daysUntil!)} días`
                            : isUrgent
                            ? `🔴 Vence en ${daysUntil} días`
                            : isSoon
                            ? `🟡 Vence en ${daysUntil} días`
                            : `✅ Vence en ${daysUntil} días`}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-2 sm:items-end">
                      <label className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Fecha ITV
                        <input
                          type="date"
                          value={draftDate}
                          onChange={(e) => setItvDraft(prev => ({ ...prev, [vehicle.id]: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </label>
                      <button
                        disabled={itvSavingId === vehicle.id}
                        onClick={async () => {
                          setItvSavingId(vehicle.id);
                          setItvMessage('');
                          try {
                            await updateDoc(doc(db, 'vehicles', vehicle.id), {
                              nextItvDate: draftDate || null,
                              lastModifiedBy: currentUser?.username || 'Sistema',
                              lastModifiedAt: new Date()
                            });
                            await createAuditLog('UPDATE_ITV_DATE', `ITV de ${vehicle.plate} actualizada: ${draftDate || 'sin fecha'}`);
                            setItvMessage(`✅ ITV de ${vehicle.plate} guardada`);
                            setTimeout(() => setItvMessage(''), 3000);
                          } catch (err: any) {
                            setError(`Error: ${err.message}`);
                          } finally {
                            setItvSavingId(null);
                          }
                        }}
                        className="sm:min-w-[110px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold text-sm"
                      >
                        {itvSavingId === vehicle.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSectionAvisosPanel = () => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6 transition-colors">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setSelectedSectionMenuTab('vehiculos')}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
        >
          ← Volver a Vehículos
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🔔 Avisos de Sección</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Estos avisos los verá cualquier usuario que entre en esta sección.</p>
      </div>

      <div className="space-y-3">
        <textarea
          placeholder="Escribe un aviso para toda la sección..."
          value={newSectionAviso}
          onChange={(e) => setNewSectionAviso(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={newSectionAvisoMode}
            onChange={(e) => setNewSectionAvisoMode(e.target.value as SectionAvisoMode)}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="persistent">Único (hasta marcar hecho)</option>
            <option value="weekly">Semanal recurrente</option>
            <option value="scheduled">Programado (fecha y hora)</option>
          </select>
          {newSectionAvisoMode === 'weekly' && (
            <>
              <select
                value={newSectionAvisoWeeklyDay}
                onChange={(e) => setNewSectionAvisoWeeklyDay(Number(e.target.value))}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              >
                {WEEK_DAYS.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
              <input
                type="time"
                value={newSectionAvisoWeeklyTime}
                onChange={(e) => setNewSectionAvisoWeeklyTime(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
          {newSectionAvisoMode === 'scheduled' && (
            <input
              type="datetime-local"
              value={newSectionAvisoScheduledDate}
              onChange={(e) => setNewSectionAvisoScheduledDate(e.target.value)}
              className="md:col-span-2 px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const text = newSectionAviso.trim();
              if (!text) return;
              if (newSectionAvisoMode === 'scheduled' && !newSectionAvisoScheduledDate) {
                alert('Selecciona la fecha y hora de programación');
                return;
              }
              setSectionAvisos([
                ...sectionAvisos,
                {
                  id: Math.random().toString(36).substr(2, 9),
                  texto: text,
                  fecha: new Date().toLocaleString('es-ES'),
                  creadoPor: currentUser?.username || 'Sistema',
                  modo: newSectionAvisoMode,
                  ...(newSectionAvisoMode === 'weekly' && { weeklyDay: newSectionAvisoWeeklyDay, weeklyTime: newSectionAvisoWeeklyTime }),
                  ...(newSectionAvisoMode === 'scheduled' && { scheduledDate: new Date(newSectionAvisoScheduledDate).toISOString() }),
                }
              ]);
              setNewSectionAviso('');
              if (newSectionAvisoMode === 'scheduled') setNewSectionAvisoScheduledDate('');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold"
          >
            AÑADIR AVISO
          </button>
          <button
            onClick={() => { void saveSectionAvisos(sectionAvisos); }}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold"
          >
            GUARDAR
          </button>
        </div>
      </div>

      {sectionAvisos.length > 0 ? (
        <div className="space-y-3">
          {sectionAvisos.map((aviso) => (
            <div key={aviso.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-amber-700 dark:text-amber-300">{aviso.fecha}</p>
                  <p className="text-base font-semibold text-amber-900 dark:text-amber-100 mt-1">{aviso.texto}</p>
                  {aviso.creadoPor && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">Creado por: {aviso.creadoPor}</p>}
                  {(aviso.modo || 'persistent') === 'weekly' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Repite semanalmente: {WEEK_DAYS.find((d) => d.value === aviso.weeklyDay)?.label || 'Dia no definido'} a las {aviso.weeklyTime || '--:--'}
                    </p>
                  )}
                  {(aviso.modo || 'persistent') === 'persistent' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Tipo: único (visible hasta marcarlo como hecho)
                    </p>
                  )}
                  {aviso.modo === 'scheduled' && aviso.scheduledDate && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      ⏰ Programado para: {new Date(aviso.scheduledDate).toLocaleString('es-ES')}
                      {new Date() < new Date(aviso.scheduledDate) ? ' · (aún no activo)' : ' · (activo)'}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    const next = sectionAvisos.filter((item) => item.id !== aviso.id);
                    setSectionAvisos(next);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg font-bold text-sm"
                >
                  🗑 Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg">
          ℹ️ No hay avisos activos en esta sección.
        </div>
      )}
    </div>
  );

  const renderSectionAvisosBanner = () => {
    if (selectedSectionMenuTab !== 'vehiculos') return null;
    if (activeSectionAvisos.length === 0) return null;

    return (
      <div className="space-y-3">
        {activeSectionAvisos.map((aviso) => (
          <div key={aviso.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm text-amber-700 dark:text-amber-300">{aviso.fecha}</p>
                <p className="text-base font-semibold text-amber-900 dark:text-amber-100 mt-1">🔔 {aviso.texto}</p>
                {(aviso.modo || 'persistent') === 'weekly' && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Recurrente: {WEEK_DAYS.find((d) => d.value === aviso.weeklyDay)?.label || 'Dia no definido'} a las {aviso.weeklyTime || '--:--'}
                  </p>
                )}
                {(aviso.modo || 'persistent') === 'persistent' && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Unico: visible hasta marcar hecho</p>
                )}
              </div>
              <button
                onClick={() => { void completeSectionAviso(aviso); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold text-sm"
              >
                ✅ Hecho
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const dirtyState = React.useMemo(() => {
    if (!vehicleSnapshot) {
      return {
        documentation: false,
        niveles: false,
        materials: false,
        movements: false,
        incidencias: false,
        avisos: false,
        info: false,
        type: false,
        any: false
      };
    }

    const documentation = !deepEqual(vehicleDocumentation, vehicleSnapshot.documentation);
    const niveles = !deepEqual(vehicleNiveles, vehicleSnapshot.niveles);
    const materials = !deepEqual(vehicleMaterials, vehicleSnapshot.materials);
    const movements = !deepEqual(vehicleMovements, vehicleSnapshot.movements);
    const incidencias = !deepEqual(vehicleIncidencias, vehicleSnapshot.incidencias);
    const avisos = !deepEqual(vehicleAvisos, vehicleSnapshot.avisos);
    const type = editVehicleType !== vehicleSnapshot.type;
    const info = Boolean(
      editingVehicleId === selectedVehicleId &&
      (editVehicleForm.plate !== vehicleSnapshot.info.plate ||
        editVehicleForm.brand !== vehicleSnapshot.info.brand ||
        editVehicleForm.model !== vehicleSnapshot.info.model)
    );

    return {
      documentation,
      niveles,
      materials,
      movements,
      incidencias,
      avisos,
      info,
      type,
      any: documentation || niveles || materials || movements || incidencias || avisos || info || type
    };
  }, [
    vehicleSnapshot,
    vehicleDocumentation,
    vehicleNiveles,
    vehicleMaterials,
    vehicleMovements,
    vehicleIncidencias,
    vehicleAvisos,
    editVehicleType,
    editingVehicleId,
    selectedVehicleId,
    editVehicleForm
  ]);

  useEffect(() => {
    isDirtyRef.current = dirtyState.any;
  }, [dirtyState.any]);

  const discardUnsavedChanges = () => {
    if (!vehicleSnapshot) return;
    setVehicleDocumentation(deepClone(vehicleSnapshot.documentation));
    setVehicleNiveles(deepClone(vehicleSnapshot.niveles));
    setVehicleMaterials(deepClone(vehicleSnapshot.materials));
    setVehicleMovements(deepClone(vehicleSnapshot.movements));
    setVehicleIncidencias(deepClone(vehicleSnapshot.incidencias));
    setVehicleAvisos(deepClone(vehicleSnapshot.avisos));
    setEditVehicleType(vehicleSnapshot.type);
    setEditVehicleForm({
      plate: vehicleSnapshot.info.plate,
      brand: vehicleSnapshot.info.brand,
      model: vehicleSnapshot.info.model
    });
  };

  const saveAllDirtySections = async () => {
    if (dirtyState.documentation) {
      await handleSaveDocumentation();
    }
    if (dirtyState.niveles) {
      await handleSaveNiveles();
    }
    if (dirtyState.materials) {
      await handleSaveMaterials();
    }
    if (dirtyState.movements) {
      await handleSaveMovimientos();
    }
    if (dirtyState.incidencias) {
      await handleSaveIncidencias();
    }
    if (dirtyState.avisos) {
      await handleSaveAvisos();
    }
    if (dirtyState.type) {
      await handleSaveVehicleType();
    }
    if (dirtyState.info && selectedVehicleId) {
      const saved = await updateVehicleInfo(selectedVehicleId, editVehicleForm.plate, editVehicleForm.brand, editVehicleForm.model);
      if (saved) {
        setEditingVehicleId(null);
      }
    }

    showVehicleSaveFeedback('✅ Cambios guardados correctamente');
  };

  const hasUnsavedChanges = view === 'parte-relevo-form' ? parteRelevoDirty : dirtyState.any;

  const requestNavigation = (action: () => void) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    pendingNavRef.current = action;
    setShowUnsavedPrompt(true);
  };

  const openVehicleDetail = (vehicleId: string) => {
    const navigateToDetail = () => {
      setSelectedVehicleId(vehicleId);
      setSelectedVehicleForParteRelevo(null);
      setView('vehicle-detail');
      setSelectedVehicleMenuTab('transmisiones');
    };

    if (view === 'vehicle-detail' || view === 'parte-relevo-form') {
      requestNavigation(navigateToDetail);
      return;
    }

    navigateToDetail();
  };

  const openVehicleDetailInEditMode = (vehicle: Vehicle) => {
    const navigateToDetail = () => {
      // Signal loadSelectedVehicleData to enter edit mode for this vehicle
      pendingEditVehicleIdRef.current = vehicle.id;
      setSelectedVehicleId(vehicle.id);
      setSelectedVehicleForParteRelevo(null);
      setEditVehicleForm({
        plate: vehicle.plate || '',
        brand: vehicle.brand || '',
        model: vehicle.model || ''
      });
      setEditingVehicleId(vehicle.id);
      setView('vehicle-detail');
      setSelectedVehicleMenuTab('transmisiones');
    };

    if (view === 'vehicle-detail' || view === 'parte-relevo-form') {
      requestNavigation(navigateToDetail);
      return;
    }

    navigateToDetail();
  };

  const handleUnsavedSave = async () => {
    if (view === 'parte-relevo-form') {
      setParteRelevoSaveTick((prev) => prev + 1);
      setShowUnsavedPrompt(false);
      return;
    } else {
      await saveAllDirtySections();
    }
    setShowUnsavedPrompt(false);
    const next = pendingNavRef.current;
    pendingNavRef.current = null;
    if (next) next();
  };

  const handleUnsavedDiscard = () => {
    if (view === 'parte-relevo-form') {
      setParteRelevoDiscardTick((prev) => prev + 1);
    } else {
      discardUnsavedChanges();
    }
    setShowUnsavedPrompt(false);
    const next = pendingNavRef.current;
    pendingNavRef.current = null;
    if (next) next();
  };

  const handleUnsavedCancel = () => {
    setShowUnsavedPrompt(false);
    pendingNavRef.current = null;
  };

  // Cargar datos para super_admin - CON LÍMITE
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'super_admin') return;

    const companiesRef = collection(db, 'companies');
    const q = query(companiesRef); // Firestore limita a 50k docs por default
    const unsubscribeCompanies = onSnapshot(q, snapshot => {
      // Limitar a 500 compañías en memoria (sin paginación en esta tabla)
      setCompanies(snapshot.docs.slice(0, 500).map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    });

    return () => unsubscribeCompanies();
  }, [currentUser]);

  // Cargar compañías de la unidad para rol s4 (solo lectura)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 's4' || !currentUser.unitId) return;

    const unitCompaniesRef = collection(db, 'units', currentUser.unitId, 'companies');
    const unsubUnitCo = onSnapshot(unitCompaniesRef, async snapshot => {
      const ids = snapshot.docs.map(d => d.id);
      if (ids.length === 0) {
        setCompanies([]);
        return;
      }
      // Query in chunks of 10 (Firestore 'in' limit)
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const results: Company[] = [];
      for (const chunk of chunks) {
        const q = query(collection(db, 'companies'), where(documentId(), 'in', chunk));
        const snap = await getDocs(q);
        snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Company));
      }
      setCompanies(results);
    });

    return () => unsubUnitCo();
  }, [currentUser]);

  // Cargar unidades para super_admin
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'super_admin') return;

    const unitsRef = collection(db, 'units');
    const q = query(unitsRef, orderBy('createdAt', 'desc'));
    const unsubscribeUnits = onSnapshot(q, snapshot => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    return () => unsubscribeUnits();
  }, [currentUser]);

  // Stable key: only changes when unit IDs actually change (not on every Firestore snapshot)
  const unitIdsKey = React.useMemo(() => units.map(u => u.id).sort().join('|'), [units]);

  // Cargar compañías por unidad
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'super_admin') return;

    if (!unitIdsKey) {
      setUnitCompanies({});
      return;
    }

    const unitIds = unitIdsKey.split('|').filter(Boolean);
    setUnitCompanies({});
    const unsubscribers = unitIds.map(unitId => {
      const companiesRef = collection(db, 'units', unitId, 'companies');
      return onSnapshot(companiesRef, snapshot => {
        const ids = snapshot.docs.map(doc => doc.id);
        setUnitCompanies(prev => ({ ...prev, [unitId]: ids }));
      });
    });

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, unitIdsKey]);

  // Cargar todas las secciones para super_admin (necesario para resolver usuarios en tabla global)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'super_admin') {
      setAllSections([]);
      return;
    }

    const sectionsRef = collection(db, 'sections');
    const q = query(sectionsRef, limit(1000));
    const unsubscribeSections = onSnapshot(q, snapshot => {
      setAllSections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Section)));
    });

    return () => unsubscribeSections();
  }, [currentUser]);

  // ========== INICIALIZAR MEDIDAS DE SEGURIDAD OTAN ==========
  useEffect(() => {
    // Generar y almacenar CSRF token
    const token = generateCSRFToken();
    sessionStorage.setItem('csrf_token', token);

    // Monitorear sesión
    if (currentUser) {
      const stopMonitoring = startSessionMonitoring(() => {
        console.warn('[SECURITY] Sesión expirada por inactividad');
        setSecurityAlerts(prev => [...prev, 'Sesión expirada. Por favor, inicie sesión nuevamente.']);
        handleLogout();
      });
      setSessionMonitor(() => stopMonitoring);

      return () => stopMonitoring();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Cargar audit logs - ÚLTIMOS 100 REGISTROS
  useEffect(() => {
    if (!currentUser) return;
    if (!hasPermission('read_audit_logs')) {
      setAuditLogs([]);
      return;
    }

    const logsRef = collection(db, 'auditLogs');
    // Ordenar por timestamp descendente y limitar a 100 últimos registros
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeLogs = onSnapshot(q, snapshot => {
      setAuditLogs(snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          user: data.user,
          action: data.action,
          details: data.details
        } as SystemLog;
      }));
    });

    return () => unsubscribeLogs();
  }, [currentUser, hasPermission]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'super_admin') {
      setFeatureProposals([]);
      return;
    }

    const proposalsRef = collection(db, 'featureProposals');
    const q = query(proposalsRef, orderBy('createdAt', 'desc'), limit(200));
    const unsubscribeProposals = onSnapshot(q, (snapshot) => {
      setFeatureProposals(snapshot.docs.map((proposalDoc) => {
        const data = proposalDoc.data() as any;
        const parsedCreatedAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined;
        return {
          id: proposalDoc.id,
          text: data.text || '',
          createdBy: data.createdBy || 'desconocido',
          createdByRole: data.createdByRole || 'consulta',
          companyId: data.companyId || null,
          sectionId: data.sectionId || null,
          status: data.status || 'pending',
          createdAt: parsedCreatedAt
        } as FeatureProposal;
      }));
    });

    return () => unsubscribeProposals();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setAnnouncements([]);
      setVisibleAnnouncements([]);
      return;
    }

    const announcementQuery = query(collection(db, 'appAnnouncements'), orderBy('createdAt', 'desc'), limit(30));
    const unsubscribeAnnouncements = onSnapshot(announcementQuery, (snapshot) => {
      const now = new Date();
      const parsed = snapshot.docs.map((announcementDoc) => {
        const data = announcementDoc.data() as any;
        const parsedCreatedAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined;
        const parsedExpiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ? new Date(data.expiresAt) : undefined;
        return {
          id: announcementDoc.id,
          title: data.title || 'Novedad',
          message: data.message || '',
          active: Boolean(data.active),
          createdBy: data.createdBy || 'super_admin',
          createdAt: parsedCreatedAt,
          expiresAt: parsedExpiresAt
        } as AppAnnouncement;
      });

      setAnnouncements(parsed);
      const activeAnnouncements = parsed.filter((item) => item.active && (!item.expiresAt || item.expiresAt.getTime() > now.getTime()));

      try {
        const unreadAnnouncements = activeAnnouncements.filter((item) => {
          const key = getAnnouncementSeenKey(item.id, currentUser);
          return window.localStorage.getItem(key) !== '1';
        });
        setVisibleAnnouncements(unreadAnnouncements);
      } catch {
        setVisibleAnnouncements(activeAnnouncements);
      }
    });

    return () => unsubscribeAnnouncements();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setVehicleTransfers([]);
      return;
    }

    const mapTransferDoc = (transferDoc: any): VehicleTransfer => {
      const data = transferDoc.data() as any;
      return {
        id: transferDoc.id,
        sourceVehicleId: data.sourceVehicleId || transferDoc.id,
        sourceVehiclePlate: data.sourceVehiclePlate || 'SIN_MATRICULA',
        sourceSectionId: data.sourceSectionId || '',
        sourceSectionName: data.sourceSectionName || 'Sección origen',
        sourceSectionCode: data.sourceSectionCode || '',
        sourceCompanyId: data.sourceCompanyId || null,
        destinationSectionId: data.destinationSectionId || '',
        destinationSectionName: data.destinationSectionName || 'Sección destino',
        destinationSectionCode: data.destinationSectionCode || '',
        destinationCompanyId: data.destinationCompanyId || null,
        copiedVehicleId: data.copiedVehicleId || '',
        participantSectionIds: Array.isArray(data.participantSectionIds) ? data.participantSectionIds : [],
        sourceConfirmed: Boolean(data.sourceConfirmed),
        sourceConfirmedBy: data.sourceConfirmedBy || '',
        sourceConfirmedAt: data.sourceConfirmedAt?.toDate ? data.sourceConfirmedAt.toDate() : data.sourceConfirmedAt ? new Date(data.sourceConfirmedAt) : undefined,
        destinationConfirmed: Boolean(data.destinationConfirmed),
        destinationConfirmedBy: data.destinationConfirmedBy || '',
        destinationConfirmedAt: data.destinationConfirmedAt?.toDate ? data.destinationConfirmedAt.toDate() : data.destinationConfirmedAt ? new Date(data.destinationConfirmedAt) : undefined,
        status: data.status || 'pending_confirmation',
        createdBy: data.createdBy || 'desconocido',
        createdByRole: data.createdByRole || 'consulta',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : undefined,
        completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : data.completedAt ? new Date(data.completedAt) : undefined,
        completedBy: data.completedBy || ''
      } as VehicleTransfer;
    };

    if (currentUser.role === 'super_admin') {
      const qTransfers = query(collection(db, 'vehicleTransfers'), limit(200));
      const unsubscribeTransfers = onSnapshot(qTransfers, (snapshot) => {
        setVehicleTransfers(snapshot.docs.map(mapTransferDoc));
      });
      return () => unsubscribeTransfers();
    }

    if (!currentUser.sectionId) {
      setVehicleTransfers([]);
      return;
    }

    const qTransfers = query(
      collection(db, 'vehicleTransfers'),
      where('participantSectionIds', 'array-contains', currentUser.sectionId),
      limit(200)
    );

    const unsubscribeTransfers = onSnapshot(qTransfers, (snapshot) => {
      setVehicleTransfers(snapshot.docs.map(mapTransferDoc));
    });

    return () => unsubscribeTransfers();
  }, [currentUser]);

  const dismissFeatureAnnouncement = (announcementId: string) => {
    try {
      const key = getAnnouncementSeenKey(announcementId, currentUser);
      window.localStorage.setItem(key, '1');
    } catch {
      // no-op
    }
    setVisibleAnnouncements((prev) => prev.filter((item) => item.id !== announcementId));
  };

  // Generar alertas cuando cambien materiales o movimientos
  useEffect(() => {
    generateAlerts();
  }, [generateAlerts]);

  // Cargar secciones y vehículos para empresa - CON LÍMITE
  useEffect(() => {
    if (!selectedCompanyId) return;

    const sectionsRef = collection(db, 'sections');
    const q = query(sectionsRef, where('companyId', '==', selectedCompanyId), limit(50));
    const unsubscribeSections = onSnapshot(q, snapshot => {
      setSections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Section)));
    });

    return () => unsubscribeSections();
  }, [selectedCompanyId]);

  // Cargar vehículos para sección - CON LÍMITE
  useEffect(() => {
    if (!selectedSectionId) return;

    const vehiclesRef = collection(db, 'vehicles');
    const q = query(vehiclesRef, where('sectionId', '==', selectedSectionId), limit(100));
    const unsubscribeVehicles = onSnapshot(q, snapshot => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    });

    return () => unsubscribeVehicles();
  }, [selectedSectionId]);

  useEffect(() => {
    if (!effectiveSectionIdForAvisos) {
      setSectionAvisos(getDefaultSectionAvisos());
      setNewSectionAviso('');
      return;
    }

    setNewSectionAviso('');
    setSelectedSectionMenuTab('vehiculos');
    const _stored = localStorage.getItem('sigvem_chat_seen_' + effectiveSectionIdForAvisos);
    setChatLastSeenMs(_stored ? parseInt(_stored, 10) : 0);
  }, [effectiveSectionIdForAvisos]);

  useEffect(() => {
    if (!effectiveSectionIdForAvisos) {
      setSectionAvisos(getDefaultSectionAvisos());
      return;
    }

    const sectionRef = doc(db, 'sections', effectiveSectionIdForAvisos);
    const unsubscribeSection = onSnapshot(sectionRef, (snapshot) => {
      const data = snapshot.data() as Section | undefined;
      const nextAvisos = normalizeSectionAvisos(data?.avisosState);
      setSectionAvisos(nextAvisos);
    }, () => {
      setSectionAvisos(getDefaultSectionAvisos());
    });

    return () => unsubscribeSection();
  }, [effectiveSectionIdForAvisos]);

  useEffect(() => {
    if (!effectiveSectionIdForAvisos) {
      setSectionControlData({});
      setSectionControlMessage('');
      return;
    }

    setSectionControlData((prev) => {
      const next: Record<string, { km: string; hours: string }> = {};
      sectionVehiclesForControl.forEach((vehicle) => {
        const existing = prev[vehicle.id];
        next[vehicle.id] = existing || {
          km: vehicle.sectionControlKm === null || vehicle.sectionControlKm === undefined ? '' : String(vehicle.sectionControlKm),
          hours: vehicle.sectionControlHours === null || vehicle.sectionControlHours === undefined ? '' : String(vehicle.sectionControlHours)
        };
      });
      return next;
    });
    setSectionControlMessage('');
  }, [effectiveSectionIdForAvisos, sectionVehiclesForControl]);

  useEffect(() => {
    setTransferPanelTab('nuevo');
    setTransferVehicleId('');
    setTransferDestinationCode('');
    setTransferMessage('');
  }, [effectiveSectionIdForAvisos]);

  // Chat listener - real-time messages for current section room
  useEffect(() => {
    const roomId = chatTargetSectionId || effectiveSectionIdForAvisos;
    if (!roomId) { setChatMessages([]); return; }
    const q = query(collection(db, 'sectionChats'), where('roomId', '==', roomId), orderBy('timestamp', 'asc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSectionIdForAvisos, chatTargetSectionId]);

  // Persist last-seen timestamp to localStorage when Mensajes tab is active
  useEffect(() => {
    if (selectedSectionMenuTab !== 'mensajes') return;
    const now = Date.now();
    setChatLastSeenMs(now);
    const _room = chatTargetSectionId || effectiveSectionIdForAvisos;
    if (_room) localStorage.setItem('sigvem_chat_seen_' + _room, String(now));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionMenuTab]);

  const sendChatMessage = async (roomIdOverride?: string) => {
    const text = chatInput.trim().slice(0, 1000);
    if (!text || chatSending) return;
    const roomId = roomIdOverride || chatTargetSectionId || effectiveSectionIdForAvisos;
    if (!roomId) return;
    setChatSending(true);
    try {
      await addDoc(collection(db, 'sectionChats'), {
        roomId,
        fromUserId: auth.currentUser?.uid ?? currentUser.id,
        fromUsername: currentUser.username,
        fromRole: currentUser.role,
        fromSectionId: currentUser.sectionId || null,
        text,
        timestamp: serverTimestamp()
      });
      setChatInput('');
    } catch (err: any) {
      setError(`Error al enviar mensaje: ${err.message}`);
    } finally {
      setChatSending(false);
    }
  };

  const saveSectionAvisos = async (payload: SectionAvisosState): Promise<boolean> => {
    if (!effectiveSectionIdForAvisos) return false;
    try {
      const normalizedPayload = normalizeSectionAvisos(payload);
      await updateDoc(doc(db, 'sections', effectiveSectionIdForAvisos), {
        avisosState: normalizedPayload
      });
      await createAuditLog('UPDATE_SECTION_AVISOS', `Avisos actualizados en sección ${effectiveSectionIdForAvisos}`);
      return true;
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      return false;
    }
  };

  const completeSectionAviso = async (aviso: SectionAvisoItem) => {
    const now = new Date();
    const next = normalizeSectionAvisos(sectionAvisos).flatMap((item) => {
      if (item.id !== aviso.id) return [item];

      if ((item.modo || 'persistent') === 'weekly') {
        const occurrence = getWeeklyOccurrenceStart(item, now);
        if (!occurrence) return [item];
        return [{ ...item, lastCompletedOccurrence: occurrence.toISOString() }];
      }

      return [];
    });

    setSectionAvisos(next);
    await saveSectionAvisos(next);
  };

  // Cargar usuarios si tiene permisos - CON LÍMITE Y PAGINACIÓN
  useEffect(() => {
    if (!currentUser) return;
    
    const usersRef = collection(db, 'users');
    let q;
    
    // Limitar a 100 usuarios máximo por query (mejor rendimiento)
    if (currentUser.role === 'super_admin') {
      q = query(usersRef, limit(100));
    } else if (currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') {
      q = query(usersRef, where('companyId', '==', currentUser.companyId), limit(100));
    } else if (currentUser.role === 'encargado_seccion') {
      q = query(usersRef, where('sectionId', '==', currentUser.sectionId), limit(100));
    } else {
      return;
    }

    const unsubscribeUsers = onSnapshot(q, snapshot => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    return () => unsubscribeUsers();
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const loginStartTime = Date.now();

    try {
      const trimmedUsername = loginUsername.trim();

      // ========== VERIFICACIONES DE SEGURIDAD OTAN ==========

      // 0. Bloqueo por dispositivo (spray attack: muchos usernames distintos)
      if (isDeviceLocked()) {
        const secMsg = '[SECURITY] Dispositivo bloqueado por exceso de intentos fallidos';
        console.warn(secMsg);
        setError('Demasiados intentos desde este dispositivo. Espere antes de volver a intentarlo.');
        setSecurityAlerts(prev => [...prev, secMsg]);
        setLoading(false);
        return;
      }

      // 1. Verificar rate limiting - ¿Cuenta bloqueada?
      if (isAccountLocked(trimmedUsername)) {
        const secMsg = '[SECURITY] Intento de acceso a cuenta bloqueada: ' + trimmedUsername;
        console.warn(secMsg);
        setError('Cuenta bloqueada temporalmente. Intente más tarde.');
        setSecurityAlerts(prev => [...prev, secMsg]);
        setLoading(false);
        return;
      }

      // 2. Validar longitud de entradas (previene DoS y payloads maliciosos)
      if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
        setError('Usuario inválido');
        setLoading(false);
        return;
      }
      if (loginPassword.length === 0 || loginPassword.length > 128) {
        setError('Contraseña inválida');
        setLoading(false);
        return;
      }

      const emailCandidates = toAuthEmailCandidates(trimmedUsername);
      let resolvedEmail = emailCandidates[0];
      let loginCredential: any = null;
      let lastAuthErr: any = null;

      for (const emailCandidate of emailCandidates) {
        try {
          loginCredential = await signInWithEmailAndPassword(auth, emailCandidate, loginPassword);
          resolvedEmail = emailCandidate;
          break;
        } catch (authErr: any) {
          lastAuthErr = authErr;
        }
      }

      if (!loginCredential) {
        const canContinue = recordFailedLoginAttempt(trimmedUsername);
        if (!canContinue) {
          setError('Demasiados intentos. Cuenta bloqueada temporalmente.');
          setSecurityAlerts(prev => [...prev, `[SECURITY] Cuenta bloqueada por fuerza bruta: ${trimmedUsername}`]);
          setLoading(false);
          return;
        }

        if (lastAuthErr?.code === 'auth/configuration-not-found') {
          setError('Servicio de autenticación no disponible. Contacta con el administrador.');
          setLoading(false);
          return;
        }

        // Mensaje genérico para todos los fallos de credenciales: no se distingue
        // entre "usuario no existe" y "contraseña incorrecta" para evitar user enumeration.
        setError('Usuario o contraseña incorrectos');
        setLoading(false);
        return;
      }

      const authUid = loginCredential.user.uid;
      const userDocRef = doc(db, 'users', authUid);
      const userSnapshot = await getDoc(userDocRef);
      if (!userSnapshot.exists()) {
        await signOutAuth(auth).catch(() => undefined);
        setError('Perfil de usuario no encontrado. Contacta con un administrador.');
        setLoading(false);
        return;
      }

      const userData = userSnapshot.data() as Omit<User, 'id'>;
      if (!userData.email || !userData.authUid) {
        await setDoc(userDocRef, {
          email: resolvedEmail,
          authUid: authUid
        }, { merge: true });
      }

      const user = { ...userData, id: authUid } as User;

      if (maintenanceMode && userData.role !== 'super_admin') {
        if (loginCredential) {
          await signOutAuth(auth).catch(() => undefined);
        }
        setError(maintenanceMessage || 'Aplicación en mantenimiento. Inténtalo más tarde.');
        setLoading(false);
        return;
      }
      
      // Validar que solo chamorro y grandal puedan ser super_admin
      if (userData.role === 'super_admin' && !['chamorro', 'grandal'].includes(trimmedUsername.toLowerCase())) {
        console.log('[handleLogin] ERROR: Usuario no autorizado como super_admin');
        const secMsg = `[SECURITY] Intento de acceso no autorizado como super_admin: ${trimmedUsername}`;
        setSecurityAlerts(prev => [...prev, secMsg]);
        setError('No tienes permisos de super administrador');
        setLoading(false);
        return;
      }

      // Limpiar intentos fallidos después de login exitoso
      clearLoginAttempts(trimmedUsername);

      // ========== CREAR SESIÓN SEGURA ==========
      const deviceInfo = getDeviceInfo();
      const ipAddress = await (async () => {
        try {
          const response = await fetch('https://api.ipify.org?format=json');
          const data = await response.json();
          return data.ip;
        } catch {
          return 'unknown';
        }
      })();

      const secureSession = createSecureSession(
        authUid,
        trimmedUsername,
        userData.role,
        ipAddress,
        navigator.userAgent
      );

      // Almacenar sesión encriptada
      storeSecureSession(secureSession);

      // Registrar login exitoso en auditoría
      const loginDuration = Date.now() - loginStartTime;
      const auditLog = createSecurityAuditLog(
        'LOGIN',
        authUid,
        trimmedUsername,
        ipAddress,
        deviceInfo.userAgent,
        MILITARY_ROLES[userData.role]?.classification || ClassificationLevel.RESTRICTED,
        `Login exitoso desde ${deviceInfo.browser} / ${deviceInfo.os}`,
        'SUCCESS',
        loginDuration
      );

      // Guardar en Firestore (si no hay permisos, continuar sin bloquear login)
      try {
        await addDoc(collection(db, 'securityAuditLogs'), auditLog);
      } catch (logErr) {
        console.warn('[handleLogin] No se pudo guardar securityAuditLog:', logErr);
      }

      console.log('[handleLogin] [SECURITY] Login exitoso - Sesión segura creada');

      // Guardar credenciales en memoria para activar biometría desde Ajustes
      setLastLoginCreds({ username: trimmedUsername, password: loginPassword });

      if (shouldShowBiometricReminder(trimmedUsername)) {
        setSecurityAlerts(prev => [
          ...prev,
          '[SECURITY] Recordatorio semanal: vuelve a configurar la biometría desde Ajustes por seguridad.'
        ]);
        setSettingsMessage('Recordatorio semanal: revisa y vuelve a configurar tu biometría en Ajustes.');
        scheduleNextBiometricReminder(trimmedUsername);
      }

      if (isNativeWebView) {
        try {
          const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
          if (rnWebView?.postMessage) {
            rnWebView.postMessage(JSON.stringify({
              type: 'saveCredentials',
              username: trimmedUsername,
              password: loginPassword
            }));
          }
        } catch {
          // no-op
        }

        try {
          const storedFlag = window.localStorage.getItem('sigvemBiometricsEnabled');
          if (storedFlag !== '1') {
            window.localStorage.setItem('sigvemBiometricsEnabled', '1');
          }
          setBiometricsEnabled(true);
        } catch {
          // no-op
        }
      }

      // Redirigir según rol ANTES de establecer currentUser
      if (userData.role === 'super_admin') {
        setView('units');
      } else if (userData.role === 'encargado_cia' || userData.role === 'encargado_vehiculos') {
        setSelectedCompanyId(userData.companyId ?? null);
        setView('company-detail');
      } else if (userData.role === 'encargado_seccion') {
        setSelectedCompanyId(userData.companyId ?? null);
        setSelectedSectionId(userData.sectionId ?? null);
        setView('section-detail');
      } else if (userData.role === 's4') {
        setView('s4-dashboard');
      } else {
        setSelectedCompanyId(userData.companyId ?? null);
        setSelectedSectionId(userData.sectionId ?? null);
        setView('vehicles-list');
      }

      // ESTABLECER USUARIO AL FINAL
      setCurrentUser(user);

      setLoginUsername('');
      setLoginPassword('');
    } catch (err: any) {
      console.error('[handleLogin] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // ========== DETENER MONITOREO DE SESIÓN PRIMERO ==========
    if (sessionMonitor) {
      try {
        sessionMonitor();
      } catch (err) {
        console.error('[SECURITY] Error deteniendo monitor:', err);
      }
    }
    
    // ========== LIMPIAR SESIÓN SEGURA ==========
    try {
      clearSecureSession();
    } catch (err) {
      console.error('[SECURITY] Error limpiando sesión:', err);
    }

    signOutAuth(auth).catch(err => {
      console.error('[SECURITY] Error cerrando sesión de Firebase Auth:', err);
    });
    
    // Registrar logout en auditoría si hay usuario (con manejo de errores)
    if (currentUser) {
      try {
        const auditLog = createSecurityAuditLog(
          'LOGOUT',
          currentUser.id,
          currentUser.username || 'Unknown',
          'unknown',
          navigator.userAgent,
          MILITARY_ROLES[currentUser.role]?.classification || ClassificationLevel.RESTRICTED,
          'Logout realizado',
          'SUCCESS',
          0
        );
        addDoc(collection(db, 'securityAuditLogs'), auditLog).catch(err => 
          console.error('[SECURITY] Error registrando logout:', err)
        );
      } catch (err) {
        console.error('[SECURITY] Error preparando audit log:', err);
      }
    }

    setLastLoginCreds(null);
    setSettingsMessage('');

    // ========== RESETEAR ESTADO ==========
    setCurrentUser(null);
    setView('login');
    setLoginUsername('');
    setLoginPassword('');
    setSelectedCompanyId(null);
    setSelectedSectionId(null);
    setCompanies([]);
    setAuditReportData([]);
    setAuditReportLoading(false);
    setSecurityAlerts([]); // Limpiar alertas de seguridad
  };

  const normalizeText = (value?: string | null) => String(value || '').trim().toLowerCase();

  const resolveUserContext = (user: User) => {
    const sectionsSource = currentUser?.role === 'super_admin' ? allSections : sections;
    const bySectionId = user.sectionId ? sectionsSource.find(section => section.id === user.sectionId) : undefined;
    const bySectionName = !bySectionId && user.section
      ? sectionsSource.find(section => normalizeText(section.name) === normalizeText(user.section))
      : undefined;
    const byAccessCode = !bySectionId && !bySectionName && user.accessCode
      ? sectionsSource.find(section => normalizeText(section.accessCode) === normalizeText(user.accessCode))
      : undefined;

    const resolvedSection = bySectionId || bySectionName || byAccessCode;

    const byCompanyId = user.companyId ? companies.find(company => company.id === user.companyId) : undefined;
    const byCompanyName = !byCompanyId && user.company
      ? companies.find(company => normalizeText(company.name) === normalizeText(user.company))
      : undefined;
    const byCompanyCode = !byCompanyId && !byCompanyName && user.companyCode
      ? companies.find(company => normalizeText(company.id) === normalizeText(user.companyCode))
      : undefined;
    const bySectionCompany = !byCompanyId && !byCompanyName && !byCompanyCode && resolvedSection?.companyId
      ? companies.find(company => company.id === resolvedSection.companyId)
      : undefined;

    const resolvedCompany = byCompanyId || byCompanyName || byCompanyCode || bySectionCompany;
    const unitId = user.unitId || (resolvedCompany ? getCompanyUnitId(resolvedCompany.id) : null);
    const resolvedUnit = unitId ? units.find(unit => unit.id === unitId) : undefined;

    return {
      unitName: resolvedUnit?.name || 'N/A',
      companyName: resolvedCompany?.name || 'N/A',
      sectionName: resolvedSection?.name || 'N/A'
    };
  };

  const handleDashboardBack = () => {
    if (currentUser?.role === 'super_admin') {
      setView('companies-list');
      return;
    }

    if (currentUser?.role === 'encargado_cia' || currentUser?.role === 'encargado_vehiculos') {
      setView('company-detail');
      return;
    }

    if (currentUser?.role === 'encargado_seccion' || currentUser?.role === 'operador') {
      setView('section-detail');
      return;
    }

    setView('vehicles-list');
  };

  const getBiometricReminderStorageKey = (username: string) => `sigvemBiometricReminderAt:${username.trim().toLowerCase()}`;

  const shouldShowBiometricReminder = (username: string): boolean => {
    if (!isNativeWebView || !biometricsEnabled || typeof window === 'undefined') return false;

    try {
      const stored = window.localStorage.getItem(getBiometricReminderStorageKey(username));
      if (!stored) return true;

      const nextReminderAt = Number(stored);
      if (Number.isNaN(nextReminderAt)) return true;

      return Date.now() >= nextReminderAt;
    } catch {
      return false;
    }
  };

  const scheduleNextBiometricReminder = (username: string) => {
    if (typeof window === 'undefined') return;

    try {
      const nextReminderAt = Date.now() + BIOMETRIC_RECONFIG_REMINDER_MS;
      window.localStorage.setItem(getBiometricReminderStorageKey(username), String(nextReminderAt));
    } catch {
      // no-op
    }
  };

  const sendToNative = (payload: Record<string, any>) => {
    try {
      const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
      if (!rnWebView?.postMessage) return false;
      rnWebView.postMessage(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  const handleEnableBiometrics = () => {
    setSettingsMessage('');
    if (!lastLoginCreds) {
      setSettingsMessage('Vuelve a iniciar sesión para habilitar la biometría.');
      return;
    }
    const ok = sendToNative({ type: 'enableBiometrics', username: lastLoginCreds.username, password: lastLoginCreds.password });
    if (!ok) {
      setSettingsMessage('Esta opción solo está disponible en la app móvil.');
      return;
    }
    setSettingsMessage('Esperando confirmación biométrica...');
  };

  const handleClearBiometrics = () => {
    setSettingsMessage('');
    const ok = sendToNative({ type: 'clearCredentials' });
    if (!ok) {
      setSettingsMessage('Esta opción solo está disponible en la app móvil.');
      return;
    }
    setSettingsMessage('Eliminando biometría en este dispositivo...');
  };

  const handleBiometricLogin = () => {
    setError('');
    const ok = sendToNative({ type: 'promptBiometricLogin' });
    if (!ok) {
      setError('La biometría solo está disponible en la app móvil.');
    }
  };

  // LOGIN VIEW
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        {/* Mostrar alertas de seguridad */}
        <SecurityAlert 
          alerts={securityAlerts} 
          onDismiss={(index) => setSecurityAlerts(prev => prev.filter((_, i) => i !== index))}
        />

        <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
                <img src={logo} alt="SIGVEM" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SIGVEM</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Gestión de Flota</p>
              </div>
            </div>
            <button onClick={handleToggleTheme} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors">
              {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              {isDark ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors">
              <p className="font-semibold">Error: {error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Iniciar Sesión */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Iniciar Sesión</h2>
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Usuario</label>
                  <input 
                    type="text" 
                    spellCheck="false"
                    autoComplete="off"
                    name="login-username"
                    placeholder="Tu usuario"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Contrasena</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="off"
                      name="login-password"
                      placeholder="Tu contraseña"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-500 dark:text-gray-300">
                      {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
              {isNativeWebView && biometricsEnabled && (
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold"
                >
                  Entrar con huella
                </button>
              )}
            </div>

            {/* Crear Usuario */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">👤 Crear Usuario</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                let isSelfRegistration = false;
                let createdAuthUser: any = null;
                let reusedExistingAuthUser = false;
                try {
                  isSelfRegistration = !currentUser;
                  if (!isSelfRegistration && !guardPermission('create_user', 'No tienes permisos para crear usuarios')) {
                    setLoading(false);
                    return;
                  }

                  if (isSelfRegistration && !['consulta', 'operador', 'encargado_seccion'].includes(newCompanyForm.userRole || 'operador')) {
                    setError('Desde esta pantalla solo puedes crear usuarios de consulta, operador o jefe de sección');
                    setLoading(false);
                    return;
                  }

                  // Validar que las contraseñas coincidan
                  if (newCompanyForm.managerPassword !== newCompanyForm.managerPasswordConfirm) {
                    setError('Las contraseñas no coinciden');
                    setLoading(false);
                    return;
                  }

                  // Validar contraseña
                  const passwordValidation = validatePassword(newCompanyForm.managerPassword);
                  if (!passwordValidation.isValid) {
                    setError('Contrasena no válida: ' + passwordValidation.errors.join(', '));
                    setLoading(false);
                    return;
                  }

                  const username = newCompanyForm.managerUsername.trim();
                  const userEmailCandidates = toAuthEmailCandidates(username);
                  let userEmail = userEmailCandidates[0];

                  // En auto-registro no hay permisos para leer /users antes de autenticarse.
                  // La unicidad se valida con Firebase Auth (email-already-in-use).
                  if (!isSelfRegistration) {
                    const usersRef = collection(db, 'users');
                    const q = query(usersRef, where('username', '==', username));
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                      setError('El usuario ya existe');
                      setLoading(false);
                      return;
                    }
                  }

                  // Si se proporciona código de sección, buscar la sección
                  let sectionId: string | null = null;
                  let companyId: string | null = newCompanyForm.companyId || null;
                  const pendingAccessCode = (newCompanyForm.sectionId || '').trim();
                  if (!isSelfRegistration && newCompanyForm.sectionId) {
                    const sectionsRef = collection(db, 'sections');
                    const qSec = query(sectionsRef, where('accessCode', '==', newCompanyForm.sectionId));
                    const sectionSnapshot = await getDocs(qSec);
                    
                    if (!sectionSnapshot.empty) {
                      sectionId = sectionSnapshot.docs[0].id;
                      companyId = sectionSnapshot.docs[0].data().companyId || companyId;
                    } else {
                      setError('Código de sección no válido');
                      setLoading(false);
                      return;
                    }
                  }

                  let createdUid = '';

                  if (isSelfRegistration) {
                    let authCredential: any = null;
                    let lastAuthErr: any = null;

                    for (const emailCandidate of userEmailCandidates) {
                      userEmail = emailCandidate;
                      try {
                        authCredential = await createUserWithEmailAndPassword(auth, emailCandidate, newCompanyForm.managerPassword);
                        break;
                      } catch (authErr: any) {
                        lastAuthErr = authErr;
                        if (authErr?.code === 'auth/email-already-in-use') {
                          try {
                            authCredential = await signInWithEmailAndPassword(auth, emailCandidate, newCompanyForm.managerPassword);
                            reusedExistingAuthUser = true;
                            break;
                          } catch {
                            // continuar con el siguiente candidato
                          }
                        }
                      }

                      if (authCredential) {
                        break;
                      }
                    }

                    if (!authCredential) {
                      if (lastAuthErr?.code === 'auth/configuration-not-found') {
                        setError('Servicio de autenticación no disponible. Contacta con el administrador.');
                      } else if (lastAuthErr?.code === 'auth/email-already-in-use') {
                        setError('El usuario ya existe o hay conflicto con un nombre similar. Prueba con otro nombre de usuario.');
                      } else {
                        setError('No se pudo crear el usuario. Inténtalo de nuevo.');
                      }
                    }

                    if (!authCredential) {
                      setLoading(false);
                      return;
                    }

                    const freshCredential = await signInWithEmailAndPassword(auth, userEmail, newCompanyForm.managerPassword).catch(() => authCredential);
                    createdUid = freshCredential.user.uid;
                    createdAuthUser = freshCredential.user;
                    await waitForAuthSession(createdUid);
                    await ensureAuthTokenReady(freshCredential.user);
                  } else {
                    createdUid = await createAuthUserWithoutSwitchingSession(userEmail, newCompanyForm.managerPassword);
                  }

                  await runWithAuthRetry(() => setDoc(doc(db, 'users', createdUid), {
                    username,
                    email: userEmail,
                    authUid: createdUid,
                    role: newCompanyForm.userRole || 'operador',
                    sectionId: isSelfRegistration ? null : (sectionId || null),
                    companyId: isSelfRegistration ? null : companyId,
                    accessCode: isSelfRegistration ? (pendingAccessCode || null) : null,
                    createdAt: new Date(),
                    classification: MILITARY_ROLES[newCompanyForm.userRole]?.classification || ClassificationLevel.RESTRICTED
                  }), createdAuthUser);

                  if (isSelfRegistration && pendingAccessCode) {
                    const sectionsRef = collection(db, 'sections');
                    const qSec = query(sectionsRef, where('accessCode', '==', pendingAccessCode));
                    const sectionSnapshot = await runWithAuthRetry(() => getDocs(qSec), createdAuthUser);

                    if (!sectionSnapshot.empty) {
                      sectionId = sectionSnapshot.docs[0].id;
                      companyId = sectionSnapshot.docs[0].data().companyId || companyId;

                      await runWithAuthRetry(() => updateDoc(doc(db, 'users', createdUid), {
                        sectionId: sectionId || null,
                        companyId: companyId || null
                      }), createdAuthUser);
                    } else {
                      if (!reusedExistingAuthUser) {
                        await deleteAuthUser(createdAuthUser).catch(() => undefined);
                      }
                      await signOutAuth(auth).catch(() => undefined);
                      setError('Código de sección no válido');
                      setLoading(false);
                      return;
                    }
                  }

                  if (isSelfRegistration) {
                    await signOutAuth(auth).catch(() => undefined);
                  }

                  setError('');
                  setNewCompanyForm({
                    companyName: '',
                    managerUsername: '',
                    managerPassword: '',
                    managerPasswordConfirm: '',
                    userRole: 'operador',
                    sectionId: '',
                    companyId: ''
                  });
                  alert(isSelfRegistration ? '✅ Usuario creado correctamente. Ahora inicia sesión.' : '✅ Usuario creado correctamente');
                  setLoading(false);
                } catch (err: any) {
                  if (isSelfRegistration && createdAuthUser && !reusedExistingAuthUser) {
                    await deleteAuthUser(createdAuthUser).catch(() => undefined);
                    await signOutAuth(auth).catch(() => undefined);
                  }

                  if (err?.code === 'permission-denied') {
                    if (isSelfRegistration) {
                      setError('No se pudo validar permisos de registro en este momento. Reintenta en 2-3 segundos.');
                    } else {
                      setError('Permisos insuficientes para crear usuario con tu rol actual');
                    }
                  } else {
                    setError(err.message);
                  }
                  setLoading(false);
                }
              }} className="space-y-5">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Usuario</label>
                  <input 
                    type="text" 
                    spellCheck="false"
                    autoComplete="off"
                    placeholder="Nombre de usuario"
                    value={newCompanyForm.managerUsername}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerUsername: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Contrasena</label>
                  <div className="relative">
                    <input 
                      type={showCreateUserPassword ? 'text' : 'password'} 
                      spellCheck="false"
                      autoComplete="new-password"
                      name="create-user-password"
                      placeholder="Contrasena segura"
                      value={newCompanyForm.managerPassword || ''}
                      onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerPassword: e.target.value })}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateUserPassword(!showCreateUserPassword)}
                      className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300"
                    >
                      {showCreateUserPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                  
                  {newCompanyForm.managerPassword && (
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                      <p className="text-xs font-bold text-blue-900 dark:text-blue-100 mb-2">Requisitos:</p>
                      <div className="space-y-1.5 text-xs">
                        <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).length ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).length ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                          <span>Mínimo 8 caracteres</span>
                        </div>
                        <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).uppercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).uppercase ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                          <span>Una mayúscula (A-Z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).lowercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).lowercase ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                          <span>Una minúscula (a-z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).number ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).number ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                          <span>Un número (0-9)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).special ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).special ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                          <span>Un carácter especial (!@#$%^&*)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Confirmar Contrasena</label>
                  <div className="relative">
                    <input 
                      type={showCreateUserPasswordConfirm ? 'text' : 'password'} 
                      spellCheck="false"
                      autoComplete="new-password"
                      name="create-user-password-confirm"
                      placeholder="Repite la contraseña"
                      value={newCompanyForm.managerPasswordConfirm || ''}
                      onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerPasswordConfirm: e.target.value })}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateUserPasswordConfirm(!showCreateUserPasswordConfirm)}
                      className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300"
                    >
                      {showCreateUserPasswordConfirm ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                    {newCompanyForm.managerPassword && newCompanyForm.managerPasswordConfirm && (
                      <span className={`absolute right-10 top-3.5 text-lg ${newCompanyForm.managerPassword === newCompanyForm.managerPasswordConfirm ? 'text-green-500' : 'text-red-500'}`}>
                        {newCompanyForm.managerPassword === newCompanyForm.managerPasswordConfirm ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Rol</label>
                  <select 
                    value={newCompanyForm.userRole || 'operador'}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, userRole: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="consulta">Consulta (solo lectura)</option>
                    <option value="operador">Operador</option>
                    <option value="encargado_seccion">Jefe de Sección</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Código de Sección {(newCompanyForm.userRole === 'operador' || newCompanyForm.userRole === 'encargado_seccion' || newCompanyForm.userRole === 'consulta') && <span className="text-red-500">*</span>}</label>
                  <input 
                    type="text" 
                    spellCheck="false"
                    placeholder="Código de acceso a la sección"
                    value={newCompanyForm.sectionId}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, sectionId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    required={newCompanyForm.userRole === 'operador' || newCompanyForm.userRole === 'encargado_seccion' || newCompanyForm.userRole === 'consulta'}
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading || !newCompanyForm.managerUsername || !newCompanyForm.managerPassword || !newCompanyForm.managerPasswordConfirm || newCompanyForm.managerPassword !== newCompanyForm.managerPasswordConfirm || !getPasswordRequirements(newCompanyForm.managerPassword).length || !getPasswordRequirements(newCompanyForm.managerPassword).uppercase || !getPasswordRequirements(newCompanyForm.managerPassword).lowercase || !getPasswordRequirements(newCompanyForm.managerPassword).number || !getPasswordRequirements(newCompanyForm.managerPassword).special} 
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold"
                >
                  {loading ? 'Creando...' : '✅ Crear Usuario'}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const createTestData = async () => {
    if (!guardPermission('create_company', 'No tienes permisos para crear datos de prueba')) return;
    try {
      // Crear compañía
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: 'Compania de Prueba',
        createdAt: new Date()
      });
      
      // Crear sección
      const sectionRef = await addDoc(collection(db, 'sections'), {
        name: 'Sección Principal',
        companyId: companyRef.id,
        accessCode: '1234567890',
        createdAt: new Date()
      });
      
      // Crear vehículo
      await addDoc(collection(db, 'vehicles'), {
        plate: 'MAD-1234',
        brand: 'Mercedes-Benz',
        model: 'Sprinter',
        sectionId: sectionRef.id,
        status: 'OPERATIVO',
        isArchived: false,
        createdAt: new Date()
      });

      // Agregar datos al vehicleDocumentation, vehicleNiveles, vehicleMaterials, vehicleMovements, vehicleIncidencias
      setVehicleDocumentation({
        'Documentación Vehículo': { checked: true, notes: 'Documentación completa y al día' },
        'ITV': { checked: true, notes: 'ITV vigente hasta 2026' },
        '2404': { checked: true, notes: 'Inspección técnica completada' },
        'Seguro': { checked: true, notes: 'Póliza de seguros activa' },
        'Manuales': { checked: true, notes: 'Manuales en la guantera' },
        'Jefe Vehículo': { checked: false, notes: 'Pendiente de asignación' },
        'Jefe Convoy': { checked: false, notes: '' },
        'Procedimiento Peajes': { checked: true, notes: 'Procedimiento conocido' },
        'Normas de Recuperación': { checked: true, notes: 'Normas en el tablero' }
      });

      setVehicleNiveles({
        'Aceite Motor': 'BIEN',
        'Aceite Caja de Cambios': 'BIEN',
        'Líquido Frenos': 'BIEN',
        'Líquido Dirección': 'BAJO',
        'Líquido Parabrisas': 'BIEN'
      });

      setVehicleMaterials({
        'Herramientas Comunes': [
          { id: '1', name: 'Llave inglesa', checked: true, quantity: 2, observations: 'Una dañada' },
          { id: '2', name: 'Destornilladores', checked: true, quantity: 5, observations: '' },
          { id: '3', name: 'Martillo', checked: true, quantity: 1, observations: '' }
        ],
        'Interior Vehículo': [
          { id: '4', name: 'Extintor', checked: true, quantity: 2, observations: 'Revisados en enero' },
          { id: '5', name: 'Botiquín', checked: true, quantity: 1, observations: '' },
          { id: '6', name: 'Triángulos reflectantes', checked: true, quantity: 3, observations: '' }
        ],
        'Exterior Vehículo': [
          { id: '7', name: 'Cadenas antinieve', checked: true, quantity: 1, observations: 'Guardadas en maletero' },
          { id: '8', name: 'Cables de emergencia', checked: true, quantity: 1, observations: '' }
        ],
        'Afuste': [
          { id: '9', name: 'Fusibles de repuesto', checked: true, quantity: 10, observations: '' }
        ],
        'Documentación': [
          { id: '10', name: 'Póliza de seguros', checked: true, quantity: 1, observations: '' },
          { id: '11', name: 'Permiso de circulación', checked: true, quantity: 1, observations: '' }
        ],
        'Transmisiones': [
          { id: '12', name: 'Walkie talkie', checked: true, quantity: 2, observations: 'Batería al 80%' }
        ]
      });

      setVehicleMovements([
        {
          id: '1',
          fechaInicio: '24/01/2026 08:00',
          horaInicio: '',
          fechaFin: '24/01/2026 12:30',
          horaFin: '',
          kmInicial: 45200,
          kmFinal: 45350,
          horas: 4.5
        },
        {
          id: '2',
          fechaInicio: '24/01/2026 14:00',
          horaInicio: '',
          fechaFin: '24/01/2026 18:15',
          horaFin: '',
          kmInicial: 45350,
          kmFinal: 45480,
          horas: 4.25
        },
        {
          id: '3',
          fechaInicio: '23/01/2026 09:00',
          horaInicio: '',
          fechaFin: '23/01/2026 13:45',
          horaFin: '',
          kmInicial: 45000,
          kmFinal: 45200,
          horas: 4.75
        }
      ]);

      setVehicleIncidencias([
        {
          id: '1',
          titulo: 'Rueda pinchada en ruta',
          notas: 'Se cambió la rueda en carretera N-400',
          observaciones: 'Vehículo volvió a circular sin problemas',
          fecha: '22/01/2026'
        },
        {
          id: '2',
          titulo: 'Revisión de fluidos',
          notas: 'Se comprobó nivel de aceite y refrigerante',
          observaciones: 'Necesita rellenar líquido de frenos pronto',
          fecha: '21/01/2026'
        }
      ]);

      alert('✅ Datos de prueba creados. Compania: ' + companyRef.id.substring(0, 8) + '...');
    } catch (err: any) {
      console.error('Error creando datos de prueba:', err);
      alert('Error: ' + err.message);
    }
  };

  // Cargar compañías de prueba para eliminación
  const loadTestCompaniesForDeletion = async () => {
    try {
      setTestDataLoading(true);
      const companiesRef = collection(db, 'companies');
      const q = query(
        companiesRef,
        where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        orderBy('createdAt', 'desc')
      );
      const companiesSnapshot = await getDocs(q);

      const testComps = await Promise.all(companiesSnapshot.docs.map(async (companyDoc: any) => {
        const sectionsRef = collection(db, 'sections');
        const sectionsQ = query(sectionsRef, where('companyId', '==', companyDoc.id));
        const sectionsSnapshot = await getDocs(sectionsQ);
        
        let vehiclesCount = 0;
        for (const sectionDoc of sectionsSnapshot.docs) {
          const vehiclesRef = collection(db, 'vehicles');
          const vehiclesQ = query(vehiclesRef, where('sectionId', '==', sectionDoc.id));
          const vehiclesSnapshot = await getDocs(vehiclesQ);
          vehiclesCount += vehiclesSnapshot.size;
        }

        return {
          id: companyDoc.id,
          name: companyDoc.data().name || 'Sin nombre',
          createdAt: companyDoc.data().createdAt,
          sectionsCount: sectionsSnapshot.size,
          vehiclesCount: vehiclesCount
        };
      }));

      setTestCompanies(testComps);
      setSelectedTestCompanies(new Set());
    } catch (err: any) {
      console.error('Error cargando compañías de prueba:', err);
      alert('Error: ' + err.message);
    } finally {
      setTestDataLoading(false);
    }
  };

  // Eliminar datos de prueba seleccionados
  const deleteSelectedTestData = async () => {
    if (!guardPermission('delete_company', 'No tienes permisos para eliminar datos de prueba')) return;
    if (selectedTestCompanies.size === 0) {
      alert('Por favor, selecciona compañías para eliminar');
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar ${selectedTestCompanies.size} compañía(s) y todos sus datos asociados? Esta acción es irreversible.`
    );
    
    if (!confirmed) return;

    try {
      setTestDataLoading(true);
      setTestDataDeleteProgress({current: 0, total: selectedTestCompanies.size});
      let progress = 0;

      const companyIdsArray = Array.from(selectedTestCompanies);
      
      for (const companyId of companyIdsArray) {
        progress++;
        setTestDataDeleteProgress({current: progress, total: selectedTestCompanies.size});

        // Obtener todas las secciones de esta compañía
        const sectionsRef = collection(db, 'sections');
        const sectionsQ = query(sectionsRef, where('companyId', '==', companyId));
        const sectionsSnapshot = await getDocs(sectionsQ);

        // Para cada sección, eliminar vehículos
        for (const sectionDoc of sectionsSnapshot.docs) {
          const vehiclesRef = collection(db, 'vehicles');
          const vehiclesQ = query(vehiclesRef, where('sectionId', '==', sectionDoc.id));
          const vehiclesSnapshot = await getDocs(vehiclesQ);

          // Eliminar vehículos
          for (const vehicleDoc of vehiclesSnapshot.docs) {
            await deleteDoc(doc(db, 'vehicles', vehicleDoc.id));
          }

          // Eliminar sección
          await deleteDoc(doc(db, 'sections', sectionDoc.id));
        }

        // Eliminar usuarios de la compañía
        const usersRef = collection(db, 'users');
        const usersQ = query(usersRef, where('companyId', '==', companyId));
        const usersSnapshot = await getDocs(usersQ);

        for (const userDoc of usersSnapshot.docs) {
          await deleteDoc(doc(db, 'users', userDoc.id));
        }

        // Finalmente, eliminar la compañía
        await deleteDoc(doc(db, 'companies', companyId));

        // Registrar en auditoría
        await createAuditLog('DELETE_TEST_DATA', `Eliminada compañía de prueba: ${companyId}`);
      }

      alert(`✅ ${selectedTestCompanies.size} compañía(s) eliminada(s) correctamente`);
      setView('companies-menu');
      setTestDataDeleteProgress({current: 0, total: 0});
    } catch (err: any) {
      console.error('Error eliminando datos de prueba:', err);
      alert('Error: ' + err.message);
    } finally {
      setTestDataLoading(false);
      setTestDataDeleteProgress({current: 0, total: 0});
    }
  };

  // Cargar datos consolidados para auditoría
  const loadAuditReportData = async () => {
    if (!guardPermission('read_audit_report', 'No tienes permisos para ver reportes de auditoría')) return;
    try {
      setAuditReportLoading(true);

      const makeSummary = (): AuditVehicleSummary => ({
        total: 0,
        status: {
          operativo: 0,
          condicional: 0,
          inoperativo: 0
        },
        byType: {}
      });

      const normalizeStatus = (statusRaw: any): keyof AuditStatusSummary => {
        const value = String(statusRaw || '').toUpperCase();
        if (value === 'OPERATIVO') return 'operativo';
        if (value === 'OPERATIVO_CONDICIONAL') return 'condicional';
        return 'inoperativo';
      };

      const normalizeType = (typeRaw: any): string => {
        const value = String(typeRaw || '').trim().toLowerCase();
        return value || 'sin_tipo';
      };

      const addVehicleToSummary = (summary: AuditVehicleSummary, vehicle: AuditVehicleItem) => {
        summary.total += 1;
        summary.status[normalizeStatus(vehicle.status)] += 1;
        const typeKey = normalizeType(vehicle.vehicleType);
        summary.byType[typeKey] = (summary.byType[typeKey] || 0) + 1;
      };

      const [unitsSnapshot, companiesSnapshot, sectionsSnapshot, vehiclesSnapshot, transfersSnapshot] = await Promise.all([
        getDocs(collection(db, 'units')),
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'sections')),
        getDocs(collection(db, 'vehicles')),
        getDocs(collection(db, 'vehicleTransfers'))
      ]);

      const companyToUnit = new Map<string, string>();
      Object.entries(unitCompanies).forEach(([unitId, companyIds]) => {
        companyIds.forEach((companyId) => companyToUnit.set(companyId, unitId));
      });

      const unitsMap = new Map<string, AuditUnitReport>();
      unitsSnapshot.docs.forEach((unitDoc: any) => {
        unitsMap.set(unitDoc.id, {
          unitId: unitDoc.id,
          unitName: unitDoc.data()?.name || 'Sin nombre',
          companies: [],
          summary: makeSummary()
        });
      });

      const noUnitId = '__sin_unidad__';
      if (!unitsMap.has(noUnitId)) {
        unitsMap.set(noUnitId, {
          unitId: noUnitId,
          unitName: 'Sin unidad asignada',
          companies: [],
          summary: makeSummary()
        });
      }

      const sectionsByCompany = new Map<string, any[]>();
      sectionsSnapshot.docs.forEach((sectionDoc: any) => {
        const companyId = sectionDoc.data()?.companyId;
        if (!companyId) return;
        if (!sectionsByCompany.has(companyId)) {
          sectionsByCompany.set(companyId, []);
        }
        sectionsByCompany.get(companyId)?.push(sectionDoc);
      });

      const vehiclesBySection = new Map<string, any[]>();
      vehiclesSnapshot.docs.forEach((vehicleDoc: any) => {
        const sectionId = vehicleDoc.data()?.sectionId;
        if (!sectionId) return;
        if (!vehiclesBySection.has(sectionId)) {
          vehiclesBySection.set(sectionId, []);
        }
        vehiclesBySection.get(sectionId)?.push(vehicleDoc);
      });

      const pendingTransferSourceVehicleIds = new Set<string>();
      (transfersSnapshot?.docs || []).forEach((transferDoc: any) => {
        const data = transferDoc.data() || {};
        if (data.status === 'pending_confirmation' && data.sourceVehicleId) {
          pendingTransferSourceVehicleIds.add(String(data.sourceVehicleId));
        }
      });

      companiesSnapshot.docs.forEach((companyDoc: any) => {
        const companyId = companyDoc.id;
        const companyName = companyDoc.data()?.name || 'Sin nombre';
        const unitId = companyToUnit.get(companyId) || noUnitId;
        const unitReport = unitsMap.get(unitId);
        if (!unitReport) return;

        const companyReport: AuditCompanyReport = {
          companyId,
          companyName,
          sections: [],
          summary: makeSummary()
        };

        const companySections = sectionsByCompany.get(companyId) || [];
        companySections.forEach((sectionDoc: any) => {
          const sectionId = sectionDoc.id;
          const sectionReport: AuditSectionReport = {
            sectionId,
            sectionName: sectionDoc.data()?.name || 'Sin nombre',
            vehicles: [],
            summary: makeSummary()
          };

          const sectionVehicles = vehiclesBySection.get(sectionId) || [];
          sectionVehicles.forEach((vehicleDoc: any) => {
            if (pendingTransferSourceVehicleIds.has(vehicleDoc.id)) return;
            const data = vehicleDoc.data() || {};
            const vehicleItem: AuditVehicleItem = {
              id: vehicleDoc.id,
              plate: data.plate || 'N/A',
              brand: data.brand || 'N/A',
              model: data.model || 'N/A',
              status: data.status || 'INOPERATIVO',
              vehicleType: data.vehicleType || 'sin_tipo'
            };

            sectionReport.vehicles.push(vehicleItem);
            addVehicleToSummary(sectionReport.summary, vehicleItem);
            addVehicleToSummary(companyReport.summary, vehicleItem);
            addVehicleToSummary(unitReport.summary, vehicleItem);
          });

          sectionReport.vehicles.sort((a, b) => a.plate.localeCompare(b.plate));
          companyReport.sections.push(sectionReport);
        });

        companyReport.sections.sort((a, b) => a.sectionName.localeCompare(b.sectionName));
        unitReport.companies.push(companyReport);
      });

      const reportData = Array.from(unitsMap.values())
        .map((unit) => ({
          ...unit,
          companies: unit.companies.sort((a, b) => a.companyName.localeCompare(b.companyName))
        }))
        .filter((unit) => unit.companies.length > 0)
        .sort((a, b) => {
          if (a.unitId === noUnitId) return 1;
          if (b.unitId === noUnitId) return -1;
          return a.unitName.localeCompare(b.unitName);
        });

      setAuditReportData(reportData);
    } catch (err: any) {
      console.error('Error cargando datos de auditoría:', err);
      alert('Error: ' + err.message);
    } finally {
      setAuditReportLoading(false);
    }
  };

  const generateUnitAuditPdf = (unit: {
    unitId: string;
    unitName: string;
    companies: AuditCompanyReport[];
    summary: AuditVehicleSummary;
  }) => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      let yPosition = 12;
      const left = 10;
      const contentWidth = 190;
      const rowH = 5.6;

      const ensureSpace = (needed: number): boolean => {
        if (yPosition + needed > 286) {
          pdf.addPage();
          yPosition = 12;
          return true;
        }
        return false;
      };

      const writeText = (text: string, size: number = 10, bold: boolean = false, color?: [number, number, number], step?: number) => {
        ensureSpace(step || (size >= 12 ? 8 : 6));
        pdf.setFontSize(size);
        pdf.setFont('Helvetica', bold ? 'bold' : 'normal');
        if (color) {
          pdf.setTextColor(color[0], color[1], color[2]);
        } else {
          pdf.setTextColor(20, 20, 20);
        }
        pdf.text(text, left, yPosition);
        yPosition += step || (size >= 12 ? 8 : 6);
      };

      const drawRow = (
        cells: string[],
        widths: number[],
        header: boolean = false,
        options?: {
          cellFills?: Array<[number, number, number] | undefined>;
          textColors?: Array<[number, number, number] | undefined>;
          borderColor?: [number, number, number];
        }
      ) => {
        const pageChanged = ensureSpace(rowH + 0.8);
        let x = left;
        const borderColor = options?.borderColor || [185, 194, 204];
        pdf.setFont('Helvetica', header ? 'bold' : 'normal');
        pdf.setFontSize(8);
        pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        pdf.setLineWidth(0.2);
        for (let i = 0; i < cells.length; i++) {
          const w = widths[i];
          const customFill = options?.cellFills?.[i];
          const customText = options?.textColors?.[i];
          if (header) {
            pdf.setFillColor(226, 236, 248);
            pdf.rect(x, yPosition - 4.5, w, rowH, 'FD');
          } else if (customFill) {
            pdf.setFillColor(customFill[0], customFill[1], customFill[2]);
            pdf.rect(x, yPosition - 4.5, w, rowH, 'FD');
          } else {
            pdf.rect(x, yPosition - 4.5, w, rowH, 'S');
          }
          const raw = String(cells[i] || '');
          const text = raw.length > 42 ? `${raw.slice(0, 39)}...` : raw;
          if (customText) {
            pdf.setTextColor(customText[0], customText[1], customText[2]);
          } else {
            pdf.setTextColor(20, 20, 20);
          }
          pdf.text(text, x + 1.2, yPosition - 1);
          x += w;
        }
        pdf.setTextColor(20, 20, 20);
        yPosition += rowH;
        return { pageChanged };
      };

      const drawBoxedLine = (
        text: string,
        options?: {
          header?: boolean;
          textColor?: [number, number, number];
          fillColor?: [number, number, number];
          size?: number;
          bold?: boolean;
          indent?: number;
        }
      ) => {
        const size = options?.size || 8.7;
        const indent = options?.indent || 0;
        const width = contentWidth - indent;
        ensureSpace(rowH + 0.8);
        pdf.setLineWidth(0.2);
        pdf.setDrawColor(185, 194, 204);
        if (options?.header || options?.fillColor) {
          const fill = options?.fillColor || [226, 236, 248];
          pdf.setFillColor(fill[0], fill[1], fill[2]);
          pdf.rect(left + indent, yPosition - 4.5, width, rowH, 'FD');
        } else {
          pdf.rect(left + indent, yPosition - 4.5, width, rowH, 'S');
        }

        pdf.setFont('Helvetica', options?.bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        if (options?.textColor) {
          pdf.setTextColor(options.textColor[0], options.textColor[1], options.textColor[2]);
        } else {
          pdf.setTextColor(20, 20, 20);
        }
        const available = Math.max(1, Math.floor((width - 3.5) / 1.8));
        const clipped = text.length > available ? `${text.slice(0, Math.max(0, available - 3))}...` : text;
        pdf.text(clipped, left + indent + 1.5, yPosition - 1);
        pdf.setTextColor(20, 20, 20);
        yPosition += rowH;
      };

      const getStatusCellStyle = (status: string): {
        fill: [number, number, number];
        text: [number, number, number];
      } => {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'operativo') {
          return { fill: [216, 243, 220], text: [20, 90, 35] };
        }
        if (normalized === 'condicional') {
          return { fill: [255, 243, 205], text: [120, 85, 20] };
        }
        return { fill: [248, 215, 218], text: [120, 30, 40] };
      };

      const formatTypeSummary = (byType: Record<string, number>) => {
        const entries = Object.entries(byType);
        if (entries.length === 0) return 'Sin vehiculos';
        return entries.map(([type, count]) => `${String(type).toUpperCase()}: ${count}`).join(' | ');
      };

      const estimateCompanyStartHeight = (company: AuditCompanyReport) => {
        let lines = 8;
        if (company.sections.length > 0) {
          lines += 4;
        }
        return lines * rowH + 6;
      };

      writeText('SIGVEM - AUDITORIA CONSOLIDADA POR UNIDAD', 13, true, [15, 55, 120]);
      writeText(`Unidad: ${unit.unitName}`, 11, true);
      writeText(`Fecha: ${new Date().toLocaleString('es-ES')}`, 9, false, [90, 90, 90]);
      yPosition += 1.5;

      drawBoxedLine('RESUMEN DE UNIDAD', { header: true, bold: true, textColor: [0, 90, 125], size: 9.2 });
      drawBoxedLine(`Companias: ${unit.companies.length} | Vehiculos: ${unit.summary.total}`);
      drawBoxedLine(`Operativos: ${unit.summary.status.operativo} | Condicionales: ${unit.summary.status.condicional} | Inoperativos: ${unit.summary.status.inoperativo}`);
      drawBoxedLine(`Tipos: ${formatTypeSummary(unit.summary.byType)}`);
      yPosition += 1;

      unit.companies.forEach((company, companyIndex) => {
        const neededAtStart = estimateCompanyStartHeight(company);
        if (ensureSpace(neededAtStart)) {
          writeText('CONTINUACION AUDITORIA', 9, true, [100, 100, 100], 5.5);
        }

        drawBoxedLine(`${companyIndex + 1}. COMPANIA: ${company.companyName}`, {
          header: true,
          bold: true,
          textColor: [0, 85, 120],
          size: 10
        });
        drawBoxedLine(`Secciones: ${company.sections.length} | Vehiculos: ${company.summary.total}`);
        drawBoxedLine(`Operativos: ${company.summary.status.operativo} | Condicionales: ${company.summary.status.condicional} | Inoperativos: ${company.summary.status.inoperativo}`);
        drawBoxedLine(`Tipos: ${formatTypeSummary(company.summary.byType)}`);

        if (company.sections.length === 0) {
          drawBoxedLine('- Sin secciones', { textColor: [120, 120, 120], indent: 4 });
          yPosition += 1;
          return;
        }

        company.sections.forEach((section, sectionIndex) => {
          const sectionStartNeeded = section.vehicles.length > 0 ? 24 : 15;
          if (ensureSpace(sectionStartNeeded)) {
            writeText(`CONTINUACION: ${company.companyName}`, 8, true, [100, 100, 100], 5.2);
          }

          drawBoxedLine(`${companyIndex + 1}.${sectionIndex + 1} Seccion: ${section.sectionName}`, {
            header: true,
            bold: true,
            size: 9.4,
            indent: 4
          });
          drawBoxedLine(`Vehiculos: ${section.summary.total} | Operativos: ${section.summary.status.operativo} | Condicionales: ${section.summary.status.condicional} | Inoperativos: ${section.summary.status.inoperativo}`, { indent: 4 });
          drawBoxedLine(`Tipos: ${formatTypeSummary(section.summary.byType)}`, { indent: 4 });

          if (section.vehicles.length > 0) {
            const vehicleHeaderCells = ['Matricula', 'Marca/Modelo', 'Estado', 'Tipo'];
            const vehicleHeaderWidths = [34, 76, 46, 34];

            drawRow(vehicleHeaderCells, vehicleHeaderWidths, true);
            section.vehicles.forEach((vehicle) => {
              const statusStyle = getStatusCellStyle(vehicle.status);
              const pageChanged = ensureSpace(rowH + 0.8);
              if (pageChanged) {
                writeText(`Continuacion: ${company.companyName} / ${section.sectionName}`, 8, true, [90, 90, 90], 5.2);
                drawRow(vehicleHeaderCells, vehicleHeaderWidths, true);
              }

              drawRow(
                [
                  vehicle.plate,
                  `${vehicle.brand} ${vehicle.model}`,
                  vehicle.status,
                  String(vehicle.vehicleType || 'sin_tipo').toUpperCase()
                ],
                vehicleHeaderWidths,
                false,
                {
                  cellFills: [undefined, undefined, statusStyle.fill, undefined],
                  textColors: [undefined, undefined, statusStyle.text, undefined]
                }
              );
            });
          } else {
            drawBoxedLine('- Sin vehiculos', { textColor: [120, 120, 120], indent: 8 });
          }

          yPosition += 0.8;
        });

        yPosition += 1.5;
      });

      const safeUnitName = unit.unitName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'unidad';
      const filename = `AUDITORIA_UNIDAD_${safeUnitName}_${new Date().toISOString().split('T')[0]}.pdf`;

      if (isNativeWebView) {
        const dataUri = pdf.output('datauristring');
        const base64 = String(dataUri).split(',')[1] || '';
        const ok = sendToNative({
          type: 'downloadBlob',
          base64,
          mime: 'application/pdf',
          filename
        });
        if (!ok) {
          setError('No se pudo descargar el PDF en la app móvil.');
          return;
        }
      } else {
        pdf.save(filename);
      }

      createAuditLog('EXPORT_AUDIT_UNIT_PDF', `Exportado PDF de auditoria para unidad ${unit.unitName}`);
    } catch (err: any) {
      console.error('Error generando PDF de auditoria por unidad:', err);
      setError(`Error generando PDF: ${err?.message || 'desconocido'}`);
    }
  };

  const loadS4AuditReportData = async () => {
    if (!currentUser || currentUser.role !== 's4' || !currentUser.unitId) return;
    setAuditReportLoading(true);

    const makeSummary = (): AuditVehicleSummary => ({
      total: 0,
      status: { operativo: 0, condicional: 0, inoperativo: 0 },
      byType: {}
    });

    const normalizeStatus = (statusRaw: any): keyof AuditStatusSummary => {
      const value = String(statusRaw || '').toUpperCase();
      if (value === 'OPERATIVO') return 'operativo';
      if (value === 'OPERATIVO_CONDICIONAL') return 'condicional';
      return 'inoperativo';
    };

    const normalizeType = (typeRaw: any): string =>
      String(typeRaw || '').trim().toLowerCase() || 'sin_tipo';

    const addVehicleToSummary = (summary: AuditVehicleSummary, vehicle: AuditVehicleItem) => {
      summary.total += 1;
      summary.status[normalizeStatus(vehicle.status)] += 1;
      const typeKey = normalizeType(vehicle.vehicleType);
      summary.byType[typeKey] = (summary.byType[typeKey] || 0) + 1;
    };

    try {
      if (companies.length === 0) {
        setAuditReportData([]);
        return;
      }

      // Get unit name
      let unitName = 'Mi Unidad';
      try {
        const unitDocSnap = await getDoc(doc(db, 'units', currentUser.unitId));
        unitName = unitDocSnap.data()?.name || 'Mi Unidad';
      } catch (unitErr: any) {
        console.warn('S4 Audit: no se pudo leer nombre de unidad:', unitErr.message);
      }

      const unitSummary = makeSummary();
      const companiesReport: AuditCompanyReport[] = [];

      for (const company of companies) {
        const companySummary = makeSummary();
        let sectionsSnap: any;

        try {
          sectionsSnap = await getDocs(
            query(collection(db, 'sections'), where('companyId', '==', company.id), limit(200))
          );
        } catch (secErr: any) {
          console.error(`S4 Audit: error leyendo secciones de compañía ${company.id}:`, secErr.message);
          alert(`Error al leer secciones de la compañía "${company.name}" (id: ${company.id}).\n\n${secErr.message}`);
          return;
        }

        const companySections: AuditSectionReport[] = [];

        for (const sectionDoc of sectionsSnap.docs) {
          const sectionSummary = makeSummary();
          let vehiclesSnap: any;

          try {
            vehiclesSnap = await getDocs(
              query(collection(db, 'vehicles'), where('sectionId', '==', sectionDoc.id), limit(500))
            );
          } catch (vehErr: any) {
            console.error(`S4 Audit: error leyendo vehículos de sección ${sectionDoc.id}:`, vehErr.message);
            alert(`Error al leer vehículos de la sección "${sectionDoc.data()?.name}" (id: ${sectionDoc.id}).\nCompañía: ${company.name}\n\n${vehErr.message}`);
            return;
          }

          const sectionVehicles: AuditVehicleItem[] = vehiclesSnap.docs.map((vehicleDoc: any) => {
            const data = vehicleDoc.data() || {};
            const vehicleItem: AuditVehicleItem = {
              id: vehicleDoc.id,
              plate: data.plate || 'N/A',
              brand: data.brand || 'N/A',
              model: data.model || 'N/A',
              status: data.status || 'INOPERATIVO',
              vehicleType: data.vehicleType || 'sin_tipo'
            };
            addVehicleToSummary(sectionSummary, vehicleItem);
            addVehicleToSummary(companySummary, vehicleItem);
            addVehicleToSummary(unitSummary, vehicleItem);
            return vehicleItem;
          });
          sectionVehicles.sort((a, b) => a.plate.localeCompare(b.plate));

          companySections.push({
            sectionId: sectionDoc.id,
            sectionName: sectionDoc.data()?.name || 'Sin nombre',
            vehicles: sectionVehicles,
            summary: sectionSummary
          });
        }
        companySections.sort((a, b) => a.sectionName.localeCompare(b.sectionName));

        companiesReport.push({
          companyId: company.id,
          companyName: company.name,
          sections: companySections,
          summary: companySummary
        });
      }
      companiesReport.sort((a, b) => a.companyName.localeCompare(b.companyName));

      setAuditReportData([{
        unitId: currentUser.unitId,
        unitName,
        companies: companiesReport,
        summary: unitSummary
      }]);
    } catch (err: any) {
      console.error('Error inesperado en auditoría S4:', err);
      alert('Error inesperado: ' + err.message);
    } finally {
      setAuditReportLoading(false);
    }
  };

  const loadS4GlobalItvData = async () => {
    if (!currentUser || currentUser.role !== 's4') return;
    setS4GlobalItvLoading(true);
    setS4GlobalItvData([]);
    try {
      const entries: any[] = [];
      for (const company of companies) {
        let sectionsSnap: any;
        try {
          sectionsSnap = await getDocs(
            query(collection(db, 'sections'), where('companyId', '==', company.id), limit(200))
          );
        } catch { continue; }
        for (const sectionDoc of sectionsSnap.docs) {
          let vehiclesSnap: any;
          try {
            vehiclesSnap = await getDocs(
              query(collection(db, 'vehicles'), where('sectionId', '==', sectionDoc.id), limit(500))
            );
          } catch { continue; }
          for (const vehicleDoc of vehiclesSnap.docs) {
            const data = vehicleDoc.data() || {};
            entries.push({
              vehicleId: vehicleDoc.id,
              plate: data.plate || 'N/A',
              brand: data.brand || '',
              model: data.model || '',
              vehicleType: data.vehicleType || '',
              status: data.status || 'INOPERATIVO',
              nextItvDate: data.nextItvDate || null,
              sectionId: sectionDoc.id,
              sectionName: sectionDoc.data()?.name || 'Sin nombre',
              companyId: company.id,
              companyName: company.name,
            });
          }
        }
      }
      // Sort: vehicles with ITV date first (ascending), then those without date
      entries.sort((a, b) => {
        if (!a.nextItvDate && !b.nextItvDate) return a.plate.localeCompare(b.plate);
        if (!a.nextItvDate) return 1;
        if (!b.nextItvDate) return -1;
        return new Date(a.nextItvDate).getTime() - new Date(b.nextItvDate).getTime();
      });
      setS4GlobalItvData(entries);
    } catch (err: any) {
      setError('Error al cargar ITVs: ' + err.message);
    } finally {
      setS4GlobalItvLoading(false);
    }
  };

  const loadCiaOverviewData = async (): Promise<{ section: any; vehicles: Vehicle[] }[]> => {
    if (!currentUser || (currentUser.role !== 'encargado_cia' && currentUser.role !== 'encargado_vehiculos') || !currentUser.companyId) return [];
    setCiaOverviewLoading(true);
    setCiaOverviewData([]);
    try {
      const sectionsSnap = await getDocs(
        query(collection(db, 'sections'), where('companyId', '==', currentUser.companyId), limit(200))
      );
      const entries: { section: any; vehicles: Vehicle[] }[] = [];
      for (const sectionDoc of sectionsSnap.docs) {
        let vehiclesSnap: any;
        try {
          vehiclesSnap = await getDocs(
            query(collection(db, 'vehicles'), where('sectionId', '==', sectionDoc.id), limit(200))
          );
        } catch { entries.push({ section: { id: sectionDoc.id, ...sectionDoc.data() }, vehicles: [] }); continue; }
        const vList: Vehicle[] = vehiclesSnap.docs
          .map((d: any) => ({ id: d.id, ...d.data() } as Vehicle))
          .filter((v: Vehicle) => !v.isArchived)
          .sort((a: Vehicle, b: Vehicle) => a.plate.localeCompare(b.plate));
        entries.push({ section: { id: sectionDoc.id, ...sectionDoc.data() }, vehicles: vList });
      }
      entries.sort((a, b) => a.section.name.localeCompare(b.section.name));
      setCiaOverviewData(entries);
      return entries;
    } catch (err: any) {
      setError('Error al cargar la vista general: ' + err.message);
      return [];
    } finally {
      setCiaOverviewLoading(false);
    }
  };

  const generateCiaAuditPdf = (dataOverride?: { section: any; vehicles: Vehicle[] }[]) => {
    const data = dataOverride || ciaOverviewData;
    if (!currentUser || !data.length) return;
    const companyName = companies.find(c => c.id === currentUser!.companyId)?.name || currentUser.companyId || 'Compañía';
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fileDate = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let yPos = 12;
    const left = 10;
    const cw = 190;
    const rowH = 5.6;

    const ensureSpace = (needed: number) => {
      if (yPos + needed > 286) { pdf.addPage(); yPos = 12; }
    };

    const drawRow = (cols: string[], widths: number[], xStart: number, fillColor?: [number,number,number], textColor?: [number,number,number]) => {
      ensureSpace(rowH + 1);
      let xCur = xStart;
      if (fillColor) { pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]); pdf.rect(xCur, yPos - rowH + 1, widths.reduce((a,b)=>a+b,0), rowH + 1, 'F'); }
      pdf.setFontSize(8); pdf.setFont('Helvetica', 'normal');
      pdf.setTextColor(textColor ? textColor[0] : 0, textColor ? textColor[1] : 0, textColor ? textColor[2] : 0);
      const rowY = yPos;
      cols.forEach((c, i) => { pdf.text(String(c), xCur + 1.5, rowY + 0.5); xCur += widths[i]; });
      yPos += rowH + 1;
    };

    // Aggregate totals
    let totalVehicles = 0, totalOp = 0, totalCond = 0, totalInop = 0;
    const byType: Record<string,number> = {};
    data.forEach(({ vehicles }) => {
      vehicles.forEach(v => {
        totalVehicles++;
        if (v.status === 'OPERATIVO') totalOp++;
        else if (v.status === 'OPERATIVO_CONDICIONAL') totalCond++;
        else totalInop++;
        if (v.vehicleType) byType[v.vehicleType] = (byType[v.vehicleType] || 0) + 1;
      });
    });

    // Header
    pdf.setFillColor(30, 64, 175);
    pdf.rect(left, yPos - 6, cw, 18, 'F');
    pdf.setFontSize(15); pdf.setFont('Helvetica','bold'); pdf.setTextColor(255,255,255);
    pdf.text('AUDITORÍA DE COMPAÑÍA', left + 4, yPos);
    yPos += 7;
    pdf.setFontSize(10); pdf.setFont('Helvetica','normal');
    pdf.text(`${companyName}   —   ${dateStr}`, left + 4, yPos);
    yPos += 10;

    // Summary bar
    pdf.setFillColor(240,240,240); pdf.rect(left, yPos, cw, 10, 'F');
    pdf.setFontSize(9); pdf.setFont('Helvetica','bold'); pdf.setTextColor(0,0,0);
    pdf.text(`Total: ${totalVehicles}`, left + 4, yPos + 7);
    pdf.setTextColor(22,163,74);
    pdf.text(`Operativos: ${totalOp}`, left + 40, yPos + 7);
    pdf.setTextColor(202,138,4);
    pdf.text(`Condicionales: ${totalCond}`, left + 90, yPos + 7);
    pdf.setTextColor(220,38,38);
    pdf.text(`Inoperativos: ${totalInop}`, left + 145, yPos + 7);
    yPos += 16;

    if (Object.keys(byType).length > 0) {
      pdf.setFontSize(9); pdf.setFont('Helvetica','bold'); pdf.setTextColor(0,0,0);
      pdf.text('Por tipo: ' + Object.entries(byType).map(([k,v]) => `${k}: ${v}`).join(' | '), left, yPos);
      yPos += 7;
    }

    // Per-section breakdown
    const colW = [22, 40, 28, 35, 35, 30];
    for (const { section, vehicles } of data) {
      ensureSpace(20);
      pdf.setFillColor(59,130,246); pdf.rect(left, yPos, cw, 8, 'F');
      pdf.setFontSize(10); pdf.setFont('Helvetica','bold'); pdf.setTextColor(255,255,255);
      const secOp = vehicles.filter(v => v.status==='OPERATIVO').length;
      const secCond = vehicles.filter(v => v.status==='OPERATIVO_CONDICIONAL').length;
      const secInop = vehicles.filter(v => v.status==='INOPERATIVO').length;
      pdf.text(`${section.name || section.id}   |   Vehículos: ${vehicles.length}   Op: ${secOp}   Cond: ${secCond}   Inop: ${secInop}`, left+2, yPos+6);
      yPos += 11;

      if (vehicles.length === 0) {
        pdf.setFontSize(8); pdf.setFont('Helvetica','italic'); pdf.setTextColor(120,120,120);
        pdf.text('Sin vehículos registrados.', left+4, yPos); yPos += 7;
        continue;
      }

      drawRow(['Matrícula','Marca/Modelo','Tipo','Estado','Próx. ITV','Incid.'], colW, left, [200,200,200], [0,0,0]);

      for (const v of vehicles) {
        const itvStr = v.nextItvDate || '-';
        const incStr = (v.incidenciasState && v.incidenciasState.length > 0) ? `${v.incidenciasState.length} inc.` : '-';
        const statusColor: [number,number,number] = v.status === 'OPERATIVO' ? [22,163,74] : v.status === 'OPERATIVO_CONDICIONAL' ? [202,138,4] : [220,38,38];
        ensureSpace(rowH + 1);
        const rowY = yPos;
        let xCur = left;
        pdf.setFillColor(248,248,248); pdf.rect(xCur, rowY - rowH + 1, colW.reduce((a,b)=>a+b,0), rowH+1, 'F');
        pdf.setFontSize(8); pdf.setFont('Helvetica','normal');
        const rowData = [v.plate||'', `${v.brand||''} ${v.model||''}`.trim(), v.vehicleType||'-', v.status||'-', itvStr, incStr];
        for (let i = 0; i < rowData.length; i++) {
          pdf.setTextColor(i === 3 ? statusColor[0] : 0, i === 3 ? statusColor[1] : 0, i === 3 ? statusColor[2] : 0);
          pdf.text(rowData[i].substring(0, 18), xCur + 1.5, rowY + 0.5);
          xCur += colW[i];
        }
        yPos += rowH + 1;
      }
      yPos += 4;
    }

    // Footer on each page
    const totalPages = (pdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7); pdf.setFont('Helvetica','normal'); pdf.setTextColor(150,150,150);
      pdf.text(`SIGVEM — ${companyName} — ${dateStr} — Pág. ${i}/${totalPages}`, left, 293);
    }

    pdf.save(`AUDITORIA_CIA_${companyName.replace(/\s+/g,'_')}_${fileDate}.pdf`);
  };

  // Generar reporte mensual en PDF
  const generateMonthlyReport = () => {
    if (!selectedVehicleId) return alert('Selecciona un vehículo');
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let yPosition = 15;

    // Título
    pdf.setFontSize(16);
    pdf.text('REPORTE MENSUAL DE MOVIMIENTOS', 15, yPosition);
    yPosition += 10;

    // Datos del vehículo
    pdf.setFontSize(10);
    pdf.text(`Vehículo: ${vehicle.plate}`, 15, yPosition);
    pdf.text(`${vehicle.brand} ${vehicle.model}`, 15, yPosition + 5);
    pdf.text(`Período: ${new Date().toLocaleDateString('es-ES')}`, 15, yPosition + 10);
    yPosition += 20;

    // Tabla de movimientos
    pdf.setFontSize(9);
    pdf.setFillColor(30, 90, 190);
    pdf.setTextColor(255, 255, 255);
    pdf.rect(15, yPosition, 180, 5, 'F');
    pdf.text('FECHA INICIO', 17, yPosition + 3.5);
    pdf.text('FECHA FIN', 55, yPosition + 3.5);
    pdf.text('KM', 95, yPosition + 3.5);
    pdf.text('HORAS', 125, yPosition + 3.5);
    yPosition += 6;

    pdf.setTextColor(0, 0, 0);
    vehicleMovements.forEach((mov, idx) => {
      if (yPosition > 270) {
        pdf.addPage();
        yPosition = 15;
      }
      
      const kmDiff = mov.kmFinal - mov.kmInicial;
      pdf.rect(15, yPosition, 180, 5);
      pdf.text(mov.fechaInicio, 17, yPosition + 3.5);
      pdf.text(mov.fechaFin, 55, yPosition + 3.5);
      pdf.text(kmDiff.toFixed(0), 95, yPosition + 3.5);
      pdf.text(mov.horas.toFixed(1), 125, yPosition + 3.5);
      yPosition += 5;
    });

    yPosition += 10;
    const totalKm = vehicleMovements.reduce((sum, m) => sum + (m.kmFinal - m.kmInicial), 0);
    const totalHoras = vehicleMovements.reduce((sum, m) => sum + m.horas, 0);
    
    pdf.setFont('Helvetica', 'bold');
    pdf.text(`TOTAL: ${totalKm.toFixed(0)} KM | ${totalHoras.toFixed(1)} HORAS`, 15, yPosition);

    pdf.save(`REPORTE_MOVIMIENTOS_${vehicle.plate}_${new Date().toISOString().split('T')[0]}.pdf`);
    createAuditLog('GENERATE_REPORT', `Generado reporte mensual para ${vehicle.plate}`);
  };

  // Exportar movimientos a CSV
  const exportMovementsCSV = () => {
    if (!selectedVehicleId) return alert('Selecciona un vehículo');
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    let csv = 'Vehículo,Fecha Inicio,Fecha Fin,KM Inicial,KM Final,KM Recorrido,Horas\n';
    vehicleMovements.forEach(mov => {
      const kmDiff = mov.kmFinal - mov.kmInicial;
      csv += `${vehicle.plate},${mov.fechaInicio},${mov.fechaFin},${mov.kmInicial},${mov.kmFinal},${kmDiff},${mov.horas}\n`;
    });

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = `MOVIMIENTOS_${vehicle.plate}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    createAuditLog('EXPORT_CSV', `Exportado CSV de movimientos para ${vehicle.plate}`);
  };

  // Exportar materiales a CSV
  const exportMaterialsCSV = () => {
    if (!selectedVehicleId) return alert('Selecciona un vehículo');
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    let csv = 'Categoría,Artículo,Cantidad,Observaciones,Revisado\n';
    Object.entries(vehicleMaterials).forEach(([category, items]) => {
      items.forEach(item => {
        csv += `${category},${item.name},${item.quantity},"${item.observations}",${item.checked ? 'Sí' : 'No'}\n`;
      });
    });

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = `MATERIALES_${vehicle.plate}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    createAuditLog('EXPORT_CSV', `Exportado CSV de materiales para ${vehicle.plate}`);
  };

  // Generar vista de Dashboard
  const getDashboardStats = () => {
    const total = vehicles.filter(v => !v.isArchived).length;
    const operativo = vehicles.filter(v => v.status === 'OPERATIVO' && !v.isArchived).length;
    const condicional = vehicles.filter(v => v.status === 'OPERATIVO_CONDICIONAL' && !v.isArchived).length;
    const inoperativo = vehicles.filter(v => v.status === 'INOPERATIVO' && !v.isArchived).length;
    const totalKm = vehicleMovements.reduce((sum, m) => sum + (m.kmFinal - m.kmInicial), 0);
    const totalHoras = vehicleMovements.reduce((sum, m) => sum + m.horas, 0);
    const totalIncidencias = vehicleIncidencias.length;

    return { total, operativo, condicional, inoperativo, totalKm, totalHoras, totalIncidencias };
  };

  // Archivar vehículo
  const archiveVehicle = async (vehicleId: string) => {
    if (!guardPermission('archive_vehicle', 'No tienes permisos para archivar vehículos')) return;
    if (!window.confirm('¿Archivar este vehículo? Se ocultará de la lista pero se conservarán todos los datos.')) return;

    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      await updateDoc(doc(db, 'vehicles', vehicleId), { isArchived: true });
      await createAuditLog('ARCHIVE_VEHICLE', `Vehículo ${vehicle?.plate} archivado`);
      setSelectedVehicleId(null);
      setView('section-detail');
    } catch (err: any) {
      setError(`Error: ${err.message}`);
    }
  };

  // Desarchivar vehículo
  const unarchiveVehicle = async (vehicleId: string) => {
    if (!guardPermission('archive_vehicle', 'No tienes permisos para restaurar vehículos')) return;
    if (!window.confirm('¿Restaurar este vehículo? Volverá a aparecer en la lista activa.')) return;

    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      await updateDoc(doc(db, 'vehicles', vehicleId), { isArchived: false });
      await createAuditLog('UNARCHIVE_VEHICLE', `Vehículo ${vehicle?.plate} desarchivado`);
      setShowArchived(false);
      setView('section-detail');
    } catch (err: any) {
      setError(`Error: ${err.message}`);
    }
  };

  // Agregar comentario a incidencia
  const addCommentToIncidencia = async (incidenciaId: string) => {
    if (!hasPermission('update_vehicle')) {
      setError('No tienes permisos para comentar incidencias');
      return;
    }
    if (!newComment.trim()) return;

    const updatedIncidencias = vehicleIncidencias.map(inc => {
      if (inc.id === incidenciaId) {
        const comentarios = inc.comentarios || [];
        return {
          ...inc,
          comentarios: [
            ...comentarios,
            {
              id: createLocalId(),
              usuario: currentUser?.username || 'Anónimo',
              texto: newComment,
              fecha: new Date().toLocaleDateString('es-ES')
            }
          ]
        };
      }
      return inc;
    });

    setVehicleIncidencias(updatedIncidencias);
    await saveVehicleSection('incidencias', { incidenciasState: updatedIncidencias });
    setNewComment('');
    setSelectedIncidenciaId(null);
    createAuditLog('ADD_COMMENT', `Comentario agregado a incidencia`);
  };

  // Guardar fecha de próxima ITV
  // const saveItvDate = async (vehicleId: string, date: string) => {
  //   if (!date) return;

  //   try {
  //     await updateDoc(doc(db, 'vehicles', vehicleId), { nextItvDate: date });
  //     await createAuditLog('UPDATE_ITV_DATE', `Próxima ITV actualizada a ${date}`);
  //   } catch (err: any) {
  //     setError(`Error: ${err.message}`);
  //   }
  // };

  // Calcular días hasta ITV
  // const getDaysToItv = (ilvDate: string | undefined) => {
  //   if (!ilvDate) return null;
  //   const today = new Date();
  //   const itv = new Date(ilvDate);
  //   const diff = itv.getTime() - today.getTime();
  //   const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  //   return days;
  // };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let createdAuthUser: any = null;
    let reusedExistingAuthUser = false;
    if (!registerForm.username || !registerForm.password || !registerForm.passwordConfirm) {
      setError('Completa todos los campos obligatorios');
      setLoading(false);
      return;
    }

    if (registerForm.password !== registerForm.passwordConfirm) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    // ========== VALIDACIÓN DE CONTRASEÑA MILITAR ==========
    const militaryPwdValidation = validateMilitaryPassword(registerForm.password);
    if (!militaryPwdValidation.valid) {
      setError(`Contrasena no cumple requisitos OTAN:\n${militaryPwdValidation.errors.join('\n')}`);
      setLoading(false);
      return;
    }

    // Verificar que no sea contraseña común
    if (isCommonPassword(registerForm.password)) {
      setError('Contrasena demasiado común. Use una contraseña más robusta.');
      setLoading(false);
      return;
    }

    const reqs = getPasswordRequirements(registerForm.password);
    if (!reqs.length || !reqs.uppercase || !reqs.lowercase || !reqs.number || !reqs.special) {
      setError('La contraseña debe cumplir todos los requisitos: 8+ caracteres, mayúscula, minúscula, número y carácter especial');
      setLoading(false);
      return;
    }

    // El código de acceso es obligatorio para todos
    if (!registerForm.accessCode) {
      setError('El código de acceso de la sección es obligatorio');
      setLoading(false);
      return;
    }

    try {
      // Buscar la sección por código de acceso (obligatorio)
      let sectionId = '';
      let companyId = '';
      const savedUsername = registerForm.username.trim();
      const savedPassword = registerForm.password;
      const emailCandidates = toAuthEmailCandidates(savedUsername);
      let email = emailCandidates[0];
      let authCredential: any = null;
      let lastAuthErr: any = null;

      for (const emailCandidate of emailCandidates) {
        email = emailCandidate;
        try {
          authCredential = await createUserWithEmailAndPassword(auth, emailCandidate, savedPassword);
          break;
        } catch (authErr: any) {
          lastAuthErr = authErr;
          if (authErr?.code === 'auth/email-already-in-use') {
            try {
              authCredential = await signInWithEmailAndPassword(auth, emailCandidate, savedPassword);
              reusedExistingAuthUser = true;
              break;
            } catch {
              // continuar con el siguiente candidato
            }
          }
        }

        if (authCredential) {
          break;
        }
      }

      if (!authCredential) {
        if (lastAuthErr?.code === 'auth/configuration-not-found') {
          setError('Servicio de autenticación no disponible. Contacta con el administrador.');
        } else if (lastAuthErr?.code === 'auth/email-already-in-use') {
          setError('El usuario ya existe o hay conflicto con un nombre similar. Prueba con otro nombre de usuario.');
        } else {
          setError('No se pudo registrar el usuario. Inténtalo de nuevo.');
        }
      }

      if (!authCredential) {
        setLoading(false);
        return;
      }

      const freshCredential = await signInWithEmailAndPassword(auth, email, savedPassword).catch(() => authCredential);
      const createdUid = freshCredential.user.uid;
      createdAuthUser = freshCredential.user;
      await waitForAuthSession(createdUid);
      await ensureAuthTokenReady(freshCredential.user);

      console.log('[handleRegister] Creando usuario con username:', savedUsername);
      console.log('[handleRegister] Role:', registerForm.role);
      console.log('[handleRegister] CompanyId:', registerForm.companyId);
      console.log('[handleRegister] SectionId:', registerForm.sectionId);

      await runWithAuthRetry(() => setDoc(doc(db, 'users', createdUid), {
        username: savedUsername,
        email,
        authUid: createdUid,
        companyId: null,
        sectionId: null,
        accessCode: registerForm.accessCode.trim(),
        role: registerForm.role,
        createdAt: new Date(),
        classification: MILITARY_ROLES[registerForm.role]?.classification || ClassificationLevel.RESTRICTED
      }), createdAuthUser);

      const sectionsQuery = query(collection(db, 'sections'), where('accessCode', '==', registerForm.accessCode.trim()));
      const sectionDocs = await runWithAuthRetry(() => getDocs(sectionsQuery), createdAuthUser);

      if (sectionDocs.empty) {
        if (!reusedExistingAuthUser) {
          await deleteAuthUser(authCredential.user).catch(() => undefined);
        }
        await signOutAuth(auth).catch(() => undefined);
        setError('Código de acceso no válido');
        setLoading(false);
        return;
      }

      sectionId = sectionDocs.docs[0].id;
      companyId = sectionDocs.docs[0].data().companyId;

      await runWithAuthRetry(() => updateDoc(doc(db, 'users', createdUid), {
        companyId,
        sectionId
      }), createdAuthUser);

      console.log('[handleRegister] Usuario creado exitosamente - Contrasena encriptada');

      // Registrar en auditoría (no bloquear alta si no hay permisos en este punto)
      try {
        await addDoc(collection(db, 'securityAuditLogs'), {
          timestamp: Date.now(),
          action: 'USER_CREATED',
          userId: createdUid,
          username: savedUsername,
          ip: 'local',
          userAgent: navigator.userAgent,
          classification: ClassificationLevel.CONFIDENTIAL,
          details: `Usuario ${savedUsername} registrado con rol ${registerForm.role}`,
          result: 'SUCCESS',
          duration: 0
        });
      } catch (logErr) {
        console.warn('[handleRegister] No se pudo guardar securityAuditLog:', logErr);
      }

      setRegisterForm({
        username: '',
        password: '',
        passwordConfirm: '',
        companyId: '',
        sectionId: '',
        accessCode: '',
        role: 'consulta'
      });
      setIsRegisterMode(false);
      setLoginUsername(savedUsername);
      setLoginPassword(savedPassword);
    } catch (err: any) {
      try {
        if (createdAuthUser && !reusedExistingAuthUser) {
          await deleteAuthUser(createdAuthUser).catch(() => undefined);
          await signOutAuth(auth).catch(() => undefined);
        }
      } catch {
        // no-op
      }

      console.error('[handleRegister] ERROR:', err);
      console.error('[handleRegister] Mensaje:', err.message);
      console.error('[handleRegister] Código:', err.code);
      setError(`Error: ${err.message || err.code || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!guardPermission('create_company', 'Solo super_admin puede crear compañías')) {
      setLoading(false);
      return;
    }

    const companyName = newCompanyForm.companyName.trim();
    const managerUsername = newCompanyForm.managerUsername.trim();
    const managerPassword = newCompanyForm.managerPassword;

    if (!companyName || !managerUsername || !managerPassword) {
      setError('Completa todos los campos');
      setLoading(false);
      return;
    }

    if (managerPassword !== newCompanyForm.managerPasswordConfirm) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    const passwordValidation = validatePassword(managerPassword);
    if (!passwordValidation.isValid) {
      setError('Contrasena no válida: ' + passwordValidation.errors.join(', '));
      setLoading(false);
      return;
    }

    try {
      const companiesRef = collection(db, 'companies');
      const q = query(companiesRef, where('name', '==', companyName));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setError('La compañía ya existe');
        setLoading(false);
        return;
      }

      const usersRef = collection(db, 'users');
      const q2 = query(usersRef, where('username', '==', managerUsername));
      const snapshot2 = await getDocs(q2);

      if (!snapshot2.empty) {
        setError('El usuario ya existe');
        setLoading(false);
        return;
      }

      // Crear compañía
      const companyRef = await addDoc(companiesRef, {
        name: companyName,
        createdAt: new Date()
      });

      // Crear usuario encargado
      const managerEmailCandidates = toAuthEmailCandidates(managerUsername);
      let managerEmail = managerEmailCandidates[0];
      let managerUid = '';

      for (const emailCandidate of managerEmailCandidates) {
        try {
          managerEmail = emailCandidate;
          managerUid = await createAuthUserWithoutSwitchingSession(emailCandidate, managerPassword);
          break;
        } catch (authErr: any) {
          if (authErr?.code !== 'auth/email-already-in-use') {
            throw authErr;
          }
        }
      }

      if (!managerUid) {
        throw new Error('El usuario ya existe o hay conflicto con un nombre similar. Usa otro nombre de usuario.');
      }
      await setDoc(doc(db, 'users', managerUid), {
        username: managerUsername,
        email: managerEmail,
        authUid: managerUid,
        companyId: companyRef.id,
        role: 'encargado_cia',
        createdAt: new Date(),
        classification: MILITARY_ROLES['encargado_cia']?.classification || ClassificationLevel.RESTRICTED
      });

      // Limpiar formulario ANTES de cambiar vista
      setNewCompanyForm({ 
        companyName: '', 
        managerUsername: '', 
        managerPassword: '', 
        managerPasswordConfirm: '',
        userRole: 'operador',
        sectionId: '',
        companyId: ''
      });
      setError('');
      
      // ENTRAR AUTOMÁTICAMENTE A LA COMPAÑÍA CREADA
      setSelectedCompanyId(companyRef.id);
      setView('company-detail');
    } catch (err: any) {
      console.error('Error creando compañía:', err);
      setError(`Error al crear compañía: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCompanyName = async (companyId: string, newName: string) => {
    if (!guardPermission('edit_company', 'No tienes permisos para editar compañías')) return;
    if (!newName.trim()) {
      setError('El nombre no puede estar vacío');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verificar que no exista otra compañía con ese nombre
      const companiesRef = collection(db, 'companies');
      const q = query(companiesRef, where('name', '==', newName));
      const snapshot = await getDocs(q);

      // Si existe otra compañía con ese nombre (diferente ID), mostrar error
      if (!snapshot.empty && snapshot.docs[0].id !== companyId) {
        setError('Ya existe una compañía con ese nombre');
        setLoading(false);
        return;
      }

      // Actualizar nombre en la compañía
      await updateDoc(doc(db, 'companies', companyId), {
        name: newName
      });

      // Limpiar estados de edición
      setEditingCompanyId(null);
      setEditCompanyName('');
      setError('');
    } catch (err: any) {
      console.error('Error editando compañía:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSectionName = async (sectionId: string, newName: string) => {
    if (!guardPermission('edit_section', 'No tienes permisos para editar secciones')) return;
    if (!newName.trim()) {
      setError('El nombre no puede estar vacío');
      return;
    }

    if (!selectedCompanyId) {
      setError('No se encontró la compañía seleccionada');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verificar que no exista otra sección con ese nombre en la misma compañía
      const sectionsRef = collection(db, 'sections');
      const q = query(
        sectionsRef,
        where('name', '==', newName),
        where('companyId', '==', selectedCompanyId)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty && snapshot.docs[0].id !== sectionId) {
        setError('Ya existe una sección con ese nombre en esta compañía');
        setLoading(false);
        return;
      }

      // Actualizar nombre
      await updateDoc(doc(db, 'sections', sectionId), {
        name: newName
      });

      setEditingSectionId(null);
      setEditSectionName('');
      setError('');
    } catch (err: any) {
      console.error('Error editando sección:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUnitName = async (unitId: string, newName: string) => {
    if (!guardPermission('manage_units', 'No tienes permisos para editar unidades')) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError('El nombre no puede estar vacío');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const unitsRef = collection(db, 'units');
      const q = query(unitsRef, where('name', '==', trimmedName));
      const snapshot = await getDocs(q);

      if (!snapshot.empty && snapshot.docs[0].id !== unitId) {
        setError('Ya existe una unidad con ese nombre');
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, 'units', unitId), { name: trimmedName });
      setEditingUnitId(null);
      setEditUnitName('');
      setError('');
    } catch (err: any) {
      console.error('Error editando unidad:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentUser) return;
    setSettingsMessage('');
    setError('');

    if (!settingsCurrentPassword || !settingsNewPassword || !settingsConfirmPassword) {
      setSettingsMessage('Completa todos los campos');
      return;
    }

    if (settingsNewPassword !== settingsConfirmPassword) {
      setSettingsMessage('Las contraseñas no coinciden');
      return;
    }

    const militaryPwdValidation = validateMilitaryPassword(settingsNewPassword);
    if (!militaryPwdValidation.valid) {
      setSettingsMessage(`Contrasena no cumple requisitos OTAN: ${militaryPwdValidation.errors.join(', ')}`);
      return;
    }

    if (isCommonPassword(settingsNewPassword)) {
      setSettingsMessage('Contrasena demasiado común. Use una contraseña más robusta.');
      return;
    }

    setLoading(true);
    try {
      if (!auth.currentUser || !currentUser.email) {
        setSettingsMessage('Sesión de autenticación inválida. Vuelve a iniciar sesión.');
        setLoading(false);
        return;
      }

      // La contraseña actual se valida directamente contra Firebase Auth
      // (única fuente de verdad), en vez de comparar contra una copia
      // guardada en Firestore.
      try {
        const credential = EmailAuthProvider.credential(currentUser.email, settingsCurrentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      } catch {
        setSettingsMessage('Contrasena actual incorrecta');
        setLoading(false);
        return;
      }

      await updatePassword(auth.currentUser, settingsNewPassword);

      setSettingsCurrentPassword('');
      setSettingsNewPassword('');
      setSettingsConfirmPassword('');
      setSettingsMessage('Contrasena actualizada');
    } catch (err: any) {
      console.error('Error actualizando contraseña:', err);
      setSettingsMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!guardPermission('create_section', 'No tienes permisos para crear secciones')) {
      setLoading(false);
      return;
    }

    if (!newSectionForm.sectionName || !selectedCompanyId) {
      setError('Completa los campos');
      setLoading(false);
      return;
    }

    try {
      const sectionsRef = collection(db, 'sections');
      const accessCode = generateAccessCode();

      const sectionRef = await addDoc(sectionsRef, {
        name: newSectionForm.sectionName,
        companyId: selectedCompanyId,
        accessCode: accessCode,
        createdAt: new Date()
      });

      setNewSectionForm({ sectionName: '' });
      setError('');
      await createAuditLog('CREATE_SECTION', `Sección "${newSectionForm.sectionName}" creada`);
      // ENTRAR AUTOMÁTICAMENTE A LA SECCIÓN CREADA
      setShowNewSectionForm(false);
      setSelectedSectionId(sectionRef.id);
      setView('section-detail');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!guardPermission('create_vehicle', 'No tienes permisos para crear vehículos')) {
      setLoading(false);
      return;
    }

    if (!newVehicleForm.plate || !newVehicleForm.brand || !newVehicleForm.model || !selectedSectionId) {
      setError('Completa todos los campos');
      setLoading(false);
      return;
    }

    try {
      const vehiclesRef = collection(db, 'vehicles');
      await addDoc(vehiclesRef, {
        plate: newVehicleForm.plate,
        brand: newVehicleForm.brand,
        model: newVehicleForm.model,
        vehicleType: newVehicleForm.vehicleType || 'bn1',
        sectionId: selectedSectionId,
        status: newVehicleForm.status,
        avisosState: [],
        createdAt: new Date()
      });

      setNewVehicleForm({ plate: '', brand: '', model: '', vehicleType: 'bn1', status: 'OPERATIVO' });
      setError('');
      await createAuditLog('CREATE_VEHICLE', `Vehículo ${newVehicleForm.plate} creado`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateVehicleStatus = async (vehicleId: string, newStatus: VehicleStatus) => {
    if (!guardPermission('update_vehicle', 'No tienes permisos para actualizar vehículos')) return;
    setError('');
    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      await updateDoc(doc(db, 'vehicles', vehicleId), { 
        status: newStatus,
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      });
      await createAuditLog('UPDATE_STATUS', `Estado de ${vehicle?.plate} cambió a ${newStatus}`);
    } catch (err: any) {
      console.error('Error actualizando estado de vehículo:', err);
      setError(`Error: ${err.message}`);
    }
  };

  const updateVehicleType = async (vehicleId: string, newType: string): Promise<boolean> => {
    if (!guardPermission('update_vehicle', 'No tienes permisos para actualizar vehículos')) return false;
    setError('');
    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      await updateDoc(doc(db, 'vehicles', vehicleId), { 
        vehicleType: newType,
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      });
      await createAuditLog('UPDATE_VEHICLE_TYPE', `Tipo de vehículo ${vehicle?.plate} cambió a ${newType}`);
      setVehicleSnapshot(prev => prev ? { ...prev, type: newType } : prev);
      showVehicleSaveFeedback('✅ Tipo de vehiculo actualizado');
      return true;
    } catch (err: any) {
      console.error('Error actualizando tipo de vehículo:', err);
      setError(`Error: ${err.message}`);
      return false;
    }
  };

  const updateVehicleInfo = async (vehicleId: string, plate: string, brand: string, model: string): Promise<boolean> => {
    if (!guardPermission('update_vehicle', 'No tienes permisos para actualizar vehículos')) return false;
    setError('');
    try {
      await updateDoc(doc(db, 'vehicles', vehicleId), { 
        plate,
        brand,
        model,
        lastModifiedBy: currentUser?.username || 'Sistema',
        lastModifiedAt: new Date()
      });
      await createAuditLog('UPDATE_VEHICLE_INFO', `Información de vehículo actualizada`);
      setVehicleSnapshot(prev => prev ? { ...prev, info: { plate, brand, model } } : prev);
      showVehicleSaveFeedback('✅ Informacion del vehiculo actualizada');
      return true;
    } catch (err: any) {
      console.error('Error actualizando información del vehículo:', err);
      setError(`Error: ${err.message}`);
      return false;
    }
  };

  const deleteVehicle = async (vehicleId: string) => {
    if (!guardPermission('delete_vehicle', 'No tienes permisos para eliminar vehículos')) return;
    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      const vehicleLabel = vehicle?.plate || 'este vehículo';
      if (!window.confirm(`¿Eliminar ${vehicleLabel}? Esta acción no se puede deshacer.`)) return;

      setError('');
      await deleteDoc(doc(db, 'vehicles', vehicleId));
      await createAuditLog('DELETE_VEHICLE', `Vehículo ${vehicle?.plate} eliminado`);
    } catch (err: any) {
      console.error('Error eliminando vehículo:', err);
      setError(`Error al eliminar: ${err.message}`);
    }
  };

  const handleCreateVehicleTransfer = async () => {
    if (!currentUser || !canTransferVehicles) {
      setError('No tienes permisos para traspasar vehículos.');
      return;
    }

    const sourceSectionId = effectiveSectionIdForAvisos;
    const destinationCode = transferDestinationCode.trim();

    if (!sourceSectionId) {
      setError('No se pudo identificar la sección de origen.');
      return;
    }

    if (!transferVehicleId) {
      setError('Selecciona un vehículo para traspasar.');
      return;
    }

    if (!/^\d{10}$/.test(destinationCode)) {
      setError('El código de sección debe tener 10 dígitos.');
      return;
    }

    setTransferLoading(true);
    setTransferMessage('');
    setError('');

    try {
      const sourceVehicle = vehicles.find((item) => item.id === transferVehicleId);
      if (!sourceVehicle) {
        throw new Error('No se encontró el vehículo seleccionado.');
      }

      const sourceSection = sections.find((section) => section.id === sourceSectionId)
        || allSections.find((section) => section.id === sourceSectionId);
      if (!sourceSection) {
        throw new Error('No se encontró la sección de origen.');
      }

      const destinationSectionQuery = query(collection(db, 'sections'), where('accessCode', '==', destinationCode), limit(2));
      const destinationSectionSnapshot = await getDocs(destinationSectionQuery);

      if (destinationSectionSnapshot.empty) {
        throw new Error('No existe ninguna sección con ese código.');
      }

      const destinationSectionData = destinationSectionSnapshot.docs[0].data() as Section;
      const destinationSectionId = destinationSectionSnapshot.docs[0].id;

      if (destinationSectionId === sourceSectionId) {
        throw new Error('No puedes traspasar un vehículo a la misma sección.');
      }

      const transferRef = doc(db, 'vehicleTransfers', sourceVehicle.id);
      const existingTransferSnapshot = await getDoc(transferRef);
      if (existingTransferSnapshot.exists()) {
        const existingTransfer = existingTransferSnapshot.data() as any;
        const existingStatus = existingTransfer?.status || 'pending_confirmation';
        if (existingStatus !== 'completed' && existingStatus !== 'cancelled') {
          throw new Error('Este vehículo ya tiene un traspaso pendiente de confirmación.');
        }
      }

      // Se crea una copia en origen y luego se mueve a destino para respetar reglas por sección.
      const copyRef = await addDoc(collection(db, 'vehicles'), {
        plate: sourceVehicle.plate,
        brand: sourceVehicle.brand,
        model: sourceVehicle.model,
        vehicleType: sourceVehicle.vehicleType || 'bn1',
        sectionId: sourceSectionId,
        status: sourceVehicle.status,
        isArchived: Boolean(sourceVehicle.isArchived),
        nextItvDate: sourceVehicle.nextItvDate || null,
        siglePdfName: sourceVehicle.siglePdfName || null,
        siglePdfSize: sourceVehicle.siglePdfSize || null,
        siglePdfUploadDate: sourceVehicle.siglePdfUploadDate || null,
        siglePdfBase64: sourceVehicle.siglePdfBase64 || null,
        documentationState: sourceVehicle.documentationState ? deepClone(sourceVehicle.documentationState) : getDefaultVehicleDocumentation(),
        nivelesState: sourceVehicle.nivelesState ? deepClone(sourceVehicle.nivelesState) : getDefaultVehicleNiveles(),
        materialsState: sourceVehicle.materialsState ? deepClone(sourceVehicle.materialsState) : getDefaultVehicleMaterials(),
        movementsState: sourceVehicle.movementsState ? deepClone(sourceVehicle.movementsState) : getDefaultVehicleMovements(),
        incidenciasState: sourceVehicle.incidenciasState ? deepClone(sourceVehicle.incidenciasState) : getDefaultVehicleIncidencias(),
        avisosState: sourceVehicle.avisosState ? deepClone(sourceVehicle.avisosState) : getDefaultVehicleAvisos(),
        parteRelevoDraft: sourceVehicle.parteRelevoDraft ? deepClone(sourceVehicle.parteRelevoDraft) : null,
        transferSourceVehicleId: sourceVehicle.id,
        transferCopyPending: true,
        sectionControlKm: sourceVehicle.sectionControlKm ?? null,
        sectionControlHours: sourceVehicle.sectionControlHours ?? null,
        lastModifiedBy: currentUser.username,
        lastModifiedAt: new Date(),
        createdAt: new Date()
      });

      await updateDoc(copyRef, {
        sectionId: destinationSectionId,
        lastModifiedBy: currentUser.username,
        lastModifiedAt: new Date()
      });

      await setDoc(transferRef, {
        sourceVehicleId: sourceVehicle.id,
        sourceVehiclePlate: sourceVehicle.plate,
        sourceSectionId,
        sourceSectionName: sourceSection.name,
        sourceSectionCode: sourceSection.accessCode,
        sourceCompanyId: sourceSection.companyId || null,
        destinationSectionId,
        destinationSectionName: destinationSectionData.name,
        destinationSectionCode: destinationSectionData.accessCode,
        destinationCompanyId: destinationSectionData.companyId || null,
        copiedVehicleId: copyRef.id,
        participantSectionIds: [sourceSectionId, destinationSectionId],
        sourceConfirmed: false,
        destinationConfirmed: false,
        status: 'pending_confirmation',
        createdBy: currentUser.username,
        createdByRole: currentUser.role,
        createdAt: new Date()
      });

      await createAuditLog('TRANSFER_VEHICLE_CREATE', `Traspaso creado para ${sourceVehicle.plate} de ${sourceSection.name} a ${destinationSectionData.name}`);

      setTransferVehicleId('');
      setTransferDestinationCode('');
      setTransferMessage('✅ Traspaso creado. El vehículo ya está copiado en destino y pendiente de doble confirmación.');
    } catch (err: any) {
      setError(`Error al traspasar vehículo: ${err?.message || 'desconocido'}`);
    } finally {
      setTransferLoading(false);
    }
  };

  const confirmVehicleTransfer = async (transfer: VehicleTransfer) => {
    if (!currentUser) return;

    const isSuperAdmin = currentUser.role === 'super_admin';
    const isSourceSectionUser = currentUser.sectionId && currentUser.sectionId === transfer.sourceSectionId;
    const isDestinationSectionUser = currentUser.sectionId && currentUser.sectionId === transfer.destinationSectionId;

    if (!isSuperAdmin && !isSourceSectionUser && !isDestinationSectionUser) {
      setError('No puedes confirmar este traspaso.');
      return;
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
      updatedBy: currentUser.username
    };

    let changed = false;

    if ((isSuperAdmin || isSourceSectionUser) && !transfer.sourceConfirmed) {
      updates.sourceConfirmed = true;
      updates.sourceConfirmedBy = currentUser.username;
      updates.sourceConfirmedAt = new Date();
      changed = true;
    }

    if ((isSuperAdmin || isDestinationSectionUser) && !transfer.destinationConfirmed) {
      updates.destinationConfirmed = true;
      updates.destinationConfirmedBy = currentUser.username;
      updates.destinationConfirmedAt = new Date();
      changed = true;
    }

    if (!changed) {
      setTransferMessage('Este traspaso ya estaba confirmado por tu lado.');
      return;
    }

    setConfirmingTransferId(transfer.id);
    setTransferMessage('');
    setError('');

    try {
      const transferRef = doc(db, 'vehicleTransfers', transfer.id);
      await updateDoc(transferRef, updates);

      const sourceConfirmedAfter = transfer.sourceConfirmed || Boolean(updates.sourceConfirmed);
      const destinationConfirmedAfter = transfer.destinationConfirmed || Boolean(updates.destinationConfirmed);

      if (sourceConfirmedAfter && destinationConfirmedAfter && transfer.status !== 'completed') {
        try {
          await deleteDoc(doc(db, 'vehicles', transfer.sourceVehicleId));
        } catch (deleteErr: any) {
          if (deleteErr?.code !== 'not-found') {
            throw deleteErr;
          }
        }

        await updateDoc(transferRef, {
          status: 'completed',
          completedAt: new Date(),
          completedBy: currentUser.username,
          updatedAt: new Date(),
          updatedBy: currentUser.username
        });

        await createAuditLog('TRANSFER_VEHICLE_COMPLETE', `Traspaso completado de ${transfer.sourceVehiclePlate}. Vehículo origen eliminado.`);
        setTransferMessage('✅ Confirmación completada por ambas secciones. El vehículo origen fue eliminado.');
      } else {
        await createAuditLog('TRANSFER_VEHICLE_CONFIRM', `Confirmación de traspaso para ${transfer.sourceVehiclePlate} por ${currentUser.username}`);
        setTransferMessage('✅ Confirmación registrada. Falta la confirmación de la otra sección.');
      }
    } catch (err: any) {
      setError(`Error al confirmar traspaso: ${err?.message || 'desconocido'}`);
    } finally {
      setConfirmingTransferId(null);
    }
  };

  const cancelVehicleTransfer = async (transfer: VehicleTransfer) => {
    if (!currentUser) return;

    if (transfer.status !== 'pending_confirmation') {
      setTransferMessage('Solo se pueden cancelar traspasos pendientes.');
      return;
    }

    const confirmed = window.confirm(`¿Cancelar el traspaso pendiente del vehículo ${transfer.sourceVehiclePlate}?`);
    if (!confirmed) return;

    setError('');
    setTransferMessage('');
    try {
      if (transfer.copiedVehicleId) {
        try {
          await deleteDoc(doc(db, 'vehicles', transfer.copiedVehicleId));
        } catch (deleteErr: any) {
          if (deleteErr?.code !== 'not-found') {
            throw deleteErr;
          }
        }
      }

      await updateDoc(doc(db, 'vehicleTransfers', transfer.id), {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: currentUser.username,
        destinationCopyDeletedAt: new Date(),
        destinationCopyDeletedBy: currentUser.username,
        updatedAt: new Date(),
        updatedBy: currentUser.username
      });
      await createAuditLog('TRANSFER_VEHICLE_CANCEL', `Traspaso cancelado para ${transfer.sourceVehiclePlate} por ${currentUser.username}`);
      setTransferMessage('✅ Traspaso cancelado y conservado en historial.');
    } catch (err: any) {
      setError(`Error al cancelar traspaso: ${err?.message || 'desconocido'}`);
    }
  };

  const renderVehicleTransferPanel = () => {
    if (!currentUser || !canTransferVehicles) return null;

    const sectionVehicles = vehicles.filter((item) => item.sectionId === effectiveSectionIdForAvisos && !item.isArchived);

    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-4 transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-200 dark:border-slate-700 pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">🔁 Traspaso de vehículo por código</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Gestiona traspasos sin ocupar la vista principal de sección.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTransferPanelTab('nuevo')}
              className={`px-4 py-2 rounded-lg font-bold ${transferPanelTab === 'nuevo' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
            >
              Nuevo traspaso
            </button>
            <button
              type="button"
              onClick={() => setTransferPanelTab('historial')}
              className={`px-4 py-2 rounded-lg font-bold ${transferPanelTab === 'historial' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
            >
              Historial
            </button>
          </div>
        </div>

        {transferPanelTab === 'nuevo' && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={transferVehicleId}
              onChange={(e) => setTransferVehicleId(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Selecciona un vehículo</option>
              {sectionVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} - {vehicle.brand} {vehicle.model}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={transferDestinationCode}
              onChange={(e) => setTransferDestinationCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Código destino (10 dígitos)"
              className="px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <button
              type="button"
              onClick={() => { void handleCreateVehicleTransfer(); }}
              disabled={transferLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-bold"
            >
              {transferLoading ? 'Traspasando...' : 'Crear traspaso'}
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Pendientes de confirmación ({pendingTransfersForSection.length})</h3>
            {pendingTransfersForSection.length === 0 ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg text-sm">
                No hay traspasos pendientes para tu sección.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTransfersForSection.slice(0, 8).map((transfer) => {
                  const isSourceSide = currentUser.sectionId === transfer.sourceSectionId;
                  const isDestinationSide = currentUser.sectionId === transfer.destinationSectionId;
                  const sideLabel = isSourceSide ? 'Origen' : isDestinationSide ? 'Destino' : 'Seguimiento';

                  return (
                    <div key={transfer.id} className="border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-gray-50 dark:bg-slate-900/40">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{transfer.sourceVehiclePlate} · {sideLabel}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {transfer.sourceSectionName} ({transfer.sourceSectionCode}) → {transfer.destinationSectionName} ({transfer.destinationSectionCode})
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Origen: {transfer.sourceConfirmed ? '✅' : '⏳'} · Destino: {transfer.destinationConfirmed ? '✅' : '⏳'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { void cancelVehicleTransfer(transfer); }}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-xs font-bold"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => { void confirmVehicleTransfer(transfer); }}
                            disabled={confirmingTransferId === transfer.id || transfer.status === 'completed'}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-bold"
                          >
                            {confirmingTransferId === transfer.id ? 'Confirmando...' : 'Confirmar revisión'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>
        )}

        {transferMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-lg text-sm font-semibold">
            {transferMessage}
          </div>
        )}

        {transferPanelTab === 'historial' && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Historial enviado/recibido ({transferHistoryForSection.length})</h3>
            {transferHistoryForSection.length === 0 ? (
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-3 rounded-lg text-sm">
                Todavía no hay traspasos registrados para tu sección.
              </div>
            ) : (
              <div className="space-y-2">
                {transferHistoryForSection.slice(0, 20).map((transfer) => {
                  const isSourceSide = currentUser.sectionId === transfer.sourceSectionId;
                  const isDestinationSide = currentUser.sectionId === transfer.destinationSectionId;
                  const directionLabel = isSourceSide ? 'Enviado' : isDestinationSide ? 'Recibido' : 'Intersección';
                  const statusLabel = transfer.status === 'completed' ? 'Completado' : transfer.status === 'cancelled' ? 'Cancelado' : 'Pendiente';

                  return (
                    <div key={`hist-${transfer.id}`} className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/40">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{transfer.sourceVehiclePlate} · {directionLabel}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${transfer.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : transfer.status === 'cancelled' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                            {statusLabel}
                          </span>
                          {transfer.status === 'pending_confirmation' && (
                            <button
                              type="button"
                              onClick={() => { void cancelVehicleTransfer(transfer); }}
                              className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {transfer.sourceSectionName} ({transfer.sourceSectionCode}) → {transfer.destinationSectionName} ({transfer.destinationSectionCode})
                      </p>

                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <p>Traspasado por: <strong>{transfer.createdBy}</strong> · {transfer.createdAt ? transfer.createdAt.toLocaleString('es-ES') : 'Sin fecha'}</p>
                        <p>Usuario destino: <strong>{transfer.destinationConfirmedBy || 'Pendiente de confirmación'}</strong></p>
                        <p>
                          Confirmación origen: {transfer.sourceConfirmed ? `✅ ${transfer.sourceConfirmedBy || 'confirmado'} (${transfer.sourceConfirmedAt ? transfer.sourceConfirmedAt.toLocaleString('es-ES') : 'sin fecha'})` : '⏳ pendiente'}
                        </p>
                        <p>
                          Confirmación destino: {transfer.destinationConfirmed ? `✅ ${transfer.destinationConfirmedBy || 'confirmado'} (${transfer.destinationConfirmedAt ? transfer.destinationConfirmedAt.toLocaleString('es-ES') : 'sin fecha'})` : '⏳ pendiente'}
                        </p>
                        {transfer.completedAt && (
                          <p>Completado por: <strong>{transfer.completedBy || 'sistema'}</strong> · {transfer.completedAt.toLocaleString('es-ES')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const deleteSection = async (sectionId: string) => {
    if (!guardPermission('delete_section', 'No tienes permisos para eliminar secciones')) return;
    const sectionName = sections.find(s => s.id === sectionId)?.name || 'esta sección';
    if (!window.confirm(`¿Eliminar la sección "${sectionName}" y todos sus vehículos? Esta acción no se puede deshacer.`)) {
      console.log('[deleteSection] Usuario canceló la operación');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      console.log('[deleteSection] Iniciando eliminación de sección:', sectionId);
      
      // Paso 1: Obtener y eliminar vehículos
      console.log('[deleteSection] Buscando vehículos...');
      const vehiclesRef = collection(db, 'vehicles');
      const vehiclesQuery = query(vehiclesRef, where('sectionId', '==', sectionId));
      const vehiclesSnapshot = await getDocs(vehiclesQuery);
      console.log(`[deleteSection] Encontrados ${vehiclesSnapshot.docs.length} vehículos`);
      
      for (const vehicleDoc of vehiclesSnapshot.docs) {
        console.log('[deleteSection] Eliminando vehículo:', vehicleDoc.id);
        await deleteDoc(vehicleDoc.ref);
      }
      
      // Paso 2: Obtener y eliminar usuarios
      console.log('[deleteSection] Buscando usuarios...');
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('sectionId', '==', sectionId));
      const usersSnapshot = await getDocs(usersQuery);
      console.log(`[deleteSection] Encontrados ${usersSnapshot.docs.length} usuarios`);
      
      for (const userDoc of usersSnapshot.docs) {
        console.log('[deleteSection] Eliminando usuario:', userDoc.id);
        await deleteDoc(userDoc.ref);
      }
      
      // Paso 3: Eliminar la sección
      console.log('[deleteSection] Eliminando sección:', sectionId);
      await deleteDoc(doc(db, 'sections', sectionId));
      
      console.log('[deleteSection] Sección eliminada exitosamente');
      setError('');
      setSelectedSectionId(null);
      setLoading(false);
    } catch (err: any) {
      console.error('[deleteSection] ERROR:', err);
      console.error('[deleteSection] Mensaje:', err.message);
      console.error('[deleteSection] Código:', err.code);
      
      let errorMsg = `Error al eliminar: ${err.message || err.code}`;
      if (err.code === 'permission-denied') {
        errorMsg = '❌ Permisos denegados. Necesitas aplicar las reglas de Firestore. Ver FIRESTORE_SETUP.md';
      }
      setError(errorMsg);
      setLoading(false);
    }
  };

  const deleteCompany = async (companyId: string) => {
    if (!guardPermission('delete_company', 'No tienes permisos para eliminar compañías')) return;
    const companyName = companies.find(c => c.id === companyId)?.name || 'esta compañía';
    if (!window.confirm(`¿Eliminar la compañía "${companyName}" y todos sus datos? Esta acción no se puede deshacer.`)) {
      console.log('[deleteCompany] Usuario canceló la operación');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('[deleteCompany] Iniciando eliminación de compañía:', companyId);
      
      // Paso 1: Obtener todas las secciones
      console.log('[deleteCompany] Buscando secciones...');
      const sectionsRef = collection(db, 'sections');
      const sectionsQuery = query(sectionsRef, where('companyId', '==', companyId));
      const sectionsSnapshot = await getDocs(sectionsQuery);
      console.log(`[deleteCompany] Encontradas ${sectionsSnapshot.docs.length} secciones`);

      // Paso 2: Para cada sección, eliminar vehículos y la sección
      for (const sectionDoc of sectionsSnapshot.docs) {
        console.log('[deleteCompany] Procesando sección:', sectionDoc.id);
        const vehiclesRef = collection(db, 'vehicles');
        const vehiclesQuery = query(vehiclesRef, where('sectionId', '==', sectionDoc.id));
        const vehiclesSnapshot = await getDocs(vehiclesQuery);
        console.log(`[deleteCompany] Sección ${sectionDoc.id} tiene ${vehiclesSnapshot.docs.length} vehículos`);
        
        for (const vehicleDoc of vehiclesSnapshot.docs) {
          console.log('[deleteCompany] Eliminando vehículo:', vehicleDoc.id);
          await deleteDoc(vehicleDoc.ref);
        }
        
        console.log('[deleteCompany] Eliminando sección:', sectionDoc.id);
        await deleteDoc(sectionDoc.ref);
      }

      // Paso 3: Eliminar usuarios
      console.log('[deleteCompany] Buscando usuarios...');
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('companyId', '==', companyId));
      const usersSnapshot = await getDocs(usersQuery);
      console.log(`[deleteCompany] Encontrados ${usersSnapshot.docs.length} usuarios`);
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        if (userData.role !== 'super_admin') {
          console.log('[deleteCompany] Eliminando usuario:', userDoc.id);
          await deleteDoc(userDoc.ref);
        } else {
          console.log('[deleteCompany] Saltando super_admin:', userDoc.id);
        }
      }

      // Paso 4: Eliminar la compañía
      console.log('[deleteCompany] Eliminando compañía:', companyId);
      await deleteDoc(doc(db, 'companies', companyId));
      
      console.log('[deleteCompany] Compania eliminada exitosamente');
      setError('');
      setSelectedCompanyId(null);
      setView('dashboard');
      setLoading(false);
    } catch (err: any) {
      console.error('[deleteCompany] ERROR:', err);
      console.error('[deleteCompany] Mensaje:', err.message);
      console.error('[deleteCompany] Código:', err.code);
      
      let errorMsg = `Error al eliminar: ${err.message || err.code}`;
      if (err.code === 'permission-denied') {
        errorMsg = '❌ Permisos denegados. Necesitas aplicar las reglas de Firestore. Ver FIRESTORE_SETUP.md';
      }
      setError(errorMsg);
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!guardPermission('delete_user', 'No tienes permisos para eliminar usuarios')) return;
    if (!window.confirm(`¿Eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) return;

    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.role === 'super_admin' && currentUser?.role !== 'super_admin') {
      setError('No puedes eliminar un usuario super_admin');
      return;
    }

    if (currentUser?.role === 'encargado_cia') {
      if (targetUser?.companyId !== currentUser.companyId) {
        setError('Solo puedes eliminar usuarios de tu compañía');
        return;
      }
      if (targetUser?.role === 'encargado_cia') {
        setError('No puedes eliminar otro encargado de compañía');
        return;
      }
    }
    
    setError('');
    setLoading(true);
    try {
      console.log('[deleteUser] Eliminando usuario:', userId, username);
      await deleteDoc(doc(db, 'users', userId));
      console.log('[deleteUser] Usuario eliminado exitosamente');
      setLoading(false);
    } catch (err: any) {
      console.error('[deleteUser] ERROR:', err);
      console.error('[deleteUser] Código:', err.code);
      console.error('[deleteUser] Mensaje:', err.message);
      
      let errorMsg = `Error al eliminar usuario: ${err.message}`;
      if (err.code === 'permission-denied') {
        errorMsg = '❌ Permisos denegados. Comprueba las reglas de Firestore. Solo super_admin puede eliminar usuarios.';
      }
      setError(errorMsg);
      setLoading(false);
    }
  };

  // Función de edición de usuario eliminada temporalmente por no utilizarse


  const handleCreateS4User = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser?.role !== 'super_admin') {
      setError('Solo super_admin puede crear usuarios S4');
      return;
    }

    if (!guardPermission('create_user', 'No tienes permisos para crear usuarios S4')) return;

    const username = newS4Form.username.trim();
    const password = newS4Form.password;
    const passwordConfirm = newS4Form.passwordConfirm;
    const unitId = newS4Form.unitId.trim();

    if (!username || !password || !passwordConfirm || !unitId) {
      setError('Completa todos los campos para crear el usuario S4');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError('Contraseña no válida: ' + passwordValidation.errors.join(', '));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const usersQuery = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const usersSnapshot = await getDocs(usersQuery);
      if (!usersSnapshot.empty) {
        setError('Ese nombre de usuario ya existe');
        setLoading(false);
        return;
      }

      const selectedUnit = units.find((unit) => unit.id === unitId);
      if (!selectedUnit) {
        setError('La unidad seleccionada no es valida');
        setLoading(false);
        return;
      }

      const companyIdsInUnit = unitCompanies[unitId] || [];
      const companyId = companyIdsInUnit.length === 1 ? companyIdsInUnit[0] : null;

      const candidates = toAuthEmailCandidates(username);
      let createdUid: string | null = null;
      let createdEmail = candidates[0];
      let lastError: any = null;

      for (const candidate of candidates) {
        try {
          createdUid = await createAuthUserWithoutSwitchingSession(candidate, password);
          createdEmail = candidate;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!createdUid && lastError) {
        throw lastError;
      }

      if (!createdUid) {
        throw new Error('No se pudo crear el usuario en Authentication');
      }

      await setDoc(doc(db, 'users', createdUid), {
        username,
        email: createdEmail,
        authUid: createdUid,
        role: 's4',
        unitId,
        companyId,
        sectionId: null,
        createdBy: currentUser.id,
        createdAt: serverTimestamp(),
        classification: MILITARY_ROLES.s4.classification
      });

      await createAuditLog('CREATE_USER_S4', 'Usuario S4 creado: ' + username);

      setNewS4Form({
        username: '',
        password: '',
        passwordConfirm: '',
        unitId: ''
      });
      setError('');
      alert('Usuario S4 "' + username + '" creado correctamente');
    } catch (err: any) {
      setError('Error al crear usuario S4: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEncVehUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser?.role !== 'super_admin') {
      setError('Solo super_admin puede crear usuarios Encargado de Vehículos');
      return;
    }

    if (!guardPermission('create_user', 'No tienes permisos para crear usuarios')) return;

    const username = newEncVehForm.username.trim();
    const password = newEncVehForm.password;
    const passwordConfirm = newEncVehForm.passwordConfirm;
    const companyId = newEncVehForm.companyId.trim();

    if (!username || !password || !passwordConfirm || !companyId) {
      setError('Completa todos los campos para crear el Encargado de Vehículos');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError('Contraseña no válida: ' + passwordValidation.errors.join(', '));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const usersQuery = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const usersSnapshot = await getDocs(usersQuery);
      if (!usersSnapshot.empty) {
        setError('Ese nombre de usuario ya existe');
        setLoading(false);
        return;
      }

      const selectedCompany = companies.find((c) => c.id === companyId);
      if (!selectedCompany) {
        setError('La compañía seleccionada no es válida');
        setLoading(false);
        return;
      }

      const candidates = toAuthEmailCandidates(username);
      let createdUid: string | null = null;
      let createdEmail = candidates[0];
      let lastError: any = null;

      for (const candidate of candidates) {
        try {
          createdUid = await createAuthUserWithoutSwitchingSession(candidate, password);
          createdEmail = candidate;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!createdUid && lastError) throw lastError;
      if (!createdUid) throw new Error('No se pudo crear el usuario en Authentication');

      await setDoc(doc(db, 'users', createdUid), {
        username,
        email: createdEmail,
        authUid: createdUid,
        role: 'encargado_vehiculos',
        unitId: null,
        companyId,
        sectionId: null,
        createdBy: currentUser.id,
        createdAt: serverTimestamp(),
        classification: MILITARY_ROLES['encargado_vehiculos']?.classification || ClassificationLevel.CONFIDENTIAL
      });

      await createAuditLog('CREATE_USER_ENC_VEH', 'Encargado de Vehículos creado: ' + username);

      setNewEncVehForm({ username: '', password: '', passwordConfirm: '', companyId: '' });
      setError('');
      alert('Encargado de Vehículos "' + username + '" creado correctamente');
    } catch (err: any) {
      setError('Error al crear Encargado de Vehículos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  // VISTA LOGIN
  if (!currentUser) {
    const loginBlockedByMaintenance = false;

    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors duration-300">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-6 sm:p-10 transition-colors duration-300">
            <div className="text-center mb-10">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
                  <CheckCircleIcon className="h-8 w-8 text-white" />
                </div>
              </div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">SIGVEM</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold">GESTIÓN DE FLOTA</p>
            </div>

            {maintenanceMode && (
              <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-xl text-sm">
                <p className="font-bold">🛠️ Aplicación en mantenimiento</p>
                <p className="mt-1">{maintenanceMessage}</p>
                <p className="mt-2 text-xs opacity-80">Solo super_admin puede acceder temporalmente.</p>
              </div>
            )}

            {!isRegisterMode ? (
              <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usuario</label>
                  <input
                    type="text"
                    spellCheck="false"
                    autoComplete="off"
                    name="login-username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    placeholder="Ingresa tu usuario"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contrasena</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      name="login-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                      placeholder="Contrasena"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl text-sm">{error}</div>}

                <button type="submit" disabled={loading || loginBlockedByMaintenance} className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors">
                  {loading ? 'Iniciando...' : 'ENTRAR'}
                </button>

                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">¿No tienes cuenta?</p>
                  <button type="button" disabled={maintenanceMode} onClick={() => setIsRegisterMode(true)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-gray-400 disabled:cursor-not-allowed font-bold mt-2 transition-colors">
                    Crear cuenta aquí
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5" autoComplete="off">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">👤 Crear Cuenta</h2>

                {/* Usuario */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de Usuario</label>
                  <input 
                    type="text" 
                    spellCheck="false" 
                    autoComplete="off"
                    name="register-username"
                    placeholder="Elige un usuario único" 
                    value={registerForm.username} 
                    onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} 
                    className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors" 
                    required 
                  />
                </div>

                {/* Contrasena */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contrasena</label>
                  <div className="relative">
                    <input 
                      type={showRegisterPassword ? 'text' : 'password'} 
                      autoComplete="new-password"
                      name="register-password"
                      placeholder="Contrasena segura requerida" 
                      value={registerForm.password} 
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} 
                      className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors pr-12"
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-4 top-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {showRegisterPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                  
                  {/* Requisitos de Contrasena */}
                  {registerForm.password && (
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                      <p className="text-xs font-bold text-blue-900 dark:text-blue-100 mb-3">Requisitos:</p>
                      <div className="space-y-2">
                        <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(registerForm.password).length ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(registerForm.password).length ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {getPasswordRequirements(registerForm.password).length && <span className="text-white font-bold text-xs">✓</span>}
                          </span>
                          <span>Mínimo 8 caracteres</span>
                        </div>
                        <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(registerForm.password).uppercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(registerForm.password).uppercase ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {getPasswordRequirements(registerForm.password).uppercase && <span className="text-white font-bold text-xs">✓</span>}
                          </span>
                          <span>Una mayúscula (A-Z)</span>
                        </div>
                        <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(registerForm.password).lowercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(registerForm.password).lowercase ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {getPasswordRequirements(registerForm.password).lowercase && <span className="text-white font-bold text-xs">✓</span>}
                          </span>
                          <span>Una minúscula (a-z)</span>
                        </div>
                        <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(registerForm.password).number ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(registerForm.password).number ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {getPasswordRequirements(registerForm.password).number && <span className="text-white font-bold text-xs">✓</span>}
                          </span>
                          <span>Un número (0-9)</span>
                        </div>
                        <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(registerForm.password).special ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(registerForm.password).special ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {getPasswordRequirements(registerForm.password).special && <span className="text-white font-bold text-xs">✓</span>}
                          </span>
                          <span>Un carácter especial (!@#$%^&*)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirmar Contrasena */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirmar Contrasena</label>
                  <div className="relative">
                    <input 
                      type={showRegisterPasswordConfirm ? 'text' : 'password'} 
                      autoComplete="new-password"
                      name="register-password-confirm"
                      placeholder="Repite la contraseña" 
                      value={registerForm.passwordConfirm} 
                      onChange={(e) => setRegisterForm({ ...registerForm, passwordConfirm: e.target.value })} 
                      className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors pr-12"
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPasswordConfirm(!showRegisterPasswordConfirm)}
                      className="absolute right-4 top-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {showRegisterPasswordConfirm ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                    {registerForm.password && registerForm.passwordConfirm && (
                      <span className={`absolute right-12 top-3.5 text-lg ${registerForm.password === registerForm.passwordConfirm ? 'text-green-500' : 'text-red-500'}`}>
                        {registerForm.password === registerForm.passwordConfirm ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Rol */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rol de Usuario</label>
                  <select 
                    value={registerForm.role} 
                    onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value as any })} 
                    className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                  >
                    <option value="consulta">👁️ Consulta (solo lectura)</option>
                    <option value="operador">⚙️ Operador (gestionar vehículos)</option>
                    <option value="encargado_seccion">📋 Jefe de Sección</option>
                  </select>
                </div>

                {/* Código de Sección (Opcional) */}
                {(registerForm.role === 'operador' || registerForm.role === 'encargado_seccion') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Código de Sección (opcional)</label>
                    <input 
                      type="text" 
                      spellCheck="false"
                      placeholder="Código de 10 dígitos (proporcionado por tu encargado)" 
                      value={registerForm.accessCode} 
                      onChange={(e) => setRegisterForm({ ...registerForm, accessCode: e.target.value })} 
                      className="w-full px-5 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors" 
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Si ingresa un código válido, se asignará automáticamente a esa sección</p>
                  </div>
                )}

                {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl text-sm">{error}</div>}

                <button 
                  type="submit" 
                  disabled={maintenanceMode || loading || !registerForm.username || !registerForm.password || !registerForm.passwordConfirm || registerForm.password !== registerForm.passwordConfirm || !getPasswordRequirements(registerForm.password).length || !getPasswordRequirements(registerForm.password).uppercase || !getPasswordRequirements(registerForm.password).lowercase || !getPasswordRequirements(registerForm.password).number || !getPasswordRequirements(registerForm.password).special} 
                  className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors"
                >
                  {loading ? 'Registrando...' : '✅ CREAR CUENTA'}
                </button>

                <button 
                  type="button" 
                  onClick={() => { setIsRegisterMode(false); setError(''); }} 
                  className="w-full bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 py-3 rounded-xl font-bold transition-colors"
                >
                  ← Volver a Login
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (maintenanceMode && currentUser?.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors duration-300">
        <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-8 sm:p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-500 rounded-2xl flex items-center justify-center text-white text-2xl">🛠️</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Aplicación en mantenimiento</h1>
          <p className="text-gray-700 dark:text-gray-300">{maintenanceMessage}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Vuelve a intentarlo cuando finalice el mantenimiento.</p>
          <button
            onClick={handleLogout}
            className="mt-8 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // NAVBAR
  const Navbar = () => (
    <>
      {/* ALERTAS DE SEGURIDAD */}
      {securityAlerts.length > 0 && (
        <div className="bg-red-900 text-white px-4 py-3 border-b border-red-800">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm">⚠️ ALERTA DE SEGURIDAD</p>
                <div className="mt-2 space-y-1">
                  {securityAlerts.map((alert, idx) => (
                    <p key={idx} className="text-xs opacity-90">{alert}</p>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => setSecurityAlerts([])}
                className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
              >
                X
              </button>
            </div>
          </div>
        </div>
      )}
      
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircleIcon className="h-6 w-6 text-white" />
            </div>
            <div className="hidden xs:block min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">SIGVEM</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gestión de Flota - CLASIFICADO CONFIDENTIAL</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 flex-wrap justify-end">

            {currentUser.role === 'super_admin' && (
              <button
                onClick={() => { loadAuditReportData(); setView('audit-report'); }}
                className="text-sm bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg font-semibold"
              >
                📊 Auditoría
              </button>
            )}
            <div className="hidden sm:flex px-3 sm:px-4 py-2 bg-gray-100 dark:bg-slate-700 rounded-lg">
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">👤 <span className="font-semibold">{currentUser.username}</span> [{currentUser.role}]</p>
            </div>
            <button 
              onClick={() => {
                setError('');
                setProposalMessage('');
                setView('feedback');
              }} 
              className={`relative p-2 rounded-lg transition-colors ${visibleAnnouncements.length > 0 ? 'bg-cyan-100 dark:bg-cyan-900/30 ring-2 ring-cyan-400' : 'hover:bg-cyan-50 dark:hover:bg-cyan-900/20'} text-cyan-600 dark:text-cyan-400`} 
              title="Propuestas"
            >
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
              {visibleAnnouncements.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full font-bold">
                  {visibleAnnouncements.length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setView('settings')} 
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-colors" 
              title="Ajustes"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            {currentUser.role === 'super_admin' && (
              <button
                onClick={handleToggleMaintenance}
                disabled={maintenanceBusy}
                className={`px-3 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${maintenanceMode ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                title={maintenanceMode ? 'Desactivar mantenimiento' : 'Activar mantenimiento'}
              >
                {maintenanceBusy
                  ? 'Guardando...'
                  : maintenanceMode
                    ? '🛠️ Mantenimiento ON'
                    : '✅ App Activa'}
              </button>
            )}
            <button onClick={handleToggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400 transition-colors" title={isDark ? 'Modo claro' : 'Modo oscuro'}>
              {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold text-xs sm:text-sm transition-colors">
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {visibleAnnouncements.length > 0 && (
        <div className="bg-cyan-50 dark:bg-cyan-900/20 border-b border-cyan-200 dark:border-cyan-900 px-4 py-3">
          <div className="max-w-7xl mx-auto space-y-2">
            {visibleAnnouncements.slice(0, 3).map((announcement) => (
              <div key={announcement.id} className="flex items-start justify-between gap-4 flex-wrap border border-cyan-200 dark:border-cyan-800 rounded-xl bg-white/70 dark:bg-slate-800/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">Novedad</p>
                  <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100 mt-0.5">{announcement.title}</p>
                  <p className="text-sm text-cyan-800 dark:text-cyan-200 mt-1">{announcement.message}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => dismissFeatureAnnouncement(announcement.id)}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 text-cyan-800 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-800 text-sm font-bold flex items-center justify-center"
                    aria-label="Cerrar novedad"
                    title="Cerrar"
                  >
                    ×
                  </button>
                  <button
                    onClick={() => dismissFeatureAnnouncement(announcement.id)}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 text-cyan-800 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-800 text-sm font-semibold"
                  >
                    Marcar leido
                  </button>
                </div>
              </div>
            ))}
            {visibleAnnouncements.length > 3 && (
              <p className="text-xs text-cyan-700 dark:text-cyan-300">Hay {visibleAnnouncements.length - 3} novedad(es) más pendientes por leer.</p>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (view === 'vehicle-transfer') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

          <button
            onClick={() => setView('section-detail')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
          >
            ← Volver a sección
          </button>

          {renderVehicleTransferPanel()}
        </main>
      </div>
    );
  }

  if (view === 'feedback') {
    const canReviewAllProposals = currentUser?.role === 'super_admin';
    const backView: ViewState = currentUser?.role === 'super_admin' ? 'companies-menu' : 'section-detail';

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button
            onClick={() => {
              setError('');
              setProposalMessage('');
              setView(backView);
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
          >
            ← Volver
          </button>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">💡 Propuestas de mejora</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Comparte ideas para mejorar la aplicación. Tu propuesta quedará registrada para revisión.
              </p>

              <form onSubmit={submitFeatureProposal} className="mt-6 space-y-4">
                <textarea
                  value={proposalText}
                  onChange={(e) => setProposalText(e.target.value)}
                  rows={5}
                  maxLength={1200}
                  placeholder="Describe tu propuesta (qué cambiar, por qué, y cómo ayudaría en el trabajo diario)..."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{proposalText.trim().length}/1200</p>
                  <button
                    type="submit"
                    disabled={proposalLoading || proposalText.trim().length < 10}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold"
                  >
                    {proposalLoading ? 'Enviando...' : 'Enviar propuesta'}
                  </button>
                </div>
              </form>

              {proposalMessage && (
                <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl text-sm">
                  {proposalMessage}
                </div>
              )}
              {error && (
                <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
            </div>

            {canReviewAllProposals && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">📥 Bandeja de propuestas</h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{featureProposals.length} registro(s)</span>
                </div>

                {featureProposals.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No hay propuestas todavía.</p>
                ) : (
                  <div className="space-y-3">
                    {featureProposals.map((proposal) => (
                      <div key={proposal.id} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {proposal.createdBy} [{proposal.createdByRole}]
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {proposal.createdAt ? proposal.createdAt.toLocaleString('es-ES') : 'Sin fecha'}
                          </p>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{proposal.text}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Estado: {proposal.status || 'pending'}
                        </p>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Actualizar estado:</span>
                          <select
                            value={proposal.status || 'pending'}
                            onChange={(e) => updateFeatureProposalStatus(proposal.id, e.target.value as 'pending' | 'reviewed' | 'planned' | 'done')}
                            className="px-2 py-1 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-md"
                          >
                            <option value="pending">Pendiente</option>
                            <option value="reviewed">Revisada</option>
                            <option value="planned">Planificada</option>
                            <option value="done">Implementada</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canReviewAllProposals && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">📣 Novedades automáticas</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                  Publica una novedad y aparecerá automáticamente al entrar para todos los usuarios. Cada novedad expira en 5 días.
                </p>

                <form onSubmit={publishAnnouncement} className="space-y-4">
                  <input
                    type="text"
                    value={announcementForm.title}
                    onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Título breve de la mejora"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <textarea
                    rows={4}
                    value={announcementForm.message}
                    onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Explica en pocas líneas qué cambió y cómo se usa"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <div className="flex items-center justify-end gap-3 flex-wrap">
                    <button
                      type="submit"
                      disabled={announcementLoading || !announcementForm.title.trim() || !announcementForm.message.trim()}
                      className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold"
                    >
                      {announcementLoading ? 'Publicando...' : 'Publicar novedad'}
                    </button>
                  </div>
                </form>

                {announcementMessage && (
                  <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl text-sm">
                    {announcementMessage}
                  </div>
                )}

                <div className="mt-6 space-y-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Historial reciente</p>
                  {announcements.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Sin novedades publicadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {announcements.slice(0, 10).map((announcement) => (
                        <div key={announcement.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                          {(() => {
                            const isExpired = Boolean(announcement.expiresAt && announcement.expiresAt.getTime() <= Date.now());
                            return (
                              <>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">{announcement.title}</p>
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${isExpired ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : announcement.active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>
                              {isExpired ? 'Caducada' : announcement.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{announcement.message}</p>
                          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              <p>{announcement.createdAt ? `Publicada: ${announcement.createdAt.toLocaleString('es-ES')}` : 'Publicada: sin fecha'}</p>
                              <p>{announcement.expiresAt ? `Expira: ${announcement.expiresAt.toLocaleString('es-ES')}` : 'Sin expiración'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setAnnouncementActive(announcement.id, !announcement.active)}
                                disabled={isExpired}
                                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {announcement.active ? 'Desactivar' : 'Activar'}
                              </button>
                              <button
                                onClick={() => deleteAnnouncement(announcement.id)}
                                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // SETTINGS VIEW
  if (view === 'settings') {
    const settingsReqs = getPasswordRequirements(settingsNewPassword);
    const settingsReady =
      Boolean(settingsCurrentPassword && settingsNewPassword && settingsConfirmPassword) &&
      settingsNewPassword === settingsConfirmPassword &&
      settingsReqs.length &&
      settingsReqs.uppercase &&
      settingsReqs.lowercase &&
      settingsReqs.number &&
      settingsReqs.special;

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button 
            onClick={() => setView(currentUser?.role === 'super_admin' ? 'companies-menu' : 'section-detail')} 
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
          >
            ← Volver
          </button>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <Cog6ToothIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ajustes</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Configura tu acceso biométrico</p>
                </div>
              </div>

              {settingsMessage && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg text-sm">
                  {settingsMessage}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Biometría</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona el acceso biométrico en este dispositivo.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={handleEnableBiometrics}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold"
                  >
                    Activar biometría en este dispositivo
                  </button>
                  <button
                    onClick={handleClearBiometrics}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold"
                  >
                    Borrar biometría en este dispositivo
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Cambiar contraseña</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    type={showSettingsCurrentPassword ? 'text' : 'password'}
                    placeholder="Contrasena actual"
                    value={settingsCurrentPassword}
                    onChange={(e) => setSettingsCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsCurrentPassword(!showSettingsCurrentPassword)}
                    className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300"
                  >
                    {showSettingsCurrentPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showSettingsNewPassword ? 'text' : 'password'}
                    placeholder="Nueva contraseña"
                    value={settingsNewPassword}
                    onChange={(e) => setSettingsNewPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsNewPassword(!showSettingsNewPassword)}
                    className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300"
                  >
                    {showSettingsNewPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                <div className="sm:col-span-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                  <p className="text-xs font-bold text-blue-900 dark:text-blue-100 mb-3">Requisitos:</p>
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(settingsNewPassword).length ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(settingsNewPassword).length ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {getPasswordRequirements(settingsNewPassword).length && <span className="text-white font-bold text-xs">✓</span>}
                      </span>
                      <span>Mínimo 8 caracteres</span>
                    </div>
                    <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(settingsNewPassword).uppercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(settingsNewPassword).uppercase ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {getPasswordRequirements(settingsNewPassword).uppercase && <span className="text-white font-bold text-xs">✓</span>}
                      </span>
                      <span>Una mayúscula (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(settingsNewPassword).lowercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(settingsNewPassword).lowercase ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {getPasswordRequirements(settingsNewPassword).lowercase && <span className="text-white font-bold text-xs">✓</span>}
                      </span>
                      <span>Una minúscula (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(settingsNewPassword).number ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(settingsNewPassword).number ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {getPasswordRequirements(settingsNewPassword).number && <span className="text-white font-bold text-xs">✓</span>}
                      </span>
                      <span>Un número (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-2 text-xs transition-colors ${getPasswordRequirements(settingsNewPassword).special ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${getPasswordRequirements(settingsNewPassword).special ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {getPasswordRequirements(settingsNewPassword).special && <span className="text-white font-bold text-xs">✓</span>}
                      </span>
                      <span>Un carácter especial (!@#$%^&*)</span>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showSettingsConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirmar nueva contraseña"
                    value={settingsConfirmPassword}
                    onChange={(e) => setSettingsConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsConfirmPassword(!showSettingsConfirmPassword)}
                    className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300"
                  >
                    {showSettingsConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {settingsConfirmPassword && settingsNewPassword !== settingsConfirmPassword && (
                  <p className="text-xs text-red-600 dark:text-red-400">Las contraseñas no coinciden</p>
                )}
                {settingsConfirmPassword && settingsNewPassword === settingsConfirmPassword && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-semibold">✓ Contrasenas coinciden</p>
                )}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleChangePassword}
                  disabled={loading || !settingsReady}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setSettingsCurrentPassword('');
                    setSettingsNewPassword('');
                    setSettingsConfirmPassword('');
                    setSettingsMessage('');
                  }}
                  className="flex-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-xl font-bold"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ENCARGADO_CIA / ENCARGADO_VEHICULOS VIEW - Mostrar directamente su compañía
  if ((currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') && view !== 'vehicle-detail' && view !== 'parte-relevo-form') {
    // Auto-seleccionar su compañía si no está seleccionada
    if (!selectedCompanyId && currentUser.companyId) {
      setSelectedCompanyId(currentUser.companyId);
    }

    // Si está en section-detail, mostrar esa vista primero
    if ((view as ViewState) === 'section-detail' && selectedSectionId) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

            <button onClick={() => { setView('dashboard'); setSelectedSectionId(null); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors">← Volver</button>

            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {(() => {
                  const currentSection = sections.find(s => s.id === selectedSectionId);
                  return (
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
                      {currentSection && (
                        <div className="text-gray-600 dark:text-gray-300 mt-3 space-y-1">
                          <p><strong className="text-gray-900 dark:text-white">Sección:</strong> {currentSection.name}</p>
                          <p className="font-mono text-sm bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded inline-block">
                            <strong>Código:</strong> {currentSection.accessCode}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <button onClick={() => setShowNewVehicleForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold flex-shrink-0">➕ NUEVO VEHÍCULO</button>
              </div>

              <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 overflow-x-auto flex-nowrap scrollbar-hide">
                <button
                  onClick={() => setSelectedSectionMenuTab('vehiculos')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'vehiculos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🚗 Vehículos
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('avisos')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'avisos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🔔 Avisos
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('control')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📊 KM/HORAS
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('itvs')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'itvs' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🔧 ITVs {sectionHasUrgentItv && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
                </button>
                <button
                  onClick={() => { setSelectedSectionMenuTab('mensajes'); setChatLastSeenMs(Date.now()); }}
                  className={`relative px-4 py-2 rounded-lg font-bold ${selectedSectionMenuTab === 'mensajes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  💬 Mensajes
                  {(() => { const u = chatMessages.filter(m => (m.timestamp?.toMillis?.() ?? 0) > chatLastSeenMs && m.fromUserId !== (auth.currentUser?.uid ?? currentUser?.id)).length; return u > 0 && selectedSectionMenuTab !== 'mensajes' ? <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">{u > 9 ? '9+' : u}</span> : null; })()}
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('parte-carga')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'parte-carga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📦 Parte de Carga
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('novedades')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'novedades' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📝 Novedades
                </button>
              </div>

              {renderSectionAvisosBanner()}

              {selectedSectionMenuTab === 'vehiculos' && (
                <>
                  {showNewVehicleForm && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Agregar Vehículo</h2>
                      <form onSubmit={handleAddVehicle} className="space-y-5">
                        <input type="text" spellCheck="false" placeholder="Placa" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                        <input type="text" spellCheck="false" placeholder="Marca" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                        <input type="text" spellCheck="false" placeholder="Modelo" value={newVehicleForm.model} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                        <select value={newVehicleForm.vehicleType} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value as any })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                          <option value="bn1">BN1</option>
                          <option value="bn3">BN3</option>
                          <option value="portaspike">Portaspike</option>
                          <option value="s3">S3</option>
                          <option value="anibal">Aníbal</option>
                          <option value="landtrek">Landtrek</option>
                        </select>
                        <div className="flex gap-3">
                          <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Agregando...' : 'AGREGAR VEHÍCULO'}</button>
                          <button type="button" onClick={() => setShowNewVehicleForm(false)} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 py-4 rounded-xl font-bold">CANCELAR</button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vehicles.map(vehicle => (
                      <div key={vehicle.id} className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 transition-colors">
                        {getVehicleIncidenciasCount(vehicle) > 0 && (
                          <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                            ⚠️ {getVehicleIncidenciasCount(vehicle)}
                          </div>
                        )}
                        {getVehicleAvisosCount(vehicle) > 0 && (
                          <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                            🔔 {getVehicleAvisosCount(vehicle)}
                          </div>
                        )}
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{vehicle.brand} {vehicle.model}</p>
                        <span className={`inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</span>
                        <div className="mt-4 flex flex-col gap-2">
                          <button onClick={() => openVehicleDetail(vehicle.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">Ver Detalles</button>
                          <div className="flex gap-2">
                            <select onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)} defaultValue={vehicle.status} className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors"><option value="OPERATIVO">Operativo</option><option value="OPERATIVO_CONDICIONAL">Op. Cond.</option><option value="INOPERATIVO">Inoperativo</option></select>
                            <button onClick={() => deleteVehicle(vehicle.id)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"><TrashIcon className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedSectionMenuTab === 'avisos' && renderSectionAvisosPanel()}
              {selectedSectionMenuTab === 'control' && renderSectionControlPanel()}
              {selectedSectionMenuTab === 'itvs' && renderSectionItvsPanel()}
              {selectedSectionMenuTab === 'mensajes' && renderSectionMessagesPanel()}
              {selectedSectionMenuTab === 'parte-carga' && renderParteCargaPanel()}
              {selectedSectionMenuTab === 'novedades' && renderSectionNovedadesPanel()}
            </div>
          </main>
        </div>
      );
    }

    // Si tiene compañía seleccionada, mostrar el detalle (secciones y vehículos)
    if (selectedCompanyId) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Secciones</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Mi Compania</p></div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { loadCiaOverviewData(); setView('cia-overview'); }} className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-bold">📊 Auditoría</button>
                  <button onClick={() => setShowNewSectionForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold">➕ NUEVA SECCIÓN</button>
                </div>
              </div>

              {showNewSectionForm && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Crear Nueva Sección</h2>
                  <form onSubmit={handleCreateSection} className="space-y-5">
                    <input type="text" spellCheck="false" placeholder="Nombre de sección" value={newSectionForm.sectionName} onChange={(e) => setNewSectionForm({ sectionName: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                    <div className="flex gap-3">
                      <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Creando...' : 'CREAR SECCIÓN'}</button>
                      <button type="button" onClick={() => setShowNewSectionForm(false)} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 py-4 rounded-xl font-bold">CANCELAR</button>
                    </div>
                  </form>
                </div>
              )}

              {sections.length === 0 ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl">
                  <p className="font-semibold">ℹ️ No hay secciones. Crea una nueva con el botón "NUEVA SECCIÓN"</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {sections.filter(s => s.companyId === selectedCompanyId).map(section => (
                    <div key={section.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col justify-between min-h-64">
                      {editingSectionId === section.id ? (
                        <div className="space-y-3">
                          <input type="text" spellCheck="false" value={editSectionName} onChange={(e) => setEditSectionName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                          <p className="text-xs text-gray-500 dark:text-gray-400">Código de acceso: {section.accessCode}</p>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditSectionName(section.id, editSectionName)} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50">Guardar</button>
                            <button onClick={() => { setEditingSectionId(null); setEditSectionName(''); }} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg font-bold text-sm">Descartar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{section.name}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Código de acceso: {section.accessCode}</p>
                          <div className="mt-4 flex gap-2 flex-wrap">
                            <button onClick={() => { setSelectedSectionId(section.id); setView('section-detail'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Entrar</button>
                            <button onClick={() => { setEditingSectionId(section.id); setEditSectionName(section.name); }} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Renombrar</button>
                            <button onClick={() => deleteSection(section.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Eliminar</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      );
    }
  }

  // ENCARGADO_SECCION VIEW - Mostrar su sección
  if (currentUser.role === 'encargado_seccion' && view !== 'vehicle-detail' && view !== 'parte-relevo-form') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Mi Sección</p>
                {currentSectionForControl && (
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-2">
                    {currentSectionForControl.name} · Código: {currentSectionForControl.accessCode}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {canTransferVehicles && (
                  <button
                    onClick={() => { setTransferPanelTab('nuevo'); setView('vehicle-transfer'); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-lg font-bold"
                  >
                    🔁 TRASPASAR VEHÍCULO
                  </button>
                )}
                <button onClick={() => setShowNewVehicleForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold">➕ NUEVO VEHÍCULO</button>
              </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 overflow-x-auto flex-nowrap scrollbar-hide">
              <button
                onClick={() => setSelectedSectionMenuTab('vehiculos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'vehiculos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🚗 Vehículos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('avisos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'avisos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔔 Avisos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('control')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📊 KM/HORAS
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('itvs')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'itvs' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔧 ITVs {sectionHasUrgentItv && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
              </button>
              <button
                onClick={() => { setSelectedSectionMenuTab('mensajes'); setChatLastSeenMs(Date.now()); }}
                className={`relative px-4 py-2 rounded-lg font-bold ${selectedSectionMenuTab === 'mensajes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                💬 Mensajes
                {(() => { const u = chatMessages.filter(m => (m.timestamp?.toMillis?.() ?? 0) > chatLastSeenMs && m.fromUserId !== (auth.currentUser?.uid ?? currentUser?.id)).length; return u > 0 && selectedSectionMenuTab !== 'mensajes' ? <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">{u > 9 ? '9+' : u}</span> : null; })()}
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('parte-carga')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'parte-carga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📦 Parte de Carga
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('novedades')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'novedades' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📝 Novedades
              </button>
            </div>

            {renderSectionAvisosBanner()}

            {selectedSectionMenuTab === 'vehiculos' && (
            <>
            {showNewVehicleForm && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Agregar Vehículo</h2>
                <form onSubmit={handleAddVehicle} className="space-y-5">
                  <input type="text" spellCheck="false" placeholder="Placa" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white" required />
                  <input type="text" spellCheck="false" placeholder="Marca" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white" required />
                  <input type="text" spellCheck="false" placeholder="Modelo" value={newVehicleForm.model} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white" required />
                  <select value={newVehicleForm.vehicleType} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value as any })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white">
                    <option value="bn1">BN1</option>
                    <option value="bn3">BN3</option>
                    <option value="portaspike">Portaspike</option>
                    <option value="s3">S3</option>
                    <option value="anibal">Aníbal</option>
                    <option value="landtrek">Landtrek</option>
                  </select>
                  <div className="flex gap-3">
                    <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Agregando...' : 'AGREGAR VEHÍCULO'}</button>
                    <button type="button" onClick={() => setShowNewVehicleForm(false)} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 py-4 rounded-xl font-bold">CANCELAR</button>
                  </div>
                </form>
              </div>
            )}

            {vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).length === 0 ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl">
                <p className="font-semibold">ℹ️ No hay vehículos. Crea uno nuevo con el botón "NUEVO VEHÍCULO"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).map(vehicle => (
                  <div key={vehicle.id} className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all">
                    {getVehicleIncidenciasCount(vehicle) > 0 && (
                      <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        ⚠️ {getVehicleIncidenciasCount(vehicle)}
                      </div>
                    )}
                    {getVehicleAvisosCount(vehicle) > 0 && (
                      <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        🔔 {getVehicleAvisosCount(vehicle)}
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                    <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-bold inline-block ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</div>
                    <div className="mt-4 flex flex-col gap-2">
                      <button onClick={() => openVehicleDetail(vehicle.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors">Ver Detalles</button>
                      <select
                        onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)}
                        defaultValue={vehicle.status}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      >
                        <option value="OPERATIVO">Operativo</option>
                        <option value="OPERATIVO_CONDICIONAL">Op. Cond.</option>
                        <option value="INOPERATIVO">Inoperativo</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
            )}

            {selectedSectionMenuTab === 'avisos' && renderSectionAvisosPanel()}
            {selectedSectionMenuTab === 'control' && renderSectionControlPanel()}
            {selectedSectionMenuTab === 'itvs' && renderSectionItvsPanel()}
            {selectedSectionMenuTab === 'mensajes' && renderSectionMessagesPanel()}
            {selectedSectionMenuTab === 'parte-carga' && renderParteCargaPanel()}
            {selectedSectionMenuTab === 'novedades' && renderSectionNovedadesPanel()}
          </div>
        </main>
      </div>
    );
  }

  // OPERADOR VIEW - Ver y crear/editar vehículos
  if (currentUser.role === 'operador' && view !== 'vehicle-detail' && view !== 'parte-relevo-form') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Gestión completa de vehículos</p>
                {currentSectionForControl && (
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-2">
                    {currentSectionForControl.name} · Código: {currentSectionForControl.accessCode}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {canTransferVehicles && (
                  <button
                    onClick={() => { setTransferPanelTab('nuevo'); setView('vehicle-transfer'); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-bold transition-colors"
                  >
                    🔁 Traspasar vehículo
                  </button>
                )}
                <button onClick={() => setShowNewVehicleForm(!showNewVehicleForm)} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold transition-colors">
                  {showNewVehicleForm ? 'X Cancelar' : '➕ Nuevo Vehículo'}
                </button>
              </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 overflow-x-auto flex-nowrap scrollbar-hide">
              <button
                onClick={() => setSelectedSectionMenuTab('vehiculos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'vehiculos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🚗 Vehículos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('avisos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'avisos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔔 Avisos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('control')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📊 KM/HORAS
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('itvs')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'itvs' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔧 ITVs {sectionHasUrgentItv && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
              </button>
              <button
                onClick={() => { setSelectedSectionMenuTab('mensajes'); setChatLastSeenMs(Date.now()); }}
                className={`relative px-4 py-2 rounded-lg font-bold ${selectedSectionMenuTab === 'mensajes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                💬 Mensajes
                {(() => { const u = chatMessages.filter(m => (m.timestamp?.toMillis?.() ?? 0) > chatLastSeenMs && m.fromUserId !== (auth.currentUser?.uid ?? currentUser?.id)).length; return u > 0 && selectedSectionMenuTab !== 'mensajes' ? <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">{u > 9 ? '9+' : u}</span> : null; })()}
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('parte-carga')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'parte-carga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📦 Parte de Carga
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('novedades')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'novedades' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📝 Novedades
              </button>
            </div>

            {renderSectionAvisosBanner()}

            {selectedSectionMenuTab === 'vehiculos' && (
            <>
            {showNewVehicleForm && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Agregar Vehículo</h2>
                <form onSubmit={handleAddVehicle} className="space-y-5">
                  <input type="text" spellCheck="false" placeholder="Placa" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                  <input type="text" spellCheck="false" placeholder="Marca" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                  <input type="text" spellCheck="false" placeholder="Modelo" value={newVehicleForm.model} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                  <select value={newVehicleForm.vehicleType} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value as any })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="bn1">BN1</option>
                    <option value="bn3">BN3</option>
                    <option value="portaspike">Portaspike</option>
                    <option value="s3">S3</option>
                    <option value="anibal">Aníbal</option>
                    <option value="landtrek">Landtrek</option>
                  </select>
                  <select value={newVehicleForm.status} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, status: e.target.value as VehicleStatus })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="OPERATIVO">Operativo</option>
                    <option value="OPERATIVO_CONDICIONAL">Operativo Condicional</option>
                    <option value="INOPERATIVO">Inoperativo</option>
                  </select>
                  <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold transition-colors disabled:opacity-50">
                    {loading ? 'Creando...' : 'CREAR VEHÍCULO'}
                  </button>
                </form>
              </div>
            )}

            {vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).length === 0 ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl">
                <p className="font-semibold">ℹ️ No hay vehículos en tu sección</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).map(vehicle => (
                  <div key={vehicle.id} className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all">
                    {getVehicleIncidenciasCount(vehicle) > 0 && (
                      <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        ⚠️ {getVehicleIncidenciasCount(vehicle)}
                      </div>
                    )}
                    {getVehicleAvisosCount(vehicle) > 0 && (
                      <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        🔔 {getVehicleAvisosCount(vehicle)}
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                    <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-bold inline-block ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</div>
                    {canChangeVehicleStatus && (
                      <select onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)} defaultValue={vehicle.status} className="mt-3 w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors"><option value="OPERATIVO">Operativo</option><option value="OPERATIVO_CONDICIONAL">Op. Cond.</option><option value="INOPERATIVO">Inoperativo</option></select>
                    )}
                    <button onClick={() => openVehicleDetail(vehicle.id)} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors">Ver Detalles</button>
                  </div>
                ))}
              </div>
            )}
            </>
            )}

            {selectedSectionMenuTab === 'avisos' && renderSectionAvisosPanel()}
            {selectedSectionMenuTab === 'control' && renderSectionControlPanel()}
            {selectedSectionMenuTab === 'itvs' && renderSectionItvsPanel()}
            {selectedSectionMenuTab === 'mensajes' && renderSectionMessagesPanel()}
            {selectedSectionMenuTab === 'parte-carga' && renderParteCargaPanel()}
            {selectedSectionMenuTab === 'novedades' && renderSectionNovedadesPanel()}
          </div>
        </main>
      </div>
    );
  }

  // CONSULTA VIEW - Solo lectura
  if (currentUser.role === 'consulta' && view !== 'vehicle-detail' && view !== 'parte-relevo-form') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

          <div className="space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Solo consulta</p>
              {currentSectionForControl && (
                <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-2">
                  {currentSectionForControl.name} · Código: {currentSectionForControl.accessCode}
                </p>
              )}
            </div>

            <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 overflow-x-auto flex-nowrap scrollbar-hide">
              <button
                onClick={() => setSelectedSectionMenuTab('vehiculos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'vehiculos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🚗 Vehículos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('avisos')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'avisos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔔 Avisos
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('control')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📊 KM/HORAS
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('itvs')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'itvs' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                🔧 ITVs {sectionHasUrgentItv && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
              </button>
              <button
                onClick={() => { setSelectedSectionMenuTab('mensajes'); setChatLastSeenMs(Date.now()); }}
                className={`relative px-4 py-2 rounded-lg font-bold ${selectedSectionMenuTab === 'mensajes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                💬 Mensajes
                {(() => { const u = chatMessages.filter(m => (m.timestamp?.toMillis?.() ?? 0) > chatLastSeenMs && m.fromUserId !== (auth.currentUser?.uid ?? currentUser?.id)).length; return u > 0 && selectedSectionMenuTab !== 'mensajes' ? <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">{u > 9 ? '9+' : u}</span> : null; })()}
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('parte-carga')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'parte-carga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📦 Parte de Carga
              </button>
              <button
                onClick={() => setSelectedSectionMenuTab('novedades')}
                className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'novedades' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
              >
                📝 Novedades
              </button>
            </div>

            {renderSectionAvisosBanner()}

            {selectedSectionMenuTab === 'vehiculos' && (
            vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).length === 0 ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl">
                <p className="font-semibold">ℹ️ No hay vehículos en tu sección</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicles.filter(v => v.sectionId === currentUser.sectionId && !v.isArchived).map(vehicle => (
                  <div key={vehicle.id} className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all">
                    {getVehicleIncidenciasCount(vehicle) > 0 && (
                      <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        ⚠️ {getVehicleIncidenciasCount(vehicle)}
                      </div>
                    )}
                    {getVehicleAvisosCount(vehicle) > 0 && (
                      <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        🔔 {getVehicleAvisosCount(vehicle)}
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                    <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-bold inline-block ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</div>
                    <button onClick={() => openVehicleDetail(vehicle.id)} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors">Ver Detalles</button>
                  </div>
                ))}
              </div>
            )
            )}

            {selectedSectionMenuTab === 'avisos' && renderSectionAvisosPanel()}
            {selectedSectionMenuTab === 'control' && renderSectionControlPanel()}
            {selectedSectionMenuTab === 'itvs' && renderSectionItvsPanel()}
            {selectedSectionMenuTab === 'mensajes' && renderSectionMessagesPanel()}
            {selectedSectionMenuTab === 'parte-carga' && renderParteCargaPanel()}
            {selectedSectionMenuTab === 'novedades' && renderSectionNovedadesPanel()}
          </div>
        </main>
      </div>
    );
  }

  // SUPER ADMIN VIEW - Companias o vistas internas (incluye vehicle-detail y parte-relevo-form para todos los roles)
  if ((currentUser.role === 'super_admin' || view === 'vehicle-detail' || view === 'parte-relevo-form' || view === 'company-detail' || view === 'section-detail') && view !== 'cleanup-test-data' && view !== 'audit-report') {
    // AUDIT LOG VIEW
    if (view === 'audit-log') {
      const filteredAuditLogs = auditLogs.filter(log => {
        const matchCompany = auditFilterCompany === 'TODAS' || log.details?.includes(auditFilterCompany);
        const matchAction = auditFilterAction === 'TODAS' || log.action === auditFilterAction;
        const matchUser = auditFilterUser === '' || log.user.toLowerCase().includes(auditFilterUser.toLowerCase());
        return matchCompany && matchAction && matchUser;
      });

      const uniqueActions = Array.from(new Set(auditLogs.map(log => log.action)));
      
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <button onClick={() => setView('companies-menu')} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors">← Volver</button>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 transition-colors">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">📋 Registro de Auditoría</h1>
              
              {/* FILTROS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-slate-600">
                {/* Filtro por Compania */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Compania</label>
                  <select 
                    value={auditFilterCompany} 
                    onChange={(e) => setAuditFilterCompany(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TODAS">Todas las compañías</option>
                    {companies.map(company => (
                      <option key={company.id} value={company.name}>{company.name}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Acción */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Acción</label>
                  <select 
                    value={auditFilterAction} 
                    onChange={(e) => setAuditFilterAction(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TODAS">Todas las acciones</option>
                    {uniqueActions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Usuario */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usuario</label>
                  <input 
                    type="text" 
                    value={auditFilterUser} 
                    onChange={(e) => setAuditFilterUser(e.target.value)}
                    placeholder="Buscar por usuario..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Botón Limpiar Filtros y Contador */}
              <div className="flex justify-between items-center mb-4">
                <button 
                  onClick={() => {
                    setAuditFilterCompany('TODAS');
                    setAuditFilterAction('TODAS');
                    setAuditFilterUser('');
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                >
                  Limpiar filtros
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Mostrando {filteredAuditLogs.length} de {auditLogs.length} registros
                </span>
              </div>

              {/* TABLA DE AUDITORÍA */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200 dark:border-slate-600">
                      <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Fecha/Hora</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Usuario</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Acción</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-gray-700 dark:text-gray-300">Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map(log => {
                      const getActionBadge = (action: string) => {
                        const badges: Record<string, string> = {
                          'LOGIN': 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
                          'LOGOUT': 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
                          'CREATE_VEHICLE': 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                          'UPDATE_VEHICLE': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
                          'DELETE_VEHICLE': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
                          'CREATE_USER': 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
                          'UPDATE_USER': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
                        };
                        return badges[action] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300';
                      };

                      return (
                        <tr key={log.id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-300">
                            {log.timestamp instanceof Date 
                              ? log.timestamp.toLocaleString('es-ES', { 
                                  year: 'numeric', 
                                  month: '2-digit', 
                                  day: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })
                              : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-300">{log.user}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getActionBadge(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{log.details || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredAuditLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No se encontraron registros con los filtros aplicados
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      );
    }

    // Si está en section-detail, mostrar esa vista
    if (view === 'section-detail') {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

            <button onClick={() => { setView('company-detail'); setSelectedSectionId(null); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors">← Volver</button>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
                  {currentSectionForControl && (
                    <div className="text-gray-600 dark:text-gray-300 mt-2 space-y-1">
                      <p><strong className="text-gray-900 dark:text-white">Sección:</strong> {currentSectionForControl.name}</p>
                      {currentUser.role !== 's4' && (
                        <p className="font-mono text-sm bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded inline-block">
                          <strong>Código:</strong> {currentSectionForControl.accessCode}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {selectedSectionMenuTab === 'vehiculos' && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {canTransferVehicles && (
                      <button
                        onClick={() => { setTransferPanelTab('nuevo'); setView('vehicle-transfer'); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl shadow-lg font-bold"
                      >
                        🔁 TRASPASAR VEHÍCULO
                      </button>
                    )}
                    {currentUser.role !== 's4' && (
                      <button onClick={() => setShowNewVehicleForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold">➕ NUEVO VEHÍCULO</button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 overflow-x-auto flex-nowrap scrollbar-hide">
                <button
                  onClick={() => setSelectedSectionMenuTab('vehiculos')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'vehiculos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🚗 Vehículos
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('avisos')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'avisos' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🔔 Avisos
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('control')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📊 KM/HORAS
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('itvs')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'itvs' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  🔧 ITVs {sectionHasUrgentItv && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
                </button>
                <button
                  onClick={() => { setSelectedSectionMenuTab('mensajes'); setChatLastSeenMs(Date.now()); }}
                  className={`relative px-4 py-2 rounded-lg font-bold ${selectedSectionMenuTab === 'mensajes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  💬 Mensajes
                  {(() => { const u = chatMessages.filter(m => (m.timestamp?.toMillis?.() ?? 0) > chatLastSeenMs && m.fromUserId !== (auth.currentUser?.uid ?? currentUser?.id)).length; return u > 0 && selectedSectionMenuTab !== 'mensajes' ? <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">{u > 9 ? '9+' : u}</span> : null; })()}
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('parte-carga')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'parte-carga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📦 Parte de Carga
                </button>
                <button
                  onClick={() => setSelectedSectionMenuTab('novedades')}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg font-bold text-sm ${selectedSectionMenuTab === 'novedades' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
                >
                  📝 Novedades
                </button>
              </div>

              {renderSectionAvisosBanner()}

              {selectedSectionMenuTab === 'vehiculos' && showNewVehicleForm && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Agregar Vehículo</h2>
                  <form onSubmit={handleAddVehicle} className="space-y-5">
                    <input type="text" spellCheck="false" placeholder="Placa" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })} className="w-full px-5 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                    <input type="text" spellCheck="false" placeholder="Marca" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })} className="w-full px-5 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                    <input type="text" spellCheck="false" placeholder="Modelo" value={newVehicleForm.model} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })} className="w-full px-5 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                    <select value={newVehicleForm.vehicleType} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value as any })} className="w-full px-5 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                      <option value="bn1">BN1</option>
                      <option value="bn3">BN3</option>
                      <option value="portaspike">Portaspike</option>
                      <option value="s3">S3</option>
                      <option value="anibal">Aníbal</option>
                      <option value="landtrek">Landtrek</option>
                    </select>
                    <div className="flex gap-3">
                      <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Agregando...' : 'AGREGAR VEHÍCULO'}</button>
                      <button type="button" onClick={() => setShowNewVehicleForm(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-4 rounded-xl font-bold">CANCELAR</button>
                    </div>
                  </form>
                </div>
              )}

              {selectedSectionMenuTab === 'vehiculos' && (
                <>
                  {/* FILTROS */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">🔍 Filtros</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <input 
                        type="text" 
                        placeholder="Buscar por matrícula o marca..."
                        value={vehicleFilter}
                        onChange={(e) => setVehicleFilter(e.target.value)}
                        className="px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="TODOS">Todos los estados</option>
                        <option value="OPERATIVO">Operativo</option>
                        <option value="OPERATIVO_CONDICIONAL">Op. Condicional</option>
                        <option value="INOPERATIVO">Inoperativo</option>
                      </select>
                      <button 
                        onClick={() => setShowArchived(!showArchived)}
                        className={`px-4 py-3 rounded-lg font-bold transition-colors ${showArchived ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-900 dark:text-white'}`}
                      >
                        📦 {showArchived ? 'Archivados' : 'Ver Archivados'}
                      </button>
                      <button 
                        onClick={() => {
                          setVehicleFilter('');
                          setStatusFilter('TODOS');
                          setShowArchived(false);
                        }}
                        className="px-4 py-3 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-900 dark:text-white rounded-lg font-bold"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {vehicles
                      .filter(v => {
                        const matchArchived = showArchived ? v.isArchived : !v.isArchived;
                        const matchText = vehicleFilter === '' || 
                          v.plate.toLowerCase().includes(vehicleFilter.toLowerCase()) ||
                          v.brand.toLowerCase().includes(vehicleFilter.toLowerCase()) ||
                          v.model.toLowerCase().includes(vehicleFilter.toLowerCase());
                        const matchStatus = statusFilter === 'TODOS' || v.status === statusFilter;
                        return matchArchived && matchText && matchStatus;
                      })
                      .map(vehicle => (
                      <button key={vehicle.id} onClick={() => openVehicleDetail(vehicle.id)} className={`relative rounded-2xl shadow-sm border p-4 hover:shadow-lg transition-all text-left cursor-pointer flex flex-col justify-between min-h-48 ${vehicle.isArchived ? 'bg-gray-200 dark:bg-slate-700 border-gray-400 dark:border-slate-600 opacity-75' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'}`}>
                        {getVehicleIncidenciasCount(vehicle) > 0 && (
                          <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                            ⚠️ {getVehicleIncidenciasCount(vehicle)}
                          </div>
                        )}
                        {getVehicleAvisosCount(vehicle) > 0 && (
                          <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                            🔔 {getVehicleAvisosCount(vehicle)}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                            {vehicle.isArchived && <span className="px-2 py-1 bg-gray-500 text-white text-xs font-bold rounded-full">Archivado</span>}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{vehicle.brand} {vehicle.model}</p>
                          <span className={`inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 text-green-700' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{vehicle.status}</span>
                        </div>
                        <div className="mt-4 flex gap-1 flex-wrap">
                          {!vehicle.isArchived && (
                            <>
                              {currentUser.role !== 's4' && (
                                <select onClick={(e) => e.stopPropagation()} onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)} value={vehicle.status} className="flex-1 min-w-0 px-2 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-xs outline-none"><option value="OPERATIVO">Operativo</option><option value="OPERATIVO_CONDICIONAL">Op. Cond.</option><option value="INOPERATIVO">Inoperativo</option></select>
                              )}
                              {currentUser.role === 'super_admin' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openVehicleDetailInEditMode(vehicle);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-2 rounded-lg font-bold text-xs"
                                  title="Editar matrícula"
                                >
                                  ✏️
                                </button>
                              )}
                              {currentUser.role !== 's4' && (
                                <button onClick={(e) => { e.stopPropagation(); deleteVehicle(vehicle.id); }} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg font-bold text-sm"><TrashIcon className="h-4 w-4" /></button>
                              )}
                            </>
                          )}
                          {vehicle.isArchived && (
                            <button onClick={(e) => { e.stopPropagation(); unarchiveVehicle(vehicle.id); }} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm">♻️ Restaurar</button>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedSectionMenuTab === 'avisos' && renderSectionAvisosPanel()}
              {selectedSectionMenuTab === 'control' && renderSectionControlPanel()}
              {selectedSectionMenuTab === 'itvs' && renderSectionItvsPanel()}
              {selectedSectionMenuTab === 'mensajes' && renderSectionMessagesPanel()}
              {selectedSectionMenuTab === 'parte-carga' && renderParteCargaPanel()}
              {selectedSectionMenuTab === 'novedades' && renderSectionNovedadesPanel()}
            </div>
          </main>
        </div>
      );
    }

    // Si está en company-detail, mostrar esa vista
    if (view === 'company-detail') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

          <div className="space-y-6">
            {(currentUser.role === 'super_admin' || currentUser.role === 's4') && (
              <button
                onClick={() => {
                  if (currentUser.role === 's4') {
                    setSelectedCompanyId(null);
                    setView('s4-dashboard');
                  } else {
                    setView('dashboard');
                    setSelectedCompanyId(null);
                  }
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors"
              >
                ← {currentUser.role === 's4' ? 'Volver a Unidad' : 'Volver a Compañias'}
              </button>
            )}
            
            <div className="flex items-center justify-between">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Secciones</h1>
              {currentUser.role !== 's4' && (
                <button onClick={() => setShowNewSectionForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold">➕ NUEVA SECCIÓN</button>
              )}
            </div>

            {showNewSectionForm && currentUser.role !== 's4' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-2xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Crear Nueva Sección</h2>
                <form onSubmit={handleCreateSection} className="space-y-5">
                  <input type="text" spellCheck="false" placeholder="Nombre de sección" value={newSectionForm.sectionName} onChange={(e) => setNewSectionForm({ sectionName: e.target.value })} className="w-full px-5 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" required />
                  <div className="flex gap-3">
                    <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Creando...' : 'CREAR SECCIÓN'}</button>
                    <button type="button" onClick={() => setShowNewSectionForm(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-4 rounded-xl font-bold">CANCELAR</button>
                  </div>
                </form>
              </div>
            )}

            {!selectedCompanyId ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-6 py-4 rounded-xl">
                <p className="font-semibold">⚠️ Error: No se seleccionó una compañía</p>
              </div>
            ) : sections.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-4 rounded-xl">
                <p className="font-semibold">{currentUser.role === 's4' ? 'ℹ️ Esta compañía aún no tiene secciones.' : 'ℹ️ No hay secciones. Crea una nueva con el botón "NUEVA SECCIÓN"'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sections.map(section => (
                  <div key={section.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col justify-between min-h-64">
                  {editingSectionId === section.id ? (
                    <div className="space-y-3">
                      <input type="text" spellCheck="false" value={editSectionName} onChange={(e) => setEditSectionName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">Código de acceso: {section.accessCode}</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditSectionName(section.id, editSectionName)} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50">Guardar</button>
                        <button onClick={() => { setEditingSectionId(null); setEditSectionName(''); }} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-2 rounded-lg font-bold text-sm">Descartar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-gray-900">{section.name}</h3>
                      {currentUser.role !== 's4' && (
                        <p className="text-xs text-gray-500 mt-2">Código de acceso: {section.accessCode}</p>
                      )}
                      <div className="mt-4 flex gap-2 flex-wrap">
                        <button onClick={() => { setSelectedSectionId(section.id); setView('section-detail'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Entrar</button>
                        {currentUser.role !== 's4' && (
                          <>
                            <button onClick={() => { setEditingSectionId(section.id); setEditSectionName(section.name); }} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Renombrar</button>
                            <button onClick={() => deleteSection(section.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Eliminar</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
    }

    // PARTE RELEVO FORM VIEW - MUST BE BEFORE VEHICLE DETAIL
    if (view === 'parte-relevo-form') {
      const vehicle = selectedVehicleForParteRelevo || vehicles.find(v => v.id === selectedVehicleId) || null;
      if (!vehicle) {
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              <p className="text-red-600 font-semibold">Error: Vehículo no encontrado</p>
              <button onClick={() => setView('companies-menu')} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Volver</button>
            </main>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl"><p className="font-semibold">Error: {error}</p></div>}
            {parteRelevoSaveStatus && !error && <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-xl"><p className="font-semibold">{parteRelevoSaveStatus}</p></div>}
            <button 
              onClick={() => requestNavigation(() => {
                setSelectedVehicleId(vehicle.id);
                setView('vehicle-detail');
                setSelectedVehicleForParteRelevo(null);
              })} 
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
            >
              ← Volver a {vehicle.plate}
            </button>

            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">📋 Parte Relevo - {vehicle.plate}</h1>

            <ParteRelevoForm
              vehicleType={vehicle.vehicleType}
              vehicleId={vehicle.id}
              onDirtyChange={handleParteRelevoDirtyChange}
              onSaved={handleParteRelevoSaved}
              onSaveError={handleParteRelevoSaveError}
              onDiscarded={handleParteRelevoDiscarded}
              saveTick={parteRelevoSaveTick}
              discardTick={parteRelevoDiscardTick}
              currentUsername={currentUser?.username}
            />
          </main>
          {parteRelevoDirty && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 text-amber-900 px-6 py-4 rounded-xl flex items-center justify-between gap-4 shadow-lg">
              <div className="text-sm font-semibold">Tienes cambios sin guardar.</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setParteRelevoSaveTick((prev) => prev + 1)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
                >
                  GUARDAR
                </button>
                <button
                  onClick={() => setParteRelevoDiscardTick((prev) => prev + 1)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
                >
                  DESCARTAR
                </button>
              </div>
            </div>
          )}
          {showUnsavedPrompt && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Cambios sin guardar</h3>
                <p className="text-sm text-gray-600 mb-6">Quieres guardar la informacion antes de continuar?</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleUnsavedSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
                  >
                    GUARDAR
                  </button>
                  <button
                    onClick={handleUnsavedDiscard}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
                  >
                    DESCARTAR
                  </button>
                  <button
                    onClick={handleUnsavedCancel}
                    className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-bold"
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // VEHICLE DETAIL VIEW
    if (view === 'vehicle-detail' && selectedVehicleId) {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (!vehicle) {
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-8">
              <div className="text-center">
                <p className="text-red-600 font-semibold">Vehículo no encontrado</p>
                <button onClick={() => { setView('section-detail'); setSelectedVehicleId(null); }} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold">Volver</button>
              </div>
            </main>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-8">
            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl"><p className="font-semibold">Error: {error}</p></div>}
            {vehicleSaveFeedback && (
              <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-xl">
                <p className="font-semibold">{vehicleSaveFeedback}</p>
              </div>
            )}
            {dirtyState.any && (
              <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 px-6 py-4 rounded-xl flex items-center justify-between gap-4">
                <div className="text-sm font-semibold">Tienes cambios sin guardar.</div>
                <div className="flex gap-2">
                  <button
                    onClick={saveAllDirtySections}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
                  >
                    GUARDAR
                  </button>
                  <button
                    onClick={discardUnsavedChanges}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
                  >
                    DESCARTAR
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
              <button onClick={() => requestNavigation(() => { 
                // Si encargado_cia/encargado_vehiculos está viendo una sección, vuelve a section-detail
                if ((currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') && selectedSectionId) {
                  setView('section-detail');
                } else if (currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') {
                  setView('dashboard');
                } else if (currentUser.role === 'operador' || currentUser.role === 'encargado_seccion' || currentUser.role === 'consulta') {
                  setView('dashboard');
                } else if (currentUser.role === 's4') {
                  setView('section-detail');
                } else {
                  setView('section-detail');
                }
                setSelectedVehicleId(null); 
              })} className="text-blue-600 hover:text-blue-800 font-bold">← Volver</button>
              <div className="flex gap-2">
                {(currentUser.role === 'operador' || currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos' || currentUser.role === 'encargado_seccion' || currentUser.role === 'super_admin') && (
                  <button onClick={() => requestNavigation(() => { setSelectedVehicleId(vehicle.id); setSelectedVehicleForParteRelevo(vehicle); setView('parte-relevo-form'); })} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold">📄 PARTE RELEVO</button>
                )}

                {hasPermission('archive_vehicle') && (
                  <button onClick={() => archiveVehicle(selectedVehicleId!)} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-bold">📦 Archivar</button>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
              {editingVehicleId === vehicle.id ? (
                // EDIT MODE
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">✏️ Editar Vehículo</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Matrícula</label>
                      <input 
                        type="text"
                        spellCheck="false"
                        value={editVehicleForm.plate}
                        onChange={(e) => setEditVehicleForm({ ...editVehicleForm, plate: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Marca</label>
                      <input 
                        type="text"
                        spellCheck="false"
                        value={editVehicleForm.brand}
                        onChange={(e) => setEditVehicleForm({ ...editVehicleForm, brand: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Modelo</label>
                      <input 
                        type="text"
                        spellCheck="false"
                        value={editVehicleForm.model}
                        onChange={(e) => setEditVehicleForm({ ...editVehicleForm, model: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={async () => {
                        const saved = await updateVehicleInfo(vehicle.id, editVehicleForm.plate, editVehicleForm.brand, editVehicleForm.model);
                        if (saved) {
                          setEditingVehicleId(null);
                        }
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold transition-colors"
                    >
                      GUARDAR
                    </button>
                    <button 
                      onClick={() => setEditingVehicleId(null)}
                      className="flex-1 bg-gray-400 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-bold transition-colors"
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              ) : (
                // VIEW MODE
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{vehicle.plate}</h1>
                      <p className="text-lg text-gray-600 dark:text-gray-400">{vehicle.brand} {vehicle.model}</p>
                    </div>
                    {canEditVehicleInfo && (
                      <button 
                        onClick={() => {
                          setEditingVehicleId(vehicle.id);
                          setEditVehicleForm({ plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model });
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold transition-colors whitespace-nowrap"
                      >
                        ✏️ EDITAR
                      </button>
                    )}
                  </div>
                  <span className={`inline-block mt-4 px-4 py-2 rounded-full text-sm font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</span>
                  
                  {/* AUDITORÍA - Quién y cuándo */}
                  {(vehicle.lastModifiedBy || vehicle.lastModifiedAt) && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Última modificación:</span> {vehicle.lastModifiedBy || 'Sistema'} el {vehicle.lastModifiedAt ? new Date(vehicle.lastModifiedAt.toDate?.() || vehicle.lastModifiedAt).toLocaleString('es-ES') : 'N/A'}
                    </div>
                  )}
                </>
              )}
              
              <div className="mt-6 p-6 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-200 dark:border-slate-600">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tipo de Vehículo</label>
                    <select 
                      value={editVehicleType}
                      onChange={(e) => setEditVehicleType(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="bn1">BN1</option>
                      <option value="bn3">BN3</option>
                      <option value="portaspike">Portaspike</option>
                      <option value="s3">S3</option>
                      <option value="anibal">Aníbal</option>
                      <option value="landtrek">Landtrek</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleSaveVehicleType}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                    >
                      GUARDAR
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 border-b border-gray-200 dark:border-slate-700 relative">
                <div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-white to-transparent dark:from-slate-800 z-10" />
                <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white to-transparent dark:from-slate-800 z-10" />
                <div className="flex gap-4 overflow-x-auto whitespace-nowrap px-2 pb-2 touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <button onClick={() => requestNavigation(() => setSelectedVehicleMenuTab('transmisiones'))} className={`shrink-0 px-6 py-3 font-bold border-b-2 transition-colors ${selectedVehicleMenuTab === 'transmisiones' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>📻 Transmisiones</button>
                  <button onClick={() => requestNavigation(() => setSelectedVehicleMenuTab('movimientos'))} className={`shrink-0 px-6 py-3 font-bold border-b-2 transition-colors ${selectedVehicleMenuTab === 'movimientos' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>🚗 Movimientos</button>
                  <button onClick={() => requestNavigation(() => setSelectedVehicleMenuTab('incidencias'))} className={`shrink-0 px-6 py-3 font-bold border-b-2 transition-colors ${selectedVehicleMenuTab === 'incidencias' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>⚠️ Incidencias</button>
                  <button onClick={() => requestNavigation(() => setSelectedVehicleMenuTab('avisos'))} className={`shrink-0 px-6 py-3 font-bold border-b-2 transition-colors ${selectedVehicleMenuTab === 'avisos' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>🔔 Avisos</button>
                </div>
              </div>

              {/* CONTENIDO DE CADA TAB */}
              <div className="mt-8">
                {selectedVehicleMenuTab === 'transmisiones' && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📻 Transmisiones</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {vehicleTransmisiones.map((item, idx) => {
                        const hasVersion = 'version' in item;
                        return (
                          <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
                            <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.presente}
                                onChange={(e) => {
                                  const next = vehicleTransmisiones.map((t, i) => i === idx ? { ...t, presente: e.target.checked } : t);
                                  setVehicleTransmisiones(next);
                                }}
                                className="w-5 h-5 rounded accent-blue-600 flex-shrink-0"
                              />
                              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.nombre}</span>
                            </label>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {hasVersion && (
                                <select
                                  value={item.version ?? ''}
                                  onChange={(e) => {
                                    const next = vehicleTransmisiones.map((t, i) => i === idx ? { ...t, version: e.target.value } : t);
                                    setVehicleTransmisiones(next);
                                  }}
                                  className="w-16 px-1 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                >
                                  <option value="">---</option>
                                  <option value="V1">V1</option>
                                  <option value="V3">V3</option>
                                </select>
                              )}
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.cantidad ?? 0}
                                onChange={(e) => {
                                  const qty = Math.max(0, parseInt(e.target.value, 10) || 0);
                                  const next = vehicleTransmisiones.map((t, i) => i === idx ? { ...t, cantidad: qty } : t);
                                  setVehicleTransmisiones(next);
                                }}
                                className="w-16 px-2 py-1 text-sm text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={handleSaveTransmisiones}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                      >
                        GUARDAR
                      </button>
                    </div>
                  </div>
                )}

                {selectedVehicleMenuTab === 'movimientos' && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">🚗 Movimientos</h2>
                    
                    {/* NUEVO REGISTRO */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-4xl mb-8">
                      <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-6">NUEVO REGISTRO</h3>
                      
                      <div className="space-y-5">
                        {/* Inicio y Fin */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-sm text-gray-600 mb-2">Inicio</label>
                            <input 
                              type="text" 
                              placeholder="dd/mm/yyyy --:--"
                              value={newMovement.fechaInicio}
                              onChange={(e) => setNewMovement({ ...newMovement, fechaInicio: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-2">Fin</label>
                            <input 
                              type="text" 
                              placeholder="dd/mm/yyyy --:--"
                              value={newMovement.fechaFin}
                              onChange={(e) => setNewMovement({ ...newMovement, fechaFin: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Km Inicial y Km Final */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-sm text-gray-600 mb-2">Km Inicial</label>
                            <input 
                              type="number" 
                              placeholder="Km Inicial"
                              value={newMovement.kmInicial}
                              onChange={(e) => setNewMovement({ ...newMovement, kmInicial: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-2">Km Final</label>
                            <input 
                              type="number" 
                              placeholder="Km Final"
                              value={newMovement.kmFinal}
                              onChange={(e) => setNewMovement({ ...newMovement, kmFinal: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Horas */}
                        <div>
                          <label className="block text-sm text-gray-600 mb-2">Horas</label>
                          <input 
                            type="number" 
                            placeholder="Horas"
                            step="0.5"
                            value={newMovement.horas}
                            onChange={(e) => setNewMovement({ ...newMovement, horas: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                          />
                        </div>

                        {/* Botón REGISTRAR */}
                        <button
                          onClick={() => {
                            if (newMovement.fechaInicio && newMovement.fechaFin && newMovement.kmInicial && newMovement.kmFinal && newMovement.horas) {
                              setVehicleMovements([
                                ...vehicleMovements,
                                {
                                  id: Math.random().toString(36).substr(2, 9),
                                  fechaInicio: newMovement.fechaInicio,
                                  horaInicio: newMovement.horaInicio,
                                  fechaFin: newMovement.fechaFin,
                                  horaFin: newMovement.horaFin,
                                  kmInicial: parseFloat(newMovement.kmInicial),
                                  kmFinal: parseFloat(newMovement.kmFinal),
                                  horas: parseFloat(newMovement.horas)
                                }
                              ]);
                              setNewMovement({ fechaInicio: '', horaInicio: '', fechaFin: '', horaFin: '', kmInicial: '', kmFinal: '', horas: '' });
                            }
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-bold text-lg"
                        >
                          REGISTRAR
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end mb-6">
                      <button
                        onClick={handleSaveMovimientos}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                      >
                        GUARDAR
                      </button>
                    </div>

                    {/* LISTA DE MOVIMIENTOS */}
                    {vehicleMovements.length > 0 && (
                      <div className="space-y-4 mb-8">
                        {vehicleMovements.map((movement) => (
                          <div key={movement.id} className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm text-gray-600">{movement.fechaInicio} → {movement.fechaFin}</p>
                              <p className="text-lg font-bold text-gray-900">{(movement.kmFinal - movement.kmInicial).toFixed(0)} km</p>
                            </div>
                            <button
                              onClick={() => {
                                if (!window.confirm('¿Eliminar este movimiento?')) return;
                                setVehicleMovements(vehicleMovements.filter(m => m.id !== movement.id));
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TOTALES */}
                    <div className="bg-gray-900 rounded-2xl p-8 grid grid-cols-2 gap-8 text-center">
                      <div>
                        <p className="text-gray-500 text-sm uppercase tracking-wider mb-2">TOTAL KM</p>
                        <p className="text-5xl font-bold text-white">
                          {vehicleMovements.reduce((sum, m) => sum + (m.kmFinal - m.kmInicial), 0).toFixed(0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm uppercase tracking-wider mb-2">TOTAL HORAS</p>
                        <p className="text-5xl font-bold text-white">
                          {vehicleMovements.reduce((sum, m) => sum + m.horas, 0).toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedVehicleMenuTab === 'incidencias' && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">⚠️ Incidencias</h2>
                    
                    {/* NUEVA INCIDENCIA */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-4xl mb-8">
                      <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-6">NUEVA INCIDENCIA</h3>
                      
                      <div className="space-y-5">
                        {/* Título */}
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Incidencia</label>
                          <input 
                            type="text" 
                            placeholder="Descripción de la incidencia..."
                            value={newIncidencia.titulo}
                            onChange={(e) => setNewIncidencia({ ...newIncidencia, titulo: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                          />
                        </div>

                        {/* Notas */}
                        <div>
                          <label className="block text-sm text-gray-600 mb-2">Notas</label>
                          <textarea 
                            placeholder="Añadir notas..."
                            value={newIncidencia.notas}
                            onChange={(e) => setNewIncidencia({ ...newIncidencia, notas: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={3}
                          />
                        </div>

                        {/* Observaciones */}
                        <div>
                          <label className="block text-sm text-gray-600 mb-2">Observaciones</label>
                          <textarea 
                            placeholder="Añadir observaciones..."
                            value={newIncidencia.observaciones}
                            onChange={(e) => setNewIncidencia({ ...newIncidencia, observaciones: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={3}
                          />
                        </div>

                        {/* Botón REGISTRAR */}
                        <button
                          onClick={async () => {
                            const titulo = newIncidencia.titulo.trim();
                            if (!titulo) return;

                            const updatedIncidencias = [
                              ...vehicleIncidencias,
                              {
                                id: createLocalId(),
                                titulo,
                                notas: newIncidencia.notas,
                                observaciones: newIncidencia.observaciones,
                                fecha: new Date().toLocaleDateString('es-ES')
                              }
                            ];

                            setVehicleIncidencias(updatedIncidencias);
                            await saveVehicleSection('incidencias', { incidenciasState: updatedIncidencias });
                            setNewIncidencia({ titulo: '', notas: '', observaciones: '' });
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-bold text-lg"
                        >
                          REGISTRAR INCIDENCIA
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end mb-6">
                      <button
                        onClick={handleSaveIncidencias}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                      >
                        GUARDAR
                      </button>
                    </div>

                    {/* LISTA DE INCIDENCIAS */}
                    {vehicleIncidencias.length > 0 && (
                      <div className="space-y-4">
                        {vehicleIncidencias.map((incidencia) => (
                          <div key={incidencia.id} className="bg-white rounded-xl border border-gray-200 p-6">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <p className="text-sm text-gray-500">{incidencia.fecha}</p>
                                <h3 className="text-lg font-bold text-gray-900 mt-1">{incidencia.titulo}</h3>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!window.confirm('¿Eliminar esta incidencia?')) return;
                                  const updatedIncidencias = vehicleIncidencias.filter(i => i.id !== incidencia.id);
                                  setVehicleIncidencias(updatedIncidencias);
                                  await saveVehicleSection('incidencias', { incidenciasState: updatedIncidencias });
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold ml-4"
                              >
                                🗑️
                              </button>
                            </div>
                            
                            {incidencia.notas && (
                              <div className="mb-3">
                                <p className="text-sm text-gray-600 font-semibold mb-1">Notas:</p>
                                <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">{incidencia.notas}</p>
                              </div>
                            )}
                            
                            {incidencia.observaciones && (
                              <div className="mb-4">
                                <p className="text-sm text-gray-600 font-semibold mb-1">Observaciones:</p>
                                <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">{incidencia.observaciones}</p>
                              </div>
                            )}

                            {/* COMENTARIOS */}
                            {incidencia.comentarios && incidencia.comentarios.length > 0 && (
                              <div className="mb-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <p className="text-sm font-bold text-blue-700 mb-3">💬 Comentarios ({incidencia.comentarios.length})</p>
                                <div className="space-y-2">
                                  {incidencia.comentarios.map(com => (
                                    <div key={com.id} className="bg-white rounded p-2 text-sm">
                                      <p className="font-semibold text-gray-900">{com.usuario} <span className="text-gray-500 font-normal text-xs">({com.fecha})</span></p>
                                      <p className="text-gray-700 mt-1">{com.texto}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* AGREGAR COMENTARIO */}
                            {selectedIncidenciaId === incidencia.id ? (
                              <div className="bg-gray-50 rounded-lg p-4 mt-4 border border-gray-200">
                                <textarea
                                  placeholder="Escribe un comentario..."
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => addCommentToIncidencia(incidencia.id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm"
                                  >
                                    Comentar
                                  </button>
                                  <button
                                    onClick={() => { setSelectedIncidenciaId(null); setNewComment(''); }}
                                    className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-bold text-sm"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setSelectedIncidenciaId(incidencia.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-semibold mt-3"
                              >
                                + Comentar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {vehicleIncidencias.length === 0 && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-4 rounded-xl text-center">
                        <p className="font-semibold">ℹ️ No hay incidencias registradas</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedVehicleMenuTab === 'avisos' && (() => {
                  const now = new Date();
                  const activeVehicleAvisos = vehicleAvisos.filter(a => shouldShowVehicleAviso(a, now));
                  const pendingVehicleAvisos = vehicleAvisos.filter(a => !shouldShowVehicleAviso(a, now));
                  return (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">🔔 Avisos</h2>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-4xl mb-8">
                      <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-6">NUEVO AVISO</h3>

                      <div className="space-y-4">
                        <textarea
                          placeholder="Ej: Mañana a primera hora ir a escalón"
                          value={newAviso}
                          onChange={(e) => setNewAviso(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={3}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <select
                            value={newAvisoMode}
                            onChange={(e) => setNewAvisoMode(e.target.value as VehicleAvisoModo)}
                            className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="persistent">Único (hasta marcar hecho)</option>
                            <option value="weekly">Semanal recurrente</option>
                            <option value="scheduled">Programado (fecha y hora)</option>
                          </select>
                          {newAvisoMode === 'weekly' && (
                            <>
                              <select
                                value={newAvisoWeeklyDay}
                                onChange={(e) => setNewAvisoWeeklyDay(Number(e.target.value))}
                                className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {WEEK_DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                              </select>
                              <input
                                type="time"
                                value={newAvisoWeeklyTime}
                                onChange={(e) => setNewAvisoWeeklyTime(e.target.value)}
                                className="px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </>
                          )}
                          {newAvisoMode === 'scheduled' && (
                            <input
                              type="datetime-local"
                              value={newAvisoScheduledDate}
                              onChange={(e) => setNewAvisoScheduledDate(e.target.value)}
                              className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const text = newAviso.trim();
                            if (!text) return;
                            if (newAvisoMode === 'scheduled' && !newAvisoScheduledDate) {
                              alert('Selecciona la fecha y hora de programación');
                              return;
                            }
                            if (newAvisoMode === 'weekly' && !newAvisoWeeklyTime) {
                              alert('Selecciona la hora del aviso semanal');
                              return;
                            }
                            setVehicleAvisos([
                              ...vehicleAvisos,
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                texto: text,
                                fecha: new Date().toLocaleString('es-ES'),
                                creadoPor: currentUser?.username || 'Sistema',
                                modo: newAvisoMode,
                                ...(newAvisoMode === 'scheduled' && { scheduledDate: new Date(newAvisoScheduledDate).toISOString() }),
                                ...(newAvisoMode === 'weekly' && { weeklyDay: newAvisoWeeklyDay, weeklyTime: newAvisoWeeklyTime }),
                              }
                            ]);
                            setNewAviso('');
                            if (newAvisoMode === 'scheduled') setNewAvisoScheduledDate('');
                            if (newAvisoMode === 'weekly') { setNewAvisoWeeklyDay(3); setNewAvisoWeeklyTime('07:00'); }
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-bold text-lg"
                        >
                          AÑADIR AVISO
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end mb-6">
                      <button
                        onClick={handleSaveAvisos}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
                      >
                        GUARDAR
                      </button>
                    </div>

                    {activeVehicleAvisos.length > 0 && (
                      <div className="space-y-4 mb-6">
                        {activeVehicleAvisos.map((aviso) => (
                          <div key={aviso.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">{aviso.fecha}</p>
                                <p className="text-base font-semibold text-amber-900 dark:text-amber-100">{aviso.texto}</p>
                                {aviso.creadoPor && (
                                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">Creado por: {aviso.creadoPor}</p>
                                )}
                                {aviso.modo === 'scheduled' && aviso.scheduledDate && (
                                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">⏰ Programado: {new Date(aviso.scheduledDate).toLocaleString('es-ES')}</p>
                                )}
                                {aviso.modo === 'weekly' && aviso.weeklyTime && (
                                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">🔁 Semanal: {WEEK_DAYS.find(d => d.value === aviso.weeklyDay)?.label ?? ''} {aviso.weeklyTime}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  if (aviso.modo === 'weekly') {
                                    if (!window.confirm('¿Marcar este aviso como hecho esta semana?')) return;
                                    const now = new Date();
                                    const occ = getWeeklyOccurrenceStart(aviso as SectionAvisoItem, now);
                                    setVehicleAvisos(vehicleAvisos.map(a =>
                                      a.id === aviso.id ? { ...a, lastCompletedOccurrence: occ ? occ.toISOString() : new Date().toISOString() } : a
                                    ));
                                  } else {
                                    if (!window.confirm('¿Marcar este aviso como hecho y eliminarlo de la lista?')) return;
                                    setVehicleAvisos(vehicleAvisos.filter(a => a.id !== aviso.id));
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold"
                              >
                                ✅ Hecho
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {pendingVehicleAvisos.length > 0 && (
                      <div className="space-y-3 mb-4">
                        <button
                          onClick={() => setShowPendingAvisos(v => !v)}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          ⏰ {pendingVehicleAvisos.length} aviso{pendingVehicleAvisos.length !== 1 ? 's' : ''} programado{pendingVehicleAvisos.length !== 1 ? 's' : ''} (pendiente{pendingVehicleAvisos.length !== 1 ? 's' : ''} de activar)
                          <span className="ml-1">{showPendingAvisos ? '▲' : '▼'}</span>
                        </button>
                        {!showPendingAvisos && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">No visible en la lista de vehículos hasta su fecha de activación.</p>
                        )}
                        {showPendingAvisos && pendingVehicleAvisos.map((aviso) => (
                          <div key={aviso.id} className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl p-4 opacity-75">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-base font-semibold text-gray-700 dark:text-gray-300">{aviso.texto}</p>
                                {aviso.scheduledDate && (
                                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">⏰ Se activará el: {new Date(aviso.scheduledDate).toLocaleString('es-ES')}</p>
                                )}
                                {aviso.creadoPor && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Creado por: {aviso.creadoPor}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  if (!window.confirm('¿Eliminar este aviso programado?')) return;
                                  setVehicleAvisos(vehicleAvisos.filter(a => a.id !== aviso.id));
                                }}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg font-bold text-sm"
                              >
                                🗑 Borrar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {vehicleAvisos.length === 0 && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-xl px-6 py-4">
                        <p className="font-semibold">ℹ️ No hay avisos activos para este vehículo</p>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>

              {dirtyState.any && (
                <div className="sticky bottom-6 mt-8 bg-amber-50 border border-amber-200 text-amber-900 px-6 py-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold">Tienes cambios sin guardar.</div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveAllDirtySections}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
                    >
                      GUARDAR
                    </button>
                    <button
                      onClick={discardUnsavedChanges}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
                    >
                      DESCARTAR
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
          {showUnsavedPrompt && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Cambios sin guardar</h3>
                <p className="text-sm text-gray-600 mb-6">Quieres guardar la informacion antes de continuar?</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleUnsavedSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
                  >
                    GUARDAR
                  </button>
                  <button
                    onClick={handleUnsavedDiscard}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
                  >
                    DESCARTAR
                  </button>
                  <button
                    onClick={handleUnsavedCancel}
                    className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-bold"
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // COMPANY DETAIL VIEW - para super_admin viendo detalles de una compañía
    if ((view as ViewState) === 'company-detail') {
      const company = companies.find(c => c.id === selectedCompanyId);
      
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <button onClick={() => { setSelectedCompanyId(null); setView('dashboard'); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-4 transition-colors">← Volver</button>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{company?.name || 'Compania'}</h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">Gestion y administracion</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => { setUsersManagementBackView('company-detail'); setView('users-management'); }} className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-8 py-12 rounded-2xl shadow-lg font-bold text-lg transition-all flex flex-col items-center gap-4">
                  <span className="text-4xl">👥</span>
                  <span>Usuarios</span>
                </button>

                <button onClick={() => { loadAuditReportData(); setView('audit-report'); }} className="bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white px-8 py-12 rounded-2xl shadow-lg font-bold text-lg transition-all flex flex-col items-center gap-4">
                  <span className="text-4xl">📊</span>
                  <span>Auditoría</span>
                </button>

                <button onClick={() => setView('audit-log')} className="bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-8 py-12 rounded-2xl shadow-lg font-bold text-lg transition-all flex flex-col items-center gap-4">
                  <span className="text-4xl">📋</span>
                  <span>Registro</span>
                </button>

                <button onClick={createTestData} className="bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white px-8 py-12 rounded-2xl shadow-lg font-bold text-lg transition-all flex flex-col items-center gap-4">
                  <span className="text-4xl">🧪</span>
                  <span>Prueba</span>
                </button>

                <button onClick={() => { loadTestCompaniesForDeletion(); setView('cleanup-test-data'); }} className="bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-8 py-12 rounded-2xl shadow-lg font-bold text-lg transition-all flex flex-col items-center gap-4">
                  <span className="text-4xl">🗑️</span>
                  <span>Limpiar</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    // USERS MANAGEMENT VIEW - Solo para super_admin
    if (currentUser?.role === 'super_admin' && view === 'users-management') {
      const usersWithContext = users.map((user) => ({ user, context: resolveUserContext(user) }));
      const superAdminUsers = usersWithContext.filter(({ user }) => user.role === 'super_admin');
      const groupedByCompany = usersWithContext
        .filter(({ user }) => user.role !== 'super_admin')
        .reduce((acc, item) => {
          const companyName = item.context.companyName || 'Sin compañía';
          const key = companyName;
          if (!acc[key]) {
            acc[key] = {
              companyName,
              unitName: item.context.unitName || 'N/A',
              companyManagers: [] as Array<{ username: string; sectionName: string }> ,
              sectionManagers: [] as Array<{ username: string; sectionName: string }> ,
              operators: [] as Array<{ username: string; sectionName: string }> ,
              readers: [] as Array<{ username: string; sectionName: string }>
            };
          }

          const userEntry = {
            username: item.user.username,
            sectionName: item.context.sectionName || 'N/A'
          };

          if (item.user.role === 'encargado_cia') acc[key].companyManagers.push(userEntry);
          if (item.user.role === 'encargado_vehiculos') acc[key].companyManagers.push(userEntry);
          if (item.user.role === 'encargado_seccion') acc[key].sectionManagers.push(userEntry);
          if (item.user.role === 'operador') acc[key].operators.push(userEntry);
          if (item.user.role === 'consulta') acc[key].readers.push(userEntry);

          return acc;
        }, {} as Record<string, {
          companyName: string;
          unitName: string;
          companyManagers: Array<{ username: string; sectionName: string }>;
          sectionManagers: Array<{ username: string; sectionName: string }>;
          operators: Array<{ username: string; sectionName: string }>;
          readers: Array<{ username: string; sectionName: string }>;
        }>);

      const companyBreakdown = Object.values(groupedByCompany).sort((a, b) => a.companyName.localeCompare(b.companyName));

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

            <div className="space-y-6">

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Usuario S4</h2>
              <form onSubmit={handleCreateS4User} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  spellCheck="false"
                  autoComplete="off"
                  name="create-s4-username"
                  placeholder="Usuario S4"
                  value={newS4Form.username}
                  onChange={(e) => setNewS4Form({ ...newS4Form, username: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <select
                  value={newS4Form.unitId}
                  onChange={(e) => setNewS4Form({ ...newS4Form, unitId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecciona una unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-s4-password"
                  placeholder="Contraseña"
                  value={newS4Form.password}
                  onChange={(e) => setNewS4Form({ ...newS4Form, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-s4-password-confirm"
                  placeholder="Confirmar contraseña"
                  value={newS4Form.passwordConfirm}
                  onChange={(e) => setNewS4Form({ ...newS4Form, passwordConfirm: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                  >
                    {loading ? 'Creando S4...' : 'Crear Usuario S4'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Encargado de Vehículos</h2>
              <form onSubmit={handleCreateEncVehUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  spellCheck="false"
                  autoComplete="off"
                  name="create-encveh-username"
                  placeholder="Usuario Encargado Vehículos"
                  value={newEncVehForm.username}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, username: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <select
                  value={newEncVehForm.companyId}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, companyId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">Selecciona una compañía</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-encveh-password"
                  placeholder="Contraseña"
                  value={newEncVehForm.password}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-encveh-password-confirm"
                  placeholder="Confirmar contraseña"
                  value={newEncVehForm.passwordConfirm}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, passwordConfirm: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                  >
                    {loading ? 'Creando...' : 'Crear Encargado de Vehículos'}
                  </button>
                </div>
              </form>
            </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Gestionar Usuarios</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Total: {users.length} usuarios</p></div>
                <button onClick={() => { setError(''); if (usersManagementBackView === 'companies-list') { setSelectedCompanyId(null); } setView(usersManagementBackView); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl shadow-lg font-bold w-full sm:w-auto">← Volver</button>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Desglose por compania</h2>

                {superAdminUsers.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <p className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">Super Admin</p>
                    <p className="text-sm text-red-700 dark:text-red-200">{superAdminUsers.map(({ user }) => user.username).join(', ')}</p>
                  </div>
                )}

                {companyBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No hay usuarios asignados a companias todavia.</p>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {companyBreakdown.map((group) => (
                      <div key={group.companyName} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-700/40 space-y-3">
                        <div>
                          <p className="text-base font-bold text-gray-900 dark:text-white">🏢 {group.companyName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Unidad: {group.unitName}</p>
                        </div>

                        <div className="text-sm">
                          <p className="font-semibold text-purple-700 dark:text-purple-300">Encargado de compania</p>
                          <p className="text-gray-700 dark:text-gray-300">{group.companyManagers.length ? group.companyManagers.map((u) => u.username).join(', ') : 'Sin asignar'}</p>
                        </div>

                        <div className="text-sm">
                          <p className="font-semibold text-blue-700 dark:text-blue-300">Jefes de seccion</p>
                          <p className="text-gray-700 dark:text-gray-300">{group.sectionManagers.length ? group.sectionManagers.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                        </div>

                        <div className="text-sm">
                          <p className="font-semibold text-green-700 dark:text-green-300">Operadores</p>
                          <p className="text-gray-700 dark:text-gray-300">{group.operators.length ? group.operators.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                        </div>

                        <div className="text-sm">
                          <p className="font-semibold text-gray-700 dark:text-gray-300">Consulta</p>
                          <p className="text-gray-700 dark:text-gray-300">{group.readers.length ? group.readers.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {users.length === 0 ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl text-center">
                  <p className="font-semibold">ℹ️ No hay usuarios registrados</p>
                  <p className="text-sm mt-2">Los usuarios aparecerán aquí cuando se registren o sean creados al crear una compañía.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto pb-2">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Usuario</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Rol</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Unidad</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Compania</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Sección</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Creado</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 dark:text-white">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user, idx) => {
                          const userContext = resolveUserContext(user);
                          return (
                            <tr key={user.id} className={`border-b border-gray-200 dark:border-slate-700 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-700'} hover:bg-blue-50 dark:hover:bg-blue-900/20`}>
                              <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">{user.username}</td>
                              <td className="px-6 py-4 text-sm">
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                  user.role === 'super_admin' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                  user.role === 'encargado_cia' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                                  user.role === 'encargado_vehiculos' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                  user.role === 'encargado_seccion' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                  user.role === 'operador' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                  'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                }`}>{user.role}</span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userContext.unitName}</td>
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userContext.companyName}</td>
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userContext.sectionName}</td>
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{user.createdAt && typeof user.createdAt === 'object' && 'toDate' in user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                              <td className="px-6 py-4 text-sm">
                                <button onClick={() => deleteUser(user.id, user.username)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"><TrashIcon className="h-4 w-4 inline mr-2" />Eliminar</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      );
    }

    // SUPER ADMIN - COMPANIES LIST VIEW (por defecto)
    if (currentUser?.role === 'super_admin' && (view as ViewState) !== 'cleanup-test-data' && (view as ViewState) !== 'audit-report') {
      if (view === 'units') {
        const assignedCompanyIds = new Set(Object.values(unitCompanies).flat());
        const unassignedCompanies = companies.filter(company => !assignedCompanyIds.has(company.id));

        return (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

              <div className="space-y-6">
                <button
                  onClick={() => setView('companies-list')}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold"
                >
                  ← Volver
                </button>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Unidades</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Crea unidades y asigna companias por arrastre</p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-start sm:justify-end">
                    <button onClick={() => { setUsersManagementBackView('units'); setView('users-management'); }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 sm:px-8 py-3 rounded-2xl shadow-lg font-bold text-sm sm:text-base">👥 USUARIOS</button>
                    <button onClick={() => setView('companies-list')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-8 py-3 rounded-2xl shadow-lg font-bold text-sm sm:text-base">🏢 COMPANIAS</button>
                    <button onClick={() => setView('companies-menu')} className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-8 py-3 rounded-2xl shadow-lg font-bold text-sm sm:text-base">➕ NUEVA COMPANIA</button>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <form onSubmit={handleCreateUnit} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      spellCheck="false"
                      placeholder="Nombre de unidad"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                    <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50">{loading ? 'Creando...' : 'CREAR UNIDAD'}</button>
                  </form>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
                  <div className="space-y-4">
                    {units.length === 0 ? (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-6 py-4 rounded-xl text-center">
                        <p className="font-semibold">No hay unidades creadas</p>
                        <p className="text-sm mt-2">Crea una unidad para empezar a agrupar companias.</p>
                      </div>
                    ) : (
                      units.map(unit => {
                        const unitCompanyIds = unitCompanies[unit.id] || [];
                        const unitCompanyList = unitCompanyIds
                          .map(id => companies.find(company => company.id === id))
                          .filter(Boolean) as Company[];

                        return (
                          <div
                            key={unit.id}
                            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={handleDropToUnit(unit.id)}
                          >
                            <div className="flex items-center justify-between gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                {editingUnitId === unit.id ? (
                                  <div className="space-y-3">
                                    <input
                                      type="text"
                                      spellCheck="false"
                                      value={editUnitName}
                                      onChange={(e) => setEditUnitName(e.target.value)}
                                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleEditUnitName(unit.id, editUnitName)}
                                        disabled={loading}
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                                      >
                                        Guardar
                                      </button>
                                      <button
                                        onClick={() => { setEditingUnitId(null); setEditUnitName(''); }}
                                        className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg font-bold text-sm"
                                      >
                                        Descartar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{unit.name}</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Companias: {unitCompanyList.length}</p>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {editingUnitId !== unit.id && (
                                  <button
                                    onClick={() => { setEditingUnitId(unit.id); setEditUnitName(unit.name); }}
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded-lg text-xs font-bold"
                                  >
                                    Renombrar
                                  </button>
                                )}
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Arrastra aqui</span>
                              </div>
                            </div>

                            {unitCompanyList.length === 0 ? (
                              <div className="border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl p-4 text-center text-gray-400">Sin companias asignadas</div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {unitCompanyList.map(company => (
                                  <div
                                    key={company.id}
                                    draggable
                                    onDragStart={handleCompanyDragStart(company.id)}
                                    className="border border-gray-200 dark:border-slate-600 rounded-xl p-4 bg-gray-50 dark:bg-slate-700"
                                  >
                                    <p className="font-semibold text-gray-900 dark:text-white">{company.name}</p>
                                    <div className="mt-3 flex gap-2">
                                      <button onClick={() => { setSelectedCompanyId(company.id); setView('company-detail'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-bold">Ver</button>
                                      <button onClick={() => unassignCompany(company.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-bold">Quitar</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div
                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropToUnassigned}
                  >
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Companias sin unidad</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Arrastra companias a una unidad para asignar.</p>

                    {unassignedCompanies.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl p-4 text-center text-gray-400">Sin companias disponibles</div>
                    ) : (
                      <div className="space-y-3">
                        {unassignedCompanies.map(company => (
                          <div
                            key={company.id}
                            draggable
                            onDragStart={handleCompanyDragStart(company.id)}
                            className="border border-gray-200 dark:border-slate-600 rounded-xl p-4 bg-gray-50 dark:bg-slate-700"
                          >
                            <p className="font-semibold text-gray-900 dark:text-white">{company.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Arrastra para asignar</p>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </main>
          </div>
        );
      }

      if (view === 'companies-menu') {
        // Vista de crear nueva compañía
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

              <div className="space-y-6">
                <div>
                  <button onClick={() => setView('dashboard')} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors">← Volver</button>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Crear Nueva Compania</h1>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                  <form onSubmit={handleCreateCompany} className="space-y-5">
                    <input type="text" spellCheck="false" placeholder="Nombre de compañía" value={newCompanyForm.companyName} onChange={(e) => setNewCompanyForm({ ...newCompanyForm, companyName: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                    <input type="text" spellCheck="false" autoComplete="off" name="create-company-manager-username" placeholder="Usuario encargado" value={newCompanyForm.managerUsername} onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerUsername: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                    <div>
                      <div className="relative">
                        <input type={showCreateUserPassword ? 'text' : 'password'} autoComplete="new-password" name="create-company-manager-password" placeholder="Contrasena" value={newCompanyForm.managerPassword} onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerPassword: e.target.value })} className="w-full px-5 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                        <button type="button" onClick={() => setShowCreateUserPassword(!showCreateUserPassword)} className="absolute right-3 top-3.5 text-gray-500 dark:text-gray-300">
                          {showCreateUserPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                        </button>
                      </div>
                      {newCompanyForm.managerPassword && (
                        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                          <p className="text-xs font-bold text-blue-900 dark:text-blue-100 mb-2">Requisitos:</p>
                          <div className="space-y-1.5 text-xs">
                            <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).length ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).length ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                              <span>Mínimo 8 caracteres</span>
                            </div>
                            <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).uppercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).uppercase ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                              <span>Una mayúscula (A-Z)</span>
                            </div>
                            <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).lowercase ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).lowercase ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                              <span>Una minúscula (a-z)</span>
                            </div>
                            <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).number ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).number ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                              <span>Un número (0-9)</span>
                            </div>
                            <div className={`flex items-center gap-2 ${getPasswordRequirements(newCompanyForm.managerPassword).special ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              <span className={`inline-block w-3 h-3 rounded-full ${getPasswordRequirements(newCompanyForm.managerPassword).special ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                              <span>Un carácter especial (!@#$%^&*)</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input type={showCreateUserPasswordConfirm ? 'text' : 'password'} autoComplete="new-password" name="create-company-manager-password-confirm" placeholder="Confirmar contrasena" value={newCompanyForm.managerPasswordConfirm} onChange={(e) => setNewCompanyForm({ ...newCompanyForm, managerPasswordConfirm: e.target.value })} className="w-full px-5 py-3 pr-12 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                      <button type="button" onClick={() => setShowCreateUserPasswordConfirm(!showCreateUserPasswordConfirm)} className="absolute right-3 top-4 text-gray-500 dark:text-gray-300">
                        {showCreateUserPasswordConfirm ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                      {newCompanyForm.managerPassword && newCompanyForm.managerPasswordConfirm && (
                        <span className={`absolute right-10 top-4 text-lg ${newCompanyForm.managerPassword === newCompanyForm.managerPasswordConfirm ? 'text-green-500' : 'text-red-500'}`}>
                          {newCompanyForm.managerPassword === newCompanyForm.managerPasswordConfirm ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold disabled:opacity-50 transition-colors">{loading ? 'Creando...' : 'CREAR COMPAÑÍA'}</button>
                  </form>
                </div>
              </div>
            </main>
          </div>
        );
      }

      // Vista de lista de compañías (por defecto para super_admin)
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Companias</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Total: {companies.length}</p></div>
                <div className="flex gap-3 flex-wrap justify-end">
                  <button onClick={() => setView('units')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">🧭 UNIDADES</button>
                  <button onClick={() => { setUsersManagementBackView('companies-list'); setView('users-management'); }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">👥 USUARIOS</button>
                  <button onClick={createTestData} className="bg-orange-600 hover:bg-orange-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">🧪 TEST</button>
                  <button onClick={() => { loadTestCompaniesForDeletion(); setView('cleanup-test-data'); }} className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">🗑️ LIMPIAR</button>
                  <button onClick={() => { loadAuditReportData(); setView('audit-report'); }} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">📊 AUDIT</button>
                  <button onClick={() => setView('companies-menu')} className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-8 py-4 rounded-2xl shadow-lg font-bold text-sm sm:text-base">➕ NUEVA</button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {companies.map(company => (
                  <div key={company.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col justify-between min-h-64">
                    {editingCompanyId === company.id ? (
                      <div className="space-y-3">
                        <input type="text" spellCheck="false" value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                        <div className="flex gap-2">
                          <button onClick={() => handleEditCompanyName(company.id, editCompanyName)} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50 transition-colors">Guardar</button>
                          <button onClick={() => { setEditingCompanyId(null); setEditCompanyName(''); }} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg font-bold text-sm transition-colors">Descartar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{company.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">{typeof company.createdAt === 'object' && 'toDate' in company.createdAt ? company.createdAt.toDate().toLocaleDateString() : 'Fecha no disponible'}</p>
                        <div className="mt-6 flex gap-2 flex-wrap">
                          <button onClick={() => { setSelectedCompanyId(company.id); setView('company-detail'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">Entrar</button>
                          <button onClick={() => { setEditingCompanyId(company.id); setEditCompanyName(company.name); }} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">Renombrar</button>
                          <button onClick={() => deleteCompany(company.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">Eliminar</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      );
    }

    // SECTION DETAIL VIEW - para otros roles (no super_admin que ya tiene su propia vista, ni encargado_cia)
    if ((currentUser?.role === 'encargado_seccion' || currentUser?.role === 'operador') && (view as ViewState) === 'section-detail') {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {error && <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors"><p className="font-semibold">Error: {error}</p></div>}

            <button onClick={() => { setView('dashboard'); setSelectedSectionId(null); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6 transition-colors">← Volver</button>

            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {(() => {
                  const currentSection = sections.find(s => s.id === selectedSectionId);
                  return (
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
                      {currentSection && (
                        <div className="text-gray-600 dark:text-gray-300 mt-3 space-y-1">
                          <p><strong className="text-gray-900 dark:text-white">Sección:</strong> {currentSection.name}</p>
                          <p className="font-mono text-sm bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded inline-block">
                            <strong>Código:</strong> {currentSection.accessCode}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(currentUser.role === 'encargado_seccion' || currentUser.role === 'operador' || currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') && (
                  <button onClick={() => setShowNewVehicleForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl shadow-lg font-bold flex-shrink-0">➕ NUEVO VEHÍCULO</button>
                )}
              </div>

              {showNewVehicleForm && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 max-w-2xl transition-colors">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Agregar Vehículo</h2>
                  <form onSubmit={handleAddVehicle} className="space-y-5">
                    <input type="text" spellCheck="false" placeholder="Placa" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                    <input type="text" spellCheck="false" placeholder="Marca" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                    <input type="text" spellCheck="false" placeholder="Modelo" value={newVehicleForm.model} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors" required />
                    <select value={newVehicleForm.vehicleType} onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value as any })} className="w-full px-5 py-3 border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                      <option value="bn1">BN1</option>
                      <option value="bn3">BN3</option>
                      <option value="portaspike">Portaspike</option>
                      <option value="s3">S3</option>
                      <option value="anibal">Aníbal</option>
                      <option value="landtrek">Landtrek</option>
                    </select>
                    <div className="flex gap-3">
                      <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold">{loading ? 'Agregando...' : 'AGREGAR VEHÍCULO'}</button>
                      <button type="button" onClick={() => setShowNewVehicleForm(false)} className="flex-1 bg-gray-300 dark:bg-slate-600 hover:bg-gray-400 dark:hover:bg-slate-500 text-gray-800 dark:text-gray-200 py-4 rounded-xl font-bold">CANCELAR</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map(vehicle => (
                  <div key={vehicle.id} className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 transition-colors">
                    {getVehicleIncidenciasCount(vehicle) > 0 && (
                      <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        ⚠️ {getVehicleIncidenciasCount(vehicle)}
                      </div>
                    )}
                    {getVehicleAvisosCount(vehicle) > 0 && (
                      <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                        🔔 {getVehicleAvisosCount(vehicle)}
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{vehicle.plate}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{vehicle.brand} {vehicle.model}</p>
                    <span className={`inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{vehicle.status}</span>
                    {canChangeVehicleStatus && (
                      <div className="mt-4 flex gap-2">
                        <select onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)} defaultValue={vehicle.status} className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors"><option value="OPERATIVO">Operativo</option><option value="OPERATIVO_CONDICIONAL">Op. Cond.</option><option value="INOPERATIVO">Inoperativo</option></select>
                        {(currentUser.role === 'encargado_seccion' || currentUser.role === 'operador' || currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') && <button onClick={() => deleteVehicle(vehicle.id)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"><TrashIcon className="h-4 w-4" /></button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {vehicles.map(vehicle => (
                <div key={vehicle.id} className="relative bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  {getVehicleIncidenciasCount(vehicle) > 0 && (
                    <div className="absolute -top-2 left-3 bg-red-600 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                      ⚠️ {getVehicleIncidenciasCount(vehicle)}
                    </div>
                  )}
                  {getVehicleAvisosCount(vehicle) > 0 && (
                    <div className="absolute -top-2 right-3 bg-amber-500 text-white text-xs font-bold min-w-[1.5rem] h-6 flex items-center justify-center px-1 rounded-full shadow-lg">
                      🔔 {getVehicleAvisosCount(vehicle)}
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-gray-900">{vehicle.plate}</h3>
                  <p className="text-sm text-gray-600 mt-1">{vehicle.brand} {vehicle.model}</p>
                  <span className={`inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 text-green-700' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{vehicle.status}</span>
                  {canChangeVehicleStatus && (
                    <select onChange={(e) => updateVehicleStatus(vehicle.id, e.target.value as VehicleStatus)} defaultValue={vehicle.status} className="w-full mt-4 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"><option value="OPERATIVO">Operativo</option><option value="OPERATIVO_CONDICIONAL">Op. Cond.</option><option value="INOPERATIVO">Inoperativo</option></select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // USERS MANAGEMENT VIEW - Solo para super_admin
  if (currentUser?.role === 'super_admin' && view === 'users-management') {
    const usersWithContext = users.map((user) => ({ user, context: resolveUserContext(user) }));
    const superAdminUsers = usersWithContext.filter(({ user }) => user.role === 'super_admin');
    const groupedByCompany = usersWithContext
      .filter(({ user }) => user.role !== 'super_admin')
      .reduce((acc, item) => {
        const companyName = item.context.companyName || 'Sin compañía';
        const key = companyName;
        if (!acc[key]) {
          acc[key] = {
            companyName,
            unitName: item.context.unitName || 'N/A',
            companyManagers: [] as Array<{ username: string; sectionName: string }> ,
            sectionManagers: [] as Array<{ username: string; sectionName: string }> ,
            operators: [] as Array<{ username: string; sectionName: string }> ,
            readers: [] as Array<{ username: string; sectionName: string }>
          };
        }

        const userEntry = {
          username: item.user.username,
          sectionName: item.context.sectionName || 'N/A'
        };

        if (item.user.role === 'encargado_cia') acc[key].companyManagers.push(userEntry);
        if (item.user.role === 'encargado_vehiculos') acc[key].companyManagers.push(userEntry);
        if (item.user.role === 'encargado_seccion') acc[key].sectionManagers.push(userEntry);
        if (item.user.role === 'operador') acc[key].operators.push(userEntry);
        if (item.user.role === 'consulta') acc[key].readers.push(userEntry);

        return acc;
      }, {} as Record<string, {
        companyName: string;
        unitName: string;
        companyManagers: Array<{ username: string; sectionName: string }>;
        sectionManagers: Array<{ username: string; sectionName: string }>;
        operators: Array<{ username: string; sectionName: string }>;
        readers: Array<{ username: string; sectionName: string }>;
      }>);

    const companyBreakdown = Object.values(groupedByCompany).sort((a, b) => a.companyName.localeCompare(b.companyName));

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-8">
          {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex gap-4"><ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="font-semibold">Error</p><p className="text-sm mt-1">{error}</p></div><button onClick={() => setError('')} className="font-bold">X</button></div>}

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Gestion de Usuarios</h1>
              <button onClick={() => { setError(''); if (usersManagementBackView === 'companies-list') { setSelectedCompanyId(null); } setView(usersManagementBackView); }} className="text-blue-600 hover:text-blue-800 font-bold w-full sm:w-auto">← Volver</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Usuario S4</h2>
              <form onSubmit={handleCreateS4User} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  spellCheck="false"
                  autoComplete="off"
                  name="create-s4-username-alt"
                  placeholder="Usuario S4"
                  value={newS4Form.username}
                  onChange={(e) => setNewS4Form({ ...newS4Form, username: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <select
                  value={newS4Form.unitId}
                  onChange={(e) => setNewS4Form({ ...newS4Form, unitId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecciona una unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-s4-password-alt"
                  placeholder="Contrasena"
                  value={newS4Form.password}
                  onChange={(e) => setNewS4Form({ ...newS4Form, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-s4-password-confirm-alt"
                  placeholder="Confirmar contrasena"
                  value={newS4Form.passwordConfirm}
                  onChange={(e) => setNewS4Form({ ...newS4Form, passwordConfirm: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                  >
                    {loading ? 'Creando S4...' : 'Crear Usuario S4'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Encargado de Vehículos</h2>
              <form onSubmit={handleCreateEncVehUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  spellCheck="false"
                  autoComplete="off"
                  name="create-encveh-username-alt"
                  placeholder="Usuario Encargado Vehículos"
                  value={newEncVehForm.username}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, username: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <select
                  value={newEncVehForm.companyId}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, companyId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">Selecciona una compañía</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-encveh-password-alt"
                  placeholder="Contraseña"
                  value={newEncVehForm.password}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  name="create-encveh-password-confirm-alt"
                  placeholder="Confirmar contraseña"
                  value={newEncVehForm.passwordConfirm}
                  onChange={(e) => setNewEncVehForm({ ...newEncVehForm, passwordConfirm: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-900 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                  >
                    {loading ? 'Creando...' : 'Crear Encargado de Vehículos'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Desglose por compania</h2>

              {superAdminUsers.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-red-800 mb-2">Super Admin</p>
                  <p className="text-sm text-red-700">{superAdminUsers.map(({ user }) => user.username).join(', ')}</p>
                </div>
              )}

              {companyBreakdown.length === 0 ? (
                <p className="text-sm text-gray-600">No hay usuarios asignados a companias todavia.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {companyBreakdown.map((group) => (
                    <div key={group.companyName} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                      <div>
                        <p className="text-base font-bold text-gray-900">🏢 {group.companyName}</p>
                        <p className="text-xs text-gray-500">Unidad: {group.unitName}</p>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold text-purple-700">Encargado de compania</p>
                        <p className="text-gray-700">{group.companyManagers.length ? group.companyManagers.map((u) => u.username).join(', ') : 'Sin asignar'}</p>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold text-blue-700">Jefes de seccion</p>
                        <p className="text-gray-700">{group.sectionManagers.length ? group.sectionManagers.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold text-green-700">Operadores</p>
                        <p className="text-gray-700">{group.operators.length ? group.operators.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                      </div>

                      <div className="text-sm">
                        <p className="font-semibold text-gray-700">Consulta</p>
                        <p className="text-gray-700">{group.readers.length ? group.readers.map((u) => `${u.username} (${u.sectionName})`).join(', ') : 'Sin asignar'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
              <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Usuario</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Rol</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Unidad</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Compania</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Sección</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const userContext = resolveUserContext(user);
                    return (
                    <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{user.username}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          user.role === 'super_admin' ? 'bg-red-100 text-red-700' :
                          user.role === 'encargado_cia' ? 'bg-blue-100 text-blue-700' :
                          user.role === 'encargado_vehiculos' ? 'bg-orange-100 text-orange-700' :
                          user.role === 'encargado_seccion' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'operador' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{userContext.unitName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{userContext.companyName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{userContext.sectionName}</td>
                      <td className="px-6 py-4 text-sm flex gap-2">
                        <button onClick={() => deleteUser(user.id, user.username)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm">Eliminar</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // DASHBOARD VIEW
  if (view === 'dashboard') {
    const stats = getDashboardStats();
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button onClick={handleDashboardBack} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6">← Volver</button>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">📊 Panel de Control</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <p className="text-gray-600 dark:text-gray-400 text-sm font-semibold mb-2">VEHÍCULOS TOTALES</p>
              <p className="text-4xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-6 shadow-sm border border-green-200 dark:border-green-800">
              <p className="text-green-700 dark:text-green-400 text-sm font-semibold mb-2">OPERATIVOS</p>
              <p className="text-4xl font-bold text-green-600 dark:text-green-300">{stats.operativo}</p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl p-6 shadow-sm border border-yellow-200 dark:border-yellow-800">
              <p className="text-yellow-700 dark:text-yellow-400 text-sm font-semibold mb-2">CONDICIONALES</p>
              <p className="text-4xl font-bold text-yellow-600 dark:text-yellow-300">{stats.condicional}</p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-6 shadow-sm border border-red-200 dark:border-red-800">
              <p className="text-red-700 dark:text-red-400 text-sm font-semibold mb-2">INOPERATIVOS</p>
              <p className="text-4xl font-bold text-red-600 dark:text-red-300">{stats.inoperativo}</p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 shadow-sm border border-blue-200 dark:border-blue-800">
              <p className="text-blue-700 dark:text-blue-400 text-sm font-semibold mb-2">KM TOTALES</p>
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-300">{stats.totalKm.toFixed(0)}</p>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 shadow-sm border border-purple-200 dark:border-purple-800">
              <p className="text-purple-700 dark:text-purple-400 text-sm font-semibold mb-2">HORAS</p>
              <p className="text-4xl font-bold text-purple-600 dark:text-purple-300">{stats.totalHoras.toFixed(1)}</p>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-6 shadow-sm border border-orange-200 dark:border-orange-800">
              <p className="text-orange-700 dark:text-orange-400 text-sm font-semibold mb-2">INCIDENCIAS</p>
              <p className="text-4xl font-bold text-orange-600 dark:text-orange-300">{stats.totalIncidencias}</p>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-4">⚠️ Alertas Activas</h2>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <p key={alert.id} className="text-sm text-red-600 dark:text-red-300">• {alert.message}</p>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // REPORTS VIEW
  if (view === 'reports') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button onClick={() => setView((currentUser?.role === 'super_admin') ? 'section-detail' : 'vehicles-list')} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6">← Volver</button>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">📄 Reportes y Exportaciones</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📊 Reporte Mensual</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Genera un PDF con todos los movimientos del mes para el vehículo seleccionado.</p>
              <button onClick={generateMonthlyReport} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold">
                Descargar PDF
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📋 Movimientos CSV</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Exporta todos los movimientos a un archivo CSV para análisis en Excel.</p>
              <button onClick={exportMovementsCSV} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold">
                Descargar CSV
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📦 Materiales CSV</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Exporta el inventario de materiales a CSV para revisión del estado.</p>
              <button onClick={exportMaterialsCSV} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold">
                Descargar CSV
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📝 Auditoría</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Ver el historial de cambios y acciones en el sistema.</p>
              <button onClick={() => setView('audit-log')} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-bold">
                Ver Auditoría
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // CLEANUP TEST DATA VIEW
  if (currentUser?.role === 'super_admin' && view === 'cleanup-test-data') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <div>
              <button 
                onClick={() => setView('companies-menu')} 
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
              >
                ← Volver
              </button>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Eliminar Datos de Prueba</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Selecciona qué compañías de prueba deseas eliminar</p>
            </div>

            {testDataLoading && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">
                  Cargando compañías de prueba... {testDataDeleteProgress.total > 0 && `(${testDataDeleteProgress.current}/${testDataDeleteProgress.total})`}
                </p>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{width: testDataDeleteProgress.total > 0 ? `${(testDataDeleteProgress.current / testDataDeleteProgress.total) * 100}%` : '0%'}}
                  ></div>
                </div>
              </div>
            )}

            {!testDataLoading && testCompanies.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">
                  No hay compañías de prueba recientes para eliminar
                </p>
              </div>
            )}

            {!testDataLoading && testCompanies.length > 0 && (
              <>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={() => {
                      if (selectedTestCompanies.size === testCompanies.length) {
                        setSelectedTestCompanies(new Set());
                      } else {
                        setSelectedTestCompanies(new Set(testCompanies.map(c => c.id)));
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold"
                  >
                    {selectedTestCompanies.size === testCompanies.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  </button>
                  <span className="text-gray-600 dark:text-gray-400">
                    {selectedTestCompanies.size} de {testCompanies.length} seleccionadas
                  </span>
                </div>

                <div className="grid gap-3">
                  {testCompanies.map((company) => (
                    <div 
                      key={company.id}
                      className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTestCompanies.has(company.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedTestCompanies);
                          if (e.target.checked) {
                            newSelected.add(company.id);
                          } else {
                            newSelected.delete(company.id);
                          }
                          setSelectedTestCompanies(newSelected);
                        }}
                        className="w-5 h-5 rounded accent-red-600 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white">{company.name}</p>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
                          <p>📅 Creada: {company.createdAt ? new Date(company.createdAt.toDate()).toLocaleDateString('es-ES') : 'Desconocida'}</p>
                          <p>📋 Secciones: {company.sectionsCount} | 🚗 Vehículos: {company.vehiclesCount}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={deleteSelectedTestData}
                    disabled={selectedTestCompanies.size === 0 || testDataLoading}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-bold transition-colors"
                  >
                    🗑️ Eliminar {selectedTestCompanies.size > 0 ? `(${selectedTestCompanies.size})` : ''}
                  </button>
                  <button
                    onClick={() => setView('companies-menu')}
                    disabled={testDataLoading}
                    className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
      );
    }

  // AUDIT REPORT VIEW
  if (currentUser?.role === 'super_admin' && view === 'audit-report') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300" key="audit-report-view">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <div>
              <button 
                onClick={() => {
                  setAuditReportData([]);
                  setAuditReportLoading(false);
                  setView('companies-menu');
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
              >
                ← Volver
              </button>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Auditoría Consolidada</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Listado completo de compañías, usuarios, secciones y vehículos</p>
            </div>

            {auditReportLoading && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">Cargando datos de auditoría...</p>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                </div>
              </div>
            )}

            {!auditReportLoading && auditReportData.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">No hay datos de compañías para mostrar</p>
              </div>
            )}

            {!auditReportLoading && auditReportData.length > 0 && (
              <div className="space-y-8">
                {auditReportData.map((unit) => (
                  <div key={unit.unitId} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-indigo-900 dark:to-indigo-800 px-6 py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <h2 className="text-2xl font-bold text-white">🧭 Unidad: {unit.unitName}</h2>
                          <p className="text-indigo-100 text-sm mt-1">
                            🏢 {unit.companies.length} compañía(s) | 🚗 {unit.summary.total} vehículo(s) | Operativos: {unit.summary.status.operativo} | Condicionales: {unit.summary.status.condicional} | Inoperativos: {unit.summary.status.inoperativo}
                          </p>
                          <p className="text-indigo-100 text-xs mt-1">
                            Tipos: {Object.entries(unit.summary.byType).length > 0 ? Object.entries(unit.summary.byType).map(([type, count]) => `${type.toUpperCase()}: ${count}`).join(' | ') : 'Sin vehículos'}
                          </p>
                        </div>
                        <button
                          onClick={() => generateUnitAuditPdf(unit)}
                          className="bg-white/20 hover:bg-white/30 text-white border border-white/40 px-4 py-2 rounded-lg font-bold text-sm"
                        >
                          📄 PDF Unidad
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {unit.companies.length === 0 && (
                        <div className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-300">
                          Esta unidad no tiene compañías asignadas.
                        </div>
                      )}

                      {unit.companies.map((company) => (
                        <div key={company.companyId} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="bg-cyan-50 dark:bg-cyan-900/20 px-5 py-4 border-b border-cyan-200 dark:border-cyan-800">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">🏢 {company.companyName}</h3>
                            <p className="text-sm text-cyan-700 dark:text-cyan-300 mt-1">
                              📋 {company.sections.length} sección(es) | 🚗 {company.summary.total} vehículo(s) | Operativos: {company.summary.status.operativo} | Condicionales: {company.summary.status.condicional} | Inoperativos: {company.summary.status.inoperativo}
                            </p>
                            <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-1">
                              Tipos: {Object.entries(company.summary.byType).length > 0 ? Object.entries(company.summary.byType).map(([type, count]) => `${type.toUpperCase()}: ${count}`).join(' | ') : 'Sin vehículos'}
                            </p>
                          </div>

                          <div className="p-4 space-y-4">
                            {company.sections.length === 0 && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">Sin secciones en esta compañía.</div>
                            )}

                            {company.sections.map((section) => (
                              <div key={section.sectionId} className="bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                  <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">📋 {section.sectionName}</h4>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                      🚗 {section.summary.total} vehículo(s) | Operativos: {section.summary.status.operativo} | Condicionales: {section.summary.status.condicional} | Inoperativos: {section.summary.status.inoperativo}
                                    </p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                      Tipos: {Object.entries(section.summary.byType).length > 0 ? Object.entries(section.summary.byType).map(([type, count]) => `${type.toUpperCase()}: ${count}`).join(' | ') : 'Sin vehículos'}
                                    </p>
                                  </div>
                                </div>

                                {section.vehicles.length > 0 && (
                                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {section.vehicles.map((vehicle) => (
                                      <div key={vehicle.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md p-2 text-sm">
                                        <p className="font-mono font-bold text-gray-900 dark:text-white">{vehicle.plate}</p>
                                        <p className="text-gray-600 dark:text-gray-300 text-xs">{vehicle.brand} {vehicle.model}</p>
                                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-300 mt-1">{vehicle.status}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Tipo: {String(vehicle.vehicleType || 'sin_tipo').toUpperCase()}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumen general */}
            {!auditReportLoading && auditReportData.length > 0 && (
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📊 Resumen General</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-indigo-600">{auditReportData.length}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Unidades</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-cyan-600">{auditReportData.reduce((sum, u) => sum + u.companies.length, 0)}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Companias</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-green-600">{auditReportData.reduce((sum, u) => sum + u.companies.reduce((acc, c) => acc + c.sections.length, 0), 0)}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Secciones</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-blue-600">{auditReportData.reduce((sum, u) => sum + u.summary.total, 0)}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Vehículos</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      );
    }

  // SECURITY GUIDE VIEW
  if (view === 'security-guide') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button 
            onClick={() => setView(currentUser?.role === 'super_admin' ? 'companies-menu' : 'section-detail')} 
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
          >
            ← Volver
          </button>
          <SecurityGuide />
        </main>
      </div>
    );
  }

  // FALLBACK - Nunca debería llegar aquí, pero si lo hace, mostrar error
  // S4 DASHBOARD — vista de solo lectura sobre la unidad asignada
  if (currentUser.role === 's4' && (view as string) === 's4-dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl transition-colors">
              <p className="font-semibold">Error: {error}</p>
            </div>
          )}

          {/* Cabecera */}
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="inline-block bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">S4 · Solo lectura</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Mi Unidad</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Vista de observación — {companies.length} {companies.length === 1 ? 'compañía' : 'compañías'}</p>
            </div>
            <button
              onClick={() => { loadS4AuditReportData(); setView('s4-audit-report'); }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap"
            >
              📊 Auditoría
            </button>
            <button
              onClick={() => { loadS4GlobalItvData(); setView('s4-global-itvs'); }}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap"
            >
              🔧 ITVs
            </button>
          </div>

          {/* Lista de compañías */}
          {companies.length === 0 ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 px-6 py-8 rounded-2xl text-center">
              <p className="font-semibold text-lg mb-1">Sin compañías asignadas</p>
              <p className="text-sm">La unidad aún no tiene compañías. Contacta con el administrador.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.map(company => (
                <button
                  key={company.id}
                  onClick={() => { setSelectedCompanyId(company.id); setView('company-detail'); }}
                  className="text-left bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{company.name}</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ver secciones →</p>
                    </div>
                    <span className="shrink-0 w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">🏢</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // S4 AUDIT REPORT — auditoría de solo lectura de la unidad asignada
  if (currentUser.role === 's4' && (view as string) === 's4-audit-report') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300" key="s4-audit-report-view">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <div>
              <button
                onClick={() => {
                  setAuditReportData([]);
                  setAuditReportLoading(false);
                  setView('s4-dashboard');
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-6"
              >
                ← Volver
              </button>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Auditoría de Unidad</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Listado de compañías, secciones y vehículos de tu unidad</p>
            </div>

            {auditReportLoading && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">Cargando datos de auditoría...</p>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                </div>
              </div>
            )}

            {!auditReportLoading && auditReportData.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">No hay datos de compañías para mostrar</p>
              </div>
            )}

            {!auditReportLoading && auditReportData.length > 0 && (
              <div className="space-y-8">
                {auditReportData.map((unit) => (
                  <div key={unit.unitId} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-indigo-900 dark:to-indigo-800 px-6 py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <h2 className="text-2xl font-bold text-white">🧭 Unidad: {unit.unitName}</h2>
                          <p className="text-indigo-100 text-sm mt-1">
                            🏢 {unit.companies.length} compañía(s) | 🚗 {unit.summary.total} vehículo(s) | Operativos: {unit.summary.status.operativo} | Condicionales: {unit.summary.status.condicional} | Inoperativos: {unit.summary.status.inoperativo}
                          </p>
                          <p className="text-indigo-100 text-xs mt-1">
                            Tipos: {Object.entries(unit.summary.byType).length > 0 ? Object.entries(unit.summary.byType).map(([type, count]) => `${type.toUpperCase()}: ${count}`).join(' | ') : 'Sin vehículos'}
                          </p>
                        </div>
                        <button
                          onClick={() => generateUnitAuditPdf(unit)}
                          className="bg-white/20 hover:bg-white/30 text-white border border-white/40 px-4 py-2 rounded-lg font-bold text-sm"
                        >
                          📄 PDF Unidad
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {unit.companies.length === 0 && (
                        <div className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-300">
                          Esta unidad no tiene compañías asignadas.
                        </div>
                      )}

                      {unit.companies.map((company) => (
                        <div key={company.companyId} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="bg-cyan-50 dark:bg-cyan-900/20 px-5 py-4 border-b border-cyan-200 dark:border-cyan-800">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">🏢 {company.companyName}</h3>
                            <p className="text-sm text-cyan-700 dark:text-cyan-300 mt-1">
                              📋 {company.sections.length} sección(es) | 🚗 {company.summary.total} vehículo(s) | Operativos: {company.summary.status.operativo} | Condicionales: {company.summary.status.condicional} | Inoperativos: {company.summary.status.inoperativo}
                            </p>
                          </div>

                          <div className="p-4 space-y-4">
                            {company.sections.length === 0 && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">Sin secciones en esta compañía.</div>
                            )}

                            {company.sections.map((section) => (
                              <div key={section.sectionId} className="bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                                <h4 className="font-bold text-gray-900 dark:text-white">📋 {section.sectionName}</h4>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                  🚗 {section.summary.total} vehículo(s) | Operativos: {section.summary.status.operativo} | Condicionales: {section.summary.status.condicional} | Inoperativos: {section.summary.status.inoperativo}
                                </p>
                                {section.vehicles.length > 0 && (
                                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {section.vehicles.map((vehicle) => (
                                      <div key={vehicle.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md p-2 text-sm">
                                        <p className="font-mono font-bold text-gray-900 dark:text-white">{vehicle.plate}</p>
                                        <p className="text-gray-600 dark:text-gray-300 text-xs">{vehicle.brand} {vehicle.model}</p>
                                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-300 mt-1">{vehicle.status}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Tipo: {String(vehicle.vehicleType || 'sin_tipo').toUpperCase()}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumen general */}
            {!auditReportLoading && auditReportData.length > 0 && (
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📊 Resumen General</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-cyan-600">{auditReportData[0]?.companies.length ?? 0}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Compañías</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-green-600">{auditReportData.reduce((sum, u) => sum + u.companies.reduce((acc, c) => acc + c.sections.length, 0), 0)}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Secciones</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center border border-gray-200 dark:border-slate-600">
                    <p className="text-3xl font-bold text-blue-600">{auditReportData.reduce((sum, u) => sum + u.summary.total, 0)}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">Vehículos</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // S4 GLOBAL ITV VIEW — todas las ITVs de la unidad
  if (currentUser.role === 's4' && (view as string) === 's4-global-itvs') {
    const now = new Date();
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300" key="s4-global-itvs-view">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <button
                  onClick={() => { setS4GlobalItvData([]); setView('s4-dashboard'); }}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-3 block"
                >
                  ← Volver
                </button>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🔧 ITVs de la Unidad</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Todas las fechas de ITV de los vehículos, ordenadas por proximidad</p>
              </div>
              <button
                onClick={() => loadS4GlobalItvData()}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap self-end"
              >
                🔄 Recargar
              </button>
            </div>

            {s4GlobalItvLoading && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">Cargando ITVs...</p>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                </div>
              </div>
            )}

            {!s4GlobalItvLoading && s4GlobalItvData.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">No se encontraron vehículos.</p>
              </div>
            )}

            {!s4GlobalItvLoading && s4GlobalItvData.length > 0 && (() => {
              const withDate = s4GlobalItvData.filter(v => v.nextItvDate);
              const withoutDate = s4GlobalItvData.filter(v => !v.nextItvDate);
              const renderRow = (v: any) => {
                const days = v.nextItvDate
                  ? Math.ceil((new Date(v.nextItvDate).getTime() - now.getTime()) / 86400000)
                  : null;
                const isUrgent = days !== null && days <= 10;
                const isWarning = days !== null && days > 10 && days <= 30;
                const isPast = days !== null && days < 0;
                const rowBg = isPast
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : isUrgent
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                    : isWarning
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700';
                const badge = isPast
                  ? <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Vencida</span>
                  : isUrgent
                    ? <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">¡{days}d!</span>
                    : isWarning
                      ? <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{days}d</span>
                      : days !== null
                        ? <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{days}d</span>
                        : null;
                return (
                  <div key={v.vehicleId} className={`border rounded-xl p-4 flex flex-wrap gap-3 items-center ${rowBg}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-900 dark:text-white">{v.plate}</span>
                        {v.brand || v.model ? <span className="text-sm text-gray-500 dark:text-gray-400">{v.brand} {v.model}</span> : null}
                        {badge}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        🏢 {v.companyName} · 📋 {v.sectionName}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {v.nextItvDate
                        ? new Date(v.nextItvDate + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : <span className="text-gray-400 dark:text-gray-500">Sin fecha</span>
                      }
                    </div>
                  </div>
                );
              };
              return (
                <div className="space-y-6">
                  {withDate.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">Con fecha ITV ({withDate.length})</h2>
                      <div className="space-y-2">{withDate.map(renderRow)}</div>
                    </div>
                  )}
                  {withoutDate.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-lg font-bold text-gray-500 dark:text-gray-400">Sin fecha ITV ({withoutDate.length})</h2>
                      <div className="space-y-2">{withoutDate.map(renderRow)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </main>
      </div>
    );
  }

  // CIA OVERVIEW — vista de consulta (solo lectura) de todas las secciones y vehículos de la compañía
  if ((currentUser.role === 'encargado_cia' || currentUser.role === 'encargado_vehiculos') && (view as string) === 'cia-overview') {
    const now = new Date();
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col transition-colors duration-300" key="cia-overview-view">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <button
                  onClick={() => { setCiaOverviewData([]); setView('dashboard'); }}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold mb-3 block"
                >
                  ← Volver
                </button>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">� Auditoría de Compañía</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Secciones, vehículos, estados y tipos — generación de PDF</p>
              </div>
              <div className="flex gap-2 flex-wrap self-end">
                <button
                  onClick={() => generateCiaAuditPdf()}
                  disabled={ciaOverviewLoading || ciaOverviewData.length === 0}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap"
                >
                  📄 Descargar PDF
                </button>
                <button
                  onClick={() => loadCiaOverviewData()}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap"
                >
                  🔄 Recargar
                </button>
              </div>
            </div>

            {ciaOverviewLoading && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">Cargando vehículos...</p>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                </div>
              </div>
            )}

            {!ciaOverviewLoading && ciaOverviewData.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">No se encontraron secciones.</p>
              </div>
            )}

            {!ciaOverviewLoading && ciaOverviewData.length > 0 && (
              <div className="space-y-6">
                {/* Summary bar */}
                {(() => {
                  const totalSections = ciaOverviewData.length;
                  const allVehicles = ciaOverviewData.flatMap(e => e.vehicles);
                  const totalVehicles = allVehicles.length;
                  const operativo = allVehicles.filter(v => v.status === 'OPERATIVO').length;
                  const condicional = allVehicles.filter(v => v.status === 'OPERATIVO_CONDICIONAL').length;
                  const inoperativo = allVehicles.filter(v => v.status === 'INOPERATIVO').length;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalSections}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Secciones</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalVehicles}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vehículos</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{operativo}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Operativos</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{inoperativo}<span className="text-yellow-500 dark:text-yellow-400 text-lg"> +{condicional}</span></p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Inop. + Cond.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Sections with vehicles */}
                {ciaOverviewData.map(({ section, vehicles: sectionVehicles }) => {
                  const operativos = sectionVehicles.filter(v => v.status === 'OPERATIVO').length;
                  const condicionales = sectionVehicles.filter(v => v.status === 'OPERATIVO_CONDICIONAL').length;
                  const inoperativos = sectionVehicles.filter(v => v.status === 'INOPERATIVO').length;
                  const urgentItv = sectionVehicles.some(v => {
                    if (!v.nextItvDate) return false;
                    const days = Math.ceil((new Date(v.nextItvDate).getTime() - now.getTime()) / 86400000);
                    return days <= 10;
                  });
                  return (
                    <div key={section.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                      {/* Section header */}
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            📋 {section.name}
                            {urgentItv && <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-500 text-white rounded-full">!</span>}
                          </h2>
                          <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                            {sectionVehicles.length} vehículo(s) · 🟢 {operativos} · 🟡 {condicionales} · 🔴 {inoperativos}
                          </p>
                        </div>
                      </div>

                      {/* Vehicles grid */}
                      {sectionVehicles.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">Sin vehículos en esta sección.</div>
                      ) : (
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {sectionVehicles.map(vehicle => {
                            const itvDays = vehicle.nextItvDate
                              ? Math.ceil((new Date(vehicle.nextItvDate).getTime() - now.getTime()) / 86400000)
                              : null;
                            const itvUrgent = itvDays !== null && itvDays <= 10;
                            const itvWarn = itvDays !== null && itvDays > 10 && itvDays <= 30;
                            return (
                              <div key={vehicle.id} className="relative bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 p-4">
                                {getVehicleIncidenciasCount(vehicle) > 0 && (
                                  <div className="absolute -top-2 left-2 bg-red-600 text-white text-xs font-bold min-w-[1.4rem] h-5 flex items-center justify-center px-1 rounded-full shadow">
                                    ⚠️ {getVehicleIncidenciasCount(vehicle)}
                                  </div>
                                )}
                                {getVehicleAvisosCount(vehicle) > 0 && (
                                  <div className="absolute -top-2 right-2 bg-amber-500 text-white text-xs font-bold min-w-[1.4rem] h-5 flex items-center justify-center px-1 rounded-full shadow">
                                    🔔 {getVehicleAvisosCount(vehicle)}
                                  </div>
                                )}
                                <p className="font-mono font-bold text-gray-900 dark:text-white">{vehicle.plate}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{vehicle.brand} {vehicle.model}</p>
                                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">{String(vehicle.vehicleType || 'sin_tipo').toUpperCase()}</p>
                                <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${vehicle.status === 'OPERATIVO' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                  {vehicle.status === 'OPERATIVO' ? 'Operativo' : vehicle.status === 'OPERATIVO_CONDICIONAL' ? 'Cond.' : 'Inoperativo'}
                                </span>
                                {vehicle.nextItvDate && (
                                  <p className={`text-xs mt-1.5 font-semibold ${itvUrgent ? 'text-red-600 dark:text-red-400' : itvWarn ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    🔧 ITV: {new Date(vehicle.nextItvDate + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    {itvDays !== null && itvDays < 0 ? ' (vencida)' : itvDays !== null && itvDays <= 30 ? ` (${itvDays}d)` : ''}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // FALLBACK real - Nunca debería llegar aquí, pero si lo hace, mostrar error
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SIGVEM</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gestión de Flota</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold text-sm transition-colors">
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Salir
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-8 flex items-center justify-center">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-8 max-w-md text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-600 dark:text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-yellow-900 dark:text-yellow-100 mb-2">Pantalla no encontrada</h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-200 mb-4">
            Usuario: <strong>{currentUser ? currentUser.username : 'N/A'}</strong><br />
            Rol: <strong>{currentUser ? currentUser.role : 'N/A'}</strong><br />
            Vista: <strong>{view}</strong>
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-300 mb-6">Por favor, intenta salir y volver a entrar.</p>
          <button onClick={handleLogout} className="w-full bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-600 text-white py-3 rounded-xl font-bold transition-colors">
            Cerrar sesión
          </button>
        </div>
      </main>
    </div>
  );
};

export default AppWeb;



// manual-edit-probe



