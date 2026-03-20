import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext();

// All available sections in the app
const ALL_SECTIONS = ['kanban', 'pos', 'articulos', 'library', 'pedidos', 'clientes', 'fabrics', 'cortes', 'cortadores', 'talleres', 'empleados', 'marketing', 'settings'];

// Default permissions per role (admin always gets everything)
const DEFAULT_ROLE_PERMISSIONS = {
    admin: [...ALL_SECTIONS],
    encargada: ['pos', 'articulos', 'kanban', 'library', 'pedidos', 'clientes', 'cortes', 'talleres', 'empleados', 'settings'],
    deposito: ['talleres', 'articulos', 'clientes'],
    pedidos: ['pedidos', 'articulos', 'clientes'],
    pendiente: [] // New users get no access until admin assigns a role
};

// Human-readable section labels
const SECTION_LABELS = {
    kanban: 'Tablero Kanban',
    pos: 'Punto de Venta',
    articulos: 'Artículos',
    library: 'Biblioteca',
    pedidos: 'Pedidos Online',
    clientes: 'Clientes',
    fabrics: 'Telas',
    cortes: 'Cortes',
    cortadores: 'Cortadores',
    talleres: 'Talleres',
    empleados: 'Empleados',
    marketing: 'Marketing',
    settings: 'Configuración'
};

export { ALL_SECTIONS, SECTION_LABELS };

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [originalAdmin, setOriginalAdmin] = useState(null);
    const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
    const [loading, setLoading] = useState(true);

    // Listen for Firebase Auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // User is signed in — load profile from Firestore
                try {
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userSnap = await getDoc(userDocRef);

                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        setUser({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            role: userData.role || 'pendiente',
                            name: userData.name || firebaseUser.email
                        });
                    } else {
                        // First login — create profile. Only the known admin email gets admin role.
                        const isKnownAdmin = firebaseUser.email === 'kimdavid0012@gmail.com';
                        const defaultProfile = {
                            email: firebaseUser.email,
                            role: isKnownAdmin ? 'admin' : 'pendiente',
                            name: firebaseUser.email
                        };
                        await setDoc(userDocRef, defaultProfile);
                        setUser({
                            uid: firebaseUser.uid,
                            ...defaultProfile
                        });
                    }
                } catch (err) {
                    console.error('Error loading user profile:', err);
                    // Fallback: use basic Firebase user info with restricted role
                    setUser({
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        role: 'pendiente',
                        name: firebaseUser.email
                    });
                }

                // Load role permissions from Firestore
                try {
                    const permsRef = doc(db, 'role-permissions', 'main');
                    const permsSnap = await getDoc(permsRef);
                    if (permsSnap.exists()) {
                        const parsed = permsSnap.data();
                        const merged = { ...DEFAULT_ROLE_PERMISSIONS, ...parsed };
                        merged.admin = [...ALL_SECTIONS];
                        setRolePermissions(merged);
                    }
                } catch (err) {
                    console.error('Error loading permissions:', err);
                }

                // Load users list from Firestore
                try {
                    const usersListRef = doc(db, 'app-config', 'users-list');
                    const usersSnap = await getDoc(usersListRef);
                    if (usersSnap.exists()) {
                        setUsers(usersSnap.data().users || []);
                    }
                } catch (err) {
                    console.error('Error loading users list:', err);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (err) {
            console.error('Login error:', err);
            let errorMsg = 'Credenciales inválidas';
            if (err.code === 'auth/user-not-found') errorMsg = 'Usuario no encontrado';
            if (err.code === 'auth/wrong-password') errorMsg = 'Contraseña incorrecta';
            if (err.code === 'auth/invalid-credential') errorMsg = 'Credenciales inválidas';
            if (err.code === 'auth/too-many-requests') errorMsg = 'Demasiados intentos. Esperá un momento.';
            return { success: false, error: errorMsg };
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setOriginalAdmin(null);
        } catch (err) {
            console.error('Logout error:', err);
        }
    };

    // Switch user simulation (admin feature) — works via Firestore profiles
    const switchUser = async (targetRole) => {
        if (targetRole === 'admin' && originalAdmin) {
            setUser(originalAdmin);
            setOriginalAdmin(null);
            return;
        }

        if (user && user.role === 'admin') {
            // Load user with that role from users list
            const targetUser = users.find(u => u.role === targetRole);
            if (targetUser) {
                setOriginalAdmin(user);
                setUser({
                    uid: user.uid, // Keep same auth uid
                    email: targetUser.email,
                    role: targetUser.role,
                    name: targetUser.name
                });
            }
        }
    };

    const updateUserPassword = () => {
        // Firebase Auth manages passwords — use Firebase console or password reset
        console.log('Password management is handled via Firebase Auth');
    };

    const addUser = async (newUser) => {
        const updated = [...users, newUser];
        setUsers(updated);
        try {
            const usersListRef = doc(db, 'app-config', 'users-list');
            await setDoc(usersListRef, { users: updated });
        } catch (err) {
            console.error('Error saving users list:', err);
        }
        if (!rolePermissions[newUser.role]) {
            const updatedPerms = { ...rolePermissions, [newUser.role]: [] };
            setRolePermissions(updatedPerms);
            try {
                const permsRef = doc(db, 'role-permissions', 'main');
                await setDoc(permsRef, updatedPerms);
            } catch (err) {
                console.error('Error saving permissions:', err);
            }
        }
    };

    const removeUser = async (role) => {
        if (role === 'admin') return;
        const updated = users.filter(u => u.role !== role);
        setUsers(updated);
        try {
            const usersListRef = doc(db, 'app-config', 'users-list');
            await setDoc(usersListRef, { users: updated });
        } catch (err) {
            console.error('Error saving users list:', err);
        }
    };

    const updateUser = async (oldRole, updatedFields) => {
        const newUsers = users.map(u =>
            u.role === oldRole ? { ...u, ...updatedFields } : u
        );
        setUsers(newUsers);
        try {
            const usersListRef = doc(db, 'app-config', 'users-list');
            await setDoc(usersListRef, { users: newUsers });
        } catch (err) {
            console.error('Error saving users list:', err);
        }
    };

    const updateRolePermissions = async (role, sections) => {
        if (role === 'admin') return;
        const updated = { ...rolePermissions, [role]: sections };
        setRolePermissions(updated);
        try {
            const permsRef = doc(db, 'role-permissions', 'main');
            await setDoc(permsRef, updated);
        } catch (err) {
            console.error('Error saving permissions:', err);
        }
    };

    // Update a user's role directly in Firestore
    const updateUserRole = async (uid, newRole, newName) => {
        try {
            const userDocRef = doc(db, 'users', uid);
            const updates = { role: newRole };
            if (newName) updates.name = newName;
            await setDoc(userDocRef, updates, { merge: true });
            // Also update local users list
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole, name: newName || u.name } : u));
            return true;
        } catch (err) {
            console.error('Error updating user role:', err);
            return false;
        }
    };

    // Load all user profiles from Firestore 'users' collection
    const loadAllFirebaseUsers = async () => {
        try {
            const usersRef = collection(db, 'users');
            const snapshot = await getDocs(usersRef);
            const allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
            setUsers(allUsers);
            return allUsers;
        } catch (err) {
            console.error('Error loading all users:', err);
            return [];
        }
    };

    const getAllowedSections = (role) => {
        if (role === 'admin') return ALL_SECTIONS;
        return rolePermissions[role] || [];
    };

    if (loading) return null;

    return (
        <AuthContext.Provider value={{
            user, users, originalAdmin,
            login, logout, updateUserPassword, switchUser,
            addUser, removeUser, updateUser,
            updateUserRole, loadAllFirebaseUsers,
            rolePermissions, updateRolePermissions, getAllowedSections,
            ALL_SECTIONS, SECTION_LABELS
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
