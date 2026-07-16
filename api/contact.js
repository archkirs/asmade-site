const crypto = require('node:crypto');

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_ORIGIN = 'https://useasmade.com';
const RESEND_URL = 'https://api.resend.com/emails';

const TOPICS = Object.freeze({
  general: 'General question',
  pilot: 'Pilot question',
  privacy: 'Privacy or deletion request',
  other: 'Other',
});

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function logResult({ requestId, result, status, startedAt, errorCode }) {
  const record = {
    request_id: requestId,
    utc: new Date().toISOString(),
    result,
    http_status: status,
    duration_ms: Date.now() - startedAt,
  };

  if (errorCode) record.error_code = errorCode;
  console.log(JSON.stringify(record));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readBody(req) {
  if (isPlainObject(req.body)) return req.body;

  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
      const error = new Error('body_too_large');
      error.code = 'body_too_large';
      throw error;
    }
    return JSON.parse(req.body);
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('body_too_large');
      error.code = 'body_too_large';
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function normaliseSingleLine(value) {
  return typeof value === 'string' ? value.trim().replace(/[\r\n\u0000-\u001f\u007f]/g, ' ') : '';
}

function normaliseMessage(value) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim()
    : '';
}

function isValidEmail(value) {
  if (!value || value.length > 254 || /[\r\n]/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidRequestId(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validate(body) {
  const name = normaliseSingleLine(body.name);
  const email = normaliseSingleLine(body.email).toLowerCase();
  const topic = normaliseSingleLine(body.topic);
  const message = normaliseMessage(body.message);
  const requestId = normaliseSingleLine(body.request_id);
  const website = normaliseSingleLine(body.website);
  const errors = {};

  if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) errors.topic = 'Choose a valid topic.';
  if (!message) errors.message = 'Enter a message.';
  if (message.length > 3000) errors.message = 'Message must be 3,000 characters or fewer.';
  if (!isValidRequestId(requestId)) errors.form = 'Please reload the page and try again.';

  return {
    values: { name, email, topic, message, requestId, website },
    errors,
  };
}

function buildEmailText({ name, email, topic, message, requestId }) {
  return [
    'AsMade contact form',
    '',
    `Request ID: ${requestId}`,
    `Topic: ${TOPICS[topic]}`,
    `Name: ${name || 'Not provided'}`,
    `Email: ${email}`,
    `Submitted: ${new Date().toISOString()}`,
    '',
    'Message:',
    message,
  ].join('\n');
}

module.exports = async function contactHandler(req, res) {
  const startedAt = Date.now();
  let requestId = crypto.randomUUID();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    logResult({ requestId, result: 'rejected', status: 405, startedAt, errorCode: 'method_not_allowed' });
    return sendJson(res, 405, { ok: false, message: 'Method not allowed.' });
  }

  if (req.headers.origin !== ALLOWED_ORIGIN) {
    logResult({ requestId, result: 'rejected', status: 403, startedAt, errorCode: 'origin_rejected' });
    return sendJson(res, 403, { ok: false, message: 'Request rejected.' });
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    logResult({ requestId, result: 'rejected', status: 415, startedAt, errorCode: 'unsupported_media_type' });
    return sendJson(res, 415, { ok: false, message: 'Request rejected.' });
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    logResult({ requestId, result: 'rejected', status: 413, startedAt, errorCode: 'body_too_large' });
    return sendJson(res, 413, { ok: false, message: 'Your message is too large. Please shorten it.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    const tooLarge = error && error.code === 'body_too_large';
    const status = tooLarge ? 413 : 400;
    logResult({ requestId, result: 'rejected', status, startedAt, errorCode: tooLarge ? 'body_too_large' : 'invalid_json' });
    return sendJson(res, status, {
      ok: false,
      message: tooLarge ? 'Your message is too large. Please shorten it.' : 'Invalid request.',
    });
  }

  if (!isPlainObject(body) || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    logResult({ requestId, result: 'rejected', status: 413, startedAt, errorCode: 'body_too_large' });
    return sendJson(res, 413, { ok: false, message: 'Your message is too large. Please shorten it.' });
  }

  const { values, errors } = validate(body);
  if (isValidRequestId(values.requestId)) requestId = values.requestId;

  if (values.website) {
    logResult({ requestId, result: 'rejected', status: 200, startedAt, errorCode: 'honeypot' });
    return sendJson(res, 200, { ok: true, message: 'Your message has been received.' });
  }

  if (Object.keys(errors).length > 0) {
    logResult({ requestId, result: 'rejected', status: 422, startedAt, errorCode: 'validation_failed' });
    return sendJson(res, 422, { ok: false, message: 'Check the highlighted fields.', errors });
  }

  const apiKey = process.env.RESEND_CONTACT_API_KEY;
  if (!apiKey) {
    logResult({ requestId, result: 'provider_error', status: 503, startedAt, errorCode: 'missing_api_key' });
    return sendJson(res, 503, {
      ok: false,
      message: 'We could not send your message. Please try again later or email hello@useasmade.com.',
    });
  }

  let providerResponse;
  try {
    providerResponse = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `asmade-contact-${requestId}`,
      },
      body: JSON.stringify({
        from: 'AsMade Contact Form <form@useasmade.com>',
        to: ['hello@useasmade.com'],
        reply_to: values.email,
        subject: `[AsMade contact] ${TOPICS[values.topic]}`,
        text: buildEmailText({
          name: values.name,
          email: values.email,
          topic: values.topic,
          message: values.message,
          requestId,
        }),
      }),
    });
  } catch (error) {
    logResult({ requestId, result: 'provider_error', status: 502, startedAt, errorCode: 'provider_network_error' });
    return sendJson(res, 502, {
      ok: false,
      message: 'We could not send your message. Please try again later or email hello@useasmade.com.',
    });
  }

  if (!providerResponse.ok) {
    logResult({
      requestId,
      result: 'provider_error',
      status: 502,
      startedAt,
      errorCode: `provider_http_${providerResponse.status}`,
    });
    return sendJson(res, 502, {
      ok: false,
      message: 'We could not send your message. Please try again later or email hello@useasmade.com.',
    });
  }

  logResult({ requestId, result: 'sent', status: 200, startedAt });
  return sendJson(res, 200, { ok: true, message: 'Your message has been sent.' });
};
