const crypto = require('node:crypto');
const exportsManifest = require('../record-export-assets.json');

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function normaliseContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function isDeliveryEnabled(asset) {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (env === 'preview') return asset.previewEnabled === true;
  if (env === 'production') return asset.productionEnabled === true;
  return false;
}

async function fetchVerifiedExport(asset) {
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

module.exports = async function recordExportDownloadHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const exportKey = typeof req.query.export === 'string' ? req.query.export : '';
  const asset = Object.prototype.hasOwnProperty.call(exportsManifest, exportKey)
    ? exportsManifest[exportKey]
    : null;

  if (!asset || !isDeliveryEnabled(asset)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Record export not found.');
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';

  try {
    const body = await fetchVerifiedExport(asset);

    res.statusCode = 200;
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `${disposition}; filename="${asset.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('ETag', `"sha256-${asset.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.end(body);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'record_export_delivery_error',
      export: exportKey,
      exportId: asset.exportId,
      code: error && error.message ? error.message : 'unknown_error',
    }));
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Record export is temporarily unavailable.');
  }
};
