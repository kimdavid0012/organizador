// Instagram Webhook - Netlify Serverless Function
// Handles Meta webhook verification + incoming IG messages/comments
// Responds using Claude AI via Anthropic API

const VERIFY_TOKEN = "celavie_webhook_2026";

export default async (req, context) => {
  // ===== GET: Meta Webhook Verification =====
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
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
  const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  console.log("🔑 IG_ACCESS_TOKEN exists:", !!IG_ACCESS_TOKEN);
  console.log("🔑 ANTHROPIC_API_KEY exists:", !!ANTHROPIC_API_KEY);

  if (!IG_ACCESS_TOKEN || !ANTHROPIC_API_KEY) {
    console.error("❌ Missing env vars");
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
          const val = change.value;
          if (val.message && val.sender) {
            const senderId = val.sender.id;
            const text = val.message.text;
            console.log(`💬 DM from ${senderId}: ${text}`);

            if (text) {
              const reply = await generateReply(text, "dm", ANTHROPIC_API_KEY);
              console.log("🤖 Claude reply:", reply);
              await sendInstagramDM(senderId, reply, IG_ACCESS_TOKEN);
            }
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
            await sendInstagramDM(senderId, reply, IG_ACCESS_TOKEN);
          }
        }
      }
    }
  } else {
    console.log("⚠️ Not instagram object:", body.object);
  }
}

// ──────────────────────────────────────────────
// Generate reply using Claude
// ──────────────────────────────────────────────
async function generateReply(userMessage, msgContext, apiKey) {
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
        model: "claude-sonnet-4-20250514",
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
    return data.content?.[0]?.text || "¡Hola! Gracias por tu mensaje. Te respondemos pronto 💜";
  } catch (err) {
    console.error("❌ Claude API error:", err);
    return "¡Hola! Gracias por tu mensaje. Te respondemos a la brevedad 💜";
  }
}

// ──────────────────────────────────────────────
// Send Instagram DM
// ──────────────────────────────────────────────
async function sendInstagramDM(recipientId, message, accessToken) {
  try {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/me/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: accessToken,
        }),
      }
    );
    const data = await response.json();
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
      `https://graph.instagram.com/v21.0/${commentId}/replies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          access_token: accessToken,
        }),
      }
    );
    const data = await response.json();
    console.log("📤 Comment reply sent:", JSON.stringify(data));
  } catch (err) {
    console.error("❌ Error replying to comment:", err);
  }
}
