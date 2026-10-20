// Intermediario seguro entre la página y Google Apps Script.
// La URL de Apps Script y la clave secreta viven SOLO en las variables
// de entorno de Vercel (APPS_SCRIPT_URL y API_SECRET), nunca en la página.

const CATEGORIAS = ['Moto', 'Carro', 'Pesado', 'Otro'];
const ERROR_TECNICO = 'No pudimos confirmar tu registro. Intenta nuevamente en un minuto con los mismos datos.';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Método no permitido.' });
  }

  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.API_SECRET;
  if (!url || !secret) {
    return res.status(500).json({ ok: false, message: 'La plataforma está en configuración. Intenta más tarde.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Solo se reenvían estos campos, limpios y con tamaño máximo.
  const data = {
    code: String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
    name: String(body.name || '').trim().slice(0, 90),
    phone: String(body.phone || '').replace(/\D/g, '').slice(0, 15),
    store: String(body.store || '').trim().slice(0, 100),
    category: CATEGORIAS.includes(body.category) ? body.category : '',
    accepted: body.accepted === true
  };

  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0].trim();

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, ip, data }),
      redirect: 'follow',
      signal: AbortSignal.timeout(28000)
    });
    const text = await r.text();
    let out;
    try { out = JSON.parse(text); } catch (e) {
      console.error('Respuesta no JSON de Apps Script', r.status, text.slice(0, 300));
      return res.status(502).json({ ok: false, message: ERROR_TECNICO });
    }
    return res.status(200).json({ ok: !!out.ok, message: String(out.message || '') });
  } catch (err) {
    console.error('Fallo llamando a Apps Script', err);
    return res.status(504).json({ ok: false, message: ERROR_TECNICO });
  }
};
