async function resolve(embedUrl) {
  try {
    console.log('[Vimeos] Resolviendo: ' + embedUrl);
    var response = await __native_fetch(embedUrl, 'GET', JSON.stringify({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://vimeos.net/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8'
    }), '', true);
    var html = response.body || '';

    var patterns = [
      /file\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /src\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /https?:\/\/[^"'\s<>]+\.(?:m3u8|urlset)[^"'\s<>]*/,
      /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/,
      /(?:url|videoUrl|playlistUrl|video_source)\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /data-(?:hls|video|src|url)\s*=\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = html.match(patterns[i]);
      if (match) {
        var videoUrl = match[1] || match[0];
        console.log('[Vimeos] URL encontrada: ' + videoUrl.substring(0, 80) + '...');
        return {
          url: videoUrl,
          quality: '1080p',
          serverName: 'Vimeos',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': embedUrl,
            'Origin': 'https://vimeos.net'
          }
        };
      }
    }

    return null;
  } catch (err) {
    console.log('[Vimeos] Error: ' + (err.message || err));
    return null;
  }
}
module.exports = { resolve: resolve };
