import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StyleSheet, ActivityIndicator, Alert, Platform, Dimensions } from 'react-native';
import { User, Vehicle, Section, SystemLog, ViewState, UserRole } from './types';
import { DOC_SECTIONS, MAINT_SECTIONS, MATERIAL_ACTUAL_SECTIONS } from './constants';
import { db } from './firebaseConfig';
import {
  collection, query, where, getDocs, doc, addDoc, setDoc,
  updateDoc, deleteDoc, onSnapshot, serverTimestamp, orderBy
} from 'firebase/firestore';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loginContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#0f172a',
    marginBottom: 8,
  },
  subHeaderText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#6b7280',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 14,
    backgroundColor: '#f3f4f6',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1f2937',
    fontWeight: '600',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  userInfo: {
    fontSize: 12,
    color: '#6b7280',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  badge: {
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  badgeOperativo: {
    backgroundColor: '#dcfce7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextOperativo: {
    color: '#166534',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 14,
    backgroundColor: '#f3f4f6',
  },
  actionButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 8,
    marginTop: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#2563eb',
  },
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 8,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
  },
});

interface AppState {
  currentUser: User | null;
  loginUsername: string;
  loginPassword: string;
  registerData: any;
  view: ViewState;
  vehicles: Vehicle[];
  users: User[];
  sections: Section[];
  systemLogs: SystemLog[];
  loading: boolean;
  error: string;
  filterText: string;
  selectedVehicleId: string;
  detailTab: string;
  showPassword: boolean;
}

const App: React.FC = () => {
  const [state, setState] = React.useState<AppState>({
    currentUser: null,
    loginUsername: '',
    loginPassword: '',
    registerData: {
      username: '',
      password: '',
      confirmPassword: '',
      company: '',
      role: 'conductor',
      section: '',
      securityQuestion: '',
      securityAnswer: ''
    },
    view: 'login',
    vehicles: [],
    users: [],
    sections: [],
    systemLogs: [],
    loading: false,
    error: '',
    filterText: '',
    selectedVehicleId: '',
    detailTab: 'info',
    showPassword: false,
  });

  const vehiclesColRef = collection(db, 'vehicles');
  const usersColRef = collection(db, 'users');
  const sectionsColRef = collection(db, 'sections');
  const logsColRef = collection(db, 'logs');

  // Real-time listeners
  React.useEffect(() => {
    if (!state.currentUser) return;

    const unsubscribeVehicles = onSnapshot(vehiclesColRef, (snapshot) => {
      setState(prev => ({
        ...prev,
        vehicles: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle))
      }));
    });

    const unsubscribeUsers = onSnapshot(usersColRef, (snapshot) => {
      setState(prev => ({
        ...prev,
        users: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User))
      }));
    });

    const unsubscribeSections = onSnapshot(sectionsColRef, (snapshot) => {
      setState(prev => ({
        ...prev,
        sections: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Section))
      }));
    });

    const unsubscribeLogs = onSnapshot(
      query(logsColRef, orderBy('timestamp', 'desc')),
      (snapshot) => {
        setState(prev => ({
          ...prev,
          systemLogs: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemLog))
        }));
      }
    );

    return () => {
      unsubscribeVehicles();
      unsubscribeUsers();
      unsubscribeSections();
      unsubscribeLogs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  const handleLogin = async (e?: any) => {
    if (e?.preventDefault) e.preventDefault();
    setState(prev => ({ ...prev, loading: true, error: '' }));

    try {
      const q = query(usersColRef, where('username', '==', state.loginUsername));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setState(prev => ({ ...prev, error: 'Usuario no encontrado', loading: false }));
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as Omit<User, 'id'>;

      if (userData.password !== state.loginPassword) {
        setState(prev => ({ ...prev, error: 'Contraseña incorrecta', loading: false }));
        return;
      }

      const user: User = { id: userDoc.id, ...userData };

      await addDoc(logsColRef, {
        timestamp: serverTimestamp(),
        user: state.loginUsername,
        action: 'LOGIN',
        details: `Usuario ${state.loginUsername} inició sesión`,
        severity: 'INFO'
      });

      setState(prev => ({
        ...prev,
        currentUser: user,
        loginUsername: '',
        loginPassword: '',
        view: 'list',
        loading: false
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: `Error de login: ${err}`, loading: false }));
    }
  };

  const handleRegister = async (e?: any) => {
    if (e?.preventDefault) e.preventDefault();
    setState(prev => ({ ...prev, loading: true, error: '' }));

    try {
      if (state.registerData.password !== state.registerData.confirmPassword) {
        setState(prev => ({ ...prev, error: 'Las contraseñas no coinciden', loading: false }));
        return;
      }

      const q = query(usersColRef, where('username', '==', state.registerData.username));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setState(prev => ({ ...prev, error: 'El usuario ya existe', loading: false }));
        return;
      }

      const newUser = {
        username: state.registerData.username,
        password: state.registerData.password,
        company: state.registerData.company,
        role: state.registerData.role,
        section: state.registerData.section,
        companyCode: state.registerData.company || '',
      };

      const docRef = await addDoc(usersColRef, newUser);

      await addDoc(logsColRef, {
        timestamp: serverTimestamp(),
        user: state.registerData.username,
        action: 'REGISTER',
        details: `Nuevo usuario ${state.registerData.username} registrado`,
        severity: 'INFO'
      });

      const user: User = { 
        id: docRef.id,
        username: state.registerData.username,
        password: state.registerData.password,
        company: state.registerData.company,
        role: state.registerData.role,
        section: state.registerData.section,
        securityQuestion: state.registerData.securityQuestion,
        securityAnswer: state.registerData.securityAnswer,
        companyCode: state.registerData.companyCode
      };
      setState(prev => ({
        ...prev,
        currentUser: user,
        view: 'list',
        loading: false,
        registerData: {
          username: '',
          password: '',
          confirmPassword: '',
          company: '',
          role: 'conductor',
          section: '',
          securityQuestion: '',
          securityAnswer: ''
        }
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: `Error: ${err}`, loading: false }));
    }
  };

  const handleLogout = () => {
    setState(prev => ({
      ...prev,
      currentUser: null,
      view: 'login'
    }));
  };

  const addVehicle = async (vehicleData: Partial<Vehicle>) => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      await addDoc(vehiclesColRef, {
        ...vehicleData,
        createdAt: serverTimestamp(),
        status: 'OPERATIVO'
      });

      await addDoc(logsColRef, {
        timestamp: serverTimestamp(),
        user: state.currentUser?.username,
        action: 'CREATE_VEHICLE',
        details: `Vehículo ${vehicleData.plate} creado`,
        severity: 'INFO'
      });

      setState(prev => ({ ...prev, view: 'list', loading: false }));
    } catch (err) {
      setState(prev => ({ ...prev, error: `Error: ${err}`, loading: false }));
    }
  };

  const deleteVehicle = async (vehicleId: string) => {
    Alert.alert(
      'Eliminar Vehículo',
      '¿Estás seguro de que deseas eliminar este vehículo?',
      [
        { text: 'Cancelar', onPress: () => {} },
        {
          text: 'Eliminar',
          onPress: async () => {
            setState(prev => ({ ...prev, loading: true }));
            try {
              await deleteDoc(doc(vehiclesColRef, vehicleId));
              await addDoc(logsColRef, {
                timestamp: serverTimestamp(),
                user: state.currentUser?.username,
                action: 'DELETE_VEHICLE',
                details: `Vehículo ${vehicleId} eliminado`,
                severity: 'WARNING'
              });
              setState(prev => ({ ...prev, selectedVehicleId: '', view: 'list', loading: false }));
            } catch (err) {
              setState(prev => ({ ...prev, error: `Error: ${err}`, loading: false }));
            }
          }
        }
      ]
    );
  };

  // LOGIN/REGISTER VIEW
  if (!state.currentUser) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          <Text style={styles.headerText}>SIGVEM</Text>
          <Text style={styles.subHeaderText}>Sistema de Gestión de Vehículos Militares</Text>

          {state.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{state.error}</Text>
            </View>
          )}

          {state.view === 'login' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Usuario"
                value={state.loginUsername}
                onChangeText={(text) => setState(prev => ({ ...prev, loginUsername: text }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                secureTextEntry={!state.showPassword}
                value={state.loginPassword}
                onChangeText={(text) => setState(prev => ({ ...prev, loginPassword: text }))}
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handleLogin}
                disabled={state.loading}
              >
                <Text style={styles.buttonText}>
                  {state.loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setState(prev => ({ ...prev, view: 'register', error: '' }))}
              >
                <Text style={styles.secondaryButtonText}>Crear Cuenta</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Usuario"
                value={state.registerData.username}
                onChangeText={(text) => setState(prev => ({
                  ...prev,
                  registerData: { ...prev.registerData, username: text }
                }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Empresa"
                value={state.registerData.company}
                onChangeText={(text) => setState(prev => ({
                  ...prev,
                  registerData: { ...prev.registerData, company: text }
                }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                secureTextEntry
                value={state.registerData.password}
                onChangeText={(text) => setState(prev => ({
                  ...prev,
                  registerData: { ...prev.registerData, password: text }
                }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirmar Contraseña"
                secureTextEntry
                value={state.registerData.confirmPassword}
                onChangeText={(text) => setState(prev => ({
                  ...prev,
                  registerData: { ...prev.registerData, confirmPassword: text }
                }))}
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handleRegister}
                disabled={state.loading}
              >
                <Text style={styles.buttonText}>
                  {state.loading ? 'Registrando...' : 'Registrarse'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setState(prev => ({ ...prev, view: 'login', error: '' }))}
              >
                <Text style={styles.secondaryButtonText}>Volver al Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // DASHBOARD VIEW
  return (
    <SafeAreaView style={styles.dashboardContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {state.view === 'list' && '📦 Vehículos'}
          {state.view === 'users-management' && '👥 Usuarios'}
          {state.view === 'audit-log' && '📋 Auditoría'}
        </Text>
        <Text style={styles.userInfo}>👤 {state.currentUser.username}</Text>
      </View>

      <ScrollView style={styles.content}>
        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        )}

        {state.view === 'list' && (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.cardTitle}>Vehículos ({state.vehicles.length})</Text>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Buscar vehículos..."
              value={state.filterText}
              onChangeText={(text) => setState(prev => ({ ...prev, filterText: text }))}
            />

            {state.vehicles.filter(v =>
              !state.filterText ||
              v.plate?.toLowerCase().includes(state.filterText.toLowerCase())
            ).map(vehicle => (
              <TouchableOpacity
                key={vehicle.id}
                style={styles.card}
                onPress={() => setState(prev => ({ ...prev, selectedVehicleId: vehicle.id, view: 'detail' }))}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{vehicle.plate}</Text>
                    <Text style={styles.cardSubtitle}>{vehicle.brand} {vehicle.model}</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeOperativo]}>
                    <Text style={[styles.badgeText, styles.badgeTextOperativo]}>✓ Operativo</Text>
                  </View>
                </View>
                <Text style={styles.cardSubtitle}>Sección: {vehicle.section || 'N/A'}</Text>
              </TouchableOpacity>
            ))}

            {state.vehicles.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No hay vehículos registrados</Text>
              </View>
            )}
          </>
        )}

        {state.view === 'users-management' && (
          <>
            <Text style={styles.cardTitle}>Usuarios ({state.users.length})</Text>
            {state.users.map(user => (
              <View key={user.id} style={styles.card}>
                <Text style={styles.cardTitle}>{user.username}</Text>
                <Text style={styles.cardSubtitle}>Rol: {user.role}</Text>
                <Text style={styles.cardSubtitle}>Empresa: {user.company}</Text>
              </View>
            ))}
          </>
        )}

        {state.view === 'audit-log' && (
          <>
            <Text style={styles.cardTitle}>Registro de Auditoría ({state.systemLogs.length})</Text>
            {state.systemLogs.slice(0, 20).map(log => (
              <View key={log.id} style={styles.card}>
                <Text style={styles.cardTitle}>{log.action}</Text>
                <Text style={styles.cardSubtitle}>{log.details}</Text>
                <Text style={styles.cardSubtitle}>Usuario: {log.user}</Text>
              </View>
            ))}
          </>
        )}

        {state.view === 'detail' && state.vehicles.find(v => v.id === state.selectedVehicleId) && (() => {
          const vehicle = state.vehicles.find(v => v.id === state.selectedVehicleId)!;
          return (
            <>
              <TouchableOpacity
                style={{ marginBottom: 16 }}
                onPress={() => setState(prev => ({ ...prev, selectedVehicleId: '', view: 'list' }))}
              >
                <Text style={{ color: '#2563eb', fontSize: 14, fontWeight: '600' }}>← Volver</Text>
              </TouchableOpacity>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{vehicle.plate}</Text>
                <Text style={styles.cardSubtitle}>{vehicle.brand} {vehicle.model}</Text>
                <Text style={{ fontSize: 14, color: '#374151', marginVertical: 8 }}>
                  Compañía: {vehicle.company}
                </Text>
                <Text style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
                  Sección: {vehicle.section}
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#dc2626' }]}
                    onPress={() => deleteVehicle(vehicle.id)}
                  >
                    <Text style={styles.actionButtonText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          );
        })()}
      </ScrollView>

      <TouchableOpacity
        style={{
          backgroundColor: '#dc2626',
          padding: 16,
          margin: 16,
          borderRadius: 8,
          alignItems: 'center'
        }}
        onPress={handleLogout}
      >
        <Text style={{ color: '#ffffff', fontWeight: '600' }}>🚪 Cerrar Sesión</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default App;
