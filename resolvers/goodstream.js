async function resolve(embedUrl) {
  try {
    console.log('[GoodStream] Resolviendo: ' + embedUrl);
    var response = await __native_fetch(embedUrl, 'GET', JSON.stringify({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://goodstream.one/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
      'Connection': 'keep-alive'
    }), '', true);
    var html = response.body || '';
    var match = html.match(/file:\s*"([^"]+)"/);
    if (!match) {
      console.log('[GoodStream] No se encontró patrón file:...');
      return null;
    }
    var videoUrl = match[1];
    console.log('[GoodStream] URL encontrada: ' + videoUrl.substring(0, 80) + '...');
    return {
      url: videoUrl,
      quality: '1080p',
      serverName: 'GoodStream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': embedUrl,
        'Origin': 'https://goodstream.one'
      }
    };
  } catch (err) {
    console.log('[GoodStream] Error: ' + (err.message || err));
    return null;
  }
}
module.exports = { resolve: resolve };
