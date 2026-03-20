import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, CalendarClock, ChevronDown, Check, X } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import './Header.css';

export default function Header({ filters, setFilters, searchQuery, setSearchQuery, soloHoy, setSoloHoy }) {
    const { state } = useData();
    const { config, telas } = state;
    const { t } = useI18n();

    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenDropdown(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleFilter = (key, value) => {
        setFilters(prev => {
            const current = prev[key];
            if (current === value) return { ...prev, [key]: '' };
            return { ...prev, [key]: value };
        });
        setOpenDropdown(null);
    };

    const clearFilters = () => {
        setFilters({ tela: '', estado: '', responsable: '', temporada: '', prioridad: '' });
        setSoloHoy(false);
        setSearchQuery('');
    };

    const hasActiveFilters = Object.values(filters).some(v => v) || soloHoy || searchQuery;

    const filterGroups = [
        { key: 'prioridad', label: t('filterPrioridad'), options: [t('alta'), t('media'), t('baja')] },
        { key: 'estado', label: t('filterEstado'), options: config.columnas.map(c => c.nombre) },
        { key: 'tela', label: t('filterTela'), options: telas.map(t => t.nombre) },
        { key: 'responsable', label: t('filterResponsable'), options: config.personas },
        { key: 'temporada', label: t('filterTemporada'), options: config.temporadas },
    ];

    return (
        <header className="header">
            <div className="header-search">
                <Search />
                <input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    id="global-search"
                />
            </div>

            <div className="header-filters" ref={dropdownRef}>
                {filterGroups.map(group => (
                    <div key={group.key} style={{ position: 'relative' }}>
                        <button
                            className={`header-filter-btn ${filters[group.key] ? 'active' : ''}`}
                            onClick={() => setOpenDropdown(openDropdown === group.key ? null : group.key)}
                        >
                            <Filter />
                            {filters[group.key] || group.label}
                            <ChevronDown />
                        </button>
                        {openDropdown === group.key && (
                            <div className="filter-dropdown">
                                {group.options.map(opt => (
                                    <div
                                        key={opt}
                                        className={`filter-dropdown-item ${filters[group.key] === opt ? 'selected' : ''}`}
                                        onClick={() => toggleFilter(group.key, opt)}
                                    >
                                        <Check className="check" />
                                        {opt}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                <button
                    className={`today-toggle ${soloHoy ? 'active' : ''}`}
                    onClick={() => setSoloHoy(!soloHoy)}
                >
                    <CalendarClock />
                    {t('soloHoy')}
                </button>

                {hasActiveFilters && (
                    <button className="btn-icon" onClick={clearFilters}>
                        <X />
                    </button>
                )}
            </div>

            <div className="header-actions">
            </div>
        </header>
    );
}
