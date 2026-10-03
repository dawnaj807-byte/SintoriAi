// api/create-checkout.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const { priceId, userId, plan } = req.body || {};
  const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || "").trim();

  if (!STRIPE_SECRET) {
    return res.status(500).json({ error: "Brak klucza STRIPE_SECRET_KEY w panelu Vercel." });
  }

  // Rozpoznanie adresu zwrotnego strony
  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || "http://localhost:3000";

  // Konfiguracja sesji płatności Stripe API
  const params = new URLSearchParams();
  params.append('success_url', `${origin}/?success=true&plan=${encodeURIComponent(plan || 'Pro')}`);
  params.append('cancel_url', `${origin}/?canceled=true`);
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  
  if (userId) {
    params.append('client_reference_id', userId);
  }

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await stripeRes.json();

    if (data.url) {
      return res.status(200).json({ url: data.url }); // Zwraca link do bramki Stripe
    } else {
      return res.status(400).json({ error: data.error?.message || "Błąd generowania płatności." });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}