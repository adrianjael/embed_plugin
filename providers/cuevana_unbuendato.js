/**
 * Cuevana Unbuendato Provider for NuvioSniffer
 * Entrega los embeds de la API de cuevana.unbuendato.com para Sniffing automático.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();
        
        // Limpieza de ID
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split("|")[0].split(":")[0].split("/")[0];

        const type = ["movie", "film"].includes(String(mediaType).toLowerCase()) ? "movie" : "tv";
        
        let apiUrl = `https://cuevana.unbuendato.com/?id=${cleanId}`;
        if (type === "tv" && season && episode) {
            apiUrl += `&season=${season}&episode=${episode}`;
        }

        console.log(`[CuevanaDato] Consultando API: ${apiUrl}`);

        const response = await fetch(apiUrl, { 
            headers: { 
                "User-Agent": UA,
                "Accept": "application/json"
            } 
        });
        
        const data = await response.json();

        if (!data.success || !data.languages) {
            console.log(`[CuevanaDato] API no retornó resultados válidos.`);
            return [];
        }

        const results = [];

        // Procesar Idiomas
        const langMap = {
            "latino": "Latino",
            "subtitulado": "Subtitulado",
            "castellano": "Español"
        };

        for (const [langKey, servers] of Object.entries(data.languages)) {
            const langLabel = langMap[langKey] || langKey;
            
            for (const [sName, embedUrl] of Object.entries(servers)) {
                try {
                    if (!embedUrl || !embedUrl.startsWith("http")) continue;

                    const item = {
                        name: sName.toUpperCase() + " (Sniffer)",
                        language: langLabel,
                        quality: "HD", // La API no da calidad exacta, el sniffer la detectará
                        url: embedUrl,
                        behaviorHints: {
                            isEmbed: true
                        }
                    };

                    console.log(`[CuevanaDato] >> Encontrado: ${sName} (${langLabel})`);
                    if (typeof __yield_result === "function") __yield_result(JSON.stringify(item));
                    results.push(item);

                    // Pausa mínima
                    if (typeof __native_sleep === "function") await __native_sleep(30);
                } catch (e) {
                    console.log(`[CuevanaDato] Error en servidor ${sName}: ${e.message}`);
                }
            }
        }

        return results;
    } catch (e) {
        console.log(`[CuevanaDato] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
