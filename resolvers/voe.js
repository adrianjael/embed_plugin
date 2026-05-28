function localAtob(input) {
  if (!input) return '';
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var str = String(input).replace(/=+$/, '').replace(/[\s\n\r\t]/g, '');
  var output = '';
  if (str.length % 4 === 1) return '';
  for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

async function resolve(url) {
  try {
    console.log('[VOE] Resolviendo: ' + url);
    var response = await __native_fetch(url, 'GET', JSON.stringify({
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    }), '', true);
    var html = response.body || '';

    if (html.includes('window.location.href') && html.length < 2000) {
      var rm = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
      if (rm) {
        console.log('[VOE] Redirect a: ' + rm[1]);
        response = await __native_fetch(rm[1], 'GET', JSON.stringify({
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
        }), '', true);
        html = response.body || '';
      }
    }

    var jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        var parsed = JSON.parse(jsonMatch[1].trim());
        var encText = Array.isArray(parsed) ? parsed[0] : parsed;
        if (typeof encText !== 'string') return null;

        var decoded = encText.replace(/[a-zA-Z]/g, function(c) {
          var code = c.charCodeAt(0);
          var limit = c <= 'Z' ? 90 : 122;
          var shifted = code + 13;
          return String.fromCharCode(limit >= shifted ? shifted : shifted - 26);
        });

        var noise = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
        for (var n = 0; n < noise.length; n++) {
          decoded = decoded.split(noise[n]).join('');
        }

        var b64_1 = localAtob(decoded);
        if (!b64_1) return null;

        var shiftedStr = '';
        for (var j = 0; j < b64_1.length; j++) {
          shiftedStr += String.fromCharCode(b64_1.charCodeAt(j) - 3);
        }

        var reversed = shiftedStr.split('').reverse().join('');
        var decrypted = localAtob(reversed);
        if (!decrypted) return null;

        var data = JSON.parse(decrypted);
        if (data && data.source) {
          console.log('[VOE] Success: ' + data.source.substring(0, 50) + '...');
          return {
            url: data.source,
            quality: '1080p',
            serverName: 'VOE',
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
              'Referer': url
            }
          };
        }
      } catch (ex) {
        console.log('[VOE] Decryption error: ' + (ex.message || ex));
      }
    }

    var m3u8Match = html.match(/["'](https?:\/\/[^"']+?\.m3u8[^"']*?)["']/i);
    if (m3u8Match) {
      console.log('[VOE] Fallback m3u8: ' + m3u8Match[1].substring(0, 50) + '...');
      return {
        url: m3u8Match[1],
        quality: '1080p',
        serverName: 'VOE',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          'Referer': url
        }
      };
    }

    return null;
  } catch (err) {
    console.log('[VOE] Error: ' + (err.message || err));
    return null;
  }
}
module.exports = { resolve: resolve };
