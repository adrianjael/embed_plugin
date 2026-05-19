/**
 * Vimeus Provider for NuvioSniffer
 * Consulta la API de Vimeus, extrae los servidores incrustados y los
 * entrega a Nuvio para su sniffing nativo inmediato.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const VIEW_KEY = "ttapaNFkp2YbIFMawxmnqCPcs0pRVzbjrI5r1-da5M4";

function extractServerName(url) {
    if (!url) return "Unknown";
    const lowUrl = url.toLowerCase();
    if (lowUrl.includes("ok.ru")) return "Ok.ru";
    if (lowUrl.includes("filemoon.sx") || lowUrl.includes("filemoon")) return "FileMoon";
    if (lowUrl.includes("voe.sx") || lowUrl.includes("voe")) return "VOE";
    if (lowUrl.includes("streamtape.com")) return "StreamTape";
    if (lowUrl.includes("streamwish") || lowUrl.includes("sfastwish") || lowUrl.includes("hlswish") || lowUrl.includes("flaswish")) return "StreamWish";
    if (lowUrl.includes("vidhide") || lowUrl.includes("vidhidepre") || lowUrl.includes("do7go") || lowUrl.includes("ds2play")) return "VidHide";
    if (lowUrl.includes("mixdrop") || lowUrl.includes("mxdrop")) return "MixDrop";
    if (lowUrl.includes("vimeos.net")) return "Vimeos";
    if (lowUrl.includes("goodstream.one")) return "GoodStream";
    return "Unknown";
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();
        
        // Soporte para Súper ID (tmdb|imdb)
        if (cleanId.includes("|")) {
            const parts = cleanId.split("|");
            cleanId = parts[0];
        }

        // Limpieza de ID
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split(":")[0].split("/")[0];

        if (!cleanId || cleanId === "null" || cleanId === "undefined") {
            console.log("[Vimeus] ID de TMDB inválido.");
            return [];
        }

        const type = ["movie", "film"].includes(String(mediaType).toLowerCase()) ? "movie" : "tv";
        let targetUrl = "";

        if (type === "movie") {
            targetUrl = `https://vimeus.com/e/movie?tmdb=${cleanId}&view_key=${VIEW_KEY}`;
        } else {
            if (!season || !episode) {
                console.log("[Vimeus] Falta temporada o episodio para serie.");
                return [];
            }
            targetUrl = `https://vimeus.com/e/serie?tmdb=${cleanId}&se=${season}&ep=${episode}&view_key=${VIEW_KEY}`;
        }

        console.log(`[Vimeus] Buscando en: ${targetUrl}`);

        let response = await fetch(targetUrl, { 
            headers: { 
                "User-Agent": UA,
                "Referer": "https://vimeus.com/"
            } 
        });
        
        let html = await response.text();
        let match = html.match(/<script\s+type=["']text\/json["']\s+id=["']data["']>\s*(\{[\s\S]*?\})\s*<\/script>/i);

        // Si no se encuentra y es serie, reintentar con anime
        if (!match && type === "tv") {
            const animeUrl = `https://vimeus.com/e/anime?tmdb=${cleanId}&se=${season}&ep=${episode}&view_key=${VIEW_KEY}`;
            console.log(`[Vimeus] Reintentando con URL anime: ${animeUrl}`);
            response = await fetch(animeUrl, {
                headers: {
                    "User-Agent": UA,
                    "Referer": "https://vimeus.com/"
                }
            });
            if (response.ok) {
                html = await response.text();
                match = html.match(/<script\s+type=["']text\/json["']\s+id=["']data["']>\s*(\{[\s\S]*?\})\s*<\/script>/i);
            }
        }

        if (!match) {
            console.log("[Vimeus] No se encontró el bloque de datos JSON.");
            return [];
        }

        const data = JSON.parse(match[1]);
        const embeds = data.embeds || [];
        const results = [];

        console.log(`[Vimeus] Servidores encontrados: ${embeds.length}`);

        for (const embed of embeds) {
            try {
                let embedUrl = embed.url;
                if (!embedUrl) continue;

                if (!embedUrl.startsWith("http")) {
                    embedUrl = embedUrl.startsWith("//") ? "https:" + embedUrl : "https://" + embedUrl;
                }

                // Filtrar Netu/Waaw/PoseidonHD ya que no se pueden extraer con fiabilidad o redirigen
                const lowUrl = embedUrl.toLowerCase();
                const internalServerName = embed.server || "Unknown";
                const guessedServerName = extractServerName(embedUrl);
                const sName = guessedServerName !== "Unknown" ? guessedServerName : internalServerName;
                const lowServerName = sName.toLowerCase();

                if (
                    lowServerName.includes("netu") || lowServerName.includes("waaw") || 
                    lowServerName.includes("hani") || lowServerName.includes("poseidonhd") ||
                    lowUrl.includes("waaw.to") || lowUrl.includes("netu.tv") || 
                    lowUrl.includes("netu.to") || lowUrl.includes("hani.to") || 
                    lowUrl.includes("waaw.tv") || lowUrl.includes("poseidonhd")
                ) {
                    console.log(`[Vimeus] Ignorando servidor Netu/Waaw/PoseidonHD detectado: ${sName} (${embedUrl})`);
                    continue;
                }

                // Normalización de idioma
                let language = "Latino";
                if (embed.lang) {
                    const lowLang = embed.lang.toLowerCase();
                    if (lowLang.includes("cast") || lowLang.includes("esp") || lowLang === "es") {
                        language = "Castellano";
                    } else if (lowLang.includes("sub")) {
                        language = "Subtitulado";
                    } else if (lowLang.includes("en") || lowLang.includes("ing")) {
                        language = "Inglés";
                    }
                }

                const cleanServerName = sName.replace(/\d+/g, "").trim().toUpperCase();
                
                const item = {
                    name: `VIMEUS - ${cleanServerName}`,
                    language: language,
                    quality: embed.quality || "HD",
                    url: embedUrl,
                    behaviorHints: {
                        notWebReady: true,
                        isEmbed: true
                    }
                };

                console.log(`[Vimeus] >> Encontrado: ${cleanServerName} (${language}) -> ${embedUrl}`);
                
                if (typeof __yield_result === "function") {
                    __yield_result(JSON.stringify(item));
                }
                
                results.push(item);

                // Pequeño retardo para no saturar el flujo de datos
                if (typeof __native_sleep === "function") {
                    await __native_sleep(30);
                }
            } catch (err) {
                console.log(`[Vimeus] Error procesando servidor: ${err.message}`);
            }
        }

        return results;
    } catch (e) {
        console.log(`[Vimeus] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
