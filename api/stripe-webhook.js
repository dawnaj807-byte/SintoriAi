// api/stripe-webhook.js
import Stripe from 'stripe';

// Wyłączamy parsowanie body Vercela (Wymagane przez Stripe do sprawdzenia bezpieczeństwa Webhooka)
export const config = {
  api: { bodyParser: false }
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = await buffer(req);
    // Weryfikacja, czy żądanie faktycznie przyszło od oryginalnego serwera Stripe
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Błąd sygnatury Webhooka Stripe:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Jeśli płatność się powiodła
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id; // Zaciąga ID użytkownika wysłane z create-checkout

    if (userId) {
      const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, '');
      const KV_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
      
      // Zapisujemy nowy plan użytkownika na stałe w bazie Upstash
      if (KV_URL && KV_TOKEN) {
         const safeId = String(userId).trim().toLowerCase();
         await fetch(KV_URL, {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
           body: JSON.stringify(["SET", `plan_${safeId}`, "ACTIVE"])
         });
         console.log(`Plan aktywowany dla użytkownika ${userId}`);
      }
    }
  }

  res.status(200).json({ received: true });
}