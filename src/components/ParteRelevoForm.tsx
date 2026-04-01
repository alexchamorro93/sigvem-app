import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import jsPDF from 'jspdf';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import vehiclePortaspike from '../assets/vehicle-portaspike.png';
import vehicleBn1 from '../assets/vehicle-bn1.png';
import vehicleS3 from '../assets/vehicle-s3.png';
import vehicleAnibal from '../assets/vehicle-anibal.png';
import vehicleDefault from '../assets/vehicle-views.png';

interface MaterialItem {
  nombre: string;
  presente: boolean;
  cantidad: number;
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
  kit_recuperacion: MaterialItem[];
  novedades_exteriores: string;
  novedades_varias: string;
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

const normalizeMaterialItems = (items: MaterialItem[] | undefined, fallback: MaterialItem[]): MaterialItem[] => {
  if (!items || !Array.isArray(items)) {
    return fallback;
  }

  return items.map((item, index) => ({
    nombre: item?.nombre ?? fallback[index]?.nombre ?? '',
    presente: Boolean(item?.presente),
    cantidad: Number.isFinite(Number((item as any)?.cantidad)) && Number((item as any).cantidad) >= 0
      ? Math.floor(Number((item as any).cantidad))
      : 0
  }));
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
  armamento_browning: normalizeMaterialItems(payload.armamento_browning, fallback.armamento_browning || []),
  armamento_lag40: normalizeMaterialItems(payload.armamento_lag40, fallback.armamento_lag40 || []),
  kit_recuperacion: normalizeMaterialItems(payload.kit_recuperacion, fallback.kit_recuperacion)
});

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
    armamento_browning: createMaterialItems((materials as any).armamento_browning || []),
    armamento_lag40: createMaterialItems((materials as any).armamento_lag40 || []),
    kit_recuperacion: createMaterialItems(materials.kit_recuperacion),
    novedades_exteriores: '',
    novedades_varias: ''
  }), [materials]);

  const defaultExpandedSections = useMemo(() => ({
    herramientas: true,
    exterior_vehiculo: false,
    interior_vehiculo: false,
    documentacion: false,
    afuste_polivalente: false,
    afuste_spike: false,
    armamento_browning: false,
    armamento_lag40: false,
    kit_recuperacion: false,
    novedades: false
  }), []);

  const [data, setData] = useState<ParteRelevoData>(initialData);
  const dataRef = React.useRef<ParteRelevoData>(initialData);

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
        setExpandedSections(defaultExpandedSections);
        markClean();
        return;
      }

      const payload = (snapshot.data() as any)?.parteRelevoDraft?.data as ParteRelevoData | undefined;
      if (payload) {
        setData(normalizeDraftData(payload, initialData));
        markClean();
        return;
      }

      setData(initialData);
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
    if (!vehicleRef) {
      onSaveError?.('Error al descartar Parte Relevo: vehículo no válido');
      return;
    }
    try {
      await setDoc(vehicleRef, {
        parteRelevoDraft: null
      }, { merge: true });
    } catch (error: any) {
      const message = error?.message ? `Error al descartar Parte Relevo: ${error.message}` : 'Error al descartar Parte Relevo';
      onSaveError?.(message);
      return;
    }
    setData(initialData);
    markClean();
    onDiscarded?.();
  }, [vehicleRef, initialData, markClean, onDiscarded, onSaveError]);

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
    const parentScrollTop = scrollParent?.scrollTop ?? 0;
    const windowScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
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
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        if (scrollParent) {
          scrollParent.scrollTop = parentScrollTop;
          return;
        }
        window.scrollTo({ top: windowScrollY, behavior: 'auto' });
      });
    }
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
    const parentScrollTop = scrollParent?.scrollTop ?? 0;
    const windowScrollY = typeof window !== 'undefined' ? window.scrollY : 0;

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

    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        if (scrollParent) {
          scrollParent.scrollTop = parentScrollTop;
          return;
        }
        window.scrollTo({ top: windowScrollY, behavior: 'auto' });
      });
    }

    markDirty();
  };

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

        return yPos + 12;
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
      
      currentY = drawTable('KIT RECUPERACION Y EXTRAS', data.kit_recuperacion, currentY);

      if (currentY + 30 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'bold');
      doc.setLineWidth(0.7);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 5);
      doc.text('NOVEDADES EXTERIORES', pageWidth / 2, currentY + 4, { align: 'center' });
      currentY += 8;

      const novedadesExterioresBoxTop = currentY;
      const novedadesBoxHeight = 40;
      const novedadesTextLineHeight = 4;
      const novedadesTextMaxWidth = pageWidth - 2 * margin - 4;
      const novedadesTextMaxLines = Math.max(1, Math.floor((novedadesBoxHeight - 4) / novedadesTextLineHeight));

      doc.setLineWidth(0.5);
      doc.rect(margin, novedadesExterioresBoxTop, pageWidth - 2 * margin, novedadesBoxHeight);

      if (data.novedades_exteriores) {
        doc.setFontSize(8);
        doc.setFont('Helvetica', 'normal');
        const splitText = doc.splitTextToSize(data.novedades_exteriores, novedadesTextMaxWidth).slice(0, novedadesTextMaxLines);
        doc.text(splitText, margin + 2, novedadesExterioresBoxTop + 3);
      }

      currentY = novedadesExterioresBoxTop + novedadesBoxHeight + 5;

      if (currentY + 15 > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

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
        const splitText = doc.splitTextToSize(data.novedades_varias, novedadesTextMaxWidth).slice(0, novedadesTextMaxLines);
        doc.text(splitText, margin + 2, novedadesVariasBoxTop + 3);
      }

      currentY = novedadesVariasBoxTop + novedadesBoxHeight + 5;

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

      try {
        const imageWidth = pageWidth - 2 * margin;
        const imageHeight = 60;
        const imageDataUrl = await loadImageDataUrl(vehicleImage);
        if (imageDataUrl) {
          doc.addImage(imageDataUrl, 'PNG', margin, currentY, imageWidth, imageHeight);
        } else {
          doc.setFontSize(8);
          doc.text('[Imagen de vehículos no disponible]', margin + 2, currentY + 3);
        }
      } catch (imgError) {
        doc.setFontSize(8);
        doc.text('[Imagen de vehículos no disponible]', margin + 2, currentY + 3);
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
      
      <MaterialGrid title="🛠️ KIT RECUPERACIÓN" sectionKey="kit_recuperacion" items={data.kit_recuperacion} />

      <div className="space-y-3">
        <SectionHeader title="📝 NOVEDADES" sectionKey="novedades" />
        {expandedSections.novedades && (
          <div className="border border-gray-300 dark:border-slate-600 p-4 rounded-lg space-y-4 bg-gray-50 dark:bg-slate-700">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                NOVEDADES EXTERIORES
              </label>
              <textarea
                value={data.novedades_exteriores}
                onChange={(e) => handleTextChange('novedades_exteriores', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Describa novedades exteriores..."
              />
            </div>
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
