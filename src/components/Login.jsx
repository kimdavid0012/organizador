import React, { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { Scissors } from 'lucide-react';
import './Login.css';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!email || !password) {
            setError('Por favor, ingresa email y contraseña');
            return;
        }

        setLoading(true);
        try {
            const result = await login(email, password);
            if (!result.success) {
                setError(result.error);
            }
        } catch (err) {
            setError('Error al conectar. Intentá de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box glass-panel">
                <div className="login-logo">
                    <div className="logo-icon-wrapper">
                        <Scissors size={28} />
                    </div>
                </div>
                <h1 className="login-title">Control de Producción</h1>
                <p className="login-subtitle">Ingresa tus credenciales para continuar</p>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="usuario@celavie.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label>Contraseña</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                        {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
                    </button>
                </form>
            </div>
        </div>
    );
}
