/**
 * Embed69 Provider for NuvioSniffer
 * Este plugin no decodifica servidores; entrega el Embed a Nuvio para el Sniffing automático.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function safeAtob(input) {
    if (!input) return "";
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(input).replace(/=+$/, '').replace(/[\s\n\r\t]/g, '');
    let output = '';
    if (str.length % 4 === 1) return '';
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();
        let imdbId = null;

        // Soporte para Súper ID (tmdb|imdb)
        if (cleanId.includes("|")) {
            const parts = cleanId.split("|");
            cleanId = parts[0];
            if (parts[1] && parts[1].startsWith("tt")) {
                imdbId = parts[1];
            }
        }

        // Limpieza de ID
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split(":")[0].split("/")[0];

        const type = ["movie", "film"].includes(String(mediaType).toLowerCase()) ? "movie" : "tv";
        
        if (!imdbId) {
            imdbId = cleanId.startsWith("tt") ? cleanId : null;
            if (!imdbId) {
                // Fetch IMDB ID if not provided
                try {
                    const res0 = await fetch(`https://api.themoviedb.org/3/${type}/${cleanId}/external_ids?api_key=439c478a771f35c05022f9feabcca01c`);
                    const tmdbData = await res0.json();
                    imdbId = tmdbData.imdb_id;
                } catch (e) {
                    console.log(`[Embed69] Error obteniendo IMDB: ${e.message}`);
                }
            }
        }

        if (!imdbId) return [];

        const urlId = (type === "tv" && season) ? `${imdbId}-${season}x${String(episode).padStart(2, "0")}` : imdbId;
        const targetUrl = `https://embed69.org/f/${urlId}`;
        console.log(`[Embed69] Buscando en: ${targetUrl}`);

        const response = await fetch(targetUrl, { headers: { "User-Agent": UA } });
        const html = await response.text();
        const match = html.match(/dataLink\s*=\s*([\[\{][\s\S]*?[\]\}]);/);

        if (!match) return [];

        let data = JSON.parse(match[1]);
        if (!Array.isArray(data)) {
            data = Object.keys(data).map(k => ({ video_language: k, sortedEmbeds: data[k] }));
        }

        // Filtrar Latino
        const lat = data.find(i => ["LAT", "LATINO"].includes(String(i.video_language).toUpperCase()));
        if (!lat) return [];

        const results = [];
        const rawServers = lat.sortedEmbeds.filter(e => e.link && e.servername !== "download");

        for (const embed of rawServers) {
            try {
                const sName = embed.servername.toLowerCase();
                const b64 = embed.link.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
                const payload = JSON.parse(safeAtob(b64));
                const embedUrl = payload.link;

                const item = {
                    name: sName.toUpperCase() + " (Sniffer)",
                    language: "Latino",
                    quality: "HD",
                    url: embedUrl,
                    behaviorHints: {
                        isEmbed: true
                    }
                };

                console.log(`[Embed69] >> Encontrado: ${sName}`);
                if (typeof __yield_result === "function") __yield_result(JSON.stringify(item));
                results.push(item);
                
                // Pequeña pausa para no saturar el runtime
                if (typeof __native_sleep === "function") await __native_sleep(50);
            } catch (e) {
                console.log(`[Embed69] Error procesando servidor: ${e.message}`);
            }
        }

        return results;
    } catch (e) {
        console.log(`[Embed69] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
