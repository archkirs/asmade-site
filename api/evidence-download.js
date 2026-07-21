const crypto = require('node:crypto');
const assets = require('../evidence-assets.json');

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function normaliseContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

async function fetchVerifiedAsset(asset) {
  const response = await fetch(asset.deliveryUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`delivery_http_${response.status}`);

  const declaredType = normaliseContentType(response.headers.get('content-type'));
  if (declaredType !== asset.contentType) throw new Error('delivery_content_type_mismatch');

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new Error('delivery_too_large');
  }
  if (declaredLength && declaredLength !== asset.sizeBytes) {
    throw new Error('delivery_declared_size_mismatch');
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_SOURCE_BYTES) throw new Error('delivery_too_large');
  if (body.length !== asset.sizeBytes) throw new Error('delivery_size_mismatch');

  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (digest !== asset.sha256) throw new Error('delivery_checksum_mismatch');

  return body;
}

module.exports = async function evidenceDownloadHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const assetKey = typeof req.query.asset === 'string' ? req.query.asset : '';
  const asset = Object.prototype.hasOwnProperty.call(assets, assetKey) ? assets[assetKey] : null;
  if (!asset) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Evidence file not found.');
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';

  try {
    const body = await fetchVerifiedAsset(asset);

    res.statusCode = 200;
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `${disposition}; filename="${asset.filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('ETag', `"sha256-${asset.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.end(body);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'persistent_evidence_delivery_error',
      asset: assetKey,
      representationId: asset.representationId,
      code: error && error.message ? error.message : 'unknown_error',
    }));
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Evidence file is temporarily unavailable.');
  }
};
