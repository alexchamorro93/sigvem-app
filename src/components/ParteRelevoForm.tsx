import React, { useState, useMemo, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import jsPDF from 'jspdf';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import vehiclePortaspike from '../assets/vehicle-portaspike.png';
import vehicleBn1 from '../assets/vehicle-bn1.png';
import vehicleS3 from '../assets/vehicle-s3.png';
import vehicleAnibal from '../assets/vehicle-anibal.png';
import vehicleDefault from '../assets/vehicle-views.png';

interface DamageMark {
  id: number;
  x_pct: number;
  y_pct: number;
  description: string;
}

interface MaterialItem {
  nombre: string;
  presente: boolean;
  cantidad: number;
  version?: string; // 'V1' | 'V3' | '' — only for items that support version selection
}

interface ParteRelevoData {
  matricula: string;
  numero_parte: string;
  fecha: string;
  herramientas: MaterialItem[];
  exterior_vehiculo: MaterialItem[];
  interior_vehiculo: MaterialItem[];
  documentacion: MaterialItem[];
  afuste_polivalente?: MaterialItem[];
  armamento_browning?: MaterialItem[];
  armamento_lag40?: MaterialItem[];
  afuste_spike?: MaterialItem[];
  equipo_comunicaciones?: MaterialItem[];
  kit_recuperacion: MaterialItem[];
  novedades_exteriores: string;
  novedades_varias: string;
  damage_marks?: DamageMark[];
  numero_serie_extintor?: string;
  caducidad_extintor?: string;
  nombre_entrega?: string;
  firma_entrega?: string;
  nombre_recepcion?: string;
  firma_recepcion?: string;
}

interface ParteRelevoFormProps {
  vehicleType?: string;
  vehicleId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onSaveError?: (message: string) => void;
  onDiscarded?: () => void;
  saveTick?: number;
  discardTick?: number;
  currentUsername?: string;
}

// ============================================================
// PORTASPIKE MATERIALS
// ============================================================

const PORTASPIKE_HERRAMIENTAS = [
  'CADENAS (4) EN CAJA DE MADERA', 'CAJA BOMBILLAS REPUESTO',
  'CALZOS (2)', 'LAMPARA PORTATIL 24V CON CABLE',
  'TRIANGULOS CON CAJA (2)', 'CHALECOS RELFECTANTES (2)',
  'MANDO CABESTRANTE', 'BOQUEREL',
  'EXTINTOR 6 KG (Nº SERIE)', 'MANERAL GATO (3)',
  'LLAVE VASO 17/19 CON EXTENSOR', 'MANGUERA INFLADO',
  'LLAVE ALLEN 12"', 'MARTILLO DE BOLA',
  'JUEGO LLAVES ALLEN 1.5 A 10MM(9)', 'LLAVE INGLESA 12" / 8"',
  'GATO HIDRAULICO', 'DESTORNILLADOR REVERSIBLE',
  'CAJA HERRAMIENTAS', 'LLAVES FIJAS DEL 6/7 AL 20/22 (8)',
  'CABLE DE ARRANQUE CON ADAPTADOR', 'ALICATES',
  '3ª MATRICULA', 'CAJA PARA CORREAS',
  'BOTIQUIN NUEVO', 'CORREAS DE FIJACION (18)',
  'MANOMETRO', 'CORREAS LATERALES (4)',
  'CINTA CABESTRANTE', 'PERNOS PARA CORREAS (19)',
  'BOLSA CADENAS', 'PETACAS DIESEL (2)'
];

const PORTASPIKE_EXTERIOR = [
  'GRILLETES CON PASADOR (4)', 'PASADORES CAPO (2)',
  'PASADORES DE ELEVACION TRASERA (4)', 'PASADOR DE SEGURIDAD REMOLQUE (1)',
  'CINTA CAPO (1)', ''
];

const PORTASPIKE_INTERIOR = [
  'CINTURONAS SEGURIDAD (4)', 'CINTURON TIRADOR (1)',
  'ARMERO DOBLE (1)', 'PLATAFORMA DE TIRADOR (1)',
  'ARMERO SIMPLE (2)', 'PROTECCION LONA FRENO DE TORRE (1)'
];

const PORTASPIKE_DOCUMENTACION = [
  'HOJA DOCUMENTACION', 'PARTE DE ACCIDENTES',
  'TARJETA Y HOJA DE ITV', 'GUIA DEL CONDUCTOR',
  'M2404', 'MANUAL OPERADOR',
  'FICHA RESPON. J. CONVOY', 'MANUAL DE MANTENIMIENTO',
  'FICHA RESPOND. J. VEHICULO', 'NORMAS DE RECUPERACION (AGO/19)',
  'FICHA DE CONDUCTOR MILITAR', 'PROCEDIMIENTO PEAJES',
  'CERTIFICADO SEGURO', 'TARJETA REPOSTAJE',
  'TARJETA DE ENTRADA A LA BASE', ''
];

const PORTASPIKE_AFUSTE_SPIKE = [
  'FUNDA DEL VASO', 'PALANCA SUJECIÓN T.S.',
  'VASO CON DOS PASADORES', 'PASADOR SUJECIÓN C.I.U.',
  'PALOMETA, PALANCA Y FIJACION', 'PALANCA BLOQUEO EN ELEVACIÓN',
  'RAC MISILES', '2 CORREAS SUJECIÓN DEL MISIL',
  'TAPA PROTECCIÓN T.S.', ''
];

const PORTASPIKE_KIT_RECUPERACION = [
  'PETACA DE AGUA', 'GRILLETES PEQUEÑOS (2)',
  'PICO Y PALA', 'GRILLET GRANDE (1)',
  'BOLSA KIT', 'PAR DE GUANTES',
  'POLEA CON FUNDA', 'GANCHO CON TORNILLO',
  'ESLINGA 10TN', 'LLAVE EN Y'
];

// ============================================================
// DEFAULT MATERIALS (para otras categorías)
// ============================================================

const HERRAMIENTAS_LISTA = [
  'CADENAS (4) EN CAJA DE MADERA', 'CAJA BOMBILLAS REPUESTO',
  'CALZOS (2)', 'LAMPARA PORTATIL 24V CON CABLE',
  'TRIANGULOS CON CAJA (2)', 'CHALECOS REFLECTANTES (2)',
  'MANDO CABESTRANTE', 'BOQUEREL',
  'EXTINTOR 6 KG (Nº SERIE) :', 'MANERAL GATO (3)',
  'BOLSA CADENAS', 'MANGUERA INFLADO',
  'LLAVE ALLEN 12"', 'MARTILLO DE BOLA',
  'JUEGO LLAVES ALLEN 1.5 A 10MM(9)', 'LLAVE INGLESA 12" / 8"',
  'GATO HIDRAULICO', 'DESTORNILLADOR REVERSIBLE',
  'CAJA HERRAMIENTAS', 'LLAVES FIJAS DEL 6/7 AL 20/22 (8)',
  'CABLE DE ARRANQUE CON ADAPTADOR', 'ALICATES',
  '3ª MATRICULA', 'CAJA PARA CORREAS',
  'BOTIQUIN NUEVO', 'CORREAS DE FIJACION (18)',
  'MANOMETRO', 'CORREAS LATERALES (4)',
  'CINTA CABESTRANTE', 'PERNOS PARA CORREAS (19)',
  'BARRA EXCARCELACION', 'MANDO FOCO EXTERIOR',
  'LLAVE DE RUEDAS DEL 32', 'LLAVE DE PUERTAS DEL ANTÍMINA',
  'PETACAS DIESEL (2)', ''
];

const EXTERIOR_VEHICULO_LISTA = [
  'GRILLETES CON PASADOR (4)', 'PASADORES CAPO (2)',
  'PASADORES DE ELEVACION TRASERA (4)', 'PASADOR DE SEGURIDAD REMOLQUE (1)',
  'CORTA CABLE DE DOS PIEZAS', 'CINTA DE CAPO (1)',
  'CINTA PORTAPETACA CON CARRACA (1)', 'FUNDA DE FOCO EXTERIOR',
  'KIT ANTÍMOTIN (5)', ''
];

const INTERIOR_VEHICULO_LISTA = [
  'CINTURONAS SEGURIDAD (4)', 'CINTURON TIRADOR (1)',
  'ARMERO DOBLE (1)', 'PLATAFORMA DE TIRADOR (1)',
  'ARMERO SIMPLE (2)', 'PROTECCION LONA FRENO DE TORRE (1)',
  '', ''
];

const DOCUMENTACION_LISTA = [
  'HOJA DOCUMENTACION', 'PARTE DE ACCIDENTES',
  'TARJETA Y HOJA DE ITV', 'GUIA DEL CONDUCTOR',
  'M2404', 'MANUAL OPERADOR',
  'FICHA RESPON. J. CONVOY', 'MANUAL DE MANTENIMIENTO',
  'FICHA RESPOND. J. VEHICULO', 'NORMAS DE RECUPERACION (AGO/19)',
  'FICHA DE CONDUCTOR MILITAR', 'PROCEDIMIENTO PEAJES',
  'CERTIFICADO SEGURO', 'TARJETA REPOSTAJE',
  'TARJETA DE ENTRADA  A LA BASE', ''
];

const AFUSTE_POLIVALENTE_LISTA = [
  'ESCUDO CON PINZOTE', 'ALICATE UNIVERSAL',
  'PASADOR DEL PINZOTE', 'ALICANTE CORTE FRONTAL',
  'SEGURO DE TRANSPORTE CON 2 PASADORES', 'SOPORTE CAJA MUNICION AMP / LAG CON 2 PASADORES',
  'VASO CON 2 PALOMETAS Y PASADOR', 'LLAVE BOCA 17MM',
  'FUNDA VASO', 'LLAVE BOCA 24MM',
  'FUNDA AMP / LAG', 'APOYO TIRADOR',
  'FUNDA AMM / AML', 'SOPORTE AMM / AML CON PASADOR',
  'BOLSA RECOGIDA VAINAS DELANTERA', 'ADAPTADOR AMM CON PASADOR',
  'BOLSA ESLABONES AMP/ LAG', 'ADAPTADOR AML CON 2 PASADORES',
  'BOLSA ESLABONES AMM', 'ADAPTADOR BOLSA MUNICION AML',
  'MANUAL EMPLEO', 'SOPORTE CAJA MUNICION AMM',
  'MANUAL MANTENIMIENTO', 'CHAVETA CUADRADA CON 2 TORNILLOS',
  '4 FICHAS DE EMPLEO PLASTIFICADAS', 'CHAVETA CON RESALTE Y 2 TORNILLOS',
  'CAJA CONTENEDORA', 'DEFLECTOR DE ESLABONES PARA AMM',
  'SOPORTE AMP/LAG CON 3 PASADORES', 'LLAVE ALEN 2,5MM',
  'LLAVE ALEN 6MM', 'LLAVE ALEN 3MM',
  'ARANDELAS', 'LLAVE ALEN 5MM'
];

const ARMAMENTO_BROWNING_LISTA = [
  'CAÑON DE RESPETO', 'ESCOBILLON DE ANIMA DE CAÑON',
  'EMPUÑADURA AUXILIAR DE TRANSPORTE', 'ESCOBILLON DE RECAMARA',
  'FUNDA PARA CAÑON DE RESPETO', 'BAQUETA DE LIMPIEZA M-4',
  'BOLSA DE HERRAMIENTAS', 'BAQUETA DE LIMPIEZA M-7:',
  'EMPUÑADURA AUXILIAR DEL ARMA', 'TRAMO INICIAL CON EMPUÑADURA',
  'EMPUÑADURA PARA TORRETA MINI SAMSON', 'TRES TRAMOS INTERMEDIOS',
  'ESCOBILLON PARA ORIFICIO PERCULTOR', 'TRAMO LIMPIADOR DE CAÑON',
  'ACEITERA', 'EXTRACTOR DE VAINAS ROTAS',
  'BOTADOR DE 3 MM', 'FUNDA DE AMETRALADORA AMP',
  'ENGARZADOR DE CARTUCHOS', 'DOS GUANTES ANTICALORICOS',
  'LAVADOR PARA ORIFICIO DEL PERCUTOR', 'FICHA INSTRUCCIONES BASICAS'
];

const ARMAMENTO_LAG40_LISTA = [
  'TERMINAL CON OJAL', 'MANGO DE BAQUETA',
  'PINCEL DE NYLON', 'EXTRACTOR',
  'DESTORNILLADOR', 'MARTILLO DE CABEZAS INTERCAMBIABLES',
  'BOTADOR TOPE', 'ACEITERA',
  'FEMINELA DE FIBRA', 'TAPON DE ACEITERA COLOR NEGRO',
  'FEMINELA DE LATON', 'EMPUJADOR',
  'PROLONGADOR', 'GUIA DE HERRAMIENTAS',
  'TERMINAL CON OJAL', 'CUÑA',
  'CAJA PORTA MUNICION', 'MANDO DE ELEVACION',
  'VASO', 'TRIPODE CON FUNDA',
  'PINZOTE', ''
];

const KIT_RECUPERACION_LISTA = [
  'PETACA DE AGUA', 'GRILLETES PEQUEÑOS (2)',
  'PICO Y PALA', 'GRILLET GRANDE (1)',
  'BOLSA KIT', 'PAR DE GUANTES',
  'POLEA CON FUNDA', 'GANCHO CON TORNILLO',
  'ESLINGA 10TN', 'LLAVE EN Y'
];

// ============================================================
// BN1 MATERIALS
// ============================================================

const BN1_HERRAMIENTAS = [
  'CADENAS (4) EN CAJA DE MADERA', 'CAJA BOMBILLAS REPUESTO',
  'CALZOS (2)', 'LAMPARA PORTATIL 24V CON CABLE',
  'TRIANGULOS CON CAJA (2)', 'CHALECOS REFLECTANTES (2)',
  'MANDO CABESTRANTE', 'BOQUEREL',
  'EXTINTOR 6 KG (Nº SERIE)', 'MANERAL GATO (3)',
  'LLAVE VASO 17/19 CON EXTENSOR', 'MANGUERA INFLADO',
  'LLAVE ALLEN 12"', 'MARTILLO DE BOLA',
  'JUEGO LLAVES ALLEN 1.5 A 10MM(9)', 'LLAVE INGLESA 12" / 8"',
  'GATO HIDRAULICO', 'DESTORNILLADOR REVERSIBLE',
  'CAJA HERRAMIENTAS', 'LLAVES FIJAS DEL 6/7 AL 20/22 (8)',
  'CABLE DE ARRANQUE CON ADAPTADOR', 'ALICATES',
  '3ª MATRICULA', 'CAJA PARA CORREAS',
  'BOTIQUIN NUEVO', 'CORREAS DE FIJACION (18)',
  'MANOMETRO', 'CORREAS LATERALES (4)',
  'CINTA CABESTRANTE', 'PERNOS PARA CORREAS (19)',
  'BOLSA CADENAS NEGRA', 'PETACAS DIESEL (2)'
];

const BN1_EXTERIOR = [
  'GRILLETES CON PASADOR (4)', 'PASADORES CAPO (2)',
  'PASADORES DE ELEVACION TRASERA (4)', 'PASADOR DE SEGURIDAD REMOLQUE (1)',
  'CINTA CAPO (1)', ''
];

const BN1_INTERIOR = [
  'CINTURONAS SEGURIDAD (4)', 'CINTURON TIRADOR (1)',
  'ARMERO DOBLE (1)', 'PLATAFORMA DE TIRADOR (1)',
  'ARMERO SIMPLE (2)', 'PROTECCION LONA FRENO DE TORRE (1)'
];

const BN1_DOCUMENTACION = [
  'HOJA DOCUMENTACION', 'PARTE DE ACCIDENTES',
  'TARJETA Y HOJA DE ITV', 'GUIA DEL CONDUCTOR',
  'M2404', 'MANUAL OPERADOR',
  'FICHA RESPON. J. CONVOY', 'MANUAL DE MANTENIMIENTO',
  'FICHA RESPOND. J. VEHICULO', 'NORMAS DE RECUPERACION (AGO/19)',
  'FICHA DE CONDUCTOR MILITAR', 'PROCEDIMIENTO PEAJES',
  'CERTIFICADO SEGURO', 'TARJETA REPOSTAJE',
  'TARJETA DE ENTRADA A LA BASE', ''
];

const BN1_AFUSTE_POLIVALENTE = [
  'ESCUDO CON PINZOTE', 'ALICATE UNIVERSAL',
  'PASADOR DEL PINZOTE', 'ALICANTE CORTE FRONTAL',
  'SEGURO DE TRANSPORTE CON 2 PASADORES', 'SOPORTE CAJA MUNICION AMP / LAG CON 2 PASADORES',
  'VASO CON 2 PALOMETAS Y PASADOR', 'LLAVE BOCA 17MM',
  'FUNDA VASO', 'LLAVE BOCA 24MM',
  'FUNDA AMP / LAG', 'APOYO TIRADOR',
  'FUNDA AMM / AML', 'SOPORTE AMM / AML CON PASADOR',
  'BOLSA RECOGIDA VAINAS DELANTERA', 'ADAPTADOR AMM CON PASADOR',
  'BOLSA ESLABONES AMP/ LAG', 'ADAPTADOR AML CON 2 PASADORES',
  'BOLSA ESLABONES AMM', 'ADAPTADOR BOLSA MUNICION AML',
  'MANUAL EMPLEO', 'SOPORTE CAJA MUNICION AMM',
  'MANUAL MANTENIMIENTO', 'CHAVETA CUADRADA CON 2 TORNILLOS',
  '4 FICHAS DE EMPLEO PLASTIFICADAS', 'CHAVETA CON RESALTE Y 2 TORNILLOS',
  'CAJA CONTENEDORA', 'DEFLECTOR DE ESLABONES PARA AMM',
  'SOPORTE AMP/LAG CON 3 PASADORES', 'LLAVE ALEN 2,5MM',
  'LLAVE ALEN 6MM', 'LLAVE ALEN 3MM',
  'ARANDELAS', 'LLAVE ALEN 5MM'
];

const BN1_ARMAMENTO_BROWNING = [
  'CAÑON DE RESPETO', 'ESCOBILLON DE ANIMA DE CAÑON',
  'EMPUÑADURA AUXILIAR DE TRANSPORTE', 'ESCOBILLON DE RECAMARA',
  'FUNDA PARA CAÑON DE RESPETO', 'BAQUETA DE LIMPIEZA M-4',
  'BOLSA DE HERRAMIENTAS', 'BAQUETA DE LIMPIEZA M-7',
  'EMPUÑADURA AUXILIAR DEL ARMA', 'TRAMO INICIAL CON EMPUÑADURA',
  'EMPUÑADURA PARA TORRETA MINI SAMSON', 'TRES TRAMOS INTERMEDIOS',
  'ESCOBILLON PARA ORIFICIO PERCULTOR', 'TRAMO LIMPIADOR DE CAÑON',
  'ACEITERA', 'EXTRACTOR DE VAINAS ROTAS',
  'BOTADOR DE 3 MM', 'FUNDA DE AMETRALADORA AMP',
  'ENGARZADOR DE CARTUCHOS', 'DOS GUANTES ANTICALORICOS',
  'LAVADOR PARA ORIFICIO DEL PERCUTOR', 'FICHA INSTRUCCIONES BASICAS'
];

const BN1_ARMAMENTO_LAG40 = [
  'TERMINAL CON OJAL', 'MANGO DE BAQUETA',
  'PINCEL DE NYLON', 'EXTRACTOR',
  'DESTORNILLADOR', 'MARTILLO DE CABEZAS INTERCAMBIABLES',
  'BOTADOR TOPE', 'ACEITERA',
  'FEMINELA DE FIBRA', 'TAPON DE ACEITERA COLOR NEGRO',
  'FEMINELA DE LATON', 'EMPUJADOR',
  'PROLONGADOR', 'GUIA DE HERRAMIENTAS',
  'TERMINAL CON OJAL', 'CUÑA',
  'CAJA PORTA MUNICION', 'MANDO DE ELEVACION',
  'VASO', 'TRIPODE CON FUNDA',
  'PINZOTE', ''
];

const BN1_KIT_RECUPERACION = [
  'PETACA DE AGUA', 'GRILLETES PEQUEÑOS (2)',
  'PICO Y PALA', 'GRILLET GRANDE (1)',
  'BOLSA KIT', 'PAR DE GUANTES',
  'POLEA CON FUNDA', 'GANCHO CON TORNILLO',
  'ESLINGA 10TN', 'LLAVE EN Y'
];

// ============================================================
// S3 MATERIALS
// ============================================================

const S3_HERRAMIENTAS = [
  'CADENAS', 'CAJA BOMBILLAS REPUESTO',
  'CALZOS (2)', 'LAMPARA PORTATIL 24V CON CABLE',
  'TRIANGULOS CON CAJA (2)', 'CHALECOS REFLECTANTES (2)',
  'MANDO CABESTRANTE', 'MANERAL GATO (3)',
  'EXTINTOR 6 KG (Nº SERIE)', 'MANGUERA INFLADO',
  'LLAVE VASO 19 CON EXTENSOR', 'MARTILLO DE BOLA',
  'LLAVE ALLEN 12"', 'LLAVE INGLESA 12" / 8"',
  'JUEGO LLAVES ALLEN 1.5 A 10MM(9)', 'DESTORNILLADOR REVERSIBLE',
  'GATO HIDRAULICO', 'LLAVES FIJAS DEL 6/7 AL 20/22 (8)',
  'CAJA HERRAMIENTAS', 'ALICATES',
  'CABLE DE ARRANQUE CON ADAPTADOR', 'CORREAS PORTAPETACAS',
  '3ª MATRICULA', 'PETACAS DIESEL (2)',
  'MANOMETRO', 'CINTA CABESTRANTE',
  'BOLSA CADENAS', ''
];

const S3_EXTERIOR = [
  'GRILLETES CON PASADOR (4)', 'PASADORES CAPO (2)',
  'PASADORES DE ELEVACION TRASERA (4)', 'PASADOR EN L CON SEGURO DEL CAPO (1)',
  'CINTA CAPO (1)', 'PASADOR DE SEGURIDAD REMOLQUE (1)',
  'RUEDA DE REPUESTO', ''
];

const S3_INTERIOR = [
  'CINTURONAS SEGURIDAD (2)', '',
  'ARMERO SIMPLE (2)', ''
];

const S3_DOCUMENTACION = [
  'HOJA DOCUMENTACION', 'PARTE DE ACCIDENTES',
  'TARJETA Y HOJA DE ITV', 'GUIA DEL CONDUCTOR',
  'M2404', 'MANUAL OPERADOR',
  'FICHA RESPON. J. CONVOY', 'MANUAL DE MANTENIMIENTO',
  'FICHA RESPOND. J. VEHICULO', 'NORMAS DE RECUPERACION (AGO/19)',
  'FICHA DE CONDUCTOR MILITAR', 'PROCEDIMIENTO PEAJES',
  'CERTIFICADO SEGURO', 'TARJETA REPOSTAJE',
  'TARJETA DE ENTRADA A LA BASE', ''
];

const S3_KIT_RECUPERACION = [
  'PETACA DE AGUA', 'GRILLETES PEQUEÑOS (2)',
  'PICO Y PALA', 'GRILLET GRANDE (1)',
  'BOLSA KIT', 'PAR DE GUANTES',
  'POLEA CON FUNDA', 'GANCHO CON TORNILLO',
  'ESLINGA 10TN', 'LLAVE EN Y'
];

// ============================================================
// ANIBAL MATERIALS
// ============================================================

const ANIBAL_HERRAMIENTAS = [
  'CADENAS (2) EN BOLSA', 'BOQUEREL / EMBRUDO',
  'CALZOS (2)', 'GATO HIDRAULICO',
  'TRIANGULOS CON CAJA (2)', 'MANERAL GATO (2)',
  'MANDO CABESTRANTE', 'BOLSA DE HERRAMIENTAS',
  'EXTINTOR 3 KG (Nº SERIE)', 'LLAVE DE RUEDAS',
  'ALARGADERA DE CABESTRANTE', 'LLAVE INGLESA',
  'CABLE DE ARRANQUE', 'MARTILLO',
  'BOLSA CABLE DE ARRANQUE', 'DESTORNILLADOR REVERSIBLE',
  '3ª MATRICULA', 'LLAVES FIJAS DEL 6/7 AL 20/22 (8)',
  'BOTIQUIN VEHICULAR', 'ALICATES',
  'CAJA BOMBILLAS REPUESTO', 'TENSORES PORTAPETACAS (2 JUEGOS)',
  'LAMPARA PORTATIL', 'PETACAS DIESEL (2)',
  'CHALECOS REFLECTANTES (2)', 'TOLDO TRANSPARENTE LONA',
  'BOLSAS CADENAS NEGRA', ''
];

const ANIBAL_EXTERIOR = [
  'GRILLETES CON PASADOR (4)', 'FUNDA DE CABESTRANTE',
  'PASADORES DE ELEVACION TRASERA (4)', ''
];

const ANIBAL_INTERIOR = [
  'CINTURONAS SEGURIDAD (2)', 'CADENAS PORTON TRASERO (2)',
  '', ''
];

const ANIBAL_DOCUMENTACION = [
  'HOJA DOCUMENTACION', 'PARTE DE ACCIDENTES',
  'TARJETA Y HOJA DE ITV', 'GUIA DEL CONDUCTOR',
  'M2404', 'MANUAL TECNICO',
  'FICHA RESPON. J. CONVOY', 'MANUAL USUARIO DE CABESTRANTE',
  'FICHA RESPOND. J. VEHICULO', 'NORMAS DE RECUPERACION (AGO/19)',
  'FICHA DE CONDUCTOR MILITAR', 'PROCEDIMIENTO PEAJES',
  'CERTIFICADO SEGURO', 'TARJETA REPOSTAJE',
  'TARJETA DE ENTRADA A LA BASE', ''
];

const ANIBAL_KIT_RECUPERACION = [
  'PETACA DE AGUA', 'GRILLETES PEQUEÑOS (2)',
  'PICO Y PALA', 'GRILLET GRANDE (1)',
  'BOLSA KIT', 'PAR DE GUANTES',
  'POLEA CON FUNDA', 'GANCHO CON TORNILLO',
  'ESLINGA 10TN', 'LLAVE EN Y'
];

// ============================================================
// BN3 MATERIALS (same as default - from original PDF)
// ============================================================

const BN3_HERRAMIENTAS = HERRAMIENTAS_LISTA;
const BN3_EXTERIOR = EXTERIOR_VEHICULO_LISTA;
const BN3_INTERIOR = INTERIOR_VEHICULO_LISTA;
const BN3_DOCUMENTACION = DOCUMENTACION_LISTA;
const BN3_AFUSTE_POLIVALENTE = AFUSTE_POLIVALENTE_LISTA;
const BN3_ARMAMENTO_BROWNING = ARMAMENTO_BROWNING_LISTA;
const BN3_ARMAMENTO_LAG40 = ARMAMENTO_LAG40_LISTA;
const BN3_KIT_RECUPERACION = KIT_RECUPERACION_LISTA;

// ============================================================
// GET MATERIALS BY VEHICLE TYPE
// ============================================================

const getMaterialsByType = (vehicleType?: string) => {
  if (vehicleType === 'portaspike') {
    return {
      herramientas: PORTASPIKE_HERRAMIENTAS,
      exterior: PORTASPIKE_EXTERIOR,
      interior: PORTASPIKE_INTERIOR,
      documentacion: PORTASPIKE_DOCUMENTACION,
      afuste_spike: PORTASPIKE_AFUSTE_SPIKE,
      kit_recuperacion: PORTASPIKE_KIT_RECUPERACION,
      includeEquipoComunicaciones: true,
      includeArmamento: false,
      includeAfustePolivalente: false,
      afusteTitle: 'AFUSTE SPIKE'
    };
  }

  if (vehicleType === 'bn1') {
    return {
      herramientas: BN1_HERRAMIENTAS,
      exterior: BN1_EXTERIOR,
      interior: BN1_INTERIOR,
      documentacion: BN1_DOCUMENTACION,
      afuste_polivalente: BN1_AFUSTE_POLIVALENTE,
      armamento_browning: BN1_ARMAMENTO_BROWNING,
      armamento_lag40: BN1_ARMAMENTO_LAG40,
      kit_recuperacion: BN1_KIT_RECUPERACION,
      includeEquipoComunicaciones: true,
      includeArmamento: true,
      includeAfustePolivalente: true,
      afusteTitle: 'AFUSTE POLIVALENTE'
    };
  }

  if (vehicleType === 'bn3') {
    return {
      herramientas: BN3_HERRAMIENTAS,
      exterior: BN3_EXTERIOR,
      interior: BN3_INTERIOR,
      documentacion: BN3_DOCUMENTACION,
      afuste_polivalente: BN3_AFUSTE_POLIVALENTE,
      armamento_browning: BN3_ARMAMENTO_BROWNING,
      armamento_lag40: BN3_ARMAMENTO_LAG40,
      kit_recuperacion: BN3_KIT_RECUPERACION,
      includeEquipoComunicaciones: true,
      includeArmamento: true,
      includeAfustePolivalente: true,
      afusteTitle: 'AFUSTE POLIVALENTE'
    };
  }

  if (vehicleType === 's3') {
    return {
      herramientas: S3_HERRAMIENTAS,
      exterior: S3_EXTERIOR,
      interior: S3_INTERIOR,
      documentacion: S3_DOCUMENTACION,
      kit_recuperacion: S3_KIT_RECUPERACION,
      includeEquipoComunicaciones: true,
      includeArmamento: false,
      includeAfustePolivalente: false,
      afusteTitle: 'N/A'
    };
  }

  if (vehicleType === 'anibal') {
    return {
      herramientas: ANIBAL_HERRAMIENTAS,
      exterior: ANIBAL_EXTERIOR,
      interior: ANIBAL_INTERIOR,
      documentacion: ANIBAL_DOCUMENTACION,
      kit_recuperacion: ANIBAL_KIT_RECUPERACION,
      includeEquipoComunicaciones: true,
      includeArmamento: false,
      includeAfustePolivalente: false,
      afusteTitle: 'N/A'
    };
  }

  // DEFAULT for landtrek (or undefined)
  return {
    herramientas: HERRAMIENTAS_LISTA,
    exterior: EXTERIOR_VEHICULO_LISTA,
    interior: INTERIOR_VEHICULO_LISTA,
    documentacion: DOCUMENTACION_LISTA,
    afuste_polivalente: AFUSTE_POLIVALENTE_LISTA,
    armamento_browning: ARMAMENTO_BROWNING_LISTA,
    armamento_lag40: ARMAMENTO_LAG40_LISTA,
    kit_recuperacion: KIT_RECUPERACION_LISTA,
    includeEquipoComunicaciones: true,
    includeArmamento: true,
    includeAfustePolivalente: true,
    afusteTitle: 'AFUSTE POLIVALENTE'
  };
};

const getVehicleImage = (vehicleType?: string): string => {
  switch (vehicleType) {
    case 'portaspike':
      return vehiclePortaspike;
    case 'bn1':
      return vehicleBn1;
    case 's3':
      return vehicleS3;
    case 'anibal':
      return vehicleAnibal;
    default:
      return vehicleDefault;
  }
};

const createMaterialItems = (items: string[]): MaterialItem[] =>
  items.map((nombre) => ({ nombre, presente: false, cantidad: 0 }));

const createComunicacionesItems = (): MaterialItem[] => [
  { nombre: 'BASTIDOR SIMPLE', presente: false, cantidad: 0, version: '' },
  { nombre: 'BASTIDOR DOBLE', presente: false, cantidad: 0, version: '' },
  { nombre: 'BASE DE ANTENA', presente: false, cantidad: 0, version: '' },
  { nombre: 'FUENTE DE ALIMENTACION', presente: false, cantidad: 0 },
  { nombre: 'CABLE DE ALIMENTACION', presente: false, cantidad: 0 },
  { nombre: 'CAJA DE 8 PINES', presente: false, cantidad: 0 },
];

const normalizeMaterialItems = (items: MaterialItem[] | undefined, fallback: MaterialItem[]): MaterialItem[] => {
  if (!items || !Array.isArray(items)) {
    return fallback;
  }

  return items.map((item, index) => {
    const base = {
      nombre: item?.nombre ?? fallback[index]?.nombre ?? '',
      presente: Boolean(item?.presente),
      cantidad: Number.isFinite(Number((item as any)?.cantidad)) && Number((item as any).cantidad) >= 0
        ? Math.floor(Number((item as any).cantidad))
        : 0
    };
    // Preserve version field if the fallback item supports it
    if (fallback[index] !== undefined && 'version' in fallback[index]) {
      return { ...base, version: typeof (item as any)?.version === 'string' ? (item as any).version : '' };
    }
    return base;
  });
};

const normalizeDraftData = (payload: ParteRelevoData, fallback: ParteRelevoData): ParteRelevoData => ({
  ...fallback,
  ...payload,
  herramientas: normalizeMaterialItems(payload.herramientas, fallback.herramientas),
  exterior_vehiculo: normalizeMaterialItems(payload.exterior_vehiculo, fallback.exterior_vehiculo),
  interior_vehiculo: normalizeMaterialItems(payload.interior_vehiculo, fallback.interior_vehiculo),
  documentacion: normalizeMaterialItems(payload.documentacion, fallback.documentacion),
  afuste_polivalente: normalizeMaterialItems(payload.afuste_polivalente, fallback.afuste_polivalente || []),
  afuste_spike: normalizeMaterialItems(payload.afuste_spike, fallback.afuste_spike || []),
  equipo_comunicaciones: normalizeMaterialItems(payload.equipo_comunicaciones, fallback.equipo_comunicaciones || []),
  armamento_browning: normalizeMaterialItems(payload.armamento_browning, fallback.armamento_browning || []),
  armamento_lag40: normalizeMaterialItems(payload.armamento_lag40, fallback.armamento_lag40 || []),
  kit_recuperacion: normalizeMaterialItems(payload.kit_recuperacion, fallback.kit_recuperacion),
  numero_serie_extintor: typeof payload.numero_serie_extintor === 'string' ? payload.numero_serie_extintor : (fallback.numero_serie_extintor ?? ''),
  caducidad_extintor: typeof payload.caducidad_extintor === 'string' ? payload.caducidad_extintor : (fallback.caducidad_extintor ?? ''),
  nombre_entrega: typeof payload.nombre_entrega === 'string' ? payload.nombre_entrega : (fallback.nombre_entrega ?? ''),
  firma_entrega: typeof payload.firma_entrega === 'string' ? payload.firma_entrega : (fallback.firma_entrega ?? ''),
  nombre_recepcion: typeof payload.nombre_recepcion === 'string' ? payload.nombre_recepcion : (fallback.nombre_recepcion ?? ''),
  firma_recepcion: typeof payload.firma_recepcion === 'string' ? payload.firma_recepcion : (fallback.firma_recepcion ?? ''),
  damage_marks: Array.isArray(payload.damage_marks)
    ? payload.damage_marks.map(m => ({
        id: Number(m.id) || 0,
        x_pct: Number(m.x_pct) || 0,
        y_pct: Number(m.y_pct) || 0,
        description: String(m.description || '')
      }))
    : []
});

// ============================================================
// SIGNATURE PAD
// ============================================================
interface SignaturePadProps {
  value: string; // base64 dataURL or ''
  onChange: (dataUrl: string) => void;
  label: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const hasSaved = useRef(false);

  // Load existing signature into canvas when value changes externally
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = value;
    }
    hasSaved.current = !!value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    if (!pos || !lastPos.current) { lastPos.current = pos; return; }
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">{label}</span>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        style={{ touchAction: 'none', width: '100%', height: 'auto' }}
        className="border-2 border-gray-400 dark:border-slate-500 rounded bg-white cursor-crosshair"
      />
      <button
        type="button"
        onClick={clearSignature}
        className="self-start px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900 dark:hover:bg-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded font-bold transition-colors"
      >
        🗑 Borrar firma
      </button>
    </div>
  );
};

// ============================================================
// VEHICLE DAMAGE CANVAS
// ============================================================
// 2x3 images: bn1, bn3/default, portaspike, landtrek (3 cols × 2 rows)
const VIEW_LABELS_2x3 = [
  { label: 'FRONTAL',      cx: 0.13, cy: 0.04 },
  { label: 'LATERAL DER.', cx: 0.47, cy: 0.04 },
  { label: 'TECHO',        cx: 0.83, cy: 0.04 },
  { label: 'TRASERO',      cx: 0.13, cy: 0.54 },
  { label: 'LATERAL IZQ.', cx: 0.47, cy: 0.54 },
];
// 2x2 images: anibal, s3 (4 panels, image has header text so top label starts lower)
const VIEW_LABELS_2x2 = [
  { label: 'FRONTAL',      cx: 0.25, cy: 0.10 },
  { label: 'LATERAL DER.', cx: 0.75, cy: 0.10 },
  { label: 'TRASERO',      cx: 0.25, cy: 0.55 },
  { label: 'LATERAL IZQ.', cx: 0.75, cy: 0.55 },
];

interface VehicleDamageCanvasProps {
  vehicleImageSrc: string;
  vehicleType?: string;
  marks: DamageMark[];
  onAddMark: (x_pct: number, y_pct: number) => void;
}

const VehicleDamageCanvas: React.FC<VehicleDamageCanvasProps> = ({ vehicleImageSrc, vehicleType, marks, onAddMark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marksRef = useRef<DamageMark[]>(marks);
  marksRef.current = marks;
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const viewLabels = (vehicleType === 'anibal' || vehicleType === 's3') ? VIEW_LABELS_2x2 : VIEW_LABELS_2x3;
  const viewLabelsRef = useRef(viewLabels);
  viewLabelsRef.current = viewLabels;
  const showViewLabelsRef = useRef(vehicleImageSrc === vehicleDefault);
  showViewLabelsRef.current = (vehicleImageSrc === vehicleDefault);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imgElRef.current;
    const W = canvas.width, H = canvas.height;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Draw vehicle image as-is
    if (img) {
      ctx.drawImage(img, 0, 0, W, H);
    }

    if (showViewLabelsRef.current) {
      // Draw synthetic labels only for templates that do not include built-in labels.
      const labelFontSize = Math.max(9, Math.round(W * 0.013));
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      viewLabelsRef.current.forEach(({ label, cx, cy }) => {
        const lx = cx * W;
        const ly = cy * H;
        const metrics = ctx.measureText(label);
        const padding = 3;
        const bw = metrics.width + padding * 2;
        const bh = labelFontSize + padding * 2;
        ctx.fillStyle = 'rgba(30, 58, 138, 0.82)';
        ctx.beginPath();
        ctx.roundRect(lx - bw / 2, ly, bw, bh, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, lx, ly + padding);
      });
    }

    // Damage markers
    const currentMarks = marksRef.current;
    currentMarks.forEach(mark => {
      const x = mark.x_pct * W;
      const y = mark.y_pct * H;
      const r = Math.max(9, Math.round(W * 0.013));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.92)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${r + 3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(mark.id), x, y);
    });
  }, []);

  // Load the image element whenever src changes
  useEffect(() => {
    imgElRef.current = null;
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const displayW = Math.round(rect.width) || img.naturalWidth;
      const displayH = Math.round(displayW * img.naturalHeight / img.naturalWidth);
      canvas.width = displayW;
      canvas.height = displayH;
      redraw();
    };
    img.src = vehicleImageSrc;
  }, [vehicleImageSrc, redraw]);

  useEffect(() => {
    redraw();
  }, [marks, redraw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    onAddMark(
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height
    );
  };

  return (
    <div style={{ width: '100%', aspectRatio: '1152 / 648' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
        className="rounded border border-gray-300 dark:border-slate-600"
      />
    </div>
  );
};
export const ParteRelevoForm: React.FC<ParteRelevoFormProps> = ({
  vehicleType,
  vehicleId,
  onDirtyChange,
  onSaved,
  onSaveError,
  onDiscarded,
  saveTick,
  discardTick,
  currentUsername
}) => {
  const materials = useMemo(() => getMaterialsByType(vehicleType), [vehicleType]);
  const vehicleImage = getVehicleImage(vehicleType);

  const initialData = useMemo<ParteRelevoData>(() => ({
    matricula: '',
    numero_parte: '',
    fecha: new Date().toISOString().split('T')[0],
    herramientas: createMaterialItems(materials.herramientas),
    exterior_vehiculo: createMaterialItems(materials.exterior),
    interior_vehiculo: createMaterialItems(materials.interior),
    documentacion: createMaterialItems(materials.documentacion),
    afuste_polivalente: createMaterialItems((materials as any).afuste_polivalente || []),
    afuste_spike: createMaterialItems((materials as any).afuste_spike || []),
    equipo_comunicaciones: createComunicacionesItems(),
    armamento_browning: createMaterialItems((materials as any).armamento_browning || []),
    armamento_lag40: createMaterialItems((materials as any).armamento_lag40 || []),
    kit_recuperacion: createMaterialItems(materials.kit_recuperacion),
    novedades_exteriores: '',
    novedades_varias: '',
    damage_marks: [],
    numero_serie_extintor: '',
    caducidad_extintor: '',
    nombre_entrega: '',
    firma_entrega: '',
    nombre_recepcion: '',
    firma_recepcion: ''
  }), [materials]);

  const defaultExpandedSections = useMemo(() => ({
    herramientas: true,
    exterior_vehiculo: false,
    interior_vehiculo: false,
    documentacion: false,
    afuste_polivalente: false,
    afuste_spike: false,
    equipo_comunicaciones: false,
    armamento_browning: false,
    armamento_lag40: false,
    kit_recuperacion: false,
    novedades: false,
    damage_diagram: false,
    firmas: false
  }), []);

  const [data, setData] = useState<ParteRelevoData>(initialData);
  const dataRef = React.useRef<ParteRelevoData>(initialData);
  const pendingScrollRef = useRef<{parent: HTMLElement; top: number} | {win: true; top: number} | null>(null);

  useLayoutEffect(() => {
    const s = pendingScrollRef.current;
    if (!s) return;
    pendingScrollRef.current = null;
    if ('win' in s) { window.scrollTo({ top: s.top, behavior: 'auto' }); }
    else { s.parent.scrollTop = s.top; }
  });
  const lastPersistedDataRef = React.useRef<ParteRelevoData>(initialData);

  const [expandedSections, setExpandedSections] = useState(defaultExpandedSections);
  const isDirtyRef = React.useRef(false);
  const [dirtySticky, setDirtySticky] = useState(false);
  const dirtyStickyRef = React.useRef(false);
  const lastSaveTickRef = React.useRef<number | undefined>(undefined);
  const lastDiscardTickRef = React.useRef<number | undefined>(undefined);
  const dirtyStorageKey = useMemo(() => {
    return vehicleId ? `parteRelevoDirty:${vehicleId}` : 'parteRelevoDirty:unknown';
  }, [vehicleId]);
  const vehicleRef = useMemo(() => {
    if (!vehicleId) return null;
    return doc(db, 'vehicles', vehicleId);
  }, [vehicleId]);

  const markClean = useCallback(() => {
    isDirtyRef.current = false;
    dirtyStickyRef.current = false;
    setDirtySticky(false);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(dirtyStorageKey);
      }
    } catch {
      // no-op
    }
    onDirtyChange?.(false);
  }, [dirtyStorageKey, onDirtyChange]);

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    dirtyStickyRef.current = true;
    setDirtySticky(true);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(dirtyStorageKey, '1');
      }
    } catch {
      // no-op
    }
    onDirtyChange?.(true);
  }, [dirtyStorageKey, onDirtyChange]);

  useEffect(() => {
    try {
      if (!dirtyStickyRef.current && typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(dirtyStorageKey);
        if (stored === '1') {
          dirtyStickyRef.current = true;
          setDirtySticky(true);
          onDirtyChange?.(true);
        }
      }
    } catch {
      // no-op
    }
    if (dirtyStickyRef.current) return;
    setData(initialData);
    lastPersistedDataRef.current = initialData;
    setExpandedSections(defaultExpandedSections);
    markClean();
  }, [dirtyStorageKey, initialData, defaultExpandedSections, markClean, onDirtyChange, vehicleId]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!vehicleRef) return;
    const unsubscribe = onSnapshot(vehicleRef, (snapshot) => {
      if (isDirtyRef.current) return;

      if (!snapshot.exists()) {
        setData(initialData);
        lastPersistedDataRef.current = initialData;
        setExpandedSections(defaultExpandedSections);
        markClean();
        return;
      }

      const payload = (snapshot.data() as any)?.parteRelevoDraft?.data as ParteRelevoData | undefined;
      if (payload) {
        const normalized = normalizeDraftData(payload, initialData);
        setData(normalized);
        lastPersistedDataRef.current = normalized;
        markClean();
        return;
      }

      setData(initialData);
      lastPersistedDataRef.current = initialData;
      setExpandedSections(defaultExpandedSections);
      markClean();
    }, (error) => {
      const message = error?.message ? `Error cargando Parte Relevo: ${error.message}` : 'Error cargando Parte Relevo';
      onSaveError?.(message);
    });
    return () => unsubscribe();
  }, [vehicleRef, initialData, defaultExpandedSections, markClean, onSaveError]);

  const saveDraft = useCallback(async (payload: ParteRelevoData): Promise<boolean> => {
    if (!vehicleRef) {
      onSaveError?.('Error al guardar Parte Relevo: vehículo no válido');
      return false;
    }
    try {
      await setDoc(vehicleRef, {
        parteRelevoDraft: {
          data: payload,
          updatedAt: serverTimestamp(),
          updatedBy: currentUsername || 'Sistema'
        }
      }, { merge: true });

      lastPersistedDataRef.current = payload;
      markClean();
      onSaved?.();
      return true;
    } catch (error: any) {
      const message = error?.message ? `Error al guardar Parte Relevo: ${error.message}` : 'Error al guardar Parte Relevo';
      onSaveError?.(message);
      console.error('Error guardando Parte Relevo:', error);
      return false;
    }
  }, [vehicleRef, currentUsername, markClean, onSaved, onSaveError]);

  const discardDraft = useCallback(async () => {
    setData(lastPersistedDataRef.current);
    markClean();
    onDiscarded?.();
  }, [markClean, onDiscarded]);

  useEffect(() => {
    if (saveTick === undefined) return;
    if (lastSaveTickRef.current === undefined) {
      lastSaveTickRef.current = saveTick;
      return;
    }
    if (saveTick === lastSaveTickRef.current) return;
    lastSaveTickRef.current = saveTick;
    void saveDraft(dataRef.current);
  }, [saveTick, saveDraft]);

  useEffect(() => {
    if (discardTick === undefined) return;
    if (lastDiscardTickRef.current === undefined) {
      lastDiscardTickRef.current = discardTick;
      return;
    }
    if (discardTick === lastDiscardTickRef.current) return;
    lastDiscardTickRef.current = discardTick;
    void discardDraft();
  }, [discardTick, discardDraft]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section as keyof typeof prev]
    }));
  };

  const getScrollableParent = (element: HTMLElement | null): HTMLElement | null => {
    let current = element?.parentElement || null;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
      if (canScroll) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  const handleItemChange = (category: string, index: number, value: boolean, target?: HTMLElement | null) => {
    const scrollParent = typeof window !== 'undefined' ? getScrollableParent(target || null) : null;
    if (scrollParent) {
      pendingScrollRef.current = { parent: scrollParent, top: scrollParent.scrollTop };
    } else if (typeof window !== 'undefined') {
      pendingScrollRef.current = { win: true, top: window.scrollY };
    }
    setData(prev => {
      const categoryData = (prev as any)[category] as MaterialItem[] | undefined;
      if (!categoryData || !categoryData[index]) {
        return prev;
      }
      const nextCategoryData = categoryData.map((item, itemIndex) => (
        itemIndex === index ? { ...item, presente: value } : item
      ));

      return {
        ...prev,
        [category]: nextCategoryData
      };
    });
    markDirty();
  };

  const handleTextChange = (field: string, value: string) => {
    setData(prev => ({
      ...prev,
      [field]: value
    }));
    markDirty();
  };

  const handleItemQuantityChange = (category: string, index: number, value: string, target?: HTMLElement | null) => {
    const parsed = Number.parseInt(value, 10);
    const quantity = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const scrollParent = typeof window !== 'undefined' ? getScrollableParent(target || null) : null;
    if (scrollParent) {
      pendingScrollRef.current = { parent: scrollParent, top: scrollParent.scrollTop };
    } else if (typeof window !== 'undefined') {
      pendingScrollRef.current = { win: true, top: window.scrollY };
    }

    setData(prev => {
      const categoryData = (prev as any)[category] as MaterialItem[] | undefined;
      if (!categoryData || !categoryData[index]) {
        return prev;
      }

      const nextCategoryData = categoryData.map((item, itemIndex) => (
        itemIndex === index ? { ...item, cantidad: quantity } : item
      ));

      return {
        ...prev,
        [category]: nextCategoryData
      };
    });

    markDirty();
  };

  const handleItemVersionChange = (category: string, index: number, value: string) => {
    setData(prev => {
      const categoryData = (prev as any)[category] as MaterialItem[] | undefined;
      if (!categoryData || !categoryData[index]) return prev;
      const nextCategoryData = categoryData.map((item, itemIndex) =>
        itemIndex === index ? { ...item, version: value } : item
      );
      return { ...prev, [category]: nextCategoryData };
    });
    markDirty();
  };

  const addDamageMark = useCallback((x_pct: number, y_pct: number) => {
    setData(prev => {
      const marks = prev.damage_marks || [];
      const nextId = marks.length > 0 ? Math.max(...marks.map(m => m.id)) + 1 : 1;
      return { ...prev, damage_marks: [...marks, { id: nextId, x_pct, y_pct, description: '' }] };
    });
    markDirty();
  }, [markDirty]);

  const removeLastDamageMark = useCallback(() => {
    setData(prev => {
      const marks = prev.damage_marks || [];
      if (marks.length === 0) return prev;
      return { ...prev, damage_marks: marks.slice(0, -1) };
    });
    markDirty();
  }, [markDirty]);

  const clearAllDamageMarks = useCallback(() => {
    setData(prev => ({ ...prev, damage_marks: [] }));
    markDirty();
  }, [markDirty]);

  const updateDamageMarkDescription = useCallback((id: number, description: string) => {
    setData(prev => ({
      ...prev,
      damage_marks: (prev.damage_marks || []).map(m => m.id === id ? { ...m, description } : m)
    }));
    markDirty();
  }, [markDirty]);

  const arrayBufferToBase64 = async (buffer: ArrayBuffer): Promise<string> => {
    try {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      return String(dataUrl).split(',')[1] || '';
    } catch {
      return '';
    }
  };

  const loadImageDataUrl = async (src: string): Promise<string> => {
    if (!src) return '';
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      return dataUrl;
    } catch (err) {
      console.warn('No se pudo cargar imagen para PDF:', err);
      return '';
    }
  };

  // Load the vehicle image as-is for the PDF.
  const loadFlippedVehicleImageDataUrl = async (src: string): Promise<string> => {
    return loadImageDataUrl(src);
  };

  const sendPdfToNative = async (doc: jsPDF, filename: string) => {
    const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
    if (!rnWebView?.postMessage) return false;

    try {
      let base64 = '';
      try {
        const buffer = doc.output('arraybuffer') as ArrayBuffer;
        base64 = await arrayBufferToBase64(buffer);
      } catch {
        // no-op
      }

      if (!base64) {
        try {
          const dataUri = doc.output('datauristring');
          base64 = String(dataUri || '').split(',')[1] || '';
        } catch {
          // no-op
        }
      }

      if (!base64) return false;

      const chunkSize = 25000;
      if (base64.length <= chunkSize) {
        rnWebView.postMessage(JSON.stringify({
          type: 'downloadBlob',
          base64,
          mime: 'application/pdf',
          filename
        }));
        return true;
      }

      const totalChunks = Math.ceil(base64.length / chunkSize);
      const transferId = `pdf-${Date.now()}`;

      rnWebView.postMessage(JSON.stringify({
        type: 'downloadBlobStart',
        id: transferId,
        mime: 'application/pdf',
        filename,
        totalChunks
      }));

      for (let i = 0; i < totalChunks; i += 1) {
        const chunk = base64.slice(i * chunkSize, (i + 1) * chunkSize);
        rnWebView.postMessage(JSON.stringify({
          type: 'downloadBlobChunk',
          id: transferId,
          index: i,
          data: chunk
        }));
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      rnWebView.postMessage(JSON.stringify({
        type: 'downloadBlobEnd',
        id: transferId
      }));

      return true;
    } catch (err) {
      console.error('Error enviando PDF a app móvil:', err);
      return false;
    }
  };

  const generatePDFFromData = async () => {
    try {
      if (dirtyStickyRef.current) {
        const saved = await saveDraft(dataRef.current);
        if (!saved) {
          alert('No se pudo guardar la información antes de generar el PDF. Revisa el error e inténtalo de nuevo.');
          return;
        }
      }

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const colWidth = (pageWidth - 2 * margin) / 4;
      const rowHeight = 5;

      let currentY = margin;

      const drawHeader = (y: number): number => {
        let yPos = y;
        doc.setFontSize(14);
        doc.setFont('Helvetica', 'bold');
        doc.text('VALE DE ENTREGA Y RECEPCION DE VEHICULOS', pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;

        doc.setFontSize(9);
        doc.setLineWidth(0.5);
        
        doc.rect(margin, yPos, colWidth * 1.5, rowHeight * 2);
        doc.rect(margin + colWidth * 1.5, yPos, colWidth * 2.5, rowHeight * 2);

        doc.setFont('Helvetica', 'bold');
        doc.text('MATRICULA', margin + 2, yPos + 3);
        doc.text('Nº PARTE', margin + colWidth * 1.5 + 2, yPos + 3);
        doc.text('FECHA', margin + colWidth * 1.5 + 2, yPos + 8);

        doc.setFont('Helvetica', 'normal');
        doc.text(data.matricula || '', margin + 2, yPos + 8);
        doc.text(data.numero_parte || '', margin + colWidth * 1.5 + 2, yPos + 13);
        doc.text(data.fecha || '', margin + colWidth * 3 + 2, yPos + 13);

        yPos += 12;

        // Extintor row
        const extRow = rowHeight * 2;
        doc.rect(margin, yPos, colWidth * 2, extRow);
        doc.rect(margin + colWidth * 2, yPos, colWidth * 2, extRow);
        doc.setFont('Helvetica', 'bold');
        doc.text('EXTINTOR Nº SERIE', margin + 2, yPos + 3);
        doc.text('EXTINTOR CADUCIDAD', margin + colWidth * 2 + 2, yPos + 3);
        doc.setFont('Helvetica', 'normal');
        doc.text(data.numero_serie_extintor || '', margin + 2, yPos + 8);
        doc.text(data.caducidad_extintor || '', margin + colWidth * 2 + 2, yPos + 8);

        return yPos + extRow;
      };

      const drawTable = (title: string, items: MaterialItem[], y: number): number => {
        let yPos = y;
        if (yPos + 20 > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.7);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5);
        doc.text(title, pageWidth / 2, yPos + 4, { align: 'center' });
        yPos += 5;

        doc.setFontSize(8);
        doc.setLineWidth(0.5);
        const headers = ['DESCRIPCION', 'SI / NO', 'DESCRIPCION', 'SI / NO'];
        for (let idx = 0; idx < headers.length; idx += 1) {
          const header = headers[idx];
          doc.rect(margin + idx * colWidth, yPos, colWidth, rowHeight);
          doc.text(header, margin + idx * colWidth + 2, yPos + 3);
        }
        yPos += rowHeight;

        doc.setFont('Helvetica', 'normal');
        const formatItemName = (item: MaterialItem) => {
          const quantity = Number.isFinite(item.cantidad) ? item.cantidad : 0;
          return quantity > 0 ? `${item.nombre} [x${quantity}]` : item.nombre;
        };

        for (let i = 0; i < items.length; i += 2) {
          if (yPos + rowHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            doc.setFontSize(8);
            doc.setFont('Helvetica', 'bold');
            for (let idx = 0; idx < headers.length; idx += 1) {
              const header = headers[idx];
              doc.rect(margin + idx * colWidth, yPos, colWidth, rowHeight);
              doc.text(header, margin + idx * colWidth + 2, yPos + 3);
            }
            yPos += rowHeight;
            doc.setFont('Helvetica', 'normal');
          }

          doc.rect(margin, yPos, colWidth * 1.5, rowHeight);
          doc.text(formatItemName(items[i]) || '', margin + 1, yPos + 3);
          
          doc.rect(margin + colWidth * 1.5, yPos, colWidth * 0.5, rowHeight);
          const checkbox1 = items[i].presente ? 'SÍ' : 'NO';
          doc.text(checkbox1, margin + colWidth * 1.5 + colWidth / 4 - 1, yPos + 3, { align: 'center' });

          if (i + 1 < items.length) {
            doc.rect(margin + colWidth * 2, yPos, colWidth * 1.5, rowHeight);
            doc.text(formatItemName(items[i + 1]) || '', margin + colWidth * 2 + 1, yPos + 3);
            
            doc.rect(margin + colWidth * 3.5, yPos, colWidth * 0.5, rowHeight);
            const checkbox2 = items[i + 1].presente ? 'SÍ' : 'NO';
            doc.text(checkbox2, margin + colWidth * 3.5 + colWidth / 4 - 1, yPos + 3, { align: 'center' });
          } else {
            doc.rect(margin + colWidth * 2, yPos, colWidth * 1.5, rowHeight);
            doc.rect(margin + colWidth * 3.5, yPos, colWidth * 0.5, rowHeight);
          }

          yPos += rowHeight;
        }

        return yPos + 2;
      };

      const drawComunicacionesTable = (title: string, items: MaterialItem[], y: number): number => {
        let yPos = y;
        if (yPos + 20 > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.7);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5);
        doc.text(title, pageWidth / 2, yPos + 4, { align: 'center' });
        yPos += 5;

        doc.setFontSize(8);
        doc.setLineWidth(0.5);
        const headers = ['DESCRIPCION', 'VER/SI-NO', 'DESCRIPCION', 'VER/SI-NO'];
        for (let idx = 0; idx < headers.length; idx += 1) {
          doc.rect(margin + idx * colWidth, yPos, colWidth, rowHeight);
          doc.text(headers[idx], margin + idx * colWidth + 2, yPos + 3);
        }
        yPos += rowHeight;

        doc.setFont('Helvetica', 'normal');
        const getComunicacionesLabel = (item: MaterialItem): string => {
          if ('version' in item) {
            const ver = item.version || '';
            const qty = Number.isFinite(item.cantidad) && item.cantidad > 0 ? item.cantidad : 0;
            if (!ver) return '---';
            return qty > 1 ? `${qty}x${ver}` : ver;
          }
          return item.presente ? 'SÍ' : 'NO';
        };

        for (let i = 0; i < items.length; i += 2) {
          if (yPos + rowHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            doc.setFontSize(8);
            doc.setFont('Helvetica', 'bold');
            for (let idx = 0; idx < headers.length; idx += 1) {
              doc.rect(margin + idx * colWidth, yPos, colWidth, rowHeight);
              doc.text(headers[idx], margin + idx * colWidth + 2, yPos + 3);
            }
            yPos += rowHeight;
            doc.setFont('Helvetica', 'normal');
          }

          doc.rect(margin, yPos, colWidth * 1.5, rowHeight);
          doc.text(items[i].nombre || '', margin + 1, yPos + 3);
          doc.rect(margin + colWidth * 1.5, yPos, colWidth * 0.5, rowHeight);
          const label1 = getComunicacionesLabel(items[i]);
          doc.text(label1, margin + colWidth * 1.5 + colWidth / 4 - 1, yPos + 3, { align: 'center' });

          if (i + 1 < items.length) {
            doc.rect(margin + colWidth * 2, yPos, colWidth * 1.5, rowHeight);
            doc.text(items[i + 1].nombre || '', margin + colWidth * 2 + 1, yPos + 3);
            doc.rect(margin + colWidth * 3.5, yPos, colWidth * 0.5, rowHeight);
            const label2 = getComunicacionesLabel(items[i + 1]);
            doc.text(label2, margin + colWidth * 3.5 + colWidth / 4 - 1, yPos + 3, { align: 'center' });
          } else {
            doc.rect(margin + colWidth * 2, yPos, colWidth * 1.5, rowHeight);
            doc.rect(margin + colWidth * 3.5, yPos, colWidth * 0.5, rowHeight);
          }

          yPos += rowHeight;
        }

        return yPos + 2;
      };

      currentY = drawHeader(currentY);
      currentY = drawTable('HERRAMIENTAS', data.herramientas, currentY);
      currentY = drawTable('EXTERIOR DE VEHICULO', data.exterior_vehiculo, currentY);
      currentY = drawTable('INTERIOR DE VEHICULO', data.interior_vehiculo, currentY);
      currentY = drawTable('DOCUMENTACION', data.documentacion, currentY);
      
      if ((materials as any).includeAfustePolivalente && data.afuste_polivalente?.length) {
        currentY = drawTable('AFUSTE POLIVALENTE N°:', data.afuste_polivalente, currentY);
      }
      
      if ((materials as any).afuste_spike && data.afuste_spike?.length) {
        currentY = drawTable('AFUSTE SPIKE', data.afuste_spike, currentY);
      }
      
      if ((materials as any).includeArmamento && data.armamento_browning?.length) {
        currentY = drawTable('ARMAMENTO AMP BROWNING 12\' 70 S/N:', data.armamento_browning, currentY);
        currentY = drawTable('ARMAMENTO LAG 40 S/N:', data.armamento_lag40 || [], currentY);
      }
      
      if ((materials as any).includeEquipoComunicaciones && data.equipo_comunicaciones?.length) {
        currentY = drawComunicacionesTable('EQUIPO DE COMUNICACIONES', data.equipo_comunicaciones, currentY);
      }
      
      currentY = drawTable('KIT RECUPERACION Y EXTRAS', data.kit_recuperacion, currentY);

      if (currentY + 30 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      const novedadesBoxHeight = 40;
      const novedadesTextLineHeight = 4;
      const novedadesTextMaxWidth = pageWidth - 2 * margin - 4;
      const novedadesTextMaxLines = Math.max(1, Math.floor((novedadesBoxHeight - 4) / novedadesTextLineHeight));

      // NOVEDADES VARIAS ENTRE RELEVOS
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      doc.setLineWidth(0.7);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 5);
      doc.text('NOVEDADES VARIAS ENTRE RELEVOS', pageWidth / 2, currentY + 4, { align: 'center' });
      currentY += 8;

      const novedadesVariasBoxTop = currentY;
      doc.setLineWidth(0.5);
      doc.rect(margin, novedadesVariasBoxTop, pageWidth - 2 * margin, novedadesBoxHeight);

      if (data.novedades_varias) {
        doc.setFontSize(8);
        doc.setFont('Helvetica', 'normal');
        const splitNovedadesVarias = doc.splitTextToSize(data.novedades_varias, novedadesTextMaxWidth).slice(0, novedadesTextMaxLines);
        doc.text(splitNovedadesVarias, margin + 2, novedadesVariasBoxTop + 3);
      }

      currentY = novedadesVariasBoxTop + novedadesBoxHeight + 5;

      // DIBUJOS DEL VEHÍCULO
      if (currentY + 70 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      doc.setLineWidth(0.7);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 5);
      doc.text('DIBUJOS DEL VEHÍCULO - VISTA SUPERIOR / LATERAL / EXTERIOR', pageWidth / 2, currentY + 4, { align: 'center' });
      currentY += 8;

      const vehicleImageWidth = pageWidth - 2 * margin;
      const vehicleImageHeight = 65;
      const vehicleImageY = currentY;

      try {
        const imageDataUrl = await loadFlippedVehicleImageDataUrl(vehicleImage);
        if (imageDataUrl) {
          doc.addImage(imageDataUrl, 'PNG', margin, currentY, vehicleImageWidth, vehicleImageHeight);
        } else {
          doc.setFontSize(8);
          doc.text('[Imagen de vehículos no disponible]', margin + 2, currentY + 3);
        }
      } catch (imgError) {
        doc.setFontSize(8);
        doc.text('[Imagen de vehículos no disponible]', margin + 2, currentY + 3);
      }

      // Draw damage markers on top of the image
      const damageMarks = data.damage_marks || [];
      if (damageMarks.length > 0) {
        const markerR = 3;
        damageMarks.forEach(mark => {
          const mx = margin + mark.x_pct * vehicleImageWidth;
          const my = vehicleImageY + mark.y_pct * vehicleImageHeight;
          doc.setFillColor(220, 38, 38);
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.4);
          doc.circle(mx, my, markerR, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6);
          doc.setFont('Helvetica', 'bold');
          doc.text(String(mark.id), mx, my + 1, { align: 'center' });
        });
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.setFillColor(0, 0, 0);
      }

      currentY = vehicleImageY + vehicleImageHeight + 5;

      // NOVEDADES EXTERIORES (numbered damage list)
      if (damageMarks.length > 0) {
        const neededHeight = 10 + damageMarks.length * 6;
        if (currentY + neededHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }

        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.7);
        doc.rect(margin, currentY, pageWidth - 2 * margin, 5);
        doc.text('NOVEDADES EXTERIORES', pageWidth / 2, currentY + 4, { align: 'center' });
        currentY += 5;

        const numColW = 12;
        const descColW = pageWidth - 2 * margin - numColW;

        damageMarks.forEach(mark => {
          if (currentY + 6 > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
          }
          doc.setFontSize(8);
          doc.setFont('Helvetica', 'bold');
          doc.setLineWidth(0.5);
          doc.rect(margin, currentY, numColW, 6);
          doc.text(String(mark.id), margin + numColW / 2, currentY + 4, { align: 'center' });
          doc.setFont('Helvetica', 'normal');
          doc.rect(margin + numColW, currentY, descColW, 6);
          const descLine = doc.splitTextToSize(mark.description || '', descColW - 3)[0] ?? '';
          doc.text(descLine, margin + numColW + 2, currentY + 4);
          currentY += 6;
        });

        currentY += 3;
      } else if (data.novedades_exteriores) {
        // Backward compat: old text-based novedades exteriores
        if (currentY + 15 > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.7);
        doc.rect(margin, currentY, pageWidth - 2 * margin, 5);
        doc.text('NOVEDADES EXTERIORES', pageWidth / 2, currentY + 4, { align: 'center' });
        currentY += 8;
        const oldBoxTop = currentY;
        doc.setLineWidth(0.5);
        doc.rect(margin, oldBoxTop, pageWidth - 2 * margin, novedadesBoxHeight);
        doc.setFontSize(8);
        doc.setFont('Helvetica', 'normal');
        const splitOld = doc.splitTextToSize(data.novedades_exteriores, novedadesTextMaxWidth).slice(0, novedadesTextMaxLines);
        doc.text(splitOld, margin + 2, oldBoxTop + 3);
        currentY = oldBoxTop + novedadesBoxHeight + 5;
      }

      // ── FIRMAS ────────────────────────────────────────────────
      {
        const sigSectionNeeded = 50;
        if (currentY + sigSectionNeeded > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }

        // Section header
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.7);
        const sigSectionW = pageWidth - 2 * margin;
        doc.rect(margin, currentY, sigSectionW, 5);
        doc.text('FIRMAS', pageWidth / 2, currentY + 4, { align: 'center' });
        currentY += 5;

        const halfW = sigSectionW / 2;
        const sigBoxH = 35;
        const nameH = 7;

        // Box headers
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'bold');
        doc.setLineWidth(0.5);
        doc.rect(margin, currentY, halfW, nameH);
        doc.text('ENTREGA', margin + halfW / 2, currentY + 5, { align: 'center' });
        doc.rect(margin + halfW, currentY, halfW, nameH);
        doc.text('RECEPCIÓN', margin + halfW + halfW / 2, currentY + 5, { align: 'center' });
        currentY += nameH;

        // Name rows
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7);
        doc.rect(margin, currentY, halfW, nameH);
        doc.text('Nombre:', margin + 2, currentY + 3);
        doc.setFont('Helvetica', 'normal');
        doc.text(data.nombre_entrega || '', margin + 20, currentY + 3);
        doc.setFont('Helvetica', 'bold');
        doc.rect(margin + halfW, currentY, halfW, nameH);
        doc.text('Nombre:', margin + halfW + 2, currentY + 3);
        doc.setFont('Helvetica', 'normal');
        doc.text(data.nombre_recepcion || '', margin + halfW + 20, currentY + 3);
        currentY += nameH;

        // Signature image boxes
        doc.setLineWidth(0.4);
        doc.rect(margin, currentY, halfW, sigBoxH);
        doc.rect(margin + halfW, currentY, halfW, sigBoxH);

        const addSigImage = async (dataUrl: string, x: number, y: number, w: number, h: number) => {
          if (!dataUrl) return;
          try {
            doc.addImage(dataUrl, 'PNG', x + 2, y + 2, w - 4, h - 4);
          } catch {
            // ignore failed image
          }
        };

        await addSigImage(data.firma_entrega || '', margin, currentY, halfW, sigBoxH);
        await addSigImage(data.firma_recepcion || '', margin + halfW, currentY, halfW, sigBoxH);

        currentY += sigBoxH + 5;
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `ParteRelevo_${data.matricula || 'sin_matricula'}_${timestamp}.pdf`;

      const rnWebView = typeof window !== 'undefined' ? (window as any).ReactNativeWebView : null;
      const sentToNative = await sendPdfToNative(doc, filename);
      if (sentToNative) {
        return;
      }

      if (rnWebView?.postMessage) {
        alert('No se pudo generar el PDF en este dispositivo. Inténtalo de nuevo.');
        return;
      }

      try {
        const dataUri = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = dataUri as string;
        link.download = filename;
        link.click();
        return;
      } catch {
        // no-op
      }

      doc.save(filename);
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF');
    }
  };

  const SectionHeader: React.FC<{ title: string; sectionKey: string }> = ({ title, sectionKey }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between bg-blue-600 dark:bg-blue-700 text-white p-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-bold"
    >
      <span>{title}</span>
      {expandedSections[sectionKey as keyof typeof expandedSections] ? (
        <ChevronUpIcon className="h-5 w-5" />
      ) : (
        <ChevronDownIcon className="h-5 w-5" />
      )}
    </button>
  );

  const MaterialGrid: React.FC<{ title: string; sectionKey: string; items: MaterialItem[] }> = ({
    title,
    sectionKey,
    items
  }) => (
    <div className="space-y-3">
      <SectionHeader title={title} sectionKey={sectionKey} />
      {expandedSections[sectionKey as keyof typeof expandedSections] && (
        <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg bg-gray-50 dark:bg-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.presente}
                    onChange={(e) => handleItemChange(sectionKey, idx, e.target.checked, e.currentTarget)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{item.nombre}</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.cantidad ?? 0}
                  onChange={(e) => handleItemQuantityChange(sectionKey, idx, e.target.value, e.currentTarget)}
                  className="w-16 px-2 py-1 text-xs text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  aria-label={`Cantidad de ${item.nombre}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const ComunicacionesGrid: React.FC<{ title: string; sectionKey: string; items: MaterialItem[] }> = ({
    title,
    sectionKey,
    items
  }) => (
    <div className="space-y-3">
      <SectionHeader title={title} sectionKey={sectionKey} />
      {expandedSections[sectionKey as keyof typeof expandedSections] && (
        <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg bg-gray-50 dark:bg-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item, idx) => {
              const hasVersion = 'version' in item;
              return (
                <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.presente}
                      onChange={(e) => handleItemChange(sectionKey, idx, e.target.checked, e.currentTarget)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{item.nombre}</span>
                  </label>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {hasVersion && (
                      <select
                        value={item.version ?? ''}
                        onChange={(e) => handleItemVersionChange(sectionKey, idx, e.target.value)}
                        className="w-16 px-1 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        aria-label={`Versión de ${item.nombre}`}
                      >
                        <option value="">---</option>
                        <option value="V1">V1</option>
                        <option value="V3">V3</option>
                      </select>
                    )}
                    {hasVersion && (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={item.cantidad ?? 0}
                        onChange={(e) => handleItemQuantityChange(sectionKey, idx, e.target.value, e.currentTarget)}
                        className="w-14 px-2 py-1 text-xs text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        aria-label={`Cantidad de ${item.nombre}`}
                      />
                    )}
                    {!hasVersion && (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={item.cantidad ?? 0}
                        onChange={(e) => handleItemQuantityChange(sectionKey, idx, e.target.value, e.currentTarget)}
                        className="w-16 px-2 py-1 text-xs text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        aria-label={`Cantidad de ${item.nombre}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto p-6 bg-white dark:bg-slate-800 rounded-xl shadow-lg space-y-6">
      <div className="border-2 border-gray-800 dark:border-gray-300 p-4 rounded-lg bg-gray-50 dark:bg-slate-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center">
          VALE DE ENTREGA Y RECEPCIÓN DE VEHÍCULOS
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              MATRÍCULA
            </label>
            <input
              type="text"
              value={data.matricula}
              onChange={(e) => handleTextChange('matricula', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: MAD-1234"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Nº PARTE
            </label>
            <input
              type="text"
              value={data.numero_parte}
              onChange={(e) => handleTextChange('numero_parte', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 001"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              FECHA
            </label>
            <input
              type="date"
              value={data.fecha}
              onChange={(e) => handleTextChange('fecha', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              EXTINTOR — Nº SERIE
            </label>
            <input
              type="text"
              value={data.numero_serie_extintor || ''}
              onChange={(e) => handleTextChange('numero_serie_extintor', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nº de serie del extintor"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              EXTINTOR — CADUCIDAD
            </label>
            <input
              type="date"
              value={data.caducidad_extintor || ''}
              onChange={(e) => handleTextChange('caducidad_extintor', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <MaterialGrid title="🔧 HERRAMIENTAS" sectionKey="herramientas" items={data.herramientas} />
      <MaterialGrid title="🚙 EXTERIOR DE VEHÍCULO" sectionKey="exterior_vehiculo" items={data.exterior_vehiculo} />
      <MaterialGrid title="🚗 INTERIOR DE VEHÍCULO" sectionKey="interior_vehiculo" items={data.interior_vehiculo} />
      <MaterialGrid title="📄 DOCUMENTACIÓN" sectionKey="documentacion" items={data.documentacion} />
      
      {(materials as any).includeAfustePolivalente && data.afuste_polivalente && (
        <MaterialGrid title="📡 AFUSTE POLIVALENTE" sectionKey="afuste_polivalente" items={data.afuste_polivalente} />
      )}
      
      {(materials as any).afuste_spike && data.afuste_spike && (
        <MaterialGrid title="📡 AFUSTE SPIKE" sectionKey="afuste_spike" items={data.afuste_spike} />
      )}
      
      {(materials as any).includeArmamento && data.armamento_browning && (
        <MaterialGrid title="🔫 ARMAMENTO AMP BROWNING" sectionKey="armamento_browning" items={data.armamento_browning} />
      )}
      
      {(materials as any).includeArmamento && data.armamento_lag40 && (
        <MaterialGrid title="🔫 ARMAMENTO LAG 40" sectionKey="armamento_lag40" items={data.armamento_lag40} />
      )}
      
      {(materials as any).includeEquipoComunicaciones && data.equipo_comunicaciones && (
        <ComunicacionesGrid title="📻 EQUIPO DE COMUNICACIONES" sectionKey="equipo_comunicaciones" items={data.equipo_comunicaciones} />
      )}
      
      <MaterialGrid title="🛠️ KIT RECUPERACIÓN" sectionKey="kit_recuperacion" items={data.kit_recuperacion} />

      <div className="space-y-3">
        <SectionHeader title="📝 NOVEDADES" sectionKey="novedades" />
        {expandedSections.novedades && (
          <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg space-y-4 bg-gray-50 dark:bg-slate-700">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                NOVEDADES VARIAS ENTRE RELEVOS
              </label>
              <textarea
                value={data.novedades_varias}
                onChange={(e) => handleTextChange('novedades_varias', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Describa novedades varias..."
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader title="🚗 DIBUJOS DEL VEHÍCULO — MARCAJE DE DAÑOS" sectionKey="damage_diagram" />
        {expandedSections.damage_diagram && (
          <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg space-y-4 bg-gray-50 dark:bg-slate-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Haz clic sobre cualquier vista del vehículo para marcar un daño. Se numerará automáticamente.
            </p>
            <VehicleDamageCanvas
              vehicleImageSrc={vehicleImage}
              vehicleType={vehicleType}
              marks={data.damage_marks || []}
              onAddMark={addDamageMark}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={removeLastDamageMark}
                disabled={(data.damage_marks || []).length === 0}
                className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg font-bold transition-colors"
              >
                ↩ Borrar último
              </button>
              <button
                type="button"
                onClick={clearAllDamageMarks}
                disabled={(data.damage_marks || []).length === 0}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg font-bold transition-colors"
              >
                🗑 Limpiar todo
              </button>
            </div>

            {(data.damage_marks || []).length > 0 && (
              <div className="space-y-2">
                <div className="bg-blue-600 dark:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold text-sm text-center">
                  NOVEDADES EXTERIORES
                </div>
                <div className="border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
                  {(data.damage_marks || []).map(mark => (
                    <div key={mark.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                        {mark.id}
                      </span>
                      <input
                        type="text"
                        value={mark.description}
                        onChange={(e) => updateDamageMarkDescription(mark.id, e.target.value)}
                        placeholder={`Descripción del daño ${mark.id}...`}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader title="✍️ FIRMAS — ENTREGA Y RECEPCIÓN" sectionKey="firmas" />
        {expandedSections.firmas && (
          <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg space-y-6 bg-gray-50 dark:bg-slate-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Escribe el nombre y firma con el dedo (o ratón) en cada casilla.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ENTREGA */}
              <div className="space-y-3 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800">
                <div className="bg-blue-600 dark:bg-blue-700 text-white text-center text-xs font-bold py-1 px-2 rounded">
                  ENTREGA
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">NOMBRE</label>
                  <input
                    type="text"
                    value={data.nombre_entrega || ''}
                    onChange={(e) => handleTextChange('nombre_entrega', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre y apellidos de quien entrega"
                  />
                </div>
                <SignaturePad
                  label="FIRMA DE QUIEN ENTREGA"
                  value={data.firma_entrega || ''}
                  onChange={(dataUrl) => {
                    setData(prev => ({ ...prev, firma_entrega: dataUrl }));
                    markDirty();
                  }}
                />
              </div>

              {/* RECEPCIÓN */}
              <div className="space-y-3 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800">
                <div className="bg-green-600 dark:bg-green-700 text-white text-center text-xs font-bold py-1 px-2 rounded">
                  RECEPCIÓN
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">NOMBRE</label>
                  <input
                    type="text"
                    value={data.nombre_recepcion || ''}
                    onChange={(e) => handleTextChange('nombre_recepcion', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre y apellidos de quien recepciona"
                  />
                </div>
                <SignaturePad
                  label="FIRMA DE QUIEN RECEPCIONA"
                  value={data.firma_recepcion || ''}
                  onChange={(dataUrl) => {
                    setData(prev => ({ ...prev, firma_recepcion: dataUrl }));
                    markDirty();
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t border-gray-300 dark:border-slate-600">
        <button
          onClick={() => { void saveDraft(dataRef.current); }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold transition-colors text-sm"
        >
          GUARDAR
        </button>
        <button
          onClick={generatePDFFromData}
          className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold transition-colors text-sm"
        >
          📥 Descargar PDF
        </button>
      </div>

      {dirtySticky && (
        <div className="sticky bottom-6 mt-6 bg-amber-50 border border-amber-200 text-amber-900 px-6 py-4 rounded-xl flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">Tienes cambios sin guardar.</div>
          <div className="flex gap-2">
            <button
              onClick={() => { void saveDraft(dataRef.current); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
            >
              GUARDAR
            </button>
            <button
              onClick={() => { void discardDraft(); }}
              className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded-lg font-bold"
            >
              DESCARTAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
