/**
 * Unlimplay Provider for NuvioSniffer
 * Este plugin consulta la API de Unlimplay de manera directa mediante HTTP Fetch,
 * parsea los servidores incrustados (Streamwish, Filemoon, Vidhide, etc.)
 * y entrega cada uno de ellos individualmente a Nuvio para su sniffing nativo inmediato.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
            console.log("[Unlimplay] ID de TMDB inválido.");
            return [];
        }

        const type = ["movie", "film"].includes(String(mediaType).toLowerCase()) ? "movie" : "tv";
        let targetUrl = "";

        if (type === "movie") {
            targetUrl = `https://unlimplay.com/f/embed/movie/${cleanId}`;
        } else {
            if (!season || !episode) {
                console.log("[Unlimplay] Falta temporada o episodio para serie.");
                return [];
            }
            targetUrl = `https://unlimplay.com/f/embed/tv/${cleanId}/${season}/${episode}`;
        }

        console.log(`[Unlimplay] Buscando en: ${targetUrl}`);

        const response = await fetch(targetUrl, { 
            headers: { 
                "User-Agent": UA,
                "Accept": "text/html"
            } 
        });
        
        const html = await response.text();

        // Extraer la variable const EMBEDS del script
        const match = html.match(/const\s+EMBEDS\s*=\s*({[\s\S]*?});/);
        if (!match) {
            console.log("[Unlimplay] No se encontró el objeto EMBEDS en el HTML.");
            return [];
        }

        const embedsData = JSON.parse(match[1]);
        const results = [];

        // Obtener únicamente los servidores en Español Latino
        const latinoKey = Object.keys(embedsData).find(k => k.toLowerCase() === "latino");
        const latinoServers = latinoKey ? embedsData[latinoKey] : null;

        if (latinoServers) {
            // Recorrer cada servidor del idioma Latino
            for (const [sName, embedUrl] of Object.entries(latinoServers)) {
                try {
                    if (!embedUrl || !embedUrl.startsWith("http")) continue;

                    // Filtrar Netu/Waaw/PoseidonHD ya que no se pueden extraer con fiabilidad o redirigen
                    const lowServerName = sName.toLowerCase();
                    const lowUrl = embedUrl.toLowerCase();
                    if (
                        lowServerName.includes("netu") || lowServerName.includes("waaw") || 
                        lowServerName.includes("hani") || lowServerName.includes("poseidonhd") ||
                        lowUrl.includes("waaw.to") || lowUrl.includes("netu.tv") || 
                        lowUrl.includes("netu.to") || lowUrl.includes("hani.to") || 
                        lowUrl.includes("waaw.tv") || lowUrl.includes("poseidonhd")
                    ) {
                        console.log(`[Unlimplay] Ignorando servidor Netu/Waaw/PoseidonHD detectado: ${sName} (${embedUrl})`);
                        continue;
                    }

                    // Si el servidor es directo o proxy propio de unlimplay, o requiere Sniff
                    const cleanServerName = sName.replace(/\d+/g, "").trim().toUpperCase();
                    
                    const item = {
                        name: `UNLIMPLAY - ${cleanServerName}`,
                        language: "Latino",
                        quality: "HD",
                        url: embedUrl,
                        behaviorHints: {
                            notWebReady: true,
                            isEmbed: true
                        }
                    };

                    console.log(`[Unlimplay] >> Encontrado: ${cleanServerName} (Latino) -> ${embedUrl}`);
                    
                    if (typeof __yield_result === "function") {
                        __yield_result(JSON.stringify(item));
                    }
                    
                    results.push(item);

                    // Pequeño retardo para no saturar el flujo de datos
                    if (typeof __native_sleep === "function") {
                        await __native_sleep(30);
                    }
                } catch (err) {
                    console.log(`[Unlimplay] Error procesando servidor ${sName}: ${err.message}`);
                }
            }
        }

        return results;
    } catch (e) {
        console.log(`[Unlimplay] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
