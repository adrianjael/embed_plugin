async function resolve(url) {
  try {
    console.log('[Filemoon] Resolviendo: ' + url);
    var response = await __native_fetch(url, 'GET', JSON.stringify({
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Referer': url,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9'
    }), '', true);
    var html = response.body || '';

    var patterns = [
      /file\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /src\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /https?:\/\/[^"'\s<>]+\.(?:m3u8|urlset)[^"'\s<>]*/,
      /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/,
      /data-(?:hls|video|src|url)\s*=\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = html.match(patterns[i]);
      if (match) {
        var videoUrl = match[1] || match[0];
        console.log('[Filemoon] URL encontrada: ' + videoUrl.substring(0, 80) + '...');
        return {
          url: videoUrl,
          quality: '1080p',
          serverName: 'Filemoon',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Referer': url
          }
        };
      }
    }

    return null;
  } catch (err) {
    console.log('[Filemoon] Error: ' + (err.message || err));
    return null;
  }
}
module.exports = { resolve: resolve };
