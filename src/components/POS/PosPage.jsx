import React, { useState } from 'react';
import { ShoppingCart, PackageOpen, History, Receipt, Calculator } from 'lucide-react';
import PosCaja from './PosCaja';
import PosProductos from './PosProductos';
import PosHistorial from './PosHistorial';
import PosGastos from './PosGastos';
import PosZClose from './PosZClose';
import { useAuth } from '../../store/AuthContext';
import { useData } from '../../store/DataContext';
import './PosPage.css';

export default function PosPage() {
    const [activeTab, setActiveTab] = useState('caja');
    const { user } = useAuth();
    const { state } = useData();
    const permissions = state.config.posPermissions || {};

    const tabs = [
        { id: 'caja', label: 'Caja Principal', icon: ShoppingCart },
        { id: 'productos', label: 'Catálogo / Precios', icon: PackageOpen },
        { id: 'historial', label: 'Historial Tickets', icon: History },
    ];

    if (user.role === 'admin' || permissions.encargadaCanAddExpenses) {
        tabs.push({ id: 'gastos', label: 'Gastos Extra', icon: Receipt });
    }

    if (user.role === 'admin' || permissions.encargadaCanCloseZ) {
        tabs.push({ id: 'cierre-z', label: 'Cierre Z', icon: Calculator });
    }

    // Default to a safe tab if current active tab becomes unavailable
    if (!tabs.find(t => t.id === activeTab)) {
        setActiveTab('caja');
    }

    return (
        <div className="pos-page">
            <div className="pos-nav">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        className={`pos-nav-btn ${activeTab === t.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        <t.icon size={18} /> {t.label}
                    </button>
                ))}
            </div>
            <div className="pos-content">
                {activeTab === 'caja' && <PosCaja />}
                {activeTab === 'productos' && <PosProductos />}
                {activeTab === 'historial' && <PosHistorial />}
                {activeTab === 'gastos' && <PosGastos />}
                {activeTab === 'cierre-z' && <PosZClose />}
            </div>
        </div>
    );
}
