import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Minimize2, Maximize2, Mic, MicOff } from 'lucide-react';
import { useData } from '../store/DataContext';
import { generateId } from '../utils/helpers';

const SYSTEM_PROMPT = `You are "CELA IA", a production assistant for CELAVIE clothing factory.

CRITICAL RULE: ALWAYS respond in the SAME LANGUAGE the user speaks to you:
- If they speak Spanish → respond in Spanish (argentino)
- If they speak English → respond in English
- If they speak Korean (한국어) → respond in Korean
- If they speak Russian (русский) → respond in Russian
- If unsure, default to Spanish

CRITICAL RULE 2: ALWAYS execute actions when asked. NEVER say you can't. Use <action>JSON</action> tags.

AVAILABLE ACTIONS:

1. CREATE MOLD/ARTICLE:
<action>{"type":"addMolde","data":{"nombre":"Remera Básica","codigo":"6002","categoria":"Remera","consumoTela":4.9,"porcentajeTela":23}}</action>

2. CREATE CLIENT:
<action>{"type":"addCliente","data":{"nombre":"Juan Pérez","telefono":"1155554444","provincia":"Córdoba","email":"juan@mail.com"}}</action>

3. CREATE TASK:
<action>{"type":"addTarea","data":{"nombre":"Buy thread","descripcion":"Black thread for shirts"}}</action>

4. CREATE FABRIC:
<action>{"type":"addTela","data":{"nombre":"Modal Soft","precioPorUnidad":4.9,"moneda":"USD","descripcion":"Soft fabric"}}</action>

5. ADD POS PRODUCT:
<action>{"type":"addPosProduct","data":{"detalleCorto":"Basic Shirt","codigoInterno":"6002","precioVentaL1":5900,"stock":100}}</action>

6. CREATE PRODUCTION CUT:
<action>{"type":"addCorte","data":{"nombre":"Corte #10","fecha":"2026-03-19","articulos":[{"nombre":"Remera Básica","codigo":"6002","tela":"modal soft","cantidad":486,"costoTaller":1500,"cortador":"Luis","precioVenta":5900}]}}</action>

7. ADD EXPENSE:
<action>{"type":"addExpense","data":{"concepto":"Electricity bill","monto":15000,"tipo":"PROVEEDOR"}}</action>

8. UPDATE CONFIG:
<action>{"type":"updateConfig","data":{"cotizacionUSD":1500}}</action>

RULES:
- ALWAYS execute the action, never refuse
- If missing data, use reasonable defaults and mention what you assumed
- Be brief and direct
- You can execute multiple actions in one response`;

export default function AIAssistant() {
    const { state, addMolde, addTela, addCliente, addTarea, addPosProduct, updateConfig, addPosExpense } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: '¡Hola! Soy CELA IA 🤖\nHi! I\'m CELA IA / 안녕하세요! CELA IA입니다 / Привет! Я CELA IA\n\nHablame en tu idioma y te ayudo con todo:\n• Crear moldes, telas, clientes, tareas\n• Cortes de producción\n• Productos y precios POS\n• Gastos de caja\n\nEscribí o usá el micrófono 🎤' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiKey, setApiKey] = useState(state.config?.marketing?.openaiKey || '');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const [isListening, setIsListening] = useState(false);

    // Detect UI language for speech recognition
    const getLangCode = () => {
        const lang = state.config?.idioma || 'es';
        const langMap = { es: 'es-AR', en: 'en-US', ko: 'ko-KR', ru: 'ru-RU' };
        return langMap[lang] || 'es-AR';
    };

    // Speech Recognition setup
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = getLangCode();
            recognition.continuous = false;
            recognition.interimResults = true;
            
            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                setInput(transcript);
                
                // Si es resultado final, enviar automáticamente
                if (event.results[event.results.length - 1].isFinal) {
                    setIsListening(false);
                    // Pequeño delay para que el usuario vea lo que dijo
                    setTimeout(() => {
                        const finalText = transcript.trim();
                        if (finalText) {
                            setInput(finalText);
                            // Trigger send
                            handleSendFromVoice(finalText);
                        }
                    }, 500);
                }
            };
            
            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
                if (event.error === 'not-allowed') {
                    alert('⚠️ Necesitás permitir acceso al micrófono para usar voz.');
                }
            };
            
            recognition.onend = () => {
                setIsListening(false);
            };
            
            recognitionRef.current = recognition;
        }
    }, []);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            alert('Tu navegador no soporta reconocimiento de voz. Probá con Chrome.');
            return;
        }
        
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setInput('');
            // Update language before starting
            recognitionRef.current.lang = getLangCode();
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    // Speak response using TTS
    const speakResponse = (text) => {
        if (!window.speechSynthesis) return;
        // Clean markdown and action tags
        const cleanText = text
            .replace(/<action>[\s\S]*?<\/action>/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/[✅❌⚠️🔴💡🎯📊🤖]/g, '')
            .trim();
        if (!cleanText) return;
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = getLangCode();
        utterance.rate = 1.1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    };

    const handleSendFromVoice = async (text) => {
        if (!text.trim() || loading) return;
        if (!apiKey) {
            setMessages(prev => [...prev, 
                { role: 'user', content: text },
                { role: 'assistant', content: '⚠️ Necesitás configurar la API Key de OpenAI en Configuración.' }
            ]);
            return;
        }
        // Reuse the same logic as handleSend but with the voice text
        setInput('');
        await sendMessage(text);
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (state.config?.marketing?.openaiKey) {
            setApiKey(state.config.marketing.openaiKey);
        }
    }, [state.config?.marketing?.openaiKey]);

    const executeAction = (actionStr) => {
        try {
            const action = JSON.parse(actionStr);
            switch (action.type) {
                case 'addMolde':
                    addMolde({ id: generateId(), estado: 'por-hacer', imagenes: [], checklist: [], ...action.data, createdAt: new Date().toISOString() });
                    return `✅ Molde "${action.data.nombre}" creado exitosamente.`;
                case 'addCliente':
                    addCliente({ id: generateId(), ...action.data });
                    return `✅ Cliente "${action.data.nombre}" agregado exitosamente.`;
                case 'addTarea':
                    addTarea({ id: generateId(), estado: 'por-hacer', ...action.data });
                    return `✅ Tarea "${action.data.nombre}" creada exitosamente.`;
                case 'addTela':
                    addTela({ id: generateId(), color: '', descripcion: '', ...action.data });
                    return `✅ Tela "${action.data.nombre}" agregada al catálogo.`;
                case 'addPosProduct':
                    addPosProduct({ id: generateId(), codigoInterno: action.data.codigoInterno || generateId().slice(0, 6).toUpperCase(), activo: true, ...action.data });
                    return `✅ Producto "${action.data.detalleCorto}" cargado en el POS.`;
                case 'addCorte': {
                    const corteId = generateId();
                    const articulos = action.data.articulos || [];
                    const moldeIds = [];
                    const moldesData = [];
                    
                    articulos.forEach(art => {
                        const moldeId = generateId();
                        // Crear el molde si tiene nombre
                        if (art.nombre) {
                            addMolde({
                                id: moldeId,
                                nombre: art.nombre,
                                codigo: art.codigo || '',
                                estado: 'por-hacer',
                                imagenes: [],
                                checklist: [],
                                consumoTela: art.consumoTela || 0,
                                cantidadCorte: art.cantidad || 0,
                                costoTaller: art.costoTaller || 0,
                                precioLocal: art.precioVenta || 0,
                                createdAt: new Date().toISOString()
                            });
                        }
                        // Buscar si ya existe la tela y crearla si no
                        if (art.tela) {
                            const existingTela = state.telas?.find(t => t.nombre?.toLowerCase() === art.tela.toLowerCase());
                            if (!existingTela) {
                                addTela({ id: generateId(), nombre: art.tela, precioPorUnidad: 0, moneda: 'USD', color: '', descripcion: '' });
                            }
                        }
                        moldeIds.push(moldeId);
                        moldesData.push({
                            id: moldeId,
                            cantidad: art.cantidad || 0,
                            costoTaller: art.costoTaller || 0,
                            costoCortador: art.costoCortador || 0,
                            tallerAsignado: art.taller || '',
                            cortadorAsignado: art.cortador || '',
                            precioLocal: art.precioVenta || 0,
                            pagadoCortador: false,
                            pagadoTaller: false,
                            prendasFalladas: 0,
                            rollosCorte: 0,
                            kilajeTotal: 0,
                            notas: ''
                        });
                    });
                    
                    const cortes = state.config?.cortes || [];
                    updateConfig({
                        cortes: [...cortes, {
                            id: corteId,
                            nombre: action.data.nombre || `Corte ${cortes.length + 1}`,
                            fecha: action.data.fecha || new Date().toISOString().split('T')[0],
                            moldeIds,
                            moldesData
                        }]
                    });
                    return `✅ Corte "${action.data.nombre || 'Nuevo'}" creado con ${articulos.length} artículo(s).`;
                }
                case 'addExpense': {
                    if (addPosExpense) {
                        addPosExpense({
                            id: generateId(),
                            fecha: new Date().toISOString(),
                            concepto: action.data.concepto || 'Gasto',
                            monto: action.data.monto || 0,
                            tipo: action.data.tipo || 'RETIRO',
                            responsable: 'CELA IA'
                        });
                    }
                    return `✅ Gasto "$${action.data.monto}" registrado: ${action.data.concepto}.`;
                }
                case 'updateConfig':
                    updateConfig(action.data);
                    return `✅ Configuración actualizada: ${Object.keys(action.data).join(', ')}.`;
                default:
                    return `⚠️ Acción "${action.type}" no reconocida. Acciones: addMolde, addCliente, addTarea, addTela, addPosProduct, addCorte, addExpense, updateConfig.`;
            }
        } catch (err) {
            console.error('Error ejecutando acción:', err, actionStr);
            return `❌ Error al ejecutar: ${err.message}`;
        }
    };

    const processResponse = (text) => {
        const actionRegex = /<action>([\s\S]*?)<\/action>/g;
        let match;
        const results = [];
        while ((match = actionRegex.exec(text)) !== null) {
            results.push(executeAction(match[1]));
        }
        // Clean text from action tags for display
        const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
        return { cleanText, actionResults: results };
    };

    const sendMessage = async (text) => {
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const context = `Estado actual del sistema:
- ${state.moldes?.length || 0} moldes registrados
- ${state.telas?.length || 0} telas en catálogo
- ${state.config?.cortes?.length || 0} cortes activos
- ${state.config?.clientes?.length || 0} clientes
- ${state.config?.posProductos?.length || 0} productos en POS
- Categorías disponibles: ${(state.config?.categorias || []).join(', ')}
- Talleres: ${(state.config?.talleres || []).join(', ')}`;

            const apiMessages = [
                { role: 'system', content: SYSTEM_PROMPT + '\n\n' + context },
                ...messages.filter(m => m.role !== 'system').slice(-10).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: text }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: apiMessages,
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Error de OpenAI');
            }

            const data = await response.json();
            const assistantText = data.choices?.[0]?.message?.content || 'No pude generar una respuesta.';

            const { cleanText, actionResults } = processResponse(assistantText);
            let finalText = cleanText;
            if (actionResults.length > 0) {
                finalText += '\n\n' + actionResults.join('\n');
            }

            setMessages(prev => [...prev, { role: 'assistant', content: finalText }]);
            
            // Si se usó voz, leer la respuesta en voz alta
            if (isListening || recognitionRef.current) {
                speakResponse(finalText);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        if (!apiKey) {
            setMessages(prev => [...prev, 
                { role: 'user', content: input },
                { role: 'assistant', content: '⚠️ Necesitás configurar la API Key de OpenAI en **Configuración > Asistente IA** para que yo pueda funcionar.' }
            ]);
            setInput('');
            return;
        }
        const text = input;
        setInput('');
        await sendMessage(text);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                    transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <MessageCircle size={24} color="white" />
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            width: isMinimized ? 300 : 380, 
            height: isMinimized ? 48 : 520,
            borderRadius: 16,
            background: 'var(--bg-card, #1a1a2e)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', transition: 'all 0.3s ease'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                cursor: 'pointer'
            }} onClick={() => isMinimized && setIsMinimized(false)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white' }}>
                    <Bot size={20} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>CELA IA</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>Asistente</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 4 }}>
                        {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 4 }}>
                        <X size={14} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: 12,
                        display: 'flex', flexDirection: 'column', gap: 8
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 8,
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                            }}>
                                {msg.role === 'assistant' && (
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Bot size={14} color="#8b5cf6" />
                                    </div>
                                )}
                                <div style={{
                                    maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                                    fontSize: 13, lineHeight: 1.5,
                                    background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-primary, #e0e0e0)',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: 'rgba(139, 92, 246, 0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Bot size={14} color="#8b5cf6" />
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    Pensando...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{
                        padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', gap: 8, alignItems: 'center'
                    }}>
                        <button
                            onClick={toggleVoice}
                            style={{
                                padding: '8px', borderRadius: 8, flexShrink: 0,
                                background: isListening ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255,255,255,0.05)',
                                border: isListening ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer', color: isListening ? 'white' : 'var(--text-muted, #999)',
                                display: 'flex', alignItems: 'center',
                                animation: isListening ? 'pulse 1.5s infinite' : 'none'
                            }}
                            title={isListening ? 'Detener grabación' : 'Hablar por voz'}
                        >
                            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder={isListening ? '🎤 Escuchando...' : 'Escribí o hablá...'}
                            style={{
                                flex: 1, padding: '8px 12px', borderRadius: 8,
                                background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                                border: isListening ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-primary, #e0e0e0)',
                                fontSize: 13, outline: 'none'
                            }}
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            style={{
                                padding: '8px 12px', borderRadius: 8,
                                background: loading ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.8)',
                                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                color: 'white', display: 'flex', alignItems: 'center'
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <style>{`
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.6; }
                        }
                    `}</style>
                </>
            )}
        </div>
    );
}
