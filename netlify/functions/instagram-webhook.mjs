// Instagram Webhook - Netlify Serverless Function
// Handles Meta webhook verification + incoming IG messages/comments.

const GRAPH_API_VERSION = "v21.0";
const FALLBACK_VERIFY_TOKEN = "celavie_webhook_2026";

const getEnv = (key) => {
  if (typeof Netlify !== "undefined" && Netlify.env?.get) {
    return Netlify.env.get(key);
  }
  return process.env[key];
};

const maskValue = (value = "") => {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const getVerifyToken = () => getEnv("META_VERIFY_TOKEN") || FALLBACK_VERIFY_TOKEN;

export default async (req, context) => {
  // ===== GET: Meta Webhook Verification =====
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === getVerifyToken()) {
      console.log("✅ Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ===== POST: Incoming Webhook Events =====
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("❌ Failed to parse body:", e);
      return new Response("BAD_REQUEST", { status: 400 });
    }
    
    console.log("📩 WEBHOOK RECEIVED");
    console.log("📩 Object:", body.object);
    console.log("📩 Full body:", JSON.stringify(body));

    // Process in background - return 200 immediately to Meta
    context.waitUntil(
      processWebhook(body).catch(err => 
        console.error("❌ Error:", err.message, err.stack)
      )
    );

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: "/api/instagram-webhook",
};

// ──────────────────────────────────────────────
// Process incoming webhook events
// ──────────────────────────────────────────────
async function processWebhook(body) {
  const IG_ACCESS_TOKEN = getEnv("IG_ACCESS_TOKEN");
  const ANTHROPIC_API_KEY = getEnv("ANTHROPIC_API_KEY");
  const IG_BUSINESS_ID = getEnv("IG_BUSINESS_ID") || getEnv("IG_USER_ID") || "me";

  console.log("🔑 IG_ACCESS_TOKEN exists:", !!IG_ACCESS_TOKEN);
  console.log("🔑 ANTHROPIC_API_KEY exists:", !!ANTHROPIC_API_KEY);
  console.log("🔑 IG sender id:", IG_BUSINESS_ID === "me" ? "me" : maskValue(IG_BUSINESS_ID));

  const missing = [
    !IG_ACCESS_TOKEN ? "IG_ACCESS_TOKEN" : null,
    !ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : null
  ].filter(Boolean);

  if (missing.length) {
    console.error("❌ Missing env vars:", missing.join(", "));
    return;
  }

  if (body.object === "instagram") {
    for (const entry of body.entry || []) {
      console.log("📌 Entry ID:", entry.id);
      console.log("📌 Changes:", JSON.stringify(entry.changes || []));
      console.log("📌 Messaging:", JSON.stringify(entry.messaging || []));

      // ── Instagram Business API: messages & comments come via changes ──
      for (const change of entry.changes || []) {
        console.log("📨 Change field:", change.field);
        console.log("📨 Change value:", JSON.stringify(change.value));

        // ----- Direct Messages (DMs) via changes -----
        if (change.field === "messages") {
          const messageEvents = extractMessageEvents(change.value);
          console.log("💬 Message events found:", messageEvents.length);

          for (const event of messageEvents) {
            if (!event.text || !event.senderId) {
              console.log("⚠️ Message event without sender/text:", JSON.stringify(event));
              continue;
            }

            console.log(`💬 DM from ${event.senderId}: ${event.text}`);
            const reply = await generateReply(event.text, "dm", ANTHROPIC_API_KEY);
            console.log("🤖 Claude reply:", reply);
            await sendInstagramDM(IG_BUSINESS_ID, event.senderId, reply, IG_ACCESS_TOKEN);
          }
        }

        // ----- Comments via changes -----
        if (change.field === "comments") {
          const commentId = change.value?.id;
          const commentText = change.value?.text;
          console.log(`💬 Comment ${commentId}: ${commentText}`);

          if (commentText && commentId) {
            const reply = await generateReply(commentText, "comment", ANTHROPIC_API_KEY);
            console.log("🤖 Claude reply:", reply);
            await replyToComment(commentId, reply, IG_ACCESS_TOKEN);
          }
        }
      }

      // ── Fallback: Messenger-style messaging array (some API versions) ──
      for (const msgEvent of entry.messaging || []) {
        console.log("💬 messaging event:", JSON.stringify(msgEvent));
        if (msgEvent.message && !msgEvent.message.is_echo) {
          const senderId = msgEvent.sender.id;
          const text = msgEvent.message.text;
          if (text) {
            const reply = await generateReply(text, "dm", ANTHROPIC_API_KEY);
            console.log("🤖 Claude reply:", reply);
            await sendInstagramDM(IG_BUSINESS_ID, senderId, reply, IG_ACCESS_TOKEN);
          }
        }
      }
    }
  } else {
    console.log("⚠️ Not instagram object:", body.object);
  }
}

function extractMessageEvents(value = {}) {
  const events = [];

  if (value.message || value.sender) {
    events.push({
      senderId: value.sender?.id || value.from?.id || value.recipient?.id || "",
      text: value.message?.text || value.text || ""
    });
  }

  const nestedMessages = Array.isArray(value.messages) ? value.messages : [];
  for (const message of nestedMessages) {
    events.push({
      senderId: message.from?.id || message.sender?.id || value.sender?.id || "",
      text: message.text?.body || message.text || message.message?.text || ""
    });
  }

  return events;
}

// ──────────────────────────────────────────────
// Generate reply using Claude
// ──────────────────────────────────────────────
async function generateReply(userMessage, msgContext, apiKey) {
  const model = getEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514";
  const systemPrompt = `Sos el asistente de atención al cliente de CELAVIE, una marca de ropa femenina mayorista ubicada en Flores, Buenos Aires, Argentina.

INFORMACIÓN CLAVE:
- Vendemos ropa de mujer por MAYOR (mínimo de compra aplica)
- Ubicación: Flores, CABA, Argentina
- Web: celavie.com.ar
- Tipos de productos: remeras, tops, bodies, vestidos, pantalones (básicos en modal y otras telas)
- Temporada actual: Otoño-Invierno 2026

REGLAS:
- Respondé SIEMPRE en español argentino, con tono amable y profesional
- Sé breve y directo (máximo 2-3 oraciones para DMs, 1-2 para comentarios)
- Si preguntan precios específicos, decí "Escribinos por WhatsApp o DM para lista de precios actualizada"
- Si preguntan por menor/unidades sueltas, aclará amablemente que vendemos por mayor
- NO inventes información sobre precios, stock o productos específicos que no conocés
- Si es un comentario, respondé de forma corta y amigable
- Si es un DM, podés ser un poco más detallado`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `[${msgContext === "dm" ? "Mensaje directo" : "Comentario en publicación"}]: ${userMessage}`,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Claude API error response:", response.status, JSON.stringify(data));
      return "Hola, gracias por tu mensaje. Te respondemos a la brevedad.";
    }

    return data.content?.[0]?.text || "¡Hola! Gracias por tu mensaje. Te respondemos pronto 💜";
  } catch (err) {
    console.error("❌ Claude API error:", err);
    return "¡Hola! Gracias por tu mensaje. Te respondemos a la brevedad 💜";
  }
}

// ─────────────────────────────────────────────
// Send Instagram DM
// ──────────────────────────────────────────────
async function sendInstagramDM(igBusinessId, recipientId, message, accessToken) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${igBusinessId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_type: "RESPONSE",
          recipient: { id: recipientId },
          message: { text: message }
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Instagram DM send failed:", response.status, JSON.stringify(data));
      return;
    }
    console.log("📤 DM sent:", JSON.stringify(data));
  } catch (err) {
    console.error("❌ Error sending DM:", err);
  }
}

// ──────────────────────────────────────────────
// Reply to Instagram Comment
// ──────────────────────────────────────────────
async function replyToComment(commentId, message, accessToken) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${commentId}/replies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: message
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Instagram comment reply failed:", response.status, JSON.stringify(data));
      return;
    }
    console.log("📤 Comment reply sent:", JSON.stringify(data));
  } catch (err) {
    console.error("❌ Error replying to comment:", err);
  }
}
